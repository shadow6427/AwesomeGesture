import unittest
from unittest.mock import patch, MagicMock
import tools.benchmark as benchmark

class TestBenchmarkRateLimitBypass(unittest.TestCase):
    @patch('urllib.request.urlopen')
    def test_default_no_bypass_header(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b"OK"
        mock_urlopen.return_value.__enter__.return_value = mock_response

        benchmark.run_latency_benchmark("http://test", 1, 1, 30.0, headers={})

        self.assertTrue(mock_urlopen.called)
        req = mock_urlopen.call_args[0][0]
        # Request headers keys are internally capitalized differently by urllib depending on version, 
        # let's lower-case them for assertion
        lower_headers = {k.lower(): v for k, v in req.headers.items()}
        self.assertNotIn("x-benchmark-bypass-rate-limit", lower_headers)

    @patch('urllib.request.urlopen')
    def test_with_bypass_header(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b"OK"
        mock_urlopen.return_value.__enter__.return_value = mock_response

        benchmark.run_latency_benchmark("http://test", 1, 1, 30.0, headers={"X-Benchmark-Bypass-Rate-Limit": "true"})

        self.assertTrue(mock_urlopen.called)
        req = mock_urlopen.call_args[0][0]
        lower_headers = {k.lower(): v for k, v in req.headers.items()}
        self.assertIn("x-benchmark-bypass-rate-limit", lower_headers)
        self.assertEqual(lower_headers["x-benchmark-bypass-rate-limit"], "true")

if __name__ == "__main__":
    unittest.main()
