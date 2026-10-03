import { Button } from '@aahar/ui';
import { AppPageHeader, DataTableWrapper, EmptyState } from '@/components/design-system';
import { Input, Select } from '@/components/ui';

interface PageShellProps {
  actionLabel?: string;
  eyebrow: string;
  title: string;
}

export function PageShell({ actionLabel, eyebrow, title }: PageShellProps) {
  return (
    <section className="space-y-5">
      <AppPageHeader
        action={
          actionLabel ? (
            <Button disabled type="button">
              {actionLabel}
            </Button>
          ) : null
        }
        eyebrow={eyebrow}
        title={title}
      />
      <DataTableWrapper
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input disabled placeholder="Search" type="search" />
            <Select disabled>
              <option>Status</option>
            </Select>
          </div>
        }
      >
        <div className="p-6">
          <EmptyState
            action={
              actionLabel ? (
                <Button disabled type="button" variant="outline">
                  {actionLabel}
                </Button>
              ) : null
            }
            title="No records"
          />
        </div>
      </DataTableWrapper>
    </section>
  );
}
