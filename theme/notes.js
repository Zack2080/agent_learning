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
