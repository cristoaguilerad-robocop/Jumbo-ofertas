import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { searchProducts, getProductsByCategory, getProductByBarcode } from '../data/mockProducts'

const JUMBO_SEARCH = 'https://www.jumbo.cl/api/catalog_system/pub/products/search'
const PAGE_SIZE = 24

// Rutas reales de categoría en jumbo.cl, para poder navegar el catálogo completo
// sin escribir nada en el buscador.
const CATEGORY_PATHS = {
  'Lácteos': 'lacteos',
  'Carnes': 'carniceria',
  'Frutas y Verduras': 'frutas-y-verduras',
  'Bebidas': 'bebidas-y-licores',
  'Limpieza': 'limpieza',
  'Panadería': 'panaderia-y-pasteleria',
  'Snacks': 'snack-dulces-y-chocolates',
  'Congelados': 'congelados',
  'Despensa': 'despensa',
  'Higiene': 'cuidado-personal',
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
    imageUrl: item.images?.[0]?.imageUrl?.replace(/-\d+-\d+(\.\w+)$/, '-500-500$1') || null,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: offer.IsAvailable,
    unit: 'unidad',
    source: 'jumbo',
  }
}

async function fetchFromJumbo({ query, barcode, categoryPath, from = 0, signal }) {
  const url = new URL(JUMBO_SEARCH)
  if (barcode) {
    url.searchParams.set('fq', `alternateId:${barcode}`)
  } else {
    if (categoryPath) url.pathname += `/${categoryPath}`
    if (query) url.searchParams.set('_query', query)
    url.searchParams.set('_from', String(from))
    url.searchParams.set('_to', String(from + PAGE_SIZE - 1))
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error(`Jumbo respondió ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('Respuesta inesperada de Jumbo')
  return data.map(normalizeVtex).filter(Boolean)
}

export function useProducts() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [onlyOffers, setOnlyOffers] = useState(false)

  const [liveResults, setLiveResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)

  // Cada búsqueda incrementa el token; las respuestas de tokens viejos se descartan
  // para que una petición lenta no pise el resultado que ya está en pantalla.
  const tokenRef = useRef(0)
  const offsetRef = useRef(0)
  const abortRef = useRef(null)

  const trimmed = query.trim()
  const categoryPath = category !== 'Todos' ? CATEGORY_PATHS[category] : null
  const shouldGoLive = trimmed.length >= 2 || !!categoryPath

  useEffect(() => {
    if (!shouldGoLive) {
      tokenRef.current += 1
      abortRef.current?.abort()
      setLiveResults(null)
      setHasMore(false)
      setError(null)
      setLoading(false)
      return
    }

    const token = ++tokenRef.current
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const items = await fetchFromJumbo({
          query: trimmed || undefined,
          categoryPath,
          from: 0,
          signal: controller.signal,
        })
        if (token !== tokenRef.current) return
        offsetRef.current = items.length
        setLiveResults(items)
        setHasMore(items.length >= PAGE_SIZE)
      } catch (err) {
        if (controller.signal.aborted || token !== tokenRef.current) return
        // Se conservan los resultados anteriores en pantalla y se cae al catálogo local.
        setLiveResults(null)
        setHasMore(false)
        setError(err.message)
      } finally {
        if (token === tokenRef.current) setLoading(false)
      }
    }, 350)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, categoryPath, shouldGoLive])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !shouldGoLive) return
    const token = tokenRef.current
    setLoadingMore(true)
    try {
      const items = await fetchFromJumbo({
        query: trimmed || undefined,
        categoryPath,
        from: offsetRef.current,
      })
      if (token !== tokenRef.current) return
      offsetRef.current += items.length
      setLiveResults(prev => {
        const seen = new Set((prev || []).map(p => p.id))
        return [...(prev || []), ...items.filter(p => !seen.has(p.id))]
      })
      setHasMore(items.length >= PAGE_SIZE)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, shouldGoLive, trimmed, categoryPath])

  const mockResults = useMemo(() => {
    let items = trimmed ? searchProducts(trimmed) : getProductsByCategory(category)
    if (trimmed && category !== 'Todos') items = items.filter(p => p.category === category)
    return items
  }, [trimmed, category])

  const results = useMemo(() => {
    const base = liveResults !== null ? liveResults : mockResults
    return onlyOffers ? base.filter(p => p.isOnSale) : base
  }, [liveResults, mockResults, onlyOffers])

  return {
    query, setQuery,
    category, setCategory,
    onlyOffers, setOnlyOffers,
    results,
    loading, loadingMore,
    hasMore, loadMore,
    error,
    isLive: liveResults !== null,
  }
}

export async function searchByBarcode(barcode) {
  try {
    const live = await fetchFromJumbo({ barcode })
    if (live.length > 0) return live[0]
  } catch {
    // cae al catálogo local
  }
  return getProductByBarcode(barcode) || null
}
