-- 2,000 throwaway users for the load test, all at Max-Smart (the location of this dev PC's till), signing in with the dev OTP
-- (mobile 7000000001..7000002000, code LOADTEST-0001..). Local database only; remove them with
-- cleanup-users.sql. Re-running adds only the missing ones.
-- Each block of 1,000: 1-500 POS Cashier, 501-750 Inventory Manager, 751-900 Kitchen Operator,
-- 901-1000 Admin.
BEGIN;

INSERT INTO users (id, employee_code, name, mobile, status, hospital_id, updated_at)
SELECT gen_random_uuid(), 'LOADTEST-' || lpad(i::text, 4, '0'), 'Load Test ' || lpad(i::text, 4, '0'),
       (7000000000 + i)::text, 'ACTIVE',
       (SELECT id FROM hospitals WHERE hospital_name = 'Max-Smart' AND deleted_at IS NULL LIMIT 1),
       now()
FROM generate_series(1, 2000) AS i
ON CONFLICT (mobile) DO NOTHING;

INSERT INTO user_hospitals (id, user_id, hospital_id, updated_at)
SELECT gen_random_uuid(), u.id, u.hospital_id, now()
FROM users u
WHERE u.employee_code LIKE 'LOADTEST-%'
ON CONFLICT (user_id, hospital_id) DO NOTHING;

INSERT INTO user_roles (id, user_id, role_id, updated_at)
SELECT gen_random_uuid(), u.id, r.id, now()
FROM users u
JOIN roles r ON r.deleted_at IS NULL AND r.name = CASE
  WHEN (substr(u.employee_code, 10)::int - 1) % 1000 < 500 THEN 'POS Cashier'
  WHEN (substr(u.employee_code, 10)::int - 1) % 1000 < 750 THEN 'Inventory Manager'
  WHEN (substr(u.employee_code, 10)::int - 1) % 1000 < 900 THEN 'Kitchen Operator'
  ELSE 'Admin'
END
WHERE u.employee_code LIKE 'LOADTEST-%'
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;
