// Minimal mock product record matching the JSONL schema
export const mockProduct = {
  code: "1234567890123",
  product_name: "Organic Banana",
  brands: "Chiquita",
  categories: "Plant-based foods and beverages, Plant-based foods, Fruits",
  generic_name: "Fresh banana",
  nutriscore_grade: "a",
  countries: "United States",
  quantity: "1 kg",
  unique_scans_n: 42,
  images: {
    front_en: { rev: 1, uploaded_t: 1579374831 },
    nutrition_en: { rev: 2, uploaded_t: 1579374832 },
  },
};

export const mockProductNoImage = {
  code: "9876543210987",
  product_name: "Green Apple",
  brands: "Farm Fresh",
  categories: "Fruits",
  generic_name: "",
  nutriscore_grade: "b",
  countries: "France",
  quantity: "500 g",
  unique_scans_n: 10,
  images: {},
};

export const mockProductEmptyName = {
  code: "1111111111111",
  product_name: "",
  brands: "NoName",
};

export const mockProductNullName = {
  code: "2222222222222",
  product_name: null,
};

export const mockProductWithNestedImages = {
  code: "3014260000001",
  product_name: "Chocolate Biscuits",
  brands: "LU",
  categories: "Sugary snacks, Biscuits",
  generic_name: "Chocolate sandwich biscuits",
  nutriscore_grade: "d",
  countries: "France,Germany",
  quantity: "154 g",
  unique_scans_n: 1500,
  images: {
    front_fr: { rev: 5, uploaded_t: 1579374831 },
    front_en: { rev: 3, uploaded_t: 1579374832 },
  },
};

export const mockSearchHits = [
  {
    code: "1234567890123",
    product_name: "Organic Banana",
    brands: "Chiquita",
    categories: "Fruits",
    nutriscore_grade: "a",
    quantity: "1 kg",
    image_url: null,
  },
  {
    code: "9876543210987",
    product_name: "Banana Chips",
    brands: "Tropical Snacks",
    categories: "Snacks",
    nutriscore_grade: "c",
    quantity: "100 g",
    image_url: null,
  },
];

export const mockSearchResponse = {
  hits: mockSearchHits,
  estimatedTotalHits: 42,
};
