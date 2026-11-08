// "Exportar tudo": every table as a readable Excel file (names instead of ids),
// made on the phone and handed to the share sheet / downloads. Nothing is sent anywhere else.
import type { Backend } from './backend'
import { isoDate } from './format'
import type { Birthday, Budget, Category, MealDay, Recurring, SavingsBalance, Transaction, Wish } from './types'
import { PERSON_NAME } from './types'
import { buildXlsx, type SheetData } from './xlsx'

const KIND: Record<Category['kind'], string> = {
  expense: 'Despesa',
  income: 'Receita',
  savings: 'Poupança',
  investment: 'Investimento',
  transfer: 'Transferência',
}
const PRIORITY = ['', 'Alta', 'Normal', 'Baixa']
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export async function exportAll(backend: Backend): Promise<void> {
  const [categories, transactions, budgets, wishes, balances, recurring, birthdays, meals] = await Promise.all([
    backend.list<Category>('categories'),
    backend.list<Transaction>('transactions'),
    backend.list<Budget>('budgets'),
    backend.list<Wish>('wishes'),
    backend.list<SavingsBalance>('savings_balances'),
    backend.list<Recurring>('recurring'),
    backend.list<Birthday>('birthdays'),
    backend.list<MealDay>('meal_plan'),
  ])
  const cat = new Map(categories.map((c) => [c.id, c]))
  const name = (id: string) => cat.get(id)?.name ?? ''
  const person = (p: string | null) => (p ? PERSON_NAME[p as keyof typeof PERSON_NAME] : '')

  const sheets: SheetData[] = [
    {
      name: 'Movimentos',
      rows: [
        ['Data', 'Descrição', 'Valor', 'Categoria', 'Tipo', 'Pagou', 'Partilhado', 'Dia estimado'],
        ...[...transactions]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((t) => [t.date, t.description, num(t.amount), name(t.category_id), KIND[cat.get(t.category_id)?.kind ?? 'expense'], person(t.paid_by), t.shared, t.date_estimated]),
      ],
    },
    {
      name: 'Budgets',
      rows: [
        ['Mês', 'Pessoa', 'Categoria', 'Valor'],
        ...[...budgets].sort((a, b) => a.month.localeCompare(b.month)).map((b) => [b.month.slice(0, 7), person(b.person), name(b.category_id), num(b.amount)]),
      ],
    },
    {
      name: 'Categorias',
      rows: [['Nome', 'Tipo', 'Arquivada'], ...categories.map((c) => [c.name, KIND[c.kind], c.archived])],
    },
    {
      name: 'Fixos mensais',
      rows: [
        ['Descrição', 'Valor', 'Categoria', 'Pagou', 'Partilhado', 'Dia'],
        ...recurring.map((r) => [r.description, num(r.amount), name(r.category_id), person(r.paid_by), r.shared, r.day]),
      ],
    },
    {
      name: 'Poupanças',
      rows: [['Pessoa', 'Valor', 'Atualizado'], ...balances.map((b) => [person(b.person), num(b.amount), b.updated_at.slice(0, 10)])],
    },
    {
      name: 'Desejos',
      rows: [
        ['Objetivo', 'Descrição', 'Divisão', 'Quantidade', 'Valor', 'Total', 'Prioridade'],
        ...wishes.map((w) => [w.name, w.description, w.area, num(w.quantity), num(w.unit_price), num(w.quantity)! * num(w.unit_price)!, PRIORITY[w.priority ?? 2]]),
      ],
    },
    {
      name: 'Aniversários',
      rows: [
        ['Pessoa', 'Dia', 'Mês', 'Lado', 'Budget', 'Prenda comprada para'],
        ...birthdays.map((b) => [b.name, b.day, b.month, person(b.side), num(b.budget), b.gift_year]),
      ],
    },
    {
      name: 'Ementa',
      rows: [
        ['Semana', 'Dia', 'Menu'],
        ...[...meals].sort((a, b) => a.week_start.localeCompare(b.week_start) || a.weekday - b.weekday).map((m) => [m.week_start, m.weekday + 1, m.menu]),
      ],
    },
  ]

  const filename = `Kitty ${isoDate(new Date())}.xlsx`
  const file = new File([buildXlsx(sheets)], filename, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  // Phones: the share sheet (save to Files / Drive, send…). Elsewhere: a normal download.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
