import { defineConfig } from 'vite';

/**
 * GitHub Pages 的站点地址是 https://<user>.github.io/vr-player/，
 * 因此生产构建需要以 /vr-player/ 作为 base。
 * 开发态（`pnpm demo`）保持 '/'，不影响本地调试。
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/vr-player/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
