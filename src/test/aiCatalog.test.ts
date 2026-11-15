import { describe, expect, it } from 'vitest';
import { CATALOG_LIMIT, describeCatalog, findProduct, type CatalogItem } from '../../supabase/functions/_shared/catalog';

const item = (product_name: string, over: Partial<CatalogItem> = {}): CatalogItem => ({
  product_name,
  sku: null,
  cost_price: 600,
  selling_price: 1000,
  stock_quantity: 12,
  low_stock_threshold: 5,
  ...over,
});

describe('the catalog the AI reads', () => {
  it('lists each product with price, cost, margin and stock', () => {
    const text = describeCatalog([
      item('Handloom cotton saree', { sku: 'SAR-01' }),
      item('Jamdani saree', { stock_quantity: 2 }),
      item('Silk saree', { stock_quantity: 0 }),
    ], '৳');
    expect(text).toContain('PRODUCT CATALOG (3 products');
    expect(text).toContain('- Handloom cotton saree [SAR-01]: sells at ৳1,000, costs ৳600, 40% margin, 12 in stock');
    expect(text).toContain('Jamdani saree: sells at ৳1,000, costs ৳600, 40% margin, 2 in stock (low)');
    expect(text).toContain('Silk saree: sells at ৳1,000, costs ৳600, 40% margin, out of stock');
  });

  it('says how many products were left out instead of miscounting', () => {
    const many = Array.from({ length: CATALOG_LIMIT }, (_, i) => item(`Product ${String(i).padStart(3, '0')}`));
    const text = describeCatalog(many, '৳', 200);
    expect(text).toContain('PRODUCT CATALOG (200 products');
    expect(text).toContain(`...and ${200 - CATALOG_LIMIT} more products not listed`);
  });

  it('says so when there are no products yet', () => {
    expect(describeCatalog([], '৳')).toBe('PRODUCT CATALOG: no products added yet.');
  });
});

describe('finding the product the owner typed', () => {
  const items = [item('Handloom Cotton Saree'), item('Jamdani saree'), item('Wireless earbuds')];

  it('matches regardless of case and spacing', () => {
    expect(findProduct(items, '  handloom  cotton saree ')?.product_name).toBe('Handloom Cotton Saree');
  });

  it('matches a shorter or longer name when only one product fits', () => {
    expect(findProduct(items, 'earbuds')?.product_name).toBe('Wireless earbuds');
    expect(findProduct(items, 'Jamdani saree (red, 6 yards)')?.product_name).toBe('Jamdani saree');
  });

  it('does not guess when several products fit or the name is too short', () => {
    expect(findProduct(items, 'saree')).toBeUndefined();
    expect(findProduct(items, 'ea')).toBeUndefined();
    expect(findProduct(items, 'Leather wallet')).toBeUndefined();
  });
});
