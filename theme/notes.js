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
    // 1. 构建「折叠串位置 → 原始串位置」映射（与 normalizeSpace 语义严格对齐：
    //    连续空白折叠为一个空格，每个空白 run——含开头/结尾——都占一个映射点）
    var raw = index.text;
    var map = []; // map[collapsedPos] = rawPos
    var cp = 0, rp = 0;
    while (rp < raw.length) {
      var ch = raw[rp];
      if (/\s/.test(ch)) {
        // 折叠当前空白 run 为一个映射点（无论是否在开头/结尾）
        map[cp++] = rp;
        while (rp < raw.length && /\s/.test(raw[rp])) rp++;
      } else {
        map[cp++] = rp;
        rp++;
      }
    }
    // 尾部若以空白结尾，normalizeSpace 同样保留一个尾随空格——循环已给它映射点；
    // 哨兵（下标 = hay.length）兜住 match.end 越过尾随空格的情况
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
      try {
        var match = findMatch(index, note.prefix, note.quote, note.suffix);
        if (match) {
          renderHighlight(index, match, note.id);
        }
        // 定位失败：静默跳过（spec 规定）
      } catch (e) {
        console.warn('[notes] 渲染单条笔记高亮失败', e);
        // 继续处理下一条
      }
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

  // === 点击笔记跳转定位 ===
  var PENDING_NAV_KEY = 'notes-pending-nav';

  function scrollToHighlight(noteId) {
    var sel = noteId
      ? '.note-highlight[data-note-id="' + cssEscape(noteId) + '"]'
      : '.note-highlight';
    var target = document.querySelector(sel);
    if (!target) return false;
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
        if (!res.ok) {
          try { sessionStorage.removeItem(PENDING_NAV_KEY); } catch (err) {}
          window.alert(isZhPage() ? '原页面已不存在' : 'The original page no longer exists');
          return; // 留在本页，不触发重载
        }
        window.location.href = url;
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
        scrollToHighlight(note.id);
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
              n.chapterPath.indexOf('/') === 0 &&
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

  // === 启动入口（后续任务在此追加初始化调用） ===
  function init() {
    renderPageNotes();
    initCreatePopup();
    initPanel();
    initNavigation();
    initEditDelete();
    initImportExport();
    initHighlightTooltip();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
