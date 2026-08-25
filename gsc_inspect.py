#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["google-api-python-client>=2.100", "google-auth>=2.23"]
# ///
"""Request Google indexing inspection for oresund.live URLs via Search Console.

Usage:
    uv run gsc_inspect.py <url> [url2 ...]
    uv run gsc_inspect.py --all          # inspect every URL in dist sitemap
    uv run gsc_inspect.py --changed      # inspect URLs touched in last commit (paths mapped to live URLs)

Requires: GSC_SERVICE_ACCOUNT_KEY env var or ~/.hermes/gsc-service-account.json
The service account must be an owner/user of sc-domain:oresund.live.
"""
import json, os, sys, subprocess

SITE = "https://oresund.live/"
PROPERTY = os.environ.get("GSC_PROPERTY", "sc-domain:oresund.live")
KEY_PATH = os.environ.get("GSC_SERVICE_ACCOUNT_KEY",
                          "/home/hermes/.hermes/gsc-service-account.json")

def get_service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds = service_account.Credentials.from_service_account_file(
        KEY_PATH, scopes=["https://www.googleapis.com/auth/webmasters"]
    )
    return build("searchconsole", "v1", credentials=creds)

def inspect_url(service, url):
    try:
        resp = service.urlInspection().index().inspect(body={
            "inspectionUrl": url,
            "siteUrl": PROPERTY
        }).execute()
        result = resp.get("inspectionResult", {}).get("indexStatusResult", {})
        verdict = result.get("verdict", "UNKNOWN")
        coverage = result.get("coverageState", "")
        last_crawl = result.get("lastCrawlTime", "never")
        return (url, verdict, f"{coverage} | last crawl: {last_crawl}")
    except Exception as e:
        return (url, "ERROR", str(e))

def get_all_urls():
    """Read the built sitemap (dist/sitemap.xml) — source of truth after a build."""
    base = os.path.dirname(os.path.abspath(__file__))
    sm = os.path.join(base, "..", "packages", "web", "dist", "sitemap.xml")
    urls = []
    if os.path.isfile(sm):
        import xml.etree.ElementTree as ET
        root = ET.parse(sm).getroot()
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        urls = [u.text.strip() for u in root.findall(".//s:loc", ns) if u.text]
    if not urls:
        urls = [SITE]
    return urls

def get_changed_urls():
    """Map file paths changed in the last commit to live URLs."""
    out = subprocess.run(
        ["git", "diff", "--name-only", "HEAD~1", "HEAD"],
        capture_output=True, text=True
    ).stdout.splitlines()
    for path in out:
        p = path.strip()
        if p.endswith("sitemap.xml"):
            return get_all_urls()
    # route-level mapping
    urls = set()
    for path in out:
        p = path.strip()
        if "/line/" in p:
            urls.update(u for u in get_all_urls() if "/line/" in u)
        elif "/station/" in p:
            urls.update(u for u in get_all_urls() if "/station/" in u)
        elif "/history" in p:
            urls.update(u for u in get_all_urls() if "/history" in u)
        elif p.startswith(("packages/web/src/", "packages/web/scripts/", "packages/web/index.html")):
            return get_all_urls()
    if not urls:
        urls = [SITE]
    return sorted(urls)

def main():
    args = sys.argv[1:]
    if not any(args):
        print("Usage: gsc_inspect.py <url>... | --all | --changed")
        sys.exit(2)
    if "--all" in args:
        urls = get_all_urls()
    elif "--changed" in args:
        urls = get_changed_urls()
    else:
        urls = [u if u.startswith("http") else SITE + u.lstrip("/") for u in args]

    print(f"Inspecting {len(urls)} URL(s) on {PROPERTY}...")
    service = get_service()
    indexed = pending = failed = 0
    for url in urls:
        url, verdict, detail = inspect_url(service, url)
        tag = {"PASS": "PASS", "NEUTRAL": "PUSH "}.get(verdict, verdict.upper()[:6])
        print(f"  {tag:6}  {url}  ({detail})")
        if verdict == "PASS":
            indexed += 1
        elif verdict == "NEUTRAL":
            pending += 1   # unknown to Google — inspection queues discovery
        else:
            failed += 1
    print(f"\nDone: {indexed} indexed, {pending} pushed-for-discovery, {failed} errors")

if __name__ == "__main__":
    main()
