#!/usr/bin/env python3
import os
import unittest
from unittest.mock import patch, mock_open

# Import the functions to test
from health_check import check_memory_usage, check_load_average

class TestHealthCheckFallbacks(unittest.TestCase):

    @patch('os.path.exists')
    def test_load_average_fallback(self, mock_exists):
        # Simulate missing /proc/loadavg
        mock_exists.return_value = False
        
        with patch('os.getloadavg', return_value=(1.5, 1.0, 0.5)):
            with patch('os.cpu_count', return_value=4):
                status, detail, val = check_load_average()
                self.assertIn(status, ["OK", "WARNING", "CRITICAL"])
                self.assertTrue("Load: 1.5" in detail)
                self.assertEqual(val, 1.5)

    @patch('os.path.exists')
    @patch('platform.system')
    @patch('subprocess.check_output')
    def test_memory_usage_darwin_fallback(self, mock_check_output, mock_system, mock_exists):
        # Simulate missing /proc/meminfo
        mock_exists.return_value = False
        mock_system.return_value = "Darwin"
        
        # Simulate sysctl and vm_stat outputs
        def mock_subprocess(args):
            if args[0] == 'sysctl':
                return b'17179869184\n' # 16GB
            elif args[0] == 'vm_stat':
                return b'page size of 4096 bytes\nPages free: 1000000.\nPages inactive: 500000.\nPages speculative: 10000.\n'
            return b''
            
        mock_check_output.side_effect = mock_subprocess
        
        status, detail, val = check_memory_usage()
        self.assertIn(status, ["OK", "WARNING", "CRITICAL"])
        self.assertTrue("% used" in detail)

    @patch('os.path.exists')
    @patch('platform.system')
    @patch('subprocess.check_output')
    def test_memory_usage_windows_fallback(self, mock_check_output, mock_system, mock_exists):
        mock_exists.return_value = False
        mock_system.return_value = "Windows"
        
        mock_check_output.return_value = b'FreePhysicalMemory=4194304\nTotalVisibleMemorySize=16777216\n'
        
        status, detail, val = check_memory_usage()
        self.assertIn(status, ["OK", "WARNING", "CRITICAL"])
        self.assertTrue("% used" in detail)

if __name__ == '__main__':
    unittest.main()
