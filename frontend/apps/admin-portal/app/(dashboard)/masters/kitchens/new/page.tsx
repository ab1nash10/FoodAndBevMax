import { KitchenCreatePageClient } from '@/components/organization/kitchen-create-page';
import { KitchensPageClient } from '@/components/organization/kitchens-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateKitchenPage() {
  return (
    <>
      <KitchensPageClient />
      <KitchenCreatePageClient />
    </>
  );
}
