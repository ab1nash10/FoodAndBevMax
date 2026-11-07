import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import { getCitiesForState, INDIAN_STATES } from './india-locations';

test('a state lists its cities; an unknown or missing state lists none', () => {
  assert.ok(getCitiesForState('Delhi').includes('New Delhi'));
  assert.ok(getCitiesForState('Haryana').includes('Gurugram'));
  assert.deepEqual(getCitiesForState('Atlantis'), []);
  assert.deepEqual(getCitiesForState(undefined), []);
  // Names match exactly, as the select stores them.
  assert.deepEqual(getCitiesForState('delhi'), []);
});

test('the state list is alphabetical with no repeats, and every state has a city', () => {
  assert.deepEqual(INDIAN_STATES, [...INDIAN_STATES].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(INDIAN_STATES).size, INDIAN_STATES.length);
  for (const state of INDIAN_STATES) assert.ok(getCitiesForState(state).length > 0, state);
});
