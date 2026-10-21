import { RestaurantCreatePageClient } from '@/components/organization/restaurant-form-pages';
import { RestaurantsPageClient } from '@/components/organization/restaurants-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateRestaurantPage() {
  return (
    <>
      <RestaurantsPageClient />
      <RestaurantCreatePageClient />
    </>
  );
}
