import unittest
from unittest.mock import patch, mock_open, MagicMock
import json
import urllib.error
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

    def test_is_private_ip(self):
        self.assertTrue(validator.is_private_ip('127.0.0.1'))
        self.assertTrue(validator.is_private_ip('192.168.1.1'))
        self.assertTrue(validator.is_private_ip('10.0.0.1'))
        self.assertTrue(validator.is_private_ip('172.16.0.1'))
        self.assertTrue(validator.is_private_ip('::1'))
        self.assertFalse(validator.is_private_ip('93.184.216.34'))

    @patch('socket.getaddrinfo')
    def test_resolve_hostname_dns_rebinding_protection(self, mock_getaddrinfo):
        # Mock DNS resolving to private IP
        mock_getaddrinfo.return_value = [(2, 1, 6, '', ('192.168.1.100', 443))]
        self.assertIsNone(validator.resolve_hostname('malicious.example.com'))

        # Mock DNS resolving to public IP
        mock_getaddrinfo.return_value = [(2, 1, 6, '', ('93.184.216.34', 443))]
        self.assertEqual(validator.resolve_hostname('safe.example.com'), '93.184.216.34')

    @patch('validator.verify_new_url_reachable')
    @patch('validator.check_original_broken')
    def test_cross_domain_fix(self, mock_check, mock_verify):
        mock_check.return_value = True
        base_raw = [{'id': '1', 'url': 'https://example.com/old'}]
        pr_raw = [{'id': '1', 'url': 'https://hacker.com/new'}]

        with patch('validator.load_json', side_effect=[base_raw, pr_raw]):
            valid, replacements = validator.validate_changes('b', 'p', 's')
            self.assertFalse(valid)

    @patch('validator.verify_new_url_reachable')
    @patch('validator.check_original_broken')
    def test_valid_link_fix(self, mock_check, mock_verify):
        mock_check.return_value = True
        mock_verify.return_value = True
        base_raw = [{'id': '1', 'url': 'https://example.com/old'}]
        pr_raw = [{'id': '1', 'url': 'https://example.com/new'}]

        with patch('validator.load_json', side_effect=[base_raw, pr_raw]):
            valid, replacements = validator.validate_changes('b', 'p', 's')
            self.assertTrue(valid)
            self.assertEqual(replacements, 1)

    def test_malformed_json(self):
        with patch('builtins.open', mock_open(read_data="not json")):
            data = validator.load_json('bad.json')
            self.assertIsNone(data)

    def test_missing_json(self):
        with patch('builtins.open', side_effect=FileNotFoundError):
            data = validator.load_json('missing.json')
            self.assertIsNone(data)

    def test_check_original_broken_success(self):
        state_data = {
            "urls": {
                "https://example.com/broken": {
                    "phase": "confirmed-broken"
                }
            }
        }
        with patch('validator.load_json', return_value=state_data):
            self.assertTrue(validator.check_original_broken('https://example.com/broken', 'state.json'))

    def test_check_original_broken_stale_evidence(self):
        state_data = {
            "urls": {
                "https://example.com/working": {
                    "phase": "healthy"
                }
            }
        }
        with patch('validator.load_json', return_value=state_data):
            self.assertFalse(validator.check_original_broken('https://example.com/working', 'state.json'))

    def test_check_original_broken_missing_url(self):
        state_data = {
            "urls": {
                "https://example.com/other": {
                    "phase": "confirmed-broken"
                }
            }
        }
        with patch('validator.load_json', return_value=state_data):
            self.assertFalse(validator.check_original_broken('https://example.com/broken', 'state.json'))

    @patch('validator.validate_changes')
    def test_exceeding_total_limit(self, mock_validate):
        mock_validate.side_effect = [
            (True, 3),
            (True, 3)
        ]

        with patch('sys.argv', ['validator.py', 'b_t', 'p_t', 'b_d', 'p_d', 'state.json']):
            with self.assertRaises(SystemExit) as cm:
                validator.main()
            self.assertEqual(cm.exception.code, 1)

if __name__ == '__main__':
    unittest.main()
