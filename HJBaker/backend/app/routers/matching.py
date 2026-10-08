"""Receipt Matching (§5.5, FR-30–35). Returns receipts + matching context; the
frontend builds the line grid and live variance as receipts are toggled. Submit
validates variance server-side before preparing the Sage PIN payload."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..logic import matching_variance
from ..models import AuditEvent, Invoice
from ..schemas import MatchSubmit
from ..services.sage import get_sage
from ._common import current_user

router = APIRouter(prefix="/matching", tags=["matching"])

DOC_TAG = {"summary": "SUMMARY / TRUE-UP", "loadlist": "DETAILED LOAD LIST"}
EXPLAIN = {
    "summary": "Sage query: supplier + ship-date range 06/01–06/30 · receipts drive GL — matching is receipt level",
    "loadlist": "Every line matched by ship date + BOL / vehicle ID — the unique key (FR-31)",
}


def _get(db: Session, invoice_number: str) -> Invoice:
    inv = db.scalar(select(Invoice).where(Invoice.invoice_number == invoice_number))
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_number} not found")
    return inv


@router.get("/{invoice_number}")
def get_matching(invoice_number: str, db: Session = Depends(get_db)) -> dict:
    inv = _get(db, invoice_number)
    receipts = sorted(inv.receipts, key=lambda x: x.seq)
    return {
        "invoiceNumber": inv.invoice_number,
        "vendorName": inv.vendor_name,
        "docType": inv.doc_type,
        "docTag": DOC_TAG.get(inv.doc_type, "STANDARD"),
        "canImport": inv.doc_type in ("summary", "loadlist"),
        "supplier": inv.vendor_name if inv.vendor_code == "—" else inv.vendor_code,
        "explain": EXPLAIN.get(inv.doc_type, "Matched via PO number on document (FR-30)"),
        "banner": inv.match_banner,
        "ok": inv.match_ok,
        "net": inv.net,
        "scale": inv.receipt_scale,
        "total": inv.receipt_total,
        "currency": inv.currency,
        "receipts": [{"num": r.num, "date": r.ship_date, "bol": r.bol, "desc": r.description, "amtN": r.amount} for r in receipts],
    }


@router.post("/{invoice_number}/submit")
def submit_match(invoice_number: str, body: MatchSubmit, db: Session = Depends(get_db),
                 user: str = Depends(current_user)) -> dict:
    inv = _get(db, invoice_number)
    receipts = sorted(inv.receipts, key=lambda x: x.seq)
    v = matching_variance(inv.net, receipts, inv.receipt_scale, set(body.deselected))
    can_submit = v["variance_ok"] and len(receipts) > 0
    if not can_submit:
        return {"ok": False, "message": "Resolve variance to submit", "variance": v}
    db.add(AuditEvent(invoice_number=invoice_number, actor=user, action="match_submit",
                      message=f"Match confirmed — routed to approval ({inv.route_approver})"))
    db.commit()
    return {
        "ok": True,
        "message": f"Match confirmed — routed to approval ({inv.route_approver}). PIN payload prepared for Sage on final release.",
        "variance": v,
    }


@router.post("/{invoice_number}/import-receipts")
def import_receipts(invoice_number: str) -> dict:
    return {"message": "Vendor receipt-number import (Deer Park / CarMax pre-matched files) accepted as an alternative matching input — FR-34."}
