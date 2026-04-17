import { jest } from "@jest/globals";

// Mock meilisearch before importing api
const mockSearch = jest.fn();
const mockGetDocument = jest.fn();
const mockIndex = { search: mockSearch, getDocument: mockGetDocument };
const mockMeilisearchClient = {
  index: jest.fn(() => mockIndex),
};

jest.unstable_mockModule("../src/meilisearchClient.js", () => ({
  meilisearchClient: mockMeilisearchClient,
  INDEX_NAME: "products",
  DEBUG: false,
}));

const { default: app } = await import("../src/api.js");
const {
  sanitiseQuery,
  clampInt,
  escapeFilterValue,
  buildFilters,
} = await import("../src/api.js");

// Dynamic import for supertest (ESM compat)
const supertest = (await import("supertest")).default;
const request = supertest(app);

describe("sanitiseQuery", () => {
  it("returns trimmed string for valid input", () => {
    expect(sanitiseQuery("  banana  ")).toBe("banana");
  });

  it("returns null for empty string", () => {
    expect(sanitiseQuery("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(sanitiseQuery("   ")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(sanitiseQuery(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitiseQuery(undefined)).toBeNull();
  });

  it("returns null for non-string input", () => {
    expect(sanitiseQuery(123)).toBeNull();
  });

  it("returns null for string exceeding max length", () => {
    expect(sanitiseQuery("a".repeat(201))).toBeNull();
  });

  it("accepts string at max length boundary", () => {
    expect(sanitiseQuery("a".repeat(200))).toBe("a".repeat(200));
  });
});

describe("clampInt", () => {
  it("returns value when within range", () => {
    expect(clampInt("5", 1, 10, 3)).toBe(5);
  });

  it("returns default for NaN input", () => {
    expect(clampInt("abc", 1, 10, 5)).toBe(5);
  });

  it("returns default for undefined input", () => {
    expect(clampInt(undefined, 1, 10, 5)).toBe(5);
  });

  it("clamps to min when below range", () => {
    expect(clampInt("-5", 1, 10, 3)).toBe(1);
  });

  it("clamps to max when above range", () => {
    expect(clampInt("200", 1, 100, 20)).toBe(100);
  });
});

describe("escapeFilterValue", () => {
  it("escapes double quotes", () => {
    expect(escapeFilterValue('test"value')).toBe('test\\"value');
  });

  it("escapes backslashes", () => {
    expect(escapeFilterValue("test\\value")).toBe("test\\\\value");
  });

  it("handles clean strings", () => {
    expect(escapeFilterValue("banana")).toBe("banana");
  });
});

describe("buildFilters", () => {
  it("returns undefined when no filters provided", () => {
    expect(buildFilters({})).toBeUndefined();
  });

  it("builds nutriscore filter", () => {
    expect(buildFilters({ nutriscore: "a" })).toBe("nutriscore_grade = a");
  });

  it("validates nutriscore range a-e", () => {
    expect(buildFilters({ nutriscore: "a" })).toBe("nutriscore_grade = a");
    expect(buildFilters({ nutriscore: "e" })).toBe("nutriscore_grade = e");
    expect(buildFilters({ nutriscore: "z" })).toBeUndefined();
    expect(buildFilters({ nutriscore: "1" })).toBeUndefined();
  });

  it("handles case-insensitive nutriscore", () => {
    expect(buildFilters({ nutriscore: "A" })).toBe("nutriscore_grade = a");
  });

  it("builds brand filter with escaping", () => {
    expect(buildFilters({ brand: "Chiquita" })).toBe(
      'brands = "Chiquita"'
    );
  });

  it("builds country filter with escaping", () => {
    expect(buildFilters({ country: "France" })).toBe(
      'countries = "France"'
    );
  });

  it("escapes injection in brand filter", () => {
    const result = buildFilters({ brand: 'Chiquita" OR "1"="1' });
    expect(result).toBe('brands = "Chiquita\\" OR \\"1\\"=\\"1"');
  });

  it("escapes injection in country filter", () => {
    const result = buildFilters({ country: 'France"; DROP TABLE--' });
    // The value is wrapped in escaped quotes so the entire string
    // becomes a literal filter value — Meilisearch treats it as one token
    expect(result).toBe('countries = "France\\"; DROP TABLE--"');
    expect(result).toContain('\\"');
  });

  it("rejects empty brand", () => {
    expect(buildFilters({ brand: "" })).toBeUndefined();
  });

  it("combines multiple filters with AND", () => {
    const result = buildFilters({
      nutriscore: "a",
      brand: "Chiquita",
      country: "France",
    });
    expect(result).toBe(
      'nutriscore_grade = a AND brands = "Chiquita" AND countries = "France"'
    );
  });
});

describe("GET /v1/search", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("returns search results", async () => {
    mockSearch.mockResolvedValue({
      hits: [
        {
          code: "1",
          product_name: "Banana",
          brands: "Test",
          categories: "Fruit",
          nutriscore_grade: "a",
          quantity: "100g",
          image_url: null,
        },
      ],
      estimatedTotalHits: 1,
    });

    const res = await request.get("/v1/search?q=banana");
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].product_name).toBe("Banana");
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it("returns 400 when q is missing", async () => {
    const res = await request.get("/v1/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("q");
  });

  it("returns 400 when q is empty", async () => {
    const res = await request.get("/v1/search?q=");
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is whitespace only", async () => {
    const res = await request.get("/v1/search?q=%20%20");
    expect(res.status).toBe(400);
  });

  it("passes filters to Meilisearch", async () => {
    mockSearch.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

    await request.get("/v1/search?q=banana&nutriscore=a&brand=Chiquita");
    expect(mockSearch).toHaveBeenCalledWith(
      "banana",
      expect.objectContaining({
        filter: 'nutriscore_grade = a AND brands = "Chiquita"',
      })
    );
  });

  it("returns 503 when Meilisearch fails", async () => {
    mockSearch.mockRejectedValue(new Error("connection refused"));

    const res = await request.get("/v1/search?q=banana");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Search service unavailable");
  });

  it("respects page and limit params", async () => {
    mockSearch.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

    await request.get("/v1/search?q=test&page=3&limit=5");
    expect(mockSearch).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({ page: 3, hitsPerPage: 5 })
    );
  });

  it("clamps limit to max 100", async () => {
    mockSearch.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

    await request.get("/v1/search?q=test&limit=999");
    expect(mockSearch).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({ hitsPerPage: 100 })
    );
  });

  it("defaults page to 1 and limit to 20", async () => {
    mockSearch.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

    await request.get("/v1/search?q=test");
    expect(mockSearch).toHaveBeenCalledWith(
      "test",
      expect.objectContaining({ page: 1, hitsPerPage: 20 })
    );
  });
});

describe("GET /v1/autocomplete", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("returns autocomplete suggestions", async () => {
    mockSearch.mockResolvedValue({
      hits: [
        { product_name: "Banana", code: "1", brands: "Test" },
        { product_name: "Banana Bread", code: "2", brands: "Bake" },
      ],
    });

    const res = await request.get("/v1/autocomplete?q=bnan");
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(2);
    expect(res.body.suggestions[0]).toEqual({
      product_name: "Banana",
      code: "1",
      brands: "Test",
    });
  });

  it("returns 400 when q is missing", async () => {
    const res = await request.get("/v1/autocomplete");
    expect(res.status).toBe(400);
  });

  it("returns 400 when q is empty", async () => {
    const res = await request.get("/v1/autocomplete?q=");
    expect(res.status).toBe(400);
  });

  it("returns 503 when Meilisearch fails", async () => {
    mockSearch.mockRejectedValue(new Error("connection refused"));

    const res = await request.get("/v1/autocomplete?q=ban");
    expect(res.status).toBe(503);
  });

  it("uses limit param with max 20", async () => {
    mockSearch.mockResolvedValue({ hits: [] });

    await request.get("/v1/autocomplete?q=ban&limit=50");
    expect(mockSearch).toHaveBeenCalledWith(
      "ban",
      expect.objectContaining({ limit: 20 })
    );
  });

  it("only retrieves product_name, code, brands", async () => {
    mockSearch.mockResolvedValue({ hits: [] });

    await request.get("/v1/autocomplete?q=ban");
    expect(mockSearch).toHaveBeenCalledWith(
      "ban",
      expect.objectContaining({
        attributesToRetrieve: ["product_name", "code", "brands"],
      })
    );
  });
});

describe("GET /v1/products/:code", () => {
  beforeEach(() => {
    mockGetDocument.mockReset();
  });

  it("returns product by code", async () => {
    mockGetDocument.mockResolvedValue({
      code: "1234567890123",
      product_name: "Banana",
      brands: "Chiquita",
      nutriments: {
        energy_kcal_100g: 89,
        fat_100g: 0.3,
        carbohydrates_100g: 23,
        sugars_100g: 12,
        proteins_100g: 1.1,
        fiber_100g: 2.6,
        saturated_fat_100g: 0.1,
        salt_100g: 0.01,
        sodium_100g: 0.004,
      },
    });

    const res = await request.get("/v1/products/1234567890123");
    expect(res.status).toBe(200);
    expect(res.body.code).toBe("1234567890123");
    expect(res.body.nutriments.energy_kcal_100g).toBe(89);
  });

  it("returns 400 for non-numeric code", async () => {
    const res = await request.get("/v1/products/abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("numeric");
  });

  it("returns 404 for unknown product", async () => {
    const err = new Error("not found");
    err.code = "document_not_found";
    mockGetDocument.mockRejectedValue(err);

    const res = await request.get("/v1/products/9999999999999");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns 503 when Meilisearch fails", async () => {
    mockGetDocument.mockRejectedValue(new Error("connection refused"));

    const res = await request.get("/v1/products/1234567890123");
    expect(res.status).toBe(503);
  });
});
