import { Panel, Skeleton } from '@/components/ui';

// Shown the moment a link is followed, until the page arrives: the shape most pages share (title,
// figures, a list), so a switch answers at once instead of leaving the old page up.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6" role="status">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton className="h-28 rounded-card" key={key} />
        ))}
      </div>
      <Panel className="space-y-3 p-5">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton className="h-10" key={key} />
        ))}
      </Panel>
    </div>
  );
}
