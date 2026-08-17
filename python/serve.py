"""CLI bridge — runs the three Python metric engines and emits UI-ready JSON.

Used by the Next.js route (app/api/python/[...path]/route.js) as a subprocess:

    python3 -m python.serve --app a --period milei --mode nominal
    python3 -m python.serve --app all --period all --mode usd
    python3 -m python.serve --app c --period kirchner --accumulation-rate 0.6
    python3 -m python.serve --app b --period milei --eph-dir /path/to/eph/files

Emits a single JSON document on stdout:
    {"engine": ..., "period": ..., "mode": ..., "payload": {charts, kpis, sankey, raw}}
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from . import data_loader
from . import cantillon_metrics
from . import marxian_metrics
from . import reproduction_metrics
from . import payloads


def app_a(period: str, mode: str) -> dict:
    ds = data_loader.DataSource()
    report = cantillon_metrics.compute_all(period, mode, ds)
    series = ds.timeseries(period, mode)
    flows = ds.fiscal_flows(period, mode)
    return payloads.build_app_a(period, mode, report, series, flows)


def app_b(period: str, mode: str, real_term: float = 100,
          source: str = "auto", imb_alpha: float = 0.5) -> dict:
    ds = data_loader.DataSource()
    report = marxian_metrics.compute_all(period, "nominal", ds,
                                        source=source, imb_alpha=imb_alpha)
    flows = ds.fiscal_flows(period, "nominal")
    return payloads.build_app_b(period, mode, report, flows, real_term, imb_alpha)


def app_c(period: str, mode: str, accumulation_rate: float) -> dict:
    ds = data_loader.DataSource()
    report = reproduction_metrics.compute_all(period, mode, accumulation_rate, ds)
    return payloads.build_app_c(period, mode, report)


def emit(app: str, period: str, mode: str, accumulation_rate: float,
         real_term: float, source: str = "auto", imb_alpha: float = 0.5) -> dict:
    if app == "all":
        payload = {
            "a": app_a(period, mode),
            "b": app_b(period, mode, real_term, source, imb_alpha),
            "c": app_c(period, mode, accumulation_rate),
        }
    elif app == "b":
        payload = app_b(period, mode, real_term, source, imb_alpha)
    elif app == "c":
        payload = app_c(period, mode, accumulation_rate)
    else:
        payload = app_a(period, mode)
    return {"engine": f"app-{app}", "period": period, "mode": mode,
            "real_term": real_term, "source": source, "imb_alpha": imb_alpha,
            "payload": payload}


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Cantillon Python engine bridge")
    parser.add_argument("--app", choices=("a", "b", "c", "all"), default="all")
    parser.add_argument("--period", default="milei",
                        choices=("kirchner", "macri", "fernandez", "milei", "all"))
    parser.add_argument("--mode", choices=("nominal", "usd"), default="nominal")
    parser.add_argument("--accumulation-rate", type=float, default=0.5)
    parser.add_argument("--real-term", type=float, default=100)
    parser.add_argument("--source", choices=("fiscal", "cgi_imo", "auto"), default="auto",
                        help="Value source for App B: fiscal (budget), cgi_imo (INDEC), auto (detect)")
    parser.add_argument("--imb-alpha", type=float, default=0.5,
                        help="IMB split: share of mixed income to v (0.0-1.0)")
    parser.add_argument("--eph-dir", type=str, default=None,
                        help="Directory containing EPH microdata TXT files (personas + hogares)")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if not (0.0 <= args.accumulation_rate <= 1.0):
        raise SystemExit("--accumulation-rate must be in [0, 1]")
    if not (0.0 <= args.real_term <= 100.0):
        raise SystemExit("--real-term must be in [0, 100]")
    if not (0.0 <= args.imb_alpha <= 1.0):
        raise SystemExit("--imb-alpha must be in [0, 1]")
    # Set EPH data directory for the engines to pick up
    if args.eph_dir:
        os.environ["EPH_DATA_DIR"] = args.eph_dir
    result = emit(args.app, args.period, args.mode, args.accumulation_rate,
                  args.real_term, args.source, args.imb_alpha)
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
