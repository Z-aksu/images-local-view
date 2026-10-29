# 拾光 · Images Local View

一个本地运行的图片管理云盘。使用 **Vue 3 + Vue Router + Pinia + Vite + Ant Design Vue** 和 **Express**。在任意文件夹执行 `images-view`，即可通过浏览器管理该目录下的文件夹和图片。

## 安装并注册命令

需要 Node.js **22.12 或更高版本**。在本项目目录执行：

```cmd
cd /d D:\images-local-view
npm install
npm run build
npm link
```

随后打开任意图片目录的 CMD：

```cmd
cd /d D:\我的图片
images-view
```

自动打开浏览器，默认地址 `http://127.0.0.1:3220`。默认端口占用时自动顺延。**根目录取命令执行时的当前目录，不是项目安装目录**。按 `Ctrl+C` 停止服务。

```cmd
images-view --dir "D:\我的图片"
images-view --port 4300
images-view --no-open
images-view --help
```

指定端口已占用时直接报错。默认仅允许本机访问，不提供局域网共享或云端同步。若 CMD 找不到命令，检查 `npm prefix -g` 对应目录是否在 PATH，重新打开终端。卸载命令：`npm unlink -g images-local-view`。

## 已实现

- 网盘式中文界面，使用 Ant Design Vue 组件。
- 多层文件夹浏览、面包屑、懒加载目录树。
- 任意层级创建文件夹，重命名图片和文件夹。
- 图片列表 / 缩略图切换，名称、时间和大小排序。
- 递归搜索当前目录及子目录；全部图片、最近修改视图。
- 多图上传、拖拽上传、独立任务进度，最多 3 个并发。单张最大 100 MB，每批最多 100 张。上传检查实际图片格式，不覆盖同名文件。
- 剪贴板图片上传：复制图片后，在页面右键选择“粘贴”或按 `Ctrl+V`，无需额外打开上传弹窗。
- 大图预览、键盘左右切换、缩放、旋转、下载原图。预览旋转不会修改原文件。
- 选择单个或多个项目，移动、移入回收站。
- 回收站恢复和确认后的永久删除。
- 桌面和移动端布局，针对触控操作优化按钮、卡片、预览和侧栏；实际本地文件系统操作。

## 文件规则

支持 JPG / JPEG、PNG、GIF、WebP、AVIF、TIFF 和 SVG。浏览器不支持的原图（例如 TIFF）会提示下载；缩略图由 Sharp 生成并缓存在系统临时目录 `images-view-thumbnails-v1`。图片原件不会被转码或压缩。

隐藏项目、`node_modules`、`.git`、符号链接及 Windows 目录联接不会显示，不能通过链接跳出根目录。目录只展示文件夹和支持的图片，其他文件仍保留在磁盘；删除文件夹会连同其中的所有内容一起处理。

搜索或汇总视图最多返回 20,000 项，达到上限会提示缩小范围；目录权限或文件变化造成的跳过会在页面提示。刷新读取磁盘最新状态。无需数据库。

### 删除与恢复

删除会将内容移动到**启动根目录下**的 `.images-view-trash` 中。回收站仍占用本地磁盘空间。可在页面中恢复到原路径，或确认后永久删除。

恢复要求原父文件夹仍存在，且目标位置没有同名项目；发生冲突会保留回收站内容并显示原因。不要手工修改回收站的 `record.json` 文件。

## 开发

```cmd
npm run dev
```

同时启动 Express（3220）和 Vite（5173）。默认以项目目录为图片根目录，可指定：

```cmd
set IMAGES_VIEW_DIR=D:\我的图片
npm run dev
```

PowerShell 设置环境变量使用 `$env:IMAGES_VIEW_DIR = 'D:\我的图片'`。

```cmd
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm pack --dry-run
```

集成测试和浏览器测试仅操作临时目录，不处理你的真实图片。浏览器测试截图输出到 `test-results/`。`npm pack` 会通过 prepack 自动构建，发布内容只含 CLI、服务端、dist 和说明文档；安装后的运行不需要 Vite。

## 项目结构

```text
bin/images-view.js       CLI 入口，基于 process.cwd() 启动
server/app.js            Express 接口、上传、缩略图、静态资源
server/files.js          文件系统操作及路径边界
server/options.js        命令行参数
server/listen.js         默认端口自动顺延
src/stores/drive.js      Pinia 文件与上传状态
src/views/DriveView.vue  Ant Design Vue 网盘主界面
src/components/         文件夹图标和大图预览
test/                   集成测试与浏览器测试
```
