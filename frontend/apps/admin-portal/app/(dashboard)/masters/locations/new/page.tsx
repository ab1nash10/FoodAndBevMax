import { HospitalCreatePageClient } from '@/components/organization/hospital-create-page';
import { HospitalsPageClient } from '@/components/organization/hospitals-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateLocationPage() {
  return (
    <>
      <HospitalsPageClient />
      <HospitalCreatePageClient />
    </>
  );
}
