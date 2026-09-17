import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const KEY = 'jumbo_theme'
const ThemeContext = createContext(null)

/** 'system' sigue la preferencia del teléfono; 'light' y 'dark' la ignoran. */
function resolve(choice) {
  if (choice === 'light' || choice === 'dark') return choice
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(mode) {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  // La barra del navegador en el teléfono también se tiñe; sin esto quedaba
  // verde sobre un fondo oscuro y parecía parte de otra app.
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'dark' ? '#030712' : '#f1f5f9')
}

export function ThemeProvider({ children }) {
  const [choice, setChoice] = useState(() => {
    try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
  })
  const [mode, setMode] = useState(() => resolve(choice))

  useEffect(() => {
    const next = resolve(choice)
    setMode(next)
    apply(next)
    try { localStorage.setItem(KEY, choice) } catch { /* modo privado */ }

    // Con 'system' hay que seguir escuchando: el teléfono puede cambiar solo al
    // anochecer, y la app debe acompañarlo sin recargar.
    if (choice !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => { const m = resolve('system'); setMode(m); apply(m) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  const value = { choice, mode, setTheme: useCallback(c => setChoice(c), []) }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}
