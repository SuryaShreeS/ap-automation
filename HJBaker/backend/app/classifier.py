"""Document classification + queue routing for the inflow pipeline.

Rules come from the `routing_rules` table (List Administration › Routing Rules) and
run in priority order. Classification confidence is deterministic and explainable:
each rule kind carries a base confidence, reduced when the vendor isn't recognized
(the OCR-noise case) — below the threshold the document waits in MANUAL_REVIEW.
"""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Invoice, RoutingRule, Vendor

QUEUES = ("PO", "NONPO", "PREPAY", "CREDIT", "REBILL")
HOLDING = ("MASTER", "MANUAL_REVIEW")

# Base confidence per rule kind (how unambiguous that signal is on the document).
BASE_CONF = {
    "vendor_prepaid": 0.95,
    "negative_total": 0.94,
    "vendor_netback": 0.92,
    "has_po": 0.97,
    "fallback": 0.91,
}
UNKNOWN_VENDOR_PENALTY = 0.35

PO_PATTERN = re.compile(r"^P\d{2}-\d{4,6}$")
REBILL_HINTS = ("re-invoice", "rebill", "settled price", "true-up")
CREDIT_HINTS = ("cancellation", "credit memo", "credit note")
PREPAY_HINTS = ("prepayment", "prepaid")


def get_rules(db: Session) -> list[RoutingRule]:
    return list(db.scalars(
        select(RoutingRule).where(RoutingRule.enabled.is_(True)).order_by(RoutingRule.priority, RoutingRule.id)
    ).all())


def get_threshold(db: Session) -> float:
    row = db.scalar(select(RoutingRule).where(RoutingRule.kind == "threshold"))
    try:
        return float(row.value) if row else 0.80
    except ValueError:
        return 0.80


def known_vendors(db: Session) -> set[str]:
    names = set(db.scalars(select(Vendor.name)).all())
    names |= set(db.scalars(select(Invoice.vendor_name).where(Invoice.extracted.is_(True))).all())
    return {n.lower() for n in names if n}


def _doc_text(inv: Invoice) -> str:
    # Only immutable document content (never last_msg — that's engine-written and
    # would make re-classification unstable).
    parts = [inv.invoice_number or ""]
    for line in inv.pdf_lines or []:
        parts.extend(str(p) for p in line)
    return " ".join(parts).lower()


def classify(db: Session, inv: Invoice) -> dict:
    """Return {label, queue, confidence, reason} for a document (pure read)."""
    rules = get_rules(db)
    text = _doc_text(inv)
    vendors = known_vendors(db)
    vendor_known = (inv.vendor_name or "").lower() in vendors

    label, queue, base, reason = "", "", 0.0, ""
    for r in rules:
        if r.kind == "threshold":
            continue
        if r.kind == "vendor_prepaid" and inv.vendor_name == r.value:
            # Prepaid vendor — everything from them is a prepayment (per Sara).
            label, queue, base = "prepayment", r.queue or "PREPAY", BASE_CONF["vendor_prepaid"]
            reason = f"Vendor '{r.value}' is marked prepaid — {r.description or 'rule'}"
            break
        if r.kind == "negative_total" and (inv.gross < 0 or any(h in text for h in CREDIT_HINTS)):
            label, queue, base = "credit", r.queue or "CREDIT", BASE_CONF["negative_total"]
            reason = "Negative total / cancellation-invoice wording → credit memo"
            break
        if r.kind == "vendor_netback" and inv.vendor_name == r.value and inv.gross > 0 \
                and any(h in text for h in REBILL_HINTS):
            label, queue, base = "rebill", r.queue or "REBILL", BASE_CONF["vendor_netback"]
            reason = f"Netback vendor '{r.value}' re-invoice after settlement → rebill"
            break
        if r.kind == "has_po" and inv.po != "—" and PO_PATTERN.match(inv.po or ""):
            label, queue, base = "po_invoice", r.queue or "PO", BASE_CONF["has_po"]
            reason = f"PO {inv.po} found on document (prefix rule)"
            break
        if r.kind == "fallback":
            label, queue, base = "nonpo_invoice", r.queue or "NONPO", BASE_CONF["fallback"]
            reason = "No PO on document → non-PO (late-PO or supplier BP invoice)"
            break

    if not label:  # no rules configured at all — conservative default
        label, queue, base, reason = "nonpo_invoice", "NONPO", BASE_CONF["fallback"], "Default route"

    confidence = base
    if not vendor_known:
        confidence = round(max(0.05, base - UNKNOWN_VENDOR_PENALTY), 2)
        reason += " · vendor not recognized (possible OCR noise)"
    return {"label": label, "queue": queue, "confidence": round(confidence, 2), "reason": reason}


def apply_classification(db: Session, inv: Invoice) -> dict:
    """Classify + persist onto the invoice; route or hold for manual review."""
    result = classify(db, inv)
    threshold = get_threshold(db)
    inv.class_label = result["label"]
    inv.class_confidence = result["confidence"]
    if result["confidence"] >= threshold:
        inv.queue = result["queue"]
        inv.route_reason = result["reason"]
    else:
        inv.queue = "MANUAL_REVIEW"
        inv.route_reason = f"{result['reason']} · confidence {result['confidence']:.0%} < threshold {threshold:.0%}"
    return {**result, "routedTo": inv.queue, "threshold": threshold}
