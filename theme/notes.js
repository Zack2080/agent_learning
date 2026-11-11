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

  // === 文本查找与高亮渲染 ===
  // 收集 root 下的文本节点，拼成整串并记录偏移映射
  function buildTextIndex(rootEl) {
    if (!rootEl) return null;
    var walker = document.createTreeWalker(
      rootEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          // 仅剔除完全空的节点；whitespace-only 节点保留，
          // 使拼接串空白分布与 selection.toString() 跨块时的表现一致
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
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
      // 跳过纯空白段：包进 mark 会让 buildTextIndex 过滤后丢失该空白，
      // 导致同会话后续 quote 匹配失败
      if (!/\S/.test(sg.node.nodeValue.slice(sg.s, sg.e))) continue;
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

  // === 右键创建浮层 ===
  // 从选区提取笔记字段（quote/prefix/suffix/所在小节）
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

    // 所在小节：收集所有标题，找选区起点之前最后一个
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
    // 文本节点（仅返回节点起始偏移；节点内偏移由调用方加 startOffset）
    for (var j = 0; j < offsets.length; j++) {
      if (offsets[j].node === target) return offsets[j].start;
    }
    return 0;
  }

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

  // === 启动入口（后续任务在此追加初始化调用） ===
  function init() {
    renderPageNotes();
    initCreatePopup();
    initPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
