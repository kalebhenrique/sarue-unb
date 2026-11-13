import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  const isStore = mode === 'store';

  return {
    define: {
      'import.meta.env.VITE_TARGET_STORE': JSON.stringify(
        isStore ? 'microsoft' : (process.env.VITE_TARGET_STORE || '')
      ),
    },
    plugins: [react(), tailwindcss()],
    // Pacotes Tauri pré-empacotados no startup: o primeiro import deles acontece
    // dentro de um import() dinâmico no clique de login (bindings), e a descoberta
    // tardia do vite derruba o módulo no WKWebView ("Importing a module script failed").
    optimizeDeps: {
      include: [
        '@tauri-apps/api',
        '@tauri-apps/api/core',
        '@tauri-apps/api/image',
        '@tauri-apps/plugin-stronghold',
        '@tauri-apps/plugin-sql',
        '@tauri-apps/plugin-notification',
        '@tauri-apps/plugin-window-state',
      ],
    },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || '127.0.0.1',
      hmr: {
        protocol: 'ws',
        host: host || '127.0.0.1',
        port: 1421,
      },
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
