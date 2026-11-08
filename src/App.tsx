import { ChartPie, Check, Gauge, List, ListChecks, Plus, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Skeleton } from './components'
import { useSwipe } from './lib/gestures'
import { createBackend, missingConfig, SETUP_DB, type Backend, type Who } from './lib/backend'
import { DataProvider, useData } from './lib/data'
import { PERSON_NAME, setPersonNames } from './lib/types'
import { AddScreen } from './screens/Add'
import { BudgetScreen } from './screens/Budget'
import { ContaSheet } from './screens/Conta'
import { MovimentosScreen } from './screens/Movimentos'
import { ListasScreen } from './screens/Listas'
import { ResumoScreen } from './screens/Resumo'

const TABS: readonly { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'novo', label: 'Novo', icon: Plus },
  { id: 'movimentos', label: 'Movimentos', icon: List },
  { id: 'resumo', label: 'Resumo', icon: ChartPie },
  { id: 'budget', label: 'Budget', icon: Gauge },
  { id: 'listas', label: 'Listas', icon: ListChecks },
] as const
type Tab = string

// Former tabs that now live inside another one: #historico → Resumo/Ano, #refeicoes → Listas/Refeições.
const MOVED: Record<string, Tab> = { '#historico': 'resumo', '#refeicoes': 'listas' }
const tabFromHash = (): Tab => MOVED[location.hash] ?? TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'resumo'
const tabIndex = (tab: Tab) => TABS.findIndex((t) => t.id === tab)

// Where a tab swipe must not start: inner swipe zones (month stepper, swipe rows)
// and things that scroll or are dragged sideways on their own.
const TAB_SWIPE_IGNORE = '[data-swipe], .scroll-row, .table-scroll, .chart, input, select, textarea'

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null)
  const [me, setMe] = useState<Who | undefined>(undefined)
  const [problem, setProblem] = useState<string | null>(null)

  // Who is signed in, and everyone's names before anything renders.
  const refresh = async (b: Backend) => {
    try {
      const who = await b.me()
      if (who && who !== 'unlinked') setPersonNames(await b.people())
      setMe(who)
    } catch (e) {
      setProblem((e as Error).message)
    }
  }

  useEffect(() => {
    if (missingConfig) return
    createBackend().then((b) => {
      setBackend(b)
      refresh(b)
    })
  }, [])

  if (missingConfig) return <SetupHelp kind="config" />
  if (problem === SETUP_DB) return <SetupHelp kind="database" />
  if (problem) return <div className="splash">Erro: {problem}</div>
  if (!backend || me === undefined) return <div className="splash">A carregar…</div>
  if (!me) return <Login backend={backend} onSignedIn={() => refresh(backend)} />
  if (me === 'unlinked')
    return (
      <Welcome
        backend={backend}
        onDone={() => refresh(backend)}
        onSignOut={async () => {
          await backend.signOut()
          setMe(null)
        }}
      />
    )
  return (
    <DataProvider backend={backend} me={me}>
      <Shell onSignOut={async () => {
        await backend.signOut()
        setMe(null)
      }} />
    </DataProvider>
  )
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { me, backend, loading, error } = useData()
  // `dir` says which side the new screen slides in from.
  const [view, setView] = useState<{ tab: Tab; dir: 'next' | 'prev' | '' }>({ tab: tabFromHash(), dir: '' })
  const tab = view.tab
  const mainRef = useRef<HTMLElement>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const timer = useRef<number>(undefined)

  useEffect(() => {
    const onHash = () =>
      setView((v) => {
        const next = tabFromHash()
        const delta = tabIndex(next) - tabIndex(v.tab)
        return { tab: next, dir: delta > 0 ? 'next' : delta < 0 ? 'prev' : v.dir }
      })
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Swipe left/right anywhere else on the screen to move between tabs (no wrap-around).
  const goTo = (i: number) => {
    if (i >= 0 && i < TABS.length) location.hash = `#${TABS[i].id}`
  }
  useSwipe(mainRef, {
    onLeft: () => goTo(tabIndex(tab) + 1),
    onRight: () => goTo(tabIndex(tab) - 1),
    ignore: TAB_SWIPE_IGNORE,
  })

  const showToast: ShowToast = (message, action) => {
    setToast({ message, action })
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), action ? 4000 : 2500)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar-title">{TABS.find((t) => t.id === tab)!.label}</span>
        <button className={`avatar person-${me}`} onClick={() => setAccountOpen(true)} aria-label={`Conta de ${PERSON_NAME[me]}`}>
          {PERSON_NAME[me][0]}
        </button>
      </header>
      {backend.mode === 'demo' && (
        <p className="demo-banner">Modo demo: dados guardados só neste dispositivo. Configura o Supabase para sincronizar.</p>
      )}
      {error && <p className="error banner">Erro: {error}</p>}
      <main ref={mainRef}>
        {loading ? (
          <Skeleton />
        ) : (
          <div key={tab} className={`screen${view.dir ? ` enter-${view.dir}` : ''}`}>
            {tab === 'novo' && <AddScreen toast={showToast} />}
            {tab === 'movimentos' && <MovimentosScreen toast={showToast} />}
            {tab === 'resumo' && <ResumoScreen initialView={location.hash === '#historico' ? 'ano' : 'mes'} toast={showToast} />}
            {tab === 'budget' && <BudgetScreen />}
            {tab === 'listas' && <ListasScreen toast={showToast} />}
          </div>
        )}
      </main>
      {accountOpen && <ContaSheet onClose={() => setAccountOpen(false)} onSignOut={onSignOut} toast={showToast} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} aria-hidden />
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action!.run()
                setToast(null)
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
      <nav className="tabbar">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.id}`} aria-current={t.id === tab ? 'page' : undefined}>
            <t.icon className="tab-icon" size={22} strokeWidth={t.id === tab ? 2.4 : 1.8} aria-hidden />
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  )
}

interface Toast {
  message: string
  action?: { label: string; run: () => void }
}
export type ShowToast = (message: string, action?: Toast['action']) => void

function Login({ backend, onSignedIn }: { backend: Backend; onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const err = await backend.signIn(email, password)
    setBusy(false)
    if (err) setError(err === 'Invalid login credentials' ? 'Email ou palavra-passe errados' : err)
    else onSignedIn()
  }

  return (
    <form className="login" onSubmit={submit}>
      <img className="login-icon" src="/icon.svg" alt="" />
      <h1>Kitty</h1>
      {backend.mode === 'demo' && (
        <p className="muted small">Modo demo: escreve um email começado por “b” para entrar como Pessoa B, outro qualquer para Pessoa A.</p>
      )}
      <input type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Palavra-passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required={backend.mode === 'supabase'}
      />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        Entrar
      </button>
    </form>
  )
}

/** First sign-in on a new install: this login picks a name and takes one of the two places. */
function Welcome({ backend, onDone, onSignOut }: { backend: Backend; onDone: () => void; onSignOut: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await backend.claimPerson(name)
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <img className="login-icon" src="/icon.svg" alt="" />
      <h1>Bem-vindo ao Kitty</h1>
      <p className="muted small">Como te chamas? É o nome que aparece na app, para os dois.</p>
      <input placeholder="O teu nome" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus required />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || !name.trim()}>
        Começar
      </button>
      <button type="button" className="ghost" onClick={onSignOut}>
        Terminar sessão
      </button>
    </form>
  )
}

/** Shown on a new install while a setup step is missing, pointing to the right step of the guide. */
function SetupHelp({ kind }: { kind: 'config' | 'database' }) {
  return (
    <div className="login">
      <img className="login-icon" src="/icon.svg" alt="" />
      <h1>Falta um passo</h1>
      {kind === 'config' ? (
        <p className="muted">
          A app ainda não está ligada à vossa base de dados. No Vercel, juntem as duas variáveis <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> e voltem a publicar (passo 3 do guia).
        </p>
      ) : (
        <p className="muted">
          A base de dados ainda está vazia. No Supabase, abram o <strong>SQL Editor</strong>, colem o ficheiro <code>setup.sql</code> e
          carreguem em <strong>Run</strong> (passo 2 do guia). Depois recarreguem esta página.
        </p>
      )}
    </div>
  )
}
