"""Cantillon Python data layer — normalization gateway for the three metric engines.

Single source of truth is the existing Next.js API (app/api/[[...path]]/route.js),
which already contains the canonical normalization logic (series filtering, USD
conversion, core metrics). This loader:

  1. tries the API first  (CANTILLON_API_URL, default http://localhost:3000/api)
  2. falls back to parsing the embedded dataset (lib/seedData.js) so the engines
     are fully usable offline.

Core metric math mirrors computeMetrics() in the API route exactly, so Python and
JS produce identical MDR / Cantillon Vector / FCR numbers.
"""
from __future__ import annotations

import ast
import json
import math
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_API_URL = os.environ.get("CANTILLON_API_URL", "http://localhost:3000/api")
REPO_ROOT = Path(__file__).resolve().parent.parent
SEED_PATH = REPO_ROOT / "lib" / "seedData.js"

USD_REFERENCE = 1200.0  # real-2024 ARS/USD blue reference used by the API
USD_FACTOR = 1000.0 / USD_REFERENCE  # T ARS -> B USD (route.js factor)


class DataSourceError(RuntimeError):
    """Raised when neither the API nor the seed dataset can satisfy a request."""


# --------------------------------------------------------------------------- #
# JS-literal parsing (seedData.js is plain ESM, not JSON)
# --------------------------------------------------------------------------- #
def _strip_js_comments(source: str) -> str:
    """Remove `//` and `/* */` comments while preserving string literals."""
    out: list[str] = []
    i, n = 0, len(source)
    in_string: str | None = None
    while i < n:
        ch, nxt = source[i], source[i + 1] if i + 1 < n else ""
        if in_string:
            out.append(ch)
            if ch == "\\":
                if nxt:
                    out.append(nxt)
                    i += 2
                    continue
            elif ch == in_string:
                in_string = None
            i += 1
            continue
        if ch in ('"', "'", "`"):
            in_string = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and nxt == "/":
            while i < n and source[i] != "\n":
                i += 1
            continue
        if ch == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (source[i] == "*" and source[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _quote_js_keys(body: str) -> str:
    """Quote unquoted object keys (JS) so the literal becomes valid Python."""
    return re.sub(
        r"(?<!['\"`])\b([A-Za-z_$][A-Za-z0-9_$]*)(\s*)(?=:)(?=.)",
        r'"\1"\2',
        body,
    )


def _extract_literal(name: str, source: str):
    pattern = re.compile(rf"\bexport\s+const\s+{re.escape(name)}\s*=\s*")
    match = pattern.search(source)
    if not match:
        raise DataSourceError(f"export const {name} not found in {SEED_PATH}")
    start = match.end()
    depth = 0
    i = start
    in_string: str | None = None
    while i < len(source):
        ch, nxt = source[i], source[i + 1] if i + 1 < len(source) else ""
        if in_string:
            if ch == "\\":
                i += 2
                continue
            if ch == in_string:
                in_string = None
            i += 1
            continue
        if ch in ('"', "'", "`"):
            in_string = ch
        elif ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
            if depth == 0:
                body = _quote_js_keys(source[start : i + 1])
                return ast.literal_eval(body)
        i += 1
    raise DataSourceError(f"could not parse literal for {name}")


class SeedLoader:
    """Parses lib/seedData.js into native Python structures (cached)."""

    _data: dict | None = None

    @classmethod
    def load(cls) -> dict:
        if cls._data is None:
            source = _strip_js_comments(SEED_PATH.read_text(encoding="utf-8"))
            cls._data = {
                "periods": _extract_literal("POLICY_PERIODS", source),
                "quarterly_series": _extract_literal("QUARTERLY_SERIES", source),
                "fiscal_flows": _extract_literal("FISCAL_FLOWS", source),
                "extraction_destination": _extract_literal("EXTRACTION_DESTINATION", source),
                "sector_capture": _extract_literal("FISCAL_CAPTURE_BY_SECTOR", source),
            }
        return cls._data


# --------------------------------------------------------------------------- #
# Normalization helpers — mirror app/api/[[...path]]/route.js
# --------------------------------------------------------------------------- #
def series_for_period(rows: list[dict], period_id: str | None) -> list[dict]:
    if period_id in (None, "", "all"):
        return rows
    return [r for r in rows if r.get("period") == period_id]


def normalize_series(rows: list[dict], mode: str = "nominal") -> list[dict]:
    """Convert nominal ARS to constant-2024 USD billions (mb_real, rl_real)."""
    out: list[dict] = []
    for r in rows:
        row = dict(r)
        if mode == "usd":
            usd = r.get("usd") or 1.0
            row["mb_real"] = round((r["mb"] * 1e12) / usd / 1e9, 2)
            row["rl_real"] = round((r["rl"] * 1e12) / usd / 1e9, 2)
        out.append(row)
    return out


def normalize_flows(flows: dict, mode: str = "nominal") -> dict:
    """T ARS -> B USD for fiscal flows using the API's reference factor."""
    if mode != "usd":
        return dict(flows)
    out = dict(flows)
    out["sources"] = [{**s, "value": round(s["value"] * USD_FACTOR, 2)} for s in flows["sources"]]
    out["destinations"] = [
        {**d, "value": round(d["value"] * USD_FACTOR, 2)} for d in flows["destinations"]
    ]
    out["links"] = [{**l, "value": round(l["value"] * USD_FACTOR, 2)} for l in flows["links"]]
    out["unit"] = "B USD"
    return out


def compute_core_metrics(series: list[dict], flows: dict, sector_capture: dict | None = None) -> dict:
    """Mirror of computeMetrics() in route.js — MDR, Cantillon Vector, FCR."""
    if not series:
        raise DataSourceError("No series data for metrics")
    latest, first = series[-1], series[0]

    mdr_latest = latest["rl"] / latest["mb"]
    mdr_first = first["rl"] / first["mb"]
    mdr_peak = max(r["rl"] / r["mb"] for r in series)
    mdr_series = [{"q": r["q"], "value": round(r["rl"] / r["mb"], 3)} for r in series]

    bs_first = first["mb"] + first["rl"]
    bs_latest = latest["mb"] + latest["rl"]
    bs_growth = ((bs_latest / bs_first) - 1) * 100
    asset_growth = ((latest["merval"] / first["merval"]) - 1) * 100
    wage_growth = ((latest["wage"] / first["wage"]) - 1) * 100
    cantillon_gap = asset_growth - wage_growth

    destinations = {d["name"]: d["value"] for d in flows.get("destinations", [])}
    sources = flows.get("sources", [])
    total_sub = destinations.get("Energy Subsidies", 0.0) + destinations.get(
        "Transport Subsidies", 0.0
    )
    total_extraction = sum(s["value"] for s in sources)
    fcr = total_sub / total_extraction if total_extraction else 0.0
    inflation_tax = next(
        (s["value"] for s in sources if s["name"] == "Inflation Tax"), 0.0
    )
    inflation_share = inflation_tax / total_extraction if total_extraction else 0.0

    return {
        "monetary_dilution": {
            "current": round(mdr_latest, 2),
            "initial": round(mdr_first, 2),
            "peak": round(mdr_peak, 2),
            "delta_pct": round(((mdr_latest - mdr_first) / mdr_first) * 100, 1),
            "series": mdr_series,
            "formula": "Remunerated Liabilities / Monetary Base",
        },
        "cantillon_vector": {
            "balance_sheet_growth": round(bs_growth, 1),
            "asset_growth": round(asset_growth, 1),
            "wage_growth": round(wage_growth, 1),
            "cantillon_gap": round(cantillon_gap, 1),
            "formula": "Growth(BS) vs Growth(Equities USD) vs Growth(Real Wages)",
        },
        "fiscal_capture": {
            "ratio": round(fcr, 3),
            "total_subsidies_pct_gdp": round(total_sub, 1),
            "inflation_tax_share": round(inflation_share * 100, 1),
            "total_extraction_pct_gdp": flows.get("total_extraction_pct_gdp", 0.0),
            "formula": "(Energy + Transport Subsidies) / Total Fiscal Extraction",
            "by_sector": sector_capture or [],
        },
    }


# --------------------------------------------------------------------------- #
# Unified data source: API first, seed fallback
# --------------------------------------------------------------------------- #
class CantillonClient:
    """Thin JSON client over the existing Next.js API."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or DEFAULT_API_URL).rstrip("/")

    def _get(self, path: str, **params):
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{self.base_url}/{path}" + (f"?{qs}" if qs else "")
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 — any transport error -> fallback
            raise DataSourceError(f"API request failed: {url}: {exc}") from exc

    def periods(self):
        return self._get("periods").get("periods", [])

    def timeseries(self, period="all", mode="nominal", nolive=True):
        return self._get(
            "timeseries", period=period, mode=mode, nolive="1" if nolive else "0"
        ).get("data", [])

    def metrics(self, period="milei", nolive=True):
        return self._get("metrics", period=period, nolive="1" if nolive else "0").get(
            "metrics", {}
        )

    def fiscal_flows(self, period="milei", mode="nominal"):
        return self._get("fiscal-flows", period=period, mode=mode)

    def extraction_destination(self, period="milei", mode="nominal"):
        return self._get("extraction-destination", period=period, mode=mode)

    def bcra_live(self):
        return self._get("bcra/live")


class DataSource:
    """Facade the metric engines depend on. API-first with seed fallback."""

    def __init__(self, api_url: str | None = None, prefer_api: bool = True):
        self.client = CantillonClient(api_url) if api_url or prefer_api else None
        self.prefer_api = prefer_api

    def _resolve(self, api_call, seed_call):
        if self.prefer_api:
            try:
                return api_call()
            except DataSourceError:
                pass
        return seed_call()

    def periods(self):
        def api():
            return self.client.periods()

        def seed():
            return SeedLoader.load()["periods"]

        return self._resolve(api, seed)

    def timeseries(self, period="all", mode="nominal"):
        def api():
            return self.client.timeseries(period, mode)

        def seed():
            return normalize_series(series_for_period(SeedLoader.load()["quarterly_series"], period), mode)

        return self._resolve(api, seed)

    def metrics(self, period="milei"):
        def api():
            return self.client.metrics(period)

        def seed():
            data = SeedLoader.load()
            series = series_for_period(data["quarterly_series"], period)
            flows = data["fiscal_flows"].get(period) or data["fiscal_flows"]["milei"]
            return compute_core_metrics(series, flows, data["sector_capture"].get(period))

        return self._resolve(api, seed)

    def fiscal_flows(self, period="milei", mode="nominal"):
        # No composite ('all') flows exist; mirror the JS API, which falls back
        # to Milei flows when the requested period has none.
        def api():
            try:
                return self.client.fiscal_flows(period, mode)
            except DataSourceError:
                if period == "all":
                    return self.client.fiscal_flows("milei", mode)
                raise

        def seed():
            data = SeedLoader.load()["fiscal_flows"]
            flows = data.get(period) or data["milei"]
            return normalize_flows(flows, mode)

        return self._resolve(api, seed)

    def extraction_destination(self, period="milei", mode="nominal"):
        def api():
            return self.client.extraction_destination(period, mode)

        def seed():
            data = SeedLoader.load()["extraction_destination"]
            payload = data.get(period)
            if not payload:
                raise DataSourceError(f"No extraction/destination for period {period!r}")
            payload = normalize_flows(payload, mode)
            payload["period"] = period
            payload["mode"] = mode
            payload["unit"] = "B USD" if mode == "usd" else "% of GDP"
            payload["totals"] = {
                "traditional": round(
                    sum(e["value"] for e in payload["extraction"] if e["tax_type"] == "traditional"), 1
                ),
                "inflation": round(
                    sum(e["value"] for e in payload["extraction"] if e["tax_type"] == "inflation"), 1
                ),
            }
            payload["totals"]["total"] = round(
                payload["totals"]["traditional"] + payload["totals"]["inflation"], 1
            )
            return payload

        return self._resolve(api, seed)

    def sector_capture(self, period="milei"):
        def api():
            metrics = self.client.metrics(period)
            return metrics.get("fiscal_capture", {}).get("by_sector", [])

        def seed():
            data = SeedLoader.load()["sector_capture"]
            return data.get(period) or data["milei"]

        return self._resolve(api, seed)
