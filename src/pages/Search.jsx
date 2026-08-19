import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { CATEGORIES } from '../data/catalog'
import { useProducts, useCategories, searchByBarcode, suggestForBarcode } from '../hooks/useProducts'
import ProductCard from '../components/ProductCard'
import BarcodeScanner from '../components/BarcodeScanner'
import EmptyState from '../components/EmptyState'
import { linkBarcode } from '../lib/catalogDb'
import { useApp } from '../context/AppContext'

export default function Search() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  // Código escaneado que no se pudo resolver: queda a la espera de que el
  // usuario elija a qué producto corresponde.
  const [pendingBarcode, setPendingBarcode] = useState(null)
  const [linkError, setLinkError] = useState(null)
  const [scanned, setScanned] = useState(null)
  // Pista de Open Food Facts y candidatos del catálogo para un código
  // desconocido, para no dejar al usuario tecleando el nombre a ciegas.
  const [suggestion, setSuggestion] = useState(null)
  const { addToList } = useApp()

  const {
    query, setQuery, category, setCategory, onlyOffers, setOnlyOffers,
    results, loading, loadingMore, hasMore, loadMore, error, isLive, source,
  } = useProducts()
  const categories = useCategories(CATEGORIES)

  useEffect(() => {
    if (searchParams.get('scanner') === '1') setShowScanner(true)
    if (searchParams.get('offers') === '1') setOnlyOffers(true)
  }, []) // eslint-disable-line

  useEffect(() => {
    if (!showScanner) setTimeout(() => inputRef.current?.focus(), 300)
  }, [showScanner])

  async function handleBarcodeDetected(barcode) {
    setShowScanner(false)
    setScanError(null)
    setLinkError(null)
    setScanned(null)
    setScanLoading(true)
    const product = await searchByBarcode(barcode)
    setScanLoading(false)
    if (product) {
      // Escanear es para agregar rápido: se suma a la lista de inmediato y se
      // confirma en pantalla, en vez de obligar a un paso más.
      await addToList(product)
      setScanned(product)
      return
    }
    // Jumbo no publica el EAN, así que un código desconocido se resuelve
    // pidiéndole al usuario que lo vincule una vez. Open Food Facts sí conoce
    // el EAN, y su nombre sirve para proponer candidatos del catálogo.
    setPendingBarcode(barcode)
    setQuery('')
    setSuggestion({ loading: true })
    const found = await suggestForBarcode(barcode)

    // Un único resultado al buscar los 13 dígitos en Jumbo es coincidencia
    // real, no difusa: se vincula solo. Escanear existe para ahorrar pasos.
    if (found.exact && found.candidates.length === 1) {
      await handleLinkProduct(found.candidates[0], barcode)
      return
    }

    setSuggestion({ loading: false, ...found })
    // Deja el buscador cargado con el nombre que se logró deducir, para que la
    // lista de resultados aparezca sola. Antes había que teclearlo a mano, que
    // es exactamente lo que el escaneo venía a evitar.
    if (found.prefill) setQuery(found.prefill)
  }

  async function handleLinkProduct(product, barcode = pendingBarcode) {
    if (!barcode) return
    try {
      const linked = await linkBarcode(product, barcode)
      await addToList(linked)
      setPendingBarcode(null)
      setSuggestion(null)
      setQuery('')
      setScanned(linked)
    } catch (err) {
      setLinkError(`No se pudo guardar el código: ${err.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-nav">
      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Header */}
      <div className="bg-gray-900 px-4 pt-header pb-4 sticky top-0 z-40">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar en Jumbo..."
                className="w-full bg-gray-800 text-white placeholder-gray-500 rounded-xl pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              {(loading || scanLoading) && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {query && !loading && (
                <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => setShowScanner(true)}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl px-3 flex items-center justify-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h3A1.5 1.5 0 0 1 9 4.5v3A1.5 1.5 0 0 1 7.5 9h-3A1.5 1.5 0 0 1 3 7.5v-3ZM3 16.5A1.5 1.5 0 0 1 4.5 15h3A1.5 1.5 0 0 1 9 16.5v3A1.5 1.5 0 0 1 7.5 21h-3A1.5 1.5 0 0 1 3 19.5v-3ZM15 4.5A1.5 1.5 0 0 1 16.5 3h3A1.5 1.5 0 0 1 21 4.5v3A1.5 1.5 0 0 1 19.5 9h-3A1.5 1.5 0 0 1 15 7.5v-3ZM15 16.5A1.5 1.5 0 0 1 16.5 15h3A1.5 1.5 0 0 1 21 16.5v3A1.5 1.5 0 0 1 19.5 21h-3A1.5 1.5 0 0 1 15 19.5v-3Z" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setOnlyOffers(!onlyOffers)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                onlyOffers ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              🏷️ Solo ofertas
            </button>
            {isLive && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                Precios Jumbo en tiempo real
              </span>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  category === cat ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-2">
        {scanError && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-sm text-orange-400">
            {scanError}
          </div>
        )}

        {scanned && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3">
            {scanned.imageUrl && (
              <img src={scanned.imageUrl} alt="" className="w-14 h-14 rounded-xl object-contain bg-white p-1 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-green-400 text-sm font-medium">Agregado a tu lista</p>
              <p className="text-gray-300 text-xs truncate">{scanned.name}</p>
            </div>
            <button
              onClick={() => navigate(`/product/${scanned.id}`, { state: { product: scanned } })}
              className="shrink-0 text-xs text-green-400 underline"
            >
              Ver
            </button>
            <button
              onClick={() => { setScanned(null); setShowScanner(true) }}
              className="shrink-0 bg-green-500 text-white text-xs px-3 py-2 rounded-lg font-medium"
            >
              Escanear otro
            </button>
          </div>
        )}

        {pendingBarcode && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 space-y-2">
            <p className="text-sm text-green-400">
              Código <span className="font-mono">{pendingBarcode}</span> sin registrar.
            </p>
            {suggestion?.loading && (
              <p className="text-xs text-gray-400">Identificando el código…</p>
            )}

            {suggestion && !suggestion.loading && suggestion.hint && (
              <p className="text-xs text-gray-300">
                Parece ser <span className="text-white font-medium">
                  {[suggestion.hint.brand, suggestion.hint.name, suggestion.hint.quantity]
                    .filter(Boolean).join(' ')}
                </span>
                <span className="text-gray-500"> · según Open Food Facts</span>
              </p>
            )}

            {suggestion && !suggestion.loading && !suggestion.hint && !suggestion.candidates?.length && (
              <p className="text-xs text-gray-400">
                No se pudo identificar este código automáticamente. Es normal en
                productos chilenos: las bases abiertas de códigos no los cubren.
              </p>
            )}

            <p className="text-xs text-gray-400">
              {suggestion?.candidates?.length
                ? 'Toca el producto correcto para vincularlo. La próxima vez se reconocerá solo.'
                : 'Busca el producto arriba y tócalo para vincularlo. Solo hay que hacerlo una vez: después el escaneo lo reconoce solo.'}
            </p>

            {suggestion?.candidates?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {suggestion.candidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleLinkProduct(c)}
                    className="w-full bg-gray-800 hover:bg-gray-700 rounded-xl p-2.5 flex items-center gap-2.5 text-left transition-colors"
                  >
                    {c.imageUrl && (
                      <img src={c.imageUrl} alt="" className="w-14 h-14 rounded-xl object-contain bg-white p-1 shrink-0" />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-white text-sm leading-snug line-clamp-2">{c.name}</span>
                      <span className="block text-gray-400 text-[11px] mt-0.5">
                        ${c.currentPrice?.toLocaleString('es-CL')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setPendingBarcode(null); setLinkError(null); setSuggestion(null) }}
              className="text-xs text-gray-400 underline"
            >
              Cancelar vinculación
            </button>
          </div>
        )}

        {linkError && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-sm text-orange-400">
            {linkError}
          </div>
        )}

        {scanLoading && (
          <div className="flex items-center justify-center py-10 gap-3">
            <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Buscando en Jumbo...</p>
          </div>
        )}

        {!scanLoading && error && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs text-gray-400">
            No se pudo conectar con Jumbo ({error}). Mostrando catálogo local.
          </div>
        )}

        {!scanLoading && results.length === 0 && !loading && (
          <EmptyState
            icon="🔍"
            title="Sin resultados"
            description="Intenta con otro nombre o escanea el código de barras del producto."
          />
        )}

        {!scanLoading && results.length > 0 && (
          <>
            <p className="text-gray-500 text-xs px-1">
              {results.length} {results.length === 1 ? 'producto' : 'productos'}
              {source === 'catalog' ? ' en tu catálogo Jumbo'
                : source === 'jumbo' ? ' desde Jumbo en vivo'
                : ' en catálogo local'}
            </p>
            {results.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onSelect={pendingBarcode ? (p => handleLinkProduct(p)) : undefined}
              />
            ))}

            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {loadingMore ? 'Cargando...' : 'Cargar más productos'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
