"""Sage X3 integration seam (FR-82, §6.2).

Reads: vendors/BP, POs+lines, receipts, PINs, payments, last-PO-per-vendor.
Writes: PIN creation (+attachment), PCM creation, PO creation.

The mock returns deterministic data and echoes write payloads back as human
messages (parity with the prototype's alert() strings), so the UI behaves
identically until a real REST/SOAP adapter is dropped in.
"""

from __future__ import annotations

from typing import Protocol


class SageClient(Protocol):
    def get_last_po(self, vendor_code: str) -> str: ...
    def next_po_number(self, vendor_code: str) -> str: ...
    def create_pin(self, invoice_number: str, payload: dict) -> dict: ...
    def create_pcm(self, credit_memo: str, original_pin: str) -> dict: ...
    def create_po(self, vendor_code: str, number: str) -> dict: ...
    def refresh_vendor(self, vendor_code: str) -> dict: ...


class MockSageClient:
    """Deterministic in-memory stand-in for Sage X3."""

    def get_last_po(self, vendor_code: str) -> str:
        # Latest real PO in Sara's POHeader sample (docs/sage-integration.md):
        # current Sage format is P + 2-digit year + dash + 6-digit zero-padded seq.
        return "P26-005941"

    def next_po_number(self, vendor_code: str) -> str:
        # Format: P + 2-digit year + dash + zero-padded sequence (FR-38).
        # Uniqueness checked at commit.
        last = self.get_last_po(vendor_code)
        prefix, seq = last.rsplit("-", 1)
        return f"{prefix}-{int(seq) + 1:0{len(seq)}d}"

    def create_pin(self, invoice_number: str, payload: dict) -> dict:
        return {
            "ok": True,
            "pin": "PIN-queued",
            "message": (
                "PIN creation queued in Sage with attachment (FR-13) · "
                "idempotent retry on outage (NFR-7)"
            ),
        }

    def create_pcm(self, credit_memo: str, original_pin: str) -> dict:
        # Real Sage credit-memo document format: PCM + 6-digit seq (InvoiceValidation feed).
        return {
            "ok": True,
            "pcm": "PCM004410",
            "message": f"PCM created in Sage tied to {original_pin} · platform ID referenced (FR-61)",
        }

    def create_po(self, vendor_code: str, number: str) -> dict:
        return {"ok": True, "po": number, "message": f"PO {number} created via Sage API (FR-38)"}

    def refresh_vendor(self, vendor_code: str) -> dict:
        if vendor_code == "—":
            return {"ok": False, "message": "No BP match yet — search by remit-to suggested"}
        return {
            "ok": True,
            "message": f"{vendor_code} · remit-to, terms, pay method refreshed (FR-22, FR-82)",
        }


def get_sage() -> SageClient:
    return MockSageClient()
