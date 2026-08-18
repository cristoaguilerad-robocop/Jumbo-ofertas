import { useCallback } from 'react'
import { mockProducts } from '../data/mockProducts'
import { getPricesForIds } from '../lib/catalogDb'
import { fetchPricesByIds } from '../lib/jumboApi'

function formatCLP(n) {
  return `$${n.toLocaleString('es-CL')}`
}

/**
 * Precios actuales para los productos de la lista. Prefiere el catálogo
 * indexado; para los que no estén ahí consulta Jumbo en vivo.
 */
async function resolveCurrentPrices(items) {
  const ids = items.map(i => i.productId)
  const prices = await getPricesForIds(ids).catch(() => ({}))

  const missing = ids.filter(id => !prices[id] && id.startsWith('jumbo_'))
  if (missing.length) {
    try {
      const live = await fetchPricesByIds(missing)
      for (const p of live) {
        prices[p.id] = { currentPrice: p.currentPrice, isOnSale: p.isOnSale }
      }
    } catch { /* se ignoran los que no se pudieron refrescar */ }
  }

  // Los productos mock no viven en Supabase ni en Jumbo.
  for (const id of ids) {
    if (prices[id]) continue
    const mock = mockProducts.find(p => p.id === id)
    if (mock) prices[id] = { currentPrice: mock.currentPrice, isOnSale: mock.isOnSale }
  }

  return prices
}

export function useNotifications() {
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    return await Notification.requestPermission()
  }, [])

  const checkPriceDrops = useCallback(async (shoppingList) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const items = Object.values(shoppingList)
    if (!items.length) return

    const prices = await resolveCurrentPrices(items)
    const alerts = []

    for (const item of items) {
      const currentPrice = prices[item.productId]?.currentPrice
      if (typeof currentPrice !== 'number') continue

      if (item.targetPrice && currentPrice <= item.targetPrice) {
        alerts.push(`${item.name} llegó a tu precio objetivo (${formatCLP(currentPrice)})`)
      } else if (currentPrice < item.priceWhenAdded) {
        alerts.push(`${item.name} bajó a ${formatCLP(currentPrice)}`)
      }
    }

    if (!alerts.length) return

    new Notification('Jumbo Ofertas 🛒', {
      body: alerts.length === 1 ? alerts[0] : `${alerts[0]} y ${alerts.length - 1} más.`,
      icon: '/favicon.svg',
      tag: 'price-drop',
    })
  }, [])

  return { requestPermission, checkPriceDrops }
}
