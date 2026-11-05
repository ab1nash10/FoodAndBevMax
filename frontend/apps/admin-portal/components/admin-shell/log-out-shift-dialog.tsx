'use client';

import type { PosOwnShift } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import Link from 'next/link';
import { Modal } from '@/components/ui-controls';
import { OpenShiftCard } from '@/components/point-of-sale/open-shift-card';

/**
 * Asked on Log out while the user has a POS shift open: end it, or hand it over to the next
 * cashier, first. Logging out anyway leaves the shift open, as closing the browser would.
 */
export function LogOutShiftDialog({
  onClose,
  onLogOut,
  shift,
}: Readonly<{ onClose: () => void; onLogOut: () => void; shift: PosOwnShift | null }>) {
  return (
    <Modal
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onLogOut} type="button" variant="ghost">
            Log out anyway
          </Button>
          <Button onClick={onClose} type="button" variant="outline">
            Stay signed in
          </Button>
          {shift?.hasTill ? (
            <Button asChild>
              <Link href="/pos/billing" onClick={onClose}>
                Go to the POS
              </Link>
            </Button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open={shift !== null}
      title="End your shift before you log out"
    >
      {shift ? (
        <OpenShiftCard
          advice={
            shift.hasTill
              ? 'On that counter’s till, open End shift, count the cash, then Close sales, or Hand over to next person.'
              : 'That counter has no till, so it can’t be ended there. Ask an admin to end it under POS & Payment Machines → Counters.'
          }
          heading="You still have a POS shift open."
          lead="End it, or hand it over to the next cashier, before you log out."
          shift={shift}
        />
      ) : null}
    </Modal>
  );
}
