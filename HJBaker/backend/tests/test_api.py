"""End-to-end API tests covering the core business logic."""


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_search_wildcard(client):
    # %sulfur% contains-match should hit Koch Sulfur Products in the filler set.
    r = client.post("/search", json={"criteria": [{"field": "vendorName", "op": "LIKE", "value": "%sulfur%"}]})
    assert r.status_code == 200
    data = r.json()
    assert data["count"] >= 1
    assert all("sulfur" in row["vendorName"].lower() for row in data["rows"])


def test_search_status_and_company(client):
    r = client.post("/search", json={"criteria": [
        {"field": "status", "op": "=", "value": "AUTOMATCH"},
        {"field": "company", "op": "=", "value": "405"},
    ]})
    rows = r.json()["rows"]
    assert all(row["status"] == "AUTOMATCH" and row["co"] == "405" for row in rows)


def test_detail_totals_reconcile(client):
    r = client.get("/invoices/INV-88412")
    assert r.status_code == 200
    d = r.json()
    # 17,980.00 net + 260.00 freight = 18,240.00 gross
    assert d["totals"]["ok"] is True
    assert len(d["lines"]) == 3
    assert d["poReference"]["needsPo"] is False  # has a PO


def test_matching_variance_summary(client):
    # SUM-2044: all seeded receipts selected -> variance ≈ 0 (scaled to net).
    r = client.post("/matching/SUM-2044/submit", json={"deselected": []})
    body = r.json()
    assert body["ok"] is True
    assert abs(body["variance"]["variance"]) < 1


def test_matching_variance_deselect_breaks(client):
    r = client.post("/matching/SUM-2044/submit", json={"deselected": [0, 1, 2]})
    body = r.json()
    assert body["ok"] is False  # dropping receipts opens a variance


def test_duplicate_detection(client):
    payload = {"vendorName": "Phillips 66", "invoiceNumber": "INV-88412", "gross": 18240.0, "net": 18240.0}
    r = client.post("/invoices", json=payload)
    assert r.status_code == 409  # vendor + invoice# + amount already exists


def test_create_new_invoice(client):
    payload = {"vendorName": "Brand New Vendor", "invoiceNumber": "INV-99999", "gross": 100.0, "net": 100.0}
    r = client.post("/invoices", json=payload)
    assert r.status_code == 200 and r.json()["ok"] is True


def test_approval_reject_requires_comment(client):
    r = client.post("/approvals/SUM-2044/action", json={"action": "reject", "comment": ""})
    assert r.status_code == 400


def test_approval_over_limit_escalates(client):
    r = client.post("/approvals/LL-3071/action", json={"action": "approve"})
    rows = {row["inv"]: row for row in r.json()["rows"]}
    assert rows["LL-3071"]["overLimit"] is True
    assert "escalated" in rows["LL-3071"]["decidedMsg"]


def test_dashboard_overview(client):
    r = client.get("/dashboards/overview?variant=all")
    panels = r.json()["panels"]
    assert {p["id"] for p in panels} == {"unproc", "dataReq", "apRev", "automatch", "inERP", "error"}


def test_edit_writes_audit(client):
    client.patch("/invoices/INV-88389", json={"edits": {"vendorCode": "BP-30112"}})
    r = client.get("/audit")
    actions = [e["action"] for e in r.json()["rows"]]
    assert "field_edit" in actions
