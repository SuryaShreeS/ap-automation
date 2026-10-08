"""External-system integration seams.

Every dependency the platform will eventually talk to over the network — Sage X3,
the AI extraction pipeline, and the AP mailbox — is defined here as a typed
Protocol with a deterministic mock implementation. Swap the mock for a real
adapter later without touching routers or business logic.
"""

from .email_intake import EmailIntakeService, MockEmailIntake
from .extraction import ExtractionService, MockExtraction
from .sage import MockSageClient, SageClient

__all__ = [
    "SageClient",
    "MockSageClient",
    "ExtractionService",
    "MockExtraction",
    "EmailIntakeService",
    "MockEmailIntake",
]
