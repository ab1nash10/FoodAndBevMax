import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ErrorText, OtpBoxes } from './otp-boxes';

// The boxes as the sign-in form holds them: the code lives in the form, shown here for checking.
function Form({ invalid = false }: { invalid?: boolean }) {
  const [code, setCode] = useState('');

  return (
    <>
      <OtpBoxes invalid={invalid} onChange={setCode} value={code} />
      <output>{code}</output>
    </>
  );
}

const box = (n: number) => screen.getByRole('textbox', { name: `Digit ${n}` });

describe('the OTP boxes', () => {
  it('shows six boxes and starts in the first', () => {
    render(<Form />);

    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    expect(box(1)).toHaveFocus();
  });

  it('moves on to the next box as each digit is typed', async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.keyboard('4821');

    expect(screen.getByRole('status')).toHaveTextContent('4821');
    expect(box(5)).toHaveFocus();
  });

  it('ignores letters', async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.keyboard('a1b2');

    expect(screen.getByRole('status')).toHaveTextContent(/^12$/);
  });

  it('fills every box from a pasted code, spaces and all', async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.paste('482 913');

    expect(screen.getByRole('status')).toHaveTextContent('482913');
    expect([1, 2, 3, 4, 5, 6].map((n) => (box(n) as HTMLInputElement).value).join('')).toBe(
      '482913',
    );
    expect(box(6)).toHaveFocus();
  });

  it('keeps only six digits when a longer code is pasted', async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.paste('12345678');

    expect(screen.getByRole('status')).toHaveTextContent(/^123456$/);
  });

  it('steps back and clears the box before on Backspace in an empty box', async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.keyboard('123');

    await user.keyboard('{Backspace}');

    expect(screen.getByRole('status')).toHaveTextContent(/^12$/);
    expect(box(3)).toHaveFocus();
  });

  it('moves between boxes with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(box(3)).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(box(2)).toHaveFocus();
  });

  it('marks every box invalid when the code was wrong', () => {
    render(<Form invalid />);

    for (const n of [1, 2, 3, 4, 5, 6]) expect(box(n)).toBeInvalid();
  });

  it('shows an error as an alert, and nothing when there is none', () => {
    const { rerender } = render(<ErrorText id="otp-error" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<ErrorText id="otp-error">The code is wrong.</ErrorText>);
    expect(screen.getByRole('alert')).toHaveTextContent('The code is wrong.');
  });
});
