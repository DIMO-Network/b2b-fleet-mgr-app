import { defineConfig } from 'vite';
import eslintPlugin from 'vite-plugin-eslint';
import { resolve } from 'path';
import mkcert from 'vite-plugin-mkcert';
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import {viteStaticCopy} from "vite-plugin-static-copy";

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
            // Define app entry points (only main is used now)
            input: {
                main: resolve(__dirname, 'index.html'),
                login: resolve(__dirname, 'login.html')
            }
        }
    },
    plugins: [
        mkcert({
            keyPath: 'key.pem',
            certFileName: 'cert.pem',
            savePath: path.resolve(process.cwd(), '.mkcert')
        }),
        tsconfigPaths(),
        eslintPlugin(),
        viteStaticCopy({
            targets: [
                {
                    src: 'src/assets/*',
                    dest: 'assets'
                }
            ]
        }),
    ],
});