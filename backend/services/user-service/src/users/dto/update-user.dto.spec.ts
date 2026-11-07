import { strict as assert } from 'node:assert';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { test } from 'vitest';
import { UpdateUserDto } from './update-user.dto';

const failing = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(UpdateUserDto, body)).map((error) => error.property);

test('a field left out is unchanged, but null is refused (only designation may be cleared)', () => {
  assert.deepEqual(failing({}), []);
  assert.deepEqual(failing({ designation: null }), []);
  assert.deepEqual(failing({ email: null, mobile: null, name: null, status: null }), [
    'name',
    'mobile',
    'email',
    'status',
  ]);
});
