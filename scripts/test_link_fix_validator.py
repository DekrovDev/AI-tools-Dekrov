import unittest
from unittest.mock import patch, mock_open, MagicMock
import json

import importlib.util
import sys

# Load validator script as a module
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

    def test_is_safe_url_positive(self):
        self.assertTrue(validator.is_safe_url('https://example.com'))
        self.assertTrue(validator.is_safe_url('https://www.example.com/path?q=1'))

    def test_is_safe_url_negative(self):
        self.assertFalse(validator.is_safe_url('http://example.com')) # Must be https
        self.assertFalse(validator.is_safe_url('https://user:pass@example.com')) # No credentials
        self.assertFalse(validator.is_safe_url('https://localhost:8080')) # No local
        self.assertFalse(validator.is_safe_url('https://127.0.0.1'))
        self.assertFalse(validator.is_safe_url('https://192.168.1.1'))
        self.assertFalse(validator.is_safe_url('https://10.0.0.1'))

    @patch('validator.verify_url_reachable')
    def test_validate_changes_valid(self, mock_verify):
        mock_verify.return_value = True
        base = [{'id': '1', 'url': 'https://example.com/old'}]
        pr = [{'id': '1', 'url': 'https://example.com/new'}]

        with patch('validator.load_json', side_effect=[base, pr]):
            self.assertTrue(validator.validate_changes('b.json', 'p.json'))

    @patch('validator.verify_url_reachable')
    def test_validate_changes_cross_domain_fail(self, mock_verify):
        base = [{'id': '1', 'url': 'https://example.com/old'}]
        pr = [{'id': '1', 'url': 'https://hacker.com/new'}]

        with patch('validator.load_json', side_effect=[base, pr]):
            self.assertFalse(validator.validate_changes('b.json', 'p.json'))

    @patch('validator.verify_url_reachable')
    def test_validate_changes_too_many(self, mock_verify):
        mock_verify.return_value = True
        base = [{'id': str(i), 'url': f'https://ex.com/{i}'} for i in range(6)]
        pr = [{'id': str(i), 'url': f'https://ex.com/{i}-new'} for i in range(6)]

        with patch('validator.load_json', side_effect=[base, pr]):
            self.assertFalse(validator.validate_changes('b.json', 'p.json'))

    @patch('urllib.request.urlopen')
    def test_verify_url_reachable_success(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.geturl.return_value = 'https://example.com/final'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        self.assertTrue(validator.verify_url_reachable('https://example.com/start', 'example.com'))

    @patch('urllib.request.urlopen')
    def test_verify_url_reachable_redirect_cross_domain(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.geturl.return_value = 'https://unrelated.com'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        self.assertFalse(validator.verify_url_reachable('https://example.com', 'example.com'))

    @patch('urllib.request.urlopen')
    def test_verify_url_reachable_404(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.getcode.return_value = 404
        mock_urlopen.return_value.__enter__.return_value = mock_response

        self.assertFalse(validator.verify_url_reachable('https://example.com', 'example.com'))

if __name__ == '__main__':
    unittest.main()
