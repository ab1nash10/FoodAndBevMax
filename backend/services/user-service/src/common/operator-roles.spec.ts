import { describe, expect, it } from 'vitest';
import { isOperatorRole } from './operator-roles';

describe('operator roles', () => {
  it('puts the Restaurant/POS Operator (once POS Cashier) on Operators, admins elsewhere', () => {
    expect(isOperatorRole('Restaurant/POS Operator')).toBe(true);
    expect(isOperatorRole('POS Cashier')).toBe(false);
    expect(isOperatorRole('Admin')).toBe(false);
  });

  it('lists the Supervisor, who approves shifts, on Operators', () => {
    expect(isOperatorRole('Supervisor')).toBe(true);
  });
});
