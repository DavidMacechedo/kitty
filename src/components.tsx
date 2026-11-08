import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { useData } from './lib/data'
import { useSwipe } from './lib/gestures'
import { addDays, addMonths, dayLabel, monthLabel, parseAmount, today } from './lib/format'
import { categoryIcon } from './lib/icons'
import { PEOPLE, PERSON_NAME, type Category, type CategoryKind, type Person, type Transaction } from './lib/types'

/** ‹ label › stepper used for months, weeks and years. */
export function Stepper({
  label,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  prevDisabled,
  nextDisabled,
}: {
  label: ReactNode
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  prevDisabled?: boolean
  nextDisabled?: boolean
}) {
  // Swipe on the row: left = next, right = previous (like turning a page).
  const ref = useRef<HTMLDivElement>(null)
  useSwipe(ref, {
    onLeft: () => !nextDisabled && onNext(),
    onRight: () => !prevDisabled && onPrev(),
  })
  return (
    <div className="stepper" ref={ref} data-swipe>
      <button className="ghost" aria-label={prevLabel} onClick={onPrev} disabled={prevDisabled}>
        <ChevronLeft size={22} />
      </button>
      <span>{label}</span>
      <button className="ghost" aria-label={nextLabel} onClick={onNext} disabled={nextDisabled}>
        <ChevronRight size={22} />
      </button>
    </div>
  )
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <Stepper
      label={monthLabel(month)}
      onPrev={() => onChange(addMonths(month, -1))}
      onNext={() => onChange(addMonths(month, 1))}
      prevLabel="Mês anterior"
      nextLabel="Mês seguinte"
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  // A single pill slides under the selected option.
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const style = { '--n': options.length, '--i': index } as CSSProperties
  return (
    <div className="segmented" role="radiogroup" style={style}>
      <span className="seg-pill" aria-hidden />
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  // ✕ / backdrop slide the sheet down first; closing after a save stays instant.
  const [closing, setClosing] = useState(false)
  const close = () => {
    if (reducedMotion()) return onClose()
    setClosing(true)
    setTimeout(onClose, 160)
  }
  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={close}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="ghost" onClick={close} aria-label="Fechar">✕</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || action) && (
        <header>
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

const KIND_LABEL: Record<CategoryKind, string> = {
  expense: 'Despesa',
  income: 'Receita',
  savings: 'Poupança',
  investment: 'Investimento',
  transfer: 'Transferência entre nós',
}

/** Most-used categories (last 90 days) first, then alphabetical. */
function useSortedCategories(): Category[] {
  const { categories, transactions } = useData()
  return useMemo(() => {
    const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const uses = new Map<string, number>()
    for (const t of transactions) if (t.date >= since) uses.set(t.category_id, (uses.get(t.category_id) ?? 0) + 1)
    return categories
      .filter((c) => !c.archived)
      .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'pt'))
  }, [categories, transactions])
}

export function TransactionForm({
  initial,
  draft,
  onDone,
}: {
  initial?: Transaction
  /** Prefills a new entry (e.g. a wish being bought); unlike `initial`, saving adds a row. */
  draft?: Pick<Transaction, 'description' | 'amount' | 'shared'>
  /** `created` is the new row (only when adding), so the caller can offer to undo it. */
  onDone: (message: string, created?: Transaction) => void
}) {
  const { backend, me, categories } = useData()
  const sorted = useSortedCategories()
  const start = initial ?? draft
  const [amount, setAmount] = useState(start ? String(Math.abs(start.amount)).replace('.', ',') : '')
  const [incoming, setIncoming] = useState(start ? start.amount > 0 : false)
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [paidBy, setPaidBy] = useState<Person>(initial?.paid_by ?? me)
  const [shared, setShared] = useState(start?.shared ?? localStorage.getItem('last-shared') === '1')
  const [description, setDescription] = useState(start?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? today())
  const [pickDate, setPickDate] = useState(!!initial && initial.date !== today() && initial.date !== addDays(today(), -1))
  const [newCategory, setNewCategory] = useState<{ name: string; kind: CategoryKind } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = parseAmount(amount)
  const category = categories.find((c) => c.id === categoryId)
  // An archived category stays visible while editing a row that uses it.
  const visible = category && !sorted.includes(category) ? [category, ...sorted] : sorted

  const pickCategory = (c: Category) => {
    setCategoryId(c.id)
    if (!initial) setIncoming(c.kind === 'income')
  }

  const addCategory = async () => {
    if (!newCategory?.name.trim()) return
    try {
      const created = await backend.insert<Category>('categories', { name: newCategory.name.trim(), kind: newCategory.kind })
      pickCategory(created)
      setNewCategory(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const save = async () => {
    if (!value || !categoryId) return
    setBusy(true)
    setError(null)
    const row = {
      date,
      description: description.trim(),
      amount: incoming ? value : -value,
      category_id: categoryId,
      paid_by: paidBy,
      shared,
      date_estimated: initial?.date_estimated && date === initial.date ? true : false,
    }
    try {
      localStorage.setItem('last-shared', shared ? '1' : '0')
      if (initial) {
        await backend.update('transactions', { id: initial.id }, row)
        onDone('Movimento atualizado')
      } else {
        const created = await backend.insert<Transaction>('transactions', row)
        navigator.vibrate?.(15)
        onDone(`${categoryIcon(category)} ${category?.name} ${incoming ? '+' : '−'}${amount} €`, created)
        setAmount('')
        setDescription('')
        setCategoryId('')
        setIncoming(false)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!initial || !confirm('Apagar este movimento?')) return
    await backend.remove('transactions', { id: initial.id })
    onDone('Movimento apagado')
  }

  return (
    <div className="tx-form">
      <div className="type-toggle">
        <Segmented
          value={incoming ? 'in' : 'out'}
          onChange={(v) => setIncoming(v === 'in')}
          options={[
            { value: 'out', label: 'Despesa' },
            { value: 'in', label: 'Receita' },
          ]}
        />
      </div>

      <div className="amount-row">
        <input
          className="amount"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          autoFocus={!initial}
          aria-label="Valor em euros"
        />
        <span className="currency">€</span>
      </div>

      <div className="chips scroll-row" aria-label="Categoria">
        {visible.map((c) => (
          <button key={c.id} className="chip" aria-pressed={c.id === categoryId} onClick={() => pickCategory(c)}>
            <span aria-hidden>{categoryIcon(c)}</span> {c.name}
          </button>
        ))}
        <button className="chip ghost" onClick={() => setNewCategory({ name: '', kind: 'expense' })}>
          Nova…
        </button>
      </div>

      {newCategory && (
        <div className="new-category">
          <input
            placeholder="Nome da categoria"
            value={newCategory.name}
            onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            autoFocus
          />
          <select
            value={newCategory.kind}
            onChange={(e) => setNewCategory({ ...newCategory, kind: e.target.value as CategoryKind })}
          >
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <button onClick={addCategory}>Criar</button>
        </div>
      )}

      <div className="field-row">
        <Segmented
          value={paidBy}
          onChange={setPaidBy}
          options={PEOPLE.map((p) => ({ value: p, label: `Pagou ${PERSON_NAME[p]}` }))}
        />
        <label className="toggle">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Partilhado
        </label>
      </div>

      <input
        placeholder="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="chips" role="radiogroup" aria-label="Data">
        {[
          { label: 'Hoje', value: today() },
          { label: 'Ontem', value: addDays(today(), -1) },
        ].map((d) => (
          <button
            key={d.label}
            className="chip"
            role="radio"
            aria-checked={!pickDate && date === d.value}
            onClick={() => {
              setDate(d.value)
              setPickDate(false)
            }}
          >
            {d.label}
          </button>
        ))}
        <button className="chip" role="radio" aria-checked={pickDate} onClick={() => setPickDate(true)}>
          📅 {pickDate ? dayLabel(date) : 'Outro'}
        </button>
        {pickDate && (
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Data" />
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <button className="primary" disabled={!value || !categoryId || busy} onClick={save}>
        {initial ? 'Guardar alterações' : 'Adicionar'}
      </button>
      {initial && (
        <button className="danger" onClick={remove}>
          Apagar
        </button>
      )}
    </div>
  )
}

/** Shimmering placeholder rows shown while data loads. */
export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card skeleton" aria-busy="true" aria-label="A carregar">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span className="skeleton-circle" />
          <span className="skeleton-lines">
            <span style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <span style={{ width: '35%' }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** Small D / B badge in the person's colour (same colours as the Resumo bars). */
export function PersonBadge({ person }: { person: Person }) {
  return (
    <span className={`person-badge person-${person}`} title={PERSON_NAME[person]}>
      {PERSON_NAME[person][0]}
    </span>
  )
}

export function CategoryIcon({ category }: { category: Category | undefined }) {
  return (
    <span className="cat-icon" aria-hidden>
      {categoryIcon(category)}
    </span>
  )
}

/**
 * A list row that can be swiped left to delete. The row follows the finger over a
 * red trash background; released past 35% of its width it slides out and calls
 * onDelete (callers offer Anular). Anything else snaps back, and a tap still works.
 */
export function SwipeRow({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; id: number; axis: 'x' | 'y' | null; width: number } | null>(null)
  const swiped = useRef(false)
  const armed = drag.current ? -dx > drag.current.width * 0.35 : false

  const down = (e: PointerEvent<HTMLLIElement>) => {
    if (e.pointerType === 'mouse') return
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, width: e.currentTarget.offsetWidth }
    swiped.current = false
  }
  const move = (e: PointerEvent<HTMLLIElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const ddx = e.clientX - d.x
    const ddy = e.clientY - d.y
    if (!d.axis && Math.hypot(ddx, ddy) > 8) {
      d.axis = Math.abs(ddx) > 1.5 * Math.abs(ddy) ? 'x' : 'y'
      if (d.axis === 'x') {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }
    }
    if (d.axis === 'x') setDx(Math.min(0, ddx))
  }
  const up = (e: PointerEvent<HTMLLIElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    setDragging(false)
    if (d.axis === 'x') {
      swiped.current = true // swallow the click that follows the drag
      if (-dx > d.width * 0.35) {
        setDx(-d.width)
        setTimeout(onDelete, 180)
        drag.current = null
        return
      }
    }
    drag.current = null
    setDx(0)
  }
  const cancel = () => {
    drag.current = null
    setDragging(false)
    setDx(0)
  }

  return (
    <li
      className="swipe-row"
      data-swipe
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClickCapture={(e) => {
        if (swiped.current) {
          e.stopPropagation()
          e.preventDefault()
          swiped.current = false
        }
      }}
    >
      <div className={`swipe-bg${armed ? ' armed' : ''}`} aria-hidden>
        <Trash2 size={20} />
      </div>
      <div className={`swipe-fg${dragging ? ' dragging' : ''}`} style={{ transform: dx ? `translateX(${dx}px)` : undefined }}>
        {children}
      </div>
    </li>
  )
}
