"""App B metric engine — Marxian value categories over the fiscal flows.

Maps every fiscal source/destination to a value category:

  c — constant capital (means of production): energy & transport subsidies
  v — variable capital (reproduction of labor power): pensions, wages, health/education
  s — surplus value (captured above reproduction): debt interest, finance,
      quasi-fiscal, income/consumption/financial taxes, state apparatus

Classic ratios (Marx, Das Kapital I, ch. 9-13):

  rate of surplus value  s' = s / v          (exploitation rate)
  organic composition    q  = c / v          (OCC)
  rate of profit         p' = s / (c + v)    (profitability of total capital)

The category mapping is interpretive by design and fully configurable — pass
custom source/destination maps to override the defaults.
"""
from __future__ import annotations

from . import data_loader

CATEGORIES = ("c", "v", "s")

# Destination (distribution) side — where extracted value is spent
DESTINATION_CATEGORIES: dict[str, str] = {
    "ANSES (Pensions)": "v",
    "Public Wages": "v",
    "Health & Education": "v",
    "Energy Subsidies": "c",
    "Transport Subsidies": "c",
    "Provinces": "s",
    "Debt Interest": "s",
    "BCRA Quasi-Fiscal": "s",
    "Other Ministries": "s",
}

# Source (extraction) side — which value category each levy drains
SOURCE_CATEGORIES: dict[str, str] = {
    "Social Security": "v",        # payroll levy on the wage fund
    "IVA (VAT)": "s",              # consumption tax on wage spend -> surplus
    "Income Tax": "s",
    "Export Duties": "s",          # extraction from Dept I surplus
    "Debits & Credits": "s",       # financial turnover tax
    "Inflation Tax": "s",
    "Debt Issuance": "s",          # fictitious capital claim on future surplus
    "Fuel Tax": "s",
    "Other Taxes": "s",
    "PAIS Tax": "s",
}


def _classify(items: list[dict], mapping: dict[str, str]) -> tuple[dict[str, float], list[str]]:
    totals = {k: 0.0 for k in CATEGORIES}
    unclassified: list[str] = []
    for item in items:
        cat = mapping.get(item["name"])
        if cat in CATEGORIES:
            totals[cat] += item["value"]
        else:
            unclassified.append(item["name"])
    return totals, unclassified


def decompose(flows: dict, side: str = "destination",
              source_map: dict[str, str] | None = None,
              dest_map: dict[str, str] | None = None) -> dict:
    """Decompose fiscal flows into c / v / s on the chosen side.

    side="destination": the distribution side (where extracted value is spent).
    side="source":      the extraction side (which value category each levy hits).
    """
    mapping = dest_map or DESTINATION_CATEGORIES
    items = flows.get("destinations", [])
    if side == "source":
        mapping = source_map or SOURCE_CATEGORIES
        items = flows.get("sources", [])
    totals, unclassified = _classify(items, mapping)
    total = totals["c"] + totals["v"] + totals["s"]
    return {
        "side": side,
        "c": round(totals["c"], 2),
        "v": round(totals["v"], 2),
        "s": round(totals["s"], 2),
        "total": round(total, 2),
        "unclassified": unclassified,
    }


def rate_of_surplus_value(flows: dict, side: str = "destination", **maps) -> dict:
    """s' = s / v — exploitation rate. None when v == 0."""
    d = decompose(flows, side, **maps)
    return {
        "value": round(d["s"] / d["v"], 3) if d["v"] else None,
        "formula": "s' = s / v",
        **d,
    }


def organic_composition(flows: dict, side: str = "destination", **maps) -> dict:
    """q = c / v — organic composition of capital. None when v == 0."""
    d = decompose(flows, side, **maps)
    return {
        "value": round(d["c"] / d["v"], 3) if d["v"] else None,
        "formula": "q = c / v",
        **d,
    }


def rate_of_profit(flows: dict, side: str = "destination", **maps) -> dict:
    """p' = s / (c + v) — profitability of total capital."""
    d = decompose(flows, side, **maps)
    return {
        "value": round(d["s"] / (d["c"] + d["v"]), 3) if (d["c"] + d["v"]) else None,
        "formula": "p' = s / (c + v)",
        **d,
    }


def compute_all(period: str = "milei", mode: str = "nominal",
                ds: data_loader.DataSource | None = None) -> dict:
    ds = ds or data_loader.DataSource()
    flows = ds.fiscal_flows(period, mode)
    decompositions = {"destination": decompose(flows, "destination"), "source": decompose(flows, "source")}
    dest = decompositions["destination"]
    series_rows = ds.timeseries(period, "nominal")
    return {
        "period": period,
        "mode": mode,
        "decomposition": decompositions,
        "quarterly": quarterly_decomposition(flows, series_rows),
        "reserve_army": reserve_army_series(series_rows),
        "value_identity": {
            "c_plus_v_plus_s": round(dest["c"] + dest["v"] + dest["s"], 2),
            "sum_of_flows": round(sum(d["value"] for d in flows.get("destinations", [])), 2),
            "balanced": abs(dest["c"] + dest["v"] + dest["s"] - sum(
                d["value"] for d in flows.get("destinations", [])
            )) < 0.05,
        },
        "ratios": {
            "rate_of_surplus_value": rate_of_surplus_value(flows),
            "organic_composition": organic_composition(flows),
            "rate_of_profit": rate_of_profit(flows),
        },
        "flow_labels": {
            "c": "constant capital (means of production)",
            "v": "variable capital (reproduction of labor power)",
            "s": "surplus value (capture above reproduction)",
        },
    }


def quarterly_decomposition(flows: dict, rows: list[dict]) -> list[dict]:
    """Model the period's c/v/s fiscal decomposition across quarters.

    Fiscal flows are a per-period snapshot, so the quarterly path is modeled
    transparently: each quarter receives a share of the period's real totals,
    with the *shape* driven by observable macro indexes from the quarterly series

      c  ∝ real GDP index (activity -> means-of-production flows)
      v  ∝ real wage index (reproduction of labor power)
      s  = total - c - v  (residual surplus capture)

    Period totals (C, V, S) are preserved exactly. Ratio series (c/v, s/v, p')
    therefore evolve quarter to quarter while staying anchored to the fiscal data.
    """
    d = decompose(flows, "destination")
    C, V, S = d["c"], d["v"], d["s"]
    T = C + V + S
    gs = [float(r.get("gdp") or 0.0) for r in rows]
    ws = [float(r.get("wage") or 0.0) for r in rows]
    gsum = sum(gs) or 1.0
    wsum = sum(ws) or 1.0
    c_shares = [C * g / gsum for g in gs]
    v_shares = [V * w / wsum for w in ws]
    t_shares = [T * g / gsum for g in gs]

    out: list[dict] = []
    for i, r in enumerate(rows):
        c, v, t = c_shares[i], v_shares[i], t_shares[i]
        s = t - c - v
        out.append({
            "q": r.get("q"),
            "c": round(c, 2),
            "v": round(v, 2),
            "s": round(s, 2),
            "total": round(t, 2),
            "c_v": round(c / v, 3) if v else None,
            "s_v": round(s / v, 3) if v else None,
            "p_prime": round(s / (c + v), 3) if (c + v) else None,
        })
    return out


def reserve_army_series(rows: list[dict]) -> list[dict]:
    """Custom index of the relative surplus population (industrial reserve army).

    Marx's reserve army swells when labor is (a) displaced by a rising organic
    composition and (b) cheapened relative to its reproduction cost. We proxy the
    pressure with observable indexes, normalized to 100 at the series start:

      wage-pressure  pw = wage_peak / wage       (real wage below its peak)
      slack-pressure pg = gdp_peak / gdp         (activity below its peak)
      inflation-lag  pi = 1 + cpi/100            (wage lag vs prices)

      index = 100 * (pw^0.6 * pg^0.25 * pi^0.15) / baseline
    """
    if not rows:
        return []
    wages = [float(r.get("wage") or 0.0) for r in rows]
    gdps = [float(r.get("gdp") or 0.0) for r in rows]
    wage_peak = max(wages) or 1.0
    gdp_peak = max(gdps) or 1.0

    baseline = None
    out: list[dict] = []
    for r in rows:
        pw = wage_peak / max(float(r.get("wage") or 0.01), 0.01)
        pg = gdp_peak / max(float(r.get("gdp") or 0.01), 0.01)
        pi = 1.0 + (float(r.get("cpi") or 0.0)) / 100.0
        raw = (pw ** 0.6) * (pg ** 0.25) * (pi ** 0.15)
        if baseline is None:
            baseline = raw
        out.append({"q": r.get("q"), "value": round(raw / baseline * 100.0, 1)})
    return out


if __name__ == "__main__":
    for period in ("kirchner", "macri", "fernandez", "milei"):
        report = compute_all(period)
        r = report["ratios"]
        print(f"[{period.upper():9s}] s'={r['rate_of_surplus_value']['value']:>6.2f} | "
              f"c/v={r['organic_composition']['value']:>6.2f} | "
              f"p'={r['rate_of_profit']['value']:>6.3f} | "
              f"c={report['decomposition']['destination']['c']:.1f} "
              f"v={report['decomposition']['destination']['v']:.1f} "
              f"s={report['decomposition']['destination']['s']:.1f}")
