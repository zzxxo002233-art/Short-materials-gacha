import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 关键：配置正确的 base 路径
  base: '/Short-materials-gacha/',
  build: {
    outDir: 'dist',
  },
});
