import { ItemPriceEditPageClient } from '@/components/master-data/item-prices/item-price-edit-page';

interface EditItemPricePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditItemPricePage({ params }: EditItemPricePageProps) {
  const { id } = await params;

  return <ItemPriceEditPageClient itemPriceId={id} />;
}
