import { useState } from 'react'
import type { ShowToast } from '../App'
import { Card, TransactionForm } from '../components'
import { TransactionRow } from './Movimentos'
import { RecurringSuggestions } from './Fixos'
import { useData } from '../lib/data'

export function AddScreen({ toast }: { toast: ShowToast }) {
  const { backend, transactions } = useData()
  const [formKey, setFormKey] = useState(0)
  const recent = [...transactions]
    .filter((t) => !t.date_estimated)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  return (
    <>
      <RecurringSuggestions toast={toast} />
      <Card>
        <TransactionForm
          key={formKey}
          onDone={(message, created) => {
            toast(
              message,
              created && { label: 'Anular', run: () => backend.remove('transactions', { id: created.id }) },
            )
            setFormKey(formKey + 1)
          }}
        />
      </Card>
      <Card title="Últimos movimentos">
        <ul className="tx-list">
          {recent.map((t) => (
            <TransactionRow key={t.id} tx={t} showDate />
          ))}
        </ul>
      </Card>
    </>
  )
}
