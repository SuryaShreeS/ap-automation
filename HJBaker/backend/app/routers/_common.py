"""Shared router helpers: the invoice serializer (DB row -> camelCase the frontend
expects) and the current-user dependency."""

from __future__ import annotations

from fastapi import Header

from ..models import Invoice


def invoice_dict(inv: Invoice, po_override: str | None = None) -> dict:
    return {
        "id": inv.id,
        "platformId": inv.platform_id,
        "scanDate": inv.scan_date,
        "co": inv.company_id,
        "status": inv.status,
        "errorCode": inv.error_code,
        "validated": inv.validated,
        "vendorName": inv.vendor_name,
        "vendorCode": inv.vendor_code,
        "vendorAddrId": inv.vendor_addr_id,
        "vendorLoc": inv.vendor_loc,
        "vendorAddress": inv.vendor_address,
        "vendorCity": inv.vendor_city,
        "vendorTermDays": inv.vendor_term_days,
        "payMethod": inv.pay_method,
        "po": po_override if po_override is not None else inv.po,
        "invoiceNumber": inv.invoice_number,
        "invoiceDate": inv.invoice_date,
        "termDays": inv.term_days,
        "dueDate": inv.due_date,
        "currency": inv.currency,
        "specialTerms": inv.special_terms,
        "templateLine": inv.template_line,
        "net": inv.net,
        "gst": inv.gst,
        "hst": inv.hst,
        "pst": inv.pst,
        "usa": inv.usa,
        "vat": inv.vat,
        "freight": inv.freight,
        "gross": inv.gross,
        "vehicleId": inv.vehicle_id,
        "bol": inv.bol,
        "routeType": inv.route_type,
        "routeName": inv.route_name,
        "routeApprover": inv.route_approver,
        "currentUser": inv.current_user,
        "salesChannel": inv.sales_channel,
        "erpVoucher": inv.erp_voucher,
        "originalPin": inv.original_pin,
        "creditMemoRef": inv.credit_memo_ref,
        "paymentDate": inv.payment_date,
        "paymentNumber": inv.payment_number,
        "paymentAmount": inv.payment_amount,
        "lastBy": inv.last_by,
        "lastDate": inv.last_date,
        "lastMsg": inv.last_msg,
        "docType": inv.doc_type,
        "pagesN": inv.pages_n,
        "conf": inv.conf,
        "pdfLines": inv.pdf_lines,
    }


def current_user(x_user: str = Header(default="Ivy Chen")) -> str:
    """MVP current-user: read from an X-User header (a real deploy uses SSO/JWT).
    Server-side role checks and segregation-of-duties build on this value."""
    return x_user
