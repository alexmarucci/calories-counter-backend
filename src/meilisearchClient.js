import { Meilisearch } from "meilisearch";
import dotenv from "dotenv";

dotenv.config();

const meilisearchClient = new Meilisearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "",
});

export const DEBUG = process.env.DEBUG === "1";
export const INDEX_NAME = "products";
export { meilisearchClient };
