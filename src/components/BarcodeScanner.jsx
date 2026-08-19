import { useEffect, useRef, useState, useCallback } from 'react'

// Formatos de supermercado. Acotarlos evita que el decodificador gaste esfuerzo
// en simbologías que nunca van a aparecer.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const rafRef = useRef(null)
  const activeRef = useRef(true)

  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [zoomCaps, setZoomCaps] = useState(null)
  const [zoom, setZoom] = useState(null)
  const [hasTorch, setHasTorch] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [engine, setEngine] = useState(null)
  const [manual, setManual] = useState('')
  const [showManual, setShowManual] = useState(false)

  const handleHit = useCallback(text => {
    if (!activeRef.current || !text) return
    activeRef.current = false
    if (navigator.vibrate) navigator.vibrate(60)
    onDetected(text)
  }, [onDetected])

  useEffect(() => {
    activeRef.current = true
    let stream = null
    let zxingControls = null

    async function start() {
      try {
        // Resolución alta y foco continuo: un código pequeño en 640x480 ocupa
        // demasiados pocos píxeles para decodificarse.
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            focusMode: 'continuous',
          },
        })
        if (!activeRef.current) return

        const video = videoRef.current
        video.srcObject = stream
        await video.play().catch(() => {})

        const track = stream.getVideoTracks()[0]
        trackRef.current = track

        const caps = track.getCapabilities?.() || {}
        if (caps.zoom) {
          setZoomCaps(caps.zoom)
          setZoom(track.getSettings?.().zoom ?? caps.zoom.min)
        }
        setHasTorch(!!caps.torch)

        // El detector nativo del sistema es bastante mejor que una librería JS
        // en códigos borrosos, chicos o arrugados. ZXing queda de respaldo.
        if ('BarcodeDetector' in window) {
          const supported = await window.BarcodeDetector.getSupportedFormats()
          const formats = FORMATS.filter(f => supported.includes(f))
          if (formats.length) {
            setEngine('nativo')
            runNative(new window.BarcodeDetector({ formats }), video)
            setLoading(false)
            return
          }
        }

        setEngine('zxing')
        zxingControls = await runZxing(stream, video)
        setLoading(false)
      } catch (err) {
        if (!activeRef.current) return
        setError(
          err.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Permítelo e intenta de nuevo.'
            : `No se pudo iniciar la cámara: ${err.message}`
        )
        setLoading(false)
      }
    }

    function runNative(detector, video) {
      let busy = false
      const tick = async () => {
        if (!activeRef.current) return
        if (!busy && video.readyState >= 2) {
          busy = true
          try {
            const codes = await detector.detect(video)
            if (codes?.length) handleHit(codes[0].rawValue)
          } catch { /* un cuadro fallido no detiene el bucle */ }
          busy = false
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    }

    async function runZxing(mediaStream, video) {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')

      // TRY_HARDER dedica más CPU por cuadro, que es justo lo que hace falta
      // con envases arrugados o mal iluminados.
      const hints = new Map()
      hints.set(DecodeHintType.TRY_HARDER, true)
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
      ])

      const reader = new BrowserMultiFormatReader(hints)
      return reader.decodeFromStream(mediaStream, video, result => {
        if (result) handleHit(result.getText())
      })
    }

    start()

    return () => {
      activeRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      try { zxingControls?.stop() } catch { /* ya detenido */ }
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [handleHit])

  async function applyZoom(value) {
    setZoom(value)
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ zoom: value }] })
    } catch { /* el dispositivo no aceptó ese nivel */ }
  }

  async function toggleTorch() {
    const next = !torchOn
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch { /* sin linterna disponible */ }
  }

  function submitManual(e) {
    e.preventDefault()
    const digits = manual.replace(/\D/g, '')
    if (digits.length >= 8) handleHit(digits)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col overscroll-none">
      <div className="flex items-center justify-between px-4 pb-4 pt-header-sm">
        <h2 className="text-white font-semibold text-lg">Escanear código</h2>
        <button
          onClick={onClose}
          className="text-white bg-gray-800 rounded-full w-9 h-9 flex items-center justify-center"
          aria-label="Cerrar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-32 relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
              <div className="absolute left-0 right-0 h-0.5 bg-green-400 animate-scan" style={{ top: '50%' }} />
            </div>
          </div>
        )}

        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white text-sm">Iniciando cámara...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="text-center max-w-xs">
              <div className="text-4xl mb-4">📷</div>
              <p className="text-white text-sm">{error}</p>
              <button onClick={onClose} className="mt-6 bg-green-500 text-white px-6 py-2 rounded-full text-sm font-medium">
                Volver
              </button>
            </div>
          </div>
        )}
      </div>

      {!error && (
        <div className="p-4 pb-safe space-y-3">
          {/* El zoom es lo que salva los códigos chicos: sin él ocupan
              demasiados pocos píxeles para decodificarse. */}
          {zoomCaps && (
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-xs shrink-0">Zoom</span>
              <input
                type="range"
                min={zoomCaps.min}
                max={zoomCaps.max}
                step={zoomCaps.step || 0.1}
                value={zoom ?? zoomCaps.min}
                onChange={e => applyZoom(Number(e.target.value))}
                className="flex-1 accent-green-500"
                aria-label="Acercar la cámara"
              />
              <span className="text-gray-400 text-xs w-10 text-right tabular-nums">
                {(zoom ?? zoomCaps.min).toFixed(1)}×
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                onClick={toggleTorch}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  torchOn ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-300'
                }`}
              >
                {torchOn ? '🔦 Linterna encendida' : '🔦 Encender linterna'}
              </button>
            )}
            <button
              onClick={() => setShowManual(v => !v)}
              className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-sm font-medium"
            >
              ⌨️ Escribir código
            </button>
          </div>

          {showManual && (
            <form onSubmit={submitManual} className="flex gap-2">
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={manual}
                onChange={e => setManual(e.target.value)}
                placeholder="Ej: 7801234567890"
                className="flex-1 bg-gray-800 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                disabled={manual.replace(/\D/g, '').length < 8}
                className="bg-green-500 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-medium"
              >
                Buscar
              </button>
            </form>
          )}

          <p className="text-gray-400 text-xs text-center">
            Acerca el zoom si el código es pequeño · llena el recuadro sin pegarte demasiado
            {engine && <span className="text-gray-600"> · lector {engine}</span>}
          </p>
        </div>
      )}
    </div>
  )
}
