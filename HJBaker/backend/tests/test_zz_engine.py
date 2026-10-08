"""Core processing engine v2 — inflow prefix + routed queue flows:
PO, Non-PO (attach-PO gate / supplier-BP), Prepayments (bulk + shipment),
Credits (original-PIN gate → PCM), Rebills (chain link), with gate auto-continue.
Named test_zz_* so it runs last: it advances the demo documents' lifecycle."""

import re

import pytest


@pytest.fixture(scope="module", autouse=True)
def routed_samples(client):
    """Arrivals are seeded + auto-classified; route the manual-review holds so the
    engine flows below have a full document set (idempotent)."""
    d = client.get("/inflow").json()
    for r in d["review"]:
        client.post(f"/inflow/route/{r['invoiceNumber']}", json={"queue": "NONPO"})
    yield


def _flow(client, inv):
    return client.get(f"/engine/flow/{inv}").json()


def _step_states(flow):
    return {s["key"]: s["state"] for s in flow["steps"]}


# ---------- NONPO: attach-PO gate (PO created manually in Sage — no automation) ----------
def test_nonpo_blocks_at_po_decision(client):
    f = _flow(client, "INV-88395")
    assert f["flowKind"] == "NONPO"
    assert [s["key"] for s in f["steps"]][:5] == ["intake", "classify", "route", "extract", "po_decision"]
    r = client.post("/engine/run/INV-88395").json()
    assert r["blocked"] and r["blocked"]["step"] == "po_decision"
    assert "P26-005941" in r["blocked"]["detail"]  # last Sage PO shown as reference only


def test_attach_po_validation_and_flow(client):
    # Bad format rejected.
    r = client.post("/engine/attach-po/INV-88395", json={"po": "12345"})
    assert r.status_code == 400
    # Valid attach → auto-continue: code/match → approval gate.
    r = client.post("/engine/attach-po/INV-88395", json={"po": "P26-005942"}).json()
    joined = " | ".join(r["executed"])
    assert "Matched 2-way to attached PO P26-005942" in joined
    assert r["blocked"]["step"] == "approval"
    d = client.get("/invoices/INV-88395").json()
    assert d["invoice"]["po"] == "P26-005942"
    # Uniqueness: the same PO can't be attached to another invoice.
    r2 = client.post("/engine/attach-po/1NV-90218", json={"po": "P26-005942"})
    assert r2.status_code == 409 and "INV-88395" in r2.json()["detail"]


def test_nonpo_approval_autocontinues_to_pin(client):
    client.post("/approvals/INV-88395/action", json={"action": "approve"})
    f = _step_states(_flow(client, "INV-88395"))
    assert f["approval"] == "done" and f["ap_review"] == "blocked"  # terms-mismatch rule
    rr = client.post("/ap-review/INV-88395/action", json={"action": "release"}).json()
    assert any(re.search(r"PIN\d{6}", s) for s in rr["flowSummary"])
    d = client.get("/invoices/INV-88395").json()
    assert d["invoice"]["status"] == "IN_ERP"
    assert re.match(r"PIN\d{6}$", d["invoice"]["erpVoucher"])  # write-back reflected
    client.post("/engine/step/INV-88395")  # external payment feedback
    d = client.get("/invoices/INV-88395").json()
    assert d["invoice"]["status"] == "MATCHED_PAY"
    assert re.match(r"PAY(AC|WT|CK)\d{6}$", d["invoice"]["paymentNumber"])


# ---------- NONPO: supplier BP invoice (never has a PO) ----------
def test_supplier_bp_path(client):
    f = _flow(client, "RENT-0726")
    assert f["flowKind"] == "NONPO"
    r = client.post("/engine/run/RENT-0726").json()
    joined = " | ".join(r["executed"])
    assert "In-queue extraction" in joined  # extraction happened inside the queue
    assert r["blocked"]["step"] == "po_decision"
    r = client.post("/engine/no-po/RENT-0726").json()
    joined = " | ".join(r["executed"])
    assert "Supplier BP invoice" in joined and "template" in joined.lower()
    assert r["blocked"]["step"] == "approval"
    d = client.get("/invoices/RENT-0726").json()
    assert d["invoice"]["templateLine"] == "SUPPLIER-BP"
    assert d["invoice"]["po"] == "—"  # never gets a PO
    # Approve → under $25k, no errors → straight to PIN.
    r = client.post("/approvals/RENT-0726/action", json={"action": "approve"}).json()
    assert any("skipped" in s.lower() for s in r["flowSummary"])
    d = client.get("/invoices/RENT-0726").json()
    assert d["invoice"]["status"] == "IN_ERP" and d["invoice"]["erpVoucher"].startswith("PIN")


# ---------- PO queue: extraction in-queue, then match → approval ----------
def test_po_queue_flow(client):
    f = _flow(client, "INV-90101")
    assert f["flowKind"] == "PO"
    r = client.post("/engine/run/INV-90101").json()
    joined = " | ".join(r["executed"])
    assert "In-queue extraction" in joined
    assert "2-way" in joined or "receipt" in joined  # matched via PO on document
    assert r["blocked"]["step"] == "approval"


def test_with_po_legacy_direct_processing(client):
    f = _flow(client, "INV-88412")
    assert f["flowKind"] == "PO"
    states = _step_states(f)
    assert states["classify"] == "done" and states["extract"] == "done"  # backfilled
    assert states["match"] == "done"
    client.post("/engine/run/INV-88412")
    r = client.post("/approvals/INV-88412/action", json={"action": "approve"}).json()
    joined = " | ".join(r["flowSummary"])
    assert "skipped" in joined.lower() and re.search(r"PIN\d{6}", joined)
    assert client.get("/invoices/INV-88412").json()["invoice"]["status"] == "IN_ERP"


# ---------- CREDIT: original-PIN gate → AP → PCM → park ----------
def test_credit_with_seeded_pin(client):
    f = _flow(client, "CM-1108")
    assert f["flowKind"] == "CREDIT"
    assert _step_states(f)["pin_reference"] == "done"  # seeded linkage
    r = client.post("/engine/run/CM-1108").json()
    assert "INV-87001" in " | ".join(r["executed"])
    assert r["blocked"]["step"] == "ap_route"
    rr = client.post("/ap-review/CM-1108/action", json={"action": "release"}).json()
    joined = " | ".join(rr["flowSummary"])
    assert "PCM004410" in joined and "PIN195233" in joined
    d = client.get("/invoices/CM-1108").json()
    assert d["invoice"]["status"] == "PARKED_ICEC"
    assert _flow(client, "CM-1108")["complete"] is True


def test_credit_pin_reference_gate(client):
    r = client.post("/engine/run/CHV-90332C").json()
    assert r["blocked"] and r["blocked"]["step"] == "pin_reference"
    # Invalid PIN format rejected.
    assert client.post("/engine/set-original-pin/CHV-90332C", json={"pin": "76233"}).status_code == 400
    r = client.post("/engine/set-original-pin/CHV-90332C", json={"pin": "PIN196602"}).json()
    assert r["blocked"]["step"] == "ap_route"
    rr = client.post("/ap-review/CHV-90332C/action", json={"action": "release"}).json()
    joined = " | ".join(rr["flowSummary"])
    assert "PIN196602" in joined  # PCM tied to the user-entered original PIN
    credits = client.get("/credits").json()
    assert "PIN196602" in credits["chain"][0]["num"] and "CHV-90332" in credits["chain"][0]["num"]
    assert "CHV-90332C" in credits["chain"][1]["num"]
    park = [row for q in credits["parkQueues"] for row in q["rows"]]
    assert any(row["inv"] == "CHV-90332C" and "awaiting rebill" in row["state"] for row in park)


# ---------- REBILL: credit-memo reference → chain link → approval → PIN ----------
def test_rebill_gate_requires_credit_memo(client):
    """A rebill can only prove the chain if it names the credit memo it settles —
    the client's "static field where they key that purchase credit memo in"."""
    r = client.post("/engine/run/CHV-90332R").json()
    assert r["blocked"]["step"] == "credit_reference"
    # the format is Sage's purchase credit memo, not a free-text note
    bad = client.post("/engine/set-credit-memo/CHV-90332R", json={"creditMemo": "cm-42"})
    assert bad.status_code == 400
    assert _step_states(_flow(client, "CHV-90332R"))["credit_reference"] == "blocked"


def test_rebill_flow_links_chain(client):
    f = _flow(client, "CHV-90332R")
    assert f["flowKind"] == "REBILL"
    r = client.post("/engine/set-credit-memo/CHV-90332R", json={"creditMemo": "PCM004501"}).json()
    joined = " | ".join(r["executed"])
    assert "Chain linked" in joined and "FR-64" in joined
    assert "PCM004501" in " | ".join(s["detail"] for s in r["flow"]["steps"])
    assert r["blocked"]["step"] == "approval"
    client.post("/approvals/CHV-90332R/action", json={"action": "approve"})
    # $58,975 > $25k → AP-review gate (the closed-period AP decision point).
    assert _step_states(_flow(client, "CHV-90332R"))["ap_review"] == "blocked"
    rr = client.post("/ap-review/CHV-90332R/action", json={"action": "release"}).json()
    pins = [m for s in rr["flowSummary"] for m in re.findall(r"PIN\d{6}", s)]
    assert pins
    chain = client.get("/credits").json()["chain"]
    assert "CHV-90332R" in chain[2]["num"] and any(p in chain[2]["num"] for p in pins)


# ---------- PREPAY: shipment true-up draws down; bulk registers/tops up ----------
def test_prepay_shipment_association_and_alert(client):
    before = {p["vendor"]: p for p in client.get("/prepayments").json()["rows"]}["Deer Park Refining"]
    assert before["pins"] == 4
    f = _flow(client, "SUM-2044")
    assert f["flowKind"] == "PREPAY"
    client.post("/engine/run/SUM-2044")
    client.post("/approvals/SUM-2044/action", json={"action": "approve"})
    rr = client.post("/ap-review/SUM-2044/action", json={"action": "release"}).json()
    assert "auto-associated to open prepayment" in " | ".join(rr["flowSummary"])
    after = {p["vendor"]: p for p in client.get("/prepayments").json()["rows"]}["Deer Park Refining"]
    assert after["pins"] == 5 and after["pct"] == "100%" and "Exceeded" in (after["alert"] or "")


def test_prepay_bulk_registers_and_tops_up(client):
    f = _flow(client, "PREPAY-MAY26")
    assert f["flowKind"] == "PREPAY_BULK"
    r = client.post("/engine/run/PREPAY-MAY26").json()
    joined = " | ".join(r["executed"])
    assert "topped up" in joined  # Deer Park already has an open prepayment
    assert re.search(r"PIN\d{6}", joined)  # payment PIN created
    pp = {p["vendor"]: p for p in client.get("/prepayments").json()["rows"]}["Deer Park Refining"]
    assert pp["total"] == "$10,500,000"  # 1.5M + 9M
    assert pp["alert"] is None  # position recomputed against the new total
    d = client.get("/invoices/PREPAY-MAY26").json()
    assert d["invoice"]["status"] == "IN_ERP"


def test_prepay_register_endpoint(client):
    r = client.post("/prepayments/register", json={"vendor": "Koch Sulfur Products", "period": "Q3 2026", "amount": 250000})
    assert r.status_code == 200
    r2 = client.post("/prepayments/register", json={"vendor": "Koch Sulfur Products", "amount": 1})
    assert r2.status_code == 409


# ---------- system consistency after all engine mutations ----------
def test_dashboard_contracts_still_hold_after_processing(client):
    d = client.get("/dashboards/overview-matrix").json()
    for row in d["rows"] + [{"cells": d["totals"]}]:
        for cell in row["cells"]:
            if cell.get("clickable") and cell.get("filters"):
                criteria = [
                    {"field": f, "op": (cell["filters"].get("ops") or {}).get(f, "="), "value": v}
                    for f, v in cell["filters"]["values"].items()
                ]
                got = client.post("/search", json={"criteria": criteria}).json()["count"]
                assert got == cell["n"]


def test_queue_contracts_still_hold_after_processing(client):
    for q in client.get("/queues-v2").json()["queues"]:
        d = client.get(f"/queues-v2/{q['key']}").json()
        for b in d["buckets"]:
            criteria = [{"field": f, "op": "=", "value": v} for f, v in b["filters"]["values"].items()]
            assert client.post("/search", json={"criteria": criteria}).json()["count"] == b["count"]


def test_flow_history_and_audit(client):
    audit = client.get("/audit?limit=600").json()["rows"]
    assert any(e["action"] == "po_attached" and e["invoiceNumber"] == "INV-88395" for e in audit)
    assert any(e["action"] == "pin_referenced" and e["invoiceNumber"] == "CHV-90332C" for e in audit)
    flow_steps = [e for e in audit if e["action"] == "flow_step"]
    assert len(flow_steps) >= 15
