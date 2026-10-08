"""AP mailbox intake seam (FR-10, FR-12).

Monitors the AP mailbox, ingests PDF attachments (one invoice number per document,
multi-page up to ~100 pages), and runs duplicate detection before a record is
created. The mock is a no-op that reports readiness.
"""

from __future__ import annotations

from typing import Protocol


class EmailIntakeService(Protocol):
    def poll(self) -> list[dict]: ...


class MockEmailIntake:
    def poll(self) -> list[dict]:
        return []


def get_email_intake() -> EmailIntakeService:
    return MockEmailIntake()
