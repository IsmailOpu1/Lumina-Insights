import AddOrderModal from '@/components/AddOrderModal';
import { useFAB } from '@/context/FABContext';

/** The order form opened from the + button, on any page. */
export default function GlobalOrderModal() {
  const { notifySaved } = useFAB();
  return <AddOrderModal onSaved={() => notifySaved('order')} />;
}
