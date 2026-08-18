import { supabase, isConfigured } from '../supabase'
import { fetchCategories, fetchCategory } from './jumboApi'
import { excludedBy, prettifySlug } from './catalogFilters'

const UPSERT_BATCH = 400
const THROTTLE_MS = 60
// Cuántas categorías se recorren a la vez. El tiempo se va casi todo esperando
// la red, así que varias en paralelo multiplican el rendimiento sin castigar a
// jumbo.cl.
const CONCURRENCY = 8
// Tope por categoría: acota el tiempo total y evita quedarse pegado si la
// paginación de Jumbo nunca deja de responder.
const MAX_PAGES_PER_CATEGORY = 40
// Presupuesto de tiempo. Al agotarse, el crawl se detiene de forma ordenada y
// deja el progreso guardado, en vez de correr indefinidamente.
const TIME_BUDGET_MS = 10 * 60 * 1000
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

/**
 * Verifica que se pueda escribir en `products` antes de empezar.
 *
 * Sin esto, un fallo de permisos se manifestaba como un crawl de cinco
 * minutos que terminaba con la tabla vacía: el error se perdía en el catch
 * por categoría, que solo contaba fallas sin mostrar el motivo.
 */
async function preflight() {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error(
      'No hay sesión activa en Supabase. Revisa que los inicios de sesión ' +
      'anónimos estén habilitados en Authentication → Sign In / Up.' +
      (authError ? ` (${authError.message})` : '')
    )
  }

  const probeId = `preflight_${Date.now()}`
  const { error: writeError } = await supabase.from('products').upsert({
    id: probeId,
    name: 'Comprobación de escritura',
    current_price: 1,
    regular_price: 1,
  }, { onConflict: 'id' })

  if (writeError) {
    throw new Error(
      `No se puede escribir en la tabla products: ${writeError.message}. ` +
      'Revisa que hayas ejecutado supabase/products.sql completo, incluidas ' +
      'las políticas de RLS.'
    )
  }

  await supabase.from('products').delete().eq('id', probeId)
  return user
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
/**
 * Deja fuera las categorías que tienen subcategorías: sus productos ya salen
 * al recorrer las hojas, y el padre además tope antes por MAX_PAGES.
 */
function leafCategories(paths) {
  const set = new Set(paths)
  return paths.filter(p => {
    for (const other of set) {
      if (other !== p && other.startsWith(`${p}/`)) return false
    }
    return true
  })
}

export async function syncCatalog({ onProgress, signal, restart = false } = {}) {
  if (!isConfigured) throw new Error('Supabase no está configurado')

  const report = patch => onProgress?.(patch)

  report({ phase: 'categories', message: 'Verificando acceso a Supabase...' })
  await preflight()

  report({ phase: 'categories', message: 'Buscando categorías...' })
  const { categories: allCategories, stats } = await fetchCategories()
  if (!allCategories?.length) {
    throw new Error('No se encontraron categorías en el sitemap de Jumbo')
  }

  const excluded = []
  const included = []
  for (const path of allCategories) {
    const section = excludedBy(path)
    if (section) excluded.push({ path, section })
    else included.push(path)
  }
  const categories = leafCategories(included)

  const saved = restart ? null : loadProgress()
  const done = new Set(saved?.doneCategories || [])
  let totalSaved = saved?.totalSaved || 0
  let failed = saved?.failed || 0
  let lastError = null

  const startedAt = Date.now()
  const alreadyDone = done.size

  const base = {
    phase: 'crawling',
    totalCategories: categories.length,
    excludedCount: excluded.length,
    excludedSections: [...new Set(excluded.map(e => e.section))],
    skippedParents: included.length - categories.length,
    discovery: stats,
  }

  const snapshot = extra => {
    const elapsedMin = (Date.now() - startedAt) / 60000
    const progressed = done.size - alreadyDone
    const perMin = elapsedMin > 0.2 ? progressed / elapsedMin : 0
    return {
      ...base,
      doneCategories: done.size,
      totalSaved,
      failed,
      lastError,
      productsPerMin: elapsedMin > 0.2 ? Math.round(totalSaved / elapsedMin) : null,
      etaMin: perMin > 0 ? Math.round((categories.length - done.size) / perMin) : null,
      ...extra,
    }
  }

  report(snapshot())

  const active = new Set()
  let cursor = 0
  let outOfTime = false

  const budgetSpent = () => Date.now() - startedAt >= TIME_BUDGET_MS

  async function crawlOne(categoryPath) {
    const seen = new Set()
    for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
      if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')

      if (budgetSpent()) { outOfTime = true; break }

      const products = await fetchCategory(categoryPath, page, signal)
      if (!products.length) break

      // Si la página no aporta nada nuevo, la paginación ya dio la vuelta.
      const fresh = products.filter(p => !seen.has(p.id))
      if (!fresh.length) break
      fresh.forEach(p => seen.add(p.id))

      await upsertProducts(fresh, categoryPath)
      totalSaved += fresh.length
      report(snapshot({ currentCategory: [...active][0], currentPage: page }))

      await sleep(THROTTLE_MS)
    }
  }

  async function worker() {
    while (cursor < categories.length) {
      if (signal?.aborted) throw new DOMException('Sincronización cancelada', 'AbortError')

      if (budgetSpent()) { outOfTime = true; return }

      const categoryPath = categories[cursor++]
      if (done.has(categoryPath)) continue

      active.add(categoryPath)
      report(snapshot({ currentCategory: categoryPath }))
      try {
        await crawlOne(categoryPath)
      } catch (err) {
        if (err.name === 'AbortError') throw err
        failed += 1
        lastError = err.message
        // Si todo falla, no tiene sentido seguir cinco minutos en vano.
        if (failed >= 5 && totalSaved === 0) {
          throw new Error(`El crawl no logró guardar nada. Primer error: ${err.message}`)
        }
      } finally {
        active.delete(categoryPath)
      }

      done.add(categoryPath)
      saveProgress({ doneCategories: [...done], totalSaved, failed })
      await sleep(THROTTLE_MS)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  report(snapshot({ phase: 'done', outOfTime }))
  return {
    totalSaved,
    failed,
    lastError,
    outOfTime,
    categories: categories.length,
    excluded: excluded.length,
  }
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
