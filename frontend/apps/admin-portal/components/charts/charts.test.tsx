import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { signedIn } from '@/test/auth';
import { DonutChart } from './donut-chart';
import { HorizontalBarList } from './horizontal-bar-list';
import { Sparkline } from './sparkline';
import { SplitBar } from './split-bar';
import { StackedBarChart, type StackBar } from './stacked-bar-chart';
import { TrendLine } from './trend-line';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));

describe('the donut chart', () => {
  it('is read out by its label, with a segment per share', () => {
    const { container } = render(
      <DonutChart
        ariaLabel="86% in full, 14% partial"
        centerLabel="in full"
        centerValue="86%"
        segments={[
          { className: 'full', key: 'full', value: 86 },
          { className: 'partial', key: 'partial', value: 14 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: '86% in full, 14% partial' })).toBeInTheDocument();
    expect(container.querySelectorAll('circle.full, circle.partial')).toHaveLength(2);
  });

  it('draws only the empty track when there is nothing to show', () => {
    const { container } = render(
      <DonutChart
        ariaLabel="No transfers"
        centerLabel="in full"
        centerValue="—"
        segments={[{ className: 'full', key: 'full', value: 0 }]}
      />,
    );

    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });
});

describe('the ranked bar list', () => {
  it('links each label the user may open and scales bars to the largest', () => {
    signedIn(['ITEM_VIEW']);
    render(
      <HorizontalBarList
        ariaLabel="Most transferred items"
        items={[
          { href: '/masters/items?id=i-1', key: 'i-1', label: 'Toned milk', value: 40 },
          { href: '/inventory/transfers', key: 'i-2', label: 'Bread', value: 10 },
        ]}
      />,
    );

    const list = within(screen.getByRole('list', { name: 'Most transferred items' }));
    expect(list.getByRole('link', { name: 'Toned milk' })).toHaveAttribute(
      'href',
      '/masters/items?id=i-1',
    );
    // Transfers is not this user's to open: plain text.
    expect(list.queryByRole('link', { name: 'Bread' })).not.toBeInTheDocument();
    const bars = list
      .getAllByRole('listitem')
      .map((item) => (item.querySelector('[style]') as HTMLElement).style.width);
    expect(bars).toEqual(['100%', '25%']);
  });
});

describe('the sparkline', () => {
  it('reads out its label and draws the trend', () => {
    const { container } = render(
      <Sparkline label="Rising over the week" values={[3, 5, null, 8]} />,
    );

    expect(screen.getByText('Rising over the week')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('keeps its height but draws nothing with fewer than two points', () => {
    const { container } = render(<Sparkline label="Too little data" values={[null, 4]} />);

    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByText('Too little data')).not.toBeInTheDocument();
  });
});

describe('the split bar', () => {
  it('splits by each part’s share', () => {
    render(
      <SplitBar
        ariaLabel="75% accepted, 25% rejected"
        parts={[
          { className: 'ok', key: 'ok', value: 3 },
          { className: 'no', key: 'no', value: 1 },
        ]}
      />,
    );

    const bar = screen.getByRole('img', { name: '75% accepted, 25% rejected' });
    expect([...bar.children].map((part) => (part as HTMLElement).style.width)).toEqual([
      '75%',
      '25%',
    ]);
  });
});

describe('the trend line', () => {
  it('draws the line and its threshold, read out by its label', () => {
    render(
      <TrendLine
        ariaLabel="Kitchen wastage, average 3.4%"
        firstLabel="Fri 25"
        lastLabel="Thu 1"
        threshold={5}
        thresholdLabel="5% limit"
        values={[2.8, 3.4, null, 5.6]}
      />,
    );

    const chart = screen.getByRole('img', { name: 'Kitchen wastage, average 3.4%' });
    expect(chart.querySelectorAll('path')).toHaveLength(2);
    expect(screen.getByText('5% limit')).toBeInTheDocument();
  });

  it('shows a single value as a dot', () => {
    const { container } = render(
      <TrendLine
        ariaLabel="One day"
        firstLabel="Thu 1"
        lastLabel="Thu 1"
        threshold={5}
        thresholdLabel="5% limit"
        values={[null, 4]}
      />,
    );

    expect(screen.getByRole('img').querySelectorAll('path')).toHaveLength(0);
    expect(container.querySelector('.rounded-full')).not.toBeNull();
  });
});

describe('the stacked bar chart', () => {
  const segments = [
    { className: 'full', key: 'full', label: 'Full' },
    { className: 'partial', key: 'partial', label: 'Partial' },
  ];
  const bars: StackBar[] = [
    { fullLabel: 'Tue, 29 Sept', label: 'Tue 29', values: { full: 5, partial: 1 } },
    { fullLabel: 'Wed, 30 Sept', label: 'Wed 30', values: { full: 8 } },
  ];

  it('describes the newest day until another bar is picked', async () => {
    const user = userEvent.setup();
    render(
      <StackedBarChart
        ariaLabel="Transfers by outcome"
        bars={bars}
        segments={segments}
        unit="transfers"
      />,
    );

    const chart = within(screen.getByRole('group', { name: 'Transfers by outcome' }));
    expect(
      chart.getByRole('button', { name: 'Wed, 30 Sept: 8 transfers, 8 full, 0 partial' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(chart.getByRole('button', { name: /^Tue, 29 Sept: 6 transfers/ }));
    expect(chart.getByRole('button', { name: /^Tue, 29 Sept/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('moves between bars with the arrow keys as one tab stop', async () => {
    const user = userEvent.setup();
    render(
      <StackedBarChart
        ariaLabel="Transfers by outcome"
        bars={bars}
        segments={segments}
        unit="transfers"
      />,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: /^Wed, 30 Sept/ })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: /^Tue, 29 Sept/ })).toHaveFocus();
    expect(screen.getByRole('button', { name: /^Wed, 30 Sept/ })).toHaveAttribute('tabindex', '-1');
  });

  it('says so when the period has nothing in it', () => {
    render(
      <StackedBarChart
        ariaLabel="Transfers by outcome"
        bars={[{ fullLabel: 'Wed, 30 Sept', label: 'Wed 30', values: {} }]}
        emptyText="No transfers this week."
        segments={segments}
        unit="transfers"
      />,
    );

    expect(screen.getByText('No transfers this week.')).toBeInTheDocument();
  });
});
