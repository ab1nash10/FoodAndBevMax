import { ItemCreatePageClient } from '@/components/master-data/items/item-create-page';
import { ItemsPageClient } from '@/components/master-data/items/items-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateItemPage() {
  return (
    <>
      <ItemsPageClient />
      <ItemCreatePageClient />
    </>
  );
}
