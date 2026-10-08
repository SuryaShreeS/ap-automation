"""Document Inflow — the classifier. Every document arrives by email into the
master queue, is auto-classified against the routing rules on arrival, and either
routes to its processing queue or (below the confidence threshold) waits in
Manual Review. The Incoming view is the full intake log; each row opens the
original email the document arrived on."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..classifier import QUEUES, apply_classification, get_threshold
from ..db import get_db
from ..logic import fmt
from ..models import AuditEvent, Invoice
from ._common import current_user, invoice_dict

router = APIRouter(prefix="/inflow", tags=["inflow"])

# Demo arrivals, seeded as already-arrived + auto-classified. Full fields exist but
# `extracted=False` — the engine's in-queue Extract step "reveals" them.
SAMPLE_DOCS: list[dict] = [
    dict(platform_id="108901", scan_date="07/13/26", company_id="405", status="UNPROCESSED",
         vendor_name="Phillips 66", vendor_code="BP-20144", vendor_loc="HOU1",
         vendor_address="PO Box 421959", vendor_city="Houston TX", vendor_term_days=30, pay_method="ACH",
         po="P26-005944", invoice_number="INV-90101", invoice_date="07/10/26", term_days=30,
         due_date="08/09/26", net=12410.00, gross=12410.00, vehicle_id="SULX 40261", bol="—",
         doc_type="standard", pages_n=2, conf={"invoiceNumber": 98, "gross": 99, "po": 97},
         pdf_lines=[["07/08/26", "Molten sulfur · rail SULX 40261", "98.20 LT", "$12,410.00"]],
         last_msg="Arrived via ap@alferix.com"),
    dict(platform_id="108902", scan_date="07/13/26", company_id="100", status="UNPROCESSED",
         vendor_name="CBRE Property Management", vendor_code="BP-21044", vendor_loc="WDL1",
         vendor_address="1450 Lake Robbins Dr", vendor_city="The Woodlands TX", vendor_term_days=30, pay_method="ACH",
         po="—", invoice_number="RENT-0726", invoice_date="07/01/26", term_days=30,
         due_date="07/31/26", net=18500.00, gross=18500.00,
         doc_type="standard", pages_n=1, conf={"invoiceNumber": 97, "gross": 99},
         pdf_lines=[["07/26", "Office rent · corporate HQ · Suite 550", "1", "$18,500.00"]],
         last_msg="Arrived via ap@alferix.com · supplier BP invoice (rent — never has a PO)"),
    dict(platform_id="108903", scan_date="07/13/26", company_id="405", status="UNPROCESSED",
         vendor_name="Deer Park Refining", vendor_code="BP-20301", vendor_loc="DPK1",
         vendor_address="5900 Hwy 225", vendor_city="Deer Park TX", vendor_term_days=2, pay_method="WIRE",
         po="—", invoice_number="PREPAY-MAY26", invoice_date="07/11/26", term_days=2,
         due_date="07/13/26", net=9000000.00, gross=9000000.00,
         doc_type="standard", pages_n=1, conf={"invoiceNumber": 96, "gross": 99},
         pdf_lines=[["MAY 2026", "Prepayment · May shipments · 2 working days from invoice receipt", "", "$9,000,000.00"]],
         last_msg="Arrived via ap@alferix.com · bulk prepayment (prepaid vendor)"),
    dict(platform_id="108904", scan_date="07/13/26", company_id="405", status="UNPROCESSED",
         vendor_name="Chevron Products", vendor_code="BP-20950", vendor_loc="HOU2",
         vendor_address="6001 Bollinger Canyon Rd", vendor_city="San Ramon CA", vendor_term_days=10, pay_method="WIRE",
         po="—", invoice_number="CHV-90332C", invoice_date="07/13/26", term_days=10,
         due_date="07/23/26", net=-54606.00, gross=-54606.00, vehicle_id="CVDX 582105", bol="—",
         doc_type="credit", pages_n=1, conf={"invoiceNumber": 97, "gross": 98},
         pdf_lines=[["", "CANCELLATION INVOICE · reverses CHV-90332 (provisional price)", "", "($54,606.00)"]],
         last_msg="Arrived via ap@alferix.com · cancellation invoice — netback settlement"),
    dict(platform_id="108905", scan_date="07/13/26", company_id="405", status="UNPROCESSED",
         vendor_name="Chevron Products", vendor_code="BP-20950", vendor_loc="HOU2",
         vendor_address="6001 Bollinger Canyon Rd", vendor_city="San Ramon CA", vendor_term_days=10, pay_method="WIRE",
         po="P26-005812", invoice_number="CHV-90332R", invoice_date="07/13/26", term_days=10,
         due_date="07/23/26", net=58975.00, gross=58975.00, vehicle_id="CVDX 582105", bol="—",
         doc_type="standard", pages_n=1, conf={"invoiceNumber": 97, "gross": 98, "po": 95},
         pdf_lines=[["", "Re-invoice · settled price · ref CHV-90332 / credit CHV-90332C", "", "$58,975.00"]],
         last_msg="Arrived via ap@alferix.com · rebill at settled price (netback true-up)"),
    dict(platform_id="108906", scan_date="07/13/26", company_id="100", status="UNPROCESSED",
         vendor_name="Gu1f C0ast Mar1ne", vendor_code="—", vendor_loc="—",
         vendor_address="(illegible)", vendor_city="(illegible)", vendor_term_days=30, pay_method="ACH",
         po="—", invoice_number="1NV-90218", invoice_date="07/12/26", term_days=30,
         due_date="08/11/26", net=7340.00, gross=7340.00,
         doc_type="standard", pages_n=1, conf={"invoiceNumber": 61, "gross": 74},
         pdf_lines=[["07/12/26", "(low-quality scan — OCR degraded)", "1", "$7,340.00"]],
         last_msg="Arrived via ap@alferix.com · low-quality scan"),
    # Below-threshold arrivals for the Manual Review tab.
    dict(platform_id="108907", scan_date="07/13/26", company_id="405", status="UNPROCESSED",
         vendor_name="Gulf States Chemical Co", vendor_code="—", vendor_loc="—",
         vendor_address="211 Industrial Pkwy", vendor_city="Beaumont TX", vendor_term_days=30, pay_method="ACH",
         po="P26-005871", invoice_number="STMT-2207", invoice_date="07/09/26", term_days=30,
         due_date="08/08/26", net=7420.00, gross=7420.00,
         doc_type="standard", pages_n=3, conf={"invoiceNumber": 88, "gross": 91, "po": 84},
         pdf_lines=[["07/09/26", "Statement of account — 3 open items (statement vs invoice ambiguity)", "", "$7,420.00"]],
         last_msg="Arrived via ap@alferix.com · statement-style document"),
    dict(platform_id="108908", scan_date="07/13/26", company_id="100", status="UNPROCESSED",
         vendor_name="Cedar Farm Supply Ltd", vendor_code="—", vendor_loc="—",
         vendor_address="RR 4 Box 118", vendor_city="Lufkin TX", vendor_term_days=30, pay_method="CHECK",
         po="—", invoice_number="FAX-1192", invoice_date="07/08/26", term_days=30,
         due_date="08/07/26", net=1180.50, gross=1180.50,
         doc_type="standard", pages_n=1, conf={"invoiceNumber": 66, "gross": 79},
         pdf_lines=[["07/08/26", "Handwritten ticket via fax gateway — vendor name unclear", "1", "$1,180.50"]],
         last_msg="Arrived via fax gateway → ap@alferix.com · handwritten ticket"),
    dict(platform_id="108909", scan_date="07/13/26", company_id="410", status="UNPROCESSED",
         vendor_name="Aurora Terminals Ltd", vendor_code="—", vendor_loc="—",
         vendor_address="Dock Road 7", vendor_city="Corpus Christi TX", vendor_term_days=30, pay_method="ACH",
         po="—", invoice_number="PF-4471", invoice_date="07/10/26", term_days=30,
         due_date="08/09/26", net=6240.00, gross=6240.00,
         doc_type="standard", pages_n=2, conf={"invoiceNumber": 72, "gross": 84},
         pdf_lines=[["07/10/26", "PRO FORMA INVOICE — terminal handling, not yet a tax invoice", "1", "$6,240.00"]],
         last_msg="Arrived via ap@alferix.com · pro-forma document"),
    dict(platform_id="108910", scan_date="07/13/26", company_id="405", status="UNPROCESSED",
         vendor_name="Delta Rail Serv1ces", vendor_code="—", vendor_loc="—",
         vendor_address="(illegible)", vendor_city="Houston TX", vendor_term_days=30, pay_method="ACH",
         po="P26-005903", invoice_number="SCAN-0098", invoice_date="07/09/26", term_days=30,
         due_date="08/08/26", net=18900.00, gross=18900.00, vehicle_id="DRSX 11204", bol="—",
         doc_type="standard", pages_n=4, conf={"invoiceNumber": 64, "gross": 77, "po": 71},
         pdf_lines=[["07/09/26", "Railcar switching and demurrage — photocopy of a photocopy", "", "$18,900.00"]],
         last_msg="Arrived via ap@alferix.com · low-contrast photocopy"),
    dict(platform_id="108911", scan_date="07/13/26", company_id="410", status="UNPROCESSED",
         vendor_name="Portside Bulk Handling", vendor_code="—", vendor_loc="—",
         vendor_address="Berth 14", vendor_city="Tampa FL", vendor_term_days=30, pay_method="ACH",
         po="—", invoice_number="CN-77120", invoice_date="07/11/26", term_days=30,
         due_date="08/10/26", net=-3410.00, gross=-3410.00,
         doc_type="credit", pages_n=1, conf={"invoiceNumber": 69, "gross": 81},
         pdf_lines=[["", "CREDIT NOTE — overbilled tonnage, reference not printed", "", "($3,410.00)"]],
         last_msg="Arrived via ap@alferix.com · credit note without a reference"),
    dict(platform_id="108912", scan_date="07/13/26", company_id="100", status="UNPROCESSED",
         vendor_name="Lone Star Power Co-op", vendor_code="—", vendor_loc="—",
         vendor_address="PO Box 9912", vendor_city="Austin TX", vendor_term_days=21, pay_method="ACH",
         po="—", invoice_number="UTIL-8823", invoice_date="07/07/26", term_days=21,
         due_date="07/28/26", net=2145.60, gross=2145.60,
         doc_type="standard", pages_n=3, conf={"invoiceNumber": 74, "gross": 88},
         pdf_lines=[["JUN 2026", "Electricity supply — plant meter 44-118", "182,400 kWh", "$2,145.60"]],
         last_msg="Arrived via ap@alferix.com · utility statement"),
    dict(platform_id="108913", scan_date="07/13/26", company_id="410", status="UNPROCESSED",
         vendor_name="R and L Haulage", vendor_code="—", vendor_loc="—",
         vendor_address="(handwritten)", vendor_city="Beaumont TX", vendor_term_days=30, pay_method="CHECK",
         po="—", invoice_number="TKT-5590", invoice_date="07/12/26", term_days=30,
         due_date="08/11/26", net=860.00, gross=860.00, vehicle_id="—", bol="88214",
         doc_type="standard", pages_n=1, conf={"invoiceNumber": 58, "gross": 71},
         pdf_lines=[["07/12/26", "Weighbridge ticket — handwritten, BOL 88214", "1 load", "$860.00"]],
         last_msg="Arrived via fax gateway → ap@alferix.com · weighbridge ticket"),
]

# Tailored source emails for the demo arrivals; everything else gets a standard
# vendor-submission email synthesized from the record.
SAMPLE_EMAILS: dict[str, dict] = {
    "INV-90101": dict(
        sender="ar.remittance@p66.com",
        subject="Phillips 66 — Invoice INV-90101 · PO P26-005944 · $12,410.00",
        body=["Please find attached invoice INV-90101 covering the molten sulfur railcar SULX 40261 shipped 07/08/26 against purchase order P26-005944.",
              "Terms are Net 30 from invoice date. Remit via ACH per the banking details on file."]),
    "RENT-0726": dict(
        sender="ap.billing@cbre.com",
        subject="CBRE — July 2026 office rent · Suite 550 · $18,500.00",
        body=["Attached is the July 2026 rent invoice for the corporate HQ premises, Suite 550, per the lease agreement dated 03/01/24.",
              "As usual there is no purchase order for this recurring charge. Please remit by 07/31/26."]),
    "PREPAY-MAY26": dict(
        sender="treasury@deerparkrefining.com",
        subject="Deer Park Refining — May 2026 shipments prepayment · $9,000,000.00 · due in 2 working days",
        body=["Per the supply agreement, attached is the prepayment invoice for May 2026 shipments totaling $9,000,000.00.",
              "Payment is due by wire within 2 working days of invoice receipt. Shipment invoices for the period will draw against this prepayment."]),
    "CHV-90332C": dict(
        sender="netback.settlements@chevron.com",
        subject="Chevron — CANCELLATION INVOICE CHV-90332C (reverses CHV-90332)",
        body=["Attached is cancellation invoice CHV-90332C reversing provisional invoice CHV-90332 in full (($54,606.00)) as part of the June netback settlement.",
              "The re-invoice at the settled price follows under separate cover. Please reference the original payment document in your records."]),
    "CHV-90332R": dict(
        sender="netback.settlements@chevron.com",
        subject="Chevron — Re-invoice CHV-90332R at settled price · $58,975.00",
        body=["Attached is re-invoice CHV-90332R issued at the settled June netback price ($58,975.00), replacing provisional invoice CHV-90332 (see cancellation CHV-90332C).",
              "Purchase order P26-005812 applies. Terms Net 10 by wire."]),
    "1NV-90218": dict(
        sender="no-reply@fax-gateway.alferix.com",
        subject="FW: lnvoice 1NV-90218 — Gu1f C0ast Mar1ne (scan attached)",
        body=["Automated forward from the fax gateway. Original fax received 07/12/26 21:47; scan quality LOW (2 retries).",
              "OCR extracted vendor and invoice number with degraded confidence — original transmission attached for reference."]),
    "STMT-2207": dict(
        sender="accounts@gulfstateschem.com",
        subject="Gulf States Chemical — Statement of account · July · 3 open items",
        body=["Please see the attached statement of account showing 3 open items totaling $7,420.00, including item ref P26-005871.",
              "Kindly confirm whether individual invoices are required or if this statement can be processed for payment."]),
    "FAX-1192": dict(
        sender="no-reply@fax-gateway.alferix.com",
        subject="FW: Fax from +1 (936) 555-0114 — handwritten delivery ticket",
        body=["Automated forward from the fax gateway. Single-page handwritten delivery ticket / invoice, sender identified verbally as a farm-supply vendor.",
              "Vendor name and terms are unclear on the scan — original transmission attached."]),
    "PF-4471": dict(
        sender="billing@auroraterminals.com",
        subject="Aurora Terminals — Pro forma PF-4471 · terminal handling · $6,240.00",
        body=["Attached is our pro forma for July terminal handling. Please confirm the tonnage before we raise the tax invoice.",
              "No payment is due against this document."]),
    "SCAN-0098": dict(
        sender="ar@deltarailservices.com",
        subject="Invoice SCAN-0098 · switching and demurrage · PO P26-005903",
        body=["Please find our invoice for railcar switching and demurrage covering the first week of July, against purchase order P26-005903.",
              "Note: our scanner is being serviced, so the attachment is a photocopy. A clean original can follow on request."]),
    "CN-77120": dict(
        sender="accounts@portsidebulk.com",
        subject="Credit note CN-77120 — overbilled tonnage",
        body=["We have identified an overbilling on tonnage handled in June and issue this credit note for ($3,410.00).",
              "Our system did not print the original invoice reference on the document; please apply it against the June handling charges."]),
    "UTIL-8823": dict(
        sender="ebilling@lonestarpowercoop.com",
        subject="Lone Star Power — statement for meter 44-118 · June 2026",
        body=["Your electricity statement for June 2026 is attached, covering 182,400 kWh at plant meter 44-118.",
              "Payment is due within 21 days. This account is not on a purchase order."]),
    "TKT-5590": dict(
        sender="no-reply@fax-gateway.alferix.com",
        subject="FW: Fax from +1 (409) 555-0188 — weighbridge ticket",
        body=["Automated forward from the fax gateway. Single handwritten weighbridge ticket referencing BOL 88214.",
              "Carrier name is written by hand and could not be read reliably."]),
}


class RouteBody(BaseModel):
    queue: str


def _doc_row(inv: Invoice) -> dict:
    return {
        **invoice_dict(inv),
        "queue": inv.queue,
        "classLabel": inv.class_label,
        "classConfidence": inv.class_confidence,
        "routeReason": inv.route_reason,
        "extracted": inv.extracted,
    }


@router.get("")
def get_inflow(db: Session = Depends(get_db)) -> dict:
    """The full intake log (every document that arrived) + the manual-review hold."""
    docs = db.scalars(select(Invoice).order_by(Invoice.platform_id.desc())).all()
    review = [i for i in docs if i.queue == "MANUAL_REVIEW"]
    routed = [i for i in docs if i.queue in QUEUES]
    return {
        "threshold": get_threshold(db),
        "incoming": [_doc_row(i) for i in docs],
        "review": [_doc_row(i) for i in review],
        "counts": {"incoming": len(docs), "review": len(review), "routed": len(routed)},
    }


@router.get("/email/{invoice_number}")
def original_email(invoice_number: str, db: Session = Depends(get_db)) -> dict:
    """The original email a document arrived on (source of record for intake)."""
    inv = db.scalar(select(Invoice).where(Invoice.invoice_number == invoice_number))
    if inv is None:
        raise HTTPException(status_code=404, detail="Document not found")
    custom = SAMPLE_EMAILS.get(inv.invoice_number, {})
    domain = re.sub(r"[^a-z0-9]", "", (inv.vendor_name or "vendor").split()[0].lower()) or "vendor"
    first = (inv.vendor_name or "vendor").split()[0].lower()
    attachment = f"{inv.invoice_number.lower().replace('-', '_')}_{re.sub(r'[^a-z0-9]', '', first)}.pdf"
    pages = inv.pages_n or 1
    return {
        "from": custom.get("sender", f"accounts.receivable@{domain}.com"),
        "to": "ap@alferix.com",
        "received": f"{inv.scan_date} 06:42 ET",
        "subject": custom.get("subject", f"{inv.vendor_name} — Invoice {inv.invoice_number} · {fmt(inv.gross)}"),
        "body": custom.get("body", [
            f"Please find attached invoice {inv.invoice_number} for {fmt(inv.gross)}, due {inv.due_date}.",
            f"Terms are Net {inv.term_days}. Please remit per the banking details on file and reference the invoice number with payment.",
        ]),
        "attachment": {"name": attachment, "pages": pages, "size": f"{180 + pages * 120} KB"},
    }


@router.post("/classify/{invoice_number}")
def classify_one(invoice_number: str, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    inv = db.scalar(select(Invoice).where(Invoice.invoice_number == invoice_number))
    if inv is None:
        raise HTTPException(status_code=404, detail="Document not found")
    r = apply_classification(db, inv)
    db.add(AuditEvent(invoice_number=invoice_number, actor="classifier", action="classified",
                      field=r["label"], new_value=f"{r['confidence']:.0%}",
                      message=f"Classified {r['label']} ({r['confidence']:.0%}) → {r['routedTo']} · {inv.route_reason}"))
    db.commit()
    return {"ok": True, "result": r, **get_inflow(db)}


@router.post("/route/{invoice_number}")
def manual_route(invoice_number: str, body: RouteBody, db: Session = Depends(get_db),
                 user: str = Depends(current_user)) -> dict:
    if body.queue not in QUEUES:
        raise HTTPException(status_code=400, detail=f"Unknown queue {body.queue}")
    inv = db.scalar(select(Invoice).where(Invoice.invoice_number == invoice_number))
    if inv is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if inv.queue not in ("MASTER", "MANUAL_REVIEW"):
        raise HTTPException(status_code=409, detail=f"Document already routed to {inv.queue}")
    inv.queue = body.queue
    inv.route_reason = f"Routed manually by {user} (classification below threshold)"
    db.add(AuditEvent(invoice_number=invoice_number, actor=user, action="manual_route",
                      new_value=body.queue, message=f"Manually routed to {body.queue} from Manual Review"))
    db.commit()
    return {"ok": True, "message": f"{invoice_number} routed to {body.queue}.", **get_inflow(db)}
