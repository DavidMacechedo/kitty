import { Check, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ShowToast } from '../App'
import { Segmented, Sheet, SwipeRow, TransactionForm } from '../components'
import { affordableWishes, averageMonthlySpending, currentSavings, goalsMoney, groupWishes, wishTotal } from '../lib/calc'
import { removeWithUndo, useData, useTable } from '../lib/data'
import { eur, parseAmount } from '../lib/format'
import type { SavingsBalance, Transaction, Wish, WishPriority } from '../lib/types'
import { FundCard } from './Poupancas'

// Supabase may return numeric columns as strings.
const toWish = (w: Wish): Wish => ({ ...w, quantity: Number(w.quantity), unit_price: Number(w.unit_price), priority: w.priority ?? 2 })
const toBalance = (b: SavingsBalance): SavingsBalance => ({ ...b, amount: Number(b.amount) })

const NONE: Wish[] = []

const PRIORITIES: { value: `${WishPriority}`; label: string }[] = [
  { value: '1', label: 'Alta' },
  { value: '2', label: 'Normal' },
  { value: '3', label: 'Baixa' },
]

/** Desejos: things we want, grouped by area (was the "Goals" sheet of Geral.xlsx). */
export function DesejosView({ toast }: { toast: ShowToast }) {
  const { backend, transactions, categories } = useData()
  const wishes = useTable<Wish>('wishes', { map: toWish }) ?? NONE
  const balances = useTable<SavingsBalance>('savings_balances', { map: toBalance })
  const [editing, setEditing] = useState<Wish | 'new' | null>(null)

  const { areas, total, count } = useMemo(() => groupWishes(wishes), [wishes])
  const { average } = useMemo(() => averageMonthlySpending(transactions, categories, new Date()), [transactions, categories])
  const savings = useMemo(() => currentSavings(balances ?? [], transactions, categories), [balances, transactions, categories])
  const { fund, free } = goalsMoney(savings.total, average)
  const affordable = useMemo(
    () => (balances?.length ? affordableWishes(wishes, free) : new Set<string>()),
    [balances, wishes, free],
  )

  // One huge item (a car) can dwarf everything else; show the rest too.
  const biggest = wishes.reduce<Wish | null>((m, w) => (!m || wishTotal(w) > wishTotal(m) ? w : m), null)
  const wishesLabel = [
    `${count} ${count === 1 ? 'desejo' : 'desejos'}`,
    biggest && wishTotal(biggest) > total / 2 && count > 1 ? `sem ${biggest.name}: ${eur(total - wishTotal(biggest))}` : '',
  ]

  // Bought: the expense is already recorded, so drop the wish. Anular undoes both.
  const bought = async (wish: Wish, created: Transaction) => {
    await backend.remove('wishes', { id: wish.id })
    toast(`Comprado: ${wish.name}`, {
      label: 'Anular',
      run: async () => {
        await backend.remove('transactions', { id: created.id })
        await backend.insert('wishes', { ...wish })
      },
    })
  }

  return (
    <>
      <FundCard
        loading={!balances}
        savings={savings}
        fund={fund}
        average={average}
        free={free}
        wishesTotal={total}
        wishesLabel={wishesLabel}
        toast={toast}
      />

      {areas.length === 0 ? (
        <p className="empty">Ainda sem desejos.</p>
      ) : (
        <section className="card day-list">
          {areas.map((a) => (
            <div key={a.area} className="day-group">
              <h3 className="day-header as-written">
                <span>{a.area || 'Outros'}</span>
                <span className="day-total">{eur(a.total)}</span>
              </h3>
              <ul className="tx-list">
                {a.wishes.map((w) => (
                  <SwipeRow key={w.id} onDelete={() => removeWithUndo(backend, 'wishes', w, toast, `Apagado: ${w.name}`)}>
                    <button className="tx-row" onClick={() => setEditing(w)}>
                      <span className="tx-main">
                        <span className="tx-desc">
                          {w.name}
                          {w.priority === 1 && <span className="tag">prioridade</span>}
                        </span>
                        {w.description && <span className="tx-meta wish-desc">{w.description}</span>}
                      </span>
                      <span className="wish-amount">
                        <span className="tx-amount">
                          {affordable.has(w.id) && (
                            <Check className="affordable" size={14} strokeWidth={2.5} aria-label="Dá para comprar" />
                          )}
                          {eur(wishTotal(w))}
                        </span>
                        {w.quantity > 1 && (
                          <span className="muted small">
                            {w.quantity} × {eur(w.unit_price)}
                          </span>
                        )}
                      </span>
                    </button>
                  </SwipeRow>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <button className="primary add-wish" onClick={() => setEditing('new')}>
        <Plus size={18} aria-hidden /> Desejo
      </button>

      {editing && (
        <WishEditor
          wish={editing === 'new' ? null : editing}
          areas={areas.map((a) => a.area).filter(Boolean)}
          onBought={bought}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function WishEditor({
  wish,
  areas,
  onBought,
  onClose,
}: {
  wish: Wish | null
  areas: string[]
  onBought: (wish: Wish, created: Transaction) => void
  onClose: () => void
}) {
  const { backend } = useData()
  const [name, setName] = useState(wish?.name ?? '')
  const [description, setDescription] = useState(wish?.description ?? '')
  const [area, setArea] = useState(wish?.area ?? '')
  const [quantity, setQuantity] = useState(String(wish?.quantity ?? 1))
  const [price, setPrice] = useState(wish ? String(wish.unit_price).replace('.', ',') : '')
  const [priority, setPriority] = useState<`${WishPriority}`>(`${wish?.priority ?? 2}`)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const qty = Math.max(1, Math.floor(Number(quantity)) || 1)
  const unit = price.trim() === '' ? 0 : parseAmount(price)

  if (wish && buying) {
    return (
      <Sheet title={`Comprado: ${wish.name}`} onClose={onClose}>
        <p className="muted small">Regista a despesa e tira o desejo da lista.</p>
        <TransactionForm
          draft={{ description: wish.name, amount: -wishTotal(wish), shared: true }}
          onDone={(_, created) => {
            if (created) onBought(wish, created)
            onClose()
          }}
        />
      </Sheet>
    )
  }

  const save = async () => {
    if (!name.trim() || unit === null) return
    const row = {
      name: name.trim(),
      description: description.trim(),
      area: area.trim(),
      quantity: qty,
      unit_price: unit,
      priority: Number(priority),
    }
    try {
      if (wish) await backend.update('wishes', { id: wish.id }, row)
      else await backend.insert('wishes', row)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async () => {
    if (!wish || !confirm(`Apagar "${wish.name}"?`)) return
    await backend.remove('wishes', { id: wish.id })
    onClose()
  }

  return (
    <Sheet title={wish ? 'Editar desejo' : 'Novo desejo'} onClose={onClose}>
      <div className="wish-form">
        <input placeholder="O que querem?" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!wish} />
        <input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input placeholder="Divisão / área (ex.: Sala)" value={area} onChange={(e) => setArea(e.target.value)} list="wish-areas" />
        <datalist id="wish-areas">
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <div className="field-row">
          <label className="field-label">
            Quantidade
            <input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label className="field-label grow">
            Preço unitário (€)
            <input inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
        </div>
        {unit !== null && unit > 0 && qty > 1 && <p className="muted small">Total: {eur(qty * unit)}</p>}
        <div className="field-label">
          Prioridade
          <Segmented value={priority} onChange={setPriority} options={PRIORITIES} />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={!name.trim() || unit === null} onClick={save}>
          {wish ? 'Guardar' : 'Adicionar'}
        </button>
        {wish && <button onClick={() => setBuying(true)}>Comprado</button>}
        {wish && (
          <button className="danger" onClick={remove}>
            Apagar
          </button>
        )}
      </div>
    </Sheet>
  )
}
