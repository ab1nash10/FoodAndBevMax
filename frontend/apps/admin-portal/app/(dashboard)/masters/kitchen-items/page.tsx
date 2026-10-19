import { redirect } from 'next/navigation';

// Kitchen Items is now part of Item Mapping; old links and bookmarks still land on it.
export default function KitchenItemsPage() {
  redirect('/masters/item-mapping?tab=kitchen');
}
