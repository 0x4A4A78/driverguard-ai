import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isHttps = process.env.HTTPS === 'true' || process.argv.includes('--https');

  return {
    plugins: [
      tailwindcss(),
      ...(isHttps ? [basicSsl()] : [])
    ],
    server: {
      host: true, // Listen on 0.0.0.0 for mobile access via local Wi-Fi
      port: 5173
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          presentation: resolve(__dirname, 'presentation.html')
        }
      }
    }
  };
});
