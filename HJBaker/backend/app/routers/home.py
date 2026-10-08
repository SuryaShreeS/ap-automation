"""Home / landing page aggregation — orients the signed-in user and routes them to work.

Pulls real counts from the DB (pipeline by status, work assigned to the current user),
pending approvals / AP-review, alerts, and recent audit activity.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Approval, AuditEvent, Invoice, Prepayment, ReviewAction, User
from .dashboards import KPIS
from ._common import current_user

router = APIRouter(prefix="/home", tags=["home"])

# Invoice lifecycle stages (label, statuses, tone).
PIPELINE = [
    ("Unprocessed", ["UNPROCESSED"], "muted"),
    ("Data Required", ["DATA_REQUIRED"], "warn"),
    ("Auto-matched", ["AUTOMATCH"], "ok"),
    ("AP Review", ["AP_REVIEW"], "danger"),
    ("In ERP", ["IN_ERP"], "link"),
    ("Paid", ["MATCHED_PAY", "PAID"], "ok"),
    ("Exceptions", ["ERROR", "PARKED_ICEC", "PARKED_LEG"], "danger"),
]


@router.get("")
def home(db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    counts = dict(db.execute(select(Invoice.status, func.count()).group_by(Invoice.status)).all())

    def total(statuses: list[str]) -> int:
        return sum(counts.get(s, 0) for s in statuses)

    # Each stage carries the exact filter that reproduces its count (CSV = IN-list).
    inflow_n = db.scalar(
        select(func.count()).select_from(Invoice).where(Invoice.queue.in_(("MASTER", "MANUAL_REVIEW")))
    ) or 0
    pipeline = [{"label": "Inflow", "filters": {"queueV2": "MASTER,MANUAL_REVIEW"},
                 "count": inflow_n, "tone": "accent"}]
    pipeline += [
        {"label": label, "filters": {"status": ",".join(statuses)}, "count": total(statuses), "tone": tone}
        for label, statuses, tone in PIPELINE
    ]

    u = db.scalar(select(User).where(User.name == user))
    assigned = db.scalar(select(func.count()).select_from(Invoice).where(Invoice.current_user == user)) or 0
    needs_coding = db.scalar(
        select(func.count()).select_from(Invoice).where(Invoice.current_user == user, Invoice.status == "DATA_REQUIRED")
    ) or 0
    my_exceptions = db.scalar(
        select(func.count()).select_from(Invoice).where(Invoice.current_user == user, Invoice.status == "ERROR")
    ) or 0
    # Count INVOICES pending (not queue rows) so the card equals its click-through —
    # a queue row referencing a demo-only doc must not inflate the number.
    pending_approvals = db.scalar(
        select(func.count()).select_from(Invoice).where(
            Invoice.invoice_number.in_(select(Approval.inv).where(Approval.state.is_(None))))
    ) or 0
    pending_review = db.scalar(
        select(func.count()).select_from(Invoice).where(
            Invoice.invoice_number.in_(select(ReviewAction.inv).where(ReviewAction.state.is_(None))))
    ) or 0

    # `target` is a filter-field → value map, loaded verbatim into the Search filter
    # so the user sees (and can adjust) exactly the criteria behind the count.
    my_work = [
        {"label": "Assigned to you", "count": assigned, "target": {"currentUser": user}, "tone": "link"},
        {"label": "Needs data / coding", "count": needs_coding, "target": {"status": "DATA_REQUIRED", "currentUser": user}, "tone": "warn"},
        # Approvals/AP-review live inside the processing queues now — these cards open
        # the filtered results (row → detail → stepper deep-links into the right queue).
        {"label": "Awaiting approval", "count": pending_approvals, "target": {"awaitingApproval": "true"}, "tone": "link"},
        {"label": "AP final review", "count": pending_review, "target": {"awaitingApReview": "true"}, "tone": "danger"},
        {"label": "Exceptions assigned to you", "count": my_exceptions, "target": {"status": "ERROR", "currentUser": user}, "tone": "danger"},
    ]

    alerts: list[dict] = []
    for p in db.scalars(select(Prepayment).where(Prepayment.alert.is_not(None))).all():
        alerts.append({"text": f"{p.vendor}: {p.alert}", "tone": "warn" if "92%" in (p.alert or "") else "danger"})
    err = total(["ERROR", "PARKED_ICEC", "PARKED_LEG"])
    if err:
        alerts.append({"text": f"{err} invoice(s) in an error / parked state need attention", "tone": "danger"})
    alerts.append({"text": "2 invoices in ERP over 24h ($41,050.00) — check the Sage hand-off", "tone": "danger"})

    recent = db.scalars(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(6)).all()

    return {
        "user": {"name": user, "role": u.role if u else "Processor / Coder", "limit": u.limit if u else "$10,000",
                 "initials": u.initials if u else "".join(w[0] for w in user.split()[:2]).upper()},
        "kpis": KPIS,
        "pipeline": pipeline,
        "myWork": my_work,
        "alerts": alerts,
        "recent": [{"ts": e.ts.isoformat() if e.ts else "", "actor": e.actor, "action": e.action,
                    "message": e.message, "invoiceNumber": e.invoice_number} for e in recent],
    }
