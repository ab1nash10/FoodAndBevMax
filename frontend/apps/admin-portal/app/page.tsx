'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useGoHomeWhenSignedIn } from '@/components/auth/use-go-home';

// The bare site opens the user's start page; it needs their permissions, which only the
// browser holds, so the redirect happens here rather than on the server.
export default function Page() {
  const { isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  useGoHomeWhenSignedIn();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated, isReady, router]);

  return null;
}
