import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import ModalShell from '@/components/ModalShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function GlobalProductModal() {
  const { activeModal, closeModal } = useFAB();
  const { ownerIdForQueries } = useAuth();
  const isOpen = activeModal === 'product';

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQty, setStockQty] = useState('0');
  const [threshold, setThreshold] = useState('10');
  const [supplier, setSupplier] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) { setName(''); setSku(''); setCostPrice(''); setSellingPrice(''); setStockQty('0'); setThreshold('10'); setSupplier(''); setSubmitting(false); }
  }, [isOpen]);

  const isValid = name.trim() && costPrice && parseFloat(costPrice) > 0 && sellingPrice && parseFloat(sellingPrice) > 0 && stockQty !== '' && parseInt(stockQty) >= 0 && threshold !== '' && parseInt(threshold) >= 0;

  async function handleSave() {
    if (!isValid) return;
    setSubmitting(true);
    const { error } = await supabase.from('inventory').insert({
      product_name: name.trim(),
      sku: sku.trim() || null,
      cost_price: parseFloat(costPrice),
      selling_price: parseFloat(sellingPrice),
      stock_quantity: parseInt(stockQty),
      low_stock_threshold: parseInt(threshold),
      supplier: supplier.trim() || null,
      owner_id: ownerIdForQueries,
    });
    if (error) { toast.error('Failed to add product', { description: error.message }); setSubmitting(false); return; }
    toast.success('Product added ✓');
    closeModal();
  }

  if (!isOpen) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={closeModal} title="Add Product">
      <div className="flex flex-col gap-4">
        <div>
          <Label>Product Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Premium T-Shirt" />
        </div>
        <div>
          <Label>SKU</Label>
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. PANJ-001" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cost Price ৳ *</Label>
            <Input type="number" min={0.01} step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Selling Price ৳ *</Label>
            <Input type="number" min={0.01} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Stock Quantity *</Label>
            <Input type="number" min={0} value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
          </div>
          <div>
            <Label>Low Stock Threshold *</Label>
            <Input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Alert when stock falls below this</p>
          </div>
        </div>
        <div>
          <Label>Supplier</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Optional" />
        </div>
        <Button onClick={handleSave} disabled={!isValid || submitting} className="mt-2 h-12 w-full font-bold text-base">
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Product'}
        </Button>
      </div>
    </ModalShell>
  );
}
