// Test helpers: small stand-ins for what Supabase provides (auth.users, auth.uid(),
// the anon/authenticated roles, the realtime publication), so the SQL can run in PGlite.
export const SUPABASE_STANDINS = `
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema auth to authenticated;
`
export const USER_1 = '00000000-0000-0000-0000-000000000001'
export const USER_2 = '00000000-0000-0000-0000-000000000002'
export const USER_3 = '00000000-0000-0000-0000-000000000003'
