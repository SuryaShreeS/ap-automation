"""Document inflow: seed-time arrivals auto-classified against the routing rules,
the original-email endpoint, manual-review routing, and the processing-queue
sub-queue contract."""


def test_arrivals_seeded_and_classified(client):
    d = client.get("/inflow").json()
    docs = {r["invoiceNumber"]: r for r in d["incoming"]}
    # The Incoming view is the full intake log — every document in the platform.
    assert d["counts"]["incoming"] == len(d["incoming"]) >= 44
    # Auto-routed on arrival, by rule:
    assert docs["INV-90101"]["queue"] == "PO"            # PO on document
    assert docs["RENT-0726"]["queue"] == "NONPO"         # no PO → supplier BP / late-PO
    assert docs["PREPAY-MAY26"]["queue"] == "PREPAY"     # marked prepaid vendor
    assert docs["CHV-90332C"]["queue"] == "CREDIT"       # negative / cancellation
    assert docs["CHV-90332R"]["queue"] == "REBILL"       # netback re-invoice
    # Arrivals await in-queue extraction (the engine's Extract step reveals fields).
    for inv in ("INV-90101", "RENT-0726", "PREPAY-MAY26", "CHV-90332C", "CHV-90332R"):
        assert docs[inv]["extracted"] is False
        assert docs[inv]["classConfidence"] >= 0.80


def test_manual_review_holds_below_threshold(client):
    d = client.get("/inflow").json()
    review = {r["invoiceNumber"]: r for r in d["review"]}
    # Three seeded arrivals fall below the 80% threshold.
    assert {"1NV-90218", "STMT-2207", "FAX-1192"} <= set(review)
    for r in review.values():
        assert r["queue"] == "MANUAL_REVIEW"
        assert r["classConfidence"] < d["threshold"]
        assert "confidence" in r["routeReason"]
    assert "vendor not recognized" in review["1NV-90218"]["routeReason"]


def test_original_email_endpoint(client):
    # Tailored email for a sample arrival…
    e = client.get("/inflow/email/RENT-0726").json()
    assert e["to"] == "ap@hjbaker.com"
    assert "cbre" in e["from"]
    assert "rent" in e["subject"].lower()
    assert e["body"] and e["attachment"]["name"].endswith(".pdf")
    # …and a synthesized one for a legacy document.
    e2 = client.get("/inflow/email/INV-88412").json()
    assert "INV-88412" in e2["subject"]
    assert e2["attachment"]["pages"] >= 1
    assert client.get("/inflow/email/NOPE-1").status_code == 404


def test_manual_review_route(client):
    d = client.get("/inflow").json()
    assert any(r["invoiceNumber"] == "FAX-1192" for r in d["review"])
    r = client.post("/inflow/route/FAX-1192", json={"queue": "NONPO"})
    assert r.status_code == 200
    assert not any(x["invoiceNumber"] == "FAX-1192" for x in r.json()["review"])
    # Routed + audited; re-routing is rejected.
    audit = client.get("/audit?limit=50").json()["rows"]
    assert any(e["action"] == "manual_route" and e["invoiceNumber"] == "FAX-1192" for e in audit)
    r2 = client.post("/inflow/route/FAX-1192", json={"queue": "PO"})
    assert r2.status_code == 409


def test_threshold_change_reroutes(client):
    rules = client.get("/admin/routing-rules").json()["rules"]
    threshold = next(r for r in rules if r["kind"] == "threshold")
    # Raise the threshold above the CBRE confidence (0.91) and re-classify…
    client.patch(f"/admin/routing-rules/{threshold['id']}", json={"value": "0.95"})
    r = client.post("/inflow/classify/RENT-0726").json()
    assert r["result"]["routedTo"] in ("MANUAL_REVIEW",)  # 0.91 < 0.95 now
    # restore + re-route
    client.patch(f"/admin/routing-rules/{threshold['id']}", json={"value": "0.80"})
    r = client.post("/inflow/classify/RENT-0726").json()
    assert r["result"]["routedTo"] == "NONPO"


def test_threshold_validation(client):
    rules = client.get("/admin/routing-rules").json()["rules"]
    threshold = next(r for r in rules if r["kind"] == "threshold")
    r = client.patch(f"/admin/routing-rules/{threshold['id']}", json={"value": "5"})
    assert r.status_code == 400


def test_routing_rule_crud_guards(client):
    r = client.post("/admin/routing-rules", json={"kind": "vendor_prepaid", "value": "Shell Chemical LP", "queue": "PREPAY", "priority": 12})
    assert r.status_code == 200
    rid = next(x["id"] for x in r.json()["rules"] if x["value"] == "Shell Chemical LP")
    assert client.delete(f"/admin/routing-rules/{rid}").status_code == 200
    # structural rules can't be deleted
    fallback = next(x for x in client.get("/admin/routing-rules").json()["rules"] if x["kind"] == "fallback")
    assert client.delete(f"/admin/routing-rules/{fallback['id']}").status_code == 409


def test_processing_queue_subqueue_contract(client):
    """Every sub-queue count must equal its own filter's search count."""
    totals = client.get("/queues-v2").json()["queues"]
    assert [q["key"] for q in totals] == ["PO", "NONPO", "PREPAY", "CREDIT", "REBILL"]
    checked = 0
    for q in totals:
        d = client.get(f"/queues-v2/{q['key']}").json()
        assert d["buckets"][0]["key"] == "all"
        assert d["buckets"][0]["count"] == len(d["rows"]) == q["count"]
        for b in d["buckets"]:
            criteria = [{"field": f, "op": "=", "value": v} for f, v in b["filters"]["values"].items()]
            got = client.post("/search", json={"criteria": criteria}).json()["count"]
            assert got == b["count"], f"{q['key']}/{b['key']}"
            checked += 1
    assert checked >= 40


def test_legacy_invoices_backfilled(client):
    d = client.get("/queues-v2/PREPAY").json()
    invs = {r["invoiceNumber"] for r in d["rows"]}
    assert {"LL-3071", "SUM-2044"} <= invs  # prepaid vendors backfilled into PREPAY
    d = client.get("/queues-v2/CREDIT").json()
    assert any(r["invoiceNumber"] == "CM-1108" for r in d["rows"])
