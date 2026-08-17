import { useEffect, useRef, useState } from 'react'

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let controls = null
    let active = true

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!active) return

        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (!devices || devices.length === 0) {
          setError('No se encontró cámara en este dispositivo.')
          setLoading(false)
          return
        }

        // Prefer back camera
        const backCamera = devices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('trasera') ||
          d.label.toLowerCase().includes('environment')
        ) || devices[devices.length - 1]

        controls = await reader.decodeFromVideoDevice(
          backCamera.deviceId,
          videoRef.current,
          (result, err) => {
            if (!active) return
            if (result) {
              onDetected(result.getText())
            }
          }
        )
        setLoading(false)
      } catch (err) {
        if (!active) return
        if (err.name === 'NotAllowedError') {
          setError('Permiso de cámara denegado. Permite el acceso a la cámara e intenta de nuevo.')
        } else {
          setError('No se pudo iniciar el escáner: ' + err.message)
        }
        setLoading(false)
      }
    }

    startScanner()

    return () => {
      active = false
      if (controls) {
        controls.stop()
      }
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-safe">
        <h2 className="text-white font-semibold text-lg">Escanear código</h2>
        <button
          onClick={onClose}
          className="text-white bg-gray-800 rounded-full w-9 h-9 flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative flex items-center justify-center">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Scan frame overlay */}
        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-40 relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
              {/* Scan line animation */}
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
              <button
                onClick={onClose}
                className="mt-6 bg-green-500 text-white px-6 py-2 rounded-full text-sm font-medium"
              >
                Volver
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hint */}
      {!error && (
        <div className="p-4 pb-safe">
          <p className="text-gray-400 text-sm text-center">
            Apunta al código de barras del producto
          </p>
        </div>
      )}
    </div>
  )
}
