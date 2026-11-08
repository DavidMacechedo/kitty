// Checks the calculations against the values the October 2026 spreadsheet shows.
// The fixture holds real data, so it is generated locally by `npm run import`
// and is not committed; the tests are skipped when it is missing.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  daysToBirthday,
  dueRecurring,
  monthRecap,
  nextBirthday,
  recurringDate,
  sortBirthdays,
  affordableWishes,
  averageMonthlySpending,
  budgetReport,
  budgetsForMonth,
  categoryTotals,
  currentSavings,
  dailyAllowance,
  daysSince,
  goalsMoney,
  groupWishes,
  monthProgress,
  monthSummary,
  settlement,
  settlementCategory,
  settlementDate,
  shareOf,
} from './calc'
import { setPersonNames, type Birthday, type Budget, type Category, type Recurring, type SavingsBalance, type Transaction, type Wish, type WishPriority } from './types'

const fixturePath = new URL('./__fixtures__/month.json', import.meta.url)
const hasFixture = existsSync(fixturePath)
const fixture = hasFixture
  ? (JSON.parse(readFileSync(fixturePath, 'utf-8')) as {
      month: string
      categories: Category[]
      transactions: Transaction[]
      budgets: Budget[]
    })
  : null

const tx = (amount: number, paid_by: 'a' | 'b', shared = false, category_id = 'c'): Transaction => ({
  id: String(Math.random()), date: '2026-10-01', description: '', amount, category_id, paid_by, shared,
  date_estimated: false,
})
const cats: Category[] = [
  { id: 'c', name: 'Groceries', kind: 'expense', archived: false },
  { id: 't', name: 'Transferências', kind: 'transfer', archived: false },
]

describe('basic rules', () => {
  it('splits shared transactions 50/50', () => {
    expect(shareOf(tx(-10, 'a', true), 'b')).toBe(-5)
    expect(shareOf(tx(-10, 'a'), 'b')).toBe(0)
  })

  it('settles: whoever paid more shared is owed half the difference, transfers count', () => {
    expect(settlement([tx(-100, 'a', true), tx(-40, 'b', true)], cats)).toMatchObject({
      debtor: 'b', amount: 30,
    })
    // B paid 100 shared (A owes 50), then A sent B 50: square.
    const s = settlement([tx(-100, 'b', true), tx(-50, 'a', false, 't')], cats)
    expect(s).toMatchObject({ debtor: null, amount: 0 })
  })

  it('settling up: transfer goes to the creditor-named category, dated inside the month', () => {
    setPersonNames([{ id: 'a', name: 'Rui' }, { id: 'b', name: 'Ana' }])
    const transfers: Category[] = [
      { id: 'tb', name: 'Transferências Ana', kind: 'transfer', archived: false },
      { id: 'ta', name: 'Transferências Rui', kind: 'transfer', archived: false },
    ]
    expect(settlementCategory(transfers, 'a')!.id).toBe('ta')
    expect(settlementCategory(transfers, 'b')!.id).toBe('tb')
    expect(settlementCategory(cats, 'a')!.id).toBe('t') // only one transfer category
    expect(settlementCategory([], 'a')).toBeNull()
    expect(settlementDate('2026-10-01', new Date(2026, 10, 2))).toBe('2026-10-31') // past month: its last day
    expect(settlementDate('2026-11-01', new Date(2026, 10, 2))).toBe('2026-11-02') // current month: today
  })

  it('a settle-up transfer for the owed amount makes the month square', () => {
    const txs = [tx(-100, 'a', true), tx(-40, 'b', true)]
    const { debtor, amount } = settlement(txs, cats)
    expect(settlement([...txs, tx(-amount, debtor!, false, 't')], cats).debtor).toBeNull()
  })

  it('carries the latest earlier budget into a new month', () => {
    const budgets: Budget[] = [
      { person: 'a', category_id: 'c', month: '2026-09-01', amount: 100 },
      { person: 'a', category_id: 'c', month: '2026-10-01', amount: 200 },
      { person: 'b', category_id: 'c', month: '2026-08-01', amount: 50 },
    ]
    expect(budgetsForMonth(budgets, '2026-11-01').map((b) => b.amount)).toEqual([200, 50])
    expect(budgetsForMonth(budgets, '2026-09-01').map((b) => b.amount)).toEqual([100, 50])
  })

  it('month progress counts today, and is full/empty for past/future months', () => {
    expect(monthProgress('2026-11-01', new Date(2026, 10, 15))).toBe(0.5)
    expect(monthProgress('2026-10-01', new Date(2026, 9, 31))).toBe(1)
    expect(monthProgress('2026-10-01', new Date(2026, 10, 15))).toBe(1)
    expect(monthProgress('2026-12-01', new Date(2026, 10, 15))).toBe(0)
  })

  it('daily allowance spreads what is left over the remaining days, today included', () => {
    expect(dailyAllowance(160, '2026-11-01', new Date(2026, 10, 15))).toBe(10) // 16 days: 15th..30th
    expect(dailyAllowance(25, '2026-10-01', new Date(2026, 9, 31))).toBe(25) // last day
    expect(dailyAllowance(-5, '2026-11-01', new Date(2026, 10, 15))).toBeNull() // over budget
    expect(dailyAllowance(100, '2026-10-01', new Date(2026, 10, 15))).toBeNull() // past month
    expect(dailyAllowance(100, '2026-12-01', new Date(2026, 10, 15))).toBeNull() // future month
  })
})

describe('wishes', () => {
  const w = (name: string, area: string, quantity: number, unit_price: number, priority: WishPriority = 2): Wish =>
    ({ id: name, name, description: '', area, quantity, unit_price, priority })

  it('ticks wishes in priority order, cheapest first, skipping what no longer fits', () => {
    const list = [w('car', '', 1, 4000), w('sofa', '', 1, 300), w('lamp', '', 2, 20), w('chair', '', 1, 250, 1)]
    // chair (alta) 250 → lamps 40 → sofa 300 → car doesn't fit
    expect([...affordableWishes(list, 600)].sort()).toEqual(['chair', 'lamp', 'sofa'])
    // only 280: chair first, then lamps fit, sofa doesn't
    expect([...affordableWishes(list, 280)].sort()).toEqual(['chair'])
    expect([...affordableWishes(list, 290)].sort()).toEqual(['chair', 'lamp'])
    expect(affordableWishes(list, -10).size).toBe(0)
  })

  it('groups by area alphabetically, no-area last, with subtotals', () => {
    const g = groupWishes([w('a', 'Sala', 1, 60), w('b', '', 1, 5), w('c', 'Cozinha', 2, 15), w('d', 'Sala', 1, 100)])
    expect(g.areas.map((a) => a.area)).toEqual(['Cozinha', 'Sala', ''])
    expect(g.areas[1].total).toBe(160)
    expect(g.areas[1].wishes.map((x) => x.name)).toEqual(['d', 'a']) // biggest first
    expect(g.total).toBe(195)
    expect(g.count).toBe(4)
  })
})

// The real Goals items live only in the local, git-ignored fixture.
const allPath = new URL('./__fixtures__/all.json', import.meta.url)
describe.skipIf(!existsSync(allPath))('Goals sheet import', () => {
  it('matches Geral.xlsx: 14 items, 12 190 €, 7 areas', () => {
    const { wishes } = JSON.parse(readFileSync(allPath, 'utf-8')) as { wishes: Wish[] }
    const g = groupWishes(wishes)
    expect(g.count).toBe(14)
    expect(g.total).toBe(12190)
    expect(g.areas).toHaveLength(7)
    expect(g.areas.find((a) => a.area === 'Quality of Life')!.total).toBe(10420)
    expect(g.areas.find((a) => a.area === 'Cozinha')!.total).toBe(660)
  })
})

describe('recurring entries', () => {
  const r = (day: number, last_month: string | null = null): Recurring => ({
    id: String(day), description: '', amount: -500, category_id: 'c', paid_by: 'a', shared: true, day, last_month,
  })
  it('suggests from their day on, until added or skipped this month', () => {
    const today = new Date(2026, 10, 8)
    expect(dueRecurring([r(1), r(8), r(9), r(5, '2026-11'), r(5, '2026-10')], today).map((x) => x.id)).toEqual(['1', '8', '5'])
    expect(recurringDate(r(5), today)).toBe('2026-11-05')
  })
})

describe('birthdays', () => {
  const b = (name: string, month: number | null, day: number | null): Birthday =>
    ({ id: name, name, month, day, side: null, budget: null, gift_year: null })
  const today = new Date(2026, 10, 8) // 8 Nov
  it('counts days to the next one, rolling into next year', () => {
    expect(daysToBirthday(b('a', 11, 8), today)).toBe(0)
    expect(daysToBirthday(b('a', 11, 20), today)).toBe(12)
    expect(daysToBirthday(b('a', 1, 1), today)).toBe(54)
    expect(nextBirthday(b('a', 1, 1), today)!.getFullYear()).toBe(2027)
    expect(nextBirthday(b('a', 11, 20), today)!.getFullYear()).toBe(2026)
    expect(daysToBirthday(b('a', null, null), today)).toBeNull()
  })
  it('sorts soonest first, unknown dates last', () => {
    expect(sortBirthdays([b('z', null, null), b('jan', 1, 1), b('nov', 11, 20), b('a', null, null)], today).map((x) => x.name))
      .toEqual(['nov', 'jan', 'a', 'z'])
  })
})

describe('savings', () => {
  const savingsCats: Category[] = [...cats, { id: 's', name: 'Conta Poupança', kind: 'savings', archived: false }]
  const balances: SavingsBalance[] = [
    { person: 'a', amount: 1000, updated_at: '2026-11-02T10:00:00Z' },
    { person: 'b', amount: 2000, updated_at: '2026-11-01T10:00:00Z' },
  ]
  const rec = (amount: number, paid_by: 'a' | 'b', created_at: string, category_id = 's', shared = false) =>
    ({ ...tx(amount, paid_by, shared, category_id), created_at })

  it('adds savings entries recorded after each balance was typed', () => {
    const s = currentSavings(balances, [
      rec(-100, 'a', '2026-11-03T09:00:00Z'), // deposit after A's update → +100
      rec(-50, 'a', '2026-11-02T09:00:00Z'), // before the update: already in the balance
      rec(-60, 'b', '2026-11-01T12:00:00Z', 's', true), // shared deposit: 30 each, but A's balance is newer
      rec(200, 'b', '2026-11-05T12:00:00Z'), // withdrawal → −200
      rec(-999, 'b', '2026-11-05T12:00:00Z', 'c'), // not a savings category
      { ...tx(-70, 'b', false, 's') }, // imported, no created_at → ignored
    ], savingsCats)
    expect(s.byPerson.a).toEqual({ typed: 1000, added: 100 })
    expect(s.byPerson.b).toEqual({ typed: 2000, added: -170 })
    expect(s.total).toBe(2930)
    expect(s.added).toBe(-70)
    expect(s.updatedAt).toBe('2026-11-02T10:00:00Z')
  })

  it('has nothing without balances', () => {
    expect(currentSavings([], [rec(-100, 'a', '2026-11-03T09:00:00Z')], savingsCats)).toMatchObject({ total: 0, added: 0, updatedAt: undefined })
  })

  it('counts whole days since an update', () => {
    expect(daysSince('2026-10-01T12:00:00Z', new Date('2026-11-02T13:00:00Z'))).toBe(32)
    expect(daysSince('2026-11-02T12:00:00Z', new Date('2026-11-02T13:00:00Z'))).toBe(0)
  })
})

describe('emergency fund', () => {
  it('averages person-months and leaves out the current month', () => {
    const at = (date: string, amount: number, paid_by: 'a' | 'b') => ({ ...tx(amount, paid_by), date })
    const txs = [at('2026-09-03', -100, 'a'), at('2026-10-05', -300, 'b'), at('2026-11-01', -5000, 'a')]
    const { average, months } = averageMonthlySpending(txs, cats, new Date(2026, 10, 2))
    expect(months).toEqual(['2026-09', '2026-10'])
    expect(average).toBe(100) // (100 + 0 + 0 + 300) / 4 person-months
    expect(goalsMoney(1000, average)).toEqual({ fund: 600, free: 400 })
  })
})

describe.skipIf(!existsSync(allPath))('Car sheet (emergency fund)', () => {
  // The sheet says 1 005.57: its August counted a 30.85 € transfer between us as B's
  // spending (+ 2 cents of split rounding). Every other month matches to the cent.
  it('matches Geral.xlsx except for August: 1 003.95 average, 6 023.71 fund, 4 485.42 left', () => {
    const { categories, transactions } = JSON.parse(readFileSync(allPath, 'utf-8')) as {
      categories: Category[]
      transactions: Transaction[]
    }
    const { average, months } = averageMonthlySpending(transactions, categories, new Date(2026, 10, 2))
    expect(months).toHaveLength(10)
    expect(average).toBeCloseTo(1003.95125, 4)
    const { fund, free } = goalsMoney(5194.81 + 5314.32, average)
    expect(fund).toBeCloseTo(6023.71, 2)
    expect(free).toBeCloseTo(4485.42, 2)
  })
})

describe.skipIf(!hasFixture)('October 2026 matches the spreadsheet', () => {
  // Skipped without the fixture, but the body still runs to collect the tests.
  const { categories, transactions, budgets, month } = fixture ?? { categories: [], transactions: [], budgets: [], month: '' }
  const byName = (name: string) => categoryTotals(transactions, categories).find((t) => t.category.name === name)!

  it('category totals (Geral A:F)', () => {
    expect(byName('Salário').total).toBeCloseTo(3970.64, 2)
    expect(byName('Salário').a).toBeCloseTo(2583.64, 2)
    expect(byName('Eating out').a).toBeCloseTo(-138.265, 3)
    expect(byName('Eating out').b).toBeCloseTo(-118.875, 3)
    expect(byName('Roupa').b).toBeCloseTo(-285.34, 2)
  })

  it('gasto / ganho / poupança / investido (Geral O:S)', () => {
    const s = monthSummary(transactions, categories)
    expect(s.a.gasto).toBeCloseTo(-783.26, 2)
    expect(s.b.gasto).toBeCloseTo(-1226.24, 2)
    expect(s.a.ganho).toBeCloseTo(2583.64, 2)
    expect(s.b.ganho).toBeCloseTo(1387, 2)
    expect(s.a.poupanca).toBeCloseTo(1600, 2)
    expect(s.b.poupanca).toBeCloseTo(300, 2)
    expect(s.a.investido).toBeCloseTo(150, 2)
    expect(s.net).toBeCloseTo(1961.14, 2)
  })

  it('settling October with one transfer leaves nothing owed', () => {
    const cat = settlementCategory(categories, 'a')!
    const payback: Transaction = {
      id: 'x', date: '2026-10-31', description: '', amount: -30.47, category_id: cat.id,
      paid_by: 'b', shared: false, date_estimated: false,
    }
    expect(settlement([...transactions, payback], categories).debtor).toBeNull()
  })

  it('recap of October', () => {
    const r = monthRecap(transactions, categories, budgets, month)
    expect(r.net).toBeCloseTo(1961.14, 2)
    expect(r.budget).toBe(1440)
    expect(r.real).toBeCloseTo(1157.32, 2)
    expect(r.settlement).toMatchObject({ debtor: 'b', amount: 30.47 })
    expect(r.top!.amount).toBeGreaterThan(0)
  })

  it('settlement: B owes 30.47', () => {
    expect(settlement(transactions, categories)).toMatchObject({ debtor: 'b', creditor: 'a', amount: 30.47 })
  })

  it('budgets (per-person Budget tabs and the total)', () => {
    const inForce = budgetsForMonth(budgets, month)
    const reportA = budgetReport(transactions, categories, inForce, 'a')
    const eating = reportA.lines.find((l) => l.category.name === 'Eating out')!
    expect(eating.restante).toBeCloseTo(111.735, 3)
    expect(eating.dlu).toBeCloseTo(0.44694, 5)
    expect(eating.reparticao).toBeCloseTo(0.462962963, 6)
    const reportB = budgetReport(transactions, categories, inForce, 'b')
    expect(reportA.budget + reportB.budget).toBe(1440)
    expect(reportA.real + reportB.real).toBeCloseTo(1157.32, 2)
  })
})
