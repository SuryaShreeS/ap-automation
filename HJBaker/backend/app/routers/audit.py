"""Immutable audit log (FR-46, FR-83): every field change, match, approval, and Sage write."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuditEvent

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit(limit: int = 200, invoice: str = "", db: Session = Depends(get_db)) -> dict:
    """Newest first. Pass `invoice` for one document's history (arrival →
    classification → routing → each processing step → Sage)."""
    q = select(AuditEvent).order_by(AuditEvent.id.desc()).limit(limit)
    if invoice:
        q = select(AuditEvent).where(AuditEvent.invoice_number == invoice).order_by(AuditEvent.id).limit(limit)
    rows = db.scalars(q).all()
    return {"rows": [{
        "ts": e.ts.isoformat() if e.ts else "",
        "invoiceNumber": e.invoice_number,
        "actor": e.actor,
        "action": e.action,
        "field": e.field,
        "oldValue": e.old_value,
        "newValue": e.new_value,
        "message": e.message,
    } for e in rows]}
