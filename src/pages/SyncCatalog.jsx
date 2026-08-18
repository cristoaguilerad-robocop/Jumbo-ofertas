import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { isConfigured } from '../supabase'
import { syncCatalog, loadProgress, clearProgress, countCatalog } from '../lib/catalogSync'
import { diagnose } from '../lib/jumboApi'

export default function SyncCatalog() {
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [catalogCount, setCatalogCount] = useState(null)
  const [resumable, setResumable] = useState(false)
  const [diag, setDiag] = useState(null)
  const [diagLoading, setDiagLoading] = useState(false)
  const abortRef = useRef(null)

  async function runDiagnose() {
    setDiagLoading(true)
    setDiag(null)
    try {
      setDiag(await diagnose())
    } catch (err) {
      setDiag({ error: String(err) })
    } finally {
      setDiagLoading(false)
    }
  }

  useEffect(() => {
    countCatalog().then(setCatalogCount)
    setResumable(!!loadProgress())
  }, [])

  async function start(restart) {
    setError(null)
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await syncCatalog({
        signal: controller.signal,
        restart,
        onProgress: p => setProgress(prev => ({ ...prev, ...p })),
      })
      clearProgress()
      setResumable(false)
      setCatalogCount(await countCatalog())
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
      setResumable(!!loadProgress())
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
    <div className="min-h-screen bg-gray-950 pb-24">
      <div className="bg-gray-900 px-4 pt-safe pt-6 pb-4">
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
              La descarga toma <span className="text-white font-medium">entre 15 y 25 minutos</span>.
              Deja esta pestaña abierta y con la pantalla encendida. Si se corta, puedes retomar
              donde quedó.
            </p>
            <p className="text-gray-500 text-xs">
              Se ejecuta desde tu navegador porque Jumbo bloquea las peticiones que vienen de
              servidores.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => start(false)}
                disabled={!isConfigured}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white py-3 rounded-xl font-semibold text-sm"
              >
                {resumable ? 'Retomar sincronización' : 'Sincronizar catálogo'}
              </button>
              {resumable && (
                <button
                  onClick={() => { clearProgress(); setResumable(false); start(true) }}
                  className="px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl text-sm"
                >
                  Desde cero
                </button>
              )}
            </div>
          </div>
        )}

        {running && (
          <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium text-sm">
                {progress?.phase === 'categories' ? 'Leyendo categorías...' : 'Descargando productos'}
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
                <p className="text-gray-500 text-xs">Productos guardados</p>
                <p className="text-white font-bold">
                  {(progress?.totalSaved || 0).toLocaleString('es-CL')}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Categorías</p>
                <p className="text-white font-bold">
                  {progress?.doneCategories || 0} / {progress?.totalCategories || '—'}
                </p>
              </div>
            </div>

            {progress?.currentCategory && (
              <p className="text-gray-500 text-xs truncate">{progress.currentCategory}</p>
            )}
            {progress?.failed > 0 && (
              <p className="text-orange-400 text-xs">
                {progress.failed} {progress.failed === 1 ? 'categoría omitida' : 'categorías omitidas'} por errores
              </p>
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
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm text-green-400">
            Catálogo sincronizado: {progress.totalSaved.toLocaleString('es-CL')} productos.
          </div>
        )}

        {error && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-sm text-orange-400">
            {error}
          </div>
        )}

        {/* Diagnóstico: qué responde Jumbo desde el servidor del proxy */}
        <div className="bg-gray-800 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-white font-medium text-sm">Diagnóstico de conexión</p>
            <p className="text-gray-500 text-xs mt-0.5">
              Prueba las rutas de Jumbo desde el servidor y muestra qué responde cada una.
            </p>
          </div>
          <button
            onClick={runDiagnose}
            disabled={diagLoading}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 py-2.5 rounded-xl text-sm disabled:opacity-60"
          >
            {diagLoading ? 'Probando...' : 'Probar conexión'}
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
