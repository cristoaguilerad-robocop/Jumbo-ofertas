import { useState, useCallback, useEffect, useRef } from 'react'
import { fetchSearch, fetchByBarcode, lookupBarcode } from '../lib/jumboApi'
import { searchCatalog, getCatalogByBarcode, getCatalogCategories } from '../lib/catalogDb'

const PAGE_SIZE = 24

/**
 * Dos fuentes en orden de preferencia:
 *   1. catálogo indexado en Supabase — instantáneo y completo (requiere sync)
 *   2. jumbo.cl en vivo — se parsea su página de búsqueda vía proxy
 *
 * Si ninguna responde, la búsqueda queda vacía. Antes caía a un catálogo
 * ficticio de desarrollo, que mostraba productos y precios que no existen.
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

  const results = remoteResults ?? []

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

/** Categorías reales del catálogo indexado, con fallback a la lista base. */
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
 * Variantes de un código de barras.
 *
 * El mismo producto se imprime como UPC-A de 12 dígitos o como EAN-13 con un
 * cero delante, y quien lo indexó pudo guardar cualquiera de las dos. Probar
 * ambas evita perder coincidencias reales por un cero.
 */
function barcodeVariants(barcode) {
  const digits = String(barcode).replace(/\D/g, '')
  const variants = new Set([digits])
  if (digits.length === 13 && digits.startsWith('0')) variants.add(digits.slice(1))
  if (digits.length === 12) variants.add(`0${digits}`)
  return [...variants]
}

/**
 * Resuelve un código de barras a un producto ya vinculado.
 *
 * Jumbo no publica el EAN en ninguna parte de su payload, así que el vínculo
 * hay que construirlo: la primera vez se elige el producto a mano y queda
 * guardado en la columna `barcode`; a partir de ahí el escaneo lo resuelve
 * solo. Solo se acepta aquí lo que es seguro; lo demás pasa por
 * `suggestForBarcode`, que propone candidatos en vez de adivinar.
 */
export async function searchByBarcode(barcode) {
  for (const variant of barcodeVariants(barcode)) {
    const indexed = await getCatalogByBarcode(variant).catch(() => null)
    if (indexed) return indexed
  }
  return null
}

/** Une listas de productos sin repetir ids, respetando el orden de llegada. */
function mergeCandidates(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const product of list || []) {
      if (!product?.id || seen.has(product.id)) continue
      seen.add(product.id)
      out.push(product)
    }
  }
  return out
}

/** Palabras que no sirven para buscar: aparecen en demasiados productos. */
const STOPWORDS = new Set(['de', 'la', 'el', 'con', 'sin', 'y', 'en', 'para', 'gr', 'g', 'ml', 'kg', 'lt', 'l', 'un', 'pack'])

function searchTerms(hint) {
  if (!hint) return []
  const words = `${hint.brand || ''} ${hint.name || ''}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))

  const terms = []
  if (words.length) terms.push(words.join(' '))
  // El nombre completo de Open Food Facts suele ser más largo y específico que
  // el de Jumbo, así que también se prueban las dos primeras palabras y la
  // marca sola: son las que tienen chance real de coincidir.
  if (words.length > 2) terms.push(words.slice(0, 2).join(' '))
  if (hint.brand) terms.push(hint.brand.toLowerCase())
  return [...new Set(terms)]
}

/**
 * Candidatos para un código que no se pudo resolver.
 *
 * Antes esto dependía por completo de que Open Food Facts conociera el EAN: si
 * no lo conocía, devolvía cero candidatos y no quedaba más que teclear el
 * nombre a mano, que es justo lo que el escaneo venía a evitar. Ahora se
 * prueban varias vías y se devuelve además un término para dejar precargado el
 * buscador, de modo que la pantalla nunca quede en blanco.
 */
export async function suggestForBarcode(barcode) {
  const variants = barcodeVariants(barcode)

  // 1. El buscador de Jumbo, con los dígitos tal cual. A veces el código sí
  //    aparece en la ficha; cuando pasa, es la coincidencia más confiable.
  let byDigits = []
  for (const variant of variants) {
    try {
      const found = await fetchByBarcode(variant)
      // Un puñado de resultados sobre una cadena de 13 dígitos es coincidencia
      // real; decenas es el buscador ignorando el código y devolviendo relleno.
      if (found.length && found.length <= 5) { byDigits = found; break }
    } catch { /* se sigue con las otras vías */ }
  }

  // Un solo resultado para una cadena de 13 dígitos no es coincidencia difusa:
  // el buscador encontró ese código. Se devuelve como exacto para que la
  // pantalla lo vincule sola, sin pedir confirmación ni consultar más fuentes.
  if (byDigits.length === 1) {
    return { hint: null, candidates: byDigits, prefill: '', exact: true }
  }

  // 2. Open Food Facts mapea EAN a nombre y marca; con eso se busca por nombre.
  let hint = null
  try {
    for (const variant of variants) {
      const off = await lookupBarcode(variant)
      if (off?.found) { hint = off; break }
    }
  } catch { /* sin pista */ }

  const byName = []
  for (const term of searchTerms(hint)) {
    if (byName.length >= 8) break
    try {
      const fromCatalog = await searchCatalog({ query: term, limit: 8 })
      if (fromCatalog?.length) { byName.push(...fromCatalog); continue }
    } catch { /* sigue al vivo */ }
    try {
      byName.push(...(await fetchSearch(term, 1)).slice(0, 8))
    } catch { /* este término no dio nada */ }
  }

  const candidates = mergeCandidates(byDigits, byName).slice(0, 8)

  // Con qué dejar precargado el buscador si ninguna vía acertó: el nombre que
  // conoce Open Food Facts, o nada, pero nunca el código, que no busca nada.
  const prefill = searchTerms(hint)[0] || ''

  return { hint, candidates, prefill, exact: false }
}
