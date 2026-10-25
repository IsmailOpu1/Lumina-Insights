// Friendly messages for exceptions raised by database triggers.
const MESSAGES: Record<string, string> = {
  insufficient_stock: 'Not enough stock for this order. Restock the product or lower the quantity.',
  product_not_in_workspace: 'That product does not belong to this workspace.',
};

export function dbErrorMessage(message: string): string {
  const code = Object.keys(MESSAGES).find((k) => message.includes(k));
  return code ? MESSAGES[code] : message;
}
