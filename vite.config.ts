import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: '/',
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Allows configuring the backend URL via environment variable, defaults to localhost
      'process.env.SCRAPER_API_URL': JSON.stringify(env.SCRAPER_API_URL || 'http://localhost:5000')
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    }
  };
});