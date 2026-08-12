"""App C metric engine — Super-Sankey reproduction pipelines.

Structures the fiscal flows as Marxian reproduction schemas (Das Kapital II,
ch. 20-21): every source/destination is assigned to a department

  Dept I   — means of production (energy, export duties, fuel)
  Dept II  — means of consumption (wages, pensions, health/education, transport)
  Dept III — money / finance / state apparatus (debt, quasi-fiscal, banking)

Outputs:
  * departmental_flow_matrix — 3x3 inter-department Sankey topology from the links
  * department_totals        — source/destination value per department
  * value_category_matrix    — c/v/s decomposition per department (reuses marxian_metrics)
  * simple_reproduction      — equilibrium residual for reproduction without growth
  * expanded_reproduction    — accumulation paths + equilibrium residual with growth
  * build_pipeline           — annotated edges/nodes ready for the Super-Sankey viz
"""
from __future__ import annotations

from . import data_loader
from .marxian_metrics import DESTINATION_CATEGORIES, SOURCE_CATEGORIES, _classify

DEPT_NAMES = {1: "Dept I (means of production)", 2: "Dept II (means of consumption)", 3: "Dept III (money/finance/state)"}

DEPT_SOURCE: dict[str, int] = {
    "Export Duties": 1,
    "Fuel Tax": 1,
    "PAIS Tax": 1,
    "IVA (VAT)": 2,
    "Social Security": 2,
    "Income Tax": 3,
    "Debits & Credits": 3,
    "Inflation Tax": 3,
    "Debt Issuance": 3,
    "Other Taxes": 3,
}

DEPT_DESTINATION: dict[str, int] = {
    "Energy Subsidies": 1,
    "ANSES (Pensions)": 2,
    "Transport Subsidies": 2,
    "Public Wages": 2,
    "Health & Education": 2,
    "Debt Interest": 3,
    "Provinces": 3,
    "Other Ministries": 3,
    "BCRA Quasi-Fiscal": 3,
    "Energy Sector": 1,
    "Banking (LEBAC)": 3,
    "Banking (LELIQ)": 3,
    "Banking (LEFI/BOPREAL)": 3,
    "Transport Concess.": 2,
    "Public Employment": 3,
    "Debt Holders": 3,
    "Aerolineas AR": 2,
    "YPF": 1,
    "YPF (nacionaliz.)": 1,
    "Mining": 1,
    "Manufacturing": 1,
}


def department_of(name: str, side: str) -> int:
    mapping = DEPT_SOURCE if side == "source" else DEPT_DESTINATION
    return mapping.get(name, 3)  # unknown names default to Dept III (residual category)


def department_totals(flows: dict) -> dict:
    src = {d: 0.0 for d in DEPT_NAMES}
    dst = {d: 0.0 for d in DEPT_NAMES}
    for s in flows.get("sources", []):
        src[department_of(s["name"], "source")] += s["value"]
    for d in flows.get("destinations", []):
        dst[department_of(d["name"], "destination")] += d["value"]
    return {
        "sources": {k: round(v, 2) for k, v in src.items()},
        "destinations": {k: round(v, 2) for k, v in dst.items()},
    }


def departmental_flow_matrix(flows: dict) -> dict:
    """3x3 inter-department flow matrix built from the links."""
    m = {i: {j: 0.0 for j in DEPT_NAMES} for i in DEPT_NAMES}
    for link in flows.get("links", []):
        i = department_of(link["source"], "source")
        j = department_of(link["target"], "destination")
        m[i][j] += link["value"]
    rounded = {i: {j: round(v, 2) for j, v in row.items()} for i, row in m.items()}
    return {
        "matrix": rounded,
        "row_totals": {i: round(sum(row.values()), 2) for i, row in m.items()},
        "col_totals": {j: round(sum(m[i][j] for i in DEPT_NAMES), 2) for j in DEPT_NAMES},
        "unit": flows.get("unit", "T ARS"),
    }


def value_category_matrix(flows: dict) -> dict:
    """c/v/s decomposition per department (destinations are the accounting side)."""
    by_dept = {}
    for dept in DEPT_NAMES:
        dest_items = [d for d in flows.get("destinations", []) if department_of(d["name"], "destination") == dept]
        src_items = [s for s in flows.get("sources", []) if department_of(s["name"], "source") == dept]
        dest_totals, _ = _classify(dest_items, DESTINATION_CATEGORIES)
        src_totals, _ = _classify(src_items, SOURCE_CATEGORIES)
        by_dept[dept] = {
            "name": DEPT_NAMES[dept],
            "destinations": {k: round(v, 2) for k, v in dest_totals.items()},
            "sources": {k: round(v, 2) for k, v in src_totals.items()},
        }
    return by_dept


def simple_reproduction(flows: dict) -> dict:
    """Equilibrium checks for reproduction without accumulation.

    Balance I: Dept I output  == constant capital consumed in all departments
    Balance II: Dept II output == wages + consumed surplus in all departments
    """
    depts = value_category_matrix(flows)
    totals = department_totals(flows)
    x1 = totals["sources"][1]
    x2 = totals["sources"][2]
    c_total = sum(depts[d]["destinations"]["c"] for d in DEPT_NAMES)
    v_total = sum(depts[d]["destinations"]["v"] for d in DEPT_NAMES)
    s_total = sum(depts[d]["destinations"]["s"] for d in DEPT_NAMES)
    bal_i = x1 - c_total
    bal_ii = x2 - (v_total + s_total)
    return {
        "dept_I_output": round(x1, 2),
        "dept_II_output": round(x2, 2),
        "constant_capital_c": round(c_total, 2),
        "variable_capital_v": round(v_total, 2),
        "surplus_value_s": round(s_total, 2),
        "balance_I_x1_minus_c": round(bal_i, 2),
        "balance_II_x2_minus_v_minus_s": round(bal_ii, 2),
        "balanced": abs(bal_i) < 0.05 and abs(bal_ii) < 0.05,
        "note": "Empirical data will not balance exactly; residuals measure schema imbalance.",
    }


def expanded_reproduction(flows: dict, accumulation_rate: float = 0.5) -> dict:
    """Accumulation path per department + equilibrium residuals.

    A share `accumulation_rate` of each department's surplus is reinvested,
    split between constant and variable capital in the department's own
    organic composition; the rest is consumed.
    """
    depts = value_category_matrix(flows)
    totals = department_totals(flows)
    acc = {}
    for dept in DEPT_NAMES:
        d = depts[dept]["destinations"]
        c, v, s = d["c"], d["v"], d["s"]
        s_acc = accumulation_rate * s
        base = c + v
        if base > 0:
            dc = s_acc * c / base
            dv = s_acc * v / base
        else:
            dc = dv = 0.0
        acc[dept] = {
            "c": round(c, 2),
            "v": round(v, 2),
            "s": round(s, 2),
            "s_accumulated": round(s_acc, 2),
            "delta_c": round(dc, 2),
            "delta_v": round(dv, 2),
            "s_consumed": round(s - s_acc, 2),
        }
    c1 = acc[1]["c"] + acc[1]["delta_c"]
    c2 = acc[2]["c"] + acc[2]["delta_c"]
    v1 = acc[1]["v"] + acc[1]["delta_v"]
    v2 = acc[2]["v"] + acc[2]["delta_v"]
    bal_i = totals["sources"][1] - (c1 + c2)
    bal_ii = totals["sources"][2] - (
        v1 + v2 + acc[1]["s_consumed"] + acc[2]["s_consumed"] + acc[3]["s_consumed"]
    )

    # Economy-wide accumulation path — surplus reinvested across the whole base,
    # so accumulation is well-defined even when a single dept holds all surplus
    # (e.g. dept III with a zero capital base).
    c_tot = sum(depts[d]["destinations"]["c"] for d in DEPT_NAMES)
    v_tot = sum(depts[d]["destinations"]["v"] for d in DEPT_NAMES)
    s_tot = sum(depts[d]["destinations"]["s"] for d in DEPT_NAMES)
    s_acc = accumulation_rate * s_tot
    base = c_tot + v_tot
    dc_tot = s_acc * c_tot / base if base > 0 else 0.0
    dv_tot = s_acc * v_tot / base if base > 0 else 0.0
    economy_wide = {
        "c": round(c_tot, 2),
        "v": round(v_tot, 2),
        "s": round(s_tot, 2),
        "s_accumulated": round(s_acc, 2),
        "delta_c": round(dc_tot, 2),
        "delta_v": round(dv_tot, 2),
        "s_consumed": round(s_tot - s_acc, 2),
    }

    return {
        "accumulation_rate": accumulation_rate,
        "departments": acc,
        "economy_wide": economy_wide,
        "dept_I_output": round(totals["sources"][1], 2),
        "dept_II_output": round(totals["sources"][2], 2),
        "balance_I_x1_minus_c1dc1_c2dc2": round(bal_i, 2),
        "balance_II_x2_minus_consumption": round(bal_ii, 2),
    }


def build_pipeline(flows: dict) -> dict:
    """Super-Sankey pipeline: annotated nodes + edges ready for the visualization."""
    nodes = []
    seen = set()
    for side, items in (("source", flows.get("sources", [])), ("destination", flows.get("destinations", []))):
        for item in items:
            name = item["name"]
            if name in seen:
                continue
            seen.add(name)
            dept = department_of(name, side)
            kind = (SOURCE_CATEGORIES if side == "source" else DESTINATION_CATEGORIES).get(name, "s")
            nodes.append({"name": name, "value": round(item["value"], 2), "side": side,
                          "department": dept, "department_name": DEPT_NAMES[dept], "kind": kind})
    edges = []
    for link in flows.get("links", []):
        i = department_of(link["source"], "source")
        j = department_of(link["target"], "destination")
        edges.append({
            "source": link["source"],
            "target": link["target"],
            "value": round(link["value"], 2),
            "source_department": i,
            "target_department": j,
            "source_kind": SOURCE_CATEGORIES.get(link["source"], "s"),
            "target_kind": DESTINATION_CATEGORIES.get(link["target"], "s"),
            "intra_department": i == j,
        })
    return {"nodes": nodes, "edges": edges, "unit": flows.get("unit", "T ARS"),
            "department_names": DEPT_NAMES}


def compute_all(period: str = "milei", mode: str = "nominal",
                accumulation_rate: float = 0.5,
                ds: data_loader.DataSource | None = None) -> dict:
    ds = ds or data_loader.DataSource()
    flows = ds.fiscal_flows(period, mode)
    return {
        "period": period,
        "mode": mode,
        "flows_unit": flows.get("unit", "T ARS"),
        "department_totals": department_totals(flows),
        "departmental_flow_matrix": departmental_flow_matrix(flows),
        "value_category_matrix": value_category_matrix(flows),
        "simple_reproduction": simple_reproduction(flows),
        "expanded_reproduction": expanded_reproduction(flows, accumulation_rate),
        "pipeline": build_pipeline(flows),
    }


if __name__ == "__main__":
    for period in ("kirchner", "macri", "fernandez", "milei"):
        report = compute_all(period)
        m = report["departmental_flow_matrix"]
        print(f"[{period.upper():9s}] dept matrix I->II->III: "
              f"I={m['row_totals'][1]:6.1f} II={m['row_totals'][2]:6.1f} III={m['row_totals'][3]:6.1f} | "
              f"edges={len(report['pipeline']['edges'])} | "
              f"balI={report['simple_reproduction']['balance_I_x1_minus_c']:+.1f} "
              f"balII={report['simple_reproduction']['balance_II_x2_minus_v_minus_s']:+.1f}")
