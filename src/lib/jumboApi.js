// Cliente de la API pública VTEX de jumbo.cl.
//
// La API no manda cabeceras CORS, así que el navegador no puede llamarla
// directamente desde otro dominio: falla con "Failed to fetch" antes de salir.
// Por eso las peticiones se enrutan por un Edge Function que actúa de proxy
// (CORS es una restricción del navegador, no del servidor).
//
// Se intenta primero directo, por si se sirve desde el mismo origen o Jumbo
// habilita CORS más adelante, y se cae al proxy si eso falla.

import { supabase, isConfigured } from '../supabase'

const PATH_PREFIX = '/api/catalog_system/pub'
const BASE = `https://www.jumbo.cl${PATH_PREFIX}`

// VTEX no permite paginar más allá del resultado 2500 en una misma consulta.
export const MAX_WINDOW = 2500

export function normalizeProduct(p) {
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

  // categories[0] viene como "/Lácteos/Leches/Leche Líquida/"
  const categoryPath = p.categories?.[0] || ''
  const segments = categoryPath.split('/').filter(Boolean)
  const category = segments[segments.length - 1] || 'General'
  const categoryTop = segments[0] || 'General'

  return {
    id: `jumbo_${p.productId}`,
    name: p.productName,
    brand: p.brand || '',
    barcode: item.ean || '',
    category,
    categoryTop,
    categoryPath,
    imageUrl: item.images?.[0]?.imageUrl?.replace(/-\d+-\d+(\.\w+)$/, '-500-500$1') || null,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: !!offer.IsAvailable,
    unit: 'unidad',
    source: 'jumbo',
  }
}

const PROXY_URL = isConfigured
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-products`
  : null

let proxyOnly = false // una vez que el directo falla por CORS, no se reintenta

async function proxyHeaders() {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data?.session?.access_token || key}`,
    apikey: key,
    Accept: 'application/json',
  }
}

async function viaProxy(path, signal) {
  if (!PROXY_URL) throw new Error('Sin proxy configurado (falta Supabase)')
  const url = `${PROXY_URL}?path=${encodeURIComponent(path)}`
  const res = await fetch(url, { headers: await proxyHeaders(), signal })
  if (!res.ok) throw new Error(`Jumbo respondió ${res.status}`)
  return res.json()
}

/**
 * `path` va relativo a /api/catalog_system/pub, p.ej. "/products/search?_query=leche".
 */
async function getJson(path, signal) {
  if (!proxyOnly) {
    try {
      const res = await fetch(BASE + path, { headers: { Accept: 'application/json' }, signal })
      if (res.ok) return await res.json()
    } catch (err) {
      // TypeError = bloqueo de CORS o red caída, no un status HTTP.
      if (err.name === 'AbortError') throw err
      proxyOnly = true
    }
  }
  return viaProxy(PATH_PREFIX + path, signal)
}

/** Diagnóstico: qué responde Jumbo desde el servidor del proxy. */
export async function diagnose() {
  if (!PROXY_URL) throw new Error('Sin proxy configurado (falta Supabase)')
  const res = await fetch(`${PROXY_URL}?diagnose=1`, { headers: await proxyHeaders() })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { raw: text, status: res.status } }
}

/** Árbol de categorías hasta `depth` niveles. */
export async function fetchCategoryTree(depth = 3, signal) {
  return getJson(`/category/tree/${depth}`, signal)
}

/** Aplana el árbol a la lista de categorías hoja (las que tienen productos). */
export function flattenLeafCategories(tree, trail = []) {
  const leaves = []
  for (const node of tree || []) {
    const path = [...trail, node.name]
    if (node.hasChildren && node.children?.length) {
      leaves.push(...flattenLeafCategories(node.children, path))
    } else {
      leaves.push({ id: node.id, name: node.name, path: path.join(' / ') })
    }
  }
  return leaves
}

/** Una página de productos de una categoría. */
export async function fetchCategoryPage(categoryId, from, to, signal) {
  const url = `/products/search?fq=C:/${categoryId}/&_from=${from}&_to=${to}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}

/** Búsqueda por texto libre. */
export async function fetchSearch(query, from, to, signal) {
  const url = `/products/search?_query=${encodeURIComponent(query)}&_from=${from}&_to=${to}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}

/** Búsqueda por código de barras (EAN). */
export async function fetchByBarcode(barcode, signal) {
  const url = `/products/search?fq=alternateId:${encodeURIComponent(barcode)}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}

/** Precios frescos para un conjunto de productos ya conocidos. */
export async function fetchPricesByIds(productIds, signal) {
  if (!productIds.length) return []
  // VTEX acepta varios fq=productId: en la misma consulta (OR).
  const fq = productIds
    .map(id => `fq=productId:${encodeURIComponent(String(id).replace(/^jumbo_/, ''))}`)
    .join('&')
  const url = `/products/search?${fq}&_from=0&_to=${productIds.length - 1}`
  const raw = await getJson(url, signal)
  return Array.isArray(raw) ? raw.map(normalizeProduct).filter(Boolean) : []
}
