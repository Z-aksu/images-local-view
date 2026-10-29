import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import Button from 'ant-design-vue/es/button'
import ConfigProvider from 'ant-design-vue/es/config-provider'
import Modal from 'ant-design-vue/es/modal'
import Alert from 'ant-design-vue/es/alert'
import Badge from 'ant-design-vue/es/badge'
import Breadcrumb from 'ant-design-vue/es/breadcrumb'
import Checkbox from 'ant-design-vue/es/checkbox'
import Divider from 'ant-design-vue/es/divider'
import Drawer from 'ant-design-vue/es/drawer'
import Dropdown from 'ant-design-vue/es/dropdown'
import Empty from 'ant-design-vue/es/empty'
import Input from 'ant-design-vue/es/input'
import Menu from 'ant-design-vue/es/menu'
import Progress from 'ant-design-vue/es/progress'
import Radio from 'ant-design-vue/es/radio'
import Result from 'ant-design-vue/es/result'
import Select from 'ant-design-vue/es/select'
import Space from 'ant-design-vue/es/space'
import Spin from 'ant-design-vue/es/spin'
import Table from 'ant-design-vue/es/table'
import Tooltip from 'ant-design-vue/es/tooltip'
import Tree from 'ant-design-vue/es/tree'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import DriveView from './views/DriveView.vue'
import './styles.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/', redirect: '/drive' }, { path: '/drive', component: DriveView }, { path: '/:pathMatch(.*)*', redirect: '/drive' }],
})
const app = createApp(App).use(createPinia()).use(router)
for (const component of [Button, ConfigProvider, Modal, Alert, Badge, Breadcrumb, Checkbox, Divider, Drawer, Dropdown, Empty, Input, Menu, Progress, Radio, Result, Select, Space, Spin, Table, Tooltip, Tree]) app.use(component)
app.mount('#app')
