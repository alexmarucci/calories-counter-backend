import { createReadStream } from "fs";
import { createInterface } from "readline";
import { meilisearchClient, INDEX_NAME } from "./meilisearchClient.js";
import { INDEX_CONFIG } from "./indexConfig.js";

const JSONL_PATH = process.env.JSONL_PATH || "./openfoodfacts-products.jsonl";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 5000;

function extractImageUrl(code, images) {
  if (!images) return null;
  // Look for front image in any language
  const frontKeys = Object.keys(images).filter((k) =>
    k.startsWith("front_")
  );
  if (frontKeys.length === 0) return null;
  // Pick the first front image (prioritise smaller language codes)
  frontKeys.sort();
  const frontKey = frontKeys[0];
  const frontData = images[frontKey];
  if (!frontData || !frontData.rev) return null;
  // Build Open Food Facts image URL
  const codePath = code.slice(0, 3) + "/" + code.slice(3, 6) + "/" + code.slice(6, 9) + "/" + code.slice(9);
  return `https://images.openfoodfacts.org/images/products/${codePath}/${frontKey}.${frontData.rev}.400.jpg`;
}

function extractNutriments(record) {
  if (!record) return null;

  const nutrition = record.nutrition && typeof record.nutrition === "object"
    ? record.nutrition
    : {};

  // Source 1: nutrition.aggregated_set — always per-100g, best source picked per nutrient
  const hasAgg = nutrition.aggregated_set?.per === "100g"
    && Object.keys(nutrition.aggregated_set.nutrients || {}).length > 0;
  const aggNutrients = hasAgg ? nutrition.aggregated_set.nutrients : null;

  // Source 1b: fallback to first input_sets entry where per=100g
  const inputSets = nutrition.input_sets || [];
  const inputNutrients = hasAgg
    ? null // aggregated_set present, skip manual parsing
    : (inputSets.find((s) => s.per === "100g") || {}).nutrients || {};

  const getAgg = (key) => {
    if (!aggNutrients) return null;
    const entry = aggNutrients[key];
    if (!entry || typeof entry.value !== "number") return null;
    return entry.value;
  };

  const getAggGrams = (key) => {
    if (!aggNutrients) return null;
    const entry = aggNutrients[key];
    if (!entry || typeof entry.value !== "number") return null;
    if (entry.unit === "mg") return entry.value / 1000;
    return entry.value;
  };

  const getInput = (key) => {
    if (!inputNutrients) return null;
    const entry = inputNutrients[key];
    if (!entry || typeof entry.value !== "number") return null;
    return entry.value;
  };

  const getInputGrams = (key) => {
    if (!inputNutrients) return null;
    const entry = inputNutrients[key];
    if (!entry || typeof entry.value !== "number") return null;
    if (entry.unit === "mg") return entry.value / 1000;
    return entry.value;
  };

  // Source 2: top-level nutriments._100g fields
  const nutriments = record.nutriments || {};
  const getFromNutriments = (key) => {
    const val = nutriments[key];
    return typeof val === "number" ? val : null;
  };

  // Source 3: nutriscore.2021.data or nutriscore.2023.data (flat values + scoring)
  let nsData = null;
  const ns = record.nutriscore;
  if (ns && typeof ns === "object") {
    for (const yk of ["2021", "2023"]) {
      const yd = ns[yk];
      if (yd && typeof yd === "object" && typeof yd.data === "object") {
        nsData = yd.data;
        break;
      }
    }
  }
  const getFromNutriscore = (key) => {
    if (!nsData) return null;
    const val = nsData[key];
    return typeof val === "number" ? val : null;
  };

  // Convert kJ to kcal for energy fields from nutriscore (which uses kJ)
  const energyKj = getFromNutriscore("energy") ?? getFromNutriscore("energy_value");
  const energyFromNutriscore = energyKj !== null ? Math.round(energyKj / 4.184) : null;

  const result = {
    energy_kcal_100g:
      getAgg("energy-kcal") ?? getInput("energy-kcal") ??
      getFromNutriments("energy-kcal_100g") ??
      energyFromNutriscore,
    fat_100g:
      getAgg("fat") ?? getInput("fat") ??
      getFromNutriments("fat_100g") ??
      getFromNutriscore("fat_value") ?? getFromNutriscore("fat"),
    saturated_fat_100g:
      getAgg("saturated-fat") ?? getInput("saturated-fat") ??
      getFromNutriments("saturated-fat_100g") ??
      getFromNutriscore("saturated_fat_value") ?? getFromNutriscore("saturated_fat"),
    carbohydrates_100g:
      getAgg("carbohydrates") ?? getInput("carbohydrates") ??
      getFromNutriments("carbohydrates_100g"),
    sugars_100g:
      getAgg("sugars") ?? getInput("sugars") ??
      getFromNutriments("sugars_100g") ??
      getFromNutriscore("sugars_value") ?? getFromNutriscore("sugars"),
    proteins_100g:
      getAgg("proteins") ?? getInput("proteins") ??
      getFromNutriments("proteins_100g") ??
      getFromNutriscore("proteins_value") ?? getFromNutriscore("proteins"),
    fiber_100g:
      getAgg("fiber") ?? getInput("fiber") ??
      getFromNutriments("fiber_100g") ??
      getFromNutriscore("fiber_value") ?? getFromNutriscore("fiber"),
    salt_100g:
      getAggGrams("salt") ?? getInputGrams("salt") ??
      getFromNutriments("salt_100g") ??
      (getFromNutriscore("sodium_value") !== null
        ? getFromNutriscore("sodium_value") * 2.5
        : null),
    sodium_100g:
      getAggGrams("sodium") ?? getInputGrams("sodium") ??
      getFromNutriments("sodium_100g") ??
      getFromNutriscore("sodium_value") ?? getFromNutriscore("sodium"),
  };

  if (Object.values(result).every((v) => v === null)) return null;
  return result;
}

function mapRecord(record) {
  const productName = record.product_name;
  if (!productName || productName.trim() === "") return null;

  return {
    id: record.code,
    code: record.code,
    product_name: productName,
    brands: record.brands || "",
    categories: record.categories || "",
    generic_name: record.generic_name || "",
    nutriscore_grade: record.nutriscore_grade || null,
    countries: record.countries || "",
    quantity: record.quantity || "",
    product_quantity: record.product_quantity || null,
    product_quantity_unit: record.product_quantity_unit || null,
    serving_quantity: record.serving_quantity || null,
    serving_quantity_unit: record.serving_quantity_unit || null,
    unique_scans_n: record.unique_scans_n || 0,
    image_url: extractImageUrl(record.code, record.images),
    nutriments: extractNutriments(record),
    allergens_tags: record.allergens_tags || [],
    ingredients_text: record.ingredients_text || "",
    ingredients: (record.ingredients || []).map((i) => ({
      text: i.text || "",
      vegan: i.vegan || null,
      vegetarian: i.vegetarian || null,
      percent: i.percent_estimate ?? i.percent_max ?? null,
    })),
    nova_group: record.nova_group ?? record.nova_groups ?? null,
    labels_tags: record.labels_tags || [],
    ingredients_analysis_tags: record.ingredients_analysis_tags || [],
    additives_n: record.additives_n ?? 0,
    stores: record.stores || "",
  };
}

async function runIndexer() {
  const index = meilisearchClient.index(INDEX_NAME);

  console.log(`Starting indexing from: ${JSONL_PATH}`);
  console.log(`Batch size: ${BATCH_SIZE}`);

  // Configure index before indexing
  await index.updateSearchableAttributes(INDEX_CONFIG.searchableAttributes);
  await index.updateFilterableAttributes(INDEX_CONFIG.filterableAttributes);
  await index.updateSortableAttributes(INDEX_CONFIG.sortableAttributes);
  console.log("Index configured");

  const fileStream = createReadStream(JSONL_PATH, { encoding: "utf-8" });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  let batch = [];
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalIndexed = 0;
  let batchNum = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      totalSkipped++;
      continue;
    }

    const doc = mapRecord(record);
    if (!doc) {
      totalSkipped++;
      continue;
    }

    batch.push(doc);
    totalProcessed++;

    if (batch.length >= BATCH_SIZE) {
      batchNum++;
      try {
        const task = await index.addDocuments(batch, { primaryKey: "id" });
        await meilisearchClient.waitForTask(task.taskUid, { timeOutMs: 60_000 });
        totalIndexed += batch.length;
      } catch (err) {
        console.error(`Batch ${batchNum} failed: ${err.message}`);
        // Retry once
        try {
          const task = await index.addDocuments(batch, { primaryKey: "id" });
          await meilisearchClient.waitForTask(task.taskUid, { timeOutMs: 60_000 });
          totalIndexed += batch.length;
        } catch {
          console.error(
            `Batch ${batchNum} failed on retry, skipping ${batch.length} docs`
          );
        }
      }

      if (batchNum === 1) {
        console.log(`First batch indexed (${batch.length} docs) — indexing in progress...`);
      }
      if (totalProcessed % 50000 === 0) {
        console.log(
          `Progress: ${totalProcessed.toLocaleString()} processed, ${totalIndexed.toLocaleString()} indexed, ${totalSkipped.toLocaleString()} skipped`
        );
      }

      batch = [];
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    batchNum++;
    try {
      const task = await index.addDocuments(batch, { primaryKey: "id" });
      await meilisearchClient.waitForTask(task.taskUid, { timeOutMs: 60_000 });
      totalIndexed += batch.length;
    } catch (err) {
      console.error(`Final batch failed: ${err.message}`);
    }
  }

  console.log("\nIndexing complete");
  console.log(`  Processed: ${totalProcessed.toLocaleString()}`);
  console.log(`  Indexed:   ${totalIndexed.toLocaleString()}`);
  console.log(`  Skipped:   ${totalSkipped.toLocaleString()}`);
}

export { extractImageUrl, extractNutriments, mapRecord, runIndexer };

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  runIndexer().catch((err) => {
    console.error("Indexer failed:", err);
    process.exit(1);
  });
}
