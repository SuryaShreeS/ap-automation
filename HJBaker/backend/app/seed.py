"""Seed the database with the prototype's mock-data model, verbatim.

Every value here is a 1:1 port of `AP Invoice Platform v2.dc.html`'s in-file `db`
(6 hero invoices + 32 generated fillers), line-item / receipt fixtures, users,
prepayments, credit-rebill chain, park queues, approvals, AP-review items, and
reference lists. Seeding this guarantees the API returns exactly what the
prototype rendered, so the ported UI is pixel-identical.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .logic import COMPANIES, fmt
from .models import (
    ApRule,
    Approval,
    AuditEvent,
    ChainNode,
    Company,
    Invoice,
    InvoiceLine,
    Note,
    ParkQueueItem,
    Prepayment,
    ReferenceListItem,
    Receipt,
    ReviewAction,
    RoutingRule,
    User,
    Vendor,
)

# ---------- vendor reference ----------
VENDORS = {
    "phillips": {"name": "Phillips 66", "code": "20144", "addrId": "MAIN", "loc": "HOU1", "addr": "PO Box 421959", "city": "Houston TX", "term": 30, "pay": "ACH"},
    "carmax":   {"name": "CarMax", "code": "20155", "addrId": "MAIN", "loc": "CCH1", "addr": "1802 Harbor Dr", "city": "Corpus Christi TX", "term": 30, "pay": "WIRE"},
    "deerpark": {"name": "Deer Park Refining", "code": "20301", "addrId": "MAIN", "loc": "DPK1", "addr": "5900 Hwy 225", "city": "Deer Park TX", "term": 30, "pay": "ACH"},
    "martin":   {"name": "Martin Transport", "code": "20871", "addrId": "RMT2", "loc": "CON1", "addr": "4527 N Frazier St", "city": "Conroe TX", "term": 30, "pay": "CHK"},
    "cnrail":   {"name": "CN Rail", "code": "30112", "addrId": "MAIN", "loc": "MTL1", "addr": "935 Rue de la Gauchetiere", "city": "Montreal QC", "term": 45, "pay": "WIRE"},
    "soltran":  {"name": "SolTran", "code": "20488", "addrId": "MAIN", "loc": "TPA1", "addr": "8112 Port Blvd", "city": "Tampa FL", "term": 30, "pay": "ACH"},
    # From the latest call: netback vendor (credit/rebill example) + a supplier-BP-style vendor.
    "chevron":  {"name": "Chevron Products", "code": "20950", "addrId": "R01", "loc": "HOU2", "addr": "6001 Bollinger Canyon Rd", "city": "San Ramon CA", "term": 10, "pay": "WIRE"},
    "cbre":     {"name": "CBRE Property Management", "code": "21044", "addrId": "R01", "loc": "WDL1", "addr": "1450 Lake Robbins Dr", "city": "The Woodlands TX", "term": 30, "pay": "ACH"},
    # Third netback vendor — already referenced by the LEG parking queue.
    "gulfnetback": {"name": "Gulf Netback Co", "code": "20977", "addrId": "MAIN", "loc": "LKC1", "addr": "2200 Ship Channel Rd", "city": "Lake Charles LA", "term": 15, "pay": "WIRE"},
}

DEFAULT_CONF = {"invoiceNumber": 99, "invoiceDate": 97, "terms": 96, "gross": 99, "net": 99, "vehicle": 92, "po": 94, "company": 99, "vendor": 98}

POOL = [
    ["Shell Chemical LP", "20166", "Houston TX", "405"],
    ["Koch Sulfur Products", "20180", "Wichita KS", "405"],
    ["Brenntag North America", "20422", "Reading PA", "420"],
    ["Univar Solutions", "20510", "Downers Grove IL", "415"],
    ["Savage Services", "20633", "Salt Lake City UT", "410"],
    ["Gulf Coast Marine", "20699", "Lake Charles LA", "100"],
    ["Quala Systems", "20744", "Tampa FL", "410"],
    ["Watco Terminals", "20801", "Pittsburg KS", "100"],
]
STS = ["UNPROCESSED", "AP_REVIEW", "UNPROCESSED", "DATA_REQUIRED", "AUTOMATCH", "IN_ERP", "CANCELLED", "MATCHED_PAY"]


def _base(**over) -> dict:
    """Mirror the prototype's mk() defaults."""
    d = dict(
        vendor_addr_id="MAIN", vendor_term_days=30, currency="USD",
        gst=0.0, hst=0.0, pst=0.0, usa=0.0, vat=0.0, freight=0.0,
        route_type="HIERARCHY", route_name="STD-AP", route_approver="Karl Weber",
        current_user="Ivy Chen", sales_channel="LIQUID", error_code="—",
        erp_voucher="—", payment_date="—", payment_number="—", payment_amount="—",
        validated=True, template_line="—", special_terms=False, last_by="system",
        last_msg="confirmationMatch", doc_type="standard", pages_n=1, term_days=30,
        conf=dict(DEFAULT_CONF),
    )
    d.update(over)
    return d


def _vendor_fields(v: dict) -> dict:
    return dict(
        vendor_name=v["name"], vendor_code="BP-" + v["code"], vendor_addr_id=v["addrId"],
        vendor_loc=v["loc"], vendor_address=v["addr"], vendor_city=v["city"],
        vendor_term_days=v["term"], pay_method=v["pay"],
    )


def build_invoices() -> list[dict]:
    V = VENDORS
    heroes = [
        {**_base(**_vendor_fields(V["carmax"])), **dict(
            platform_id="108803", scan_date="07/09/26", company_id="100", po="P26-1201",
            invoice_number="LL-3071", invoice_date="07/06/26", due_date="08/05/26",
            net=23914882.40, gross=23914882.40, vehicle_id="SULX 40218 +", bol="multi (1,014)",
            status="AUTOMATCH", current_user="Karl Weber", route_name="SULFUR-100",
            route_approver="Amara Gill (CFO)", doc_type="loadlist", pages_n=12,
            last_date="07/09/26 06:44", last_msg="autoMatch: 1,014/1,014 lines via ship date + BOL",
            pdf_lines=[
                ["06/02/26", "Rail SULX 40218 · Corpus Christi → Tampa", "96.42 LT", "$12,150.92"],
                ["06/02/26", "Truck BOL 771310 · Corpus Christi → Mulberry", "24.10 LT", "$3,037.24"],
                ["06/03/26", "Rail GATX 20441 · Corpus Christi → Tampa", "94.88 LT", "$11,956.87"],
                ["…", "1,011 more lines on pages 2–12", "", ""],
            ])},
        {**_base(**_vendor_fields(V["deerpark"])), **dict(
            platform_id="108781", scan_date="07/08/26", company_id="405", po="P26-1188",
            invoice_number="SUM-2044", invoice_date="07/03/26", due_date="08/02/26",
            net=412884.60, gross=412884.60, vehicle_id="—", bol="range query", status="AUTOMATCH",
            doc_type="summary", pages_n=3, last_date="07/08/26 06:44",
            last_msg="rangeQuery: 1,012 open receipts auto-selected",
            pdf_lines=[["JUNE 2026", "Monthly summary · molten sulfur shipments", "8,912 LT", "$412,884.60"]])},
        {**_base(**_vendor_fields(V["phillips"])), **dict(
            platform_id="108777", scan_date="07/08/26", company_id="405", po="P26-1162",
            invoice_number="INV-88412", invoice_date="07/02/26", due_date="08/01/26",
            net=17980.00, freight=260.00, gross=18240.00, vehicle_id="SULX 40218", bol="—",
            status="AUTOMATCH", last_date="07/08/26 09:12", last_msg="confirmationMatch: 3-way via PO",
            pdf_lines=[
                ["06/28/26", "Molten sulfur · rail SULX 40218", "96.42 LT", "$12,150.92"],
                ["06/30/26", "Molten sulfur · rail SULX 40233", "48.30 LT", "$5,829.08"],
                ["", "Freight surcharge", "", "$260.00"],
            ])},
        {**_base(**_vendor_fields(V["martin"])), **dict(
            platform_id="108764", scan_date="07/07/26", company_id="410", po="—",
            invoice_number="INV-88395", invoice_date="07/05/26", term_days=15, due_date="07/20/26",
            net=4812.50, gross=4812.50, vehicle_id="—", bol="771204", status="DATA_REQUIRED",
            route_type="ADHOC", route_name="—", route_approver="—", sales_channel="SOLIDS",
            validated=False, template_line="FREIGHT-GULF", last_by="Ivy Chen",
            last_date="07/09/26 09:12", last_msg="MANUAL_ENTRY: terms verified against PDF",
            conf={"invoiceNumber": 99, "invoiceDate": 97, "terms": 71, "gross": 99, "net": 99, "vehicle": 92, "po": 0, "company": 99, "vendor": 98},
            pdf_lines=[["07/01/26", "Freight · Beaumont → Tampa · BOL 771204", "1 load", "$4,812.50"]])},
        {**_base(**_vendor_fields(V["cnrail"])), **dict(
            platform_id="108742", scan_date="07/06/26", company_id="900", po="—",
            invoice_number="INV-88389", invoice_date="07/04/26", term_days=45, due_date="08/18/26",
            currency="CAD", net=6880.00, gst=344.00, pst=481.60, gross=7705.60,
            vehicle_id="CNRU 448122", bol="—", status="ERROR", error_code="MISSING_VENDOR",
            vendor_code="—", validated=False, current_user="Tessa Shah", last_date="07/06/26 07:44",
            last_msg="vendorResolve failed: no BP match for remit-to",
            pdf_lines=[
                ["07/02/26", "Rail freight · Sarnia ON → Montreal QC · CNRU 448122", "1 car", "$6,880.00"],
                ["", "GST 5%", "", "$344.00"],
                ["", "QST/PST", "", "$481.60"],
            ])},
        {**_base(**_vendor_fields(V["soltran"])), **dict(
            platform_id="108718", scan_date="07/05/26", company_id="405", po="—",
            invoice_number="CM-1108", invoice_date="06/30/26", due_date="—",
            net=-8414.30, gross=-8414.30, vehicle_id="—", bol="—", status="PARKED_ICEC",
            doc_type="credit", route_type="ADHOC", route_name="—", route_approver="—",
            current_user="Nita Brandon", last_date="07/05/26 11:02",
            last_msg="classified: credit memo · 3 credited invoices extracted",
            pdf_lines=[
                ["", "Credit · INV-87001 (Apr provisional)", "", "($5,210.10)"],
                ["", "Credit · INV-87142", "", "($3,204.20)"],
                ["", "Payable · re-handling fee", "", "$0.00"],
            ])},
    ]

    fillers = []
    for i in range(32):
        p = POOL[i % 8]
        amt = 900 + ((i * 7919) % 24000) + ((i * 131) % 100) / 100
        has_po = i % 3 != 1
        st = STS[i % 8]
        paid = st == "MATCHED_PAY"
        fillers.append({**_base(), **dict(
            platform_id=str(108700 - i * 3), scan_date="07/0" + str((i % 6) + 1) + "/26",
            vendor_name=p[0], vendor_code="BP-" + p[1], vendor_loc=p[1][:3],
            vendor_address=str(100 + i * 7) + " Industrial Pkwy", vendor_city=p[2],
            vendor_term_days=30, pay_method=["ACH", "CHK", "WIRE"][i % 3],
            company_id="900" if i % 5 == 4 else p[3],
            po="P26-" + str(1100 + i * 2) if has_po else "—",
            invoice_number="INV-" + str(88360 - i * 4),
            invoice_date="0" + str((i % 2) + 6) + "/2" + str(i % 8) + "/26",
            due_date="08/1" + str(i % 9) + "/26", net=amt, gross=amt,
            currency="CAD" if i % 5 == 4 else "USD",
            vehicle_id="SULX " + str(40100 + i * 13) if i % 4 == 0 else "—",
            bol=str(770900 + i * 41) if i % 4 == 2 else "—",
            status=st, sales_channel=["LIQUID", "ACID", "SOLIDS"][i % 3],
            current_user=["Ivy Chen", "Tessa Shah", "Karl Weber"][i % 3],
            # Real Sage document formats (docs/sage-integration.md): PIN######,
            # payment numbers prefixed by method (PAYAC/PAYWT/PAYCK).
            erp_voucher=f"PIN{196700 + i}" if (st == "IN_ERP" or paid) else "—",
            payment_date="07/11/26" if paid else "—",
            payment_number=(
                {"ACH": "PAYAC", "CHK": "PAYCK", "WIRE": "PAYWT"}[["ACH", "CHK", "WIRE"][i % 3]]
                + f"{23350 + i:06d}"
            ) if paid else "—",
            payment_amount=fmt(amt) if paid else "—",
            last_date="07/0" + str((i % 6) + 2) + "/26 0" + str((i % 8) + 1) + ":1" + str(i % 6),
            pdf_lines=[["07/01/26", "Materials & services", "1", "$" + f"{amt:.2f}"]],
        )})
    # Two of the paid rows were handed to Sage within the demo clock's last 24h
    # (Jul 12–13) so the "Sent · <24h" dashboard column has live signal.
    recent = ["07/13/26 07:12", "07/12/26 16:40"]
    for row in fillers:
        if row["status"] == "MATCHED_PAY" and recent:
            row["last_date"] = recent.pop(0)
    return heroes + fillers + queue_volume()


def queue_volume() -> list[dict]:
    """Working history for the Prepayments, Credits and Rebills queues — ten
    documents each, spread across the lifecycle so every sub-queue has rows.

    Each one is written so the classifier routes it by rule, not by fixture:
    prepaid vendors → Prepayments, negative totals → Credits, netback vendors
    re-invoicing at a settled price → Rebills.
    """
    V = VENDORS
    rows: list[dict] = []
    # Which operating company each vendor's documents belong to.
    VENDOR_CO = {
        "Deer Park Refining": "405", "CarMax": "100", "Phillips 66": "405",
        "Martin Transport": "410", "CN Rail": "900", "SolTran": "410",
        "Chevron Products": "405", "CBRE Property Management": "100",
        "Gulf Netback Co": "410",
    }

    def add(pid: int, vendor: dict, **over) -> None:
        d = {**_base(**_vendor_fields(vendor)), **over}
        d["platform_id"] = str(pid)
        d.setdefault("company_id", VENDOR_CO.get(vendor["name"], "100"))
        amt = d["gross"]
        st = d["status"]
        pay_method = d.get("pay_method") or vendor["pay"]
        if st in ("IN_ERP", "MATCHED_PAY", "PAID") and d.get("erp_voucher", "—") == "—":
            d["erp_voucher"] = f"PIN{197000 + pid - 109000}"
        if st in ("MATCHED_PAY", "PAID"):
            prefix = {"ACH": "PAYAC", "CHK": "PAYCK", "CHECK": "PAYCK", "WIRE": "PAYWT"}.get(pay_method, "PAYAC")
            d["payment_number"] = f"{prefix}{24000 + pid - 109000:06d}"
            d["payment_date"] = "07/11/26"
            d["payment_amount"] = fmt(amt)
        d.setdefault("net", amt)
        rows.append(d)

    # ---------- Prepayments (marked prepaid vendors) ----------
    dp, cx = V["deerpark"], V["carmax"]
    for pid, vendor, num, amt, status, line in [
        (109001, dp, "PREPAY-JUN26", 8_400_000.00, "UNPROCESSED", "Prepayment · June shipments · 2 working days from receipt"),
        (109002, dp, "PREPAY-APR26", 7_900_000.00, "PAID", "Prepayment · April shipments"),
        (109003, cx, "PREPAY-Q3-CMX", 24_000_000.00, "IN_ERP", "Prepayment · Q3 tonnage commitment"),
        (109004, dp, "SHP-4411", 318_220.40, "AUTOMATCH", "Shipment against prepayment · 12 railcars"),
        (109005, dp, "SHP-4418", 274_905.10, "IN_ERP", "Shipment against prepayment · 10 railcars"),
        (109006, dp, "SHP-4423", 402_118.75, "MATCHED_PAY", "Shipment against prepayment · 15 railcars"),
        (109007, cx, "LL-3088", 19_244_650.00, "AUTOMATCH", "Load list · shipments drawn against prepayment"),
        (109008, cx, "LL-3095", 17_880_412.30, "IN_ERP", "Load list · shipments drawn against prepayment"),
        (109009, dp, "SHP-4430", 196_540.00, "DATA_REQUIRED", "Shipment against prepayment · coding incomplete"),
        (109010, cx, "PREPAY-MAR26", 21_500_000.00, "PAID", "Prepayment · March tonnage"),
    ]:
        add(pid, vendor, invoice_number=num, gross=amt, status=status,
            scan_date="07/0" + str((pid % 6) + 1) + "/26", invoice_date="07/02/26", due_date="07/31/26",
            po="P26-" + str(1300 + pid - 109000), doc_type="summary" if "SHP" in num or "LL" in num else "standard",
            pages_n=3 if "LL" in num else 1, last_date="07/09/26 08:20",
            pdf_lines=[["JUL 2026", line, "", fmt(amt)]])

    # ---------- Credits (negative totals — never from a prepaid vendor) ----------
    for pid, vendor, num, amt, status, line, orig in [
        (109011, V["phillips"], "CM-1140", -12_410.00, "DATA_REQUIRED", "CANCELLATION INVOICE · reverses INV-88412", "PIN196733"),
        (109012, V["martin"], "CM-1152", -1_905.25, "PARKED_ICEC", "Credit memo · freight overcharge", "PIN196711"),
        (109013, V["soltran"], "CM-1163", -22_140.80, "IN_ERP", "Credit note · quality adjustment", "PIN196705"),
        (109014, V["chevron"], "CM-1171", -38_220.00, "PARKED_ICEC", "CANCELLATION INVOICE · reverses CHV-90180", "PIN196702"),
        (109015, V["phillips"], "CM-1188", -6_742.15, "UNPROCESSED", "Credit memo · short delivery", "—"),
        (109016, V["soltran"], "CM-1194", -14_880.00, "IN_ERP", "Credit note · price correction", "PIN196709"),
        (109017, V["cbre"], "CM-1201", -3_318.40, "UNPROCESSED", "Credit memo · service credit", "—"),
        (109018, V["martin"], "CM-1209", -9_455.00, "MATCHED_PAY", "CANCELLATION INVOICE · duplicate billing", "PIN196716"),
        (109019, V["cnrail"], "CM-1215", -5_120.00, "DATA_REQUIRED", "Credit note · demurrage waived", "—"),
        (109020, V["chevron"], "CM-1222", -2_640.90, "PARKED_LEG", "Credit memo · handling adjustment", "PIN196718"),
    ]:
        add(pid, vendor, invoice_number=num, gross=amt, status=status, doc_type="credit",
            scan_date="07/1" + str(pid % 4) + "/26", invoice_date="07/06/26", due_date="08/05/26",
            po="—", original_pin=orig, pages_n=1, last_date="07/10/26 11:05",
            pdf_lines=[["", line, "", fmt(amt)]])

    # ---------- Rebills (netback vendors, positive, settled price) ----------
    gn = V["gulfnetback"]
    for pid, vendor, num, amt, status, line in [
        (109021, V["chevron"], "CHV-90410R", 61_880.00, "AUTOMATCH", "Re-invoice · settled price · ref CHV-90410"),
        (109022, V["chevron"], "CHV-90422R", 44_215.50, "IN_ERP", "Re-invoice at settled price · monthly true-up"),
        (109023, V["soltran"], "STR-7712R", 58_930.00, "MATCHED_PAY", "Rebill · settled netback price"),
        (109024, V["soltran"], "STR-7720R", 31_405.25, "AUTOMATCH", "Re-invoice · monthly settlement true-up"),
        (109025, gn, "GNC-2201R", 27_118.00, "UNPROCESSED", "Rebill at settled price · quarterly settlement"),
        (109026, gn, "GNC-2214R", 19_442.60, "DATA_REQUIRED", "Re-invoice · settled price · retro three months"),
        (109027, V["chevron"], "CHV-90435R", 72_600.00, "AUTOMATCH", "Re-invoice · settled price · closed period"),
        (109028, V["soltran"], "STR-7735R", 40_110.00, "IN_ERP", "Rebill · settled price"),
        (109029, gn, "GNC-2228R", 23_875.40, "AUTOMATCH", "Re-invoice · true-up at settled price"),
        (109030, V["chevron"], "CHV-90448R", 55_340.00, "PAID", "Rebill at settled price"),
    ]:
        settled = status not in ("UNPROCESSED", "DATA_REQUIRED")
        add(pid, vendor, invoice_number=num, gross=amt, status=status,
            scan_date="07/1" + str(pid % 4) + "/26", invoice_date="07/08/26", due_date="08/07/26",
            po="P26-" + str(1400 + pid - 109000), pages_n=1, last_date="07/11/26 09:40",
            # The static field: which purchase credit memo this rebill settles.
            credit_memo_ref=f"PCM{4400 + pid - 109000:06d}" if settled else "—",
            pdf_lines=[["", line, "", fmt(amt)]])

    return rows


# ---------- line items (§5.4 grid) ----------
def line_items_for(inv: dict) -> tuple[list[list], str]:
    n = inv["invoice_number"]
    if n == "INV-88412":
        return [
            ["1", "P26-1162", "1", "96.42 LT", "Molten sulfur · rail SULX 40218", "SULF-M", "$126.02", "5010", "SUL", "LIQUID", "WPT", "OPS", "—", "$12,150.92"],
            ["2", "P26-1162", "2", "48.30 LT", "Molten sulfur · rail SULX 40233", "SULF-M", "$120.68", "5010", "SUL", "LIQUID", "WPT", "OPS", "—", "$5,829.08"],
            ["3", "—", "—", "1", "Freight surcharge", "FRT", "$260.00", "5205", "SUL", "LIQUID", "WPT", "OPS", "—", "$260.00"],
        ], ""
    if n == "INV-88395":
        return [["1", "—", "—", "1 load", "Freight · Beaumont → Tampa · BOL 771204", "FRT-LD", "$4,812.50", "5205", "LOG", "SOLIDS", "CON", "TRANS", "—", "$4,812.50"]], \
            "Non-PO — coded manually from template FREIGHT-GULF (FR-36) · account/division/site kept in sync with Sage"
    if n == "SUM-2044":
        return [["1", "P26-1188", "1", "8,912 LT", "JUNE 2026 monthly summary · molten sulfur", "SULF-M", "—", "5010", "SUL", "LIQUID", "DPK", "OPS", "—", "$412,884.60"]], \
            "Summary invoice — line detail lives on the 1,012 matched receipts (§5.5)"
    if n == "LL-3071":
        rows = []
        for i in range(22):
            rail = i % 3 != 1
            qty = 24 + ((i * 37) % 73) + 0.42
            amt = qty * 126.02
            desc = (("Rail " + ("GATX " + str(20400 + i * 7) if i % 2 else "SULX " + str(40200 + i * 9)))
                    if rail else "Truck BOL " + str(771300 + i * 11)) + " · Corpus Christi → " + ["Tampa", "Mulberry", "Beaumont"][i % 3]
            rows.append([str(i + 1), "P26-1201", str(i + 1), f"{qty:.2f} LT", desc, "SULF-M", "$126.02", "5010", "SUL", "LIQUID", "CCH", "OPS", "—", fmt(amt)])
        return rows, "Showing 22 of 1,014 extracted lines · virtualized grid, no 500-line limit (FR-26, FR-33, NFR-1)"
    if n == "INV-88389":
        return [["1", "—", "—", "1 car", "Rail freight · Sarnia ON → Montreal QC · CNRU 448122", "FRT-RL", "$6,880.00", "5205", "CAN", "LIQUID", "MTL", "TRANS", "—", "$6,880.00"]], ""
    if n == "CM-1108":
        return [
            ["1", "—", "—", "—", "Credit · INV-87001 Apr provisional netback", "CR", "—", "5010", "SUL", "LIQUID", "TPA", "OPS", "—", "($5,210.10)"],
            ["2", "—", "—", "—", "Credit · INV-87142 Apr provisional netback", "CR", "—", "5010", "SUL", "LIQUID", "TPA", "OPS", "—", "($3,204.20)"],
        ], "Credit memo — credited invoice numbers extracted for PCM creation tied to original PINs (FR-60, FR-61)"
    po = inv["po"]
    return [["1", po, "—" if po == "—" else "1", "1", "Materials & services", "GEN", fmt(inv["net"]), "5010", "GEN", inv["sales_channel"], "—", "OPS", "—", fmt(inv["net"])]], ""


# ---------- receipts (matching fixtures) ----------
def receipts_for(inv: dict) -> dict:
    n = inv["invoice_number"]
    if n in ("SUM-2044", "LL-3071"):
        is_ll = n == "LL-3071"
        total = 1014 if is_ll else 1012
        origins = ["Corpus Christi → Tampa", "Corpus Christi → Mulberry", "Deer Park → Beaumont"]
        raw = []
        for i in range(18):
            rail = i % 3 != 1
            raw.append({
                "num": "R26-00" + str(5481 + i * 7),
                "date": "06/" + f"{2 + i:02d}" + "/26",
                "bol": ("GATX " + str(20410 + i * 7) if i % 2 else "SULX " + str(40120 + i * 13)) if rail else str(771200 + i * 41),
                "desc": str(38 + (i * 7) % 22) + " LT · " + origins[i % 3],
                "amtN": 20938.03 + (i % 5) * 143.5,
            })
        sample_sum = sum(r["amtN"] for r in raw)
        scale = inv["net"] / sample_sum
        banner = ("Auto-matched: all 1,014 load-list lines matched receipt-by-receipt via ship date + BOL / vehicle ID (FR-31) — 2 price warnings"
                  if is_ll else
                  "Range query: supplier BP-20301 · ship dates 06/01/26 → 06/30/26 → 1,012 open receipts auto-selected (FR-32) · vendor receipt-number import supported (FR-34)")
        return {"raw": raw, "total": total, "scale": scale, "banner": banner, "ok": True}
    if n == "INV-88412":
        return {"raw": [
            {"num": "R26-005481", "date": "06/28/26", "bol": "SULX 40218", "desc": "96.42 LT · Deer Park → Westport", "amtN": 12150.92},
            {"num": "R26-005512", "date": "06/30/26", "bol": "SULX 40233", "desc": "48.30 LT · Deer Park → Westport", "amtN": 5829.08},
        ], "total": 2, "scale": 1.0,
            "banner": "Auto-matched 3-way via PO number on document (FR-30) · receipt level — price overrides re-evaluate inventory on posting (FR-35)", "ok": True}
    if n == "INV-88395":
        return {"raw": [], "total": 0, "scale": 1.0,
                "banner": "No PO on invoice (FR-31 fallback found no unique ship date + BOL match). Wait in queue for a late PO (FR-37) or auto-generate the PO (FR-38).", "ok": False}
    banner = ("Credit memo — no receipt match; PCM will tie to the original PIN (FR-61)"
              if inv["doc_type"] == "credit" else "No open receipts for this supplier in the ship-date window.")
    return {"raw": [], "total": 0, "scale": 1.0, "banner": banner, "ok": False}


LINE_COLS = ["line_id", "po_number", "po_line", "quantity", "description", "item_number",
             "unit_price", "account_code", "division", "sales_channel", "branch_site",
             "department", "project", "line_amount"]


def seed(db: Session) -> None:
    if db.scalar(select(Company).limit(1)) is not None:
        return  # already seeded

    for c in COMPANIES:
        db.add(Company(id=c["id"], name=c["name"]))

    for key, v in VENDORS.items():
        db.add(Vendor(name=v["name"], code="BP-" + v["code"], addr_id=v["addrId"], loc=v["loc"],
                      address=v["addr"], city=v["city"], term_days=v["term"], pay_method=v["pay"]))

    for row in build_invoices():
        rd = receipts_for(row)
        lines, foot = line_items_for(row)
        inv = Invoice(
            **row,
            match_banner=rd["banner"], match_ok=rd["ok"],
            receipt_total=rd["total"] or len(rd["raw"]), receipt_scale=rd["scale"],
            line_footnote=foot,
        )
        for seq, arr in enumerate(lines):
            inv.lines.append(InvoiceLine(seq=seq, **{col: arr[j] for j, col in enumerate(LINE_COLS)}))
        for seq, r in enumerate(rd["raw"]):
            inv.receipts.append(Receipt(seq=seq, num=r["num"], ship_date=r["date"], bol=str(r["bol"]),
                                        description=r["desc"], amount=r["amtN"]))
        # Base notes (system + INV-88395 verification note)
        inv.notes.append(Note(who="system", time=row["scan_date"] + " 06:42",
                              text="Ingested from ap@alferix.com · duplicate check passed (FR-12) · classified: " + row["doc_type"]))
        if row["invoice_number"] == "INV-88395":
            inv.notes.append(Note(who="Ivy Chen", time="07/09/26 09:12",
                                 text="Terms verified against PDF (71% confidence) — Net 15 confirmed, vendor default overridden per FR-23."))
        db.add(inv)

    _seed_workflow(db)
    _seed_admin(db)
    _seed_routing(db)
    db.flush()
    _backfill_queues(db)
    db.flush()
    _seed_history(db)
    _arrive_samples(db)
    db.commit()


def _seed_routing(db: Session) -> None:
    """Inflow routing conditions (latest call): prepaid vendors → Prepayments,
    negative/cancellation → Credits, netback re-invoices → Rebills, PO found → PO,
    fallback → Non-PO. Threshold row gates auto-routing (below → Manual Review)."""
    rules = [
        dict(priority=10, kind="vendor_prepaid", value="Deer Park Refining", queue="PREPAY",
             description="Marked prepaid vendor — anything from them is a prepayment"),
        dict(priority=11, kind="vendor_prepaid", value="CarMax", queue="PREPAY",
             description="Marked prepaid vendor — anything from them is a prepayment"),
        dict(priority=20, kind="negative_total", value="", queue="CREDIT",
             description="Negative total / 'cancellation invoice' → credit memo"),
        dict(priority=30, kind="vendor_netback", value="Chevron Products", queue="REBILL",
             description="Netback vendor — re-invoice after settlement → rebill"),
        dict(priority=31, kind="vendor_netback", value="SolTran", queue="REBILL",
             description="Netback vendor — re-invoice after settlement → rebill"),
        dict(priority=32, kind="vendor_netback", value="Gulf Netback Co", queue="REBILL",
             description="Netback vendor — re-invoice after settlement → rebill"),
        dict(priority=40, kind="has_po", value="P", queue="PO",
             description="PO number on document (prefix 'P') → PO queue"),
        dict(priority=90, kind="fallback", value="", queue="NONPO",
             description="No PO on document → Non-PO (late-PO or supplier BP invoice)"),
        dict(priority=999, kind="threshold", value="0.80", queue="",
             description="Classification-confidence threshold — below waits in Manual Review"),
    ]
    for r in rules:
        db.add(RoutingRule(**r))


def _backfill_queues(db: Session) -> None:
    """Legacy demo invoices are already extracted + processed — assign their queue
    with the same classifier the inflow uses, at full confidence."""
    from .classifier import classify  # local import avoids a cycle at module load

    for inv in db.scalars(select(Invoice)).all():
        r = classify(db, inv)
        inv.queue = r["queue"]
        inv.class_label = r["label"]
        inv.class_confidence = r["confidence"]
        inv.route_reason = r["reason"]
        inv.extracted = True
    # The seeded credit memo already carries its original-PIN linkage (chain).
    cm = db.scalar(select(Invoice).where(Invoice.invoice_number == "CM-1108"))
    if cm:
        cm.original_pin = "PIN195233"


def _seed_history(db: Session) -> None:
    """Give every already-processed document the trail it would really have:
    when it arrived, when it was classified, and each milestone its status
    implies. Timestamps are derived from the document's own scan date so the
    history reads chronologically instead of all landing at seed time."""
    from datetime import datetime, timedelta

    POST_MATCH = ("AUTOMATCH", "AP_REVIEW", "IN_ERP", "MATCHED_PAY", "PAID", "PARKED_ICEC", "PARKED_LEG")
    POST_ERP = ("IN_ERP", "MATCHED_PAY", "PAID")

    for inv in db.scalars(select(Invoice)).all():
        if db.scalar(select(AuditEvent.id).where(AuditEvent.invoice_number == inv.invoice_number)):
            continue  # arrivals already carry their own trail
        try:
            mm, dd, yy = (inv.scan_date or "07/08/26").split("/")
            base = datetime(2000 + int(yy), int(mm), int(dd), 6, 42)
        except (ValueError, AttributeError):
            base = datetime(2026, 7, 8, 6, 42)

        events: list[tuple[int, str, str, str, str]] = [
            (0, "mailbox", "inflow", "",
             f"Document received → master inflow queue ({inv.vendor_name} · {inv.invoice_number})"),
            (3, "classifier", "classified", inv.class_label or "",
             f"Classified {inv.class_label or 'document'}"
             + (f" ({inv.class_confidence:.0%})" if inv.class_confidence else "")
             + f" → {inv.queue} · {inv.route_reason or 'by rule'}"),
        ]
        if inv.extracted:
            events.append((11, "extraction", "flow_step", "extract",
                           "In-queue extraction — header fields and lines read with per-field confidence"))
        if inv.status in POST_MATCH:
            events.append((26, inv.current_user or "Ivy Chen", "flow_step",
                           "match" if inv.po != "—" else "code_or_match",
                           f"Matched against PO {inv.po}" if inv.po != "—" else "Lines coded from template"))
        if inv.status in POST_ERP or inv.status in ("PARKED_ICEC", "PARKED_LEG"):
            events.append((190, inv.route_approver or "Karl Weber", "approval_approved", "",
                           "Approved for posting to Sage"))
        if inv.erp_voucher and inv.erp_voucher != "—":
            events.append((250, "sage", "flow_step", "sage_pin",
                           f"{inv.erp_voucher} created in Sage with attachment · write-back reflected on the record"))
        if inv.payment_number and inv.payment_number != "—":
            events.append((1500, "sage", "flow_step", "paid",
                           f"Payment {inv.payment_number} confirmed by Sage on {inv.payment_date}"))

        for mins, actor, action, field, message in events:
            db.add(AuditEvent(invoice_number=inv.invoice_number, actor=actor, action=action,
                              field=field, message=message, ts=base + timedelta(minutes=mins)))


def _arrive_samples(db: Session) -> None:
    """The demo arrivals land pre-seeded: every document arrives by email and is
    auto-classified on arrival — routed above the threshold, held in Manual
    Review below it. (No simulate step; the mailbox is the platform's front door.)"""
    from .classifier import apply_classification  # local import avoids a cycle
    from .routers.inflow import SAMPLE_DOCS

    for s in SAMPLE_DOCS:
        inv = Invoice(**s, queue="MASTER", extracted=False, validated=False,
                      route_type="HIERARCHY", route_name="STD-AP", route_approver="Karl Weber",
                      current_user="Ivy Chen", sales_channel="LIQUID",
                      last_by="mailbox", last_date="07/13/26 09:41")
        inv.notes.append(Note(who="system", time="07/13/26 09:41",
                              text="Ingested from ap@alferix.com · duplicate check passed (FR-12)"))
        db.add(inv)
        db.add(AuditEvent(invoice_number=inv.invoice_number, actor="mailbox", action="inflow",
                          message=f"Document received → master inflow queue ({inv.vendor_name} · {inv.invoice_number})"))
        db.flush()
        r = apply_classification(db, inv)
        db.add(AuditEvent(invoice_number=inv.invoice_number, actor="classifier", action="classified",
                          field=r["label"], new_value=f"{r['confidence']:.0%}",
                          message=f"Classified {r['label']} ({r['confidence']:.0%}) → {r['routedTo']} · {inv.route_reason}"))


def _seed_workflow(db: Session) -> None:
    for a in [
        dict(inv="INV-88412", vendor="Phillips 66", company_id="405", amount="$18,240.00", amount_n=18240, type="PO-backed · 3-way matched", route="Ivy → Karl (you)"),
        dict(inv="SUM-2044", vendor="Deer Park Refining", company_id="405", amount="$412,884.60", amount_n=412884, type="Summary true-up · 1,012 receipts", route="Karl (you) → Amara (CFO)"),
        dict(inv="LL-3071", vendor="CarMax", company_id="100", amount="$23,914,882.40", amount_n=23914882, type="Load list · 1,014 lines · prepaid", route="Karl (you) → Amara (CFO)"),
    ]:
        db.add(Approval(**a))

    for r in [
        dict(inv="INV-88395", vendor="Martin Transport", amount="$4,812.50", rule="Terms mismatch", why="PDF terms (Net 15) differ from vendor default (Net 30). Rule: terms mismatches always stop at AP (FR-23)."),
        dict(inv="CM-1108", vendor="SolTran (multi-vendor)", amount="($8,414.30)", rule="Credit memo", why="All credit memos route to AP before PCM creation. 2 credited invoices extracted, per-vendor totals split (FR-60)."),
        dict(inv="INV-88406", vendor="Gulf Coast Marine", amount="$12,050.00", rule="Flagged vendor", why="First invoice from this vendor. Rule: first 5 invoices from any new vendor require AP review."),
    ]:
        db.add(ReviewAction(**r))

    for p in [
        dict(vendor="CarMax", period="Q3 2026", po="P26-1201", cadence="quarterly true-up", total="$72.0M", consumed="$29.6M", pct="41%", bar_color="#2E3391", pins=2, latest="PIN196744 · today", alert=None, alert_fg=None, alert_bg=None),
        dict(vendor="Deer Park Refining", period="Jul 2026", po="P26-1188", cadence="monthly true-up", total="$1,500,000", consumed="$1,381,220", pct="92%", bar_color="#E0A106", pins=4, latest="PIN196738 · yesterday", alert="⚠ 92% consumed — nearing prepaid amount (FR-52)", alert_fg="#8A6D05", alert_bg="#FDF6E3"),
        dict(vendor="Shell Chemical LP", period="Jul 2026", po="P26-1194", cadence="end of month", total="$600,000", consumed="$612,340", pct="100%", bar_color="#D8431A", pins=6, latest="PIN196741 · today", alert="⚠ Exceeded by $12,340 — review (FR-52)", alert_fg="#B23413", alert_bg="#FDEDE7"),
    ]:
        db.add(Prepayment(**p))

    chain = [
        dict(tag="Original PIN", num="PIN195233 · INV-87001", description="Provisional netback invoice · Apr 2026", amount="$54,120.00", border="#DEE2EE", bg="#fff", tag_fg="#6B7493", amt_fg="#14163C", arrow=True),
        dict(tag="Credit memo → PCM", num="PCM004410 · CM-1108", description="Credited invoice #s extracted · tied to original PIN · platform ID referenced (FR-61)", amount="($8,414.30)", border="#F7B099", bg="#FFF9F6", tag_fg="#B23413", amt_fg="#B23413", arrow=True),
        dict(tag="Rebill PIN", num="PIN196820 · INV-88422", description="Settled price · linked to both · closed period ⚠", amount="$45,705.70", border="#A8DFC7", bg="#F4FBF8", tag_fg="#177C53", amt_fg="#14163C", arrow=False),
    ]
    for seq, node in enumerate(chain):
        db.add(ChainNode(seq=seq, **node))

    park = [
        ("ICEC", "ICEC parking queue", "credit & rebill · prepayments", [
            ("INV-88101", "SolTran", "$61,220.00", "Awaiting true-up"),
            ("INV-88144", "SolTran", "$48,932.10", "Awaiting true-up"),
            ("INV-88218", "SolTran", "$57,884.75", "Awaiting true-up"),
        ]),
        ("LEG", "LEG parking queue", "credit & rebill (FR-63 parity)", [
            ("INV-88190", "Gulf Netback Co", "$22,405.88", "Awaiting true-up"),
            ("INV-88203", "Gulf Netback Co", "$19,110.42", "True-up received · clearing"),
        ]),
    ]
    for queue, title, sub, rows in park:
        for inv, vendor, amt, state in rows:
            db.add(ParkQueueItem(queue=queue, queue_title=title, queue_sub=sub, inv=inv, vendor=vendor, amt=amt, state=state))


def _seed_admin(db: Session) -> None:
    # Avatar plates carry white initials, so each clears 4.5:1 against white text;
    # `limit_fg` is body text and clears 4.5:1 on the row surface.
    users = [
        ("Sara Stone", "SS", "#2E3391", "Admin", "$0 (enforced)", "#B23413", "700", "All companies · system config · lists"),
        ("Lisa Moreau", "LM", "#3A40AB", "AP Manager", "$25,000", "#14163C", "600", "All companies · review rules + dashboards"),
        ("Karl Weber", "KW", "#198459", "Approver", "$50,000", "#14163C", "600", "100, 405, 410 · escalates to CFO"),
        ("Amara Gill", "AG", "#DA3D0E", "CFO", "Unlimited", "#14163C", "700", "Escalation endpoint · email approvals"),
        ("Nita Brandon", "NB", "#5B6788", "AP Reviewer", "—", "#5B6788", "400", "Final review · all companies · credits"),
        ("Ivy Chen", "IC", "#5B6788", "Processor / Coder", "$10,000", "#14163C", "600", "Phillips 66, Deer Park, Martin +9"),
        ("Tessa Shah", "TS", "#5B6788", "Processor / Coder", "$10,000", "#14163C", "600", "Brenntag, CN Rail, Univar +12"),
        ("Ext. Auditor", "AU", "#667497", "Auditor (read-only)", "—", "#5B6788", "400", "Read-only · full traceability chain"),
    ]
    for name, initials, av, role, limit, lfg, lw, assign in users:
        db.add(User(name=name, initials=initials, av_bg=av, role=role, limit=limit, limit_fg=lfg, limit_w=lw, assign=assign))

    # Dropdown lists (List Item Maintenance)
    dropdowns = {
        "Sales Channel": [("LIQ", "Liquid"), ("ACD", "Acid"), ("SOL", "Solids")],
        "Division": [("SUL", "Sulphur"), ("LOG", "Logistics"), ("CAN", "Canada"), ("GEN", "General")],
        "Department": [("OPS", "Operations"), ("TRANS", "Transportation"), ("FIN", "Finance")],
        "Branch Site": [("WPT", "Westport CT"), ("DPK", "Deer Park TX"), ("CCH", "Corpus Christi TX"), ("CON", "Conroe TX"), ("MTL", "Montreal QC"), ("TPA", "Tampa FL")],
        "Pay Method": [("ACH", "ACH transfer"), ("CHK", "Check"), ("WIRE", "Wire")],
        "Product Type": [("STD", "Standard"), ("FRT", "Freight"), ("CR", "Credit")],
        "Route Type": [("ADHOC", "Ad-hoc"), ("HIERARCHY", "Hierarchy"), ("STATIC", "Static (parity · unused)")],
    }
    for name, items in dropdowns.items():
        for seq, (code, label) in enumerate(items):
            db.add(ReferenceListItem(list_key="dropdown", seq=seq, code=code, label=label, payload={"list": name}))

    structured = {
        "multibol": [
            {"vendor": "CarMax", "bp": "BP-20155", "behavior": "Load-list invoices carry one BOL / vehicle ID per line — match per line (FR-26)"},
            {"vendor": "Shell Chemical LP", "bp": "BP-20166", "behavior": "Multiple truck BOLs per invoice — split matching enabled"},
            {"vendor": "Savage Services", "bp": "BP-20633", "behavior": "Multi-BOL freight consolidations"},
        ],
        "emailappr": [
            {"approver": "Karl Weber", "email": "kweber@alferix.com", "limit": "$50,000", "actions": "Enabled"},
            {"approver": "Lisa Moreau", "email": "lmoreau@alferix.com", "limit": "$25,000", "actions": "Enabled"},
            {"approver": "Amara Gill (CFO)", "email": "agrant@alferix.com", "limit": "Unlimited", "actions": "Enabled"},
        ],
        "interco": [
            {"vendor": "Alferix Logistics (interco)", "bp": "BP-90410", "handling": "Intercompany — always manual match, never auto"},
            {"vendor": "Alferix Canada (interco)", "bp": "BP-90900", "handling": "Intercompany — manual match + AP review"},
        ],
        "soldto": [
            {"sold_to": "Alferix Trading LLC", "company": "100 · Alferix Trading"},
            {"sold_to": "Alferix Sulphur LLC", "company": "405 · Alferix Sulphur"},
            {"sold_to": "Alferix Logistics LLC", "company": "410 · Alferix Logistics"},
            {"sold_to": "Alferix Sulphur Canada ULC", "company": "415 · Alferix Sulphur CAN"},
            {"sold_to": "Alferix Sulphur International", "company": "420 · Alferix Sulphur Intl"},
            {"sold_to": "Alferix Sulphur UK Ltd", "company": "435 · Alferix Sulphur UK"},
            {"sold_to": "Alferix Canada Inc", "company": "900 · Alferix Canada"},
        ],
        "routing": [
            {"vendor": "Phillips 66", "route_type": "HIERARCHY", "coder": "Ivy", "chain": "Ivy → Karl → Amara (>$50k)"},
            {"vendor": "CarMax", "route_type": "HIERARCHY", "coder": "Karl", "chain": "Karl → Amara (all true-ups >$50k)"},
            {"vendor": "Deer Park Refining", "route_type": "HIERARCHY", "coder": "Ivy", "chain": "Karl → Amara (all true-ups >$50k)"},
            {"vendor": "SolTran", "route_type": "ADHOC", "coder": "Nita", "chain": "Nita picks route · credit memos → AP always"},
            {"vendor": "Martin Transport", "route_type": "HIERARCHY", "coder": "Ivy", "chain": "Ivy → Karl"},
            {"vendor": "CN Rail", "route_type": "HIERARCHY", "coder": "Tessa", "chain": "Tessa → Karl"},
        ],
    }
    for key, rows in structured.items():
        for seq, payload in enumerate(rows):
            db.add(ReferenceListItem(list_key=key, seq=seq, payload=payload))

    for seq, (k, label, enabled) in enumerate([
        ("errors", "Any extraction or match error", True),
        ("flagged", "Flagged vendors (list of 14)", True),
        ("over25k", "Invoices over $25,000", True),
        ("newVendor", "First 5 invoices from a new vendor", False),
    ]):
        db.add(ApRule(key=k, label=label, enabled=enabled, seq=seq))
