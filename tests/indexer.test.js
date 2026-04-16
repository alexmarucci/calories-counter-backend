import { extractImageUrl, extractNutriments, mapRecord } from "../src/indexer.js";
import {
  mockProduct,
  mockProductNoImage,
  mockProductEmptyName,
  mockProductNullName,
  mockProductWithNestedImages,
} from "./fixtures/mockData.js";

describe("extractImageUrl", () => {
  it("extracts front image URL from images object", () => {
    const url = extractImageUrl(mockProduct.code, mockProduct.images);
    expect(url).toBe(
      "https://images.openfoodfacts.org/images/products/123/456/789/0123/front_en.1.400.jpg"
    );
  });

  it("returns null when images is null", () => {
    expect(extractImageUrl("123", null)).toBeNull();
  });

  it("returns null when images is undefined", () => {
    expect(extractImageUrl("123", undefined)).toBeNull();
  });

  it("returns null when no front_ keys exist", () => {
    expect(extractImageUrl(mockProductNoImage.code, mockProductNoImage.images)).toBeNull();
  });

  it("picks first front image alphabetically", () => {
    const url = extractImageUrl(
      mockProductWithNestedImages.code,
      mockProductWithNestedImages.images
    );
    // front_en sorts before front_fr
    expect(url).toContain("front_en");
    expect(url).toContain(".3.");
  });

  it("returns null when front image has no rev", () => {
    const images = { front_en: { uploaded_t: 123 } };
    expect(extractImageUrl("123", images)).toBeNull();
  });

  it("builds correct path for barcode with leading zeros", () => {
    const images = { front_fr: { rev: 1 } };
    const url = extractImageUrl("0000101209159", images);
    expect(url).toContain("000/010/120/9159");
  });
});

describe("extractNutriments", () => {
  it("extracts per-100g nutritional fields", () => {
    const nutriments = {
      "energy-kcal_100g": 250,
      "fat_100g": 12,
      "saturated-fat_100g": 3.5,
      "carbohydrates_100g": 30,
      "sugars_100g": 15,
      "proteins_100g": 8,
      "fiber_100g": 2,
      "salt_100g": 0.5,
      "sodium_100g": 0.2,
    };
    const result = extractNutriments(nutriments);
    expect(result).toEqual({
      energy_kcal_100g: 250,
      fat_100g: 12,
      saturated_fat_100g: 3.5,
      carbohydrates_100g: 30,
      sugars_100g: 15,
      proteins_100g: 8,
      fiber_100g: 2,
      salt_100g: 0.5,
      sodium_100g: 0.2,
    });
  });

  it("returns null for all missing values", () => {
    expect(extractNutriments({})).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractNutriments(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractNutriments(undefined)).toBeNull();
  });

  it("sets missing fields to null when some values present", () => {
    const nutriments = { "energy-kcal_100g": 100, "fat_100g": 5 };
    const result = extractNutriments(nutriments);
    expect(result.energy_kcal_100g).toBe(100);
    expect(result.fat_100g).toBe(5);
    expect(result.proteins_100g).toBeNull();
    expect(result.fiber_100g).toBeNull();
  });

  it("ignores non-numeric values", () => {
    const nutriments = { "energy-kcal_100g": "high" };
    expect(extractNutriments(nutriments)).toBeNull();
  });

  it("handles mix of numeric and non-numeric", () => {
    const nutriments = { "energy-kcal_100g": 200, "fat_100g": "low" };
    const result = extractNutriments(nutriments);
    expect(result.energy_kcal_100g).toBe(200);
    expect(result.fat_100g).toBeNull();
  });
});

describe("mapRecord", () => {
  it("maps a complete product record with nutriments", () => {
    const record = {
      ...mockProduct,
      product_quantity: 1000,
      product_quantity_unit: "g",
      nutriments: {
        "energy-kcal_100g": 89,
        "fat_100g": 0.3,
        "saturated-fat_100g": 0.1,
        "carbohydrates_100g": 23,
        "sugars_100g": 12,
        "proteins_100g": 1.1,
        "fiber_100g": 2.6,
        "salt_100g": 0.01,
        "sodium_100g": 0.004,
      },
      allergens_tags: ["en:nuts"],
      ingredients_text: "banana",
    };
    const doc = mapRecord(record);
    expect(doc.code).toBe("1234567890123");
    expect(doc.product_name).toBe("Organic Banana");
    expect(doc.product_quantity).toBe(1000);
    expect(doc.product_quantity_unit).toBe("g");
    expect(doc.nutriments).toEqual({
      energy_kcal_100g: 89,
      fat_100g: 0.3,
      saturated_fat_100g: 0.1,
      carbohydrates_100g: 23,
      sugars_100g: 12,
      proteins_100g: 1.1,
      fiber_100g: 2.6,
      salt_100g: 0.01,
      sodium_100g: 0.004,
    });
    expect(doc.allergens_tags).toEqual(["en:nuts"]);
    expect(doc.ingredients_text).toBe("banana");
  });

  it("returns null for empty product_name", () => {
    expect(mapRecord(mockProductEmptyName)).toBeNull();
  });

  it("returns null for null product_name", () => {
    expect(mapRecord(mockProductNullName)).toBeNull();
  });

  it("returns null for whitespace-only product_name", () => {
    expect(mapRecord({ code: "1", product_name: "   " })).toBeNull();
  });

  it("defaults missing optional fields", () => {
    const record = { code: "999", product_name: "Test", images: null };
    const doc = mapRecord(record);
    expect(doc.brands).toBe("");
    expect(doc.categories).toBe("");
    expect(doc.generic_name).toBe("");
    expect(doc.nutriscore_grade).toBeNull();
    expect(doc.countries).toBe("");
    expect(doc.quantity).toBe("");
    expect(doc.product_quantity).toBeNull();
    expect(doc.product_quantity_unit).toBeNull();
    expect(doc.unique_scans_n).toBe(0);
    expect(doc.image_url).toBeNull();
    expect(doc.nutriments).toBeNull();
    expect(doc.allergens_tags).toEqual([]);
    expect(doc.ingredients_text).toBe("");
  });

  it("preserves unicode product names", () => {
    const record = { code: "111", product_name: "Véritable pâte à tartiner" };
    const doc = mapRecord(record);
    expect(doc.product_name).toBe("Véritable pâte à tartiner");
  });
});
