// Storage behind the app. With VITE_SUPABASE_URL set it talks to Supabase
// (shared between both phones, live updates). Without it, the dev server runs
// a local demo backed by localStorage, seeded from the imported spreadsheets.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Person } from './types'

const TABLES = ['categories', 'transactions', 'budgets', 'meal_plan', 'shopping_items', 'wishes', 'savings_balances', 'recurring', 'birthdays'] as const
export type Table = (typeof TABLES)[number]
export type Row = Record<string, unknown>
export type Match = Record<string, string | number | boolean>

/** Signed out (null), signed in but no name chosen yet ('unlinked'), or which of the two. */
export type Who = Person | 'unlinked' | null

/** Thrown by me() when the database tables don't exist yet (setup.sql not run). */
export const SETUP_DB = 'setup-db-missing'

/** A production build without the Supabase settings can't work: App shows setup help. */
export const missingConfig = import.meta.env.PROD && !(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export interface Backend {
  mode: 'supabase' | 'demo'
  me(): Promise<Who>
  /** Both members' display names. */
  people(): Promise<{ id: Person; name: string }[]>
  /** Links the signed-in login to a free slot with this name, or renames it if already linked. */
  claimPerson(name: string): Promise<void>
  signIn(email: string, password: string): Promise<string | null>
  signOut(): Promise<void>
  list<T>(table: Table, match?: Match): Promise<T[]>
  insert<T>(table: Table, row: Row): Promise<T>
  update(table: Table, match: Match, patch: Row): Promise<void>
  upsert(table: Table, rows: Row[], onConflict: string): Promise<void>
  remove(table: Table, match: Match): Promise<void>
  /** Calls back whenever the table changes (on either phone). Returns an unsubscribe function. */
  subscribe(table: Table, onChange: () => void): () => void
}

const PAGE = 1000

function supabaseBackend(client: SupabaseClient): Backend {
  const check = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
    return data
  }
  return {
    mode: 'supabase',
    async me() {
      const { data } = await client.auth.getSession()
      const user = data.session?.user
      if (!user) return null
      const { data: rows, error } = await client.from('people').select('id').eq('user_id', user.id)
      if (error) throw new Error(/does not exist|could not find the table|schema cache/i.test(error.message) ? SETUP_DB : error.message)
      // Not linked yet: people is only readable by members, so this is empty.
      return (rows?.[0]?.id as Person) ?? 'unlinked'
    },
    async people() {
      return check(await client.from('people').select('id, name')) as { id: Person; name: string }[]
    },
    async claimPerson(name) {
      check(await client.rpc('claim_person', { display_name: name }))
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password })
      return error?.message ?? null
    },
    async signOut() {
      await client.auth.signOut()
    },
    async list<T>(table: Table, match: Match = {}) {
      // PostgREST returns at most 1000 rows per request, so page through.
      const rows: T[] = []
      for (let from = 0; ; from += PAGE) {
        const page = check(await client.from(table).select('*').match(match).range(from, from + PAGE - 1)) as T[]
        rows.push(...page)
        if (page.length < PAGE) return rows
      }
    },
    async insert<T>(table: Table, row: Row) {
      return check(await client.from(table).insert(row).select().single()) as T
    },
    async update(table, match, patch) {
      check(await client.from(table).update(patch).match(match))
    },
    async upsert(table, rows, onConflict) {
      check(await client.from(table).upsert(rows, { onConflict }))
    },
    async remove(table, match) {
      check(await client.from(table).delete().match(match))
    },
    subscribe(table, onChange) {
      const channel = client
        .channel(`changes-${table}-${Math.random()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
        .subscribe()
      return () => void client.removeChannel(channel)
    },
  }
}

const DEMO_KEY = 'budget-demo-db'

async function demoBackend(): Promise<Backend> {
  let db: Record<Table, Row[]> = JSON.parse(localStorage.getItem(DEMO_KEY) ?? 'null')
  if (!db) {
    db = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<Table, Row[]>
    // Only the dev server can see the imported data; it is never part of a production build.
    if (import.meta.env.DEV) {
      const files = import.meta.glob<{ default: Partial<Record<Table, Row[]>> }>('./__fixtures__/all.json')
      const load = files['./__fixtures__/all.json']
      if (load) Object.assign(db, (await load()).default)
    }
    db.transactions = db.transactions.map((t, i) => ({ ...t, id: t.id ?? String(i) }))
    db.budgets = db.budgets.map((b) => ({ ...b, id: crypto.randomUUID() }))
  }
  // Demo data saved before a table existed (e.g. wishes) gets it empty.
  for (const t of TABLES) db[t] ??= []
  const listeners = new Map<Table, Set<() => void>>()
  const changed = (table: Table) => {
    localStorage.setItem(DEMO_KEY, JSON.stringify(db))
    listeners.get(table)?.forEach((fn) => fn())
  }
  const matches = (row: Row, match: Match) => Object.entries(match).every(([k, v]) => row[k] === v)
  let signedIn: Person | null = (localStorage.getItem('budget-demo-me') as Person) ?? null
  return {
    mode: 'demo',
    async me() {
      return signedIn
    },
    async people() {
      const names = JSON.parse(localStorage.getItem('budget-demo-names') ?? '{}') as Partial<Record<Person, string>>
      return (['a', 'b'] as Person[]).map((id) => ({ id, name: names[id] ?? `Pessoa ${id.toUpperCase()}` }))
    },
    async claimPerson(name) {
      if (!signedIn) return
      const names = JSON.parse(localStorage.getItem('budget-demo-names') ?? '{}')
      localStorage.setItem('budget-demo-names', JSON.stringify({ ...names, [signedIn]: name.trim() }))
    },
    async signIn(email) {
      signedIn = email.toLowerCase().startsWith('b') ? 'b' : 'a'
      localStorage.setItem('budget-demo-me', signedIn)
      return null
    },
    async signOut() {
      signedIn = null
      localStorage.removeItem('budget-demo-me')
    },
    async list<T>(table: Table, match: Match = {}) {
      return db[table].filter((r) => matches(r, match)).map((r) => ({ ...r })) as T[]
    },
    async insert<T>(table: Table, row: Row) {
      const created = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } // like the column defaults
      db[table].push(created)
      changed(table)
      return created as T
    },
    async update(table, match, patch) {
      db[table] = db[table].map((r) => (matches(r, match) ? { ...r, ...patch } : r))
      changed(table)
    },
    async upsert(table, rows, onConflict) {
      const keys = onConflict.split(',')
      for (const row of rows) {
        const key = Object.fromEntries(keys.map((k) => [k, row[k]])) as Match
        const i = db[table].findIndex((r) => matches(r, key))
        const stamped = { ...row, updated_at: new Date().toISOString() } // like the touch trigger
        if (i >= 0) db[table][i] = { ...db[table][i], ...stamped }
        else db[table].push({ id: crypto.randomUUID(), created_at: stamped.updated_at, ...stamped })
      }
      changed(table)
    },
    async remove(table, match) {
      db[table] = db[table].filter((r) => !matches(r, match))
      changed(table)
    },
    subscribe(table, onChange) {
      if (!listeners.has(table)) listeners.set(table, new Set())
      listeners.get(table)!.add(onChange)
      return () => void listeners.get(table)!.delete(onChange)
    },
  }
}

export async function createBackend(): Promise<Backend> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && key ? supabaseBackend(createClient(url, key)) : demoBackend()
}
