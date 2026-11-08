import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { ShowToast } from '../App'
import { PersonBadge, Segmented, Sheet, SwipeRow } from '../components'
import { daysToBirthday, nextBirthday, sortBirthdays } from '../lib/calc'
import { removeWithUndo, useData, useTable } from '../lib/data'
import { eur, parseAmount } from '../lib/format'
import { PEOPLE, PERSON_NAME, type Birthday, type Person } from '../lib/types'

const SOON_DAYS = 14

const toBirthday = (b: Birthday): Birthday => ({ ...b, budget: b.budget === null ? null : Number(b.budget) })

function when(b: Birthday, today: Date): string {
  const days = daysToBirthday(b, today)
  const next = nextBirthday(b, today)
  if (days === null || !next) return 'sem data'
  const date = next.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })
  return days === 0 ? `${date} · hoje 🎉` : days === 1 ? `${date} · amanhã` : `${date} · daqui a ${days} dias`
}

/** Aniversários (Geral.xlsx "Birthdays"): soonest first, with a "prenda comprada" tick for this round. */
export function AniversariosView({ toast }: { toast: ShowToast }) {
  const { backend } = useData()
  const birthdays = useTable<Birthday>('birthdays', { map: toBirthday }) ?? []
  const [editing, setEditing] = useState<Birthday | 'new' | null>(null)
  const today = new Date()

  // The gift is for the next birthday, so the tick resets by itself once it has passed.
  const giftYear = (b: Birthday) => nextBirthday(b, today)?.getFullYear() ?? today.getFullYear()
  const toggleGift = (b: Birthday, bought: boolean) =>
    backend.update('birthdays', { id: b.id }, { gift_year: bought ? giftYear(b) : null })

  return (
    <>
      {birthdays.length === 0 ? (
        <p className="empty">Ainda sem aniversários.</p>
      ) : (
        <section className="card">
          <ul className="tx-list">
            {sortBirthdays(birthdays, today).map((b) => {
              const days = daysToBirthday(b, today)
              const bought = b.gift_year !== null && b.gift_year === giftYear(b)
              return (
                <SwipeRow key={b.id} onDelete={() => removeWithUndo(backend, 'birthdays', b, toast, `Apagado: ${b.name}`)}>
                  <div className={`bday-row${days !== null && days <= SOON_DAYS ? ' soon' : ''}`}>
                    <button className="tx-row" onClick={() => setEditing(b)}>
                      <span className="tx-main">
                        <span className="tx-desc">
                          {b.name}
                          {b.side && <PersonBadge person={b.side} />}
                        </span>
                        <span className="tx-meta bday-when">{when(b, today)}</span>
                      </span>
                      {b.budget !== null && <span className="muted small">{eur(b.budget)}</span>}
                    </button>
                    <button
                      className="ghost gift"
                      aria-pressed={bought}
                      aria-label={`Prenda comprada para ${b.name}`}
                      title={bought ? 'Prenda comprada' : 'Prenda por comprar'}
                      onClick={() => toggleGift(b, !bought)}
                    >
                      🎁
                    </button>
                  </div>
                </SwipeRow>
              )
            })}
          </ul>
        </section>
      )}

      <button className="primary add-wish" onClick={() => setEditing('new')}>
        <Plus size={18} aria-hidden /> Aniversário
      </button>

      {editing && <BirthdayEditor birthday={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function BirthdayEditor({ birthday, onClose }: { birthday: Birthday | null; onClose: () => void }) {
  const { backend } = useData()
  const [name, setName] = useState(birthday?.name ?? '')
  const [day, setDay] = useState(birthday?.day ? String(birthday.day) : '')
  const [month, setMonth] = useState(birthday?.month ? String(birthday.month) : '')
  const [side, setSide] = useState<Person | ''>(birthday?.side ?? '')
  const [budget, setBudget] = useState(birthday?.budget ? String(birthday.budget).replace('.', ',') : '')
  const [error, setError] = useState<string | null>(null)

  const d = Number(day)
  const m = Number(month)
  const dateOk = (!day && !month) || (m >= 1 && m <= 12 && d >= 1 && d <= new Date(2024, m, 0).getDate())
  const budgetValue = budget.trim() === '' ? null : parseAmount(budget)
  const valid = name.trim() !== '' && dateOk && (budget.trim() === '' || budgetValue !== null)

  const save = async () => {
    if (!valid) return
    const row = { name: name.trim(), day: day ? d : null, month: month ? m : null, side: side || null, budget: budgetValue }
    try {
      if (birthday) await backend.update('birthdays', { id: birthday.id }, row)
      else await backend.insert('birthdays', row)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={birthday ? 'Editar aniversário' : 'Novo aniversário'} onClose={onClose}>
      <div className="wish-form">
        <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!birthday} />
        <div className="field-row">
          <label className="field-label">
            Dia
            <input inputMode="numeric" placeholder="20" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <label className="field-label">
            Mês
            <input inputMode="numeric" placeholder="11" value={month} onChange={(e) => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <label className="field-label grow">
            Budget prenda (€)
            <input inputMode="decimal" placeholder="opcional" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
        </div>
        {!dateOk && <p className="error">Data inválida.</p>}
        <div className="field-label">
          Do lado de
          <Segmented<Person | ''>
            value={side}
            onChange={setSide}
            options={[
              ...PEOPLE.map((p) => ({ value: p, label: PERSON_NAME[p] })),
              { value: '', label: 'Ambos' },
            ]}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={!valid} onClick={save}>
          {birthday ? 'Guardar' : 'Adicionar'}
        </button>
      </div>
    </Sheet>
  )
}
