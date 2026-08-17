export default function OfferBadge({ percent, size = 'sm' }) {
  if (!percent) return null
  return (
    <span className={`inline-flex items-center font-bold rounded-full bg-orange-500 text-white ${
      size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
    }`}>
      -{percent}%
    </span>
  )
}
