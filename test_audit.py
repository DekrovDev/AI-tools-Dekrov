import unittest
from unittest.mock import patch, MagicMock
import urllib.error
import ssl
import socket

from audit import check_url

class TestAuditCategories(unittest.TestCase):

    @patch('urllib.request.urlopen')
    def test_working_url(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.geturl.return_value = 'https://example.com/'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = check_url('https://example.com/')
        self.assertEqual(result['category'], 'working')
        self.assertEqual(result['status'], 200)

    @patch('audit.time.sleep')  # Mock sleep to speed up test
    @patch('urllib.request.urlopen')
    def test_confirmed_broken_404(self, mock_urlopen, mock_sleep):
        # Trigger an HTTPError 404
        error = urllib.error.HTTPError('https://example.com/', 404, 'Not Found', {}, None)
        mock_urlopen.side_effect = error

        result = check_url('https://example.com/')
        self.assertEqual(result['category'], 'confirmed_broken')
        self.assertEqual(result['status'], 404)

    @patch('audit.time.sleep')
    @patch('urllib.request.urlopen')
    def test_inconclusive_403(self, mock_urlopen, mock_sleep):
        error = urllib.error.HTTPError('https://example.com/', 403, 'Forbidden', {}, None)
        mock_urlopen.side_effect = error

        result = check_url('https://example.com/')
        self.assertEqual(result['category'], 'inconclusive')
        self.assertEqual(result['status'], 403)

    @patch('audit.time.sleep')
    @patch('urllib.request.urlopen')
    def test_redirect_loop(self, mock_urlopen, mock_sleep):
        error = urllib.error.HTTPError('https://example.com/', 302, 'The HTTP server returned a redirect error that would lead to an infinite loop.', {}, None)
        mock_urlopen.side_effect = error

        result = check_url('https://example.com/')
        self.assertEqual(result['category'], 'redirect_loop')

    @patch('audit.time.sleep')
    @patch('urllib.request.urlopen')
    def test_ssl_error(self, mock_urlopen, mock_sleep):
        error = urllib.error.URLError(ssl.SSLError("CERTIFICATE_VERIFY_FAILED"))
        mock_urlopen.side_effect = error

        result = check_url('https://example.com/')
        self.assertEqual(result['category'], 'ssl_error')

    @patch('audit.time.sleep')
    @patch('urllib.request.urlopen')
    def test_timeout_inconclusive(self, mock_urlopen, mock_sleep):
        mock_urlopen.side_effect = socket.timeout("timed out")

        result = check_url('https://example.com/')
        self.assertEqual(result['category'], 'inconclusive')
        self.assertEqual(result['status'], 'Timeout')

    @patch('urllib.request.urlopen')
    def test_suspicious_redirect(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.getcode.return_value = 200
        mock_response.geturl.return_value = 'https://unrelated-domain.com/'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = check_url('https://example.com/')
        self.assertEqual(result['category'], 'suspicious_redirect')

if __name__ == '__main__':
    unittest.main()
