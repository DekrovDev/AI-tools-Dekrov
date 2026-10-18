import unittest
from unittest.mock import patch, mock_open, MagicMock
import json
import urllib.error
import urllib.request
import socket

import importlib.util
import sys

spec = importlib.util.spec_from_file_location("validator", "scripts/link-fix-validator.py")
validator = importlib.util.module_from_spec(spec)
sys.modules["validator"] = validator
spec.loader.exec_module(validator)

class TestLinkFixValidator(unittest.TestCase):

    def test_compare_entries_valid(self):
        old = {'id': '1', 'name': 'A', 'url': 'https://a.com/old', 'tags': ['x']}
        new = {'id': '1', 'name': 'A', 'url': 'https://a.com/new', 'tags': ['x']}
        self.assertEqual(validator.compare_entries(old, new), "")

    def test_compare_entries_invalid_field(self):
        old = {'id': '1', 'name': 'A', 'url': 'https://a.com/old'}
        new = {'id': '1', 'name': 'B', 'url': 'https://a.com/new'}
        self.assertEqual(validator.compare_entries(old, new), "Field 'name' changed")

    def test_compare_entries_missing_key(self):
        old = {'id': '1', 'name': 'A', 'url': 'https://a.com/old'}
        new = {'id': '1', 'url': 'https://a.com/new'}
        self.assertEqual(validator.compare_entries(old, new), "Keys changed")

    def test_ssrf_protection_private_ips(self):
        self.assertFalse(validator.check_ssrf('https://127.0.0.1'))
        self.assertFalse(validator.check_ssrf('https://192.168.1.1'))
        self.assertFalse(validator.check_ssrf('https://10.0.0.1'))
        self.assertFalse(validator.check_ssrf('https://172.16.0.1'))
        self.assertFalse(validator.check_ssrf('https://[::1]'))

    def test_ssrf_protection_scheme_and_auth(self):
        self.assertFalse(validator.check_ssrf('http://example.com'))
        self.assertFalse(validator.check_ssrf('ftp://example.com'))
        self.assertFalse(validator.check_ssrf('https://user:pass@example.com'))

    @patch('socket.getaddrinfo')
    def test_ssrf_protection_dns_resolution(self, mock_getaddrinfo):
        # Mock DNS resolving to private IP
        mock_getaddrinfo.return_value = [(2, 1, 6, '', ('192.168.1.100', 443))]
        self.assertFalse(validator.check_ssrf('https://malicious.example.com'))

        # Mock DNS resolving to public IP
        mock_getaddrinfo.return_value = [(2, 1, 6, '', ('93.184.216.34', 443))]
        self.assertTrue(validator.check_ssrf('https://safe.example.com'))

    @patch('validator.check_original_broken')
    @patch('validator.verify_new_url_reachable')
    @patch('validator.check_ssrf')
    def test_cross_domain_fix(self, mock_ssrf, mock_verify, mock_check_broken):
        mock_ssrf.return_value = True
        base = [{'id': '1', 'url': 'https://example.com/old'}]
        pr = [{'id': '1', 'url': 'https://hacker.com/new'}]

        with patch('validator.load_json', side_effect=[base, pr]):
            is_link_fix, count, errors = validator.is_link_fix_pr('b.json', 'p.json')
            self.assertTrue(is_link_fix)
            self.assertEqual(count, 1)
            self.assertTrue(any("Cross-domain replacement" in e for e in errors))

    def test_malformed_json(self):
        with patch('builtins.open', mock_open(read_data="not json")):
            data = validator.load_json('bad.json')
            self.assertIsNone(data)

    def test_missing_json(self):
        with patch('builtins.open', side_effect=FileNotFoundError):
            data = validator.load_json('missing.json')
            self.assertIsNone(data)

    @patch('validator.build_opener')
    @patch('validator.check_ssrf')
    def test_original_url_inconclusive_500(self, mock_ssrf, mock_build_opener):
        mock_ssrf.return_value = True
        mock_opener = MagicMock()
        error = urllib.error.HTTPError('https://ex.com', 500, 'Internal Server Error', {}, None)
        mock_opener.open.side_effect = error
        mock_build_opener.return_value = mock_opener

        self.assertFalse(validator.check_original_broken('https://example.com'))

    @patch('validator.build_opener')
    @patch('validator.time.sleep')
    @patch('validator.check_ssrf')
    def test_original_url_broken_404(self, mock_ssrf, mock_sleep, mock_build_opener):
        mock_ssrf.return_value = True
        mock_opener = MagicMock()
        error = urllib.error.HTTPError('https://ex.com', 404, 'Not Found', {}, None)
        mock_opener.open.side_effect = error
        mock_build_opener.return_value = mock_opener

        self.assertTrue(validator.check_original_broken('https://example.com'))

    @patch('validator.is_link_fix_pr')
    def test_exceeding_total_limit(self, mock_is_link_fix):
        mock_is_link_fix.side_effect = [
            (True, 3, []),
            (True, 3, [])
        ]

        with patch('sys.argv', ['validator.py', 'b_t', 'p_t', 'b_d', 'p_d']), \
             patch('builtins.open', mock_open()) as mock_file:
            with self.assertRaises(SystemExit) as cm:
                validator.main()
            self.assertEqual(cm.exception.code, 0)

            handle = mock_file()
            handle.write.assert_called_with("false")

if __name__ == '__main__':
    unittest.main()
