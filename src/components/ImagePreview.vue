<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { LeftOutlined, RightOutlined, ZoomInOutlined, ZoomOutOutlined, RedoOutlined, DownloadOutlined, CloseOutlined } from '@ant-design/icons-vue'
import { fileUrl, downloadUrl, formatSize } from '../lib/api'
const props = defineProps({ open: Boolean, items: { type: Array, default: () => [] }, start: { type: Number, default: 0 } })
const emit = defineEmits(['update:open'])
const index = ref(0), zoom = ref(1), rotation = ref(0), failed = ref(false)
const current = computed(() => props.items[index.value])
watch(() => props.open, open => { if (open) { index.value = props.start; reset() } })
function reset() { zoom.value = 1; rotation.value = 0; failed.value = false }
function navigate(direction) { index.value = (index.value + direction + props.items.length) % props.items.length; reset() }
function keydown(event) { if (!props.open) return; if (event.key === 'ArrowLeft') navigate(-1); if (event.key === 'ArrowRight') navigate(1) }
onMounted(() => window.addEventListener('keydown', keydown)); onBeforeUnmount(() => window.removeEventListener('keydown', keydown))
</script>

<template>
  <a-modal :open="open" :footer="null" :closable="false" :width="'100%'" wrap-class-name="image-preview" :destroy-on-close="true" @cancel="emit('update:open', false)">
    <div v-if="current" class="preview-layout">
      <header class="preview-header"><div><strong>{{ current.name }}</strong><span>{{ formatSize(current.size) }} · {{ index + 1 }} / {{ items.length }}</span></div><a-button type="text" aria-label="关闭预览" @click="emit('update:open', false)"><CloseOutlined /></a-button></header>
      <div class="preview-stage">
        <a-button class="preview-prev" shape="circle" aria-label="上一张" :disabled="items.length < 2" @click="navigate(-1)"><LeftOutlined /></a-button>
        <a-result v-if="failed" status="warning" title="浏览器无法预览这张图片" sub-title="可以下载原图后使用本地应用打开（如 TIFF 格式）。"><template #extra><a-button :href="downloadUrl(current)" type="primary">下载原图</a-button></template></a-result>
        <img v-else :key="current.path" :src="fileUrl(current)" :alt="current.name" :style="{ transform: `scale(${zoom}) rotate(${rotation}deg)` }" @error="failed = true" />
        <a-button class="preview-next" shape="circle" aria-label="下一张" :disabled="items.length < 2" @click="navigate(1)"><RightOutlined /></a-button>
      </div>
      <footer class="preview-controls"><a-button type="text" aria-label="缩小" :disabled="zoom <= 0.25" @click="zoom = Math.max(0.25, zoom - 0.25)"><ZoomOutOutlined /></a-button><span>{{ Math.round(zoom * 100) }}%</span><a-button type="text" aria-label="放大" :disabled="zoom >= 4" @click="zoom = Math.min(4, zoom + 0.25)"><ZoomInOutlined /></a-button><a-divider type="vertical" /><a-button type="text" aria-label="旋转" @click="rotation += 90"><RedoOutlined /></a-button><a-button type="text" :href="downloadUrl(current)"><DownloadOutlined /> 下载原图</a-button></footer>
    </div>
  </a-modal>
</template>
