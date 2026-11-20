import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/test/next-navigation';
import {
  BulkActionBar,
  DetailPanel,
  DetailsModal,
  FilterSearch,
  FilterTabs,
  FormPanel,
  Modal,
  MultiSelectDropdown,
  PasswordInput,
  QuantityStepper,
  SavedViewTabs,
  SegmentedControl,
  Toggle,
} from './ui-controls';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

beforeEach(() => vi.clearAllMocks());

describe('the modal', () => {
  it('opens as a labelled dialog with focus inside, and closes from its button, Esc or outside', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <button type="button">Open</button>
        <Modal
          description="Change the item."
          footer={<button type="button">Save</button>}
          onClose={onClose}
          open
          title="Edit item"
        >
          <input aria-label="Name" />
        </Modal>
      </>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Edit item' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(dialog).toHaveTextContent('Change the item.');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows nothing while closed', () => {
    render(
      <Modal onClose={vi.fn()} open={false} title="Edit item">
        body
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets Esc close only the dialog on top', async () => {
    const user = userEvent.setup();
    const under = vi.fn();
    const over = vi.fn();
    render(
      <>
        <Modal onClose={under} open title="Bills">
          bills
        </Modal>
        <Modal onClose={over} open title="Discard?">
          sure?
        </Modal>
      </>,
    );

    await user.keyboard('{Escape}');

    expect(over).toHaveBeenCalled();
    expect(under).not.toHaveBeenCalled();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    // jsdom lays nothing out; a shown control has client rects.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
      {},
    ] as unknown as DOMRectList);
    render(
      <>
        <button type="button">Outside</button>
        <Modal
          footer={<button type="button">Save</button>}
          onClose={vi.fn()}
          open
          title="Edit item"
        >
          <input aria-label="Name" />
        </Modal>
      </>,
    );

    screen.getByRole('button', { name: 'Save' }).focus();
    await user.tab();

    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    vi.restoreAllMocks();
  });
});

describe('a form panel', () => {
  it('goes back to its list when closed', async () => {
    const user = userEvent.setup();
    render(
      <FormPanel backHref="/masters/items" subtitle="A new item." title="Create Item">
        form
      </FormPanel>,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(router.push).toHaveBeenCalledWith('/masters/items');
  });
});

describe('the details pop-up', () => {
  it('lists each label with its value', () => {
    render(
      <DetailsModal
        onClose={vi.fn()}
        rows={[
          ['Code', 'ITM0001'],
          ['Status', 'Active'],
        ]}
        title="Veg Thali"
      />,
    );

    const dialog = within(screen.getByRole('dialog', { name: 'Veg Thali' }));
    expect(dialog.getByText('Code').nextElementSibling).toHaveTextContent('ITM0001');
  });
});

describe('the list search', () => {
  it('jumps to the search box on "/", outside any field', async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Other field" />
        <FilterSearch label="Search items" onChange={vi.fn()} value="" />
      </>,
    );

    await user.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveFocus();

    // Typed in another field, "/" stays a character.
    await user.click(screen.getByRole('textbox', { name: 'Other field' }));
    await user.keyboard('/');
    expect(screen.getByRole('textbox', { name: 'Other field' })).toHaveValue('/');
  });

  it('reports what is typed and lets Esc leave the box', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterSearch label="Search items" onChange={onChange} value="" />);

    await user.type(screen.getByRole('searchbox'), 'd');
    expect(onChange).toHaveBeenCalledWith('d');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });
});

describe('the password box', () => {
  it('shows and hides what was typed', async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" defaultValue="secret1" />);

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });
});

describe('the switch', () => {
  it('flips on a click, and not while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Toggle ariaLabel="Active" checked={false} onChange={onChange} />);

    await user.click(screen.getByRole('switch', { name: 'Active' }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Toggle ariaLabel="Active" checked disabled onChange={onChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is named by its visible label, and clicking the label flips it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle checked={false} label="KOT Print" onChange={onChange} />);

    expect(screen.getByRole('switch', { name: 'KOT Print' })).toBeInTheDocument();
    await user.click(screen.getByText('KOT Print'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('the quantity stepper', () => {
  function Stepper(props: { max?: number; min?: number; step?: number; start?: string }) {
    const [value, setValue] = useState(props.start ?? '1');
    return (
      <QuantityStepper
        label="Quantity"
        max={props.max}
        min={props.min}
        onChange={setValue}
        step={props.step}
        value={value}
      />
    );
  }

  it('steps up and down within its limits', async () => {
    const user = userEvent.setup();
    render(<Stepper max={2} min={1} />);

    expect(screen.getByRole('button', { name: 'Decrease Quantity' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Increase Quantity' }));
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(2);
    expect(screen.getByRole('button', { name: 'Increase Quantity' })).toBeDisabled();
  });

  it('keeps a typed decimal, held to the limits when the box is left', async () => {
    const user = userEvent.setup();
    render(<Stepper max={5} step={0.5} />);
    const box = screen.getByRole('spinbutton', { name: 'Quantity' });

    await user.clear(box);
    await user.type(box, '2.25');
    expect(box).toHaveValue(2.25);
    await user.clear(box);
    await user.type(box, '9');
    await user.tab();
    expect(box).toHaveValue(5);
  });
});

describe('choosers', () => {
  it('a segmented control marks the choice and skips a disabled one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Food type"
        onChange={onChange}
        options={[
          { label: 'Veg', value: 'VEG' },
          { disabled: true, label: 'Egg', title: 'Not served here', value: 'EGG' },
        ]}
        value="VEG"
      />,
    );

    expect(screen.getByRole('button', { name: 'Veg' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Egg' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('filter tabs show counts and report the pick', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FilterTabs
        label="Status"
        onChange={onChange}
        options={[
          { count: 4, label: 'Draft', value: 'DRAFT' },
          { count: 2, label: 'Posted', value: 'POSTED' },
        ]}
        value="DRAFT"
      />,
    );

    await user.click(screen.getByRole('button', { name: /^Posted\s*2$/ }));
    expect(onChange).toHaveBeenCalledWith('POSTED');
  });

  it('saved view tabs move with the arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    function Views() {
      const [value, setValue] = useState('all');
      return (
        <SavedViewTabs
          label="Views"
          onChange={setValue}
          value={value}
          views={[
            { count: 9, label: 'All', value: 'all' },
            { label: 'Draft', value: 'draft' },
            { label: 'Posted', value: 'posted' },
          ]}
        />
      );
    }
    render(<Views />);

    screen.getByRole('tab', { name: /All/ }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Posted' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: /All/ })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Draft' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a multi-select lists what is picked and adds or removes a choice', async () => {
    const user = userEvent.setup();
    function Days() {
      const [value, setValue] = useState<string[]>(['MONDAY']);
      return (
        <MultiSelectDropdown
          id="days"
          onChange={setValue}
          options={[
            { label: 'Monday', value: 'MONDAY' },
            { label: 'Tuesday', value: 'TUESDAY' },
          ]}
          placeholder="Every day"
          value={value}
        />
      );
    }
    render(<Days />);

    await user.click(screen.getByRole('button', { name: 'Monday' }));
    await user.click(screen.getByRole('checkbox', { name: 'Tuesday' }));
    expect(screen.getByRole('button', { name: 'Monday, Tuesday' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await user.click(screen.getByRole('checkbox', { name: 'Tuesday' }));
    expect(screen.getByRole('button', { name: 'Every day' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('list panels', () => {
  it('the bulk bar counts the selection and clears it', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<BulkActionBar count={3} onClear={onClear} />);

    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('3 selected');
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('the detail panel closes from its button or Esc', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DetailPanel
        label="Transfer details"
        meta="From Main Store"
        onClose={onClose}
        title="TRF0042"
      >
        <button type="button">Inside</button>
      </DetailPanel>,
    );

    await user.click(screen.getByRole('button', { name: 'Close details' }));
    await user.click(screen.getByRole('button', { name: 'Inside' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('complementary', { name: 'Transfer details' })).toHaveTextContent(
      'From Main Store',
    );
  });
});
