import { useParams, useNavigate } from 'react-router-dom'
import { getProductById, formatPrice } from '../data/mockProducts'
import { useApp } from '../context/AppContext'
import OfferBadge from '../components/OfferBadge'

const CATEGORY_EMOJIS = {
  'Lácteos': '🥛',
  'Carnes': '🥩',
  'Frutas y Verduras': '🥦',
  'Bebidas': '🥤',
  'Limpieza': '🧹',
  'Panadería': '🍞',
  'Snacks': '🍿',
  'Congelados': '🧊',
  'Despensa': '🥫',
  'Higiene': '🧴',
}

// Mock price history (static, relative to regularPrice)
function generateHistory(product) {
  const months = ['Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago']
  const base = product.regularPrice
  return months.map((month, i) => {
    const variation = (Math.sin(i * 1.3 + product.id.charCodeAt(1)) * 0.15)
    const price = Math.round((base + base * variation) / 10) * 10
    const isOnSale = i === months.length - 1 && product.isOnSale
    return {
      month,
      price: isOnSale ? product.currentPrice : price,
      isOnSale,
    }
  })
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToList, removeFromList, isInList } = useApp()

  const product = getProductById(id)
  const inList = isInList(id)

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">Producto no encontrado.</p>
        <button onClick={() => navigate(-1)} className="text-green-400 text-sm">Volver</button>
      </div>
    )
  }

  const history = generateHistory(product)
  const maxPrice = Math.max(...history.map(h => h.price))
  const minPrice = Math.min(...history.map(h => h.price))
  const savings = product.isOnSale ? product.regularPrice - product.currentPrice : 0

  const handleToggle = async () => {
    if (inList) {
      await removeFromList(product.id)
    } else {
      await addToList(product)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-32">
      {/* Back button */}
      <div className="bg-gray-900 px-4 pt-safe pt-4 pb-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            Volver
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4 pt-2">
        {/* Product hero */}
        <div className="bg-gray-800 rounded-2xl p-6 text-center">
          <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-4xl mb-4 ${
            product.isOnSale ? 'bg-orange-500/10' : 'bg-gray-700'
          }`}>
            {CATEGORY_EMOJIS[product.category] || '🛒'}
          </div>
          <h1 className="text-white font-bold text-lg leading-tight">{product.name}</h1>
          <p className="text-gray-400 text-sm mt-1">{product.category} · {product.unit}</p>

          {/* Price */}
          <div className="mt-4">
            <div className="flex items-center justify-center gap-3">
              <span className={`text-3xl font-bold ${product.isOnSale ? 'text-green-400' : 'text-white'}`}>
                {formatPrice(product.currentPrice)}
              </span>
              {product.isOnSale && <OfferBadge percent={product.discountPercent} size="lg" />}
            </div>
            {product.isOnSale && (
              <p className="text-gray-500 text-sm mt-1">
                Precio normal: <span className="line-through">{formatPrice(product.regularPrice)}</span>
                {' '}· Ahorras{' '}
                <span className="text-green-400 font-medium">{formatPrice(savings)}</span>
              </p>
            )}
          </div>
        </div>

        {/* Barcode */}
        <div className="bg-gray-800 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-gray-400 text-sm">Código:</span>
          <span className="text-white font-mono text-sm tracking-wider">{product.barcode}</span>
        </div>

        {/* Price history chart */}
        <div className="bg-gray-800 rounded-2xl p-4">
          <h2 className="text-white font-semibold mb-4">Historial de precio</h2>
          <div className="flex items-end gap-1 h-28">
            {history.map((h, i) => {
              const pct = maxPrice === minPrice ? 60 : 20 + ((h.price - minPrice) / (maxPrice - minPrice)) * 60
              const height = 100 - pct
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t-md transition-all ${
                      h.isOnSale ? 'bg-orange-500' : 'bg-green-600/50'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-gray-500 text-[9px]">{h.month}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-gray-500 text-xs">Mín: {formatPrice(minPrice)}</span>
            <span className="text-gray-500 text-xs">Máx: {formatPrice(maxPrice)}</span>
          </div>
          {product.isOnSale && (
            <p className="text-orange-400 text-xs mt-2 text-center">
              Precio actual es el más bajo de los últimos 7 meses
            </p>
          )}
        </div>
      </div>

      {/* Sticky add button */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleToggle}
            className={`w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] ${
              inList
                ? 'bg-gray-700 text-gray-300'
                : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20'
            }`}
          >
            {inList ? '✓ En mi lista · Quitar' : '+ Agregar a mi lista'}
          </button>
        </div>
      </div>
    </div>
  )
}
