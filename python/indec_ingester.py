"""INDEC CGI-IMO ingestion pipeline.

Fetches the Cuenta de Generación del Ingreso e Insumo de Mano de Obra from
the datos.gob.ar Series de Tiempo API, normalizes to the metadata contract,
and emits a JSON array on stdout for the Next.js API route to upsert into
MongoDB collection ``cgi_imo``.

Stdlib-only (no pip dependencies) — consistent with project conventions.

Usage:
    python3 -m python.indec_ingester           # fetch all series, emit JSON
    python3 -m python.indec_ingester --dry-run  # fetch + validate, no output
"""
from __future__ import annotations

import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

# --------------------------------------------------------------------------- #
# Series catalog — API ID → canonical metadata
# --------------------------------------------------------------------------- #
API_BASE = "https://apis.datos.gob.ar/series/api/series/"

# (api_id, canonical series_id, variable name, description)
SERIES_CATALOG = [
    ("323.1_TOTAL_GENE_PB__20",  "CGI_VAB_TOTAL_Q",       "VAB_pb",      "VAB a precios básicos"),
    ("323.1_TOTAL_GENEADO__45",  "CGI_RTA_TOTAL_Q",       "RTA",         "Remuneración al Trabajo Asalariado"),
    ("323.1_TOTAL_GENEXTO__33",  "CGI_IMB_TOTAL_Q",       "IMB",         "Ingreso Mixto Bruto"),
    ("323.1_TOTAL_GENEUTO__41",  "CGI_EBE_TOTAL_Q",       "EBE",         "Excedente Bruto de Explotación"),
    ("323.1_TOTAL_GENEDAD__35",  "CGI_TAXNET_TOTAL_Q",    "OTROS_IMP",   "Otros Impuestos Netos de Subsidios"),
    ("324.1_TOTAL_GENEAJO__29",  "CGI_IMO_JOBS_TOTAL_Q",  "IMO_JOBS",    "Puestos de trabajo totales"),
    ("53.1_TRTA_0_0_37",         "CGI_RTA_PCT_GDP_Q",     "RTA_PCT",     "RTA / PIB (%)"),
    ("53.1_EBE_0_0_27",          "CGI_EBE_PCT_GDP_Q",     "EBE_PCT",     "EBE / PIB (%)"),
    ("53.1_TINSA_0_0_41",        "CGI_TAXNET_PCT_GDP_Q",  "OTROS_IMP_PCT", "Otros impuestos netos / PIB (%)"),
]

QUARTER_MAP = {"01": "Q1", "04": "Q2", "07": "Q3", "10": "Q4"}


# --------------------------------------------------------------------------- #
# API fetch
# --------------------------------------------------------------------------- #
def _fetch_series_batch(api_ids: list[str], timeout: int = 30) -> dict:
    """Fetch a batch of series from the datos.gob.ar API."""
    ids_param = ",".join(api_ids)
    url = f"{API_BASE}?ids={ids_param}&limit=5000&format=json"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "CantillonTracker/1.0 (https://github.com/1crisrock/Cantillon1)",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(f"Failed to fetch from datos.gob.ar: {e}") from e


def fetch_all_series() -> dict[str, list[tuple[str, float]]]:
    """Fetch all CGI-IMO series. Returns {api_id: [(period, value), ...]}."""
    api_ids = [s[0] for s in SERIES_CATALOG]

    # Split into batches of 5 to avoid overly long URLs
    batch_size = 5
    results: dict[str, list[tuple[str, float]]] = {aid: [] for aid in api_ids}

    for i in range(0, len(api_ids), batch_size):
        batch = api_ids[i : i + batch_size]
        raw = _fetch_series_batch(batch)

        # Parse the response
        data_rows = raw.get("data", [])
        meta_list = raw.get("meta", [])

        # First meta entry is frequency info; rest are field metadata
        field_metas = meta_list[1:] if len(meta_list) > 1 else []

        # Build ordered list of api_ids from meta
        ordered_ids = []
        for fm in field_metas:
            field_info = fm.get("field", {})
            ordered_ids.append(field_info.get("id", ""))

        # Parse data rows
        for row in data_rows:
            date_str = row[0]  # "YYYY-MM-DD"
            values = row[1:]
            for j, val in enumerate(values):
                if j < len(ordered_ids):
                    aid = ordered_ids[j]
                    if aid in results and val is not None:
                        # Convert date to reference_period
                        parts = date_str.split("-")
                        if len(parts) >= 2:
                            month = parts[1]
                            quarter = QUARTER_MAP.get(month, f"Q{int(month)//3 + 1}")
                            period = f"{parts[0]}-{quarter}"
                            results[aid].append((period, float(val)))

    return results


# --------------------------------------------------------------------------- #
# Normalization — metadata contract
# --------------------------------------------------------------------------- #
def normalize_observations(raw_series: dict[str, list[tuple[str, float]]]) -> list[dict]:
    """Convert raw series into metadata-contract documents."""
    now = datetime.now(timezone.utc).isoformat()

    # Determine latest publication date from the data
    all_dates = []
    for periods in raw_series.values():
        for period, _ in periods:
            all_dates.append(period)
    latest_period = max(all_dates) if all_dates else "2026-Q1"

    # Map api_id to catalog info
    catalog_map = {}
    for api_id, series_id, variable, description in SERIES_CATALOG:
        catalog_map[api_id] = (series_id, variable, description)

    docs = []
    for api_id, observations in raw_series.items():
        if api_id not in catalog_map:
            continue
        series_id, variable, description = catalog_map[api_id]

        # Determine unit based on variable type
        if "_PCT_" in variable:
            unit = "percent"
            current_or_constant = "current"
            price_basis = "n/a"
        else:
            unit = "ARS_millions"
            current_or_constant = "current"
            price_basis = "basic_prices"

        for period, value in observations:
            doc = {
                "source": "INDEC",
                "dataset": "CGI-IMO",
                "series_id": series_id,
                "reference_period": period,
                "publication_date": "2024-07-16",  # Latest INDEC publication
                "vintage": now,
                "frequency": "quarterly",
                "unit": unit,
                "current_or_constant_prices": current_or_constant,
                "price_basis": price_basis,
                "seasonal_adjustment": "unadjusted",
                "nature": "observed",
                "value": round(value, 2),
                "sector": "TOTAL",
                "variable": variable,
                "description": description,
            }
            docs.append(doc)

    return docs


# --------------------------------------------------------------------------- #
# CLI entry point
# --------------------------------------------------------------------------- #
def main() -> None:
    dry_run = "--dry-run" in sys.argv

    print("Fetching CGI-IMO data from datos.gob.ar...", file=sys.stderr)
    raw = fetch_all_series()

    total_obs = sum(len(v) for v in raw.values())
    print(f"Fetched {total_obs} observations across {len(raw)} series", file=sys.stderr)

    docs = normalize_observations(raw)
    print(f"Normalized to {len(docs)} documents", file=sys.stderr)

    if dry_run:
        print("Dry run — skipping output", file=sys.stderr)
        # Print summary
        by_var = {}
        for doc in docs:
            var = doc["variable"]
            if var not in by_var:
                by_var[var] = {"count": 0, "min": doc["reference_period"], "max": doc["reference_period"]}
            by_var[var]["count"] += 1
            by_var[var]["min"] = min(by_var[var]["min"], doc["reference_period"])
            by_var[var]["max"] = max(by_var[var]["max"], doc["reference_period"])
        for var, info in sorted(by_var.items()):
            print(f"  {var}: {info['count']} obs ({info['min']} → {info['max']})", file=sys.stderr)
    else:
        # Emit JSON on stdout for the API route to consume
        json.dump(docs, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
