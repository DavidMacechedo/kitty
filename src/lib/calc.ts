// Monthly calculations, ported from the "Extrato" spreadsheet (sheets Geral,
// Movimentos and Budget). All functions are pure so they can be unit-tested
// against the numbers the spreadsheet produced.

import type { Birthday, Budget, Category, Person, Recurring, SavingsBalance, Transaction, Wish } from './types'
import { PEOPLE, PERSON_NAME } from './types'

export const round2 = (n: number) => Math.round(n * 100) / 100

/** 'YYYY-MM' of a date, to compare with `transaction.date.slice(0, 7)`. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** Part of a transaction that belongs to a person: shared rows are split 50/50. */
export function shareOf(tx: Transaction, person: Person): number {
  if (tx.shared) return tx.amount / 2
  return tx.paid_by === person ? tx.amount : 0
}

export function inMonth(txs: Transaction[], month: string): Transaction[] {
  const prefix = month.slice(0, 7)
  return txs.filter((t) => t.date.startsWith(prefix))
}

const isSpendingKind = (c: Category | undefined) => !!c && (c.kind === 'expense' || c.kind === 'income')

export interface CategoryTotal {
  category: Category
  total: number
  a: number
  b: number
}

/** Geral!A:F: net total per category, and each person's share. Savings, investments and transfers are left out. */
export function categoryTotals(txs: Transaction[], categories: Category[]): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const totals = new Map<string, CategoryTotal>()
  for (const tx of txs) {
    const category = byId.get(tx.category_id)
    if (!category || !isSpendingKind(category)) continue
    let row = totals.get(category.id)
    if (!row) totals.set(category.id, (row = { category, total: 0, a: 0, b: 0 }))
    row.total += tx.amount
    row.a += shareOf(tx, 'a')
    row.b += shareOf(tx, 'b')
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)
}

export interface PersonSummary {
  gasto: number // negative
  ganho: number
  poupanca: number
  investido: number
}

export interface MonthSummary {
  a: PersonSummary
  b: PersonSummary
  total: PersonSummary
  net: number
}

/** Geral!O3:S7. Gasto/ganho are the sums of negative/positive category totals, so refunds net out within a category. */
export function monthSummary(txs: Transaction[], categories: Category[]): MonthSummary {
  const totals = categoryTotals(txs, categories)
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]))
  const person = (p: Person): PersonSummary => {
    const shares = totals.map((t) => t[p])
    const sumKind = (kind: string) =>
      -txs.filter((t) => kindOf.get(t.category_id) === kind).reduce((s, t) => s + shareOf(t, p), 0)
    return {
      gasto: shares.filter((v) => v < 0).reduce((s, v) => s + v, 0),
      ganho: shares.filter((v) => v > 0).reduce((s, v) => s + v, 0),
      poupanca: sumKind('savings'),
      investido: sumKind('investment'),
    }
  }
  const a = person('a')
  const b = person('b')
  const total = {
    gasto: a.gasto + b.gasto,
    ganho: a.ganho + b.ganho,
    poupanca: a.poupanca + b.poupanca,
    investido: a.investido + b.investido,
  }
  return { a, b, total, net: total.gasto + total.ganho }
}

export interface Settlement {
  debtor: Person | null
  creditor: Person | null
  amount: number
  /** Per person: transfers sent to the other + half of the shared rows they paid (both negative). */
  balance: Record<Person, number>
}

/**
 * Movimentos!T15:W18. Each person's balance is the transfers they sent to the
 * other plus half of the shared expenses they paid. Whoever has the lower
 * (more negative) balance paid more, and the other person owes the difference.
 */
export function settlement(txs: Transaction[], categories: Category[]): Settlement {
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]))
  const balance: Record<Person, number> = { a: 0, b: 0 }
  for (const tx of txs) {
    if (tx.shared) balance[tx.paid_by] += tx.amount / 2
    else if (kindOf.get(tx.category_id) === 'transfer') balance[tx.paid_by] += tx.amount
  }
  const diff = round2(balance.a - balance.b)
  if (diff === 0) return { debtor: null, creditor: null, amount: 0, balance }
  return diff < 0
    ? { debtor: 'b', creditor: 'a', amount: -diff, balance }
    : { debtor: 'a', creditor: 'b', amount: diff, balance }
}

/**
 * Budgets in force for a month: each person's rows from the latest month
 * at or before it that has any (a new month carries the previous budget over).
 */
export function budgetsForMonth(all: Budget[], month: string): Budget[] {
  const result: Budget[] = []
  for (const p of PEOPLE) {
    const months = [...new Set(all.filter((b) => b.person === p && b.month <= month).map((b) => b.month))].sort()
    const latest = months.at(-1)
    if (latest) result.push(...all.filter((b) => b.person === p && b.month === latest))
  }
  return result
}

export interface BudgetLine {
  category: Category
  budget: number
  real: number
  restante: number
  reparticao: number // budget / total budget
  dlu: number // 1 - real / budget: share of the budget still left
}

export interface BudgetReport {
  lines: BudgetLine[]
  budget: number
  real: number
  withinBudget: boolean
}

/** Real spending per budgeted category for one person (the sheet's per-person Budget tabs). */
export function budgetReport(
  txs: Transaction[],
  categories: Category[],
  budgets: Budget[],
  person: Person,
): BudgetReport {
  const totals = new Map(categoryTotals(txs, categories).map((t) => [t.category.id, t[person]]))
  const byId = new Map(categories.map((c) => [c.id, c]))
  const mine = budgets.filter((b) => b.person === person && byId.has(b.category_id))
  const totalBudget = mine.reduce((s, b) => s + b.amount, 0)
  const lines = mine.map((b): BudgetLine => {
    const real = Math.abs(Math.min(totals.get(b.category_id) ?? 0, 0))
    return {
      category: byId.get(b.category_id)!,
      budget: b.amount,
      real,
      restante: b.amount - real,
      reparticao: totalBudget ? b.amount / totalBudget : 0,
      dlu: b.amount ? 1 - real / b.amount : 0,
    }
  })
  const real = lines.reduce((s, l) => s + l.real, 0)
  return { lines, budget: totalBudget, real, withinBudget: real < totalBudget }
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Where `month` stands relative to today's month. */
function relation(month: string, today: Date): 'past' | 'current' | 'future' {
  const todayMonth = monthKey(today)
  const m = month.slice(0, 7)
  return m < todayMonth ? 'past' : m > todayMonth ? 'future' : 'current'
}

/**
 * Share of the month that has gone by, counting today (0..1). Drawn as the
 * "hoje" tick on budget bars: a bar past the tick is spending faster than
 * the month is passing.
 */
export function monthProgress(month: string, today: Date): number {
  const r = relation(month, today)
  if (r !== 'current') return r === 'past' ? 1 : 0
  return today.getDate() / daysInMonth(month)
}

/**
 * How much can still be spent per day, today included, to stay within
 * `remaining`. Null when the month isn't the current one or nothing is left.
 * (Replaces the spreadsheet's end-of-month forecast, which was off by up to
 * +87% because big one-off purchases got extrapolated.)
 */
export function dailyAllowance(remaining: number, month: string, today: Date): number | null {
  if (relation(month, today) !== 'current' || remaining <= 0) return null
  return remaining / (daysInMonth(month) - today.getDate() + 1)
}

/** Geral.xlsx "per category": net total per category for each month of a year. */
export function yearByCategory(txs: Transaction[], categories: Category[], year: number) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`)
  const perMonth = months.map((m) => categoryTotals(inMonth(txs, m), categories))
  const rows = new Map<string, { category: Category; months: number[] }>()
  perMonth.forEach((totals, i) => {
    for (const t of totals) {
      let row = rows.get(t.category.id)
      if (!row) rows.set(t.category.id, (row = { category: t.category, months: Array(12).fill(0) }))
      row.months[i] = t.total
    }
  })
  return {
    months,
    rows: [...rows.values()].sort((a, b) => sum(a.months) - sum(b.months)),
    summaries: months.map((m) => monthSummary(inMonth(txs, m), categories)),
  }
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export interface WishArea {
  area: string // '' = no area, shown last
  wishes: Wish[]
  total: number
}

export const wishTotal = (w: Wish) => Number(w.quantity) * Number(w.unit_price)

/** Desejos: wishes grouped by area (alphabetical, no-area last), each sorted by total, with subtotals. */
export function groupWishes(wishes: Wish[]): { areas: WishArea[]; total: number; count: number } {
  const lineTotal = wishTotal
  const byArea = new Map<string, Wish[]>()
  for (const w of wishes) byArea.set(w.area.trim(), [...(byArea.get(w.area.trim()) ?? []), w])
  const areas = [...byArea.entries()]
    .map(([area, items]) => ({
      area,
      wishes: items.sort((a, b) => lineTotal(b) - lineTotal(a)),
      total: items.reduce((s, w) => s + lineTotal(w), 0),
    }))
    .sort((a, b) => (a.area === '') !== (b.area === '') ? (a.area === '' ? 1 : -1) : a.area.localeCompare(b.area, 'pt'))
  return { areas, total: areas.reduce((s, a) => s + a.total, 0), count: wishes.length }
}

/**
 * Category for a settle-up transfer to `creditor`. By convention "Transferências <nome>"
 * is money sent to that person, so prefer the transfer category named after the
 * creditor, then any transfer category. Null = none exists yet.
 */
export function settlementCategory(categories: Category[], creditor: Person): Category | null {
  const transfers = categories.filter((c) => c.kind === 'transfer' && !c.archived)
  const name = PERSON_NAME[creditor].toLowerCase()
  return transfers.find((c) => c.name.toLowerCase().includes(name)) ?? transfers[0] ?? null
}

/** Date for a settle-up of `month`: today if it's the current month, else its last day (so it counts for that month). */
export function settlementDate(month: string, today: Date): string {
  const m = month.slice(0, 7)
  const t = monthKey(today)
  if (m === t) return `${t}-${String(today.getDate()).padStart(2, '0')}`
  return `${m}-${String(daysInMonth(month)).padStart(2, '0')}`
}

/** Months of spending the emergency fund has to cover (Geral "Car"!B2). */
export const FUND_MONTHS = 6

/**
 * Geral "Car"!B1: the average of every person-month "gasto" (both people's
 * cells together, so it is what one person spends per month), as a positive number.
 * Only complete months count: the current one and later are left out.
 */
export function averageMonthlySpending(
  txs: Transaction[],
  categories: Category[],
  today: Date,
): { average: number; months: string[] } {
  const current = monthKey(today)
  const byMonth = new Map<string, Transaction[]>()
  for (const t of txs) {
    const m = t.date.slice(0, 7)
    if (m < current) byMonth.set(m, [...(byMonth.get(m) ?? []), t])
  }
  const months = [...byMonth.keys()].sort()
  const cells = months.flatMap((m) => {
    const s = monthSummary(byMonth.get(m)!, categories)
    return PEOPLE.map((p) => -s[p].gasto)
  })
  return { average: cells.length ? cells.reduce((a, b) => a + b, 0) / cells.length : 0, months }
}

/** Geral "Car"!B3 and B20: the emergency fund and what's left of the savings for Desejos. */
export function goalsMoney(savings: number, average: number): { fund: number; free: number } {
  const fund = average * FUND_MONTHS
  return { fund, free: savings - fund }
}

export interface Savings {
  /** Typed-in balance plus the savings entries recorded since, per person who has a balance. */
  byPerson: Partial<Record<Person, { typed: number; added: number }>>
  total: number
  /** Of `total`, what came from entries recorded after the balances were typed. */
  added: number
  /** Latest time a balance was typed in. */
  updatedAt?: string
}

/**
 * Savings now: each typed-in balance plus the savings-category entries (deposits
 * add, withdrawals subtract) recorded after it was typed. Typing a new balance
 * starts the count again, so nothing is counted twice.
 */
export function currentSavings(balances: SavingsBalance[], txs: Transaction[], categories: Category[]): Savings {
  const savingsCats = new Set(categories.filter((c) => c.kind === 'savings').map((c) => c.id))
  const byPerson: Savings['byPerson'] = {}
  for (const b of balances) {
    const added = txs
      .filter((t) => savingsCats.has(t.category_id) && t.created_at && t.created_at > b.updated_at)
      .reduce((s, t) => s - shareOf(t, b.person), 0)
    byPerson[b.person] = { typed: Number(b.amount), added: round2(added) }
  }
  const parts = Object.values(byPerson)
  return {
    byPerson,
    total: parts.reduce((s, p) => s + p.typed + p.added, 0),
    added: parts.reduce((s, p) => s + p.added, 0),
    updatedAt: balances.map((b) => b.updated_at).sort().at(-1),
  }
}

/** Balances older than this get a gentle "update me" hint. */
export const SAVINGS_STALE_DAYS = 30

export const daysSince = (iso: string, today: Date) => Math.floor((today.getTime() - new Date(iso).getTime()) / 86_400_000)

/**
 * Wishes the free money covers together: in priority order (cheapest first within
 * a priority), skipping any that no longer fit, so the ✓ marks never add up to
 * more than what's available.
 */
export function affordableWishes(wishes: Wish[], free: number): Set<string> {
  const order = [...wishes].sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || wishTotal(a) - wishTotal(b))
  const fits = new Set<string>()
  let left = free
  for (const w of order) {
    if (wishTotal(w) > left) continue
    fits.add(w.id)
    left -= wishTotal(w)
  }
  return fits
}

/** Recurring entries to suggest today: their day has come and this month isn't done (added or skipped). */
export function dueRecurring(items: Recurring[], today: Date): Recurring[] {
  const month = monthKey(today)
  return items.filter((r) => r.last_month !== month && today.getDate() >= r.day)
}

/** The date a recurring entry gets this month. */
export const recurringDate = (r: Recurring, today: Date) => `${monthKey(today)}-${String(r.day).padStart(2, '0')}`

/** The next time the birthday comes round (today counts), or null when the date is unknown. */
export function nextBirthday(b: Birthday, today: Date): Date | null {
  if (!b.month || !b.day) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const thisYear = new Date(start.getFullYear(), b.month - 1, b.day)
  return thisYear >= start ? thisYear : new Date(start.getFullYear() + 1, b.month - 1, b.day)
}

/** Days until the next birthday (0 = today), or null when the date is unknown. */
export function daysToBirthday(b: Birthday, today: Date): number | null {
  const next = nextBirthday(b, today)
  if (!next) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((next.getTime() - start.getTime()) / 86_400_000)
}

/** Soonest first; unknown dates last, by name. */
export function sortBirthdays(list: Birthday[], today: Date): Birthday[] {
  const key = (b: Birthday) => daysToBirthday(b, today) ?? Infinity
  return [...list].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name, 'pt'))
}

/** The recap card is shown on Resumo during the first days of a month. */
export const RECAP_DAYS = 7

export interface MonthRecap {
  net: number
  budget: number
  real: number
  top: { name: string; amount: number } | null
  settlement: Settlement
}

/** Last month at a glance: balance, budgets (both of us), biggest expense category, who owes whom. */
export function monthRecap(txs: Transaction[], categories: Category[], budgets: Budget[], month: string): MonthRecap {
  const rows = inMonth(txs, month)
  const inForce = budgetsForMonth(budgets, month)
  const reports = PEOPLE.map((p) => budgetReport(rows, categories, inForce, p))
  const top = categoryTotals(rows, categories)
    .filter((t) => t.category.kind === 'expense' && t.total < 0)
    .sort((a, b) => a.total - b.total)[0]
  return {
    net: monthSummary(rows, categories).net,
    budget: reports.reduce((s, r) => s + r.budget, 0),
    real: reports.reduce((s, r) => s + r.real, 0),
    top: top ? { name: top.category.name, amount: -top.total } : null,
    settlement: settlement(rows, categories),
  }
}
