"""Thorough tests for the Advanced Search engine — operators, field kinds, all four
criteria tabs, combined AND, sort, and paging."""


def _search(client, criteria, **extra):
    return client.post("/search", json={"criteria": criteria, **extra}).json()


# ---------- the reported bug: "=" must be EXACT, not contains ----------
def test_platform_id_equals_is_exact_not_contains(client):
    # Typing "1" with "=" must NOT return every id containing a 1.
    d = _search(client, [{"field": "platformId", "op": "=", "value": "1"}])
    assert d["count"] == 0

def test_platform_id_equals_exact_hit(client):
    d = _search(client, [{"field": "platformId", "op": "=", "value": "108803"}])
    assert d["count"] == 1 and d["rows"][0]["invoiceNumber"] == "LL-3071"

def test_platform_id_like_partial(client):
    all_rows = _search(client, [])["count"]
    d = _search(client, [{"field": "platformId", "op": "LIKE", "value": "1088"}])
    assert 0 < d["count"] < all_rows
    assert all("1088" in r["platformId"] for r in d["rows"])


# ---------- empty / all ----------
# NB: the suite shares one seeded DB and another test creates an invoice, so the
# "all" total is asserted relatively (>= the 38-row seed) rather than hardcoded.
def test_empty_criteria_returns_all(client):
    assert _search(client, [])["count"] >= 38

def test_all_value_is_ignored(client):
    base = _search(client, [])["count"]
    assert _search(client, [{"field": "company", "op": "=", "value": "all"}])["count"] == base

def test_blank_value_is_ignored(client):
    base = _search(client, [])["count"]
    assert _search(client, [{"field": "vendorName", "op": "=", "value": "   "}])["count"] == base


# ---------- text operators ----------
def test_vendor_exact(client):
    """'=' returns every CarMax row and nothing else — exact, not a substring
    match (a fixture-count assertion here would break whenever seed data grows)."""
    d = _search(client, [{"field": "vendorName", "op": "=", "value": "CarMax"}])
    assert d["count"] >= 1
    assert all(r["vendorName"] == "CarMax" for r in d["rows"])
    # Exact must be narrower than contains — "CarMax" is not a substring of any
    # other vendor, so a wildcard search returns the same set.
    wild = _search(client, [{"field": "vendorName", "op": "LIKE", "value": "%CarMax%"}])
    assert wild["count"] == d["count"]

def test_vendor_exact_case_insensitive(client):
    upper = _search(client, [{"field": "vendorName", "op": "=", "value": "CarMax"}])
    lower = _search(client, [{"field": "vendorName", "op": "=", "value": "carmax"}])
    assert lower["count"] == upper["count"] >= 1

def test_wildcard_begins_ends_contains(client):
    begins = _search(client, [{"field": "invoiceNumber", "op": "LIKE", "value": "INV-%"}])
    assert begins["count"] >= 1 and all(r["invoiceNumber"].startswith("INV-") for r in begins["rows"])
    contains = _search(client, [{"field": "vendorName", "op": "LIKE", "value": "%sulfur%"}])
    assert all("sulfur" in r["vendorName"].lower() for r in contains["rows"])

def test_not_equal_operator(client):
    total = _search(client, [])["count"]
    automatch = _search(client, [{"field": "status", "op": "=", "value": "AUTOMATCH"}])["count"]
    neq = _search(client, [{"field": "status", "op": "<>", "value": "AUTOMATCH"}])
    assert neq["count"] == total - automatch
    assert all(r["status"] != "AUTOMATCH" for r in neq["rows"])


# ---------- numeric operators ----------
def test_numeric_gt(client):
    d = _search(client, [{"field": "netTotal", "op": ">", "value": "100000"}])
    # ≥2 from the seed (SUM-2044, LL-3071); inflow samples may add more.
    assert d["count"] >= 2 and all(r["net"] > 100000 for r in d["rows"])

def test_numeric_lt(client):
    d = _search(client, [{"field": "netTotal", "op": "<", "value": "1000"}])
    assert d["count"] >= 1 and all(r["net"] < 1000 for r in d["rows"])

def test_numeric_between(client):
    d = _search(client, [{"field": "netTotal", "op": "BETWEEN", "value": "5000..7000"}])
    assert d["count"] >= 1 and all(5000 <= r["net"] <= 7000 for r in d["rows"])

def test_numeric_equals_term_days(client):
    d = _search(client, [{"field": "termDays", "op": "=", "value": "45"}])
    assert d["count"] >= 1 and all(r["termDays"] == 45 for r in d["rows"])


# ---------- exact select fields ----------
def test_currency_cad(client):
    d = _search(client, [{"field": "currency", "op": "=", "value": "CAD"}])
    assert d["count"] >= 1 and all(r["currency"] == "CAD" for r in d["rows"])

def test_status_exact(client):
    d = _search(client, [{"field": "status", "op": "=", "value": "ERROR"}])
    assert all(r["status"] == "ERROR" for r in d["rows"])


# ---------- combined AND ----------
def test_combined_and(client):
    d = _search(client, [
        {"field": "company", "op": "=", "value": "405"},
        {"field": "status", "op": "=", "value": "AUTOMATCH"},
    ])
    assert all(r["co"] == "405" and r["status"] == "AUTOMATCH" for r in d["rows"])
    # AND narrows: never more than either single filter.
    only_co = _search(client, [{"field": "company", "op": "=", "value": "405"}])["count"]
    assert d["count"] <= only_co


# ---------- related-record tabs ----------
def test_line_field_filter(client):
    d = _search(client, [{"field": "lineSalesChannel", "op": "=", "value": "SOLIDS"}])
    assert d["count"] >= 1

def test_line_description_like(client):
    d = _search(client, [{"field": "lineDescription", "op": "LIKE", "value": "%sulfur%"}])
    assert d["count"] >= 1

def test_receipt_number_like(client):
    d = _search(client, [{"field": "receiptNumber", "op": "LIKE", "value": "R26"}])
    # Only invoices that actually have receipts (INV-88412, SUM-2044, LL-3071).
    assert d["count"] >= 1
    invs = {r["invoiceNumber"] for r in d["rows"]}
    assert "INV-88412" in invs

def test_note_text_like(client):
    d = _search(client, [{"field": "noteText", "op": "LIKE", "value": "%duplicate check%"}])
    assert d["count"] >= 38  # every seeded invoice (and inflow arrivals) carry the ingest note


# ---------- sort + paging ----------
def test_sort_desc_then_asc(client):
    desc = _search(client, [], sortField="platformId", sortDir="desc")["rows"]
    asc = _search(client, [], sortField="platformId", sortDir="asc")["rows"]
    assert [r["platformId"] for r in desc] == sorted((r["platformId"] for r in desc), reverse=True)
    assert asc[0]["platformId"] != desc[0]["platformId"]

def test_page_size_caps_rows_not_count(client):
    full = _search(client, [])["count"]
    d = _search(client, [], pageSize=5)
    assert d["count"] == full and len(d["rows"]) == 5 and full > 5


# ---------- export ----------
def test_export_xlsx(client):
    r = client.post("/search/export", json={"criteria": [{"field": "vendorName", "op": "LIKE", "value": "%sulfur%"}]})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    assert len(r.content) > 0
