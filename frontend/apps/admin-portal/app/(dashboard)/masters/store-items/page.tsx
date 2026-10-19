import { redirect } from 'next/navigation';

// Store Items is now part of Item Mapping; old links and bookmarks still land on it.
export default function StoreItemsPage() {
  redirect('/masters/item-mapping?tab=store');
}
