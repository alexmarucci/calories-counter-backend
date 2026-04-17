import express from "express";
import { meilisearchClient, INDEX_NAME, DEBUG } from "./meilisearchClient.js";

const app = express();
const PORT = process.env.PORT || 3000;
const index = meilisearchClient.index(INDEX_NAME);

// Input validation helpers
const MAX_QUERY_LENGTH = 200;
const MAX_LIMIT = 100;
const MAX_AUTOCOMPLETE_LIMIT = 20;

export { sanitiseQuery, clampInt, escapeFilterValue, buildFilters };
export { app };

function sanitiseQuery(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_QUERY_LENGTH) return null;
  return trimmed;
}

function clampInt(value, min, max, defaultVal) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return defaultVal;
  return Math.max(min, Math.min(max, num));
}

function escapeFilterValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildFilters(params) {
  const filters = [];
  if (params.nutriscore) {
    if (!/^[a-e]$/i.test(params.nutriscore)) return undefined;
    filters.push(`nutriscore_grade = ${params.nutriscore.toLowerCase()}`);
  }
  if (params.brand) {
    const brand = sanitiseQuery(params.brand);
    if (!brand) return undefined;
    filters.push(`brands = "${escapeFilterValue(brand)}"`);
  }
  if (params.country) {
    const country = sanitiseQuery(params.country);
    if (!country) return undefined;
    filters.push(`countries = "${escapeFilterValue(country)}"`);
  }
  if (params.nova) {
    const nova = parseInt(params.nova, 10);
    if (nova >= 1 && nova <= 4) filters.push(`nova_group = ${nova}`);
  }
  if (params.label) {
    const label = sanitiseQuery(params.label);
    if (label) filters.push(`labels_tags = "${escapeFilterValue(label)}"`);
  }
  return filters.length > 0 ? filters.join(" AND ") : undefined;
}

// Search endpoint
app.get("/v1/search", async (req, res) => {
  const q = sanitiseQuery(req.query.q);
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required (1-200 chars)' });
  }

  const page = clampInt(req.query.page, 1, 10000, 1);
  const limit = clampInt(req.query.limit, 1, MAX_LIMIT, 20);
  const filter = buildFilters(req.query);

  try {
    const results = await index.search(q, {
      page,
      hitsPerPage: limit,
      filter: filter || undefined,
      sort: ["unique_scans_n:desc"],
      attributesToRetrieve: [
        "code",
        "product_name",
        "brands",
        "categories",
        "generic_name",
        "nutriscore_grade",
        "countries",
        "quantity",
        "product_quantity",
        "product_quantity_unit",
        "serving_quantity",
        "serving_quantity_unit",
        "image_url",
        "nutriments",
        "allergens_tags",
        "ingredients_text",
        "ingredients",
        "nova_group",
        "labels_tags",
        "ingredients_analysis_tags",
        "additives_n",
        "stores",
        "unique_scans_n",
      ],
    });

    res.json({
      results: results.hits,
      total: results.estimatedTotalHits || results.totalHits || 0,
      page,
      limit,
    });
    if (DEBUG) console.log("[search]", q, `→ ${results.hits.length} hits`);
  } catch (err) {
    console.error("Search failed:", err.message);
    res.status(503).json({ error: "Search service unavailable" });
  }
});

// Product detail endpoint
app.get("/v1/products/:code", async (req, res) => {
  const code = req.params.code;
  if (!code || !/^\d+$/.test(code)) {
    return res.status(400).json({ error: "Product code must be a numeric barcode" });
  }

  try {
    const doc = await index.getDocument(code);
    res.json(doc);
    if (DEBUG) console.log("[product]", code, `→ ${doc.product_name}`);
  } catch (err) {
    if (err.code === "document_not_found" || err.statusCode === 404) {
      return res.status(404).json({ error: `Product ${code} not found` });
    }
    console.error("Product lookup failed:", err.message);
    res.status(503).json({ error: "Search service unavailable" });
  }
});

// healthz endpoint
app.get("/healthz", (req, res) => {
  res.json({ status: "ok" });
});

// Autocomplete endpoint
app.get("/v1/autocomplete", async (req, res) => {
  const q = sanitiseQuery(req.query.q);
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required (1-200 chars)' });
  }

  const limit = clampInt(req.query.limit, 1, MAX_AUTOCOMPLETE_LIMIT, 10);

  try {
    const results = await index.search(q, {
      limit,
      attributesToRetrieve: ["product_name", "code", "brands"],
    });

    res.json({
      suggestions: results.hits.map((hit) => ({
        product_name: hit.product_name,
        code: hit.code,
        brands: hit.brands,
      })),
    });
    if (DEBUG) console.log("[autocomplete]", q, `→ ${results.hits.length} suggestions`);
  } catch (err) {
    console.error("Autocomplete failed:", err.message);
    res.status(503).json({ error: "Search service unavailable" });
  }
});

export default app;

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Search API running on port ${PORT}`);
  });
}
