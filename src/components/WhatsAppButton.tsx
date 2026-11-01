import { MessageCircle } from 'lucide-react';
import { whatsAppSupportLink } from '@/lib/support';

/** Floating "chat with us" button for public pages. */
export default function WhatsAppButton() {
  const href = whatsAppSupportLink('Hi Lumina, I have a question about');
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <MessageCircle size={28} fill="currentColor" strokeWidth={1.5} />
    </a>
  );
}
