import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setToken, uploadImage } from '../lib/api'

export const useDriveStore = defineStore('drive', () => {
  const config = ref(null), items = ref([]), loading = ref(false), error = ref(''), warnings = ref([]), truncated = ref(false)
  const selection = ref([]), uploads = ref([]), uploading = ref(false), uploadOpen = ref(false)
  const layout = ref(readPreference('images-view-layout', 'list'))
  const sort = ref('name-asc')
  let requestId = 0
  function readPreference(key, fallback) { try { return localStorage.getItem(key) || fallback } catch { return fallback } }
  function setLayout(value) { layout.value = value; try { localStorage.setItem('images-view-layout', value) } catch { /* Storage may be disabled. */ } }
  async function initialize() { config.value = await api('/config'); setToken(config.value.token) }
  async function load({ path = '', mode = 'all', q = '' }) {
    const current = ++requestId
    // Keep the current rows visible while the next directory/view is loading.
    // Clearing items first makes the table unmount and remount on every route
    // change, which is especially noticeable with a fast local API.
    loading.value = true; error.value = ''; selection.value = []
    try {
      if (!config.value) await initialize()
      const params = new URLSearchParams({ path, mode, q })
      const data = await api(mode === 'trash' ? '/trash' : `/files?${params}`)
      if (current !== requestId) return
      items.value = data.items; warnings.value = data.warnings || []; truncated.value = !!data.truncated
      if (mode === 'recent') sort.value = 'date-desc'
    } catch (err) { if (current === requestId) { error.value = err.message; items.value = [] } }
    finally { if (current === requestId) loading.value = false }
  }
  const sortedItems = computed(() => {
    const [field, direction] = sort.value.split('-'); const multiplier = direction === 'desc' ? -1 : 1
    return [...items.value].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      if (field === 'size') return ((a.size || 0) - (b.size || 0)) * multiplier
      if (field === 'date') return (a.deletedAt || a.modifiedAt).localeCompare(b.deletedAt || b.modifiedAt) * multiplier
      return a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) * multiplier
    })
  })
  async function uploadFiles(files, directory) {
    if (uploading.value) throw new Error('上一批图片仍在上传，请等待完成')
    if (files.length > 100) throw new Error('每批最多上传 100 张图片')
    const allowed = new Set(config.value.extensions)
    const invalid = files.find(file => !allowed.has(file.name.split('.').pop().toLowerCase()) || file.size > config.value.maxUploadMB * 1024 * 1024)
    if (invalid) throw new Error(`${invalid.name}：只支持图片，每张不超过 ${config.value.maxUploadMB} MB`)
    uploadOpen.value = true; uploading.value = true
    const jobs = files.map((file, index) => ({ id: `${Date.now()}-${index}`, name: file.name, directory, progress: 0, status: 'waiting', error: '' }))
    uploads.value = jobs
    let next = 0
    const worker = async () => {
      while (next < files.length) {
        const index = next++; const job = uploads.value[index]
        job.status = 'uploading'
        try { await uploadImage(files[index], directory, value => { job.progress = value }); job.status = 'done'; job.progress = 100 }
        catch (err) { job.status = 'error'; job.error = err.message }
      }
    }
    try { await Promise.all(Array.from({ length: Math.min(files.length, 3) }, worker)) } finally { uploading.value = false }
    return uploads.value.filter(job => job.status === 'done').length
  }
  return { config, items, loading, error, warnings, truncated, selection, uploads, uploading, uploadOpen, layout, sort, sortedItems, setLayout, initialize, load, uploadFiles }
})
