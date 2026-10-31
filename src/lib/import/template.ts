// A ready-made workbook for people starting fresh. Its headers match the
// built-in matcher exactly, so it imports without any matching step.

export async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const sheet = (rows: (string | number)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((wch) => ({ wch }));
    return ws;
  };

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Product name', 'SKU', 'Cost price', 'Selling price', 'Stock', 'Reorder level', 'Supplier'],
    ['Cotton Panjabi (M)', 'PNJ-M', 650, 1450, 24, 5, 'Rahim Textiles'],
    ['Tangail Saree', 'SAR-01', 1200, 2400, 10, 3, 'Tangail Weavers'],
  ], [26, 12, 12, 14, 8, 14, 20]), 'Products');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Date', 'Order no', 'Customer', 'Product', 'Qty', 'Unit price', 'Delivery cost', 'Channel', 'Status'],
    ['05/01/2024', 'INV-1001', 'Rahim Uddin', 'Cotton Panjabi (M)', 2, 1450, 60, 'Facebook', 'Delivered'],
    ['06/01/2024', 'INV-1002', 'Nusrat Jahan', 'Tangail Saree', 1, 2400, 120, 'Instagram', 'Delivered'],
  ], [12, 12, 18, 22, 6, 12, 14, 12, 12]), 'Orders');

  XLSX.utils.book_append_sheet(wb, sheet([
    ['Date', 'Category', 'Amount', 'Platform', 'Notes'],
    ['31/01/2024', 'Ad Spend', 3000, 'Facebook', 'January page boost'],
    ['31/01/2024', 'Shipping', 1800, 'Pathao', 'Courier bill'],
  ], [12, 14, 10, 12, 24]), 'Expenses');

  XLSX.writeFile(wb, 'Lumina-import-template.xlsx');
}
