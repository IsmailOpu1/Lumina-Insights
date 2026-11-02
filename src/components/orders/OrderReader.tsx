import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { functionErrorMessage } from '@/lib/dbErrors';
import { useT } from '@/i18n';

export interface ReadOrderItem {
  product_id: string | null;
  product_text: string;
  quantity: number;
  unit_price: number;
}

export interface ReadOrder {
  found: boolean;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  source: string | null;
  delivery_charge: number;
  date: string | null;
  items: ReadOrderItem[];
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Big enough to read chat text, small enough to upload quickly on mobile data.
const MAX_IMAGE_SIDE = 1600;

/** Shrinks a screenshot to a JPEG data URL; returns the original when the browser can't decode it (e.g. HEIC). */
async function shrink(file: File): Promise<{ dataUrl: string; type: string }> {
  const original = () => new Promise<{ dataUrl: string; type: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: String(reader.result), type: file.type });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), type: 'image/jpeg' };
  } catch {
    return original();
  }
}

/**
 * Paste a customer's chat, or add a screenshot of it, and AI reads the order
 * out of it. Nothing is saved: the result fills the order form for checking.
 */
export default function OrderReader({ onRead }: { onRead: (order: ReadOrder) => void }) {
  const { t } = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ dataUrl: string; type: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addImage(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    if (!IMAGE_TYPES.includes(file.type)) { setError(t('Please use a JPG, PNG, WebP or HEIC screenshot.')); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError(t('That screenshot is too large. Please use one under 5 MB.')); return; }
    try {
      setImage(await shrink(file));
    } catch {
      setError(t('Could not open that image.'));
    }
  }

  // A screenshot copied to the clipboard can be pasted straight into the box.
  function onPaste(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      addImage(file);
    }
  }

  async function read() {
    if (!text.trim() && !image) return;
    setReading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke('read-order', {
      body: {
        text: text.trim(),
        ...(image ? { image_base64: image.dataUrl.split(',')[1], image_type: image.type } : {}),
      },
    });
    setReading(false);
    if (fnError || data?.error) {
      setError(fnError ? await functionErrorMessage(fnError, t('Could not read the order. Please try again.')) : data.error);
      return;
    }
    const order = data as ReadOrder;
    if (!order.found) {
      setError(t("We couldn't find an order in that. Paste the part of the chat with the customer's details."));
      return;
    }
    setText('');
    setImage(null);
    onRead(order);
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Sparkles size={15} className="text-primary" /> {t('Fill from a chat')}
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        onPaste={onPaste}
        rows={3}
        aria-label={t('Customer chat')}
        placeholder={t('Paste the Messenger or WhatsApp chat here, or add a screenshot')}
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring max-md:text-base"
      />
      {image && (
        <div className="relative mt-2 inline-block">
          <img src={image.dataUrl} alt={t('Chat screenshot')} className="h-20 rounded-md border border-border object-cover" />
          <button
            type="button"
            onClick={() => setImage(null)}
            aria-label={t('Remove screenshot')}
            className="absolute -right-2 -top-2 rounded-full border border-border bg-card p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{error}</p>}
      <div className="mt-2 flex gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          className="hidden"
          onChange={(e) => { addImage(e.target.files?.[0]); e.target.value = ''; }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={reading}>
          <ImagePlus size={15} className="mr-1.5" /> {t('Screenshot')}
        </Button>
        <Button type="button" size="sm" onClick={read} disabled={reading || (!text.trim() && !image)} className="flex-1 font-semibold">
          {reading ? <><Loader2 size={15} className="mr-1.5 animate-spin" />{t('Reading...')}</> : t('Read order')}
        </Button>
      </div>
    </div>
  );
}
