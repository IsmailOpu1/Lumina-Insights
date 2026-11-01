import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import { SOURCES, ORDER_STATUSES, holdsStock } from '@/lib/constants';
import ModalShell from '@/components/ModalShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { dbErrorMessage } from '@/lib/dbErrors';
import { format } from 'date-fns';
import { useCurrency } from '@/hooks/useCurrency';
import { useT } from '@/i18n';

interface InventoryItem {
  id: string;
  product_name: string;
  stock_quantity: number;
  selling_price: number;
  cost_price: number;
  low_stock_threshold: number;
}

const nativeSelectClass =
  'w-full h-[44px] px-3 rounded-lg border border-border bg-background text-foreground text-[15px] font-semibold cursor-pointer appearance-auto md:h-[44px] max-md:h-[48px] max-md:text-[16px]';

export default function GlobalOrderModal() {
  const { t } = useT();
  const { formatCurrency, symbol } = useCurrency();
  const { activeModal, closeModal, notifySaved } = useFAB();
  const { ownerIdForQueries } = useAuth();
  const isOpen = activeModal === 'order';

  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sellingPrice, setSellingPrice] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [adCost, setAdCost] = useState('0');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('Pending');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [orderNumber, setOrderNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    supabase
      .from('inventory')
      .select('id, product_name, selling_price, cost_price, stock_quantity, low_stock_threshold')
      .order('product_name', { ascending: true })
      .then(({ data }) => setProducts((data as InventoryItem[]) || []));
    supabase
      .from('orders')
      .select('order_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        let next = 1;
        if (data && data.length > 0) {
          const match = data[0].order_number.match(/(\d+)/);
          if (match) next = parseInt(match[1]) + 1;
        }
        setOrderNumber(`ORD-${String(next).padStart(3, '0')}`);
      });
  }, [isOpen]);

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const qtyNum = parseInt(quantity) || 0;
  const costPrice = selectedProduct?.cost_price ?? 0;
  const sp = parseFloat(sellingPrice) || 0;
  const sc = parseFloat(shippingCost) || 0;
  const ac = parseFloat(adCost) || 0;
  const revenue = sp * qtyNum;
  const cogs = costPrice * qtyNum;
  // A returned order earned nothing but still paid for delivery and ads.
  const returned = status === 'Returned';
  const profit = returned ? -sc - ac : revenue - cogs - sc - ac;
  const margin = !returned && revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';

  const stockError = selectedProduct && holdsStock(status) && qtyNum > selectedProduct.stock_quantity
    ? t('Only {n} units available', { n: selectedProduct.stock_quantity })
    : '';

  const isValid = customerName.trim() && productId && qtyNum >= 1 && !stockError && sp > 0 && source && status && date;

  function resetForm() {
    setCustomerName(''); setProductId(''); setQuantity('1'); setSellingPrice('');
    setShippingCost('0'); setAdCost('0'); setSource(''); setStatus('Pending');
    setDate(format(new Date(), 'yyyy-MM-dd')); setSubmitting(false);
  }

  function handleProductSelect(id: string) {
    setProductId(id);
    const p = products.find((pr) => pr.id === id);
    if (p) setSellingPrice(p.selling_price.toString());
  }

  async function handleSave() {
    if (!isValid) return;
    setSubmitting(true);
    const { error } = await supabase.from('orders').insert({
      order_number: orderNumber,
      customer_name: customerName.trim(),
      product_id: productId,
      quantity: qtyNum,
      selling_price: sp,
      shipping_cost: sc,
      ad_cost: ac,
      source, status, date,
      owner_id: ownerIdForQueries,
    });
    if (error) { toast.error(t('Failed to create order'), { description: dbErrorMessage(error.message) }); setSubmitting(false); return; }
    toast.success(t('Order added ✓'));
    notifySaved('order');
    closeModal();
  }

  if (!isOpen) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={closeModal} title={t('Add order')}>
      <div className="flex flex-col gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">{t('Order #')}</Label>
          <p className="text-sm font-semibold text-foreground">{orderNumber}</p>
        </div>
        <div>
          <Label>{t('Customer name')} *</Label>
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('Enter customer name')} />
        </div>
        <div>
          <Label>{t('Product')} *</Label>
          <select value={productId} onChange={(e) => handleProductSelect(e.target.value)} required className={nativeSelectClass}>
            {products.length === 0 ? (
              <option disabled value="">{t('No products — add in Inventory first')}</option>
            ) : (
              <>
                <option value="">{t('Select product')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.product_name} — {t('{n} in stock', { n: p.stock_quantity })}</option>
                ))}
              </>
            )}
          </select>
          {selectedProduct && (
            <p className={cn('mt-1 text-xs font-medium',
              selectedProduct.stock_quantity === 0 ? 'text-destructive' :
              selectedProduct.stock_quantity < selectedProduct.low_stock_threshold ? 'text-warning' :
              'text-muted-foreground'
            )}>{t('{n} units in stock', { n: selectedProduct.stock_quantity })}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('Quantity')} *</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            {stockError && <p className="mt-1 text-xs font-medium text-destructive">{stockError}</p>}
          </div>
          <div>
            <Label>{t('Selling price')} {symbol} *</Label>
            <Input type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('Shipping cost')} {symbol}</Label>
            <Input type="number" min={0} step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>{t('Ad cost')} {symbol}</Label>
            <Input type="number" min={0} step="0.01" value={adCost} onChange={(e) => setAdCost(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('Source')} *</Label>
            <select value={source} onChange={(e) => setSource(e.target.value)} required className={nativeSelectClass}>
              <option value="">{t('Select Source')}</option>
              {SOURCES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <Label>{t('Status')} *</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} required className={nativeSelectClass}>
              {ORDER_STATUSES.map((s) => (<option key={s} value={s}>{t(s)}</option>))}
            </select>
          </div>
        </div>
        <div>
          <Label>{t('Date')} *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {selectedProduct && (
          <div className={cn('rounded-lg border p-4', profit > 0 ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5')}>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>{t('Revenue')} {symbol}</span><span>{formatCurrency(revenue)}</span></div>
              <div className="flex justify-between"><span>{t('COGS')} {symbol}</span><span>{formatCurrency(cogs)}</span></div>
              <div className="flex justify-between"><span>{t('Shipping')} {symbol}</span><span>{formatCurrency(sc)}</span></div>
              <div className="flex justify-between"><span>{t('Ad cost')} {symbol}</span><span>{formatCurrency(ac)}</span></div>
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <div className="flex items-center justify-between">
                <span className={cn('text-xl font-bold', profit > 0 ? 'text-primary' : 'text-destructive')}>{formatCurrency(profit)}</span>
                <span className={cn('text-base font-bold', profit > 0 ? 'text-primary' : 'text-destructive')}>{margin}%</span>
              </div>
            </div>
          </div>
        )}
        <Button onClick={handleSave} disabled={!isValid || submitting} className="mt-2 h-12 w-full font-bold text-base">
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('Saving...')}</> : t('Save order')}
        </Button>
      </div>
    </ModalShell>
  );
}
