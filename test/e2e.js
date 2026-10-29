import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { createImageApp } from '../server/app.js'
import { listenOnAvailablePort } from '../server/listen.js'

const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'images-view-e2e-'))
const resultsDir = path.resolve('test-results')
await fs.mkdir(resultsDir, { recursive: true })
const examples = [
  ['旅行记录', '海边假日.svg', '#a4cbd2', '#6e9ea4', 'sea'],
  ['旅行记录', '山间日落.svg', '#dcb69c', '#786c61', 'mountain'],
  ['生活碎片', '安静午后.svg', '#ece4d2', '#aaa48c', 'interior'],
  ['', '云朵与远方.svg', '#b7cddd', '#94b3c7', 'cloud'],
  ['', '一束阳光.svg', '#e2c99d', '#a5a47f', 'interior'],
  ['', '山野来信.svg', '#aec3aa', '#71866f', 'mountain'],
]
function artwork(sky, land, type) {
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650" viewBox="0 0 900 650"><defs><linearGradient id="s" x2="0.2" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#f4efdf"/></linearGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.08"/></feComponentTransfer><feBlend in="SourceGraphic" mode="multiply"/></filter></defs><g filter="url(#n)"><rect width="900" height="650" fill="url(#s)"/>`
  const shapes = type === 'sea' ? `<path d="M0 330Q200 300 430 335T900 320V650H0" fill="${land}"/><path d="M0 490Q300 370 900 500V650H0" fill="#e6d7b9"/><path d="M0 442Q430 355 900 447" fill="none" stroke="#fff" stroke-width="5" opacity=".45"/>` : type === 'mountain' ? `<circle cx="640" cy="200" r="52" fill="#fff1cb" opacity=".8"/><path d="M0 450 240 180 470 420 690 250 900 430V650H0" fill="${land}" opacity=".65"/><path d="M0 590 220 380 470 530 660 390 900 540V650H0" fill="${land}"/>` : type === 'cloud' ? `<g fill="#fff" opacity=".7"><ellipse cx="320" cy="290" rx="160" ry="67"/><ellipse cx="220" cy="320" rx="125" ry="42"/><ellipse cx="610" cy="400" rx="160" ry="57"/></g>` : `<rect x="430" y="70" width="330" height="400" rx="3" fill="#f5efd8" opacity=".65"/><path d="M595 70V470M430 270H760" stroke="#fff" stroke-width="8" opacity=".6"/><path d="M0 510H900V650H0" fill="${land}" opacity=".7"/><path d="m230 650 200-180h330l140 180" fill="#fff5da" opacity=".3"/><path d="M250 510v-80q-100-130-60-180 100 60 80 180 40-150 110-170 20 110-110 190v60" fill="${land}"/>`
  return base + shapes + '</g></svg>'
}
for (const [folder, name, sky, land, type] of examples) { await fs.mkdir(path.join(rootDir, folder), { recursive: true }); await fs.writeFile(path.join(rootDir, folder, name), artwork(sky, land, type)) }
await fs.mkdir(path.join(rootDir, '灵感收藏/设计参考'), { recursive: true })
await fs.mkdir(path.join(rootDir, '2026 年度精选'))
const { server, port } = await listenOnAvailablePort(createImageApp({ rootDir, staticDir: path.resolve('dist') }), { port: 0 })
const errors = []
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()) })
  await page.goto(`http://127.0.0.1:${port}`)
  await page.locator('.panel-footer').waitFor()
  await page.locator('.heading-actions button').filter({ hasText: '新建文件夹' }).first().click()
  await page.getByPlaceholder('请输入文件夹名称').fill('测试相册')
  await page.getByRole('button', { name: '确 定', exact: true }).click()
  await page.getByRole('button', { name: '测试相册', exact: true }).waitFor()
  assert.ok((await fs.stat(path.join(rootDir, '测试相册'))).isDirectory())
  await page.getByRole('button', { name: '测试相册', exact: true }).click()
  await page.getByText('这里，等待美好发生', { exact: true }).waitFor()
  await page.locator('.heading-actions button').filter({ hasText: '新建文件夹' }).first().click()
  await page.getByPlaceholder('请输入文件夹名称').fill('二级目录')
  await page.getByRole('button', { name: '确 定', exact: true }).click()
  await page.getByRole('button', { name: '二级目录', exact: true }).waitFor()
  const png = await sharp({ create: { width: 160, height: 120, channels: 3, background: '#8ab3cd' } }).png().toBuffer()
  await page.locator('.drive-shell').dispatchEvent('contextmenu')
  await page.evaluate(bytes => {
    const target = document.querySelector('.clipboard-paste-target')
    const file = new File([new Uint8Array(bytes)], '中文上传.png', { type: 'image/png' })
    const data = new DataTransfer()
    data.items.add(file)
    target.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  }, [...png])
  await page.getByText('上传任务已结束', { exact: false }).waitFor()
  await page.locator('.ant-drawer .ant-drawer-close').click()
  const pastedName = (await fs.readdir(path.join(rootDir, '测试相册')))[0]
  assert.match(pastedName, /^\d+-\d+\.png$/)
  await page.getByRole('button', { name: pastedName, exact: true }).waitFor()
  assert.deepEqual(await fs.readFile(path.join(rootDir, '测试相册', pastedName)), png)
  await page.getByRole('button', { name: `重命名 ${pastedName}`, exact: true }).click()
  await page.getByPlaceholder('请输入名称').fill('重命名图片.png')
  await page.getByRole('button', { name: '确 定', exact: true }).click()
  await page.getByRole('button', { name: '重命名图片.png', exact: true }).waitFor()
  await page.getByRole('button', { name: '重命名图片.png', exact: true }).click()
  await page.getByRole('button', { name: '关闭预览', exact: true }).waitFor()
  await page.getByRole('button', { name: '旋转', exact: true }).click()
  await page.getByRole('button', { name: '放大', exact: true }).click()
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  await page.getByRole('button', { name: '移动 重命名图片.png', exact: true }).click()
  await page.locator('.destination-list button').filter({ hasText: '生活碎片' }).click()
  await page.getByRole('button', { name: '移动到此文件夹', exact: true }).click()
  await page.getByRole('button', { name: '重命名图片.png', exact: true }).waitFor({ state: 'hidden' })
  assert.deepEqual(await fs.readFile(path.join(rootDir, '生活碎片/重命名图片.png')), png)
  await page.getByPlaceholder('搜索当前目录及子目录').fill('二级目录')
  await page.getByPlaceholder('搜索当前目录及子目录').press('Enter')
  await page.getByRole('button', { name: '二级目录', exact: true }).waitFor()
  await page.locator('.main-nav button').filter({ hasText: '全部文件' }).click()
  await page.getByRole('button', { name: '删除 测试相册', exact: true }).click()
  await page.getByRole('button', { name: '移入回收站', exact: true }).click()
  await page.getByRole('button', { name: '测试相册', exact: true }).waitFor({ state: 'hidden' })
  await page.locator('.trash-nav').click()
  await page.getByRole('button', { name: '恢复 测试相册', exact: true }).click()
  await page.getByText('回收站是空的', { exact: true }).waitFor()
  assert.ok((await fs.stat(path.join(rootDir, '测试相册/二级目录'))).isDirectory())
  await fs.rm(path.join(rootDir, '测试相册'), { recursive: true })
  await fs.rm(path.join(rootDir, '生活碎片/重命名图片.png'))
  await page.locator('.main-nav button').filter({ hasText: '全部文件' }).click()
  await page.getByRole('button', { name: '云朵与远方.svg', exact: true }).waitFor()
  await page.screenshot({ path: path.join(resultsDir, 'drive-list.png'), fullPage: true })
  await page.locator('.view-toggle .ant-radio-button-wrapper').first().click()
  await page.locator('.image-grid img').first().waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('.image-grid img')].every(img => img.complete && img.naturalWidth > 0))
  await page.screenshot({ path: path.join(resultsDir, 'drive-grid.png'), fullPage: true })
  await page.locator('.main-nav button').filter({ hasText: '全部图片' }).click()
  await page.getByRole('button', { name: '预览 海边假日.svg', exact: true }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('.image-grid img')].every(img => img.complete && img.naturalWidth > 0))
  await page.screenshot({ path: path.join(resultsDir, 'all-images.png'), fullPage: true })
  await page.getByRole('checkbox', { name: '选择 海边假日.svg', exact: true }).check()
  await page.getByText('已选择', { exact: false }).waitFor()
  await page.getByRole('button', { name: '取消选择', exact: true }).click()
  await page.getByRole('button', { name: '预览 海边假日.svg', exact: true }).click()
  await page.getByRole('button', { name: '下一张', exact: true }).click()
  await page.getByRole('button', { name: '关闭预览', exact: true }).click()
  await page.locator('.image-preview').waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(resultsDir, 'drive-mobile.png'), fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Mobile layout must not overflow horizontally')
  assert.deepEqual(errors, [], 'Browser must not report runtime errors')
  console.log('PASS: create nested folders, upload, rename, preview, move, recursive search, trash, restore, list/grid, selection, mobile. No browser errors.')
  console.log(`Screenshots: ${resultsDir}`)
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(rootDir, { recursive: true, force: true })
}
