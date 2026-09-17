import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { formatPrice } from '../data/catalog'
import { useApp } from '../context/AppContext'
import { getCatalogProduct, getPriceHistory, recordPrices } from '../lib/catalogDb'
import PriceHistory from '../components/PriceHistory'
import OfferBadge from '../components/OfferBadge'
import { productImageProps } from '../lib/productImage'

const CATEGORY_EMOJIS = {
  'Lácteos': '🥛', 'Carnes': '🥩', 'Frutas y Verduras': '🥦',
  'Bebidas': '🥤', 'Limpieza': '🧹', 'Panadería': '🍞',
  'Snacks': '🍿', 'Congelados': '🧊', 'Despensa': '🥫', 'Higiene': '🧴',
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { addToList, removeFromList, isInList, setTargetPrice, shoppingList } = useApp()

  // Producto desde el estado de navegación (resultado en vivo de Jumbo) o del
  // catálogo indexado si se recargó la página.
  const [fetched, setFetched] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const product = location.state?.product || fetched

  useEffect(() => {
    if (location.state?.product) return
    setLookingUp(true)
    getCatalogProduct(id)
      .then(setFetched)
      .catch(() => setFetched(null))
      .finally(() => setLookingUp(false))
  }, [id]) // eslint-disable-line

  // Historial real: lo que la app fue registrando cada vez que consultó el
  // precio. Se anota también la visita de hoy, así una ficha abierta a diario
  // va construyendo su propia serie.
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setHistoryLoading(true)
    getPriceHistory(id)
      .then(rows => { if (alive) setHistory(rows) })
      .catch(() => { if (alive) setHistory([]) })
      .finally(() => { if (alive) setHistoryLoading(false) })
    return () => { alive = false }
  }, [id])

  const observedPrice = product?.currentPrice
  useEffect(() => {
    if (!product || !Number.isFinite(observedPrice)) return
    recordPrices([product]).catch(() => { /* la ficha se ve igual sin registrar */ })
  }, [product?.id, observedPrice]) // eslint-disable-line

  const inList = isInList(id)
  const listItem = shoppingList[id]

  const [targetInput, setTargetInput] = useState(
    listItem?.targetPrice ? String(listItem.targetPrice) : ''
  )
  const [savingTarget, setSavingTarget] = useState(false)
  const [targetSaved, setTargetSaved] = useState(false)

  if (!product) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4">
        {lookingUp ? (
          <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <p className="text-content-dim">Producto no encontrado.</p>
        )}
        <button onClick={() => navigate(-1)} className="text-green-400 text-sm">Volver</button>
      </div>
    )
  }

  const savings = product.isOnSale ? product.regularPrice - product.currentPrice : 0

  const handleToggle = async () => {
    if (inList) await removeFromList(product.id)
    else await addToList(product)
  }

  const handleSaveTarget = async () => {
    const val = parseFloat(targetInput)
    if (!val || val <= 0) return
    setSavingTarget(true)
    await setTargetPrice(product.id, val)
    setSavingTarget(false)
    setTargetSaved(true)
    setTimeout(() => setTargetSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-canvas pb-nav">
      <div className="bg-surface px-4 pt-header-sm pb-4">
        <div className="max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-content-dim text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Volver
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4 pt-2">
        {/* Hero */}
        <div className="bg-card rounded-2xl p-6 text-center">
          {product.imageUrl ? (
            <img {...productImageProps(product.imageUrl, 192)} alt={product.name} decoding="async" className="w-48 h-48 object-contain mx-auto mb-4 rounded-2xl product-media p-2" />
          ) : (
            <div className={`w-40 h-40 mx-auto rounded-2xl flex items-center justify-center text-6xl mb-4 ${product.isOnSale ? 'bg-orange-500/10' : 'bg-muted'}`}>
              {CATEGORY_EMOJIS[product.category] || '🛒'}
            </div>
          )}
          <h1 className="text-content font-bold text-lg leading-tight">{product.name}</h1>
          {product.brand && <p className="text-content-faint text-xs mt-0.5">{product.brand}</p>}
          <p className="text-content-dim text-sm mt-1">{product.category} · {product.unit || 'unidad'}</p>

          <div className="mt-4">
            <div className="flex items-center justify-center gap-3">
              <span className={`text-3xl font-bold ${product.isOnSale ? 'text-green-400' : 'text-content'}`}>
                {formatPrice(product.currentPrice)}
              </span>
              {product.isOnSale && <OfferBadge percent={product.discountPercent} size="lg" />}
            </div>
            {product.isOnSale && (
              <p className="text-content-faint text-sm mt-1">
                Normal: <span className="line-through">{formatPrice(product.regularPrice)}</span>
                {' · '}Ahorras <span className="text-green-400 font-medium">{formatPrice(savings)}</span>
              </p>
            )}
            {product.source === 'jumbo' && (
              <p className="text-green-400 text-xs mt-2 flex items-center justify-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                Precio en tiempo real de Jumbo
              </p>
            )}
          </div>
        </div>

        {/* Barcode */}
        {product.barcode && (
          <div className="bg-card rounded-2xl p-4 flex items-center gap-3">
            <span className="text-content-dim text-sm">Código:</span>
            <span className="text-content font-mono text-sm tracking-wider">{product.barcode}</span>
          </div>
        )}

        {/* Price target */}
        {inList && (
          <div className="bg-card rounded-2xl p-4">
            <h2 className="text-content font-semibold mb-1">Precio objetivo</h2>
            <p className="text-content-dim text-xs mb-3">
              Te avisamos cuando el precio baje de este valor.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-dim text-sm">$</span>
                <input
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  placeholder={String(Math.round(product.currentPrice * 0.9))}
                  className="w-full bg-muted text-content rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                onClick={handleSaveTarget}
                disabled={savingTarget || !targetInput}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  targetSaved ? 'bg-green-500 text-white' : 'bg-muted text-content-soft hover:bg-muted-strong'
                }`}
              >
                {targetSaved ? '✓ Guardado' : savingTarget ? '...' : 'Guardar'}
              </button>
            </div>
            {listItem?.targetPrice && (
              <p className="text-content-dim text-xs mt-2">
                Objetivo actual: <span className="text-orange-400 font-medium">{formatPrice(listItem.targetPrice)}</span>
              </p>
            )}
          </div>
        )}

        {/* Price history */}
        <PriceHistory history={history} loading={historyLoading} />
      </div>

      {/* Sticky button */}
      <div className="fixed bottom-nav left-0 right-0 px-4 pb-2 z-30">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleToggle}
            className={`w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] ${
              inList ? 'bg-muted text-content-soft' : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20'
            }`}
          >
            {inList ? '✓ En mi lista · Quitar' : '+ Agregar a mi lista'}
          </button>
        </div>
      </div>
    </div>
  )
}
