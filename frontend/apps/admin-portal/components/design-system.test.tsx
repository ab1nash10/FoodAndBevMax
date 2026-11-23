import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AppPageHeader,
  EmptyState,
  FlowStepper,
  FoodTypeMarker,
  ListPager,
  RecordAvatar,
  StatusChip,
} from './design-system';

describe('the page header', () => {
  it('shows the title with its count, the description and actions', () => {
    render(
      <AppPageHeader
        action={<button type="button">New item</button>}
        count={42}
        description="One catalogue."
        title="Items"
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: /^Items\s*42$/ })).toBeInTheDocument();
    expect(screen.getByText('One catalogue.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New item' })).toBeInTheDocument();
  });
});

describe('the list pager', () => {
  it('says which rows are shown and pages through them', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const onLimitChange = vi.fn();
    render(
      <ListPager
        limit={25}
        noun="item"
        onLimitChange={onLimitChange}
        onPageChange={onPageChange}
        page={2}
        total={60}
        totalPages={3}
      />,
    );

    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'SPAN' && element.textContent === '26–50 of 60 items',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange.mock.calls).toEqual([[1], [3]]);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows' }), '50');
    expect(onLimitChange).toHaveBeenCalledWith(50);
  });

  it('stops at the ends, and names one row in the singular', () => {
    render(
      <ListPager limit={10} noun="item" onPageChange={vi.fn()} page={1} total={1} totalPages={1} />,
    );

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'SPAN' && element.textContent === '1–1 of 1 item',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Rows' })).not.toBeInTheDocument();
  });

  it('hides itself when there is nothing to page through', () => {
    const { container } = render(
      <ListPager limit={10} onPageChange={vi.fn()} page={1} total={0} totalPages={1} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe('the empty state', () => {
  it('says what is missing and offers the next step', () => {
    render(
      <EmptyState
        action={<button type="button">Clear filters</button>}
        description="Try another name."
        title="No items match"
      />,
    );

    expect(screen.getByRole('heading', { name: 'No items match' })).toBeInTheDocument();
    expect(screen.getByText('Try another name.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });
});

describe('record marks', () => {
  it('names the food type for screen readers, not by colour alone', () => {
    render(
      <>
        <FoodTypeMarker type="VEG" />
        <FoodTypeMarker type="NON_VEG" />
      </>,
    );

    expect(screen.getByRole('img', { name: 'Veg' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Non-veg' })).toBeInTheDocument();
  });

  it('shows a record’s initials, the food mark on its corner', () => {
    render(<RecordAvatar foodType="EGGETARIAN" name="egg omelette roll" />);

    expect(screen.getByText('EO')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Egg' })).toBeInTheDocument();
  });

  it('takes initials from letters, not brackets', () => {
    render(<RecordAvatar name="Khichdi (Light Diet)" />);

    expect(screen.getByText('KL')).toBeInTheDocument();
  });

  it('labels a status in words', () => {
    render(<StatusChip status="POSTED" />);

    expect(screen.getByText(/posted/i)).toBeInTheDocument();
  });
});

describe('the flow stepper', () => {
  it('lets a done step be reopened, but not the current or a later one', async () => {
    const user = userEvent.setup();
    const back = vi.fn();
    render(
      <FlowStepper
        label="New GRN"
        steps={[
          { label: 'Supplier', onSelect: back, state: 'done' },
          { label: 'Items', onSelect: vi.fn(), state: 'current' },
          { label: 'Review', state: 'todo' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: /Items/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /Items/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Review/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Supplier/ }));
    expect(back).toHaveBeenCalled();
  });
});
