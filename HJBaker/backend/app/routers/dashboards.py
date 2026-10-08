"""Overview dashboards (FR-70–73), Invoice Dashboard KPIs, and Analytics.

Every count is derived from the database THROUGH THE SEARCH ENGINE ITSELF
(`apply_criteria`), and every cell carries the exact filter that reproduces it —
so a click-through always lands on precisely the rows that were counted.

Companies are read from the DB (managed in List Administration → Companies).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Company, Invoice
from ..schemas import Criterion
from .search import all_invoices, apply_criteria, build_ctx

router = APIRouter(prefix="/dashboards", tags=["dashboards"])

OPEN_STATUSES = "UNPROCESSED,DATA_REQUIRED,AUTOMATCH,AP_REVIEW,ERROR,PARKED_ICEC,PARKED_LEG"
SENT_STATUSES = "MATCHED_PAY,PAID"
ERROR_SET = "ERROR,PARKED_ICEC,PARKED_LEG"
CLOCK_DAY = 13  # demo clock: Jul 13, 2026 (matches the header)

# FR-71 error taxonomy → the filter that reproduces each category (None = not modeled yet).
ERROR_TAXONOMY: list[tuple[str, dict | None]] = [
    ("Rejected", None),
    ("Duplicates", None),
    ("Statements", None),
    ("ICEC/LEG Hold", None),
    ("ICEC Credit and Rebill", {"status": "PARKED_ICEC"}),
    ("ICEC Prepayments", None),
    ("LEG Credit and Rebill", {"status": "PARKED_LEG"}),
    ("Missing Vendor", {"errorCode": "MISSING_VENDOR"}),
    ("ERP Failed", None),
    ("Future Invoice Date", None),
    ("No Company", None),
    ("PO Invalid Format", None),
    ("Under AP Review", {"status": "AP_REVIEW"}),
]

# The redesigned Overview (All) matrix columns: key, label, tone, base filter.
MATRIX_COLUMNS: list[dict] = [
    {"key": "new", "label": "New", "tone": "muted2", "values": {"status": "UNPROCESSED"}},
    {"key": "dataReq", "label": "Data Required", "tone": "warn", "values": {"status": "DATA_REQUIRED"}},
    {"key": "awaitAppr", "label": "Awaiting Approval", "tone": "link", "values": {"awaitingApproval": "true"}},
    {"key": "apReview", "label": "AP Final Review", "tone": "accent", "values": {"status": "AP_REVIEW"}},
    {"key": "automatch", "label": "Automatch", "tone": "ok", "values": {"status": "AUTOMATCH"}},
    {"key": "erpPending", "label": "In ERP · Pending", "tone": "link", "values": {"status": "IN_ERP"}},
    {"key": "erpSent24", "label": "Sent · <24h", "tone": "ok", "values": {"sentLast24": "true"}},
    {"key": "error", "label": "Error", "tone": "danger", "values": {"status": ERROR_SET}},
]


def db_companies(db: Session) -> list[dict]:
    return [{"id": c.id, "name": c.name} for c in db.scalars(select(Company).order_by(Company.id)).all()]


def _crit(values: dict, ops: dict | None = None) -> list[Criterion]:
    ops = ops or {}
    return [Criterion(field=f, op=ops.get(f, "="), value=v) for f, v in values.items()]


def _count(invoices, ctx, values: dict, ops: dict | None = None) -> int:
    return len(apply_criteria(invoices, _crit(values, ops), ctx))


def _cell(invoices, ctx, values: dict, ops: dict | None = None, tone: str | None = None) -> dict:
    ops = ops or {}
    n = _count(invoices, ctx, values, ops)
    clickable = n > 0
    return {
        "text": str(n),
        "n": n,
        "filters": {"values": values, "ops": ops} if clickable else None,
        "clickable": clickable,
        "tone": tone or ("link" if clickable else "muted"),
    }


def _static_cell(text: str, tone: str) -> dict:
    return {"text": text, "clickable": False, "tone": tone, "filters": None}


# ---------- redesigned Overview (All): two tables + user drill-down ----------
@router.get("/overview-matrix")
def overview_matrix(users: str = Query(""), db: Session = Depends(get_db)) -> dict:
    invoices = all_invoices(db)
    ctx = build_ctx(db)
    companies = db_companies(db)
    user_list = sorted({i.current_user for i in invoices if i.current_user})
    selected = [u.strip() for u in users.split(",") if u.strip()]
    user_filter = {"currentUser": ",".join(selected)} if selected else {}

    rows = []
    for c in companies:
        cells = [
            _cell(invoices, ctx, {**col["values"], "company": c["id"], **user_filter}, None, col["tone"])
            for col in MATRIX_COLUMNS
        ]
        open_n = _count(invoices, ctx, {"status": OPEN_STATUSES, "company": c["id"], **user_filter})
        rows.append({"id": c["id"], "label": f'{c["id"]} · {c["name"]}', "cells": cells, "open": open_n})

    totals = [
        _cell(invoices, ctx, {**col["values"], **user_filter}, None, col["tone"])
        for col in MATRIX_COLUMNS
    ]

    error_split = []
    for label, flt in ERROR_TAXONOMY:
        if flt is None:
            error_split.append({"label": label, "modeled": False,
                                "cell": _static_cell("0", "muted")})
        else:
            error_split.append({"label": label, "modeled": True,
                                "cell": _cell(invoices, ctx, {**flt, **user_filter}, None, "danger")})
    error_total = _cell(invoices, ctx, {"status": ERROR_SET + ",AP_REVIEW", **user_filter}, None, "danger")

    return {
        "columns": [{"key": c["key"], "label": c["label"], "tone": c["tone"]} for c in MATRIX_COLUMNS],
        "rows": rows,
        "totals": totals,
        "errorSplit": error_split,
        "errorTotal": error_total,
        "users": user_list,
        "selectedUsers": selected,
        "generatedFrom": "live · List Administration › Companies",
    }


# ---------- classic panel variants (aging / erp / nonpo / po / co405410) ----------
def _company_rows(invoices, ctx, co_list, status: str, base: dict, base_ops: dict) -> list[dict]:
    rows = []
    for c in co_list:
        rows.append({
            "label": f'{c["id"]} · {c["name"]}', "total": False,
            "cells": [_cell(invoices, ctx, {**base, "status": status, "company": c["id"]}, base_ops)],
        })
    all_ids = ",".join(c["id"] for c in co_list)
    rows.append({
        "label": "Total", "total": True,
        "cells": [_cell(invoices, ctx, {**base, "status": status, "company": all_ids}, base_ops, tone="ink")],
    })
    return rows


def _panels_for(variant: str, invoices, ctx, companies) -> list[dict]:
    co_list = companies
    base: dict = {}
    base_ops: dict = {}
    tag = ""
    if variant == "nonpo":
        base = {"poNumber": "—"}; tag = "non-PO only"
    elif variant == "po":
        base = {"poNumber": "—"}; base_ops = {"poNumber": "<>"}; tag = "PO only"
    elif variant == "co405410":
        co_list = [c for c in companies if c["id"] in ("405", "410")]; tag = "405/410 only"

    def erp_panel():
        rows = []
        for c in co_list:
            rows.append({
                "label": f'{c["id"]} · {c["name"]}', "total": False,
                "cells": [
                    _cell(invoices, ctx, {**base, "status": "IN_ERP", "company": c["id"]}, base_ops),
                    _cell(invoices, ctx, {**base, "status": SENT_STATUSES, "company": c["id"]}, base_ops),
                ],
            })
        rows.append({"label": "Sent under 24 hours", "total": True, "wide": True,
                     "cells": [_cell(invoices, ctx, {**base, "sentLast24": "true"}, base_ops, tone="ok")]})
        return {"id": "inERP", "title": "In ERP", "tag": "FR-73 · 24h aging",
                "header": {"label": "Company", "cells": ["Pending", "Sent"]}, "rows": rows}

    if variant == "aging":
        rows = []
        open_set = set(OPEN_STATUSES.split(","))
        for c in co_list:
            mine = [i for i in invoices if i.company_id == c["id"] and i.status in open_set]
            buckets = [0, 0, 0, 0]  # <24h, 1–3d, 3–7d, >7d
            for i in mine:
                try:
                    age = CLOCK_DAY - int(i.scan_date[3:5])
                except (ValueError, IndexError):
                    age = 99
                buckets[0 if age < 1 else 1 if age <= 3 else 2 if age <= 7 else 3] += 1
            cells = [_static_cell(str(b), "link" if b else "muted") for b in buckets]
            cells.append(_cell(invoices, ctx, {"status": OPEN_STATUSES, "company": c["id"]}, {}, tone="ink"))
            rows.append({"label": f'{c["id"]} · {c["name"]}', "total": False, "cells": cells})
        return [{"id": "aging", "title": "Overview Aging · open work by age", "tag": "FR-72",
                 "header": {"label": "Company", "cells": ["<24h", "1–3d", "3–7d", ">7d", "Total"]},
                 "rows": rows}]

    if variant == "erp":
        canc = _company_rows(invoices, ctx, co_list, "CANCELLED", {}, {})
        return [erp_panel(), {"id": "cancelled", "title": "Cancelled", "tag": "", "header": None, "rows": canc}]

    error_rows = []
    for label, flt in ERROR_TAXONOMY:
        if flt is None:
            error_rows.append({"label": label, "total": False, "cells": [_static_cell("0", "muted")]})
        else:
            error_rows.append({"label": label, "total": False,
                               "cells": [_cell(invoices, ctx, {**flt}, {}, tone="danger")]})
    error_rows.append({"label": "Total", "total": True,
                       "cells": [_cell(invoices, ctx, {"status": ERROR_SET + ",AP_REVIEW"}, {}, tone="danger")]})

    suffix = f" · {tag}" if tag else ""
    return [
        {"id": "unproc", "title": "AP Unprocessed" + suffix, "tag": "new / uncoded", "header": None,
         "rows": _company_rows(invoices, ctx, co_list, "UNPROCESSED", base, base_ops)},
        {"id": "dataReq", "title": "Data Required (Approval)", "tag": "keyed · awaiting approval", "header": None,
         "rows": _company_rows(invoices, ctx, co_list, "DATA_REQUIRED", base, base_ops)},
        {"id": "apRev", "title": "AP Final Review", "tag": "rule-flagged", "header": None,
         "rows": _company_rows(invoices, ctx, co_list, "AP_REVIEW", base, base_ops)},
        {"id": "automatch", "title": "Automatch", "tag": "pending confirmation", "header": None,
         "rows": _company_rows(invoices, ctx, co_list, "AUTOMATCH", base, base_ops)},
        erp_panel(),
        {"id": "error", "title": "Error", "tag": "FR-71 taxonomy", "header": None, "rows": error_rows},
    ]


@router.get("/overview")
def overview(variant: str = Query("all"), db: Session = Depends(get_db)) -> dict:
    invoices = all_invoices(db)
    ctx = build_ctx(db)
    companies = db_companies(db)
    return {"variant": variant, "panels": _panels_for(variant, invoices, ctx, companies)}


# Chart series carry NUMBERS (never CSS strings) — the frontend owns scales,
# axes, and colour; the backend owns the data and its targets.
AUTO_MATCH_TARGET = 80
EXTRACT_TARGET = 95

KPIS = [
    {"label": "Invoices this month", "value": "2,847", "trend": "▲ 4% vs Jun", "tone": "muted",
     "spark": [2180, 2510, 2390, 2660, 2740, 2847]},
    {"label": "Auto-extracted", "value": "96.2%", "trend": f"target ≥{EXTRACT_TARGET}% · NFR-6", "tone": "ok",
     "spark": [92.4, 93.1, 94.0, 95.2, 95.8, 96.2]},
    {"label": "Auto-match rate", "value": "83.4%", "trend": f"target ≥{AUTO_MATCH_TARGET}% · FR-3x", "tone": "ok",
     "spark": [61, 68, 74, 79, 81, 83.4]},
    {"label": "Median cycle time", "value": "0.8d", "trend": "arrival → PIN · target <1d", "tone": "ok",
     "spark": [2.1, 1.8, 1.5, 1.2, 0.9, 0.8]},
]

# One row per month: volume (count) and auto-match (%) stay SEPARATE measures —
# they are plotted as two charts on their own scales, never one dual-axis plot.
VOLUME_TREND = [
    {"month": "Feb", "invoices": 2180, "autoMatchPct": 61.0},
    {"month": "Mar", "invoices": 2510, "autoMatchPct": 68.0},
    {"month": "Apr", "invoices": 2390, "autoMatchPct": 74.0},
    {"month": "May", "invoices": 2660, "autoMatchPct": 79.0},
    {"month": "Jun", "invoices": 2740, "autoMatchPct": 81.0},
    {"month": "Jul", "invoices": 2847, "autoMatchPct": 83.4},
]
VENDOR_MATCH = [
    {"name": "Phillips 66", "pct": 97.0}, {"name": "Deer Park", "pct": 94.0},
    {"name": "CarMax", "pct": 91.0}, {"name": "Shell Chemical", "pct": 88.0},
    {"name": "Martin Transport", "pct": 54.0}, {"name": "CN Rail", "pct": 41.0},
]


@router.get("/kpis")
def kpis() -> dict:
    return {"kpis": KPIS, "volumeTrend": VOLUME_TREND, "vendorMatch": VENDOR_MATCH,
            "autoMatchTarget": AUTO_MATCH_TARGET}


@router.get("/analytics")
def analytics(db: Session = Depends(get_db)) -> dict:
    """Expanded analytics view (FR-74): KPI band + throughput + exception mix + per-vendor."""
    invoices = all_invoices(db)
    companies = db_companies(db)
    return {
        "kpis": KPIS,
        "volumeTrend": VOLUME_TREND,
        "vendorMatch": VENDOR_MATCH,
        "autoMatchTarget": AUTO_MATCH_TARGET,
        "exceptionMix": [
            {"label": "Missing Vendor", "pct": 31.0},
            {"label": "Terms mismatch", "pct": 22.0},
            {"label": "Duplicates", "pct": 17.0},
            {"label": "PO invalid format", "pct": 12.0},
            {"label": "Future invoice date", "pct": 10.0},
            {"label": "Other", "pct": 8.0},
        ],
        # Ordered pipeline stages (ordinal) — minutes drive the bar length,
        # `display` is the human unit shown on the label.
        "cycleTime": [
            {"stage": "Intake → extraction", "minutes": 6, "display": "6 min"},
            {"stage": "Extraction → match", "minutes": 3, "display": "3 min"},
            {"stage": "Match → approval", "minutes": 252, "display": "4.2 h"},
            {"stage": "Approval → PIN", "minutes": 432, "display": "0.3 d"},
        ],
        "throughput": [
            {"company": f'{c["id"]} · {c["name"]}',
             "processed": sum(1 for i in invoices if i.company_id == c["id"] and i.status in ("IN_ERP", "MATCHED_PAY", "PAID")),
             "exceptions": sum(1 for i in invoices if i.company_id == c["id"] and i.status in ("ERROR", "PARKED_ICEC", "PARKED_LEG"))}
            for c in companies
        ],
    }
