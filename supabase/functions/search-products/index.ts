// Proxy hacia la API pública de catálogo de jumbo.cl.
//
// Existe por CORS: la API de VTEX no manda Access-Control-Allow-Origin, así que
// el navegador no puede llamarla desde otro dominio. Un servidor sí puede,
// porque CORS es una restricción del navegador, no del servidor.
//
// Uso: /functions/v1/search-products?path=/api/catalog_system/pub/products/search?_query=leche
// Solo se permiten rutas públicas de catálogo.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

const ORIGIN = 'https://www.jumbo.cl'
const ALLOWED_PREFIX = '/api/catalog_system/pub/'

const UPSTREAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-CL,es;q=0.9',
  'Referer': `${ORIGIN}/`,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)

  // Modo diagnóstico: prueba varias rutas y reporta qué responde cada una.
  if (url.searchParams.get('diagnose') === '1') {
    const probes = [
      '/api/catalog_system/pub/category/tree/2',
      '/api/catalog_system/pub/products/search?_query=leche&_from=0&_to=2',
      '/api/catalog_system/pub/products/search?fq=alternateId:7801620000119',
    ]
    const results = []
    for (const path of probes) {
      const started = Date.now()
      try {
        const res = await fetch(ORIGIN + path, { headers: UPSTREAM_HEADERS })
        const body = await res.text()
        let parsed = null
        try { parsed = JSON.parse(body) } catch { /* no era JSON */ }
        results.push({
          path,
          status: res.status,
          ms: Date.now() - started,
          contentType: res.headers.get('content-type'),
          items: Array.isArray(parsed) ? parsed.length : null,
          preview: body.slice(0, 300),
        })
      } catch (err) {
        results.push({ path, status: 0, ms: Date.now() - started, error: String(err) })
      }
    }
    return new Response(JSON.stringify({ diagnose: results }, null, 2), { headers: JSON_HEADERS })
  }

  const path = url.searchParams.get('path')
  if (!path) {
    return new Response(
      JSON.stringify({ error: 'Falta el parámetro path' }),
      { status: 400, headers: JSON_HEADERS }
    )
  }
  if (!path.startsWith(ALLOWED_PREFIX)) {
    return new Response(
      JSON.stringify({ error: `Solo se permiten rutas bajo ${ALLOWED_PREFIX}` }),
      { status: 403, headers: JSON_HEADERS }
    )
  }

  try {
    const res = await fetch(ORIGIN + path, { headers: UPSTREAM_HEADERS })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        ...CORS,
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 502, headers: JSON_HEADERS }
    )
  }
})
