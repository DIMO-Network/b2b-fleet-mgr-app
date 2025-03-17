import { defineConfig } from 'vite';
import eslintPlugin from 'vite-plugin-eslint';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
    server: {
        port: 3008, // Use custom port, e.g., 3000
        host: 'localdev.dimo.org',
        https: true,
    },
    resolve: {
        alias: {
            // When code asks for the Node built-in "events",
            // it will resolve to the npm "events" package.
            events: 'events'
        }
    },
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            // Define multiple entry points
            input: {
                main: resolve(__dirname, 'index.html'),
                app: resolve(__dirname, 'app.html')
            }
        }
    },
    plugins: [
        mkcert(),
        eslintPlugin(),
        viteStaticCopy({
            targets: [
                {
                    src: 'login.html', // source files or folder
                    dest: './'        // destination folder in the dist folder
                },
            ],
        }),
    ],
});