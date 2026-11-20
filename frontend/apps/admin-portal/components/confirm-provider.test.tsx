import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ConfirmProvider,
  confirmStatusChange,
  useConfirm,
  type ConfirmOptions,
} from './confirm-provider';

// A button that asks, and reports the answer, as a screen's "Delete" or "Deactivate" does.
function Asker({
  onAnswer,
  options,
}: {
  onAnswer: (yes: boolean) => void;
  options: ConfirmOptions;
}) {
  const confirm = useConfirm();

  return (
    <button onClick={() => void confirm(options).then(onAnswer)} type="button">
      Ask
    </button>
  );
}

function setup(options: ConfirmOptions) {
  const onAnswer = vi.fn();
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <Asker onAnswer={onAnswer} options={options} />
    </ConfirmProvider>,
  );

  return { onAnswer, user };
}

describe('the confirm dialog', () => {
  it('shows nothing until something asks', () => {
    setup({ confirmLabel: 'Delete', title: 'Delete Veg Thali?' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks the question and answers yes on the confirm button', async () => {
    const { onAnswer, user } = setup({
      confirmLabel: 'Delete',
      description: 'It cannot be brought back.',
      title: 'Delete Veg Thali?',
    });

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Veg Thali?' });
    expect(dialog).toHaveAccessibleDescription('It cannot be brought back.');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onAnswer).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('answers no on Cancel', async () => {
    const { onAnswer, user } = setup({ confirmLabel: 'Delete', title: 'Delete Veg Thali?' });

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onAnswer).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('answers no when Esc is pressed, so the request never hangs', async () => {
    const { onAnswer, user } = setup({ confirmLabel: 'Delete', title: 'Delete Veg Thali?' });

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    // jsdom does not turn Esc into the dialog's cancel event; the browser does.
    screen.getByRole('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));

    await vi.waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false));
  });

  it('answers no on a click outside the card', async () => {
    const { onAnswer, user } = setup({ confirmLabel: 'Delete', title: 'Delete Veg Thali?' });

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await user.click(screen.getByRole('dialog'));

    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  it('words a deactivation as a warning and an activation plainly', async () => {
    const answers: boolean[] = [];
    function Switch() {
      const confirm = useConfirm();
      return (
        <>
          <button
            onClick={() =>
              void confirmStatusChange(confirm, { activate: false, name: 'Veg Thali' }).then((a) =>
                answers.push(a),
              )
            }
            type="button"
          >
            Off
          </button>
          <button
            onClick={() =>
              void confirmStatusChange(confirm, { activate: true, name: 'Veg Thali' }).then((a) =>
                answers.push(a),
              )
            }
            type="button"
          >
            On
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <Switch />
      </ConfirmProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Off' }));
    expect(
      screen.getByRole('dialog', { name: 'Deactivate Veg Thali?' }),
    ).toHaveAccessibleDescription('It stops being available until it is activated again.');
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    await user.click(screen.getByRole('button', { name: 'On' }));
    expect(screen.getByRole('dialog', { name: 'Activate Veg Thali?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(answers).toEqual([true, false]);
  });

  it('refuses to work without the provider, so a missing one is caught at once', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      render(<Asker onAnswer={vi.fn()} options={{ confirmLabel: 'OK', title: 'Sure?' }} />),
    ).toThrow('useConfirm needs a ConfirmProvider above it');
  });
});
