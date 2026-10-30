// Builds one self-contained dist-single/index.html (all JS/CSS inlined, hash routing)
// so the demo can be opened as a single file or hosted page without a server.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: { 'import.meta.env.VITE_HASH_ROUTER': JSON.stringify('1') },
  build: { outDir: 'dist-single' },
});
