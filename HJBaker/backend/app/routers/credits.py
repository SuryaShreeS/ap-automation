"""Credits & Rebills (FR-60–65).

These are two different documents in one three-document settlement, and the calls
were explicit about the difference:

* A **credit memo (PCM)** reverses an invoice already booked. Sage builds it by
  pulling the lines from the original purchase invoice, so it *must* carry the
  original PIN — "a credit memo is tied to a purchase invoice … we would need to
  be able to reference this PIN number".
* A **rebill** is a brand-new invoice at the settled price. It has to name the
  credit memo it settles, otherwise the third link is lost — "we can link the
  original pin to the credit memo, but we can't currently link the rebill to
  either one … you lose that third link".

So `/credits/credits` answers "which credits still need their original invoice?"
and `/credits/rebills` answers "which settlement chains are complete?".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..logic import fmt
from ..models import ChainNode, Invoice, ParkQueueItem

router = APIRouter(prefix="/credits", tags=["credits"])


def _park_queues(db: Session) -> list[dict]:
    """The buckets AP moves provisional invoices into while they await their credit
    and rebill — "they put it over here until the rebill is put back in"."""
    items = db.scalars(select(ParkQueueItem).order_by(ParkQueueItem.id)).all()
    queues: dict[str, dict] = {}
    for it in items:
        q = queues.setdefault(it.queue, {"title": it.queue_title, "sub": it.queue_sub, "rows": []})
        q["rows"].append({"inv": it.inv, "vendor": it.vendor, "amt": it.amt, "state": it.state})
    return list(queues.values())


def _parked_flat(db: Session) -> list[dict]:
    """The same parked invoices as one list — the screen shows a single table, so
    the park queue is a column rather than a heading."""
    items = db.scalars(select(ParkQueueItem).order_by(ParkQueueItem.id)).all()
    return [{"inv": it.inv, "vendor": it.vendor, "amt": it.amt, "state": it.state,
             "queue": it.queue_title, "queueNote": it.queue_sub} for it in items]


@router.get("")
def get_credits(db: Session = Depends(get_db)) -> dict:
    """The worked settlement-chain example (original PIN ↔ PCM ↔ rebill)."""
    chain = db.scalars(select(ChainNode).order_by(ChainNode.seq)).all()
    return {
        "chain": [{
            "tag": n.tag, "num": n.num, "desc": n.description, "amt": n.amount,
            "border": n.border, "bg": n.bg, "tagFg": n.tag_fg, "amtFg": n.amt_fg, "arrow": n.arrow,
        } for n in chain],
        "parkQueues": _park_queues(db),
    }


@router.get("/credits")
def credit_view(db: Session = Depends(get_db)) -> dict:
    """Credit memos: what each one reverses, and whether Sage can build it yet."""
    rows = db.scalars(
        select(Invoice).where(Invoice.queue == "CREDIT").order_by(Invoice.platform_id.desc())
    ).all()
    out = []
    for i in rows:
        linked = i.original_pin not in ("—", "", None)
        out.append({
            "platformId": i.platform_id,
            "inv": i.invoice_number, "vendor": i.vendor_name, "co": i.company_id,
            "amount": fmt(i.gross), "status": i.status,
            "originalPin": i.original_pin,
            "pcm": i.erp_voucher if i.erp_voucher not in ("—", "", None) else "—",
            "linked": linked,
            # Without the original PIN there is nothing for Sage to build the PCM from.
            "blocker": None if linked else "Needs the original purchase invoice it reverses",
        })
    return {
        "rows": out,
        "awaitingReference": sum(1 for r in out if not r["linked"]),
        "parked": _parked_flat(db),
    }


@router.get("/rebills")
def rebill_view(db: Session = Depends(get_db)) -> dict:
    """Settlement chains: original invoice → credit memo → rebill at settled price.
    A chain is only complete once the rebill names the credit memo it settles."""
    rows = db.scalars(
        select(Invoice).where(Invoice.queue == "REBILL").order_by(Invoice.platform_id.desc())
    ).all()
    out = []
    for i in rows:
        pcm = i.credit_memo_ref if i.credit_memo_ref not in ("—", "", None) else ""
        rebill_pin = i.erp_voucher if i.erp_voucher not in ("—", "", None) else ""
        missing = [] if pcm else ["credit memo reference"]
        if not rebill_pin:
            missing.append("rebill posted to Sage")
        out.append({
            "platformId": i.platform_id,
            "inv": i.invoice_number, "vendor": i.vendor_name, "co": i.company_id,
            "settledAmount": fmt(i.gross), "status": i.status, "po": i.po,
            "creditMemo": pcm or "—",
            "rebillPin": rebill_pin or "—",
            "chainComplete": bool(pcm and rebill_pin),
            "missing": missing,
        })
    return {
        "rows": out,
        "complete": sum(1 for r in out if r["chainComplete"]),
        "brokenLinks": sum(1 for r in out if not r["chainComplete"]),
    }
