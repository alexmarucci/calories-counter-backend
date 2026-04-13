import { createReadStream } from "fs";
import { createInterface } from "readline";
import { meilisearchClient, INDEX_NAME } from "./meilisearchClient.js";
import { INDEX_CONFIG } from "./indexConfig.js";

const JSONL_PATH = process.env.JSONL_PATH || "./openfoodfacts-products.jsonl";
const BATCH_SIZE = 1000;

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
  const codePath = code.replace(/(.{3})/g, "$1/").slice(0, -1);
  return `https://images.openfoodfacts.org/images/products/${codePath}/${frontKey}.${frontData.rev}.400.jpg`;
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
    unique_scans_n: record.unique_scans_n || 0,
    image_url: extractImageUrl(record.code, record.images),
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
        await meilisearchClient.waitForTask(task.taskUid);
        totalIndexed += batch.length;
      } catch (err) {
        console.error(`Batch ${batchNum} failed: ${err.message}`);
        // Retry once
        try {
          const task = await index.addDocuments(batch, { primaryKey: "id" });
          await meilisearchClient.waitForTask(task.taskUid);
          totalIndexed += batch.length;
        } catch {
          console.error(
            `Batch ${batchNum} failed on retry, skipping ${batch.length} docs`
          );
        }
      }

      if (totalProcessed % 100000 === 0) {
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
      await meilisearchClient.waitForTask(task.taskUid);
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

export { extractImageUrl, mapRecord, runIndexer };

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  runIndexer().catch((err) => {
    console.error("Indexer failed:", err);
    process.exit(1);
  });
}
