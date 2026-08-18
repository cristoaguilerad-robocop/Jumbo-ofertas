import { useState, useMemo, useCallback } from 'react'
import { searchProducts, getProductsByCategory, getProductByBarcode } from '../data/mockProducts'
import { supabase, isConfigured } from '../supabase'

const EDGE_URL = isConfigured
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-products`
  : null

async function fetchFromJumbo(params) {
  if (!EDGE_URL) return null
  try {
    const url = new URL(EDGE_URL)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.products || null
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
      let filtered = onlyOffers ? results.filter(p => p.isOnSale) : results
      setLiveResults(filtered)
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
  // Try Jumbo API first
  const live = await fetchFromJumbo({ barcode })
  if (live && live.length > 0) return live[0]
  // Fallback to mock catalog
  return getProductByBarcode(barcode) || null
}
