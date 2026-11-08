import { useMemo, useState } from 'react'
import type { ShowToast } from '../App'
import { CategoryIcon, MonthPicker, PersonBadge, Segmented, Sheet, SwipeRow, TransactionForm } from '../components'
import { inMonth } from '../lib/calc'
import { removeWithUndo, useData } from '../lib/data'
import { makeRecurring } from './Fixos'
import { currentMonth, dayLabel, eur, eurSigned, monthLabel } from '../lib/format'
import { PEOPLE, PERSON_NAME, type Person, type Transaction } from '../lib/types'

export function TransactionRow({
  tx,
  showDate,
  onClick,
  onDelete,
}: {
  tx: Transaction
  showDate?: boolean
  onClick?: () => void
  /** Makes the row swipeable to delete. */
  onDelete?: () => void
}) {
  const { categories } = useData()
  const category = categories.find((c) => c.id === tx.category_id)
  const row = (
      <button className="tx-row" onClick={onClick} disabled={!onClick}>
        <CategoryIcon category={category} />
        <span className="tx-main">
          <span className="tx-desc">{tx.description || category?.name}</span>
          <span className="tx-meta">
            {category?.name}
            {showDate && ` · ${dayLabel(tx.date)}`}
            <PersonBadge person={tx.paid_by} />
            {tx.shared && <span className="tag">partilhado</span>}
          </span>
        </span>
        <span className={`tx-amount ${tx.amount > 0 ? 'in' : ''}`}>{eurSigned(tx.amount)}</span>
      </button>
  )
  return onDelete ? <SwipeRow onDelete={onDelete}>{row}</SwipeRow> : <li>{row}</li>
}

type Who = 'all' | Person

export function MovimentosScreen({ toast }: { toast: ShowToast }) {
  const { backend, transactions, categories } = useData()
  const [month, setMonth] = useState(currentMonth())
  const [who, setWho] = useState<Who>('all')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inMonth(transactions, month)
      .filter((t) => who === 'all' || t.paid_by === who || t.shared)
      .filter((t) => !categoryId || t.category_id === categoryId)
      .filter((t) => !q || t.description.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, month, who, categoryId, search])

  const byDay = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const t of rows) {
      const key = t.date_estimated ? 'sem-dia' : t.date
      groups.set(key, [...(groups.get(key) ?? []), t])
    }
    return [...groups.entries()]
  }, [rows])

  // Swipe-to-delete; Anular puts back the exact same entry (same id).
  const remove = (t: Transaction) =>
    removeWithUndo(backend, 'transactions', t, toast, `Apagado: ${t.description || categories.find((c) => c.id === t.category_id)?.name}`)

  const total = rows.reduce((s, t) => s + t.amount, 0)

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />
      <div className="filters">
        <Segmented<Who>
          value={who}
          onChange={setWho}
          options={[
            { value: 'all', label: 'Todos' },
            ...PEOPLE.map((p) => ({ value: p, label: PERSON_NAME[p] })),
          ]}
        />
        <div className="field-row">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input className="grow" placeholder="Procurar" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="muted small">
          {rows.length} movimentos · saldo {eur(total)}
        </p>
      </div>

      {byDay.length === 0 ? (
        <p className="empty">Sem movimentos em {monthLabel(month)}.</p>
      ) : (
        <section className="card day-list">
          {byDay.map(([day, txs]) => (
            <div key={day} className="day-group">
              <h3 className="day-header">
                <span>{day === 'sem-dia' ? 'Sem dia (importado)' : dayLabel(day)}</span>
                <span className="day-total">{eurSigned(txs.reduce((s, t) => s + t.amount, 0))}</span>
              </h3>
              <ul className="tx-list">
                {txs.map((t) => (
                  <TransactionRow key={t.id} tx={t} onClick={() => setEditing(t)} onDelete={() => remove(t)} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {editing && (
        <Sheet title="Editar movimento" onClose={() => setEditing(null)}>
          <TransactionForm
            initial={editing}
            onDone={(message) => {
              toast(message)
              setEditing(null)
            }}
          />
          <button
            className="ghost"
            onClick={async () => {
              await makeRecurring(backend, editing)
              setEditing(null)
              toast('Fixo mensal criado: aparece em Novo todos os meses')
            }}
          >
            Repetir todos os meses
          </button>
        </Sheet>
      )}
    </>
  )
}
