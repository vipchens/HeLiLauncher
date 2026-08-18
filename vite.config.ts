import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// Electron 开发环境配置
// base 设置为相对路径，确保 Electron 生产环境（file://协议）能正确加载资源
export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  // 生产构建输出到 dist/，Electron 主进程通过 loadFile 加载
  build: {
    target: 'es2021',
    outDir: 'dist',
    // 生产关闭 sourcemap，避免带大体积 .map 文件（直接让 app.asar 减 10~30MB）
    sourcemap: false,
    // terser 比 esbuild 默认压缩更小（drop console 再省一点）
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    // Electron 不需要代码分割，生成单个文件更简单
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    // 避免单 chunk 大了输出告警（不影响产物）
    chunkSizeWarningLimit: 5000,
  },
})
