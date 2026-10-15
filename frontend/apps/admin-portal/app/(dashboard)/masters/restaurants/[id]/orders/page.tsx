import { RestaurantOrdersPageClient } from '@/components/organization/restaurant-orders-page';

interface RestaurantOrdersPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RestaurantOrdersPage({ params }: RestaurantOrdersPageProps) {
  const { id } = await params;

  return <RestaurantOrdersPageClient restaurantId={id} />;
}
