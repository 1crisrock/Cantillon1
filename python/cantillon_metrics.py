"""App A metric engine — Cantillon Monetary Pressure Index (CMPI) and Fiscal
Pressure Index (FPI).

Raw components come from the canonical normalization layer (data_loader.DataSource),
which mirrors the Next.js API computations:

  * Monetary Dilution Ratio (RL / MB)
  * Cantillon Vector (balance-sheet growth vs asset growth vs wage growth)
  * Fiscal Capture Ratio ((Energy + Transport Subsidies) / Total Extraction)
  * Inflation-tax share and total extraction (% GDP)

CMPI and FPI are weighted 0-100 composite pressure scores built from those
components, each normalized against a documented reference ceiling.

References (see lib/regionalBenchmarks.js):
  MDR reference 2.50x (Fernandez peak) | inflation 100% YoY | gap 250pp (Kirchner era)
  extraction 40% GDP | subsidy capture 25% of extraction | debt share 30% of extraction
"""
from __future__ import annotations

from . import data_loader


def clip01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def pressure_band(score: float) -> str:
    if score >= 75:
        return "SEVERE"
    if score >= 50:
        return "HIGH"
    if score >= 25:
        return "MODERATE"
    return "LOW"


# --- reference ceilings (0.0 -> 1.0 pressure) ---------------------------------
MDR_REF = 2.50            # Fernandez peak 23Q4
INFLATION_REF = 100.0     # 100% YoY inflation
BS_GAP_REF = 100.0        # 100pp of balance-sheet growth over real wages
CANTILLON_GAP_REF = 250.0 # Kirchner-era wealth-transfer gap
EXTRACTION_REF = 40.0     # % of GDP (France/OECD high-tax territory ~46)
SUBSIDY_REF = 0.25        # subsidies as share of total extraction
DEBT_SHARE_REF = 0.30     # debt issuance as share of total extraction

DEFAULT_CMPI_WEIGHTS = {"mdr": 0.30, "inflation": 0.25, "balance_sheet": 0.20, "cantillon_gap": 0.25}
DEFAULT_FPI_WEIGHTS = {"extraction": 0.30, "inflation_tax": 0.25, "subsidy_capture": 0.25, "debt": 0.20}


# --------------------------------------------------------------------------- #
# Raw components (thin re-exposures of the canonical math)
# --------------------------------------------------------------------------- #
def monetary_dilution(series: list[dict]) -> dict:
    """Monetary Dilution Ratio = Remunerated Liabilities / Monetary Base."""
    core = data_loader.compute_core_metrics(series, {"sources": [], "destinations": []})
    return core["monetary_dilution"]


def cantillon_vector(series: list[dict]) -> dict:
    """Growth(BS) vs Growth(Equities USD) vs Growth(Real Wages)."""
    core = data_loader.compute_core_metrics(series, {"sources": [], "destinations": []})
    return core["cantillon_vector"]


def fiscal_capture(flows: dict) -> dict:
    """(Energy + Transport Subsidies) / Total Fiscal Extraction."""
    core = data_loader.compute_core_metrics(
        [{"q": "dummy", "rl": 1.0, "mb": 1.0, "merval": 1.0, "wage": 1.0}], flows
    )
    return core["fiscal_capture"]


# --------------------------------------------------------------------------- #
# CMPI — Cantillon Monetary Pressure Index (App A)
# --------------------------------------------------------------------------- #
def cmpi_components(series: list[dict]) -> dict:
    """0-100 pressure components from a (possibly rolling) series window."""
    core = data_loader.compute_core_metrics(series, {"sources": [], "destinations": []})
    mdr = core["monetary_dilution"]["current"]
    cpi = series[-1].get("cpi", 0.0)
    cv = core["cantillon_vector"]
    bs_over_wage = cv["balance_sheet_growth"] - cv["wage_growth"]
    gap = cv["cantillon_gap"]
    return {
        "mdr": clip01(mdr / MDR_REF) * 100,
        "inflation": clip01(cpi / INFLATION_REF) * 100,
        "balance_sheet": clip01(bs_over_wage / BS_GAP_REF) * 100,
        "cantillon_gap": clip01(gap / CANTILLON_GAP_REF) * 100,
        "_raw": {
            "mdr": round(mdr, 3),
            "cpi_yoy": round(cpi, 1),
            "bs_over_wage_pp": round(bs_over_wage, 1),
            "cantillon_gap_pp": round(gap, 1),
        },
    }


def cmpi(series: list[dict], weights: dict | None = None) -> dict:
    """Weighted 0-100 Cantillon Monetary Pressure Index for a series window."""
    w = {**DEFAULT_CMPI_WEIGHTS, **(weights or {})}
    comp = cmpi_components(series)
    score = sum(w[k] * comp[k] for k in w if k != "_raw")
    return {
        "score": round(score, 1),
        "band": pressure_band(score),
        "components": {k: v for k, v in comp.items() if k != "_raw"},
        "raw": comp["_raw"],
        "weights": w,
        "formula": "CMPI = 0.30*mdr + 0.25*inflation + 0.20*bs_over_wage + 0.25*cantillon_gap",
    }


def cmpi_series(series: list[dict], weights: dict | None = None) -> list[dict]:
    """Per-quarter CMPI, each window measured from the start of the series."""
    return [
        {"q": series[i]["q"], **cmpi(series[: i + 1], weights)} for i in range(len(series))
    ]


# --------------------------------------------------------------------------- #
# FPI — Fiscal Pressure Index (App A)
# --------------------------------------------------------------------------- #
def fpi_components(flows: dict) -> dict:
    """0-100 pressure components from fiscal flows."""
    core = data_loader.compute_core_metrics(
        [{"q": "dummy", "rl": 1.0, "mb": 1.0, "merval": 1.0, "wage": 1.0}], flows
    )
    sources = flows.get("sources", [])
    total_extraction = sum(s["value"] for s in sources) or 1.0
    debt = next((s["value"] for s in sources if s["name"] == "Debt Issuance"), 0.0)
    fc = core["fiscal_capture"]
    return {
        "extraction": clip01(flows.get("total_extraction_pct_gdp", 0.0) / EXTRACTION_REF) * 100,
        "inflation_tax": clip01(fc["inflation_tax_share"] / 100.0) * 100,
        "subsidy_capture": clip01(fc["ratio"] / SUBSIDY_REF) * 100,
        "debt": clip01((debt / total_extraction) / DEBT_SHARE_REF) * 100,
        "_raw": {
            "extraction_pct_gdp": flows.get("total_extraction_pct_gdp", 0.0),
            "inflation_tax_share_pct": fc["inflation_tax_share"],
            "fcr": fc["ratio"],
            "debt_share_pct": round((debt / total_extraction) * 100, 1),
        },
    }


def fpi(flows: dict, weights: dict | None = None) -> dict:
    """Weighted 0-100 Fiscal Pressure Index."""
    w = {**DEFAULT_FPI_WEIGHTS, **(weights or {})}
    comp = fpi_components(flows)
    score = sum(w[k] * comp[k] for k in w if k != "_raw")
    return {
        "score": round(score, 1),
        "band": pressure_band(score),
        "components": {k: v for k, v in comp.items() if k != "_raw"},
        "raw": comp["_raw"],
        "weights": w,
        "formula": "FPI = 0.30*extraction + 0.25*inflation_tax + 0.25*subsidy_capture + 0.20*debt",
    }


# --------------------------------------------------------------------------- #
# Convenience facade
# --------------------------------------------------------------------------- #
def compute_all(period: str = "milei", mode: str = "nominal", ds: data_loader.DataSource | None = None) -> dict:
    ds = ds or data_loader.DataSource()
    series = ds.timeseries(period, mode)
    flows = ds.fiscal_flows(period, mode)
    if not series:
        raise data_loader.DataSourceError(f"No series for period {period!r}")
    return {
        "period": period,
        "mode": mode,
        "monetary_dilution": monetary_dilution(series),
        "cantillon_vector": cantillon_vector(series),
        "fiscal_capture": fiscal_capture(flows),
        "cmpi": cmpi(series),
        "cmpi_series": cmpi_series(series),
        "fpi": fpi(flows),
    }


if __name__ == "__main__":
    for period in ("kirchner", "macri", "fernandez", "milei"):
        report = compute_all(period)
        c, f = report["cmpi"], report["fpi"]
        print(f"[{period.upper():9s}] CMPI={c['score']:5.1f} ({c['band']:8s}) | "
              f"FPI={f['score']:5.1f} ({f['band']:8s}) | "
              f"MDR={report['monetary_dilution']['current']:.2f} | "
              f"Cantillon gap={report['cantillon_vector']['cantillon_gap']:+.1f}pp | "
              f"FCR={report['fiscal_capture']['ratio']:.3f}")
