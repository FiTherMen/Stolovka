import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  // Збірка сервера (npm run build:server) не потребує статичних файлів з public/.
  publicDir: isSsrBuild ? false : 'public',
}))
