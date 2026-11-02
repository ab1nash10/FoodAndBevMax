import { redirect } from 'next/navigation';

// Audit Logs moved to Logs → Activity Logs; old links and bookmarks land there.
export default function AuditLogsMoved() {
  redirect('/logs/activity');
}
