# 书籍在线笔记功能设计

日期：2026-11-11
状态：已确认（用户逐节确认通过）

## 目标

在 mdBook 静态站点（localhost:3003 / GitHub Pages）上支持在线记笔记：

1. 阅读时选中正文文字 → 右键弹出浮层 → 输入自定义标记名 → 确认后形成高亮锚点；
2. 笔记统一收纳在左侧书籍目录旁的独立可收放面板，全书汇总；
3. 点击面板笔记 → 跳转对应页面并高亮定位到原文；
4. 支持导出/导入 JSON，便于换浏览器或电脑迁移。

## 非目标

- 不做后端存储（纯 localStorage）；
- 不做移动端专属交互（窄屏不渲染笔记面板）；
- 不做笔记全文编辑（只支持改标签名、删除）。

## 数据模型

localStorage key：`book-notes-v1`，值为 JSON 数组：

```json
[
  {
    "id": "n_1699564800_ab3f",
    "label": "RAG要点",
    "chapterPath": "/zh/chapter_rag/xxx.html",
    "chapterTitle": "第X章 RAG",
    "sectionId": "小节标题的锚点id",
    "sectionTitle": "2.3 检索增强",
    "quote": "选中的原文",
    "prefix": "选中文字前最多32字",
    "suffix": "选中文字后最多32字",
    "createdAt": 1699564800000
  }
]
```

定位策略（点击笔记时）：

1. 打开 `chapterPath` 页面；
2. 在 `sectionId` 小节内查找 `prefix + quote + suffix` 文本，命中 → 高亮并滚动定位；
3. 未命中（内容更新漂移）→ 退回滚动到小节标题并临时高亮标题。

容错：key 带 `-v1` 后缀，读取时对缺失字段给默认值。

## 交互设计

### 创建笔记

- 选中正文（`.content main` 内）文字 → 右键 → 轻量浮层（拦截浏览器默认菜单，仅当选区存在时）；
- 浮层：标记名输入框（预填选区前 12 字，空值禁用确认）+ 确认 / 取消；
- 确认后：写入 localStorage → 选区位置渲染持久高亮（黄底 + 左侧色条，带 `data-note-id`）→ 浮层关闭。

### 已有标记

- 点击高亮标记 → 滚动居中 + 脉冲动画；
- 悬停高亮 → 提示条显示标签名 + 删除按钮（删除 = 移除高亮 + 移除 localStorage 记录）。

### 页面加载

- URL 匹配 `chapterPath` 的笔记重新渲染高亮；
- 定位失败的笔记静默跳过，不影响阅读。

### 左侧笔记面板

- 固定在书籍目录与正文之间，宽约 280px，使用同一套 CSS 变量适配各主题（light/navy/coal/ayu）；
- 头部：「我的笔记」+ 计数徽章 + 导出 / 导入 / 折叠按钮；
- 列表按章节分组（章节组可折叠），每条显示标签名 + 小节名 + quote 摘要（约 40 字）；
- 点击整条跳转；悬停出现「编辑 / 删除」图标（编辑只改标签名）；
- 收起后变约 40px 宽的细竖条，显示总数徽章；状态存 `notes-panel-collapsed`；
- 空态文案：「阅读时选中文字右键即可记笔记」；
- 面板绝对定位在 sidebar 右侧，监听 sidebar 收放跟随；面板展开时给正文加左内边距，不遮挡阅读；
- 窄屏（`matchMedia`）不渲染。

### 导入导出

- 导出：生成 `book-notes-YYYYMMDD.json` 下载（localStorage 全量数组）；
- 导入：文件选择器 → 校验（数组 + 必填 id/label/chapterPath/quote）→ 按 id 去重合并（冲突保留本地）→ 提示「导入 N 条，跳过 M 条重复」；非法文件提示格式不正确。

## 错误处理

- localStorage 满 / JSON 解析失败 → 静默降级为空列表 + 控制台 warn；
- 同段文字重复创建 → 允许（不同标签名合理），定位取第一个匹配；
- 笔记指向页面 404 → fetch HEAD 预检（沿用语言切换按钮的预检模式），提示「原页面已不存在」；
- 浮层文案跟随 `documentElement.lang`（中/英双语页面同一套代码生效）。

## 代码组织（方案 B）

- 新建 `theme/notes.js`（约 450-550 行，单 IIFE，分区块注释）：数据层、高亮渲染、右键浮层、面板、定位跳转、导入导出；
- 新建 `theme/notes.css`（约 250 行）：面板 / 浮层 / 高亮样式 + 暗色主题适配；
- `book.toml` 增加：

```toml
additional-js = ["theme/notes.js"]
additional-css = ["theme/notes.css"]
```

注意：book.toml 现有 `additional-css = ["theme/custom.css"]`，需合并为数组形式 `additional-css = ["theme/custom.css", "theme/notes.css"]`。

- `head.hbs` 不改动，现有功能零影响；
- 不触碰任何章节 md 文件。

## 测试 / 验证清单（手动）

1. 选中文字右键 → 浮层 → 确认 → 高亮出现 + 面板出现该条；
2. 点击面板笔记 → 跨章节跳转 + 高亮定位；
3. 面板折叠/展开，刷新后状态保持；
4. 篡改 localStorage 中 quote → 刷新不高亮，点击退回小节标题；
5. navy/coal 主题样式正常；
6. 导出 → 清空 localStorage → 导入 → 笔记完整恢复；
7. 导入重复/非法文件提示正确；
8. 悬停高亮可删除、面板内可编辑标签名。

## 实现顺序

notes.css → 数据层 → 高亮渲染 → 右键浮层 → 面板 → 定位跳转 → 导入导出 → 手动清单验证。
