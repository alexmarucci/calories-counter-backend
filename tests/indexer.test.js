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
  it("extracts from nutrition.aggregated_set (per-100g, normalised)", () => {
    const record = {
      nutrition: {
        aggregated_set: {
          per: "100g",
          nutrients: {
            "energy-kcal": { value: 370, unit: "kcal", source: "packaging" },
            "fat": { value: 7.5, unit: "g", source: "packaging" },
            "saturated-fat": { value: 1.3, unit: "g", source: "packaging" },
            "carbohydrates": { value: 59.6, unit: "g", source: "packaging" },
            "sugars": { value: 1.0, unit: "g", source: "packaging" },
            "proteins": { value: 11.7, unit: "g", source: "packaging" },
            "fiber": { value: 8.4, unit: "g", source: "packaging" },
            "salt": { value: 0.01, unit: "g", source: "packaging" },
            "sodium": { value: 0.004, unit: "g", source: "packaging" },
          },
        },
        input_sets: [],
      },
      nutriments: {},
    };
    const result = extractNutriments(record);
    expect(result).toEqual({
      energy_kcal_100g: 370,
      fat_100g: 7.5,
      saturated_fat_100g: 1.3,
      carbohydrates_100g: 59.6,
      sugars_100g: 1,
      proteins_100g: 11.7,
      fiber_100g: 8.4,
      salt_100g: 0.01,
      sodium_100g: 0.004,
    });
  });

  it("falls back to input_sets when aggregated_set is missing", () => {
    const record = {
      nutrition: {
        input_sets: [{
          per: "100g",
          nutrients: {
            "energy-kcal": { value: 617, unit: "kcal" },
            "fat": { value: 48, unit: "g" },
            "salt": { value: 0.01, unit: "g" },
            "sodium": { value: 0.004, unit: "g" },
          },
        }],
      },
      nutriments: {},
    };
    const result = extractNutriments(record);
    expect(result).not.toBeNull();
    expect(result.energy_kcal_100g).toBe(617);
    expect(result.fat_100g).toBe(48);
  });

  it("falls back to top-level nutriments._100g fields", () => {
    const record = {
      nutrition: {},
      nutriments: {
        "energy-kcal_100g": 250,
        "fat_100g": 12,
        "saturated-fat_100g": 3.5,
        "carbohydrates_100g": 30,
        "sugars_100g": 15,
        "proteins_100g": 8,
        "fiber_100g": 2,
        "salt_100g": 0.5,
        "sodium_100g": 0.2,
      },
    };
    const result = extractNutriments(record);
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

  it("prefers aggregated_set > input_sets > nutriments > nutriscore", () => {
    const record = {
      nutrition: {
        aggregated_set: {
          per: "100g",
          nutrients: { "proteins": { value: 1, unit: "g" } },
        },
        input_sets: [{
          per: "100g",
          nutrients: { "proteins": { value: 2, unit: "g" } },
        }],
      },
      nutriments: { "proteins_100g": 3 },
      nutriscore: { "2021": { data: { proteins: 4, proteins_value: 4 } } },
    };
    const result = extractNutriments(record);
    expect(result.proteins_100g).toBe(1); // aggregated_set wins
  });

  it("returns null for record with no nutrition data", () => {
    expect(extractNutriments({})).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractNutriments(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(extractNutriments(undefined)).toBeNull();
  });

  it("sets missing fields to null when some values present", () => {
    const record = {
      nutriments: { "energy-kcal_100g": 100, "fat_100g": 5 },
    };
    const result = extractNutriments(record);
    expect(result.energy_kcal_100g).toBe(100);
    expect(result.fat_100g).toBe(5);
    expect(result.proteins_100g).toBeNull();
    expect(result.fiber_100g).toBeNull();
  });

  it("ignores non-numeric values in nutriments fallback", () => {
    const record = { nutriments: { "energy-kcal_100g": "high" } };
    expect(extractNutriments(record)).toBeNull();
  });

  it("ignores non-numeric values in nutrition nutrients", () => {
    const record = {
      nutrition: {
        input_sets: [{
          per: "100g",
          nutrients: { "energy-kcal": { value: "high", unit: "kcal" } },
        }],
      },
    };
    expect(extractNutriments(record)).toBeNull();
  });

  it("converts mg to g for sodium and salt from nutrition.input_sets", () => {
    const record = {
      nutrition: {
        input_sets: [{
          per: "100g",
          nutrients: {
            "energy-kcal": { value: 100, unit: "kcal" },
            "sodium": { value: 400, unit: "mg" },
            "salt": { value: 1000, unit: "mg" },
          },
        }],
      },
    };
    const result = extractNutriments(record);
    expect(result.sodium_100g).toBe(0.4);
    expect(result.salt_100g).toBe(1.0);
  });

  it("keeps g values as-is when unit is g", () => {
    const record = {
      nutrition: {
        input_sets: [{
          per: "100g",
          nutrients: {
            "sodium": { value: 0.4, unit: "g" },
            "salt": { value: 1.0, unit: "g" },
          },
        }],
      },
    };
    const result = extractNutriments(record);
    expect(result.sodium_100g).toBe(0.4);
    expect(result.salt_100g).toBe(1.0);
  });

  it("falls back to nutriscore.2021.data (converts kJ to kcal)", () => {
    const record = {
      nutrition: {},
      nutriments: {},
      nutriscore: {
        "2021": {
          data: {
            energy: 2524,
            energy_value: 2524,
            proteins_value: 11.7,
            sugars_value: 1.0,
            saturated_fat_value: 1.3,
            fiber_value: 8.4,
            sodium_value: 4,
            fat: 5,
            fiber: 8.4,
            proteins: 11.7,
            sugars: 1.0,
            sodium: 4,
            saturated_fat: 1.3,
          },
        },
      },
    };
    const result = extractNutriments(record);
    expect(result).not.toBeNull();
    expect(result.energy_kcal_100g).toBe(603); // 2524 / 4.184 rounded
    expect(result.proteins_100g).toBe(11.7);
    expect(result.sugars_100g).toBe(1.0);
    expect(result.fiber_100g).toBe(8.4);
    expect(result.sodium_100g).toBe(4);
    expect(result.salt_100g).toBe(10); // sodium * 2.5
  });

  it("falls back to nutriscore.2023.data as well", () => {
    const record = {
      nutrition: {},
      nutriments: {},
      nutriscore: {
        "2023": {
          data: {
            proteins: 5,
            sugars: 3,
          },
        },
      },
    };
    const result = extractNutriments(record);
    expect(result).not.toBeNull();
    expect(result.proteins_100g).toBe(5);
    expect(result.sugars_100g).toBe(3);
  });

  it("prefers input_sets over nutriments when no aggregated_set", () => {
    const record = {
      nutrition: {
        input_sets: [{
          per: "100g",
          nutrients: { "proteins": { value: 2, unit: "g" } },
        }],
      },
      nutriments: { "proteins_100g": 3 },
    };
    const result = extractNutriments(record);
    expect(result.proteins_100g).toBe(2); // input_sets beats nutriments
  });

  it("uses nutriments when aggregated_set and input_sets missing the field", () => {
    const record = {
      nutrition: {
        aggregated_set: {
          per: "100g",
          nutrients: { "energy-kcal": { value: 100, unit: "kcal" } },
        },
        input_sets: [],
      },
      nutriments: { "proteins_100g": 5 },
    };
    const result = extractNutriments(record);
    expect(result.energy_kcal_100g).toBe(100);
    expect(result.proteins_100g).toBe(5);
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
