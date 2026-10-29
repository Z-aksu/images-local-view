import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

test('npm-linked images-view starts from the caller current directory', async t => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'images-view-cli-'))
  const command = process.platform === 'win32' ? process.env.ComSpec : 'images-view'
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'images-view --no-open --port 0'] : ['--no-open', '--port', '0']
  const child = spawn(command, args, { cwd: rootDir, windowsHide: true })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString() })
  child.stderr.on('data', chunk => { output += chunk.toString() })
  t.after(async () => {
    if (!child.killed) {
      if (process.platform === 'win32') {
        await new Promise(resolve => {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
          killer.once('exit', resolve)
        })
      } else child.kill('SIGTERM')
    }
    await fs.rm(rootDir, { recursive: true, force: true })
  })
  const deadline = Date.now() + 10000
  while (!output.includes('访问地址') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
  assert.match(output, /访问地址\s+http:\/\/127\.0\.0\.1:\d+/)
  assert.ok(output.includes(rootDir), `CLI should use caller directory, got:\n${output}`)
})
