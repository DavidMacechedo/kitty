import { useState } from 'react'
import type { ShowToast } from '../App'
import { Sheet } from '../components'
import { daysSince, FUND_MONTHS, SAVINGS_STALE_DAYS, type Savings } from '../lib/calc'
import { useData } from '../lib/data'
import { eur, eurSigned, parseAmount } from '../lib/format'
import { PEOPLE, PERSON_NAME } from '../lib/types'

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })

/**
 * Top of Desejos (Geral "Car" tab): savings − emergency fund = what's free for
 * wishes, how much of the wishlist that covers, and where the numbers come from.
 */
export function FundCard({
  loading,
  savings,
  fund,
  average,
  free,
  wishesTotal,
  wishesLabel,
  toast,
}: {
  /** Balances not loaded yet: show a placeholder rather than a wrong 0 €. */
  loading: boolean
  savings: Savings
  fund: number
  average: number
  free: number
  wishesTotal: number
  /** "14 desejos" plus the "sem Carro" hint, already worded by the list. */
  wishesLabel: string[]
  toast: ShowToast
}) {
  const [editing, setEditing] = useState(false)
  const hasSavings = Object.keys(savings.byPerson).length > 0
  const stale = savings.updatedAt && daysSince(savings.updatedAt, new Date()) > SAVINGS_STALE_DAYS

  if (loading) {
    return (
      <section className="card hero-card" aria-busy="true" aria-label="A carregar">
        <span className="hero-label">Disponível para desejos</span>
        <span className="hero-value skeleton-value" />
      </section>
    )
  }

  return (
    <>
    <section className="card hero-card">
      {hasSavings ? (
        <>
          <span className="hero-label">Disponível para desejos</span>
          <span className={`hero-value${free < 0 ? ' out' : ''}`}>{eur(free)}</span>
          {free < 0 ? (
            <span className="hero-sub">Ainda não chega para o fundo de emergência</span>
          ) : (
            wishesTotal > 0 && (
              <div className="meter-track good goals-meter" aria-hidden>
                <div className="meter-fill" style={{ width: `${Math.min(100, (free / wishesTotal) * 100)}%` }} />
              </div>
            )
          )}
          <span className="hero-sub">
            de {eur(wishesTotal)} · {wishesLabel[0]}
          </span>
        </>
      ) : (
        <>
          <span className="hero-label">{wishesLabel[0]}</span>
          <span className="hero-value">{eur(wishesTotal)}</span>
        </>
      )}
      {wishesLabel[1] && <span className="hero-sub">{wishesLabel[1]}</span>}

      {hasSavings ? (
        <div className="fund-rows">
          <button className="fund-row" onClick={() => setEditing(true)}>
            <span>
              Poupanças
              {savings.updatedAt && (
                <span className={`fund-note${stale ? ' stale' : ''}`}>
                  {stale && <span className="stale-dot" title="Há mais de um mês" aria-label="Desatualizado:" />}
                  atualizado a {dateLabel(savings.updatedAt)}
                </span>
              )}
              {savings.added !== 0 && <span className="fund-note">{eurSigned(savings.added)} registados desde então</span>}
            </span>
            <span className="fund-value">{eur(savings.total)}</span>
          </button>
          <div className="fund-row">
            <span>
              Fundo de emergência
              <span className="fund-note">
                {FUND_MONTHS} × {eur(average)}, média mensal por pessoa
              </span>
            </span>
            <span className="fund-value">{eur(-fund)}</span>
          </div>
        </div>
      ) : (
        <button className="small fund-start" onClick={() => setEditing(true)}>
          Indicar poupanças
        </button>
      )}

    </section>
    {editing && <SavingsEditor savings={savings} onClose={() => setEditing(false)} toast={toast} />}
    </>
  )
}

/** Each person's savings balance, typed in by hand (as in the spreadsheet). */
function SavingsEditor({ savings, onClose, toast }: { savings: Savings; onClose: () => void; toast: ShowToast }) {
  const { backend } = useData()
  // Start from today's estimate (typed + recorded since), so saving as-is changes nothing.
  const initial = (p: (typeof PEOPLE)[number]) => {
    const s = savings.byPerson[p]
    return s ? String(Math.round((s.typed + s.added) * 100) / 100).replace('.', ',') : ''
  }
  const [values, setValues] = useState(() => Object.fromEntries(PEOPLE.map((p) => [p, initial(p)])))
  const [error, setError] = useState<string | null>(null)
  const parsed = PEOPLE.map((person) => ({ person, amount: values[person].trim() === '' ? 0 : parseAmount(values[person]) }))
  const valid = parsed.every((r) => r.amount !== null)

  const save = async () => {
    if (!valid) return
    try {
      await backend.upsert('savings_balances', parsed, 'person')
      onClose()
      toast('Poupanças atualizadas')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title="Poupanças" onClose={onClose}>
      <div className="wish-form">
        <p className="muted small">
          Quanto tem cada um na poupança hoje. Depósitos e levantamentos registados depois em categorias de poupança somam-se
          sozinhos. O fundo de emergência ({FUND_MONTHS} meses de despesa média) sai daqui; o resto fica para desejos.
        </p>
        {PEOPLE.map((p) => (
          <label key={p} className="field-label">
            {PERSON_NAME[p]} (€)
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={values[p]}
              onChange={(e) => setValues({ ...values, [p]: e.target.value.replace(/[^\d.,]/g, '') })}
            />
          </label>
        ))}
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={!valid} onClick={save}>
          Guardar
        </button>
      </div>
    </Sheet>
  )
}
