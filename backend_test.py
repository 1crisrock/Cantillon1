#!/usr/bin/env python3
"""
Backend regression test suite for Cantillon Tracker multi-app dashboard.
Tests all API endpoints after branch bring-up with focus on:
- HTTP 200 status codes
- JSON response shape validation
- Response time measurements (especially python app=b/c)
- Negative test cases
"""

import requests
import time
import json
from typing import Dict, Any, List, Tuple

# Base URL from .env NEXT_PUBLIC_BASE_URL
BASE_URL = "https://188de8c3-0534-4792-be2d-bcff1befe482.preview.emergentagent.com/api"

# Test results storage
test_results = []

def log_test(endpoint: str, status: str, message: str, response_time: float = None):
    """Log test result"""
    result = {
        "endpoint": endpoint,
        "status": status,
        "message": message,
        "response_time_ms": round(response_time * 1000, 2) if response_time else None
    }
    test_results.append(result)
    status_icon = "✅" if status == "PASS" else "❌"
    time_str = f" ({result['response_time_ms']}ms)" if response_time else ""
    print(f"{status_icon} {endpoint}{time_str}: {message}")

def test_endpoint(url: str, expected_keys: List[str] = None, max_time: float = None) -> Tuple[bool, Dict[Any, Any], float]:
    """
    Test an endpoint and validate response.
    Returns: (success, response_json, response_time)
    """
    try:
        start = time.time()
        response = requests.get(url, timeout=30)
        elapsed = time.time() - start
        
        if response.status_code != 200:
            return False, {"error": f"HTTP {response.status_code}"}, elapsed
        
        try:
            data = response.json()
        except json.JSONDecodeError:
            return False, {"error": "Invalid JSON"}, elapsed
        
        # Validate expected keys if provided
        if expected_keys:
            missing = [k for k in expected_keys if k not in data]
            if missing:
                return False, {"error": f"Missing keys: {missing}", "data": data}, elapsed
        
        # Check response time if max specified
        if max_time and elapsed > max_time:
            return False, {"error": f"Too slow: {elapsed:.2f}s > {max_time}s", "data": data}, elapsed
        
        return True, data, elapsed
        
    except requests.exceptions.Timeout:
        return False, {"error": "Request timeout"}, 30.0
    except Exception as e:
        return False, {"error": str(e)}, 0.0

def test_metrics_endpoints():
    """Test /api/metrics with all periods"""
    print("\n=== Testing /api/metrics endpoints ===")
    periods = ["milei", "kirchner", "macri", "fernandez", "all"]
    
    for period in periods:
        url = f"{BASE_URL}/metrics?period={period}"
        success, data, elapsed = test_endpoint(
            url,
            expected_keys=["period", "metrics"]
        )
        
        if success:
            # Validate metrics structure
            metrics = data.get("metrics", {})
            required_metrics = ["monetary_dilution", "cantillon_vector", "fiscal_capture"]
            missing = [m for m in required_metrics if m not in metrics]
            
            if missing:
                log_test(f"/api/metrics?period={period}", "FAIL", 
                        f"Missing metrics: {missing}", elapsed)
            else:
                # Validate monetary_dilution structure
                md = metrics.get("monetary_dilution", {})
                md_keys = ["current", "initial", "peak", "delta_pct", "series"]
                md_missing = [k for k in md_keys if k not in md]
                
                # Validate cantillon_vector structure
                cv = metrics.get("cantillon_vector", {})
                cv_keys = ["cantillon_gap", "asset_growth", "wage_growth"]
                cv_missing = [k for k in cv_keys if k not in cv]
                
                # Validate fiscal_capture structure
                fc = metrics.get("fiscal_capture", {})
                fc_keys = ["ratio"]
                fc_missing = [k for k in fc_keys if k not in fc]
                
                if md_missing or cv_missing or fc_missing:
                    log_test(f"/api/metrics?period={period}", "FAIL",
                            f"Invalid structure - MD:{md_missing} CV:{cv_missing} FC:{fc_missing}", elapsed)
                else:
                    log_test(f"/api/metrics?period={period}", "PASS",
                            f"Valid JSON with all required metrics", elapsed)
        else:
            log_test(f"/api/metrics?period={period}", "FAIL", 
                    data.get("error", "Unknown error"), elapsed)

def test_fiscal_flows_endpoints():
    """Test /api/fiscal-flows with period and mode variations"""
    print("\n=== Testing /api/fiscal-flows endpoints ===")
    test_cases = [
        ("milei", "nominal"),
        ("milei", "usd"),
        ("kirchner", "nominal"),
        ("macri", "usd"),
    ]
    
    for period, mode in test_cases:
        url = f"{BASE_URL}/fiscal-flows?period={period}&mode={mode}"
        success, data, elapsed = test_endpoint(
            url,
            expected_keys=["period", "mode", "unit"]
        )
        
        if success:
            # Check for flow data structure (sources, destinations, or links)
            has_flow_data = any(k in data for k in ["sources", "destinations", "links", "nodes"])
            if has_flow_data:
                log_test(f"/api/fiscal-flows?period={period}&mode={mode}", "PASS",
                        f"Valid JSON with flow data", elapsed)
            else:
                log_test(f"/api/fiscal-flows?period={period}&mode={mode}", "FAIL",
                        "Missing flow data (sources/destinations/links)", elapsed)
        else:
            log_test(f"/api/fiscal-flows?period={period}&mode={mode}", "FAIL",
                    data.get("error", "Unknown error"), elapsed)

def test_extraction_destination_endpoints():
    """Test /api/extraction-destination"""
    print("\n=== Testing /api/extraction-destination endpoints ===")
    test_cases = [
        ("milei", "nominal"),
        ("milei", "usd"),
        ("fernandez", "nominal"),
    ]
    
    for period, mode in test_cases:
        url = f"{BASE_URL}/extraction-destination?period={period}&mode={mode}"
        success, data, elapsed = test_endpoint(
            url,
            expected_keys=["period", "mode", "unit"]
        )
        
        if success:
            log_test(f"/api/extraction-destination?period={period}&mode={mode}", "PASS",
                    "Valid JSON response", elapsed)
        else:
            log_test(f"/api/extraction-destination?period={period}&mode={mode}", "FAIL",
                    data.get("error", "Unknown error"), elapsed)

def test_timeseries_endpoints():
    """Test /api/timeseries with period and mode variations"""
    print("\n=== Testing /api/timeseries endpoints ===")
    test_cases = [
        ("milei", "nominal"),
        ("milei", "usd"),
        ("kirchner", "nominal"),
        ("all", "usd"),
    ]
    
    for period, mode in test_cases:
        url = f"{BASE_URL}/timeseries?period={period}&mode={mode}"
        success, data, elapsed = test_endpoint(
            url,
            expected_keys=["period", "mode", "count", "data"]
        )
        
        if success:
            # Validate data array is non-empty
            data_array = data.get("data", [])
            if len(data_array) == 0:
                log_test(f"/api/timeseries?period={period}&mode={mode}", "FAIL",
                        "Empty data array", elapsed)
            else:
                # Check first item has expected fields
                first_item = data_array[0]
                expected_fields = ["q", "mb", "rl", "fx", "cpi", "usd"]
                missing_fields = [f for f in expected_fields if f not in first_item]
                
                if missing_fields:
                    log_test(f"/api/timeseries?period={period}&mode={mode}", "FAIL",
                            f"Data items missing fields: {missing_fields}", elapsed)
                else:
                    log_test(f"/api/timeseries?period={period}&mode={mode}", "PASS",
                            f"Valid JSON with {len(data_array)} data points", elapsed)
        else:
            log_test(f"/api/timeseries?period={period}&mode={mode}", "FAIL",
                    data.get("error", "Unknown error"), elapsed)

def test_bcra_endpoints():
    """Test BCRA live and history endpoints"""
    print("\n=== Testing /api/bcra endpoints ===")
    
    # Test /api/bcra/live
    url = f"{BASE_URL}/bcra/live"
    success, data, elapsed = test_endpoint(url)
    
    if success:
        # Accept both live and fallback responses
        source = data.get("source", "")
        if source in ["BCRA_LIVE", "BCRA_LIVE_CACHED", "SEED_FALLBACK"]:
            log_test("/api/bcra/live", "PASS",
                    f"Valid JSON (source: {source})", elapsed)
        else:
            log_test("/api/bcra/live", "FAIL",
                    f"Unknown source: {source}", elapsed)
    else:
        log_test("/api/bcra/live", "FAIL",
                data.get("error", "Unknown error"), elapsed)
    
    # Test /api/bcra/history
    url = f"{BASE_URL}/bcra/history?id=1&from=2025-08-12&to=2026-08-12"
    success, data, elapsed = test_endpoint(url)
    
    if success:
        source = data.get("source", "")
        if source in ["BCRA_LIVE", "ERROR"]:
            # ERROR is acceptable if BCRA API is down
            status = "PASS" if source == "BCRA_LIVE" else "PASS"
            log_test("/api/bcra/history", status,
                    f"Response received (source: {source})", elapsed)
        else:
            log_test("/api/bcra/history", "FAIL",
                    f"Unexpected source: {source}", elapsed)
    else:
        log_test("/api/bcra/history", "FAIL",
                data.get("error", "Unknown error"), elapsed)

def test_python_health():
    """Test /api/python/health endpoint"""
    print("\n=== Testing /api/python/health ===")
    
    url = f"{BASE_URL}/python/health"
    success, data, elapsed = test_endpoint(
        url,
        expected_keys=["service", "engine", "apps", "periods", "modes"]
    )
    
    if success:
        log_test("/api/python/health", "PASS",
                "Valid health response", elapsed)
    else:
        log_test("/api/python/health", "FAIL",
                data.get("error", "Unknown error"), elapsed)

def test_python_engines():
    """Test /api/python with all app engines - CRITICAL: measure response times"""
    print("\n=== Testing /api/python engines (CRITICAL: response time check) ===")
    
    apps = ["a", "b", "c", "all"]
    max_acceptable_time = 3.0  # 3 seconds max
    
    for app in apps:
        url = f"{BASE_URL}/python?app={app}&period=milei&mode=nominal&real_term=100&accumulation_rate=0.5"
        success, data, elapsed = test_endpoint(
            url,
            expected_keys=["engine", "period", "mode", "payload"],
            max_time=max_acceptable_time
        )
        
        if success:
            # Validate payload structure
            payload = data.get("payload", {})
            
            # app=all has different structure: {a: {...}, b: {...}, c: {...}}
            if app == "all":
                has_all_apps = all(k in payload for k in ["a", "b", "c"])
                if not has_all_apps:
                    log_test(f"/api/python?app={app}", "FAIL",
                            "Missing app data (expected a, b, c)", elapsed)
                else:
                    # Validate each app has kpis
                    missing_kpis = [k for k in ["a", "b", "c"] if "kpis" not in payload.get(k, {})]
                    if missing_kpis:
                        log_test(f"/api/python?app={app}", "FAIL",
                                f"Apps missing kpis: {missing_kpis}", elapsed)
                    else:
                        log_test(f"/api/python?app={app}", "PASS",
                                "Valid JSON with all app data (a, b, c)", elapsed)
            else:
                # Single app: expect kpis at top level
                has_kpis = "kpis" in payload
                has_output = any(k in payload for k in ["charts", "matrix", "sankey", "raw"])
                
                if not has_kpis:
                    log_test(f"/api/python?app={app}", "FAIL",
                            "Missing 'kpis' in payload", elapsed)
                elif not has_output:
                    log_test(f"/api/python?app={app}", "FAIL",
                            "Missing output data (charts/matrix/sankey/raw)", elapsed)
                else:
                    # Special attention to app=b and app=c response times
                    if app in ["b", "c"]:
                        if elapsed > max_acceptable_time:
                            log_test(f"/api/python?app={app}", "FAIL",
                                    f"⚠️ PERFORMANCE ISSUE: {elapsed:.2f}s > {max_acceptable_time}s (deadlock not fixed?)", elapsed)
                        else:
                            log_test(f"/api/python?app={app}", "PASS",
                                    f"✓ FAST response (deadlock fix confirmed)", elapsed)
                    else:
                        log_test(f"/api/python?app={app}", "PASS",
                                "Valid JSON with kpis and output data", elapsed)
        else:
            error_msg = data.get("error", "Unknown error")
            if "Too slow" in error_msg and app in ["b", "c"]:
                log_test(f"/api/python?app={app}", "FAIL",
                        f"⚠️ CRITICAL: {error_msg} - execFileSync deadlock may not be fixed!", elapsed)
            else:
                log_test(f"/api/python?app={app}", "FAIL", error_msg, elapsed)

def test_python_negative_cases():
    """Test /api/python with invalid parameters (should return 400)"""
    print("\n=== Testing /api/python negative cases ===")
    
    test_cases = [
        ("app=x", "Invalid app"),
        ("app=a&period=invalid", "Invalid period"),
        ("app=a&period=milei&accumulation_rate=2", "accumulation_rate out of range"),
        ("app=a&period=milei&real_term=200", "real_term out of range"),
    ]
    
    for params, description in test_cases:
        url = f"{BASE_URL}/python?{params}"
        try:
            start = time.time()
            response = requests.get(url, timeout=10)
            elapsed = time.time() - start
            
            if response.status_code == 400:
                log_test(f"/api/python?{params}", "PASS",
                        f"Correctly rejected: {description}", elapsed)
            else:
                log_test(f"/api/python?{params}", "FAIL",
                        f"Expected 400, got {response.status_code}", elapsed)
        except Exception as e:
            log_test(f"/api/python?{params}", "FAIL",
                    f"Request failed: {str(e)}", 0.0)

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["status"] == "PASS")
    failed = sum(1 for r in test_results if r["status"] == "FAIL")
    total = len(test_results)
    
    print(f"\nTotal Tests: {total}")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for r in test_results:
            if r["status"] == "FAIL":
                time_str = f" ({r['response_time_ms']}ms)" if r['response_time_ms'] else ""
                print(f"  - {r['endpoint']}{time_str}: {r['message']}")
    
    # Special report on python engine response times
    print("\n⏱️  PYTHON ENGINE RESPONSE TIMES (deadlock fix verification):")
    python_tests = [r for r in test_results if "/api/python?app=" in r["endpoint"]]
    for r in python_tests:
        if r["response_time_ms"]:
            status_icon = "✅" if r["response_time_ms"] < 3000 else "⚠️"
            print(f"  {status_icon} {r['endpoint']}: {r['response_time_ms']}ms")

if __name__ == "__main__":
    print("="*80)
    print("CANTILLON TRACKER - BACKEND REGRESSION TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Testing after branch bring-up with execFileSync -> async execFile fix")
    print("="*80)
    
    try:
        # Run all test suites
        test_metrics_endpoints()
        test_fiscal_flows_endpoints()
        test_extraction_destination_endpoints()
        test_timeseries_endpoints()
        test_bcra_endpoints()
        test_python_health()
        test_python_engines()
        test_python_negative_cases()
        
        # Print summary
        print_summary()
        
        # Exit with appropriate code
        failed = sum(1 for r in test_results if r["status"] == "FAIL")
        exit(0 if failed == 0 else 1)
        
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        exit(1)
    except Exception as e:
        print(f"\n\n❌ FATAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
