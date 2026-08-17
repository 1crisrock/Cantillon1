"""INDEC COU (Cuadros de Oferta y Utilización) ingestion pipeline.

Downloads Supply and Use Table matrices from INDEC FTP, parses Excel
workbooks (.xls via xlrd), aggregates to ~30 macro-sectors, and maps
to Marxian reproduction departments (I/II/III).

Requires: xlrd>=2.0.1
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import urllib.request
import urllib.error
from pathlib import Path

try:
    import xlrd
except ImportError:
    xlrd = None  # graceful degradation — cou_matrix() will raise ImportError

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
COU_URL = "https://www.indec.gob.ar/ftp/cuadros/economia/sh_cou_08_21.xls"
CACHE_DIR = Path(tempfile.gettempdir()) / "cantillon_cou"
CACHE_FILE = CACHE_DIR / "cou_2018.json"

# Supply matrix rows: product data starts at row 5, ends at row 228 (Total)
# Columns: 0=description, 1=CPC code, 2..108=CIIU activity codes (107 sectors)
#          Col 109+=aggregate/identity columns (OPB, IMPO, etc.)
SUPPLY_DATA_START = 5
SUPPLY_DATA_END = 228  # exclusive — row 228 is "Total"

# Utilization matrix: same row structure
UTIL_DATA_START = 5
UTIL_DATA_END = 228  # exclusive — row 228 is "Total"

# Activity columns boundary: cols 2..108 (0-based) = 107 CIIU Rev.3 activities.
# Col 109+ holds aggregate/demand columns — must NOT be parsed as activity codes.
ACTIVITY_COLS_END = 109  # exclusive upper bound for activity columns

# Utilization matrix final-demand column indices (0-based)
# Row 4 labels: UI, CH, CP, EX, Fbc Fijo, OV, Productos terminados, Trabajos en curso, UF, DEMANDA
UTIL_COL_UI = 109   # Intermediate consumption total (col 109)
UTIL_COL_CH = 110   # Household final consumption (col 110)
UTIL_COL_CP = 111   # Government final consumption (col 111)
UTIL_COL_EX = 112   # Exports (col 112)
UTIL_COL_FBCF = 113 # Gross fixed capital formation (col 113)
UTIL_COL_OV = 114   # Valuables (col 114)
UTIL_COL_VEP = 115  # Changes in inventories — finished products (col 115)
UTIL_COL_VTC = 116  # Changes in inventories — work in progress (col 116)
UTIL_COL_UF = 117   # Final utilization total (col 117)
UTIL_COL_DEMANDA = 118  # Total demand (col 118)

# --------------------------------------------------------------------------- #
# Sector aggregation: ClaNAE 120 (CIIU Rev.3) → ~30 macro-sectors
# --------------------------------------------------------------------------- #
# Each macro-sector maps to a list of CIIU code prefixes (strings).
# The COU column headers use codes like "011/014", "1511", "641", etc.
# We match on the first 1-2 digits of the numeric code.

_SECTOR_MAP: dict[str, tuple[str, list[str], int]] = {
    # sector_name: (department, ciiu_prefixes, dept_number)
    "Agriculture & Livestock":          ("I",   ["01", "02", "160"], 1),
    "Forestry & Fishing":              ("I",   ["03", "05"], 1),
    "Mining & Quarrying":              ("I",   ["10", "11", "13", "14"], 1),
    "Food & Beverages":                ("I",   ["15"], 1),
    "Textiles & Apparel":              ("I",   ["17", "18"], 1),
    "Leather & Footwear":              ("I",   ["19"], 1),
    "Wood & Furniture":                ("I",   ["20"], 1),
    "Paper & Printing":                ("I",   ["21", "22"], 1),
    "Petroleum & Chemicals":           ("I",   ["23", "24"], 1),
    "Rubber & Plastics":               ("I",   ["25"], 1),
    "Non-metallic Minerals":           ("I",   ["26"], 1),
    "Basic Metals":                    ("I",   ["27"], 1),
    "Metal Products":                  ("I",   ["28"], 1),
    "Machinery & Equipment":           ("I",   ["29"], 1),
    "Electrical Equipment":            ("I",   ["30", "31"], 1),
    "Transport Equipment":             ("I",   ["32", "33", "34"], 1),
    "Other Manufacturing":             ("I",   ["35", "36", "37"], 1),
    "Recycling":                       ("I",   ["38", "39"], 1),
    "Utilities (Water, Gas, Electric)":("I",   ["40", "41"], 1),
    "Construction":                    ("I",   ["42", "43"], 1),
    "Wholesale & Retail Trade":        ("II",  ["45", "46", "47"], 2),
    "Transportation & Storage":        ("II",  ["49", "50", "51", "52", "53"], 2),
    "Accommodation & Food Services":   ("II",  ["55", "56"], 2),
    "Information & Communication":     ("II",  ["58", "59", "60", "61", "62", "63"], 2),
    "Financial Services":              ("III", ["64", "65", "66"], 3),
    "Insurance & Pensions":            ("III", ["66"], 3),
    "Real Estate":                     ("II",  ["68", "70"], 2),
    "Professional Services":           ("II",  ["69", "71", "72", "73", "74"], 2),
    "Administrative Services":         ("II",  ["75", "76", "77", "78", "79", "80"], 2),
    "Public Administration":           ("III", ["84"], 3),
    "Education":                       ("II",  ["85", "80 PU"], 2),
    "Health Services":                 ("II",  ["86", "87", "85 PR"], 2),
    "Arts & Entertainment":            ("II",  ["90", "91", "92", "93"], 2),
    "Other Services":                  ("II",  ["94", "95"], 2),
    "Household Activities":            ("II",  ["97", "98"], 2),
}

# Reverse lookup: CIIU code prefix → (sector_name, dept_number)
_CODE_TO_SECTOR: dict[str, tuple[str, int]] = {}
for _sector, (_dept, _prefixes, _dept_n) in _SECTOR_MAP.items():
    for _pfx in _prefixes:
        _CODE_TO_SECTOR[_pfx] = (_sector, _dept_n)


def _classify_ciiu(code_str: str) -> tuple[str, int]:
    """Map a CIIU code string (e.g. '1511', '011/014', '85 PR') to (sector, dept)."""
    # Try exact match first
    if code_str in _CODE_TO_SECTOR:
        return _CODE_TO_SECTOR[code_str]
    # Try numeric prefix matching (first 2 digits)
    for i in range(min(3, len(code_str)), 0, -1):
        pfx = code_str[:i]
        if pfx in _CODE_TO_SECTOR:
            return _CODE_TO_SECTOR[pfx]
    # Default: classify as Dept III (residual)
    return ("Other/Unknown", 3)


# --------------------------------------------------------------------------- #
# Excel download
# --------------------------------------------------------------------------- #
def download_cou_file(year: int = 2018, force: bool = False) -> Path:
    """Download COU Excel from INDEC FTP, cache to /tmp."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"cou_{year}.xls"
    if cached.exists() and not force:
        return cached
    url = COU_URL
    req = urllib.request.Request(url, headers={
        "User-Agent": "CantillonTracker/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        cached.write_bytes(data)
        return cached
    except urllib.error.URLError as e:
        raise RuntimeError(f"Failed to download COU from {url}: {e}") from e


# --------------------------------------------------------------------------- #
# Excel parsing
# --------------------------------------------------------------------------- #
def _normalize_ciiu(val) -> str:
    """Normalize a CIIU code from Excel to a canonical string.

    Handles float→int conversion and normalizes 5-digit codes to 4-digit
    by stripping trailing zeros (e.g. 15120→'1512'). Preserves codes with
    alphabetic suffixes like '011/014' or '85 PR'.
    """
    if isinstance(val, float):
        s = str(int(val)) if val == int(val) else str(val)
    else:
        s = str(val).strip()
    # Normalize 5-digit numeric codes to 4-digit (INDEC supply/util format mismatch)
    if s.isdigit() and len(s) == 5:
        s = s[:4]
    return s


def _parse_ciiu_codes(sheet) -> list[str]:
    """Extract CIIU activity codes from row 4 of the sheet (0-indexed).

    Only reads cols 2..ACTIVITY_COLS_END (107 CIIU Rev.3 codes).
    Skips aggregate/demand columns (OPB, IMPO, UI, CH, etc.).
    """
    codes = []
    for c in range(2, min(ACTIVITY_COLS_END, sheet.ncols)):
        codes.append(_normalize_ciiu(sheet.cell_value(4, c)))
    return codes


def _parse_product_codes(sheet) -> list[str]:
    """Extract CPC product codes from column B (index 1), data rows."""
    codes = []
    for r in range(SUPPLY_DATA_START, min(SUPPLY_DATA_END, sheet.nrows)):
        codes.append(_normalize_ciiu(sheet.cell_value(r, 1)))
    return codes


def parse_supply_matrix(filepath: Path) -> dict:
    """Parse Supply matrix → {product_idx: {activity_idx: value}}.

    Returns dict with:
    - products: list of CPC codes
    - activities: list of CIIU codes
    - production: {product_idx: {activity_idx: value_in_thousands}}
    """
    wb = xlrd.open_workbook(str(filepath))
    sheet = wb.sheet_by_name("Mat_Of_pc_2018")

    activities = _parse_ciiu_codes(sheet)
    products = []
    production = {}

    for r in range(SUPPLY_DATA_START, min(SUPPLY_DATA_END, sheet.nrows)):
        pcode = sheet.cell_value(r, 1)
        if isinstance(pcode, float):
            pcode = str(int(pcode)) if pcode == int(pcode) else str(pcode)
        pcode = str(pcode).strip()
        if not pcode or pcode == "Total":
            continue
        products.append(pcode)
        pidx = len(products) - 1
        production[pidx] = {}
        for c in range(2, min(ACTIVITY_COLS_END, sheet.ncols)):
            val = sheet.cell_value(r, c)
            if isinstance(val, (int, float)) and val != 0:
                production[pidx][c - 2] = float(val)

    return {
        "products": products,
        "activities": activities,
        "production": production,
    }


def parse_utilization_matrix(filepath: Path) -> dict:
    """Parse Utilization matrix → intermediate consumption + final demand.

    Returns dict with:
    - products: list of CPC codes
    - activities: list of CIIU codes
    - intermediate: {product_idx: {activity_idx: value}} (intermediate consumption)
    - final_demand: {product_idx: {component: value}}
      where component is one of: 'CH', 'CP', 'EX', 'FBCF', 'VEP', 'VTC'
    """
    wb = xlrd.open_workbook(str(filepath))
    sheet = wb.sheet_by_name("Mat_Ut_pc_2018")

    activities = _parse_ciiu_codes(sheet)
    products = []
    intermediate = {}
    final_demand = {}

    for r in range(UTIL_DATA_START, min(UTIL_DATA_END, sheet.nrows)):
        pcode = sheet.cell_value(r, 1)
        if isinstance(pcode, float):
            pcode = str(int(pcode)) if pcode == int(pcode) else str(pcode)
        pcode = str(pcode).strip()
        if not pcode or pcode == "Total":
            continue
        products.append(pcode)
        pidx = len(products) - 1

        # Intermediate consumption columns (activities)
        intermediate[pidx] = {}
        for c in range(2, UTIL_COL_UI):
            if c >= sheet.ncols:
                break
            val = sheet.cell_value(r, c)
            if isinstance(val, (int, float)) and val != 0:
                intermediate[pidx][c - 2] = float(val)

        # Final demand columns
        fd = {}
        col_map = {
            "CH": UTIL_COL_CH,
            "CP": UTIL_COL_CP,
            "EX": UTIL_COL_EX,
            "FBCF": UTIL_COL_FBCF,
            "OV": UTIL_COL_OV,
            "VEP": UTIL_COL_VEP,
            "VTC": UTIL_COL_VTC,
        }
        for comp, col in col_map.items():
            if col < sheet.ncols:
                val = sheet.cell_value(r, col)
                if isinstance(val, (int, float)) and val != 0:
                    fd[comp] = float(val)
        final_demand[pidx] = fd

    return {
        "products": products,
        "activities": activities,
        "intermediate": intermediate,
        "final_demand": final_demand,
    }


# --------------------------------------------------------------------------- #
# Aggregation: 223×107 → ~30 macro-sectors
# --------------------------------------------------------------------------- #
def aggregate_to_sectors(utilization: dict) -> dict:
    """Aggregate the 223 activities into ~30 macro-sectors.

    Returns:
    - sector_totals: {sector_name: {'c': intermediate, 'v': value_added, 's': surplus}}
    - sector_dept: {sector_name: dept_number}
    - dept_totals: {1: value, 2: value, 3: value}
    """
    activities = utilization["activities"]
    intermediate = utilization["intermediate"]
    final_demand = utilization["final_demand"]

    # Classify each activity column into a sector
    activity_sector: list[tuple[str, int]] = []
    for act_code in activities:
        sector, dept = _classify_ciiu(act_code)
        activity_sector.append((sector, dept))

    # Aggregate intermediate consumption per sector
    sector_intermediate: dict[str, float] = {}
    for pidx, act_vals in intermediate.items():
        for aidx, val in act_vals.items():
            if aidx < len(activity_sector):
                sector, _ = activity_sector[aidx]
                sector_intermediate[sector] = sector_intermediate.get(sector, 0.0) + val

    # Aggregate final demand by type across all products
    total_ch = 0.0  # household consumption
    total_cp = 0.0  # government consumption
    total_ex = 0.0  # exports
    total_fbcr = 0.0  # gross fixed capital formation
    total_ui = 0.0  # intermediate consumption total

    for pidx, fd in final_demand.items():
        total_ch += fd.get("CH", 0.0)
        total_cp += fd.get("CP", 0.0)
        total_ex += fd.get("EX", 0.0)
        total_fbcr += fd.get("FBCF", 0.0)

    for pidx, act_vals in intermediate.items():
        for val in act_vals.values():
            total_ui += val

    # Build department totals
    dept_totals: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.0}
    sector_dept: dict[str, int] = {}
    for sector, (_, _, dept_n) in _SECTOR_MAP.items():
        sector_dept[sector] = dept_n
        dept_totals[dept_n] += sector_intermediate.get(sector, 0.0)

    return {
        "sector_intermediate": {k: round(v, 2) for k, v in sector_intermediate.items()},
        "sector_dept": sector_dept,
        "dept_intermediate_totals": {k: round(v, 2) for k, v in dept_totals.items()},
        "final_demand_totals": {
            "household_consumption": round(total_ch, 2),
            "government_consumption": round(total_cp, 2),
            "exports": round(total_ex, 2),
            "gross_fixed_capital_formation": round(total_fbcr, 2),
            "intermediate_consumption": round(total_ui, 2),
        },
        "activity_count": len(activities),
        "product_count": len(utilization["products"]),
    }


def build_dept_flow_matrix(supply: dict, utilization: dict) -> dict:
    """Build a 3×3 inter-departmental flow matrix from COU data.

    Flow I→J = total intermediate consumption by Dept J sectors
    of products produced by Dept I sectors.
    """
    activities = supply["activities"]
    production = supply["production"]
    util_intermediate = utilization["intermediate"]

    # Classify each activity into a department
    act_dept: list[int] = []
    for act_code in activities:
        _, dept = _classify_ciiu(act_code)
        act_dept.append(dept)

    # For each product, compute which department produced it
    # (by the activity that contributed most to its production)
    product_dept: dict[int, int] = {}
    for pidx, act_vals in production.items():
        if not act_vals:
            product_dept[pidx] = 3
            continue
        # Find the activity with max production contribution
        max_dept = 3
        max_val = 0.0
        for aidx, val in act_vals.items():
            if val > max_val and aidx < len(act_dept):
                max_val = val
                max_dept = act_dept[aidx]
        product_dept[pidx] = max_dept

    # Build 3×3 matrix: flow[dept_producing][dept_consuming]
    matrix = {i: {j: 0.0 for j in range(1, 4)} for i in range(1, 4)}

    for pidx, act_vals in util_intermediate.items():
        src_dept = product_dept.get(pidx, 3)
        for aidx, val in act_vals.items():
            if aidx < len(act_dept):
                tgt_dept = act_dept[aidx]
                matrix[src_dept][tgt_dept] += val

    rounded = {i: {j: round(v, 2) for j, v in row.items()} for i, row in matrix.items()}
    row_totals = {i: round(sum(row.values()), 2) for i, row in matrix.items()}
    col_totals = {j: round(sum(matrix[i][j] for i in range(1, 4)), 2) for j in range(1, 4)}

    return {
        "matrix": rounded,
        "row_totals": row_totals,
        "col_totals": col_totals,
        "unit": "T ARS (miles de pesos, 2018)",
    }


def build_dept_value_added(supply: dict, utilization: dict) -> dict:
    """Compute c/v/s per department from COU data.

    - c (constant capital) = intermediate consumption by dept
    - v (variable capital) = compensation of employees (from VAB)
    - s (surplus value) = gross operating surplus + taxes (from VAB)
    """
    # VAB is in row 229 of the utilization matrix
    wb = xlrd.open_workbook(str(Path(tempfile.gettempdir()) / "cantillon_cou" / "cou_2018.xls"))
    sheet = wb.sheet_by_name("Mat_Ut_pc_2018")

    # Read VAB row (row 229, 0-indexed)
    vab_row = 229
    activities = supply["activities"]

    act_dept: list[int] = []
    for act_code in activities:
        _, dept = _classify_ciiu(act_code)
        act_dept.append(dept)

    dept_vab: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.0}
    for c in range(2, min(ACTIVITY_COLS_END, sheet.ncols)):
        val = sheet.cell_value(vab_row, c)
        if isinstance(val, (int, float)) and c - 2 < len(act_dept):
            dept = act_dept[c - 2]
            dept_vab[dept] += float(val)

    # Read VBP row (row 230) for total production
    vbp_row = 230
    dept_vbp: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.0}
    for c in range(2, min(ACTIVITY_COLS_END, sheet.ncols)):
        val = sheet.cell_value(vbp_row, c)
        if isinstance(val, (int, float)) and c - 2 < len(act_dept):
            dept = act_dept[c - 2]
            dept_vbp[dept] += float(val)

    # Read intermediate consumption totals (row 228)
    ui_row = 228
    dept_ui: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.0}
    for c in range(2, min(ACTIVITY_COLS_END, sheet.ncols)):
        val = sheet.cell_value(ui_row, c)
        if isinstance(val, (int, float)) and c - 2 < len(act_dept):
            dept = act_dept[c - 2]
            dept_ui[dept] += float(val)

    return {
        "dept_vab": {k: round(v, 2) for k, v in dept_vab.items()},
        "dept_vbp": {k: round(v, 2) for k, v in dept_vbp.items()},
        "dept_intermediate": {k: round(v, 2) for k, v in dept_ui.items()},
    }


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #
def download_and_parse_cou(year: int = 2018, force: bool = False) -> dict:
    """Download COU Excel, parse, aggregate, and return normalized data.

    Returns dict with:
    - source: "INDEC"
    - dataset: "COU"
    - year: 2018
    - unit: "T ARS"
    - dept_flow_matrix: {matrix, row_totals, col_totals}
    - dept_value_added: {dept_vab, dept_vbp, dept_intermediate}
    - sector_aggregation: {sector_intermediate, sector_dept, ...}
    - final_demand_totals: {household, government, exports, investment}
    """
    if xlrd is None:
        raise ImportError("xlrd is required for COU parsing. Install: pip install xlrd>=2.0.1")

    # Check cache first
    if CACHE_FILE.exists() and not force:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))

    filepath = download_cou_file(year, force)
    supply = parse_supply_matrix(filepath)
    utilization = parse_utilization_matrix(filepath)

    sector_agg = aggregate_to_sectors(utilization)
    dept_flow = build_dept_flow_matrix(supply, utilization)
    dept_va = build_dept_value_added(supply, utilization)

    result = {
        "source": "INDEC",
        "dataset": "COU",
        "year": year,
        "unit": "T ARS (miles de pesos, 2018 prices)",
        "dept_flow_matrix": dept_flow,
        "dept_value_added": dept_va,
        "sector_aggregation": sector_agg,
        "final_demand_totals": sector_agg["final_demand_totals"],
    }

    # Cache result
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    return result


def main() -> None:
    """CLI entry point: fetch COU, print JSON summary."""
    dry_run = "--dry-run" in sys.argv

    print("Fetching COU data from INDEC...", file=sys.stderr)
    try:
        result = download_and_parse_cou(force="--force" in sys.argv)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Source: {result['source']}", file=sys.stderr)
    print(f"Dataset: {result['dataset']}", file=sys.stderr)
    print(f"Year: {result['year']}", file=sys.stderr)
    print(f"Unit: {result['unit']}", file=sys.stderr)

    dvm = result["dept_flow_matrix"]
    print(f"\n3×3 Inter-department flow matrix:", file=sys.stderr)
    for i in range(1, 4):
        row = [dvm["matrix"][i][j] for j in range(1, 4)]
        print(f"  Dept {i}: {row}  (total: {dvm['row_totals'][i]})", file=sys.stderr)

    dva = result["dept_value_added"]
    print(f"\nValue added by department:", file=sys.stderr)
    for d in range(1, 4):
        print(f"  Dept {d}: VAB={dva['dept_vab'][d]:,.0f}  VBP={dva['dept_vbp'][d]:,.0f}  UI={dva['dept_intermediate'][d]:,.0f}", file=sys.stderr)

    fd = result["final_demand_totals"]
    print(f"\nFinal demand totals (T ARS):", file=sys.stderr)
    for k, v in fd.items():
        print(f"  {k}: {v:,.0f}", file=sys.stderr)

    if not dry_run:
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
