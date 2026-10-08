"""AP Final Review (FR-44): rule-driven gate. Release to Sage or send back with a reason."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import engine
from ..db import get_db
from ..models import AuditEvent, Invoice, ReviewAction
from ..schemas import ReviewActionBody
from ..services.sage import get_sage
from ._common import current_user

router = APIRouter(prefix="/ap-review", tags=["ap-review"])


@router.get("")
def list_reviews(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(ReviewAction).order_by(ReviewAction.id)).all()
    # Review items render inside their invoice's processing queue — tag each row.
    queues = dict(db.execute(select(Invoice.invoice_number, Invoice.queue)).all())
    out = []
    for r in rows:
        if r.state == "released":
            msg = "✓ Released — PIN creation queued in Sage with attachment (FR-13) · idempotent retry on outage (NFR-7)"
        elif r.state == "sentback":
            msg = "↩ Sent back to processor with reason"
        else:
            msg = ""
        out.append({
            "inv": r.inv, "vendor": r.vendor, "amount": r.amount, "rule": r.rule, "why": r.why,
            "decided": r.state is not None, "state": r.state, "decidedMsg": msg, "reason": r.reason,
            "queue": queues.get(r.inv, ""),
        })
    return {"rows": out}


@router.post("/{inv}/action")
def act(inv: str, body: ReviewActionBody, db: Session = Depends(get_db),
        user: str = Depends(current_user)) -> dict:
    r = db.scalar(select(ReviewAction).where(ReviewAction.inv == inv))
    if r is None:
        raise HTTPException(status_code=404, detail="Review item not found")
    if body.action == "sendback":
        if not body.reason.strip():
            raise HTTPException(status_code=400, detail="A send-back reason is required.")
        r.state = "sentback"
        r.reason = body.reason
        db.add(AuditEvent(invoice_number=inv, actor=user, action="review_sentback", message=body.reason))
    elif body.action == "release":
        r.state = "released"
        result = get_sage().create_pin(inv, {})
        db.add(AuditEvent(invoice_number=inv, actor=user, action="review_released", message=result["message"]))
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    db.commit()

    # Auto-continue the engine after AP release (PIN → In ERP → prepayment/paid…).
    flow_summary: list[str] = []
    if r.state == "released":
        invoice = db.scalar(select(Invoice).where(Invoice.invoice_number == inv))
        if invoice is not None:
            res = engine.run(db, invoice, user, max_steps=99)
            flow_summary = res["executed"]
    out = list_reviews(db)
    out["flowSummary"] = flow_summary
    return out
