/** The two members are neutral slots; their names come from the people table. */
export type Person = 'a' | 'b'
export const PEOPLE: Person[] = ['a', 'b']
/** Display names, filled from the database right after sign-in (see setPersonNames). */
export const PERSON_NAME: Record<Person, string> = { a: 'Pessoa A', b: 'Pessoa B' }

export function setPersonNames(rows: { id: Person; name: string }[]) {
  for (const r of rows) if (r.name?.trim()) PERSON_NAME[r.id] = r.name.trim()
}

export type CategoryKind = 'expense' | 'income' | 'savings' | 'investment' | 'transfer'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  archived: boolean
  icon?: string | null // chosen in the app; null = default from icons.ts
}

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  description: string
  amount: number // negative = money out
  category_id: string
  paid_by: Person
  shared: boolean
  date_estimated: boolean
  created_at?: string // when it was recorded (set by the database)
}

export interface Budget {
  person: Person
  category_id: string
  month: string // YYYY-MM-01
  amount: number
}

export interface MealDay {
  week_start: string
  weekday: number
  menu: string
}

export interface Wish {
  id: string
  name: string
  description: string
  area: string // e.g. a room; '' = none
  quantity: number
  unit_price: number
  priority: WishPriority
}

/** 1 = alta, 2 = normal, 3 = baixa. */
export type WishPriority = 1 | 2 | 3

/** An entry that repeats every month, suggested on Novo from its day onwards. */
export interface Recurring {
  id: string
  description: string
  amount: number
  category_id: string
  paid_by: Person
  shared: boolean
  day: number // 1..28
  last_month: string | null // 'YYYY-MM' last added or skipped
}

export interface Birthday {
  id: string
  name: string
  month: number | null // null = date unknown
  day: number | null
  side: Person | null
  budget: number | null
  gift_year: number | null // year the gift was bought for
}

/** What one person has in savings, typed in by hand. */
export interface SavingsBalance {
  person: Person
  amount: number
  updated_at: string
}

export interface ShoppingItem {
  id: string
  week_start: string
  name: string
  checked: boolean
  created_at?: string
}
