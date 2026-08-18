import { useState, useMemo } from 'react'
import { searchProducts, getProductsByCategory } from '../data/mockProducts'

export function useProducts() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [onlyOffers, setOnlyOffers] = useState(false)

  const results = useMemo(() => {
    let items = query ? searchProducts(query) : getProductsByCategory(category)
    if (query && category !== 'Todos') {
      items = items.filter(p => p.category === category)
    }
    if (onlyOffers) {
      items = items.filter(p => p.isOnSale)
    }
    return items
  }, [query, category, onlyOffers])

  return { query, setQuery, category, setCategory, onlyOffers, setOnlyOffers, results }
}
