// Measures a building from LINZ's free open data, from an address alone: the official building outline, each wall's
// height from the laser scan (DSM, the surface, minus DEM, the bare ground), roof pitch and area, ground slope, and an
// aerial photo of the site. Runs in a browser (or Node for testing): every LINZ source used here allows direct access
// from a web page, with no key. A simpler JavaScript version of the method in Webbased-AI-NZ/property-measuring.

export const ARCGIS = "https://services.arcgis.com/xdsHIIxuCWByZiCB/arcgis/rest/services";

// ---- NZTM2000 (EPSG:2193), the grid LINZ data uses: Transverse Mercator on GRS80 -------------------------------------
const A = 6378137, F = 1 / 298.257222101, K0 = 0.9996, LON0 = 173 * Math.PI / 180, FE = 1600000, FN = 10000000;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);
const M = (phi) => A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
  + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
export function toNZTM(lon, lat) {
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const N = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = EP2 * Math.cos(phi) ** 2, Aa = (lam - LON0) * Math.cos(phi);
  const x = FE + K0 * N * (Aa + (1 - T + C) * Aa ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * EP2) * Aa ** 5 / 120);
  const y = FN + K0 * (M(phi) + N * Math.tan(phi) * (Aa ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * Aa ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * EP2) * Aa ** 6 / 720));
  return [x, y];
}
export function toLonLat(x, y) {
  const m = (y - FN) / K0, mu = m / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2), T1 = Math.tan(phi1) ** 2, C1 = EP2 * Math.cos(phi1) ** 2;
  const R1 = A * (1 - E2) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5, D = (x - FE) / (N1 * K0);
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(phi1);
  return [lon * 180 / Math.PI, lat * 180 / Math.PI];
}

// ---- LINZ tile names (the Topo50 sheet grid the open-data files are named by) -----------------------------------------
const SHEET_W = 24000, SHEET_H = 36000, ORIGIN_LEFT = 988000, ORIGIN_TOP = 6234000, LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function tileName(x, y, scale) {
  const col = Math.floor((x - ORIGIN_LEFT) / SHEET_W), row = Math.floor((ORIGIN_TOP - y) / SHEET_H), r = row + 16;
  const code = LETTERS[Math.floor(r / 24)] + LETTERS[r % 24] + String(col).padStart(2, "0");
  const n = 50000 / scale, tw = SHEET_W / n, th = SHEET_H / n;
  const tc = Math.floor((x - (ORIGIN_LEFT + col * SHEET_W)) / tw) + 1, tr = Math.floor(((ORIGIN_TOP - row * SHEET_H) - y) / th) + 1;
  const d = n >= 100 ? 3 : 2;
  return `${code}_${scale}_${String(tr).padStart(d, "0")}${String(tc).padStart(d, "0")}`;
}

// ---- Small helpers -----------------------------------------------------------------------------------------------------
const median = (a) => { const s = a.filter(Number.isFinite).sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const pct = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : null; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; s += x1 * y2 - x2 * y1; } return s / 2; }
function pointInRing(x, y, r) { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }
function distToRing(x, y, r) { let best = Infinity; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)) : 0; best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))); } return best; }
/** Drops points closer than `tol` metres to the line through their neighbours (survey noise), keeping corners. */
function simplifyRing(r, tol = 0.25) {
  let pts = r.slice(); if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const p = pts[(i - 1 + pts.length) % pts.length], q = pts[i], n = pts[(i + 1) % pts.length];
      const dx = n[0] - p[0], dy = n[1] - p[1], L = Math.hypot(dx, dy) || 1;
      if (Math.abs((q[0] - p[0]) * dy - (q[1] - p[1]) * dx) / L < tol) { pts.splice(i, 1); changed = true; i--; }
    }
  }
  return pts;
}

// ---- LINZ services -------------------------------------------------------------------------------------------------------
async function arcgis(fetchImpl, layer, params) {
  const q = new URLSearchParams({ f: "json", where: "1=1", outFields: "*", returnGeometry: "true", ...params });
  let last;
  for (let attempt = 0; attempt < 3; attempt++) { // LINZ's ArcGIS service now and then refuses a good query; asking again works
    if (attempt) await new Promise((r) => setTimeout(r, 600 * attempt));
    const res = await fetchImpl(`${ARCGIS}/${layer}/FeatureServer/0/query?${q}`);
    if (!res.ok) { last = new Error(`LINZ ${layer} answered ${res.status}`); continue; }
    const d = await res.json();
    if (d.error) { last = new Error(`LINZ ${layer}: ${d.error.message || "error"}`); continue; }
    return d.features || [];
  }
  throw last;
}

const ROAD_TYPES = { st: "street", street: "street", rd: "road", road: "road", ave: "avenue", av: "avenue", avenue: "avenue", dr: "drive", drive: "drive",
  pl: "place", place: "place", cres: "crescent", crescent: "crescent", tce: "terrace", terrace: "terrace", ct: "court", court: "court", hwy: "highway",
  highway: "highway", ln: "lane", lane: "lane", way: "way", cl: "close", close: "close", gr: "grove", grove: "grove", pde: "parade", parade: "parade",
  quay: "quay", sq: "square", square: "square", blvd: "boulevard", boulevard: "boulevard", rise: "rise", view: "view", mews: "mews", loop: "loop", track: "track" };
/**
 * Address suggestions from LINZ's NZ Addresses for what has been typed, e.g. "12 rimu st hamilton". The layer has no
 * text index, so the number and street are matched from the start of the address (fast) and any words after the street
 * type (the suburb or town) narrow it down.
 */
export async function searchAddresses(text, { fetchImpl = fetch, limit = 8 } = {}) {
  const toks = String(text || "").toLowerCase().replace(/['"%_]/g, "").replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (toks.join(" ").length < 4) return [];
  const k = toks.findIndex((w, i) => i > 0 && ROAD_TYPES[w]);
  const head = k >= 0 ? [...toks.slice(0, k), ROAD_TYPES[toks[k]]] : toks, rest = k >= 0 ? toks.slice(k + 1, k + 4) : [];
  const where = [`full_address_ascii LIKE '${head.join(" ")}%'`, ...rest.map((w) => `full_address_ascii LIKE '%${w}%'`), "address_lifecycle = 'Current'"].join(" AND ");
  const feats = await arcgis(fetchImpl, "LINZ_NZ_Addresses", { where, outSR: "2193", resultRecordCount: String(limit), outFields: "full_address" });
  return feats.map((f) => ({ label: f.attributes.full_address, x: f.geometry.x, y: f.geometry.y }));
}

/** The LINZ building outlines near a point (NZTM), each as a ring of NZTM points with its capture source. */
export async function outlinesNear(x, y, { fetchImpl = fetch, radius = 45 } = {}) {
  const feats = await arcgis(fetchImpl, "LINZ_NZ_Building_Outlines", {
    geometry: `${x - radius},${y - radius},${x + radius},${y + radius}`, geometryType: "esriGeometryEnvelope", inSR: "2193", outSR: "2193", spatialRel: "esriSpatialRelIntersects", outFields: "capture_source_name"
  }); // no resultRecordCount: with it LINZ's service takes about 30 seconds to answer
  const out = [];
  for (const f of feats) {
    const rings = (f.geometry?.rings || []).filter((r) => r.length >= 4);
    if (!rings.length) continue;
    const outer = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
    const ring = simplifyRing(outer);
    if (ring.length < 3 || Math.abs(ringArea(ring)) < 8) continue;
    out.push({ ring, captured: f.attributes.capture_source_name || "", source: "LINZ NZ Building Outlines" });
  }
  return out;
}

// ---- LINZ open-data rasters (cloud-optimised GeoTIFFs on AWS) ------------------------------------------------------------
/** Collections of a kind ("rgb", "dsm", "dem") whose area covers the point, newest first, then finest. */
export function collectionsAt(index, kind, lon, lat) {
  return index.collections.filter((c) => c.kind === kind && c.scale && lon >= c.bbox[0] && lon <= c.bbox[2] && lat >= c.bbox[1] && lat <= c.bbox[3])
    .sort((a, b) => (b.end || "").localeCompare(a.end || "") || (a.gsd || 9) - (b.gsd || 9));
}

/**
 * Reads an NZTM window [x0,y0,x1,y1] from a collection at about `res` metres a pixel, mosaicking its tiles. Returns
 * { bands, width, height, res } or null when the collection has no tile there. `GeoTIFF` is the geotiff.js module.
 */
export async function readWindow(GeoTIFF, index, col, win, res, { bandsWanted = 1 } = {}) {
  const bucket = col.kind === "rgb" ? index.imagery : index.elevation;
  const [x0, y0, x1, y1] = win, W = Math.max(1, Math.round((x1 - x0) / res)), H = Math.max(1, Math.round((y1 - y0) / res));
  const out = Array.from({ length: bandsWanted }, () => new Float32Array(W * H).fill(NaN));
  const names = new Set();
  const steps = (a, b) => { const v = []; for (let t = a; t < b; t += 50) v.push(t); v.push(b - 0.01); return v; }; // every tile the window touches, edges included
  for (const x of steps(x0, x1)) for (const y of steps(y0, y1)) names.add(tileName(x, y, col.scale));
  let got = false;
  for (const name of names) {
    const url = `${bucket}/${col.href}/${name}.tiff`;
    // geotiff.js 2.1.3 in a browser sometimes fails a read when a piece of the file ends exactly on one of its 64 KB
    // cache blocks; opening the file again with an odd block size gets past it. A missing tile fails at the first open.
    let tiff, img, use, rasters, ox, oy, ores, px0, py0, px1, py1, missing = false;
    for (const blockSize of [65536, 65537, 131101]) {
      try {
        tiff = await GeoTIFF.fromUrl(url, { allowFullFile: false, blockSize });
        img = await tiff.getImage();
      } catch { missing = true; break; }
      try {
        const count = await tiff.getImageCount();
        const [rx] = img.getResolution();
        use = img;
        for (let i = 1; i < count; i++) { const o = await tiff.getImage(i); const ratio = img.getWidth() / o.getWidth(); if (Math.abs(rx) * ratio <= res * 1.01) use = o; else break; }
        ores = Math.abs(rx) * (img.getWidth() / use.getWidth()); [ox, oy] = img.getOrigin();
        px0 = Math.max(0, Math.floor((x0 - ox) / ores)); py0 = Math.max(0, Math.floor((oy - y1) / ores));
        px1 = Math.min(use.getWidth(), Math.ceil((x1 - ox) / ores)); py1 = Math.min(use.getHeight(), Math.ceil((oy - y0) / ores));
        if (px1 <= px0 || py1 <= py0) { missing = true; break; }
        rasters = await use.readRasters({ window: [px0, py0, px1, py1], samples: [...Array(Math.min(bandsWanted, use.getSamplesPerPixel())).keys()] });
        break;
      } catch { rasters = null; }
    }
    if (missing || !rasters) continue;
    const rw = px1 - px0, rh = py1 - py0, nodata = Number(img.getGDALNoData?.() ?? NaN);
    for (let j = 0; j < H; j++) {
      const wy = y1 - (j + 0.5) * res, sy = Math.floor((oy - wy) / ores) - py0;
      if (sy < 0 || sy >= rh) continue;
      for (let i = 0; i < W; i++) {
        const wx = x0 + (i + 0.5) * res, sx = Math.floor((wx - ox) / ores) - px0;
        if (sx < 0 || sx >= rw) continue;
        for (let b = 0; b < rasters.length; b++) { const v = rasters[b][sy * rw + sx]; if (v !== nodata && v > -1000) { out[b][j * W + i] = v; got = true; } }
      }
    }
  }
  return got ? { bands: out, width: W, height: H, res } : null;
}

/** The first collection of a kind that actually has data for the window. */
/** Share of the window with real data: not missing, and for photos not black (a survey's empty area reads as black). */
function coverage(r, kind) {
  const n = r.width * r.height; let ok = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(r.bands[0][i])) continue;
    if (kind === "rgb" && r.bands[0][i] + (r.bands[1]?.[i] || 0) + (r.bands[2]?.[i] || 0) < 3) continue;
    ok++;
  }
  return ok / n;
}

/** The newest collection of a kind with data for (almost) the whole window, else the one covering most of it. */
async function readFirst(GeoTIFF, index, kind, lon, lat, win, res, opts) {
  let best = null;
  for (const col of collectionsAt(index, kind, lon, lat).slice(0, 8)) {
    let r = null;
    try { r = await readWindow(GeoTIFF, index, col, win, res, opts); } catch { r = null; }
    if (!r) continue;
    const c = coverage(r, kind);
    if (c >= 0.9) return { ...r, col };
    if (!best || c > best.c) best = { ...r, col, c };
  }
  return best && best.c >= 0.3 ? best : null;
}

// ---- The measuring ---------------------------------------------------------------------------------------------------------
function sampler(grid, win) {
  const [x0, , , y1] = win;
  return (x, y) => {
    if (!grid) return NaN;
    const i = Math.floor((x - x0) / grid.res), j = Math.floor((y1 - y) / grid.res);
    return i >= 0 && j >= 0 && i < grid.width && j < grid.height ? grid.bands[0][j * grid.width + i] : NaN;
  };
}

/**
 * Per-wall heights and the building's roof figures, from the outline and the DSM/DEM grids (1 m). A wall's height is
 * the roof at its edge, minus the ground at the wall: from the wall it looks inward for where the roof starts, reads the
 * scan 1 and 2 m further in (a 1 m cell right at the edge mixes roof and ground) and carries the roof's slope back out.
 */
export function measureBuilding(ring, dsm, dem, win) {
  const S = sampler(dsm, win), G = sampler(dem, win);
  const ccw = ringArea(ring) > 0;
  const walls = [];
  const groundAll = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 0.05) continue;
    const ux = dx / L, uy = dy / L, nx = ccw ? -uy : uy, ny = ccw ? ux : -ux; // inward normal
    const eave = [], ground = [];
    const n = Math.max(3, Math.floor(L / 0.5));
    for (let k = 0; k < n; k++) {
      const t = L * (0.15 + 0.7 * (n === 1 ? 0.5 : k / (n - 1)));
      const px = ax + ux * t, py = ay + uy * t;
      const g = G(px - nx * 0.5, py - ny * 0.5);
      if (!Number.isFinite(g)) continue;
      ground.push(g);
      // where the roof starts: the outline and the scan can be a few metres apart (an older trace, an eave overhang)
      let d = 0.5;
      while (d <= 4.5 && !(S(px + nx * d, py + ny * d) - g >= 1.5)) d += 1;
      if (d > 4.5) continue;
      const z1 = S(px + nx * (d + 1), py + ny * (d + 1)), z2 = S(px + nx * (d + 2), py + ny * (d + 2));
      if (!Number.isFinite(z1)) continue;
      const rise = Number.isFinite(z2) ? Math.max(0, Math.min(1.2, z2 - z1)) : 0; // roof rising inward, at most about 50°
      eave.push(z1 - rise - g);
    }
    const h = median(eave);
    groundAll.push(...ground);
    walls.push({ a: [ax, ay], b: [bx, by], length_m: r2(L), height_m: h != null ? r2(Math.max(0, h)) : null });
  }
  // inside cells: ridge and pitch
  const [x0, , , y1] = win, inside = [], slopes = [];
  if (dsm) {
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    for (let y = Math.min(...ys) + 0.5; y < Math.max(...ys); y += 1) for (let x = Math.min(...xs) + 0.5; x < Math.max(...xs); x += 1) {
      if (!pointInRing(x, y, ring)) continue;
      const z = S(x, y); if (!Number.isFinite(z)) continue;
      inside.push(z);
      if (distToRing(x, y, ring) < 1.5) continue;
      const zx = (S(x + 1, y) - S(x - 1, y)) / 2, zy = (S(x, y + 1) - S(x, y - 1)) / 2;
      if (Number.isFinite(zx) && Number.isFinite(zy)) slopes.push(Math.atan(Math.hypot(zx, zy)) * 180 / Math.PI);
    }
  }
  const ground = median(groundAll);
  const ridge = inside.length && ground != null ? Math.max(0, pct(inside, 0.96) - ground) : null;
  // pitch: the most common slope among the sloping cells (a 9° window), since cells across a ridge, hip or valley read
  // lower than the roof planes either side of them
  const pitched = slopes.filter((s) => s >= 4 && s <= 60);
  let pitch = slopes.length ? 0 : null;
  if (slopes.length && pitched.length / slopes.length > 0.4) {
    let best = [];
    for (let lo = 4; lo <= 51; lo += 1) { const w = pitched.filter((s) => s >= lo && s < lo + 9); if (w.length > best.length) best = w; }
    pitch = median(best);
  }
  // gutter: the length-weighted median of the wall heights, so a long wall counts for more than a short return
  const hw = walls.filter((w) => Number.isFinite(w.height_m)).flatMap((w) => Array(Math.max(1, Math.round(w.length_m))).fill(w.height_m));
  const gutter = hw.length ? median(hw) : null;
  const plan = Math.abs(ringArea(ring)), perim = walls.reduce((s, w) => s + w.length_m, 0);
  return {
    walls, plan_m2: plan, perimeter_m: perim, gutter_m: gutter, ridge_m: ridge, pitch_deg: pitch,
    pitched_m2: pitch != null ? plan / Math.cos(pitch * Math.PI / 180) : null,
    storeys: gutter != null ? Math.max(1, Math.round((gutter - 0.4) / 2.7)) : null
  };
}

/** Ground slope (degrees) in a band 1 to 5 m around the buildings, from the DEM. */
function groundSlope(rings, dem, win) {
  if (!dem) return null;
  const G = sampler(dem, win), out = [];
  const all = rings.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  for (let y = Math.min(...ys) - 5; y < Math.max(...ys) + 5; y += 1) for (let x = Math.min(...xs) - 5; x < Math.max(...xs) + 5; x += 1) {
    if (rings.some((r) => pointInRing(x, y, r))) continue;
    const d = Math.min(...rings.map((r) => distToRing(x, y, r))); if (d < 1 || d > 5) continue;
    const zx = (G(x + 1, y) - G(x - 1, y)) / 2, zy = (G(x, y + 1) - G(x, y - 1)) / 2;
    if (Number.isFinite(zx) && Number.isFinite(zy)) out.push(Math.atan(Math.hypot(zx, zy)) * 180 / Math.PI);
  }
  return median(out);
}

/** The property (LINZ primary parcel) the address point sits in, as a ring of NZTM points, or null. */
export async function parcelAt(x, y, { fetchImpl = fetch } = {}) {
  try {
    const feats = await arcgis(fetchImpl, "LINZ_NZ_Primary_Parcels", { geometry: `${x},${y}`, geometryType: "esriGeometryPoint", inSR: "2193", outSR: "2193", spatialRel: "esriSpatialRelIntersects", outFields: "appellation" });
    const rings = feats.flatMap((f) => f.geometry?.rings || []).filter((r) => r.length >= 4);
    return rings.length ? rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a)) : null;
  } catch { return null; }
}
const centroid = (r) => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];

const dateOf = (s) => { const d = new Date(s); return Number.isNaN(d) ? s : d.toLocaleDateString("en-NZ", { month: "short", year: "numeric" }); };

/**
 * Measures the buildings at an address point (NZTM). Returns a site the quote page can show: the photo (when `makeImage`
 * is given, a function (rgbGrid) => {url, w, h}), every wall in photo pixels with its length and height, the figures,
 * and where each came from. Throws an Error with a plain message when LINZ has no outline there.
 */
export async function measureAt(x, y, { GeoTIFF, index, fetchImpl = fetch, makeImage, label = "", onStep = () => {} } = {}) {
  onStep("Finding the building outline");
  const outlines = await outlinesNear(x, y, { fetchImpl });
  if (!outlines.length) throw new Error("LINZ has no building outline at this address. It may be a new building; type the measurements instead.");
  const dist = (o) => (pointInRing(x, y, o.ring) ? 0 : distToRing(x, y, o.ring));
  outlines.sort((a, b) => dist(a) - dist(b));
  // only buildings on this property: the one at the address, plus a garage or shed on the same section
  const parcel = await parcelAt(x, y, { fetchImpl });
  const onSite = (o) => parcel && pointInRing(...centroid(o.ring), parcel);
  const main = outlines.find((o) => dist(o) === 0) || outlines.find(onSite) || outlines[0];
  const nearby = parcel ? outlines.filter((o) => o !== main && onSite(o) && Math.abs(ringArea(o.ring)) >= 10).slice(0, 4) : [];
  const chosen = [main, ...nearby];
  const xs = chosen.flatMap((o) => o.ring.map((p) => p[0])), ys = chosen.flatMap((o) => o.ring.map((p) => p[1]));
  const m = 12, win = [Math.floor(Math.min(...xs) - m), Math.floor(Math.min(...ys) - m), Math.ceil(Math.max(...xs) + m), Math.ceil(Math.max(...ys) + m)];
  const [lon, lat] = toLonLat((win[0] + win[2]) / 2, (win[1] + win[3]) / 2);
  onStep("Reading the laser scan");
  const [dsm, dem] = await Promise.all([readFirst(GeoTIFF, index, "dsm", lon, lat, win, 1), readFirst(GeoTIFF, index, "dem", lon, lat, win, 1)]);
  let photo = null;
  if (makeImage) {
    onStep("Reading the aerial photo");
    const span = Math.max(win[2] - win[0], win[3] - win[1]);
    const res = Math.max(0.075, span / 1600);
    const rgb = await readFirst(GeoTIFF, index, "rgb", lon, lat, win, res, { bandsWanted: 3 });
    if (rgb) {
      photo = { ...makeImage(rgb), res: rgb.res, col: rgb.col };
    }
  }
  onStep("Measuring the walls");
  const res = photo ? photo.res : 0.1;
  const toPx = ([px, py]) => [r1((px - win[0]) / res), r1((win[3] - py) / res)];
  const names = ["Main building", ...nearby.map((_, i) => `Building ${i + 2}`)];
  const walls = [], perBuilding = [];
  const measured = chosen.map((o) => measureBuilding(o.ring, dsm, dem, win));
  measured.forEach((b, k) => {
    for (const w of b.walls) walls.push({ a: toPx(w.a), b: toPx(w.b), length_m: w.length_m, height_m: w.height_m, building: names[k], main: k === 0 });
    perBuilding.push([names[k], `${Math.round(b.plan_m2).toLocaleString("en-NZ")} m² · ${b.walls.length} walls${b.gutter_m != null ? ` · gutter ${r1(b.gutter_m)} m` : ""}${b.ridge_m != null ? ` · ridge ${r1(b.ridge_m)} m` : ""}`]);
  });
  const mb = measured[0];
  const slope = groundSlope(chosen.map((o) => o.ring), dem, win);
  const f = (v, u, d = 1) => (v == null ? "no laser scan" : `${(Math.round(v * 10 ** d) / 10 ** d).toLocaleString("en-NZ")}${u}`);
  return {
    id: `live-${Math.round(x)}-${Math.round(y)}`,
    name: label || "Measured address",
    live: true,
    image: photo ? { file: photo.url, w: photo.w, h: photo.h, m_per_px: res } : { file: "", w: Math.round((win[2] - win[0]) / res), h: Math.round((win[3] - win[1]) / res), m_per_px: res },
    walls,
    summary_display: [
      ["Roof, plan", f(mb.plan_m2, " m²", 0)], ["Outline", f(mb.perimeter_m, " m")],
      ["Gutter height", f(mb.gutter_m, " m")], ["Ridge height", f(mb.ridge_m, " m")],
      ["Roof pitch", mb.pitch_deg == null ? "no laser scan" : mb.pitch_deg === 0 ? "flat" : f(mb.pitch_deg, "°", 0)], ["Roof, pitched", f(mb.pitched_m2, " m²", 0)],
      ["Storeys (estimate)", mb.storeys == null ? "no laser scan" : String(mb.storeys)], ["Ground slope", f(slope, "°")]
    ],
    per_building: perBuilding,
    sources: {
      outline: `LINZ NZ Building Outlines${main.captured ? `, traced from ${main.captured}` : ""}`,
      lidar: dsm ? dsm.col.title : "no LINZ laser scan for this address",
      lidar_flown: dsm ? [dateOf(dsm.col.start), dateOf(dsm.col.end)] : null,
      photos: photo ? photo.col.title : "no LINZ aerial photo found"
    },
    note: `Measured live from LINZ open data. The main building is marked as scaffold; ${nearby.length ? "other buildings on the same property (a garage, a shed) are shown dashed as Nothing; tap their walls to include them. " : ""}The outline follows the walls as LINZ traced them${main.captured ? ` (${main.captured})` : ""}, so check it and adjust it if the building has changed.${photo ? " Aerial photos make roofs lean, so if the outline sits a metre or two off the roof, use Move outline to slide it on; the lengths don't change." : ""}${dsm ? "" : " There's no laser scan here, so type the heights."}`
  };
}

