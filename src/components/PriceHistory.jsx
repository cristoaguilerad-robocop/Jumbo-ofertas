import { useMemo } from 'react'
import { formatPrice } from '../data/mockProducts'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function label(iso) {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`
}

/**
 * Historial de precio con datos reales.
 *
 * Antes esto era una curva generada con Math.sin: mínimos y máximos inventados
 * bajo un título que los presentaba como reales. En una app para decidir cuándo
 * comprar, eso puede llevarte a esperar una baja que nunca existió. Ahora,
 * cuando no hay datos suficientes, se dice.
 */
export default function PriceHistory({ history, loading }) {
  const chart = useMemo(() => {
    if (!history || history.length < 2) return null

    const prices = history.map(h => h.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const span = max - min || 1

    // Coordenadas en un viewBox de 100x40; el SVG escala solo al ancho real.
    const points = history.map((h, i) => {
      const x = (i / (history.length - 1)) * 100
      const y = 36 - ((h.price - min) / span) * 32
      return { ...h, x, y }
    })

    const line = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
    const area = `0,40 ${line} 100,40`
    const last = history[history.length - 1]
    const first = history[0]

    return { points, line, area, min, max, first, last, delta: last.price - first.price }
  }, [history])

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-2xl p-4">
        <h2 className="text-white font-semibold mb-4">Historial de precio</h2>
        <div className="h-24 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (!chart) {
    const registrados = history?.length || 0
    return (
      <div className="bg-gray-800 rounded-2xl p-4">
        <h2 className="text-white font-semibold mb-2">Historial de precio</h2>
        <p className="text-gray-400 text-sm">
          Aún no hay historial suficiente para este producto.
        </p>
        <p className="text-gray-500 text-xs mt-1.5">
          {registrados === 1
            ? 'Hay un solo registro, del día en que se consultó el precio. '
            : 'Todavía no se ha registrado ningún precio. '}
          La app anota el precio cada vez que abres la ficha o refresca tu lista;
          con un par de días ya se puede ver la tendencia.
        </p>
      </div>
    )
  }

  const { points, line, area, min, max, first, last, delta } = chart

  return (
    <div className="bg-gray-800 rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-white font-semibold">Historial de precio</h2>
        <span className="text-gray-500 text-xs">{history.length} registros</span>
      </div>

      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-24" role="img"
        aria-label={`Precio entre ${formatPrice(min)} y ${formatPrice(max)}`}>
        <polygon points={area} fill="rgb(34 197 94 / 0.12)" />
        <polyline
          points={line}
          fill="none"
          stroke="rgb(34 197 94)"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1.2"
            fill={p.isOnSale ? 'rgb(249 115 22)' : 'rgb(34 197 94)'}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="flex justify-between mt-1.5">
        <span className="text-gray-500 text-[10px]">{label(first.date)}</span>
        <span className="text-gray-500 text-[10px]">{label(last.date)}</span>
      </div>

      <div className="flex justify-between mt-3 pt-3 border-t border-gray-700">
        <div>
          <p className="text-gray-500 text-[10px]">Mínimo</p>
          <p className="text-green-400 text-sm font-semibold">{formatPrice(min)}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 text-[10px]">Máximo</p>
          <p className="text-white text-sm font-semibold">{formatPrice(max)}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-[10px]">Desde {label(first.date)}</p>
          <p className={`text-sm font-semibold ${delta < 0 ? 'text-green-400' : delta > 0 ? 'text-orange-400' : 'text-gray-300'}`}>
            {delta === 0 ? 'Sin cambio' : `${delta < 0 ? '−' : '+'}${formatPrice(Math.abs(delta))}`}
          </p>
        </div>
      </div>

      {last.price <= min && history.length > 2 && (
        <p className="text-green-400 text-xs text-center mt-3">
          Está en su precio más bajo registrado 🎉
        </p>
      )}
    </div>
  )
}
