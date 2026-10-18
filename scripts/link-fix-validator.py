import json
import sys
import urllib.request
import urllib.error
import urllib.parse
import ssl
import socket
from typing import Dict, Any, List

ctx = ssl.create_default_context()

def load_json(filepath: str) -> List[Dict[str, Any]]:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict) and 'resources' in data:
                return data['resources']
            return data
    except Exception as e:
        print(f"Failed to load {filepath}: {e}")
        return []

def get_base_domain(url: str) -> str:
    try:
        netloc = urllib.parse.urlparse(url).netloc
        # Remove port if present
        if ':' in netloc:
            netloc = netloc.split(':')[0]
        if netloc.startswith('www.'):
            return netloc[4:]
        return netloc
    except:
        return ""

def is_safe_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != 'https':
            return False

        if '@' in parsed.netloc:
            return False

        netloc = get_base_domain(url)

        # Basic check for local/private IPs or localhost
        if netloc in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
            return False
        if netloc.startswith('192.168.') or netloc.startswith('10.'):
            return False

        return True
    except:
        return False

def verify_url_reachable(url: str, original_domain: str) -> bool:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }

    try:
        req = urllib.request.Request(url, headers=headers, method='GET')
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            status = response.getcode()
            final_url = response.geturl()

            if status != 200:
                print(f"Validation failed for {url}: HTTP {status}")
                return False

            final_domain = get_base_domain(final_url)
            if original_domain and final_domain:
                if not (final_domain.endswith('.' + original_domain) or final_domain == original_domain):
                    print(f"Validation failed for {url}: Cross-domain redirect to {final_domain}")
                    return False

            return True

    except urllib.error.HTTPError as e:
        print(f"Validation failed for {url}: HTTPError {e.code}")
        return False
    except urllib.error.URLError as e:
        print(f"Validation failed for {url}: URLError {e.reason}")
        return False
    except socket.timeout:
        print(f"Validation failed for {url}: Timeout")
        return False
    except Exception as e:
        print(f"Validation failed for {url}: {e}")
        return False

def compare_entries(old_entry: Dict[str, Any], new_entry: Dict[str, Any]) -> str:
    # Check if only 'url' changed
    old_keys = set(old_entry.keys())
    new_keys = set(new_entry.keys())

    if old_keys != new_keys:
        return "Keys changed"

    for k in old_keys:
        if k == 'url':
            continue
        if old_entry[k] != new_entry[k]:
            return f"Field '{k}' changed"

    return ""

def validate_changes(base_file: str, pr_file: str) -> bool:
    base_data = load_json(base_file)
    pr_data = load_json(pr_file)

    if len(base_data) != len(pr_data):
        print(f"Error: Length of catalog changed in {pr_file}")
        return False

    replacements = 0

    for i in range(len(base_data)):
        old_entry = base_data[i]
        new_entry = pr_data[i]

        if old_entry != new_entry:
            diff_err = compare_entries(old_entry, new_entry)
            if diff_err:
                print(f"Error in {pr_file} at index {i} ({old_entry.get('name', 'Unknown')}): {diff_err}")
                return False

            old_url = old_entry.get('url', '')
            new_url = new_entry.get('url', '')

            if old_url != new_url:
                print(f"Validating URL replacement: {old_url} -> {new_url}")
                replacements += 1

                if not is_safe_url(new_url):
                    print(f"Error: URL {new_url} is not safe (HTTP only, no credentials, no local IPs)")
                    return False

                old_domain = get_base_domain(old_url)
                new_domain = get_base_domain(new_url)

                if old_domain and new_domain:
                    # Allow completely exact matches
                    if new_domain != old_domain:
                        print(f"Error: Cross-domain replacement requires manual review: {old_domain} -> {new_domain}")
                        return False

                if not verify_url_reachable(new_url, old_domain):
                    return False

    if replacements > 5:
        print(f"Error: Too many replacements ({replacements} > 5)")
        return False

    return True

def main():
    if len(sys.argv) != 5:
        print("Usage: python link-fix-validator.py <base_tools> <pr_tools> <base_dev> <pr_dev>")
        sys.exit(1)

    base_tools, pr_tools, base_dev, pr_dev = sys.argv[1:5]

    print("Validating tools.json...")
    if not validate_changes(base_tools, pr_tools):
        sys.exit(1)

    print("Validating dev-resources.json...")
    if not validate_changes(base_dev, pr_dev):
        sys.exit(1)

    print("All validations passed.")
    sys.exit(0)

if __name__ == '__main__':
    main()
