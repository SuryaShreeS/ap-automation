"""Prepayments (FR-50–53): registration + consumption tracking with near/over alerts.
Registration creates a real Prepayment row (and its Sage payment PIN payload); the
engine auto-associates matched PINs to the open prepayment (FR-51)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..logic import fmt
from ..models import AuditEvent, Prepayment
from ..services.sage import get_sage
from ._common import current_user

router = APIRouter(prefix="/prepayments", tags=["prepayments"])


class PrepayRegister(BaseModel):
    vendor: str
    period: str = "Q3 2026"
    amount: float = 0.0
    cadence: str = "monthly true-up"


@router.get("")
def list_prepayments(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Prepayment).order_by(Prepayment.id)).all()
    return {"rows": [{
        "vendor": p.vendor, "period": p.period, "po": p.po, "cadence": p.cadence,
        "total": p.total, "consumed": p.consumed, "pct": p.pct, "barColor": p.bar_color,
        "pins": p.pins, "latest": p.latest, "alert": p.alert, "alertFg": p.alert_fg, "alertBg": p.alert_bg,
    } for p in rows]}


@router.post("/register")
def register(body: PrepayRegister, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    vendor = body.vendor.strip()
    if not vendor:
        raise HTTPException(status_code=400, detail="Vendor is required (FR-50).")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Agreed amount must be positive (FR-50).")
    if db.scalar(select(Prepayment).where(Prepayment.vendor == vendor)) is not None:
        raise HTTPException(status_code=409, detail=f"{vendor} already has an open prepayment — one PO holds all receipts for a period (FR-53).")

    sage = get_sage()
    po = sage.next_po_number("BP-NEW")
    sage.create_po("BP-NEW", po)
    db.add(Prepayment(
        vendor=vendor, period=body.period, po=po, cadence=body.cadence,
        total=fmt(body.amount).replace(".00", ""), consumed="$0", pct="0%",
        bar_color="#2E3391", pins=0, latest="— none yet", alert=None, alert_fg=None, alert_bg=None,
    ))
    db.add(AuditEvent(actor=user, action="prepay_register", field=vendor,
                      new_value=fmt(body.amount),
                      message=f"Prepayment registered: {vendor} · {body.period} · {fmt(body.amount)} — PO {po} holds the period's receipts, payment PIN sent to Sage (FR-50/53)"))
    db.commit()
    return {"ok": True,
            "message": f"Prepayment registered for {vendor} ({body.period}, {fmt(body.amount)}) — {po} created; matched PINs will auto-associate (FR-51).",
            **list_prepayments(db)}
