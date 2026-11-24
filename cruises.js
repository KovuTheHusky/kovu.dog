import fs from "fs";
import * as yaml from "js-yaml";
import { seaRoute } from "searoute-ts";
import { DEFAULT_MARNET } from "searoute-ts/marnet-20km";

const roundCoords = ([lon, lat]) => [
  Math.round(lon * 1e5) / 1e5,
  Math.round(lat * 1e5) / 1e5,
];

// Keep consecutive points continuous across the antimeridian for Mapbox
function unwrapAntimeridian(coords) {
  if (coords.length === 0) return coords;
  const out = [coords[0].slice()];
  for (let i = 1; i < coords.length; i++) {
    let [lon, lat] = coords[i];
    const prevLon = out[i - 1][0];
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    out.push([lon, lat]);
  }
  return out;
}

function routeHop(startCoords, endCoords, label) {
  try {
    const routed = seaRoute(startCoords, endCoords, {
      network: DEFAULT_MARNET,
    });
    const coords = routed.geometry.coordinates.map(roundCoords);

    // Anchor both ends directly to your port pins so lines never stop offshore
    const start = roundCoords(startCoords);
    const end = roundCoords(endCoords);
    if (coords[0][0] !== start[0] || coords[0][1] !== start[1])
      coords.unshift(start);
    const last = coords[coords.length - 1];
    if (last[0] !== end[0] || last[1] !== end[1]) coords.push(end);

    return {
      coords,
      lengthNm: Math.round(routed.properties.length),
    };
  } catch (err) {
    // Expected on short hops (< ~20 km) where both ports snap to the same MARNET vertex
    console.warn(`   ⚠️ Direct fallback for ${label} (${err.message})`);
    return {
      coords: [roundCoords(startCoords), roundCoords(endCoords)],
      lengthNm: null,
    };
  }
}

function routeLeg(start, end) {
  // Optional: add `waypoints: [[lon, lat], ...]` on a destination stop in cruises.yml
  // to steer narrow fjords (e.g., Skagway or Hubbard Glacier) if needed
  const points = [start.coordinates, ...(end.waypoints || []), end.coordinates];

  let combinedCoords = [];
  let totalNm = 0;
  let hasDistance = true;

  for (let i = 0; i < points.length - 1; i++) {
    const hop = routeHop(
      points[i],
      points[i + 1],
      `${start.port} → ${end.port}`,
    );
    if (hop.lengthNm === null) hasDistance = false;
    else totalNm += hop.lengthNm;

    // Avoid duplicating the shared waypoint coordinate between hops
    combinedCoords.push(...(i === 0 ? hop.coords : hop.coords.slice(1)));
  }

  return {
    coords: unwrapAntimeridian(combinedCoords),
    lengthNm: hasDistance ? totalNm : null,
  };
}

function build() {
  const cruises =
    yaml.load(fs.readFileSync("_data/cruises.yml", "utf-8")) || [];
  const features = [];
  let portCount = 0;
  let legCount = 0;

  for (const cruise of cruises) {
    if (!cruise.route || cruise.route.length === 0) continue;
    console.log(`🚢 Routing ${cruise.vessel} (${cruise.departure_date})...`);

    // 1. Port points
    for (const stop of cruise.route) {
      const country = (stop.country || "").toUpperCase();
      const state = (stop.state || "").toLowerCase();
      const flagId =
        country === "US" && state ? `us-${state}` : country.toLowerCase();

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: stop.coordinates },
        properties: {
          port: stop.port,
          state: stop.state || "",
          country: stop.country || "",
          date: stop.date,
          vessel: cruise.vessel,
          flagId,
        },
      });
      portCount++;
    }

    // 2. Sea-routed voyage legs
    for (let i = 0; i < cruise.route.length - 1; i++) {
      const start = cruise.route[i];
      const end = cruise.route[i + 1];
      const { coords, lengthNm } = routeLeg(start, end);

      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: coords,
        },
        properties: {
          vessel: cruise.vessel,
          operator: cruise.operator,
          date: end.date,
          origin_port: start.port,
          destination_port: end.port,
          length_nm: lengthNm,
        },
      });
      legCount++;
    }
  }

  fs.writeFileSync(
    "cruises.geojson",
    JSON.stringify({ type: "FeatureCollection", features }, null, 2),
  );
  console.log(
    `✅ Wrote ${portCount} port visits and ${legCount} sea-routed legs to cruises.geojson.`,
  );
}

build();
