"""Processing queues (v2) — the five routed work queues (PO, Non-PO, Prepayments,
Credits, Rebills). Each contains the lifecycle status buckets as SUB-QUEUES
(All ∙ Unprocessed ∙ Data Required ∙ … ∙ Exceptions); every count carries the
filter that reproduces it (click-through contract, same as the dashboards)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Company, Invoice
from ..schemas import Criterion
from .search import all_invoices, apply_criteria, build_ctx
from ._common import invoice_dict

router = APIRouter(prefix="/queues-v2", tags=["queues"])

QUEUE_DEFS: list[tuple[str, str, str]] = [
    ("PO", "PO", "PO on document — auto-match 2/3-way against Sage"),
    ("NONPO", "Non-PO", "Late-PO attach (created manually in Sage) or supplier BP invoices"),
    ("PREPAY", "Prepayments", "Marked prepaid vendors — bulk registers, shipments draw down"),
    ("CREDIT", "Credits", "Cancellation invoices (negative) — PCM tied to the original PIN"),
    ("REBILL", "Rebills", "Netback re-invoices at settled price — linked into the chain"),
]

# Status sub-queues (the previous Work Queue buckets, now nested per processing queue).
SUB_QUEUES: list[tuple[str, str, dict]] = [
    ("unprocessed", "Unprocessed", {"status": "UNPROCESSED"}),
    ("data-required", "Data Required", {"status": "DATA_REQUIRED"}),
    ("auto-matched", "Auto-Matched", {"status": "AUTOMATCH"}),
    ("awaiting-approval", "Awaiting Approval", {"awaitingApproval": "true"}),
    ("ap-review", "AP Review", {"awaitingApReview": "true"}),
    ("sent-to-erp", "Sent to ERP", {"status": "IN_ERP"}),
    ("paid", "Paid", {"status": "MATCHED_PAY,PAID"}),
    ("exceptions", "Exceptions", {"status": "ERROR,PARKED_ICEC,PARKED_LEG,CANCELLED"}),
]


def _crit(values: dict) -> list[Criterion]:
    return [Criterion(field=f, op="=", value=v) for f, v in values.items()]


@router.get("")
def queue_totals(db: Session = Depends(get_db)) -> dict:
    invoices = all_invoices(db)
    ctx = build_ctx(db)
    out = []
    for key, label, desc in QUEUE_DEFS:
        n = len(apply_criteria(invoices, _crit({"queueV2": key}), ctx))
        out.append({"key": key, "label": label, "description": desc, "count": n})
    return {"queues": out}


@router.get("/{queue}")
def queue_detail(queue: str, db: Session = Depends(get_db)) -> dict:
    meta = next((q for q in QUEUE_DEFS if q[0] == queue), None)
    if meta is None:
        raise HTTPException(status_code=404, detail="Unknown processing queue")
    invoices = all_invoices(db)
    ctx = build_ctx(db)
    companies = {c.id: c.name for c in db.scalars(select(Company)).all()}

    rows = apply_criteria(invoices, _crit({"queueV2": queue}), ctx)
    buckets = [{"key": "all", "label": "All", "count": len(rows),
                "filters": {"values": {"queueV2": queue}, "ops": {}}}]
    for key, label, values in SUB_QUEUES:
        filt = {"queueV2": queue, **values}
        n = len(apply_criteria(invoices, _crit(filt), ctx))
        buckets.append({"key": key, "label": label, "count": n,
                        "filters": {"values": filt, "ops": {}}})
    # Late-PO sub-queue is meaningful only in Non-PO (docs still awaiting their Sage PO).
    if queue == "NONPO":
        filt = {"queueV2": queue, "poNumber": "—"}
        n = len(apply_criteria(invoices, _crit(filt), ctx))
        buckets.append({"key": "late-po", "label": "Awaiting PO", "count": n,
                        "filters": {"values": filt, "ops": {}}})

    return {
        "queue": queue,
        "label": meta[1],
        "description": meta[2],
        "buckets": buckets,
        "rows": [{
            **invoice_dict(i), "coName": companies.get(i.company_id, ""),
            "queue": i.queue, "classConfidence": i.class_confidence,
            "routeReason": i.route_reason, "extracted": i.extracted,
        } for i in sorted(rows, key=lambda r: r.platform_id, reverse=True)],
    }
