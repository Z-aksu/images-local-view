import path from 'node:path'
import fs from 'node:fs/promises'
import { createServer } from 'vite'
import { createImageApp } from '../server/app.js'
import { listenOnAvailablePort } from '../server/listen.js'

const rootDir = await fs.realpath(path.resolve(process.env.IMAGES_VIEW_DIR || '.'))
const { server } = await listenOnAvailablePort(createImageApp({ rootDir, dev: true }), { port: 3220, retryOnConflict: false })
const vite = await createServer()
await vite.listen()
vite.printUrls()
console.log(`图片根目录：${rootDir}（可通过 IMAGES_VIEW_DIR 环境变量修改）`)
const close = async () => { await vite.close(); server.close(() => process.exit(0)) }
process.once('SIGINT', close); process.once('SIGTERM', close)
