import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      minify: true,
    },
  ],
  platform: 'browser',
  treeshake: true,
  // 零运行时依赖，无需外部依赖
});
