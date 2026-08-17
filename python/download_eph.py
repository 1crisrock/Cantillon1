#!/usr/bin/env python3
"""Download EPH (Encuesta Permanente de Hogares) microdata from INDEC.

Downloads the ZIP archives containing Individual + Hogar TXT files for each
quarter, extracts them into a target directory, and organizes them with
canonical filenames that eph_processor.py expects.

Usage:
    python3 -m python.download_eph --out /path/to/eph/data
    python3 -m python.download_eph --out /path/to/eph/data --start 2016 --end 2025
    python3 -m python.download_eph --out /path/to/eph/data --period milei

Output structure:
    out/
      usu_individual_t124.txt
      usu_hogar_t124.txt
      usu_individual_t224.txt
      ...

Note on data availability:
    - 2003-Q3 to 2015-Q4: INDEC published SPSS/Stata/DBF formats, not TXT.
      The old INDEC site (sitioanterior.indec.gob.ar) has DBF files.
      eph_processor.py only handles the modern TXT format.
    - 2016-Q2 onward: INDEC publishes TXT files in ZIP archives.
    - 2015-Q3, 2015-Q4, 2016-Q1: NOT PUBLISHED (emergencia estadistica).
    - 2007-Q3: NOT PUBLISHED (survey not conducted in key agglomerates).
"""

import argparse
import io
import sys
import zipfile
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# INDEC EPH ZIP archive URL pattern (2016+)
_INDEC_URL = (
    "https://www.indec.gob.ar/ftp/cuadros/menusuperior/eph/"
    "EPH_usu_{quarter}_Trim_{year}_txt.zip"
)

# Quarters that INDEC did not publish
_UNAVAILABLE = {
    (2007, 3),
    (2015, 3), (2015, 4),
    (2016, 1),
}

# Year/quarter range where INDEC publishes modern TXT format
_MODERN_START = (2016, 2)  # Q2 2016 is the first with modern TXT files


def _url_for(year: int, quarter: int) -> str:
    return _INDEC_URL.format(quarter=quarter, year=year)


def _is_modern_txt(year: int, quarter: int) -> bool:
    """True if this quarter is available as a modern INDEC TXT file."""
    if (year, quarter) in _UNAVAILABLE:
        return False
    return (year, quarter) >= _MODERN_START


def _canonical_name(original: str, year: int, quarter: int) -> str:
    """Map any filename inside the ZIP to the canonical name eph_processor expects.

    INDEC ZIPs contain files like:
      usu_individual_t224.txt  or  usu_individual_T2_2024.txt  or  USU_INDIVIDUAL_T2_2024.txt
    We normalize to: usu_individual_t224.txt
    """
    low = original.lower()
    if "individual" in low:
        return f"usu_individual_t{quarter}{year % 100:02d}.txt"
    elif "hogar" in low or "hog" in low:
        return f"usu_hogar_t{quarter}{year % 100:02d}.txt"
    return original


def download_quarter(year: int, quarter: int, out_dir: Path, verbose: bool = True) -> bool:
    """Download and extract one quarter's EPH files. Returns True on success."""
    if not _is_modern_txt(year, quarter):
        if verbose:
            reason = "unavailable (emergencia estadistica)" if (year, quarter) in _UNAVAILABLE \
                else "pre-2016 (not in modern TXT format)"
            print(f"  SKIP  {year}-Q{quarter} ({reason})")
        return False

    url = _url_for(year, quarter)
    if verbose:
        print(f"  GET   {year}-Q{quarter}  {url}")

    try:
        req = Request(url, headers={"User-Agent": "Cantillon-EPH/1.0"})
        with urlopen(req, timeout=60) as resp:
            data = resp.read()
    except (HTTPError, URLError, OSError) as exc:
        print(f"  FAIL  {year}-Q{quarter}: {exc}")
        return False

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            members = zf.namelist()
            extracted = 0
            for member in members:
                if member.endswith("/") or member.startswith("__MACOSX"):
                    continue
                canonical = _canonical_name(member, year, quarter)
                target = out_dir / canonical
                with zf.open(member) as src, open(target, "wb") as dst:
                    dst.write(src.read())
                extracted += 1
            if verbose:
                print(f"  OK    {year}-Q{quarter}: extracted {extracted} file(s)")
            return True
    except zipfile.BadZipFile as exc:
        print(f"  FAIL  {year}-Q{quarter}: bad ZIP: {exc}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Download EPH microdata from INDEC",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--out", required=True, help="Output directory for EPH TXT files")
    parser.add_argument("--start", type=int, default=2016, help="Start year (default: 2016)")
    parser.add_argument("--end", type=int, default=2026, help="End year (default: 2026)")
    parser.add_argument("--period", help="Download only quarters for a policy period "
                        "(kirchner/macri/fernandez/milei)")
    parser.add_argument("--quarter", help="Download a single quarter, e.g. '2024-Q3'")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress output")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.quarter:
        # Single quarter mode
        y, q = args.quarter.split("-Q")
        year, quarter = int(y), int(q)
        ok = download_quarter(year, quarter, out_dir, verbose=not args.quarter)
        sys.exit(0 if ok else 1)

    if args.period:
        # Period mode: derive quarters from PERIOD_QUARTERS
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from python.eph_processor import PERIOD_QUARTERS
        quarters = PERIOD_QUARTERS.get(args.period, [])
        if not quarters:
            print(f"Unknown period: {args.period}")
            print(f"Available: {list(PERIOD_QUARTERS.keys())}")
            sys.exit(1)
        tasks = []
        for q in quarters:
            y, qu = q.split("-Q")
            tasks.append((int(y), int(qu)))
    else:
        # Range mode
        tasks = [(y, q) for y in range(args.start, args.end + 1) for q in range(1, 5)]

    ok_count = 0
    skip_count = 0
    fail_count = 0

    for year, quarter in tasks:
        result = download_quarter(year, quarter, out_dir, verbose=not args.quiet)
        if result:
            ok_count += 1
        elif (year, quarter) in _UNAVAILABLE or not _is_modern_txt(year, quarter):
            skip_count += 1
        else:
            fail_count += 1

    print(f"\nDone: {ok_count} downloaded, {skip_count} skipped, {fail_count} failed")
    print(f"Output: {out_dir}")

    if ok_count == 0 and fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
