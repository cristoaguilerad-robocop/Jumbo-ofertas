import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { isConfigured } from '../supabase'
import { syncCatalog, loadProgress, clearProgress, countCatalog } from '../lib/catalogSync'
import { runBenchmark } from '../lib/jumboApi'
import { EXCLUDED_SECTIONS } from '../lib/catalogFilters'

const SECTION_LABELS = {
  ropa: 'Ropa', mascotas: 'Mascotas', hogar: 'Hogar',
  jugueteria: 'Juguetería', farmacia: 'Farmacia', libreria: 'Librería',
}

export default function SyncCatalog() {
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [catalogCount, setCatalogCount] = useState(null)
  const [resumable, setResumable] = useState(false)
  const [resumeInfo, setResumeInfo] = useState(null)
  const [diag, setDiag] = useState(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const abortRef = useRef(null)

  async function runDiagnose() {
    setDiagLoading(true)
    setDiag(null)
    try {
      setDiag(await runBenchmark())
    } catch (err) {
      setDiag({ error: String(err) })
    } finally {
      setDiagLoading(false)
    }
  }

  useEffect(() => {
    countCatalog().then(setCatalogCount)
    const saved = loadProgress()
    setResumable(!!saved)
    setResumeInfo(saved)
  }, [])

  async function start(restart) {
    setError(null)
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await syncCatalog({
        signal: controller.signal,
        restart,
        onProgress: p => setProgress(prev => ({ ...prev, ...p })),
      })
      // Solo se borra el punto de retomada si el recorrido terminó de verdad.
      // Antes se borraba siempre, así que agotar los 10 minutos dejaba el
      // progreso en la basura y la única salida era empezar de cero.
      if (result.outOfTime) {
        setResumeInfo(loadProgress())
        setResumable(!!loadProgress())
      } else {
        clearProgress()
        setResumable(false)
      }
      setCatalogCount(await countCatalog())
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
      // Detener a mano también deja desde dónde seguir.
      setResumeInfo(loadProgress())
      setResumable(!!loadProgress())
      setCatalogCount(await countCatalog().catch(() => null))
    } finally {
      setRunning(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  const pct = progress?.totalCategories
    ? Math.round((progress.doneCategories / progress.totalCategories) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-950 pb-nav">
      <div className="bg-gray-900 px-4 pt-header pb-4">
        <div className="max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="text-gray-400 text-sm mb-2">← Volver</button>
          <h1 className="text-white font-bold text-xl">Catálogo completo</h1>
          <p className="text-gray-400 text-sm mt-1">
            Descarga todo el catálogo de Jumbo para buscar y navegar al instante.
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {!isConfigured && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-sm text-orange-400">
            Supabase no está configurado. El catálogo necesita una base de datos para guardarse.
          </div>
        )}

        <div className="bg-gray-800 rounded-2xl p-4">
          <p className="text-gray-400 text-xs">Productos en tu catálogo</p>
          <p className="text-white text-3xl font-bold mt-1">
            {catalogCount === null ? '—' : catalogCount.toLocaleString('es-CL')}
          </p>
        </div>

        {isConfigured && catalogCount === null && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-sm text-orange-400">
            No se pudo leer la tabla <span className="font-mono">products</span>. Revisa que hayas
            ejecutado <span className="font-mono">supabase/products.sql</span> en el SQL Editor de
            Supabase.
          </div>
        )}

        {!running && (
          <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
            <p className="text-gray-300 text-sm">
              La descarga se detiene sola a los <span className="text-white font-medium">10 minutos</span>.
              Deja esta pestaña abierta y con la pantalla encendida. Si queda a medias, «Retomar»
              sigue donde quedó.
            </p>
            <p className="text-gray-500 text-xs">
              Las peticiones pasan por un proxy propio, porque la API de Jumbo no permite que la
              llamen desde otro dominio.
            </p>
            <div className="border-t border-gray-700 pt-3">
              <p className="text-gray-400 text-xs mb-2">Secciones excluidas del catálogo:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(EXCLUDED_SECTIONS).map(section => (
                  <span key={section} className="px-2 py-1 rounded-lg bg-gray-700 text-gray-300 text-[11px]">
                    {SECTION_LABELS[section] || section}
                  </span>
                ))}
              </div>
            </div>
            {resumable && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <p className="text-green-400 text-xs font-medium">Hay una descarga a medias</p>
                <p className="text-gray-400 text-xs mt-0.5">
                  Quedaron {resumeInfo?.doneCategories?.length || 0} categorías listas
                  {resumeInfo?.totalSaved
                    ? ` y ${resumeInfo.totalSaved.toLocaleString('es-CL')} productos guardados`
                    : ''}
                  . «Retomar» sigue desde ahí sin repetirlas.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => start(false)}
                disabled={!isConfigured}
                className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white py-3 rounded-xl font-semibold text-sm"
              >
                {resumable ? '▶ Retomar donde quedó' : 'Sincronizar catálogo'}
              </button>
              {/* «Desde cero» siempre disponible: es la única forma de corregir
                  etiquetas de categoría mal asignadas y de purgar productos que
                  Jumbo ya no lista. */}
              <button
                onClick={() => { clearProgress(); setResumable(false); start(true) }}
                disabled={!isConfigured}
                className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 py-2.5 rounded-xl text-sm"
              >
                Sincronizar desde cero
              </button>
              <p className="text-gray-500 text-xs">
                Se recorre en dos fases: primero las vitrinas de ofertas, después las
                categorías reales, para que cada producto quede etiquetado por lo que es
                y no por la promoción en que aparece.
              </p>
              <p className="text-gray-500 text-xs">
                «Desde cero» vuelve a recorrer todo y, al terminar completo, borra
                los productos que Jumbo ya no lista y los artículos de prueba.
                Conserva los códigos de barras que hayas vinculado escaneando.
              </p>
            </div>
          </div>
        )}

        {running && (
          <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium text-sm">
                {progress?.phase === 'categories' ? 'Leyendo categorías...'
                  : progress?.phase === 'purging' ? 'Limpiando productos que ya no existen...'
                  : progress?.phase === 'relabeling' ? 'Corrigiendo categorías...'
                  : progress?.phaseLabel === 'vitrinas' ? 'Vitrinas de ofertas (1 de 2)'
                  : 'Categorías del supermercado (2 de 2)'}
              </span>
              <span className="text-green-400 font-bold text-sm">{pct}%</span>
            </div>

            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="text-gray-500 text-xs">Productos distintos</p>
                <p className="text-white font-bold">
                  {(progress?.uniqueProducts || 0).toLocaleString('es-CL')}
                </p>
                {progress?.totalSaved > progress?.uniqueProducts && (
                  <p className="text-gray-500 text-[10px] mt-0.5">
                    {progress.totalSaved.toLocaleString('es-CL')} lecturas · un producto
                    aparece en varias categorías
                  </p>
                )}
              </div>
              <div>
                <p className="text-gray-500 text-xs">Categorías</p>
                <p className="text-white font-bold">
                  {progress?.doneCategories || 0} / {progress?.totalCategories || '—'}
                </p>
              </div>
              {progress?.productsPerMin > 0 && (
                <div>
                  <p className="text-gray-500 text-xs">Velocidad</p>
                  <p className="text-white font-bold">
                    {progress.productsPerMin.toLocaleString('es-CL')}
                    <span className="text-gray-400 font-normal text-xs"> /min</span>
                  </p>
                </div>
              )}
              {progress?.etaMin > 0 && (
                <div>
                  <p className="text-gray-500 text-xs">Tiempo restante</p>
                  <p className="text-white font-bold">
                    ~{progress.etaMin < 60
                      ? `${progress.etaMin} min`
                      : `${Math.floor(progress.etaMin / 60)} h ${progress.etaMin % 60} min`}
                  </p>
                </div>
              )}
            </div>

            {progress?.currentCategory && (
              <p className="text-gray-500 text-xs truncate">
                {progress.currentCategory}
                {progress.currentPage > 1 && ` · página ${progress.currentPage}`}
              </p>
            )}
            {progress?.excludedCount > 0 && (
              <p className="text-gray-500 text-xs">
                {progress.excludedCount} categorías omitidas por filtro
                {progress.excludedSections?.length
                  ? ` (${progress.excludedSections.map(s => SECTION_LABELS[s] || s).join(', ')})`
                  : ''}
                {progress.skippedParents > 0 &&
                  ` · ${progress.skippedParents} categorías padre omitidas por redundancia`}
              </p>
            )}
            {progress?.failed > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 space-y-1">
                <p className="text-orange-400 text-xs font-medium">
                  {progress.failed} {progress.failed === 1 ? 'categoría falló' : 'categorías fallaron'}
                </p>
                {progress.lastError && (
                  <p className="text-orange-300/80 text-[11px] font-mono break-words">
                    {progress.lastError}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={stop}
              className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2.5 rounded-xl text-sm"
            >
              Detener
            </button>
          </div>
        )}

        {progress?.phase === 'done' && !running && (
          progress.outOfTime ? (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-sm text-orange-400">
              Se alcanzó el límite de 10 minutos con {(progress.uniqueProducts || 0).toLocaleString('es-CL')} productos
              y {progress.doneCategories} de {progress.totalCategories} categorías.
              Toca «Retomar donde quedó» para continuar; no se repite lo ya descargado.
            </div>
          ) : (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm text-green-400">
              Catálogo sincronizado: {(progress.uniqueProducts || 0).toLocaleString('es-CL')} productos distintos.
              {progress.relabelError && (
                <span className="block text-orange-400 text-xs mt-1">
                  No se pudieron escribir las categorías de
                  {' '}{progress.pendingFixes?.toLocaleString('es-CL')} productos:
                  {' '}{progress.relabelError}
                </span>
              )}
              {progress.relabeled > 0 && (
                <span className="block text-gray-400 text-xs mt-1">
                  Se fijó la categoría de {progress.relabeled.toLocaleString('es-CL')} productos
                  según la mejor ruta encontrada para cada uno.
                </span>
              )}
              {progress.promoOnly > 0 && (
                <span className="block text-gray-400 text-xs mt-1">
                  {progress.promoOnly.toLocaleString('es-CL')} productos solo existen dentro de una
                  vitrina promocional en jumbo.cl, así que esa es su única categoría disponible.
                </span>
              )}
              {progress.purgeError && (
                <span className="block text-orange-400 text-xs mt-1">
                  No se pudieron borrar los productos obsoletos: {progress.purgeError}.
                  Ejecuta <span className="font-mono">supabase/cleanup.sql</span> en el SQL
                  Editor para habilitar el permiso de borrado.
                </span>
              )}
              {progress.purged > 0 && (
                <span className="block text-gray-400 text-xs mt-1">
                  Se eliminaron {progress.purged.toLocaleString('es-CL')} productos que ya no
                  existen en Jumbo o quedaban de la fase de prueba.
                </span>
              )}
            </div>
          )
        )}

        {error && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-sm text-orange-400">
            {error}
          </div>
        )}

        {/* Qué versión de la app está corriendo. Sin esto no había forma de
            distinguir un error real de un build viejo servido desde caché. */}
        <p className="text-gray-600 text-[11px] text-center">
          versión <span className="font-mono">{__BUILD_COMMIT__}</span> · {__BUILD_TIME__} UTC
        </p>

        {/* Diagnóstico: qué responde Jumbo desde el servidor del proxy */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-white font-medium text-sm">Medir velocidad de descarga</p>
            <p className="text-gray-500 text-xs mt-0.5">
              Compara estrategias de descarga y reporta KB por producto de cada una.
            </p>
          </div>
          <button
            onClick={runDiagnose}
            disabled={diagLoading}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-xl text-sm disabled:opacity-60"
          >
            {diagLoading ? 'Midiendo...' : 'Medir estrategias'}
          </button>
          {diag && (
            <pre className="bg-gray-950 text-gray-300 text-[10px] leading-relaxed rounded-xl p-3 overflow-x-auto max-h-72 overflow-y-auto">
              {JSON.stringify(diag, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
