/**
 * The roles listed on the Operators screen; every other role is on Admins. A fixed list of names
 * (the user's call, 2026-11-20), so a renamed or new role stays on Admins until it is added here.
 */
export const OPERATOR_ROLES = [
  'Delivery Operator',
  'Inventory Manager',
  'Kitchen Operator',
  'Restaurant/POS Operator',
];

export const isOperatorRole = (name: string) => OPERATOR_ROLES.includes(name);
