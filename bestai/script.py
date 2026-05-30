#!/usr/bin/env python3
"""
Archive ~707k blog posts from oreateai.com to compressed searchable format.
Output: I:\\oreate\\
- oreate_archive.db - SQLite + FTS5 for full-text search
- oreate_index.json.zst - lightweight index (slug, title, date) for static search
- oreate_chunks/*.json.zst - compressed post content in chunks
"""

import argparse
import csv
import json
import random
import sqlite3
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import requests
    from bs4 import BeautifulSoup
    import zstandard as zstd
except ImportError:
    print("Install: pip install requests beautifulsoup4 zstandard")
    raise

# --- Config ---
BASE_URL = "https://www.oreateai.com/blog/"
CATEGORY_URL = "https://www.oreateai.com/blog/content/"
OUTPUT_DIR = Path(r"I:\oreate")
PROXIES_ROOT = Path(__file__).resolve().parent.parent / "gd" / "cbf" / "data" / "proxies"
PROXIES_CSV = PROXIES_ROOT.with_suffix(".csv")

# Inline proxy list derived from gd/cbf/data/proxies/proxies.csv
PROXY_LIST: list[str] = [
    "http://209.127.78.123:8800", "http://198.154.85.141:8800", "http://38.154.97.211:8800", "http://152.232.221.226:8800",
    "http://152.232.221.233:8800", "http://38.154.72.125:8800", "http://38.154.91.106:8800", "http://38.154.56.235:8800",
    "http://38.154.163.53:8800", "http://152.232.222.163:8800", "http://152.232.221.237:8800", "http://152.232.223.232:8800",
    "http://209.127.78.122:8800", "http://152.232.153.141:8800", "http://152.232.223.225:8800", "http://192.241.97.200:8800",
    "http://38.154.97.222:8800", "http://38.154.72.100:8800", "http://209.127.78.61:8800", "http://192.241.80.8:8800",
    "http://198.154.85.132:8800", "http://38.154.56.238:8800", "http://38.154.97.219:8800", "http://192.241.80.4:8800",
    "http://209.127.78.57:8800", "http://192.241.71.229:8800", "http://38.154.163.45:8800", "http://192.241.80.18:8800",
    "http://192.241.97.206:8800", "http://209.127.78.60:8800", "http://152.232.153.183:8800", "http://38.154.179.104:8800",
    "http://38.154.51.203:8800", "http://38.154.97.195:8800", "http://192.241.88.84:8800", "http://192.241.97.203:8800",
    "http://38.154.72.114:8800", "http://198.154.85.138:8800", "http://192.241.88.78:8800", "http://209.127.78.121:8800",
    "http://38.154.72.121:8800", "http://152.232.222.177:8800", "http://192.241.80.2:8800", "http://192.241.80.29:8800",
    "http://38.154.72.126:8800", "http://38.154.72.97:8800", "http://38.154.81.165:8800", "http://192.241.74.112:8800",
    "http://38.154.51.198:8800", "http://38.154.51.194:8800", "http://209.127.78.125:8800", "http://38.154.51.205:8800",
    "http://198.154.85.129:8800", "http://38.154.91.115:8800", "http://198.154.85.151:8800", "http://152.232.221.229:8800",
    "http://38.154.179.97:8800", "http://198.154.85.144:8800", "http://38.154.179.101:8800", "http://192.241.74.115:8800",
    "http://38.154.72.110:8800", "http://38.154.56.253:8800", "http://198.154.85.157:8800", "http://152.232.222.151:8800",
    "http://192.241.88.71:8800", "http://38.154.163.35:8800", "http://38.154.51.204:8800", "http://198.154.85.146:8800",
    "http://192.241.71.254:8800", "http://152.232.223.231:8800", "http://38.154.56.226:8800", "http://152.232.223.233:8800",
    "http://198.20.163.204:8800", "http://38.154.163.60:8800", "http://192.241.88.76:8800", "http://38.154.97.193:8800",
    "http://192.241.71.235:8800", "http://38.154.81.169:8800", "http://192.241.88.85:8800", "http://38.154.56.254:8800",
    "http://209.127.78.62:8800", "http://152.232.221.238:8800", "http://198.154.85.147:8800", "http://38.154.81.178:8800",
    "http://209.127.78.59:8800", "http://198.154.85.142:8800", "http://192.241.74.100:8800", "http://38.154.179.109:8800",
    "http://152.232.153.182:8800", "http://192.241.71.240:8800", "http://192.241.71.245:8800", "http://38.154.91.124:8800",
    "http://198.154.85.158:8800", "http://38.154.91.110:8800", "http://38.154.81.187:8800", "http://38.154.51.202:8800",
    "http://198.20.163.216:8800", "http://209.127.78.124:8800", "http://152.232.153.184:8800", "http://38.154.56.227:8800",
    "http://192.241.97.209:8800", "http://38.154.81.162:8800", "http://152.232.222.179:8800", "http://152.232.222.181:8800",
    "http://38.154.163.54:8800", "http://38.154.81.189:8800", "http://38.154.97.214:8800", "http://152.232.153.158:8800",
    "http://38.154.179.112:8800", "http://192.241.74.126:8800", "http://38.154.56.248:8800", "http://198.154.85.136:8800",
    "http://192.241.97.197:8800", "http://198.154.85.134:8800", "http://38.154.97.194:8800", "http://198.154.85.153:8800",
    "http://38.154.179.123:8800", "http://152.232.153.187:8800", "http://192.241.74.103:8800", "http://152.232.223.230:8800",
    "http://152.232.223.238:8800", "http://192.241.88.83:8800", "http://152.232.222.187:8800", "http://38.154.91.107:8800",
    "http://38.154.91.113:8800", "http://152.232.221.228:8800", "http://192.241.97.216:8800", "http://38.154.51.196:8800",
    "http://209.127.78.126:8800", "http://192.241.80.27:8800", "http://192.241.71.237:8800", "http://38.154.163.51:8800",
    "http://152.232.223.237:8800", "http://152.232.153.152:8800", "http://192.241.74.109:8800", "http://192.241.97.210:8800",
    "http://198.154.85.133:8800", "http://38.154.163.39:8800", "http://152.232.222.164:8800", "http://152.232.221.225:8800",
    "http://38.154.81.168:8800", "http://192.241.80.30:8800", "http://192.241.71.241:8800", "http://38.154.179.103:8800",
    "http://192.241.74.117:8800", "http://192.241.88.88:8800", "http://198.154.85.139:8800", "http://209.127.78.58:8800",
    "http://198.154.85.154:8800", "http://38.154.91.123:8800",
]
MAX_PAGES = 70784  # page/1 through page/70784
POSTS_PER_CHUNK = 500
REQUESTS_DELAY = 0
MAX_WORKERS = 128
MAX_RETRIES = 3
CHUNK_SIZE = 100
DEBUG = False


def _load_proxy_file(path: Path, out: list[str]) -> int:
    added = 0
    try:
        # CSV support (e.g. proxies.csv with columns id,proxy,country,...)
        if path.suffix.lower() == ".csv":
            with path.open("r", encoding="utf-8", errors="ignore", newline="") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    # Case-insensitive lookup for 'proxy' or 'ip' column
                    proxy_val = ""
                    for k, v in row.items():
                        if k and v:
                            kl = k.strip().lower()
                            if kl == "proxy" or kl == "ip":
                                proxy_val = str(v).strip()
                                break
                    if not proxy_val:
                        continue
                    s = proxy_val
                    if "://" not in s:
                        s = f"http://{s}"
                    out.append(s)
                    added += 1
        else:
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                # Skip CSV header lines accidentally treated as proxies
                if s.lower().startswith("id,proxy") or s.lower().startswith('"id","proxy"'):
                    continue
                if "," in s and '"' in s:
                    # Likely CSV row even if file isn't .csv; take second field as proxy
                    try:
                        parts = next(csv.reader([s]))
                        if len(parts) >= 2:
                            s = parts[1].strip()
                        else:
                            continue
                    except Exception:
                        continue
                if "://" not in s:
                    s = f"http://{s}"
                out.append(s)
                added += 1
    except Exception as e:
        if DEBUG:
            print(f"[DEBUG] could not read proxies from {path}: {e}")
    return added


def load_proxies() -> list[str]:
    """Return inline proxy list for maximum reliability (derived from proxies.csv)."""
    if DEBUG:
        print(f"[DEBUG] Using inline proxy list, count={len(PROXY_LIST)}")
    return list(PROXY_LIST)


def get_session(proxies: list[str] | None):
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    })
    return s


def fetch(session: requests.Session, url: str, proxies_list: list[str] | None = None) -> str | None:
    for attempt in range(MAX_RETRIES):
        try:
            kw = {"timeout": 30}
            if proxies_list:
                proxy = random.choice(proxies_list)
                kw["proxies"] = {"http": proxy, "https": proxy}
            r = session.get(url, **kw)
            if DEBUG:
                print(f"[DEBUG] GET {url} attempt={attempt + 1} status={r.status_code}")
            r.raise_for_status()
            # Force UTF-8 to avoid mojibake like â
            try:
                text = r.content.decode("utf-8", errors="replace")
            except Exception:
                text = r.text
            return text
        except Exception as e:
            if DEBUG:
                print(f"[DEBUG] fetch error for {url} attempt={attempt + 1}: {e}")
            if attempt == MAX_RETRIES - 1:
                return None
            time.sleep(2 ** attempt)
    return None


def parse_category_page(html: str) -> list[str]:
    """Extract blog post URLs from a category page."""
    soup = BeautifulSoup(html, "html.parser")
    urls = []
    for a in soup.select("article .entry-title a[href]"):
        href = a.get("href", "")
        if "/blog/" in href and href not in urls:
            urls.append(href)
    return urls


def parse_blog_post(html: str, url: str) -> dict | None:
    """Extract title, date, and text from a single blog post page."""
    soup = BeautifulSoup(html, "html.parser")
    title_el = soup.select_one("h1.entry-title")
    title = title_el.get_text(strip=True) if title_el else ""
    if not title:
        title_el = soup.select_one(".entry-header .entry-title")
        title = title_el.get_text(strip=True) if title_el else ""

    date_el = soup.select_one("time.entry-date[datetime]")
    date_str = date_el.get("datetime", "") if date_el else ""
    if not date_str:
        date_el = soup.select_one(".entry-meta time[datetime]")
        date_str = date_el.get("datetime", "") if date_el else ""

    content_el = soup.select_one(".entry-content")
    if not content_el:
        content_el = soup.select_one(".entry-summary") or soup.select_one("article .page-content")
    text = content_el.get_text(separator="\n", strip=True) if content_el else ""

    slug = url.rstrip("/").split("/")[-1] or "unknown"
    return {"slug": slug, "title": title, "date": date_str, "text": text, "url": url}


def get_category_page_url(page: int) -> str:
    if page <= 1:
        return CATEGORY_URL
    return f"{CATEGORY_URL.rstrip('/')}/page/{page}/"


def init_db(db_path: Path) -> sqlite3.Connection:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY,
            slug TEXT UNIQUE,
            title TEXT,
            date TEXT,
            text TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_slug ON posts(slug)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_date ON posts(date)")
    try:
        conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(slug, title, text)")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    return conn


def save_chunk(chunk_data: list[dict], chunk_idx: int, compressor: zstd.ZstdCompressor):
    chunk_path = OUTPUT_DIR / "oreate_chunks" / f"chunk_{chunk_idx:05d}.json.zst"
    chunk_path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(chunk_data, ensure_ascii=False).encode("utf-8")
    compressed = compressor.compress(raw)
    chunk_path.write_bytes(compressed)


def main():
    ap = argparse.ArgumentParser(description="Archive oreateai.com blog posts")
    ap.add_argument("--start-page", type=int, default=1, help="Start page (default 1)")
    ap.add_argument("--end-page", type=int, default=MAX_PAGES, help=f"End page (default {MAX_PAGES})")
    ap.add_argument("--output", type=str, default=None, help="Output directory (default I:\\oreate)")
    ap.add_argument("--limit", type=int, default=0, help="Stop after N new posts (0=no limit)")
    ap.add_argument("--no-proxy", action="store_true", help="Disable proxies and use direct connections")
    ap.add_argument("--workers", type=int, default=MAX_WORKERS, help=f"Concurrent post fetchers (default {MAX_WORKERS})")
    ap.add_argument("--delay", type=float, default=REQUESTS_DELAY, help="Delay between post fetches in seconds (default 0)")
    ap.add_argument("--chunk-size", type=int, default=POSTS_PER_CHUNK, help=f"Posts per chunk file (default {POSTS_PER_CHUNK}, use 5–15 for small incremental saves)")
    ap.add_argument("--debug", action="store_true", help="Verbose debug logging (HTML snippets, proxy files)")
    args = ap.parse_args()

    global OUTPUT_DIR, DEBUG
    DEBUG = args.debug
    out = Path(args.output or str(OUTPUT_DIR))
    OUTPUT_DIR = out
    out.mkdir(parents=True, exist_ok=True)
    (out / "oreate_chunks").mkdir(exist_ok=True)

    proxies = [] if args.no_proxy else load_proxies()
    if proxies:
        print(f"Loaded {len(proxies)} proxies")
    else:
        print("No proxies found or --no-proxy set, using direct connection")

    session = get_session(proxies if proxies else None)
    start_page = max(1, args.start_page)
    end_page = min(MAX_PAGES, args.end_page)
    db_path = OUTPUT_DIR / "oreate_archive.db"
    conn = init_db(db_path)
    seen = set()
    cursor = conn.execute("SELECT slug FROM posts")
    for (s,) in cursor:
        seen.add(s)
    print(f"Resuming: {len(seen)} posts already in DB")

    compressor = zstd.ZstdCompressor(level=22)
    index_entries = []
    chunk_buf = []
    chunk_idx = 0
    total_posts = 0
    max_workers = args.workers
    req_delay = args.delay
    chunk_size = max(1, min(1000, args.chunk_size))

    log_path = OUTPUT_DIR / "oreate_run.log"

    def log(msg: str) -> None:
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        try:
            with log_path.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except Exception:
            pass

    log(f"Start run pages {start_page}-{end_page}, limit={args.limit or 'none'}, workers={max_workers}, delay={req_delay}s, chunk_size={chunk_size}")

    def process_page(page_num: int):
        url = get_category_page_url(page_num)
        html = fetch(session, url, proxies or None)
        if not html:
            if DEBUG:
                print(f"[DEBUG] Empty/failed response for page {page_num} url={url}")
            return []
        urls = parse_category_page(html)
        if DEBUG:
            print(f"[DEBUG] Page {page_num} url={url} len(html)={len(html)} links={len(urls)}")
            # For first couple of pages, dump a short snippet of the HTML to inspect
            if page_num <= 2:
                snippet = html[:400].replace("\n", " ")  # keep short
                print(f"[DEBUG] Page {page_num} snippet: {snippet}...")
        return urls

    def process_post(url: str):
        if url in seen:
            return None
        html = fetch(session, url, proxies or None)
        if not html:
            return None
        return parse_blog_post(html, url)

    for page in range(start_page, end_page + 1):
        post_urls = process_page(page)
        if not post_urls:
            if page <= 5 or page % 100 == 0:
                log(f"Page {page}: no posts found")
            if req_delay:
                time.sleep(req_delay)
            continue

        # Filter out already-seen slugs before dispatching
        new_urls: list[str] = []
        for url in post_urls:
            slug = url.rstrip("/").split("/")[-1]
            if slug in seen:
                continue
            new_urls.append(url)

        if not new_urls:
            if page <= 5 or page % 100 == 0:
                log(f"Page {page}: all {len(post_urls)} URLs already seen")
            continue

        # Concurrently fetch individual posts while keeping DB writes on main thread
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_url = {executor.submit(process_post, u): u for u in new_urls}
            for future in as_completed(future_to_url):
                post = future.result()
                if req_delay:
                    time.sleep(req_delay)
                if not post or not post.get("title"):
                    continue

                slug = post["slug"]
                if slug in seen:
                    continue
                seen.add(slug)
                total_posts += 1

                cur = conn.execute(
                    "INSERT OR IGNORE INTO posts (slug, title, date, text) VALUES (?, ?, ?, ?)",
                    (post["slug"], post["title"], post["date"], post["text"])
                )
                if cur.rowcount > 0:
                    try:
                        conn.execute(
                            "INSERT INTO posts_fts (slug, title, text) VALUES (?, ?, ?)",
                            (post["slug"], post["title"], post["text"])
                        )
                    except sqlite3.OperationalError:
                        pass

                index_entries.append({"s": post["slug"], "t": post["title"], "d": post["date"]})
                chunk_buf.append({"s": post["slug"], "t": post["title"], "d": post["date"], "c": post["text"]})

                if total_posts % 25 == 0:
                    log(f"Saved {total_posts} posts")

                if len(chunk_buf) >= chunk_size:
                    save_chunk(chunk_buf, chunk_idx, compressor)
                    chunk_idx += 1
                    chunk_buf = []

        if args.limit and total_posts >= args.limit:
            log(f"Reached limit of {args.limit} new posts at page {page}")
            break
        if page % 50 == 0:
            conn.commit()
            log(f"Checkpoint at page {page}/{end_page}, total_posts={total_posts}")

    if chunk_buf:
        save_chunk(chunk_buf, chunk_idx, compressor)

    conn.commit()

    # Rebuild index from full DB (handles resume)
    index_entries = []
    for row in conn.execute("SELECT slug, title, date FROM posts ORDER BY date DESC"):
        index_entries.append({"s": row[0], "t": row[1], "d": row[2] or ""})
    index_path = OUTPUT_DIR / "oreate_index.json.zst"
    raw = json.dumps(index_entries, ensure_ascii=False).encode("utf-8")
    index_path.write_bytes(compressor.compress(raw))

    conn.close()
    log(f"Done. Total posts: {total_posts}")
    log(f"Output dir: {OUTPUT_DIR}")
    log(f"DB: {db_path.name}, index: {index_path.name}, chunks in oreate_chunks/")


if __name__ == "__main__":
    main()
