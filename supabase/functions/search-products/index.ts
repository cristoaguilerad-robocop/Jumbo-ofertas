// Proxy y sonda hacia jumbo.cl.
//
// Existe por CORS: el navegador no puede llamar a jumbo.cl desde otro dominio.
// Un servidor sí puede, porque CORS es una restricción del navegador.
//
// Modos:
//   ?path=/...      proxy de una ruta de jumbo.cl
//   ?discover=1     descubre qué API usa el sitio (rutas candidatas + HTML)
//
// Nota: jumbo.cl NO expone /api/catalog_system/pub/ (devuelve 404). El sitio
// es una app Next.js, así que el endpoint real hay que descubrirlo.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

const ORIGIN = 'https://www.jumbo.cl'

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-CL,es;q=0.9',
  'Referer': `${ORIGIN}/`,
}

// Rutas de API que suelen usar los storefronts de VTEX y las apps Next.js.
const API_CANDIDATES = [
  '/api/io/_v/api/intelligent-search/product_search?query=leche&count=3',
  '/_v/api/intelligent-search/product_search?query=leche&count=3',
  '/api/io/_v/private/graphql/v1',
  '/api/catalog_system/pub/products/search?ft=leche',
  '/api/search?q=leche',
  '/api/products/search?q=leche',
  '/api/vtexcommercestable/pub/products/search?ft=leche',
]

// Páginas del sitio: su HTML revela a qué API le pega el propio Jumbo.
const PAGE_CANDIDATES = ['/', '/busca?q=leche', '/search?q=leche', '/lacteos']

/** URLs con pinta de API que aparezcan en el HTML. */
function extractApiHints(html: string): string[] {
  const found = new Set<string>()
  const patterns = [
    /https?:\/\/[a-zA-Z0-9._-]+\/[^"'\s\\]{0,120}?(?:api|graphql|search|catalog)[^"'\s\\]{0,120}/gi,
    /"\/(?:api|_v)\/[^"'\s\\]{0,140}"/gi,
    /"(?:apiUrl|baseUrl|endpoint|graphqlUrl|searchUrl|API_URL)"\s*:\s*"[^"]{0,200}"/gi,
  ]
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const hit = m[0].replace(/^"|"$/g, '')
      if (hit.includes('_next/static')) continue // chunks de build, no API
      found.add(hit.slice(0, 200))
      if (found.size >= 60) return [...found]
    }
  }
  return [...found]
}

async function probe(path: string) {
  const started = Date.now()
  try {
    const res = await fetch(ORIGIN + path, { headers: UPSTREAM_HEADERS, redirect: 'follow' })
    const body = await res.text()
    const contentType = res.headers.get('content-type') || ''
    const isJson = contentType.includes('json')

    let items: number | null = null
    if (isJson) {
      try {
        const parsed = JSON.parse(body)
        items = Array.isArray(parsed)
          ? parsed.length
          : Array.isArray(parsed?.products) ? parsed.products.length : null
      } catch { /* no parseable */ }
    }

    return {
      path,
      status: res.status,
      ms: Date.now() - started,
      contentType,
      items,
      isJson,
      preview: isJson ? body.slice(0, 400) : undefined,
      hasNextData: !isJson ? body.includes('__NEXT_DATA__') : undefined,
      apiHints: !isJson ? extractApiHints(body) : undefined,
    }
  } catch (err) {
    return { path, status: 0, ms: Date.now() - started, error: String(err) }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)

  if (url.searchParams.get('discover') === '1') {
    const apis = []
    for (const p of API_CANDIDATES) apis.push(await probe(p))

    const pages = []
    for (const p of PAGE_CANDIDATES) pages.push(await probe(p))

    return new Response(
      JSON.stringify({ apis, pages }, null, 2),
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
  // El origen está fijo, así que solo hay que evitar que path cambie de host.
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
