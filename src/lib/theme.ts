// Light/dark choice. 'auto' follows the phone. The resolved theme is written to
// <html data-theme> (first by the inline script in index.html, so there's no flash).
export type ThemeChoice = 'auto' | 'light' | 'dark'

const KEY = 'theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

export const getTheme = (): ThemeChoice => {
  const v = localStorage.getItem(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

function apply() {
  const choice = getTheme()
  const dark = choice === 'dark' || (choice === 'auto' && systemDark.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setTheme(choice: ThemeChoice) {
  if (choice === 'auto') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, choice)
  apply()
}

apply()
systemDark.addEventListener('change', apply)
