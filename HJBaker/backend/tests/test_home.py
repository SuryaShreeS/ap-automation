"""Home page: work-card targets must be real search filters whose result count
matches the card's number (this is the click-through contract the UI relies on)."""


def _search_count(client, values: dict) -> int:
    criteria = [{"field": f, "op": "=", "value": v} for f, v in values.items()]
    return client.post("/search", json={"criteria": criteria}).json()["count"]


def test_current_user_filter(client):
    d = client.post("/search", json={"criteria": [
        {"field": "currentUser", "op": "=", "value": "Irene Castillo"},
    ]}).json()
    assert d["count"] >= 1
    assert all(r["currentUser"] == "Irene Castillo" for r in d["rows"])


def test_current_user_and_status_combined(client):
    d = client.post("/search", json={"criteria": [
        {"field": "currentUser", "op": "=", "value": "Irene Castillo"},
        {"field": "status", "op": "=", "value": "DATA_REQUIRED"},
    ]}).json()
    assert all(r["currentUser"] == "Irene Castillo" and r["status"] == "DATA_REQUIRED" for r in d["rows"])


def test_home_targets_match_search_counts(client):
    """Every my-work card with a `target` must produce exactly its count via /search."""
    home = client.get("/home", headers={"X-User": "Irene Castillo"}).json()
    targeted = [w for w in home["myWork"] if w.get("target")]
    assert targeted, "home should expose filterable work cards"
    for w in targeted:
        assert _search_count(client, w["target"]) == w["count"], f"mismatch on {w['label']}"


def test_home_pipeline_counts_match_search(client):
    """Every pipeline stage (Inflow + statuses, CSV IN-lists) must click through to
    exactly the rows it counts."""
    home = client.get("/home").json()
    assert home["pipeline"][0]["label"] == "Inflow"
    for stage in home["pipeline"]:
        assert _search_count(client, stage["filters"]) == stage["count"], stage["label"]


def test_status_in_list(client):
    single = _search_count(client, {"status": "ERROR"})
    multi = _search_count(client, {"status": "ERROR,PARKED_ICEC,PARKED_LEG"})
    assert multi >= single and multi >= 1


def test_new_filter_fields(client):
    # Sales channel (exact select)
    d = client.post("/search", json={"criteria": [{"field": "salesChannel", "op": "=", "value": "SOLIDS"}]}).json()
    assert d["count"] >= 1 and all(r["salesChannel"] == "SOLIDS" for r in d["rows"])
    # Vehicle ID wildcard
    d = client.post("/search", json={"criteria": [{"field": "vehicleId", "op": "LIKE", "value": "SULX%"}]}).json()
    assert d["count"] >= 1 and all(r["vehicleId"].startswith("SULX") for r in d["rows"])
    # Gross total numeric
    d = client.post("/search", json={"criteria": [{"field": "grossTotal", "op": ">", "value": "1000000"}]}).json()
    assert all(r["gross"] > 1000000 for r in d["rows"])
    # Route approver wildcard
    d = client.post("/search", json={"criteria": [{"field": "routeApprover", "op": "LIKE", "value": "%Alicia%"}]}).json()
    assert d["count"] >= 1
