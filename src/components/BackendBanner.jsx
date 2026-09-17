import { useApp } from '../context/AppContext'

/**
 * Aviso cuando no se puede hablar con Supabase.
 *
 * Sin esto, un backend caído se veía igual que un catálogo vacío: buscador sin
 * resultados, lista en blanco, cero ofertas, y el motivo solo en la consola del
 * navegador, que en un teléfono nadie abre. La causa más habitual es que el
 * proyecto se pause solo tras unos días sin uso, y eso se resuelve con un botón
 * —pero hay que saber que es lo que pasa.
 */
export default function BackendBanner() {
  const { backendError } = useApp()
  if (!backendError) return null

  return (
    <div className="fixed left-0 right-0 top-0 z-50 px-4 pt-header-sm pb-3 bg-orange-500/95 backdrop-blur">
      <div className="max-w-lg mx-auto">
        <p className="text-white text-sm font-semibold">
          No se pudo conectar con la base de datos
        </p>
        <p className="text-orange-50 text-xs mt-1 leading-relaxed">
          Si tu proyecto de Supabase lleva días sin uso, se pausa solo. Entra a{' '}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="underline font-medium"
          >
            supabase.com/dashboard
          </a>{' '}
          y pulsa «Restore project». No se pierde nada: el catálogo y tus listas
          siguen guardados.
        </p>
        <p className="text-orange-100/80 text-[11px] mt-1.5 font-mono break-words">
          {backendError}
        </p>
      </div>
    </div>
  )
}
