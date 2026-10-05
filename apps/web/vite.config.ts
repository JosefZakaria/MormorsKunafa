import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'landing-settings-preload',
      // Inject after Vite processes HTML so this stays separate from the app bundle.
      transformIndexHtml: {
        order: 'post',
        handler(_html, context) {
          const preload = Object.values(context.bundle ?? {}).find(
            (output) => output.type === 'chunk' && output.name === 'preloadLanding'
          );
          if (!context.server && !preload) throw new Error('Landing preload entry is missing');
          return [{
            tag: 'script',
            attrs: {
              type: 'module',
              async: true,
              src: context.server ? '/src/preloadLanding.ts' : `/${preload!.fileName}`,
            },
            injectTo: 'head-prepend',
          }];
        },
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        preloadLanding: path.resolve(__dirname, 'src/preloadLanding.ts'),
      },
    },
  },
  envDir: __dirname,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../shared')
    }
  }
})

