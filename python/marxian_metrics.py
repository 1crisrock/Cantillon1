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


# --------------------------------------------------------------------------- #
# CGI-IMO decomposition — INDEC national accounts as primary source
# --------------------------------------------------------------------------- #
def decompose_cgi_imo(cgi_ts: dict[str, dict[str, float]],
                      imb_alpha: float = 0.5) -> dict:
    """Decompose using INDEC CGI-IMO data as the primary value source.

    v = RTA + α × IMB     (variable capital: wages + proportional mixed income)
    s = EBE + (1-α) × IMB (surplus value: operating surplus + proportional mixed income)
    c = VAB − v − s       (constant capital: residual, ≈ other taxes net + depreciation)

    imb_alpha: share of IMB allocated to v (0.0–1.0, default 0.5).
    """
    total_rta = 0.0
    total_ebe = 0.0
    total_imb = 0.0
    total_vab = 0.0
    quarters = sorted(cgi_ts.keys())
    for q in quarters:
        row = cgi_ts[q]
        total_rta += row.get("RTA", 0.0)
        total_ebe += row.get("EBE", 0.0)
        total_imb += row.get("IMB", 0.0)
        total_vab += row.get("VAB_pb", 0.0)

    v = total_rta + imb_alpha * total_imb
    s = total_ebe + (1 - imb_alpha) * total_imb
    c = total_vab - v - s  # residual
    total = total_vab

    return {
        "side": "cgi_imo",
        "c": round(c, 2),
        "v": round(v, 2),
        "s": round(s, 2),
        "total": round(total, 2),
        "imComponents": {
            "rta": round(total_rta, 2),
            "ebe": round(total_ebe, 2),
            "imb": round(total_imb, 2),
            "vab": round(total_vab, 2),
            "imb_alpha": imb_alpha,
        },
        "unclassified": [],
    }


def decompose_cgi_imo_quarterly(cgi_ts: dict[str, dict[str, float]],
                                 imb_alpha: float = 0.5) -> list[dict]:
    """Quarterly path using CGI-IMO RTA/EBE/IMB directly per quarter.

    Unlike the fiscal mode which models quarterly shares from GDP/wage indexes,
    CGI-IMO provides actual quarterly national-accounts values.
    """
    out: list[dict] = []
    for q in sorted(cgi_ts.keys()):
        row = cgi_ts[q]
        rta = row.get("RTA", 0.0)
        ebe = row.get("EBE", 0.0)
        imb = row.get("IMB", 0.0)
        vab = row.get("VAB_pb", 0.0)

        v = rta + imb_alpha * imb
        s = ebe + (1 - imb_alpha) * imb
        c = vab - v - s
        t = vab

        out.append({
            "q": q,
            "c": round(c, 2),
            "v": round(v, 2),
            "s": round(s, 2),
            "total": round(t, 2),
            "c_v": round(c / v, 3) if v else None,
            "s_v": round(s / v, 3) if v else None,
            "p_prime": round(s / (c + v), 3) if (c + v) else None,
        })
    return out


def _resolve_source(source: str, period: str,
                    ds: data_loader.DataSource) -> str:
    """Resolve source='auto' to 'fiscal' or 'cgi_imo' based on data availability."""
    if source == "fiscal":
        return "fiscal"
    if source == "cgi_imo":
        return "cgi_imo" if ds.has_cgi_imo(period) else "fiscal"
    # auto: prefer cgi_imo if 80%+ quarters available
    return "cgi_imo" if ds.has_cgi_imo(period) else "fiscal"


def compute_all(period: str = "milei", mode: str = "nominal",
                ds: data_loader.DataSource | None = None,
                source: str = "auto", imb_alpha: float = 0.5) -> dict:
    ds = ds or data_loader.DataSource()
    flows = ds.fiscal_flows(period, mode)
    series_rows = ds.timeseries(period, "nominal")

    # Resolve source mode
    resolved_source = _resolve_source(source, period, ds)

    if resolved_source == "cgi_imo":
        return _compute_cgi_imo(period, mode, ds, flows, series_rows, imb_alpha)
    else:
        return _compute_fiscal(period, mode, ds, flows, series_rows)


def _compute_fiscal(period, mode, ds, flows, series_rows):
    """Original fiscal-flow based computation."""
    decompositions = {"destination": decompose(flows, "destination"), "source": decompose(flows, "source")}
    dest = decompositions["destination"]

    # CGI-IMO overlay: fetch INDEC data when available
    cgi_imo = None
    try:
        cgi_imo = ds.cgi_imo_totals()
    except Exception:
        pass

    # EPH data: prefer real microdata over proxy index
    eph_data = None
    eph_quarterly = None
    try:
        eph_data = ds.eph_metrics(period)
        eph_quarterly = ds.eph_quarterly(period)
    except Exception:
        pass

    if eph_quarterly:
        ra = reserve_army_eph(eph_quarterly)
    else:
        ra = reserve_army_series(series_rows)

    return {
        "period": period,
        "mode": mode,
        "source_mode": "fiscal",
        "decomposition": decompositions,
        "quarterly": quarterly_decomposition(flows, series_rows),
        "reserve_army": ra,
        "eph": eph_data,
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
        "cgi_imo": cgi_imo,
    }


def _compute_cgi_imo(period, mode, ds, flows, series_rows, imb_alpha):
    """CGI-IMO national accounts as primary value source."""
    cgi_ts = ds.cgi_imo_ts(period)
    dec = decompose_cgi_imo(cgi_ts, imb_alpha)
    quarterly = decompose_cgi_imo_quarterly(cgi_ts, imb_alpha)

    # Ratio computations use the period-level decomposition directly
    def _srv(d):
        return {"value": round(d["s"] / d["v"], 3) if d["v"] else None,
                "formula": "s' = s / v", **d}

    def _occ(d):
        return {"value": round(d["c"] / d["v"], 3) if d["v"] else None,
                "formula": "q = c / v", **d}

    def _rop(d):
        return {"value": round(d["s"] / (d["c"] + d["v"]), 3) if (d["c"] + d["v"]) else None,
                "formula": "p' = s / (c + v)", **d}

    # CGI-IMO overlay for KPIs
    cgi_imo_totals = None
    try:
        cgi_imo_totals = ds.cgi_imo_totals()
    except Exception:
        pass

    # EPH data: prefer real microdata over proxy index
    eph_data = None
    eph_quarterly = None
    try:
        eph_data = ds.eph_metrics(period)
        eph_quarterly = ds.eph_quarterly(period)
    except Exception:
        pass

    if eph_quarterly:
        ra = reserve_army_eph(eph_quarterly)
    else:
        ra = reserve_army_series(series_rows)

    return {
        "period": period,
        "mode": mode,
        "source_mode": "cgi_imo",
        "decomposition": {"destination": dec},
        "quarterly": quarterly,
        "reserve_army": ra,
        "eph": eph_data,
        "value_identity": {
            "c_plus_v_plus_s": round(dec["c"] + dec["v"] + dec["s"], 2),
            "sum_of_flows": round(dec["total"], 2),
            "balanced": abs(dec["c"] + dec["v"] + dec["s"] - dec["total"]) < 1.0,
        },
        "ratios": {
            "rate_of_surplus_value": _srv(dec),
            "organic_composition": _occ(dec),
            "rate_of_profit": _rop(dec),
        },
        "flow_labels": {
            "c": "constant capital (VAB residual)",
            "v": f"variable capital (RTA + {imb_alpha:.0%} IMB)",
            "s": f"surplus value (EBE + {1-imb_alpha:.0%} IMB)",
        },
        "cgi_imo": cgi_imo_totals,
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


def reserve_army_eph(eph_quarterly: list[dict]) -> list[dict]:
    """Build reserve army index from real EPH microdata.

    Uses the EIR (Ejército Industrial de Reserva) / PEA ratio as the primary
    indicator, normalized to 100 at the series start. Falls back to
    unemployment rate when EIR is unavailable.

    Each row in eph_quarterly should have:
      q, eir_sobre_pea (or tasa_desempleo as fallback), eir_total
    """
    if not eph_quarterly:
        return []
    # Prefer EIR/PEA ratio; fall back to unemployment rate
    values = []
    for row in eph_quarterly:
        v = row.get("eir_sobre_pea") or row.get("tasa_desempleo") or 0.0
        values.append(v)

    baseline = values[0] if values else 1.0
    if baseline == 0:
        baseline = 1.0

    out = []
    for i, row in enumerate(eph_quarterly):
        idx = round((values[i] / baseline) * 100.0, 1) if baseline else 0.0
        out.append({
            "q": row["q"],
            "value": idx,
            "eph_raw": {
                "eir_sobre_pea": row.get("eir_sobre_pea", 0),
                "tasa_desempleo": row.get("tasa_desempleo", 0),
                "tasa_informalidad": row.get("tasa_informalidad", 0),
                "eir_total": row.get("eir_total", 0),
                "eir_flotante": row.get("eir_flotante", 0),
                "eir_latente": row.get("eir_latente", 0),
                "eir_estancado": row.get("eir_estancado", 0),
            },
        })
    return out


if __name__ == "__main__":
    for period in ("kirchner", "macri", "fernandez", "milei"):
        for source in ("auto",):
            report = compute_all(period, "nominal", source=source)
            r = report["ratios"]
            sm = report["source_mode"]
            print(f"[{period.upper():9s}] src={sm:7s} s'={r['rate_of_surplus_value']['value']:>6.2f} | "
                  f"c/v={r['organic_composition']['value']:>6.2f} | "
                  f"p'={r['rate_of_profit']['value']:>6.3f} | "
                  f"c={report['decomposition']['destination']['c']:.1f} "
                  f"v={report['decomposition']['destination']['v']:.1f} "
                  f"s={report['decomposition']['destination']['s']:.1f}")
