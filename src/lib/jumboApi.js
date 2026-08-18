// Cliente de productos de Jumbo.
//
// Todo pasa por el Edge Function, por dos razones: jumbo.cl no manda cabeceras
// CORS (el navegador falla con "Failed to fetch" antes de salir), y los
// productos no vienen de una API sino del payload RSC de sus páginas, que el
// Edge Function parsea y devuelve ya normalizado.

import { supabase, isConfigured } from '../supabase'

const PROXY_URL = isConfigured
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/search-products`
  : null

async function proxyHeaders() {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const { data } = await supabase.auth.getSession()
  return {
    Authorization: `Bearer ${data?.session?.access_token || key}`,
    apikey: key,
    Accept: 'application/json',
  }
}

async function callProxy(params, signal) {
  if (!PROXY_URL) throw new Error('Falta configurar Supabase')
  const url = new URL(PROXY_URL)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: await proxyHeaders(), signal })
  if (!res.ok) throw new Error(`El proxy respondió ${res.status}`)
  return res.json()
}

/** Busca productos por texto. `page` empieza en 1. */
export async function fetchSearch(query, page = 1, signal) {
  const json = await callProxy({ search: query, page }, signal)
  if (json.error) throw new Error(json.error)
  return json.products || []
}

/** Productos de una categoría, por su ruta en jumbo.cl (ej. "lacteos/leches"). */
export async function fetchCategory(categoryPath, page = 1, signal) {
  const json = await callProxy({ category: categoryPath, page }, signal)
  if (json.error) throw new Error(json.error)
  return json.products || []
}

/**
 * Busca por código de barras.
 *
 * El payload RSC de Jumbo no expone el EAN, así que se busca el código como
 * texto: su buscador suele indexarlo. Puede no encontrar nada aunque el
 * producto exista.
 */
export async function fetchByBarcode(barcode, signal) {
  return fetchSearch(barcode, 1, signal)
}

/** Rutas de categoría de jumbo.cl, del sitemap y del menú de la home. */
export async function fetchCategories() {
  const json = await callProxy({ categories: '1' })
  if (json.error) throw new Error(json.error)
  return { categories: json.categories || [], stats: json.stats || {} }
}

/**
 * Mide qué estrategia baja el catálogo más rápido: HTML plano, payload RSC, o
 * páginas más grandes. Reporta KB por producto, que es la métrica que manda.
 */
export async function runBenchmark(target) {
  return callProxy(target ? { benchmark: '1', target } : { benchmark: '1' })
}
