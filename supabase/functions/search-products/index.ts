// Proxy y sonda hacia jumbo.cl.
//
// Existe por CORS: el navegador no puede llamar a jumbo.cl desde otro dominio.
// Un servidor sí puede, porque CORS es una restricción del navegador.
//
// Modos:
//   ?path=/...      proxy de una ruta de jumbo.cl
//   ?discover=1     analiza la página de búsqueda para encontrar el backend real
//
// Lo que ya se descartó con evidencia:
//   - jumbo.cl NO expone /api/catalog_system/pub/ ni /api/io/_v/ (404 en todas)
//   - No usa __NEXT_DATA__: es Next.js App Router, los datos van en payloads RSC
//   - La ruta de búsqueda real es /busqueda?ft=<texto>

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

// Hosts de terceros que solo hacen ruido (analítica, tags, fuentes).
const NOISE = /google|gtm|facebook|doubleclick|hotjar|newrelic|cookielaw|onetrust|clarity|criteo|adobe|w3\.org|schema\.org|gstatic|cloudflareinsights|linkedin|tiktok|youtube|instagram|twitter|whatsapp/i

/** Hosts únicos referenciados en el HTML; ahí aparece el backend real. */
function extractHosts(html: string) {
  const counts = new Map<string, number>()
  for (const m of html.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)/g)) {
    const host = m[1].toLowerCase()
    if (NOISE.test(host)) continue
    counts.set(host, (counts.get(host) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([host, n]) => `${host} (${n})`)
}

/** Contexto alrededor de marcadores que delatan datos de producto o una API. */
function extractContext(html: string, markers: string[], perMarker = 2, radius = 200) {
  const out: Record<string, string[]> = {}
  for (const marker of markers) {
    const hits: string[] = []
    let from = 0
    while (hits.length < perMarker) {
      const i = html.indexOf(marker, from)
      if (i === -1) break
      hits.push(html.slice(Math.max(0, i - radius), i + radius).replace(/\s+/g, ' '))
      from = i + marker.length
    }
    if (hits.length) out[marker] = hits
  }
  return out
}

const PRODUCT_MARKERS = [
  'productName', 'sellingPrice', 'listPrice', 'ListPrice', 'skuId', 'productId',
  'addToCart', 'itemsSold', '"price"', 'Precio', 'graphql', 'apiUrl', 'API_URL',
  'x-api-key', 'algolia', 'cencosud', 'vtex',
]

async function probe(path: string, deep = false) {
  const started = Date.now()
  try {
    const res = await fetch(ORIGIN + path, { headers: UPSTREAM_HEADERS, redirect: 'follow' })
    const body = await res.text()
    const contentType = res.headers.get('content-type') || ''
    const isJson = contentType.includes('json')

    const base: Record<string, unknown> = {
      path,
      status: res.status,
      ms: Date.now() - started,
      contentType,
      bytes: body.length,
      finalUrl: res.url,
    }

    if (isJson) {
      base.preview = body.slice(0, 600)
      return base
    }

    base.mentionsLeche = /leche/i.test(body)
    base.hasRscPayload = body.includes('__next_f')

    if (deep) {
      base.hosts = extractHosts(body)
      base.context = extractContext(body, PRODUCT_MARKERS)
    }
    return base
  } catch (err) {
    return { path, status: 0, ms: Date.now() - started, error: String(err) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)

  if (url.searchParams.get('discover') === '1') {
    // La ruta de búsqueda real, según el marcado schema.org del propio sitio.
    const search = await probe('/busqueda?ft=leche', true)

    // El sitemap suele listar el catálogo completo sin necesidad de API.
    const sitemap = await probe('/sitemap.xml')

    return new Response(
      JSON.stringify({ search, sitemap }, null, 2),
      { headers: JSON_HEADERS }
    )
  }

  const path = url.searchParams.get('path')
  if (!path) {
    return new Response(
      JSON.stringify({ error: 'Falta el parámetro path (o usa ?discover=1)' }),
      { status: 400, headers: JSON_HEADERS }
    )
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return new Response(
      JSON.stringify({ error: 'path debe ser una ruta relativa de jumbo.cl' }),
      { status: 400, headers: JSON_HEADERS }
    )
  }

  try {
    const res = await fetch(ORIGIN + path, { headers: UPSTREAM_HEADERS })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { ...CORS, 'Content-Type': res.headers.get('content-type') || 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 502, headers: JSON_HEADERS })
  }
})
