import { MeiliSearch } from "meilisearch";
import dotenv from "dotenv";

dotenv.config();

const meilisearchClient = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "",
});

export const INDEX_NAME = "products";
export { meilisearchClient };
