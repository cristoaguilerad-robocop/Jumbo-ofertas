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
//   ?path=/...             proxy crudo de una ruta de jumbo.cl
//   ?discover=2            sitemap y pistas del backend, para armar el crawl

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

/** Productos de una página de jumbo.cl, leídos de su payload RSC. */
function extractProducts(html: string) {
  const flight = decodeRscPayload(html)
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

async function fetchHtml(path: string) {
  const res = await fetch(ORIGIN + path, { headers: UPSTREAM_HEADERS, redirect: 'follow' })
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

      const { status, html } = await fetchHtml(path)
      if (status !== 200) {
        return new Response(
          JSON.stringify({ products: [], error: `Jumbo respondió ${status}`, path }),
          { headers: JSON_HEADERS }
        )
      }
      const products = extractProducts(html)
      return new Response(JSON.stringify({ products, page, path }), { headers: JSON_HEADERS })
    }

    // --- Rutas de categoría, para el crawl del catálogo ---
    if (url.searchParams.get('categories') === '1') {
      return new Response(JSON.stringify(await discoverCategories()), { headers: JSON_HEADERS })
    }

    // --- Pistas para armar el crawl completo ---
    if (url.searchParams.get('discover') === '2') {
      const sitemap = await fetchHtml('/sitemap.xml')
      const page2 = await fetchHtml('/busqueda?ft=leche&page=2')
      const p1 = await fetchHtml('/busqueda?ft=leche')

      const hostHints: string[] = []
      for (const m of p1.html.matchAll(/[a-zA-Z0-9._-]*(?:bff|cnstrc|constructor|api)[a-zA-Z0-9._-]*\.[a-z]{2,}[^"'\s\\]{0,80}/gi)) {
        if (hostHints.length < 25 && !hostHints.includes(m[0])) hostHints.push(m[0].slice(0, 160))
      }

      return new Response(JSON.stringify({
        sitemap: { status: sitemap.status, bytes: sitemap.html.length, head: sitemap.html.slice(0, 1500) },
        page1Count: extractProducts(p1.html).length,
        page2Count: extractProducts(page2.html).length,
        sampleProduct: extractProducts(p1.html)[0] || null,
        hostHints,
      }, null, 2), { headers: JSON_HEADERS })
    }

    // --- Proxy crudo ---
    const path = url.searchParams.get('path')
    if (!path) {
      return new Response(
        JSON.stringify({ error: 'Usa ?search=, ?category=, ?path= o ?discover=2' }),
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
