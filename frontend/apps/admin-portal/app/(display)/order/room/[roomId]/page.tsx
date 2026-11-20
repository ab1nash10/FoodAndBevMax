import type { Metadata, Viewport } from 'next';
import { RoomQr } from '@/components/qr-order/room-qr';

// A room's QR on a guest's phone: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { follow: false, index: false },
  title: 'Order food',
};

export const viewport: Viewport = { viewportFit: 'cover' };

/** /order/room/<roomId>: a room's QR. Opens its restaurant's ordering with the room filled in. */
export default async function RoomOrderPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;

  return <RoomQr roomId={roomId} />;
}
