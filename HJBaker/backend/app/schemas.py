"""Pydantic request/response schemas. Responses are mostly plain dicts assembled in
routers (the frontend owns presentation), so schemas here focus on request bodies."""

from __future__ import annotations

from pydantic import BaseModel


class Criterion(BaseModel):
    field: str
    op: str = "="
    value: str = ""


class SearchRequest(BaseModel):
    criteria: list[Criterion] = []
    sortField: str = "platformId"
    sortDir: str = "desc"
    pageSize: int = 250


class InvoicePatch(BaseModel):
    # Arbitrary field edits keyed by the frontend field name.
    edits: dict[str, str] = {}


class InvoiceCreate(BaseModel):
    vendorName: str
    invoiceNumber: str
    company: str = ""
    net: float = 0.0
    gross: float = 0.0


class NoteCreate(BaseModel):
    who: str = "Ivy Chen"
    text: str


class ApprovalAction(BaseModel):
    action: str  # "approve" | "reject"
    comment: str = ""


class ReviewActionBody(BaseModel):
    action: str  # "release" | "sendback"
    reason: str = ""


class MatchSubmit(BaseModel):
    deselected: list[int] = []


class ListItemUpsert(BaseModel):
    list_key: str
    code: str = ""
    label: str = ""
    payload: dict = {}


class RuleToggle(BaseModel):
    enabled: bool


class CompanyUpsert(BaseModel):
    id: str = ""
    name: str = ""
