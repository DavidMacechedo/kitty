// pt-PT only groups thousands from 10 000 up by default; 'always' gives 1 226,24 €.
const money = { style: 'currency', currency: 'EUR', useGrouping: 'always' } as const
const euro = new Intl.NumberFormat('pt-PT', money)
const euroSigned = new Intl.NumberFormat('pt-PT', { ...money, signDisplay: 'exceptZero' })
const euroShort = new Intl.NumberFormat('pt-PT', { ...money, maximumFractionDigits: 0 })
const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 0 })

// Typographic minus sign instead of the hyphen Intl produces.
const minus = (s: string) => s.replace('-', '−')
const clean = (n: number) => (Math.abs(n) < 0.005 ? 0 : n)

export const eur = (n: number) => minus(euro.format(clean(n)))
/** Always shows the sign: −4,10 € / +1 387,00 €. */
export const eurSigned = (n: number) => minus(euroSigned.format(clean(n)))
export const eurShort = (n: number) => minus(euroShort.format(clean(n)))
export const percent = (n: number) => pct.format(n)

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => isoDate(new Date())
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`
export const currentMonth = () => monthOf(today())

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return isoDate(new Date(y, m - 1 + delta, 1))
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long' })
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`
}

export const monthShort = (month: string) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '')

export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  return isoDate(day)
}

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return isoDate(new Date(y, m - 1, d + delta))
}

/** Parses "12,50" or "12.50" as a positive number. */
export function parseAmount(text: string): number | null {
  const n = Number(text.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
