-- Run with: psql -v mesh_app_password=... -v mesh_migrator_password=...
-- Creates least-privilege application and migration roles. Both are NOBYPASSRLS.
SELECT format(
  'CREATE ROLE mesh_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'mesh_migrator_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mesh_migrator')
\gexec

SELECT format(
  'ALTER ROLE mesh_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'mesh_migrator_password'
)
\gexec

SELECT format(
  'CREATE ROLE mesh_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'mesh_app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mesh_app')
\gexec

SELECT format(
  'ALTER ROLE mesh_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'mesh_app_password'
)
\gexec

ALTER DATABASE mesh OWNER TO mesh_migrator;
GRANT CONNECT ON DATABASE mesh TO mesh_app;

GRANT USAGE, CREATE ON SCHEMA public TO mesh_migrator;
GRANT USAGE ON SCHEMA public TO mesh_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mesh_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mesh_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mesh_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO mesh_app;
