import json
import urllib.request
import urllib.error
import ssl
import time
import socket

from typing import List, Dict, Any

# Disable SSL verification for some strict sites if necessary
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

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

def check_url(url: str, retries: int = 2) -> Dict[str, Any]:
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }

    for attempt in range(retries):
        # Try HEAD first
        try:
            req = urllib.request.Request(url, headers=headers, method='HEAD')
            with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
                status = response.getcode()
                final_url = response.geturl()
                return {'status': status, 'category': 'working', 'final_url': final_url, 'error': ''}
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return {'status': e.code, 'category': 'broken', 'final_url': url, 'error': e.reason}
            elif e.code in (403, 429):
                # We might want to fallback to GET for 403, sometimes HEAD is blocked
                pass
            elif e.code in (405, 400, 503, 500):
                pass
            else:
                return {'status': e.code, 'category': 'broken', 'final_url': url, 'error': e.reason}
        except urllib.error.URLError as e:
            if attempt == retries - 1:
                return {'status': 'Error', 'category': 'broken', 'final_url': url, 'error': str(e.reason)}
        except socket.timeout:
            if attempt == retries - 1:
                return {'status': 'Timeout', 'category': 'broken', 'final_url': url, 'error': 'Connection timed out'}
        except Exception as e:
            if attempt == retries - 1:
                return {'status': 'Error', 'category': 'broken', 'final_url': url, 'error': str(e)}

        # Fallback to GET
        try:
            req = urllib.request.Request(url, headers=headers, method='GET')
            with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
                status = response.getcode()
                final_url = response.geturl()
                return {'status': status, 'category': 'working', 'final_url': final_url, 'error': ''}
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return {'status': e.code, 'category': 'broken', 'final_url': url, 'error': e.reason}
            elif e.code in (403, 429):
                return {'status': e.code, 'category': 'inconclusive', 'final_url': url, 'error': e.reason}
            else:
                return {'status': e.code, 'category': 'broken', 'final_url': url, 'error': e.reason}
        except urllib.error.URLError as e:
            if attempt == retries - 1:
                return {'status': 'Error', 'category': 'broken', 'final_url': url, 'error': str(e.reason)}
        except socket.timeout:
            if attempt == retries - 1:
                return {'status': 'Timeout', 'category': 'broken', 'final_url': url, 'error': 'Connection timed out'}
        except Exception as e:
            if attempt == retries - 1:
                return {'status': 'Error', 'category': 'broken', 'final_url': url, 'error': str(e)}

        time.sleep(2)

    return {'status': 'Unknown', 'category': 'broken', 'final_url': url, 'error': 'Unknown error'}

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
    broken = []
    inconclusive = []
    redirected = []

    print(f"Total entries to check: {total}")

    for i, entry in enumerate(entries):
        print(f"[{i+1}/{total}] Checking {entry['name']} ({entry['url']})")
        result = check_url(entry['url'])

        entry['status'] = result['status']
        entry['final_url'] = result['final_url']
        entry['error'] = result['error']

        if result['category'] == 'working':
            working_count += 1
            if normalize_url(entry['url']) != normalize_url(result['final_url']):
                entry['suggested'] = result['final_url']
                redirected.append(entry)
        elif result['category'] == 'broken':
            broken.append(entry)
        elif result['category'] == 'inconclusive':
            inconclusive.append(entry)

    report = f"# Link Audit Report\n\n"
    report += f"**Total links checked:** {total}\n"
    report += f"**Working links:** {working_count}\n"
    report += f"**Confirmed broken links:** {len(broken)}\n"
    report += f"**Suspicious/Inconclusive links (e.g. 403, 429):** {len(inconclusive)}\n"
    report += f"**Working links with redirects:** {len(redirected)}\n\n"

    if broken:
        report += "## Broken Links\n\n"
        for b in broken:
            report += f"- **{b['name']}** ({b['category']} in {b['source']})\n"
            report += f"  - URL: {b['url']}\n"
            report += f"  - Status: {b['status']}\n"
            if b['error']:
                report += f"  - Error: {b['error']}\n"
            report += "\n"

    if inconclusive:
        report += "## Suspicious / Inconclusive Links\n\n"
        for inc in inconclusive:
            report += f"- **{inc['name']}** ({inc['category']} in {inc['source']})\n"
            report += f"  - URL: {inc['url']}\n"
            if inc['status']:
                report += f"  - Status: {inc['status']}\n"
            if inc.get('error'):
                report += f"  - Error: {inc['error']}\n"
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
