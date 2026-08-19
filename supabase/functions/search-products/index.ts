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
//   ?barcode=780...        identifica un EAN vía Open Food Facts
//   ?benchmark=1           compara estrategias de descarga (KB por producto)
//   ?cnstrc=1              busca la clave de Constructor.io y prueba su API
//   ?path=/...             proxy crudo de una ruta de jumbo.cl
//
// Medición (2026-08, /busqueda?ft=leche, 41 productos):
//   HTML completo        1754 KB   43 KB/producto
//   cabecera RSC: 1       907 KB   22 KB/producto  <- se usa esta
//   resultsPerPage/count/pageSize: los ignora, siempre 41 productos
//
// Por qué NO se usa Constructor.io, aunque es 12x más liviano:
//   Su motor sirve la búsqueda de Jumbo y responde 100 productos por llamada
//   a 3,4 KB c/u. Su bundle expone 13 claves, de distintas cadenas de
//   Cencosud. Identificadas por el dominio de sus resultados:
//     key_JopvNXKS61kwGkBe  jumbo.cl producción  (CDN y sellers sin "qa")
//     key_DFB3C0u9Wbjq8StU  jumbo.cl QA          (jumboclqa.vteximg.com.br)
//     key_9NpwWxusNvJ2Cyhk  jumbo.cl QA
//     key_tUrIQxBOU2aGAGad  autocompletado, sin precios
//     key_j7ajk8vvD4T7oNEM  preview.paris.cl     (¡el de mayor total!)
//     otras: sisa.cl, jumbocolombia.com, wong.pe, metro.pe, easy.cl, QA de easy
//
//   La clave buena devuelve los cuatro campos de precio idénticos:
//     price = listPrice = sellingPrice = originalPrice = 1320
//   Sin diferencia entre precio normal y actual no hay forma de detectar
//   ofertas, que es la función central de la app. Además ese 1320 no es el
//   1250 que muestra el sitio: SellerVSS lista 39 locales y Jumbo cobra
//   distinto en cada uno, así que el índice responde por otro local.
//
//   El payload RSC sí trae price y listPrice separados. Por eso se prefiere,
//   aunque pese más.

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

/**
 * Busca la clave de Constructor.io y prueba su API de búsqueda.
 *
 * Constructor.io es el motor de búsqueda de Jumbo. Su API devuelve JSON
 * compacto en vez de páginas de ~900 KB, así que si la clave sirve, el crawl
 * baja de minutos a segundos. La clave no está en el HTML de jumbo.cl sino
 * dentro del bundle que sirven desde cnstrc.com.
 */
async function probeConstructor() {
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

  // Ya se sabe a qué cadena pertenece cada clave; solo se vuelven a probar
  // las de jumbo.cl, que son las candidatas reales.
  const JUMBO_KEYS = [
    'key_JopvNXKS61kwGkBe',
    'key_DFB3C0u9Wbjq8StU',
    'key_9NpwWxusNvJ2Cyhk',
    'key_tUrIQxBOU2aGAGad',
  ]
  const tests = []
  for (const key of JUMBO_KEYS.filter(k => candidates.has(k))) {
    const api = `https://ac.cnstrc.com/search/leche?key=${encodeURIComponent(key)}`
      + '&i=00000000-0000-4000-8000-000000000000&s=1&c=ciojs-client-2.35.0'
      + '&num_results_per_page=100&page=1'
    try {
      const res = await fetch(api, { headers: { Accept: 'application/json', Referer: `${ORIGIN}/` } })
      const body = await res.text()
      let results = null
      let total = null
      let samples: unknown[] = []
      let rawFirst: string | null = null
      let priceFields: string[] = []
      try {
        const json = JSON.parse(body)
        const list = json?.response?.results ?? []
        results = list.length
        total = json?.response?.total_num_results ?? null
        // La muestra identifica de qué cadena es la clave: las 13 son de
        // distintos banners de Cencosud y solo una corresponde a Jumbo.
        samples = list.slice(0, 3).map((r: Record<string, any>) => ({
          name: r?.value,
          price: r?.data?.price ?? r?.data?.sellingPrice ?? r?.data?.listPrice ?? null,
          url: r?.data?.url ?? r?.data?.link ?? null,
          id: r?.data?.id ?? null,
        }))

        // Los precios de Constructor no calzan con los del sitio: para la
        // Leche Soprole 1 L devuelve 1320 donde jumbo.cl muestra 1250. Antes
        // de descartarlo hay que ver todos los campos, por si el precio bueno
        // está en otro que no se está leyendo.
        const first = list[0]
        if (first?.data?.url?.includes('jumbo.cl')) {
          rawFirst = JSON.stringify(first).slice(0, 1800)
          priceFields = Object.entries(first.data ?? {})
            .filter(([k, v]) =>
              /price|precio|valor|amount|discount|promo|oferta/i.test(k) ||
              (typeof v === 'number' && v > 50 && v < 1000000))
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        }
      } catch { /* no era JSON */ }
      tests.push({
        key,
        status: res.status,
        kb: Math.round(body.length / 1024),
        results,
        total,
        kbPerProduct: results ? Math.round((body.length / 1024 / results) * 100) / 100 : null,
        samples,
        priceFields: priceFields.length ? priceFields : undefined,
        rawFirst: rawFirst || undefined,
        preview: results ? undefined : body.slice(0, 200),
      })
    } catch (err) {
      tests.push({ key, error: String(err) })
    }
  }

  return {
    bundles: bundleInfo,
    candidateKeys: [...candidates].slice(0, 20),
    tests: tests.sort((a, b) => (b.results ?? -1) - (a.results ?? -1)),
  }
}

/**
 * Comprueba qué parámetro de paginación usa jumbo.cl.
 *
 * Sospecha: el crawl guardó ~41 productos por categoría, justo lo que rinde
 * una página. Si `?page=2` devuelve lo mismo que la página 1, la paginación
 * nunca avanzó y el catálogo quedó en su primera página por categoría.
 */
async function probePaging(categoryPath: string) {
  const base = `/${categoryPath}`
  const first = await fetchHtml(base, true)
  const firstIds = new Set(extractProducts(first.html).map(p => p.id))

  const variants = [
    `${base}?page=2`,
    `${base}?p=2`,
    `${base}?from=41`,
    `${base}?offset=41`,
    `${base}?start=41`,
    `${base}?_from=41&_to=81`,
    `${base}?page=2&count=41`,
  ]

  const results = []
  for (const path of variants) {
    try {
      const res = await fetchHtml(path, true)
      const products = extractProducts(res.html)
      const nuevos = products.filter(p => !firstIds.has(p.id)).length
      results.push({
        path,
        status: res.status,
        products: products.length,
        nuevos,
        avanza: nuevos > 0,
      })
    } catch (err) {
      results.push({ path, error: String(err) })
    }
  }

  return {
    categoria: categoryPath,
    productosPagina1: firstIds.size,
    variantes: results.sort((a, b) => (b.nuevos ?? -1) - (a.nuevos ?? -1)),
  }
}


/**
 * Consulta Open Food Facts por un código de barras.
 *
 * Jumbo no publica el EAN en ninguna parte, así que un escaneo por sí solo no
 * identifica nada. Open Food Facts es una base abierta que mapea EAN a nombre
 * y marca: con eso se puede buscar el producto en el catálogo de Jumbo. No
 * trae precios ni cubre todo, pero resuelve la parte que falta.
 */
async function lookupBarcode(barcode: string) {
  const clean = barcode.replace(/\D/g, '')
  if (!clean) return { found: false, error: 'Código vacío' }

  // Alimentos, cosmética y productos generales son bases separadas.
  const bases = [
    'https://world.openfoodfacts.org',
    'https://world.openbeautyfacts.org',
    'https://world.openproductsfacts.org',
  ]

  for (const base of bases) {
    const url = `${base}/api/v2/product/${encodeURIComponent(clean)}.json`
      + '?fields=product_name,product_name_es,brands,quantity,image_url'
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'JumboOfertas/1.0' },
      })
      if (!res.ok) continue
      const json = await res.json()
      if (json?.status !== 1 || !json?.product) continue

      const p = json.product
      const name = p.product_name_es || p.product_name || ''
      if (!name) continue

      return {
        found: true,
        source: base.replace('https://world.', '').replace('.org', ''),
        barcode: clean,
        name,
        brand: p.brands ? String(p.brands).split(',')[0].trim() : '',
        quantity: p.quantity || '',
        imageUrl: p.image_url || null,
      }
    } catch { /* se prueba la siguiente base */ }
  }

  return { found: false, barcode: clean }
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
      const cnstrcUrls = [...new Set(
        [...home.html.matchAll(/[a-z0-9.-]*cnstrc\.com[^"'\s\\]{0,120}/gi)].map(m => m[0])
      )].slice(0, 5)

      return new Response(JSON.stringify({
        target,
        strategies: results.sort((a, b) => (a.kbPerProduct ?? 1e9) - (b.kbPerProduct ?? 1e9)),
        constructorUrls: cnstrcUrls,
        paginacion: await probePaging('lacteos'),
      }, null, 2), { headers: JSON_HEADERS })
    }

    const barcode = url.searchParams.get('barcode')
    if (barcode) {
      return new Response(JSON.stringify(await lookupBarcode(barcode)), { headers: JSON_HEADERS })
    }

    if (url.searchParams.get('paging') === '1') {
      const cat = url.searchParams.get('category') || 'lacteos'
      return new Response(JSON.stringify(await probePaging(cat), null, 2), { headers: JSON_HEADERS })
    }

    if (url.searchParams.get('cnstrc') === '1') {
      return new Response(JSON.stringify(await probeConstructor(), null, 2), { headers: JSON_HEADERS })
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
