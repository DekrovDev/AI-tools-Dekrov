import json
import urllib.request
import urllib.error
import urllib.parse
import ssl
import time
import socket

from typing import List, Dict, Any

# Enable proper SSL certificate verification
ctx = ssl.create_default_context()

def load_data(filepath: str) -> List[Dict[str, Any]]:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, dict) and 'resources' in data:
                return data['resources']
            return data
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        return []

def get_domain(url: str) -> str:
    try:
        netloc = urllib.parse.urlparse(url).netloc
        # Simple extraction, remove www.
        if netloc.startswith('www.'):
            return netloc[4:]
        return netloc
    except:
        return ""

def check_url(url: str, retries: int = 2) -> Dict[str, Any]:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }

    status_history = []

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers, method='GET')
            with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
                status = response.getcode()
                final_url = response.geturl()

                # Check for suspicious redirects
                orig_domain = get_domain(url)
                final_domain = get_domain(final_url)

                if orig_domain and final_domain and orig_domain != final_domain:
                    # Allow subdomains but flag entirely different domains
                    if not (final_domain.endswith('.' + orig_domain) or final_domain == orig_domain):
                        return {'status': status, 'category': 'suspicious_redirect', 'final_url': final_url, 'error': f'Redirected to different domain: {final_domain}'}

                return {'status': status, 'category': 'working', 'final_url': final_url, 'error': ''}

        except urllib.error.HTTPError as e:
            if "loop" in str(e).lower() or "redirect" in str(e.reason).lower():
                return {'status': e.code, 'category': 'redirect_loop', 'final_url': url, 'error': str(e.reason)}

            if e.code in (404, 410):
                status_history.append(e.code)
                if len(status_history) >= retries:
                    return {'status': e.code, 'category': 'confirmed_broken', 'final_url': url, 'error': e.reason}
            elif e.code in (403, 406, 429) or (500 <= e.code < 600):
                return {'status': e.code, 'category': 'inconclusive', 'final_url': url, 'error': e.reason}
            else:
                return {'status': e.code, 'category': 'inconclusive', 'final_url': url, 'error': e.reason}

        except urllib.error.URLError as e:
            if isinstance(e.reason, ssl.SSLError) or isinstance(e.reason, ssl.CertificateError):
                return {'status': 'SSL Error', 'category': 'ssl_error', 'final_url': url, 'error': str(e.reason)}
            elif isinstance(e.reason, socket.gaierror) or "Connection refused" in str(e.reason):
                 return {'status': 'Connection Error', 'category': 'inconclusive', 'final_url': url, 'error': str(e.reason)}
            else:
                return {'status': 'URL Error', 'category': 'inconclusive', 'final_url': url, 'error': str(e.reason)}

        except socket.timeout:
            return {'status': 'Timeout', 'category': 'inconclusive', 'final_url': url, 'error': 'Connection timed out'}
        except ssl.SSLError as e:
            return {'status': 'SSL Error', 'category': 'ssl_error', 'final_url': url, 'error': str(e)}
        except Exception as e:
            if "redirect" in str(e).lower() or "loop" in str(e).lower():
                return {'status': 'Error', 'category': 'redirect_loop', 'final_url': url, 'error': str(e)}
            return {'status': 'Error', 'category': 'inconclusive', 'final_url': url, 'error': str(e)}

        time.sleep(2)

    return {'status': 'Unknown', 'category': 'inconclusive', 'final_url': url, 'error': 'Max retries reached without clear resolution'}

def normalize_url(url: str) -> str:
    # simple normalization to ignore trailing slashes
    if url.endswith('/'):
        return url[:-1]
    return url

def main():
    tools = load_data('data/tools.json')
    dev_resources = load_data('data/dev-resources.json')

    entries = []
    for t in tools:
        if 'name' in t and 'category' in t and 'url' in t:
            entries.append({'name': t['name'], 'category': t['category'], 'url': t['url'], 'source': 'tools.json'})

    for r in dev_resources:
        if 'name' in r and 'category' in r and 'url' in r:
            entries.append({'name': r['name'], 'category': r['category'], 'url': r['url'], 'source': 'dev-resources.json'})

    total = len(entries)
    working_count = 0
    confirmed_broken = []
    inconclusive = []
    redirected = []
    redirect_loops = []
    ssl_errors = []
    suspicious_redirects = []

    print(f"Total entries to check: {total}")

    for i, entry in enumerate(entries):
        print(f"[{i+1}/{total}] Checking {entry['name']} ({entry['url']})")
        result = check_url(entry['url'])

        entry['status'] = result['status']
        entry['final_url'] = result['final_url']
        entry['error'] = result['error']

        cat = result['category']
        if cat == 'working':
            working_count += 1
            if normalize_url(entry['url']) != normalize_url(result['final_url']):
                entry['suggested'] = result['final_url']
                redirected.append(entry)
        elif cat == 'confirmed_broken':
            confirmed_broken.append(entry)
        elif cat == 'inconclusive':
            inconclusive.append(entry)
        elif cat == 'redirect_loop':
            redirect_loops.append(entry)
        elif cat == 'ssl_error':
            ssl_errors.append(entry)
        elif cat == 'suspicious_redirect':
            suspicious_redirects.append(entry)

    report = f"# Link Audit Report\n\n"
    report += f"**Total links checked:** {total}\n"
    report += f"**Working links:** {working_count}\n"
    report += f"**Confirmed broken links (404/410 verified):** {len(confirmed_broken)}\n"
    report += f"**Suspicious/Inconclusive links (e.g. 403, 5xx, timeouts):** {len(inconclusive)}\n"
    report += f"**Redirect Loops:** {len(redirect_loops)}\n"
    report += f"**SSL Errors:** {len(ssl_errors)}\n"
    report += f"**Working links with redirects:** {len(redirected)}\n"
    report += f"**Suspicious Redirects (Manual Review Required):** {len(suspicious_redirects)}\n\n"

    if confirmed_broken:
        report += "## Confirmed Broken Links\n\n"
        for b in confirmed_broken:
            report += f"- **{b['name']}** ({b['category']} in {b['source']})\n"
            report += f"  - URL: {b['url']}\n"
            report += f"  - Status: {b['status']}\n"
            if b['error']:
                report += f"  - Error: {b['error']}\n"
            report += "\n"

    if inconclusive:
        report += "## Inconclusive Links (Timeouts, 403, 429, 5xx)\n\n"
        for inc in inconclusive:
            report += f"- **{inc['name']}** ({inc['category']} in {inc['source']})\n"
            report += f"  - URL: {inc['url']}\n"
            if inc['status']:
                report += f"  - Status: {inc['status']}\n"
            if inc.get('error'):
                report += f"  - Error: {inc['error']}\n"
            report += "\n"

    if redirect_loops:
        report += "## Redirect Loops\n\n"
        for b in redirect_loops:
            report += f"- **{b['name']}** ({b['category']} in {b['source']})\n"
            report += f"  - URL: {b['url']}\n"
            report += f"  - Status: {b['status']}\n"
            if b['error']:
                report += f"  - Error: {b['error']}\n"
            report += "\n"

    if ssl_errors:
        report += "## SSL Errors\n\n"
        for b in ssl_errors:
            report += f"- **{b['name']}** ({b['category']} in {b['source']})\n"
            report += f"  - URL: {b['url']}\n"
            report += f"  - Status: {b['status']}\n"
            if b['error']:
                report += f"  - Error: {b['error']}\n"
            report += "\n"

    if suspicious_redirects:
        report += "## Suspicious Redirects (Manual Review Required)\n\n"
        for b in suspicious_redirects:
            report += f"- **{b['name']}** ({b['category']} in {b['source']})\n"
            report += f"  - Original URL: {b['url']}\n"
            report += f"  - Final URL: {b['final_url']}\n"
            report += f"  - Status: {b['status']}\n"
            if b['error']:
                report += f"  - Error: {b['error']}\n"
            report += "\n"

    if redirected:
        report += "## Redirected Links (Working, but URL changed)\n\n"
        for r in redirected:
            report += f"- **{r['name']}** ({r['category']} in {r['source']})\n"
            report += f"  - Original URL: {r['url']}\n"
            report += f"  - Final URL: {r['final_url']}\n"
            report += "\n"

    with open('report.md', 'w', encoding='utf-8') as f:
        f.write(report)

    print("Report generated to report.md")

if __name__ == '__main__':
    main()
