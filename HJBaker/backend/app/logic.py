"""Business logic — ported from the prototype, server-side where it belongs.

Pure functions (no DB, no framework) so they are trivially unit-testable and shared
between routers and the seed script.
"""

from __future__ import annotations

# The seven operating companies (§1.4). Order matters for dashboard rows.
COMPANIES: list[dict] = [
    {"id": "100", "name": "Alferix Trading"},
    {"id": "405", "name": "Alferix Sulphur"},
    {"id": "410", "name": "Alferix Logistics"},
    {"id": "415", "name": "Alferix Sulphur CAN"},
    {"id": "420", "name": "Alferix Sulphur Intl"},
    {"id": "435", "name": "Alferix Sulphur UK"},
    {"id": "900", "name": "Alferix Canada"},
]

# Status vocabulary (keys only; colours live on the frontend).
STATUS_KEYS = [
    "UNPROCESSED", "DATA_REQUIRED", "AUTOMATCH", "AP_REVIEW", "IN_ERP",
    "MATCHED_PAY", "ERROR", "PARKED_ICEC", "PARKED_LEG", "CANCELLED", "PAID",
]


def fmt(n: float) -> str:
    """Currency formatting matching the prototype's fmt(): $1,234.56 / ($1,234.56)."""
    neg = n < 0
    s = "$" + f"{abs(n):,.2f}"
    return f"({s})" if neg else s


def match_pat(val, pat: str) -> bool:
    """% wildcard matching (FR-74): text% begins-with, %text ends-with, %text% contains."""
    if not pat or not pat.strip():
        return True
    v = str(val).lower()
    p = pat.strip().lower()
    starts = p.startswith("%")
    ends = p.endswith("%")
    core = p.replace("%", "")
    if starts and ends:
        return core in v
    if ends:
        return v.startswith(core)
    if starts:
        return v.endswith(core)
    return v == core or core in v


def totals_reconcile(inv) -> tuple[bool, float]:
    """net + taxes + freight must equal gross (§5.4). Returns (ok, variance)."""
    summed = inv.net + inv.gst + inv.hst + inv.pst + inv.usa + inv.vat + inv.freight
    return abs(summed - inv.gross) < 0.01, round(inv.gross - summed, 2)


def matching_variance(net: float, receipts: list, scale: float, deselected: set[int]) -> dict:
    """Selected-receipt sum vs invoice net, with variance (FR-32, FR-35)."""
    sel_sum = sum(r.amount for i, r in enumerate(receipts) if i not in deselected) * scale
    variance = (sel_sum - net) if receipts else -net
    return {
        "invoice_net": net,
        "selected_sum": round(sel_sum, 2),
        "variance": round(variance, 2),
        "variance_ok": abs(variance) < 1,
    }


def next_po_number(last_po: str) -> str:
    """P + 2-digit year + dash + zero-padded sequence (FR-38), e.g. P26-005941 → P26-005942."""
    prefix, seq = last_po.rsplit("-", 1)
    return f"{prefix}-{int(seq) + 1:0{len(seq)}d}"


# Field → invoice attribute mapping for Advanced Search header criteria.
SEARCH_FIELD_MAP = {
    "company": "company_id",
    "status": "status",
    "vendorName": "vendor_name",
    "invoiceNumber": "invoice_number",
    "poNumber": "po",
    "platformId": "platform_id",
    "vendorCode": "vendor_code",
    "vendorCity": "vendor_city",
    "vendorAddress": "vendor_address",
}

# Sort field → invoice attribute.
SORT_FIELD_MAP = {
    "platformId": "platform_id",
    "scanDate": "scan_date",
    "vendorName": "vendor_name",
    "invoiceNumber": "invoice_number",
    "gross": "gross",
    "status": "status",
}
