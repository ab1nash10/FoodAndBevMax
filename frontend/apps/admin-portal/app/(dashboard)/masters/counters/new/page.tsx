import { redirect } from 'next/navigation';

export default function CreateCounterPage() {
  redirect('/masters/pos?tab=counters');
}
