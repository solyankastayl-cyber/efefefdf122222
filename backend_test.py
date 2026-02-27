#!/usr/bin/env python3
"""
Fractal Platform Backend Testing Suite
Tests all required API endpoints for DXY, SPX, and BTC modules
"""

import requests
import sys
import json
from datetime import datetime
import time

class FractalAPITester:
    def __init__(self, base_url="https://markov-macro-preview.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def test_endpoint(self, name, endpoint, expected_status=200, timeout=30):
        """Test a single API endpoint"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            print(f"\n🔍 Testing {name}...")
            print(f"   URL: {url}")
            
            response = requests.get(url, timeout=timeout)
            
            success = response.status_code == expected_status
            
            if success:
                try:
                    data = response.json()
                    details = {
                        "status_code": response.status_code,
                        "response_size": len(response.content),
                        "has_data": bool(data)
                    }
                    
                    # Special checks for specific endpoints
                    if "health" in endpoint:
                        details["proxy_status"] = data.get("status")
                        details["ts_backend_status"] = data.get("ts_backend", {}).get("ok")
                    elif "dxy/terminal" in endpoint:
                        details["paths_count"] = len(data.get("paths", {}))
                        details["has_synthetic"] = "synthetic" in data.get("paths", {})
                        details["has_replay"] = "replay" in data.get("paths", {})
                        details["has_hybrid"] = "hybrid" in data.get("paths", {})
                        details["has_macro"] = "macro" in data.get("paths", {})
                    elif "spx" in endpoint or "btc" in endpoint:
                        details["has_candles"] = "candles" in data or "data" in data
                        details["data_points"] = len(data.get("candles", data.get("data", [])))
                        
                except Exception as e:
                    details = {
                        "status_code": response.status_code,
                        "json_parse_error": str(e),
                        "content_preview": response.text[:200]
                    }
                    
                self.log_test(name, True, details)
                return True, data if 'data' in locals() else None
                
            else:
                details = {
                    "status_code": response.status_code,
                    "expected": expected_status,
                    "error": response.text[:200] if response.text else "No response body"
                }
                self.log_test(name, False, details)
                return False, None
                
        except requests.exceptions.Timeout:
            details = {"error": f"Request timeout after {timeout}s"}
            self.log_test(name, False, details)
            return False, None
        except requests.exceptions.ConnectionError:
            details = {"error": "Connection error - backend may be down"}
            self.log_test(name, False, details)
            return False, None
        except Exception as e:
            details = {"error": f"Unexpected error: {str(e)}"}
            self.log_test(name, False, details)
            return False, None

    def run_all_tests(self):
        """Run all required backend tests"""
        print("=" * 80)
        print("🚀 FRACTAL PLATFORM BACKEND TESTING")
        print("=" * 80)
        
        # Test 1: Health Check
        self.test_endpoint(
            "Health Check - Proxy and TS Backend",
            "/api/health"
        )
        
        # Test 2: DXY Terminal (all 4 paths)
        self.test_endpoint(
            "DXY Terminal - All 4 Paths (Synthetic, Replay, Hybrid, Macro)",
            "/api/fractal/dxy/terminal?focus=30d",
            timeout=60
        )
        
        # Test 3: SPX Terminal
        self.test_endpoint(
            "SPX Terminal Data",
            "/api/fractal/spx?focus=30d",
            timeout=60
        )
        
        # Test 4: Bitcoin Terminal
        self.test_endpoint(
            "Bitcoin Terminal Data",
            "/api/btc/v2.1/terminal?focus=30d",
            timeout=60
        )
        
        # Additional endpoints mentioned in the codebase
        
        # Test 5: System Health (for SystemStatusBanner)
        self.test_endpoint(
            "System Health Status",
            "/api/system/health"
        )
        
        # Test 6: Fractal Health
        self.test_endpoint(
            "Fractal Module Health",
            "/api/fractal/health"
        )
        
        # Test 7: AE Terminal (for Macro context)
        self.test_endpoint(
            "AE Terminal - Macro Context",
            "/api/ae/terminal"
        )
        
        # Test 8: DXY Macro Core endpoints - NEW
        self.test_endpoint(
            "DXY Macro Decomposition - Component Weights",
            "/api/dxy-macro-core/decomposition"
        )
        
        # Test 9: DXY Macro Guard
        self.test_endpoint(
            "DXY Macro Guard Current Level",
            "/api/dxy-macro-core/guard/current"
        )
        
        # Test 10: DXY Terminal with Macro Path and Adjustment
        success, terminal_data = self.test_endpoint(
            "DXY Terminal with Macro Path and Adjustment",
            "/api/fractal/dxy/terminal?focus=30d"
        )
        
        # Additional validation for terminal data
        if success and terminal_data:
            has_macro = terminal_data.get("macro") is not None
            has_adjustment = False
            has_path = False
            
            if has_macro:
                macro_data = terminal_data.get("macro", {})
                has_adjustment = "adjustment" in macro_data
                has_path = "path" in macro_data and len(macro_data.get("path", [])) > 0
            
            print(f"   📊 Macro data present: {has_macro}")
            print(f"   📊 Adjustment data: {has_adjustment}")
            print(f"   📊 Macro path: {has_path}")
        
        # Test 11: DXY Macro Score with Evidence
        self.test_endpoint(
            "DXY Macro Score with Evidence",
            "/api/dxy-macro-core/score/evidence"
        )
        
        # Test 12: Liquidity State
        self.test_endpoint(
            "Liquidity State (for DxyMacroTab)",
            "/api/liquidity/state"
        )
        
        return self.generate_report()

    def generate_report(self):
        """Generate test report"""
        print("\n" + "=" * 80)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 80)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        # Show detailed results for failed tests
        failed_tests = [t for t in self.test_results if not t["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"  - {test['name']}: {test['details'].get('error', 'Unknown error')}")
        
        # Show successful tests with key details
        successful_tests = [t for t in self.test_results if t["success"]]
        if successful_tests:
            print(f"\n✅ SUCCESSFUL TESTS ({len(successful_tests)}):")
            for test in successful_tests:
                details = test.get("details", {})
                if "paths_count" in details:
                    print(f"  - {test['name']}: {details['paths_count']} paths available")
                elif "data_points" in details:
                    print(f"  - {test['name']}: {details['data_points']} data points")
                elif "ts_backend_status" in details:
                    print(f"  - {test['name']}: TS Backend OK = {details['ts_backend_status']}")
                else:
                    print(f"  - {test['name']}: OK")
        
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "failed_tests": self.tests_run - self.tests_passed,
            "success_rate": success_rate,
            "details": self.test_results
        }

def main():
    """Main test runner"""
    tester = FractalAPITester()
    
    # Run all tests
    report = tester.run_all_tests()
    
    # Save detailed report
    report_file = f"/app/test_reports/backend_test_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    try:
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\n💾 Detailed report saved to: {report_file}")
    except Exception as e:
        print(f"\n⚠️ Could not save report: {e}")
    
    # Return appropriate exit code
    if report["success_rate"] >= 80:
        print(f"\n🎉 Backend testing PASSED with {report['success_rate']:.1f}% success rate")
        return 0
    else:
        print(f"\n💥 Backend testing FAILED with {report['success_rate']:.1f}% success rate")
        return 1

if __name__ == "__main__":
    sys.exit(main())