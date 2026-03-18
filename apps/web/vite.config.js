import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pageIndex: resolve(__dirname, 'pages/index.html'),
        app: resolve(__dirname, 'pages/app.html'),
        signin: resolve(__dirname, 'pages/signin.html'),
        signup: resolve(__dirname, 'pages/signup.html'),
        resetPassword: resolve(__dirname, 'pages/reset-password.html'),
        forgotPassword: resolve(__dirname, 'pages/forgot-password.html')
      }
    }
  }
});
