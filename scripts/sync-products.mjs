import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "..");
const contentDir = path.join(rootDir, "content", "products");
const generatedFilePath = path.join(
  rootDir,
  "src",
  "content",
  "products.generated.ts",
);
const legacyCatalogPath = path.join(rootDir, "src", "content", "products.json");

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureBootstrappedContent() {
  await fs.mkdir(contentDir, { recursive: true });

  const existingFiles = (await fs.readdir(contentDir)).filter((file) =>
    file.endsWith(".json"),
  );

  if (existingFiles.length > 0) {
    return;
  }

  if (!(await fileExists(legacyCatalogPath))) {
    throw new Error(
      "No Tina product files were found and the legacy bootstrap file is missing.",
    );
  }

  const legacyProducts = JSON.parse(
    await fs.readFile(legacyCatalogPath, "utf8"),
  );

  if (!Array.isArray(legacyProducts)) {
    throw new Error("Legacy products.json bootstrap data is invalid.");
  }

  await Promise.all(
    legacyProducts.map(async (product) => {
      if (!product || typeof product !== "object" || typeof product.sku !== "string") {
        throw new Error("Every bootstrap product must include a string sku.");
      }

      const outputPath = path.join(contentDir, `${product.sku}.json`);
      await fs.writeFile(outputPath, `${JSON.stringify(product, null, 2)}\n`);
    }),
  );
}

async function readProducts() {
  const productFiles = (await fs.readdir(contentDir))
    .filter((file) => file.endsWith(".json"))
    .sort();

  if (productFiles.length === 0) {
    throw new Error("No Tina product files were found in content/products.");
  }

  const products = [];

  for (const fileName of productFiles) {
    const filePath = path.join(contentDir, fileName);
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));

    if (!parsed || typeof parsed !== "object" || typeof parsed.sku !== "string") {
      throw new Error(`Invalid product file: ${fileName}`);
    }

    const salePercentOff = Number(parsed.sale_percent_off ?? 0);
    const onSale =
      (parsed.on_sale === true || salePercentOff > 0) &&
      Number.isFinite(salePercentOff) &&
      salePercentOff > 0;

    products.push({
      ...parsed,
      on_sale: onSale,
      sale_percent_off: onSale ? Math.min(95, Math.round(salePercentOff)) : 0,
      featured_on_homepage: parsed.featured_on_homepage === true,
      in_stock: parsed.in_stock !== false,
    });
  }

  return products.sort((left, right) => left.sku.localeCompare(right.sku));
}

async function writeGeneratedCatalog(products) {
  const fileContents = [
    'import type { Product } from "@/lib/types";',
    "",
    `const products: Product[] = ${JSON.stringify(products, null, 2)};`,
    "",
    "export default products;",
    "",
  ].join("\n");

  await fs.writeFile(generatedFilePath, fileContents);
}

async function main() {
  await ensureBootstrappedContent();
  const products = await readProducts();
  await writeGeneratedCatalog(products);
  console.log(`Synced ${products.length} products into src/content/products.generated.ts`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});