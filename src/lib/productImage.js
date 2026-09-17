/**
 * Pide a Jumbo la imagen del tamaño que hace falta.
 *
 * Las URLs de VTEX llevan el tamaño dentro de la ruta
 * (`.../ids/12345-500-500/foo.jpg`), así que se puede pedir cualquier medida
 * sin volver a sincronizar el catálogo: basta reescribir la URL guardada.
 *
 * El problema no era el tamaño en píxeles CSS sino la densidad: una foto de
 * 500 px mostrada en un cuadro de 80 se ve bien en un monitor, pero un teléfono
 * moderno pinta ese cuadro con 160 o 240 píxeles reales, y ahí la imagen se
 * interpola y pierde nitidez. Por eso se genera también un `srcset`.
 */
export function productImage(url, size) {
  if (!url) return null
  // Con tamaño explícito: se sustituye.
  if (/-\d+-\d+\//.test(url)) return url.replace(/-\d+-\d+\//, `-${size}-${size}/`)
  // Sin tamaño: se inserta después del id del archivo.
  return url.replace(/\/ids\/(\d+)\//, `/ids/$1-${size}-${size}/`)
}

/**
 * `srcset` a 1x, 2x y 3x para que cada pantalla baje la densidad que usa.
 * `sizes` le dice al navegador el ancho real en CSS, sin el cual elegiría
 * siempre la mayor y gastaría datos de más.
 */
export function productImageProps(url, cssPx) {
  const src = productImage(url, cssPx * 2)
  if (!src) return {}
  return {
    src,
    srcSet: [1, 2, 3]
      .map(d => `${productImage(url, cssPx * d)} ${d}x`)
      .join(', '),
    sizes: `${cssPx}px`,
  }
}
