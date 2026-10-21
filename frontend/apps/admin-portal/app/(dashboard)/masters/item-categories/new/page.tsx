import { ItemCategoriesPageClient } from '@/components/master-data/item-categories/item-categories-page';
import { ItemCategoryCreatePageClient } from '@/components/master-data/item-categories/item-category-create-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateItemCategoryPage() {
  return (
    <>
      <ItemCategoriesPageClient />
      <ItemCategoryCreatePageClient />
    </>
  );
}
