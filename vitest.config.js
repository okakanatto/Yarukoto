import { defineConfig } from 'vitest/config';
import { transformWithEsbuild } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [{
    name: 'yarukoto-jsx-in-js',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.replace(/\\/g, '/');
      if (!file.includes('/node_modules/') && /\/(components|app)\/.*\.js$/.test(file)) {
        return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
      }
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/__helpers__/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    testTimeout: 10000,
  },
});
