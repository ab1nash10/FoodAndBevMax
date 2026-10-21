import { HospitalLocationsPageClient } from '@/components/organization/hospital-locations-page';
import { HospitalsPageClient } from '@/components/organization/hospitals-page';

interface EditLocationPageProps {
  params: Promise<{
    id: string;
  }>;
}

// The form opens as the side panel over the list (FormShell), as editing other records does.
export default async function EditLocationPage({ params }: EditLocationPageProps) {
  const { id } = await params;

  return (
    <>
      <HospitalsPageClient />
      <HospitalLocationsPageClient hospitalId={id} />
    </>
  );
}
