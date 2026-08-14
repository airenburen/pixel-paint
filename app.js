(function () {
  "use strict";

  /* ================= 常量与状态 ================= */
  var GRID_MIN = 8, GRID_MAX = 64, THUMB = 24;
  var APP_VERSION = "1.6";   // 应用版本号：关于窗口与状态栏版本戳统一使用此处常量
  // 统一赋值（两处版本号同源）
  document.getElementById("aboutVersion").textContent = "v" + APP_VERSION;
  document.getElementById("buildStamp").innerHTML = "2026-08-04 · <span class=\"ver\">v" + APP_VERSION + "</span>";
  var gridSize = 16;
  var currentColor = "#ffffff";
  var currentAlpha = 255;    // 当前颜色透明度（0-255，由色盘透明度滑块控制）
  var currentTool = "brush";   // brush | eraser | bucket | eyedropper
  var brushSize = 1;           // 画笔/橡皮擦粗细（格子数，1-16）
  var isDrawing = false;
  var strokeStarted = false;
  var activeIdx = 0;           // layers 数组索引（0 = 最底层）
  var activeFolderId = null;   // 当前选中的文件夹 id（null = 单层选中态）
  var layers = [];             // [{id,name,visible,opacity,blend,clipMask,folder,pixels}]
  var folders = [];            // [{id,name,collapsed,visible,pos}] 图层文件夹；pos = 锚定图层 id（文件夹块插在该图层行上方），visible = 文件夹自身可见性（独立于子层），null/图层不存在/是子层 → 末尾区
  var layerSeq = 0;
  var folderSeq = 0;
  var nameSeq = 1;
  var undoStack = [], redoStack = [];
  var thumbDirty = false;
  var opacityDragStarted = false;

  // 缩放 / 平移状态
  var ZOOM_MIN = 0.2, ZOOM_MAX = 8;
  var zoom = 1, panX = 0, panY = 0;             // 目标值（逻辑）
  var curZoom = 1, curPanX = 0, curPanY = 0;   // 渲染值（插值平滑）
  var animId = null;
  var spaceDown = false, isPanning = false, lastPan = { x: 0, y: 0 };
  var selection = null;   // 矩形选区 {x0,y0,x1,y1} 已归一化；null = 无选区（作用于全部）
  var selDrag = null;     // 选区拖拽状态 {mode:"new"|"move", ...}
  var layerDrag = null;   // 图层拖拽排序状态 {idx, startY, moved, insertVisual}
  var layerDragEl = null; // 正在拖拽的图层行元素
  var dropLine = null;    // 插入位置指示线元素
  // 预设色板（经典 / PICO-8 像素风 / VGA 复古 / Web 安全色）
  var PALETTES = {
    classic: ["#111111", "#ffffff", "#e03131", "#ff922b", "#fcc419", "#40c057", "#22b8cf", "#339af0", "#7048e8", "#e64980", "#a98274", "#868e96"],
    pico8: ["#000000", "#1D2B53", "#7E2553", "#008751", "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8", "#FF004D", "#FFA300", "#FFEC27", "#00E436", "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA"],
    vga: ["#000000", "#0000AA", "#00AA00", "#00AAAA", "#AA0000", "#AA00AA", "#AAAA00", "#AAAAAA", "#555555", "#5555FF", "#55FF55", "#55FFFF", "#FF5555", "#FF55FF", "#FFFF55", "#FFFFFF"],
    websafe: ["#000000", "#333333", "#666666", "#999999", "#CCCCCC", "#FFFFFF", "#FF0000", "#FF6600", "#FFCC00", "#FFFF00", "#00FF00", "#00CCFF", "#0000FF", "#9900FF", "#FF00FF", "#FF3399"]
  };
  // 吸管取色时棋盘格空格的底色
  var CHECKER = { r: 62, g: 62, b: 72 };

  var EYE_OPEN = '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_CLOSED = '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M4 4l16 16"/></svg>';
  var CLIP_SVG = '<svg viewBox="0 0 24 24"><path d="M4 4h12v8H4z"/><path d="M12 12l7 7M19 12v7h-7"/></svg>';
  var FOLDER_SVG = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>';
  var DEL_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>';
  var M_UNDO = '<svg viewBox="0 0 24 24"><path d="M4 12l6-6v4h7v4H10v4z"/></svg>';
  var M_REDO = '<svg viewBox="0 0 24 24"><path d="M20 12l-6-6v4H7v4h7v4z"/></svg>';
  var M_SELALL = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" stroke-dasharray="2.5 2"/></svg>';
  var M_DESEL = '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14"/><path d="M8 8l8 8M16 8l-8 8"/></svg>';
  var M_FILL = '<svg viewBox="0 0 24 24"><path d="M5 9h14l-1.5 9a2 2 0 01-2 1.8H8.5a2 2 0 01-2-1.8z"/><path d="M12 3L8.5 6.5a3 3 0 007 0z"/></svg>';
  var M_CLEAR = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
  var M_FLIPH = '<svg viewBox="0 0 24 24"><path d="M3 12h18M9 5l-6 7 6 7M15 5l6 7-6 7"/></svg>';
  var M_FLIPV = '<svg viewBox="0 0 24 24"><path d="M12 3v18M5 9l7-6 7 6M5 15l7 6 7-6"/></svg>';
  var M_EXPORT = '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>';

  /* ================= DOM 引用 ================= */
  var board = document.getElementById("board");
  var layerList = document.getElementById("layerList");
  var brushSizeInput = document.getElementById("brushSize");
  var brushSizeLabel = document.getElementById("brushSizeLabel");
  var gridSizeLabel = document.getElementById("gridSizeLabel");
  var layerOpacityInput = document.getElementById("layerOpacity");
  var layerOpacityLabel = document.getElementById("layerOpacityLabel");
  var palette = document.getElementById("palette");
  var currentColorSwatch = document.getElementById("currentColorSwatch");
  var currentColorHex = document.getElementById("currentColorHex");
  var wheelBase = document.getElementById("wheelBase");
  var wheelCursor = document.getElementById("wheelCursor");
  var wheelValue = document.getElementById("wheelValue");
  var wheelValueLabel = document.getElementById("wheelValueLabel");
  var wheelWrap = document.getElementById("wheelWrap");
  var wheelValueRow = document.getElementById("wheelValueRow");
  var rgbPanel = document.getElementById("rgbPanel");
  var rgbR = document.getElementById("rgbR");
  var colorAlpha = document.getElementById("colorAlpha");
  var colorAlphaLabel = document.getElementById("colorAlphaLabel");
  var rgbG = document.getElementById("rgbG");
  var rgbB = document.getElementById("rgbB");
  var rgbRVal = document.getElementById("rgbRVal");
  var rgbGVal = document.getElementById("rgbGVal");
  var rgbBVal = document.getElementById("rgbBVal");
  var hexInput = document.getElementById("hexInput");
  var hexPreview = document.getElementById("hexPreview");
  var canvasPickBtn = document.getElementById("canvasPickBtn");
  var palettePreset = document.getElementById("palettePreset");
  var blendMode = document.getElementById("blendMode");
  var currentLayerLabel = document.getElementById("currentLayerLabel");
  var statusInfo = document.getElementById("statusInfo");
  var statusTool = document.getElementById("statusTool");
  var undoBtn = document.getElementById("undoBtn");
  var redoBtn = document.getElementById("redoBtn");
  var addLayerBtn = document.getElementById("addLayerBtn");
  var dupLayerBtn = document.getElementById("dupLayerBtn");
  var layerUpBtn = document.getElementById("layerUpBtn");
  var layerDownBtn = document.getElementById("layerDownBtn");
  var delLayerBtn = document.getElementById("delLayerBtn");
  var clearLayerBtn = document.getElementById("clearLayerBtn");
  var toolsPanel = document.getElementById("toolsPanel");
  var menubar = document.getElementById("menubar");
  var viewport = document.getElementById("viewport");
  var boardWrap = document.getElementById("boardWrap");
  var zoomLabel = document.getElementById("zoomLabel");
  var settingsOverlay = document.getElementById("settingsOverlay");
  var aboutOverlay = document.getElementById("aboutOverlay");
  var settingsResetBtn = document.getElementById("settingsReset");
  var settingsOkBtn = document.getElementById("settingsOk");
  var aboutOkBtn = document.getElementById("aboutOk");
  var setShowGrid = document.getElementById("setShowGrid");
  var setChecker = document.getElementById("setChecker");
  var setUndoLimit = document.getElementById("setUndoLimit");
  var setZoomStep = document.getElementById("setZoomStep");
  var setDefaultGrid = document.getElementById("setDefaultGrid");
  var setCheckerTone = document.getElementById("setCheckerTone");
  var setSmoothness = document.getElementById("setSmoothness");
  var setTheme = document.getElementById("setTheme");
  var setLang = document.getElementById("setLang");
  var setClickDeselect = document.getElementById("setClickDeselect");
  var addFolderBtn = document.getElementById("addFolderBtn");
  var panelResizer = document.getElementById("panelResizer");
  var sidePanelsEl = document.querySelector(".side-panels");
  var helpOverlay = document.getElementById("helpOverlay");
  var helpOkBtn = document.getElementById("helpOk");
  var adjustOverlay = document.getElementById("adjustOverlay");
  var adjTarget = document.getElementById("adjTarget");
  var adjHue = document.getElementById("adjHue");
  var adjSat = document.getElementById("adjSat");
  var adjBright = document.getElementById("adjBright");
  var adjContrast = document.getElementById("adjContrast");
  var adjHueVal = document.getElementById("adjHueVal");
  var adjSatVal = document.getElementById("adjSatVal");
  var adjBrightVal = document.getElementById("adjBrightVal");
  var adjContrastVal = document.getElementById("adjContrastVal");
  var adjApply = document.getElementById("adjApply");
  var adjCancel = document.getElementById("adjCancel");
  var projectFile = document.getElementById("projectFile");
  var exportOverlay = document.getElementById("exportOverlay");
  var exportCellSelect = document.getElementById("exportCellSelect");
  var exportBgSelect = document.getElementById("exportBgSelect");
  var exportOkBtn = document.getElementById("exportOk");
  var exportCancelBtn = document.getElementById("exportCancel");
  var confirmOverlay = document.getElementById("confirmOverlay");
  var confirmTitle = document.getElementById("confirmTitle");
  var confirmText = document.getElementById("confirmText");
  var confirmOkBtn = document.getElementById("confirmOk");
  var confirmCancelBtn = document.getElementById("confirmCancel");
  var confirmCallback = null;

  /* ================= 颜色工具 ================= */
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function rgbaStr(c) {
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + Math.round((c.a / 255) * 1000) / 1000 + ")";
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min, h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s, v: v };
  }
  function hsvToRgb(h, s, v) {
    var hp = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs(((hp / 60) % 2) - 1)), m = v - c;
    var r = 0, g = 0, b = 0;
    var seg = Math.floor(hp / 60);
    if (seg === 0) { r = c; g = x; }
    else if (seg === 1) { r = x; g = c; }
    else if (seg === 2) { g = c; b = x; }
    else if (seg === 3) { g = x; b = c; }
    else if (seg === 4) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }
  function hsvToHex(h, s, v) { var rgb = hsvToRgb(h, s, v); return rgbToHex(rgb.r, rgb.g, rgb.b); }
  function hexToHsv(hex) { var rgb = hexToRgb(hex); return rgbToHsv(rgb.r, rgb.g, rgb.b); }
  function sameColor(a, b) { return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a; }

  /* ================= 图层数据 ================= */
  function nCells() { return gridSize * gridSize; }
  function makePixels() { return new Uint8ClampedArray(nCells() * 4); }
  function readPx(layer, idx, out) {
    var o = idx * 4;
    out.r = layer.pixels[o]; out.g = layer.pixels[o + 1]; out.b = layer.pixels[o + 2]; out.a = layer.pixels[o + 3];
    return out;
  }
  function writePx(layer, idx, c) {
    var o = idx * 4;
    layer.pixels[o] = c.r; layer.pixels[o + 1] = c.g; layer.pixels[o + 2] = c.b; layer.pixels[o + 3] = c.a;
  }
  function createLayerNamed(name) {
    return { id: ++layerSeq, name: name, visible: true, opacity: 100, blend: "normal", clipMask: false, locked: false, folder: null, pixels: makePixels() };
  }
  function newLayerName() { return t("layer.name") + " " + (nameSeq++); }

  /* ================= 撤销 / 重做 ================= */
  function snapshot() {
    return {
      layers: layers.map(function (l) {
        return { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, clipMask: l.clipMask, locked: l.locked, folder: l.folder, pixels: l.pixels.slice() };
      }),
      folders: folders.map(function (f) { return { id: f.id, name: f.name, collapsed: f.collapsed, visible: f.visible !== false, pos: f.pos }; }),
      selection: selection ? { x0: selection.x0, y0: selection.y0, x1: selection.x1, y1: selection.y1 } : null
    };
  }
  function restore(snap) {
    layers = snap.layers.map(function (s) {
      return { id: s.id, name: s.name, visible: s.visible, opacity: s.opacity, blend: s.blend, clipMask: s.clipMask, locked: s.locked, folder: s.folder, pixels: s.pixels.slice() };
    });
    folders = snap.folders.map(function (f) { return { id: f.id, name: f.name, collapsed: f.collapsed, visible: f.visible !== false, pos: f.pos }; });
    selection = snap.selection ? { x0: snap.selection.x0, y0: snap.selection.y0, x1: snap.selection.x1, y1: snap.selection.y1 } : null;
    if (activeIdx >= layers.length) activeIdx = layers.length - 1;
    if (activeFolderId != null) {
      var still = false;
      for (var fk = 0; fk < folders.length; fk++) if (folders[fk].id === activeFolderId) { still = true; break; }
      if (!still || layers[activeIdx].folder !== activeFolderId) activeFolderId = null;   // 文件夹不存在或激活层已不在其中则清除
    }
    renderLayerList();
    renderAll();
    updatePanels();
  }
  function pushSnapshot() {
    undoStack.push(snapshot());
    if (undoStack.length > settings.undoLimit) undoStack.shift();
    redoStack.length = 0;
    updatePanels();
  }
  function commit(action) {
    pushSnapshot();
    action();
    // 选中一致性：若激活层已不在选中的文件夹内（层被移出/删除/排序），清除文件夹选中态
    if (activeFolderId != null && layers[activeIdx].folder !== activeFolderId) activeFolderId = null;
    renderLayerList();
    renderAll();
    updatePanels();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  }

  /* ================= 图层操作 ================= */
  function addLayer() {
    commit(function () {
      var layer = createLayerNamed(newLayerName());
      layers.splice(activeIdx + 1, 0, layer);
      activeIdx++;
    });
  }
  function addFolder() {
    commit(function () {
      var newPos = layers[activeIdx].id;
      if (layers[activeIdx].folder != null) {   // 激活层在文件夹内：锚定到该文件夹的块位置
        for (var pf = 0; pf < folders.length; pf++) if (folders[pf].id === layers[activeIdx].folder) { newPos = folders[pf].pos; break; }
      }
      folders.push({ id: ++folderSeq, name: t("folder.name") + " " + folderSeq, collapsed: false, visible: true, pos: newPos });
    });
  }
  function deleteLayer() {
    if (layers.length <= 1) return;
    commit(function () {
      layers.splice(activeIdx, 1);
      if (activeIdx >= layers.length) activeIdx = layers.length - 1;
    });
  }
  function duplicateLayer() {
    commit(function () {
      var src = layers[activeIdx];
      var copy = {
        id: ++layerSeq,
        name: src.name + t("layer.copy"),
        visible: src.visible,
        opacity: src.opacity,
        blend: src.blend,
        clipMask: src.clipMask,
        locked: src.locked,
        folder: src.folder,
        pixels: src.pixels.slice()
      };
      layers.splice(activeIdx + 1, 0, copy);
      activeIdx++;
    });
  }
  function moveLayer(dir) {
    var to = activeIdx + dir;
    if (to < 0 || to >= layers.length) return;
    commit(function () {
      var t = layers[activeIdx];
      layers[activeIdx] = layers[to];
      layers[to] = t;
      activeIdx = to;
    });
  }
  function clearActiveLayer() {
    if (layers[activeIdx].locked) return;   // 锁定层不可清空
    commit(function () {
      var px = layers[activeIdx].pixels;
      for (var i = 0; i < nCells(); i++) {
        if (inSelection(i)) px[i * 4 + 3] = 0;   // 只清选区内的像素
      }
    });
  }
  function fillSelection() {
    // 用当前色填充选区（无选区时不动作）
    if (!selection || layers[activeIdx].locked) return;
    commit(function () {
      var l = layers[activeIdx];
      var base = hexToRgb(currentColor);
      for (var i = 0; i < nCells(); i++) {
        if (inSelection(i)) {
          var o = i * 4;
          l.pixels[o] = base.r; l.pixels[o + 1] = base.g; l.pixels[o + 2] = base.b; l.pixels[o + 3] = currentAlpha;
        }
      }
    });
  }
  function flipLayer(horizontal) {
    // 水平/垂直翻转：有选区时仅翻转选区内像素，无选区时翻转整个图层
    if (layers[activeIdx].locked) return;
    commit(function () {
      var l = layers[activeIdx];
      var tmp = makePixels();
      // 先复制当前像素（选区外保持不变）
      for (var i = 0; i < nCells(); i++) {
        var o = i * 4;
        tmp[o] = l.pixels[o]; tmp[o + 1] = l.pixels[o + 1]; tmp[o + 2] = l.pixels[o + 2]; tmp[o + 3] = l.pixels[o + 3];
      }
      if (selection) {
        // 有选区：选区内局部镜像翻转（读原数组写 tmp，避免交换冲突）
        var x0 = selection.x0, y0 = selection.y0, x1 = selection.x1, y1 = selection.y1;
        for (var y = y0; y <= y1; y++) {
          for (var x = x0; x <= x1; x++) {
            var src = (y * gridSize + x) * 4;
            var mx = horizontal ? (x1 - (x - x0)) : x;
            var my = horizontal ? y : (y1 - (y - y0));
            var dst = (my * gridSize + mx) * 4;
            tmp[dst] = l.pixels[src]; tmp[dst + 1] = l.pixels[src + 1]; tmp[dst + 2] = l.pixels[src + 2]; tmp[dst + 3] = l.pixels[src + 3];
          }
        }
      } else {
        // 无选区：整图翻转
        for (var y2 = 0; y2 < gridSize; y2++) {
          for (var x2 = 0; x2 < gridSize; x2++) {
            var src2 = (y2 * gridSize + x2) * 4;
            var dst2 = horizontal ? (y2 * gridSize + (gridSize - 1 - x2)) * 4 : ((gridSize - 1 - y2) * gridSize + x2) * 4;
            tmp[dst2] = l.pixels[src2]; tmp[dst2 + 1] = l.pixels[src2 + 1]; tmp[dst2 + 2] = l.pixels[src2 + 2]; tmp[dst2 + 3] = l.pixels[src2 + 3];
          }
        }
      }
      l.pixels = tmp;
    });
  }
  function setActive(i) {
    if (i === activeIdx && activeFolderId == null) return;
    activeIdx = i;
    activeFolderId = null;
    // 仅切换行的选中态，不重建整列（避免打断重命名/双击等交互）
    var rows = layerList.querySelectorAll(".layer-row");
    for (var k = 0; k < rows.length; k++) {
      rows[k].classList.toggle("active", parseInt(rows[k].getAttribute("data-idx"), 10) === i);
    }
    var frows = layerList.querySelectorAll(".folder-row");
    for (var k2 = 0; k2 < frows.length; k2++) frows[k2].classList.remove("active");
    updatePanels();
  }
  function selectFolder(folderId) {
    // 选中文件夹：仅高亮文件夹行；激活其最顶层子层供工具操作（画笔/调整等作用于该层）
    var topChild = -1;
    for (var i = layers.length - 1; i >= 0; i--) if (layers[i].folder === folderId) { topChild = i; break; }
    if (topChild < 0) return;
    activeIdx = topChild;
    activeFolderId = folderId;
    var frows = layerList.querySelectorAll(".folder-row");
    for (var k = 0; k < frows.length; k++) frows[k].classList.toggle("active", parseInt(frows[k].getAttribute("data-folder"), 10) === folderId);
    var rows = layerList.querySelectorAll(".layer-row");
    for (var k2 = 0; k2 < rows.length; k2++) rows[k2].classList.remove("active");
    updatePanels();
  }
  function toggleVisibility(i) {
    layers[i].visible = !layers[i].visible;
    renderLayerList();
    renderAll();
  }
  function toggleFolderVisibility(folderId) {
    // 文件夹可见性独立于子层：仅切换文件夹自身的 visible，不改动子层眼睛状态；隐藏时子层整体不参与合成
    for (var f = 0; f < folders.length; f++) {
      if (folders[f].id === folderId) { folders[f].visible = !(folders[f].visible !== false); break; }
    }
    renderLayerList();
    renderAll();
  }
  function deleteFolder(folderId) {
    if (activeFolderId === folderId) activeFolderId = null;
    commit(function () {
      for (var i = 0; i < layers.length; i++) {
        if (layers[i].folder === folderId) layers[i].folder = null;   // 内容保留
      }
      for (var f = 0; f < folders.length; f++) {
        if (folders[f].id === folderId) { folders.splice(f, 1); break; }
      }
    });
  }
  function toggleLock(i) {
    layers[i].locked = !layers[i].locked;   // 锁定仅禁像素编辑，其余操作不受影响（不进撤销，与可见性一致）
    renderLayerList();
  }
  function startRename(nameEl) {
    // 进入图层重命名编辑态（由右键菜单触发）
    nameEl.contentEditable = "true";
    nameEl.classList.add("editing");
    nameEl.focus();
    var sel = window.getSelection();
    sel.selectAllChildren(nameEl);
  }
  function toggleClipMask() {
    if (activeIdx === 0) return;   // 最底层不能剪切
    commit(function () { layers[activeIdx].clipMask = !layers[activeIdx].clipMask; });
  }
  function resetDocument() {
    openCanvasSizeDialog(settings.defaultGrid);   // 新建画布：询问尺寸
  }

  /* ================= 合成与渲染 ================= */
  // 混合模式（作用于 0-1 归一化通道：s=源色，d=下方已合成色）
  function blendChannel(mode, s, d) {
    switch (mode) {
      case "multiply": return s * d;
      case "screen": return s + d - s * d;
      case "overlay": return d < 0.5 ? 2 * s * d : 1 - 2 * (1 - s) * (1 - d);
      case "darken": return Math.min(s, d);
      case "lighten": return Math.max(s, d);
      case "difference": return Math.abs(s - d);
      case "exclusion": return s + d - 2 * s * d;
      case "color-dodge": return d >= 1 ? 1 : Math.min(1, d / (1 - s));
      case "color-burn": return s <= 0 ? 0 : Math.max(0, 1 - (1 - d) / s);
      case "hard-light": return s < 0.5 ? 2 * s * d : 1 - 2 * (1 - s) * (1 - d);
      case "soft-light": {
        var f = d <= 0.25 ? (((16 * d - 12) * d + 4) * d) : Math.sqrt(d);
        return s < 0.5 ? d - (1 - 2 * s) * d * (1 - d) : d + (2 * s - 1) * (f - d);
      }
      default: return s;  // normal
    }
  }
  // 从底到顶做带混合模式的 alpha 合成，返回 {r,g,b,a(0-255)}
  function compositePixel(idx, withChecker) {
    var r = 0, g = 0, b = 0, a = 0;
    for (var i = 0; i < layers.length; i++) {
      var l = layers[i];
      if (!l.visible || l.opacity <= 0) continue;
      var o = idx * 4;
      var pa = l.pixels[o + 3];
      if (pa === 0) continue;
      if (l.folder != null) {
        // 文件夹自身不可见 → 其子层整体不参与合成（不改变子层自身的可见性）
        var fVis = true;
        for (var fvi = 0; fvi < folders.length; fvi++) if (folders[fvi].id === l.folder) { fVis = folders[fvi].visible !== false; break; }
        if (!fVis) continue;
      }
      var sa = pa * l.opacity / 100;
      if (l.clipMask && i > 0) {
        // 剪切蒙版（PS 相邻成组语义）：与紧邻下方的非剪切层配对
        // 连续剪切层属于同一组；基底不可见时整组不显示
        for (var j = i - 1; j >= 0; j--) {
          if (layers[j].clipMask) continue;
          var bl = layers[j];
          var blVis = bl.visible;
          if (blVis && bl.folder != null) {   // 基底所在文件夹不可见 → 基底同样视为不可见
            var bfVis = true;
            for (var bvi = 0; bvi < folders.length; bvi++) if (folders[bvi].id === bl.folder) { bfVis = folders[bvi].visible !== false; break; }
            if (!bfVis) blVis = false;
          }
          sa = sa * (blVis ? bl.pixels[o + 3] * bl.opacity / 100 / 255 : 0);
          break;
        }
      }
      var as = sa / 255, ad = a / 255;
      var br = l.pixels[o], bg = l.pixels[o + 1], bb = l.pixels[o + 2];
      if (l.blend && l.blend !== "normal" && a > 0) {
        br = blendChannel(l.blend, br / 255, r / 255) * 255;
        bg = blendChannel(l.blend, bg / 255, g / 255) * 255;
        bb = blendChannel(l.blend, bb / 255, b / 255) * 255;
      }
      var outA = sa + a * (1 - as);
      if (outA <= 0) continue;
      r = (br * as + r * ad * (1 - as)) / (outA / 255);
      g = (bg * as + g * ad * (1 - as)) / (outA / 255);
      b = (bb * as + b * ad * (1 - as)) / (outA / 255);
      a = outA;
    }
    if (withChecker && a <= 0) return { r: CHECKER.r, g: CHECKER.g, b: CHECKER.b, a: 255 };
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: Math.round(a) };
  }

  function renderCell(idx) {
    var c = compositePixel(idx, false);
    var el = board.children[idx];
    if (c.a <= 0) el.style.background = "";
    else el.style.background = rgbaStr(c);
    // 形状拖拽中优先显示形状实际范围；否则仅当存在选区时才显示高亮
    var hi = shapePreview ? !!shapePreview.on[idx] : (!!selection && inSelection(idx));
    el.classList.toggle("sel", hi);
  }
  function renderAll() {
    for (var i = 0; i < nCells(); i++) renderCell(i);
  }

  // —— rAF 节流 + 脏区渲染：拖拽等高频场景一帧只渲染一次，且只重绘变化区域 ——
  var boardRenderPending = false;   // 节流标志：已排队则跳过，等待 rAF 统一渲染
  var boardDirtyFull = false;       // 是否全量重绘（true 时忽略 boardDirtyRect）
  var boardDirtyRect = null;        // 增量脏矩形 {x0,y0,x1,y1}；仅 boardDirtyFull 为 false 时有效
  function unionRect(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
  }
  function scheduleBoardRender(rect) {
    // rect 省略 = 全量；否则并入增量脏区（已全量则保持全量）
    if (rect) {
      if (!boardDirtyFull) boardDirtyRect = unionRect(boardDirtyRect, rect);
    } else {
      boardDirtyFull = true;
      boardDirtyRect = null;
    }
    if (boardRenderPending) return;
    boardRenderPending = true;
    requestAnimationFrame(function () {
      boardRenderPending = false;
      var full = boardDirtyFull;
      var r = boardDirtyRect;
      boardDirtyFull = false;
      boardDirtyRect = null;
      if (full || r === null) {
        renderAll();
      } else {
        var x0 = Math.max(0, r.x0), y0 = Math.max(0, r.y0);
        var x1 = Math.min(gridSize - 1, r.x1), y1 = Math.min(gridSize - 1, r.y1);
        for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) renderCell(y * gridSize + x);
      }
    });
  }

  /* ================= 绘制 ================= */
  function paintIdx(idx, color) {
    if (idx < 0 || idx >= nCells()) return;
    if (layers[activeIdx].locked) return;   // 锁定层不可像素编辑
    writePx(layers[activeIdx], idx, color);
    renderCell(idx);
    scheduleThumb();
  }
  // 以 idx 为中心绘制 brushSize×brushSize 区域（中心取齐，越界/选区外跳过）
  function paintArea(idx, color) {
    var cx = idx % gridSize, cy = (idx / gridSize) | 0;
    var r0 = Math.floor((brushSize - 1) / 2), r1 = Math.ceil((brushSize - 1) / 2);
    for (var dy = -r0; dy <= r1; dy++) {
      for (var dx = -r0; dx <= r1; dx++) {
        var nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;
        var ni = ny * gridSize + nx;
        if (!inSelection(ni)) continue;
        paintIdx(ni, color);
      }
    }
  }

  function floodFill(idx) {
    if (layers[activeIdx].locked) return;   // 锁定层不可像素编辑
    var l = layers[activeIdx];
    var src = readPx(l, idx, {});
    var base = hexToRgb(currentColor);
    var tgt = { r: base.r, g: base.g, b: base.b, a: currentAlpha };
    if (sameColor(src, tgt)) return;
    var n = nCells();
    var visited = new Uint8Array(n);
    var stack = [idx];
    visited[idx] = 1;
    var filled = 0;
    while (stack.length) {
      var cur = stack.pop();
      writePx(l, cur, tgt);
      filled++;
      var cx = cur % gridSize, cy = (cur / gridSize) | 0;
      var nbs = [];
      if (cx > 0) nbs.push(cur - 1);
      if (cx < gridSize - 1) nbs.push(cur + 1);
      if (cy > 0) nbs.push(cur - gridSize);
      if (cy < gridSize - 1) nbs.push(cur + gridSize);
      for (var k = 0; k < nbs.length; k++) {
        var nb = nbs[k];
        if (visited[nb] || !inSelection(nb)) continue;   // 油漆桶不越过选区边界
        var nc = readPx(l, nb, {});
        if (sameColor(nc, src)) { visited[nb] = 1; stack.push(nb); }
      }
    }
    if (filled > 0) { renderAll(); scheduleThumb(); }
  }

  /* ================= 选区（矩形） ================= */
  function inSelection(idx) {
    if (!selection) return true;
    var gx = idx % gridSize, gy = (idx / gridSize) | 0;
    return gx >= selection.x0 && gx <= selection.x1 && gy >= selection.y0 && gy <= selection.y1;
  }
  function normalizeSel() {
    if (selection.x0 > selection.x1) { var t = selection.x0; selection.x0 = selection.x1; selection.x1 = t; }
    if (selection.y0 > selection.y1) { var t2 = selection.y0; selection.y0 = selection.y1; selection.y1 = t2; }
  }
  function clampSelection() {
    if (selection.x0 < 0) { selection.x1 -= selection.x0; selection.x0 = 0; }
    if (selection.y0 < 0) { selection.y1 -= selection.y0; selection.y0 = 0; }
    if (selection.x1 > gridSize - 1) { selection.x0 -= selection.x1 - (gridSize - 1); selection.x1 = gridSize - 1; }
    if (selection.y1 > gridSize - 1) { selection.y0 -= selection.y1 - (gridSize - 1); selection.y1 = gridSize - 1; }
  }
  function selectAll() { selection = { x0: 0, y0: 0, x1: gridSize - 1, y1: gridSize - 1 }; renderAll(); }
  function deselect() { selection = null; renderAll(); }

  function cellAtPoint(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !el.classList.contains("cell")) return -1;
    return cellIndexOf(el);
  }
  var selContent = null;   // 移动内容快照 {originX, originY, w, h, data}
  function startMoveDrag(x, y) {
    var idx = cellAtPoint(x, y);
    if (idx < 0) return;
    var gx = idx % gridSize, gy = (idx / gridSize) | 0;
    if (!selection || gx < selection.x0 || gx > selection.x1 || gy < selection.y0 || gy > selection.y1) {
      startSelectionDrag(x, y);   // 点选区外：与选区工具一致，框选新选区
      return;
    }
    if (layers[activeIdx].locked) return;
    // 在选区内：快照选区像素并进入移动模式（剪切移动）
    var w = selection.x1 - selection.x0 + 1, h = selection.y1 - selection.y0 + 1;
    var l = layers[activeIdx];
    var data = new Uint8Array(w * h * 4);
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var o = ((selection.y0 + yy) * gridSize + selection.x0 + xx) * 4;
        var d = (yy * w + xx) * 4;
        data[d] = l.pixels[o]; data[d + 1] = l.pixels[o + 1]; data[d + 2] = l.pixels[o + 2]; data[d + 3] = l.pixels[o + 3];
      }
    }
    selContent = { originX: selection.x0, originY: selection.y0, w: w, h: h, data: data, layerSnap: l.pixels.slice() };
    selDrag = { mode: "content", gx: gx, gy: gy, moved: false, dx: 0, dy: 0 };
  }
  function updateMoveDrag(x, y) {
    var idx = cellAtPoint(x, y);
    if (idx < 0 || !selContent) return;
    var gx = idx % gridSize, gy = (idx / gridSize) | 0;
    var ox = gx - selDrag.gx, oy = gy - selDrag.gy;
    if (!selDrag.moved && (ox !== 0 || oy !== 0)) { selDrag.moved = true; pushSnapshot(); }   // 首次移动才提交撤销点
    if (!selDrag.moved) return;
    var l = layers[activeIdx];
    if (l.locked) return;
    selDrag.dx = ox; selDrag.dy = oy;
    l.pixels.set(selContent.layerSnap);   // 恢复整层到移动前状态，彻底清除拖影
    // 清空原选区矩形（剪切：原位置内容移除）
    for (var yy = 0; yy < selContent.h; yy++) {
      for (var xx = 0; xx < selContent.w; xx++) {
        var px = selContent.originX + xx, py = selContent.originY + yy;
        if (px >= 0 && px < gridSize && py >= 0 && py < gridSize) l.pixels[(py * gridSize + px) * 4 + 3] = 0;
      }
    }
    // 绘制内容到新位置（裁剪边界；跳过透明像素，避免其覆盖目标位置原有内容）
    for (var yy2 = 0; yy2 < selContent.h; yy2++) {
      for (var xx2 = 0; xx2 < selContent.w; xx2++) {
        var nx = selContent.originX + ox + xx2, ny = selContent.originY + oy + yy2;
        if (nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize) continue;
        var d = (yy2 * selContent.w + xx2) * 4;
        if (selContent.data[d + 3] === 0) continue;   // 透明像素不写入，保留目标位置原有像素
        var ni = (ny * gridSize + nx) * 4;
        l.pixels[ni] = selContent.data[d]; l.pixels[ni + 1] = selContent.data[d + 1];
        l.pixels[ni + 2] = selContent.data[d + 2]; l.pixels[ni + 3] = selContent.data[d + 3];
      }
    }
    scheduleBoardRender();   // 内容重排：全量节流渲染（一帧一次）
    scheduleThumb();
  }
  var shapeKind = "rect", shapeMode = "fill";   // 形状类型 rect|ellipse；模式 fill|stroke（粗细用 brushSize）
  var prevSelectionForShape = null;
  var shapePreview = null;   // 形状拖拽预览 {on:{idx:true}}；非空时 renderCell 优先用它高亮
  function startShapeDrag(x, y) {
    var idx = cellAtPoint(x, y);
    if (idx < 0) return;
    var gx = idx % gridSize, gy = (idx / gridSize) | 0;
    prevSelectionForShape = selection;   // 保存用户原选区，画完恢复
    selDrag = { mode: "shape", x0: gx, y0: gy, x1: gx, y1: gy };
    selection = { x0: gx, y0: gy, x1: gx, y1: gy };
    shapePreview = { on: buildShapePreviewOn(gx, gy, gx, gy) };
    renderAll();
  }
  function updateShapeDrag(x, y) {
    var idx = cellAtPoint(x, y);
    if (idx < 0) return;
    var gx = idx % gridSize, gy = (idx / gridSize) | 0;
    var oldRect = selection ? { x0: selection.x0, y0: selection.y0, x1: selection.x1, y1: selection.y1 } : null;
    selDrag.x1 = gx; selDrag.y1 = gy;
    var sx0 = Math.min(selDrag.x0, selDrag.x1), sy0 = Math.min(selDrag.y0, selDrag.y1);
    var sx1 = Math.max(selDrag.x0, selDrag.x1), sy1 = Math.max(selDrag.y0, selDrag.y1);
    selection = { x0: sx0, y0: sy0, x1: sx1, y1: sy1 };
    shapePreview = { on: buildShapePreviewOn(sx0, sy0, sx1, sy1) };
    scheduleBoardRender(unionRect(oldRect, selection));   // 只重绘旧/新预览范围
  }
  function finishShape(s) {
    var x0 = Math.min(s.x0, s.x1), y0 = Math.min(s.y0, s.y1), x1 = Math.max(s.x0, s.x1), y1 = Math.max(s.y0, s.y1);
    if ((x0 !== x1 || y0 !== y1) && !layers[activeIdx].locked) commit(function () { paintShape(x0, y0, x1, y1); });   // 至少两格且未锁定才画
    selection = prevSelectionForShape;
    prevSelectionForShape = null;
    shapePreview = null;
    renderAll();
  }
  // 椭圆边界采样（返回 {idx:true} 边界格集合），供绘制与预览共用
  function ellipseEdgeSet(x0, y0, x1, y1) {
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
    var steps = Math.max(16, Math.ceil(2 * Math.PI * Math.max(rx, ry) * 2));
    var edge = {};
    for (var i = 0; i < steps; i++) {
      var th = 2 * Math.PI * i / steps;
      var ex = Math.max(x0, Math.min(x1, Math.round(cx + rx * Math.cos(th))));
      var ey = Math.max(y0, Math.min(y1, Math.round(cy + ry * Math.sin(th))));
      edge[ey * gridSize + ex] = true;
    }
    return edge;
  }
  // 形状预览高亮集合（与 paintShape 实际绘制范围一致）
  function buildShapePreviewOn(x0, y0, x1, y1) {
    var on = {};
    if (shapeKind === "rect") {
      var b = brushSize - 1;
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          if (shapeMode === "stroke" && Math.min(x - x0, x1 - x, y - y0, y1 - y) > b) continue;
          on[y * gridSize + x] = true;
        }
      }
      return on;
    }
    var edge = ellipseEdgeSet(x0, y0, x1, y1);
    if (shapeMode === "fill") {
      for (var y2 = y0; y2 <= y1; y2++) {
        var minX = -1, maxX = -1;
        for (var x3 = x0; x3 <= x1; x3++) if (edge[y2 * gridSize + x3]) { if (minX < 0) minX = x3; maxX = x3; }
        if (minX < 0) continue;
        for (var x4 = minX; x4 <= maxX; x4++) on[y2 * gridSize + x4] = true;
      }
    } else {
      var r0 = Math.floor((brushSize - 1) / 2), r1 = Math.ceil((brushSize - 1) / 2);
      for (var key in edge) {
        var eidx = parseInt(key, 10);
        var ecx = eidx % gridSize, ecy = (eidx / gridSize) | 0;
        for (var dy = -r0; dy <= r1; dy++) {
          for (var dx = -r0; dx <= r1; dx++) {
            var nx = ecx + dx, ny = ecy + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
            on[ny * gridSize + nx] = true;
          }
        }
      }
    }
    return on;
  }
  function paintShape(x0, y0, x1, y1) {
    var l = layers[activeIdx];
    if (l.locked) return;
    var base = hexToRgb(currentColor);
    function setPx(x, y) {
      var o = (y * gridSize + x) * 4;
      l.pixels[o] = base.r; l.pixels[o + 1] = base.g; l.pixels[o + 2] = base.b; l.pixels[o + 3] = currentAlpha;
    }
    if (shapeKind === "rect") {
      var b = brushSize - 1;
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          if (shapeMode === "stroke" && Math.min(x - x0, x1 - x, y - y0, y1 - y) > b) continue;
          setPx(x, y);
        }
      }
      scheduleThumb();
      return;
    }
    // 椭圆：参数方程边界采样（步长按长轴保证相邻格连续）→ 描边 = 边界格扩展 brushSize；填充 = 边界 + 行内填充
    var edge = ellipseEdgeSet(x0, y0, x1, y1);
    if (shapeMode === "stroke") {
      var r0 = Math.floor((brushSize - 1) / 2), r1 = Math.ceil((brushSize - 1) / 2);
      for (var key in edge) {
        var eidx = parseInt(key, 10);
        var ecx = eidx % gridSize, ecy = (eidx / gridSize) | 0;
        for (var dy = -r0; dy <= r1; dy++) {
          for (var dx = -r0; dx <= r1; dx++) {
            var nx = ecx + dx, ny = ecy + dy;
            if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;   // 描边不超出边界框
            setPx(nx, ny);
          }
        }
      }
    } else {
      for (var y2 = y0; y2 <= y1; y2++) {
        var minX = -1, maxX = -1;
        for (var x3 = x0; x3 <= x1; x3++) if (edge[y2 * gridSize + x3]) { if (minX < 0) minX = x3; maxX = x3; }
        if (minX < 0) continue;
        for (var x4 = minX; x4 <= maxX; x4++) setPx(x4, y2);
      }
    }
    scheduleThumb();
  }
  function startSelectionDrag(x, y) {
    var idx = cellAtPoint(x, y);
    if (idx < 0) return;
    var gx = idx % gridSize, gy = (idx / gridSize) | 0;
    // 全画布选区时拖拽视为新建选区（移动无意义）；否则"点选区内部（非边缘）"= 移动，点边缘/外部 = 新建
    var full = selection && selection.x0 === 0 && selection.y0 === 0 &&
               selection.x1 === gridSize - 1 && selection.y1 === gridSize - 1;
    // 内部判定：严格落在选区内，且不在任意边界格上；
    // 退化维度（宽或高为 1）不要求"严格内部"，使 1 像素宽/高的薄选区仍可沿其长轴移动（点端点=新建）。
    var inside = false;
    if (selection && !full) {
      var gxIn = gx >= selection.x0 && gx <= selection.x1;
      var gyIn = gy >= selection.y0 && gy <= selection.y1;
      var xInterior = selection.x1 > selection.x0 && gx > selection.x0 && gx < selection.x1;
      var yInterior = selection.y1 > selection.y0 && gy > selection.y0 && gy < selection.y1;
      inside = gxIn && gyIn &&
               (selection.x1 > selection.x0 ? xInterior : gxIn) &&
               (selection.y1 > selection.y0 ? yInterior : gyIn);
    }
    if (inside) {
      selDrag = { mode: "move", lastX: gx, lastY: gy };
    } else {
      selDrag = { mode: "new" };                            // 空白/边缘/全画布拖拽 = 框选新选区
      selection = { x0: gx, y0: gy, x1: gx, y1: gy };
      renderAll();
    }
  }
  function updateSelectionDrag(x, y) {
    if (!selDrag) return;
    var idx = cellAtPoint(x, y);
    if (idx < 0) return;
    var gx = idx % gridSize, gy = (idx / gridSize) | 0;
    var oldRect = selection ? { x0: selection.x0, y0: selection.y0, x1: selection.x1, y1: selection.y1 } : null;
    if (selDrag.mode === "new") {
      selection.x1 = gx; selection.y1 = gy;
      normalizeSel();
      scheduleBoardRender(unionRect(oldRect, selection));   // 只重绘旧/新选区范围
    } else {
      var dx = gx - selDrag.lastX, dy = gy - selDrag.lastY;
      selDrag.lastX = gx; selDrag.lastY = gy;
      if (dx || dy) {
        selection.x0 += dx; selection.x1 += dx;
        selection.y0 += dy; selection.y1 += dy;
        clampSelection();
        scheduleBoardRender(unionRect(oldRect, selection));
      }
    }
  }

  /* 绘制交互：pointer 事件 + elementFromPoint 实现连续拖拽 */
  function cellIndexOf(el) {
    var ch = board.children;
    for (var i = 0; i < ch.length; i++) if (ch[i] === el) return i;
    return -1;
  }

  function applyToolAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !el.classList.contains("cell")) return;
    var idx = cellIndexOf(el);
    if (idx < 0) return;

    if (currentTool === "eyedropper") {
      var c = compositePixel(idx, false);   // 不叠棋盘格：透明处 a=0
      if (c.a > 0) {
        // 有颜色可取：更新颜色与透明度
        currentAlpha = c.a;
        colorAlpha.value = Math.round(c.a / 255 * 100);
        colorAlphaLabel.textContent = colorAlpha.value + "%";
        selectColor(rgbToHex(c.r, c.g, c.b));
      }
      // 透明处（a=0）：无色可取，保持当前颜色与透明度不变（避免透明度被清零导致后续选色画不出）
      if (eyedropOnce) { eyedropOnce = false; setTool(eyedropPrev); }   // 色盘吸管：一次性取色后恢复原工具
      return;
    }
    if (!inSelection(idx)) return;   // 选区外的格子不绘制（画笔/橡皮擦/油漆桶）
    if (currentTool === "bucket") {
      if (!strokeStarted) { strokeStarted = true; pushSnapshot(); }
      floodFill(idx);
      return;
    }
    // brush / eraser（粗细 = brushSize × brushSize 区域）
    if (!strokeStarted) { strokeStarted = true; pushSnapshot(); }
    var color;
    if (currentTool === "eraser") color = { r: 0, g: 0, b: 0, a: 0 };
    else { var base = hexToRgb(currentColor); color = { r: base.r, g: base.g, b: base.b, a: currentAlpha }; }
    paintArea(idx, color);
  }

  board.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || spaceDown) return;   // 中键或按住空格 → 交给平移
    if (e.target === board) return;
    isDrawing = true;
    strokeStarted = false;
    try { board.setPointerCapture(e.pointerId); } catch (err) {}
    if (currentTool === "select") { startSelectionDrag(e.clientX, e.clientY); return; }
    if (currentTool === "move") { startMoveDrag(e.clientX, e.clientY); return; }
    if (currentTool === "shape") { startShapeDrag(e.clientX, e.clientY); return; }
    applyToolAt(e.clientX, e.clientY);
  });
  board.addEventListener("pointermove", function (e) {
    if (!isDrawing) return;
    if (currentTool === "select") { updateSelectionDrag(e.clientX, e.clientY); return; }
    if (currentTool === "move") {
      if (selDrag && selDrag.mode === "content") updateMoveDrag(e.clientX, e.clientY);
      else updateSelectionDrag(e.clientX, e.clientY);
      return;
    }
    if (currentTool === "shape") { updateShapeDrag(e.clientX, e.clientY); return; }
    if (currentTool === "bucket" || currentTool === "eyedropper") return; // 一次性工具
    applyToolAt(e.clientX, e.clientY);
  });
  function endStroke(cancel) {
    if (!isDrawing) return;
    isDrawing = false;
    strokeStarted = false;
    if (selDrag && selDrag.mode === "shape") {   // 形状工具：松手绘制
      var s = selDrag;
      selDrag = null;
      if (cancel) {   // 取消（如 pointercancel）：丢弃预览，恢复原选区，不绘制
        selection = prevSelectionForShape;
        prevSelectionForShape = null;
        shapePreview = null;
        renderAll();
      } else {
        finishShape(s);
      }
      return;
    }
    if (selDrag && selDrag.mode === "content") {   // 移动工具结束：选区跟随内容 / 取消则恢复原像素
      var d = selDrag;
      if (cancel) {
        layers[activeIdx].pixels.set(selContent.layerSnap);
        if (d.moved) { undoStack.pop(); updatePanels(); }   // 移除移动时 push 的无用快照（状态与当前相同）
        renderAll();
        scheduleThumb();
      } else if (d.moved && (d.dx || d.dy)) {
        // 选区更新为内容实际落位范围（与绘制裁剪一致）
        var nx0 = selContent.originX + d.dx, ny0 = selContent.originY + d.dy;
        var nx1 = nx0 + selContent.w - 1, ny1 = ny0 + selContent.h - 1;
        if (nx1 < 0 || nx0 >= gridSize || ny1 < 0 || ny0 >= gridSize) selection = null;   // 完全移出画布
        else selection = { x0: Math.max(0, nx0), y0: Math.max(0, ny0), x1: Math.min(gridSize - 1, nx1), y1: Math.min(gridSize - 1, ny1) };
        renderAll();   // 立即刷新选区高亮到新位置
      }
    }
    selDrag = null;
    selContent = null;
  }
  board.addEventListener("pointerup", function () { endStroke(false); });
  board.addEventListener("pointercancel", function () { endStroke(true); });
  board.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  /* ================= 缩放 / 平移交互 ================= */
  viewport.addEventListener("wheel", function (e) {
    e.preventDefault();
    var rect = viewport.getBoundingClientRect();
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 33;   // 行模式换算为像素
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, delta < 0 ? settings.zoomStep : 1 / settings.zoomStep);
  }, { passive: false });

  viewport.addEventListener("pointerdown", function (e) {
    // 中键拖拽平移；或按住空格 + 左键
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      isPanning = true;
      lastPan = { x: e.clientX, y: e.clientY };
      viewport.classList.add("panning");
      try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    // 左键点击画布外空白区域：取消选区（可在首选项中关闭）
    if (settings.clickDeselect && selection && !e.target.closest(".board-wrap")) {
      deselect();
    }
  });
  viewport.addEventListener("pointermove", function (e) {
    if (!isPanning) return;
    panX += e.clientX - lastPan.x;
    panY += e.clientY - lastPan.y;
    lastPan = { x: e.clientX, y: e.clientY };
    applyTransform();
  });
  function endPan() {
    if (!isPanning) return;
    isPanning = false;
    viewport.classList.remove("panning");
  }
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);

  // 双击空白区域适配视图；点击状态栏百分比也可重置
  viewport.addEventListener("dblclick", function (e) {
    if (e.target === viewport) fitView();
  });
  zoomLabel.addEventListener("click", fitView);

  // 空格 = 临时抓手（按住可拖动画布）
  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" && !e.target.isContentEditable &&
        e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "SELECT") {
      spaceDown = true;
      viewport.classList.add("space-pan");
    }
  });
  document.addEventListener("keyup", function (e) {
    if (e.code === "Space") {
      spaceDown = false;
      viewport.classList.remove("space-pan");
    }
  });
  window.addEventListener("blur", function () {   // 失焦兜底，避免卡在平移/抓手状态
    spaceDown = false;
    isPanning = false;
    viewport.classList.remove("space-pan", "panning");
  });

  /* ================= 缩略图 ================= */
  var layerRows = {}; // id -> { canvas }
  function renderThumb(i) {
    var row = layerRows[layers[i].id];
    if (!row || !row.canvas) return;
    var l = layers[i];
    var ctx = row.canvas.getContext("2d");
    var img = ctx.createImageData(THUMB, THUMB);
    var data = img.data;
    var scale = THUMB / gridSize;
    for (var gy = 0; gy < gridSize; gy++) {
      for (var gx = 0; gx < gridSize; gx++) {
        var o = (gy * gridSize + gx) * 4;
        if (l.pixels[o + 3] === 0) continue;
        var x0 = Math.floor(gx * scale), x1 = Math.ceil((gx + 1) * scale);
        var y0 = Math.floor(gy * scale), y1 = Math.ceil((gy + 1) * scale);
        for (var y = y0; y < y1; y++) {
          for (var x = x0; x < x1; x++) {
            var p = (y * THUMB + x) * 4;
            data[p] = l.pixels[o]; data[p + 1] = l.pixels[o + 1]; data[p + 2] = l.pixels[o + 2]; data[p + 3] = l.pixels[o + 3];   // 保留像素透明度
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function scheduleThumb() {
    if (thumbDirty) return;
    thumbDirty = true;
    requestAnimationFrame(function () {
      thumbDirty = false;
      renderThumb(activeIdx);
    });
  }

  /* ================= 图层面板 ================= */
  function renderLayerRow(idx, indent) {
    (function (idx) {
      var l = layers[idx];
      var row = document.createElement("div");
      row.className = "layer-row" + (activeFolderId == null && idx === activeIdx ? " active" : "") + (indent ? " indented" : "") + (l.clipMask ? " clipped" : "");
      row.title = t("layer.rowTitle");
      row.setAttribute("data-idx", idx);

      var eye = document.createElement("button");
      eye.className = "eye-btn";
      eye.innerHTML = l.visible ? EYE_OPEN : EYE_CLOSED;
      eye.addEventListener("click", function (e) { e.stopPropagation(); toggleVisibility(idx); });

      var lock = document.createElement("button");
      lock.className = "lock-btn" + (l.locked ? " active" : "");
      lock.title = l.locked ? t("btn.unlock") : t("btn.lock");
      lock.innerHTML = LOCK_SVG;
      lock.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleLock(idx);
      });

      var clip = document.createElement("button");
      clip.className = "clip-btn" + (l.clipMask ? " active" : "");
      clip.title = l.clipMask ? t("btn.unclipMask") : t("btn.clipMask");
      clip.innerHTML = CLIP_SVG;
      if (idx === 0) clip.disabled = true;   // 最底层不能作为剪切层
      clip.addEventListener("click", function (e) {
        e.stopPropagation();
        commit(function () { layers[idx].clipMask = !layers[idx].clipMask; });
      });

      var thumb = document.createElement("div");
      thumb.className = "thumb checker";
      var canvas = document.createElement("canvas");
      canvas.width = THUMB;
      canvas.height = THUMB;
      thumb.appendChild(canvas);

      var name = document.createElement("div");
      name.className = "layer-name";
      name.textContent = l.name;
      name.title = t("layer.renameTitle");
      var origName = l.name;
      name.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); name.blur(); }
        else if (e.key === "Escape") { name.textContent = origName; name.blur(); }
      });
      name.addEventListener("blur", function () {
        name.contentEditable = "false";
        name.classList.remove("editing");
        var t = name.textContent.trim();
        l.name = t || origName;
        name.textContent = l.name;
        updatePanels();
      });

      row.appendChild(eye);
      row.appendChild(lock);
      row.appendChild(clip);
      row.appendChild(thumb);
      row.appendChild(name);

      layerList.appendChild(row);
      layerRows[l.id] = { canvas: canvas };
      renderThumb(idx);
    })(idx);
  }
  function renderFolderRow(folder, fi) {
    var row = document.createElement("div");
    row.className = "folder-row";
    row.classList.toggle("active", activeFolderId === folder.id);
    row.setAttribute("data-folder", folder.id);
    row.title = t("folder.title");

    var toggle = document.createElement("button");
    toggle.className = "folder-toggle";
    toggle.innerHTML = folder.collapsed ? "▶" : "▼";
    toggle.title = t("folder.toggle");
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      folder.collapsed = !folder.collapsed;
      renderLayerList();
    });

    var eye = document.createElement("button");
    eye.className = "eye-btn";
    eye.title = t("folder.visibility");
    eye.innerHTML = (folder.visible !== false) ? EYE_OPEN : EYE_CLOSED;
    eye.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleFolderVisibility(folder.id);
    });

    var icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.innerHTML = FOLDER_SVG;

    var name = document.createElement("div");
    name.className = "folder-name";
    name.textContent = folder.name;
    name.title = t("layer.renameTitle");
    var origFolderName = folder.name;
    name.addEventListener("dblclick", function (e) {
      e.stopPropagation();
      origFolderName = folder.name;
      name.contentEditable = "true";
      name.classList.add("editing");
      name.focus();
      var sel = window.getSelection();
      sel.selectAllChildren(name);
    });
    name.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); name.blur(); }
      else if (e.key === "Escape") { name.textContent = origFolderName; name.blur(); }
    });
    name.addEventListener("blur", function () {
      name.contentEditable = "false";
      name.classList.remove("editing");
      var t2 = name.textContent.trim();
      folder.name = t2 || origFolderName;
      name.textContent = folder.name;
    });

    var del = document.createElement("button");
    del.className = "folder-del";
    del.innerHTML = DEL_SVG;
    del.title = t("folder.delete");
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      deleteFolder(folder.id);
    });

    row.appendChild(toggle);
    row.appendChild(eye);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(del);
    layerList.appendChild(row);
  }
  function renderLayerList() {
    layerList.innerHTML = "";
    layerRows = {};
    // 统一面板序列：非子层图层行按合成顺序（数组倒序）；文件夹块（文件夹行 + 其全部子层）按 pos 插入到对应非子层图层行上方
    var nonChild = [];
    for (var i = layers.length - 1; i >= 0; i--) if (layers[i].folder == null) nonChild.push(i);
    var folderInsert = {};
    for (var f = 0; f < folders.length; f++) {
      var fo = folders[f];
      var seqPos = -1;
      if (fo.pos != null) {
        for (var s = 0; s < nonChild.length; s++) if (layers[nonChild[s]].id === fo.pos) { seqPos = s; break; }
      }
      if (seqPos < 0) seqPos = nonChild.length;   // pos 指向子层/已删除/缺失 → 末尾区
      (folderInsert[seqPos] = folderInsert[seqPos] || []).push(fo);
    }
    for (var p = 0; p <= nonChild.length; p++) {
      if (folderInsert[p]) {
        for (var q = 0; q < folderInsert[p].length; q++) {
          var fo2 = folderInsert[p][q];
          renderFolderRow(fo2);
          if (!fo2.collapsed) {
            for (var k = layers.length - 1; k >= 0; k--) if (layers[k].folder === fo2.id) renderLayerRow(k, true);
          }
        }
      }
      if (p < nonChild.length) renderLayerRow(nonChild[p], false);
    }
  }

  /* ================= 图层拖拽排序 ================= */
  layerList.addEventListener("pointerdown", function (e) {
    var row = e.target.closest(".layer-row");
    var frow = e.target.closest(".folder-row");
    if ((!row && !frow) || spaceDown || e.button !== 0) return;
    if (e.target.closest(".eye-btn") || e.target.closest(".clip-btn") || e.target.closest(".lock-btn") || e.target.closest(".folder-toggle") || e.target.closest(".folder-del") || e.target.isContentEditable) return;   // 排除按钮与重命名编辑
    if (row) {
      layerDrag = { type: "layer", idx: parseInt(row.getAttribute("data-idx"), 10), startY: e.clientY, moved: false, insertVisual: -1 };
      layerDragEl = row;
    } else {
      layerDrag = { type: "folder", folderId: parseInt(frow.getAttribute("data-folder"), 10), startY: e.clientY, moved: false, insertVisual: -1 };
      layerDragEl = frow;
    }
    layerDragEl.classList.add("dragging");
    try { layerList.setPointerCapture(e.pointerId); } catch (err) {}
  });
  layerList.addEventListener("pointermove", function (e) {
    if (!layerDrag || !layerDragEl) return;
    if (!layerDrag.moved) {
      if (Math.abs(e.clientY - layerDrag.startY) < 5) return;   // 5px 阈值：区分点击与拖拽
      layerDrag.moved = true;
    }
    // 计算插入位置：视觉顺序（顶→底）中，鼠标位于某行上半部则插到其之前
    var rows;
    if (layerDrag.type === "folder") {
      // 文件夹拖拽锚点：文件夹行 + 非子层图层行（子层行 .indented 自动排除，不参与锚点）
      rows = Array.prototype.slice.call(layerList.querySelectorAll(".folder-row, .layer-row:not(.indented)"));
    } else {
      rows = Array.prototype.slice.call(layerList.querySelectorAll(".layer-row"));
    }
    var others = [];
    for (var i0 = 0; i0 < rows.length; i0++) {
      if (rows[i0] === layerDragEl) continue;
      others.push(rows[i0]);
    }
    var rect = layerList.getBoundingClientRect();
    var y = e.clientY - rect.top;
    var insert = others.length;
    if (layerDrag.type === "layer" && layers.length === 2) {
      // 仅两个图层时：拖到另一行（行内任意位置）即交换
      insert = layerDrag.idx === 0 ? 0 : 1;
    } else {
      for (var i = 0; i < others.length; i++) {
        var r = others[i].getBoundingClientRect();
        if (y < r.top - rect.top + r.height / 2) { insert = i; break; }
      }
    }
    layerDrag.insertVisual = insert;
    if (!dropLine) {
      dropLine = document.createElement("div");
      dropLine.className = "drop-line";
      layerList.appendChild(dropLine);
    }
    var top;
    if (others.length === 0) top = 0;
    else if (insert < others.length) top = others[insert].getBoundingClientRect().top - rect.top;
    else top = others[others.length - 1].getBoundingClientRect().bottom - rect.top;
    dropLine.style.top = Math.max(0, top - 1) + "px";
    // 检测悬停的文件夹行：仅图层拖拽可移入文件夹（文件夹拖拽 = 插入到该位置，不嵌套）
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var fr = null;
    if (layerDrag.type === "layer") {
      fr = el ? el.closest(".folder-row") : null;
      if (fr === layerDragEl) fr = null;
    }
    layerDrag.hoverFolder = fr ? parseInt(fr.getAttribute("data-folder"), 10) : null;
    var frows = layerList.querySelectorAll(".folder-row");
    for (var k = 0; k < frows.length; k++) frows[k].classList.toggle("drop-target", frows[k] === fr);
  });
  function finishLayerDrag(cancel) {
    if (!layerDrag) return;
    var d = layerDrag;
    layerDrag = null;
    if (layerDragEl) layerDragEl.classList.remove("dragging");
    layerDragEl = null;
    if (dropLine) { dropLine.remove(); dropLine = null; }
    var frows = layerList.querySelectorAll(".folder-row");
    for (var k = 0; k < frows.length; k++) frows[k].classList.remove("drop-target");
    if (cancel) return;
    if (!d.moved) {
      if (d.type === "layer") setActive(d.idx);   // 单击图层行：pointerup 直接选中（不依赖 click）
      else selectFolder(d.folderId);              // 单击文件夹行：选中文件夹
      return;
    }
    if (d.type === "folder") {
      // 统一拖拽：文件夹块（行 + 子层）在面板中移动。子层数组位置不变（合成顺序不变），
      // 只调整 pos（块锚定位置）与 folders 数组顺序（同 pos 冲突时）——空/非空文件夹同一套逻辑
      var ins = (d.insertVisual >= 0 ? d.insertVisual : 0);
      var fidx = -1;
      for (var fi = 0; fi < folders.length; fi++) if (folders[fi].id === d.folderId) { fidx = fi; break; }
      if (fidx < 0) return;
      // 重新收集 others（与 pointermove 同规则：文件夹行 + 非子层图层行，排除拖拽行自身）
      var others = [];
      var allRows = layerList.querySelectorAll(".folder-row, .layer-row:not(.indented)");
      for (var a = 0; a < allRows.length; a++) {
        var aRow = allRows[a];
        if (aRow.classList.contains("folder-row") && parseInt(aRow.getAttribute("data-folder"), 10) === d.folderId) continue;
        others.push(aRow);
      }
      var newPos = null, orderTarget = -1;
      if (ins < others.length) {
        var tRow = others[ins];
        if (tRow.classList.contains("folder-row")) {
          var tFid = parseInt(tRow.getAttribute("data-folder"), 10);
          for (var tf = 0; tf < folders.length; tf++) if (folders[tf].id === tFid) { orderTarget = tf; newPos = folders[tf].pos != null ? folders[tf].pos : null; break; }
        } else {
          newPos = layers[parseInt(tRow.getAttribute("data-idx"), 10)].id;   // 图层行：pos = 该图层 id（块插在该行上方）
        }
      }
      // 原地判定：pos 未变且（未拖到文件夹行或 folders 顺序未变）
      var oldPos = folders[fidx].pos != null ? folders[fidx].pos : null;
      var orderChanged = false;
      if (orderTarget >= 0) {
        var t2 = orderTarget; if (fidx < t2) t2--;
        orderChanged = (t2 !== fidx);
      }
      if (newPos === oldPos && !orderChanged) return;
      commit(function () {
        folders[fidx].pos = newPos;
        if (orderTarget >= 0) {
          var item = folders.splice(fidx, 1)[0];
          var t3 = orderTarget; if (fidx < t3) t3--;
          folders.splice(t3, 0, item);
        }
      });
      return;
    }
    // 图层拖拽排序
    if (d.type === "layer" && d.hoverFolder != null) {
      if (layers[d.idx].folder !== d.hoverFolder) {
        commit(function () { layers[d.idx].folder = d.hoverFolder; });
      }
      return;
    }
    var rest = [];
    for (var i = layers.length - 1; i >= 0; i--) {
      if (i === d.idx) continue;
      if (layers[i].folder != null) {
        // 与渲染同规则：跳过折叠文件夹的子层与孤儿引用（保证 rest ≡ 可见行 others）
        var fidx = -1;
        for (var f = 0; f < folders.length; f++) if (folders[f].id === layers[i].folder) { fidx = f; break; }
        if (fidx < 0 || folders[fidx].collapsed) continue;
      }
      rest.push(i);
    }
    var ins = (d.insertVisual >= 0 && d.insertVisual <= rest.length) ? d.insertVisual : rest.length;
    // newIdx：在数组倒序的可见层序列中，插到第 ins 个可见层上方（k+1）；ins 到末尾则置最底 0
    var newIdx = 0, found = false, cnt = 0;
    for (var k = layers.length - 1; k >= 0; k--) {
      if (k === d.idx) continue;
      if (layers[k].folder != null) {
        var fk = -1;
        for (var ff = 0; ff < folders.length; ff++) if (folders[ff].id === layers[k].folder) { fk = ff; break; }
        if (fk < 0 || folders[fk].collapsed) continue;
      }
      if (cnt === ins) { newIdx = k + 1 - (d.idx < k ? 1 : 0); found = true; break; }   // 补偿 splice(d.idx,1) 的索引偏移
      cnt++;
    }
    if (!found) newIdx = 0;
    if (newIdx === d.idx) return;   // 位置未变化
    commit(function () {
      var item = layers.splice(d.idx, 1)[0];
      layers.splice(newIdx, 0, item);
      activeIdx = newIdx;
    });
  }
  layerList.addEventListener("pointerup", function () { finishLayerDrag(false); });
  layerList.addEventListener("pointercancel", function () { finishLayerDrag(true); });

  /* ================= 图层右键菜单 ================= */
  var ctxMenu = null, ctxTargetIdx = -1, ctxType = "layer";
  function ensureCtxMenu() {
    if (ctxMenu) return;
    ctxMenu = document.createElement("div");
    ctxMenu.className = "ctx-menu";
    ctxMenu.hidden = true;
    document.body.appendChild(ctxMenu);
  }
  function buildCtxMenu(type) {
    ensureCtxMenu();
    if (type === "folder") {
      ctxMenu.innerHTML =
        '<div class="ctx-item" data-ctx="visibility"></div>' +
        '<div class="ctx-item" data-ctx="rename"></div>' +
        '<div class="ctx-sep"></div>' +
        '<div class="ctx-item danger" data-ctx="delete"></div>';
    } else {
      ctxMenu.innerHTML =
        '<div class="ctx-item" data-ctx="rename"></div>' +
        '<div class="ctx-item" data-ctx="lock"></div>' +
        '<div class="ctx-item" data-ctx="clip"></div>' +
        '<div class="ctx-sep"></div>' +
        '<div class="ctx-item danger" data-ctx="delete"></div>';
    }
  }
  function closeCtxMenu() {
    if (ctxMenu) ctxMenu.hidden = true;
    ctxTargetIdx = -1;
  }
  function showCtxMenuAt(e) {
    ctxMenu.hidden = false;   // 先显示再测量定位，避免隐藏时尺寸为 0 导致溢出
    var mw = ctxMenu.offsetWidth, mh = ctxMenu.offsetHeight;
    ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - mw - 6) + "px";
    ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - mh - 6) + "px";
  }
  layerList.addEventListener("contextmenu", function (e) {
    e.preventDefault();   // 明确拦截浏览器右键菜单（图层行/文件夹行/面板空白统一拦截）
    closeCanvasMenu();    // 与画布菜单互斥
    var row = e.target.closest(".layer-row");
    if (row) {
      ctxType = "layer";
      ctxTargetIdx = parseInt(row.getAttribute("data-idx"), 10);
      buildCtxMenu("layer");
      var l = layers[ctxTargetIdx];
      ctxMenu.querySelector('[data-ctx="rename"]').textContent = t("menu.rename");
      ctxMenu.querySelector('[data-ctx="lock"]').textContent = l.locked ? t("btn.unlock") : t("btn.lock");
      ctxMenu.querySelector('[data-ctx="clip"]').textContent = l.clipMask ? t("btn.unclipMask") : t("btn.clipMask");
      ctxMenu.querySelector('[data-ctx="delete"]').textContent = t("menu.delLayer");
      ctxMenu.querySelector('[data-ctx="clip"]').classList.toggle("disabled", ctxTargetIdx === 0);   // 最底层不能剪切
      showCtxMenuAt(e);
      return;
    }
    var frow = e.target.closest(".folder-row");
    if (frow) {
      ctxType = "folder";
      ctxTargetIdx = parseInt(frow.getAttribute("data-folder"), 10);
      buildCtxMenu("folder");
      ctxMenu.querySelector('[data-ctx="visibility"]').textContent = t("folder.visibility");
      ctxMenu.querySelector('[data-ctx="rename"]').textContent = t("menu.rename");
      ctxMenu.querySelector('[data-ctx="delete"]').textContent = t("folder.delete");
      showCtxMenuAt(e);
      return;
    }
    closeCtxMenu();
  });
  function handleCtxAction(action) {
    if (ctxTargetIdx < 0) return;
    if (ctxType === "folder") {
      var fid = ctxTargetIdx;
      if (action === "visibility") toggleFolderVisibility(fid);
      else if (action === "rename") {
        var frow = layerList.querySelector('.folder-row[data-folder="' + fid + '"]');
        var nameEl = frow && frow.querySelector(".folder-name");
        if (nameEl) startRename(nameEl);
      } else if (action === "delete") {
        deleteFolder(fid);
      }
      return;
    }
    if (ctxTargetIdx >= layers.length) return;
    setActive(ctxTargetIdx);
    if (action === "rename") {
      var row = layerList.querySelector('.layer-row[data-idx="' + ctxTargetIdx + '"]');
      var nameEl = row && row.querySelector(".layer-name");
      if (nameEl) startRename(nameEl);
    } else if (action === "lock") {
      toggleLock(ctxTargetIdx);
    } else if (action === "clip") {
      if (ctxTargetIdx > 0) commit(function () { layers[ctxTargetIdx].clipMask = !layers[ctxTargetIdx].clipMask; });
    } else if (action === "delete") {
      deleteLayer();
    }
  }
  document.addEventListener("click", function (e) {
    if (ctxMenu && !ctxMenu.hidden) {
      var item = e.target.closest(".ctx-item");
      if (item && !item.classList.contains("disabled")) handleCtxAction(item.getAttribute("data-ctx"));
      closeCtxMenu();
    }
    if (canvasMenu && !canvasMenu.hidden) {
      var btn = e.target.closest(".canvas-menu-grid button");
      if (btn && !btn.classList.contains("disabled")) handleCanvasCmd(btn.getAttribute("data-cmd"));
      closeCanvasMenu();
    }
  });

  /* ================= 画布右键菜单 ================= */
  var canvasMenu = null;
  function ensureCanvasMenu() {
    if (canvasMenu) return;
    canvasMenu = document.createElement("div");
    canvasMenu.className = "canvas-menu";
    canvasMenu.hidden = true;
    canvasMenu.innerHTML =
      '<div class="canvas-menu-grid">' +
      '<button data-cmd="undo">' + M_UNDO + '<span data-i18n="menu.undo">撤销</span></button>' +
      '<button data-cmd="redo">' + M_REDO + '<span data-i18n="menu.redo">重做</span></button>' +
      '<button data-cmd="select-all">' + M_SELALL + '<span data-i18n="menu.selectAll">全选</span></button>' +
      '<button data-cmd="deselect">' + M_DESEL + '<span data-i18n="menu.deselect">取消选择</span></button>' +
      '<button data-cmd="fill">' + M_FILL + '<span data-i18n="menu.fillSelection">填充选区</span></button>' +
      '<button data-cmd="clear">' + M_CLEAR + '<span data-i18n="menu.clearLayer">清空图层</span></button>' +
      '<button data-cmd="flip-h">' + M_FLIPH + '<span data-i18n="menu.flipH">水平翻转</span></button>' +
      '<button data-cmd="flip-v">' + M_FLIPV + '<span data-i18n="menu.flipV">垂直翻转</span></button>' +
      '<button data-cmd="export">' + M_EXPORT + '<span data-i18n="menu.export">导出 PNG</span></button>' +
      '</div>';
    document.body.appendChild(canvasMenu);
  }
  function closeCanvasMenu() { if (canvasMenu) canvasMenu.hidden = true; }
  function updateCanvasMenuState() {
    var btns = canvasMenu.querySelectorAll("button[data-cmd]");
    for (var i = 0; i < btns.length; i++) {
      var cmd = btns[i].getAttribute("data-cmd");
      var dis = false;
      if (cmd === "undo") dis = undoStack.length === 0;
      else if (cmd === "redo") dis = redoStack.length === 0;
      else if (cmd === "fill") dis = !selection || layers[activeIdx].locked;   // 无选区或锁定层禁用
      else if (cmd === "clear" || cmd === "flip-h" || cmd === "flip-v") dis = layers[activeIdx].locked;
      btns[i].classList.toggle("disabled", dis);
    }
  }
  function handleCanvasCmd(cmd) {
    switch (cmd) {
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "select-all": selectAll(); break;
      case "deselect": deselect(); break;
      case "fill": fillSelection(); break;
      case "clear": clearActiveLayer(); break;
      case "flip-h": flipLayer(true); break;
      case "flip-v": flipLayer(false); break;
      case "export": exportPNG(); break;
    }
  }
  viewport.addEventListener("contextmenu", function (e) {
    // 画布上（含周边空白）右键：显示功能菜单
    closeCtxMenu();
    ensureCanvasMenu();
    var els = canvasMenu.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute("data-i18n"));
    updateCanvasMenuState();
    canvasMenu.hidden = false;
    var mw = canvasMenu.offsetWidth, mh = canvasMenu.offsetHeight;
    canvasMenu.style.left = Math.min(e.clientX, window.innerWidth - mw - 6) + "px";
    canvasMenu.style.top = Math.min(e.clientY, window.innerHeight - mh - 6) + "px";
  });

  /* ================= 颜色面板（色轮 + 预设） ================= */
  var wheelHue = 0, wheelSat = 1, WHEEL_R = 70, WHEEL_C = 75;

  function drawWheel() {
    var ctx = wheelBase.getContext("2d");
    var size = 150;
    var img = ctx.createImageData(size, size);
    var data = img.data;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var dx = x - WHEEL_C, dy = y - WHEEL_C;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > WHEEL_R) continue;
        var hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        var rgb = hsvToRgb(hue, Math.min(dist / WHEEL_R, 1), 1);
        var p = (y * size + x) * 4;
        data[p] = rgb.r; data[p + 1] = rgb.g; data[p + 2] = rgb.b; data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function drawWheelCursor(hue, sat) {
    var ctx = wheelCursor.getContext("2d");
    ctx.clearRect(0, 0, 150, 150);
    var ang = hue * Math.PI / 180;
    var rad = sat * WHEEL_R;
    var x = WHEEL_C + Math.cos(ang) * rad, y = WHEEL_C + Math.sin(ang) * rad;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.strokeStyle = "#222"; ctx.lineWidth = 1; ctx.stroke();
  }
  function wheelPick(clientX, clientY) {
    var rect = wheelBase.getBoundingClientRect();
    var dx = clientX - rect.left - WHEEL_C, dy = clientY - rect.top - WHEEL_C;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    if (dist > WHEEL_R) { dx = dx / dist * WHEEL_R; dy = dy / dist * WHEEL_R; dist = WHEEL_R; }
    wheelHue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    wheelSat = dist / WHEEL_R;
    drawWheelCursor(wheelHue, wheelSat);
    selectColor(hsvToHex(wheelHue, wheelSat, parseInt(wheelValue.value, 10) / 100));
  }
  wheelBase.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    wheelPick(e.clientX, e.clientY);
    try { wheelBase.setPointerCapture(e.pointerId); } catch (err) {}
  });
  wheelBase.addEventListener("pointermove", function (e) {
    if (e.buttons & 1) wheelPick(e.clientX, e.clientY);
  });
  wheelValue.addEventListener("input", function () {
    wheelValueLabel.textContent = wheelValue.value + "%";
    selectColor(hsvToHex(wheelHue, wheelSat, parseInt(wheelValue.value, 10) / 100));
  });

  // 色盘吸管：一次性吸取画布像素色（取色后恢复原工具）
  var eyedropOnce = false, eyedropPrev = "brush";
  canvasPickBtn.addEventListener("click", function () {
    eyedropPrev = currentTool;
    setTool("eyedropper");
    eyedropOnce = true;
  });

  // 透明度滑块：实时改变当前颜色的透明度（画笔/油漆桶/填充实际带 alpha 绘制）
  colorAlpha.addEventListener("input", function () {
    colorAlphaLabel.textContent = colorAlpha.value + "%";
    currentAlpha = Math.round(parseInt(colorAlpha.value, 10) / 100 * 255);
    var rgbs = hexToRgb(currentColor);
    updateSliderGradients(rgbs);
    var rgbaBg = "rgba(" + rgbs.r + "," + rgbs.g + "," + rgbs.b + "," + (currentAlpha / 255) + ")";
    currentColorSwatch.style.background = rgbaBg;   // 当前色显示带透明度
    hexPreview.style.background = rgbaBg;           // 色值行颜色预览同步
    hexInput.value = rgbToString(rgbs.r, rgbs.g, rgbs.b, currentAlpha);   // 色值输入框同步 alpha
  });

  // 色轮 / RGB 模式切换
  var colorModeTabs = document.querySelectorAll(".color-mode-tab");
  for (var cti = 0; cti < colorModeTabs.length; cti++) {
    colorModeTabs[cti].addEventListener("click", function () {
      var mode = this.getAttribute("data-mode");
      for (var k = 0; k < colorModeTabs.length; k++) colorModeTabs[k].classList.toggle("active", colorModeTabs[k] === this);
      wheelWrap.hidden = mode !== "wheel";
      wheelValueRow.hidden = mode !== "wheel";
      rgbPanel.hidden = mode !== "rgb";
    });
  }
  // RGB 滑块：拖动取色
  function updateRgbVals() {
    rgbRVal.textContent = rgbR.value;
    rgbGVal.textContent = rgbG.value;
    rgbBVal.textContent = rgbB.value;
  }
  [rgbR, rgbG, rgbB].forEach(function (s) {
    s.addEventListener("input", function () {
      updateRgbVals();
      selectColor(rgbToHex(parseInt(rgbR.value, 10), parseInt(rgbG.value, 10), parseInt(rgbB.value, 10)));
    });
  });

  function renderPalette() {
    palette.innerHTML = "";
    var colors = PALETTES[palettePreset.value] || PALETTES.classic;
    colors.forEach(function (color) {
      var swatch = document.createElement("button");
      swatch.className = "swatch";
      swatch.type = "button";
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.title = color;
      swatch.addEventListener("click", function () { selectColor(color); });
      palette.appendChild(swatch);
    });
    var swatches = palette.children;
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle("active", swatches[i].dataset.color === currentColor);
    }
  }
  palettePreset.addEventListener("change", renderPalette);

  // 色盘滑块渐变：亮度=黑→当前纯色，RGB=各通道 0-255 渐变，透明度=透明→当前色
  function updateSliderGradients(rgb) {
    var pure = hsvToHex(wheelHue, wheelSat, 1);   // 当前色相/饱和度的纯色（V=100）
    wheelValue.style.setProperty("--grad", "linear-gradient(to right, #000, " + pure + ")");
    rgbR.style.setProperty("--grad", "linear-gradient(to right, rgb(0," + rgb.g + "," + rgb.b + "), rgb(255," + rgb.g + "," + rgb.b + "))");
    rgbG.style.setProperty("--grad", "linear-gradient(to right, rgb(" + rgb.r + ",0," + rgb.b + "), rgb(" + rgb.r + ",255," + rgb.b + "))");
    rgbB.style.setProperty("--grad", "linear-gradient(to right, rgb(" + rgb.r + "," + rgb.g + ",0), rgb(" + rgb.r + "," + rgb.g + ",255))");
    colorAlpha.style.setProperty("--grad", "linear-gradient(to right, rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0), rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",1))");
  }
  // 色值格式化：#RRGGBBAA（8 位 hex，AA = 透明度 0-255 的十六进制）
  function rgbToString(r, g, b, a) {
    function h2(n) { return ("0" + n.toString(16)).slice(-2); }
    return "#" + h2(r) + h2(g) + h2(b) + h2(a);
  }
  // 解析色值输入：支持 "255,128,0" / "255,128,0,50%" / "rgba(255,128,0,0.5)" / "#RGB" / "#RRGGBB" / "#RRGGBBAA"；返回 {r,g,b,a} 或 null
  function parseRgbInput(str) {
    var s = String(str).trim();
    if (!s) return null;
    if (s.charAt(0) === "#") {
      var hexBody = s.slice(1);
      if (hexBody.length === 3 || hexBody.length === 6) {
        var hx = hexToRgb(s);
        if (isNaN(hx.r) || isNaN(hx.g) || isNaN(hx.b)) return null;
        return { r: hx.r, g: hx.g, b: hx.b, a: 255 };
      }
      if (hexBody.length === 8) {   // #RRGGBBAA：透明度随 hex 一起解析
        var hx2 = hexToRgb("#" + hexBody.slice(0, 6));
        var aa = parseInt(hexBody.slice(6, 8), 16);
        if (isNaN(hx2.r) || isNaN(hx2.g) || isNaN(hx2.b) || isNaN(aa)) return null;
        return { r: hx2.r, g: hx2.g, b: hx2.b, a: aa };
      }
      return null;
    }
    var core = s.replace(/^rgba?\(/i, "").replace(/\)$/, "").trim();
    var parts = core.split(",").map(function (p) { return p.trim(); });
    if (parts.length < 3) return null;
    var r = parseInt(parts[0], 10), g = parseInt(parts[1], 10), b = parseInt(parts[2], 10);
    if (isNaN(r) || isNaN(g) || isNaN(b) || r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return null;
    var a = 255;
    if (parts.length >= 4 && parts[3] !== "") {
      var av = parts[3], aNum;
      if (/%$/.test(av)) aNum = parseFloat(av) / 100 * 255;
      else aNum = parseFloat(av) * (parseFloat(av) <= 1 ? 255 : 1);   // 0-1 小数 → 255 制；0-255 直接用
      if (isNaN(aNum)) return null;
      a = Math.max(0, Math.min(255, Math.round(aNum)));
    }
    return { r: r, g: g, b: b, a: a };
  }
  function selectColor(hex, keepInput) {
    currentColor = hex;
    var rgb = hexToRgb(hex);
    var hsv = hexToHsv(hex);
    wheelHue = hsv.h; wheelSat = hsv.s;   // 先更新色相/饱和度，供亮度渐变使用
    updateSliderGradients(rgb);
    var rgbaBg = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + (currentAlpha / 255) + ")";
    currentColorSwatch.style.background = rgbaBg;   // 当前色显示带透明度
    hexPreview.style.background = rgbaBg;           // 色值行颜色预览（较大色块）
    currentColorHex.textContent = hex;
    if (!keepInput) hexInput.value = rgbToString(rgb.r, rgb.g, rgb.b, currentAlpha);   // 输入过程中不重写输入框（光标/编辑不受干扰）
    // 同步 RGB 滑块
    rgbR.value = rgb.r; rgbG.value = rgb.g; rgbB.value = rgb.b;
    updateRgbVals();
    // 同步色轮指示与亮度滑块
    wheelValue.value = Math.round(hsv.v * 100);
    wheelValueLabel.textContent = wheelValue.value + "%";
    drawWheelCursor(wheelHue, wheelSat);
    var swatches = palette.children;
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle("active", swatches[i].dataset.color === hex);
    }
  }
  hexInput.addEventListener("input", function () {
    var p = parseRgbInput(hexInput.value);
    if (p) {
      currentColor = rgbToHex(p.r, p.g, p.b);
      currentAlpha = p.a;
      selectColor(currentColor, true);   // keepInput：不重写输入框，避免光标跳变
      colorAlpha.value = Math.round(p.a / 255 * 100);
      colorAlphaLabel.textContent = colorAlpha.value + "%";
    }
  });
  hexInput.addEventListener("blur", function () {
    var cur = hexToRgb(currentColor);
    hexInput.value = rgbToString(cur.r, cur.g, cur.b, currentAlpha);
  });

  /* ================= 工具切换 ================= */
  var TOOL_NAMES = { select: "toolName.select", brush: "toolName.brush", eraser: "toolName.eraser", bucket: "toolName.bucket", eyedropper: "toolName.eyedropper", move: "toolName.move", shape: "toolName.shape" };
  function setTool(tool) {
    eyedropOnce = false;   // 手动切换工具即取消一次性吸管模式
    currentTool = tool;
    var btns = toolsPanel.querySelectorAll(".tool-btn[data-tool]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].dataset.tool === tool);
    }
    board.style.cursor = tool === "eraser" ? "cell" : "crosshair";
    statusTool.textContent = t(TOOL_NAMES[tool]);
  }
  toolsPanel.addEventListener("click", function (e) {
    var btn = e.target.closest(".tool-btn[data-tool]");
    if (btn) setTool(btn.dataset.tool);
  });

  /* ================= 面板 / 状态更新 ================= */
  function updatePanels() {
    currentLayerLabel.textContent = layers[activeIdx].name;
    blendMode.value = layers[activeIdx].blend || "normal";
    layerOpacityInput.value = layers[activeIdx].opacity;
    layerOpacityLabel.textContent = layers[activeIdx].opacity + "%";
    statusInfo.textContent = t("status.info", [gridSize, gridSize, layers.length]);
    delLayerBtn.disabled = layers.length <= 1;
    layerUpBtn.disabled = activeIdx >= layers.length - 1;
    layerDownBtn.disabled = activeIdx <= 0;
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  /* ================= 缩放与平移 ================= */
  function renderTransform() {
    boardWrap.style.transform = "translate(" + curPanX + "px," + curPanY + "px) scale(" + curZoom + ")";
    zoomLabel.textContent = Math.round(curZoom * 100) + "%";
  }
  // rAF 插值循环：渲染值向目标值指数逼近，实现缩放/平移的平滑过渡
  function animateStep() {
    animId = null;
    var k = settings.smoothness;   // 插值系数：越大越跟手，越小越柔（首选项可调）
    var dz = zoom - curZoom, dx = panX - curPanX, dy = panY - curPanY;
    if (Math.abs(dz) < 0.0005 && Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
      curZoom = zoom; curPanX = panX; curPanY = panY;
    } else {
      curZoom += dz * k;
      curPanX += dx * k;
      curPanY += dy * k;
      requestTransformRender();
    }
    renderTransform();
  }
  function requestTransformRender() {
    if (animId !== null) return;
    animId = requestAnimationFrame(animateStep);
  }
  // 更新目标值后调用：目标立即生效，渲染值通过 rAF 平滑逼近
  function applyTransform() { requestTransformRender(); }
  // 跳过动画直接同步（用于初始化首屏）
  function applyTransformInstant() {
    curZoom = zoom; curPanX = panX; curPanY = panY;
    renderTransform();
  }
  // 适配视图：画布完整可见并居中（不超过 100%）
  function fitView() {
    var vw = viewport.clientWidth, vh = viewport.clientHeight;
    var bw = boardWrap.offsetWidth, bh = boardWrap.offsetHeight;
    if (!bw || !bh) return;
    zoom = Math.min(vw / bw, vh / bh, 1);
    panX = (vw - bw * zoom) / 2;
    panY = (vh - bh * zoom) / 2;
    applyTransform();
  }
  // 以视口内点 (mx,my) 为中心缩放（zoom-to-cursor），保持鼠标指向的画布位置不动
  function zoomAt(mx, my, factor) {
    var ns = zoom * factor;
    if (ns < ZOOM_MIN || ns > ZOOM_MAX) ns = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ns));
    if (ns === zoom) return;
    var ratio = ns / zoom;
    panX = mx - (mx - panX) * ratio;
    panY = my - (my - panY) * ratio;
    zoom = ns;
    applyTransform();
  }

  /* ================= 网格尺寸 ================= */
  function buildBoard() {
    selection = null;   // 默认无选区：所有操作作用于整个画布，且不显示高亮
    selDrag = null;
    board.innerHTML = "";
    board.style.setProperty("--n", gridSize);
    for (var i = 0; i < nCells(); i++) {
      var cell = document.createElement("div");
      cell.className = "cell";
      board.appendChild(cell);
    }
    gridSizeLabel.textContent = gridSize + "×" + gridSize;
  }
  brushSizeInput.addEventListener("input", function () {
    brushSize = parseInt(brushSizeInput.value, 10);
    brushSizeLabel.textContent = brushSize + "×" + brushSize;
  });
  // —— 创建画布：只在启动/新建时询问尺寸，之后不可更改 ——
  var canvasSizeOverlay = document.getElementById("canvasSizeOverlay");
  var canvasSizeInputEl = document.getElementById("canvasSizeInput");
  var canvasSizeOkBtn = document.getElementById("canvasSizeOk");
  var canvasSizeCancelBtn = document.getElementById("canvasSizeCancel");
  var docReady = false;   // 文档是否已创建（首次启动为 false）
  function openCanvasSizeDialog(defaultSize) {
    canvasSizeInputEl.value = defaultSize || settings.defaultGrid;
    canvasSizeOverlay.hidden = false;
    canvasSizeInputEl.focus();
    canvasSizeInputEl.select();
  }
  function createDocument(gs) {
    if (docReady) pushSnapshot();   // 已有文档时新建，保留撤销点
    gridSize = gs;
    layers = [createLayerNamed(t("layer.background")), createLayerNamed(t("layer.name") + " 1")];
    folders = [];
    folderSeq = 0;
    nameSeq = 2;
    activeIdx = layers.length - 1;
    selection = null;
    selDrag = null;
    docReady = true;
    buildBoard();
    renderLayerList();
    renderAll();
    updatePanels();
    fitView();
    applyTransformInstant();
  }
  canvasSizeOkBtn.addEventListener("click", function () {
    var gs = parseInt(canvasSizeInputEl.value, 10);
    if (!(gs >= GRID_MIN && gs <= GRID_MAX)) gs = settings.defaultGrid;
    canvasSizeOverlay.hidden = true;
    createDocument(gs);
  });
  canvasSizeCancelBtn.addEventListener("click", function () {
    canvasSizeOverlay.hidden = true;
    if (!docReady) createDocument(settings.defaultGrid);   // 首次启动取消：用默认值创建
  });

  /* ================= 不透明度（拖拽实时预览，松开进历史） ================= */
  layerOpacityInput.addEventListener("pointerdown", function () {
    if (opacityDragStarted) return;
    opacityDragStarted = true;
    pushSnapshot();
  });
  layerOpacityInput.addEventListener("input", function () {
    layers[activeIdx].opacity = parseInt(layerOpacityInput.value, 10);
    renderAll();
    layerOpacityLabel.textContent = layers[activeIdx].opacity + "%";
  });
  document.addEventListener("pointerup", function () { opacityDragStarted = false; });

  /* ================= 多语言（zh / ja / en） ================= */
  var LANG_INDEX = { zh: 0, ja: 1, en: 2 };
  var I18N = {
    "app.name": ["像素画板", "ピクセルペイント", "Pixel Paint"],
    "menu.file": ["文件", "ファイル", "File"],
    "menu.edit": ["编辑", "編集", "Edit"],
    "menu.layer": ["图层", "レイヤー", "Layers"],
    "menu.image": ["图像", "画像", "Image"],
    "menu.help": ["帮助", "ヘルプ", "Help"],
    "menu.select": ["选择", "選択", "Select"],
    "menu.selectAll": ["全选", "すべて選択", "Select All"],
    "menu.deselect": ["取消选择", "選択解除", "Deselect"],
    "menu.newCanvas": ["新建画布", "新規キャンバス", "New Canvas"],
    "menu.open": ["打开工程…", "プロジェクトを開く…", "Open Project…"],
    "menu.exportProject": ["导出工程…", "プロジェクトを書き出し…", "Export Project…"],
    "msg.openFailed": ["无法打开该文件：不是有效的 .AIPSD 工程文件。", "ファイルを開けません：有効な .AIPSD プロジェクトではありません。", "Cannot open file: not a valid .AIPSD project."],
    "msg.saveSettingsTitle": ["保存设置", "設定を保存", "Save Settings"],
    "msg.saveSettingsText": ["是否将当前设置一并保存到工程文件中？", "現在の設定をプロジェクトファイルに保存しますか？", "Save current settings into the project file?"],
    "msg.yes": ["保存", "保存", "Save"],
    "msg.no": ["不保存", "保存しない", "Don't Save"],
    "act.undo": ["撤销", "元に戻す", "Undo"],
    "act.redo": ["重做", "やり直す", "Redo"],
    "act.redo2": ["重做（备选）", "やり直す（別キー）", "Redo (Alt)"],
    "act.select": ["选择工具", "選択ツール", "Select Tool"],
    "act.brush": ["画笔", "ブラシ", "Brush"],
    "act.eraser": ["橡皮擦", "消しゴム", "Eraser"],
    "act.bucket": ["油漆桶", "バケツ", "Fill Bucket"],
    "act.eyedropper": ["吸管", "スポイト", "Eyedropper"],
    "act.selectAll": ["全选", "すべて選択", "Select All"],
    "act.deselect": ["取消选择", "選択解除", "Deselect"],
    "act.moveUp": ["上移一层", "上に移動", "Move Layer Up"],
    "act.moveDown": ["下移一层", "下に移動", "Move Layer Down"],
    "act.addLayer": ["新建图层", "新規レイヤー", "New Layer"],
    "act.clipMask": ["剪切蒙版", "クリッピングマスク", "Clipping Mask"],
    "act.fitView": ["适配视图", "ビューにフィット", "Fit View"],
    "act.zoom100": ["100% 缩放", "100% 表示", "Zoom 100%"],
    "act.zoomIn": ["放大", "拡大", "Zoom In"],
    "act.zoomOut": ["缩小", "縮小", "Zoom Out"],
    "act.openProject": ["打开工程", "プロジェクトを開く", "Open Project"],
    "act.move": ["移动", "移動", "Move"],
    "act.shape": ["形状", "シェイプ", "Shape"],
    "shape.rect": ["方", "四角", "Rect"],
    "shape.ellipse": ["圆", "円", "Circle"],
    "shape.fill": ["填充", "塗りつぶし", "Fill"],
    "shape.stroke": ["描边", "枠線", "Stroke"],
    "act.change": ["更改", "変更", "Change"],
    "act.reset": ["重置", "リセット", "Reset"],
    "act.recording": ["按下新快捷键…", "新しいキーを押してください…", "Press new shortcut…"],
    "msg.shortcutConflict": ["快捷键冲突：已分配给 ", "ショートカットの競合：", "Shortcut conflict: assigned to "],
    "msg.importSettingsTitle": ["检测到工程设置", "プロジェクト設定を検出", "Project Settings Found"],
    "msg.importSettingsText": ["该工程包含设置，是否覆盖当前设置？", "このプロジェクトには設定が含まれています。現在の設定を上書きしますか？", "This project contains settings. Overwrite current settings?"],
    "msg.overwrite": ["覆盖", "上書き", "Overwrite"],
    "msg.keep": ["不覆盖", "上書きしない", "Keep"],
    "msg.export": ["导出", "書き出し", "Export"],
    "menu.export": ["导出 PNG…", "PNG 書き出し…", "Export PNG…"],
    "menu.undo": ["撤销", "元に戻す", "Undo"],
    "menu.redo": ["重做", "やり直す", "Redo"],
    "menu.rename": ["重命名", "名前変更", "Rename"],
    "menu.fillSelection": ["填充选区", "選択範囲を塗る", "Fill Selection"],
    "menu.flipH": ["水平翻转", "水平反転", "Flip Horizontal"],
    "menu.flipV": ["垂直翻转", "垂直反転", "Flip Vertical"],
    "menu.clearLayer": ["清空当前图层", "現在のレイヤーをクリア", "Clear Current Layer"],
    "menu.prefs": ["首选项…", "環境設定…", "Preferences…"],
    "menu.settings": ["设置", "設定", "Settings"],
    "menu.addLayer": ["新建图层", "新規レイヤー", "New Layer"],
    "menu.dupLayer": ["复制图层", "レイヤーを複製", "Duplicate Layer"],
    "menu.clipMask": ["剪切蒙版", "クリッピングマスク", "Clipping Mask"],
    "menu.newFolder": ["新建文件夹", "新規フォルダー", "New Folder"],
    "btn.addFolder": ["新建文件夹", "新規フォルダー", "New Folder"],
    "btn.clipMask": ["剪切蒙版", "クリッピングマスク", "Clipping Mask"],
    "btn.unclipMask": ["释放剪切蒙版", "クリッピングマスク解除", "Release Clipping Mask"],
    "btn.lock": ["锁定图层", "レイヤーをロック", "Lock Layer"],
    "btn.unlock": ["解锁图层", "レイヤーのロック解除", "Unlock Layer"],
    "folder.name": ["文件夹", "フォルダー", "Folder"],
    "folder.delete": ["删除文件夹", "フォルダーを削除", "Delete Folder"],
    "folder.toggle": ["折叠/展开", "折りたたみ/展開", "Collapse/Expand"],
    "folder.title": ["图层文件夹", "レイヤーフォルダー", "Layer Folder"],
    "folder.visibility": ["切换文件夹可见性", "フォルダー表示の切り替え", "Toggle Folder Visibility"],
    "menu.moveUp": ["上移一层", "上へ移動", "Move Layer Up"],
    "menu.moveDown": ["下移一层", "下へ移動", "Move Layer Down"],
    "menu.delLayer": ["删除图层", "レイヤーを削除", "Delete Layer"],
    "menu.adjust": ["调整…", "色調補正…", "Adjust…"],
    "menu.qa": ["Q&A", "Q&A", "Q&A"],
    "menu.about": ["关于 像素画板", "ピクセルペイントについて", "About Pixel Paint"],
    "bar.undo": ["↩ 撤销", "↩ 元に戻す", "↩ Undo"],
    "bar.redo": ["↪ 重做", "↪ やり直す", "↪ Redo"],
    "bar.size": ["大小", "サイズ", "Size"],
    "bar.grid": ["网格", "グリッド", "Grid"],
    "bar.color": ["颜色", "カラー", "Color"],
    "bar.layer": ["图层", "レイヤー", "Layer"],
    "tool.select": ["选区 (M)", "選択 (M)", "Select (M)"],
    "tool.brush": ["画笔 (B)", "ブラシ (B)", "Brush (B)"],
    "tool.eraser": ["橡皮擦 (E)", "消しゴム (E)", "Eraser (E)"],
    "tool.bucket": ["油漆桶 (G)", "バケツ (G)", "Bucket (G)"],
    "tool.eyedropper": ["吸管 (I)", "スポイト (I)", "Eyedropper (I)"],
    "tool.move": ["移动选区内容 (V)", "選択内容を移動 (V)", "Move selection content (V)"],
    "tool.shape": ["形状工具 (U)", "シェイプツール (U)", "Shape tool (U)"],
    "tool.clearLayer": ["清空当前图层", "現在のレイヤーをクリア", "Clear Current Layer"],
    "toolName.select": ["选区", "選択", "Select"],
    "toolName.brush": ["画笔", "ブラシ", "Brush"],
    "toolName.eraser": ["橡皮擦", "消しゴム", "Eraser"],
    "toolName.bucket": ["油漆桶", "バケツ", "Bucket"],
    "toolName.eyedropper": ["吸管", "スポイト", "Eyedropper"],
    "toolName.move": ["移动", "移動", "Move"],
    "toolName.shape": ["形状", "シェイプ", "Shape"],
    "panel.layers": ["图层", "レイヤー", "Layers"],
    "panel.color": ["颜色", "カラー", "Color"],
    "panel.opacity": ["不透明度", "不透明度", "Opacity"],
    "panel.brightness": ["亮度", "明るさ", "Brightness"],
    "panel.hex": ["色值", "カラーコード", "Hex"],
    "panel.alpha": ["透明度", "透明度", "Opacity"],
    "panel.pick": ["从画布取色", "キャンバスから色を取得", "Pick from Canvas"],
    "panel.preset": ["预设", "プリセット", "Preset"],
    "colorMode.wheel": ["色轮", "カラーホイール", "Color Wheel"],
    "colorMode.rgb": ["RGB", "RGB", "RGB"],
    "btn.addLayer": ["新建图层", "新規レイヤー", "New Layer"],
    "btn.dupLayer": ["复制图层", "レイヤーを複製", "Duplicate Layer"],
    "btn.moveUp": ["上移一层", "上へ移動", "Move Up"],
    "btn.moveDown": ["下移一层", "下へ移動", "Move Down"],
    "btn.delLayer": ["删除图层", "レイヤーを削除", "Delete Layer"],
    "blend.normal": ["正常", "通常", "Normal"],
    "blend.multiply": ["正片叠底", "乗算", "Multiply"],
    "blend.screen": ["滤色", "スクリーン", "Screen"],
    "blend.overlay": ["叠加", "オーバーレイ", "Overlay"],
    "blend.darken": ["变暗", "比較（暗）", "Darken"],
    "blend.lighten": ["变亮", "比較（明）", "Lighten"],
    "blend.difference": ["差值", "差の絶対値", "Difference"],
    "blend.exclusion": ["排除", "除外", "Exclusion"],
    "blend.color-dodge": ["颜色减淡", "覆い焼きカラー", "Color Dodge"],
    "blend.color-burn": ["颜色加深", "焼き込みカラー", "Color Burn"],
    "blend.hard-light": ["强光", "ハードライト", "Hard Light"],
    "blend.soft-light": ["柔光", "ソフトライト", "Soft Light"],
    "preset.classic": ["经典", "クラシック", "Classic"],
    "preset.pico8": ["PICO-8 像素风", "PICO-8 ピクセル", "PICO-8 Pixel"],
    "preset.vga": ["VGA 复古", "VGA レトロ", "VGA Retro"],
    "preset.websafe": ["Web 安全色", "Web セーフカラー", "Web Safe"],
    "set.title": ["首选项", "環境設定", "Preferences"],
    "set.showGrid": ["显示网格线", "グリッドを表示", "Show Grid"],
    "set.checker": ["透明棋盘格背景", "透明チェッカー背景", "Transparent Checkerboard"],
    "set.exportCell": ["导出像素大小", "書き出しピクセルサイズ", "Export Pixel Size"],
    "set.undoLimit": ["撤销步数", "元に戻すステップ数", "Undo Steps"],
    "set.zoomStep": ["滚轮缩放步进", "ズームステップ", "Zoom Step"],
    "set.defaultGrid": ["默认网格尺寸", "デフォルトのグリッドサイズ", "Default Grid Size"],
    "set.exportBg": ["导出背景", "書き出し背景", "Export Background"],
    "set.checkerTone": ["棋盘格明度", "チェッカー明度", "Checkerboard Tone"],
    "set.smoothness": ["视图平滑度", "表示のなめらかさ", "View Smoothness"],
    "set.theme": ["主题", "テーマ", "Theme"],
    "set.lang": ["语言", "言語", "Language"],
    "set.clickDeselect": ["点击画布外取消选区", "キャンバス外クリックで選択解除", "Click outside canvas to deselect"],
    "prefs.group.canvas": ["画布", "キャンバス", "Canvas"],
    "prefs.group.export": ["导出", "書き出し", "Export"],
    "prefs.group.view": ["视图与历史", "表示と履歴", "View & History"],
    "prefs.group.appearance": ["外观", "外観", "Appearance"],
    "prefs.group.selection": ["选区", "選択", "Selection"],
    "prefs.group.shortcuts": ["快捷键", "ショートカット", "Shortcuts"],
    "set.reset": ["恢复默认", "デフォルトに戻す", "Reset Defaults"],
    "set.ok": ["完成", "OK", "OK"],
    "set.bg.transparent": ["透明", "透明", "Transparent"],
    "set.bg.white": ["白色", "白", "White"],
    "set.tone.dark": ["深色", "ダーク", "Dark"],
    "set.tone.standard": ["标准", "標準", "Standard"],
    "set.tone.light": ["亮色", "ライト", "Light"],
    "set.smooth.snappy": ["跟手", "クイック", "Snappy"],
    "set.smooth.normal": ["适中", "標準", "Normal"],
    "set.smooth.soft": ["柔和", "スムーズ", "Soft"],
    "set.zoom.smooth": ["平滑（1.05×）", "スムーズ（1.05×）", "Smooth (1.05×)"],
    "set.zoom.normal": ["适中（1.1×）", "標準（1.1×）", "Normal (1.1×)"],
    "set.zoom.fast": ["快速（1.2×）", "クイック（1.2×）", "Fast (1.2×)"],
    "set.undo.20": ["20 步", "20 ステップ", "20 steps"],
    "set.undo.40": ["40 步", "40 ステップ", "40 steps"],
    "set.undo.100": ["100 步", "100 ステップ", "100 steps"],
    "theme.dark": ["深色", "ダーク", "Dark"],
    "theme.light": ["亮色", "ライト", "Light"],
    "about.desc": ["一个零依赖、单文件的像素绘图小工具，界面与交互借鉴经典像素软件。", "依存ゼロ・単一ファイルのピクセルペイントツール。クラシックなピクセルソフトの操作感を踏襲しています。", "A zero-dependency, single-file pixel art tool, inspired by classic pixel software."],
    "about.features": ["多图层（增删/排序/可见性/重命名/不透明度/混合模式/缩略图）、画笔 / 橡皮擦 / 油漆桶 / 吸管、撤销重做、以鼠标为中心的缩放与平滑平移、透明背景 PNG 导出、可配置首选项、中日英界面。", "多レイヤー（追加/削除/並び替え/表示/名前変更/不透明度/合成モード/サムネイル）、ブラシ / 消しゴム / バケツ / スポイト、元に戻す・やり直す、マウス中心のズームとなめらかなパン、透明背景 PNG 書き出し、環境設定、日本語・中国語・英語 UI。", "Multiple layers (add/delete/reorder/visibility/rename/opacity/blend modes/thumbnails), brush / eraser / bucket / eyedropper, undo & redo, cursor-centered zoom with smooth panning, transparent-background PNG export, preferences, and a trilingual UI."],
    "about.shortcuts": ["Ctrl+Alt+G 剪切蒙版 · M 选区 · B / E / G / I 切换工具 · Ctrl+Z / Ctrl+Y 撤销重做 · Ctrl+[ / Ctrl+] 调整图层顺序 · Ctrl+Shift+N 新建图层 · Ctrl+A 全选 · Ctrl+D 取消选择 · 滚轮缩放 · 空格或中键拖拽平移 · Ctrl+0 适配视图", "Ctrl+Alt+G クリッピングマスク · M 選択 · B / E / G / I ツール切替 · Ctrl+Z / Ctrl+Y 元に戻す/やり直す · Ctrl+[ / Ctrl+] レイヤー順序 · Ctrl+Shift+N 新規レイヤー · Ctrl+A すべて選択 · Ctrl+D 選択解除 · ホイールでズーム · スペースまたは中ドラッグでパン · Ctrl+0 表示に合わせる", "Ctrl+Alt+G clipping mask · M select · B / E / G / I switch tools · Ctrl+Z / Ctrl+Y undo / redo · Ctrl+[ / Ctrl+] reorder layers · Ctrl+Shift+N new layer · Ctrl+A select all · Ctrl+D deselect · wheel zoom · space or middle-drag pan · Ctrl+0 fit view"],
    "about.tech": ["纯 HTML + CSS + JavaScript，无任何外部依赖，双击即可离线运行。", "HTML・CSS・JavaScript のみ。外部依存ゼロ、ダブルクリックでオフライン動作します。", "Pure HTML + CSS + JavaScript. No external dependencies — double-click to run offline."],
    "about.title": ["🎨 像素画板", "🎨 ピクセルペイント", "🎨 Pixel Paint"],
    "about.featuresLabel": ["功能：", "機能：", "Features: "],
    "about.shortcutsLabel": ["快捷键：", "ショートカット：", "Shortcuts: "],
    "about.fontPrefix": ["界面字体：", "UI フォント：", "UI font: "],
    "about.fontSuffix": ["（SIL OFL 1.1 · © TakWolf 及贡献者）", "（SIL OFL 1.1 · © TakWolf およびコントリビューター）", "(SIL OFL 1.1 · © TakWolf and contributors)"],
    "app.brand": ["🖌 像素画板", "🖌 ピクセルペイント", "🖌 Pixel Paint"],
    "common.ok": ["确定", "OK", "OK"],
    "common.cancel": ["取消", "キャンセル", "Cancel"],
    "canvas.title": ["新建画布", "新規キャンバス", "New Canvas"],
    "canvas.size": ["画布尺寸", "キャンバスサイズ", "Canvas Size"],
    "canvas.range": ["(8–64)", "(8–64)", "(8–64)"],
    "canvas.hint": ["创建后不可更改尺寸，请确认。", "作成後はサイズを変更できません。", "The size cannot be changed after creation."],
    "panel.blend": ["当前图层的混合模式", "現在のレイヤーの合成モード", "Blend mode of current layer"],
    "adj.title": ["图像调整", "色調補正", "Adjust"],
    "adj.applyTo": ["应用于", "適用対象", "Apply to"],
    "adj.currentLayer": ["当前图层", "現在のレイヤー", "Current Layer"],
    "adj.allLayers": ["所有可见图层", "すべての表示レイヤー", "All Visible Layers"],
    "adj.hue": ["色相", "色相", "Hue"],
    "adj.sat": ["饱和度", "彩度", "Saturation"],
    "adj.bright": ["亮度", "明るさ", "Brightness"],
    "adj.contrast": ["对比度", "コントラスト", "Contrast"],
    "adj.cancel": ["取消", "キャンセル", "Cancel"],
    "adj.apply": ["应用", "適用", "Apply"],
    "qa.q1": ["Q1. 快捷键在哪里查看或修改？", "Q1. ショートカットはどこで確認・変更できますか？", "Q1. Where can I view or change shortcuts?"],
    "qa.a1": ["打开 设置 → 快捷键，可查看全部快捷键，点击“更改”后直接按下新组合即可自定义。", "設定 → ショートカット で全ショートカットを確認でき、「変更」をクリックして新しいキーを押すだけでカスタマイズできます。", "Open Settings → Shortcuts to view all shortcuts; click Change and press the new combination to customize."],
    "qa.q2": ["Q2. 如何撤销或重做？", "Q2. 元に戻す・やり直すには？", "Q2. How to undo or redo?"],
    "qa.a2": ["默认 Ctrl+Z 撤销、Ctrl+Y 重做（也可在设置中自定义其他按键）。", "既定では Ctrl+Z で元に戻し、Ctrl+Y でやり直します（設定で変更可）。", "Default: Ctrl+Z undo, Ctrl+Y redo (both customizable in Settings)."],
    "qa.q3": ["Q3. 如何保存或打开工程？", "Q3. プロジェクトの保存・開き方は？", "Q3. How to save or open a project?"],
    "qa.a3": ["使用 文件 → 导出工程 保存为 .AIPSD 工程文件，文件 → 打开工程 载入；文件 → 导出 PNG 可导出图片。", "ファイル → プロジェクトをエクスポート で .AIPSD を保存、ファイル → プロジェクトを開く で読み込みます。PNG 書き出しも可能です。", "Use File → Export Project to save .AIPSD, File → Open Project to load; File → Export PNG exports an image."],
    "qa.q4": ["Q4. 图层文件夹怎么使用？", "Q4. レイヤーフォルダーの使い方は？", "Q4. How do layer folders work?"],
    "qa.a4": ["新建文件夹后，把图层拖到文件夹行上即可移入；文件夹行可拖拽排序、折叠、单独控制可见性，文件夹内图层的合成顺序不变。", "フォルダーを作成後、レイヤーをフォルダー行にドラッグすると移動できます。並べ替え・折りたたみ・表示切り替えが可能で、中のレイヤーの合成順は変わりません。", "Create a folder, drag layers onto its row to move them in. Folder rows can be reordered, collapsed, and toggled independently; child layer compositing order is unchanged."],
    "qa.q5": ["Q5. 如何缩放或平移画布？", "Q5. キャンバスの拡大縮小・移動は？", "Q5. How to zoom or pan the canvas?"],
    "qa.a5": ["滚轮以鼠标为中心缩放；按住空格或中键拖拽平移；Ctrl+0 适配视图，Ctrl+1 回到 100%。", "ホイールでカーソル中心に拡大縮小、Space または中ボタンドラッグで移動、Ctrl+0 でフィット表示、Ctrl+1 で 100% 表示。", "Wheel zooms around the cursor; Space or middle-drag pans; Ctrl+0 fits view, Ctrl+1 returns to 100%."],
    "qa.q6": ["Q6. 如何切换界面语言或主题？", "Q6. 言語やテーマの切り替えは？", "Q6. How to switch language or theme?"],
    "qa.a6": ["打开 设置 → 外观，可切换 中文/日本語/English 界面与深色/亮色主题。", "設定 → 外観 で 中文/日本語/English と言語、ダーク/ライトテーマを切り替えられます。", "Open Settings → Appearance to switch between 中文/日本語/English and dark/light theme."],
    "qa.q7": ["Q7. 移动工具和形状工具怎么用？", "Q7. 移動ツールとシェイプツールの使い方は？", "Q7. How do the Move and Shape tools work?"],
    "qa.a7": ["选择「移动」工具（V）后在选区内拖拽即可剪切移动选区内容；「形状」工具（U）拖拽绘制矩形/圆形，用工具栏下方按钮切换 方/圆 与 填充/描边（描边粗细随顶部「大小」）。", "「移動」(V) で選択範囲内をドラッグすると内容を移動、「シェイプ」(U) で矩形/円を描画、下のボタンで 四角/円 と 塗り/枠線 を切替（太さは「サイズ」）。", "Pick the Move tool (V) and drag inside a selection to cut-and-move its content; the Shape tool (U) draws rectangles/circles — toggle rect/circle and fill/stroke with the buttons below (thickness follows the top Size)."],
    "qa.q8": ["Q8. 选区如何移动或取消？", "Q8. 選択範囲の移動・解除は？", "Q8. How to move or clear a selection?"],
    "qa.a8": ["用「选择」工具拖拽选区内部（非边缘）移动选框，拖边缘或外部重新框选；Ctrl+A 全选、Ctrl+D 取消，点击画布外空白也可取消（可在设置中开关）。", "「選択」ツールで選択範囲の内側（端以外）をドラッグすると移動、端や外側は新規選択。Ctrl+A で全選択、Ctrl+D で解除、キャンバス外クリックでも解除可（設定で切替）。", "With the Select tool, drag the interior (not the edge) to move the selection; drag the edge or outside to start a new one. Ctrl+A selects all, Ctrl+D deselects; clicking empty canvas also deselects (toggle in Settings)."],
    "qa.q9": ["Q9. 如何调节画笔/橡皮擦粗细？", "Q9. ブラシ・消しゴムの太さの変え方は？", "Q9. How to change brush/eraser size?"],
    "qa.a9": ["顶部工具栏的「大小」滑块控制画笔与橡皮擦的粗细（1–16 格）。", "上部ツールバーの「サイズ」スライダーでブラシ・消しゴムの太さを変更できます（1–16 マス）。", "The Size slider on the top bar controls brush and eraser thickness (1–16 cells)."],
    "qa.q10": ["Q10. 如何吸取画布上的颜色？", "Q10. キャンバスから色を取得するには？", "Q10. How to pick a color from the canvas?"],
    "qa.a10": ["用「吸管」工具（I）点击画布取色；或点颜色面板的「从画布取色」按钮后点画布取色，取色后自动回到原工具。", "「スポイト」(I) でキャンバスをクリックして色を取得、またはカラーパネルの「キャンバスから色を取得」で一時的に取色できます。", "Use the Eyedropper tool (I) to click the canvas; or click “Pick from Canvas” in the color panel for a one-shot pick, then it returns to your previous tool."],
    "layer.rowTitle": ["点击选择 · 双击重命名 · 拖拽排序", "クリックで選択 · ダブルクリックで名前変更 · ドラッグで並べ替え", "Click to select · double-click to rename · drag to reorder"],
    "layer.renameTitle": ["双击重命名", "ダブルクリックで名前変更", "Double-click to rename"],
    "status.zoomTip": ["点击重置 100% · Ctrl+0 适配视图 · Ctrl+滚轮缩放", "クリックで 100% にリセット · Ctrl+0 表示に合わせる · Ctrl+ホイールでズーム", "Click to reset 100% · Ctrl+0 fit view · Ctrl+wheel zoom"],
    "layer.name": ["图层", "レイヤー", "Layer"],
    "layer.background": ["背景", "背景", "Background"],
    "layer.copy": [" 副本", " のコピー", " copy"],
    "status.info": ["{0} × {1} · {2} 图层", "{0} × {1} · レイヤー {2}", "{0} × {1} · {2} layers"]
  };
  function t(key, args) {
    var arr = I18N[key];
    var s = arr ? (arr[LANG_INDEX[settings.lang]] != null ? arr[LANG_INDEX[settings.lang]] : arr[0]) : key;
    if (args) {
      for (var i = 0; i < args.length; i++) s = s.replace("{" + i + "}", args[i]);
    }
    return s;
  }
  function applyI18n() {
    var els = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute("data-i18n"));
    var titles = document.querySelectorAll("[data-i18n-title]");
    for (var j = 0; j < titles.length; j++) titles[j].title = t(titles[j].getAttribute("data-i18n-title"));
    // 动态文本：图层名、工具名、状态栏、面板
    renderPalette();
    renderLayerList();
    setTool(currentTool);
    updatePanels();
  }

  /* ================= 设置（首选项） ================= */
  var SETTINGS_DEFAULTS = {
    showGrid: true,       // 网格线
    checkerboard: true,   // 透明棋盘格背景
    undoLimit: 40,        // 撤销步数
    zoomStep: 1.1,        // 滚轮缩放步进
    defaultGrid: 16,      // 默认网格尺寸
    checkerTone: "standard", // 棋盘格明度：dark | standard | light
    smoothness: 0.28,     // 视图插值系数（越小越柔）
    theme: "dark",        // 主题：dark | light
    lang: "zh",           // 语言：zh | ja | en
    clickDeselect: true,   // 点击画布外空白取消选区
    keymap: {}             // 自定义快捷键：{actionId: "Ctrl+Z"}，缺省用各动作默认值
  };
  var KEY_ACTIONS = [
    { id: "undo", labelKey: "act.undo", def: "Ctrl+Z", run: undo },
    { id: "redo", labelKey: "act.redo", def: "Ctrl+Y", run: redo },
    { id: "redo2", labelKey: "act.redo2", def: "Ctrl+Shift+Z", run: redo },
    { id: "select", labelKey: "act.select", def: "M", run: function () { setTool("select"); } },
    { id: "brush", labelKey: "act.brush", def: "B", run: function () { setTool("brush"); } },
    { id: "eraser", labelKey: "act.eraser", def: "E", run: function () { setTool("eraser"); } },
    { id: "bucket", labelKey: "act.bucket", def: "G", run: function () { setTool("bucket"); } },
    { id: "eyedropper", labelKey: "act.eyedropper", def: "I", run: function () { setTool("eyedropper"); } },
    { id: "move", labelKey: "act.move", def: "V", run: function () { setTool("move"); } },
    { id: "shape", labelKey: "act.shape", def: "U", run: function () { setTool("shape"); } },
    { id: "selectAll", labelKey: "act.selectAll", def: "Ctrl+A", run: selectAll },
    { id: "deselect", labelKey: "act.deselect", def: "Ctrl+D", run: deselect },
    { id: "moveUp", labelKey: "act.moveUp", def: "Ctrl+]", run: function () { moveLayer(1); } },
    { id: "moveDown", labelKey: "act.moveDown", def: "Ctrl+[", run: function () { moveLayer(-1); } },
    { id: "addLayer", labelKey: "act.addLayer", def: "Ctrl+Shift+N", run: addLayer },
    { id: "clipMask", labelKey: "act.clipMask", def: "Ctrl+Alt+G", run: toggleClipMask },
    { id: "fitView", labelKey: "act.fitView", def: "Ctrl+0", run: fitView },
    { id: "zoom100", labelKey: "act.zoom100", def: "Ctrl+1", run: zoom100 },
    { id: "zoomIn", labelKey: "act.zoomIn", def: "Ctrl+=", run: zoomInCenter },
    { id: "zoomOut", labelKey: "act.zoomOut", def: "Ctrl+-", run: zoomOutCenter },
    { id: "openProject", labelKey: "act.openProject", def: "Ctrl+O", run: triggerOpenProject }
  ];
  function actionById(id) {
    for (var i = 0; i < KEY_ACTIONS.length; i++) if (KEY_ACTIONS[i].id === id) return KEY_ACTIONS[i];
    return null;
  }
  function keyBind(id) {
    var a = actionById(id);
    return (settings.keymap && settings.keymap[id]) || (a ? a.def : "");
  }
  function parseKeys(s) {
    // "Ctrl+Shift+N" -> {ctrl,shift,alt,key}；主键为 + 时（"Ctrl++"）取空段修正为 "+"
    var parts = String(s).split("+");
    var k = { ctrl: false, shift: false, alt: false, key: parts[parts.length - 1] };
    if (k.key === "") k.key = "+";
    for (var i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "Ctrl") k.ctrl = true;
      else if (parts[i] === "Shift") k.shift = true;
      else if (parts[i] === "Alt") k.alt = true;
    }
    return k;
  }
  function keysMatch(e, s) {
    var k = parseKeys(s);
    if (!k.key) return false;
    if (e.ctrlKey !== k.ctrl || e.altKey !== k.alt || e.shiftKey !== k.shift) return false;
    var want = k.key;
    if (/^[a-zA-Z0-9]$/.test(want)) return e.key.toLowerCase() === want.toLowerCase();
    if (want === "=" || want === "+") return e.key === "=" || e.key === "+";
    return e.key === want;
  }
  function zoom100() {
    zoom = 1;
    panX = (viewport.clientWidth - boardWrap.offsetWidth) / 2;
    panY = (viewport.clientHeight - boardWrap.offsetHeight) / 2;
    applyTransform();
  }
  function zoomInCenter() { zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1.1); }
  function zoomOutCenter() { zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1 / 1.1); }
  var CHECKER_TONES = {
    dark: ["#33333a", "#26262c"],
    standard: ["#484852", "#383842"],
    light: ["#5e5e6c", "#4a4a58"]
  };
  var SETTINGS_KEY = "pixelboard.settings";
  var settings = loadSettings();

  function loadSettings() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; } catch (e) {}
    var out = {};
    for (var k in SETTINGS_DEFAULTS) {
      if (k === "keymap") out[k] = saved && typeof saved[k] === "object" && saved[k] ? JSON.parse(JSON.stringify(saved[k])) : {};   // 深拷贝，避免共享默认对象
      else out[k] = (k in saved) ? saved[k] : SETTINGS_DEFAULTS[k];
    }
    return out;
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }
  function applySettings() {
    board.classList.toggle("no-grid", !settings.showGrid);
    board.classList.toggle("no-checker", !settings.checkerboard);
    var tone = CHECKER_TONES[settings.checkerTone] || CHECKER_TONES.standard;
    board.style.setProperty("--ca", tone[0]);
    board.style.setProperty("--cb", tone[1]);
    applyTheme();
  }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", settings.theme === "light" ? "light" : "dark");
  }

  function settingsToUI() {
    setShowGrid.checked = settings.showGrid;
    setChecker.checked = settings.checkerboard;
    setUndoLimit.value = String(settings.undoLimit);
    setZoomStep.value = String(settings.zoomStep);
    setDefaultGrid.value = String(settings.defaultGrid);
    setCheckerTone.value = settings.checkerTone;
    setSmoothness.value = String(settings.smoothness);
    setTheme.value = settings.theme;
    setLang.value = settings.lang;
    setClickDeselect.checked = settings.clickDeselect;
  }
  function settingsFromUI() {
    settings.showGrid = setShowGrid.checked;
    settings.checkerboard = setChecker.checked;
    settings.undoLimit = parseInt(setUndoLimit.value, 10);
    settings.zoomStep = parseFloat(setZoomStep.value);
    settings.defaultGrid = parseInt(setDefaultGrid.value, 10);
    settings.checkerTone = setCheckerTone.value;
    settings.smoothness = parseFloat(setSmoothness.value);
    settings.theme = setTheme.value;
    settings.lang = setLang.value;
    settings.clickDeselect = setClickDeselect.checked;
    saveSettings();
    applySettings();
    applyI18n();
    renderShortcutList();
    shapeKindBtn.textContent = t(shapeKind === "rect" ? "shape.rect" : "shape.ellipse");   // 语言切换时同步形状按钮文本
    shapeModeBtn.textContent = t(shapeMode === "fill" ? "shape.fill" : "shape.stroke");
  }
  var shortcutListEl = document.getElementById("shortcutList");
  function renderShortcutList() {
    if (!shortcutListEl) return;
    shortcutListEl.innerHTML = "";
    for (var i = 0; i < KEY_ACTIONS.length; i++) {
      var a = KEY_ACTIONS[i];
      var row = document.createElement("div");
      row.className = "shortcut-row" + (recordingAction === a.id ? " recording" : "");
      var lb = document.createElement("span");
      lb.className = "shortcut-label";
      lb.textContent = t(a.labelKey);
      var ks = document.createElement("span");
      ks.className = "shortcut-keys";
      ks.textContent = recordingAction === a.id ? t("act.recording") : keyBind(a.id);
      var chg = document.createElement("button");
      chg.className = "opt-btn mini";
      chg.textContent = t("act.change");
      chg.disabled = !!recordingAction;
      chg.addEventListener("click", (function (id) { return function () { startRecord(id); }; })(a.id));
      var rst = document.createElement("button");
      rst.className = "opt-btn mini";
      rst.textContent = t("act.reset");
      rst.disabled = !!recordingAction || !(settings.keymap && settings.keymap[a.id]);
      rst.addEventListener("click", (function (id) { return function () {
        if (settings.keymap) delete settings.keymap[id];
        saveSettings();
        renderShortcutList();
      }; })(a.id));
      row.appendChild(lb);
      row.appendChild(ks);
      row.appendChild(chg);
      row.appendChild(rst);
      shortcutListEl.appendChild(row);
    }
  }
  function startRecord(id) {
    recordingAction = id;
    renderShortcutList();
  }
  function openSettings() { settingsToUI(); recordingAction = null; renderShortcutList(); settingsOverlay.hidden = false; }
  // 设置标签页切换
  var settingsTabs = document.querySelectorAll(".settings-tab");
  var settingsPanes = document.querySelectorAll(".settings-pane");
  for (var ti = 0; ti < settingsTabs.length; ti++) {
    settingsTabs[ti].addEventListener("click", function () {
      var tab = this.getAttribute("data-tab");
      for (var k = 0; k < settingsTabs.length; k++) settingsTabs[k].classList.toggle("active", settingsTabs[k].getAttribute("data-tab") === tab);
      for (var p = 0; p < settingsPanes.length; p++) settingsPanes[p].classList.toggle("active", settingsPanes[p].getAttribute("data-pane") === tab);
    });
  }
  function openAbout() { aboutOverlay.hidden = false; }

  settingsOkBtn.addEventListener("click", function () { recordingAction = null; settingsFromUI(); settingsOverlay.hidden = true; });
  settingsResetBtn.addEventListener("click", function () {
    settings = {};
    for (var k in SETTINGS_DEFAULTS) settings[k] = k === "keymap" ? {} : SETTINGS_DEFAULTS[k];   // keymap 独立拷贝，避免共享默认对象
    settingsToUI();
    settingsFromUI();
    renderShortcutList();
  });
  aboutOkBtn.addEventListener("click", function () { aboutOverlay.hidden = true; });
  helpOkBtn.addEventListener("click", function () { helpOverlay.hidden = true; });
  settingsOverlay.addEventListener("click", function (e) { if (e.target === settingsOverlay) { recordingAction = null; settingsOverlay.hidden = true; } });
  aboutOverlay.addEventListener("click", function (e) { if (e.target === aboutOverlay) aboutOverlay.hidden = true; });
  helpOverlay.addEventListener("click", function (e) { if (e.target === helpOverlay) helpOverlay.hidden = true; });

  // 右侧面板宽度拖拽调整（200–420px）
  var resizing = false;
  panelResizer.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    resizing = true;
    panelResizer.classList.add("active");
    try { panelResizer.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  panelResizer.addEventListener("pointermove", function (e) {
    if (!resizing) return;
    var w = Math.max(200, Math.min(420, window.innerWidth - e.clientX));
    sidePanelsEl.style.width = w + "px";
  });
  function endResize() {
    if (!resizing) return;
    resizing = false;
    panelResizer.classList.remove("active");
  }
  panelResizer.addEventListener("pointerup", endResize);
  panelResizer.addEventListener("pointercancel", endResize);

  /* ================= 菜单 ================= */
  var ACTIONS = {
    "new-canvas": resetDocument,
    "open-project": triggerOpenProject,
    "export-project": exportProject,
    "export": exportPNG,
    "undo": undo,
    "redo": redo,
    "clear-layer": clearActiveLayer,
    "add-layer": addLayer,
    "dup-layer": duplicateLayer,
    "layer-up": function () { moveLayer(1); },
    "layer-down": function () { moveLayer(-1); },
    "del-layer": deleteLayer,
    "add-folder": addFolder,
    "clip-mask": toggleClipMask,
    "select-all": selectAll,
    "deselect": deselect,
    "settings": openSettings,
    "about": openAbout,
    "help": openHelp,
    "adjust": openAdjust
  };
  function closeMenus() {
    var open = menubar.querySelectorAll(".menu.open");
    for (var i = 0; i < open.length; i++) open[i].classList.remove("open");
  }
  menubar.addEventListener("click", function (e) {
    var head = e.target.closest(".menu-label");
    if (head) {
      var act = head.getAttribute("data-action");
      if (act) {                       // 独立入口（无下拉）：直接执行
        closeMenus();
        var fn = ACTIONS[act];
        if (fn) fn();
        return;
      }
      var menu = head.parentNode;
      var wasOpen = menu.classList.contains("open");
      closeMenus();
      if (!wasOpen) menu.classList.add("open");
      return;
    }
    var item = e.target.closest(".menu-item");
    if (item) {
      closeMenus();
      var fn = ACTIONS[item.dataset.action];
      if (fn) fn();
    }
  });
  document.addEventListener("click", function (e) {
    if (!menubar.contains(e.target)) closeMenus();
  });

  function openHelp() { helpOverlay.hidden = false; }

  /* ================= 导出 PNG（选项对话框） ================= */
  var exportCellSize = 16, exportBgMode = "transparent";   // 会话内记忆上次导出选项
  function exportPNG() {
    // 先弹出导出选项对话框（像素大小 / 背景），确认后执行导出
    exportCellSelect.value = String(exportCellSize);
    exportBgSelect.value = exportBgMode;
    exportOverlay.hidden = false;
  }
  function doExportPNG() {
    exportCellSize = parseInt(exportCellSelect.value, 10);
    exportBgMode = exportBgSelect.value;
    exportOverlay.hidden = true;
    var cell = exportCellSize;
    var canvas = document.createElement("canvas");
    canvas.width = gridSize * cell;
    canvas.height = gridSize * cell;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (exportBgMode === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    for (var idx = 0; idx < nCells(); idx++) {
      var c = compositePixel(idx, false);
      if (c.a <= 0) continue;
      ctx.fillStyle = rgbaStr(c);
      ctx.fillRect((idx % gridSize) * cell, ((idx / gridSize) | 0) * cell, cell, cell);
    }
    var a = document.createElement("a");
    a.download = "pixel-art-" + gridSize + "x" + gridSize + ".png";
    a.href = canvas.toDataURL("image/png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  exportOkBtn.addEventListener("click", doExportPNG);
  exportCancelBtn.addEventListener("click", function () { exportOverlay.hidden = true; });
  exportOverlay.addEventListener("click", function (e) { if (e.target === exportOverlay) exportOverlay.hidden = true; });

  /* ================= 图像调整（色相 / 饱和度 / 亮度 / 对比度） ================= */
  var adjSaved = null;
  function openAdjust() {
    adjSaved = snapshot();
    adjHue.value = 0; adjSat.value = 0; adjBright.value = 0; adjContrast.value = 0;
    updateAdjLabels();
    adjustOverlay.hidden = false;
  }
  function updateAdjLabels() {
    adjHueVal.textContent = adjHue.value + "°";
    adjSatVal.textContent = adjSat.value;
    adjBrightVal.textContent = adjBright.value;
    adjContrastVal.textContent = adjContrast.value;
  }
  function applyAdjustLive() {
    var hue = parseInt(adjHue.value, 10);
    var sat = parseInt(adjSat.value, 10);
    var bright = parseInt(adjBright.value, 10);
    var cont = parseInt(adjContrast.value, 10);
    var cf = 1 + cont / 100;
    var list = [];
    if (adjTarget.value === "all") {
      for (var i = 0; i < layers.length; i++) if (layers[i].visible && !layers[i].locked) list.push(layers[i]);
    } else {
      if (!layers[activeIdx].locked) list.push(layers[activeIdx]);
    }
    for (var li = 0; li < list.length; li++) {
      var px = list[li].pixels;
      for (var idx = 0; idx < nCells(); idx++) {
        var o = idx * 4;
        if (px[o + 3] === 0 || !inSelection(idx)) continue;   // 图像调整只作用于选区内
        var hsv = rgbToHsv(px[o], px[o + 1], px[o + 2]);
        hsv.h = (hsv.h + hue + 360) % 360;
        if (sat >= 0) hsv.s = hsv.s + (1 - hsv.s) * (sat / 100);
        else hsv.s = hsv.s * (1 + sat / 100);
        hsv.s = Math.max(0, Math.min(1, hsv.s));
        hsv.v = (hsv.v - 0.5) * cf + 0.5 + bright / 100;
        hsv.v = Math.max(0, Math.min(1, hsv.v));
        var rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
        px[o] = rgb.r; px[o + 1] = rgb.g; px[o + 2] = rgb.b;
      }
    }
    renderAll();
    for (var t = 0; t < layers.length; t++) renderThumb(t);
  }
  [adjHue, adjSat, adjBright, adjContrast].forEach(function (r) {
    r.addEventListener("input", function () { updateAdjLabels(); applyAdjustLive(); });
  });
  adjTarget.addEventListener("change", function () {
    restore(adjSaved);          // 回到调整前，再按新范围应用
    applyAdjustLive();
  });
  adjApply.addEventListener("click", function () {
    if (adjSaved) {
      undoStack.push(adjSaved);
      if (undoStack.length > settings.undoLimit) undoStack.shift();
      redoStack.length = 0;
    }
    adjSaved = null;
    adjustOverlay.hidden = true;
    updatePanels();
  });
  adjCancel.addEventListener("click", function () {
    if (adjSaved) restore(adjSaved);
    adjSaved = null;
    adjustOverlay.hidden = true;
  });

  /* ================= 通用确认对话框 ================= */
  function showConfirm(title, text, okLabel, cancelLabel, cb) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmOkBtn.textContent = okLabel;
    confirmCancelBtn.textContent = cancelLabel;
    confirmCallback = cb;
    confirmOverlay.hidden = false;
  }
  confirmOkBtn.addEventListener("click", function () {
    var cb = confirmCallback;
    confirmCallback = null;
    confirmOverlay.hidden = true;
    if (cb) cb(true);
  });
  confirmCancelBtn.addEventListener("click", function () {
    var cb = confirmCallback;
    confirmCallback = null;
    confirmOverlay.hidden = true;
    if (cb) cb(false);
  });
  confirmOverlay.addEventListener("click", function (e) {
    if (e.target === confirmOverlay) confirmCancelBtn.click();   // 点遮罩 = 取消
  });

  /* ================= .AIPSD 工程文件（类 JSON 格式） ================= */
  var AIPSD_FORMAT = "AIPSD";
  var AIPSD_VERSION = 1;
  var BLEND_IDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference", "exclusion", "color-dodge", "color-burn", "hard-light", "soft-light"];

  function pixelsToGrid(px) {
    var grid = [];
    for (var y = 0; y < gridSize; y++) {
      var row = [];
      for (var x = 0; x < gridSize; x++) {
        var o = (y * gridSize + x) * 4;
        row.push(px[o + 3] === 0 ? null : rgbToHex(px[o], px[o + 1], px[o + 2]));
      }
      grid.push(row);
    }
    return grid;
  }
  function gridToPixels(grid, gs) {
    var px = new Uint8ClampedArray(gs * gs * 4);
    var h = Math.min(gs, grid.length);
    for (var y = 0; y < h; y++) {
      var row = grid[y] || [];
      var w = Math.min(gs, row.length);
      for (var x = 0; x < w; x++) {
        var c = row[x];
        if (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)) {
          var o = (y * gs + x) * 4;
          var n = parseInt(c.slice(1), 16);
          px[o] = (n >> 16) & 255; px[o + 1] = (n >> 8) & 255; px[o + 2] = n & 255; px[o + 3] = 255;
        }
      }
    }
    return px;
  }
  function mergeSettings(saved) {
    var out = {};
    for (var k in SETTINGS_DEFAULTS) {
      if (k === "keymap") out[k] = saved && typeof saved[k] === "object" && saved[k] ? JSON.parse(JSON.stringify(saved[k])) : {};   // 深拷贝
      else out[k] = (saved && k in saved) ? saved[k] : SETTINGS_DEFAULTS[k];
    }
    return out;
  }
  function exportProject() {
    // 询问是否将当前设置一并保存（确认=保存，取消=不保存，均正常导出）
    showConfirm(t("msg.saveSettingsTitle"), t("msg.saveSettingsText"), t("msg.yes"), t("msg.no"), function (include) {
      var data = {
        format: AIPSD_FORMAT,
        version: AIPSD_VERSION,
        app: "PixelPaint",
        gridSize: gridSize,
        folders: folders.map(function (f) { return { id: f.id, name: f.name, collapsed: f.collapsed, visible: f.visible !== false, pos: f.pos }; }),
        layers: layers.map(function (l) {
          return {
            id: l.id,
            name: l.name,
            visible: l.visible,
            opacity: l.opacity,
            blend: l.blend,
            clipMask: !!l.clipMask,
            locked: !!l.locked,
            folder: l.folder,
            pixels: pixelsToGrid(l.pixels)
          };
        })
      };
      if (include) data.settings = JSON.parse(JSON.stringify(settings));
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      var a = document.createElement("a");
      a.download = "pixel-art-project.AIPSD";
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  }
  function openProjectFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || data.format !== AIPSD_FORMAT || !Array.isArray(data.layers)) throw new Error("format");
        // 检测工程内是否保存了设置：有则询问是否覆盖当前设置（确认=覆盖，取消=保持当前，均继续导入）
        if (data.settings && typeof data.settings === "object") {
          showConfirm(t("msg.importSettingsTitle"), t("msg.importSettingsText"), t("msg.overwrite"), t("msg.keep"), function (overwrite) {
            if (overwrite) {
              settings = mergeSettings(data.settings);
              saveSettings();
              applySettings();
              applyI18n();
              settingsToUI();
            }
            try { applyProjectData(data); } catch (err2) { alert(t("msg.openFailed")); }
          });
        } else {
          applyProjectData(data);
        }
      } catch (err) {
        alert(t("msg.openFailed"));
      }
    };
    reader.readAsText(file);
  }
  function applyProjectData(data) {
    var gs = parseInt(data.gridSize, 10);
    if (!(gs >= GRID_MIN && gs <= GRID_MAX)) throw new Error("grid");   // NaN 也会被拒绝
    canvasSizeOverlay.hidden = true;   // 关闭可能仍显示的启动尺寸弹窗
    docReady = true;                   // 导入即视为文档已创建
    pushSnapshot();
    gridSize = gs;
    folders = (data.folders || []).map(function (f) { return { id: f.id, name: f.name || "", collapsed: !!f.collapsed, visible: f.visible !== false, pos: (typeof f.pos === "number" ? f.pos : null) }; });
    folderSeq = folders.length ? Math.max.apply(null, folders.map(function (f) { return f.id; })) + 1 : 1;
    var validFolders = {};
    folders.forEach(function (f) { validFolders[f.id] = true; });
    var oldToNew = {};
    layers = data.layers.map(function (l) {
      var nl = {
        id: ++layerSeq,
        name: typeof l.name === "string" ? l.name : "",
        visible: l.visible !== false,
        opacity: typeof l.opacity === "number" ? l.opacity : 100,
        blend: BLEND_IDS.indexOf(l.blend) !== -1 ? l.blend : "normal",
        clipMask: !!l.clipMask,
        locked: !!l.locked,
        folder: validFolders[l.folder] ? l.folder : null,
        pixels: gridToPixels(l.pixels, gs)
      };
      if (typeof l.id === "number") oldToNew[l.id] = nl.id;   // 旧 id → 新 id（供 folders.pos 重映射）
      return nl;
    });
    // 重映射文件夹锚点 pos（旧图层 id → 新图层 id）；失效则回退末尾区
    folders.forEach(function (f) {
      if (typeof f.pos === "number" && oldToNew[f.pos] != null) f.pos = oldToNew[f.pos];
      else f.pos = null;
    });
    if (!layers.length) layers = [createLayerNamed(t("layer.background"))];
    nameSeq = layers.length + 1;
    activeIdx = layers.length - 1;
    buildBoard();
    renderLayerList();
    renderAll();
    updatePanels();
    fitView();
  }
  function triggerOpenProject() { projectFile.click(); }
  projectFile.addEventListener("change", function () {
    if (projectFile.files && projectFile.files[0]) openProjectFile(projectFile.files[0]);
    projectFile.value = "";   // 允许重复打开同一文件
  });

  /* ================= 快捷键 ================= */
  document.addEventListener("contextmenu", function (e) {
    // 全局屏蔽浏览器右键菜单（输入框/可编辑内容保留，便于复制粘贴）
    if (!e.target.closest("input, textarea, [contenteditable]")) e.preventDefault();
  });
  var recordingAction = null;   // 正在录制快捷键的动作 id（null = 非录制态）
  document.addEventListener("keydown", function (e) {
    // 快捷键录制态：捕获组合键
    if (recordingAction) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { recordingAction = null; renderShortcutList(); return; }   // Esc 取消录制
      var k = e.key;
      if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta") return;   // 仅修饰键，等待主键
      if (k === " ") return;   // 空格保留给画布平移
      var parts = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      var main = k;
      if (main.length === 1 && /[a-zA-Z0-9]/.test(main)) main = main.toUpperCase();
      parts.push(main);
      var combo = parts.join("+");
      // 冲突检测：同一组合已分配给其他动作则拒绝（保持录制态等待新输入）
      var conflict = null;
      for (var ci = 0; ci < KEY_ACTIONS.length; ci++) {
        if (KEY_ACTIONS[ci].id === recordingAction) continue;
        if (keyBind(KEY_ACTIONS[ci].id) === combo) { conflict = KEY_ACTIONS[ci]; break; }
      }
      if (conflict) { alert(t("msg.shortcutConflict") + "「" + t(conflict.labelKey) + "」"); return; }
      settings.keymap = settings.keymap || {};
      settings.keymap[recordingAction] = combo;
      saveSettings();
      recordingAction = null;
      renderShortcutList();
      return;
    }
    if (e.key === "Escape") {                 // Esc 关闭弹窗（系统级，不可自定义）
      settingsOverlay.hidden = true;
      aboutOverlay.hidden = true;
      helpOverlay.hidden = true;
      adjustOverlay.hidden = true;
      if (!confirmOverlay.hidden) { confirmCancelBtn.click(); }   // Esc = 取消（触发回调，保证导入/导出流程继续）
      if (!exportOverlay.hidden) exportOverlay.hidden = true;
      closeCtxMenu();
      closeCanvasMenu();
      return;
    }
    // 组合键动作（输入框内也响应，如 Ctrl+Z 撤销）
    for (var a = 0; a < KEY_ACTIONS.length; a++) {
      var kb = keyBind(KEY_ACTIONS[a].id);
      var kp = parseKeys(kb);
      if ((kp.ctrl || kp.alt || kp.shift) && keysMatch(e, kb)) {
        e.preventDefault();
        KEY_ACTIONS[a].run();
        return;
      }
    }
    // 编辑输入框内或弹窗打开时不响应单键
    if (e.target && (e.target.isContentEditable || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (!settingsOverlay.hidden || !aboutOverlay.hidden || !helpOverlay.hidden || !adjustOverlay.hidden || !confirmOverlay.hidden || !exportOverlay.hidden) return;
    // 无修饰键动作（工具切换等）
    for (var a2 = 0; a2 < KEY_ACTIONS.length; a2++) {
      var kb2 = keyBind(KEY_ACTIONS[a2].id);
      var kp2 = parseKeys(kb2);
      if (!(kp2.ctrl || kp2.alt || kp2.shift) && keysMatch(e, kb2)) {
        e.preventDefault();
        KEY_ACTIONS[a2].run();
        return;
      }
    }
  });

  /* ================= 图层操作按钮 ================= */
  blendMode.addEventListener("change", function () {
    var v = blendMode.value;   // 先捕获目标值（commit 内 updatePanels 会重置 select 显示，避免读到旧值）
    commit(function () { layers[activeIdx].blend = v; });
  });
  addFolderBtn.addEventListener("click", addFolder);
  addLayerBtn.addEventListener("click", addLayer);
  dupLayerBtn.addEventListener("click", duplicateLayer);
  layerUpBtn.addEventListener("click", function () { moveLayer(1); });
  layerDownBtn.addEventListener("click", function () { moveLayer(-1); });
  delLayerBtn.addEventListener("click", deleteLayer);
  clearLayerBtn.addEventListener("click", clearActiveLayer);
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  // 主题 / 语言即时生效（无需点“完成”）
  setTheme.addEventListener("change", function () { settingsFromUI(); });
  setLang.addEventListener("change", function () { settingsFromUI(); });

  var shapeKindBtn = document.getElementById("shapeKindBtn");
  var shapeModeBtn = document.getElementById("shapeModeBtn");
  shapeKindBtn.textContent = t("shape.rect");
  shapeModeBtn.textContent = t("shape.fill");
  shapeKindBtn.addEventListener("click", function () {
    shapeKind = shapeKind === "rect" ? "ellipse" : "rect";
    shapeKindBtn.classList.toggle("active", shapeKind === "rect");
    shapeKindBtn.textContent = t(shapeKind === "rect" ? "shape.rect" : "shape.ellipse");
  });
  shapeModeBtn.addEventListener("click", function () {
    shapeMode = shapeMode === "fill" ? "stroke" : "fill";
    shapeModeBtn.classList.toggle("active", shapeMode === "fill");
    shapeModeBtn.textContent = t(shapeMode === "fill" ? "shape.fill" : "shape.stroke");
  });

  /* ================= 初始化 ================= */
  gridSize = settings.defaultGrid;   // 预初始化：避免 applyI18n/applySettings 触发 updatePanels 时读取空 layers
  layers = [createLayerNamed(t("layer.background")), createLayerNamed(t("layer.name") + " 1")];
  activeIdx = layers.length - 1;
  drawWheel();
  renderPalette();
  selectColor(currentColor);
  setTool("brush");
  applySettings();
  applyI18n();
  openCanvasSizeDialog(settings.defaultGrid);   // 启动：询问画布大小（docReady 初始为 false）
})();
