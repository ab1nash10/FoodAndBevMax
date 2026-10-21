import { RestaurantEditPageClient } from '@/components/organization/restaurant-form-pages';
import { RestaurantsPageClient } from '@/components/organization/restaurants-page';

interface EditRestaurantPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditRestaurantPage({ params }: EditRestaurantPageProps) {
  const { id } = await params;

  // The form opens as the side panel over the list (FormShell), as editing other records does.
  return (
    <>
      <RestaurantsPageClient />
      <RestaurantEditPageClient restaurantId={id} />
    </>
  );
}
