import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import renderer from 'vite-plugin-electron-renderer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEV_SERVER_HOST = '127.0.0.1'
const DEFAULT_DEV_SERVER_PORT = 5173

const parsePort = (value: string | undefined): number | undefined => {
  if (!value) return
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return
  return port
}

const canListen = async (host: string, port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()

    let settled = false
    const done = (result: boolean) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    server.once('error', () => done(false))
    server.listen({ host, port }, () => server.close(() => done(true)))
  })
}

const resolveDevServerPort = async (): Promise<number> => {
  const fromEnv = parsePort(process.env.VITE_PORT) ?? parsePort(process.env.PORT)
  if (fromEnv) return fromEnv

  const candidates = [
    ...Array.from({ length: 10 }, (_value, index) => DEFAULT_DEV_SERVER_PORT + index),
    3000,
    3001,
  ]
  for (const port of candidates) {
    if (await canListen(DEV_SERVER_HOST, port)) return port
  }
  return DEFAULT_DEV_SERVER_PORT
}

export default defineConfig(async ({ command }) => {
  const devServerPort = command === 'serve' ? await resolveDevServerPort() : undefined

  return {
    plugins: [
      react(),
      electron({
        main: {
          entry: 'src/main/index.ts',
          onstart({ startup }) {
            const env = { ...process.env }
            delete env.ELECTRON_RUN_AS_NODE
            return startup(undefined, { env })
          },
          vite: {
            resolve: {
              alias: {
                '@shared': path.resolve(__dirname, 'src/shared'),
              },
            },
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                output: {
                  format: 'esm',
                  entryFileNames: 'main.mjs',
                },
              },
            },
          },
        },
        preload: {
          input: {
            index: path.join(__dirname, 'src/preload/index.ts'),
          },
          vite: {
            resolve: {
              alias: {
                '@shared': path.resolve(__dirname, 'src/shared'),
              },
            },
            build: {
              outDir: 'dist-electron',
              rollupOptions: {
                output: {
                  format: 'cjs',
                  entryFileNames: 'preload.cjs',
                },
              },
            },
          },
        },
      }),
      renderer(),
    ],
    resolve: {
      alias: {
        '@renderer': path.resolve(__dirname, 'src/renderer'),
        '@main': path.resolve(__dirname, 'src/main'),
        '@preload': path.resolve(__dirname, 'src/preload'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    server: {
      host: DEV_SERVER_HOST,
      port: devServerPort,
    },
  }
})
