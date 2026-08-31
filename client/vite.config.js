import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:5000',
      '/student': 'http://localhost:5000',
      '/opportunities': 'http://localhost:5000',
      '/applications': 'http://localhost:5000'
    }
  }
});
