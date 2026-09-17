import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatPrice } from '../data/catalog'
import { getPricesForIds } from '../lib/catalogDb'
import { refreshListPrices } from '../lib/priceRefresh'
import OfferBadge from '../components/OfferBadge'
import EmptyState from '../components/EmptyState'
import ListSwitcher from '../components/ListSwitcher'
import { productImageProps } from '../lib/productImage'

const CATEGORY_EMOJIS = {
  'Lácteos': '🥛', 'Carnes': '🥩', 'Frutas y Verduras': '🥦', 'Bebidas': '🥤',
  'Limpieza': '🧹', 'Panadería': '🍞', 'Snacks': '🍿', 'Congelados': '🧊',
  'Despensa': '🥫', 'Higiene': '🧴',
}

export default function ShoppingList() {
  const navigate = useNavigate()
  const { shoppingList, removeFromList, activeList } = useApp()

  const [livePrices, setLivePrices] = useState({})
  const [refreshing, setRefreshing] = useState(false)

  const listKey = `${activeList?.id}:${Object.keys(shoppingList).sort().join(',')}`

  useEffect(() => {
    const items = Object.values(shoppingList)
    if (!items.length) return
    const controller = new AbortController()

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

  const priceOf = item => livePrices[item.productId] ?? null

  const grouped = useMemo(() => {
    const groups = {}
    for (const item of Object.values(shoppingList)) {
      const cat = item.category || 'Otros'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push({ ...item, current: priceOf(item) })
    }
    return groups
  }, [shoppingList, livePrices]) // eslint-disable-line

  /**
   * Balance de la lista. `normal` suma los precios sin oferta y `aPagar` los
   * vigentes; la diferencia es lo que rinde comprar hoy en vez de un día
   * cualquiera.
   */
  const balance = useMemo(() => {
    let normal = 0
    let aPagar = 0
    let enOferta = 0

    for (const item of Object.values(shoppingList)) {
      const p = priceOf(item)
      const actual = p?.currentPrice ?? item.priceWhenAdded ?? 0
      const lista = p?.regularPrice ?? item.regularPrice ?? actual
      normal += Math.max(lista, actual)
      aPagar += actual
      if (p?.isOnSale) enOferta += 1
    }

    return { normal, aPagar, ahorro: normal - aPagar, enOferta }
  }, [shoppingList, livePrices]) // eslint-disable-line

  const totalItems = Object.keys(shoppingList).length

  return (
    <div className="min-h-screen bg-canvas pb-nav">
      <div className="bg-surface px-4 pt-header pb-4">
        <div className="max-w-lg mx-auto space-y-3">
          <ListSwitcher />
          {totalItems > 0 && (
            <p className="text-content-dim text-sm">
              {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
              {balance.enOferta > 0 && (
                <span className="text-orange-400"> · {balance.enOferta} en oferta 🎉</span>
              )}
              {refreshing && <span className="text-content-faint"> · actualizando precios…</span>}
            </p>
          )}
        </div>
      </div>

      {totalItems === 0 ? (
        <div className="flex items-center justify-center pt-16">
          <EmptyState
            icon="🛒"
            title={`«${activeList?.name}» está vacía`}
            description="Busca o escanea productos para agregarlos."
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
      ) : (
        <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-content-dim text-xs font-semibold uppercase tracking-wide px-1 mb-2 flex items-center gap-2">
                <span>{CATEGORY_EMOJIS[category] || '🛍️'}</span>
                {category}
                <span className="text-content-faint">({items.length})</span>
              </h2>
              <div className="space-y-2">
                {items.map(item => {
                  const current = item.current
                  const isOnSale = !!current?.isOnSale
                  const currentPrice = current?.currentPrice ?? item.priceWhenAdded
                  const regular = current?.regularPrice ?? item.regularPrice

                  return (
                    <div
                      key={item.productId}
                      className={`bg-card rounded-2xl p-3 flex items-center gap-3 ${
                        isOnSale ? 'ring-1 ring-orange-500/30' : ''
                      }`}
                    >
                      {item.imageUrl ? (
                        <img
                          {...productImageProps(item.imageUrl, 80)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-20 h-20 rounded-xl object-contain product-media p-1 shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center text-2xl shrink-0">
                          {CATEGORY_EMOJIS[item.category] || '🛒'}
                        </div>
                      )}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => navigate(`/product/${item.productId}`)}
                      >
                        <p className="text-content text-sm font-medium leading-tight line-clamp-2">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`text-sm font-bold ${isOnSale ? 'text-green-400' : 'text-content'}`}>
                            {formatPrice(currentPrice)}
                          </span>
                          {isOnSale && regular > currentPrice && (
                            <span className="text-content-faint text-xs line-through">
                              {formatPrice(regular)}
                            </span>
                          )}
                          {isOnSale && <OfferBadge percent={current.discountPercent} />}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromList(item.productId)}
                        className="shrink-0 w-10 h-10 rounded-full bg-muted hover:bg-red-500/20 text-content-dim hover:text-red-400 flex items-center justify-center transition-colors"
                        aria-label={`Quitar ${item.name}`}
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

          {/* Balance de la lista */}
          <div className="bg-card rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-content-dim">Precio normal</span>
              <span className={balance.ahorro > 0 ? 'text-content-faint line-through' : 'text-content'}>
                {formatPrice(balance.normal)}
              </span>
            </div>

            {balance.ahorro > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-orange-400">Ahorro en ofertas</span>
                <span className="text-orange-400 font-medium">−{formatPrice(balance.ahorro)}</span>
              </div>
            )}

            <div className="border-t border-line pt-2.5 flex items-center justify-between">
              <span className="text-content font-medium">Total a pagar</span>
              <span className="text-content font-bold text-xl">{formatPrice(balance.aPagar)}</span>
            </div>

            {balance.ahorro > 0 && (
              <p className="text-green-400 text-xs text-center pt-0.5">
                Ahorras {formatPrice(balance.ahorro)} comprando hoy
                {balance.normal > 0 && ` · ${Math.round((balance.ahorro / balance.normal) * 100)}% menos`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
