// Pure helpers for describing the shop's products to the AI. Kept free of
// Deno and npm imports so the app's tests (Vitest) can check them too.

export interface CatalogItem {
  product_name: string;
  sku?: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
}

/** Most products listed in a prompt; past this the rest are counted. */
export const CATALOG_LIMIT = 80;

/**
 * The shop's products with price, cost, margin and stock, for prompts.
 * `total` is the full product count when only the first rows were fetched.
 */
export function describeCatalog(items: CatalogItem[], sym: string, total = items.length) {
  if (!items.length) return "PRODUCT CATALOG: no products added yet.";
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString("en-US")}`;
  const sorted = [...items].sort((a, b) => a.product_name.localeCompare(b.product_name));
  const shown = sorted.slice(0, CATALOG_LIMIT).map((p) => {
    const margin = p.selling_price > 0 ? `${Math.round(((p.selling_price - p.cost_price) / p.selling_price) * 100)}% margin` : "no price";
    const stock = p.stock_quantity <= 0 ? "out of stock" : `${p.stock_quantity} in stock${p.stock_quantity <= p.low_stock_threshold ? " (low)" : ""}`;
    return `- ${p.product_name}${p.sku ? ` [${p.sku}]` : ""}: sells at ${money(p.selling_price)}, costs ${money(p.cost_price)}, ${margin}, ${stock}`;
  });
  const count = Math.max(total, items.length);
  const hidden = count - shown.length;
  const more = hidden > 0 ? `\n- ...and ${hidden} more products not listed` : "";
  return `PRODUCT CATALOG (${count} products, today's prices and stock):\n${shown.join("\n")}${more}`;
}

/**
 * The inventory row whose name best matches what the owner typed: exact
 * first, then one name containing the other, ignoring case and spacing.
 */
export function findProduct<T extends { product_name: string }>(items: T[], typed: string): T | undefined {
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  const wanted = norm(typed);
  if (!wanted) return undefined;
  const exact = items.find((p) => norm(p.product_name) === wanted);
  if (exact) return exact;
  const close = items.filter((p) => {
    const name = norm(p.product_name);
    return name.length >= 3 && wanted.length >= 3 && (name.includes(wanted) || wanted.includes(name));
  });
  // Only a single clear match counts; two or more could be different products.
  return close.length === 1 ? close[0] : undefined;
}
