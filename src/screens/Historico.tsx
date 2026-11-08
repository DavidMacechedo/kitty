import { useMemo, useState } from 'react'
import { Card, Segmented, Stepper } from '../components'
import { yearByCategory } from '../lib/calc'
import { useData } from '../lib/data'
import { eur, eurShort, monthLabel, monthShort } from '../lib/format'
import { categoryIcon } from '../lib/icons'
import { PEOPLE, PERSON_NAME, type Person } from '../lib/types'

type Who = 'total' | Person

function niceMax(v: number) {
  if (v <= 0) return 100
  const step = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / step) * step
}

/** Monthly columns, one series. Tap/hover a month to read its value. */
function MonthlyColumns({ months, values, title }: { months: string[]; values: number[]; title: string }) {
  const lastWithData = values.reduce((last, v, i) => (v ? i : last), -1)
  const [active, setActive] = useState<number | null>(null)
  const shown = active ?? lastWithData
  const W = 340, H = 190, left = 44, bottom = 22, top = 8
  const max = niceMax(Math.max(...values))
  const ticks = [0, max / 2, max]
  const slot = (W - left) / months.length
  const barW = Math.max(4, slot - 2) // 2px surface gap between adjacent bars
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max)

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-readout">
          {shown >= 0 ? (
            <>
              {monthLabel(months[shown])}: <strong>{eur(values[shown])}</strong>
            </>
          ) : (
            'Sem dados'
          )}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onPointerLeave={() => setActive(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
            <text x={left - 6} y={y(t) + 4} className="tick" textAnchor="end">
              {eurShort(t)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = left + i * slot + (slot - barW) / 2
          const h = y(0) - y(values[i])
          const r = Math.min(4, barW / 2, h)
          return (
            <g key={m}>
              {values[i] > 0 && (
                <path
                  className={`col ${i === shown ? 'active' : ''}`}
                  d={`M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z`}
                />
              )}
              <text x={left + i * slot + slot / 2} y={H - 6} className="tick" textAnchor="middle">
                {monthShort(m)[0].toUpperCase()}
              </text>
              {/* Hit target: the whole column slot, taller and wider than the bar. */}
              <rect
                x={left + i * slot}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              >
                <title>{`${monthLabel(m)}: ${eur(values[i])}`}</title>
              </rect>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

/** The "Ano" view of Resumo (was the Histórico tab). */
export function YearView() {
  const { transactions, categories } = useData()
  const years = useMemo(
    () => [...new Set(transactions.map((t) => Number(t.date.slice(0, 4))))].sort(),
    [transactions],
  )
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [who, setWho] = useState<Who>('total')
  const [categoryId, setCategoryId] = useState('')
  const data = useMemo(() => yearByCategory(transactions, categories, year), [transactions, categories, year])

  const lastMonth = data.summaries.reduce((last, s, i) => (s.total.gasto || s.total.ganho ? i : last), -1)
  const months = data.months.slice(0, Math.max(lastMonth + 1, 1))

  const values = useMemo(() => {
    if (!categoryId) return data.summaries.map((s) => -s[who].gasto)
    const perMonth = data.months.map((m) =>
      transactions
        .filter((t) => t.category_id === categoryId && t.date.startsWith(m.slice(0, 7)))
        .reduce((s, t) => s + (who === 'total' ? t.amount : t.shared ? t.amount / 2 : t.paid_by === who ? t.amount : 0), 0),
    )
    return perMonth.map((v) => Math.max(-v, 0))
  }, [data, categoryId, who, transactions])

  const categoryName = categories.find((c) => c.id === categoryId)?.name
  const whoLabel = who === 'total' ? '' : ` · ${PERSON_NAME[who]}`
  const title = `${categoryName ?? 'Gasto'} por mês${whoLabel}`
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1)

  return (
    <>
      <Stepper
        label={year}
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
        prevLabel="Ano anterior"
        nextLabel="Ano seguinte"
        prevDisabled={year <= (years[0] ?? year)}
        nextDisabled={year >= new Date().getFullYear()}
      />

      <Card>
        <div className="filters">
          <Segmented<Who>
            value={who}
            onChange={setWho}
            options={[
              { value: 'total', label: 'Total' },
              ...PEOPLE.map((p) => ({ value: p, label: PERSON_NAME[p] })),
            ]}
          />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
            <option value="">Todas as despesas</option>
            {categories
              .filter((c) => c.kind === 'expense')
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </div>
        <MonthlyColumns months={data.months} values={values} title={title} />
        <p className="muted small">
          Média {eur(avg(values.slice(0, months.length)))} / mês · Total {eur(values.reduce((s, v) => s + v, 0))}
        </p>
      </Card>

      <Card title="Por categoria">
        <div className="table-scroll">
          <table className="year-table">
            <thead>
              <tr>
                <th>Categoria</th>
                {months.map((m) => (
                  <th key={m}>{monthShort(m)}</th>
                ))}
                <th>Média</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const vals = r.months.slice(0, months.length)
                return (
                  <tr key={r.category.id}>
                    <th>
                      <span aria-hidden>{categoryIcon(r.category)}</span> {r.category.name}
                    </th>
                    {vals.map((v, i) => (
                      <td key={i} className={v > 0 ? 'in' : ''}>{v ? eurShort(v) : '–'}</td>
                    ))}
                    <td>{eurShort(avg(vals))}</td>
                    <td>{eurShort(vals.reduce((s, v) => s + v, 0))}</td>
                  </tr>
                )
              })}
              <tr className="net">
                <th>Net</th>
                {data.summaries.slice(0, months.length).map((s, i) => (
                  <td key={i}>{eurShort(s.net)}</td>
                ))}
                <td>{eurShort(avg(data.summaries.slice(0, months.length).map((s) => s.net)))}</td>
                <td>{eurShort(data.summaries.reduce((s, x) => s + x.net, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
