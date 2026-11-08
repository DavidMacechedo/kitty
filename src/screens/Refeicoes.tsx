import { useMemo, useState } from 'react'
import type { ShowToast } from '../App'
import { Card, Stepper, SwipeRow } from '../components'
import { removeWithUndo, useData, useTable } from '../lib/data'
import { addDays, dayLabel, today, weekStart } from '../lib/format'
import type { MealDay, ShoppingItem } from '../lib/types'

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

export function RefeicoesScreen({ toast }: { toast: ShowToast }) {
  const { backend } = useData()
  const [week, setWeek] = useState(weekStart(today()))
  const [newItem, setNewItem] = useState('')
  const mealRows = useTable<MealDay>('meal_plan', { match: { week_start: week } })
  const itemRows = useTable<ShoppingItem>('shopping_items', { match: { week_start: week } })
  const meals: Record<number, string> = useMemo(() => Object.fromEntries((mealRows ?? []).map((r) => [r.weekday, r.menu])), [mealRows])
  // Creation order only: ticking an item fades it in place instead of making it jump.
  const items = useMemo(() => [...(itemRows ?? [])].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')), [itemRows])

  const saveMeal = (weekday: number, menu: string) =>
    backend.upsert('meal_plan', [{ week_start: week, weekday, menu }], 'week_start,weekday')

  const addItems = async () => {
    // "massa, frango, nata" adds three items, like the sheet's shopping list columns.
    const names = newItem.split(/[,+\n]/).map((s) => s.trim()).filter(Boolean)
    setNewItem('')
    for (const name of names) await backend.insert('shopping_items', { week_start: week, name, checked: false })
  }

  const fromMenu = async () => {
    const existing = new Set(items.map((i) => i.name.toLowerCase()))
    const names = Object.values(meals)
      .flatMap((m) => m.split(/[,+\n]/))
      .map((s) => s.trim())
      .filter((s) => s && !existing.has(s.toLowerCase()))
    for (const name of [...new Set(names)]) await backend.insert('shopping_items', { week_start: week, name, checked: false })
  }

  // Anular restores the same row, creation time included, so it returns to its old spot.
  const removeItem = (item: ShoppingItem) => removeWithUndo(backend, 'shopping_items', item, toast, `Removido: ${item.name}`)

  const clearChecked = async () => {
    for (const item of items.filter((i) => i.checked)) await backend.remove('shopping_items', { id: item.id })
  }

  return (
    <>
      <Stepper
        label={`Semana de ${dayLabel(week)}`}
        onPrev={() => setWeek(addDays(week, -7))}
        onNext={() => setWeek(addDays(week, 7))}
        prevLabel="Semana anterior"
        nextLabel="Semana seguinte"
      />

      <Card title="Ementa">
        <ul className="meal-list">
          {WEEKDAYS.map((name, i) => (
            <li key={`${week}-${i}`}>
              <label>
                <span>{name}</span>
                <input
                  defaultValue={meals[i] ?? ''}
                  key={meals[i] ?? ''}
                  placeholder="ex.: massa + frango + nata"
                  onBlur={(e) => e.target.value !== (meals[i] ?? '') && saveMeal(i, e.target.value)}
                />
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Lista de compras"
        action={
          <button className="ghost small" onClick={fromMenu}>
            Da ementa
          </button>
        }
      >
        <form
          className="field-row"
          onSubmit={(e) => {
            e.preventDefault()
            addItems()
          }}
        >
          <input className="grow" placeholder="Adicionar (separa com vírgulas)" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <button type="submit" disabled={!newItem.trim()}>
            +
          </button>
        </form>
        <ul className="shopping-list">
          {items.map((item) => (
            <SwipeRow key={item.id} onDelete={() => removeItem(item)}>
              <div className={`shop-item${item.checked ? ' checked' : ''}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => backend.update('shopping_items', { id: item.id }, { checked: e.target.checked })}
                  />
                  {item.name}
                </label>
                <button className="ghost" aria-label={`Remover ${item.name}`} onClick={() => removeItem(item)}>
                  ✕
                </button>
              </div>
            </SwipeRow>
          ))}
        </ul>
        {items.some((i) => i.checked) && (
          <button className="ghost" onClick={clearChecked}>
            Limpar comprados
          </button>
        )}
      </Card>
    </>
  )
}
