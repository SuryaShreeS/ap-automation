"""Dashboards: every clickable cell must carry a filter that reproduces exactly the
count it displays (the click-through contract)."""

VARIANTS = ["all", "aging", "erp", "nonpo", "po", "co405410"]


def _search_count(client, filters: dict) -> int:
    criteria = [
        {"field": f, "op": (filters.get("ops") or {}).get(f, "="), "value": v}
        for f, v in filters["values"].items()
    ]
    return client.post("/search", json={"criteria": criteria}).json()["count"]


def test_every_clickable_cell_matches_its_filter(client):
    checked = 0
    for variant in VARIANTS:
        panels = client.get(f"/dashboards/overview?variant={variant}").json()["panels"]
        for p in panels:
            for row in p["rows"]:
                for cell in row["cells"]:
                    if not cell.get("clickable") or not cell.get("filters"):
                        continue
                    got = _search_count(client, cell["filters"])
                    assert got == cell["n"], (
                        f"{variant}/{p['id']}/{row['label']}: cell shows {cell['n']} but filter returns {got}"
                    )
                    checked += 1
    assert checked >= 30, f"expected a meaningful number of clickable cells, got {checked}"


def test_nonclickable_cells_have_no_filters(client):
    panels = client.get("/dashboards/overview?variant=all").json()["panels"]
    for p in panels:
        for row in p["rows"]:
            for cell in row["cells"]:
                if not cell.get("clickable"):
                    assert cell.get("filters") is None
