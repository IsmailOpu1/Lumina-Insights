import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFAB } from '@/context/FABContext';
import { useAuth } from '@/context/AuthContext';
import { EXPENSE_TYPES } from '@/lib/constants';
import ModalShell from '@/components/ModalShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const nativeSelectClass =
  'w-full h-[44px] px-3 rounded-lg border border-border bg-background text-foreground text-[15px] font-semibold cursor-pointer appearance-auto md:h-[44px] max-md:h-[48px] max-md:text-[16px]';

export default function GlobalExpenseModal() {
  const { activeModal, closeModal } = useFAB();
  const { ownerIdForQueries } = useAuth();
  const isOpen = activeModal === 'expense';

  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) { setType(''); setAmount(''); setPlatform(''); setNotes(''); setDate(format(new Date(), 'yyyy-MM-dd')); setSubmitting(false); }
  }, [isOpen]);

  const isValid = type && amount && parseFloat(amount) > 0 && date;

  async function handleSave() {
    if (!isValid) return;
    setSubmitting(true);
    const { error } = await supabase.from('expenses').insert({
      type,
      amount: parseFloat(amount),
      platform: platform.trim() || null,
      notes: notes.trim() || null,
      date,
      owner_id: ownerIdForQueries,
    });
    if (error) { toast.error('Failed to add expense', { description: error.message }); setSubmitting(false); return; }
    toast.success('Expense added ✓');
    closeModal();
  }

  if (!isOpen) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={closeModal} title="Add Expense">
      <div className="flex flex-col gap-4">
        <div>
          <Label>Type *</Label>
          <select value={type} onChange={(e) => setType(e.target.value)} required className={nativeSelectClass}>
            <option value="">Select Type</option>
            {EXPENSE_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
        <div>
          <Label>Amount ৳ *</Label>
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label>Platform</Label>
          <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="e.g. Facebook Ads" />
        </div>
        <div>
          <Label>Notes</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-border bg-background text-foreground text-[15px] resize-y"
          />
        </div>
        <div>
          <Label>Date *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button onClick={handleSave} disabled={!isValid || submitting} className="mt-2 h-12 w-full font-bold text-base">
          {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Expense'}
        </Button>
      </div>
    </ModalShell>
  );
}
