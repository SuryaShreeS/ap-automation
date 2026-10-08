"""Invoice list, detail bundle (§5.4), edit/save with audit, manual create with
duplicate detection (FR-12), notes, PO auto-generation (FR-38), vendor refresh."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..classifier import apply_classification
from ..db import get_db
from ..logic import totals_reconcile
from ..models import AuditEvent, Company, Invoice, InvoiceLine, Note
from ..schemas import InvoiceCreate, InvoicePatch, NoteCreate
from ..services.sage import get_sage
from ._common import current_user, invoice_dict

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _line_dict(ln: InvoiceLine) -> dict:
    return {
        "lineId": ln.line_id, "poNumber": ln.po_number, "poLine": ln.po_line,
        "quantity": ln.quantity, "description": ln.description, "itemNumber": ln.item_number,
        "unitPrice": ln.unit_price, "accountCode": ln.account_code, "division": ln.division,
        "salesChannel": ln.sales_channel, "branchSite": ln.branch_site, "department": ln.department,
        "project": ln.project, "lineAmount": ln.line_amount,
    }


def _get(db: Session, invoice_number: str) -> Invoice:
    inv = db.scalar(select(Invoice).where(Invoice.invoice_number == invoice_number))
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_number} not found")
    return inv


# Editable field key (frontend) -> (model attr, kind)
EDIT_MAP = {
    "errorCode": ("error_code", "str"), "po": ("po", "str"),
    "invoiceNumber": ("invoice_number", "str"), "invoiceDate": ("invoice_date", "str"),
    "termDays": ("term_days", "int"), "dueDate": ("due_date", "str"),
    "currency": ("currency", "str"), "vehicleId": ("vehicle_id", "str"), "bol": ("bol", "str"),
    "routeType": ("route_type", "str"), "routeName": ("route_name", "str"),
    "routeApprover": ("route_approver", "str"), "currentUser": ("current_user", "str"),
    "salesChannel": ("sales_channel", "str"), "vendorName": ("vendor_name", "str"),
    "vendorCode": ("vendor_code", "str"), "vendorAddrId": ("vendor_addr_id", "str"),
    "vendorLoc": ("vendor_loc", "str"), "vendorAddress": ("vendor_address", "str"),
    "vendorCity": ("vendor_city", "str"), "vendorTermDays": ("vendor_term_days", "int"),
    "payMethod": ("pay_method", "str"), "templateLine": ("template_line", "str"),
    "net": ("net", "money"), "gst": ("gst", "money"), "hst": ("hst", "money"),
    "pst": ("pst", "money"), "usa": ("usa", "money"), "vat": ("vat", "money"),
    "freight": ("freight", "money"), "gross": ("gross", "money"),
}


def _coerce(kind: str, raw: str):
    if kind == "int":
        try:
            return int(str(raw).strip())
        except ValueError:
            return None
    if kind == "money":
        s = str(raw).replace("$", "").replace(",", "").replace("(", "-").replace(")", "").strip()
        try:
            return float(s)
        except ValueError:
            return None
    return str(raw)


@router.get("")
def list_invoices(db: Session = Depends(get_db)) -> dict:
    invoices = db.scalars(select(Invoice).order_by(Invoice.platform_id.desc())).all()
    companies = {c.id: c.name for c in db.scalars(select(Company)).all()}
    return {"rows": [{**invoice_dict(i), "coName": companies.get(i.company_id, "")} for i in invoices]}


@router.get("/{invoice_number}")
def get_invoice(invoice_number: str, db: Session = Depends(get_db)) -> dict:
    inv = _get(db, invoice_number)
    companies = {c.id: c.name for c in db.scalars(select(Company)).all()}
    ok, variance = totals_reconcile(inv)
    sage = get_sage()
    lines = sorted(inv.lines, key=lambda x: x.seq)
    receipts = sorted(inv.receipts, key=lambda x: x.seq)
    notes = sorted(inv.notes, key=lambda x: x.id)
    return {
        "invoice": invoice_dict(inv),
        "coName": companies.get(inv.company_id, ""),
        "lines": [_line_dict(x) for x in lines],
        "lineFootnote": inv.line_footnote,
        "receipts": [{"num": r.num, "date": r.ship_date, "bol": r.bol, "desc": r.description, "amtN": r.amount} for r in receipts],
        "matching": {"banner": inv.match_banner, "ok": inv.match_ok, "total": inv.receipt_total, "scale": inv.receipt_scale, "net": inv.net},
        "notes": [{"who": n.who, "time": n.time, "text": n.text} for n in notes],
        "totals": {"ok": ok, "variance": variance},
        # PO creation cannot be automated (client call) — last Sage PO is reference
        # only; the PO is created in Sage and attached at the engine's po_decision gate.
        "poReference": {
            "needsPo": inv.po == "—" and inv.doc_type != "credit",
            "lastSagePo": sage.get_last_po(inv.vendor_code),
        },
    }


@router.patch("/{invoice_number}")
def patch_invoice(invoice_number: str, body: InvoicePatch, db: Session = Depends(get_db),
                  user: str = Depends(current_user)) -> dict:
    inv = _get(db, invoice_number)
    changed = 0
    for key, raw in body.edits.items():
        if key not in EDIT_MAP:
            continue
        attr, kind = EDIT_MAP[key]
        val = _coerce(kind, raw)
        if val is None:
            continue
        old = getattr(inv, attr)
        if str(old) == str(val):
            continue
        setattr(inv, attr, val)
        db.add(AuditEvent(invoice_number=invoice_number, actor=user, action="field_edit",
                          field=key, old_value=str(old), new_value=str(val),
                          message=f"{key}: {old} → {val}"))
        changed += 1
    if changed:
        inv.last_by = user
        inv.last_date = "07/13/26 09:41"
        inv.last_msg = "manualSave: field edits recorded to audit log"
    db.commit()
    return get_invoice(invoice_number, db)


@router.post("")
def create_invoice(body: InvoiceCreate, db: Session = Depends(get_db),
                   user: str = Depends(current_user)) -> dict:
    # Duplicate detection on vendor + invoice number + amount (FR-12).
    existing = db.scalars(
        select(Invoice).where(
            Invoice.vendor_name == body.vendorName,
            Invoice.invoice_number == body.invoiceNumber,
        )
    ).all()
    dup = any(abs(e.gross - (body.gross or body.net)) < 0.01 for e in existing)
    if dup:
        raise HTTPException(status_code=409, detail="Duplicate: vendor + invoice number + amount already exists (FR-12)")

    last_platform = db.scalar(select(Invoice.platform_id).order_by(Invoice.platform_id.desc()))
    new_platform = str(int(last_platform) + 1) if last_platform and last_platform.isdigit() else "108900"
    inv = Invoice(
        platform_id=new_platform, scan_date="07/14/26", company_id=body.company or "100",
        status="UNPROCESSED", vendor_name=body.vendorName, invoice_number=body.invoiceNumber,
        net=body.net, gross=body.gross or body.net, currency="USD", doc_type="standard",
        conf={}, pdf_lines=[], last_by=user, last_date="07/14/26 00:00",
        last_msg="manualCreate: duplicate check passed (FR-12)",
        queue="MASTER", extracted=False,
    )
    db.add(inv)
    db.add(AuditEvent(invoice_number=body.invoiceNumber, actor=user, action="create",
                      message="Manual invoice created in AP Unprocessed"))
    # Manual uploads go through the same arrival pipeline: classify + route (or
    # hold in Manual Review below the threshold) — no separate classify click.
    db.flush()
    r = apply_classification(db, inv)
    db.add(AuditEvent(invoice_number=body.invoiceNumber, actor="classifier", action="classified",
                      field=r["label"], new_value=f"{r['confidence']:.0%}",
                      message=f"Classified {r['label']} ({r['confidence']:.0%}) → {r['routedTo']} · {inv.route_reason}"))
    db.commit()
    routed = "Manual Review (below threshold)" if inv.queue == "MANUAL_REVIEW" else f"the {inv.queue} queue"
    return {"ok": True,
            "message": f"Duplicate check passed (FR-12) — record created and classified to {routed}.",
            "invoiceNumber": inv.invoice_number}


@router.post("/{invoice_number}/notes")
def add_note(invoice_number: str, body: NoteCreate, db: Session = Depends(get_db)) -> dict:
    inv = _get(db, invoice_number)
    inv.notes.append(Note(who=body.who, time="07/13/26 09:41", text=body.text))
    db.add(AuditEvent(invoice_number=invoice_number, actor=body.who, action="note", message=body.text))
    db.commit()
    notes = sorted(inv.notes, key=lambda x: x.id)
    return {"notes": [{"who": n.who, "time": n.time, "text": n.text} for n in notes]}


@router.post("/{invoice_number}/update-vendor")
def update_vendor(invoice_number: str, db: Session = Depends(get_db)) -> dict:
    inv = _get(db, invoice_number)
    return {"message": get_sage().refresh_vendor(inv.vendor_code)["message"]}
