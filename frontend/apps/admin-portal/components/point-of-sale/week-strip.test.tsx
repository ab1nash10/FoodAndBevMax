import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WeekStrip } from './week-strip';

// Thursday 19 November 2026.
const today = '2026-11-19';

describe('the week strip', () => {
  it('shows this week, Sunday to Saturday, with the picked day pressed', () => {
    render(<WeekStrip anchor={today} onSelect={vi.fn()} today={today} value="2026-11-17" />);

    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText(/15th Nov – 21st Nov/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tuesday 17 November' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('picks a past day, never one still to come', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<WeekStrip anchor={today} onSelect={onSelect} today={today} value={null} />);

    expect(screen.getByRole('button', { name: 'Friday 20 November' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Monday 16 November' }));

    expect(onSelect).toHaveBeenCalledWith('2026-11-16');
  });

  it('moves a week back and forward again', async () => {
    const user = userEvent.setup();
    render(<WeekStrip anchor={today} onSelect={vi.fn()} today={today} value={null} />);

    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByText('Week')).toBeInTheDocument();
    expect(screen.getByText(/8th Nov – 14th Nov/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saturday 14 November' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByText('This week')).toBeInTheDocument();
  });

  it('crosses a month and a year correctly', () => {
    render(<WeekStrip anchor="2027-01-01" onSelect={vi.fn()} today={today} value={null} />);

    expect(screen.getByText(/27th Dec – 2nd Jan/)).toBeInTheDocument();
  });
});
