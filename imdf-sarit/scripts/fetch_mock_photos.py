"""Download one openly licensed sample photo per type of business, for demos.

These are generic photos from Wikimedia Commons (a cafe, a bank hall, a shoe shop...), not the
Sarit Centre tenants. Cards label them "Sample photo" and credit the author. Replace them with
real tenant photos before the map is published.

Usage: python scripts/fetch_mock_photos.py [key ...]   (no keys = all)
Writes public/photos/mock/<key>.jpg and public/photos/mock/credits.json.
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "photos" / "mock"
UA = "DiraPrototype/0.1 (indoor map demo; contact via project owner)"
OPEN_LICENCES = ("CC0", "CC BY", "CC-BY", "Public domain", "PD")

# key -> Commons search queries, tried in order
QUERIES = {
    "grocery": ["supermarket fruit vegetables section", "supermarket produce aisle", "supermarket aisle interior"],
    "cafe": ["cafe interior with customers", "coffee shop counter espresso machine", "cafe interior counter"],
    "restaurant": ["restaurant interior tables", "restaurant dining room"],
    "fastfood": ["burger and fries meal", "hamburger restaurant interior", "food court"],
    "dessert": ["gelato display", "ice cream shop display"],
    "bakery": ["bakery display bread", "pastry shop display"],
    "bank": ["bank teller counters interior", "bank branch hall customers", "bank branch interior"],
    "phones": ["mobile phone shop interior", "smartphone store display"],
    "electronics": ["electronics store interior", "home appliances store"],
    "fashion": ["clothes on racks in shop", "fashion boutique interior", "clothing store interior 2019"],
    "shoes": ["shoes on display shelves store", "sneakers display wall shop", "shoe store display"],
    "jewellery": ["rings necklaces display case", "jewelry display case", "jewellery shop counter"],
    "beauty": ["cosmetics shelves makeup store", "makeup display counter", "perfume bottles display shop"],
    "salon": ["hair salon interior", "beauty salon interior"],
    "pharmacy": ["modern pharmacy interior shelves", "pharmacy counter medicines", "drugstore shelves"],
    "optician": ["optician shop interior", "eyeglasses store"],
    "home": ["furniture store interior", "homeware shop interior"],
    "books": ["bookshop interior", "bookstore shelves"],
    "toys": ["toy store interior", "toy shop shelves"],
    "sports": ["sports shop football boots display", "sportswear store interior", "sports shop interior"],
    "cinema": ["cinema hall red seats screen", "movie theater auditorium seats", "cinema auditorium"],
    "fun": ["bowling alley", "trampoline park"],
    "gym": ["gym interior equipment", "fitness centre interior"],
    "office": ["modern office interior", "office reception"],
    "clinic": ["dental clinic interior", "clinic waiting room"],
    "lounge": ["lounge bar interior", "wine bar interior"],
    "services": ["post office counter", "shop counter service"],
    "expo": ["trade fair hall booths visitors", "exhibition hall stands indoor", "expo hall booths"],
}


def fetch(url):
    """GET with a polite retry when Commons rate-limits (HTTP 429)."""
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(6 * (attempt + 1))


# Hand-picked files where search ranking returned poor matches (checked by eye).
PINNED = {
    "shoes": "File:Shoes in a spanish shoe store.jpg",
    "jewellery": "File:Interior of Sophies Silver jewelry store at Sankt Hansgatan 34, Visby, Sweden 2.jpg",
    "grocery": "File:SAS Supermarket - interior- 4.jpg",
    "bank": "File:Banking Hall, Guardian Building, Griswold Street, Detroit, MI.jpg",
    "fastfood": "File:Burger and fries 2.jpg",
    "cafe": "File:Interior of Floral Cafe 2026-02-25.jpg",
    "beauty": "File:HK 中環 Central 皇后大道中 88 Queen's Road 勵精中心 Regent Centre shop Mannings Store 化妝工具刷 makeup brush April 2024 R12S 01.jpg",
    "sports": "File:Interior sports clothing store Cala Millor.jpg",
    "expo": "File:TIBS South Hall South Coast Marine Booth Birdview 20140508.jpg",
}


def by_title(title):
    data = api({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 900})
    p = next(iter(data["query"]["pages"].values()))
    ii = p["imageinfo"][0]
    meta = ii.get("extmetadata", {})
    return {
        "title": p["title"],
        "thumb": ii["thumburl"],
        "page": ii["descriptionurl"],
        "licence": strip_html(meta.get("LicenseShortName", {}).get("value")),
        "author": strip_html(meta.get("Artist", {}).get("value"))[:80] or "Unknown author",
    }


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({**params, "format": "json"})
    return json.loads(fetch(url))


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def candidates(query):
    data = api({
        "action": "query", "generator": "search", "gsrsearch": f"{query} filetype:bitmap", "gsrnamespace": 6,
        "gsrlimit": 12, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 900,
    })
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {})
        licence = strip_html(meta.get("LicenseShortName", {}).get("value"))
        if ii.get("mime") != "image/jpeg" or not licence.startswith(OPEN_LICENCES):
            continue
        if ii.get("width", 0) < ii.get("height", 1) * 1.15 or ii.get("width", 0) < 800:
            continue  # landscape, reasonably sharp
        yield {
            "title": p["title"],
            "thumb": ii["thumburl"],
            "page": ii["descriptionurl"],
            "licence": licence,
            "author": strip_html(meta.get("Artist", {}).get("value"))[:80] or "Unknown author",
        }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    credits_path = OUT / "credits.json"
    credits = json.loads(credits_path.read_text()) if credits_path.exists() else {}
    keys = sys.argv[1:] or list(QUERIES)
    skip = {k: set(v.get("rejected", [])) for k, v in credits.items()}
    for key in keys:
        chosen = by_title(PINNED[key]) if key in PINNED else None
        for q in [] if chosen else QUERIES[key]:
            for c in candidates(q):
                if c["title"] in skip.get(key, set()):
                    continue
                chosen = c
                break
            if chosen:
                break
            time.sleep(0.5)
        if not chosen:
            print(f"{key}: nothing suitable")
            continue
        (OUT / f"{key}.jpg").write_bytes(fetch(chosen["thumb"]))
        prev = credits.get(key, {})
        credits[key] = {**chosen, "src": f"photos/mock/{key}.jpg", "rejected": prev.get("rejected", [])}
        credits_path.write_text(json.dumps(credits, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"{key}: {chosen['title']} ({chosen['licence']})")
        time.sleep(2)


if __name__ == "__main__":
    main()
