# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.5.5", "pillow==13.0.0", "shapely==2.2.0"]
# ///
"""Build the outskirts albedo and roof records from OpenStreetMap ODbL data.

Run: uv run tools/build-outskirts.py
Reuse local OSM API extracts: uv run tools/build-outskirts.py --extracts /path/to/maps

The bounds below are west,south,east,north, fetched from /api/0.6/map?bbox=...
on 2026-11-18. A fresh download uses the map on the day of the request.
The atlas is drawn from the vectors. No aerial photography is used as artwork.
"""

import argparse
import json
import math
import random
import shutil
import tempfile
import urllib.request
import xml.etree.ElementTree as E
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

root = Path(__file__).resolve().parents[1]
bounds = {
    "east": "4.760,52.624,4.77,52.64",
    "south": "4.735,52.620,4.762,52.628",
    "west": "4.73,52.624,4.738,52.64",
    "north": "4.737,52.637,4.763,52.642",
}


def map_extracts(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name, bbox in bounds.items():
        path = directory / f"{name}.osm"
        if not path.exists():
            request = urllib.request.Request(
                f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}",
                headers={"User-Agent": "Rijexamen-Alkmaar-map-authoring/1.0"},
            )
            with urllib.request.urlopen(request, timeout=90) as response:
                staged = path.with_suffix(".part")
                with staged.open("wb") as file:
                    shutil.copyfileobj(response, file)
                staged.replace(path)
        yield path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--extracts",
    type=Path,
    help="keep and reuse the four OSM map extracts in this directory",
)
args = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="alkmaar-map-") as temporary:
    extracts = map_extracts(args.extracts or Path(temporary))
    nodes = {}
    ways = {}
    relations = {}
    for f in extracts:
        data = E.parse(f).getroot()
        for n in data.findall("node"):
            lon, lat = float(n.attrib["lon"]), float(n.attrib["lat"])
            nodes[n.attrib["id"]] = (
                (lon - 4.74875) * 111320 * math.cos(math.radians(52.6325)),
                -(lat - 52.6325) * 110540,
            )
        for w in data.findall("way"):
            ways[w.attrib["id"]] = (
                [n.attrib["ref"] for n in w.findall("nd")],
                {t.attrib["k"]: t.attrib["v"] for t in w.findall("tag")},
            )
        for r in data.findall("relation"):
            relations[r.attrib["id"]] = (
                [
                    (m.attrib["role"], m.attrib["ref"])
                    for m in r.findall("member")
                    if m.attrib["type"] == "way"
                ],
                {t.attrib["k"]: t.attrib["v"] for t in r.findall("tag")},
            )


resolution = 4096
minimum = -1440
maximum = 1440
scale = resolution / (maximum - minimum)


def uv(x, z):
    return ((x - minimum) * scale, (z - minimum) * scale)


def pixels(points):
    return [uv(*t) for t in points]


im = Image.new("RGB", (resolution, resolution), "#87946a")
d = ImageDraw.Draw(im)


def polygon(points, c):
    if len(points) >= 3:
        d.polygon(pixels(points), fill=c)


def line(points, w, c):
    if len(points) >= 2:
        d.line(pixels(points), fill=c, width=max(1, round(w * scale)), joint="curve")


areas = []
water = []
canals = []
roads = []
homes = []
green = {
    "grass": "#849559",
    "forest": "#627e53",
    "meadow": "#9aaa72",
    "village_green": "#84945f",
    "recreation_ground": "#89a36a",
    "farmland": "#a8a074",
    "orchard": "#809866",
    "allotments": "#8f956c",
    "cemetery": "#728464",
    "residential": "#aaa28a",
    "commercial": "#b0aea4",
    "industrial": "#a39e94",
    "retail": "#b4b0a1",
    "brownfield": "#a29880",
    "railway": "#9d977f",
    "construction": "#ad9d82",
}
leisure = {
    "park": "#849e67",
    "garden": "#8fa579",
    "pitch": "#78945b",
    "sports_centre": "#819b6e",
    "playground": "#b7a486",
    "golf_course": "#83985c",
}
widths = {
    "primary": 10,
    "secondary": 8,
    "tertiary": 7,
    "living_street": 4.4,
    "residential": 5.5,
    "unclassified": 6,
    "service": 3.5,
    "track": 2.5,
    "cycleway": 2.6,
    "footway": 1.7,
    "pedestrian": 4,
    "path": 1.5,
}


def features(id, points, t, polygonal):
    if len(points) < 2:
        return
    typ = t.get("building")
    if typ and polygonal:
        homes.append((int(id), points, typ, t))
    elif (
        t.get("natural") == "water" or t.get("waterway") == "riverbank"
    ) and polygonal:
        water.append(points)
    elif t.get("waterway") in ["canal", "ditch", "river", "drain", "stream"]:
        tag = t["waterway"]
        name = t.get("name", "")
        w = {"canal": 12, "ditch": 2.6, "river": 22, "drain": 3.7, "stream": 5}[tag]
        if name == "Noordhollandsch Kanaal":
            w = 46
        try:
            w = float(t["width"])
        except (KeyError, TypeError, ValueError):
            pass
        canals.append((points, w))
    elif t.get("highway") in widths and not t.get("tunnel") and t.get("area") != "yes":
        k = t["highway"]
        roads.append((points, widths[k], k, t.get("bridge") == "yes"))
    elif polygonal:
        c = (
            green.get(t.get("landuse"))
            or leisure.get(t.get("leisure"))
            or {
                "wood": "#627b52",
                "grassland": "#8b9b65",
                "scrub": "#7b8d62",
                "wetland": "#748c68",
            }.get(t.get("natural"))
        )
        if c:
            areas.append((points, c, t))


def bbox(p):
    xx, zz = zip(*p)
    return min(xx), min(zz), max(xx), max(zz)


for id, (node_ids, t) in ways.items():
    if not t or len(node_ids) < 2 or any(n not in nodes for n in node_ids):
        continue
    points = [nodes[n] for n in node_ids]
    features(id, points, t, node_ids[0] == node_ids[-1])
# Some large canals and parks are multipolygons. Join the available outer ways at node IDs.
for id, (members, t) in relations.items():
    if t.get("type") != "multipolygon" or not (
        t.get("natural") or t.get("landuse") or t.get("leisure")
    ):
        continue
    parts = [ways[m][0][:] for role, m in members if m in ways and role != "inner"]
    while parts:
        ps = parts.pop()
        while ps and ps[0] != ps[-1]:
            ix = next(
                (i for i, p in enumerate(parts) if p[0] == ps[-1] or p[-1] == ps[-1]),
                None,
            )
            if ix is None:
                break
            nxt = parts.pop(ix)
            ps.extend((nxt if nxt[0] == ps[-1] else list(reversed(nxt)))[1:])
        if len(ps) > 3 and ps[0] == ps[-1] and all(n in nodes for n in ps):
            features(id, [nodes[n] for n in ps], t, True)


# Illustrator's ground palette, laid out on real OSM parcels. Retain courtyards and open spaces instead of a beige fill.
def area_key(a):
    b = bbox(a[0])
    return (b[2] - b[0]) * (b[3] - b[1])


for points, c, t in sorted(areas, key=area_key, reverse=True):
    polygon(points, c)
for points, w in canals:
    line(points, w + 4, "#637a59")
    line(points, w, "#42686a")
for points in water:
    polygon(points, "#42686a")
    line(points, 1.5, "#536f64")
roads.sort(key=lambda a: (a[3], a[1]))
for points, w, k, bridge in roads:
    line(
        points,
        w + 2.2,
        "#b9b8a6" if k in ("primary", "secondary", "tertiary") else "#a99f88",
    )
    c = (
        "#b6ad91"
        if k in ("path", "footway", "track", "pedestrian")
        else "#b27e6a"
        if k == "cycleway"
        else "#777c7d"
        if w > 6
        else "#898985"
    )
    line(points, w, c)
    if w >= 7:
        line(points, 0.65, "#b8b4a1")
compiled = json.loads((root / "data/alkmaar.json").read_text())
core = [Polygon(list(zip(b["p"][::2], b["p"][1::2]))) for b in compiled["buildings"]]
core = [p for p in core if p.is_valid and p.area > 0]
tree = STRtree(core)


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def urban_end(x, z):
    return max(
        abs(x + 45) / (1250 + 75 * math.sin(z / 141)),
        (-z) / (990 + 65 * math.sin(x / 117)),
        z / (985 + 72 * math.sin(x / 200) + 35 * math.sin(x / 63)),
    )


# Relief shapes are reserved for neighborhoods the movie camera passes; the rest use the same two roof faces baked into the map.
footprints = []
homes.sort(key=lambda h: h[0])
roofs = [
    "#8f624b",
    "#9b614a",
    "#8d5844",
    "#a57555",
    "#835449",
    "#6e6d67",
    "#79746c",
    "#995f48",
    "#a4664b",
    "#8f7463",
]


def length(a, b):
    return math.dist(a, b)


def mid(a, b):
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


for id, points, k, t in homes:
    try:
        p = Polygon(points)
    except (TypeError, ValueError):
        continue
    if not p.is_valid or p.area < 5:
        continue
    mx, mz = p.centroid.coords[0]
    end = urban_end(mx, mz)
    if not -1450 < mx < 1450 or not -1450 < mz < 1450 or end > 1.05:
        continue
    rng = random.Random(id)
    c = roofs[rng.randrange(len(roofs))]
    if p.area > 440:
        c = rng.choice(["#92938b", "#8e9089", "#a09887", "#7f8684"])
    # The dark eave and a slightly lighter sunward plane give distant baked silhouettes readable mass.
    polygon([(x + 2.6, z + 1.5) for x, z in points], "#726e58")
    polygon(points, c)
    rect = list(p.minimum_rotated_rectangle.exterior.coords)[:4]
    if len(rect) < 4:
        continue
    if length(rect[0], rect[1]) < length(rect[1], rect[2]):
        rect = rect[1:] + rect[:1]
    a, b = mid(rect[0], rect[3]), mid(rect[1], rect[2])
    if p.area > 28:
        # A two-plane roof in the softedged ground albedo, under small gardens and row terraces.
        face = Polygon([rect[0], rect[1], b, a]).intersection(p)
        if face.geom_type == "Polygon":
            col = tuple(
                min(255, round(int(c[j : j + 2], 16) * 1.12)) for j in (1, 3, 5)
            )
            polygon(list(face.exterior.coords), col)
        if p.area > 90:
            line([a, b], 0.8, "#a58c74" if p.area < 440 else "#aba99b")
    # Use simplified, complete terraces where possible, preserving real street angles and uninterrupted shared ridges.
    if mz < 430 or mz > 990 or mx < -980 or mx > 850 or end > 0.945 or p.area < 39:
        continue
    if any(core[i].covers(p.centroid) for i in tree.query(p.centroid)):
        continue
    if (
        t.get("building") in ["roof", "construction", "ruins"]
        or p.area / (p.minimum_rotated_rectangle.area or 1) < 0.68
    ):
        continue
    if max(length(rect[0], rect[1]), length(rect[1], rect[2])) > 85:
        continue
    footprints.append(p)
# Merge adjacent terrace footprints. The small gaps between rows and gardens stay open.
union = unary_union([p.buffer(0.18, join_style=2) for p in footprints])
clusters = list(union.geoms) if union.geom_type == "MultiPolygon" else [union]
items = []
neighborhood = STRtree(footprints)
terraces = []
for p in clusters:
    r = p.minimum_rotated_rectangle
    if p.area / r.area >= 0.79:
        terraces.append(p)
        continue
    # L-shaped blocks enclose genuine courtyard space. Build their separate
    # houses instead of putting one rectangular roof over the shared garden.
    for ix in neighborhood.query(p):
        home = footprints[ix]
        if (
            p.covers(home.centroid)
            and home.area / home.minimum_rotated_rectangle.area > 0.73
        ):
            terraces.append(home)
for p in terraces:
    r = p.minimum_rotated_rectangle
    rect = list(r.exterior.coords)[:4]
    a, b = length(rect[0], rect[1]), length(rect[1], rect[2])
    if b > a:
        rect = rect[1:] + rect[:1]
        a, b = b, a
    if b < 2.8 or a < 4:
        continue
    mx, mz = p.centroid.coords[0]
    rng = random.Random(round(mx * mz))
    h = rng.uniform(4.2, 6.8)
    if b > 17 or a > 98:
        continue
    yaw = math.atan2(rect[1][1] - rect[0][1], rect[1][0] - rect[0][0])
    cx = sum(x for x, z in rect) / 4
    cz = sum(z for x, z in rect) / 4
    items.append(
        [
            round(cx),
            round(cz),
            round(a * 10),
            round(b * 10),
            round(yaw * 1000),
            round(h * 10),
            rng.randrange(8),
        ]
    )
# End the compact town on its southern water/field boundary. Follow free ground
# between real houses. A draining sloot and its grass bank connect the three
# southern canal ends and the avenue from the film's compressed motorway.
context = im.resize((960, 960), Image.Resampling.BILINEAR)
rgb = np.asarray(context, dtype=float)
xs = np.arange(-1450, 1451, 5)
zs = np.arange(830, 1052, 3)
denom = maximum - minimum
ix = np.clip(((xs - minimum) * 960 / denom).astype(int), 0, 959)
iz = np.clip(((zs - minimum) * 960 / denom).astype(int), 0, 959)
samples = rgb[iz[None, :], ix[:, None]]


def distance(col):
    return np.sqrt(((samples - np.array(col)) ** 2).sum(-1))


water_dist = distance([66, 104, 106])
roof_dist = np.min(
    np.stack([distance([int(c[j : j + 2], 16) for j in [1, 3, 5]]) for c in roofs]),
    axis=0,
)
road_dist = distance([137, 137, 133])
aim = 945 + 30 * np.sin(xs / 185) + 7 * np.sin(xs / 69)
cost = (
    np.maximum(0, (32 - roof_dist) * 0.34)
    + np.maximum(0, (16 - water_dist) * 0.63)
    + np.maximum(0, (10 - road_dist) * 0.32)
    + abs(zs[None, :] - aim[:, None]) * 0.04
)
# Backtrack through the lowest-cost strip. Limit both cross-country gradient
# and heading changes so our connecting ditch has proper engineered stretches.
turn_cost = [1.5, 0.33, 0, 0.33, 1.5]
shifts = [-2, -1, 0, 1, 2]
lowest = cost[0].copy()
parents = []
for i in range(1, len(xs)):
    options = []
    for move, price in zip(shifts, turn_cost):
        v = np.roll(lowest, move)
        if move > 0:
            v[:move] = 1e9
        elif move < 0:
            v[move:] = 1e9
        options.append(v + price)
    scores = np.stack(options)
    choice = scores.argmin(axis=0)
    lowest = scores.min(axis=0) + cost[i]
    parents.append(choice)
j = lowest.argmin()
track = [j]
for choice in reversed(parents):
    j -= shifts[choice[j]]
    track.append(j)
bank_z = zs[np.array(track[::-1])]
bank_z = np.convolve(np.pad(bank_z, (3, 3), mode="edge"), np.ones(7) / 7, "valid")


def on_urban_bank(row):
    x, z, long_side, short_side, angle, _, _ = row
    yaw = angle / 1000
    u = math.cos(yaw)
    v = math.sin(yaw)
    for a in (-long_side / 20, long_side / 20):
        for b in (-short_side / 20, short_side / 20):
            xx = x + a * u - b * v
            zz = z + a * v + b * u
            if zz > np.interp(xx, xs, bank_z) - 6:
                return False
    return True


items = [row for row in items if on_urban_bank(row)]
course = list(zip(xs, bank_z))
rand = random.Random(861)


def side(dz):
    return [(x, z + dz) for x, z in course]


line(side(-3), 11, "#7c9462")
line(side(1), 7, "#74895d")
line(side(-5), 2.3, "#aba98d")
line(side(0), 4.4, "#456b68")
line(side(2.3), 1.0, "#697f57")
# A long rural avenue bends into an actual mapped residential street via a bridge.
access = [
    (464, 1090),
    (464, 977),
    (465, 968),
    (469, 960),
    (489, 940),
    (508, 919),
    (518, 909),
]
line(access, 10.5, "#8a9969")
line(access, 7.3, "#777b78")
for x in range(-1200, 1250, 16):
    if 450 < x < 485 or rand.random() < 0.56:
        continue
    z = float(np.interp(x, xs, bank_z)) - 8 + rand.uniform(-0.8, 0.8)
    u, v = uv(x, z)
    w = rand.uniform(1.8, 3.5) * scale
    d.ellipse(
        (u - w + scale, v - w * 0.65 + scale, u + w + scale, v + w * 0.65 + scale),
        fill="#69765a",
    )
    d.ellipse(
        (u - w, v - w * 0.65, u + w, v + w * 0.65),
        fill=rand.choice(["#718749", "#7e9159", "#758d54"]),
    )
# Render thin streets and roof ridges at double resolution to give narrow paths
# coverage instead of jagged one-texel dark/light steps from drone height.
im = im.resize((2048, 2048), Image.Resampling.LANCZOS)
resolution = 2048
# Remaining patches between the mapped streets use sparse, small ripples in the ground colour.
xx, zz = np.meshgrid(
    np.linspace(minimum, maximum, resolution, dtype=np.float32),
    np.linspace(minimum, maximum, resolution, dtype=np.float32),
)
r = np.random.default_rng(131)
im = im.filter(ImageFilter.UnsharpMask(radius=0.68, percent=80, threshold=3))
base = np.array(im).astype(np.float32)
mottle = (
    1
    + np.sin(xx * 0.047 + zz * 0.017) * 0.009
    + np.cos(zz * 0.072 - xx * 0.022) * 0.008
    + r.normal(0, 0.008, (resolution, resolution))
)
im = Image.fromarray(np.clip(base * mottle[:, :, None], 0, 255).astype("uint8"))
inside = np.maximum(abs(xx) / 740, abs(zz) / 555)
# The original center stays fully masked; outer suburbs give way gradually along irregular field edges.
sideEnd = np.maximum(
    abs(xx + 45) / (1250 + 75 * np.sin(zz / 141)), -zz / (990 + 65 * np.sin(xx / 117))
)
edge = np.interp(xx[0], xs, bank_z)[None, :] + 4
south = smooth((edge - zz) / 1.25)
# Only the pencil-thin outer grass margin is anti-aliased. The water, footpaths
# and garden texture stay opaque on the built side with no luminous crossfade.
alpha = smooth((inside - 0.80) / 0.23) * smooth((1.02 - sideEnd) / 0.036) * south
im.putalpha(Image.fromarray(np.round(alpha * 255).astype("uint8")))
im.save(root / "assets/alkmaar-outskirts.webp", quality=88, method=6, alpha_quality=92)
(root / "data/alkmaar-rooflines.json").write_text(
    json.dumps(items, separators=(",", ":"))
)
print(
    "roof rows",
    len(items),
    "OSM houses",
    len(homes),
    "raster",
    (root / "assets/alkmaar-outskirts.webp").stat().st_size,
)
