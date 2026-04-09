import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import { SOURCES, ORDER_STATUSES, STATUS_COLORS } from '@/lib/constants';
import { formatTaka } from '@/lib/constants';
import ModalShell from '@/components/ModalShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import SkeletonLoader from '@/components/SkeletonLoader';

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
  product_id: string;
  quantity: number;
  selling_price: number;
  shipping_cost: number;
  ad_cost?: number;
  source: string | null;
  status: string;
  date: string;
}

interface Props {
  editOrder?: OrderToEdit | null;
  onClose?: () => void;
  onSaved?: () => void;
  externalOpen?: boolean;
}

const nativeSelectClass =
  'w-full h-[44px] px-3 rounded-lg border border-border bg-background text-foreground text-[15px] font-semibold cursor-pointer appearance-auto md:h-[44px] max-md:h-[48px] max-md:text-[16px]';

export default function AddOrderModal({ editOrder, onClose, onSaved, externalOpen }: Props) {
  const { activeModal, closeModal } = useFAB();
  const { ownerIdForQueries } = useAuth();
  const fabOpen = activeModal === 'order';
  const isOpen = externalOpen ?? fabOpen;
  const isEdit = !!editOrder;

  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(false);

  const [customerName, setCustomerName] = useState('');
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
      setProductId(editOrder.product_id);
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
      (async () => {
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
      })();
    }
  }, [isOpen, editOrder]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId]
  );

  const qtyNum = parseInt(quantity) || 0;
  const maxStock = selectedProduct
    ? selectedProduct.stock_quantity + (isEdit && editOrder?.product_id === productId ? editOrder.quantity : 0)
    : 0;
  const stockError = selectedProduct && qtyNum > maxStock
    ? `Only ${maxStock} units available`
    : '';

  const errors = {
    customerName: !customerName.trim() ? 'Customer name is required' : '',
    productId: !productId ? 'Please select a product' : '',
    quantity: !quantity || qtyNum < 1 ? 'Minimum quantity is 1' : stockError,
    sellingPrice: !sellingPrice || parseFloat(sellingPrice) <= 0 ? 'Selling price is required' : '',
    source: !source ? 'Please select a source' : '',
    status: !status ? 'Please select a status' : '',
    date: !date ? 'Date is required' : '',
  };

  const isValid = Object.values(errors).every((e) => !e);
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  // Live profit preview
  const costPrice = selectedProduct?.cost_price ?? 0;
  const sp = parseFloat(sellingPrice) || 0;
  const sc = parseFloat(shippingCost) || 0;
  const ac = parseFloat(adCost) || 0;
  const revenue = sp * qtyNum;
  const cogs = costPrice * qtyNum;
  const profit = revenue - cogs - sc - ac;
  const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';
  const breakevenAd = revenue - cogs - sc;

  function resetForm() {
    setCustomerName('');
    setProductId('');
    setQuantity('1');
    setSellingPrice('');
    setShippingCost('0');
    setAdCost('0');
    setSource('');
    setStatus('Pending');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTouched({});
    setSubmitting(false);
  }

  function handleClose() {
    resetForm();
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

  async function handleSave() {
    setTouched({ customerName: true, productId: true, quantity: true, sellingPrice: true, source: true, status: true, date: true });
    if (!isValid) return;
    setSubmitting(true);

    const payload = {
      customer_name: customerName.trim(),
      product_id: productId,
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
        toast.error('Update failed. Try again.', { description: error.message });
        setSubmitting(false);
        return;
      }
      toast.success('Order updated ✓');
    } else {
      const { error } = await supabase.from('orders').insert({ ...payload, order_number: orderNumber, owner_id: ownerIdForQueries });
      if (error) {
        toast.error('Failed to create order', { description: error.message });
        setSubmitting(false);
        return;
      }
      toast.success('Order saved ✓');
    }

    handleClose();
    onSaved?.();
  }

  return (
    <ModalShell isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Order' : 'Add Order'}>
      <div className="flex flex-col gap-4">
        <div>
          <Label className="text-xs text-muted-foreground">Order #</Label>
          <p className="text-sm font-semibold text-foreground">{orderNumber}</p>
        </div>

        <div>
          <Label htmlFor="customerName">Customer Name *</Label>
          <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} onBlur={() => touch('customerName')} placeholder="Enter customer name" />
          {touched.customerName && errors.customerName && <p className="mt-1 text-xs font-medium text-destructive">{errors.customerName}</p>}
        </div>

        {/* Product — native select */}
        <div>
          <Label>Product *</Label>
          {productsLoading ? (
            <SkeletonLoader variant="row" count={1} />
          ) : productsError ? (
            <p className="mt-1 text-xs font-medium text-destructive">Failed to load products. Refresh.</p>
          ) : (
            <select
              value={productId}
              onChange={(e) => handleProductSelect(e.target.value)}
              onBlur={() => touch('productId')}
              required
              className={nativeSelectClass}
            >
              {products.length === 0 ? (
                <option disabled value="">No products — add in Inventory first</option>
              ) : (
                <>
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product_name} — {p.stock_quantity} in stock
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
              {selectedProduct.stock_quantity} units in stock
            </p>
          )}
          {touched.productId && errors.productId && <p className="mt-1 text-xs font-medium text-destructive">{errors.productId}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="quantity">Quantity *</Label>
            <Input id="quantity" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} onBlur={() => touch('quantity')} />
            {touched.quantity && errors.quantity && <p className="mt-1 text-xs font-medium text-destructive">{errors.quantity}</p>}
          </div>
          <div>
            <Label htmlFor="sellingPrice">Selling Price ৳ *</Label>
            <Input id="sellingPrice" type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} onBlur={() => touch('sellingPrice')} placeholder="0" />
            {touched.sellingPrice && errors.sellingPrice && <p className="mt-1 text-xs font-medium text-destructive">{errors.sellingPrice}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="shippingCost">Shipping Cost ৳</Label>
            <Input id="shippingCost" type="number" min={0} step="0.01" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label htmlFor="adCost">Ad Cost ৳</Label>
            <Input id="adCost" type="number" min={0} step="0.01" value={adCost} onChange={(e) => setAdCost(e.target.value)} placeholder="0" />
            <p className="mt-1 text-xs text-muted-foreground">Ad spend for this specific order</p>
          </div>
        </div>

        {/* Source — native select */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Source *</Label>
            <select
              value={source}
              onChange={(e) => { setSource(e.target.value); touch('source'); }}
              onBlur={() => touch('source')}
              required
              className={nativeSelectClass}
            >
              <option value="">Select Source</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {touched.source && errors.source && <p className="mt-1 text-xs font-medium text-destructive">{errors.source}</p>}
          </div>

          {/* Status — native select */}
          <div>
            <Label>Status *</Label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); touch('status'); }}
              onBlur={() => touch('status')}
              required
              className={nativeSelectClass}
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {touched.status && errors.status && <p className="mt-1 text-xs font-medium text-destructive">{errors.status}</p>}
          </div>
        </div>

        <div>
          <Label htmlFor="orderDate">Date *</Label>
          <Input id="orderDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={() => touch('date')} />
          {touched.date && errors.date && <p className="mt-1 text-xs font-medium text-destructive">{errors.date}</p>}
        </div>

        {/* Live Profit Preview */}
        {selectedProduct && (
          <div className={cn('rounded-lg border p-4', profit > 0 ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5')}>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Revenue ৳</span><span>{formatTaka(revenue)}</span></div>
              <div className="flex justify-between"><span>COGS ৳</span><span>{formatTaka(cogs)}</span></div>
              <div className="flex justify-between"><span>Shipping ৳</span><span>{formatTaka(sc)}</span></div>
              <div className="flex justify-between"><span>Ad Cost ৳</span><span>{formatTaka(ac)}</span></div>
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <div className="flex items-center justify-between">
                <span className={cn('text-xl font-bold', profit > 0 ? 'text-primary' : 'text-destructive')}>
                  {formatTaka(profit)}
                </span>
                <span className={cn('text-base font-bold', profit > 0 ? 'text-primary' : 'text-destructive')}>
                  {margin}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Break-even Ad ৳: {formatTaka(Math.max(breakevenAd, 0))}</p>
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={!isValid || submitting} className="mt-2 h-12 w-full font-bold text-base">
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : isEdit ? 'Update Order' : 'Save Order'}
        </Button>
      </div>
    </ModalShell>
  );
}
