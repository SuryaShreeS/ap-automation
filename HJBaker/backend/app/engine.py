"""The core processing engine v2 — inflow pipeline + routed queue flows.

Every document runs a common prefix:
  intake ✓ → classify (rules + confidence; below threshold → Manual Review gate)
  → route ✓ → extract (in-queue extraction)
…then continues with its queue's flow:
  PO           match (2/3-way) → approval → AP-review gate → PIN → paid
  NONPO        po_decision GATE (attach PO created manually in Sage — automation is
               not possible per the client — or process as a supplier BP invoice,
               template-coded, no PO) → code/match → approval → … → paid
  PREPAY bulk  register prepayment (+period PO) → PIN → paid
  PREPAY ship  match → approval → … → PIN → auto-associate to prepayment → paid
  CREDIT       pin_reference GATE (original PIN) → extract credits → AP → PCM → park
  REBILL       credit_reference GATE (the client's "static field": which PCM this
               rebill settles) → link chain (original PIN ↔ PCM ↔ rebill, FR-62;
               closed-period note) → match → approval → … → PIN → paid

Gates ARE the existing work queues (Approvals / AP Final Review / Manual Review /
Detail-stepper inputs). `Invoice.status` stays canonical; sub-steps without a
column are tracked as `flow_step` audit markers. Sage document numbers use the
real formats (PIN######, PCM######, PAY**######, P26-######).
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .classifier import QUEUES, apply_classification
from .logic import fmt
from .models import (
    Approval,
    ApRule,
    AuditEvent,
    ChainNode,
    Invoice,
    ParkQueueItem,
    Prepayment,
    ReviewAction,
)
from .services.sage import get_sage

CLOCK_STAMP = "07/13/26 09:41"
POST_APPROVAL_STATUSES = ("IN_ERP", "MATCHED_PAY", "PAID")
PO_PATTERN = re.compile(r"^P\d{2}-\d{4,6}$")
MONTHS = {"01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
          "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec"}


# ---------- small helpers ----------
def _flow_markers(db: Session, inv_no: str) -> set[str]:
    return set(
        db.scalars(
            select(AuditEvent.field).where(
                AuditEvent.invoice_number == inv_no, AuditEvent.action == "flow_step"
            )
        ).all()
    )


def _mark(db: Session, inv: Invoice, key: str, user: str, message: str) -> None:
    db.add(AuditEvent(invoice_number=inv.invoice_number, actor=user, action="flow_step",
                      field=key, message=message))
    # Session runs with autoflush=False — flush so markers are visible to the
    # done-checks inside the same run loop.
    db.flush()
    inv.last_by = "engine" if user == "system" else user
    inv.last_date = CLOCK_STAMP
    inv.last_msg = message


def _next_seq(db: Session, column, pattern: str, floor: int) -> int:
    best = floor
    for v in db.scalars(select(column)).all():
        m = re.match(pattern, str(v or ""))
        if m:
            best = max(best, int(m.group(1)))
    return best + 1


def _parse_money(s: str) -> float:
    s = str(s).strip()
    neg = s.startswith("(")
    s = s.replace("(", "").replace(")", "").replace("$", "").replace(",", "").strip()
    mult = 1_000_000.0 if s.upper().endswith("M") else 1.0
    if s.upper().endswith("M"):
        s = s[:-1]
    try:
        v = float(s) * mult
    except ValueError:
        v = 0.0
    return -v if neg else v


def _fmt_money_like(v: float, like: str) -> str:
    if "M" in str(like).upper():
        return f"${v / 1_000_000:.1f}M"
    return "$" + f"{v:,.0f}"


def _doc_text(inv: Invoice) -> str:
    # ONLY immutable document content — last_msg is engine-written and would make
    # flow-kind decisions flap mid-run (e.g. "auto-associated to open prepayment").
    parts = [inv.invoice_number or ""]
    for line in inv.pdf_lines or []:
        parts.extend(str(p) for p in line)
    return " ".join(parts)


def _prepayment_for(db: Session, vendor: str) -> Prepayment | None:
    return db.scalar(select(Prepayment).where(Prepayment.vendor == vendor))


def _approval_row(db: Session, inv_no: str) -> Approval | None:
    return db.scalar(select(Approval).where(Approval.inv == inv_no))


def _review_row(db: Session, inv_no: str) -> ReviewAction | None:
    return db.scalar(select(ReviewAction).where(ReviewAction.inv == inv_no))


def _rules(db: Session) -> dict[str, bool]:
    return {r.key: r.enabled for r in db.scalars(select(ApRule)).all()}


def _review_rule_hit(db: Session, inv: Invoice) -> tuple[str, str] | None:
    """Which AP-final-review rule (FR-44) fires for this invoice, if any."""
    rules = _rules(db)
    conf = inv.conf or {}
    terms_low = (conf.get("terms") or 100) < 90
    if rules.get("errors") and (inv.error_code != "—" or terms_low):
        if terms_low:
            return ("Terms mismatch", "PDF terms differ from the vendor default — always stops at AP (FR-23).")
        return (inv.error_code, f"Error code {inv.error_code} — errors always pass AP review (FR-71).")
    if rules.get("over25k") and inv.gross > 25000:
        return ("Over $25,000", f"Invoice gross {fmt(inv.gross)} exceeds the $25,000 AP-review threshold.")
    # `flagged` / `newVendor` need the flagged-vendor list — not modeled yet.
    return None


def _is_bulk_prepayment(inv: Invoice) -> bool:
    # The bulk prepayment SAYS it's a prepayment ("stated on their prepayment" per the
    # call). Amount is NOT a signal — CarMax true-ups are $20M+ shipment invoices.
    return "prepay" in (inv.invoice_number or "").lower() or "prepayment" in _doc_text(inv).lower()


def _period_from_doc(inv: Invoice) -> str:
    m = re.search(r"\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*(20\d\d)\b",
                  _doc_text(inv).upper())
    if m:
        return f"{m.group(1).title()} {m.group(2)}"
    mm = (inv.invoice_date or "07/13/26")[:2]
    return f"{MONTHS.get(mm, 'Jul')} 20{(inv.invoice_date or '07/13/26')[-2:]}"


def _referenced_invoice(inv: Invoice) -> str:
    """Original invoice number referenced on a credit/rebill document."""
    text = _doc_text(inv)
    own = inv.invoice_number
    for m in re.findall(r"\b[A-Z]{2,4}-?\d{4,6}\b|\bINV-\d{4,6}\b", text):
        if m != own and not m.startswith(("PIN", "PCM", "P26", "PAY")):
            return m
    return "original invoice"


def flow_kind(db: Session, inv: Invoice) -> str:
    if inv.queue in ("MASTER", "MANUAL_REVIEW"):
        return "unrouted"
    if inv.queue == "PREPAY":
        return "PREPAY_BULK" if _is_bulk_prepayment(inv) else "PREPAY"
    return inv.queue  # PO | NONPO | CREDIT | REBILL


# ---------- prefix steps (all flows) ----------
def _step_intake():
    return {
        "key": "intake", "label": "Intake", "fr": "FR-10", "gate": False,
        "done": lambda db, inv, marks: True,
        "detail": lambda db, inv, marks: f"Ingested {inv.scan_date} · duplicate check passed (FR-12)",
    }


def _step_classify():
    def ex(db, inv, user):
        r = apply_classification(db, inv)
        detail = (f"Classified {r['label']} · confidence {r['confidence']:.0%} "
                  f"(threshold {r['threshold']:.0%}) → {r['routedTo']} — {inv.route_reason}")
        _mark(db, inv, "classify", user, detail)
        return detail

    return {
        "key": "classify", "label": "Classify", "fr": "routing", "gate": False,
        "done": lambda db, inv, marks: bool(inv.class_label),
        "exec": ex,
        "detail": lambda db, inv, marks: (
            f"{inv.class_label} · {inv.class_confidence:.0%}" if inv.class_label and inv.class_confidence is not None
            else "rules + confidence threshold"
        ),
    }


def _step_route():
    def blocked(db, inv):
        return ("Manual Review", inv.route_reason or "Below the classification threshold — route it from Document Inflow")

    return {
        "key": "route", "label": "Route", "fr": "queue", "gate": True,
        "dynamic_gate": lambda db, inv: inv.queue == "MANUAL_REVIEW",
        "done": lambda db, inv, marks: inv.queue in QUEUES,
        "ensure": lambda db, inv, user: None,
        "blocked": blocked,
        "detail": lambda db, inv, marks: (
            f"→ {inv.queue} · {inv.route_reason}" if inv.queue in QUEUES else "auto after classification"
        ),
    }


def _step_extract():
    def ex(db, inv, user):
        n_fields = len(inv.conf or {}) or 9
        detail = (f"In-queue extraction — {n_fields} header fields + {len(inv.lines) or len(inv.pdf_lines or [])} "
                  f"line(s) with per-field confidence (FR-20/25)")
        inv.extracted = True
        inv.validated = True
        _mark(db, inv, "extract", user, detail)
        return detail

    return {
        "key": "extract", "label": "Extract", "fr": "FR-20", "gate": False,
        "done": lambda db, inv, marks: inv.extracted,
        "exec": ex,
        "detail": lambda db, inv, marks: ("fields + lines extracted" if inv.extracted else "runs inside the queue"),
    }


def _prefix():
    return [_step_intake(), _step_classify(), _step_route(), _step_extract()]


# ---------- shared queue steps ----------
def _match_done(db, inv, marks):
    return "match" in marks or inv.status in ("AUTOMATCH",) + POST_APPROVAL_STATUSES


def _step_match():
    def ex(db, inv, user):
        n = len(inv.receipts)
        if n:
            detail = f"Matched {n} receipt{'s' if n != 1 else ''} · 3-way via PO {inv.po} (FR-30)"
        else:
            detail = f"Matched 2-way to PO {inv.po} — no receipts in window (FR-30)"
        inv.status = "AUTOMATCH"
        _mark(db, inv, "match", user, detail)
        return detail

    return {
        "key": "match", "label": "Match", "fr": "FR-30/31", "gate": False,
        "done": _match_done, "exec": ex,
        "detail": lambda db, inv, marks: (
            f"{len(inv.receipts)} receipt(s) · PO {inv.po}" if inv.receipts else f"2-way · PO {inv.po}"
        ),
    }


def _step_approval():
    def ensure(db, inv, user):
        row = _approval_row(db, inv.invoice_number)
        if row is None:
            row = Approval(
                inv=inv.invoice_number, vendor=inv.vendor_name, company_id=inv.company_id,
                amount=fmt(inv.gross), amount_n=inv.gross,
                type=("PO-backed · matched" if inv.receipts else
                      "Supplier BP · template-coded" if inv.po == "—" else "PO-backed · 2-way"),
                route=f"{inv.current_user} → {inv.route_approver or 'Karl Weber'}",
            )
            db.add(row)
            _mark(db, inv, "approval_queued", user,
                  f"Queued for approval — route {row.route} (FR-40/42)")
        return row

    def blocked(db, inv):
        row = _approval_row(db, inv.invoice_number)
        if row and row.state == "rejected":
            return ("processor", "Rejected — returned to processor with comment (FR-46)")
        who = inv.route_approver if inv.route_approver not in ("—", "", None) else "Karl Weber"
        return (who, f"Waiting on {who} — every invoice passes approval before Sage (FR-40)")

    return {
        "key": "approval", "label": "Approval", "fr": "FR-40/42", "gate": True,
        "done": lambda db, inv, marks: (
            ((_approval_row(db, inv.invoice_number) or Approval(state=None)).state == "approved")
            or inv.status in POST_APPROVAL_STATUSES
        ),
        "ensure": ensure, "blocked": blocked,
        "detail": lambda db, inv, marks: (
            "Approved" if ((_approval_row(db, inv.invoice_number) or Approval(state=None)).state == "approved"
                           or inv.status in POST_APPROVAL_STATUSES) else "approval gate"
        ),
    }


def _step_ap_review():
    def ensure(db, inv, user):
        hit = _review_rule_hit(db, inv)
        row = _review_row(db, inv.invoice_number)
        if hit and row is None:
            row = ReviewAction(inv=inv.invoice_number, vendor=inv.vendor_name,
                               amount=fmt(inv.gross), rule=hit[0], why=hit[1])
            db.add(row)
            inv.status = "AP_REVIEW"
            _mark(db, inv, "ap_review_queued", user, f"Held for AP Final Review — rule: {hit[0]} (FR-44)")
        return row

    def done(db, inv, marks):
        if inv.status in POST_APPROVAL_STATUSES:
            return True
        hit = _review_rule_hit(db, inv)
        if hit is None:
            return "ap_review_skipped" in marks
        row = _review_row(db, inv.invoice_number)
        return bool(row and row.state == "released")

    def ex(db, inv, user):
        detail = "No AP-review rule hit — skipped straight to Sage (FR-44 exception-only)"
        _mark(db, inv, "ap_review_skipped", user, detail)
        return detail

    def blocked(db, inv):
        row = _review_row(db, inv.invoice_number)
        if row and row.state == "sentback":
            return ("processor", "Sent back by AP with reason — needs rework")
        return ("AP team (Nita Brandon)", "Rule-flagged — held for AP Final Review before Sage (FR-44)")

    return {
        "key": "ap_review", "label": "AP Final Review", "fr": "FR-44", "gate": True,
        "dynamic_gate": lambda db, inv: _review_rule_hit(db, inv) is not None,
        "done": done, "exec": ex, "ensure": ensure, "blocked": blocked,
        "detail": lambda db, inv, marks: (
            "skipped — no rule hit" if _review_rule_hit(db, inv) is None and "ap_review_skipped" in marks
            else (_review_rule_hit(db, inv) or ("", ""))[0] or "rule check"
        ),
    }


def _step_sage_pin():
    def ex(db, inv, user):
        pin = f"PIN{_next_seq(db, Invoice.erp_voucher, r'PIN(\d+)$', 196766)}"
        get_sage().create_pin(inv.invoice_number, {})
        inv.erp_voucher = pin
        inv.status = "IN_ERP"
        detail = f"{pin} created in Sage with attachment (FR-13) · write-back reflected on the record (NFR-7)"
        # Rebills complete the settlement chain with their real PIN (FR-62).
        if inv.queue == "REBILL":
            node = db.scalar(select(ChainNode).where(ChainNode.seq == 2))
            if node:
                node.num = f"{pin} · {inv.invoice_number}"
        _mark(db, inv, "sage_pin", user, detail)
        return detail

    return {
        "key": "sage_pin", "label": "PIN → Sage", "fr": "FR-13", "gate": False,
        "done": lambda db, inv, marks: inv.erp_voucher != "—",
        "exec": ex,
        "detail": lambda db, inv, marks: (inv.erp_voucher if inv.erp_voucher != "—" else "create PIN + attachment"),
    }


def _step_paid():
    def ex(db, inv, user):
        prefix = {"ACH": "PAYAC", "WIRE": "PAYWT", "CHK": "PAYCK"}.get(inv.pay_method, "PAYAC")
        pay = f"{prefix}{_next_seq(db, Invoice.payment_number, r'PAY[A-Z]{2}(\d+)$', 23400):06d}"
        inv.payment_date = "07/13/26"
        inv.payment_number = pay
        inv.payment_amount = fmt(inv.gross)
        inv.status = "MATCHED_PAY"
        detail = f"Payment feedback from Sage — {pay} · {fmt(inv.gross)} paid 07/13/26 (FR-73)"
        _mark(db, inv, "paid", user, detail)
        return detail

    return {
        # `external`: Sage's payment run reports back later — auto-continue stops at
        # In ERP; a single explicit step simulates the payment feedback.
        "key": "paid", "label": "Paid", "fr": "FR-73", "gate": False, "external": True,
        "done": lambda db, inv, marks: inv.status in ("MATCHED_PAY", "PAID"),
        "exec": ex,
        "detail": lambda db, inv, marks: (inv.payment_number if inv.payment_number != "—" else "await payment feedback"),
    }


# ---------- NONPO steps (per the latest call: PO creation cannot be automated) ----------
def _step_po_decision():
    def blocked(db, inv):
        last = get_sage().get_last_po(inv.vendor_code)
        return ("processor",
                f"Create the PO in Sage and attach its number here — or process as a supplier BP "
                f"invoice (no PO, template-coded). Last Sage PO for reference: {last}")

    return {
        "key": "po_decision", "label": "PO Decision", "fr": "late-PO / supplier BP", "gate": True,
        # Satisfied by an attached PO, an explicit supplier-BP decision, OR by the
        # document having already been coded/matched and moved on (legacy records
        # processed before this gate existed must not read as blocked mid-flow).
        "done": lambda db, inv, marks: (
            inv.po != "—" or "po_decision" in marks
            or "code_or_match" in marks
            or inv.status in ("AUTOMATCH",) + POST_APPROVAL_STATUSES
        ),
        "ensure": lambda db, inv, user: None,
        "blocked": blocked,
        "detail": lambda db, inv, marks: (
            f"PO {inv.po} attached" if inv.po != "—"
            else "supplier BP — no PO" if "po_decision" in marks
            else "attach Sage PO or go supplier-BP"
        ),
    }


def _step_code_or_match():
    def ex(db, inv, user):
        if inv.po != "—":
            detail = f"Matched 2-way to attached PO {inv.po} (created manually in Sage — FR-37 late-PO)"
        else:
            inv.template_line = "SUPPLIER-BP"
            detail = "Supplier BP invoice — lines coded from template SUPPLIER-BP · no PO, per AP process (FR-36)"
        inv.status = "AUTOMATCH"
        _mark(db, inv, "code_or_match", user, detail)
        return detail

    return {
        "key": "code_or_match", "label": "Code / Match", "fr": "FR-36/37", "gate": False,
        "done": lambda db, inv, marks: "code_or_match" in marks or inv.status in ("AUTOMATCH",) + POST_APPROVAL_STATUSES,
        "exec": ex,
        "detail": lambda db, inv, marks: ("2-way to attached PO" if inv.po != "—" else "template coding"),
    }


# ---------- PREPAY steps ----------
def _step_register_prepayment():
    def ex(db, inv, user):
        sage = get_sage()
        period = _period_from_doc(inv)
        pp = _prepayment_for(db, inv.vendor_name)
        if pp is None:
            po = sage.next_po_number(inv.vendor_code)
            existing = {i.po for i in db.scalars(select(Invoice)).all()} | {p.po for p in db.scalars(select(Prepayment)).all()}
            while po in existing:
                pfx, seq = po.rsplit("-", 1)
                po = f"{pfx}-{int(seq) + 1:0{len(seq)}d}"
            sage.create_po(inv.vendor_code, po)
            db.add(Prepayment(vendor=inv.vendor_name, period=period, po=po,
                              cadence="monthly true-up", total=_fmt_money_like(inv.gross, "$M" if inv.gross >= 10_000_000 else "$"),
                              consumed="$0", pct="0%", bar_color="#2E3391", pins=0,
                              latest="— none yet", alert=None, alert_fg=None, alert_bg=None))
            detail = (f"Prepayment registered — {fmt(inv.gross)} · {period} · {po} holds the period's "
                      f"receipts (FR-50/53); shipment invoices will draw it down")
        else:
            total = _parse_money(pp.total) + inv.gross
            pp.total = _fmt_money_like(total, pp.total)
            # Recompute consumption position against the enlarged prepaid amount.
            consumed = _parse_money(pp.consumed)
            pct = (consumed / total * 100) if total else 0
            pp.pct = f"{min(100, round(pct))}%"
            if pct >= 100:
                pp.bar_color, pp.alert = "#D8431A", f"⚠ Exceeded by {fmt(consumed - total)} — review (FR-52)"
                pp.alert_fg, pp.alert_bg = "#B23413", "#FDEDE7"
            elif pct >= 90:
                pp.bar_color, pp.alert = "#E0A106", f"⚠ {round(pct)}% consumed — nearing prepaid amount (FR-52)"
                pp.alert_fg, pp.alert_bg = "#8A6D05", "#FDF6E3"
            else:
                pp.bar_color, pp.alert, pp.alert_fg, pp.alert_bg = "#2E3391", None, None, None
            detail = f"Open prepayment for {inv.vendor_name} topped up by {fmt(inv.gross)} → {pp.total} ({pp.period})"
        _mark(db, inv, "register_prepayment", user, detail)
        return detail

    return {
        "key": "register_prepayment", "label": "Register Prepayment", "fr": "FR-50/53", "gate": False,
        "done": lambda db, inv, marks: "register_prepayment" in marks,
        "exec": ex,
        "detail": lambda db, inv, marks: "bulk prepayment → register + period PO",
    }


def _step_associate_prepayment():
    def ex(db, inv, user):
        pp = _prepayment_for(db, inv.vendor_name)
        total = _parse_money(pp.total)
        consumed = _parse_money(pp.consumed) + inv.gross
        pct = (consumed / total * 100) if total else 0
        pp.consumed = _fmt_money_like(consumed, pp.total)
        pp.pct = f"{min(100, round(pct))}%"
        pp.pins += 1
        pp.latest = f"{inv.erp_voucher} · today"
        if pct >= 100:
            pp.bar_color = "#D8431A"
            pp.alert = f"⚠ Exceeded by {fmt(consumed - total)} — review (FR-52)"
            pp.alert_fg, pp.alert_bg = "#B23413", "#FDEDE7"
        elif pct >= 90:
            pp.bar_color = "#E0A106"
            pp.alert = f"⚠ {round(pct)}% consumed — nearing prepaid amount (FR-52)"
            pp.alert_fg, pp.alert_bg = "#8A6D05", "#FDF6E3"
        detail = (f"{inv.erp_voucher} auto-associated to open prepayment {pp.vendor} · {pp.period} "
                  f"— consumption {pp.consumed} / {pp.total} (FR-51)")
        _mark(db, inv, "associate_prepayment", user, detail)
        return detail

    return {
        "key": "associate_prepayment", "label": "Prepayment", "fr": "FR-51", "gate": False,
        "done": lambda db, inv, marks: "associate_prepayment" in marks,
        "exec": ex,
        "detail": lambda db, inv, marks: "auto-associate PIN · draws down the prepayment",
    }


# ---------- CREDIT steps ----------
def _step_pin_reference():
    def blocked(db, inv):
        return ("processor",
                "Enter the original PIN this credit ties to — Sage pulls the PCM lines from it "
                "(the 'static field' link)")

    return {
        "key": "pin_reference", "label": "Original PIN", "fr": "FR-61", "gate": True,
        # Same rule as the PO gate: a credit already pushed through to its PCM /
        # park state has passed this point, whatever its stored reference.
        "done": lambda db, inv, marks: (
            inv.original_pin not in ("—", "", None)
            or "create_pcm" in marks or "extract_credits" in marks
            or inv.status in ("PARKED_ICEC", "PARKED_LEG") + POST_APPROVAL_STATUSES
        ),
        "ensure": lambda db, inv, user: None,
        "blocked": blocked,
        "detail": lambda db, inv, marks: (
            f"tied to {inv.original_pin}" if inv.original_pin not in ("—", "", None) else "reference required"
        ),
    }


def _step_extract_credits():
    def ex(db, inv, user):
        ref = _referenced_invoice(inv)
        nums = sorted({m for line in (inv.pdf_lines or []) for m in re.findall(r"INV-\d+", str(line))})
        credited = ", ".join(nums) if nums else ref
        detail = f"Credit memo classified — credited invoice(s): {credited} · negative total {fmt(inv.gross)} (FR-60)"
        _mark(db, inv, "extract_credits", user, detail)
        return detail

    return {
        "key": "extract_credits", "label": "Extract credits", "fr": "FR-60", "gate": False,
        "done": lambda db, inv, marks: "extract_credits" in marks,
        "exec": ex,
        "detail": lambda db, inv, marks: "credited invoice #s + per-vendor totals",
    }


def _step_ap_route_credit():
    def ensure(db, inv, user):
        row = _review_row(db, inv.invoice_number)
        if row is None:
            row = ReviewAction(inv=inv.invoice_number, vendor=f"{inv.vendor_name}",
                               amount=fmt(inv.gross), rule="Credit memo",
                               why="All credit memos route to AP before PCM creation (FR-60).")
            db.add(row)
            _mark(db, inv, "ap_route_queued", user, "Routed to AP — credit memos always pass AP review (FR-60)")
        return row

    return {
        "key": "ap_route", "label": "AP review", "fr": "FR-60", "gate": True,
        "done": lambda db, inv, marks: bool((_review_row(db, inv.invoice_number) or ReviewAction(state=None)).state == "released"),
        "ensure": ensure,
        "blocked": lambda db, inv: ("AP team (Nita Brandon)", "Credit memos always stop at AP before the PCM is created (FR-60)"),
        "detail": lambda db, inv, marks: "credit memos always route to AP",
    }


def _step_create_pcm():
    def ex(db, inv, user):
        original_pin = inv.original_pin if inv.original_pin not in ("—", "", None) else "PIN195233"
        r = get_sage().create_pcm(inv.invoice_number, original_pin)
        pcm = r["pcm"]
        ref = _referenced_invoice(inv)
        node0 = db.scalar(select(ChainNode).where(ChainNode.seq == 0))
        node1 = db.scalar(select(ChainNode).where(ChainNode.seq == 1))
        if node0:
            node0.num = f"{original_pin} · {ref}"
            node0.description = "Provisional netback invoice — paid within terms"
            node0.amount = fmt(abs(inv.gross))
        if node1:
            node1.num = f"{pcm} · {inv.invoice_number}"
            node1.description = f"PCM created in Sage tied to {original_pin} · platform ID {inv.platform_id} referenced (FR-61)"
            node1.amount = fmt(inv.gross) if inv.gross < 0 else f"({fmt(inv.gross)})"
        park = db.scalar(select(ParkQueueItem).where(ParkQueueItem.inv == inv.invoice_number))
        if park is None:
            db.add(ParkQueueItem(queue="ICEC", queue_title="ICEC parking queue",
                                 queue_sub="credit & rebill · prepayments",
                                 inv=inv.invoice_number, vendor=inv.vendor_name,
                                 amt=fmt(inv.gross), state="PCM created · awaiting rebill"))
        else:
            park.state = "PCM created · awaiting rebill"
        detail = f"{pcm} created in Sage tied to original {original_pin} — chain link recorded (FR-61)"
        _mark(db, inv, "create_pcm", user, detail)
        return detail

    return {
        "key": "create_pcm", "label": "Create PCM", "fr": "FR-61", "gate": False,
        "done": lambda db, inv, marks: "create_pcm" in marks,
        "exec": ex,
        "detail": lambda db, inv, marks: "PCM tied to the original PIN",
    }


def _step_park():
    def ex(db, inv, user):
        inv.status = "PARKED_ICEC"
        detail = "Parked in the ICEC queue — clears automatically when the rebill true-up arrives (FR-62/63)"
        _mark(db, inv, "park", user, detail)
        return detail

    return {
        "key": "park", "label": "Parked", "fr": "FR-63", "gate": False,
        "done": lambda db, inv, marks: "park" in marks,
        "exec": ex,
        "detail": lambda db, inv, marks: "awaiting rebill · chain: PIN ↔ PCM ↔ rebill (FR-62)",
    }


# ---------- REBILL steps ----------
def _step_credit_reference():
    """The client's "static field": a rebill cannot post until it names the
    purchase credit memo it settles. This is what makes original PIN -> PCM ->
    rebill provable in one place instead of losing the third link."""
    def blocked(db, inv):
        pcm = db.scalar(select(ChainNode.num).where(ChainNode.seq == 1))
        hint = f" Credit memo on the chain: {pcm}." if pcm else ""
        return ("processor",
                "Enter the purchase credit memo this rebill settles — it is what ties the "
                "rebill back to the credit and the original invoice." + hint)

    return {
        "key": "credit_reference", "label": "Credit memo", "fr": "FR-62 · static field", "gate": True,
        "done": lambda db, inv, marks: (
            inv.credit_memo_ref not in ("—", "", None) or "credit_reference" in marks
        ),
        "ensure": lambda db, inv, user: None,
        "blocked": blocked,
        "detail": lambda db, inv, marks: (
            f"settles {inv.credit_memo_ref}" if inv.credit_memo_ref not in ("—", "", None)
            else "credit memo reference required"
        ),
    }


def _step_link_chain():
    def ex(db, inv, user):
        ref = _referenced_invoice(inv)
        node2 = db.scalar(select(ChainNode).where(ChainNode.seq == 2))
        if node2:
            node2.num = f"pending PIN · {inv.invoice_number}"
            node2.description = "Settled price · linked to the credit + original PIN · closed-period check routes to AP (FR-64)"
            node2.amount = fmt(inv.gross)
        detail = (f"Chain linked — original ({ref}) ↔ credit {inv.credit_memo_ref} ↔ this re-invoice at "
                  f"settled price {fmt(inv.gross)} (FR-62) · closed-period rebills route for AP decision (FR-64)")
        _mark(db, inv, "link_chain", user, detail)
        return detail

    return {
        "key": "link_chain", "label": "Link chain", "fr": "FR-62/64", "gate": False,
        "done": lambda db, inv, marks: "link_chain" in marks,
        "exec": ex,
        "detail": lambda db, inv, marks: "original PIN ↔ PCM ↔ rebill",
    }


def flow_steps(db: Session, inv: Invoice) -> tuple[str, list[dict]]:
    kind = flow_kind(db, inv)
    prefix = _prefix()
    if kind == "unrouted":
        steps = prefix + [{
            "key": "queue_flow", "label": "Queue flow", "fr": "", "gate": False,
            "done": lambda db, inv, marks: False,
            "detail": lambda db, inv, marks: "determined after routing",
            "unreachable": True,
        }]
    elif kind == "CREDIT":
        steps = prefix + [_step_pin_reference(), _step_extract_credits(),
                          _step_ap_route_credit(), _step_create_pcm(), _step_park()]
    elif kind == "REBILL":
        steps = prefix + [_step_credit_reference(), _step_link_chain(), _step_match(), _step_approval(),
                          _step_ap_review(), _step_sage_pin(), _step_paid()]
    elif kind == "NONPO":
        steps = prefix + [_step_po_decision(), _step_code_or_match(), _step_approval(),
                          _step_ap_review(), _step_sage_pin(), _step_paid()]
    elif kind == "PREPAY_BULK":
        steps = prefix + [_step_register_prepayment(), _step_sage_pin(), _step_paid()]
    elif kind == "PREPAY":
        steps = prefix + [_step_match(), _step_approval(), _step_ap_review(),
                          _step_sage_pin(), _step_associate_prepayment(), _step_paid()]
    else:  # PO
        steps = prefix + [_step_match(), _step_approval(), _step_ap_review(),
                          _step_sage_pin(), _step_paid()]
    return kind, steps


# ---------- public API ----------
def get_flow(db: Session, inv: Invoice) -> dict:
    kind, steps = flow_steps(db, inv)
    marks = _flow_markers(db, inv.invoice_number)

    # A flow cannot sit at step 3 while step 7 is finished. Historical documents
    # (loaded already-processed, so they carry no per-step markers) would
    # otherwise show a middle step as "current" on a fully paid invoice.
    # Back-fill: any step with a completed step after it counts as completed.
    raw = [s["done"](db, inv, marks) for s in steps]
    done_flags, seen_later = [False] * len(steps), False
    for i in range(len(steps) - 1, -1, -1):
        done_flags[i] = raw[i] or seen_later
        seen_later = seen_later or raw[i]

    out = []
    current_found = False
    for s, done in zip(steps, done_flags):
        is_gate = s["dynamic_gate"](db, inv) if "dynamic_gate" in s else s["gate"]
        if done:
            skipped = s["key"] == "ap_review" and "ap_review_skipped" in marks and not is_gate
            state = "skipped" if skipped else "done"
        elif not current_found and not s.get("unreachable"):
            current_found = True
            if is_gate:
                if s["key"] in ("po_decision", "pin_reference", "credit_reference", "route"):
                    state = "blocked"  # resolved via stepper inputs / Document Inflow
                else:
                    row_exists = (
                        _approval_row(db, inv.invoice_number) if s["key"] == "approval"
                        else _review_row(db, inv.invoice_number)
                    )
                    state = "blocked" if row_exists else "current"
            else:
                state = "current"
        else:
            state = "pending"
        entry = {"key": s["key"], "label": s["label"], "fr": s["fr"], "gate": is_gate,
                 "state": state, "detail": s["detail"](db, inv, marks)}
        if state == "blocked" and "blocked" in s:
            who, msg = s["blocked"](db, inv)
            entry["waitingOn"] = who
            entry["detail"] = msg
        out.append(entry)
    history = db.scalars(
        select(AuditEvent).where(AuditEvent.invoice_number == inv.invoice_number,
                                 AuditEvent.action == "flow_step").order_by(AuditEvent.id)
    ).all()
    return {
        "flowKind": kind,
        "queue": inv.queue,
        "invoiceNumber": inv.invoice_number,
        "complete": all(e["state"] in ("done", "skipped") for e in out),
        "steps": out,
        "history": [{"step": h.field, "message": h.message, "actor": h.actor} for h in history],
    }


def run(db: Session, inv: Invoice, user: str, max_steps: int = 1) -> dict:
    """Execute up to max_steps automatic steps; stop at a gate (ensuring its work
    item exists) or on completion. Returns executed details + blocking info."""
    executed: list[str] = []
    blocked = None
    for _ in range(max_steps if max_steps > 0 else 99):
        _, steps = flow_steps(db, inv)
        marks = _flow_markers(db, inv.invoice_number)
        nxt = None
        for s in steps:
            if s.get("unreachable"):
                continue
            if not s["done"](db, inv, marks):
                nxt = s
                break
        if nxt is None:
            break
        is_gate = nxt["dynamic_gate"](db, inv) if "dynamic_gate" in nxt else nxt["gate"]
        if is_gate:
            if "ensure" in nxt and nxt["ensure"] is not None:
                nxt["ensure"](db, inv, user)
            who, msg = nxt["blocked"](db, inv)
            blocked = {"step": nxt["key"], "label": nxt["label"], "waitingOn": who, "detail": msg}
            break
        if nxt.get("external") and max_steps != 1:
            blocked = {"step": nxt["key"], "label": nxt["label"], "waitingOn": "Sage payment run",
                       "detail": "In ERP — awaiting payment feedback from Sage (FR-73)"}
            break
        executed.append(nxt["exec"](db, inv, user))
    db.commit()
    return {"executed": executed, "blocked": blocked, "flow": get_flow(db, inv)}
