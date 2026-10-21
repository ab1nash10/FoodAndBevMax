import { StoreCreatePageClient } from '@/components/organization/store-create-page';
import { StoresPageClient } from '@/components/organization/stores-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateStorePage() {
  return (
    <>
      <StoresPageClient />
      <StoreCreatePageClient />
    </>
  );
}
