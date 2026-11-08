import { useState } from 'react'
import type { ShowToast } from '../App'
import { CategoryIcon, Segmented, Sheet } from '../components'
import { useData } from '../lib/data'
import { categoryIcon } from '../lib/icons'
import { getTheme, setTheme, type ThemeChoice } from '../lib/theme'
import { PERSON_NAME, type Category, type Recurring } from '../lib/types'
import { RecurringEditor, RecurringList } from './Fixos'

const EMOJIS = [
  '🍔', '🍕', '☕', '🛒', '🥦', '🍷', '🚌', '🚕', '🚗', '⛽', '✈️', '🏠',
  '💡', '📱', '💻', '🎮', '🎬', '🎟️', '📚', '🎓', '💼', '🖊️', '👕', '👟',
  '💇', '💊', '🩺', '🏋️', '🐱', '🐶', '🎁', '👶', '👤', '❤️', '🌱', '🧾',
  '💶', '🐷', '📈', '🔁', '↩️', '🏷️',
]

/** Opened from the initial in the header: look, export, recurring entries, categories, sign out. */
export function ContaSheet({ onClose, onSignOut, toast }: { onClose: () => void; onSignOut: () => void; toast: ShowToast }) {
  const { me, backend, categories } = useData()
  const [editing, setEditing] = useState<Category | null>(null)
  const [editingRecurring, setEditingRecurring] = useState<Recurring | null>(null)
  const [exporting, setExporting] = useState(false)
  const [myName, setMyName] = useState(PERSON_NAME[me])
  const [theme, setThemeState] = useState(getTheme)
  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)

  if (editing) return <CategoryEditor category={editing} onClose={() => setEditing(null)} />
  if (editingRecurring) return <RecurringEditor item={editingRecurring} onClose={() => setEditingRecurring(null)} />

  // The spreadsheet writer is only downloaded when someone taps the button.
  const exportAll = async () => {
    setExporting(true)
    try {
      await (await import('../lib/export')).exportAll(backend)
    } catch (e) {
      toast(`Erro ao exportar: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  const list = (items: Category[]) => (
    <ul className="tx-list">
      {items.map((c) => (
        <li key={c.id}>
          <button className="tx-row" onClick={() => setEditing(c)}>
            <CategoryIcon category={c} />
            <span className="tx-main">
              <span className="tx-desc">{c.name}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <Sheet title={PERSON_NAME[me]} onClose={onClose}>
      <h3 className="sheet-heading">O teu nome</h3>
      <form
        className="field-row"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await backend.claimPerson(myName)
            location.reload() // names are read once at start-up
          } catch (err) {
            toast(`Erro: ${(err as Error).message}`)
          }
        }}
      >
        <input className="grow" value={myName} maxLength={40} onChange={(e) => setMyName(e.target.value)} aria-label="O teu nome" />
        <button type="submit" disabled={!myName.trim() || myName.trim() === PERSON_NAME[me]}>
          Guardar
        </button>
      </form>
      <h3 className="sheet-heading">Aspeto</h3>
      <Segmented<ThemeChoice>
        value={theme}
        onChange={(t) => {
          setTheme(t)
          setThemeState(t)
        }}
        options={[
          { value: 'auto', label: 'Automático' },
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Escuro' },
        ]}
      />
      <h3 className="sheet-heading">Fixos mensais</h3>
      <RecurringList onEdit={setEditingRecurring} />
      <h3 className="sheet-heading">Categorias</h3>
      <p className="muted small">Toca numa categoria para mudar o ícone ou arquivá-la.</p>
      {list(active)}
      {archived.length > 0 && (
        <>
          <h3 className="sheet-heading">Arquivadas</h3>
          {list(archived)}
        </>
      )}
      <h3 className="sheet-heading">Cópia dos dados</h3>
      <p className="muted small">Tudo num ficheiro Excel, guardado só neste telemóvel (ou onde o escolheres guardar).</p>
      <button onClick={exportAll} disabled={exporting}>
        {exporting ? 'A preparar…' : 'Exportar tudo'}
      </button>
      <button className="danger" onClick={onSignOut}>
        Terminar sessão
      </button>
    </Sheet>
  )
}

function CategoryEditor({ category, onClose }: { category: Category; onClose: () => void }) {
  const { backend, categories, transactions } = useData()
  const [name, setName] = useState(category.name)
  const [icon, setIcon] = useState(categoryIcon(category))
  const [archived, setArchived] = useState(category.archived)
  const [error, setError] = useState<string | null>(null)

  // Entries point to the category by id, so a rename shows up on all of them at once.
  const uses = transactions.filter((t) => t.category_id === category.id).length
  const trimmed = name.trim()
  const renamed = trimmed !== category.name
  const taken = categories.some((c) => c.id !== category.id && c.name.toLowerCase() === trimmed.toLowerCase())

  const save = async () => {
    if (!trimmed || taken) return
    try {
      // The icon is saved explicitly, so a category whose default icon came from
      // its old name (e.g. "Eating out" → 🍔) keeps it after the rename.
      await backend.update('categories', { id: category.id }, { name: trimmed, icon: icon.trim() || null, archived })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Sheet title={category.name} onClose={onClose}>
      <label className="field-label">
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      {taken ? (
        <p className="error small">Já existe uma categoria chamada “{trimmed}”.</p>
      ) : (
        renamed &&
        trimmed && (
          <p className="muted small">
            Muda o nome em {uses} {uses === 1 ? 'movimento' : 'movimentos'} e nos budgets.
          </p>
        )
      )}
      <div className="icon-preview" aria-hidden>{icon || categoryIcon({ ...category, icon: null })}</div>
      <div className="emoji-grid" role="radiogroup" aria-label="Ícone">
        {EMOJIS.map((e) => (
          <button key={e} role="radio" aria-checked={icon === e} onClick={() => setIcon(e)}>
            {e}
          </button>
        ))}
      </div>
      <input
        className="emoji-input"
        value={icon}
        onChange={(e) => setIcon(e.target.value)}
        placeholder="Outro emoji"
        aria-label="Outro emoji"
        maxLength={8}
      />
      <label className="toggle">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        Arquivar (esconde dos botões de categoria; o histórico mantém-se)
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!trimmed || taken} onClick={save}>
        Guardar
      </button>
    </Sheet>
  )
}
