import { useCallback } from 'react'
import { mockProducts } from '../data/mockProducts'
import { getPricesForIds } from '../lib/catalogDb'
import { refreshListPrices } from '../lib/priceRefresh'

function formatCLP(n) {
  return `$${n.toLocaleString('es-CL')}`
}

/**
 * Precios actuales para los productos de la lista.
 *
 * Se consultan en vivo a Jumbo, no al catálogo indexado: entre
 * sincronizaciones ese catálogo envejece, y una alerta de bajada que compara
 * contra una foto vieja no sirve. El catálogo queda de respaldo para lo que no
 * se pueda refrescar.
 */
async function resolveCurrentPrices(items) {
  const ids = items.map(i => i.productId)
  const prices = await getPricesForIds(ids).catch(() => ({}))

  const fresh = await refreshListPrices(items).catch(() => ({}))
  for (const [id, product] of Object.entries(fresh)) {
    prices[id] = { currentPrice: product.currentPrice, isOnSale: product.isOnSale }
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
