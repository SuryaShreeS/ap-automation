"""SQLAlchemy models — the AP Invoice Platform domain.

The `Invoice` model carries the full §5.4 field dictionary from the PRD. Values
are stored as domain data; presentation (status colours, column widths, chip
styling) is computed on the frontend. Backing store is PostgreSQL; JSON columns
(`conf`, `pdf_lines`) map to Postgres JSON.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[str] = mapped_column(String(8), primary_key=True)  # "100", "405", ...
    name: Mapped[str] = mapped_column(String(64))


class Vendor(Base):
    __tablename__ = "vendors"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128))
    code: Mapped[str] = mapped_column(String(32))  # "BP-20144"
    addr_id: Mapped[str] = mapped_column(String(16), default="MAIN")
    loc: Mapped[str] = mapped_column(String(16), default="")
    address: Mapped[str] = mapped_column(String(128), default="")
    city: Mapped[str] = mapped_column(String(64), default="")
    term_days: Mapped[int] = mapped_column(Integer, default=30)
    pay_method: Mapped[str] = mapped_column(String(16), default="ACH")
    currency: Mapped[str] = mapped_column(String(8), default="USD")


class Invoice(Base):
    __tablename__ = "invoices"
    # Identification
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    platform_id: Mapped[str] = mapped_column(String(16), index=True)
    scan_date: Mapped[str] = mapped_column(String(16))
    company_id: Mapped[str] = mapped_column(String(8), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    error_code: Mapped[str] = mapped_column(String(32), default="—")
    validated: Mapped[bool] = mapped_column(Boolean, default=True)

    # Vendor snapshot (from Sage BP at resolution time)
    vendor_name: Mapped[str] = mapped_column(String(128), index=True)
    vendor_code: Mapped[str] = mapped_column(String(32), default="—")
    vendor_addr_id: Mapped[str] = mapped_column(String(16), default="MAIN")
    vendor_loc: Mapped[str] = mapped_column(String(16), default="")
    vendor_address: Mapped[str] = mapped_column(String(128), default="")
    vendor_city: Mapped[str] = mapped_column(String(64), default="")
    vendor_term_days: Mapped[int] = mapped_column(Integer, default=30)
    pay_method: Mapped[str] = mapped_column(String(16), default="ACH")

    # Invoice
    po: Mapped[str] = mapped_column(String(24), default="—", index=True)
    invoice_number: Mapped[str] = mapped_column(String(32), index=True)
    invoice_date: Mapped[str] = mapped_column(String(16), default="")
    term_days: Mapped[int] = mapped_column(Integer, default=30)
    due_date: Mapped[str] = mapped_column(String(16), default="")
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    special_terms: Mapped[bool] = mapped_column(Boolean, default=False)
    template_line: Mapped[str] = mapped_column(String(32), default="—")

    # Totals
    net: Mapped[float] = mapped_column(Float, default=0.0)
    gst: Mapped[float] = mapped_column(Float, default=0.0)
    hst: Mapped[float] = mapped_column(Float, default=0.0)
    pst: Mapped[float] = mapped_column(Float, default=0.0)
    usa: Mapped[float] = mapped_column(Float, default=0.0)
    vat: Mapped[float] = mapped_column(Float, default=0.0)
    freight: Mapped[float] = mapped_column(Float, default=0.0)
    gross: Mapped[float] = mapped_column(Float, default=0.0)

    # Transport
    vehicle_id: Mapped[str] = mapped_column(String(32), default="—")
    bol: Mapped[str] = mapped_column(String(32), default="—")

    # Routing
    route_type: Mapped[str] = mapped_column(String(16), default="HIERARCHY")
    route_name: Mapped[str] = mapped_column(String(32), default="STD-AP")
    route_approver: Mapped[str] = mapped_column(String(64), default="Karl Weber")
    current_user: Mapped[str] = mapped_column(String(64), default="Ivy Chen")
    sales_channel: Mapped[str] = mapped_column(String(16), default="LIQUID")

    # ERP write-back (read-only from Sage)
    erp_voucher: Mapped[str] = mapped_column(String(32), default="—")
    payment_date: Mapped[str] = mapped_column(String(16), default="—")
    payment_number: Mapped[str] = mapped_column(String(32), default="—")
    payment_amount: Mapped[str] = mapped_column(String(32), default="—")

    # Audit surface
    last_by: Mapped[str] = mapped_column(String(64), default="system")
    last_date: Mapped[str] = mapped_column(String(24), default="")
    last_msg: Mapped[str] = mapped_column(String(256), default="")

    # Classification + extraction
    doc_type: Mapped[str] = mapped_column(String(24), default="standard")
    pages_n: Mapped[int] = mapped_column(Integer, default=1)
    conf: Mapped[dict] = mapped_column(JSON, default=dict)  # per-field confidence
    pdf_lines: Mapped[list] = mapped_column(JSON, default=list)

    # Document inflow pipeline: master-queue → classification → routed processing queue.
    queue: Mapped[str] = mapped_column(String(16), default="PO", index=True)  # MASTER|MANUAL_REVIEW|PO|NONPO|PREPAY|CREDIT|REBILL
    class_label: Mapped[str] = mapped_column(String(24), default="")
    class_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    route_reason: Mapped[str] = mapped_column(String(256), default="")
    extracted: Mapped[bool] = mapped_column(Boolean, default=True)  # extraction runs IN the queue
    original_pin: Mapped[str] = mapped_column(String(24), default="—")
    # The "static field" the client asked for: a rebill carries the purchase
    # credit memo it settles, so original PIN -> PCM -> rebill is provable in one
    # place. Without it that third link is lost (their standing audit finding).
    credit_memo_ref: Mapped[str] = mapped_column(String(24), default="—")  # credit/rebill → original PIN linkage

    # Matching metadata (fixtures from the prototype's receiptsFor / lineItemsFor)
    match_banner: Mapped[str] = mapped_column(String(512), default="")
    match_ok: Mapped[bool] = mapped_column(Boolean, default=False)
    receipt_total: Mapped[int] = mapped_column(Integer, default=0)  # full count (e.g. 1,014)
    receipt_scale: Mapped[float] = mapped_column(Float, default=1.0)
    line_footnote: Mapped[str] = mapped_column(String(512), default="")

    lines: Mapped[list[InvoiceLine]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    receipts: Mapped[list[Receipt]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )
    notes: Mapped[list[Note]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    line_id: Mapped[str] = mapped_column(String(8), default="")
    po_number: Mapped[str] = mapped_column(String(24), default="—")
    po_line: Mapped[str] = mapped_column(String(8), default="—")
    quantity: Mapped[str] = mapped_column(String(24), default="")
    description: Mapped[str] = mapped_column(String(256), default="")
    item_number: Mapped[str] = mapped_column(String(32), default="")
    unit_price: Mapped[str] = mapped_column(String(24), default="")
    account_code: Mapped[str] = mapped_column(String(16), default="")
    division: Mapped[str] = mapped_column(String(16), default="")
    sales_channel: Mapped[str] = mapped_column(String(16), default="")
    branch_site: Mapped[str] = mapped_column(String(16), default="")
    department: Mapped[str] = mapped_column(String(16), default="")
    project: Mapped[str] = mapped_column(String(16), default="—")
    line_amount: Mapped[str] = mapped_column(String(24), default="")

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Receipt(Base):
    __tablename__ = "receipts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    num: Mapped[str] = mapped_column(String(24), default="")
    ship_date: Mapped[str] = mapped_column(String(16), default="")
    bol: Mapped[str] = mapped_column(String(32), default="")
    description: Mapped[str] = mapped_column(String(256), default="")
    amount: Mapped[float] = mapped_column(Float, default=0.0)

    invoice: Mapped[Invoice] = relationship(back_populates="receipts")


class Note(Base):
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    who: Mapped[str] = mapped_column(String(64))
    time: Mapped[str] = mapped_column(String(32))
    text: Mapped[str] = mapped_column(String(1024))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    invoice: Mapped[Invoice] = relationship(back_populates="notes")


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inv: Mapped[str] = mapped_column(String(32), index=True)
    vendor: Mapped[str] = mapped_column(String(128))
    company_id: Mapped[str] = mapped_column(String(8))
    amount: Mapped[str] = mapped_column(String(32))
    amount_n: Mapped[float] = mapped_column(Float)
    type: Mapped[str] = mapped_column(String(64))
    route: Mapped[str] = mapped_column(String(128))
    state: Mapped[str | None] = mapped_column(String(16), nullable=True)  # approved / rejected
    comment: Mapped[str] = mapped_column(String(512), default="")


class ReviewAction(Base):
    __tablename__ = "review_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    inv: Mapped[str] = mapped_column(String(32), index=True)
    vendor: Mapped[str] = mapped_column(String(128))
    amount: Mapped[str] = mapped_column(String(32))
    rule: Mapped[str] = mapped_column(String(64))
    why: Mapped[str] = mapped_column(String(512))
    state: Mapped[str | None] = mapped_column(String(16), nullable=True)  # released / sentback
    reason: Mapped[str] = mapped_column(String(512), default="")


class Prepayment(Base):
    __tablename__ = "prepayments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vendor: Mapped[str] = mapped_column(String(128))
    period: Mapped[str] = mapped_column(String(32))
    po: Mapped[str] = mapped_column(String(24))
    cadence: Mapped[str] = mapped_column(String(32))
    total: Mapped[str] = mapped_column(String(24))
    consumed: Mapped[str] = mapped_column(String(24))
    pct: Mapped[str] = mapped_column(String(8))
    bar_color: Mapped[str] = mapped_column(String(16))
    pins: Mapped[int] = mapped_column(Integer)
    latest: Mapped[str] = mapped_column(String(64))
    alert: Mapped[str | None] = mapped_column(String(128), nullable=True)
    alert_fg: Mapped[str | None] = mapped_column(String(16), nullable=True)
    alert_bg: Mapped[str | None] = mapped_column(String(16), nullable=True)


class ChainNode(Base):
    """A node in the credit/rebill settlement chain (original PIN -> PCM -> rebill)."""

    __tablename__ = "chain_nodes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    tag: Mapped[str] = mapped_column(String(48))
    num: Mapped[str] = mapped_column(String(48))
    description: Mapped[str] = mapped_column(String(256))
    amount: Mapped[str] = mapped_column(String(24))
    border: Mapped[str] = mapped_column(String(16))
    bg: Mapped[str] = mapped_column(String(16))
    tag_fg: Mapped[str] = mapped_column(String(16))
    amt_fg: Mapped[str] = mapped_column(String(16))
    arrow: Mapped[bool] = mapped_column(Boolean, default=True)


class ParkQueueItem(Base):
    __tablename__ = "park_queue_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    queue: Mapped[str] = mapped_column(String(16))  # ICEC / LEG
    queue_title: Mapped[str] = mapped_column(String(64))
    queue_sub: Mapped[str] = mapped_column(String(64))
    inv: Mapped[str] = mapped_column(String(32))
    vendor: Mapped[str] = mapped_column(String(128))
    amt: Mapped[str] = mapped_column(String(24))
    state: Mapped[str] = mapped_column(String(48))


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64))
    initials: Mapped[str] = mapped_column(String(4))
    av_bg: Mapped[str] = mapped_column(String(16))
    role: Mapped[str] = mapped_column(String(32))
    limit: Mapped[str] = mapped_column(String(24))
    limit_fg: Mapped[str] = mapped_column(String(16))
    limit_w: Mapped[str] = mapped_column(String(8))
    assign: Mapped[str] = mapped_column(String(256))


class ReferenceListItem(Base):
    """Admin reference lists. `list_key` groups them; `payload` holds structured
    columns for the richer lists (routing, sold-to, multi-BOL, etc.)."""

    __tablename__ = "reference_list_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    list_key: Mapped[str] = mapped_column(String(32), index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    code: Mapped[str] = mapped_column(String(32), default="")
    label: Mapped[str] = mapped_column(String(128), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class RoutingRule(Base):
    """Inflow routing conditions (List Administration › Routing Rules).
    kinds: vendor_prepaid | vendor_netback | negative_total | keyword | has_po |
    fallback | threshold (special row: value holds the classification threshold)."""

    __tablename__ = "routing_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    priority: Mapped[int] = mapped_column(Integer, default=50)
    kind: Mapped[str] = mapped_column(String(24))
    value: Mapped[str] = mapped_column(String(128), default="")
    queue: Mapped[str] = mapped_column(String(16), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[str] = mapped_column(String(256), default="")


class ApRule(Base):
    __tablename__ = "ap_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(24), unique=True)
    label: Mapped[str] = mapped_column(String(128))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    invoice_number: Mapped[str] = mapped_column(String(32), default="", index=True)
    actor: Mapped[str] = mapped_column(String(64), default="system")
    action: Mapped[str] = mapped_column(String(48))
    message: Mapped[str] = mapped_column(String(512), default="")
    field: Mapped[str] = mapped_column(String(48), default="")
    old_value: Mapped[str] = mapped_column(String(256), default="")
    new_value: Mapped[str] = mapped_column(String(256), default="")
