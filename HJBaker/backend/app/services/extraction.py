"""AI extraction seam (FR-20–27, NFR-6).

A real implementation would run OCR/LLM extraction with per-field confidence and
source coordinates, then classify the document. The mock returns the already-seeded
header values + confidence for a given invoice, so downstream logic is exercised
without a model in the loop.
"""

from __future__ import annotations

from typing import Protocol


class ExtractionService(Protocol):
    def extract(self, pdf_ref: str) -> dict: ...
    def classify(self, pdf_ref: str) -> str: ...


class MockExtraction:
    def extract(self, pdf_ref: str) -> dict:
        return {
            "ok": True,
            "confidence": {},
            "message": "Extraction complete — below-threshold fields flagged for review (NFR-6)",
        }

    def classify(self, pdf_ref: str) -> str:
        # standard | loadlist | summary | credit | debit | rebill | statement
        return "standard"


def get_extraction() -> ExtractionService:
    return MockExtraction()
