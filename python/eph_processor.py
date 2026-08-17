"""EPH (Encuesta Permanente de Hogares) processor — INDEC household survey microdata.

Processes raw EPH Personas + Hogares TXT files into labor market indicators:
  - Unemployment rate (Tasa de Desempleo)
  - Informal employment rate (Tasa de Informalidad)
  - General precarization rate
  - Ejército Industrial de Reserva (EIR) — relative surplus population:
      * Flotante (floating): subocupados + informal salaried
      * Latente (latent): discouraged workers + unpaid family workers
      * Estancado (stagnated): long-term unemployed

Raw data files (usu_individual_t{Q}{YY}.txt, usu_hogar_t{Q}{YY}.txt) must be
placed in a local directory. The processor caches aggregated results to
/tmp/cantillon_eph/ for fast reuse.

Source: INDEC — https://www.indec.gob.ar/indec/web/iniciosComponentes-36517
"""
from __future__ import annotations

import json
import os
from pathlib import Path


CACHE_DIR = Path(os.environ.get(
    "EPH_CACHE_DIR",
    str(Path(__file__).resolve().parent.parent / "eph_data" / ".cache"),
))

# Quarter -> period mapping for the four policy administrations
PERIOD_QUARTERS = {
    "kirchner": [f"{y}-Q{q}" for y in range(2003, 2016) for q in range(1, 5)],
    "macri":    [f"{y}-Q{q}" for y in range(2016, 2020) for q in range(1, 5)],
    "fernandez":[f"{y}-Q{q}" for y in range(2020, 2024) for q in range(1, 5)],
    "milei":    [f"{y}-Q{q}" for y in range(2024, 2027) for q in range(1, 5)],
}


def _safe_series(df, col, default=0):
    """Return a numeric Series always, even if column is missing from DataFrame.

    Prevents AttributeError when df.get("COL", 0) returns a scalar instead of
    a Series, which breaks .isin() and comparison operators.
    """
    import pandas as pd
    if col in df.columns:
        return pd.to_numeric(df[col], errors="coerce").fillna(default)
    return pd.Series(default, index=df.index, dtype="float64")


def quarter_to_period(q: str) -> str | None:
    """Map a quarter string like '2023-Q4' to a policy period id."""
    for pid, qs in PERIOD_QUARTERS.items():
        if q in qs:
            return pid
    return None


class EPHProcessor:
    """Processes raw EPH microdata (Personas + Hogares TXT files) into indicators."""

    def __init__(self, personas_path: str, hogares_path: str):
        self.personas_path = personas_path
        self.hogares_path = hogares_path
        self.df = None

    def load_and_merge(self):
        """Load and merge Personas + Hogares microdata on CODUSU + NRO_HOGAR."""
        import pandas as pd

        dtype_keys = {"CODUSU": str, "NRO_HOGAR": int}

        df_personas = pd.read_csv(
            self.personas_path, sep=";", dtype=dtype_keys, low_memory=False
        )
        df_hogares = pd.read_csv(
            self.hogares_path, sep=";", dtype=dtype_keys, low_memory=False
        )

        hogares_cols = ["CODUSU", "NRO_HOGAR", "REALIZADA", "IV1", "ITF", "DECIFR"]
        hogares_cols_present = [c for c in hogares_cols if c in df_hogares.columns]

        self.df = pd.merge(
            df_personas,
            df_hogares[hogares_cols_present],
            on=["CODUSU", "NRO_HOGAR"],
            how="inner",
            suffixes=("", "_hogar"),
        )

        self.df["PONDERA"] = pd.to_numeric(self.df["PONDERA"], errors="coerce").fillna(0)
        return self.df

    def clean_and_prepare_variables(self):
        """Create boolean flag columns for activity status and EIR classification."""
        if self.df is None:
            raise ValueError("Primero debe ejecutar load_and_merge().")

        import pandas as pd
        df = self.df.copy()

        df["CH06"] = pd.to_numeric(df["CH06"], errors="coerce").fillna(0)
        df["ESTADO"] = pd.to_numeric(df["ESTADO"], errors="coerce").fillna(0)
        df["CAT_OCUP"] = pd.to_numeric(df["CAT_OCUP"], errors="coerce").fillna(0)
        df["PP07H"] = pd.to_numeric(df["PP07H"], errors="coerce").fillna(0)

        # PET >= 10 (INDEC definition)
        df["is_pet"] = df["CH06"] >= 10
        # PEA: ocupados (1) + desocupados (2)
        df["is_pea"] = df["is_pet"] & df["ESTADO"].isin([1, 2])
        df["is_ocupado"] = df["is_pet"] & (df["ESTADO"] == 1)
        df["is_desocupado"] = df["is_pet"] & (df["ESTADO"] == 2)
        df["is_asalariado"] = df["is_ocupado"] & (df["CAT_OCUP"] == 3)
        df["is_informal_asalariado"] = df["is_asalariado"] & (df["PP07H"] == 2)

        # Subocupacion (PP03J / INTENSI)
        intensidad = _safe_series(df, "INTENSI")
        df["is_subocupado"] = df["is_ocupado"] & intensidad.isin([1, 2])

        self.df = df
        return self.df

    def calculate_conventional_metrics(self) -> dict:
        """Standard INDEC labor market indicators expanded by PONDERA."""
        df = self.df
        pea_pop = df[df["is_pea"]]["PONDERA"].sum()
        desocup_pop = df[df["is_desocupado"]]["PONDERA"].sum()
        asalariados_pop = df[df["is_asalariado"]]["PONDERA"].sum()
        informales_pop = df[df["is_informal_asalariado"]]["PONDERA"].sum()
        ocupados_pop = df[df["is_ocupado"]]["PONDERA"].sum()

        tasa_desempleo = (desocup_pop / pea_pop) * 100 if pea_pop > 0 else 0.0
        tasa_informalidad = (informales_pop / asalariados_pop) * 100 if asalariados_pop > 0 else 0.0

        import pandas as pd
        nivel_ed = _safe_series(df, "NIVEL_ED")
        df["is_cuentapropia_precario"] = (
            df["is_ocupado"] & (df["CAT_OCUP"] == 2) & (~nivel_ed.isin([6, 7]))
        )
        cuentapropia_precario_pop = df[df["is_cuentapropia_precario"]]["PONDERA"].sum()
        precarizacion_total_pop = informales_pop + cuentapropia_precario_pop
        tasa_precarizacion = (precarizacion_total_pop / ocupados_pop) * 100 if ocupados_pop > 0 else 0.0

        return {
            "PEA_poblacion": float(pea_pop),
            "Desocupados_poblacion": float(desocup_pop),
            "Ocupados_poblacion": float(ocupados_pop),
            "Tasa_Desempleo_pct": round(tasa_desempleo, 2),
            "Tasa_Informalidad_Asalariada_pct": round(tasa_informalidad, 2),
            "Tasa_Precarizacion_General_pct": round(tasa_precarizacion, 2),
        }

    def calculate_eir(self) -> dict:
        """Ejército Industrial de Reserva — relative surplus population.

        Classification is mutually exclusive by priority:
          1. Estancado: long-term unemployed (PP02E==5, >= 1 year looking)
          2. Flotante: subocupados + informal salaried (excluding estancados)
          3. Latente: discouraged inactives (PP02C2==1) + unpaid family workers
             (excluding anyone already classified above)

        Marx (Cap. XXIII): the three forms coexist but each individual belongs
        to one form only. The priority order reflects decreasing proximity to
        the wage-labor circuit.
        """
        import pandas as pd
        df = self.df

        pp02e = _safe_series(df, "PP02E")
        pp02c2 = _safe_series(df, "PP02C2")

        # Base: working-age population
        base = df["is_pet"]

        # 1. Estancado: desocupados de larga duración (>= 1 año buscando)
        #    PP02E is only meaningful for desocupados (ESTADO==2); restrict explicitly.
        estancado = base & df["is_desocupado"] & (pp02e == 5)

        # 2. Flotante: subocupados + asalariados informales
        #    Exclude anyone already classified as estancado.
        flotante = base & ~estancado & (
            df["is_subocupado"] | df["is_informal_asalariado"]
        )

        # 3. Latente: inactivos desalentados + trabajadores familiares sin remuneración
        #    Exclude anyone already classified as estancado or flotante.
        latente = base & ~estancado & ~flotante & (
            ((df["ESTADO"] == 3) & (pp02c2 == 1))
            | (df["is_ocupado"] & (df["CAT_OCUP"] == 4))
        )

        flotante_pop = df[flotante]["PONDERA"].sum()
        latente_pop = df[latente]["PONDERA"].sum()
        estancado_pop = df[estancado]["PONDERA"].sum()

        eir_total_pop = flotante_pop + latente_pop + estancado_pop
        pea_pop = df[df["is_pea"]]["PONDERA"].sum()
        pet_pop = df[df["is_pet"]]["PONDERA"].sum()

        eir_sobre_pea = (eir_total_pop / pea_pop) * 100 if pea_pop > 0 else 0.0
        eir_sobre_pet = (eir_total_pop / pet_pop) * 100 if pet_pop > 0 else 0.0

        return {
            "EIR_Total_poblacion": float(eir_total_pop),
            "EIR_sobre_PEA_pct": round(eir_sobre_pea, 2),
            "EIR_sobre_PET_pct": round(eir_sobre_pet, 2),
            "Desglose_EIR": {
                "Flotante_poblacion": float(flotante_pop),
                "Flotante_pct_del_EIR": round(
                    (flotante_pop / eir_total_pop) * 100, 2
                ) if eir_total_pop > 0 else 0.0,
                "Latente_poblacion": float(latente_pop),
                "Latente_pct_del_EIR": round(
                    (latente_pop / eir_total_pop) * 100, 2
                ) if eir_total_pop > 0 else 0.0,
                "Estancado_poblacion": float(estancado_pop),
                "Estancado_pct_del_EIR": round(
                    (estancado_pop / eir_total_pop) * 100, 2
                ) if eir_total_pop > 0 else 0.0,
            },
        }


def _quarter_from_eph_filename(path: str) -> str | None:
    """Extract quarter string like '2023-Q4' from EPH filename patterns.

    Handles: usu_individual_t423.txt, usu_individual_T4_2023.txt, etc.
    """
    import re
    name = Path(path).stem.lower()
    # Pattern: t{Q}{YY} or t{Q}_{YY}
    m = re.search(r"t(\d)[_]?(\d{2,4})", name)
    if not m:
        return None
    q = int(m.group(1))
    yy = int(m.group(2))
    year = yy + 2000 if yy < 100 else yy
    if 1 <= q <= 4 and 2003 <= year <= 2026:
        return f"{year}-Q{q}"
    return None


def process_quarter(personas_path: str, hogares_path: str) -> dict | None:
    """Process a single quarter's EPH files and return aggregated metrics."""
    q = _quarter_from_eph_filename(personas_path)
    if not q:
        q = _quarter_from_eph_filename(hogares_path)
    if not q:
        return None

    proc = EPHProcessor(personas_path, hogares_path)
    try:
        proc.load_and_merge()
        proc.clean_and_prepare_variables()
        conventional = proc.calculate_conventional_metrics()
        eir = proc.calculate_eir()
    except Exception as exc:
        return {"quarter": q, "error": str(exc)}

    return {"quarter": q, **conventional, **eir}


def process_directory(data_dir: str) -> dict:
    """Process all EPH quarter files in a directory.

    Expects files named like:
      usu_individual_t124.txt  usu_hogar_t124.txt  (Q1 2024)
      usu_individual_t223.txt  usu_hogar_t223.txt  (Q2 2023)

    Returns {quarters: {q: metrics}, periods: {pid: metrics}, metadata: {...}}.
    """
    data_path = Path(data_dir)
    personas_files = sorted(data_path.glob("usu_individual*.txt"))
    hogares_files = sorted(data_path.glob("usu_hogar*.txt"))

    if not personas_files or not hogares_files:
        return {"quarters": {}, "periods": {}, "metadata": {"error": "No EPH files found"}}

    # Build quarter-keyed pairs
    p_by_q: dict[str, str] = {}
    for f in personas_files:
        q = _quarter_from_eph_filename(str(f))
        if q:
            p_by_q[q] = str(f)

    h_by_q: dict[str, str] = {}
    for f in hogares_files:
        q = _quarter_from_eph_filename(str(f))
        if q:
            h_by_q[q] = str(f)

    quarters_result: dict[str, dict] = {}
    for q in sorted(set(p_by_q) & set(h_by_q)):
        metrics = process_quarter(p_by_q[q], h_by_q[q])
        if metrics and "error" not in metrics:
            quarters_result[q] = metrics

    # Aggregate by period (average across quarters)
    periods_result: dict[str, dict] = {}
    for pid, q_list in PERIOD_QUARTERS.items():
        period_quarters = [quarters_result[q] for q in q_list if q in quarters_result]
        if not period_quarters:
            continue
        n = len(period_quarters)
        agg = {
            "quarter_count": n,
            "Tasa_Desempleo_pct": round(sum(q["Tasa_Desempleo_pct"] for q in period_quarters) / n, 2),
            "Tasa_Informalidad_Asalariada_pct": round(
                sum(q["Tasa_Informalidad_Asalariada_pct"] for q in period_quarters) / n, 2
            ),
            "Tasa_Precarizacion_General_pct": round(
                sum(q["Tasa_Precarizacion_General_pct"] for q in period_quarters) / n, 2
            ),
            "EIR_sobre_PEA_pct": round(sum(q["EIR_sobre_PEA_pct"] for q in period_quarters) / n, 2),
            "EIR_sobre_PET_pct": round(sum(q["EIR_sobre_PET_pct"] for q in period_quarters) / n, 2),
        }
        # Use latest quarter's absolute population counts
        latest = period_quarters[-1]
        agg["PEA_poblacion"] = latest["PEA_poblacion"]
        agg["Desocupados_poblacion"] = latest["Desocupados_poblacion"]
        agg["Ocupados_poblacion"] = latest["Ocupados_poblacion"]
        agg["EIR_Total_poblacion"] = latest["EIR_Total_poblacion"]
        agg["Desglose_EIR"] = latest["Desglose_EIR"]
        periods_result[pid] = agg

    return {
        "quarters": quarters_result,
        "periods": periods_result,
        "metadata": {
            "source": "INDEC EPH",
            "quarters_processed": len(quarters_result),
            "periods_available": list(periods_result.keys()),
        },
    }


def load_or_process(data_dir: str | None = None) -> dict:
    """Load cached EPH data or process from raw files.

    Priority:
      1. Cache at /tmp/cantillon_eph/eph_aggregated.json
      2. Process from data_dir if provided
      3. Return empty (no EPH data available)
    """
    cache_path = CACHE_DIR / "eph_aggregated.json"

    # Try cache first
    if cache_path.exists():
        try:
            return json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Process from raw files
    if data_dir and Path(data_dir).is_dir():
        result = process_directory(data_dir)
        if result.get("quarters"):
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(
                json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
            )
        return result

    return {"quarters": {}, "periods": {}, "metadata": {"source": "none"}}


def get_eph_for_period(period: str, data_dir: str | None = None) -> dict | None:
    """Get EPH metrics for a specific policy period. Returns None if unavailable."""
    data = load_or_process(data_dir)
    return data.get("periods", {}).get(period)


def get_eph_quarterly(period: str, data_dir: str | None = None) -> list[dict]:
    """Get quarterly EPH time series for a period, compatible with reserve_army_series."""
    data = load_or_process(data_dir)
    q_data = data.get("quarters", {})
    period_qs = PERIOD_QUARTERS.get(period, [])
    out = []
    for q in period_qs:
        if q in q_data:
            row = q_data[q]
            out.append({
                "q": q,
                "tasa_desempleo": row.get("Tasa_Desempleo_pct", 0),
                "tasa_informalidad": row.get("Tasa_Informalidad_Asalariada_pct", 0),
                "eir_sobre_pea": row.get("EIR_sobre_PEA_pct", 0),
                "eir_total": row.get("EIR_Total_poblacion", 0),
                "eir_flotante": row.get("Desglose_EIR", {}).get("Flotante_poblacion", 0),
                "eir_latente": row.get("Desglose_EIR", {}).get("Latente_poblacion", 0),
                "eir_estancado": row.get("Desglose_EIR", {}).get("Estancado_poblacion", 0),
            })
    return out
