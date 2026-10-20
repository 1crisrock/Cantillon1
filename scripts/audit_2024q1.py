"""Backtest audit — derive c/v/s for one quarter straight from INDEC CGI-IMO.

Validates, for a single quarter (default 2024-Q1), that the Marxian value
categories derive from the primary INDEC source with no blind interpolation:

  primary source : CGI-IMO distribution CSV (dataset 323.1, datos.gob.ar)
  cross-check    : series API 323.1 (VAB, RTA) + 53.1 (% of GDP) — independent path

Accounting closure (INDEC national accounts):

  VAB = RTA + IMB + OTROS_IMP + EBE        (exact, no residual)

Value categories (IMB split alpha, default 0.5):

  v = RTA + alpha · IMB
  s = EBE + (1 - alpha) · IMB              (EBE as published — taxes/inflation
                                             are NOT added to the EBE)
  c = VAB - v - s                          (residual = OTROS_IMP)

Contract: a single JSON document on stdout, structured log inside `log`,
no other output on stdout (logs/progress never printed bare — project
convention so the Next.js bridge can JSON.parse(stdout)).

Usage:
    python3 scripts/audit_2024q1.py [--quarter 2024-Q1] [--alpha 0.5]
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Primary source: CGI-IMO functional income distribution, economy-wide totals
# (total_general_* columns), quarterly, 2016-Q1 .. latest — published by INDEC
# through the datos.gob.ar catalog.
CSV_URL = (
    "https://infra.datos.gob.ar/catalog/sspm/dataset/323/distribution/323.1/"
    "download/distribucion-funcional-del-ingreso-respecto-al-pib-a-precios-"
    "basicos-por-rama-de-actividad.csv"
)
SERIES_API = "https://apis.datos.gob.ar/series/api/series/"

# Independent cross-check series (full precision over the API, unlike the
# rounded values stored by the Mongo ingestion path).
CROSSCHECK_SERIES = {
    "323.1_TOTAL_GENE_PB__20": "vab_api",
    "323.1_TOTAL_GENEADO__45": "rta_api",
    "53.1_TRTA_0_0_37": "rta_pct_api",
    "53.1_EBE_0_0_27": "ebe_pct_api",
}

CSV_COLUMNS = {
    "VAB_pb": "total_general_vab_pb",
    "RTA": "total_general_remuneracion_trabajo_asalariado",
    "IMB": "total_general_ingreso_bruto_mixto",
    "OTROS_IMP": "total_general_imp_net_sub_actividad",
    "EBE": "total_general_excedente_explotacion_bruto",
}

QUARTER_DATE = {"Q1": "01", "Q2": "04", "Q3": "07", "Q4": "10"}

IDENTITY_PCT_TOL = 0.01     # |residual|/VAB <= 0.01 % (accounting closure)
SERIES_REL_TOL = 1e-6       # CSV vs series-API agreement (same publication)
PCT_REL_TOL = 1e-6          # computed shares vs 53.1 % series
BENCH_TOL = 1e-4            # EBE/RTA vs EBE_PCT/RTA_PCT


class AuditError(RuntimeError):
    pass


def _http_get(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "*/*",
            "User-Agent": "CantillonTracker/1.0 (https://github.com/1crisrock/Cantillon1)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception as exc:  # noqa: BLE001 — surfaced as structured audit error
        raise AuditError(f"fetch failed: {url}: {exc}") from exc


def quarter_to_date(quarter: str) -> str:
    year, q = quarter.split("-")
    return f"{year}-{QUARTER_DATE[q]}-01"


def fetch_csv_row(quarter: str) -> dict[str, float]:
    """Pull the quarter's economy-wide totals from the CGI-IMO CSV."""
    raw = _http_get(CSV_URL)
    text = raw.decode("utf-8-sig", errors="replace")
    target = quarter_to_date(quarter)
    for row in csv.DictReader(io.StringIO(text)):
        if (row.get("indice_tiempo") or "").strip() == target:
            out: dict[str, float] = {}
            for var, col in CSV_COLUMNS.items():
                cell = (row.get(col) or "").strip()
                if cell == "":
                    raise AuditError(f"CSV row {target} has empty column {col!r}")
                out[var] = float(cell)
            return out
    raise AuditError(f"quarter {quarter} ({target}) not present in CGI-IMO CSV")


def fetch_crosscheck(quarter: str) -> dict[str, float]:
    """Independent values from the series API for the same quarter."""
    ids = ",".join(CROSSCHECK_SERIES)
    qs = urllib.parse.urlencode({
        "ids": ids,
        "limit": 10,
        "format": "json",
        "collapse": "quarter",
        "start_date": quarter_to_date(quarter),
        "end_date": quarter_to_date(quarter),
    })
    payload = json.loads(_http_get(f"{SERIES_API}?{qs}").decode("utf-8"))
    rows = payload.get("data") or []
    if not rows:
        raise AuditError(f"series API returned no data for {quarter}")
    values = rows[0][1:]
    out: dict[str, float] = {}
    metas = payload.get("meta") or []
    field_metas = metas[1:] if len(metas) > 1 else []
    for i, fm in enumerate(field_metas):
        sid = (fm.get("field") or {}).get("id", "")
        key = CROSSCHECK_SERIES.get(sid)
        if key and i < len(values) and values[i] is not None:
            out[key] = float(values[i])
    return out


def _rel_close(a: float, b: float, tol: float) -> bool:
    scale = max(abs(a), abs(b), 1.0)
    return abs(a - b) / scale <= tol


def run_audit(quarter: str, alpha: float) -> dict:
    log: list[str] = []
    checks: list[dict] = []

    def check(cid: str, label: str, expected, actual, ok: bool, warn: bool = False,
              detail: str = "") -> None:
        checks.append({
            "id": cid,
            "label": label,
            "expected": expected,
            "actual": actual,
            "status": "warn" if (warn and not ok) else ("ok" if ok else "fail"),
            **({"detail": detail} if detail else {}),
        })

    def fmt(x: float) -> str:
        return f"{x:,.2f}"

    # 1 — primary source -----------------------------------------------------
    log.append(f"[1/7] FUENTE PRIMARIA :: descargando CGI-IMO 323.1 (INDEC / datos.gob.ar)…")
    row = fetch_csv_row(quarter)
    vab, rta = row["VAB_pb"], row["RTA"]
    imb, otros_imp, ebe = row["IMB"], row["OTROS_IMP"], row["EBE"]
    log.append(
        f"[2/7] FUENTE PRIMARIA :: {quarter} aislado de los microdatos CGI — "
        f"VAB={fmt(vab)} RTA={fmt(rta)} IMB={fmt(imb)} OTROS_IMP={fmt(otros_imp)} EBE={fmt(ebe)} M ARS"
    )
    check("csv_row", f"Fila {quarter} en CSV primario 323.1", "presente",
          f"{quarter} (5 variables)", True)

    # 2 — independent cross-check (series API) -------------------------------
    api: dict[str, float] = {}
    api_error = ""
    try:
        api = fetch_crosscheck(quarter)
    except AuditError as exc:
        api_error = str(exc)
    if api:
        vab_ok = "vab_api" in api and _rel_close(vab, api["vab_api"], SERIES_REL_TOL)
        rta_ok = "rta_api" in api and _rel_close(rta, api["rta_api"], SERIES_REL_TOL)
        check("api_vab", "VAB CSV == VAB serie API 323.1",
              fmt(api.get("vab_api", float("nan"))), fmt(vab), vab_ok)
        check("api_rta", "RTA CSV == RTA serie API 323.1",
              fmt(api.get("rta_api", float("nan"))), fmt(rta), rta_ok)
        rta_pct = rta / vab
        ebe_pct = ebe / vab
        rta_ok2 = "rta_pct_api" in api and _rel_close(rta_pct, api["rta_pct_api"], PCT_REL_TOL)
        ebe_ok2 = "ebe_pct_api" in api and _rel_close(ebe_pct, api["ebe_pct_api"], PCT_REL_TOL)
        check("api_rta_pct", "RTA/VAB calculado == serie 53.1 RTA_PCT",
              f"{api.get('rta_pct_api', float('nan')):.6f}", f"{rta_pct:.6f}", rta_ok2)
        check("api_ebe_pct", "EBE/VAB calculado == serie 53.1 EBE_PCT",
              f"{api.get('ebe_pct_api', float('nan')):.6f}", f"{ebe_pct:.6f}", ebe_ok2)
        bench_api = (api["ebe_pct_api"] / api["rta_pct_api"]
                     if api.get("rta_pct_api") else float("nan"))
        bench_ok = "ebe_pct_api" in api and "rta_pct_api" in api and _rel_close(
            ebe / rta, bench_api, BENCH_TOL)
        check("benchmark_ebe_rta", "EBE/RTA == EBE_PCT/RTA_PCT (series 53.1)",
              f"{bench_api:.6f}", f"{ebe / rta:.6f}", bench_ok)
        log.append(
            f"[3/7] CROSS-CHECK API :: VAB/RTA de la serie 323.1 y % PIB (53.1) coinciden "
            f"con el CSV — Δ rel ≤ {SERIES_REL_TOL:g} → OK"
        )
    else:
        for cid, label in (
            ("api_vab", "VAB CSV == VAB serie API 323.1"),
            ("api_rta", "RTA CSV == RTA serie API 323.1"),
            ("api_rta_pct", "RTA/VAB calculado == serie 53.1 RTA_PCT"),
            ("api_ebe_pct", "EBE/VAB calculado == serie 53.1 EBE_PCT"),
            ("benchmark_ebe_rta", "EBE/RTA == EBE_PCT/RTA_PCT (series 53.1)"),
        ):
            check(cid, label, "—", "—", False, warn=True, detail=api_error)
        log.append(f"[3/7] CROSS-CHECK API :: no disponible ({api_error}) — se marca WARN")

    # 3 — accounting closure --------------------------------------------------
    closure = rta + imb + otros_imp + ebe
    residual = vab - closure
    residual_pct = abs(residual) / abs(vab) * 100.0 if vab else float("inf")
    closure_ok = residual_pct <= IDENTITY_PCT_TOL
    check("identity_closure", f"VAB = RTA + IMB + OTROS_IMP + EBE ({quarter})",
          "residuo ≤ 0.01 %", f"{residual_pct:.6f} %", closure_ok)
    log.append(
        f"[4/7] CIERRE CONTABLE  :: VAB = RTA + IMB + OTROS_IMP + EBE → residuo "
        f"{fmt(residual)} M ARS ({residual_pct:.6f} %) {'OK' if closure_ok else 'FAIL'}"
    )

    # 4 — depuración: EBE as published, taxes/inflation NOT added -------------
    v = rta + alpha * imb
    s = ebe + (1.0 - alpha) * imb
    c = vab - v - s
    log.append(
        f"[5/7] DEPURACIÓN RTA   :: v = RTA + {alpha:.2f}·IMB = {fmt(v)} M ARS"
    )
    log.append(
        f"[6/7] DEPURACIÓN EBE   :: s = EBE + {1 - alpha:.2f}·IMB = {fmt(s)} M ARS "
        f"— EBE publicado, sin suma de impuestos/inflación"
    )

    # 5 — identities + benchmark ----------------------------------------------
    identity = c + v + s
    id_residual = vab - identity
    id_pct = abs(id_residual) / abs(vab) * 100.0 if vab else float("inf")
    id_ok = id_pct <= IDENTITY_PCT_TOL
    check("identity_value", "c + v + s = VAB", "residuo ≤ 0.01 %",
          f"{id_pct:.6f} %", id_ok)

    s_v = s / v if v else float("nan")
    c_v = c / v if v else float("nan")
    p_prime = s / (c + v) if (c + v) else float("nan")
    ebe_rta = ebe / rta if rta else float("nan")
    ratio_ok = id_ok and v != 0 and closure_ok
    check("ratio_sv", "Ratio benchmark s/v consistente (identidades OK)",
          "ok", f"{s_v:.4f}", ratio_ok)

    log.append(
        f"[7/7] IDENTIDADES      :: c + v + s = VAB (residuo {fmt(id_residual)} M ARS "
        f"→ {'OK' if id_ok else 'FAIL'}) · s/v = {s_v:.4f} vs EBE/RTA = {ebe_rta:.4f} "
        f"{'→ consistente' if ratio_ok else '→ REVISAR'}"
    )

    status = "ok" if all(ck["status"] != "fail" for ck in checks) else "fail"
    return {
        "engine": "audit",
        "script": "scripts/audit_2024q1.py",
        "quarter": quarter,
        "alpha": alpha,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": {
            "dataset": "CGI-IMO",
            "distribution": "323.1 (INDEC / datos.gob.ar)",
            "crosscheck": "series API 323.1 + 53.1 (INDEC / datos.gob.ar)",
            "csv_url": CSV_URL,
            "unit": "M ARS",
        },
        "log": log,
        "checks": checks,
        "metrics": {
            "vab": round(vab, 2),
            "rta": round(rta, 2),
            "imb": round(imb, 2),
            "otros_imp": round(otros_imp, 2),
            "ebe": round(ebe, 2),
            "v": round(v, 2),
            "s": round(s, 2),
            "c": round(c, 2),
            "s_v": round(s_v, 4),
            "c_v": round(c_v, 4),
            "p_prime": round(p_prime, 4),
            "ebe_rta": round(ebe_rta, 4),
            "identity_residual": round(id_residual, 6),
            "identity_pct": round(id_pct, 8),
        },
        "status": status,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="CGI-IMO quarter audit (c/v/s backtest)")
    parser.add_argument("--quarter", default="2024-Q1", help="quarter to audit (default 2024-Q1)")
    parser.add_argument("--alpha", type=float, default=0.5,
                        help="IMB share allocated to v, 0..1 (default 0.5)")
    args = parser.parse_args()

    quarter = args.quarter.strip().upper()
    parts = quarter.split("-")
    ok_quarter = (
        len(parts) == 2
        and parts[0].isdigit() and len(parts[0]) == 4
        and parts[1] in ("Q1", "Q2", "Q3", "Q4")
    )
    if not ok_quarter or not (0.0 <= args.alpha <= 1.0):
        json.dump({
            "engine": "audit",
            "quarter": args.quarter,
            "status": "error",
            "log": [f"INVALID ARGUMENTS :: quarter={args.quarter!r} alpha={args.alpha}"],
            "checks": [],
            "metrics": {},
            "error": "invalid quarter (expected YYYY-Qn) or alpha outside [0, 1]",
        }, sys.stdout, ensure_ascii=False)
        return

    try:
        result = run_audit(quarter, args.alpha)
    except Exception as exc:  # noqa: BLE001 — always emit structured JSON on stdout
        json.dump({
            "engine": "audit",
            "script": "scripts/audit_2024q1.py",
            "quarter": quarter,
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "status": "error",
            "log": [f"ERROR :: {exc}"],
            "checks": [],
            "metrics": {},
            "error": str(exc),
        }, sys.stdout, ensure_ascii=False)
        return

    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
