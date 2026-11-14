"""Map tiles with an offline cache.

GET /tiles/{style}/{z}/{x}/{y}.png serves a tile from TILE_DIR; on a miss it fetches it from CARTO once and keeps it.
Before an event without reliable internet, warm the cache for Kyzylorda:
    docker compose exec backend python -m app.tiles            (≈1 500 tiles, ~20 MB, both themes, zoom 10–16)
The cache lives in ./tiles on the host, so it can be copied to another machine as a folder."""
from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import httpx

TILE_DIR = Path(os.getenv("TILE_DIR", Path(__file__).resolve().parents[1] / "tiles"))
STYLES = {"dark": "dark_all", "light": "light_all"}
UPSTREAM = "https://{s}.basemaps.cartocdn.com/{style}/{z}/{x}/{y}.png"
BBOX = (44.78, 65.38, 44.92, 65.62)  # Kyzylorda: lat_min, lon_min, lat_max, lon_max
UA = {"User-Agent": "TutinGuard/0.5 (hackathon demo; tile cache)"}


def path(style: str, z: int, x: int, y: int) -> Path:
    return TILE_DIR / style / str(z) / str(x) / f"{y}.png"


def get(style: str, z: int, x: int, y: int, client: httpx.Client | None = None) -> bytes | None:
    if style not in STYLES or not (0 <= z <= 19):
        return None
    p = path(style, z, x, y)
    if p.exists():
        return p.read_bytes()
    url = UPSTREAM.format(s="abcd"[(x + y) % 4], style=STYLES[style], z=z, x=x, y=y)
    try:
        r = (client or httpx).get(url, headers=UA, timeout=4)
        if r.status_code != 200 or not r.content:
            return None
    except httpx.HTTPError:
        return None
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(r.content)
    return r.content


def deg2tile(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def prefetch(zmin: int = 10, zmax: int = 16):
    total = ok = 0
    with httpx.Client() as c:
        for style in STYLES:
            for z in range(zmin, zmax + 1):
                x0, y1 = deg2tile(BBOX[0], BBOX[1], z)
                x1, y0 = deg2tile(BBOX[2], BBOX[3], z)
                for x in range(x0, x1 + 1):
                    for y in range(y0, y1 + 1):
                        total += 1
                        ok += get(style, z, x, y, c) is not None
            print(f"{style}: done", flush=True)
    print(f"tiles: {ok}/{total} in {TILE_DIR}")
    return ok, total


if __name__ == "__main__":
    prefetch(*(int(a) for a in sys.argv[1:3]))
