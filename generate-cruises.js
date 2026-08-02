import fs from "fs";
import * as yaml from "js-yaml";
import { seaRoute } from "searoute-ts";

// 1. Read your Jekyll cruises data
const fileContents = fs.readFileSync("./_data/cruises.yml", "utf8");
const cruises = yaml.load(fileContents);

const features = [];

cruises.forEach((cruise) => {
  if (!cruise.route || cruise.route.length === 0) return;

  const vessel = cruise.vessel || "";
  const operator = cruise.operator || "";

  // 2. Generate the Port Points
  cruise.route.forEach((stop) => {
    // Replicate your dynamic flagId logic
    const flagId =
      stop.country === "US" && stop.state
        ? `us-${stop.state.toLowerCase()}`
        : stop.country.toLowerCase();

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: stop.coordinates,
      },
      properties: {
        port: stop.port,
        state: stop.state || "",
        country: stop.country || "",
        date: stop.date,
        vessel: vessel,
        flagId: flagId,
      },
    });
  });

  // 3. Generate the Water-Routed Segments
  for (let i = 0; i < cruise.route.length - 1; i++) {
    const start = cruise.route[i];
    const end = cruise.route[i + 1];

    let routedFeature;

    try {
      // Try to calculate the shortest deep-water path
      routedFeature = seaRoute(start.coordinates, end.coordinates);

      // Stitch the exact port coordinates to the start and end of the water route
      routedFeature.geometry.coordinates.unshift(start.coordinates);
      routedFeature.geometry.coordinates.push(end.coordinates);
    } catch (e) {
      // If the library can't find a path (e.g., port is too far inland), fall back to a straight line
      console.warn(
        `⚠️ Warning: No sea route found between ${start.port} and ${end.port}. Falling back to straight line.`,
      );
      routedFeature = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [start.coordinates, end.coordinates],
        },
      };
    }

    // Attach the custom properties your Mapbox popups expect
    routedFeature.properties = {
      vessel: vessel,
      operator: operator,
      date: end.date, // Arrival date at destination determines past/future
      origin_port: start.port,
      destination_port: end.port,
    };

    features.push(routedFeature);
  }
});

// 4. Package as a FeatureCollection and save
const geojson = {
  type: "FeatureCollection",
  features: features,
};

fs.writeFileSync("./cruises.geojson", JSON.stringify(geojson, null, 2));
console.log("🌊 Successfully generated cruises.geojson via searoute-ts!");
