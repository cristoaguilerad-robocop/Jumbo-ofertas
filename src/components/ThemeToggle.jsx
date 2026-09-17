import { useTheme } from '../context/ThemeContext'

const OPTIONS = [
  { id: 'light', label: 'Claro', icon: '☀️' },
  { id: 'dark', label: 'Oscuro', icon: '🌙' },
  { id: 'system', label: 'Auto', icon: '📱' },
]

/**
 * Selector de tema. «Auto» sigue al teléfono, que es lo que la mayoría espera
 * por defecto, pero deja elegir explícitamente para quien usa la app en el
 * supermercado con mucha luz y necesita el modo claro.
 */
export default function ThemeToggle() {
  const { choice, setTheme } = useTheme()

  return (
    <div className="inline-flex rounded-full bg-muted p-0.5" role="group" aria-label="Tema">
      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => setTheme(opt.id)}
          aria-pressed={choice === opt.id}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            choice === opt.id
              ? 'bg-card text-content shadow-sm'
              : 'text-content-dim'
          }`}
        >
          <span aria-hidden="true">{opt.icon}</span>
          <span className="ml-1">{opt.label}</span>
        </button>
      ))}
    </div>
  )
}
