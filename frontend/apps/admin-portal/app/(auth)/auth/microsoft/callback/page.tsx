import { Suspense } from 'react';
import { MicrosoftCallback } from '@/components/auth/microsoft-callback';

export default function MicrosoftCallbackPage() {
  return (
    <Suspense fallback={null}>
      <MicrosoftCallback />
    </Suspense>
  );
}
