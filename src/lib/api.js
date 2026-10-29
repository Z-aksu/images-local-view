let sessionToken = ''
export function setToken(token) { sessionToken = token }
export async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), 'X-Images-Token': sessionToken, ...options.headers } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败，请重试')
  return data
}
export const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) })
export const fileUrl = (item, thumbnail = false) => `/api/${thumbnail ? 'thumbnail' : 'file'}?path=${encodeURIComponent(item.path)}${thumbnail ? `&v=${encodeURIComponent(item.modifiedAt)}` : ''}`
export const downloadUrl = item => `${fileUrl(item)}&download=1`
export function uploadImage(file, directory, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `/api/upload?path=${encodeURIComponent(directory)}`)
    request.setRequestHeader('X-Images-Token', sessionToken)
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    request.onerror = () => reject(new Error('连接中断，请检查服务是否运行'))
    request.onload = () => {
      try {
        const result = JSON.parse(request.responseText)
        if (request.status >= 400) reject(new Error(result.error || '上传失败'))
        else if (!result.results?.[0]?.ok) reject(new Error(result.results?.[0]?.error || '上传失败'))
        else resolve(result.results[0].item)
      } catch { reject(new Error('上传响应无效')) }
    }
    const form = new FormData(); form.append('files', file, file.name); request.send(form)
  })
}
export function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '—'
  if (bytes < 1024) return `${bytes} B`
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3)
  return `${(bytes / 1024 ** unit).toFixed(unit === 1 ? 0 : 1)} ${['B', 'KB', 'MB', 'GB'][unit]}`
}
export const formatDate = value => value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replaceAll('/', '-') : '—'
