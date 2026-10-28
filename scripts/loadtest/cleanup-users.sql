-- Removes the load-test users from seed-users.sql and every row that points at them.
BEGIN;

CREATE TEMP TABLE loadtest_users ON COMMIT DROP AS
SELECT id FROM users WHERE employee_code LIKE 'LOADTEST-%';

DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM loadtest_users);
DELETE FROM user_permissions WHERE user_id IN (SELECT id FROM loadtest_users);
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM loadtest_users);
DELETE FROM user_hospitals WHERE user_id IN (SELECT id FROM loadtest_users);
DELETE FROM users WHERE id IN (SELECT id FROM loadtest_users);

COMMIT;
