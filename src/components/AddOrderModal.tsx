import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import { SOURCES, ORDER_STATUSES, holdsStock } from '@/lib/constants';
import ModalShell from '@/components/ModalShell';
import OrderReader, { type ReadOrder, type ReadOrderItem } from '@/components/orders/OrderReader';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { History, Loader2, Sparkles, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { dbErrorMessage } from '@/lib/dbErrors';
import { format } from 'date-fns';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useCurrency } from '@/hooks/useCurrency';
import { useT } from '@/i18n';
import { createKeptStore } from '@/lib/keptWork';

interface InventoryItem {
  id: string;
  product_name: string;
  stock_quantity: number;
  selling_price: number;
  cost_price: number;
  low_stock_threshold: number;
}

export interface OrderToEdit {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  /** null when the product was deleted after the order was placed. */
  product_id: string | null;
  product_name?: string | null;
  quantity: number;
  selling_price: number;
  /** Product cost captured when the order was placed. */
  unit_cost?: number;
  shipping_cost: number;
  ad_cost?: number;
  source: string | null;
  status: string;
  date: string;
}

interface Props {
  editOrder?: OrderToEdit | null;
  /** Starts a new order from an existing one ("Duplicate"). */
  copyFrom?: OrderToEdit | null;
  onClose?: () => void;
  onSaved?: () => void;
  externalOpen?: boolean;
}

/** The rest of an order read from a chat, filled in after each save. */
interface Pending {
  customer: { name: string; phone: string; address: string };
  items: ReadOrderItem[];
}

const nativeSelectClass =
  'w-full h-[44px] px-3 rounded-lg border border-border bg-background text-foreground text-[15px] font-semibold cursor-pointer appearance-auto md:h-[44px] max-md:h-[48px] max-md:text-[16px]';

// The source and delivery cost of the last order, so a shop that sells on
// one channel with one courier doesn't pick them every time.
const DEFAULTS_KEY = 'lumina-order-defaults';
function loadDefaults(): { source: string; shippingCost: string } {
  try {
    const d = JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}');
    return {
      source: (SOURCES as readonly string[]).includes(d.source) ? d.source : '',
      shippingCost: typeof d.shippingCost === 'string' && d.shippingCost ? d.shippingCost : '0',
    };
  } catch {
    return { source: '', shippingCost: '0' };
  }
}
function saveDefaults(source: string, shippingCost: string) {
  try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ source, shippingCost })); } catch { /* private mode */ }
}

const phoneDigits = (v: string) => v.replace(/[^\d+]/g, '');

/** A new order typed but not saved yet. */
interface OrderDraft {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  productId: string;
  quantity: string;
  sellingPrice: string;
  shippingCost: string;
  adCost: string;
  source: string;
  status: string;
  date: string;
  pending: Pending | null;
  fromChat: { unmatched: string | null } | null;
}

// A half-typed new order survives closing the form, leaving the page and
// reloads (phones reload pages they put in the background), until it is
// saved or the seller starts fresh. Edits and duplicates aren't drafted.
const orderDraft = createKeptStore<{ draft: OrderDraft | null }>(
  'order-draft',
  () => ({ draft: null }),
  { maxAgeMs: 7 * 24 * 60 * 60 * 1000 }
);

export default function AddOrderModal({ editOrder, copyFrom, onClose, onSaved, externalOpen }: Props) {
  const { t } = useT();
  const { formatCurrency, symbol } = useCurrency();
  const { activeModal, closeModal } = useFAB();
  const { ownerIdForQueries, user } = useAuth();
  orderDraft.load(user?.id ?? null);
  const fabOpen = activeModal === 'order';
  const isOpen = externalOpen ?? fabOpen;
  const isEdit = !!editOrder;

  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [sellingPrice, setSellingPrice] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [adCost, setAdCost] = useState('0');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState<string>('Pending');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [orderNumber, setOrderNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Set when the form was filled from a chat, until the seller saves.
  const [fromChat, setFromChat] = useState<{ unmatched: string | null } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [returning, setReturning] = useState<{ orders: number } | null>(null);
  const [restored, setRestored] = useState(false);
  const drafts = !isEdit && !copyFrom;
  const customerTouched = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  async function loadNextNumber() {
    const { data } = await supabase
      .from('orders')
      .select('order_number')
      .order('created_at', { ascending: false })
      .limit(1);
    let next = 1;
    if (data && data.length > 0) {
      const match = data[0].order_number.match(/(\d+)/);
      if (match) next = parseInt(match[1]) + 1;
    }
    setOrderNumber(`ORD-${String(next).padStart(3, '0')}`);
  }

  useEffect(() => {
    if (!isOpen) return;
    setProductsLoading(true);
    setProductsError(false);
    (async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, product_name, selling_price, cost_price, stock_quantity, low_stock_threshold')
        .order('product_name', { ascending: true });
      if (error) {
        setProductsError(true);
        setProductsLoading(false);
        return;
      }
      setProducts((data as InventoryItem[]) || []);
      setProductsLoading(false);
    })();

    if (editOrder) {
      setCustomerName(editOrder.customer_name);
      setCustomerPhone(editOrder.customer_phone ?? '');
      setCustomerAddress(editOrder.customer_address ?? '');
      setProductId(editOrder.product_id ?? '');
      setQuantity(editOrder.quantity.toString());
      setSellingPrice(editOrder.selling_price.toString());
      setShippingCost(editOrder.shipping_cost.toString());
      setAdCost((editOrder.ad_cost ?? 0).toString());
      setSource(editOrder.source || '');
      setStatus(editOrder.status);
      setDate(editOrder.date);
      setOrderNumber(editOrder.order_number);
    } else {
      resetForm();
      const draft = drafts ? orderDraft.get().draft : null;
      if (draft) applyDraft(draft);
      if (copyFrom) {
        // A repeat order: same customer and product, new date and status.
        setCustomerName(copyFrom.customer_name);
        setCustomerPhone(copyFrom.customer_phone ?? '');
        setCustomerAddress(copyFrom.customer_address ?? '');
        setProductId(copyFrom.product_id ?? '');
        setQuantity(copyFrom.quantity.toString());
        setSellingPrice(copyFrom.selling_price.toString());
        setShippingCost(copyFrom.shipping_cost.toString());
        setAdCost((copyFrom.ad_cost ?? 0).toString());
        setSource(copyFrom.source || '');
      }
      loadNextNumber();
    }
  }, [isOpen, editOrder, copyFrom]);

  // Every change to a new order is kept as its draft; an empty form has none.
  useEffect(() => {
    if (!isOpen || !drafts) return;
    const typed = customerName || customerPhone || customerAddress || productId || pending;
    orderDraft.setter()({
      draft: typed
        ? { customerName, customerPhone, customerAddress, productId, quantity, sellingPrice, shippingCost, adCost, source, status, date, pending, fromChat }
        : null,
    });
  }, [isOpen, drafts, customerName, customerPhone, customerAddress, productId, quantity, sellingPrice, shippingCost, adCost, source, status, date, pending, fromChat]);

  function applyDraft(d: OrderDraft) {
    setCustomerName(d.customerName);
    setCustomerPhone(d.customerPhone);
    setCustomerAddress(d.customerAddress);
    setProductId(d.productId);
    setQuantity(d.quantity);
    setSellingPrice(d.sellingPrice);
    setShippingCost(d.shippingCost);
    setAdCost(d.adCost);
    setSource(d.source);
    setDate(d.date);
    setPending(d.pending);
    setFromChat(d.fromChat);
    customerTouched.current = Boolean(d.customerName);
    setRestored(true);
  }

  function startFresh() {
    orderDraft.reset();
    resetForm();
  }

  // A phone number the shop has seen before fills in the customer, unless
  // the seller already typed a name for this order.
  useEffect(() => {
    setReturning(null);
    if (!isOpen || isEdit) return;
    const phone = phoneDigits(customerPhone);
    if (phone.replace(/\D/g, '').length < 10) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, count } = await supabase
        .from('orders')
        .select('customer_name, customer_address', { count: 'exact' })
        .eq('customer_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1);
      if (cancelled || !data?.length) return;
      setReturning({ orders: count ?? data.length });
      if (!customerTouched.current) {
        setCustomerName((name) => name || data[0].customer_name);
        setCustomerAddress((address) => address || data[0].customer_address || '');
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [customerPhone, isOpen, isEdit]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  const qtyNum = parseInt(quantity) || 0;
  const keepsOriginalProduct = isEdit && (editOrder?.product_id ?? '') === productId;
  // Units this order already holds; cancelled and returned orders hold none.
  const heldByOrder = keepsOriginalProduct && editOrder && holdsStock(editOrder.status) ? editOrder.quantity : 0;
  const maxStock = selectedProduct ? selectedProduct.stock_quantity + heldByOrder : 0;
  const stockError = selectedProduct && holdsStock(status) && qtyNum > maxStock
    ? t('Only {n} units available', { n: maxStock })
    : '';
  // An order whose product was deleted can still be edited without one.
  const productDeleted = isEdit && !editOrder?.product_id;

  const errors = {
    customerName: !customerName.trim() ? t('Customer name is required') : '',
    productId: !productId && !(productDeleted && keepsOriginalProduct) ? t('Please select a product') : '',
    quantity: !quantity || qtyNum < 1 ? t('Minimum quantity is 1') : stockError,
    sellingPrice: !sellingPrice || parseFloat(sellingPrice) <= 0 ? t('Selling price is required') : '',
    source: !source ? t('Please select a source') : '',
    status: !status ? t('Please select a status') : '',
    date: !date ? t('Date is required') : '',
  };

  const isValid = Object.values(errors).every((e) => !e);
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  // Live profit preview. An existing order keeps the cost it was placed at,
  // matching how the database calculates its profit.
  const costPrice = keepsOriginalProduct && editOrder?.unit_cost !== undefined
    ? editOrder.unit_cost
    : selectedProduct?.cost_price ?? 0;
  const sp = parseFloat(sellingPrice) || 0;
  const sc = parseFloat(shippingCost) || 0;
  const ac = parseFloat(adCost) || 0;
  const revenue = sp * qtyNum;
  const cogs = costPrice * qtyNum;
  // A returned order earned nothing but still paid for delivery and ads.
  const returned = status === 'Returned';
  const profit = returned ? -sc - ac : revenue - cogs - sc - ac;
  const margin = !returned && revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';
  const breakevenAd = revenue - cogs - sc;

  function clearCustomerAndProduct() {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setProductId('');
    setQuantity('1');
    setSellingPrice('');
    setAdCost('0');
    setTouched({});
    setFromChat(null);
    setReturning(null);
    customerTouched.current = false;
  }

  function resetForm() {
    clearCustomerAndProduct();
    const defaults = loadDefaults();
    setShippingCost(defaults.shippingCost);
    setSource(defaults.source);
    setStatus('Pending');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setPending(null);
    setSubmitting(false);
    setRestored(false);
  }

  // Closing keeps a new order's draft; the form is reset when it next opens.
  function handleClose() {
    if (onClose) onClose();
    else closeModal();
  }

  function handleProductSelect(id: string) {
    setProductId(id);
    const p = products.find((pr) => pr.id === id);
    if (p) {
      setSellingPrice(p.selling_price.toString());
    }
    touch('productId');
  }

  function fillItem(customer: Pending['customer'], item: ReadOrderItem, rest: ReadOrderItem[]) {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerAddress(customer.address);
    setProductId(item.product_id ?? '');
    setQuantity(String(item.quantity || 1));
    const price = item.unit_price || products.find((p) => p.id === item.product_id)?.selling_price || 0;
    setSellingPrice(price ? String(price) : '');
    setFromChat({ unmatched: item.product_id ? null : item.product_text || null });
    setPending(rest.length ? { customer, items: rest } : null);
    customerTouched.current = Boolean(customer.name);
  }

  function applyRead(order: ReadOrder) {
    const customer = { name: order.customer_name, phone: order.customer_phone, address: order.customer_address };
    if (order.source) setSource(order.source);
    if (order.delivery_charge > 0) setShippingCost(String(order.delivery_charge));
    if (order.date) setDate(order.date);
    const [first, ...rest] = order.items.length
      ? order.items
      : [{ product_id: null, product_text: '', quantity: 1, unit_price: 0 }];
    fillItem(customer, first, rest);
    setTouched({});
  }

  async function handleSave() {
    setTouched({ customerName: true, productId: true, quantity: true, sellingPrice: true, source: true, status: true, date: true });
    if (!isValid) return;
    setSubmitting(true);

    const payload = {
      customer_name: customerName.trim(),
      customer_phone: phoneDigits(customerPhone) || null,
      customer_address: customerAddress.trim() || null,
      product_id: productId || null,
      quantity: qtyNum,
      selling_price: parseFloat(sellingPrice),
      shipping_cost: sc,
      ad_cost: ac,
      source,
      status,
      date,
    };

    if (isEdit && editOrder) {
      const { error } = await supabase.from('orders').update(payload).eq('id', editOrder.id);
      if (error) {
        toast.error(t('Update failed'), { description: dbErrorMessage(error.message) });
        setSubmitting(false);
        return;
      }
      toast.success(t('Order updated ✓'));
    } else {
      const { error } = await supabase.from('orders').insert({ ...payload, order_number: orderNumber, owner_id: ownerIdForQueries });
      if (error) {
        toast.error(t('Failed to create order'), { description: dbErrorMessage(error.message) });
        setSubmitting(false);
        return;
      }
      saveDefaults(source, shippingCost);
      orderDraft.reset();
      setRestored(false);
      toast.success(t('Order saved ✓'));
    }

    onSaved?.();
    // The next product from the same chat, without closing.
    if (!isEdit && pending) {
      setSubmitting(false);
      const [next, ...rest] = pending.items;
      fillItem(pending.customer, next, rest);
      setTouched({});
      loadNextNumber();
      return;
    }
    resetForm();
    handleClose();
  }

  const title = isEdit ? t('Edit order') : t('Add order');

  return (
    <ModalShell isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t('Order #')}</Label>
            <p className="text-sm font-semibold text-foreground">{orderNumber}</p>
          </div>
          {pending && (
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              {t('{n} more from this chat', { n: pending.items.length })}
            </span>
          )}
        </div>

        {restored && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium"><History size={13} className="text-primary" /> {t('Your unsaved order is back.')}</span>
            <button type="button" onClick={startFresh} className="shrink-0 font-semibold text-primary hover:underline">{t('Start fresh')}</button>
          </div>
        )}

        {!isEdit && !copyFrom && <OrderReader onRead={applyRead} />}

        {fromChat && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
            <p className="flex items-center gap-1.5 font-semibold"><Sparkles size={13} className="text-warning" /> {t('Filled from the chat. Check everything before saving.')}</p>
            {fromChat.unmatched && (
              <p className="mt-1 text-muted-foreground">{t('"{product}" is not in your products. Pick the right one below.', { product: fromChat.unmatched })}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="customerPhone">{t('Phone')}</Label>
            <Input
              id="customerPhone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
            />
            {returning && (
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
                <UserCheck size={13} /> {t('Returning customer · {n} orders', { n: returning.orders })}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="customerName">{t('Customer name')} *</Label>
            <Input
              id="customerName"
              ref={nameRef}
              value={customerName}
              onChange={(e) => { setCustomerName(e.target.value); customerTouched.current = true; }}
              onBlur={() => touch('customerName')}
              placeholder={t('Enter customer name')}
            />
            {touched.customerName && errors.customerName && <p className="mt-1 text-xs font-medium text-destructive">{errors.customerName}</p>}
          </div>
        </div>

        <div>
          <Label htmlFor="customerAddress">{t('Delivery address')}</Label>
          <Input
            id="customerAddress"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
            placeholder={t('House, road, area, district')}
          />
        </div>

        {/* Product — native select */}
        <div>
          <Label>{t('Product')} *</Label>
          {productsLoading ? (
            <SkeletonLoader variant="row" count={1} />
          ) : productsError ? (
            <p className="mt-1 text-xs font-medium text-destructive">{t('Failed to load products. Refresh.')}</p>
          ) : (
            <select
              value={productId}
              onChange={(e) => handleProductSelect(e.target.value)}
              onBlur={() => touch('productId')}
              required
              aria-label={t('Product')}
              className={nativeSelectClass}
            >
              {products.length === 0 ? (
                <option disabled value="">{t('No products — add in Inventory first')}</option>
              ) : (
                <>
                  <option value="">
                    {productDeleted ? t('{name} (deleted)', { name: editOrder?.product_name || t('Product') }) : t('Select product')}
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product_name} — {t('{n} in stock', { n: p.stock_quantity })}
                    </option>
                  ))}
                </>
              )}
            </select>
          )}
          {selectedProduct && (
            <p className={cn('mt-1 text-xs font-medium',
              selectedProduct.stock_quantity === 0 ? 'text-[#EF4444]' :
              selectedProduct.stock_quantity < selectedProduct.low_stock_threshold ? 'text-[#F59E0B]' :
              'text-muted-foreground'
            )}>
              {heldByOrder > 0
                ? t('{n} units available ({stock} in stock + {held} held by this order)', { n: maxStock, stock: selectedProduct.stock_quantity, held: heldByOrder })
                : t('{n} units in stock', { n: selectedProduct.stock_quantity })}
            </p>
          )}
          {touched.productId && errors.productId && <p className="mt-1 text-xs font-medium text-destructive">{errors.productId}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="quantity">{t('Quantity')} *</Label>
            <Input id="quantity" type="number" min={1} value={quantity} onFocus={(e) => e.target.select()} onChange={(e) => setQuantity(e.target.value)} onBlur={() => touch('quantity')} />
            {touched.quantity && errors.quantity && <p className="mt-1 text-xs font-medium text-destructive">{errors.quantity}</p>}
          </div>
          <div>
            <Label htmlFor="sellingPrice">{t('Selling price')} {symbol} *</Label>
            <Input id="sellingPrice" type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} onBlur={() => touch('sellingPrice')} placeholder="0" />
            {touched.sellingPrice && errors.sellingPrice && <p className="mt-1 text-xs font-medium text-destructive">{errors.sellingPrice}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="shippingCost">{t('Shipping cost')} {symbol}</Label>
            <Input id="shippingCost" type="number" min={0} step="0.01" value={shippingCost} onFocus={(e) => e.target.select()} onChange={(e) => setShippingCost(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label htmlFor="adCost">{t('Ad cost')} {symbol}</Label>
            <Input id="adCost" type="number" min={0} step="0.01" value={adCost} onFocus={(e) => e.target.select()} onChange={(e) => setAdCost(e.target.value)} placeholder="0" />
            <p className="mt-1 text-xs text-muted-foreground">{t('Ad spend for this specific order')}</p>
          </div>
        </div>

        {/* Source — native select. A new order always starts as Pending; its
            status is changed from the orders list, or here when editing. */}
        <div className={cn('grid gap-3', isEdit && 'grid-cols-2')}>
          <div>
            <Label>{t('Source')} *</Label>
            <select
              value={source}
              onChange={(e) => { setSource(e.target.value); touch('source'); }}
              onBlur={() => touch('source')}
              required
              aria-label={t('Source')}
              className={nativeSelectClass}
            >
              <option value="">{t('Select Source')}</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {touched.source && errors.source && <p className="mt-1 text-xs font-medium text-destructive">{errors.source}</p>}
          </div>

          {/* Status — native select */}
          {isEdit && <div>
            <Label>{t('Status')} *</Label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); touch('status'); }}
              onBlur={() => touch('status')}
              required
              aria-label={t('Status')}
              className={nativeSelectClass}
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{t(s)}</option>
              ))}
            </select>
            {touched.status && errors.status && <p className="mt-1 text-xs font-medium text-destructive">{errors.status}</p>}
          </div>}
        </div>

        <div>
          <Label htmlFor="orderDate">{t('Date')} *</Label>
          <Input id="orderDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => touch('date')} />
          {touched.date && errors.date && <p className="mt-1 text-xs font-medium text-destructive">{errors.date}</p>}
        </div>

        {/* Live Profit Preview */}
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
                <span className={cn('text-xl font-bold', profit > 0 ? 'text-primary' : 'text-destructive')}>
                  {formatCurrency(profit)}
                </span>
                <span className={cn('text-base font-bold', profit > 0 ? 'text-primary' : 'text-destructive')}>
                  {margin}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('Break-even ad spend')} {symbol}: {formatCurrency(Math.max(breakevenAd, 0))}</p>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-col gap-2">
          <Button onClick={() => handleSave()} disabled={!isValid || submitting} className="h-12 w-full font-bold text-base">
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('Saving...')}</> :
              isEdit ? t('Update order') : pending ? t('Save and fill the next product') : t('Save order')}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
