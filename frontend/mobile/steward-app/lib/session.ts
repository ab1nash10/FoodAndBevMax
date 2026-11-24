import { useSyncExternalStore } from 'react';
import { session } from './api';

/** Signed in (with the steward's name and permissions), signed out, or still opening. */
export const useSession = () => useSyncExternalStore(session.subscribe, session.get);
