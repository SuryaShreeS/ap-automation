"""Processing-engine endpoints: read a document's flow, execute steps, and resolve
the stepper's inline gates (attach PO / supplier-BP / original-PIN reference)."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import engine
from ..db import get_db
from ..models import AuditEvent, Invoice
from ._common import current_user

router = APIRouter(prefix="/engine", tags=["engine"])

PO_PATTERN = re.compile(r"^P\d{2}-\d{4,6}$")
PIN_PATTERN = re.compile(r"^PIN\d{6}$")


class AttachPo(BaseModel):
    po: str


class SetPin(BaseModel):
    pin: str


def _get(db: Session, invoice_number: str) -> Invoice:
    inv = db.scalar(select(Invoice).where(Invoice.invoice_number == invoice_number))
    if inv is None:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_number} not found")
    return inv


@router.get("/flow/{invoice_number}")
def get_flow(invoice_number: str, db: Session = Depends(get_db)) -> dict:
    return engine.get_flow(db, _get(db, invoice_number))


@router.post("/step/{invoice_number}")
def step(invoice_number: str, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    return engine.run(db, _get(db, invoice_number), user, max_steps=1)


@router.post("/run/{invoice_number}")
def run(invoice_number: str, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    return engine.run(db, _get(db, invoice_number), user, max_steps=99)


@router.post("/attach-po/{invoice_number}")
def attach_po(invoice_number: str, body: AttachPo, db: Session = Depends(get_db),
              user: str = Depends(current_user)) -> dict:
    """Late-PO attach: the user created the PO manually in Sage (automation isn't
    possible per the client) and enters its number here."""
    inv = _get(db, invoice_number)
    po = body.po.strip().upper()
    if not PO_PATTERN.match(po):
        raise HTTPException(status_code=400, detail="PO must match the Sage format, e.g. P26-005942 (prefix 'P' + year + sequence).")
    if inv.po == po:
        raise HTTPException(status_code=409, detail=f"{po} is already attached to this invoice.")
    clash = db.scalar(select(Invoice).where(Invoice.po == po, Invoice.id != inv.id))
    if clash is not None:
        raise HTTPException(status_code=409, detail=f"{po} is already attached to {clash.invoice_number}.")
    inv.po = po
    db.add(AuditEvent(invoice_number=invoice_number, actor=user, action="po_attached",
                      new_value=po, message=f"PO {po} (created manually in Sage) attached — late-PO flow (FR-37)"))
    db.commit()
    return engine.run(db, inv, user, max_steps=99)


@router.post("/no-po/{invoice_number}")
def no_po(invoice_number: str, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    """Supplier BP invoice — never has a PO (rent/equipment); template-coded lines."""
    inv = _get(db, invoice_number)
    engine._mark(db, inv, "po_decision", user,
                 "Processed as supplier BP invoice — no PO will ever exist; lines template-coded (per AP process)")
    db.commit()
    return engine.run(db, inv, user, max_steps=99)


class SetCreditMemo(BaseModel):
    creditMemo: str = ""


PCM_PATTERN = re.compile(r"^PCM\d{6}$")


@router.post("/set-credit-memo/{invoice_number}")
def set_credit_memo(invoice_number: str, body: SetCreditMemo, db: Session = Depends(get_db),
                    user: str = Depends(current_user)) -> dict:
    """A rebill names the purchase credit memo it settles. This is the client's
    "static field" — without it the original PIN ↔ PCM ↔ rebill chain loses its
    third link, which is their standing audit finding."""
    inv = _get(db, invoice_number)
    pcm = body.creditMemo.strip().upper()
    if not PCM_PATTERN.match(pcm):
        raise HTTPException(status_code=400,
                            detail="Credit memo must match the Sage format, e.g. PCM004410.")
    inv.credit_memo_ref = pcm
    db.add(AuditEvent(invoice_number=invoice_number, actor=user, action="credit_referenced",
                      new_value=pcm,
                      message=f"Rebill tied to credit memo {pcm} — completes original PIN ↔ PCM ↔ rebill (FR-62)"))
    db.commit()
    return engine.run(db, inv, user, max_steps=99)


@router.post("/set-original-pin/{invoice_number}")
def set_original_pin(invoice_number: str, body: SetPin, db: Session = Depends(get_db),
                     user: str = Depends(current_user)) -> dict:
    """Credit memos must reference the original PIN — Sage pulls the PCM lines from it."""
    inv = _get(db, invoice_number)
    pin = body.pin.strip().upper()
    if not PIN_PATTERN.match(pin):
        raise HTTPException(status_code=400, detail="Original PIN must match the Sage format, e.g. PIN196602.")
    inv.original_pin = pin
    db.add(AuditEvent(invoice_number=invoice_number, actor=user, action="pin_referenced",
                      new_value=pin, message=f"Original {pin} referenced — PCM will tie to it (FR-61)"))
    db.commit()
    return engine.run(db, inv, user, max_steps=99)
