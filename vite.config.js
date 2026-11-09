import { defineConfig } from 'vite';

export default defineConfig({
  // Les chemins relatifs permettent aussi le chargement depuis l'application Electron.
  base: './',
  server: {
    watch: {
      usePolling: true,
    },
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
