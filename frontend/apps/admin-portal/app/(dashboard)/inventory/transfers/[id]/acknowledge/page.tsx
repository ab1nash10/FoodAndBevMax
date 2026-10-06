import { AcknowledgeTransferPageClient } from '@/components/inventory/transfers/acknowledge-transfer-page';

interface AcknowledgeTransferPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AcknowledgeTransferPage({ params }: AcknowledgeTransferPageProps) {
  const { id } = await params;

  return <AcknowledgeTransferPageClient transferId={id} />;
}
