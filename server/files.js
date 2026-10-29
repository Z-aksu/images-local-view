import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const TRASH = '.images-view-trash'
export const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.tif', '.tiff', '.svg'])
const RESERVED = new Set([TRASH, '.git', 'node_modules'])
export const isImage = (name) => EXTENSIONS.has(path.extname(name).toLowerCase())
export function fail(message, status = 400) { return Object.assign(new Error(message), { status }) }
export function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 180 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || name.startsWith('.') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) || RESERVED.has(name.toLowerCase())) throw fail('名称无效：不能包含路径或 Windows 保留字符，也不能以点、空格结尾')
  return name
}
export function relativePath(value = '') {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('\0') || path.isAbsolute(value) || /^[a-z]:/i.test(value)) throw fail('路径无效')
  const parts = value.split('/').filter(Boolean)
  if (parts.some(p => p === '..' || p === '.' || RESERVED.has(p.toLowerCase()) || /[:\x00-\x1f]/.test(p))) throw fail('不能访问根目录以外或系统保留目录', 403)
  for (const part of parts) validateName(part)
  return parts.join('/')
}
export function joinPath(parent, name) { return parent ? `${parent}/${name}` : name }
export class FileStore {
  constructor(root) { this.root = root; this.queue = Promise.resolve() }
  async exclusive(fn) {
    const next = this.queue.then(fn)
    this.queue = next.catch(() => {})
    return next
  }
  async resolve(value = '', { allowMissing = false } = {}) {
    const relative = relativePath(value)
    let current = this.root
    const parts = relative.split('/').filter(Boolean)
    for (let i = 0; i < parts.length; i++) {
      current = path.join(current, parts[i])
      try {
        const stat = await fs.lstat(current)
        if (stat.isSymbolicLink()) throw fail('为保护本地文件，不支持符号链接或目录联接', 403)
        if (i < parts.length - 1 && !stat.isDirectory()) throw fail('父路径不是文件夹')
      } catch (error) {
        if (allowMissing && error.code === 'ENOENT' && i === parts.length - 1) return current
        throw error
      }
    }
    return current
  }
  async directory(value = '') {
    const full = await this.resolve(value)
    if (!(await fs.stat(full)).isDirectory()) throw fail('路径不是文件夹')
    return full
  }
  async hasChildFolders(directory = '') {
    const full = await this.directory(directory)
    const children = await fs.readdir(full, { withFileTypes: true })
    return children.some(child => child.isDirectory() && !child.isSymbolicLink() && !child.name.startsWith('.') && !RESERVED.has(child.name.toLowerCase()))
  }
  async entry(relative) {
    const full = await this.resolve(relative)
    const info = await fs.stat(full)
    return { path: relative, name: path.basename(full), type: info.isDirectory() ? 'folder' : 'image', size: info.isDirectory() ? null : info.size, modifiedAt: info.mtime.toISOString(), extension: path.extname(full).slice(1).toUpperCase(), parent: relative.split('/').slice(0, -1).join('/') }
  }
  async list({ directory = '', recursive = false, query = '', onlyImages = false, limit = 20000 } = {}) {
    directory = relativePath(directory)
    await this.directory(directory)
    const items = []; const warnings = []; const pending = [directory]
    let scanned = 0; let truncated = false
    while (pending.length && !truncated) {
      const dir = pending.pop()
      let children
      try { children = await fs.readdir(await this.directory(dir), { withFileTypes: true }) } catch (error) { warnings.push({ path: dir, message: error.code === 'EACCES' || error.code === 'EPERM' ? '没有读取权限' : '目录已变化或无法读取' }); continue }
      for (const child of children) {
        if (child.name.startsWith('.') || RESERVED.has(child.name.toLowerCase()) || child.isSymbolicLink()) continue
        if (!child.isDirectory() && !isImage(child.name)) continue
        const relative = joinPath(dir, child.name)
        if (recursive && child.isDirectory()) pending.push(relative)
        scanned++
        if ((onlyImages && child.isDirectory()) || (query && !child.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) continue
        try { items.push(await this.entry(relative)) } catch (error) { warnings.push({ path: relative, message: '项目已变化、无法读取或为目录联接' }) }
        if (items.length >= limit) { truncated = true; break }
      }
    }
    items.sort((a, b) => (a.type === 'folder' ? 0 : 1) - (b.type === 'folder' ? 0 : 1) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
    return { items, warnings, truncated, scanned }
  }
  async noConflict(full) {
    try { await fs.lstat(full) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    throw fail('已存在同名文件或文件夹，请使用其他名称', 409)
  }
  async createFolder(parent, name) {
    validateName(name); parent = relativePath(parent)
    await this.directory(parent)
    const target = joinPath(parent, name)
    const full = await this.resolve(target, { allowMissing: true })
    await fs.mkdir(full)
    return this.entry(target)
  }
  async rename(relative, name) {
    validateName(name); relative = relativePath(relative)
    if (!relative) throw fail('不能重命名根目录')
    const source = await this.resolve(relative)
    const target = joinPath(relative.split('/').slice(0, -1).join('/'), name)
    if (relative === target) return this.entry(relative)
    if (!(await fs.stat(source)).isDirectory() && !isImage(name)) throw fail('图片必须保留支持的图片扩展名')
    const destination = await this.resolve(target, { allowMissing: true })
    await this.noConflict(destination)
    await fs.rename(source, destination)
    return this.entry(target)
  }
  async move(relative, destination) {
    relative = relativePath(relative); destination = relativePath(destination)
    if (!relative) throw fail('不能移动根目录')
    if (destination === relative || destination.startsWith(relative + '/')) throw fail('不能移动到自身或自己的子目录')
    const source = await this.resolve(relative)
    await this.directory(destination)
    const target = joinPath(destination, path.basename(source))
    if (target === relative) throw fail('项目已在目标文件夹中')
    const full = await this.resolve(target, { allowMissing: true })
    await this.noConflict(full)
    await fs.rename(source, full)
    return this.entry(target)
  }
  async trashRoot(create = false) {
    const full = path.join(this.root, TRASH)
    if (create) await fs.mkdir(full, { recursive: true })
    const stat = await fs.lstat(full)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail('回收站目录无效', 403)
    return full
  }
  async trash(relative) {
    relative = relativePath(relative)
    if (!relative) throw fail('不能删除根目录')
    const source = await this.resolve(relative)
    const info = await this.entry(relative)
    const root = await this.trashRoot(true)
    const id = randomUUID(); const container = path.join(root, id)
    await fs.mkdir(container)
    const record = { ...info, id, originalPath: relative, deletedAt: new Date().toISOString() }
    try {
      await fs.writeFile(path.join(container, 'record.json'), JSON.stringify(record), { flag: 'wx' })
      await fs.rename(source, path.join(container, 'content'))
    } catch (error) { await fs.rm(container, { recursive: true, force: true }); throw error }
    return record
  }
  async trashContainer(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw fail('无效的回收站记录')
    const full = path.join(await this.trashRoot(), id)
    const stat = await fs.lstat(full)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('无效的回收站记录', 403)
    return full
  }
  async listTrash() {
    let root
    try { root = await this.trashRoot() } catch (error) { if (error.code === 'ENOENT') return { items: [] }; throw error }
    const items = []
    for (const child of await fs.readdir(root, { withFileTypes: true })) {
      if (!child.isDirectory() || child.isSymbolicLink()) continue
      try {
        const container = await this.trashContainer(child.name)
        await fs.lstat(path.join(container, 'content'))
        const record = JSON.parse(await fs.readFile(path.join(container, 'record.json'), 'utf8'))
        items.push({ ...record, id: child.name })
      } catch { /* An incomplete record must never enable access to another path. */ }
    }
    return { items: items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)) }
  }
  async restore(id) {
    const container = await this.trashContainer(id)
    const record = JSON.parse(await fs.readFile(path.join(container, 'record.json'), 'utf8'))
    const relative = relativePath(record.originalPath)
    if (!relative) throw fail('原始路径无效')
    const destination = await this.resolve(relative, { allowMissing: true })
    await this.noConflict(destination)
    const source = path.join(container, 'content')
    if ((await fs.lstat(source)).isSymbolicLink()) throw fail('不能恢复符号链接', 403)
    await fs.rename(source, destination)
    await fs.rm(container, { recursive: true, force: true })
    return this.entry(relative)
  }
  async purge(id) { await fs.rm(await this.trashContainer(id), { recursive: true, force: true }); return { id } }
}
