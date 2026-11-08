import { describe, expect, it } from 'vitest'
import { buildXlsx } from './xlsx'

describe('buildXlsx', () => {
  it('makes a zip with one worksheet per sheet', async () => {
    const blob = buildXlsx([
      { name: 'Movimentos', rows: [['Data', 'Valor', 'Partilhado'], ['2026-11-08', -12.5, true]] },
      { name: 'Ação & <teste>', rows: [['Nome'], ['Conceição "Ção"']] },
    ])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]) // zip signature
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('xl/worksheets/sheet2.xml')
    expect(text).toContain('<v>-12.5</v>')
    expect(text).toContain('Ação &amp; &lt;teste&gt;')
    expect(text).toContain('Conceição &quot;Ção&quot;')
    if (process.env.XLSX_OUT) (await import('node:fs')).writeFileSync(process.env.XLSX_OUT, bytes)
  })
})
