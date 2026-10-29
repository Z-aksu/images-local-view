import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import sharp from 'sharp'
import { createImageApp } from '../server/app.js'
import { listenOnAvailablePort } from '../server/listen.js'
import { parseOptions } from '../server/options.js'
import { FileStore, validateName, relativePath } from '../server/files.js'

async function fixture(t) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'images-view-test-'))
  const app = createImageApp({ rootDir })
  const { server, port } = await listenOnAvailablePort(app, { port: 0 })
  const base = `http://127.0.0.1:${port}`
  const config = await (await fetch(base + '/api/config')).json()
  const request = async (url, body, method = 'POST', extra = {}) => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Images-Token': config.token, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, data: await response.json(), headers: response.headers }
  }
  const get = async url => { const response = await fetch(base + url); return { status: response.status, data: await response.json() } }
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#1677ff' } }).png().toBuffer()
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(rootDir, { recursive: true, force: true }) })
  return { rootDir, base, request, get, png, token: config.token }
}

test('CLI parsing uses cwd by default and accepts directory and ports', () => {
  assert.equal(parseOptions([]).directory, '.')
  assert.deepEqual(parseOptions(['--dir', 'D:\我的 图片', '--port=4300', '--no-open']).directory, 'D:\我的 图片')
  assert.equal(parseOptions(['-p', '0']).port, 0)
  assert.equal(parseOptions(['--no-open']).open, false)
  for (const args of [['--port', 'abc'], ['--port', '65536'], ['--dir'], ['--unknown']]) assert.throws(() => parseOptions(args))
})
test('reject traversal, Windows special paths, reserved and ambiguous names', () => {
  for (const value of ['../outside', 'a/../../b', 'C:/Windows', 'a\b', '.images-view-trash/x', '.git/config', 'dir:stream', 'folder/.. /outside', 'folder/.images-view-trash./x']) assert.throws(() => relativePath(value), value)
  for (const value of ['CON', 'nul.txt', '.album', 'x/y', 'x' + String.fromCharCode(92) + 'y', 'x:', 'x.', 'x ', '', '..']) assert.throws(() => validateName(value), value)
  assert.equal(relativePath('风景/秋天 2026'), '风景/秋天 2026')
})
test('create, browse, rename and recursively search Chinese nested folders', async t => {
  const { request, get, rootDir, png } = await fixture(t)
  assert.equal((await request('/api/folders', { path: '', name: '旅行' })).status, 201)
  assert.equal((await request('/api/folders', { path: '旅行', name: '秋天' })).status, 201)
  await fs.writeFile(path.join(rootDir, '旅行/秋天/山间.png'), png)
  await fs.writeFile(path.join(rootDir, '说明.txt'), 'hidden from image drive')
  assert.equal((await get('/api/files')).data.items.length, 1)
  assert.equal((await get('/api/tree?path=' + encodeURIComponent('旅行'))).data.items[0].name, '秋天')
  const search = await get('/api/files?q=' + encodeURIComponent('山间'))
  assert.equal(search.data.items[0].path, '旅行/秋天/山间.png')
  assert.equal((await get('/api/files?mode=images')).data.items.length, 1)
  assert.equal((await request('/api/rename', { path: '旅行/秋天', name: '秋日' }, 'PATCH')).data.path, '旅行/秋日')
  assert.equal((await request('/api/folders', { name: '旅行' })).status, 409)
})
test('validates uploads, keeps original filename, never overwrites, and serves images and thumbnails', async t => {
  const { base, token, rootDir, png } = await fixture(t)
  async function upload(name, content, directory = '') {
    const form = new FormData(); form.append('files', new Blob([content]), name)
    const response = await fetch(`${base}/api/upload?path=${encodeURIComponent(directory)}`, { method: 'POST', headers: { 'X-Images-Token': token }, body: form })
    return { status: response.status, data: await response.json() }
  }
  const result = await upload('落日 #1.png', png)
  assert.equal(result.data.results[0].ok, true)
  assert.equal(result.data.results[0].item.name, '落日 #1.png')
  assert.deepEqual(await fs.readFile(path.join(rootDir, '落日 #1.png')), png)
  assert.equal((await upload('落日 #1.png', png)).data.results[0].ok, false)
  assert.equal((await upload('fake.png', 'not an image')).data.results[0].ok, false)
  assert.equal((await upload('image.txt', png)).data.results[0].ok, false)
  assert.equal((await upload('wrong.jpg', png)).data.results[0].ok, false)
  assert.equal((await upload('photo.png', png, '../outside')).status, 403)
  const image = await fetch(base + '/api/file?path=' + encodeURIComponent('落日 #1.png'))
  assert.equal(image.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
  const thumbnail = await fetch(base + '/api/thumbnail?path=' + encodeURIComponent('落日 #1.png'))
  assert.equal(thumbnail.status, 200); assert.equal(thumbnail.headers.get('content-type'), 'image/webp')
  assert.equal((await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata()).width, 80)
  const download = await fetch(base + '/api/file?download=1&path=' + encodeURIComponent('落日 #1.png'))
  assert.match(download.headers.get('content-disposition'), /^attachment;/)
})
test('moves, rejects conflicts and descendant destinations, recycles and restores nested folders', async t => {
  const { request, rootDir, get, png } = await fixture(t)
  await fs.mkdir(path.join(rootDir, 'a/sub'), { recursive: true }); await fs.mkdir(path.join(rootDir, 'b'))
  await fs.writeFile(path.join(rootDir, 'a/sub/pic.png'), png)
  const invalid = await request('/api/move', { paths: ['a'], destination: 'a/sub' })
  assert.equal(invalid.data.results[0].ok, false)
  const move = await request('/api/move', { paths: ['a/sub/pic.png'], destination: 'b' })
  assert.equal(move.data.results[0].item.path, 'b/pic.png')
  await fs.writeFile(path.join(rootDir, 'a/pic.png'), png)
  assert.equal((await request('/api/move', { paths: ['a/pic.png'], destination: 'b' })).data.results[0].ok, false)
  const recycled = await request('/api/trash', { paths: ['b', 'b/pic.png'] })
  assert.equal(recycled.data.results.length, 1)
  assert.equal((await get('/api/trash')).data.items.length, 1)
  await assert.rejects(fs.access(path.join(rootDir, 'b')))
  const id = recycled.data.results[0].item.id
  assert.equal((await request('/api/trash/restore', { ids: [id] })).data.results[0].ok, true)
  assert.deepEqual(await fs.readFile(path.join(rootDir, 'b/pic.png')), png)
  assert.equal((await get('/api/trash')).data.items.length, 0)
  const second = await request('/api/trash', { paths: ['a'] })
  const purged = await request('/api/trash/purge', { ids: [second.data.results[0].item.id] })
  assert.equal(purged.data.results[0].ok, true)
  assert.equal((await get('/api/trash')).data.items.length, 0)
})
test('restoration conflicts preserve recycled content; invalid bulk requests are rejected', async t => {
  const { request, get, rootDir, png } = await fixture(t)
  await fs.writeFile(path.join(rootDir, 'a.png'), png)
  const recycled = await request('/api/trash', { paths: ['a.png'] })
  await fs.writeFile(path.join(rootDir, 'a.png'), 'new content')
  assert.equal((await request('/api/trash/restore', { ids: [recycled.data.results[0].item.id] })).data.results[0].ok, false)
  assert.equal((await get('/api/trash')).data.items.length, 1)
  assert.equal((await request('/api/trash', { paths: [] })).status, 400)
  assert.equal((await request('/api/trash', { paths: 'a.png' })).status, 400)
  assert.equal((await request('/api/trash/purge', { ids: ['../../outside'] })).data.results[0].ok, false)
})
test('blocks outside paths, symbolic links, CSRF, hostile origins and DNS rebinding', async t => {
  const { rootDir, base, request, get } = await fixture(t)
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'images-outside-'))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  await fs.writeFile(path.join(outside, 'secret.png'), 'secret')
  await fs.symlink(outside, path.join(rootDir, 'external'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await get('/api/files?path=external')).status, 403)
  assert.equal((await get('/api/files?mode=images')).data.items.length, 0)
  assert.equal((await get('/api/file?path=../secret.png')).status, 403)
  const noToken = await fetch(base + '/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"bad"}' })
  assert.equal(noToken.status, 403)
  assert.equal((await request('/api/folders', { name: 'bad' }, 'POST', { Origin: 'https://evil.example' })).status, 403)
  const hostileHostStatus = await new Promise((resolve, reject) => {
    http.get(base + '/api/config', { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode) }).on('error', reject)
  })
  assert.equal(hostileHostStatus, 403)
  assert.equal((await fetch(base + '/api/config', { headers: { Origin: 'https://evil.example' } })).status, 403)
})
test('simultaneous mutations do not overwrite a conflicting name', async t => {
  const { request, rootDir } = await fixture(t)
  const results = await Promise.all(Array.from({ length: 5 }, () => request('/api/folders', { name: '同名目录' })))
  assert.equal(results.filter(result => result.status === 201).length, 1)
  assert.equal((await fs.readdir(rootDir)).length, 1)
})
test('port fallback selects another port and explicit port collision fails', async t => {
  const app = createImageApp({ rootDir: os.tmpdir() })
  const first = await listenOnAvailablePort(app, { port: 0 })
  const second = await listenOnAvailablePort(app, { port: first.port })
  t.after(async () => { for (const item of [first, second]) await new Promise(resolve => item.server.close(resolve)) })
  assert.notEqual(second.port, first.port)
  await assert.rejects(listenOnAvailablePort(app, { port: first.port, retryOnConflict: false }), { code: 'EADDRINUSE' })
})
