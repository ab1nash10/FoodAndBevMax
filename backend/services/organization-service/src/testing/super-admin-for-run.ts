// No import of int-harness here: importing it installs the fetch guard.
type Raw = { $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T> };

/**
 * A Super Admin of this run's own, copied from the seeded one (roles and locations). A user may
 * hold one open shift and one signed-in session, so suites running side by side, or shifts left
 * open by an earlier run, would otherwise trip over each other.
 */
export async function superAdminForRun(
  prisma: Raw,
  label: string,
): Promise<{ id: string; sessionVersion: number }> {
  const [seeded] = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.deleted_at IS NULL
       JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL AND r.name = 'Super Admin'
      WHERE u.deleted_at IS NULL AND u.status = 'ACTIVE'
      ORDER BY u.created_at LIMIT 1`,
  );
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (!seeded) throw new Error('DATABASE_URL_TEST needs the seed: no active Super Admin');
  const [user] = await prisma.$queryRawUnsafe<{ id: string; sessionVersion: number }[]>(
    `INSERT INTO users (id, employee_code, name, mobile, hospital_id, updated_at)
     SELECT gen_random_uuid(), $2, $3, $4, hospital_id, now() FROM users WHERE id = $1::uuid
     RETURNING id, session_version AS "sessionVersion"`,
    seeded.id,
    `ISA${label}${run}`.toUpperCase(),
    `Int Super Admin ${label} ${run}`,
    `5${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
  );
  for (const [table, column] of [
    ['user_roles', 'role_id'],
    ['user_hospitals', 'hospital_id'],
  ]) {
    await prisma.$queryRawUnsafe(
      `INSERT INTO ${table} (id, user_id, ${column}, updated_at)
       SELECT gen_random_uuid(), $2::uuid, ${column}, now() FROM ${table}
        WHERE user_id = $1::uuid AND deleted_at IS NULL`,
      seeded.id,
      user!.id,
    );
  }
  return user!;
}
