import { TimeSlotCreatePageClient } from '@/components/master-data/time-slots/time-slot-create-page';
import { TimeSlotsPageClient } from '@/components/master-data/time-slots/time-slots-page';

// The form opens as the side panel over its list (FormShell), as editing a record does.
export default function CreateTimeSlotPage() {
  return (
    <>
      <TimeSlotsPageClient />
      <TimeSlotCreatePageClient />
    </>
  );
}
