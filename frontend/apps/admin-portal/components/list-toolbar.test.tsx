import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ClearFiltersButton } from './clear-filters-button';
import { FilterChips, FilterField, FiltersMenu, RefreshButton, SortControl } from './list-toolbar';
import { Select } from './ui';

// A Filters menu as a list page holds it: a status dropdown and a date.
function Filters({ onClear }: { onClear?: () => void }) {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');

  return (
    <>
      <FiltersMenu activeCount={[status, from].filter(Boolean).length} onClear={onClear}>
        <FilterField label="Status">
          <Select onChange={(event) => setStatus(event.target.value)} value={status}>
            <option value="">All</option>
            <option value="active">Active</option>
          </Select>
        </FilterField>
        <FilterField label="From">
          <input onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
        </FilterField>
      </FiltersMenu>
      <button type="button">Elsewhere</button>
    </>
  );
}

const panel = () => screen.queryByRole('dialog', { name: 'Filters' });

describe('the Filters menu', () => {
  it('opens its panel with focus on the first filter', async () => {
    const user = userEvent.setup();
    render(<Filters />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));

    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Status/ })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('closes once a dropdown choice is made, and counts the filters set', async () => {
    const user = userEvent.setup();
    render(<Filters />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /^Status/ }), 'active');

    await vi.waitFor(() => expect(panel()).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Filters\s*1\s*set/ })).toHaveFocus();
  });

  it('stays open while a date is typed, and closes on Done', async () => {
    const user = userEvent.setup();
    render(<Filters />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    expect(panel()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await vi.waitFor(() => expect(panel()).not.toBeInTheDocument());
  });

  it('closes on Esc or a click outside', async () => {
    const user = userEvent.setup();
    render(<Filters />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(panel()).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    await vi.waitFor(() => expect(panel()).not.toBeInTheDocument());
  });

  it('offers Clear all only while a filter is set', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<Filters onClear={onClear} />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onClear).toHaveBeenCalled();
  });
});

describe('the filters in use', () => {
  it('shows a removable chip per filter, and Clear all', async () => {
    const user = userEvent.setup();
    const removeType = vi.fn();
    const clearAll = vi.fn();
    render(
      <FilterChips
        chips={[
          { label: 'Type', onRemove: removeType, value: 'Live' },
          { label: 'Kitchen', onRemove: vi.fn(), value: 'Tandoor' },
        ]}
        onClearAll={clearAll}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove filter Type: Live' }));
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(removeType).toHaveBeenCalled();
    expect(clearAll).toHaveBeenCalled();
  });

  it('shows nothing with no filter set', () => {
    const { container } = render(<FilterChips chips={[]} onClearAll={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('sorting', () => {
  it('offers each field both ways, in words, and reports field and direction', async () => {
    const user = userEvent.setup();
    const onSortByChange = vi.fn();
    const onOrderChange = vi.fn();
    render(
      <SortControl
        onOrderChange={onOrderChange}
        onSortByChange={onSortByChange}
        options={[
          { label: 'Created date', value: 'createdAt' },
          { label: 'Name', value: 'itemName' },
        ]}
        order="desc"
        sortBy="createdAt"
      />,
    );
    const sort = screen.getByRole('combobox', { name: /^Sort/ });

    expect(sort).toHaveValue('createdAt:desc');
    await user.selectOptions(sort, 'itemName:asc');

    expect(onSortByChange).toHaveBeenCalledWith('itemName');
    expect(onOrderChange).toHaveBeenCalledWith('asc');
  });

  it('hands both at once to a list that keeps them together', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SortControl
        onChange={onChange}
        options={[{ label: 'Name', value: 'itemName' }]}
        order="asc"
        sortBy="itemName"
      />,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: /^Sort/ }), 'itemName:desc');

    expect(onChange).toHaveBeenCalledWith('itemName', 'desc');
  });
});

describe('toolbar buttons', () => {
  it('refreshes the list', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RefreshButton onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows Clear filters only while a filter is set', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { rerender } = render(<ClearFiltersButton active={false} onClear={onClear} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<ClearFiltersButton active onClear={onClear} />);
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalled();
  });
});
