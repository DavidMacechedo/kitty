import { useMemo, useState } from 'react'
import { Card, MonthPicker, Segmented, Sheet } from '../components'
import { budgetReport, budgetsForMonth, dailyAllowance, inMonth, monthProgress, type BudgetLine } from '../lib/calc'
import { useData } from '../lib/data'
import { currentMonth, eur, monthLabel, percent } from '../lib/format'
import { categoryIcon } from '../lib/icons'
import { PEOPLE, PERSON_NAME, type Person } from '../lib/types'

/** Only near (>= 80%) or over budget is worth a status line; below that the bar says enough. */
function status(line: { budget: number; real: number }) {
  const used = line.budget ? line.real / line.budget : line.real > 0 ? 2 : 0
  if (used > 1) return { key: 'critical', icon: '✕', text: `Excedido ${eur(line.real - line.budget)}` }
  if (used >= 0.8) return { key: 'warning', icon: '!', text: `Restam ${eur(line.budget - line.real)}` }
  return { key: 'good', icon: null, text: null }
}

type MeterLine = Pick<BudgetLine, 'budget' | 'real'> & { name: string; icon?: string }

/** `progress` (0..1) draws the "today" tick: a fill past it is spending faster than the month passes. */
function Meter({ line, progress }: { line: MeterLine; progress: number | null }) {
  const s = status(line)
  const used = line.budget ? line.real / line.budget : 1
  const label = `${line.name}: ${percent(used)} do budget${progress !== null ? `, ${percent(progress)} do mês passado` : ''}`
  return (
    <li className="meter">
      <div className="bar-label">
        <span>
          {line.icon && <span aria-hidden>{line.icon} </span>}
          {line.name}
        </span>
        <span className="value">
          {eur(line.real)} <span className="muted">/ {eur(line.budget)}</span>
        </span>
      </div>
      <div className="meter-wrap" role="meter" aria-valuenow={line.real} aria-valuemax={line.budget} aria-label={label}>
        <div className={`meter-track ${s.key}`}>
          <div className="meter-fill" style={{ width: `${Math.min(used, 1) * 100}%` }} />
        </div>
        {progress !== null && <span className="pace-tick" style={{ left: `${progress * 100}%` }} aria-hidden />}
      </div>
      {s.text && (
        <div className={`status ${s.key}`}>
          <span className="status-icon" aria-hidden>{s.icon}</span> {s.text}
        </div>
      )}
    </li>
  )
}

type Who = Person | 'both'

export function BudgetScreen() {
  const { transactions, categories, budgets, me } = useData()
  const [month, setMonth] = useState(currentMonth())
  const [who, setWho] = useState<Who>(me)
  const [editing, setEditing] = useState<Person | null>(null)

  const txs = useMemo(() => inMonth(transactions, month), [transactions, month])
  const inForce = useMemo(() => budgetsForMonth(budgets, month), [budgets, month])
  const reports = useMemo(
    () => ({
      a: budgetReport(txs, categories, inForce, 'a'),
      b: budgetReport(txs, categories, inForce, 'b'),
    }),
    [txs, categories, inForce],
  )

  const lines =
    who === 'both'
      ? mergeLines([...reports.a.lines, ...reports.b.lines])
      : reports[who].lines.map((l) => ({ name: l.category.name, icon: categoryIcon(l.category), budget: l.budget, real: l.real }))
  const totalBudget = who === 'both' ? reports.a.budget + reports.b.budget : reports[who].budget
  const totalReal = who === 'both' ? reports.a.real + reports.b.real : reports[who].real

  const now = new Date()
  const isCurrent = month === currentMonth()
  const progress = isCurrent ? monthProgress(month, now) : null
  const allowance = dailyAllowance(totalBudget - totalReal, month, now)

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />
      <Segmented<Who>
        value={who}
        onChange={setWho}
        options={[
          ...PEOPLE.map((p) => ({ value: p, label: PERSON_NAME[p] })),
          { value: 'both', label: 'Ambos' },
        ]}
      />

      {lines.length > 0 && isCurrent && (
        <section className="card allowance">
          {allowance !== null ? (
            <>
              <span className="allowance-label">Podes gastar</span>
              <span className="allowance-value">{eur(allowance)}<small>/dia</small></span>
              <span className="allowance-sub">até ao fim do mês · restam {eur(totalBudget - totalReal)}</span>
            </>
          ) : (
            <>
              <span className="allowance-label">Budget esgotado</span>
              <span className="allowance-value over">{eur(totalReal - totalBudget)}</span>
              <span className="allowance-sub">acima do budget este mês</span>
            </>
          )}
        </section>
      )}

      <Card
        title="Budget"
        action={
          who !== 'both' && (
            <button className="ghost small" onClick={() => setEditing(who)}>
              Editar
            </button>
          )
        }
      >
        {lines.length === 0 ? (
          <p className="empty">Sem budget definido{who !== 'both' && ' — toca em Editar para criar'}.</p>
        ) : (
          <>
            <ul className="bar-list">
              <Meter line={{ name: 'Total', budget: totalBudget, real: totalReal }} progress={progress} />
              {lines.map((l) => (
                <Meter key={l.name} line={l} progress={progress} />
              ))}
            </ul>
            {progress !== null && (
              <p className="muted small pace-caption">
                <span className="pace-key" aria-hidden /> hoje — {percent(progress)} do mês
              </p>
            )}
          </>
        )}
      </Card>

      {editing && <BudgetEditor person={editing} month={month} onClose={() => setEditing(null)} />}
    </>
  )
}

function mergeLines(lines: BudgetLine[]) {
  const merged = new Map<string, { name: string; icon: string; budget: number; real: number }>()
  for (const l of lines) {
    const row = merged.get(l.category.id) ?? { name: l.category.name, icon: categoryIcon(l.category), budget: 0, real: 0 }
    row.budget += l.budget
    row.real += l.real
    merged.set(l.category.id, row)
  }
  return [...merged.values()]
}

function BudgetEditor({ person, month, onClose }: { person: Person; month: string; onClose: () => void }) {
  const { backend, budgets, categories } = useData()
  const current = budgetsForMonth(budgets, month).filter((b) => b.person === person)
  const [rows, setRows] = useState(current.map((b) => ({ category_id: b.category_id, amount: String(b.amount) })))
  const [error, setError] = useState<string | null>(null)
  const options = categories.filter((c) => c.kind === 'expense' && !c.archived)

  const save = async () => {
    const clean = rows
      .map((r) => ({ category_id: r.category_id, amount: Number(r.amount.replace(',', '.')) }))
      .filter((r) => r.category_id && Number.isFinite(r.amount) && r.amount >= 0)
    try {
      // Budgets are stored per month: replace this month's rows, earlier months stay as they were.
      await backend.remove('budgets', { person, month })
      if (clean.length) {
        await backend.upsert(
          'budgets',
          clean.map((r) => ({ ...r, person, month })),
          'person,category_id,month',
        )
      }
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={`Budget ${PERSON_NAME[person]} · ${monthLabel(month)}`} onClose={onClose}>
      <p className="muted small">Aplica-se a {monthLabel(month)} e aos meses seguintes até ser alterado.</p>
      <ul className="budget-edit">
        {rows.map((r, i) => (
          <li key={i} className="field-row">
            <select
              className="grow"
              value={r.category_id}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, category_id: e.target.value } : x)))}
            >
              <option value="">Categoria…</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              inputMode="decimal"
              className="small-input"
              value={r.amount}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              aria-label="Valor"
            />
            <button className="ghost" aria-label="Remover" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button className="ghost" onClick={() => setRows([...rows, { category_id: '', amount: '' }])}>
        + Categoria
      </button>
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={save}>
        Guardar
      </button>
    </Sheet>
  )
}
