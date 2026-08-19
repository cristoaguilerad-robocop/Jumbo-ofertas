import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Identificador del build, incrustado al compilar.
//
// Varias veces no se pudo saber si la app cargada en el teléfono correspondía
// al código recién mergeado o a un despliegue anterior, y se diagnosticaron
// como errores cosas que solo eran una versión vieja en caché. Con esto la
// pantalla de catálogo dice exactamente qué commit está corriendo.
const commit = (process.env.GITHUB_SHA || '').slice(0, 7) || 'local'
const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_URL || '/',
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_TIME__: JSON.stringify(builtAt),
  },
})
