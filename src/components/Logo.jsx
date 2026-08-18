/**
 * Carrito de la marca, dibujado con trazos.
 *
 * Comparte geometría con public/favicon.svg y scripts/make-icons.py: si se
 * cambia acá, hay que cambiarlo en los tres. Va como paths y no como emoji
 * porque un 🛒 depende de la fuente del sistema y no se ve igual en cada
 * dispositivo.
 */
export default function Logo({ className = 'w-9 h-9', rounded = true }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Jumbo Ofertas"
    >
      {rounded && <rect width="100" height="100" rx="22" fill="#00A650" />}
      <path
        d="M17 25h8.5l9 35.5H70L79 37.5H29.5"
        fill="none"
        stroke={rounded ? '#fff' : 'currentColor'}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="42" cy="73.5" r="6" fill={rounded ? '#fff' : 'currentColor'} />
      <circle cx="66" cy="73.5" r="6" fill={rounded ? '#fff' : 'currentColor'} />
    </svg>
  )
}
