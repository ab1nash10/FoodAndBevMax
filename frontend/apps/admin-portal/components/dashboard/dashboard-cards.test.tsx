import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClipboardList } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { InsightItem } from './insight-card';
import { KpiCard } from './kpi-card';
import { SortableTable, type SortableColumn } from './sortable-table';
import { WorkQueueCard } from './work-queue-card';

describe('a KPI card', () => {
  it('links to the list behind its number, with its trend', () => {
    render(
      <KpiCard
        delta={{ text: '▲ 12%', tone: 'good' }}
        foot="vs previous period"
        href="/inventory/transfers?date=7d"
        icon={ClipboardList}
        label="Transfers"
        scope="Last 7 days"
        sparkline={<span>trend</span>}
        value="75"
      />,
    );

    const card = screen.getByRole('link', { name: /Transfers/ });
    expect(card).toHaveAttribute('href', '/inventory/transfers?date=7d');
    expect(card).toHaveTextContent('Last 7 days');
    expect(card).toHaveTextContent('75');
    expect(card).toHaveTextContent('▲ 12%');
    expect(card).toHaveTextContent('trend');
    expect(card).toHaveTextContent('vs previous period');
  });

  it('says "All clear" in words instead of a bare 0, without a trend', () => {
    render(
      <KpiCard
        delta={{ text: '▼ 3', tone: 'info' }}
        empty="All clear"
        foot="Right now"
        href="/x"
        label="GRNs to verify"
        scope="Now"
        sparkline={<span>trend</span>}
        value="0"
      />,
    );

    const card = screen.getByRole('link');
    expect(card).toHaveTextContent('All clear');
    expect(card).not.toHaveTextContent('▼ 3');
    expect(card).not.toHaveTextContent('trend');
  });

  it('says the number could not be loaded', () => {
    render(
      <KpiCard error foot="Right now" href="/x" label="GRNs to verify" scope="Now" value="3" />,
    );

    const card = screen.getByRole('link');
    expect(card).toHaveTextContent('—');
    expect(card).toHaveTextContent('Could not load. Refresh to try again.');
    expect(card).not.toHaveTextContent('3');
  });

  it('holds its place while loading', () => {
    render(
      <KpiCard foot="Right now" href="/x" label="GRNs to verify" loading scope="Now" value="3" />,
    );

    expect(screen.getByRole('link')).not.toHaveTextContent('3');
    expect(screen.getByRole('link')).not.toHaveTextContent('Right now');
  });
});

describe('an insight', () => {
  it('links to its cause and says its tone in words, not colour alone', () => {
    render(
      <InsightItem
        cta="See transfers"
        href="/inventory/transfers"
        title="Acknowledgements are 18% faster"
        tone="good"
      />,
    );

    const link = screen.getByRole('link', { name: /Acknowledgements are 18% faster/ });
    expect(link).toHaveAttribute('href', '/inventory/transfers');
    expect(link).toHaveTextContent('Good news');
    expect(link).toHaveTextContent('See transfers');
  });
});

interface Place {
  id: string;
  name: string;
  pending: number | null;
}

const columns: Array<SortableColumn<Place>> = [
  { key: 'name', label: 'Location', render: (row) => row.name, sortValue: (row) => row.name },
  {
    align: 'end',
    key: 'pending',
    label: 'Pending',
    render: (row) => row.pending ?? '—',
    sortValue: (row) => row.pending,
  },
];
const places: Place[] = [
  { id: 'a', name: 'Saket', pending: 3 },
  { id: 'b', name: 'Patparganj', pending: 9 },
  { id: 'c', name: 'Vaishali', pending: null },
];

const firstCells = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('a sortable table', () => {
  it('starts in its default order, blanks last', () => {
    render(
      <SortableTable
        caption="Locations"
        columns={columns}
        defaultSort={{ dir: 'desc', key: 'pending' }}
        rowKey={(row) => row.id}
        rows={places}
        template="1fr 80px"
      />,
    );

    expect(firstCells()).toEqual(['Patparganj', 'Saket', 'Vaishali']);
    expect(screen.getByRole('columnheader', { name: /Pending/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('sorts text A–Z on the first click, and reverses on the next', async () => {
    const user = userEvent.setup();
    render(
      <SortableTable
        caption="Locations"
        columns={columns}
        defaultSort={{ dir: 'desc', key: 'pending' }}
        rowKey={(row) => row.id}
        rows={places}
        template="1fr 80px"
      />,
    );

    await user.click(screen.getByRole('button', { name: /Location/ }));
    expect(firstCells()).toEqual(['Patparganj', 'Saket', 'Vaishali']);
    expect(screen.getByRole('columnheader', { name: /Location/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    await user.click(screen.getByRole('button', { name: /Location/ }));
    expect(firstCells()).toEqual(['Vaishali', 'Saket', 'Patparganj']);
  });

  it('shows its footer row and an empty message', () => {
    render(
      <SortableTable
        caption="Locations"
        columns={columns}
        defaultSort={{ dir: 'desc', key: 'pending' }}
        emptyText="No locations yet."
        footer={['Total', '12']}
        rowKey={(row) => row.id}
        rows={[]}
        template="1fr 80px"
      />,
    );

    expect(screen.getByText('No locations yet.')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('can still be sorted while it has no rows', async () => {
    const user = userEvent.setup();
    render(
      <SortableTable
        caption="Locations"
        columns={columns}
        defaultSort={{ dir: 'desc', key: 'pending' }}
        rowKey={(row) => row.id}
        rows={[]}
        template="1fr 80px"
      />,
    );

    // Sorting by a new column reads the first row to pick a direction; with none it must not fail.
    await user.click(screen.getByRole('button', { name: /Location/ }));

    expect(screen.getByRole('columnheader', { name: /Location/ })).not.toHaveAttribute(
      'aria-sort',
      'none',
    );
  });
});

describe('the work queue', () => {
  const tabs = [
    {
      action: <a href="/inventory/transfers">View transfers</a>,
      count: 4,
      id: 'todo',
      label: 'Needs your action',
      panel: <p>Four transfers</p>,
    },
    { count: 2, id: 'late', label: 'Overdue', panel: <p>Two late GRNs</p> },
    { count: 0, id: 'done', label: 'Done today', panel: <p>Nothing yet</p> },
  ];

  it('shows the chosen tab’s panel and its own action', async () => {
    const user = userEvent.setup();
    render(<WorkQueueCard action={<a href="/all">View all</a>} tabs={tabs} />);

    expect(screen.getByRole('tab', { name: /Needs your action\s*4/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Four transfers');
    expect(screen.getByRole('link', { name: 'View transfers' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Overdue/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Two late GRNs');
    // A tab without its own action falls back to the card's.
    expect(screen.getByRole('link', { name: 'View all' })).toBeInTheDocument();
  });

  it('moves between tabs with the arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<WorkQueueCard defaultTab="late" tabs={tabs} />);

    screen.getByRole('tab', { name: /Overdue/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Done today/ })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Needs your action/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{End}');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Nothing yet');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Four transfers');
  });
});
