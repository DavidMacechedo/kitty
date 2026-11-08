import { useState } from 'react'
import type { ShowToast } from '../App'
import { Segmented } from '../components'
import { AniversariosView } from './Aniversarios'
import { DesejosView } from './Desejos'
import { RefeicoesScreen } from './Refeicoes'

type View = 'refeicoes' | 'desejos' | 'aniversarios'

/** Shared lists we plan together: the weekly meal plan, the wishlist and birthdays. */
export function ListasScreen({ initialView = 'refeicoes', toast }: { initialView?: View; toast: ShowToast }) {
  const [view, setView] = useState<View>(initialView)
  return (
    <>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'refeicoes', label: 'Refeições' },
          { value: 'desejos', label: 'Desejos' },
          { value: 'aniversarios', label: 'Aniversários' },
        ]}
      />
      <div key={view} className="subview">
        {view === 'refeicoes' && <RefeicoesScreen toast={toast} />}
        {view === 'desejos' && <DesejosView toast={toast} />}
        {view === 'aniversarios' && <AniversariosView toast={toast} />}
      </div>
    </>
  )
}
