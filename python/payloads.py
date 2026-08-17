"""Payload shaping — converts engine reports into UI-ready JSON:

  * charts — chronological data arrays / Plotly-style traces
  * kpis   — Bloomberg-style KPI grid (value, unit, tone, formula, band)
  * sankey — matrix + node/link maps for Sankey flow diagrams

Each builder returns {"charts": {...}, "kpis": [...], "sankey": {...}} and the
CLI bridge (serve.py) wraps them with engine/period/mode metadata.
"""
from __future__ import annotations

from .marxian_metrics import SOURCE_CATEGORIES
from . import data_loader

TONE_GREEN = "positive"
TONE_AMBER = "warning"
TONE_RED = "critical"
TONE_NEUTRAL = "neutral"


def kpi(key, label, value, unit="", tone=TONE_NEUTRAL, formula=None, band=None, note=None):
    if isinstance(value, float):
        value = round(value, 2)
    return {
        "key": key,
        "label": label,
        "value": value,
        "unit": unit,
        "tone": tone,
        "band": band,
        "formula": formula,
        "note": note,
    }


def _pressure_tone(score: float) -> str:
    if score >= 75:
        return TONE_RED
    if score >= 25:
        return TONE_AMBER
    return TONE_GREEN


def _mdr_tone(value: float) -> str:
    if value > 1.5:
        return TONE_RED
    if value > 1.0:
        return TONE_AMBER
    return TONE_GREEN


def _scatter(name, x, y, unit=""):
    return {"name": name, "type": "scatter", "x": x, "y": y, "unit": unit}


def _bar(name, labels, values, unit=""):
    return {"name": name, "type": "bar", "x": labels, "y": values, "unit": unit}


# --------------------------------------------------------------------------- #
# App A — CMPI / FPI
# --------------------------------------------------------------------------- #
def build_app_a(period, mode, report, series, flows):
    md = report["monetary_dilution"]
    cv = report["cantillon_vector"]
    fc = report["fiscal_capture"]
    cmpi = report["cmpi"]
    fpi = report["fpi"]
    quarters = [d["q"] for d in series]
    mdr_series = md["series"]

    charts = {
        "x": quarters,
        "traces": [
            _scatter("MDR", [d["q"] for d in mdr_series], [d["value"] for d in mdr_series], "x"),
            _scatter("CMPI (0-100)", [d["q"] for d in report["cmpi_series"]],
                     [d["score"] for d in report["cmpi_series"]], "score"),
            _scatter("CPI YoY", quarters, [d["cpi"] for d in series], "%"),
            _scatter("Monetary Base (MB)", quarters, [d["mb"] for d in series], "T ARS"),
            _scatter("Remunerated Liab (RL)", quarters, [d["rl"] for d in series], "T ARS"),
        ],
        "layout_hint": {
            "title": f"Cantillon Monetary Pressure — {period}",
            "xaxis": "Quarter", "yaxis": "value",
        },
    }

    kpis = [
        kpi("mdr", "Monetary Dilution Ratio", md["current"], "x",
            _mdr_tone(md["current"]), "RL / MB"),
        kpi("mdr_peak", "MDR Peak", md["peak"], "x", TONE_AMBER),
        kpi("mdr_delta", "MDR Change", md["delta_pct"], "%",
            TONE_RED if md["delta_pct"] > 0 else TONE_GREEN),
        kpi("cantillon_gap", "Cantillon Gap", cv["cantillon_gap"], "pp",
            TONE_RED if cv["cantillon_gap"] > 30 else TONE_AMBER if cv["cantillon_gap"] > 10 else TONE_GREEN,
            "Assets vs Real Wages"),
        kpi("bs_growth", "Balance-Sheet Growth", cv["balance_sheet_growth"], "%"),
        kpi("asset_growth", "Equities (USD) Growth", cv["asset_growth"], "%"),
        kpi("wage_growth", "Real Wage Growth", cv["wage_growth"], "%"),
        kpi("fcr", "Fiscal Capture Ratio", fc["ratio"], "%",
            TONE_AMBER if fc["ratio"] > 0.15 else TONE_GREEN,
            "(Energy + Transport Subsidies) / Total Extraction"),
        kpi("inflation_tax_share", "Inflation-Tax Share", fc["inflation_tax_share"], "%", TONE_AMBER),
        kpi("cmpi", "CMPI", cmpi["score"], "0-100", _pressure_tone(cmpi["score"]),
            cmpi["formula"], cmpi["band"]),
        kpi("fpi", "FPI", fpi["score"], "0-100", _pressure_tone(fpi["score"]),
            fpi["formula"], fpi["band"]),
    ]

    source_idx = {s["name"]: i for i, s in enumerate(flows["sources"])}
    dest_offset = len(flows["sources"])
    dest_idx = {d["name"]: dest_offset + i for i, d in enumerate(flows["destinations"])}
    sankey = {
        "nodes": [
            {"name": s["name"], "category": s["category"], "side": "source"} for s in flows["sources"]
        ] + [
            {"name": d["name"], "category": d["category"], "side": "destination"}
            for d in flows["destinations"]
        ],
        "links": [
            {
                "source": source_idx[l["source"]],
                "target": dest_idx[l["target"]],
                "source_name": l["source"],
                "target_name": l["target"],
                "value": l["value"],
            }
            for l in flows["links"]
        ],
        "matrix": None,
    }

    return {"charts": charts, "kpis": kpis, "sankey": sankey, "raw": report}


# --------------------------------------------------------------------------- #
# App B — Marxian value decomposition
# --------------------------------------------------------------------------- #
def build_app_b(period, mode, report, flows, real_term=100, imb_alpha=0.5):
    dec = report["decomposition"]["destination"]
    ratios = report["ratios"]
    srv, occ, rop = ratios["rate_of_surplus_value"], ratios["organic_composition"], ratios["rate_of_profit"]
    quarterly = report.get("quarterly", [])
    reserve_army = report.get("reserve_army", [])
    quarters = [r["q"] for r in quarterly]
    source_mode = report.get("source_mode", "fiscal")
    flow_labels = report.get("flow_labels", {})

    # Real-term blend: 100% -> constant-2024 USD (B USD), 0% -> real ARS (T).
    # Ratios are scale-invariant; this only rescales levels (decomposition, bars).
    if source_mode == "cgi_imo":
        # CGI-IMO values are in M ARS; scale to B ARS for display
        scale = 1.0 / 1000.0  # M ARS → B ARS
        unit = "B ARS (INDEC)" if mode != "usd" else "B USD (INDEC)"
        if mode == "usd":
            scale = data_loader.USD_FACTOR / 1000.0  # M ARS → B USD
    elif mode == "usd":
        scale = 1.0 + (data_loader.USD_FACTOR - 1.0) * (real_term / 100.0)
        unit = "B USD" if real_term >= 100 else f"B USD (RT {real_term:.0f}%)"
    else:
        scale, unit = 1.0, "T ARS (2024 real)"

    c, v, s = dec["c"] * scale, dec["v"] * scale, dec["s"] * scale
    labels = ["c (constant)", "v (variable)", "s (surplus)"]
    values = [round(c, 2), round(v, 2), round(s, 2)]

    q_vals = [round(r["c"] * scale, 2) for r in quarterly]
    v_vals = [round(r["v"] * scale, 2) for r in quarterly]
    s_vals = [round(r["s"] * scale, 2) for r in quarterly]

    traces = [
        _bar("Value decomposition", labels, values, unit),
        {"name": "Share", "type": "pie", "labels": labels, "values": values, "unit": "%"},
    ]
    if quarters:
        traces += [
            _scatter("Organic Composition (c/v)", quarters, [r["c_v"] for r in quarterly], "x"),
            _scatter("Rate of Surplus Value (s/v)", quarters, [r["s_v"] for r in quarterly], "x"),
            _scatter("Rate of Profit (p')", quarters, [r["p_prime"] for r in quarterly], "x"),
            _scatter("Reserve Army Index", [x["q"] for x in reserve_army], [x["value"] for x in reserve_army], "idx"),
        ]
    charts = {
        "x": quarters or labels,
        "traces": traces,
        "layout_hint": {"title": f"Marxian value accounts — {period}", "xaxis": "Quarter"},
    }

    ra_latest = reserve_army[-1]["value"] if reserve_army else None
    kpis = [
        kpi("rate_of_surplus_value", "Rate of Surplus Value (s')", srv["value"], "x",
            TONE_AMBER if (srv["value"] or 0) > 1 else TONE_GREEN, "s' = s / v"),
        kpi("organic_composition", "Organic Composition (c/v)", occ["value"], "x",
            TONE_NEUTRAL, "q = c / v"),
        kpi("rate_of_profit", "Rate of Profit (p')", rop["value"], "x",
            TONE_NEUTRAL, "p' = s / (c + v)"),
        kpi("reserve_army", "Reserve Army Index", ra_latest, "idx",
            TONE_AMBER if (ra_latest or 0) > 110 else TONE_GREEN,
            "custom index (peak wage / peak gdp / CPI)"),
        kpi("c", flow_labels.get("c", "Constant Capital"), round(c, 2), unit, TONE_NEUTRAL),
        kpi("v", flow_labels.get("v", "Variable Capital"), round(v, 2), unit, TONE_GREEN),
        kpi("s", flow_labels.get("s", "Surplus Value"), round(s, 2), unit, TONE_RED),
        kpi("source_mode", "Data Source", source_mode, "",
            TONE_GREEN if source_mode == "cgi_imo" else TONE_NEUTRAL,
            "fiscal (budget) vs cgi_imo (INDEC national accounts)"),
    ]

    # CGI-IMO overlay: real INDEC national accounts data (always show if available)
    cgi_imo = report.get("cgi_imo")
    if cgi_imo:
        series_list = cgi_imo.get("series", [])
        for series in series_list:
            var = series.get("_id", {}).get("variable")
            val = series.get("latest_value")
            period_range = f"{series.get('min_period', '')} → {series.get('max_period', '')}"
            if var == "RTA_PCT" and val is not None:
                kpis.append(kpi("cgi_rta_pct", "RTA % GDP (INDEC)", round(val, 2), "%",
                                TONE_GREEN, f"CGI-IMO {period_range}"))
            elif var == "EBE_PCT" and val is not None:
                kpis.append(kpi("cgi_ebe_pct", "EBE % GDP (INDEC)", round(val, 2), "%",
                                TONE_GREEN, f"CGI-IMO {period_range}"))
            elif var == "IMO_JOBS" and val is not None:
                kpis.append(kpi("cgi_imo_jobs", "IMO Jobs (INDEC)", round(val, 2), "thousand",
                                TONE_NEUTRAL, f"CGI-IMO {period_range}"))

    cats = ["c", "v", "s"]
    src = flows.get("sources", [])
    cat_offset = len(src)
    cat_idx = {c: cat_offset + i for i, c in enumerate(cats)}
    sankey = {
        "nodes": [{"name": s["name"], "side": "source"} for s in src] + [
            {"name": c, "side": "category", "category": c} for c in cats
        ],
        "links": [
            {
                "source": i,
                "target": cat_idx[SOURCE_CATEGORIES.get(s["name"], "s")],
                "source_name": s["name"],
                "target_name": SOURCE_CATEGORIES.get(s["name"], "s"),
                "value": round(s["value"] * scale, 2),
            }
            for i, s in enumerate(src)
        ],
        "matrix": None,
    }

    # EPH (Encuesta Permanente de Hogares) overlay — real INDEC microdata
    eph = report.get("eph")
    if eph and eph.get("quarter_count", 0) > 0:
        desglose = eph.get("Desglose_EIR", {})
        kpis.extend([
            kpi("eph_status", "EPH Data", "Available", "",
                TONE_GREEN, f"INDEC EPH ({eph.get('quarter_count', 0)} quarters)"),
            kpi("eph_desempleo", "Unemployment Rate (EPH)", eph.get("Tasa_Desempleo_pct", 0), "%",
                TONE_RED if (eph.get("Tasa_Desempleo_pct", 0) or 0) > 10 else TONE_AMBER,
                "Tasa de Desempleo — INDEC EPH"),
            kpi("eph_informalidad", "Informal Employment (EPH)", eph.get("Tasa_Informalidad_Asalariada_pct", 0), "%",
                TONE_RED if (eph.get("Tasa_Informalidad_Asalariada_pct", 0) or 0) > 40 else TONE_AMBER,
                "Tasa de Informalidad — asalariados sin descuento jubilatorio"),
            kpi("eph_precarizacion", "Precarization Rate (EPH)", eph.get("Tasa_Precarizacion_General_pct", 0), "%",
                TONE_AMBER,
                "Informales + cuentapropia precaria / ocupados totales"),
            kpi("eph_eir_pea", "EIR / PEA Ratio (EPH)", eph.get("EIR_sobre_PEA_pct", 0), "%",
                TONE_RED if (eph.get("EIR_sobre_PEA_pct", 0) or 0) > 20 else TONE_AMBER,
                "Población sobrante relativa / PEA — Ejército Industrial de Reserva"),
            kpi("eph_eir_flotante", "EIR Flotante (EPH)",
                desglose.get("Flotante_pct_del_EIR", 0), "%",
                TONE_NEUTRAL, "Subocupados + asalariados informales"),
            kpi("eph_eir_latente", "EIR Latente (EPH)",
                desglose.get("Latente_pct_del_EIR", 0), "%",
                TONE_NEUTRAL, "Desalentados + trabajadores familiares sin remuneración"),
            kpi("eph_eir_estancado", "EIR Estancado (EPH)",
                desglose.get("Estancado_pct_del_EIR", 0), "%",
                TONE_AMBER, "Desempleados de larga duración (>= 1 año)"),
        ])

    matrix = {
        "columns": ["Quarter", "c", "v", "s", "c/v", "s/v", "p'"],
        "unit": unit,
        "rows": [
            {
                "q": r["q"],
                "c": round(r["c"] * scale, 2),
                "v": round(r["v"] * scale, 2),
                "s": round(r["s"] * scale, 2),
                "c_v": r["c_v"],
                "s_v": r["s_v"],
                "p_prime": r["p_prime"],
            }
            for r in quarterly
        ],
    }

    return {"charts": charts, "kpis": kpis, "matrix": matrix,
            "reserveArmy": reserve_army, "sankey": sankey, "raw": report,
            "eph": report.get("eph")}


# --------------------------------------------------------------------------- #
# App C — Super-Sankey reproduction pipelines
# --------------------------------------------------------------------------- #
def build_app_c(period, mode, report):
    dept = report["department_totals"]
    matrix = report["departmental_flow_matrix"]
    er = report["expanded_reproduction"]
    sr = report["simple_reproduction"]
    ew = er["economy_wide"]
    unit = report.get("flows_unit", "T ARS")
    cou_available = report.get("cou_available", False)

    dept_labels = ["Dept I\n(production)", "Dept II\n(consumption)", "Dept III\n(finance/state)"]
    src_vals = [dept["sources"][d] for d in (1, 2, 3)]
    dst_vals = [dept["destinations"][d] for d in (1, 2, 3)]
    acc = er["departments"]
    charts = {
        "x": dept_labels,
        "traces": [
            _bar("Sources (extraction)", dept_labels, src_vals, unit),
            _bar("Destinations (spend)", dept_labels, dst_vals, unit),
            _bar("Surplus consumed", dept_labels,
                 [acc[d]["s_consumed"] for d in (1, 2, 3)], unit),
            _bar("Δc accumulated", dept_labels, [acc[d]["delta_c"] for d in (1, 2, 3)], unit),
            _bar("Δv accumulated", dept_labels, [acc[d]["delta_v"] for d in (1, 2, 3)], unit),
        ],
        "layout_hint": {"title": f"Super-Sankey department flows — {period}"},
    }

    kpis = [
        kpi("dept1", "Dept I (production) output", dept["sources"][1], unit),
        kpi("dept2", "Dept II (consumption) output", dept["sources"][2], unit),
        kpi("dept3", "Dept III (finance/state) output", dept["sources"][3], unit,
            TONE_AMBER),
        kpi("balance_i", "Simple balance I (X1 − c)", sr["balance_I_x1_minus_c"], unit,
            TONE_GREEN if abs(sr["balance_I_x1_minus_c"]) < 1 else TONE_AMBER),
        kpi("balance_ii", "Simple balance II (X2 − v − s)", sr["balance_II_x2_minus_v_minus_s"], unit,
            TONE_AMBER),
        kpi("accumulation_rate", "Accumulation Rate", er["accumulation_rate"], "share",
            TONE_NEUTRAL, "surplus reinvested"),
        kpi("delta_c_total", "Accumulated Constant Capital (Δc)", ew["delta_c"], unit),
        kpi("delta_v_total", "Accumulated Variable Capital (Δv)", ew["delta_v"], unit),
        kpi("cou_status", "COU Data", "Available" if cou_available else "Not Available", "",
            TONE_GREEN if cou_available else TONE_AMBER,
            "INDEC COU 2018 (Supply and Use Tables)"),
    ]

    # Add COU-enhanced KPIs if available
    if cou_available:
        cou_enhanced = report.get("cou_enhanced_value_category", {})
        cou_fd = report.get("cou_final_demand", {})
        cou_va = report.get("cou_dept_value_added", {})

        if cou_fd:
            kpis.extend([
                kpi("cou_household", "Household Consumption (COU)", cou_fd.get("household_consumption", 0), unit,
                    TONE_NEUTRAL, "Final demand from COU"),
                kpi("cou_government", "Government Consumption (COU)", cou_fd.get("government_consumption", 0), unit,
                    TONE_NEUTRAL),
                kpi("cou_exports", "Exports (COU)", cou_fd.get("exports", 0), unit,
                    TONE_GREEN),
                kpi("cou_investment", "Investment (COU)", cou_fd.get("gross_fixed_capital_formation", 0), unit,
                    TONE_GREEN),
            ])

        if cou_va:
            for d in (1, 2, 3):
                dept_name = f"Dept {d}"
                vab = cou_va.get("dept_vab", {}).get(str(d), 0)
                vbp = cou_va.get("dept_vbp", {}).get(str(d), 0)
                kpis.extend([
                    kpi(f"cou_vab_{d}", f"{dept_name} VAB (COU)", vab, unit,
                        TONE_NEUTRAL, "Gross Value Added at basic prices"),
                    kpi(f"cou_vbp_{d}", f"{dept_name} VBP (COU)", vbp, unit,
                        TONE_NEUTRAL, "Gross Production at basic prices"),
                ])

    m = matrix["matrix"]
    sankey = {
        "nodes": [
            {"name": f"Dept {i}", "full_name": report["pipeline"]["department_names"][i],
             "index": i - 1} for i in (1, 2, 3)
        ],
        "links": [
            {"source": i - 1, "target": j - 1, "value": m[i][j],
             "source_dept": i, "target_dept": j}
            for i in (1, 2, 3) for j in (1, 2, 3) if m[i][j] > 0
        ],
        "matrix": m,
        "row_totals": matrix["row_totals"],
        "col_totals": matrix["col_totals"],
        "detailed_pipeline": report["pipeline"],
        "unit": unit,
        "cou_available": cou_available,
        "cou_dept_flow_matrix": report.get("cou_dept_flow_matrix"),
    }

    return {"charts": charts, "kpis": kpis, "sankey": sankey, "raw": report}


BUILDERS = {
    "a": build_app_a,
    "b": build_app_b,
    "c": build_app_c,
}
