import { LEGAL } from '@/lib/legal';

/** A wa.me link that opens a chat with support, or null before a number is set. */
export function whatsAppSupportLink(message = 'Hi Lumina, I need help with') {
  const number = String(LEGAL.supportWhatsApp).replace(/\D/g, '');
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
