import { useState, useMemo, useCallback } from 'react'
import { searchProducts, getProductsByCategory, getProductByBarcode } from '../data/mockProducts'

const JUMBO_SEARCH = 'https://www.jumbo.cl/api/catalog_system/pub/products/search'

const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-CL,es;q=0.9',
}

function normalizeVtex(p) {
  const item = p.items?.[0]
  if (!item) return null
  const offer = item.sellers?.[0]?.commertialOffer
  if (!offer) return null
  const currentPrice = Math.round(offer.Price)
  const regularPrice = Math.round(offer.ListPrice)
  if (currentPrice <= 0) return null
  const isOnSale = regularPrice > 0 && currentPrice < regularPrice
  const discountPercent = isOnSale
    ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
    : 0
  const category = p.categories?.[0]?.split('/')?.filter(Boolean).pop() || 'General'
  return {
    id: `jumbo_${p.productId}`,
    name: p.productName,
    brand: p.brand || '',
    barcode: item.ean || '',
    category,
    imageUrl: item.images?.[0]?.imageUrl?.replace(/-\d+-\d+(\.\w+)$/, '-300-300$1') || null,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: offer.IsAvailable,
    unit: 'unidad',
    source: 'jumbo',
  }
}

async function fetchFromJumbo(params) {
  try {
    const url = new URL(JUMBO_SEARCH)
    if (params.barcode) {
      url.searchParams.set('fq', `alternateId:${params.barcode}`)
    } else {
      url.searchParams.set('_query', params.query)
      url.searchParams.set('_from', '0')
      url.searchParams.set('_to', '11')
    }
    const res = await fetch(url.toString(), { headers: BROWSER_HEADERS })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null
    const products = data.map(normalizeVtex).filter(Boolean)
    return products.length > 0 ? products : null
  } catch {
    return null
  }
}

export function useProducts() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [onlyOffers, setOnlyOffers] = useState(false)
  const [liveResults, setLiveResults] = useState(null)
  const [loading, setLoading] = useState(false)

  const mockResults = useMemo(() => {
    let items = query ? searchProducts(query) : getProductsByCategory(category)
    if (query && category !== 'Todos') items = items.filter(p => p.category === category)
    if (onlyOffers) items = items.filter(p => p.isOnSale)
    return items
  }, [query, category, onlyOffers])

  const search = useCallback(async (q) => {
    setQuery(q)
    setLiveResults(null)
    if (!q || q.trim().length < 2) return
    setLoading(true)
    const results = await fetchFromJumbo({ query: q })
    if (results) {
      setLiveResults(onlyOffers ? results.filter(p => p.isOnSale) : results)
    }
    setLoading(false)
  }, [onlyOffers])

  const results = liveResults !== null ? liveResults : mockResults

  return {
    query, setQuery: search,
    category, setCategory,
    onlyOffers, setOnlyOffers,
    results, loading,
    isLive: liveResults !== null,
  }
}

export async function searchByBarcode(barcode) {
  const live = await fetchFromJumbo({ barcode })
  if (live && live.length > 0) return live[0]
  return getProductByBarcode(barcode) || null
}
