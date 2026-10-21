import { redirect } from 'next/navigation';

interface HospitalLocationsPageProps {
  params: Promise<{
    id: string;
  }>;
}

/** Older links: a location is edited in the side panel over the Locations list. */
export default async function HospitalLocationsPage({ params }: HospitalLocationsPageProps) {
  const { id } = await params;

  redirect(`/masters/locations/${id}/edit`);
}
