import { useState } from 'react'
import type { ShowToast } from '../App'
import { Card, CategoryIcon, Sheet } from '../components'
import { dueRecurring, monthKey, recurringDate } from '../lib/calc'
import { useData, useTable } from '../lib/data'
import { eur, eurSigned, parseAmount } from '../lib/format'
import type { Recurring, Transaction } from '../lib/types'
import type { Backend } from '../lib/backend'

const toRecurring = (r: Recurring): Recurring => ({ ...r, amount: Number(r.amount) })

/** "Repetir todos os meses" on an entry: same fields, same day (28 at most), not suggested again this month. */
export function makeRecurring(backend: Backend, t: Transaction) {
  const { description, amount, category_id, paid_by, shared } = t
  return backend.insert('recurring', {
    description,
    amount,
    category_id,
    paid_by,
    shared,
    day: Math.min(28, Number(t.date.slice(8, 10)) || 1),
    last_month: t.date.slice(0, 7),
  })
}

/** Top of Novo: this month's recurring entries whose day has come, one tap to add (or skip). */
export function RecurringSuggestions({ toast }: { toast: ShowToast }) {
  const { backend, categories } = useData()
  const items = useTable<Recurring>('recurring', { map: toRecurring })
  const now = new Date()
  const due = dueRecurring(items ?? [], now)
  if (due.length === 0) return null

  const month = monthKey(now)
  const add = async (list: Recurring[]) => {
    const created = await Promise.all(
      list.map(async (r) => {
        const { description, amount, category_id, paid_by, shared } = r
        const tx = await backend.insert<Transaction>('transactions', {
          date: recurringDate(r, now), description, amount, category_id, paid_by, shared,
        })
        await backend.update('recurring', { id: r.id }, { last_month: month })
        return tx
      }),
    )
    toast(list.length === 1 ? `Adicionado: ${label(list[0])}` : `${list.length} fixos adicionados`, {
      label: 'Anular',
      run: () => undo(list, created),
    })
  }
  const skip = async (r: Recurring) => {
    await backend.update('recurring', { id: r.id }, { last_month: month })
    toast(`Ignorado este mês: ${label(r)}`, { label: 'Anular', run: () => undo([r], []) })
  }
  const undo = async (list: Recurring[], created: Transaction[]) => {
    for (const t of created) await backend.remove('transactions', { id: t.id })
    for (const r of list) await backend.update('recurring', { id: r.id }, { last_month: r.last_month })
  }
  const label = (r: Recurring) => r.description || categories.find((c) => c.id === r.category_id)?.name || ''

  return (
    <Card
      title="Fixos deste mês"
      action={
        due.length > 1 && (
          <button className="ghost small" onClick={() => add(due)}>
            Adicionar todos
          </button>
        )
      }
    >
      <ul className="tx-list">
        {due.map((r) => (
          <li key={r.id} className="recurring-row">
            <CategoryIcon category={categories.find((c) => c.id === r.category_id)} />
            <span className="tx-main">
              <span className="tx-desc">{label(r)}</span>
              <span className="tx-meta">dia {r.day}</span>
            </span>
            <span className={`tx-amount ${r.amount > 0 ? 'in' : ''}`}>{eurSigned(r.amount)}</span>
            <button className="small" onClick={() => add([r])} aria-label={`Adicionar ${label(r)}`}>
              +
            </button>
            <button className="ghost small" onClick={() => skip(r)} aria-label={`Ignorar ${label(r)} este mês`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** In the account sheet: the recurring entries, tap one to change its amount or day, or delete it. */
export function RecurringList({ onEdit }: { onEdit: (r: Recurring) => void }) {
  const { categories } = useData()
  const items = useTable<Recurring>('recurring', { map: toRecurring }) ?? []

  if (items.length === 0) return <p className="muted small">Num movimento, toca em “Repetir todos os meses” para o tornar fixo.</p>
  return (
    <ul className="tx-list">
      {[...items]
        .sort((a, b) => a.day - b.day)
        .map((r) => {
          const category = categories.find((c) => c.id === r.category_id)
          return (
            <li key={r.id}>
              <button className="tx-row" onClick={() => onEdit(r)}>
                <CategoryIcon category={category} />
                <span className="tx-main">
                  <span className="tx-desc">{r.description || category?.name}</span>
                  <span className="tx-meta">dia {r.day}</span>
                </span>
                <span className={`tx-amount ${r.amount > 0 ? 'in' : ''}`}>{eurSigned(r.amount)}</span>
              </button>
            </li>
          )
        })}
    </ul>
  )
}

export function RecurringEditor({ item, onClose }: { item: Recurring; onClose: () => void }) {
  const { backend } = useData()
  const [amount, setAmount] = useState(String(Math.abs(item.amount)).replace('.', ','))
  const [day, setDay] = useState(String(item.day))
  const value = parseAmount(amount)
  const dayNumber = Math.min(28, Math.max(1, Number(day) || 1))

  const save = async () => {
    if (!value) return
    await backend.update('recurring', { id: item.id }, { amount: item.amount < 0 ? -value : value, day: dayNumber })
    onClose()
  }
  const remove = async () => {
    if (!confirm('Deixar de repetir este movimento?')) return
    await backend.remove('recurring', { id: item.id })
    onClose()
  }

  return (
    <Sheet title={item.description || 'Fixo mensal'} onClose={onClose}>
      <div className="wish-form">
        <div className="field-row">
          <label className="field-label grow">
            Valor (€)
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
          <label className="field-label">
            Dia (1–28)
            <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        </div>
        {value !== null && <p className="muted small">{item.amount < 0 ? 'Despesa' : 'Receita'} de {eur(value)} todos os meses, a partir do dia {dayNumber}.</p>}
        <button className="primary" disabled={!value} onClick={save}>
          Guardar
        </button>
        <button className="danger" onClick={remove}>
          Deixar de repetir
        </button>
      </div>
    </Sheet>
  )
}
