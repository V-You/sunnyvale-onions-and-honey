import { defineConfig } from "tinacms";

export default defineConfig({
  branch: process.env.TINA_BRANCH || "main",
  clientId:
    process.env.NEXT_PUBLIC_TINA_CLIENT_ID || process.env.TINA_CLIENT_ID || "",
  token: process.env.TINA_TOKEN || "",

  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },

  media: {
    tina: {
      mediaRoot: "images",
      publicFolder: "public",
    },
  },

  schema: {
    collections: [
      {
        name: "product",
        label: "Products",
        path: "content/products",
        format: "json",
        fields: [
          { name: "sku", label: "SKU", type: "string", required: true },
          { name: "name", label: "Name", type: "string", required: true },
          {
            name: "category",
            label: "Category",
            type: "string",
            options: ["onion", "honey"],
          },
          {
            name: "price_cents",
            label: "Price (cents)",
            type: "number",
            required: true,
          },
          {
            name: "on_sale",
            label: "On sale",
            type: "boolean",
            ui: { defaultValue: false },
          },
          {
            name: "sale_percent_off",
            label: "Sale percent off",
            type: "number",
            ui: { defaultValue: 0 },
          },
          {
            name: "featured_on_homepage",
            label: "Featured on homepage",
            type: "boolean",
            ui: { defaultValue: false },
          },
          {
            name: "currency",
            label: "Currency",
            type: "string",
            ui: { defaultValue: "USD" },
          },
          {
            name: "description",
            label: "Description",
            type: "string",
            ui: { component: "textarea" },
          },
          { name: "short_tagline", label: "Tagline", type: "string" },
          { name: "color", label: "Color", type: "string" },
          {
            name: "flavor_profile",
            label: "Flavor profile",
            type: "string",
            list: true,
          },
          { name: "intensity", label: "Intensity (1-5)", type: "number" },
          {
            name: "gift_score",
            label: "Gift suitability (1-5)",
            type: "number",
          },
          { name: "weight_grams", label: "Weight (g)", type: "number" },
          { name: "allergens", label: "Allergens", type: "string", list: true },
          { name: "tags", label: "Tags", type: "string", list: true },
          { name: "image_url", label: "Image", type: "image" },
          {
            name: "in_stock",
            label: "In stock",
            type: "boolean",
            ui: { defaultValue: true },
          },
        ],
      },
    ],
  },
});
