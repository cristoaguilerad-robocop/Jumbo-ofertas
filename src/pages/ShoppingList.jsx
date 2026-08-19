import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getProductById, formatPrice } from '../data/mockProducts'
import { getPricesForIds } from '../lib/catalogDb'
import { refreshListPrices } from '../lib/priceRefresh'
import OfferBadge from '../components/OfferBadge'
import EmptyState from '../components/EmptyState'

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

export default function ShoppingList() {
  const navigate = useNavigate()
  const { shoppingList, removeFromList } = useApp()

  // Precios vivos. Antes se resolvían contra el catálogo mock de 50 productos,
  // así que un producto real de Jumbo mostraba para siempre el precio del día
  // en que se agregó.
  const [livePrices, setLivePrices] = useState({})
  const [refreshing, setRefreshing] = useState(false)

  const listKey = Object.keys(shoppingList).sort().join(',')

  useEffect(() => {
    const items = Object.values(shoppingList)
    if (!items.length) return
    const controller = new AbortController()

    // Primero el catálogo, que pinta al instante; luego Jumbo en vivo.
    getPricesForIds(items.map(i => i.productId))
      .then(cached => setLivePrices(prev => ({ ...cached, ...prev })))
      .catch(() => {})

    setRefreshing(true)
    refreshListPrices(items, {
      signal: controller.signal,
      onUpdate: (id, product) => setLivePrices(prev => ({ ...prev, [id]: product })),
    })
      .catch(() => {})
      .finally(() => setRefreshing(false))

    return () => controller.abort()
  }, [listKey]) // eslint-disable-line

  const priceOf = item =>
    livePrices[item.productId] ?? getProductById(item.productId) ?? null

  const grouped = useMemo(() => {
    const items = Object.values(shoppingList).map(item => ({
      ...item,
      current: livePrices[item.productId] ?? getProductById(item.productId),
    }))

    const groups = {}
    items.forEach(item => {
      const cat = item.category || 'Otros'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    })
    return groups
  }, [shoppingList, livePrices])

  const totalItems = Object.keys(shoppingList).length
  const totalOnSale = Object.values(shoppingList).filter(item => priceOf(item)?.isOnSale).length

  const estimatedTotal = Object.values(shoppingList).reduce((sum, item) => {
    const p = priceOf(item)
    return sum + (p?.currentPrice ?? item.priceWhenAdded)
  }, 0)

  if (totalItems === 0) {
    return (
      <div className="min-h-screen bg-gray-950 pb-24 flex flex-col">
        <div className="bg-gray-900 px-4 pt-safe pt-6 pb-4">
          <div className="max-w-lg mx-auto">
            <h1 className="text-xl font-bold text-white">Mi lista de compras</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon="🛒"
            title="Lista vacía"
            description="Busca productos y agrégalos a tu lista de compras."
            action={
              <button
                onClick={() => navigate('/search')}
                className="bg-green-500 text-white px-6 py-3 rounded-full font-medium text-sm"
              >
                Buscar productos
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 pb-28">
      {/* Header */}
      <div className="bg-gray-900 px-4 pt-safe pt-6 pb-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-white">Mi lista de compras</h1>
          <p className="text-gray-400 text-sm mt-1">
            {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
            {totalOnSale > 0 && (
              <span className="text-orange-400"> · {totalOnSale} en oferta 🎉</span>
            )}
            {refreshing && (
              <span className="text-gray-500"> · actualizando precios…</span>
            )}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wide px-1 mb-2 flex items-center gap-2">
              <span>{CATEGORY_EMOJIS[category] || '🛍️'}</span>
              {category}
              <span className="text-gray-600">({items.length})</span>
            </h2>
            <div className="space-y-2">
              {items.map(item => {
                const current = item.current
                const isOnSale = current && current.isOnSale
                const priceDrop = current && current.currentPrice < item.priceWhenAdded
                const currentPrice = current ? current.currentPrice : item.priceWhenAdded

                return (
                  <div
                    key={item.productId}
                    className={`bg-gray-800 rounded-2xl p-4 flex items-center gap-3 ${
                      isOnSale ? 'ring-1 ring-orange-500/30' : ''
                    }`}
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/product/${item.productId}`)}
                    >
                      <p className="text-white text-sm font-medium leading-tight line-clamp-2">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-sm font-bold ${isOnSale ? 'text-green-400' : 'text-white'}`}>
                          {formatPrice(currentPrice)}
                        </span>
                        {priceDrop && (
                          <span className="text-gray-500 text-xs line-through">
                            {formatPrice(item.priceWhenAdded)}
                          </span>
                        )}
                        {isOnSale && current && <OfferBadge percent={current.discountPercent} />}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromList(item.productId)}
                      className="shrink-0 w-9 h-9 rounded-full bg-gray-700 hover:bg-red-500/20 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors"
                      aria-label="Quitar de lista"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Estimated total */}
        <div className="bg-gray-800 rounded-2xl p-4 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Total estimado</span>
            <span className="text-white font-bold text-lg">{formatPrice(estimatedTotal)}</span>
          </div>
          {totalOnSale > 0 && (
            <p className="text-orange-400 text-xs mt-1">
              {totalOnSale} {totalOnSale === 1 ? 'producto está' : 'productos están'} en oferta hoy
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
