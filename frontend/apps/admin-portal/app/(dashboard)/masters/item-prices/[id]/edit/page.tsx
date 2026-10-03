import { ItemPriceEditPageClient } from '@/components/master-data/master-data-pages';

interface EditItemPricePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditItemPricePage({ params }: EditItemPricePageProps) {
  const { id } = await params;

  return <ItemPriceEditPageClient itemPriceId={id} />;
}
