import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { getProductById, formatPrice } from '../data/mockProducts'
import { useApp } from '../context/AppContext'
import { getCatalogProduct } from '../lib/catalogDb'
import OfferBadge from '../components/OfferBadge'

const CATEGORY_EMOJIS = {
  'Lácteos': '🥛', 'Carnes': '🥩', 'Frutas y Verduras': '🥦',
  'Bebidas': '🥤', 'Limpieza': '🧹', 'Panadería': '🍞',
  'Snacks': '🍿', 'Congelados': '🧊', 'Despensa': '🥫', 'Higiene': '🧴',
}

function generateHistory(product) {
  const months = ['Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago']
  const base = product.regularPrice
  return months.map((month, i) => {
    const variation = Math.sin(i * 1.3 + (product.id?.charCodeAt?.(1) || 42)) * 0.15
    const price = Math.round((base + base * variation) / 10) * 10
    const isLast = i === months.length - 1
    return { month, price: isLast && product.isOnSale ? product.currentPrice : price, isOnSale: isLast && product.isOnSale }
  })
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { addToList, removeFromList, isInList, setTargetPrice, shoppingList } = useApp()

  // Producto desde el estado de navegación (resultado en vivo de Jumbo), del
  // catálogo indexado si se recargó la página, o del mock como último recurso.
  const [fetched, setFetched] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const product = location.state?.product || fetched || getProductById(id)

  useEffect(() => {
    if (location.state?.product || getProductById(id)) return
    setLookingUp(true)
    getCatalogProduct(id)
      .then(setFetched)
      .catch(() => setFetched(null))
      .finally(() => setLookingUp(false))
  }, [id]) // eslint-disable-line

  const inList = isInList(id)
  const listItem = shoppingList[id]

  const [targetInput, setTargetInput] = useState(
    listItem?.targetPrice ? String(listItem.targetPrice) : ''
  )
  const [savingTarget, setSavingTarget] = useState(false)
  const [targetSaved, setTargetSaved] = useState(false)

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        {lookingUp ? (
          <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <p className="text-gray-400">Producto no encontrado.</p>
        )}
        <button onClick={() => navigate(-1)} className="text-green-400 text-sm">Volver</button>
      </div>
    )
  }

  const history = generateHistory(product)
  const maxPrice = Math.max(...history.map(h => h.price))
  const minPrice = Math.min(...history.map(h => h.price))
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
    <div className="min-h-screen bg-gray-950 pb-nav">
      <div className="bg-gray-900 px-4 pt-safe pt-4 pb-4">
        <div className="max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-gray-400 text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Volver
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4 pt-2">
        {/* Hero */}
        <div className="bg-gray-800 rounded-2xl p-6 text-center">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-24 h-24 object-contain mx-auto mb-4 rounded-xl" />
          ) : (
            <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-4xl mb-4 ${product.isOnSale ? 'bg-orange-500/10' : 'bg-gray-700'}`}>
              {CATEGORY_EMOJIS[product.category] || '🛒'}
            </div>
          )}
          <h1 className="text-white font-bold text-lg leading-tight">{product.name}</h1>
          {product.brand && <p className="text-gray-500 text-xs mt-0.5">{product.brand}</p>}
          <p className="text-gray-400 text-sm mt-1">{product.category} · {product.unit || 'unidad'}</p>

          <div className="mt-4">
            <div className="flex items-center justify-center gap-3">
              <span className={`text-3xl font-bold ${product.isOnSale ? 'text-green-400' : 'text-white'}`}>
                {formatPrice(product.currentPrice)}
              </span>
              {product.isOnSale && <OfferBadge percent={product.discountPercent} size="lg" />}
            </div>
            {product.isOnSale && (
              <p className="text-gray-500 text-sm mt-1">
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
          <div className="bg-gray-800 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-gray-400 text-sm">Código:</span>
            <span className="text-white font-mono text-sm tracking-wider">{product.barcode}</span>
          </div>
        )}

        {/* Price target */}
        {inList && (
          <div className="bg-gray-800 rounded-2xl p-4">
            <h2 className="text-white font-semibold mb-1">Precio objetivo</h2>
            <p className="text-gray-400 text-xs mb-3">
              Te avisamos cuando el precio baje de este valor.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={targetInput}
                  onChange={e => setTargetInput(e.target.value)}
                  placeholder={String(Math.round(product.currentPrice * 0.9))}
                  className="w-full bg-gray-700 text-white rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                onClick={handleSaveTarget}
                disabled={savingTarget || !targetInput}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  targetSaved ? 'bg-green-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {targetSaved ? '✓ Guardado' : savingTarget ? '...' : 'Guardar'}
              </button>
            </div>
            {listItem?.targetPrice && (
              <p className="text-gray-400 text-xs mt-2">
                Objetivo actual: <span className="text-orange-400 font-medium">{formatPrice(listItem.targetPrice)}</span>
              </p>
            )}
          </div>
        )}

        {/* Price history */}
        <div className="bg-gray-800 rounded-2xl p-4">
          <h2 className="text-white font-semibold mb-4">Historial de precio</h2>
          <div className="flex items-end gap-1 h-28">
            {history.map((h, i) => {
              const pct = maxPrice === minPrice ? 60 : 20 + ((h.price - minPrice) / (maxPrice - minPrice)) * 60
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`w-full rounded-t-md ${h.isOnSale ? 'bg-orange-500' : 'bg-green-600/50'}`}
                    style={{ height: `${100 - pct}%` }} />
                  <span className="text-gray-500 text-[9px]">{h.month}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-gray-500 text-xs">Mín: {formatPrice(minPrice)}</span>
            <span className="text-gray-500 text-xs">Máx: {formatPrice(maxPrice)}</span>
          </div>
        </div>
      </div>

      {/* Sticky button */}
      <div className="fixed bottom-nav left-0 right-0 px-4 pb-2 z-30">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleToggle}
            className={`w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] ${
              inList ? 'bg-gray-700 text-gray-300' : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20'
            }`}
          >
            {inList ? '✓ En mi lista · Quitar' : '+ Agregar a mi lista'}
          </button>
        </div>
      </div>
    </div>
  )
}
