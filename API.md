# Open Food Facts Search API

Public REST API for searching, autocompleting, and retrieving food product data from the Open Food Facts database.

**Base URL:** `http://localhost:3000`

---

## Search Products

Full-text search across product names, brands, and categories with optional filters.

```
GET /v1/search
```

### Query Parameters

| Parameter   | Type   | Required | Default | Description                                          |
|-------------|--------|----------|---------|------------------------------------------------------|
| `q`         | string | Yes      | —       | Search terms. 1–200 characters after trimming.       |
| `page`      | int    | No       | 1       | Page number (min 1, max 10000).                      |
| `limit`     | int    | No       | 20      | Results per page (min 1, max 100).                   |
| `nutriscore`| string | No       | —       | Filter by nutri-score grade: `a`, `b`, `c`, `d`, or `e`. Case-insensitive. |
| `brand`     | string | No       | —       | Filter by brand name. 1–200 characters after trimming. |
| `country`   | string | No       | —       | Filter by country name. 1–200 characters after trimming. |

Filters are combined with AND logic when multiple are provided.

### Response

**200 OK**

```json
{
  "results": [
    {
      "code": "3014260000001",
      "product_name": "Chocolate Biscuits",
      "brands": "LU",
      "categories": "Sugary snacks, Biscuits",
      "generic_name": "Chocolate sandwich biscuits",
      "nutriscore_grade": "d",
      "countries": "France,Germany",
      "quantity": "154 g",
      "product_quantity": 154,
      "product_quantity_unit": "g",
      "image_url": "https://images.openfoodfacts.org/images/products/301/426/000/0001/front_fr.5.400.jpg",
      "nutriments": {
        "energy_kcal_100g": 498,
        "fat_100g": 23,
        "saturated_fat_100g": 13,
        "carbohydrates_100g": 67,
        "sugars_100g": 39,
        "proteins_100g": 6.3,
        "fiber_100g": 2.8,
        "salt_100g": 0.73,
        "sodium_100g": 0.292
      },
      "allergens_tags": ["en:milk", "en:soybeans", "en:wheat"],
      "ingredients_text": "Wheat flour, sugar, chocolate..."
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

| Field     | Type   | Description                                        |
|-----------|--------|----------------------------------------------------|
| `results` | array  | Array of product objects (see fields below).       |
| `total`   | int    | Estimated total number of matching products.       |
| `page`    | int    | Current page number.                               |
| `limit`   | int    | Number of results per page.                        |

#### Product Object

| Field                    | Type          | Description                                                     |
|--------------------------|---------------|-----------------------------------------------------------------|
| `code`                   | string        | Product barcode (unique identifier).                            |
| `product_name`           | string        | Display name of the product.                                    |
| `brands`                 | string        | Brand name(s), comma-separated.                                 |
| `categories`             | string        | Category hierarchy, comma-separated.                            |
| `generic_name`           | string        | Generic product description.                                    |
| `nutriscore_grade`       | string        | Nutri-score grade: `a` (best) to `e` (worst), or `null`.       |
| `countries`              | string        | Country availability, comma-separated.                          |
| `quantity`               | string        | Free-text product quantity (e.g. `"350 g"`, `"6x25cl"`).       |
| `product_quantity`       | number        | Numeric quantity value (e.g. `350`), or `null`.                 |
| `product_quantity_unit`  | string        | Quantity unit (e.g. `"g"`, `"ml"`), or `null`.                  |
| `image_url`              | string        | URL to front product image, or `null`.                          |
| `nutriments`             | object/null   | Per-100g nutritional data (see below), or `null`.               |
| `allergens_tags`         | array         | Allergen tags (e.g. `["en:milk", "en:nuts"]`).                  |
| `ingredients_text`       | string        | Plain text ingredients list.                                    |

#### Nutriments Object

All values are per 100g. Fields are `null` when not available for a product.

| Field                  | Type    | Unit  | Description              |
|------------------------|---------|-------|--------------------------|
| `energy_kcal_100g`     | number  | kcal  | Energy (calories).       |
| `fat_100g`             | number  | g     | Total fat.               |
| `saturated_fat_100g`   | number  | g     | Saturated fat.           |
| `carbohydrates_100g`   | number  | g     | Total carbohydrates.     |
| `sugars_100g`          | number  | g     | Sugars.                  |
| `proteins_100g`        | number  | g     | Protein.                 |
| `fiber_100g`           | number  | g     | Dietary fibre.           |
| `salt_100g`            | number  | g     | Salt.                    |
| `sodium_100g`          | number  | g     | Sodium.                  |

Results are sorted by relevance, then by popularity (`unique_scans_n` descending).

### Errors

**400 Bad Request** — Missing or invalid `q` parameter.

```json
{
  "error": "Query parameter \"q\" is required (1-200 chars)"
}
```

**503 Service Unavailable** — Search engine is unreachable.

```json
{
  "error": "Search service unavailable"
}
```

### Examples

Search for banana products:
```
GET /v1/search?q=banana
```

Search with nutri-score filter:
```
GET /v1/search?q=yogurt&nutriscore=a
```

Paginated results:
```
GET /v1/search?q=chocolate&page=2&limit=10
```

Combined filters:
```
GET /v1/search?q=biscuit&nutriscore=b&brand=LU&country=France
```

---

## Get Product by Code

Retrieve full details for a single product by its barcode.

```
GET /v1/products/:code
```

### Path Parameters

| Parameter | Type   | Required | Description           |
|-----------|--------|----------|-----------------------|
| `code`    | string | Yes      | Numeric barcode.      |

### Response

**200 OK**

Returns the complete [Product Object](#product-object) including all nutritional data, allergens, and ingredients.

```json
{
  "code": "3014260000001",
  "product_name": "Chocolate Biscuits",
  "brands": "LU",
  "categories": "Sugary snacks, Biscuits",
  "generic_name": "Chocolate sandwich biscuits",
  "nutriscore_grade": "d",
  "countries": "France,Germany",
  "quantity": "154 g",
  "product_quantity": 154,
  "product_quantity_unit": "g",
  "image_url": "https://images.openfoodfacts.org/images/products/301/426/000/0001/front_fr.5.400.jpg",
  "nutriments": {
    "energy_kcal_100g": 498,
    "fat_100g": 23,
    "saturated_fat_100g": 13,
    "carbohydrates_100g": 67,
    "sugars_100g": 39,
    "proteins_100g": 6.3,
    "fiber_100g": 2.8,
    "salt_100g": 0.73,
    "sodium_100g": 0.292
  },
  "allergens_tags": ["en:milk", "en:soybeans", "en:wheat"],
  "ingredients_text": "Wheat flour, sugar, chocolate..."
}
```

### Errors

**400 Bad Request** — Non-numeric code.

```json
{
  "error": "Product code must be a numeric barcode"
}
```

**404 Not Found** — Product does not exist in the index.

```json
{
  "error": "Product 9999999999999 not found"
}
```

**503 Service Unavailable** — Search engine is unreachable.

```json
{
  "error": "Search service unavailable"
}
```

### Examples

```
GET /v1/products/3014260000001
```

---

## Autocomplete

Fast prefix-based product name suggestions for type-ahead interfaces.

```
GET /v1/autocomplete
```

### Query Parameters

| Parameter | Type   | Required | Default | Description                                    |
|-----------|--------|----------|---------|------------------------------------------------|
| `q`       | string | Yes      | —       | Prefix string. 1–200 characters after trimming. |
| `limit`   | int    | No       | 10      | Max suggestions to return (min 1, max 20).     |

### Response

**200 OK**

```json
{
  "suggestions": [
    {
      "product_name": "Banana",
      "code": "1234567890123",
      "brands": "Chiquita"
    },
    {
      "product_name": "Banana Bread",
      "code": "9876543210987",
      "brands": "Bake House"
    }
  ]
}
```

| Field          | Type   | Description                          |
|----------------|--------|--------------------------------------|
| `suggestions`  | array  | Array of suggestion objects.         |

#### Suggestion Object

| Field          | Type   | Description                          |
|----------------|--------|--------------------------------------|
| `product_name` | string | Product name matching the prefix.    |
| `code`         | string | Product barcode.                     |
| `brands`       | string | Brand name(s).                       |

Typo tolerance is enabled — queries like `bnan` will match `banana`.

### Errors

**400 Bad Request** — Missing or invalid `q` parameter.

```json
{
  "error": "Query parameter \"q\" is required (1-200 chars)"
}
```

**503 Service Unavailable** — Search engine is unreachable.

```json
{
  "error": "Search service unavailable"
}
```

### Examples

Basic autocomplete:
```
GET /v1/autocomplete?q=choc
```

With custom limit:
```
GET /v1/autocomplete?q=ban&limit=5
```

Typo-tolerant search:
```
GET /v1/autocomplete?q=bnan
```
Returns products matching "banana".

---

## General Notes

- All endpoints return `application/json`.
- All text search is case-insensitive.
- Typo tolerance is enabled by default (up to 2 character edits).
- Search queries support multiple words (treated as separate tokens).
- All nutritional values are per 100g unless stated otherwise.
- Use `product_quantity` (numeric) for serving size calculations instead of parsing the free-text `quantity` field.
- Product data sourced from [Open Food Facts](https://world.openfoodfacts.org/).
