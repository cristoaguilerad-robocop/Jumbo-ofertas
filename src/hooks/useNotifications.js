import { useCallback } from 'react'
import { mockProducts } from '../data/mockProducts'

export function useNotifications() {
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    return await Notification.requestPermission()
  }, [])

  const checkPriceDrops = useCallback((shoppingList) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const alerts = []

    Object.values(shoppingList).forEach(item => {
      const current = mockProducts.find(p => p.id === item.productId)
      const currentPrice = current?.currentPrice ?? item.priceWhenAdded

      // Alert 1: price dropped vs when added
      if (current?.isOnSale && currentPrice < item.priceWhenAdded) {
        alerts.push(`${item.name} bajó a $${currentPrice.toLocaleString('es-CL')}`)
      }

      // Alert 2: price reached target
      if (item.targetPrice && currentPrice <= item.targetPrice) {
        alerts.push(`${item.name} llegó a tu precio objetivo ($${currentPrice.toLocaleString('es-CL')})`)
      }
    })

    if (alerts.length === 0) return

    new Notification('Jumbo Ofertas 🛒', {
      body: alerts.length === 1 ? alerts[0] : `${alerts[0]} y ${alerts.length - 1} más.`,
      icon: '/favicon.svg',
      tag: 'price-drop',
    })
  }, [])

  return { requestPermission, checkPriceDrops }
}
