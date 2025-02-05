import { defineConfig } from 'vite';
import eslintPlugin from 'vite-plugin-eslint';

export default defineConfig({
    server: {
        port: 3008, // Use custom port, e.g., 3000
    },
    plugins: [eslintPlugin()],
});