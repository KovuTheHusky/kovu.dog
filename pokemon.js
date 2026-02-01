import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import unzipper from "unzipper";
import Spritesmith from "spritesmith";
import { glob } from "glob";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const REPO_URL =
  "https://github.com/PokeAPI/sprites/archive/refs/heads/master.zip";
const GO_LIST_URL = "https://pogoapi.net/api/v1/released_pokemon.json";
const DIR_REGULAR = "sprites-master/sprites/pokemon/";

const TEMP_RAW = path.join(__dirname, "temp_raw");
const TEMP_PROCESSED = path.join(__dirname, "temp_processed");
const OUTPUT_DIR = __dirname;
const DATA_FILE = path.join(__dirname, "_data", "pokemon.json");

// UPDATED: Native grid size
const TARGET_SIZE = 64;

async function downloadRepo() {
  if (fs.existsSync("repo.zip")) {
    console.log("⚡️ repo.zip found, skipping download.");
    return;
  }
  console.log("⬇️  Downloading PokeAPI...");
  const writer = fs.createWriteStream("repo.zip");
  const response = await axios({
    url: REPO_URL,
    method: "GET",
    responseType: "stream",
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

async function getReleasedIds() {
  console.log("📡 Fetching Pokemon GO release list...");
  try {
    const { data } = await axios.get(GO_LIST_URL);
    const ids = Object.keys(data).map((id) => parseInt(id));
    return new Set(ids);
  } catch (e) {
    return null;
  }
}

async function extractRawImages(targetDirInZip) {
  if (fs.existsSync(TEMP_RAW))
    fs.rmSync(TEMP_RAW, { recursive: true, force: true });
  fs.mkdirSync(TEMP_RAW, { recursive: true });

  console.log(`📦 Extracting raw images...`);
  return new Promise((resolve, reject) => {
    fs.createReadStream("repo.zip")
      .pipe(unzipper.Parse())
      .on("entry", function (entry) {
        if (
          entry.path.startsWith(targetDirInZip) &&
          entry.path.endsWith(".png")
        ) {
          const baseName = path.basename(entry.path);
          if (/^\d+\.png$/.test(baseName)) {
            entry.pipe(fs.createWriteStream(path.join(TEMP_RAW, baseName)));
          } else {
            entry.autodrain();
          }
        } else {
          entry.autodrain();
        }
      })
      .on("close", resolve)
      .on("error", reject);
  });
}

async function normalizeImages() {
  console.log(`✨ Normalizing images (Trim & Fit to ${TARGET_SIZE}px)...`);
  if (fs.existsSync(TEMP_PROCESSED))
    fs.rmSync(TEMP_PROCESSED, { recursive: true, force: true });
  fs.mkdirSync(TEMP_PROCESSED, { recursive: true });

  const files = glob.sync(`${TEMP_RAW}/*.png`);

  for (const file of files) {
    const name = path.basename(file);
    try {
      const image = sharp(file);
      await image
        .trim()
        .resize({
          width: TARGET_SIZE,
          height: TARGET_SIZE,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          kernel: sharp.kernel.nearest,
        })
        .toFile(path.join(TEMP_PROCESSED, name));
    } catch (err) {
      console.error(`Error processing ${name}:`, err);
    }
  }
}

async function generateSheet() {
  console.log(`🎨 Generating Sprite Sheet...`);
  const sprites = glob.sync(`${TEMP_PROCESSED}/*.png`);

  return new Promise((resolve, reject) => {
    Spritesmith.run({ src: sprites, padding: 1 }, function (err, result) {
      if (err) return reject(err);

      fs.writeFileSync(path.join(OUTPUT_DIR, `pokemon.png`), result.image);

      // CSS now sets explicit 64px dimensions
      let css = `.pokemon-icon { display: inline-block; background-image: url('/pokemon.png'); background-repeat: no-repeat; }\n`;
      const foundIds = [];

      Object.keys(result.coordinates).forEach((filePath) => {
        const id = parseInt(path.basename(filePath, ".png"));
        foundIds.push(id);
        const { x, y, width, height } = result.coordinates[filePath];
        css += `.pokemon-${id} { background-position: -${x}px -${y}px; width: ${width}px; height: ${height}px; }\n`;
      });

      fs.writeFileSync(path.join(OUTPUT_DIR, `pokemon.css`), css);
      resolve(foundIds);
    });
  });
}

async function updateJson(foundIds, releasedGoIds) {
  console.log(`💾 Updating ${DATA_FILE}...`);

  let nameMap = {};
  try {
    const { data } = await axios.get(
      "https://pokeapi.co/api/v2/pokemon?limit=2000",
    );
    data.results.forEach(
      (p) => (nameMap[p.url.split("/").filter(Boolean).pop()] = p.name),
    );
  } catch (e) {}

  let existingData = [];
  if (fs.existsSync(DATA_FILE))
    existingData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const entryMap = new Map(existingData.map((entry) => [entry.id, entry]));

  let uniqueIds = [...new Set(foundIds)].sort((a, b) => a - b);

  if (releasedGoIds) {
    uniqueIds = uniqueIds.filter((id) => releasedGoIds.has(id));
  }

  const finalJson = uniqueIds.map((id) => {
    const existing = entryMap.get(id);
    let officialName = nameMap[id]
      ? nameMap[id].charAt(0).toUpperCase() + nameMap[id].slice(1)
      : `Pokemon ${id}`;

    if (id === 29) officialName = "Nidoran♀";
    if (id === 32) officialName = "Nidoran♂";
    if (id === 122) officialName = "Mr. Mime";

    return {
      id: id,
      name: officialName,
      caught: existing ? existing.caught : false,
    };
  });

  fs.writeFileSync(DATA_FILE, JSON.stringify(finalJson, null, 2));
}

// --- RUN ---
(async () => {
  await downloadRepo();
  const releasedGoIds = await getReleasedIds();

  // 1. Extract raw images
  await extractRawImages(DIR_REGULAR);

  // 2. Process (Trim & Resize to 64px)
  await normalizeImages();

  // 3. Build Sheet
  const ids = await generateSheet();

  // 4. Update JSON
  await updateJson(ids, releasedGoIds);

  // Cleanup
  fs.rmSync(TEMP_RAW, { recursive: true, force: true });
  fs.rmSync(TEMP_PROCESSED, { recursive: true, force: true });

  console.log("✅ Done! 64px normalized sprites generated.");
})();
