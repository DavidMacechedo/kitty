import type { Category, CategoryKind } from './types'

// An emoji per category, shown on chips, rows, bars and meters.
// This file ships in the public app bundle: only generic category names here,
// never personal ones (people, pets, schools). Those use the kind fallback.
const BY_NAME: Record<string, string> = {
  'Eating out': '🍔',
  Groceries: '🛒',
  Transportes: '🚌',
  Combustível: '⛽',
  Carro: '🚗',
  Casa: '🏠',
  Escritório: '💼',
  Prendas: '🎁',
  Viagens: '✈️',
  Roupa: '👕',
  Saúde: '💊',
  'Games/Lazer': '🎮',
  Salário: '💶',
  Mesada: '💶',
  Outros: '🏷️',
  Eventos: '🎟️',
  Gym: '🏋️',
  Tech: '💻',
  Claude: '🤖',
  Educação: '🎓',
  'Corte cabelo': '💇',
  Devolução: '↩️',
  'Conta Poupança': '🐷',
  Investimentos: '📈',
}

// Categories created later fall back to an icon for their kind.
const BY_KIND: Record<CategoryKind, string> = {
  expense: '💸',
  income: '💶',
  savings: '🐷',
  investment: '📈',
  transfer: '🔁',
}

export function categoryIcon(category: Pick<Category, 'name' | 'kind' | 'icon'> | undefined): string {
  if (!category) return BY_KIND.expense
  return category.icon || BY_NAME[category.name] || BY_KIND[category.kind]
}
