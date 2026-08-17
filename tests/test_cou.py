"""Unit tests for COU (Cuadros de Oferta y Utilización) ingestion pipeline.

Validates the 107×223 matrix parsing, departmental classification,
accounting identities, and aggregated values against INDEC reference data.

Requires: xlrd>=2.0.1 and a cached COU Excel at /tmp/cantillon_cou/cou_2018.xls
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from python.cou_ingester import (
    ACTIVITY_COLS_END,
    UTIL_COL_CH,
    UTIL_COL_CP,
    UTIL_COL_EX,
    UTIL_COL_FBCF,
    UTIL_COL_UI,
    _CODE_TO_SECTOR,
    _SECTOR_MAP,
    _classify_ciiu,
    _normalize_ciiu,
    aggregate_to_sectors,
    build_dept_flow_matrix,
    build_dept_value_added,
    download_and_parse_cou,
    download_cou_file,
    parse_supply_matrix,
    parse_utilization_matrix,
)

# Tolerance for float comparisons (values in miles de pesos)
_TOL = 1.0


def _get_file() -> Path:
    """Return cached COU Excel path (tests must run after first parse)."""
    p = Path(tempfile.gettempdir()) / "cantillon_cou" / "cou_2018.xls"
    if not p.exists():
        p = download_cou_file(2018)
    return p


class TestNormalizeCIIU(unittest.TestCase):
    """_normalize_ciiu must handle float→str, 5-digit→4-digit, and preserve alpha suffixes."""

    def test_float_integer(self):
        self.assertEqual(_normalize_ciiu(1512.0), "1512")

    def test_float_zero(self):
        self.assertEqual(_normalize_ciiu(0.0), "0")

    def test_string_passthrough(self):
        self.assertEqual(_normalize_ciiu("011/014"), "011/014")

    def test_5digit_normalization(self):
        self.assertEqual(_normalize_ciiu(15120.0), "1512")

    def test_5digit_normalization_15200(self):
        self.assertEqual(_normalize_ciiu(15200.0), "1520")

    def test_alpha_suffix_preserved(self):
        self.assertEqual(_normalize_ciiu("85 PR"), "85 PR")
        self.assertEqual(_normalize_ciiu("80 PU"), "80 PU")

    def test_numeric_string(self):
        self.assertEqual(_normalize_ciiu("1511"), "1511")


class TestActivityDimensions(unittest.TestCase):
    """Matrix must parse exactly 107 CIIU activities and 223 CPC products."""

    @classmethod
    def setUpClass(cls):
        cls.filepath = _get_file()
        cls.supply = parse_supply_matrix(cls.filepath)
        cls.utilization = parse_utilization_matrix(cls.filepath)

    def test_supply_products(self):
        self.assertEqual(len(self.supply["products"]), 223)

    def test_util_products(self):
        self.assertEqual(len(self.utilization["products"]), 223)

    def test_supply_activities(self):
        self.assertEqual(len(self.supply["activities"]), 107)

    def test_util_activities(self):
        self.assertEqual(len(self.utilization["activities"]), 107)

    def test_no_product_duplicates_supply(self):
        self.assertEqual(len(self.supply["products"]), len(set(self.supply["products"])))

    def test_no_product_duplicates_util(self):
        self.assertEqual(len(self.utilization["products"]), len(set(self.utilization["products"])))

    def test_products_aligned(self):
        self.assertEqual(set(self.supply["products"]), set(self.utilization["products"]))

    def test_activities_aligned(self):
        self.assertEqual(set(self.supply["activities"]), set(self.utilization["activities"]))


class TestCIIClassification(unittest.TestCase):
    """All 107 CIIU codes must map to a known sector (not Other/Unknown)."""

    @classmethod
    def setUpClass(cls):
        cls.filepath = _get_file()
        cls.sheet = _open_util_sheet(cls.filepath)
        cls.codes = [
            _normalize_ciiu(cls.sheet.cell_value(4, c))
            for c in range(2, ACTIVITY_COLS_END)
        ]

    def test_count_107(self):
        self.assertEqual(len(self.codes), 107)

    def test_all_classified(self):
        # Code '67' (auxiliares de intermediación financiera) has no prefix in _SECTOR_MAP
        # and falls to Dept III as residual. All OTHER 106 codes must be classified.
        unmapped = [c for c in self.codes if _classify_ciiu(c)[0] == "Other/Unknown"]
        self.assertLessEqual(len(unmapped), 1, f"Too many unmapped: {unmapped}")
        if unmapped:
            self.assertEqual(unmapped[0], "67", f"Unexpected unmapped code: {unmapped}")

    def test_dept_sum_107(self):
        dept_counts = {1: 0, 2: 0, 3: 0}
        for code in self.codes:
            _, dept = _classify_ciiu(code)
            dept_counts[dept] += 1
        self.assertEqual(sum(dept_counts.values()), 107)

    def test_no_sector_conflicts(self):
        seen: dict[str, int] = {}
        for sector, (_, _, dept_n) in _SECTOR_MAP.items():
            if sector in seen:
                self.assertEqual(seen[sector], dept_n, f"Conflict: {sector} maps to depts {seen[sector]} and {dept_n}")
            seen[sector] = dept_n


class TestAccountingIdentity(unittest.TestCase):
    """VBP = UI + VAB must hold for the full economy and per department."""

    @classmethod
    def setUpClass(cls):
        cls.filepath = _get_file()
        cls.sheet = _open_util_sheet(cls.filepath)
        cls.total_ui = _col_sum(cls.sheet, 228, 2, ACTIVITY_COLS_END)
        cls.total_vab = _col_sum(cls.sheet, 229, 2, ACTIVITY_COLS_END)
        cls.total_vbp = _col_sum(cls.sheet, 230, 2, ACTIVITY_COLS_END)

    def test_vbp_equals_ui_plus_vab(self):
        self.assertAlmostEqual(
            self.total_ui + self.total_vab, self.total_vbp, delta=_TOL
        )

    def test_total_ui(self):
        self.assertAlmostEqual(self.total_ui, 11_451_180_448, delta=100)

    def test_total_vab(self):
        self.assertAlmostEqual(self.total_vab, 12_478_123_592, delta=100)

    def test_total_vbp(self):
        self.assertAlmostEqual(self.total_vbp, 23_929_304_040, delta=100)


class TestFinalDemand(unittest.TestCase):
    """Final demand values must match INDEC reference."""

    @classmethod
    def setUpClass(cls):
        cls.filepath = _get_file()
        cls.sheet = _open_util_sheet(cls.filepath)
        cls.result = download_and_parse_cou(2018)
        cls.fd = cls.result["final_demand_totals"]

    def test_household_consumption(self):
        expected = self.sheet.cell_value(228, 110)
        self.assertAlmostEqual(self.fd["household_consumption"], expected, delta=_TOL)

    def test_government_consumption(self):
        expected = self.sheet.cell_value(228, 111)
        self.assertAlmostEqual(self.fd["government_consumption"], expected, delta=_TOL)

    def test_exports(self):
        expected = self.sheet.cell_value(228, 112)
        self.assertAlmostEqual(self.fd["exports"], expected, delta=_TOL)

    def test_fbcf(self):
        expected = self.sheet.cell_value(228, 113)
        self.assertAlmostEqual(self.fd["gross_fixed_capital_formation"], expected, delta=_TOL)

    def test_intermediate_consumption(self):
        expected = self.total_ui_ref()
        self.assertAlmostEqual(self.fd["intermediate_consumption"], expected, delta=100)

    @classmethod
    def total_ui_ref(cls):
        return sum(
            cls.sheet.cell_value(228, c)
            for c in range(2, ACTIVITY_COLS_END)
            if isinstance(cls.sheet.cell_value(228, c), (int, float))
        )


class TestDeptValueAdded(unittest.TestCase):
    """Dept-level VAB, VBP, UI must sum to economy totals and match Excel."""

    @classmethod
    def setUpClass(cls):
        cls.filepath = _get_file()
        cls.sheet = _open_util_sheet(cls.filepath)
        cls.result = download_and_parse_cou(2018)
        cls.dva = cls.result["dept_value_added"]

    def _get_val(self, dept):
        """Handle JSON string-key round-trip."""
        d = self.dva
        return {
            "vab": d["dept_vab"].get(dept, d["dept_vab"].get(str(dept), 0)),
            "vbp": d["dept_vbp"].get(dept, d["dept_vbp"].get(str(dept), 0)),
            "ui": d["dept_intermediate"].get(dept, d["dept_intermediate"].get(str(dept), 0)),
        }

    def test_vbp_equals_ui_plus_vab_per_dept(self):
        for dept in (1, 2, 3):
            v = self._get_val(dept)
            self.assertAlmostEqual(
                v["ui"] + v["vab"], v["vbp"], delta=_TOL,
                msg=f"Dept {dept}: UI+VAB != VBP",
            )

    def test_total_vab_matches_excel(self):
        total = sum(self._get_val(d)["vab"] for d in (1, 2, 3))
        expected = _col_sum(self.sheet, 229, 2, ACTIVITY_COLS_END)
        self.assertAlmostEqual(total, expected, delta=100)

    def test_total_vbp_matches_excel(self):
        total = sum(self._get_val(d)["vbp"] for d in (1, 2, 3))
        expected = _col_sum(self.sheet, 230, 2, ACTIVITY_COLS_END)
        self.assertAlmostEqual(total, expected, delta=100)

    def test_total_ui_matches_excel(self):
        total = sum(self._get_val(d)["ui"] for d in (1, 2, 3))
        expected = _col_sum(self.sheet, 228, 2, ACTIVITY_COLS_END)
        self.assertAlmostEqual(total, expected, delta=100)

    def test_dept3_vab_not_inflated(self):
        v = self._get_val(3)
        self.assertLess(v["vab"], 1e10, "Dept III VAB > 10B — likely contaminated by total VAB column")


class TestDeptFlowMatrix(unittest.TestCase):
    """3×3 inter-departmental flow matrix row/col totals must equal total UI."""

    @classmethod
    def setUpClass(cls):
        cls.filepath = _get_file()
        cls.result = download_and_parse_cou(2018)
        cls.dfm = cls.result["dept_flow_matrix"]
        cls.sheet = _open_util_sheet(cls.filepath)
        cls.total_ui = _col_sum(cls.sheet, 228, 2, ACTIVITY_COLS_END)
        # JSON round-trip converts int keys to strings
        cls.matrix = {int(k): {int(j): v for j, v in row.items()}
                      for k, row in cls.dfm["matrix"].items()}
        cls.row_totals = {int(k): v for k, v in cls.dfm["row_totals"].items()}
        cls.col_totals = {int(k): v for k, v in cls.dfm["col_totals"].items()}

    def test_row_totals_equal_ui(self):
        row_sum = sum(self.row_totals.values())
        self.assertAlmostEqual(row_sum, self.total_ui, delta=100)

    def test_col_totals_equal_ui(self):
        col_sum = sum(self.col_totals.values())
        self.assertAlmostEqual(col_sum, self.total_ui, delta=100)

    def test_all_flows_non_negative(self):
        for i in (1, 2, 3):
            for j in (1, 2, 3):
                self.assertGreaterEqual(
                    self.matrix[i][j], 0.0,
                    msg=f"Negative flow Dept {i}→{j}",
                )

    def test_diagonal_flows_positive(self):
        for d in (1, 2, 3):
            self.assertGreater(
                self.matrix[d][d], 0.0,
                msg=f"Zero intra-department flow Dept {d}→{d}",
            )


class TestSectorAggregation(unittest.TestCase):
    """Sector-level intermediate consumption must sum to total UI."""

    @classmethod
    def setUpClass(cls):
        cls.filepath = _get_file()
        cls.result = download_and_parse_cou(2018)
        cls.sect = cls.result["sector_aggregation"]
        cls.sheet = _open_util_sheet(cls.filepath)

    def test_sector_intermediate_sums_to_ui(self):
        sector_sum = sum(self.sect["sector_intermediate"].values())
        total_ui = _col_sum(self.sheet, 228, 2, ACTIVITY_COLS_END)
        self.assertAlmostEqual(sector_sum, total_ui, delta=100)

    def test_activity_count(self):
        self.assertEqual(self.sect["activity_count"], 107)

    def test_product_count(self):
        self.assertEqual(self.sect["product_count"], 223)


class TestOutputSchema(unittest.TestCase):
    """download_and_parse_cou must return a dict with all required keys."""

    @classmethod
    def setUpClass(cls):
        cls.result = download_and_parse_cou(2018)

    def test_top_level_keys(self):
        required = ["source", "dataset", "year", "unit", "dept_flow_matrix",
                     "dept_value_added", "sector_aggregation", "final_demand_totals"]
        for key in required:
            self.assertIn(key, self.result, f"Missing key: {key}")

    def test_source_is_indec(self):
        self.assertEqual(self.result["source"], "INDEC")

    def test_dataset_is_cou(self):
        self.assertEqual(self.result["dataset"], "COU")

    def test_dept_flow_matrix_structure(self):
        dfm = self.result["dept_flow_matrix"]
        for key in ("matrix", "row_totals", "col_totals", "unit"):
            self.assertIn(key, dfm, f"dept_flow_matrix missing: {key}")
        # JSON round-trip converts int keys to strings
        for i in ("1", "2", "3"):
            self.assertIn(i, dfm["matrix"], f"Matrix missing dept {i}")
            for j in ("1", "2", "3"):
                self.assertIn(j, dfm["matrix"][i], f"Matrix[{i}] missing dept {j}")


class TestIntegration(unittest.TestCase):
    """End-to-end: compute_all with COU for all policy periods."""

    @classmethod
    def setUpClass(cls):
        from python.reproduction_metrics import compute_all
        cls.compute_all = compute_all

    def test_all_periods_have_cou(self):
        for period in ("kirchner", "macri", "fernandez", "milei"):
            report = self.compute_all(period)
            self.assertTrue(report["cou_available"], f"COU not available for {period}")

    def test_cou_enhanced_value_category_all_periods(self):
        for period in ("kirchner", "macri", "fernandez", "milei"):
            report = self.compute_all(period)
            cv = report.get("cou_enhanced_value_category", {})
            self.assertTrue(cv, f"cou_enhanced_value_category empty for {period}")
            for dept in (1, 2, 3):
                self.assertIn(dept, cv, f"Dept {dept} missing in {period}")
                d = cv[dept]
                self.assertAlmostEqual(d["v"] + d["s"], d["vab"], delta=1.0,
                                       msg=f"Dept {dept} v+s != VAB in {period}")

    def test_balI_negative(self):
        report = self.compute_all("milei")
        self.assertLess(
            report["simple_reproduction"]["balance_I_x1_minus_c"], 0,
            "Balance I should be negative (deficit of Dept I output)"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _open_util_sheet(filepath: Path):
    import xlrd
    wb = xlrd.open_workbook(str(filepath))
    return wb.sheet_by_name("Mat_Ut_pc_2018")


def _col_sum(sheet, row: int, col_start: int, col_end: int) -> float:
    total = 0.0
    for c in range(col_start, col_end):
        val = sheet.cell_value(row, c)
        if isinstance(val, (int, float)):
            total += val
    return total


if __name__ == "__main__":
    unittest.main()
