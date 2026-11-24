import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import * as yaml from "js-yaml";
import osmtogeojson from "osmtogeojson";

const REFRESH = process.argv.includes("--refresh");
const CACHE_DIR = ".cache/rail";
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

fs.mkdirSync(CACHE_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hashConfig = (obj) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(obj))
    .digest("hex")
    .slice(0, 12);

async function fetchOverpass(query) {
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "KovuRailBuilder/2.0 (kovu.dog)",
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) return await res.json();
      console.warn(
        `   ⚠️ ${new URL(url).host} returned ${res.status}, trying next mirror...`,
      );
    } catch (err) {
      console.warn(`   ⚠️ ${new URL(url).host} failed: ${err.message}`);
    }
    await sleep(1500);
  }
  throw new Error("All Overpass mirrors failed");
}

function getMapshaperBbox(fromCoords, toCoords, pad = 0.08) {
  const [lon1, lat1] = fromCoords;
  const [lon2, lat2] = toCoords;
  return [
    Math.min(lon1, lon2) - pad, // west (xmin)
    Math.min(lat1, lat2) - pad, // south (ymin)
    Math.max(lon1, lon2) + pad, // east (xmax)
    Math.max(lat1, lat2) + pad, // north (ymax)
  ].join(",");
}

async function resolveRoute(route, stationMap) {
  const from = stationMap.get(route.from);
  const to = stationMap.get(route.to);
  const cacheKey = `${route.id}-${hashConfig({
    from,
    to,
    source: route.source,
    operator: route.operator,
    route: route.route,
    status: route.status || "completed",
    tier: route.tier || "intercity",
  })}.geojson`;
  const cachePath = path.join(CACHE_DIR, cacheKey);

  if (!REFRESH && fs.existsSync(cachePath)) {
    console.log(`   ⚡ Cache hit: ${route.id}`);
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  }

  let rawGeojson;

  if (route.source.type === "osm_relation") {
    const ids = route.source.relation_ids ?? [route.source.relation_id];
    const query = `
      [out:json][timeout:60];
      relation(id:${ids.join(",")});
      (._; rel(r););
      way(r);
      out geom;
    `;
    const osm = await fetchOverpass(query);
    rawGeojson = osmtogeojson(osm);
    await sleep(2000);
  } else if (
    route.source.type === "routing_api" &&
    route.source.provider === "geops"
  ) {
    const apiKey = process.env.GEOPS_API_KEY;
    if (!apiKey) throw new Error("Missing GEOPS_API_KEY env var");

    const via = `@${from.coordinates[1]},${from.coordinates[0]}|@${to.coordinates[1]},${to.coordinates[0]}`;
    const graph = route.source.graph || "gen1";
    const url = `https://api.geops.io/routing/v1/?via=${encodeURIComponent(via)}&mot=rail&graph=${graph}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`geOps returned HTTP ${res.status}`);
    rawGeojson = await res.json();
  } else if (route.source.type === "overpass_query") {
    const osm = await fetchOverpass(route.source.query);
    rawGeojson = osmtogeojson(osm);
    await sleep(2000);
  }

  // Strip non-line features so Mapshaper stays on a single layer
  rawGeojson.features = rawGeojson.features.filter(
    (f) =>
      f.geometry &&
      (f.geometry.type === "LineString" ||
        f.geometry.type === "MultiLineString"),
  );

  const tmpIn = path.join(CACHE_DIR, "_tmp_in.geojson");
  const tmpOut = path.join(CACHE_DIR, "_tmp_out.geojson");
  fs.writeFileSync(tmpIn, JSON.stringify(rawGeojson));

  const pad = route.source.clip_padding ?? 0.08;
  let clipFlag = "";
  if (route.source.clip_bbox) {
    clipFlag = `-clip bbox=${route.source.clip_bbox.join(",")}`;
  } else if (route.source.clip_to_endpoints) {
    const pad = route.source.clip_padding ?? 0.08;
    clipFlag = `-clip bbox=${getMapshaperBbox(from.coordinates, to.coordinates, pad)}`;
  }

  const simplifyFlag = route.source.simplify
    ? `-simplify ${route.source.simplify}`
    : "";
  const status = route.status || "completed";
  const tier = route.tier || "intercity";

  execSync(
    `npx mapshaper "${tmpIn}" ${clipFlag} -dissolve ${simplifyFlag} ` +
      `-each "id='${route.id}', operator='${route.operator}', route='${route.route}', status='${status}', tier='${tier}'" ` +
      `-filter-fields id,operator,route,status,tier -o format=geojson "${tmpOut}"`,
    { stdio: "pipe" },
  );

  const clean = JSON.parse(fs.readFileSync(tmpOut, "utf-8"));
  fs.writeFileSync(cachePath, JSON.stringify(clean));
  fs.unlinkSync(tmpIn);
  fs.unlinkSync(tmpOut);
  return clean;
}

async function build() {
  const config = yaml.load(fs.readFileSync("_data/rail.yml", "utf-8"));
  const stationMap = new Map(config.stations.map((s) => [s.code, s]));

  // 1. Write stations.geojson
  const stationFeatures = config.stations.map((s) => ({
    type: "Feature",
    properties: {
      name: s.name,
      code: s.code,
      flagId: s.flagId,
      status: s.status || "completed",
    },
    geometry: { type: "Point", coordinates: s.coordinates },
  }));
  fs.writeFileSync(
    "stations.geojson",
    JSON.stringify(
      { type: "FeatureCollection", features: stationFeatures },
      null,
      2,
    ),
  );
  console.log(`📍 Wrote ${stationFeatures.length} stations.`);

  // 2. Resolve & merge routes
  const allRouteFeatures = [];
  for (const route of config.routes) {
    console.log(`🚂 Processing ${route.id}...`);
    try {
      const fc = await resolveRoute(route, stationMap);
      allRouteFeatures.push(...fc.features);
    } catch (err) {
      console.error(`❌ Failed ${route.id}: ${err.message}`);
    }
  }

  fs.writeFileSync(
    "rail.geojson",
    JSON.stringify(
      { type: "FeatureCollection", features: allRouteFeatures },
      null,
      2,
    ),
  );
  console.log(`✅ Wrote ${allRouteFeatures.length} routes to rail.geojson.`);
}

build();
