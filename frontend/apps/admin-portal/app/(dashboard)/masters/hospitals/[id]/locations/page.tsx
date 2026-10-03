import { HospitalLocationsPageClient } from '@/components/organization/hospitals-pages';

interface HospitalLocationsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function HospitalLocationsPage({ params }: HospitalLocationsPageProps) {
  const { id } = await params;

  return <HospitalLocationsPageClient hospitalId={id} />;
}
