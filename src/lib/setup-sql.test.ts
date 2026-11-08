// Runs supabase/setup.sql in a real (in-memory) Postgres, the way a new couple's
// Supabase project would, with small stand-ins for what Supabase provides
// (auth.users, auth.uid(), the anon/authenticated roles, the realtime publication).
import { PGlite } from '@electric-sql/pglite'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { SUPABASE_STANDINS, USER_1, USER_2, USER_3 } from './test-db'

const setupPath = new URL('../../supabase/setup.sql', import.meta.url)
const migrations = new URL('../../supabase/migrations', import.meta.url)


describe.skipIf(!existsSync(migrations))('setup.sql', () => {
  it('is up to date with the migrations', () => {
    execFileSync('node', ['scripts/build-setup-sql.mjs', '--check'], { cwd: new URL('../..', import.meta.url) })
  })
})

describe('a new install', () => {
  const db = new PGlite()
  // Runs `sql` as a signed-in user, like a request from the app.
  const as = async (uid: string, sql: string) => {
    await db.exec(`set test.uid = '${uid}'; set role authenticated;`)
    try {
      return await db.query<Record<string, unknown>>(sql)
    } finally {
      await db.exec('reset role;')
    }
  }

  beforeAll(async () => {
    await db.exec(SUPABASE_STANDINS)
    await db.exec(readFileSync(setupPath, 'utf-8'))
    await db.exec(`insert into auth.users values ('${USER_1}'), ('${USER_2}'), ('${USER_3}');
      grant usage on schema public to authenticated, anon;
      grant all on all tables in schema public to authenticated, anon;`)
  }, 30_000)

  it('starts with two empty places and the default categories', async () => {
    const people = await db.query('select id, name, user_id from people order by id')
    expect(people.rows).toEqual([
      { id: 'a', name: '', user_id: null },
      { id: 'b', name: '', user_id: null },
    ])
    const cats = await db.query<{ n: number }>('select count(*)::int as n from categories')
    expect(cats.rows[0].n).toBeGreaterThanOrEqual(10)
  })

  it('shows nothing to a login that has not claimed a place yet', async () => {
    expect((await as(USER_1, 'select * from categories')).rows).toEqual([])
  })

  it('lets the two logins claim a place each, and refuses a third', async () => {
    expect((await as(USER_1, "select claim_person('Rui') as p")).rows[0].p).toBe('a')
    expect((await as(USER_2, "select claim_person('Ana') as p")).rows[0].p).toBe('b')
    await expect(as(USER_3, "select claim_person('Intruso') as p")).rejects.toThrow(/duas pessoas/)
    // Calling it again only renames.
    expect((await as(USER_1, "select claim_person('Rui Silva') as p")).rows[0].p).toBe('a')
    const people = await db.query('select id, name from people order by id')
    expect(people.rows).toEqual([
      { id: 'a', name: 'Rui Silva' },
      { id: 'b', name: 'Ana' },
    ])
  })

  it('lets members use the app and keeps everyone else out', async () => {
    await as(USER_1, "insert into transactions (date, amount, category_id, paid_by, shared) select '2026-11-08', -12.5, id, 'a', true from categories where name = 'Supermercado'")
    expect((await as(USER_2, 'select amount from transactions')).rows).toHaveLength(1)
    expect((await as(USER_3, 'select amount from transactions')).rows).toEqual([])
    await expect(as(USER_3, "insert into wishes (name) values ('x')")).rejects.toThrow(/row-level security/)
  })

  it('does not let anyone claim a place without signing in', async () => {
    await db.exec('set role anon;')
    await expect(db.query("select claim_person('x')")).rejects.toThrow(/permission denied/)
    await db.exec('reset role;')
  })
})

