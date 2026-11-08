import { useMemo, useState } from 'react'
import type { ShowToast } from '../App'
import { X } from 'lucide-react'
import { Card, CategoryIcon, MonthPicker, PersonBadge, Segmented } from '../components'
import {
  categoryTotals,
  inMonth,
  monthRecap,
  monthSummary,
  RECAP_DAYS,
  settlement,
  settlementCategory,
  settlementDate,
  type PersonSummary,
  type Settlement,
} from '../lib/calc'
import { useData } from '../lib/data'
import { addMonths, currentMonth, eur, eurSigned, monthLabel, percent } from '../lib/format'
import { categoryIcon } from '../lib/icons'
import { PEOPLE, PERSON_NAME, type Category, type Person, type Transaction } from '../lib/types'
import { YearView } from './Historico'

function PersonTile({ person, s }: { person: Person; s: PersonSummary }) {
  return (
    <div className="person-tile">
      <header>
        <PersonBadge person={person} /> {PERSON_NAME[person]}
      </header>
      <dl>
        <dt>Gasto</dt>
        <dd>{eur(-s.gasto)}</dd>
        <dt>Ganho</dt>
        <dd>{eur(s.ganho)}</dd>
        <dt>Poupança</dt>
        <dd>{eur(s.poupanca)}</dd>
        <dt>Investido</dt>
        <dd>{eur(s.investido)}</dd>
      </dl>
      <p className="person-net">
        <span>Saldo</span> <strong>{eurSigned(s.gasto + s.ganho)}</strong>
      </p>
    </div>
  )
}

export function ResumoScreen({ initialView = 'mes', toast }: { initialView?: 'mes' | 'ano'; toast: ShowToast }) {
  const [view, setView] = useState(initialView)
  return (
    <>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'mes', label: 'Mês' },
          { value: 'ano', label: 'Ano' },
        ]}
      />
      <div key={view} className="subview">
        {view === 'mes' ? <MonthView toast={toast} /> : <YearView />}
      </div>
    </>
  )
}

function MonthView({ toast }: { toast: ShowToast }) {
  const { transactions, categories } = useData()
  const [month, setMonth] = useState(currentMonth())
  const txs = useMemo(() => inMonth(transactions, month), [transactions, month])
  const summary = useMemo(() => monthSummary(txs, categories), [txs, categories])
  const totals = useMemo(() => categoryTotals(txs, categories), [txs, categories])
  const expenses = totals.filter((t) => t.total < 0).sort((a, b) => a.total - b.total)
  const income = totals.filter((t) => t.total > 0)
  const maxExpense = Math.max(1, ...expenses.map((t) => -t.total))

  return (
    <>
      {month === currentMonth() && <RecapCard toast={toast} />}
      <MonthPicker month={month} onChange={setMonth} />

      <section className="card hero-card">
        <span className="hero-label">Saldo do mês</span>
        <span className={`hero-value ${summary.net >= 0 ? 'in' : 'out'}`}>{eurSigned(summary.net)}</span>
        <span className="hero-sub">
          Ganho {eur(summary.total.ganho)} · Gasto {eur(-summary.total.gasto)}
        </span>
      </section>

      <div className="person-tiles">
        {PEOPLE.map((p) => (
          <PersonTile key={p} person={p} s={summary[p]} />
        ))}
      </div>

      <SettlementCard month={month} txs={txs} toast={toast} />

      <Card
        title="Despesas por categoria"
        action={
          <span className="legend" aria-label="Legenda">
            <span className="swatch person-a" /> {PERSON_NAME.a} <span className="swatch person-b" /> {PERSON_NAME.b}
          </span>
        }
      >
        {expenses.length === 0 && <p className="empty">Sem despesas.</p>}
        <ul className="bar-list">
          {expenses.map((t) => {
            const a = Math.max(-t.a, 0)
            const b = Math.max(-t.b, 0)
            return (
              <li key={t.category.id}>
                <div className="bar-label">
                  <span>
                    <span aria-hidden>{categoryIcon(t.category)}</span> {t.category.name}
                  </span>
                  <span className="value">{eur(-t.total)}</span>
                </div>
                <div className="split-bar" aria-hidden>
                  {a > 0 && <span className="seg person-a" style={{ width: `${(a / maxExpense) * 100}%` }} />}
                  {b > 0 && <span className="seg person-b" style={{ width: `${(b / maxExpense) * 100}%` }} />}
                </div>
                <div className="bar-sub">
                  {PERSON_NAME.a} {eur(a)} · {PERSON_NAME.b} {eur(b)} · {percent(summary.total.gasto ? t.total / summary.total.gasto : 0)} do
                  gasto
                </div>
              </li>
            )
          })}
        </ul>
      </Card>

      {income.length > 0 && (
        <Card title="Receitas">
          <ul className="tx-list">
            {income.map((t) => (
              <li key={t.category.id} className="kv">
                <span className="kv-label">
                  <CategoryIcon category={t.category} /> {t.category.name}
                </span>
                <span className="tx-amount in">{eurSigned(t.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

/** Draws itself in once: a circle, then the tick. */
function SettledCheck() {
  return (
    <svg className="settled-check" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M7 12.5l3.2 3.2L17 9" />
    </svg>
  )
}

/**
 * "Contas entre nós". Settled per month by design: once the payback transfer is
 * recorded the balance is 0 and the check animates in.
 */
/** "Acertar contas": records the payback as a transfer dated in `month`, with Anular. */
function useSettleUp(month: string, settle: Settlement, toast: ShowToast) {
  const { backend, categories } = useData()
  const [busy, setBusy] = useState(false)
  const settleUp = async () => {
    const { debtor, creditor, amount } = settle
    if (!debtor || !creditor) return
    if (!confirm(`Registar transferência de ${eur(amount)} de ${PERSON_NAME[debtor]} para ${PERSON_NAME[creditor]}?`)) return
    setBusy(true)
    try {
      const category =
        settlementCategory(categories, creditor) ??
        (await backend.insert<Category>('categories', { name: `Transferências ${PERSON_NAME[creditor]}`, kind: 'transfer' }))
      const created = await backend.insert<Transaction>('transactions', {
        date: settlementDate(month, new Date()),
        description: 'Acerto de contas',
        amount: -amount,
        category_id: category.id,
        paid_by: debtor,
        shared: false,
        date_estimated: false,
      })
      navigator.vibrate?.(15)
      toast('Contas acertadas', { label: 'Anular', run: () => backend.remove('transactions', { id: created.id }) })
    } finally {
      setBusy(false)
    }
  }
  return { settleUp, busy }
}

function SettlementCard({ month, txs, toast }: { month: string; txs: Transaction[]; toast: ShowToast }) {
  const { categories } = useData()
  const settle = useMemo(() => settlement(txs, categories), [txs, categories])
  const { settleUp, busy } = useSettleUp(month, settle, toast)
  // Only shared expenses create something to settle. Months without them (e.g. the
  // imported Jan–Jul, where transfers meant other things) show no debt at all.
  const hadShared = txs.some((t) => t.shared)
  const monthOver = month < currentMonth()
  const notStarted = month > currentMonth()

  return (
    <Card title="Contas entre nós">
      {!hadShared ? (
        <p className="muted small">Sem despesas partilhadas este mês.</p>
      ) : settle.debtor ? (
        <>
          <p className="settle">
            <span>
              <PersonBadge person={settle.debtor} /> {PERSON_NAME[settle.debtor]} deve a{' '}
              <PersonBadge person={settle.creditor!} /> {PERSON_NAME[settle.creditor!]}
            </span>
            <strong>{eur(settle.amount)}</strong>
          </p>
          {monthOver && (
            <p className="status warning">
              <span className="status-icon" aria-hidden>!</span> Por acertar
            </p>
          )}
          {!notStarted && (
            <button className="settle-button" disabled={busy} onClick={settleUp}>
              Acertar contas
            </button>
          )}
        </>
      ) : (
        <p className="settled" role="status">
          <SettledCheck /> Contas acertadas
        </p>
      )}
    </Card>
  )
}

const RECAP_KEY = 'recap-dismissed'

/** First days of a month: last month at a glance, with the settle-up still at hand. */
function RecapCard({ toast }: { toast: ShowToast }) {
  const { transactions, categories, budgets } = useData()
  const prev = addMonths(currentMonth(), -1)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(RECAP_KEY) === prev)
  const recap = useMemo(() => monthRecap(transactions, categories, budgets, prev), [transactions, categories, budgets, prev])
  const hadShared = useMemo(() => inMonth(transactions, prev).some((t) => t.shared), [transactions, prev])
  const { settleUp, busy } = useSettleUp(prev, recap.settlement, toast)

  if (dismissed || new Date().getDate() > RECAP_DAYS || inMonth(transactions, prev).length === 0) return null
  const name = monthLabel(prev).split(' ')[0]
  const { debtor, creditor, amount } = recap.settlement

  return (
    <Card
      title={`${name} em resumo`}
      action={
        <button
          className="ghost small"
          aria-label="Fechar resumo"
          onClick={() => {
            localStorage.setItem(RECAP_KEY, prev)
            setDismissed(true)
          }}
        >
          <X size={16} aria-hidden />
        </button>
      }
    >
      <dl className="recap">
        <dt>Saldo</dt>
        <dd className={recap.net >= 0 ? 'in' : 'out'}>{eurSigned(recap.net)}</dd>
        {recap.budget > 0 && (
          <>
            <dt>Budgets</dt>
            <dd>
              {eur(recap.real)} de {eur(recap.budget)} {recap.real <= recap.budget ? '✓' : '· acima'}
            </dd>
          </>
        )}
        {recap.top && (
          <>
            <dt>Maior despesa</dt>
            <dd>
              {recap.top.name} · {eur(recap.top.amount)}
            </dd>
          </>
        )}
      </dl>
      {hadShared && debtor && creditor && (
        <div className="recap-settle">
          <span>
            <PersonBadge person={debtor} /> {PERSON_NAME[debtor]} deve {eur(amount)} a {PERSON_NAME[creditor]}
          </span>
          <button className="small" disabled={busy} onClick={settleUp}>
            Acertar contas
          </button>
        </div>
      )}
    </Card>
  )
}
