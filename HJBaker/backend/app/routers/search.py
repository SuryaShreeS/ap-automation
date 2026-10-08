"""Advanced Search + Results (FR-74, FR-75). AND-ed criteria across four tabs
(Invoice Header / Line Items / Notes / PO Receipts), each with an operator
(=, <>, >, <, >=, <=, LIKE, BETWEEN) and % wildcards, persistent sort, page size,
and Export to Excel over the full column set.

`apply_criteria` is the single matching engine — the dashboards count through it
too, so a dashboard cell's number always equals its click-through result count.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..logic import SORT_FIELD_MAP, fmt, match_pat
from ..models import Approval, Company, Invoice, ReviewAction
from ..schemas import Criterion, SearchRequest
from ._common import invoice_dict

router = APIRouter(prefix="/search", tags=["search"])

# Invoice Header fields: key -> (invoice attribute, kind).
HEADER_FIELDS: dict[str, tuple[str, str]] = {
    "company": ("company_id", "exact"), "status": ("status", "exact"),
    "platformId": ("platform_id", "text"), "scanDate": ("scan_date", "text"),
    "vendorCode": ("vendor_code", "text"), "vendorAddrId": ("vendor_addr_id", "text"),
    "vendorLoc": ("vendor_loc", "text"), "vendorName": ("vendor_name", "text"),
    "vendorAddress": ("vendor_address", "text"), "vendorCity": ("vendor_city", "text"),
    "vendorTermDays": ("vendor_term_days", "num"), "payMethod": ("pay_method", "text"),
    "poNumber": ("po", "text"), "invoiceNumber": ("invoice_number", "text"),
    "invoiceDate": ("invoice_date", "text"), "termDays": ("term_days", "num"),
    "dueDate": ("due_date", "text"), "currency": ("currency", "text"),
    "netTotal": ("net", "num"), "gst": ("gst", "num"), "hst": ("hst", "num"),
    "pst": ("pst", "num"), "usa": ("usa", "num"), "vat": ("vat", "num"),
    "freight": ("freight", "num"), "grossTotal": ("gross", "num"),
    "vehicleId": ("vehicle_id", "text"), "bolNumber": ("bol", "text"),
    "routeType": ("route_type", "exact"), "routeName": ("route_name", "text"),
    "routeApprover": ("route_approver", "text"), "currentUser": ("current_user", "text"),
    "salesChannel": ("sales_channel", "exact"), "errorCode": ("error_code", "text"),
    "lastDate": ("last_date", "text"),
    "queueV2": ("queue", "exact"),  # inflow/processing queue (CSV IN-list supported)
}
# Related-record fields — an invoice matches if ANY of its rows match (contains/wildcard).
LINE_FIELDS = {
    "lineDescription": "description", "lineItemNumber": "item_number", "lineAccountCode": "account_code",
    "lineDivision": "division", "lineSalesChannel": "sales_channel", "lineBranchSite": "branch_site",
    "lineDepartment": "department", "lineProject": "project",
}
NOTE_FIELDS = {"noteText": "text", "noteAuthor": "who", "noteDate": "time"}
RECEIPT_FIELDS = {"receiptNumber": "num", "receiptBol": "bol", "receiptShipDate": "ship_date", "receiptProduct": "description"}

# Demo clock (matches the header: Jul 13, 2026) — "last 24h" = the 12th or 13th.
SENT24_PREFIXES = ("07/12/26", "07/13/26")
SENT_STATUSES = {"MATCHED_PAY", "PAID"}


def _num(x) -> float | None:
    try:
        return float(str(x).replace("$", "").replace(",", "").replace("(", "-").replace(")", "").strip())
    except (ValueError, TypeError):
        return None


def _match_text(av, op: str, value: str) -> bool:
    s_av = str(av)
    wild = "%" in value  # explicit wildcard → pattern match regardless of operator
    # Comma-separated values act as an IN-list for exact (non-wildcard) matching —
    # used by multi-select filters like the dashboard user drill-down.
    if not wild and "," in value:
        wanted = {p.strip().lower() for p in value.split(",") if p.strip()}
        return (s_av.lower() not in wanted) if op == "<>" else (s_av.lower() in wanted)
    if op == "<>":
        return (not match_pat(av, value)) if wild else s_av.lower() != value.lower()
    if op in (">", "<", ">=", "<="):
        a, b = s_av.lower(), value.lower()
        return {">" : a > b, "<": a < b, ">=": a >= b, "<=": a <= b}[op]
    if op == "LIKE":  # contains (or wildcard pattern if % present)
        return match_pat(av, value) if wild else value.lower() in s_av.lower()
    # "=" (and fallback): EXACT match — use LIKE or %…% for partial matches.
    return match_pat(av, value) if wild else s_av.lower() == value.lower()


def _match_num(av, op: str, value: str) -> bool:
    avn = _num(av)
    if avn is None:
        return False
    if op == "BETWEEN":
        nums = [n for n in (_num(p) for p in re.split(r"\s*(?:,|\.\.|to)\s*", value)) if n is not None]
        if len(nums) >= 2:
            return min(nums[0], nums[1]) <= avn <= max(nums[0], nums[1])
        return avn >= nums[0] if nums else True
    cvn = _num(value)
    if cvn is None:
        return True
    return {">" : avn > cvn, "<": avn < cvn, ">=": avn >= cvn, "<=": avn <= cvn,
            "<>": avn != cvn, "=": avn == cvn}.get(op, avn == cvn)


def _match_related(rows, attr: str, op: str, value: str) -> bool:
    return any(_match_text(getattr(r, attr), op, value) for r in rows)


def _matches(inv: Invoice, field: str, op: str, value: str, ctx: dict) -> bool:
    # Virtual workflow fields (dashboard columns that aren't a plain invoice attribute).
    if field == "awaitingApproval":
        hit = inv.invoice_number in ctx.get("pendingApprovals", set())
        return (not hit) if op == "<>" else hit
    if field == "awaitingApReview":
        hit = inv.invoice_number in ctx.get("pendingReviews", set())
        return (not hit) if op == "<>" else hit
    if field == "sentLast24":
        hit = inv.status in SENT_STATUSES and str(inv.last_date).startswith(SENT24_PREFIXES)
        return (not hit) if op == "<>" else hit
    if field in HEADER_FIELDS:
        attr, kind = HEADER_FIELDS[field]
        av = getattr(inv, attr)
        if kind == "exact":
            wanted = {p.strip() for p in str(value).split(",") if p.strip()}
            return (str(av) not in wanted) if op == "<>" else (str(av) in wanted)
        return _match_num(av, op, value) if kind == "num" else _match_text(av, op, value)
    if field in LINE_FIELDS:
        return _match_related(inv.lines, LINE_FIELDS[field], op, value)
    if field in NOTE_FIELDS:
        return _match_related(inv.notes, NOTE_FIELDS[field], op, value)
    if field in RECEIPT_FIELDS:
        return _match_related(inv.receipts, RECEIPT_FIELDS[field], op, value)
    return True  # unknown field → ignore


def build_ctx(db: Session) -> dict:
    """Context for virtual fields (pending approval / AP-review membership)."""
    pending = db.scalars(select(Approval.inv).where(Approval.state.is_(None))).all()
    reviews = db.scalars(select(ReviewAction.inv).where(ReviewAction.state.is_(None))).all()
    return {"pendingApprovals": set(pending), "pendingReviews": set(reviews)}


def apply_criteria(invoices: list[Invoice], criteria: list[Criterion], ctx: dict) -> list[Invoice]:
    rows = list(invoices)
    for c in criteria:
        v = (c.value or "").strip()
        if not v or v == "all":
            continue
        rows = [r for r in rows if _matches(r, c.field, c.op or "=", v, ctx)]
    return rows


def _apply(req: SearchRequest, invoices: list[Invoice], ctx: dict) -> list[Invoice]:
    rows = apply_criteria(invoices, req.criteria, ctx)
    attr = SORT_FIELD_MAP.get(req.sortField, "platform_id")
    rows.sort(key=lambda r: getattr(r, attr), reverse=req.sortDir != "asc")
    return rows


def all_invoices(db: Session) -> list[Invoice]:
    return db.scalars(
        select(Invoice).options(
            selectinload(Invoice.lines), selectinload(Invoice.notes), selectinload(Invoice.receipts)
        )
    ).all()


@router.post("")
def run_search(req: SearchRequest, db: Session = Depends(get_db)) -> dict:
    rows = _apply(req, all_invoices(db), build_ctx(db))
    shown = rows[: req.pageSize]
    companies = {c.id: c.name for c in db.scalars(select(Company)).all()}
    return {
        "count": len(rows),
        "rows": [{**invoice_dict(r), "coName": companies.get(r.company_id, "")} for r in shown],
    }


EXPORT_COLUMNS = [
    ("Platform ID", "platformId"), ("Scan Date", "scanDate"), ("Company", "co"),
    ("Vendor Code", "vendorCode"), ("Addr ID", "vendorAddrId"), ("Loc Code", "vendorLoc"),
    ("Vendor Name", "vendorName"), ("Vendor Address", "vendorAddress"), ("Vendor City", "vendorCity"),
    ("Term Days", "vendorTermDays"), ("Pay Method", "payMethod"), ("PO Number", "po"),
    ("Invoice Number", "invoiceNumber"), ("Invoice Date", "invoiceDate"), ("Inv Terms", "termDays"),
    ("Due Date", "dueDate"), ("Curr", "currency"), ("Net Total", "net"), ("GST", "gst"),
    ("HST", "hst"), ("PST", "pst"), ("USA Tax", "usa"), ("VAT", "vat"), ("Freight", "freight"),
    ("Gross Total", "gross"), ("Vehicle ID", "vehicleId"), ("BOL Number", "bol"),
    ("Route Type", "routeType"), ("Route Name", "routeName"), ("Route Approver", "routeApprover"),
    ("Current User", "currentUser"), ("Status", "status"), ("Sales Channel", "salesChannel"),
]
MONEY_KEYS = {"net", "gst", "hst", "pst", "usa", "vat", "freight", "gross"}


@router.post("/export")
def export_excel(req: SearchRequest, db: Session = Depends(get_db)) -> Response:
    from openpyxl import Workbook

    rows = _apply(req, all_invoices(db), build_ctx(db))
    wb = Workbook()
    ws = wb.active
    ws.title = "Search Results"
    ws.append([label for label, _ in EXPORT_COLUMNS])
    for r in rows:
        d = invoice_dict(r)
        ws.append([fmt(d[key]) if key in MONEY_KEYS else d[key] for _, key in EXPORT_COLUMNS])
    buf = __import__("io").BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="search-results.xlsx"'},
    )
