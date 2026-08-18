import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { searchProducts, getProductsByCategory, getProductByBarcode } from '../data/mockProducts'
import { fetchSearch, fetchByBarcode } from '../lib/jumboApi'
import { searchCatalog, getCatalogByBarcode, getCatalogCategories } from '../lib/catalogDb'

const PAGE_SIZE = 24

/**
 * Tres fuentes en orden de preferencia:
 *   1. catálogo indexado en Supabase — instantáneo y completo (requiere sync)
 *   2. API de Jumbo en vivo — siempre fresca, pero limitada por consulta
 *   3. catálogo mock local — último recurso sin conexión
 */
export function useProducts() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [onlyOffers, setOnlyOffers] = useState(false)

  const [remoteResults, setRemoteResults] = useState(null)
  const [source, setSource] = useState(null) // 'catalog' | 'jumbo' | null
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)

  // Descarta respuestas de búsquedas que ya quedaron obsoletas, para que una
  // petición lenta no pise el resultado que ya está en pantalla.
  const tokenRef = useRef(0)
  const offsetRef = useRef(0)

  const trimmed = query.trim()
  const hasFilter = trimmed.length >= 2 || category !== 'Todos' || onlyOffers

  useEffect(() => {
    if (!hasFilter) {
      tokenRef.current += 1
      setRemoteResults(null)
      setSource(null)
      setHasMore(false)
      setError(null)
      setLoading(false)
      return
    }

    const token = ++tokenRef.current
    const controller = new AbortController()

    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)

      // 1. Catálogo indexado
      try {
        const items = await searchCatalog({
          query: trimmed, category, onlyOffers, from: 0, limit: PAGE_SIZE,
        })
        if (token !== tokenRef.current) return
        if (items?.length) {
          offsetRef.current = items.length
          setRemoteResults(items)
          setSource('catalog')
          setHasMore(items.length >= PAGE_SIZE)
          setLoading(false)
          return
        }
      } catch { /* sigue al vivo */ }

      // 2. Jumbo en vivo
      if (trimmed.length >= 2) {
        try {
          const items = await fetchSearch(trimmed, 0, PAGE_SIZE - 1, controller.signal)
          if (token !== tokenRef.current) return
          if (items.length) {
            offsetRef.current = items.length
            setRemoteResults(onlyOffers ? items.filter(p => p.isOnSale) : items)
            setSource('jumbo')
            setHasMore(items.length >= PAGE_SIZE)
            setLoading(false)
            return
          }
        } catch (err) {
          if (!controller.signal.aborted && token === tokenRef.current) setError(err.message)
        }
      }

      // 3. Sin resultados remotos: cae al mock
      if (token !== tokenRef.current) return
      setRemoteResults(null)
      setSource(null)
      setHasMore(false)
      setLoading(false)
    }, 350)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, category, onlyOffers, hasFilter])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    const token = tokenRef.current
    setLoadingMore(true)
    try {
      const items = source === 'catalog'
        ? await searchCatalog({
            query: trimmed, category, onlyOffers,
            from: offsetRef.current, limit: PAGE_SIZE,
          })
        : await fetchSearch(trimmed, offsetRef.current, offsetRef.current + PAGE_SIZE - 1)

      if (token !== tokenRef.current || !items) return
      offsetRef.current += items.length
      setRemoteResults(prev => {
        const seen = new Set((prev || []).map(p => p.id))
        return [...(prev || []), ...items.filter(p => !seen.has(p.id))]
      })
      setHasMore(items.length >= PAGE_SIZE)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, source, trimmed, category, onlyOffers])

  const mockResults = useMemo(() => {
    let items = trimmed ? searchProducts(trimmed) : getProductsByCategory(category)
    if (trimmed && category !== 'Todos') items = items.filter(p => p.category === category)
    return onlyOffers ? items.filter(p => p.isOnSale) : items
  }, [trimmed, category, onlyOffers])

  const results = remoteResults !== null ? remoteResults : mockResults

  return {
    query, setQuery,
    category, setCategory,
    onlyOffers, setOnlyOffers,
    results,
    loading, loadingMore,
    hasMore, loadMore,
    error,
    source,
    isLive: remoteResults !== null,
  }
}

/** Categorías reales del catálogo indexado, con fallback a las del mock. */
export function useCategories(fallback) {
  const [categories, setCategories] = useState(fallback)
  useEffect(() => {
    getCatalogCategories().then(cats => {
      if (cats?.length) setCategories(['Todos', ...cats])
    })
  }, [])
  return categories
}

export async function searchByBarcode(barcode) {
  const indexed = await getCatalogByBarcode(barcode).catch(() => null)
  if (indexed) return indexed

  try {
    const live = await fetchByBarcode(barcode)
    if (live.length > 0) return live[0]
  } catch { /* cae al mock */ }

  return getProductByBarcode(barcode) || null
}
