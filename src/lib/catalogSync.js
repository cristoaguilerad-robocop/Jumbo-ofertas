import { supabase, isConfigured } from '../supabase'
import { fetchCategories, fetchCategory } from './jumboApi'
import { excludedBy, prettifySlug } from './catalogFilters'

const UPSERT_BATCH = 400
const THROTTLE_MS = 300
// Tope por categoría: acota el tiempo total y evita quedarse pegado si la
// paginación de Jumbo nunca deja de responder.
const MAX_PAGES_PER_CATEGORY = 40
const PROGRESS_KEY = 'jumbo_sync_progress'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function toRow(p, categoryPath) {
  const segments = categoryPath.split('/')
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    barcode: p.barcode || null,
    category: prettifySlug(segments[segments.length - 1]),
    category_top: prettifySlug(segments[0]),
    category_path: categoryPath,
    image_url: p.imageUrl,
    current_price: p.currentPrice,
    regular_price: p.regularPrice,
    is_on_sale: p.isOnSale,
    discount_percent: p.discountPercent,
    is_available: p.isAvailable,
    updated_at: new Date().toISOString(),
  }
}

export function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null') } catch { return null }
}
export function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY) } catch { /* ignore */ }
}
function saveProgress(p) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

async function upsertProducts(products, categoryPath) {
  const rows = products.map(p => toRow(p, categoryPath))
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const { error } = await supabase
      .from('products')
      .upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: 'id' })
    if (error) throw new Error(`Supabase: ${error.message}`)
  }
}

/**
 * Descarga el catálogo de Jumbo a Supabase, categoría por categoría.
 *
 * Corre en el navegador y es reanudable: el progreso se guarda tras cada
 * categoría, así que si se corta, la siguiente corrida retoma donde quedó.
 * Se excluyen las secciones definidas en catalogFilters.
 */
export async function syncCatalog({ onProgress, signal, restart = false } = {}) {
  if (!isConfigured) throw new Error('Supabase no está configurado')

  const report = patch => onProgress?.(patch)

  report({ phase: 'categories', message: 'Buscando categorías...' })
  const { categories: allCategories, stats } = await fetchCategories()
  if (!allCategories?.length) {
    throw new Error('No se encontraron categorías en el sitemap de Jumbo')
  }

  const excluded = []
  const categories = []
  for (const path of allCategories) {
    const section = excludedBy(path)
    if (section) excluded.push({ path, section })
    else categories.push(path)
  }

  const saved = restart ? null : loadProgress()
  const done = new Set(saved?.doneCategories || [])
  let totalSaved = saved?.totalSaved || 0
  let failed = saved?.failed || 0

  const base = {
    phase: 'crawling',
    totalCategories: categories.length,
    excludedCount: excluded.length,
    excludedSections: [...new Set(excluded.map(e => e.section))],
    discovery: stats,
  }
  report({ ...base, doneCategories: done.size, totalSaved, failed })

  for (const categoryPath of categories) {
    if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')
    if (done.has(categoryPath)) continue

    report({ ...base, currentCategory: categoryPath, doneCategories: done.size, totalSaved, failed })

    try {
      const seen = new Set()
      for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
        if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')

        const products = await fetchCategory(categoryPath, page, signal)
        if (!products.length) break

        // Si la página no aporta nada nuevo, la paginación ya dio la vuelta.
        const fresh = products.filter(p => !seen.has(p.id))
        if (!fresh.length) break
        fresh.forEach(p => seen.add(p.id))

        await upsertProducts(fresh, categoryPath)
        totalSaved += fresh.length

        report({
          ...base,
          currentCategory: categoryPath,
          currentPage: page,
          doneCategories: done.size,
          totalSaved,
          failed,
        })

        await sleep(THROTTLE_MS)
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err
      failed += 1
    }

    done.add(categoryPath)
    saveProgress({ doneCategories: [...done], totalSaved, failed })
    await sleep(THROTTLE_MS)
  }

  report({ ...base, phase: 'done', doneCategories: done.size, totalSaved, failed })
  return { totalSaved, failed, categories: categories.length, excluded: excluded.length }
}

/** Cantidad de productos indexados, o null si la tabla no es legible. */
export async function countCatalog() {
  if (!isConfigured) return null
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
  if (error) {
    console.warn('No se pudo contar el catálogo:', error.message)
    return null
  }
  return count
}
