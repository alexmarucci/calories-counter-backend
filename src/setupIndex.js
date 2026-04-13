import { meilisearchClient, INDEX_NAME } from "./meilisearchClient.js";
import { INDEX_CONFIG } from "./indexConfig.js";

async function setupIndex() {
  const index = meilisearchClient.index(INDEX_NAME);

  await index.updateSearchableAttributes(INDEX_CONFIG.searchableAttributes);
  await index.updateFilterableAttributes(INDEX_CONFIG.filterableAttributes);
  await index.updateSortableAttributes(INDEX_CONFIG.sortableAttributes);

  console.log("Index configuration updated");
}

setupIndex().catch(console.error);
