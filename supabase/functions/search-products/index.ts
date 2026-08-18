// Proxy y extractor de productos de jumbo.cl.
//
// Existe por CORS: el navegador no puede llamar a jumbo.cl desde otro dominio.
// Un servidor sí puede, porque CORS es una restricción del navegador.
//
// Cómo se obtienen los productos, y por qué así:
//   jumbo.cl es Next.js App Router. No expone /api/catalog_system ni /api/io
//   (404 en todas). Pero sus páginas traen los productos ya renderizados en el
//   payload RSC, con price y listPrice separados, que es lo que hace falta para
//   detectar ofertas. Así que se parsea la página en vez de buscar una API.
//
// Modos:
//   ?search=leche&page=1   productos de la búsqueda, ya normalizados
//   ?category=lacteos      productos de una categoría
//   ?categories=1          rutas de categoría, del sitemap y del menú
//   ?benchmark=1           compara estrategias de descarga (KB por producto)
//   ?cnstrc=1              busca la clave de Constructor.io y prueba su API
//   ?path=/...             proxy crudo de una ruta de jumbo.cl
//
// Medición (2026-08, /busqueda?ft=leche, 41 productos):
//   HTML completo        1754 KB   43 KB/producto
//   cabecera RSC: 1       907 KB   22 KB/producto  <- se usa esta
//   resultsPerPage/count/pageSize: los ignora, siempre 41 productos

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

const ORIGIN = 'https://www.jumbo.cl'

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  'Accept': 'text/html,application/json,application/xhtml+xml,*/*',
  'Accept-Language': 'es-CL,es;q=0.9',
  'Referer': `${ORIGIN}/`,
}

/**
 * El HTML trae el payload RSC troceado en llamadas self.__next_f.push([1,"..."]).
 * Cada trozo es un string JSON escapado; al desescaparlos y concatenarlos se
 * obtiene el texto donde viven los objetos de producto.
 */
function decodeRscPayload(html: string): string {
  let out = ''
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
  for (const m of html.matchAll(re)) {
    try { out += JSON.parse(m[1]) } catch { /* trozo corrupto, se ignora */ }
  }
  return out
}

/** Extrae el objeto JSON completo que empieza en `start` contando llaves. */
function readJsonObject(text: string, start: number): string | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escaped) { escaped = false; continue }
    if (c === '\\') { escaped = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
    // Un objeto de producto nunca es tan grande; corta payloads degenerados.
    if (i - start > 20000) return null
  }
  return null
}

interface RscProduct {
  productId: string
  reference?: string
  slug?: string
  brand?: string
  name?: string
  categories?: string[]
  items?: Array<{
    skuId?: string
    name?: string
    ean?: string
    price?: number
    listPrice?: number
    measurementUnitUn?: string
    images?: string[]
  }>
}

function normalize(p: RscProduct) {
  const item = p.items?.[0]
  if (!item) return null

  const currentPrice = Math.round(item.price ?? 0)
  const regularPrice = Math.round(item.listPrice ?? item.price ?? 0)
  if (currentPrice <= 0) return null

  const isOnSale = regularPrice > currentPrice
  const discountPercent = isOnSale
    ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
    : 0

  return {
    id: `jumbo_${p.productId}`,
    name: p.name || item.name || '',
    brand: p.brand || '',
    barcode: item.ean || '',
    reference: p.reference || '',
    slug: p.slug || '',
    categoryIds: p.categories || [],
    // Las imágenes vienen en 250x250; se pide una resolución mayor.
    imageUrl: item.images?.[0]?.replace(/-\d+-\d+\//, '-500-500/') || null,
    currentPrice,
    regularPrice,
    isOnSale,
    discountPercent,
    isAvailable: true,
    unit: item.measurementUnitUn || 'unidad',
    source: 'jumbo',
  }
}

/**
 * Productos de una página de jumbo.cl, leídos de su payload RSC.
 *
 * Acepta las dos formas del payload: el HTML normal, que lo trae troceado en
 * self.__next_f.push(...), y la respuesta a una petición con cabecera RSC,
 * que ya viene como flight crudo (text/x-component) y pesa la mitad.
 */
function extractProducts(body: string) {
  const chunked = decodeRscPayload(body)
  const flight = chunked.length > 0 ? chunked : body
  const marker = '{"productId":"'
  const seen = new Set<string>()
  const products = []

  let from = 0
  while (true) {
    const i = flight.indexOf(marker, from)
    if (i === -1) break
    from = i + marker.length

    const raw = readJsonObject(flight, i)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as RscProduct
      const product = normalize(parsed)
      if (product && !seen.has(product.id)) {
        seen.add(product.id)
        products.push(product)
      }
    } catch { /* no era un objeto de producto completo */ }
  }
  return products
}

/**
 * Pide una página de jumbo.cl. Con `rsc` se manda la cabecera RSC: Next.js
 * responde solo el payload de datos en vez de la página completa, lo que en la
 * medición bajó de 1754 KB a 907 KB con los mismos 41 productos.
 */
async function fetchHtml(path: string, rsc = false) {
  const res = await fetch(ORIGIN + path, {
    headers: rsc ? { ...UPSTREAM_HEADERS, RSC: '1' } : UPSTREAM_HEADERS,
    redirect: 'follow',
  })
  return { status: res.status, html: await res.text() }
}

function locsIn(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1])
}

/** Ruta limpia de una URL de jumbo.cl, o null si no es una categoría. */
function categoryPathOf(rawUrl: string): string | null {
  let path: string
  try {
    path = new URL(rawUrl).pathname
  } catch {
    return null
  }
  // Las fichas de producto terminan en /p; el resto son navegación.
  if (/\/p\/?$/.test(path)) return null
  const clean = path.replace(/^\/+|\/+$/g, '')
  if (!clean) return null
  // Más de tres niveles ya es demasiado específico para valer un crawl aparte.
  if (clean.split('/').length > 3) return null
  if (/\.(xml|html?|json|jpg|png|webp|pdf)$/i.test(clean)) return null
  return clean
}

/**
 * Rutas de categoría de jumbo.cl, sacadas del sitemap y del menú de la home.
 * Se usan dos fuentes porque ninguna es completa por sí sola.
 */
async function discoverCategories() {
  const fromSitemap = new Set<string>()
  const fromNav = new Set<string>()
  let productUrls = 0
  let childSitemapsRead = 0

  // 1. Sitemap (puede ser un índice que apunta a otros sitemaps)
  try {
    const root = await fetchHtml('/sitemap.xml')
    const locs = locsIn(root.html)
    const children = locs.filter(u => /\.xml$/i.test(u)).slice(0, 8)
    const direct = locs.filter(u => !/\.xml$/i.test(u))

    const allUrls = [...direct]
    for (const child of children) {
      try {
        const res = await fetch(child, { headers: UPSTREAM_HEADERS })
        allUrls.push(...locsIn(await res.text()))
        childSitemapsRead++
      } catch { /* un sitemap hijo caído no aborta el resto */ }
      if (allUrls.length > 80000) break
    }

    for (const u of allUrls) {
      const path = categoryPathOf(u)
      if (path) fromSitemap.add(path)
      else productUrls++
    }
  } catch { /* se sigue con el menú */ }

  // 2. Menú de la home
  try {
    const home = await fetchHtml('/')
    for (const m of home.html.matchAll(/href="\/([a-z0-9][a-z0-9\-/]{2,60})"/gi)) {
      const path = categoryPathOf(`${ORIGIN}/${m[1]}`)
      if (path) fromNav.add(path)
    }
  } catch { /* el sitemap ya puede bastar */ }

  const categories = [...new Set([...fromSitemap, ...fromNav])].sort()
  return {
    categories: categories.slice(0, 1200),
    stats: {
      total: categories.length,
      fromSitemap: fromSitemap.size,
      fromNav: fromNav.size,
      productUrls,
      childSitemapsRead,
    },
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)

  try {
    // --- Búsqueda de productos ---
    const search = url.searchParams.get('search')
    const category = url.searchParams.get('category')
    if (search || category) {
      const page = Number(url.searchParams.get('page') || '1')
      const path = search
        ? `/busqueda?ft=${encodeURIComponent(search)}${page > 1 ? `&page=${page}` : ''}`
        : `/${category}${page > 1 ? `?page=${page}` : ''}`

      // Se pide primero el payload RSC, que pesa la mitad. Si no rinde
      // productos se reintenta con la página completa, para que un cambio de
      // formato degrade el rendimiento en vez de romper el crawl.
      let via = 'rsc'
      const light = await fetchHtml(path, true)
      let status = light.status
      let products = status === 200 ? extractProducts(light.html) : []

      if (!products.length) {
        const full = await fetchHtml(path)
        status = full.status
        if (status === 200) {
          products = extractProducts(full.html)
          via = 'html'
        }
      }

      if (status !== 200) {
        return new Response(
          JSON.stringify({ products: [], error: `Jumbo respondió ${status}`, path }),
          { headers: JSON_HEADERS }
        )
      }
      return new Response(JSON.stringify({ products, page, path, via }), { headers: JSON_HEADERS })
    }

    // --- Rutas de categoría, para el crawl del catálogo ---
    if (url.searchParams.get('categories') === '1') {
      return new Response(JSON.stringify(await discoverCategories()), { headers: JSON_HEADERS })
    }

    // --- Banco de pruebas: qué estrategia baja el catálogo más rápido ---
    //
    // Una página HTML pesa ~1,7 MB para ~24 productos. Antes de optimizar a
    // ciegas conviene medir cuánto pesa y cuántos productos rinde cada vía.
    if (url.searchParams.get('benchmark') === '1') {
      const target = url.searchParams.get('target') || '/busqueda?ft=leche'
      const sep = target.includes('?') ? '&' : '?'

      const strategies: Array<{ name: string; path: string; headers?: Record<string, string> }> = [
        { name: 'html', path: target },
        { name: 'rsc-header', path: target, headers: { RSC: '1' } },
        { name: 'rsc-param', path: `${target}${sep}_rsc=1` },
        { name: 'resultsPerPage=100', path: `${target}${sep}resultsPerPage=100` },
        { name: 'count=100', path: `${target}${sep}count=100` },
        { name: 'pageSize=100', path: `${target}${sep}pageSize=100` },
      ]

      const results = []
      for (const s of strategies) {
        const started = Date.now()
        try {
          const res = await fetch(ORIGIN + s.path, {
            headers: { ...UPSTREAM_HEADERS, ...(s.headers || {}) },
            redirect: 'follow',
          })
          const body = await res.text()
          const products = extractProducts(body)
          const ms = Date.now() - started
          results.push({
            name: s.name,
            status: res.status,
            ms,
            kb: Math.round(body.length / 1024),
            products: products.length,
            kbPerProduct: products.length ? Math.round(body.length / 1024 / products.length) : null,
            contentType: res.headers.get('content-type'),
          })
        } catch (err) {
          results.push({ name: s.name, status: 0, error: String(err) })
        }
      }

      // La clave de Constructor.io, su motor de búsqueda: si está en el HTML,
      // se puede consultar su API JSON en vez de bajar páginas enteras.
      const home = await fetchHtml(target)
      const keys = [...new Set(
        [...home.html.matchAll(/key_[A-Za-z0-9_-]{8,}/g)].map(m => m[0])
      )].slice(0, 5)
      const cnstrcUrls = [...new Set(
        [...home.html.matchAll(/[a-z0-9.-]*cnstrc\.com[^"'\s\\]{0,120}/gi)].map(m => m[0])
      )].slice(0, 5)

      return new Response(JSON.stringify({
        target,
        strategies: results.sort((a, b) => (a.kbPerProduct ?? 1e9) - (b.kbPerProduct ?? 1e9)),
        constructorKeys: keys,
        constructorUrls: cnstrcUrls,
      }, null, 2), { headers: JSON_HEADERS })
    }

    // --- Constructor.io: buscar su clave y probar su API ---
    //
    // Su motor de búsqueda devuelve JSON compacto en vez de páginas de ~900 KB.
    // La clave no está en el HTML de jumbo.cl sino dentro del bundle que sirven
    // desde cnstrc.com, así que hay que bajarlo y leerlo.
    if (url.searchParams.get('cnstrc') === '1') {
      const bundles = [
        'https://cnstrc.com/js/cust/cencosud_0BmS-e.js',
        'https://ac.cnstrc.com/js/cust/cencosud_0BmS-e.js',
      ]

      const candidates = new Set<string>()
      const bundleInfo = []
      for (const b of bundles) {
        try {
          const res = await fetch(b, { headers: UPSTREAM_HEADERS })
          const js = await res.text()
          bundleInfo.push({ url: b, status: res.status, kb: Math.round(js.length / 1024) })
          if (!res.ok) continue
          for (const m of js.matchAll(/key_[A-Za-z0-9_-]{6,}/g)) candidates.add(m[0])
          for (const m of js.matchAll(/["'](?:apiKey|api_key|indexKey|key)["']\s*:\s*["']([A-Za-z0-9_-]{8,})["']/g)) {
            candidates.add(m[1])
          }
        } catch (err) {
          bundleInfo.push({ url: b, error: String(err) })
        }
      }

      // Cada clave candidata se prueba contra su API de búsqueda.
      const tests = []
      for (const key of [...candidates].slice(0, 8)) {
        const api = `https://ac.cnstrc.com/search/leche?key=${encodeURIComponent(key)}`
          + '&i=00000000-0000-4000-8000-000000000000&s=1&c=ciojs-client-2.35.0'
          + '&num_results_per_page=100&page=1'
        try {
          const res = await fetch(api, { headers: { Accept: 'application/json', Referer: `${ORIGIN}/` } })
          const body = await res.text()
          let results = null
          let total = null
          try {
            const json = JSON.parse(body)
            results = json?.response?.results?.length ?? null
            total = json?.response?.total_num_results ?? null
          } catch { /* no era JSON */ }
          tests.push({
            key,
            status: res.status,
            kb: Math.round(body.length / 1024),
            results,
            total,
            kbPerProduct: results ? Math.round((body.length / 1024 / results) * 100) / 100 : null,
            preview: results ? undefined : body.slice(0, 200),
          })
        } catch (err) {
          tests.push({ key, error: String(err) })
        }
      }

      return new Response(JSON.stringify({
        bundles: bundleInfo,
        candidateKeys: [...candidates].slice(0, 20),
        tests: tests.sort((a, b) => (b.results ?? -1) - (a.results ?? -1)),
      }, null, 2), { headers: JSON_HEADERS })
    }

    // --- Proxy crudo ---
    const path = url.searchParams.get('path')
    if (!path) {
      return new Response(
        JSON.stringify({ error: 'Usa ?search=, ?category=, ?categories=1, ?benchmark=1, ?cnstrc=1 o ?path=' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }
    if (!path.startsWith('/') || path.startsWith('//')) {
      return new Response(
        JSON.stringify({ error: 'path debe ser una ruta relativa de jumbo.cl' }),
        { status: 400, headers: JSON_HEADERS }
      )
    }

    const res = await fetch(ORIGIN + path, { headers: UPSTREAM_HEADERS })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { ...CORS, 'Content-Type': res.headers.get('content-type') || 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), products: [] }),
      { status: 502, headers: JSON_HEADERS }
    )
  }
})
