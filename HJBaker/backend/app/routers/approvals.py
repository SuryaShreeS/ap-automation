"""Approvals (FR-40–43, FR-46). Per-user limits with over-limit escalation, comment
required on reject, and the mock secure email one-click action (FR-43)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import engine
from ..db import get_db
from ..models import Approval, AuditEvent, Invoice
from ..schemas import ApprovalAction
from ._common import current_user

router = APIRouter(prefix="/approvals", tags=["approvals"])

APPROVER_LIMIT = 50000  # Karl Weber's limit (FR-42)


@router.get("")
def list_approvals(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Approval).order_by(Approval.id)).all()
    # Approvals render inside their invoice's processing queue — tag each row.
    queues = dict(db.execute(select(Invoice.invoice_number, Invoice.queue)).all())
    out = []
    for a in rows:
        over = a.amount_n > APPROVER_LIMIT
        decided = a.state is not None
        if a.state == "approved":
            msg = ("✓ Approved — escalated to Amara Gill (CFO) for final sign-off (over your $50k limit)"
                   if over else "✓ Approved — next: AP Final Review rules check")
        elif a.state == "rejected":
            msg = "✗ Rejected — returned to processor with your comment (FR-46 logged)"
        else:
            msg = ""
        out.append({
            "inv": a.inv, "vendor": a.vendor, "co": a.company_id, "amount": a.amount,
            "type": a.type, "route": a.route, "overLimit": over,
            "decided": decided, "state": a.state, "decidedMsg": msg,
            "approveLabel": "Approve & escalate" if over else "Approve",
            "comment": a.comment, "queue": queues.get(a.inv, ""),
        })
    return {"limit": APPROVER_LIMIT, "rows": out}


@router.post("/{inv}/action")
def act(inv: str, body: ApprovalAction, db: Session = Depends(get_db),
        user: str = Depends(current_user)) -> dict:
    a = db.scalar(select(Approval).where(Approval.inv == inv))
    if a is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    if body.action == "reject":
        if not body.comment.strip():
            raise HTTPException(status_code=400, detail="A comment is required to reject.")
        a.state = "rejected"
        a.comment = body.comment
    elif body.action == "approve":
        a.state = "approved"
        a.comment = body.comment
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    db.add(AuditEvent(invoice_number=inv, actor=user, action=f"approval_{a.state}",
                      message=body.comment or a.state))
    db.commit()

    # Auto-continue the processing engine after approval: AP-review check → PIN →
    # In ERP (and prepayment association) run without further clicks.
    flow_summary: list[str] = []
    if a.state == "approved":
        invoice = db.scalar(select(Invoice).where(Invoice.invoice_number == inv))
        if invoice is not None:
            result = engine.run(db, invoice, user, max_steps=99)
            flow_summary = result["executed"]
            if result["blocked"]:
                flow_summary.append(f"⏸ {result['blocked']['label']}: {result['blocked']['detail']}")
    out = list_approvals(db)
    out["flowSummary"] = flow_summary
    return out


@router.post("/email-action")
def email_action(db: Session = Depends(get_db)) -> dict:
    """Mock secure one-click email approval (FR-43): signed token, 72h expiry, logged."""
    a = db.scalar(select(Approval).where(Approval.inv == "INV-88412"))
    if a and a.state is None:
        a.state = "approved"
        db.add(AuditEvent(invoice_number="INV-88412", actor="email-token", action="approval_approved",
                          message="Approved via signed email token (FR-43, NFR-3)"))
        db.commit()
    return {"ok": True, "message": "Approved via signed email token · every action logged (NFR-3, FR-46)"}
