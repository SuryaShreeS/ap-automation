"""Administration (FR-80, FR-81): List Item Maintenance, structured parity lists,
AP-review rules + thresholds (FR-44, FR-45), and User Administration."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pydantic import BaseModel

from ..db import get_db
from ..models import ApRule, AuditEvent, Company, Invoice, ReferenceListItem, RoutingRule, User
from ..schemas import CompanyUpsert, ListItemUpsert, RuleToggle
from ._common import current_user

router = APIRouter(prefix="/admin", tags=["admin"])

TABLE_NOTES = {
    "multibol": "Vendors whose invoices legitimately carry multiple BOLs — exempt from the one-BOL validation.",
    "emailappr": "Admin-maintained list — parity with Vision360 'Email Approval Approvers' (FR-43).",
    "interco": "Parity with Vision360 'Manual Match (Interco) Vendors'.",
    "soldto": "Company code auto-resolved from sold-to at extraction (FR-21) — covers all seven companies.",
    "routing": "Vendor-to-user assignment list + route type per invoice (FR-41) · STATIC retained for parity, unused.",
}


@router.get("/dropdowns")
def dropdowns(db: Session = Depends(get_db)) -> dict:
    # Order by id (seed insertion order) so the list panel is stable across loads —
    # seq alone ties across lists and Postgres returns ties in arbitrary order.
    items = db.scalars(
        select(ReferenceListItem).where(ReferenceListItem.list_key == "dropdown").order_by(ReferenceListItem.id)
    ).all()
    grouped: dict[str, list] = {}
    for it in items:
        name = it.payload.get("list", "Other")
        grouped.setdefault(name, []).append({"code": it.code, "label": it.label})
    return {"lists": [{"name": name, "items": rows} for name, rows in grouped.items()]}


@router.post("/dropdowns")
def add_dropdown_item(body: ListItemUpsert, db: Session = Depends(get_db)) -> dict:
    list_name = body.payload.get("list") or body.list_key
    seq = (db.scalar(select(func.count(ReferenceListItem.id)).where(ReferenceListItem.list_key == "dropdown")) or 0)
    db.add(ReferenceListItem(list_key="dropdown", seq=seq, code=body.code, label=body.label, payload={"list": list_name}))
    db.commit()
    return dropdowns(db)


@router.get("/tables/{key}")
def table(key: str, db: Session = Depends(get_db)) -> dict:
    if key not in TABLE_NOTES:
        raise HTTPException(status_code=404, detail="Unknown list")
    rows = db.scalars(
        select(ReferenceListItem).where(ReferenceListItem.list_key == key).order_by(ReferenceListItem.seq)
    ).all()
    return {"rows": [r.payload for r in rows], "note": TABLE_NOTES[key]}


@router.get("/rules")
def rules(db: Session = Depends(get_db)) -> dict:
    rs = db.scalars(select(ApRule).order_by(ApRule.seq)).all()
    return {
        "rules": [{"key": r.key, "label": r.label, "enabled": r.enabled} for r in rs],
        "thresholds": {
            "enabled": False,
            "maxAmount": "$ 1,000.00",
            "minConfidence": "98%",
            "salesChannelRules": "12 rules · edit",
            "vendorHierarchy": "14 vendors · edit",
        },
    }


@router.patch("/rules/{key}")
def toggle_rule(key: str, body: RuleToggle, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    r = db.scalar(select(ApRule).where(ApRule.key == key))
    if r is None:
        raise HTTPException(status_code=404, detail="Unknown rule")
    r.enabled = body.enabled
    db.add(AuditEvent(actor=user, action="rule_toggle", field=key, new_value=str(body.enabled),
                      message=f"AP Final Review rule '{r.label}' {'enabled' if body.enabled else 'disabled'}"))
    db.commit()
    return rules(db)


# ---------- Routing rules (inflow classification → queue routing) ----------
class RoutingRuleUpsert(BaseModel):
    kind: str = ""
    value: str = ""
    queue: str = ""
    priority: int = 50
    enabled: bool | None = None
    description: str = ""


def _rules_payload(db: Session) -> dict:
    rows = db.scalars(select(RoutingRule).order_by(RoutingRule.priority, RoutingRule.id)).all()
    return {"rules": [{
        "id": r.id, "priority": r.priority, "kind": r.kind, "value": r.value,
        "queue": r.queue, "enabled": r.enabled, "description": r.description,
    } for r in rows]}


@router.get("/routing-rules")
def routing_rules(db: Session = Depends(get_db)) -> dict:
    return _rules_payload(db)


@router.post("/routing-rules")
def add_routing_rule(body: RoutingRuleUpsert, db: Session = Depends(get_db),
                     user: str = Depends(current_user)) -> dict:
    if body.kind not in ("vendor_prepaid", "vendor_netback", "keyword"):
        raise HTTPException(status_code=400, detail="Only vendor/keyword rules can be added here.")
    if not body.value.strip():
        raise HTTPException(status_code=400, detail="A vendor name / keyword is required.")
    db.add(RoutingRule(kind=body.kind, value=body.value.strip(), queue=body.queue or "PREPAY",
                       priority=body.priority, enabled=True, description=body.description or "Added in List Administration"))
    db.add(AuditEvent(actor=user, action="routing_rule_add", field=body.kind, new_value=body.value,
                      message=f"Routing rule added: {body.kind} '{body.value}' → {body.queue}"))
    db.commit()
    return _rules_payload(db)


@router.patch("/routing-rules/{rule_id}")
def update_routing_rule(rule_id: int, body: RoutingRuleUpsert, db: Session = Depends(get_db),
                        user: str = Depends(current_user)) -> dict:
    r = db.get(RoutingRule, rule_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    changes = []
    if body.enabled is not None and body.enabled != r.enabled:
        r.enabled = body.enabled
        changes.append(f"enabled={body.enabled}")
    if body.value and body.value != r.value:
        if r.kind == "threshold":
            try:
                t = float(body.value)
                if not (0 < t <= 1):
                    raise ValueError
            except ValueError:
                raise HTTPException(status_code=400, detail="Threshold must be a number between 0 and 1 (e.g. 0.80).")
        old = r.value
        r.value = body.value.strip()
        changes.append(f"value {old}→{r.value}")
    if body.queue and body.queue != r.queue:
        r.queue = body.queue
        changes.append(f"queue→{body.queue}")
    if changes:
        db.add(AuditEvent(actor=user, action="routing_rule_update", field=r.kind,
                          message=f"Routing rule '{r.kind} {r.value}' updated: {', '.join(changes)}"))
        db.commit()
    return _rules_payload(db)


@router.delete("/routing-rules/{rule_id}")
def delete_routing_rule(rule_id: int, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    r = db.get(RoutingRule, rule_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    if r.kind in ("threshold", "fallback", "has_po", "negative_total"):
        raise HTTPException(status_code=409, detail=f"The {r.kind} rule is structural — disable it instead.")
    db.delete(r)
    db.add(AuditEvent(actor=user, action="routing_rule_delete", field=r.kind, old_value=r.value,
                      message=f"Routing rule removed: {r.kind} '{r.value}'"))
    db.commit()
    return _rules_payload(db)


# ---------- Companies (feeds the dashboards, sold-to mapping, and search) ----------
@router.get("/companies")
def companies(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(Company).order_by(Company.id)).all()
    counts = dict(db.execute(select(Invoice.company_id, func.count()).group_by(Invoice.company_id)).all())
    return {"rows": [{"id": c.id, "name": c.name, "invoices": counts.get(c.id, 0)} for c in rows]}


@router.post("/companies")
def add_company(body: CompanyUpsert, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    cid = body.id.strip()
    name = body.name.strip()
    if not cid or not name:
        raise HTTPException(status_code=400, detail="Company code and name are required.")
    if db.get(Company, cid) is not None:
        raise HTTPException(status_code=409, detail=f"Company {cid} already exists.")
    db.add(Company(id=cid, name=name))
    db.add(AuditEvent(actor=user, action="company_add", field=cid, new_value=name,
                      message=f"Company {cid} · {name} added (List Administration)"))
    db.commit()
    return companies(db)


@router.patch("/companies/{cid}")
def rename_company(cid: str, body: CompanyUpsert, db: Session = Depends(get_db),
                   user: str = Depends(current_user)) -> dict:
    c = db.get(Company, cid)
    if c is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    old = c.name
    c.name = body.name.strip() or c.name
    db.add(AuditEvent(actor=user, action="company_rename", field=cid, old_value=old, new_value=c.name,
                      message=f"Company {cid} renamed: {old} → {c.name}"))
    db.commit()
    return companies(db)


@router.delete("/companies/{cid}")
def delete_company(cid: str, db: Session = Depends(get_db), user: str = Depends(current_user)) -> dict:
    c = db.get(Company, cid)
    if c is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    in_use = db.scalar(select(func.count()).select_from(Invoice).where(Invoice.company_id == cid)) or 0
    if in_use:
        raise HTTPException(status_code=409, detail=f"Company {cid} has {in_use} invoice(s) — reassign them before deleting.")
    db.delete(c)
    db.add(AuditEvent(actor=user, action="company_delete", field=cid, old_value=c.name,
                      message=f"Company {cid} · {c.name} deleted (List Administration)"))
    db.commit()
    return companies(db)


@router.get("/users")
def users(db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(User).order_by(User.id)).all()
    return {"rows": [{
        "name": u.name, "initials": u.initials, "avBg": u.av_bg, "role": u.role,
        "limit": u.limit, "limitFg": u.limit_fg, "limitW": u.limit_w, "assign": u.assign,
    } for u in rows]}
