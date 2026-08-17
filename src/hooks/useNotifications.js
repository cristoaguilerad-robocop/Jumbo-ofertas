import { useEffect, useCallback } from 'react'
import { mockProducts } from '../data/mockProducts'

export function useNotifications() {
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported'
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    const result = await Notification.requestPermission()
    return result
  }, [])

  const checkPriceDrops = useCallback((shoppingList) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const listItems = Object.values(shoppingList)
    const drops = listItems.filter(item => {
      const current = mockProducts.find(p => p.id === item.productId)
      return current && current.isOnSale && current.currentPrice < item.priceWhenAdded
    })

    if (drops.length > 0) {
      const names = drops.map(d => {
        const p = mockProducts.find(pr => pr.id === d.productId)
        return p ? p.name : d.name
      })
      const body = drops.length === 1
        ? `${names[0]} está en oferta ahora.`
        : `${names[0]} y ${drops.length - 1} producto(s) más están en oferta.`

      new Notification('Jumbo Ofertas', {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'price-drop',
      })
    }
  }, [])

  return { requestPermission, checkPriceDrops }
}
