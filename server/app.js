import express from 'express'
import multer from 'multer'
import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomBytes, createHash } from 'node:crypto'
import { FileStore, fail, isImage, joinPath, relativePath, validateName } from './files.js'

const upload = multer({ dest: path.join(os.tmpdir(), 'images-view-uploads'), limits: { fileSize: 100 * 1024 * 1024, files: 100, fields: 1 } }).array('files', 100)
const CACHE = path.join(os.tmpdir(), 'images-view-thumbnails-v1')
const scalar = (value, fallback = '') => typeof value === 'string' ? value : fallback
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'gif', 'webp', 'avif', 'heif', 'tiff', 'svg'])

function batchValues(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 1000 || values.some(v => typeof v !== 'string')) throw fail('请选择 1–1000 个项目')
  const unique = [...new Set(values)]
  return unique.filter(value => !unique.some(parent => parent !== value && value.startsWith(parent + '/')))
}
const publicError = (error) => error.status ? error.message : ({ ENOENT: '文件或父文件夹不存在，请刷新后重试', ENOTDIR: '父路径不是文件夹', EEXIST: '已存在同名项目', EACCES: '没有访问权限', EPERM: '没有操作权限，或文件正被其他程序使用', EBUSY: '文件正在使用，请稍后重试', ENOSPC: '磁盘空间不足', EXDEV: '不能跨磁盘移动文件' }[error.code] || '操作失败，请检查本地文件或终端日志')

export function createImageApp({ rootDir, staticDir, dev = false }) {
  const app = express()
  const store = new FileStore(rootDir)
  const token = randomBytes(32).toString('hex')
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    const host = req.headers.host?.replace(/:\d+$/, '')
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return res.status(403).json({ error: '仅允许本机访问' })
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' })
    if (!req.path.startsWith('/api/')) return next()
    res.set('Cache-Control', 'no-store')
    const origin = req.get('origin')
    const ownOrigin = `${req.protocol}://${req.get('host')}`
    const devOrigin = dev && ['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)
    if (origin && origin !== ownOrigin && !devOrigin) return res.status(403).json({ error: '不允许跨站访问本地文件' })
    if (req.get('sec-fetch-site') === 'cross-site' && !devOrigin) return res.status(403).json({ error: '不允许跨站访问本地文件' })
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-images-token') !== token) return res.status(403).json({ error: '会话已更新，请刷新页面后重试' })
    next()
  })
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) && !req.path.startsWith('/upload') && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return next(fail('请求内容必须为 JSON 对象'))
    next()
  })
  app.get('/api/config', (req, res) => res.json({ name: path.basename(rootDir), root: rootDir, token, extensions: [...new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'tif', 'tiff', 'svg'])], maxUploadMB: 100 }))
  app.get('/api/files', async (req, res) => {
    const query = scalar(req.query.q).trim().slice(0, 200)
    const mode = scalar(req.query.mode)
    const result = await store.list({ directory: scalar(req.query.path), recursive: !!query || mode === 'images' || mode === 'recent', query, onlyImages: mode === 'images' || mode === 'recent' })
    if (mode === 'recent') result.items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    res.json(result)
  })
  app.get('/api/tree', async (req, res) => {
    const result = await store.list({ directory: scalar(req.query.path) })
    const folders = result.items.filter(i => i.type === 'folder')
    const items = await Promise.all(folders.map(async folder => {
      let isLeaf = true
      try { isLeaf = !(await store.hasChildFolders(folder.path)) } catch { /* The folder may change while the tree is being read. */ }
      return { ...folder, isLeaf }
    }))
    res.json({ items })
  })
  app.get('/api/file', async (req, res) => {
    const relative = scalar(req.query.path)
    if (!isImage(relative)) throw fail('只支持图片文件', 415)
    const full = await store.resolve(relative)
    if (!(await fs.stat(full)).isFile()) throw fail('不是图片文件')
    res.set({ 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=0, must-revalidate' })
    if (req.query.download === '1') res.download(full)
    else res.sendFile(full)
  })
  app.get('/api/thumbnail', async (req, res) => {
    const relative = scalar(req.query.path)
    if (!isImage(relative)) throw fail('只支持图片文件', 415)
    const full = await store.resolve(relative)
    const stat = await fs.stat(full)
    if (!stat.isFile()) throw fail('不是图片文件')
    const key = createHash('sha256').update(`${full}:${stat.mtimeMs}:${stat.size}`).digest('hex')
    const cached = path.join(CACHE, key + '.webp')
    await fs.mkdir(CACHE, { recursive: true })
    try { await fs.access(cached) } catch {
      try {
        const thumbnail = await sharp(full, { limitInputPixels: 100_000_000, animated: false }).rotate().resize(480, 360, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
        await fs.writeFile(cached, thumbnail)
      } catch { throw fail('此图片无法生成预览，可以尝试下载原图', 422) }
    }
    res.set('Cache-Control', 'private, max-age=86400')
    res.type('webp').sendFile(cached)
  })
  app.post('/api/folders', async (req, res) => res.status(201).json(await store.exclusive(() => store.createFolder(req.body.path ?? '', req.body.name))))
  app.patch('/api/rename', async (req, res) => res.json(await store.exclusive(() => store.rename(req.body.path, req.body.name))))
  async function runBatch(values, action) {
    const results = []
    for (const value of values) {
      try { results.push({ key: value, ok: true, item: await action(value) }) } catch (error) { results.push({ key: value, ok: false, error: publicError(error) }) }
    }
    return { results }
  }
  app.post('/api/move', async (req, res) => {
    const values = batchValues(req.body.paths); const destination = relativePath(req.body.destination)
    res.json(await store.exclusive(() => runBatch(values, value => store.move(value, destination))))
  })
  app.post('/api/trash', async (req, res) => {
    const values = batchValues(req.body.paths)
    res.json(await store.exclusive(() => runBatch(values, value => store.trash(value))))
  })
  app.get('/api/trash', async (req, res) => res.json(await store.listTrash()))
  app.post('/api/trash/restore', async (req, res) => {
    const values = batchValues(req.body.ids)
    res.json(await store.exclusive(() => runBatch(values, value => store.restore(value))))
  })
  app.post('/api/trash/purge', async (req, res) => {
    const values = batchValues(req.body.ids)
    res.json(await store.exclusive(() => runBatch(values, value => store.purge(value))))
  })
  app.post('/api/upload', async (req, res, next) => {
    // Validate the destination before accepting file bytes.
    try { await store.directory(scalar(req.query.path)) } catch (error) { return next(error) }
    upload(req, res, async error => {
      const files = req.files ?? []
      if (error) { await Promise.allSettled(files.map(file => fs.rm(file.path, { force: true }))); return next(error) }
      try {
        if (!files.length) throw fail('请选择图片')
        const results = await store.exclusive(async () => {
          const results = []
          for (const file of files) {
            // Multer decodes multipart headers as latin1; browsers send UTF-8 filenames.
            const name = Buffer.from(file.originalname, 'latin1').toString('utf8')
            try {
              validateName(name)
              if (!isImage(name)) throw fail('不支持此文件类型')
              let metadata
              try { metadata = await sharp(file.path, { limitInputPixels: 100_000_000 }).metadata() } catch { throw fail('文件不是有效图片或像素尺寸过大') }
              if (!SUPPORTED_FORMATS.has(metadata.format)) throw fail('不支持此图片格式')
              const expected = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.gif': 'gif', '.webp': 'webp', '.avif': 'heif', '.tif': 'tiff', '.tiff': 'tiff', '.svg': 'svg' }[path.extname(name).toLowerCase()]
              if (metadata.format !== expected && !(expected === 'heif' && metadata.format === 'avif')) throw fail('文件扩展名与图片实际格式不匹配')
              const relative = joinPath(relativePath(scalar(req.query.path)), name)
              const destination = await store.resolve(relative, { allowMissing: true })
              await fs.copyFile(file.path, destination, 1) // COPYFILE_EXCL never overwrites originals.
              results.push({ key: name, ok: true, item: await store.entry(relative) })
            } catch (error) { results.push({ key: name, ok: false, error: publicError(error) }) }
          }
          return results
        })
        res.status(201).json({ results })
      } catch (error) { next(error) } finally { await Promise.allSettled(files.map(file => fs.rm(file.path, { force: true }))) }
    })
  })
  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }))
  if (staticDir) {
    app.use(express.static(staticDir))
    app.get('/{*path}', (req, res) => res.sendFile(path.join(staticDir, 'index.html')))
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    const uploadError = error instanceof multer.MulterError
    const status = error.status || (uploadError ? 413 : error.code === 'ENOENT' ? 404 : error.code === 'EEXIST' ? 409 : ['EACCES', 'EPERM'].includes(error.code) ? 403 : 500)
    if (status >= 500) console.error(error)
    res.status(status).json({ error: uploadError ? '上传超出限制：每批最多 100 张，每张不超过 100 MB' : publicError(error) })
  })
  return app
}
