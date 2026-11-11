# 书籍在线笔记功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 mdBook 静态站点上支持：选中正文右键创建自定义标签笔记、左侧可收放面板全书汇总、点击笔记跳转高亮定位、localStorage 持久化 + 导入导出。

**Architecture:** 纯前端方案。新建 `theme/notes.js`（单 IIFE，数据层/高亮渲染/右键浮层/面板/跳转/导入导出六个区块）与 `theme/notes.css`，通过 book.toml 的 `additional-js`/`additional-css` 注入，不改动 head.hbs 与章节内容。

**Tech Stack:** mdBook v0.5.4（构建产物为静态 HTML，自定义元素 `mdbook-sidebar-scrollbox`、CSS 变量 `--sidebar-width`）；原生 JavaScript（ES5 风格，与 head.hbs 现有代码一致）；localStorage。

**Spec:** `docs/superpowers/specs/2026-11-11-book-notes-design.md`

## Global Constraints

- 本项目为静态站点，无 JS 测试框架。每个任务的自动验证 = `node --check theme/notes.js`（语法门禁）+ `mdbook build`（构建门禁）+ `grep` 检查产物；行为验证 = 手动浏览器清单（Task 9 汇总）。
- 语言版本：`mdbook build` 只构建中文版（serve.sh 负责英文版）。构建验证用中文版即可。
- 代码风格：ES5（var/function），与 theme/head.hbs 现有代码一致；不用箭头函数、模板字符串、const/let。
- 所有面向用户文案中英双语，按 `document.documentElement.lang` 判断（zh* → 中文）。
- localStorage keys：`book-notes-v1`、`notes-panel-collapsed`。
- 不修改 theme/head.hbs、src/ 下任何章节文件。
- mdBook 0.5 DOM 关键事实（已从构建产物验证）：
  - 左栏 `<nav id="mdbook-sidebar" class="sidebar">`，固定定位，宽度 `var(--sidebar-width)`（默认 `min(var(--sidebar-target-width), 80vw)`，target 默认 300px），隐藏时 `transform: translateX(-宽度)`；`html` 元素有 `sidebar-visible` class。
  - 侧栏可拖拽调宽（`--sidebar-target-width` 存 localStorage `mdbook-sidebar-width`）。
  - 正文容器：`#mdbook-content.content > main`；章节 h2/h3 的 id 直接是中文标题（如 `id="文本分割策略"`）。
  - 正文文本节点多为纯文本，含少量 `<code>`/`<strong>` 等行内元素。

---

### Task 1: 接线与数据层骨架

**Files:**
- Modify: `book.toml`
- Create: `theme/notes.css`
- Create: `theme/notes.js`

**Interfaces:**
- Produces: 全局 IIFE 内的数据层函数（后续任务依赖）：
  - `loadNotes() → Array<note>`（note 结构见 spec：id/label/chapterPath/chapterTitle/sectionId/sectionTitle/quote/prefix/suffix/createdAt）
  - `saveNotes(notes: Array) → boolean`
  - `addNote(note) → Array<note>`（返回新数组）
  - `removeNote(id) → Array<note>`
  - `updateNoteLabel(id, label) → Array<note>`
  - `getNotesForPath(pathname) → Array<note>`
  - 常量 `NOTES_KEY = 'book-notes-v1'`

- [ ] **Step 1: 修改 book.toml 注入资源**

将：

```toml
additional-css = ["theme/custom.css"]
```

改为：

```toml
additional-css = ["theme/custom.css", "theme/notes.css"]
additional-js = ["theme/notes.js"]
```

- [ ] **Step 2: 创建 theme/notes.css 骨架**

```css
/* ============================================
   从零开始学 Agent - 在线笔记样式
   ============================================ */

/* 笔记高亮标记 */
.note-highlight {
  background: rgba(250, 204, 21, 0.35);
  box-shadow: inset 3px 0 0 #eab308;
  border-radius: 2px;
  padding: 1px 0;
  cursor: pointer;
  transition: background 0.2s ease;
}
.note-highlight:hover {
  background: rgba(250, 204, 21, 0.55);
}
.note-highlight.note-pulse {
  animation: note-pulse 1.2s ease-out;
}
@keyframes note-pulse {
  0% { background: rgba(250, 204, 21, 0.75); }
  100% { background: rgba(250, 204, 21, 0.35); }
}

/* 暗色主题适配 */
.navy .note-highlight,
.coal .note-highlight,
.ayu .note-highlight {
  background: rgba(250, 204, 21, 0.22);
  box-shadow: inset 3px 0 0 #ca8a04;
}
.navy .note-highlight:hover,
.coal .note-highlight:hover,
.ayu .note-highlight:hover {
  background: rgba(250, 204, 21, 0.38);
}
```

- [ ] **Step 3: 创建 theme/notes.js 数据层**

```js
/* ============================================
   从零开始学 Agent - 在线笔记
   数据存储：localStorage（key: book-notes-v1）
   ============================================ */
(function () {
  'use strict';

  var NOTES_KEY = 'book-notes-v1';
  var PANEL_KEY = 'notes-panel-collapsed';

  // === 数据层 ===
  function loadNotes() {
    try {
      var raw = localStorage.getItem(NOTES_KEY);
      var arr = JSON.parse(raw || '[]');
      if (!Array.isArray(arr)) return [];
      // 容错：缺失字段给默认值
      return arr.filter(function (n) {
        return n && typeof n === 'object' && n.id && n.quote;
      }).map(function (n) {
        return {
          id: String(n.id),
          label: String(n.label || '未命名'),
          chapterPath: String(n.chapterPath || ''),
          chapterTitle: String(n.chapterTitle || ''),
          sectionId: String(n.sectionId || ''),
          sectionTitle: String(n.sectionTitle || ''),
          quote: String(n.quote || ''),
          prefix: String(n.prefix || ''),
          suffix: String(n.suffix || ''),
          createdAt: Number(n.createdAt) || 0
        };
      });
    } catch (e) {
      console.warn('[notes] 读取笔记失败', e);
      return [];
    }
  }

  function saveNotes(notes) {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      return true;
    } catch (e) {
      console.warn('[notes] 保存笔记失败', e);
      return false;
    }
  }

  function genId() {
    return 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  function addNote(note) {
    var notes = loadNotes();
    notes.push(note);
    saveNotes(notes);
    return notes;
  }

  function removeNote(id) {
    var notes = loadNotes().filter(function (n) { return n.id !== id; });
    saveNotes(notes);
    return notes;
  }

  function updateNoteLabel(id, label) {
    var notes = loadNotes();
    notes.forEach(function (n) {
      if (n.id === id) n.label = label;
    });
    saveNotes(notes);
    return notes;
  }

  function getNotesForPath(pathname) {
    return loadNotes().filter(function (n) {
      return n.chapterPath === pathname;
    });
  }

  function isZhPage() {
    return (document.documentElement.lang || '').indexOf('zh') === 0;
  }

  // === 启动入口（后续任务在此追加初始化调用） ===
  function init() {
    // Task 3/4/5/6/7/8 依次填充
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 4: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build && grep -c 'notes' book/zh/index.html`
Expected: node 无输出（语法 OK）；build 完成；grep 计数 ≥ 2（notes.css 与 notes.js 均已注入产物 HTML）。

- [ ] **Step 5: Commit**

```bash
git add book.toml theme/notes.css theme/notes.js
git commit -m "feat: 笔记功能骨架——book.toml 注入 + 数据层"
```

---

### Task 2: 文本查找与高亮渲染

**Files:**
- Modify: `theme/notes.js`（在数据层之后、`init` 之前插入）

**Interfaces:**
- Consumes: Task 1 的 `getNotesForPath`
- Produces:
  - `buildTextIndex(rootEl) → { text: string, offsets: Array<{node, start}> }` — 把 root 下所有可见文本节点拼成字符串并记录每个节点在拼接串中的起始偏移
  - `findMatch(index, prefix, quote, suffix) → { start, end } | null` — 优先 `prefix+quote+suffix`，退回 `quote`（取第一处）；start/end 为拼接串内偏移
  - `renderHighlight(index, match, noteId)` — 用 Range 把 [start,end) 包进 `<mark class="note-highlight" data-note-id="...">`（跨节点时逐段包裹）
  - `renderPageNotes()` — 当前页所有笔记的恢复入口（init 调用）
  - CSS class `note-highlight`（Task 1 已定义）

- [ ] **Step 1: 在 notes.js 中实现文本索引与查找**

插入到 `isZhPage` 函数之后：

```js
  // === 文本查找与高亮渲染 ===
  // 收集 root 下的文本节点，拼成整串并记录偏移映射
  function buildTextIndex(rootEl) {
    if (!rootEl) return null;
    var walker = document.createTreeWalker(
      rootEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var p = node.parentElement;
          // 跳过已有标记与脚本样式
          if (p && (p.closest('script, style, .note-highlight'))) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    var text = '';
    var offsets = [];
    var node;
    while ((node = walker.nextNode())) {
      offsets.push({ node: node, start: text.length });
      text += node.nodeValue;
    }
    return { text: text, offsets: offsets };
  }

  function normalizeSpace(s) {
    return s.replace(/\s+/g, ' ');
  }

  // 在拼接串中定位 quote；带 prefix/suffix 消歧，失败退回仅 quote
  function findMatch(index, prefix, quote, suffix) {
    if (!index || !quote) return null;
    var hay = normalizeSpace(index.text);
    var q = normalizeSpace(quote);
    if (!q) return null;
    var probe = null;
    if (prefix || suffix) {
      probe = normalizeSpace(prefix) + q + normalizeSpace(suffix);
      var i = hay.indexOf(probe);
      if (i >= 0) {
        // quote 在 probe 中的起点（prefix 可能被空白折叠改变长度，改用从尾部推算更稳）
        var qStart = i + normalizeSpace(prefix).length;
        return { start: qStart, end: qStart + q.length, hay: hay };
      }
    }
    var j = hay.indexOf(q);
    if (j >= 0) return { start: j, end: j + q.length, hay: hay };
    return null;
  }
```

注意：`findMatch` 返回的 start/end 是**折叠空白后的字符串**中的偏移。因为渲染时需要映射回真实 DOM 文本节点，第二步 `renderHighlight` 内部会重建「折叠位置 → 原始位置」的映射（见下）。这是实现的关键难点，代码已处理。

- [ ] **Step 2: 实现跨节点包裹渲染**

接在上面的代码后面：

```js
  // 把折叠空白串中的 [start,end) 映射回原始文本节点区间并包裹 <mark>
  function renderHighlight(index, match, noteId) {
    var hay = match.hay;
    // 1. 构建「折叠串位置 → 原始串位置」映射
    var raw = index.text;
    var map = []; // map[collapsedPos] = rawPos
    var cp = 0, rp = 0;
    var lastWasSpace = true; // 开头空白折叠掉
    while (rp < raw.length) {
      var ch = raw[rp];
      if (/\s/.test(ch)) {
        if (!lastWasSpace) { map[cp++] = rp; lastWasSpace = true; }
        // 连续空白只保留一个映射点
        rp++;
        while (rp < raw.length && /\s/.test(raw[rp])) rp++;
      } else {
        map[cp++] = rp;
        lastWasSpace = false;
        rp++;
      }
    }
    map[cp] = raw.length; // 哨兵

    // 2. 折叠区间 → 原始区间
    var rawStart = map[match.start] !== undefined ? map[match.start] : -1;
    var rawEnd = map[match.end] !== undefined ? map[match.end] : raw.length;
    if (rawStart < 0) return false;

    // 3. 原始偏移 → 文本节点区间列表
    var offsets = index.offsets;
    var segments = [];
    for (var k = 0; k < offsets.length; k++) {
      var seg = offsets[k];
      var segEnd = (k + 1 < offsets.length) ? offsets[k + 1].start : raw.length;
      if (segEnd <= rawStart) continue;
      if (seg.start >= rawEnd) break;
      var s = Math.max(seg.start, rawStart) - seg.start;
      var e = Math.min(segEnd, rawEnd) - seg.start;
      if (e > s) segments.push({ node: seg.node, s: s, e: e });
    }

    // 4. 逐段包裹（从后往前，避免修改 DOM 使引用失效）
    for (var m = segments.length - 1; m >= 0; m--) {
      var sg = segments[m];
      var range = document.createRange();
      range.setStart(sg.node, sg.s);
      range.setEnd(sg.node, sg.e);
      var mark = document.createElement('mark');
      mark.className = 'note-highlight';
      mark.setAttribute('data-note-id', noteId);
      try {
        range.surroundContents(mark);
      } catch (err) {
        // 节点边界特殊情况：退化用 extractContents 包裹
        var frag = range.extractContents();
        mark.appendChild(frag);
        range.insertNode(mark);
      }
    }
    return segments.length > 0;
  }

  // 当前页恢复所有笔记高亮
  function renderPageNotes() {
    var content = document.querySelector('#mdbook-content main') || document.querySelector('.content main');
    if (!content) return;
    var notes = getNotesForPath(window.location.pathname);
    if (!notes.length) return;
    var index = buildTextIndex(content);
    if (!index) return;
    notes.forEach(function (note) {
      var match = findMatch(index, note.prefix, note.quote, note.suffix);
      if (match) {
        renderHighlight(index, match, note.id);
      }
      // 定位失败：静默跳过（spec 规定）
    });
  }
```

- [ ] **Step 3: 在 init 中调用**

将 `init` 函数改为：

```js
  function init() {
    renderPageNotes();
  }
```

- [ ] **Step 4: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build`
Expected: 均通过。

- [ ] **Step 5: 浏览器验证（手动）**

用 `./serve.sh 3003` 启动（若已在跑则手动 `mdbook build` 后刷新）。在控制台执行：

```js
localStorage.setItem('book-notes-v1', JSON.stringify([{
  id: 'n_test1', label: '测试', chapterPath: location.pathname,
  chapterTitle: '测试章', sectionId: '小结', sectionTitle: '小结',
  quote: '文本分割是 RAG 质量的关键', prefix: '', suffix: '', createdAt: Date.now()
}]));
location.reload();
```

打开 `/zh/chapter_rag/02_document_loading.html`，预期：「文本分割是 RAG 质量的关键」出现黄色高亮（该文字在页面正文里，行内含 `--` 等符号也不影响）。

- [ ] **Step 6: Commit**

```bash
git add theme/notes.js
git commit -m "feat: 笔记文本定位与高亮渲染"
```

---

### Task 3: 右键创建浮层

**Files:**
- Modify: `theme/notes.js`
- Modify: `theme/notes.css`

**Interfaces:**
- Consumes: Task 1 `addNote`/`genId`/`isZhPage`；Task 2 `buildTextIndex`/`findMatch`/`renderHighlight`；CSS `note-highlight`
- Produces:
  - `initCreatePopup()` — init 调用，挂 contextmenu 监听
  - `selectionToNoteFields(contentRoot, selection) → { quote, prefix, suffix, sectionId, sectionTitle } | null` — 供创建用；quote ≤ 200 字截断，prefix/suffix 各取 32 字
  - CSS：`.note-popup`（浮层）、`.note-popup-input`、`.note-popup-actions`、`.note-popup-btn`、`.note-popup-btn.primary`

- [ ] **Step 1: notes.css 追加浮层样式**

在文件末尾追加：

```css
/* 创建笔记浮层 */
.note-popup {
  position: absolute;
  z-index: 10001;
  width: 260px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg, #fff);
  color: var(--fg, #333);
  border: 1px solid rgba(128, 128, 128, 0.3);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  font-size: 0.85rem;
}
.note-popup-label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
}
.note-popup-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 6px;
  font-size: 0.85rem;
  background: var(--searchbar-bg, #fff);
  color: var(--fg, #333);
  outline: none;
}
.note-popup-input:focus {
  border-color: var(--links, #3783eb);
}
.note-popup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.note-popup-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(128, 128, 128, 0.4);
  background: transparent;
  color: var(--fg, #333);
  cursor: pointer;
  font-size: 0.8rem;
}
.note-popup-btn.primary {
  background: var(--links, #3783eb);
  border-color: var(--links, #3783eb);
  color: #fff;
}
.note-popup-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 2: notes.js 实现选区解析与浮层**

插入到 `renderPageNotes` 之后：

```js
  // === 右键创建浮层 ===
  // 从选区提取笔记字段（quote/prefix/suffix/所在小节）
  function selectionToNoteFields(contentRoot, selection) {
    var range = selection.getRangeAt(0);
    if (!contentRoot.contains(range.commonAncestorContainer)) return null;
    var quote = selection.toString().replace(/\s+/g, ' ').trim();
    if (!quote) return null;
    if (quote.length > 200) quote = quote.slice(0, 200);

    // 用 buildTextIndex 找选区在拼接串中的位置，取前后文
    var index = buildTextIndex(contentRoot);
    if (!index) return null;
    // 在 index.text（原始空白）中直接 indexOf 选区首尾句子片段
    var head = quote.slice(0, 30);
    var pos = index.text.indexOf(head);
    var prefix = '', suffix = '';
    if (pos >= 0) {
      prefix = index.text.slice(Math.max(0, pos - 32), pos).replace(/\s+/g, ' ').trim();
      var endGuess = index.text.indexOf(quote.slice(-30), pos) ;
      var qEnd = endGuess >= 0 ? endGuess + quote.slice(-30).length : pos + 30;
      suffix = index.text.slice(qEnd, qEnd + 32).replace(/\s+/g, ' ').trim();
    }

    // 所在小节：向上找最近的 h2/h3
    var node = range.startContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    var section = null;
    while (el && contentRoot.contains(el)) {
      var prev = el.previousElementSibling;
      // 简化：遍历 content 中所有 h2/h3，找选区位置之前最近的
      break;
    }
    // 实现：收集所有标题，找选区起点之前最后一个
    var headings = contentRoot.querySelectorAll('h2[id], h3[id]');
    var rangeStart = getOffsetInContent(contentRoot, range);
    var sectionId = '', sectionTitle = '';
    for (var i = headings.length - 1; i >= 0; i--) {
      var h = headings[i];
      if (getOffsetInContent(contentRoot, h) <= rangeStart) {
        sectionId = h.id;
        sectionTitle = h.textContent.replace(/\s*#\s*$/, '').trim();
        break;
      }
    }
    return { quote: quote, prefix: prefix, suffix: suffix, sectionId: sectionId, sectionTitle: sectionTitle };
  }

  // 元素/位置在 content 拼接文本中的偏移（用于比较标题与选区先后）
  function getOffsetInContent(contentRoot, target) {
    var index = buildTextIndex(contentRoot);
    if (!index) return 0;
    var offsets = index.offsets;
    if (target.nodeType === 1) {
      // 元素：取其内部第一个文本节点位置
      var w = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      var t = w.nextNode();
      if (!t) return 0;
      for (var i = 0; i < offsets.length; i++) {
        if (offsets[i].node === t) return offsets[i].start;
      }
      return 0;
    }
    // 文本节点
    for (var j = 0; j < offsets.length; j++) {
      if (offsets[j].node === target) return offsets[j].start + target.offset;
    }
    return 0;
  }
```

上面 `selectionToNoteFields` 中有一段冗余的 `while` 死代码（`var node = ...` 到第一个 `break`），**实际写入时删掉**，直接用后面的 `headings` 循环实现。此段仅示意推导过程，最终以精简版为准：

```js
  function selectionToNoteFields(contentRoot, selection) {
    var range = selection.getRangeAt(0);
    if (!contentRoot.contains(range.commonAncestorContainer)) return null;
    var quote = selection.toString().replace(/\s+/g, ' ').trim();
    if (!quote) return null;
    if (quote.length > 200) quote = quote.slice(0, 200);

    var index = buildTextIndex(contentRoot);
    if (!index) return null;
    var head = quote.slice(0, 30);
    var pos = index.text.indexOf(head);
    var prefix = '', suffix = '';
    if (pos >= 0) {
      prefix = index.text.slice(Math.max(0, pos - 32), pos).replace(/\s+/g, ' ').trim();
      var tail = quote.slice(-30);
      var endGuess = index.text.indexOf(tail, pos);
      var qEnd = endGuess >= 0 ? endGuess + tail.length : pos + 30;
      suffix = index.text.slice(qEnd, qEnd + 32).replace(/\s+/g, ' ').trim();
    }

    var headings = contentRoot.querySelectorAll('h2[id], h3[id]');
    var rangeStart = getOffsetInContent(contentRoot, range.startContainer) +
      (range.startContainer.nodeType === 3 ? range.startOffset : 0);
    var sectionId = '', sectionTitle = '';
    for (var i = headings.length - 1; i >= 0; i--) {
      var h = headings[i];
      if (getOffsetInContent(contentRoot, h) <= rangeStart) {
        sectionId = h.id;
        sectionTitle = h.textContent.replace(/\s*#\s*$/, '').trim();
        break;
      }
    }
    return { quote: quote, prefix: prefix, suffix: suffix, sectionId: sectionId, sectionTitle: sectionTitle };
  }
```

继续浮层主体：

```js
  function initCreatePopup() {
    var content = document.querySelector('#mdbook-content main') || document.querySelector('.content main');
    if (!content) return;

    var popup = null;

    function closePopup() {
      if (popup) { popup.remove(); popup = null; }
      document.removeEventListener('mousedown', onDocDown, true);
    }

    function onDocDown(e) {
      if (popup && !popup.contains(e.target)) closePopup();
    }

    content.addEventListener('contextmenu', function (e) {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return; // 无选区 → 放行原生菜单
      e.preventDefault();
      closePopup();

      var fields = selectionToNoteFields(content, sel);
      if (!fields) return;

      var isZh = isZhPage();
      popup = document.createElement('div');
      popup.className = 'note-popup';
      var label = document.createElement('label');
      label.className = 'note-popup-label';
      label.textContent = isZh ? '标记名' : 'Note label';
      var input = document.createElement('input');
      input.className = 'note-popup-input';
      input.maxLength = 30;
      input.value = fields.quote.slice(0, 12);
      var actions = document.createElement('div');
      actions.className = 'note-popup-actions';
      var cancel = document.createElement('button');
      cancel.className = 'note-popup-btn';
      cancel.textContent = isZh ? '取消' : 'Cancel';
      var ok = document.createElement('button');
      ok.className = 'note-popup-btn primary';
      ok.textContent = isZh ? '确认' : 'Confirm';

      actions.appendChild(cancel);
      actions.appendChild(ok);
      popup.appendChild(label);
      popup.appendChild(input);
      popup.appendChild(actions);
      document.body.appendChild(popup);

      // 定位：鼠标右下方，防止溢出视口
      var x = Math.min(e.clientX + 12, window.innerWidth - 280);
      var y = Math.min(e.clientY + 12, window.innerHeight - 140);
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';

      input.focus();
      input.select();

      function confirmCreate() {
        var name = input.value.trim();
        if (!name) return;
        var range = sel.getRangeAt(0);
        // 保存选区端点（sel 在 focus 移动后可能失效，重新设置）
        var savedRange = document.createRange();
        savedRange.setStart(range.startContainer, range.startOffset);
        savedRange.setEnd(range.endContainer, range.endOffset);

        var chapterTitleEl = content.querySelector('h1');
        var note = {
          id: genId(),
          label: name,
          chapterPath: window.location.pathname,
          chapterTitle: chapterTitleEl ? chapterTitleEl.textContent.trim() : '',
          sectionId: fields.sectionId,
          sectionTitle: fields.sectionTitle,
          quote: fields.quote,
          prefix: fields.prefix,
          suffix: fields.suffix,
          createdAt: Date.now()
        };
        addNote(note);
        // 直接对当前选区包裹高亮（不必重新查找）
        var index = buildTextIndex(content);
        if (index) {
          var m = findMatch(index, note.prefix, note.quote, note.suffix);
          if (m) renderHighlight(index, m, note.id);
        }
        closePopup();
        sel.removeAllRanges();
        if (window.__notesPanelRefresh) window.__notesPanelRefresh();
      }

      ok.addEventListener('click', confirmCreate);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') confirmCreate();
        if (ev.key === 'Escape') closePopup();
      });
      cancel.addEventListener('click', closePopup);
      document.addEventListener('mousedown', onDocDown, true);
    });
  }
```

`init` 改为：

```js
  function init() {
    renderPageNotes();
    initCreatePopup();
  }
```

- [ ] **Step 3: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build`
Expected: 通过。

- [ ] **Step 4: 浏览器验证（手动）**

打开 `/zh/chapter_rag/02_document_loading.html`：
1. 选中一句正文 → 右键 → 出现浮层（非浏览器原生菜单），输入框预填前 12 字；
2. 清空输入框 → 确认按钮禁用（尝试点击无效）；
3. 输入「测试A」→ 确认 → 浮层关闭，选区变黄色高亮；
4. `localStorage.getItem('book-notes-v1')` 包含 label「测试A」的记录，sectionId 非空；
5. 无选区右键 → 正常浏览器菜单。

- [ ] **Step 5: Commit**

```bash
git add theme/notes.js theme/notes.css
git commit -m "feat: 选中文字右键创建笔记浮层"
```

---

### Task 4: 左侧笔记面板（列表 / 分组 / 收放）

**Files:**
- Modify: `theme/notes.js`
- Modify: `theme/notes.css`

**Interfaces:**
- Consumes: Task 1 全部数据层函数、`PANEL_KEY`、`isZhPage`；CSS 变量 `--sidebar-width`
- Produces:
  - `initPanel()` — init 调用
  - `refreshPanel()` — 全量重建面板列表（Task 3 创建后经 `window.__notesPanelRefresh` 调用；Task 7/8 编辑删除导入后也调用）
  - `window.__notesPanelRefresh = refreshPanel`（跨区块通信）
  - CSS：`#notes-panel`、`.np-header`、`.np-title`、`.np-badge`、`.np-btns`、`.np-icon-btn`、`.np-list`、`.np-group`、`.np-group-title`、`.np-item`、`.np-item-label`、`.np-item-meta`、`.np-item-quote`、`.np-empty`、`#notes-panel-rail`（收起态细条）、`body.notes-panel-open .page-wrapper`（正文让位）

- [ ] **Step 1: notes.css 追加面板样式**

文件末尾追加：

```css
/* ============ 左侧笔记面板 ============ */
#notes-panel {
  position: fixed;
  top: 0;
  bottom: 0;
  left: var(--sidebar-width);
  width: 280px;
  z-index: 500;
  background: var(--sidebar-bg, #fafafa);
  color: var(--sidebar-fg, #333);
  border-right: 1px solid rgba(128, 128, 128, 0.2);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  transition: left 0.3s ease, transform 0.3s ease;
}
#notes-panel.np-hidden {
  transform: translateX(-100%);
  visibility: hidden;
}

/* 收起后的细条 */
#notes-panel-rail {
  position: fixed;
  top: 5rem;
  left: var(--sidebar-width);
  width: 40px;
  padding: 10px 0;
  z-index: 499;
  background: var(--sidebar-bg, #fafafa);
  color: var(--sidebar-fg, #333);
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-left: none;
  border-radius: 0 8px 8px 0;
  cursor: pointer;
  text-align: center;
  font-size: 0.8rem;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
#notes-panel-rail.np-visible { display: flex; }
#notes-panel-rail .np-rail-count {
  background: var(--links, #3783eb);
  color: #fff;
  border-radius: 10px;
  padding: 0 5px;
  font-size: 0.65rem;
  min-width: 14px;
  box-sizing: border-box;
}

/* 面板展开时正文让位 */
body.notes-panel-open #mdbook-page-wrapper,
body.notes-panel-open .page-wrapper {
  margin-inline-start: 280px;
}
@media only screen and (max-width: 1080px) {
  body.notes-panel-open #mdbook-page-wrapper,
  body.notes-panel-open .page-wrapper {
    margin-inline-start: 0;
  }
  #notes-panel, #notes-panel-rail { display: none !important; }
}

/* 面板头部 */
.np-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}
.np-title {
  font-weight: 700;
  font-size: 0.9rem;
  flex: 1;
}
.np-badge {
  background: var(--links, #3783eb);
  color: #fff;
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 0.7rem;
}
.np-btns { display: flex; gap: 2px; }
.np-icon-btn {
  background: transparent;
  border: none;
  color: var(--sidebar-fg, #333);
  cursor: pointer;
  padding: 4px 5px;
  border-radius: 6px;
  font-size: 0.85rem;
  line-height: 1;
}
.np-icon-btn:hover {
  background: rgba(128, 128, 128, 0.15);
}

/* 列表 */
.np-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.np-group-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--sidebar-fg, #555);
  opacity: 0.75;
  padding: 6px 6px 4px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np-group-title::before { content: '▾ '; }
.np-group.np-group-collapsed .np-group-title::before { content: '▸ '; }
.np-group.np-group-collapsed .np-item { display: none; }
.np-item {
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
}
.np-item:hover { background: rgba(128, 128, 128, 0.12); }
.np-item-label {
  font-weight: 600;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 6px;
}
.np-item-label::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #eab308;
  flex-shrink: 0;
}
.np-item-meta {
  font-size: 0.7rem;
  opacity: 0.65;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np-item-quote {
  font-size: 0.75rem;
  opacity: 0.8;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.np-item-actions {
  position: absolute;
  right: 6px;
  top: 6px;
  display: none;
  gap: 2px;
  background: var(--sidebar-bg, #fafafa);
  border-radius: 6px;
}
.np-item:hover .np-item-actions { display: flex; }
.np-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 0.8rem;
  opacity: 0.6;
}
```

- [ ] **Step 2: notes.js 实现面板**

插入到 `initCreatePopup` 之后：

```js
  // === 左侧笔记面板 ===
  function initPanel() {
    // 窄屏不渲染
    if (window.matchMedia('(max-width: 1080px)').matches) return;

    var panel = document.createElement('div');
    panel.id = 'notes-panel';
    var rail = document.createElement('div');
    rail.id = 'notes-panel-rail';
    document.body.appendChild(panel);
    document.body.appendChild(rail);

    var savedCollapsed = false;
    try { savedCollapsed = localStorage.getItem(PANEL_KEY) === '1'; } catch (e) {}

    function applyCollapsed(collapsed) {
      if (collapsed) {
        panel.classList.add('np-hidden');
        rail.classList.add('np-visible');
        document.body.classList.remove('notes-panel-open');
      } else {
        panel.classList.remove('np-hidden');
        rail.classList.remove('np-visible');
        document.body.classList.add('notes-panel-open');
      }
      try { localStorage.setItem(PANEL_KEY, collapsed ? '1' : '0'); } catch (e) {}
      updatePanelPosition();
    }

    // 跟随 sidebar 位置与宽度（含拖拽调宽）
    function updatePanelPosition() {
      var sidebar = document.getElementById('mdbook-sidebar');
      if (!sidebar) return;
      var rect = sidebar.getBoundingClientRect();
      var left = Math.max(rect.right, 0);
      panel.style.left = left + 'px';
      rail.style.left = left + 'px';
    }
    window.addEventListener('resize', updatePanelPosition);
    if ('ResizeObserver' in window) {
      new ResizeObserver(updatePanelPosition).observe(sidebarEl());
    }
    function sidebarEl() { return document.getElementById('mdbook-sidebar'); }
    // 侧栏 transform 动画结束后刷新位置
    sidebarEl().addEventListener('transitionend', updatePanelPosition);

    var collapseBtn = null;
    // 头部
    var header = document.createElement('div');
    header.className = 'np-header';
    var title = document.createElement('span');
    title.className = 'np-title';
    title.textContent = isZhPage() ? '我的笔记' : 'My Notes';
    var badge = document.createElement('span');
    badge.className = 'np-badge';
    var btns = document.createElement('span');
    btns.className = 'np-btns';

    function iconBtn(symbol, titleText, onClick) {
      var b = document.createElement('button');
      b.className = 'np-icon-btn';
      b.type = 'button';
      b.innerHTML = symbol;
      b.title = titleText;
      b.setAttribute('aria-label', titleText);
      b.addEventListener('click', onClick);
      btns.appendChild(b);
      return b;
    }

    collapseBtn = iconBtn('‹', isZhPage() ? '收起面板' : 'Collapse panel', function () {
      applyCollapsed(true);
    });
    iconBtn('⇩', isZhPage() ? '导出笔记' : 'Export notes', function () {
      if (window.__notesExport) window.__notesExport();
    });
    iconBtn('⇧', isZhPage() ? '导入笔记' : 'Import notes', function () {
      if (window.__notesImport) window.__notesImport();
    });

    header.appendChild(title);
    header.appendChild(badge);
    header.appendChild(btns);
    panel.appendChild(header);

    var list = document.createElement('div');
    list.className = 'np-list';
    panel.appendChild(list);

    rail.addEventListener('click', function () { applyCollapsed(false); });
    rail.innerHTML = '<span>✎</span><span class="np-rail-count">0</span>';
    rail.title = isZhPage() ? '展开笔记面板' : 'Expand notes panel';

    // 全量重建列表
    function refreshPanel() {
      var notes = loadNotes();
      badge.textContent = String(notes.length);
      rail.querySelector('.np-rail-count').textContent = String(notes.length);
      list.innerHTML = '';

      if (!notes.length) {
        var empty = document.createElement('div');
        empty.className = 'np-empty';
        empty.textContent = isZhPage()
          ? '阅读时选中文字右键即可记笔记'
          : 'Select text and right-click while reading to add a note';
        list.appendChild(empty);
        return;
      }

      // 按章节分组（保持添加顺序）
      var groups = [];
      var byPath = {};
      notes.forEach(function (n) {
        if (!byPath[n.chapterPath]) {
          byPath[n.chapterPath] = { path: n.chapterPath, title: n.chapterTitle || n.chapterPath, items: [] };
          groups.push(byPath[n.chapterPath]);
        }
        byPath[n.chapterPath].items.push(n);
      });

      groups.forEach(function (g) {
        var group = document.createElement('div');
        group.className = 'np-group';
        var gt = document.createElement('div');
        gt.className = 'np-group-title';
        gt.textContent = g.title;
        gt.title = g.title;
        gt.addEventListener('click', function () {
          group.classList.toggle('np-group-collapsed');
        });
        group.appendChild(gt);
        g.items.forEach(function (n) {
          var item = document.createElement('div');
          item.className = 'np-item';
          item.dataset.noteId = n.id;

          var lab = document.createElement('div');
          lab.className = 'np-item-label';
          lab.textContent = n.label;
          var meta = document.createElement('div');
          meta.className = 'np-item-meta';
          meta.textContent = n.sectionTitle || n.chapterTitle || '';
          meta.title = meta.textContent;
          var quo = document.createElement('div');
          quo.className = 'np-item-quote';
          quo.textContent = n.quote.slice(0, 60);
          quo.title = n.quote;
          item.appendChild(lab);
          item.appendChild(meta);
          item.appendChild(quo);

          var acts = document.createElement('div');
          acts.className = 'np-item-actions';
          var editB = document.createElement('button');
          editB.className = 'np-icon-btn';
          editB.innerHTML = '✎';
          editB.title = isZhPage() ? '编辑标签名' : 'Edit label';
          var delB = document.createElement('button');
          delB.className = 'np-icon-btn';
          delB.innerHTML = '🗑';
          delB.title = isZhPage() ? '删除笔记' : 'Delete note';
          acts.appendChild(editB);
          acts.appendChild(delB);
          item.appendChild(acts);

          // 点击跳转（Task 6 接管：先占位为空操作）
          item.addEventListener('click', function (e) {
            if (e.target.closest('.np-item-actions')) return;
            if (window.__notesNavigate) window.__notesNavigate(n);
          });
          // 编辑（Task 7 接管：占位）
          editB.addEventListener('click', function () {
            if (window.__notesEditLabel) window.__notesEditLabel(n);
          });
          // 删除（Task 7 接管：占位）
          delB.addEventListener('click', function () {
            if (window.__notesDelete) window.__notesDelete(n);
          });

          group.appendChild(item);
        });
        list.appendChild(group);
      });
    }

    window.__notesPanelRefresh = refreshPanel;
    refreshPanel();
    applyCollapsed(savedCollapsed);
    // 延迟一次：sidebar transform 初值稳定后再校准
    requestAnimationFrame(updatePanelPosition);
  }
```

`init` 改为：

```js
  function init() {
    renderPageNotes();
    initCreatePopup();
    initPanel();
  }
```

- [ ] **Step 3: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build`
Expected: 通过。

- [ ] **Step 4: 浏览器验证（手动）**

1. 打开任意章节页：左侧出现「我的笔记」面板（此时若 localStorage 有 Task 3 创建的笔记，按章节分组显示；无则显示空态文案）；
2. 正文整体右移 280px，不与面板重叠；
3. 点击头部 `‹` → 面板收起，出现细条（含计数徽章），正文恢复位置；
4. 点击细条 → 面板展开；
5. 刷新页面 → 收起/展开状态保持；
6. 点击左侧书籍目录的收起按钮（html class 变化）→ 笔记面板跟随移动不悬空。

- [ ] **Step 5: Commit**

```bash
git add theme/notes.js theme/notes.css
git commit -m "feat: 左侧笔记面板——分组列表与收放"
```

---

### Task 5: 点击笔记跳转定位

**Files:**
- Modify: `theme/notes.js`

**Interfaces:**
- Consumes: Task 1 `loadNotes`、`getNotesForPath`；Task 2 `buildTextIndex`/`findMatch`/`renderHighlight`；CSS `note-pulse`；Task 4 面板 item 的 click → `window.__notesNavigate(note)`
- Produces: `initNavigation()` — 定义 `window.__notesNavigate(note)`；`initHighlightClick()` — 页面高亮标记点击脉冲
  - 定位算法：同页 → 直接查找滚动；跨页 → `sessionStorage.setItem('notes-pending-nav', JSON.stringify({id, ts}))` 后 `location.href = chapterPath`，目标页 init 时检查并消费

- [ ] **Step 1: notes.js 实现跳转**

插入到 `initPanel` 之后：

```js
  // === 点击笔记跳转定位 ===
  var PENDING_NAV_KEY = 'notes-pending-nav';

  function scrollToHighlight() {
    var marks = document.querySelectorAll('.note-highlight');
    if (!marks.length) return false;
    var target = marks[0];
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('note-pulse');
    setTimeout(function () { target.classList.remove('note-pulse'); }, 1300);
    return true;
  }

  // 笔记点击 → 跳到对应页面并定位
  function navigateToNote(note) {
    var here = window.location.pathname;
    if (note.chapterPath !== here) {
      // 跨页：写入 pending 标记后跳转，目标页 init 时消费
      try {
        sessionStorage.setItem(PENDING_NAV_KEY, JSON.stringify({ id: note.id, ts: Date.now() }));
      } catch (e) {}
      var url = note.chapterPath;
      fetch(url, { method: 'HEAD' }).then(function (res) {
        window.location.href = res.ok ? url : here; // 404 时留在本页（见下方提示）
        if (!res.ok) alert(isZhPage() ? '原页面已不存在' : 'The original page no longer exists');
      }).catch(function () {
        window.location.href = url; // 本地服务可能不支持 HEAD，直接跳
      });
      return;
    }
    // 同页：查找并滚动
    var mark = document.querySelector('.note-highlight[data-note-id="' + cssEscape(note.id) + '"]');
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      mark.classList.add('note-pulse');
      setTimeout(function () { mark.classList.remove('note-pulse'); }, 1300);
      return;
    }
    // 高亮缺失（漂移）：尝试实时查找，再退回小节标题
    var content = document.querySelector('#mdbook-content main') || document.querySelector('.content main');
    if (content) {
      var index = buildTextIndex(content);
      var m = index && findMatch(index, note.prefix, note.quote, note.suffix);
      if (m && renderHighlight(index, m, note.id)) {
        scrollToHighlight();
        return;
      }
      if (note.sectionId) {
        var h = document.getElementById(note.sectionId);
        if (h) {
          h.scrollIntoView({ behavior: 'smooth', block: 'start' });
          h.classList.add('note-pulse');
          setTimeout(function () { h.classList.remove('note-pulse'); }, 1300);
          return;
        }
      }
    }
    alert(isZhPage() ? '未能定位到笔记原文（内容可能已更新）' : 'Could not locate the note text (content may have changed)');
  }

  function cssEscape(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\\]]/g, '\\$&');
  }

  function initNavigation() {
    window.__notesNavigate = navigateToNote;

    // 页面高亮点击 → 脉冲提示
    document.addEventListener('click', function (e) {
      var mark = e.target.closest('.note-highlight');
      if (mark) {
        mark.classList.add('note-pulse');
        setTimeout(function () { mark.classList.remove('note-pulse'); }, 1300);
      }
    });

    // 消费跨页跳转请求
    try {
      var raw = sessionStorage.getItem(PENDING_NAV_KEY);
      if (raw) {
        sessionStorage.removeItem(PENDING_NAV_KEY);
        var req = JSON.parse(raw);
        if (req && req.id && Date.now() - req.ts < 10000) {
          var notes = loadNotes();
          var note = null;
          notes.forEach(function (n) { if (n.id === req.id) note = n; });
          if (note) {
            setTimeout(function () { navigateToNote(note); }, 300); // 等高亮渲染
          }
        }
      }
    } catch (e) {}
  }
```

`init` 改为：

```js
  function init() {
    renderPageNotes();
    initCreatePopup();
    initPanel();
    initNavigation();
  }
```

- [ ] **Step 2: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build`
Expected: 通过。

- [ ] **Step 3: 浏览器验证（手动）**

1. 在章节 A 创建一条笔记 → 面板中点击 → 高亮滚动到视口中央并脉冲一次；
2. 切到章节 B → 点击面板中章节 A 的笔记 → 跳转到章节 A 并自动滚动定位到高亮；
3. 手动篡改 localStorage 中该笔记的 quote 为不存在文字 → 点击面板笔记 → 滚动到所在小节标题；
4. 把 chapterPath 改成不存在的路径 → 点击 → alert「原页面已不存在」并留在本页。

- [ ] **Step 4: Commit**

```bash
git add theme/notes.js
git commit -m "feat: 点击笔记跳转定位（跨页 + 后备小节标题）"
```

---

### Task 6: 编辑标签名与删除

**Files:**
- Modify: `theme/notes.js`

**Interfaces:**
- Consumes: Task 1 `updateNoteLabel`/`removeNote`；Task 2/5 已有渲染；Task 4 的 `window.__notesEditLabel` / `window.__notesDelete` 占位
- Produces: `initEditDelete()` — 实现 `window.__notesEditLabel(note)`（复用 `.note-popup` 浮层改标签名）与 `window.__notesDelete(note)`（confirm 确认后删 localStorage + 移除页面高亮 + 刷新面板）

- [ ] **Step 1: notes.js 实现**

插入到 `initNavigation` 之后：

```js
  // === 编辑标签名 / 删除 ===
  function initEditDelete() {
    window.__notesEditLabel = function (note) {
      var isZh = isZhPage();
      var popup = document.createElement('div');
      popup.className = 'note-popup';
      popup.style.position = 'fixed';
      popup.style.left = '50%';
      popup.style.top = '30%';
      popup.style.transform = 'translateX(-50%)';
      var label = document.createElement('label');
      label.className = 'note-popup-label';
      label.textContent = isZh ? '修改标记名' : 'Edit label';
      var input = document.createElement('input');
      input.className = 'note-popup-input';
      input.maxLength = 30;
      input.value = note.label;
      var actions = document.createElement('div');
      actions.className = 'note-popup-actions';
      var cancel = document.createElement('button');
      cancel.className = 'note-popup-btn';
      cancel.textContent = isZh ? '取消' : 'Cancel';
      var ok = document.createElement('button');
      ok.className = 'note-popup-btn primary';
      ok.textContent = isZh ? '保存' : 'Save';
      actions.appendChild(cancel);
      actions.appendChild(ok);
      popup.appendChild(label);
      popup.appendChild(input);
      popup.appendChild(actions);
      document.body.appendChild(popup);
      input.focus();
      input.select();

      function save() {
        var name = input.value.trim();
        if (!name) return;
        updateNoteLabel(note.id, name);
        popup.remove();
        document.removeEventListener('mousedown', onDocDown, true);
        if (window.__notesPanelRefresh) window.__notesPanelRefresh();
      }
      function onDocDown(e) { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('mousedown', onDocDown, true); } }

      ok.addEventListener('click', save);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') save();
        if (ev.key === 'Escape') { popup.remove(); document.removeEventListener('mousedown', onDocDown, true); }
      });
      cancel.addEventListener('click', function () { popup.remove(); document.removeEventListener('mousedown', onDocDown, true); });
      document.addEventListener('mousedown', onDocDown, true);
    };

    window.__notesDelete = function (note) {
      var isZh = isZhPage();
      if (!window.confirm(isZh ? '删除笔记「' + note.label + '」？' : 'Delete note "' + note.label + '"?')) return;
      removeNote(note.id);
      // 移除页面上的高亮（unwrap）
      var marks = document.querySelectorAll('.note-highlight[data-note-id="' + cssEscape(note.id) + '"]');
      marks.forEach(function (mark) {
        var parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      });
      if (window.__notesPanelRefresh) window.__notesPanelRefresh();
    };
  }
```

`init` 改为：

```js
  function init() {
    renderPageNotes();
    initCreatePopup();
    initPanel();
    initNavigation();
    initEditDelete();
  }
```

- [ ] **Step 2: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build`
Expected: 通过。

- [ ] **Step 3: 浏览器验证（手动）**

1. 面板中悬停任一笔记 → 出现 ✎/🗑 图标；
2. 点 ✎ → 居中浮层显示原标签名，改成「测试B」保存 → 面板刷新显示新名，localStorage 同步；
3. 点 🗑 → confirm 弹窗 → 确认 → 面板条目消失；若在笔记所在页，页面高亮同时消失且文字恢复正常（无 mark 包裹残留）。

- [ ] **Step 4: Commit**

```bash
git add theme/notes.js
git commit -m "feat: 笔记编辑标签名与删除"
```

---

### Task 7: 导入导出

**Files:**
- Modify: `theme/notes.js`
- Modify: `theme/notes.css`

**Interfaces:**
- Consumes: Task 1 `loadNotes`/`saveNotes`；Task 4 面板按钮占位 `window.__notesExport` / `window.__notesImport`
- Produces: `initImportExport()` — 实现两个函数：
  - 导出：全量数组 → Blob → `book-notes-YYYYMMDD.json` 下载
  - 导入：`<input type=file>` → JSON.parse 校验（数组、每项含 id/label/chapterPath/quote 字符串字段）→ 按 id 去重合并（冲突保留本地）→ 提示「导入 N 条，跳过 M 条重复」→ 刷新面板 + 当前页高亮

- [ ] **Step 1: notes.css 追加导入文件输入的隐藏样式**

文件末尾追加：

```css
/* 导入用隐藏 file input */
#notes-import-input {
  display: none;
}
```

- [ ] **Step 2: notes.js 实现**

插入到 `initEditDelete` 之后：

```js
  // === 导入导出 ===
  function initImportExport() {
    var isZh = isZhPage();

    window.__notesExport = function () {
      var notes = loadNotes();
      if (!notes.length) {
        window.alert(isZh ? '暂无笔记可导出' : 'No notes to export');
        return;
      }
      var d = new Date();
      var pad = function (x) { return (x < 10 ? '0' : '') + x; };
      var fname = 'book-notes-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
      var blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 100);
    };

    window.__notesImport = function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.id = 'notes-import-input';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var imported;
          try {
            imported = JSON.parse(reader.result);
          } catch (e) {
            window.alert(isZh ? '文件格式不正确' : 'Invalid file format');
            return;
          }
          if (!Array.isArray(imported)) {
            window.alert(isZh ? '文件格式不正确' : 'Invalid file format');
            return;
          }
          // 校验必填字段
          imported = imported.filter(function (n) {
            return n && typeof n === 'object' &&
              typeof n.id === 'string' && n.id &&
              typeof n.label === 'string' &&
              typeof n.chapterPath === 'string' &&
              typeof n.quote === 'string' && n.quote;
          });
          var local = loadNotes();
          var localIds = {};
          local.forEach(function (n) { localIds[n.id] = true; });
          var added = 0, skipped = 0;
          imported.forEach(function (n) {
            if (localIds[n.id]) { skipped++; return; }
            local.push({
              id: n.id,
              label: n.label,
              chapterPath: n.chapterPath,
              chapterTitle: String(n.chapterTitle || ''),
              sectionId: String(n.sectionId || ''),
              sectionTitle: String(n.sectionTitle || ''),
              quote: n.quote,
              prefix: String(n.prefix || ''),
              suffix: String(n.suffix || ''),
              createdAt: Number(n.createdAt) || 0
            });
            localIds[n.id] = true;
            added++;
          });
          if (added === 0 && skipped === 0) {
            window.alert(isZh ? '文件中没有有效笔记' : 'No valid notes in file');
            return;
          }
          saveNotes(local);
          if (window.__notesPanelRefresh) window.__notesPanelRefresh();
          // 当前页如有新笔记，补渲染高亮
          renderPageNotes();
          window.alert(isZh
            ? '导入 ' + added + ' 条' + (skipped ? '，跳过 ' + skipped + ' 条重复' : '')
            : 'Imported ' + added + (skipped ? ', skipped ' + skipped + ' duplicates' : ''));
        };
        reader.readAsText(file);
      });
      document.body.appendChild(input);
      input.click();
      setTimeout(function () { input.remove(); }, 5000);
    };
  }
```

`init` 改为：

```js
  function init() {
    renderPageNotes();
    initCreatePopup();
    initPanel();
    initNavigation();
    initEditDelete();
    initImportExport();
  }
```

- [ ] **Step 3: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build`
Expected: 通过。

- [ ] **Step 4: 浏览器验证（手动）**

1. 点面板 ⇩ → 下载 `book-notes-YYYYMMDD.json`，内容为合法 JSON 数组；
2. 删除几条笔记后点 ⇧ 选择刚才的导出文件 → alert「导入 N 条，跳过 M 条重复」，面板恢复；
3. 直接重复导入同一文件 → 全部跳过（N=0）；
4. 导入一个内容为 `{"foo":1}` 的文件 → alert「文件格式不正确」。

- [ ] **Step 5: Commit**

```bash
git add theme/notes.js theme/notes.css
git commit -m "feat: 笔记导入导出 JSON"
```

---

### Task 8: 高亮悬停提示条（标签名 + 删除）

**Files:**
- Modify: `theme/notes.js`
- Modify: `theme/notes.css`

**Interfaces:**
- Consumes: CSS `note-highlight`；Task 1 `loadNotes`/`removeNote`；Task 6 的删除 unwrap 逻辑（此处内联同款实现，直接复用 `window.__notesDelete` 更简——本任务用它）
- Produces: `initHighlightTooltip()` — 悬停高亮显示标签名小条 + 删除按钮；CSS `.note-tip`

- [ ] **Step 1: notes.css 追加提示条样式**

文件末尾追加：

```css
/* 高亮悬停提示条 */
.note-tip {
  position: absolute;
  z-index: 10002;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--fg, #333);
  color: var(--bg, #fff);
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
}
.note-tip button {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0;
}
```

- [ ] **Step 2: notes.js 实现**

插入到 `initImportExport` 之后：

```js
  // === 高亮悬停提示条 ===
  function initHighlightTooltip() {
    var tip = null;
    var hideTimer = null;

    function hideTip() {
      if (tip) { tip.remove(); tip = null; }
    }

    document.addEventListener('mouseover', function (e) {
      var mark = e.target.closest('.note-highlight');
      if (!mark) return;
      clearTimeout(hideTimer);
      hideTip();

      var id = mark.getAttribute('data-note-id');
      var note = null;
      loadNotes().forEach(function (n) { if (n.id === id) note = n; });
      if (!note) return;

      var isZh = isZhPage();
      tip = document.createElement('div');
      tip.className = 'note-tip';
      tip.textContent = note.label;
      var del = document.createElement('button');
      del.innerHTML = '✕';
      del.title = isZh ? '删除' : 'Delete';
      del.addEventListener('click', function () {
        hideTip();
        if (window.__notesDelete) window.__notesDelete(note);
      });
      tip.appendChild(del);

      document.body.appendChild(tip);
      var rect = mark.getBoundingClientRect();
      var top = rect.top - 30;
      if (top < 10) top = rect.bottom + 6;
      tip.style.left = Math.min(rect.left, window.innerWidth - tip.offsetWidth - 10) + 'px';
      tip.style.top = top + window.scrollY + 'px';

      tip.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
      tip.addEventListener('mouseleave', function () { hideTip(); });
    });

    document.addEventListener('mouseout', function (e) {
      if (e.target.closest && e.target.closest('.note-highlight')) {
        hideTimer = setTimeout(hideTip, 300);
      }
    });
  }
```

`init` 改为：

```js
  function init() {
    renderPageNotes();
    initCreatePopup();
    initPanel();
    initNavigation();
    initEditDelete();
    initImportExport();
    initHighlightTooltip();
  }
```

- [ ] **Step 3: 验证语法与构建**

Run: `node --check theme/notes.js && mdbook build`
Expected: 通过。

- [ ] **Step 4: 浏览器验证（手动）**

1. 悬停页面高亮 → 上方出现深色小条显示标签名 + ✕；
2. 鼠标移入小条 → 不消失；点 ✕ → confirm 后删除，小条与高亮消失；
3. 移开鼠标 → 小条约 300ms 后消失。

- [ ] **Step 5: Commit**

```bash
git add theme/notes.js theme/notes.css
git commit -m "feat: 高亮悬停提示条与快捷删除"
```

---

### Task 9: 全量手动验证清单 + 收尾

**Files:**
- 无新文件。仅验证与修复。

**Interfaces:**
- Consumes: 全部前序任务

- [ ] **Step 1: 完整回归（spec 验证清单 8 项）**

执行 `./serve.sh 3003`（或已有服务则 `mdbook build` 后刷新），按 spec 清单逐项验证：

1. 选中文字右键 → 浮层 → 确认 → 高亮出现 + 面板出现该条；
2. 点击面板笔记 → 跨章节跳转 + 高亮定位；
3. 面板折叠/展开，刷新后状态保持；
4. 篡改 localStorage 中 quote → 刷新不高亮，点击退回小节标题；
5. 切换 navy/coal 主题（右上主题菜单）样式正常；
6. 导出 → 清空 localStorage（控制台 `localStorage.removeItem('book-notes-v1')` 后刷新）→ 导入 → 笔记完整恢复；
7. 导入重复/非法文件提示正确；
8. 悬停高亮可删除、面板内可编辑标签名。

补充回归（确保无副作用）：

9. 阅读进度条、回到顶部、右侧「本节目录」、代码块语言标签、语言切换按钮全部正常（head.hbs 既有功能未受影响）；
10. 英文版 `/en/` 页面（`./serve.sh` 完整构建后）浮层与面板显示英文文案；
11. 窗口缩到 <1080px → 笔记面板不渲染，阅读不受影响。

发现的问题：修复 → `node --check` + `mdbook build` → 重新验证相关项。

- [ ] **Step 2: Commit（若有修复）**

```bash
git add -A theme/
git commit -m "fix: 笔记功能回归问题修复"
```

- [ ] **Step 3: 最终确认**

Run: `git log --oneline -8 && git status`
Expected: 本分支包含笔记功能的全部提交，工作区干净（.gitignore 修改除外，属既有变更）。

---

## 实现注意事项（给执行者）

1. **Task 3 中的冗余代码段**：`selectionToNoteFields` 出现两次，第一次带死代码是推导示意，**写入文件时采用第二次的精简版**，二者取其一即可（用精简版）。
2. **空白折叠映射**（Task 2 `renderHighlight` 的 map 构建）是全文最容易出错的地方：先在浏览器控制台用长选区（跨 `<p>`、含行内 `<code>`）测试跨节点包裹。
3. **mdBook 侧栏拖拽**：用户可拖宽侧栏，`--sidebar-width` 随之变化。Task 4 已用 ResizeObserver + transitionend 处理；若面板位置仍偶发不跟随，可额外监听 `document.documentElement` 的 `transitionend`。
4. **`e.target.closest` 兼容**：所有 `closest` 调用的目标若可能是文本节点，先判 `e.target.closest &&`（文本事件目标可为 Element，但保险起见保留判断）。
5. **alert/confirm**：spec 允许原生弹窗（KISS）。若体验不佳，后续可统一替换为非阻塞 toast，不在本期范围。
