<script setup>
import { computed, ref, watch, h, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import message from 'ant-design-vue/es/message'
import Modal from 'ant-design-vue/es/modal'
import { PictureOutlined, AppstoreOutlined, FolderOutlined, ClockCircleOutlined, DeleteOutlined, UploadOutlined, FolderAddOutlined, SearchOutlined, ReloadOutlined, UnorderedListOutlined, DownOutlined, RightOutlined, CheckOutlined, DownloadOutlined, EditOutlined, FolderOpenOutlined, MoreOutlined, ArrowLeftOutlined, CloseOutlined, SafetyCertificateOutlined, CloudUploadOutlined, InboxOutlined, LaptopOutlined, SwapOutlined, UndoOutlined, InfoCircleOutlined } from '@ant-design/icons-vue'
import { useDriveStore } from '../stores/drive'
import { api, post, fileUrl, downloadUrl, formatSize, formatDate } from '../lib/api'
import FolderMark from '../components/FolderMark.vue'
import ImagePreview from '../components/ImagePreview.vue'

const store = useDriveStore(), route = useRoute(), router = useRouter()
const currentPath = computed(() => typeof route.query.path === 'string' ? route.query.path : '')
const mode = computed(() => ['images', 'recent', 'trash'].includes(route.query.mode) ? route.query.mode : 'all')
const query = computed(() => typeof route.query.q === 'string' ? route.query.q : '')
const searchInput = ref(''), fileInput = ref(null), pasteTarget = ref(null), dragging = ref(false), dragDepth = ref(0), tree = ref([]), treeVersion = ref(0), viewportWidth = ref(typeof window === 'undefined' ? 1200 : window.innerWidth), viewportHeight = ref(typeof window === 'undefined' ? 800 : window.innerHeight)
const folderDialog = ref(false), renameTarget = ref(null), nameInput = ref(''), saving = ref(false), nameRef = ref(null)
const moveOpen = ref(false), movePaths = ref([]), destination = ref(''), destinationFolders = ref([]), moveLoading = ref(false)
const previewOpen = ref(false), previewIndex = ref(0), infoOpen = ref(false), folderFilter = ref('')
const nav = [{ key: 'all', label: '全部文件', icon: FolderOpenOutlined }, { key: 'images', label: '全部图片', icon: PictureOutlined }, { key: 'recent', label: '最近修改', icon: ClockCircleOutlined }]
const titles = { all: '全部文件', images: '全部图片', recent: '最近修改', trash: '回收站' }
const imageItems = computed(() => store.sortedItems.filter(item => item.type === 'image'))
const folderCount = computed(() => store.items.filter(item => item.type === 'folder').length)
const totalSize = computed(() => store.items.reduce((sum, item) => sum + (item.size || 0), 0))
const activeItems = computed(() => store.items.filter(item => store.selection.includes(keyOf(item))))
const canUpload = computed(() => mode.value === 'all' && !query.value && !!store.config && !store.error)
const allSelected = computed(() => store.items.length > 0 && store.selection.length === store.items.length)
const crumbs = computed(() => { let path = ''; return currentPath.value.split('/').filter(Boolean).map(name => { path = path ? `${path}/${name}` : name; return { name, path } }) })
const visibleTree = computed(() => folderFilter.value ? tree.value.filter(item => item.title.toLowerCase().includes(folderFilter.value.toLowerCase())) : tree.value)
const columns = computed(() => [{ title: '文件名', dataIndex: 'name', key: 'name', ellipsis: true }, { title: '大小', dataIndex: 'size', key: 'size', width: 110 }, { title: '类型', key: 'type', width: 110 }, { title: mode.value === 'trash' ? '删除时间' : '修改时间', key: 'date', width: 175 }, { title: '', key: 'actions', width: mode.value === 'trash' ? 130 : 155 }])
const rowSelection = computed(() => ({ selectedRowKeys: store.selection, onChange: keys => { store.selection = keys }, columnWidth: 42 }))
const sortOptions = [{ value: 'name-asc', label: '名称 · 正序' }, { value: 'name-desc', label: '名称 · 倒序' }, { value: 'date-desc', label: '时间 · 最新优先' }, { value: 'date-asc', label: '时间 · 最早优先' }, { value: 'size-desc', label: '大小 · 从大到小' }]
const tableScroll = computed(() => {
  const compact = viewportWidth.value < 760
  const y = Math.max(compact ? 200 : 220, viewportHeight.value - (compact ? 440 : 390))
  return compact ? { x: 720, y } : { y }
})
let searchTimer
function keyOf(item) { return mode.value === 'trash' ? item.id : item.path }
function navigate(path = '', view = 'all') { searchInput.value = ''; router.push({ path: '/drive', query: { ...(path ? { path } : {}), ...(view !== 'all' ? { mode: view } : {}) } }) }
async function refresh() { await store.load({ path: currentPath.value, mode: mode.value, q: query.value }) }
function treeNode(item) { return { title: item.name, key: item.path, isLeaf: item.isLeaf !== false } }
async function refreshTree() {
  try { const data = await api('/tree'); tree.value = data.items.map(treeNode) } catch { tree.value = [] }
  treeVersion.value++
}
async function loadTree(node) {
  const data = await api(`/tree?path=${encodeURIComponent(node.key)}`)
  function patch(nodes) { return nodes.map(item => item.key === node.key ? { ...item, children: data.items.map(treeNode), isLeaf: data.items.length === 0 } : { ...item, ...(item.children ? { children: patch(item.children) } : {}) }) }
  tree.value = patch(tree.value)
}
function search() {
  clearTimeout(searchTimer)
  const nextQuery = { ...route.query }; delete nextQuery.q
  if (searchInput.value.trim()) nextQuery.q = searchInput.value.trim()
  if (nextQuery.mode === 'trash') delete nextQuery.mode
  router.push({ path: '/drive', query: nextQuery })
}
function openItem(item) {
  if (mode.value === 'trash') return
  if (item.type === 'folder') navigate(item.path)
  else { previewIndex.value = imageItems.value.findIndex(image => image.path === item.path); previewOpen.value = true }
}
function toggleItem(item, checked) { const key = keyOf(item); store.selection = checked ? [...new Set([...store.selection, key])] : store.selection.filter(value => value !== key) }
function selectAll(checked) { store.selection = checked ? store.items.map(keyOf) : [] }
function focusName() { setTimeout(() => nameRef.value?.focus({ cursor: 'all' }), 100) }
function openCreate() { renameTarget.value = null; nameInput.value = ''; folderDialog.value = true; focusName() }
function openRename(item) { renameTarget.value = item; nameInput.value = item.name; folderDialog.value = true; focusName() }
async function saveName() {
  if (!nameInput.value.trim()) return message.warning('请输入名称')
  saving.value = true
  try {
    if (renameTarget.value) await api('/rename', { method: 'PATCH', body: JSON.stringify({ path: renameTarget.value.path, name: nameInput.value }) })
    else await post('/folders', { path: currentPath.value, name: nameInput.value })
    message.success(renameTarget.value ? '重命名成功' : '文件夹已创建'); folderDialog.value = false
    await Promise.all([refresh(), refreshTree()])
  } catch (error) { message.error(error.message) } finally { saving.value = false }
}
function batchFeedback(data, successText) {
  const failures = data.results.filter(result => !result.ok)
  const count = data.results.length - failures.length
  if (failures.length) Modal.warning({ title: count ? `已完成 ${count} 项，${failures.length} 项失败` : '操作未完成', content: h('div', { class: 'failure-list' }, failures.map(result => h('p', `${result.key}：${result.error}`))) })
  else message.success(`${successText}（${count} 项）`)
}
async function batch(endpoint, body, successText) {
  try { const data = await post(endpoint, body); batchFeedback(data, successText); await Promise.all([refresh(), refreshTree()]); return data.results.every(item => item.ok) } catch (error) { message.error(error.message); return false }
}
function deleteItems(items = activeItems.value) {
  if (!items.length) return
  const permanent = mode.value === 'trash'
  Modal.confirm({ title: permanent ? `永久删除这 ${items.length} 个项目？` : `将这 ${items.length} 个项目移入回收站？`, content: permanent ? '这些本地文件将被永久删除，无法恢复。' : '文件夹内的所有内容也会一起移入本地回收站，可以随后恢复。', okText: permanent ? '永久删除' : '移入回收站', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => batch(permanent ? '/trash/purge' : '/trash', permanent ? { ids: items.map(item => item.id) } : { paths: items.map(item => item.path) }, permanent ? '已永久删除' : '已移入回收站') })
}
async function restoreItems(items = activeItems.value) { await batch('/trash/restore', { ids: items.map(item => item.id) }, '已恢复至原位置') }
async function readDestination(path) {
  moveLoading.value = true
  try { const data = await api(`/tree?path=${encodeURIComponent(path)}`); destination.value = path; destinationFolders.value = data.items } catch (error) { message.error(error.message) } finally { moveLoading.value = false }
}
function openMove(items = activeItems.value) { movePaths.value = items.map(item => item.path); destination.value = ''; moveOpen.value = true; readDestination('') }
function invalidDestination(path) { return movePaths.value.some(source => path === source || path.startsWith(source + '/')) }
async function confirmMove() {
  saving.value = true
  try { if (await batch('/move', { paths: movePaths.value, destination: destination.value }, '移动成功')) moveOpen.value = false } finally { saving.value = false }
}
async function uploadFiles(files) {
  if (!files.length) return
  if (!canUpload.value) return message.warning('请先进入目标文件夹再上传图片')
  try { const count = await store.uploadFiles(Array.from(files), currentPath.value); message[count === files.length ? 'success' : 'warning'](`已上传 ${count} / ${files.length} 张图片`); await refresh() } catch (error) { message.error(error.message) }
}
function onFiles(event) { uploadFiles(event.target.files); event.target.value = '' }
function onPaste(event) {
  const files = []
  for (const [index, item] of [...(event.clipboardData?.items || [])].entries()) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (!file) continue
    const extension = /\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1].toLowerCase() || ({ jpeg: 'jpg', 'svg+xml': 'svg', tiff: 'tiff' })[item.type.slice(6)] || item.type.slice(6) || 'png'
    files.push(new File([file], `${Date.now()}-${index}.${extension}`, { type: file.type, lastModified: file.lastModified }))
  }
  if (!files.length) return
  event.preventDefault()
  uploadFiles(files)
}
function preparePaste(event) {
  if (event.target.closest?.('input, textarea, [contenteditable="true"]')) return
  pasteTarget.value?.focus({ preventScroll: true })
}
function onDrop(event) { dragging.value = false; dragDepth.value = 0; uploadFiles(event.dataTransfer.files) }
function onDragEnter(event) { if (event.dataTransfer.types.includes('Files')) { dragDepth.value++; dragging.value = true } }
function onDragLeave() { dragDepth.value--; if (dragDepth.value <= 0) dragging.value = false }
function rowProps(item) { return { onDblclick: () => openItem(item) } }
function onViewportResize() { viewportWidth.value = window.innerWidth; viewportHeight.value = window.innerHeight }
watch(() => [currentPath.value, mode.value, query.value], async () => { searchInput.value = query.value; await refresh(); if (!tree.value.length) await refreshTree() }, { immediate: true })
onMounted(() => { window.addEventListener('resize', onViewportResize) })
onBeforeUnmount(() => { clearTimeout(searchTimer); window.removeEventListener('resize', onViewportResize) })
</script>

<template>
  <div class="drive-shell" @paste="onPaste" @contextmenu="preparePaste">
    <textarea ref="pasteTarget" class="clipboard-paste-target" aria-label="剪贴板图片粘贴区" tabindex="0" autocomplete="off" spellcheck="false" />
    <aside class="sidebar">
      <button class="brand" @click="navigate()"><span class="brand-icon"><PictureOutlined /></span><span class="brand-text">拾光<span>本地图片云盘</span></span></button>
      <div class="workspace-label">我的空间 <span>LOCAL</span></div>
      <nav class="main-nav"><button v-for="item in nav" :key="item.key" :class="{ active: mode === item.key }" :title="item.label" @click="navigate('', item.key)"><component :is="item.icon" /><span>{{ item.label }}</span><span v-if="mode === item.key" class="nav-dot" /></button></nav>
      <div class="directory-heading"><span>文件夹</span><a-button size="small" type="text" aria-label="刷新目录树" @click="refreshTree"><ReloadOutlined /></a-button></div>
      <div class="directory-tree">
        <a-input v-if="tree.length > 6" v-model:value="folderFilter" placeholder="筛选根目录文件夹" size="small" allow-clear><template #prefix><SearchOutlined /></template></a-input>
        <a-tree v-if="visibleTree.length" :key="treeVersion" :tree-data="visibleTree" :load-data="loadTree" :selected-keys="[currentPath]" show-icon block-node @select="(keys) => keys.length && navigate(keys[0])"><template #icon><FolderOutlined /></template></a-tree>
        <div v-else class="tree-empty">{{ folderFilter ? '没有匹配的文件夹' : '文件夹将在这里显示' }}</div>
      </div>
      <button class="trash-nav" :class="{ active: mode === 'trash' }" title="回收站" @click="navigate('', 'trash')"><DeleteOutlined /><span>回收站</span></button>
    </aside>

    <section class="workspace">
      <header class="topbar"><div class="topbar-title">图片管理 <span>/</span> <strong>{{ titles[mode] }}</strong></div><a-input-search v-model:value="searchInput" class="global-search" placeholder="搜索当前目录及子目录" allow-clear :disabled="mode === 'trash'" @search="search" @change="() => { if (!searchInput) search() }" /><a-tooltip title="文件直接保存在本机，不上传云端"><span class="local-badge"><span class="connection-dot" /> 本地模式</span></a-tooltip><a-button class="info-button" type="text" aria-label="使用说明" @click="infoOpen = true"><InfoCircleOutlined /></a-button></header>
      <main class="main-content" @dragover.prevent @dragenter.prevent="onDragEnter" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
        <div class="page-heading"><div><div class="eyebrow">YOUR MOMENTS, WELL ORGANIZED</div><h1>{{ query ? '搜索结果' : titles[mode] }}<span v-if="!store.loading">{{ store.items.length }}</span></h1><p>{{ mode === 'trash' ? '暂时告别的图片，也可以重新找回。' : mode === 'images' ? '散落在各个文件夹里的美好，在这里相遇。' : mode === 'recent' ? '最近整理、最近拍下，留住每一个新鲜瞬间。' : '给每一张照片，找一个刚刚好的位置。' }}</p></div><div class="heading-actions"><a-button v-if="store.uploads.length" @click="store.uploadOpen = true"><CloudUploadOutlined /> 传输列表 <a-badge v-if="store.uploading" status="processing" /></a-button><a-button v-if="mode === 'all' && !query" class="secondary-action" :disabled="!canUpload" @click="openCreate"><FolderAddOutlined /> 新建文件夹</a-button><a-button v-if="mode !== 'trash'" type="primary" :disabled="!canUpload || store.uploading" @click="fileInput?.click()"><UploadOutlined /> 上传图片</a-button></div></div>
        <input ref="fileInput" type="file" class="hidden-input" accept=".jpg,.jpeg,.png,.gif,.webp,.avif,.tif,.tiff,.svg" multiple aria-label="选择上传图片" @change="onFiles" />
        <div class="file-panel" :class="{ 'file-panel-list': store.layout === 'list' || mode === 'trash' }">
          <div class="file-toolbar"><div class="breadcrumb-wrap"><a-button v-if="currentPath && mode === 'all'" type="text" size="small" aria-label="返回上一级" @click="navigate(currentPath.split('/').slice(0, -1).join('/'))"><ArrowLeftOutlined /></a-button><a-breadcrumb><a-breadcrumb-item><a @click="navigate('', mode)">{{ titles[mode] }}</a></a-breadcrumb-item><template v-if="mode === 'all'"><a-breadcrumb-item v-for="(crumb, index) in crumbs" :key="crumb.path"><span v-if="index === crumbs.length - 1">{{ crumb.name }}</span><a v-else @click="navigate(crumb.path)">{{ crumb.name }}</a></a-breadcrumb-item></template><a-breadcrumb-item v-if="query">“{{ query }}”</a-breadcrumb-item></a-breadcrumb></div><div class="view-tools"><a-select v-model:value="store.sort" :options="sortOptions" :bordered="false" aria-label="文件排序" class="sort-select" /><a-tooltip title="刷新"><a-button type="text" aria-label="刷新文件列表" :loading="store.loading" @click="() => { refresh(); refreshTree() }"><ReloadOutlined /></a-button></a-tooltip><a-radio-group v-if="mode !== 'trash'" :value="store.layout" class="view-toggle" @change="event => store.setLayout(event.target.value)"><a-radio-button value="grid" aria-label="缩略图视图"><AppstoreOutlined /></a-radio-button><a-radio-button value="list" aria-label="列表视图"><UnorderedListOutlined /></a-radio-button></a-radio-group></div></div>
          <div v-if="store.selection.length" class="selection-bar"><div><a-checkbox :checked="allSelected" :indeterminate="!allSelected" @change="event => selectAll(event.target.checked)" /><span>已选择 <strong>{{ store.selection.length }}</strong> 项</span><a-button type="link" size="small" @click="store.selection = []">取消选择</a-button></div><a-space><a-button v-if="mode === 'trash'" size="small" @click="restoreItems()"><UndoOutlined /> 恢复</a-button><a-button v-else size="small" @click="openMove()"><SwapOutlined /> 移动到</a-button><a-button size="small" danger @click="deleteItems()"><DeleteOutlined /> {{ mode === 'trash' ? '永久删除' : '删除' }}</a-button></a-space></div>
          <a-alert v-if="store.error" type="error" show-icon :message="store.error" class="panel-alert"><template #action><a-button size="small" @click="refresh">重试</a-button></template></a-alert>
          <a-alert v-if="store.truncated || store.warnings.length" type="warning" show-icon class="panel-alert" :message="store.truncated ? '结果超过 20,000 项，请缩小搜索范围或进入具体目录。' : `有 ${store.warnings.length} 个项目因权限、目录变化或链接限制未读取。`" />
          <a-spin :spinning="store.loading" :delay="160" tip="正在读取本地文件…">
            <template v-if="store.items.length">
              <a-table v-if="store.layout === 'list' || mode === 'trash'" :columns="columns" :data-source="store.sortedItems" :row-key="keyOf" :row-selection="rowSelection" :custom-row="rowProps" :pagination="{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true, showTotal: total => `共 ${total} 项` }" :scroll="tableScroll">
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'name'"><div class="name-cell"><FolderMark v-if="record.type === 'folder'" /><span v-else class="list-thumb"><img v-if="mode !== 'trash'" :src="fileUrl(record, true)" alt="" loading="lazy" @error="event => { event.target.style.display = 'none' }" /><PictureOutlined /></span><div><button class="file-name" :title="record.name" @click="openItem(record)">{{ record.name }}</button><span v-if="mode === 'trash'" class="file-location">原位置：{{ record.originalPath }}</span><button v-else-if="mode !== 'all' || query" class="file-location location-link" @click="navigate(record.parent)">{{ record.parent || '根目录' }}</button></div></div></template>
                  <template v-else-if="column.key === 'size'"><span class="muted-cell">{{ formatSize(record.size) }}</span></template>
                  <template v-else-if="column.key === 'type'"><span class="type-cell">{{ record.type === 'folder' ? '文件夹' : `${record.extension} 图片` }}</span></template>
                  <template v-else-if="column.key === 'date'"><span class="muted-cell date-cell">{{ formatDate(record.deletedAt || record.modifiedAt) }}</span></template>
                  <template v-else-if="column.key === 'actions'"><a-space class="row-actions" :size="2"><template v-if="mode === 'trash'"><a-tooltip title="恢复"><a-button type="text" size="small" :aria-label="`恢复 ${record.name}`" @click="restoreItems([record])"><UndoOutlined /></a-button></a-tooltip></template><template v-else><a-tooltip title="重命名"><a-button type="text" size="small" :aria-label="`重命名 ${record.name}`" @click="openRename(record)"><EditOutlined /></a-button></a-tooltip><a-tooltip title="移动到"><a-button type="text" size="small" :aria-label="`移动 ${record.name}`" @click="openMove([record])"><SwapOutlined /></a-button></a-tooltip><a-tooltip v-if="record.type === 'image'" title="下载原图"><a-button type="text" size="small" :href="downloadUrl(record)" :aria-label="`下载 ${record.name}`"><DownloadOutlined /></a-button></a-tooltip></template><a-tooltip title="删除"><a-button type="text" size="small" :aria-label="`删除 ${record.name}`" @click="deleteItems([record])"><DeleteOutlined /></a-button></a-tooltip></a-space></template>
                </template>
              </a-table>
              <template v-else><div class="grid-selection"><a-checkbox :checked="allSelected" :indeterminate="store.selection.length > 0 && !allSelected" @change="event => selectAll(event.target.checked)">全选</a-checkbox><span>共 {{ store.items.length }} 项</span></div><div class="image-grid"><article v-for="item in store.sortedItems" :key="item.path" class="image-card" :class="{ selected: store.selection.includes(item.path), 'folder-card': item.type === 'folder' }"><a-checkbox class="card-checkbox" :checked="store.selection.includes(item.path)" :aria-label="`选择 ${item.name}`" @change="event => toggleItem(item, event.target.checked)" /><button class="card-visual" :aria-label="`${item.type === 'folder' ? '打开文件夹' : '预览'} ${item.name}`" @click="openItem(item)"><FolderMark v-if="item.type === 'folder'" /><template v-else><PictureOutlined class="image-placeholder" /><img :src="fileUrl(item, true)" :alt="item.name" loading="lazy" @error="event => { event.target.style.display = 'none' }" /></template><span v-if="item.type === 'image'" class="image-format">{{ item.extension }}</span></button><div class="card-caption"><button class="file-name" :title="item.name" @click="openItem(item)">{{ item.name }}</button><a-dropdown :trigger="['click']"><a-button type="text" size="small" :aria-label="`更多操作 ${item.name}`"><MoreOutlined /></a-button><template #overlay><a-menu><a-menu-item @click="openRename(item)"><EditOutlined /> 重命名</a-menu-item><a-menu-item @click="openMove([item])"><SwapOutlined /> 移动到</a-menu-item><a-menu-item v-if="item.type === 'image'"><a :href="downloadUrl(item)"><DownloadOutlined /> 下载原图</a></a-menu-item><a-menu-divider /><a-menu-item danger @click="deleteItems([item])"><DeleteOutlined /> 删除</a-menu-item></a-menu></template></a-dropdown><span>{{ item.type === 'folder' ? '文件夹' : formatSize(item.size) }}<span class="caption-separator">·</span>{{ formatDate(item.modifiedAt).slice(0, 10) }}</span><button v-if="mode !== 'all' || query" class="file-location location-link" @click="navigate(item.parent)">{{ item.parent || '根目录' }}</button></div></article></div></template>
            </template>
            <div v-else class="empty-state"><div class="empty-art"><DeleteOutlined v-if="mode === 'trash'" /><SearchOutlined v-else-if="query" /><PictureOutlined v-else /></div><h3>{{ store.loading ? '正在整理你的图片' : store.error ? '暂时无法读取' : mode === 'trash' ? '回收站是空的' : query ? '没有找到匹配的文件' : '这里，等待美好发生' }}</h3><p>{{ query ? '换个关键词，或返回上级目录搜索。' : mode === 'trash' ? '删除的文件会暂存在这里，你可以随时恢复。' : mode === 'all' ? '上传图片，或创建文件夹，开始整理你的第一份回忆。' : '在「全部文件」中上传图片，这里会自动汇集。' }}</p><a-space v-if="canUpload && !store.loading"><a-button @click="openCreate"><FolderAddOutlined /> 新建文件夹</a-button><a-button type="primary" :disabled="store.uploading" @click="fileInput?.click()"><UploadOutlined /> 上传图片</a-button></a-space></div>
          </a-spin>
          <footer class="panel-footer"><span><span class="status-dot" /> {{ store.loading ? '正在读取' : '已全部加载' }}<span class="footer-divider">|</span>{{ folderCount }} 个文件夹，{{ store.items.length - folderCount }} 张图片<span v-if="totalSize" class="footer-size"> · {{ formatSize(totalSize) }}</span></span><span>{{ mode === 'trash' ? '恢复时请确保原文件夹存在' : '所有更改实时保存到本地' }}</span></footer>
        </div>
        <footer class="app-footer"><span>拾光 IMAGES VIEW</span><span>每一份美好，都值得被珍藏。</span><span><SafetyCertificateOutlined /> 100% 本地存储</span></footer>
        <div v-if="dragging" class="drop-overlay"><CloudUploadOutlined /><h2>{{ canUpload ? '松开鼠标，上传到当前文件夹' : '请先打开目标文件夹' }}</h2><p>支持 JPG、PNG、GIF、WebP、AVIF、TIFF、SVG · 单张最大 100 MB</p></div>
      </main>
    </section>

    <a-modal v-model:open="folderDialog" :title="renameTarget ? '重命名' : '新建文件夹'" :confirm-loading="saving" ok-text="确定" cancel-text="取消" @ok="saveName"><p class="dialog-description">{{ renameTarget ? '请输入新的名称，图片文件请保留扩展名。' : `创建位置：全部文件${currentPath ? ' / ' + currentPath : ''}` }}</p><a-input ref="nameRef" v-model:value="nameInput" :maxlength="180" :placeholder="renameTarget ? '请输入名称' : '请输入文件夹名称'" @press-enter="saveName" /></a-modal>
    <a-modal v-model:open="moveOpen" title="移动到" :confirm-loading="saving" ok-text="移动到此文件夹" cancel-text="取消" :ok-button-props="{ disabled: invalidDestination(destination) }" @ok="confirmMove"><p class="dialog-description">选择 {{ movePaths.length }} 个项目的新位置。同名文件不会被覆盖。</p><div class="destination-breadcrumb"><a-button v-if="destination" type="text" size="small" aria-label="目标目录返回上一级" @click="readDestination(destination.split('/').slice(0, -1).join('/'))"><ArrowLeftOutlined /></a-button><a @click="readDestination('')">全部文件</a><span v-if="destination"> / {{ destination }}</span></div><a-spin :spinning="moveLoading"><div class="destination-list"><button v-for="folder in destinationFolders" :key="folder.path" :disabled="invalidDestination(folder.path)" @click="readDestination(folder.path)"><FolderMark /><span>{{ folder.name }}</span><RightOutlined /></button><a-empty v-if="!destinationFolders.length" description="此文件夹中没有子文件夹" /></div></a-spin></a-modal>
    <a-drawer v-model:open="store.uploadOpen" title="传输列表" :width="420"><p class="dialog-description">{{ store.uploading ? '正在上传，请勿关闭服务或刷新页面。' : '上传任务已结束' }} · {{ store.uploads.filter(job => job.status === 'done').length }} / {{ store.uploads.length }} 完成</p><div v-for="job in store.uploads" :key="job.id" class="upload-job"><div><PictureOutlined /><strong>{{ job.name }}</strong><CheckOutlined v-if="job.status === 'done'" class="success-icon" /></div><a-progress :percent="job.progress" :status="job.status === 'error' ? 'exception' : job.status === 'done' ? 'success' : 'active'" size="small" /><small>{{ job.error || (job.status === 'waiting' ? '排队中' : job.status === 'done' ? '已保存至本地' : '上传中…') }}</small></div></a-drawer>
    <a-modal v-model:open="infoOpen" title="关于你的本地图片云盘" :footer="null"><div class="about-local"><span class="about-icon"><LaptopOutlined /></span><h3>图片一直都在你的电脑里</h3><p>根目录：<code>{{ store.config?.root || '正在连接…' }}</code></p><p>在任意图片文件夹中执行 <code>images-view</code> 即可启动。页面操作会直接修改本地文件；删除的内容保存在根目录的 <code>.images-view-trash</code> 文件夹。</p><p>支持 JPG、PNG、GIF、WebP、AVIF、TIFF、SVG。单张上传最大 100 MB，每批最多 100 张。同名文件不会被覆盖。</p><p>目录树和浏览会跳过隐藏目录、node_modules、符号链接及 Windows 目录联接。外部修改后点击刷新即可同步。</p></div></a-modal>
    <ImagePreview v-model:open="previewOpen" :items="imageItems" :start="previewIndex" />
  </div>
</template>

