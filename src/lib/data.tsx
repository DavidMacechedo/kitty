import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import type { ShowToast } from '../App'
import type { Backend, Match, Row, Table } from './backend'
import type { Budget, Category, Person, Transaction } from './types'

interface Data {
  backend: Backend
  me: Person
  categories: Category[]
  transactions: Transaction[]
  budgets: Budget[]
  loading: boolean
  error: string | null
  reportError: (e: Error) => void
}

const DataContext = createContext<Data | null>(null)

export function useData(): Data {
  const data = useContext(DataContext)
  if (!data) throw new Error('useData outside DataProvider')
  return data
}

// Supabase may return numeric columns as strings; normalise once here.
const toTx = (t: Transaction): Transaction => ({ ...t, amount: Number(t.amount) })
const toBudget = (b: Budget): Budget => ({ ...b, amount: Number(b.amount) })

export function DataProvider({ backend, me, children }: { backend: Backend; me: Person; children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reportError = useCallback((e: Error) => setError(e.message), [])
  const guard = (load: () => Promise<void>) => () => load().catch(reportError)
  const loadCategories = guard(async () =>
    setCategories((await backend.list<Category>('categories')).sort((a, b) => a.name.localeCompare(b.name, 'pt'))),
  )
  const loadTransactions = guard(async () =>
    setTransactions(
      (await backend.list<Transaction>('transactions')).map(toTx).sort((a, b) => b.date.localeCompare(a.date)),
    ),
  )
  const loadBudgets = guard(async () => setBudgets((await backend.list<Budget>('budgets')).map(toBudget)))

  useEffect(() => {
    Promise.all([loadCategories(), loadTransactions(), loadBudgets()]).finally(() => setLoading(false))
    const unsubscribe = [
      backend.subscribe('categories', loadCategories),
      backend.subscribe('transactions', loadTransactions),
      backend.subscribe('budgets', loadBudgets),
    ]
    // Warm up what other screens need, so e.g. Desejos opens with its numbers ready.
    for (const table of PREFETCH) fetchTable(backend, table, {}).catch(reportError)
    const offVisible = onForeground(() => {
      loadCategories()
      loadTransactions()
      loadBudgets()
    })
    return () => {
      unsubscribe.forEach((fn) => fn())
      offVisible()
      tableCache.clear() // signed out: forget everything
    }
  }, [backend])

  return (
    <DataContext.Provider value={{ backend, me, categories, transactions, budgets, loading, error, reportError }}>
      {children}
    </DataContext.Provider>
  )
}

/** Phones suspend background tabs; `refresh` runs when the app comes back to the foreground. */
function onForeground(refresh: () => void): () => void {
  const onVisible = () => document.visibilityState === 'visible' && refresh()
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}

// Tables a screen needs later, fetched as soon as the app opens.
const PREFETCH: Table[] = ['wishes', 'savings_balances', 'recurring', 'birthdays']

// Last rows seen per table + filter: reopening a screen shows them at once
// while a fresh copy loads, instead of flashing empty (or a 0 €) first.
const tableCache = new Map<string, unknown[]>()
const cacheKey = (table: Table, match: Match) => `${table}:${JSON.stringify(match)}`

async function fetchTable(backend: Backend, table: Table, match: Match) {
  tableCache.set(cacheKey(table, match), await backend.list(table, match))
}

/**
 * Rows of a table that only one screen needs (wishes, savings, shopping list…),
 * kept live like the shared data above. Undefined until the first load ever;
 * after that, the last rows seen while it refreshes. `map` normalises rows
 * (e.g. numeric columns, which Supabase may return as strings); pass a stable function.
 */
export function useTable<T>(table: Table, { match, map }: { match?: Match; map?: (row: T) => T } = {}): T[] | undefined {
  const { backend, reportError } = useData()
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const key = cacheKey(table, match ?? {})

  useEffect(() => {
    const filter = JSON.parse(key.slice(table.length + 1)) as Match
    let live = true
    const load = () =>
      fetchTable(backend, table, filter)
        .then(() => live && rerender())
        .catch(reportError)
    load()
    const offChanges = backend.subscribe(table, load)
    const offVisible = onForeground(load)
    return () => {
      live = false
      offChanges()
      offVisible()
    }
  }, [backend, table, key, reportError])

  const raw = tableCache.get(key) as T[] | undefined
  return useMemo(() => (raw && map ? raw.map(map) : raw), [raw, map])
}

/** Deletes a row and offers Anular, which puts the very same row back (same id and timestamps). */
export async function removeWithUndo(backend: Backend, table: Table, row: { id: string }, toast: ShowToast, message: string) {
  await backend.remove(table, { id: row.id })
  toast(message, { label: 'Anular', run: () => backend.insert(table, row as unknown as Row) })
}
