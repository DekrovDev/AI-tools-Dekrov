import json
import sys
import urllib.request
import urllib.error
import urllib.parse
import ssl
import socket
import ipaddress
import time
from typing import Dict, Any, List, Optional, Tuple

ctx = ssl.create_default_context()

def load_json(filepath: str) -> Optional[List[Dict[str, Any]]]:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict) and 'resources' in data:
                return data['resources']
            if isinstance(data, list):
                return data
            print(f"Error: Unexpected JSON structure in {filepath}")
            return None
    except Exception as e:
        print(f"Failed to load {filepath}: {e}")
        return None

def get_base_domain(url: str) -> str:
    try:
        netloc = urllib.parse.urlparse(url).netloc
        if ':' in netloc:
            netloc = netloc.split(':')[0]
        if netloc.startswith('www.'):
            return netloc[4:]
        return netloc
    except:
        return ""

def is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified or ip.is_private:
            return True
        return False
    except ValueError:
        return False

def check_ssrf(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != 'https':
            return False

        if '@' in parsed.netloc:
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        if is_private_ip(hostname):
            return False

        addr_info = socket.getaddrinfo(hostname, None)
        for info in addr_info:
            ip = info[4][0]
            if is_private_ip(ip):
                return False

        return True
    except Exception as e:
        return False

class SSRFProtectRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not check_ssrf(newurl):
            raise urllib.error.URLError(f"SSRF Protection triggered on redirect to: {newurl}")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def build_opener():
    https_handler = urllib.request.HTTPSHandler(context=ctx)
    opener = urllib.request.build_opener(SSRFProtectRedirectHandler(), https_handler)
    return opener

def check_original_broken(url: str, retries: int = 2) -> bool:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }

    if not check_ssrf(url):
         return False

    status_history = []
    opener = build_opener()

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers, method='GET')
            with opener.open(req, timeout=10) as response:
                return False # If it succeeds, it's not broken
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                status_history.append(e.code)
                if len(status_history) >= retries:
                    return True
            else:
                return False # Inconclusive
        except Exception as e:
            return False # Any other error is inconclusive for broken link confirmation

        time.sleep(1)

    return False

def verify_new_url_reachable(url: str) -> bool:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }

    if not check_ssrf(url):
        print(f"Validation failed for {url}: SSRF protection triggered")
        return False

    opener = build_opener()
    try:
        req = urllib.request.Request(url, headers=headers, method='GET')
        with opener.open(req, timeout=10) as response:
            status = response.getcode()
            if status != 200:
                print(f"Validation failed for {url}: HTTP {status}")
                return False
            return True
    except Exception as e:
        print(f"Validation failed for {url}: {e}")
        return False

def compare_entries(old_entry: Dict[str, Any], new_entry: Dict[str, Any]) -> str:
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

def is_link_fix_pr(base_file: str, pr_file: str) -> Tuple[bool, int, List[str]]:
    # Returns (is_pure_link_fix, num_replacements, error_messages)
    base_data = load_json(base_file)
    pr_data = load_json(pr_file)

    if base_data is None or pr_data is None:
        return False, 0, [f"Failed to parse JSON for {base_file} or {pr_file}"]

    if len(base_data) != len(pr_data):
        return False, 0, [f"Length of catalog changed in {pr_file}"]

    replacements = 0
    errors = []

    for i in range(len(base_data)):
        old_entry = base_data[i]
        new_entry = pr_data[i]

        if old_entry != new_entry:
            diff_err = compare_entries(old_entry, new_entry)
            if diff_err:
                return False, replacements, [f"Error in {pr_file} at index {i}: {diff_err}"]

            old_url = old_entry.get('url', '')
            new_url = new_entry.get('url', '')

            if old_url != new_url:
                replacements += 1

                if not check_ssrf(new_url):
                    errors.append(f"URL {new_url} failed SSRF check")
                    continue

                old_domain = get_base_domain(old_url)
                new_domain = get_base_domain(new_url)

                if old_domain and new_domain:
                    if new_domain != old_domain:
                        errors.append(f"Cross-domain replacement requires manual review: {old_domain} -> {new_domain}")
                        continue

                print(f"Checking if original URL is truly broken: {old_url}")
                if not check_original_broken(old_url):
                    errors.append(f"Original URL {old_url} could not be confirmed as broken (404/410)")
                    continue

                print(f"Checking if new URL is reachable: {new_url}")
                if not verify_new_url_reachable(new_url):
                    errors.append(f"New URL {new_url} is not reachable")
                    continue

    if errors:
        return True, replacements, errors # It is a link fix attempt, but has errors

    return True, replacements, [] # Pure link fix, no errors

def main():
    if len(sys.argv) != 5:
        print("Usage: python link-fix-validator.py <base_tools> <pr_tools> <base_dev> <pr_dev>")
        sys.exit(1)

    base_tools, pr_tools, base_dev, pr_dev = sys.argv[1:5]

    print("Checking tools.json...")
    is_link_fix_tools, rep_tools, errors_tools = is_link_fix_pr(base_tools, pr_tools)

    print("Checking dev-resources.json...")
    is_link_fix_dev, rep_dev, errors_dev = is_link_fix_pr(base_dev, pr_dev)

    if not is_link_fix_tools and not is_link_fix_dev:
        print("This does not appear to be a pure link-fix PR. Normal PRs are not blocked by this validator.")
        print("Eligibility: FALSE")
        with open('eligibility.txt', 'w') as f:
            f.write("false")
        sys.exit(0)

    if not is_link_fix_tools or not is_link_fix_dev:
        print("Contains non-URL modifications. Normal PR rules apply.")
        print("Eligibility: FALSE")
        with open('eligibility.txt', 'w') as f:
            f.write("false")
        sys.exit(0)

    total_replacements = rep_tools + rep_dev

    if total_replacements == 0:
        print("No URL replacements found.")
        print("Eligibility: FALSE")
        with open('eligibility.txt', 'w') as f:
            f.write("false")
        sys.exit(0)

    errors = errors_tools + errors_dev
    if total_replacements > 5:
        errors.append(f"Too many replacements ({total_replacements} > 5) across both files combined.")

    if errors:
        print("Errors found during link-fix validation:")
        for err in errors:
            print(f"- {err}")
        print("Eligibility: FALSE")
        with open('eligibility.txt', 'w') as f:
            f.write("false")
        sys.exit(0)

    print("All validations passed. Changes are eligible for automatic merge.")
    print("Eligibility: TRUE")
    with open('eligibility.txt', 'w') as f:
        f.write("true")
    sys.exit(0)

if __name__ == '__main__':
    main()
