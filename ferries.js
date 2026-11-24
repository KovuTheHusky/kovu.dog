import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import * as yaml from "js-yaml";
import osmtogeojson from "osmtogeojson";

const CACHE_DIR = ".cache/ferries";
const FORCE_REFRESH = process.argv.includes("--refresh");

const OVERPASS_MIRRORS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeSingle = (str) => String(str || "").replace(/'/g, "\\'");

function hashConfig(obj) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(obj))
    .digest("hex")
    .slice(0, 12);
}

async function fetchOverpass(query) {
  for (let i = 0; i < OVERPASS_MIRRORS.length; i++) {
    const url = OVERPASS_MIRRORS[0];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "KovuFerryBuilder/1.0 (kovu.dog)",
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
    OVERPASS_MIRRORS.push(OVERPASS_MIRRORS.shift());
    await sleep(1500);
  }
  throw new Error("All Overpass mirrors failed");
}

async function resolveRoute(route) {
  const status = route.status || "completed";
  const cacheKey = `${route.id}-${hashConfig({
    source: route.source,
    operator: route.operator,
    route: route.route,
    status,
  })}.geojson`;
  const cachePath = path.join(CACHE_DIR, cacheKey);

  if (!FORCE_REFRESH && fs.existsSync(cachePath)) {
    console.log(`   ⚡ Cache hit: ${route.id}`);
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  }

  let query;
  if (route.source.type === "osm_way") {
    const ids = route.source.way_ids ?? [route.source.way_id];
    query = `
      [out:json][timeout:60];
      way(id:${ids.join(",")});
      out geom;
    `;
  } else if (route.source.type === "osm_relation") {
    const ids = route.source.relation_ids ?? [route.source.relation_id];
    query = `
      [out:json][timeout:60];
      relation(id:${ids.join(",")});
      (._; rel(r););
      way(r);
      out geom;
    `;
  } else if (route.source.type === "overpass_query") {
    query = route.source.query;
  } else {
    throw new Error(`Unsupported source type: ${route.source.type}`);
  }

  const osm = await fetchOverpass(query);
  const rawGeojson = osmtogeojson(osm);
  await sleep(1500);

  rawGeojson.features = rawGeojson.features.filter(
    (f) =>
      f.geometry &&
      (f.geometry.type === "LineString" ||
        f.geometry.type === "MultiLineString"),
  );
  if (rawGeojson.features.length === 0) {
    throw new Error("Source returned 0 line features");
  }

  const tmpIn = path.join(CACHE_DIR, "_tmp_in.geojson");
  const tmpOut = path.join(CACHE_DIR, "_tmp_out.geojson");
  fs.writeFileSync(tmpIn, JSON.stringify(rawGeojson));

  const clipFlag = route.source.clip_bbox
    ? `-clip bbox=${route.source.clip_bbox.join(",")}`
    : "";
  const simplifyFlag = route.source.simplify
    ? `-simplify ${route.source.simplify}`
    : "";

  execSync(
    `npx mapshaper "${tmpIn}" ${clipFlag} -dissolve ${simplifyFlag} ` +
      `-each "id='${escapeSingle(route.id)}', operator='${escapeSingle(route.operator)}', route='${escapeSingle(route.route)}', status='${status}'" ` +
      `-filter-fields id,operator,route,status -o format=geojson "${tmpOut}"`,
    { stdio: "pipe" },
  );

  const result = JSON.parse(fs.readFileSync(tmpOut, "utf-8"));
  fs.writeFileSync(cachePath, JSON.stringify(result));
  return result;
}

async function build() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const config = yaml.load(fs.readFileSync("_data/ferries.yml", "utf-8"));
  const terminals = config.terminals || [];
  const routes = config.routes || [];

  // Mark a terminal as "future" only if every route touching it is future
  const terminalStatuses = new Map();
  for (const r of routes) {
    const status = r.status || "completed";
    for (const code of [r.from, r.to]) {
      if (!code) continue;
      if (!terminalStatuses.has(code) || status === "completed") {
        terminalStatuses.set(code, status);
      }
    }
  }

  const terminalFeatures = terminals.map((t) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: t.coordinates },
    properties: {
      code: t.code,
      name: t.name,
      flagId: t.flagId,
      status: terminalStatuses.get(t.code) || "completed",
    },
  }));

  const routeFeatures = [];
  for (const route of routes) {
    console.log(`⛴️  Processing ${route.id}...`);
    try {
      const fc = await resolveRoute(route);
      routeFeatures.push(...fc.features);
    } catch (err) {
      console.error(`❌ Failed ${route.id}: ${err.message}`);
    }
  }

  fs.writeFileSync(
    "ferries.geojson",
    JSON.stringify(
      {
        type: "FeatureCollection",
        features: [...terminalFeatures, ...routeFeatures],
      },
      null,
      2,
    ),
  );
  console.log(
    `✅ Wrote ${terminalFeatures.length} terminals and ${routeFeatures.length} routes to ferries.geojson.`,
  );
}

build();
