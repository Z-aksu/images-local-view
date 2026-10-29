#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import open from 'open'
import { createImageApp } from '../server/app.js'
import { parseOptions } from '../server/options.js'
import { listenOnAvailablePort } from '../server/listen.js'

const HELP = `
拾光 · Images Local View

用法：images-view [选项]

  -d, --dir <目录>   图片根目录，默认使用执行命令时的当前目录
  -p, --port <端口>  指定端口；未指定时从 3220 起自动寻找可用端口
      --no-open      不自动打开浏览器
  -h, --help         显示帮助
  -v, --version      显示版本

示例：
  images-view
  images-view --dir "D:\\我的图片"
  images-view -p 4300 --no-open

服务仅监听本机。删除操作移入根目录 .images-view-trash，可在页面恢复。
`.trim()

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args)
  if (options.help) { console.log(HELP); return }
  if (options.version) { console.log('1.0.0'); return }
  const rootDir = await fs.realpath(path.resolve(options.directory))
  if (!(await fs.stat(rootDir)).isDirectory()) throw new Error('指定路径不是文件夹')
  const staticDir = fileURLToPath(new URL('../dist', import.meta.url))
  try { await fs.access(path.join(staticDir, 'index.html')) } catch { throw new Error('缺少前端构建，请在项目目录执行 npm run build') }
  const app = createImageApp({ rootDir, staticDir })
  const { server, port } = await listenOnAvailablePort(app, { port: options.port, retryOnConflict: !options.portSpecified })
  const url = `http://127.0.0.1:${port}`
  console.log(`\n  拾光 · 本地图片云盘\n\n  图片目录  ${rootDir}\n  访问地址  ${url}\n\n  按 Ctrl+C 停止服务\n`)
  if (options.open) open(url).catch(error => console.warn(`无法自动打开浏览器，请手动访问 ${url}：${error.message}`))
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref() }
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown)
  return { server, rootDir, url }
}
// npm link on Windows invokes the bin through a shim/symlink. Resolve both
// paths before deciding whether this file is being executed directly.
const invokedPath = process.argv[1] ? await fs.realpath(process.argv[1]).catch(() => null) : null
const modulePath = await fs.realpath(fileURLToPath(import.meta.url))
if (invokedPath && path.resolve(invokedPath) === path.resolve(modulePath)) {
  main().catch(error => { console.error(`启动失败：${error.code === 'EADDRINUSE' ? '指定端口已占用，请换一个端口' : error.message}`); process.exitCode = 1 })
}
