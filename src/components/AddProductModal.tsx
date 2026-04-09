import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import ModalShell from '@/components/ModalShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface ProductToEdit {
  id: string;
  product_name: string;
  sku: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  supplier: string | null;
}

interface Props {
  editProduct?: ProductToEdit | null;
  onClose?: () => void;
  onSaved?: () => void;
  externalOpen?: boolean;
}

export default function AddProductModal({ editProduct, onClose, onSaved, externalOpen }: Props) {
  const { activeModal, closeModal } = useFAB();
  const { ownerIdForQueries } = useAuth();
  const fabOpen = activeModal === 'product';
  const isOpen = externalOpen ?? fabOpen;
  const isEdit = !!editProduct;

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQty, setStockQty] = useState('0');
  const [threshold, setThreshold] = useState('10');
  const [supplier, setSupplier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    if (editProduct) {
      setName(editProduct.product_name);
      setSku(editProduct.sku || '');
      setCostPrice(editProduct.cost_price.toString());
      setSellingPrice(editProduct.selling_price.toString());
      setStockQty(editProduct.stock_quantity.toString());
      setThreshold(editProduct.low_stock_threshold.toString());
      setSupplier(editProduct.supplier || '');
    }
  }, [isOpen, editProduct]);

  const errors = {
    name: !name.trim() ? 'Product name is required' : '',
    costPrice: !costPrice || parseFloat(costPrice) <= 0 ? 'Cost price must be > 0' : '',
    sellingPrice: !sellingPrice || parseFloat(sellingPrice) <= 0 ? 'Selling price must be > 0' : '',
    stockQty: stockQty === '' || parseInt(stockQty) < 0 ? 'Stock must be ≥ 0' : '',
    threshold: threshold === '' || parseInt(threshold) < 0 ? 'Threshold must be ≥ 0' : '',
  };

  const isValid = Object.values(errors).every((e) => !e);
  const touch = (f: string) => setTouched((t) => ({ ...t, [f]: true }));

  function resetForm() {
    setName(''); setSku(''); setCostPrice(''); setSellingPrice('');
    setStockQty('0'); setThreshold('10'); setSupplier('');
    setTouched({}); setSubmitting(false);
  }

  function handleClose() {
    resetForm();
    if (onClose) onClose(); else closeModal();
  }

  async function handleSave() {
    setTouched({ name: true, costPrice: true, sellingPrice: true, stockQty: true, threshold: true });
    if (!isValid) return;
    setSubmitting(true);

    const payload = {
      product_name: name.trim(),
      sku: sku.trim() || null,
      cost_price: parseFloat(costPrice),
      selling_price: parseFloat(sellingPrice),
      stock_quantity: parseInt(stockQty),
      low_stock_threshold: parseInt(threshold),
      supplier: supplier.trim() || null,
    };

    if (isEdit && editProduct) {
      const { error } = await supabase.from('inventory').update(payload).eq('id', editProduct.id);
      if (error) { toast.error('Failed to update product', { description: error.message }); setSubmitting(false); return; }
      toast.success('Product updated ✓');
    } else {
      const { error } = await supabase.from('inventory').insert({ ...payload, owner_id: ownerIdForQueries });
      if (error) { toast.error('Failed to add product', { description: error.message }); setSubmitting(false); return; }
      toast.success('Product saved ✓');
    }
    handleClose();
    onSaved?.();
  }

  return (
    <ModalShell isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Product' : 'Add Product'}>
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="pname">Product Name *</Label>
          <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => touch('name')} placeholder="e.g. Premium T-Shirt" />
          {touched.name && errors.name && <p className="mt-1 text-xs font-medium text-destructive">{errors.name}</p>}
        </div>

        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. PANJ-001" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="costPrice">Cost Price ৳ *</Label>
            <Input id="costPrice" type="number" min={0.01} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} onBlur={() => touch('costPrice')} placeholder="0" />
            {touched.costPrice && errors.costPrice && <p className="mt-1 text-xs font-medium text-destructive">{errors.costPrice}</p>}
          </div>
          <div>
            <Label htmlFor="sprice">Selling Price ৳ *</Label>
            <Input id="sprice" type="number" min={0.01} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} onBlur={() => touch('sellingPrice')} placeholder="0" />
            {touched.sellingPrice && errors.sellingPrice && <p className="mt-1 text-xs font-medium text-destructive">{errors.sellingPrice}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="stockQty">Stock Quantity *</Label>
            <Input id="stockQty" type="number" min={0} value={stockQty} onChange={(e) => setStockQty(e.target.value)} onBlur={() => touch('stockQty')} />
            {touched.stockQty && errors.stockQty && <p className="mt-1 text-xs font-medium text-destructive">{errors.stockQty}</p>}
          </div>
          <div>
            <Label htmlFor="threshold">Low Stock Threshold *</Label>
            <Input id="threshold" type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} onBlur={() => touch('threshold')} />
            <p className="mt-1 text-xs text-muted-foreground">Alert when stock falls below this number</p>
            {touched.threshold && errors.threshold && <p className="mt-1 text-xs font-medium text-destructive">{errors.threshold}</p>}
          </div>
        </div>

        <div>
          <Label htmlFor="supplier">Supplier</Label>
          <Input id="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" />
        </div>

        <Button onClick={handleSave} disabled={!isValid || submitting} className="mt-2 h-12 w-full bg-primary font-bold text-base">
          {submitting ? 'Saving...' : isEdit ? 'Update Product' : 'Save Product'}
        </Button>
      </div>
    </ModalShell>
  );
}
