import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { searchProducts, getProductsByCategory, getProductByBarcode } from '../data/mockProducts'
import { fetchSearch, fetchByBarcode, lookupBarcode } from '../lib/jumboApi'
import { searchCatalog, getCatalogByBarcode, getCatalogCategories } from '../lib/catalogDb'

const PAGE_SIZE = 24

/**
 * Tres fuentes en orden de preferencia:
 *   1. catálogo indexado en Supabase — instantáneo y completo (requiere sync)
 *   2. jumbo.cl en vivo — se parsea su página de búsqueda vía proxy
 *   3. catálogo mock local — último recurso
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

  // Descarta respuestas de búsquedas obsoletas, para que una petición lenta no
  // pise el resultado que ya está en pantalla.
  const tokenRef = useRef(0)
  const pageRef = useRef(1)

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
          pageRef.current = 1
          setRemoteResults(items)
          setSource('catalog')
          setHasMore(items.length >= PAGE_SIZE)
          setLoading(false)
          return
        }
      } catch { /* sigue al vivo */ }

      // 2. jumbo.cl en vivo
      if (trimmed.length >= 2) {
        try {
          const items = await fetchSearch(trimmed, 1, controller.signal)
          if (token !== tokenRef.current) return
          if (items.length) {
            pageRef.current = 1
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
    const nextPage = pageRef.current + 1
    setLoadingMore(true)
    try {
      const items = source === 'catalog'
        ? await searchCatalog({
            query: trimmed, category, onlyOffers,
            from: (nextPage - 1) * PAGE_SIZE, limit: PAGE_SIZE,
          })
        : await fetchSearch(trimmed, nextPage)

      if (token !== tokenRef.current || !items) return
      pageRef.current = nextPage
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

/**
 * Resuelve un código de barras a un producto de Jumbo.
 *
 * Jumbo no publica el EAN, así que hay que reconstruir el vínculo:
 *   1. códigos ya vinculados a mano, que son los confiables
 *   2. el buscador de Jumbo, por si indexa el código
 *   3. Open Food Facts, que sí mapea EAN a nombre y marca; con eso se busca
 *      el producto por nombre en el catálogo y en Jumbo
 *
 * Devuelve el producto, o un objeto con la pista de Open Food Facts para que
 * la pantalla pueda proponer candidatos en vez de rendirse.
 */
export async function searchByBarcode(barcode) {
  const indexed = await getCatalogByBarcode(barcode).catch(() => null)
  if (indexed) return indexed

  // Un único resultado indica coincidencia real; varios son coincidencia
  // difusa sobre los dígitos, y un producto equivocado es peor que ninguno.
  try {
    const live = await fetchByBarcode(barcode)
    if (live.length === 1) return live[0]
  } catch { /* sigue */ }

  const mock = getProductByBarcode(barcode)
  if (mock) return mock

  return null
}

/**
 * Candidatos para un código que no se pudo resolver, usando el nombre que
 * Open Food Facts asocia al EAN.
 */
export async function suggestForBarcode(barcode) {
  let hint = null
  try {
    const off = await lookupBarcode(barcode)
    if (off?.found) hint = off
  } catch { /* sin pista */ }

  if (!hint) return { hint: null, candidates: [] }

  const terms = [hint.brand, hint.name].filter(Boolean).join(' ').trim()
  let candidates = []

  try {
    candidates = (await searchCatalog({ query: terms, limit: 8 })) || []
  } catch { /* sigue al vivo */ }

  if (!candidates.length) {
    try {
      candidates = await fetchSearch(terms, 1)
    } catch { /* sin candidatos */ }
  }

  // Si el nombre completo no rinde, se reintenta solo con la marca.
  if (!candidates.length && hint.brand) {
    try {
      candidates = (await searchCatalog({ query: hint.brand, limit: 8 })) || []
    } catch { /* nada más que probar */ }
  }

  return { hint, candidates: candidates.slice(0, 8) }
}
