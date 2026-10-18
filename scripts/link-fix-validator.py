import json
import sys
import urllib.parse
import ssl
import socket
import ipaddress
import http.client
from typing import Dict, Any, List, Optional, Tuple

ctx = ssl.create_default_context()

class SNIHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, port=None, timeout=socket._GLOBAL_DEFAULT_TIMEOUT,
                 source_address=None, *, context=None, server_hostname=None,
                 resolved_ip=None):
        super().__init__(host, port, timeout=timeout, source_address=source_address, context=context)
        self.server_hostname = server_hostname
        self.resolved_ip = resolved_ip

    def connect(self):
        sock = socket.create_connection((self.resolved_ip, self.port), self.timeout, self.source_address)
        if self._tunnel_host:
            self.sock = sock
            self._tunnel()
        server_hostname = self.server_hostname or self.host
        if self._context:
            self.sock = self._context.wrap_socket(sock, server_hostname=server_hostname)
        else:
            default_context = ssl._create_default_https_context()
            self.sock = default_context.wrap_socket(sock, server_hostname=server_hostname)

def load_json(filepath: str) -> Optional[Any]:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Failed to load {filepath}: {e}")
        return None

def get_resources(data: Any) -> Optional[List[Dict[str, Any]]]:
    if isinstance(data, dict) and 'resources' in data:
        return data['resources']
    if isinstance(data, list):
        return data
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

def resolve_hostname(hostname: str) -> Optional[str]:
    try:
        addr_info = socket.getaddrinfo(hostname, 443, socket.AF_INET, socket.SOCK_STREAM)
        for info in addr_info:
            ip = info[4][0]
            if not is_private_ip(ip):
                return ip
        return None
    except Exception:
        return None

def verify_new_url_reachable(url: str, original_domain: str, max_redirects=5) -> bool:
    current_url = url
    redirects = 0

    while redirects <= max_redirects:
        try:
            parsed = urllib.parse.urlparse(current_url)
            if parsed.scheme != 'https':
                print(f"Validation failed: Non-HTTPS URL {current_url}")
                return False

            if '@' in parsed.netloc:
                print("Validation failed: Credentials in URL")
                return False

            hostname = parsed.hostname
            if not hostname:
                return False

            if is_private_ip(hostname):
                print(f"Validation failed: Private IP in URL {current_url}")
                return False

            ip = resolve_hostname(hostname)
            if not ip:
                print(f"Validation failed: Could not resolve to public IP for {hostname}")
                return False

            conn = SNIHTTPSConnection(hostname, port=443, context=ctx, timeout=10, server_hostname=hostname, resolved_ip=ip)
            headers = {
                'Host': hostname,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }

            path = parsed.path if parsed.path else '/'
            if parsed.query:
                path += '?' + parsed.query

            conn.request("GET", path, headers=headers)
            response = conn.getresponse()
            status = response.status

            if status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location:
                    print("Validation failed: Redirect without Location header")
                    return False
                current_url = urllib.parse.urljoin(current_url, location)
                redirects += 1
                conn.close()
                continue

            conn.close()
            if status == 200:
                final_domain = get_base_domain(current_url)
                if final_domain != original_domain:
                    print(f"Validation failed: Cross-domain redirect. Started at {original_domain}, ended at {final_domain}")
                    return False
                return True

            print(f"Validation failed: HTTP {status}")
            return False

        except Exception as e:
            print(f"Validation failed for {current_url}: {e}")
            return False

    print("Validation failed: Too many redirects")
    return False

def check_original_broken(url: str, state_file: str) -> bool:
    state_data = load_json(state_file)
    if not state_data:
        print(f"Failed to load state from {state_file}")
        return False

    urls = state_data.get('urls', {})
    if url not in urls:
        print(f"URL {url} not found in state file.")
        return False

    entry = urls[url]
    if entry.get('phase') == 'confirmed-broken':
        return True

    print(f"URL {url} is not confirmed-broken in state file. Current phase: {entry.get('phase')}")
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

def validate_changes(base_file: str, pr_file: str, state_file: str) -> Tuple[bool, int]:
    base_raw = load_json(base_file)
    pr_raw = load_json(pr_file)

    if base_raw is None or pr_raw is None:
        print(f"Error: Failed to parse JSON for {base_file} or {pr_file}")
        return False, 0

    base_data = get_resources(base_raw)
    pr_data = get_resources(pr_raw)

    if base_data is None or pr_data is None:
        print("Error: Could not find resources array in JSON")
        return False, 0

    if len(base_data) != len(pr_data):
        print(f"Error: Length of catalog changed in {pr_file}")
        return False, 0

    replacements = 0

    for i in range(len(base_data)):
        old_entry = base_data[i]
        new_entry = pr_data[i]

        if old_entry != new_entry:
            diff_err = compare_entries(old_entry, new_entry)
            if diff_err:
                print(f"Error in {pr_file} at index {i}: {diff_err}")
                return False, replacements

            old_url = old_entry.get('url', '')
            new_url = new_entry.get('url', '')

            if old_url != new_url:
                replacements += 1

                old_domain = get_base_domain(old_url)
                new_domain = get_base_domain(new_url)

                if old_domain and new_domain:
                    if new_domain != old_domain:
                        print(f"Error: Cross-domain replacement requires manual review: {old_domain} -> {new_domain}")
                        return False, replacements

                print(f"Checking if original URL is confirmed broken in evidence: {old_url}")
                if not check_original_broken(old_url, state_file):
                    return False, replacements

                print(f"Checking if new URL is reachable securely: {new_url}")
                if not verify_new_url_reachable(new_url, old_domain):
                    return False, replacements

    return True, replacements

def main():
    if len(sys.argv) != 6:
        print("Usage: python link-fix-validator.py <base_tools> <pr_tools> <base_dev> <pr_dev> <state_file>")
        sys.exit(1)

    base_tools, pr_tools, base_dev, pr_dev, state_file = sys.argv[1:6]

    print("Checking tools.json...")
    valid_tools, rep_tools = validate_changes(base_tools, pr_tools, state_file)
    if not valid_tools:
        print("Eligibility: FALSE")
        sys.exit(1)

    print("Checking dev-resources.json...")
    valid_dev, rep_dev = validate_changes(base_dev, pr_dev, state_file)
    if not valid_dev:
        print("Eligibility: FALSE")
        sys.exit(1)

    total_replacements = rep_tools + rep_dev

    if total_replacements == 0:
        print("No URL replacements found.")
        print("Eligibility: FALSE")
        sys.exit(1)

    if total_replacements > 5:
        print(f"Too many replacements ({total_replacements} > 5) across both files combined.")
        print("Eligibility: FALSE")
        sys.exit(1)

    print("All validations passed. Changes are eligible for automatic merge.")
    print("Eligibility: TRUE")
    sys.exit(0)

if __name__ == '__main__':
    main()
