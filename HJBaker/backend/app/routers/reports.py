"""Reports (All) (FR-75): export catalog with Export to Excel.

Each row carries its live row-count so the catalog shows what an export will
actually contain before anyone runs it."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Approval, AuditEvent, Invoice, Receipt

router = APIRouter(prefix="/reports", tags=["reports"])

OPEN_STATUSES = ("UNPROCESSED", "DATA_REQUIRED", "AUTOMATCH", "AP_REVIEW")
ERROR_STATUSES = ("ERROR", "PARKED_ICEC", "PARKED_LEG")
PAID_STATUSES = ("MATCHED_PAY", "PAID")

REPORTS = [
    {"name": "Invoice Register", "desc": "All invoices by company, vendor, status, and period"},
    {"name": "Overview Aging Export", "desc": "Open work by age bucket per company"},
    {"name": "Error Report", "desc": "FR-71 taxonomy counts with drill-down rows"},
    {"name": "Approval History", "desc": "Who approved what, when, limits, and comments (FR-46)"},
    {"name": "Accrual Report", "desc": "Received-not-invoiced by period, receipt level"},
    {"name": "Payment Feedback Log", "desc": "Voucher / payment date / number / amount write-backs"},
]


def _counts(db: Session) -> dict[str, int]:
    n = lambda q: db.scalar(q) or 0  # noqa: E731
    inv = select(func.count()).select_from(Invoice)
    return {
        "Invoice Register": n(inv),
        "Overview Aging Export": n(inv.where(Invoice.status.in_(OPEN_STATUSES))),
        "Error Report": n(inv.where(Invoice.status.in_(ERROR_STATUSES))),
        "Approval History": n(select(func.count()).select_from(Approval)),
        "Accrual Report": n(select(func.count()).select_from(Receipt)),
        "Payment Feedback Log": n(inv.where(Invoice.status.in_(PAID_STATUSES))),
    }


@router.get("")
def list_reports(db: Session = Depends(get_db)) -> dict:
    counts = _counts(db)
    total = max(counts.values()) or 1
    return {"rows": [{**r, "rows": counts.get(r["name"], 0),
                      "share": round(counts.get(r["name"], 0) / total * 100)} for r in REPORTS],
            "generated": db.scalar(select(func.count()).select_from(AuditEvent)) or 0}


@router.post("/run")
def run_report(name: str) -> dict:
    return {"message": f"{name}.xlsx queued — Export to Excel (FR-75)"}
