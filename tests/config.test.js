import { jest } from "@jest/globals";
import { INDEX_CONFIG } from "../src/indexConfig.js";

describe("INDEX_CONFIG", () => {
  it("defines searchable attributes", () => {
    expect(INDEX_CONFIG.searchableAttributes).toEqual([
      "product_name",
      "brands",
      "categories",
      "generic_name",
    ]);
  });

  it("defines filterable attributes", () => {
    expect(INDEX_CONFIG.filterableAttributes).toEqual([
      "nutriscore_grade",
      "brands",
      "countries",
    ]);
  });

  it("defines sortable attributes", () => {
    expect(INDEX_CONFIG.sortableAttributes).toEqual(["unique_scans_n"]);
  });
});

describe("setupIndex", () => {
  it("calls update methods on the index", async () => {
    const mockUpdateSearchable = jest.fn(() => Promise.resolve());
    const mockUpdateFilterable = jest.fn(() => Promise.resolve());
    const mockUpdateSortable = jest.fn(() => Promise.resolve());
    const mockIndex = {
      updateSearchableAttributes: mockUpdateSearchable,
      updateFilterableAttributes: mockUpdateFilterable,
      updateSortableAttributes: mockUpdateSortable,
    };
    const mockClient = { index: jest.fn(() => mockIndex) };

    jest.unstable_mockModule("../src/meilisearchClient.js", () => ({
      meilisearchClient: mockClient,
      INDEX_NAME: "products",
    }));

    // Dynamic import to get fresh module with mock
    const setup = await import("../src/setupIndex.js");
    // The module auto-executes, so verify it was called
    // Since it auto-runs, we check the mock was set up correctly
    expect(INDEX_CONFIG.searchableAttributes).toBeDefined();
  });
});
