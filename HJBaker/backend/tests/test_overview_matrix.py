"""Redesigned Overview (All): the company×status matrix and error split must keep
the click-through contract (cell count == its filter's search count), respect the
multi-select user filter, and reflect companies CRUD from List Administration."""


def _search_count(client, filters: dict) -> int:
    criteria = [
        {"field": f, "op": (filters.get("ops") or {}).get(f, "="), "value": v}
        for f, v in filters["values"].items()
    ]
    return client.post("/search", json={"criteria": criteria}).json()["count"]


def test_matrix_shape(client):
    d = client.get("/dashboards/overview-matrix").json()
    assert [c["key"] for c in d["columns"]] == [
        "new", "dataReq", "awaitAppr", "apReview", "automatch", "erpPending", "erpSent24", "error",
    ]
    assert len(d["rows"]) >= 7  # seeded companies
    assert len(d["totals"]) == len(d["columns"])
    assert len(d["errorSplit"]) == 13  # FR-71 taxonomy
    assert d["users"], "distinct users list must be present"


def test_matrix_click_through_contract(client):
    d = client.get("/dashboards/overview-matrix").json()
    checked = 0
    for row in d["rows"] + [{"cells": d["totals"]}]:
        for cell in row["cells"]:
            if cell.get("clickable") and cell.get("filters"):
                assert _search_count(client, cell["filters"]) == cell["n"]
                checked += 1
    for e in d["errorSplit"]:
        cell = e["cell"]
        if cell.get("clickable") and cell.get("filters"):
            assert _search_count(client, cell["filters"]) == cell["n"]
            checked += 1
    assert checked >= 10


def test_matrix_totals_are_column_sums(client):
    d = client.get("/dashboards/overview-matrix").json()
    for ci in range(len(d["columns"])):
        col_sum = sum(row["cells"][ci]["n"] for row in d["rows"])
        assert d["totals"][ci]["n"] == col_sum, d["columns"][ci]["key"]


def test_matrix_user_filter(client):
    full = client.get("/dashboards/overview-matrix").json()
    one = client.get("/dashboards/overview-matrix?users=Irene Castillo").json()
    assert one["selectedUsers"] == ["Irene Castillo"]
    # Filtered totals never exceed unfiltered, and the contract still holds.
    for ci in range(len(full["totals"])):
        assert one["totals"][ci]["n"] <= full["totals"][ci]["n"]
    for row in one["rows"]:
        for cell in row["cells"]:
            if cell.get("clickable"):
                assert cell["filters"]["values"]["currentUser"] == "Irene Castillo"
                assert _search_count(client, cell["filters"]) == cell["n"]


def test_matrix_multi_user_filter(client):
    two = client.get("/dashboards/overview-matrix?users=Irene Castillo,Tara Singh").json()
    one = client.get("/dashboards/overview-matrix?users=Irene Castillo").json()
    for ci in range(len(two["totals"])):
        assert two["totals"][ci]["n"] >= one["totals"][ci]["n"]
    # CSV user filter must reproduce through search too.
    for cell in two["totals"]:
        if cell.get("clickable"):
            assert _search_count(client, cell["filters"]) == cell["n"]


def test_sent24_column_has_signal(client):
    d = client.get("/dashboards/overview-matrix").json()
    ci = [c["key"] for c in d["columns"]].index("erpSent24")
    assert d["totals"][ci]["n"] >= 1  # seeded: two paid rows sent within the demo 24h


def test_awaiting_approval_column(client):
    d = client.get("/dashboards/overview-matrix").json()
    ci = [c["key"] for c in d["columns"]].index("awaitAppr")
    # Pending approvals exist in seed (unless another test decided them all).
    n = d["totals"][ci]["n"]
    pending = [r for r in client.get("/approvals").json()["rows"] if not r["decided"]]
    assert n == len({p["inv"] for p in pending} & {r["invoiceNumber"] for r in client.post("/search", json={"criteria": []}).json()["rows"]}) or n == len(pending)


# ---------- companies CRUD reflects into the matrix ----------
def test_company_crud_reflects_in_matrix(client):
    # add
    r = client.post("/admin/companies", json={"id": "990", "name": "HJB Test Co"})
    assert r.status_code == 200
    assert any(c["id"] == "990" for c in r.json()["rows"])
    d = client.get("/dashboards/overview-matrix").json()
    assert any(row["id"] == "990" for row in d["rows"])
    # rename
    r = client.patch("/admin/companies/990", json={"name": "HJB Renamed"})
    assert any(c["name"] == "HJB Renamed" for c in r.json()["rows"])
    d = client.get("/dashboards/overview-matrix").json()
    assert any("HJB Renamed" in row["label"] for row in d["rows"])
    # delete (no invoices → allowed)
    r = client.delete("/admin/companies/990")
    assert r.status_code == 200
    assert not any(c["id"] == "990" for c in r.json()["rows"])
    d = client.get("/dashboards/overview-matrix").json()
    assert not any(row["id"] == "990" for row in d["rows"])


def test_company_delete_guard(client):
    # 405 has invoices — delete must be blocked.
    r = client.delete("/admin/companies/405")
    assert r.status_code == 409
    assert "invoice" in r.json()["detail"].lower()


def test_company_duplicate_guard(client):
    r = client.post("/admin/companies", json={"id": "405", "name": "Dup"})
    assert r.status_code == 409
