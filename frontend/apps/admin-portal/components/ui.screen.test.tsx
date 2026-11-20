import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Input } from './ui';

function Field({ name, ...props }: { autoCapitalize?: string; name: string }) {
  const [value, setValue] = useState('');

  return (
    <label>
      {name}
      <Input
        name={name}
        onChange={(event) => setValue(event.target.value)}
        value={value}
        {...props}
      />
    </label>
  );
}

describe('the shared Input', () => {
  it('puts a typed name in Title Case once the field is left', async () => {
    const user = userEvent.setup();
    render(<Field name="restaurantName" />);
    const box = screen.getByLabelText('restaurantName');

    await user.type(box, 'ppg main restaurant');
    // While typing only the first letter: the rest do not change under the cursor.
    expect(box).toHaveValue('Ppg main restaurant');
    await user.tab();
    expect(box).toHaveValue('Ppg Main Restaurant');
  });

  it('keeps a name exactly as typed when asked to (a bed such as "2220 b")', async () => {
    const user = userEvent.setup();
    render(<Field autoCapitalize="none" name="roomName" />);
    const box = screen.getByLabelText('roomName');

    await user.type(box, '2220 b');
    await user.tab();
    expect(box).toHaveValue('2220 b');
  });

  it('upper-cases a code as it is typed', async () => {
    const user = userEvent.setup();
    render(<Field name="counterCode" />);
    const box = screen.getByLabelText('counterCode');

    await user.type(box, 'ppg-c1');
    expect(box).toHaveValue('PPG-C1');
  });

  it('leaves technical fields that only look like names alone', async () => {
    const user = userEvent.setup();
    render(<Field name="hostName" />);
    const box = screen.getByLabelText('hostName');

    await user.type(box, 'max-pos-01');
    await user.tab();
    expect(box).toHaveValue('max-pos-01');
  });
});
