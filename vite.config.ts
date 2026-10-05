import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';

function copyStaticAssets(): Plugin {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const filesToCopy = [
        'seabios.bin',
        'vgabios.bin',
        'v86.wasm',
        'libv86.js',
        'dashboard.js',
        'vm-manager.js',
        'sw.js',
        'manifest.json',
        '_headers',
        'robots.txt',
        'sitemap.xml',
        'og-image.jpg',
      ];
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;
      for (const file of filesToCopy) {
        const srcPath = path.resolve(__dirname, file);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, path.resolve(distDir, file));
        }
      }
      const srcImages = path.resolve(__dirname, 'src');
      if (fs.existsSync(srcImages)) {
        fs.cpSync(srcImages, path.resolve(distDir, 'src'), { recursive: true });
      }
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [copyStaticAssets()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            text: path.resolve(__dirname, 'text.html'),
            vmscreen: path.resolve(__dirname, 'vm-screen.html'),
          }
        }
      }
    };
});
