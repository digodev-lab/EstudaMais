const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    toast('Não foi possível salvar: armazenamento indisponível ou cheio.');
    return false;
  }
}
function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem('estuda-settings') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

const state = {
  notes: readStorage('estuda-notes', []),
  selectedNote: null,
  expression: '',
  history: readStorage('estuda-history', [])
};
const settings = { theme: 'dark', uiSize: 'normal', textSize: 'normal', animations: true, showTimer: true, ...readSettings() };
let deleteArmed = false;

const timerState = { remaining: 25 * 60, duration: 25 * 60, running: false, interval: null };
function renderTimer() {
  const minutes = Math.floor(timerState.remaining / 60).toString().padStart(2, '0');
  const seconds = (timerState.remaining % 60).toString().padStart(2, '0');
  $('#timer-display').textContent = `${minutes}:${seconds}`;
  $('#timer-toggle').textContent = timerState.running ? 'PAUSAR' : 'INICIAR';
  document.title = timerState.running ? `${minutes}:${seconds} · Estuda+` : 'Estuda+ | Calculadora e anotações';
}
function stopTimer() {
  clearInterval(timerState.interval);
  timerState.interval = null;
  timerState.running = false;
  renderTimer();
}
function startTimer() {
  timerState.running = true;
  timerState.interval = setInterval(() => {
    if (timerState.remaining <= 0) {
      stopTimer();
      toast('Tempo concluído. Faça uma pausa ou comece outro ciclo.');
      return;
    }
    timerState.remaining -= 1;
    renderTimer();
  }, 1000);
  renderTimer();
}
$$('.timer-mode-btn').forEach((button) => button.addEventListener('click', () => {
  stopTimer();
  timerState.duration = Number(button.dataset.timerMinutes) * 60;
  timerState.remaining = timerState.duration;
  $$('.timer-mode-btn').forEach((item) => item.classList.toggle('active', item === button));
  renderTimer();
}));
$('#timer-toggle').addEventListener('click', () => timerState.running ? stopTimer() : startTimer());
$('#timer-reset').addEventListener('click', () => { stopTimer(); timerState.remaining = timerState.duration; renderTimer(); });
$('#timer-minimize').addEventListener('click', () => {
  $('.floating-timer').classList.toggle('minimized');
  $('#timer-minimize').textContent = $('.floating-timer').classList.contains('minimized') ? '+' : '−';
});

function showView(view) {
  $$('.view').forEach((item) => item.classList.toggle('active', item.id === `${view}-view`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const titles = { dashboard: 'Olá, estudante! 👋', calculator: 'Calculadora', notes: 'Minhas anotações', board: 'Quadro mágico', study: 'Modo estudo', settings: 'Configurações' };
  $('#page-title').innerHTML = titles[view] || titles.dashboard;
  if (view === 'notes') renderNotes();
  if (view === 'dashboard') renderRecent();
  if (view === 'board') resizeCanvas();
  if (view === 'study') { resizeCanvas(); resizeStudyCanvas(); }
}

$$('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));

function applySettings() {
  document.body.classList.toggle('theme-light', settings.theme === 'light');
  document.body.classList.toggle('theme-system', settings.theme === 'system');
  document.body.classList.toggle('ui-large', settings.uiSize === 'large');
  document.body.classList.toggle('ui-compact', settings.uiSize === 'compact');
  document.body.classList.toggle('text-large', settings.textSize === 'large');
  document.body.classList.toggle('text-xlarge', settings.textSize === 'xlarge');
  document.body.classList.toggle('reduced-motion', settings.animations === false || settings.reducedMotion === true);
  $('.floating-timer').hidden = settings.showTimer === false;
}
function renderSettings() {
  $$('[data-setting]').forEach((control) => {
    const value = settings[control.dataset.setting];
    if (control.type === 'checkbox') control.checked = value === true;
    else if (control.type === 'radio') control.checked = value === control.value;
    else if (value !== undefined) control.value = value;
  });
}
$$('[data-setting]').forEach((control) => control.addEventListener('change', () => {
  const key = control.dataset.setting;
  settings[key] = control.type === 'checkbox' ? control.checked : control.value;
  if (writeStorage('estuda-settings', settings)) { applySettings(); toast('Configuração salva.'); }
}));
$('#export-data').addEventListener('click', () => {
  const data = { exportedAt: new Date().toISOString(), notes: state.notes, history: state.history, boards: readStorage('estuda-boards', []), settings };
  const link = document.createElement('a');
  link.download = 'estuda-dados.json';
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  link.click();
  URL.revokeObjectURL(link.href);
  toast('Dados exportados.');
});
$('#clear-history-data').addEventListener('click', () => {
  state.history = [];
  localStorage.removeItem('estuda-history');
  renderHistory();
  toast('Histórico de cálculos limpo.');
});
$$('[data-info]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); toast(`${link.dataset.info} disponível em uma próxima versão.`); }));

function renderRecent() {
  const target = $('#recent-notes');
  const notes = state.notes.slice(0, 3);
  target.innerHTML = notes.length ? notes.map((note) => `<button class="recent-item" data-note-id="${note.id}"><span class="note-dot">▤</span><span><strong>${escapeHtml(note.title || 'Sem título')}</strong><small>${formatDate(note.updatedAt)}</small></span></button>`).join('') : '<p class="empty-state">Ainda não há anotações. Comece uma nova ideia!</p>';
  $$('.recent-item').forEach((item) => item.addEventListener('click', () => { showView('notes'); selectNote(item.dataset.noteId); }));
}

function renderNotes(filter = '') {
  const list = $('#notes-list');
  const filtered = state.notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML = filtered.length ? filtered.map((note) => `<div class="note-list-item ${note.id === state.selectedNote ? 'selected' : ''}" data-note-id="${note.id}"><strong>${escapeHtml(note.title || 'Sem título')}</strong><small>${note.image ? 'Quadro mágico · ' : ''}${formatDate(note.updatedAt)}</small></div>`).join('') : '<p class="empty-state">Nenhuma anotação encontrada.</p>';
  $$('.note-list-item').forEach((item) => item.addEventListener('click', () => selectNote(item.dataset.noteId)));
}

function selectNote(id) {
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;
  state.selectedNote = id;
  $('#note-title').value = note.title;
  $('#note-body').value = note.body;
  $('#note-date').textContent = `Atualizada em ${formatDate(note.updatedAt)}`;
  $('#note-image-preview').innerHTML = note.image ? `<img src="${note.image}" alt="Quadro mágico: ${escapeHtml(note.title)}" />` : '';
  renderNotes($('#note-search').value);
}

function saveNote() {
  const title = $('#note-title').value.trim() || 'Sem título';
  const body = $('#note-body').value;
  const now = new Date().toISOString();
  if (state.selectedNote) {
    const note = state.notes.find((item) => item.id === state.selectedNote);
    if (!note) return;
    note.title = title; note.body = body; note.updatedAt = now;
  } else {
    const note = { id: crypto.randomUUID(), title, body, updatedAt: now };
    state.notes.unshift(note); state.selectedNote = note.id;
  }
  if (!writeStorage('estuda-notes', state.notes)) return;
  $('#note-date').textContent = `Atualizada em ${formatDate(now)}`;
  $('#save-state').textContent = '● Salvo localmente';
  renderNotes($('#note-search').value); renderRecent(); toast('Anotação salva com sucesso!');
}

$('#new-note').addEventListener('click', () => {
  state.selectedNote = null; $('#note-title').value = ''; $('#note-body').value = ''; $('#note-image-preview').innerHTML = ''; $('#note-date').textContent = 'Nova anotação'; renderNotes();
  $('#note-title').focus();
});
$('#save-note').addEventListener('click', saveNote);
$('#delete-note').addEventListener('click', () => {
  if (!state.selectedNote) { toast('Selecione uma anotação para excluir.'); return; }
  const note = state.notes.find((item) => item.id === state.selectedNote);
  if (!note) return;
  if (!deleteArmed) {
    deleteArmed = true;
    $('#delete-note').textContent = 'Confirmar exclusão';
    toast(`Clique novamente para excluir "${note.title}".`);
    setTimeout(() => { deleteArmed = false; $('#delete-note').textContent = 'Excluir'; }, 3500);
    return;
  }
  state.notes = state.notes.filter((item) => item.id !== state.selectedNote);
  if (!writeStorage('estuda-notes', state.notes)) return;
  deleteArmed = false; $('#delete-note').textContent = 'Excluir';
  state.selectedNote = null; $('#note-title').value = ''; $('#note-body').value = ''; $('#note-image-preview').innerHTML = ''; $('#note-date').textContent = 'Nova anotação'; renderNotes(); renderRecent(); toast('Anotação excluída.');
});
$('#note-search').addEventListener('input', (event) => renderNotes(event.target.value));
$('#note-body').addEventListener('input', () => { $('#save-state').textContent = '● Alterações não salvas'; });

function calculate(expression) {
  const clean = expression.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s/g, '');
  if (!clean) throw new Error('Expressão vazia');
  const tokens = clean.match(/(?:\d+(?:\.\d*)?|\.\d+|[()+\-*/%])/g);
  if (!tokens || tokens.join('') !== clean) throw new Error('Expressão inválida');
  let index = 0;
  const peek = () => tokens[index];
  const consume = () => tokens[index++];
  const parsePrimary = () => {
    if (peek() === '(') {
      consume();
      const value = parseAdditive();
      if (consume() !== ')') throw new Error('Parênteses inválidos');
      return value;
    }
    if (peek() === '+' || peek() === '-') {
      return consume() === '-' ? -parsePrimary() : parsePrimary();
    }
    const value = Number(consume());
    if (!Number.isFinite(value)) throw new Error('Número inválido');
    return value;
  };
  const parseMultiplicative = () => {
    let value = parsePrimary();
    while (['*', '/', '%'].includes(peek())) {
      const operator = consume();
      const right = parsePrimary();
      if (operator === '*') value *= right;
      if (operator === '/') value /= right;
      if (operator === '%') value %= right;
    }
    return value;
  };
  const parseAdditive = () => {
    let value = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const result = parseAdditive();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error('Não foi possível calcular');
  return Math.round((result + Number.EPSILON) * 100000000) / 100000000;
}
function updateDisplay() { $('#calc-expression').textContent = state.expression.replace(/\./g, ','); }
$$('.calc-memory button[data-value]').forEach((button) => button.addEventListener('click', () => { state.expression += button.dataset.value; updateDisplay(); }));
$$('.calc-memory button[data-calc]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.calc === 'clear') state.expression = '';
  if (button.dataset.calc === 'backspace') state.expression = state.expression.slice(0, -1);
  if (button.dataset.calc === 'operator' && state.expression) state.expression += '%';
  if (button.dataset.calc === 'equals') {
    try { const result = calculate(state.expression); $('#calc-result').textContent = String(result).replace('.', ','); state.history.unshift({ expression: state.expression, result }); state.history = state.history.slice(0, 10); writeStorage('estuda-history', state.history); renderHistory(); }
    catch { toast('Confira a expressão e tente novamente.'); }
  }
  updateDisplay();
}));
function renderHistory() { $('#calc-history').innerHTML = state.history.length ? state.history.map((item) => `<div class="history-entry"><small>${item.expression.replace('.', ',')}</small><strong>= ${String(item.result).replace('.', ',')}</strong></div>`).join('') : '<p class="empty-state">Seus cálculos aparecerão aqui.</p>'; }
$('#clear-history').addEventListener('click', () => { state.history = []; localStorage.removeItem('estuda-history'); renderHistory(); });
document.addEventListener('keydown', (event) => { if (!$('.view.active')?.id.includes('calculator')) return; if (/^[0-9.+\-*/%()]$/.test(event.key)) { state.expression += event.key; updateDisplay(); } if (event.key === 'Enter') $('[data-calc="equals"]').click(); if (event.key === 'Backspace') state.expression = state.expression.slice(0, -1); });

const canvas = $('#magic-board');
const ctx = canvas.getContext('2d');
let drawing = false; let tool = 'draw'; let last = null;
function resizeDrawingCanvas(target, context) {
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = window.devicePixelRatio || 1;
  const previous = target.width && target.height ? document.createElement('canvas') : null;
  if (previous) { previous.width = target.width; previous.height = target.height; previous.getContext('2d').drawImage(target, 0, 0); }
  target.width = Math.round(rect.width * ratio);
  target.height = Math.round(rect.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (previous) context.drawImage(previous, 0, 0, previous.width / (window.devicePixelRatio || 1), previous.height / (window.devicePixelRatio || 1), 0, 0, rect.width, rect.height);
  context.lineCap = 'round'; context.lineJoin = 'round';
}
function resizeCanvas() { resizeDrawingCanvas(canvas, ctx); }
function point(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function drawText(context, text, x, y, color, size, bold) { context.fillStyle = color; context.font = `${bold ? '700' : '400'} ${size}px "DM Sans"`; context.fillText(text, x, y); }
canvas.addEventListener('pointerdown', (event) => { if (tool === 'text') { const text = $('#board-text-input').value.trim(); if (text) { const p = point(event); drawText(ctx, text, p.x, p.y, $('#text-color').value, $('#text-size').value, $('#text-bold').checked); $('#board-text-input').value = ''; $('#canvas-hint').style.display = 'none'; } return; } drawing = true; last = point(event); $('#canvas-hint').style.display = 'none'; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', (event) => { if (!drawing) return; const p = point(event); ctx.strokeStyle = $('#brush-color').value; ctx.lineWidth = $('#brush-size').value; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
canvas.addEventListener('pointerup', () => { drawing = false; last = null; });
$('#clear-board').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); $('#canvas-hint').style.display = 'grid'; });
$('#draw-tool').addEventListener('click', () => { tool = 'draw'; $('#draw-tool').classList.add('active'); $('#draw-tool').setAttribute('aria-pressed', 'true'); $('#text-tool').classList.remove('active'); $('#text-tool').setAttribute('aria-pressed', 'false'); });
$('#text-tool').addEventListener('click', () => { tool = 'text'; $('#text-tool').classList.add('active'); $('#text-tool').setAttribute('aria-pressed', 'true'); $('#draw-tool').classList.remove('active'); $('#draw-tool').setAttribute('aria-pressed', 'false'); });

const studyCanvas = $('#study-board');
const studyCtx = studyCanvas.getContext('2d');
let studyDrawing = false; let studyTool = 'draw'; let studyLast = null; let studyExpression = '';
function resizeStudyCanvas() { resizeDrawingCanvas(studyCanvas, studyCtx); }
function studyPoint(event) { const rect = studyCanvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function selectedStudyColor() { return document.querySelector('.color-dot.selected')?.dataset.color || '#334155'; }
function updateStudyDisplay() { $('#study-expression').textContent = studyExpression.replace(/\./g, ','); }
$$('.study-keypad button[data-study-value]').forEach((button) => button.addEventListener('click', () => { studyExpression += button.dataset.studyValue; updateStudyDisplay(); }));
$$('.study-keypad button[data-study-calc]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.studyCalc === 'clear') studyExpression = '';
  if (button.dataset.studyCalc === 'backspace') studyExpression = studyExpression.slice(0, -1);
  if (button.dataset.studyCalc === 'operator' && studyExpression) studyExpression += '%';
  if (button.dataset.studyCalc === 'equals') {
    try { $('#study-result').textContent = String(calculate(studyExpression)).replace('.', ','); } catch { toast('Confira a expressão e tente novamente.'); }
  }
  updateStudyDisplay();
}));
$$('.color-dot').forEach((dot) => dot.addEventListener('click', () => { $$('.color-dot').forEach((item) => { item.classList.remove('selected'); item.setAttribute('aria-pressed', 'false'); }); dot.classList.add('selected'); dot.setAttribute('aria-pressed', 'true'); }));
studyCanvas.addEventListener('pointerdown', (event) => { if (studyTool === 'text') { const text = $('#study-text-input').value.trim(); if (text) { const p = studyPoint(event); drawText(studyCtx, text, p.x, p.y, selectedStudyColor(), $('#study-text-size').value, $('#study-text-bold').checked); $('#study-text-input').value = ''; $('#study-canvas-hint').style.display = 'none'; } return; } studyDrawing = true; studyLast = studyPoint(event); $('#study-canvas-hint').style.display = 'none'; studyCanvas.setPointerCapture(event.pointerId); });
studyCanvas.addEventListener('pointermove', (event) => { if (!studyDrawing) return; const p = studyPoint(event); studyCtx.strokeStyle = selectedStudyColor(); studyCtx.lineWidth = $('#study-brush-size').value; studyCtx.beginPath(); studyCtx.moveTo(studyLast.x, studyLast.y); studyCtx.lineTo(p.x, p.y); studyCtx.stroke(); studyLast = p; });
studyCanvas.addEventListener('pointerup', () => { studyDrawing = false; studyLast = null; });
$('#clear-study-board').addEventListener('click', () => { studyCtx.clearRect(0, 0, studyCanvas.width, studyCanvas.height); $('#study-canvas-hint').style.display = 'grid'; });
$('#study-draw-tool').addEventListener('click', () => { studyTool = 'draw'; $('#study-draw-tool').classList.add('active'); $('#study-draw-tool').setAttribute('aria-pressed', 'true'); $('#study-text-tool').classList.remove('active'); $('#study-text-tool').setAttribute('aria-pressed', 'false'); });
$('#study-text-tool').addEventListener('click', () => { studyTool = 'text'; $('#study-text-tool').classList.add('active'); $('#study-text-tool').setAttribute('aria-pressed', 'true'); $('#study-draw-tool').classList.remove('active'); $('#study-draw-tool').setAttribute('aria-pressed', 'false'); });
function renderSavedBoards() { const boards = readStorage('estuda-boards', []); $('#saved-boards-list').innerHTML = boards.length ? boards.map((board) => `<div class="saved-board-item">▧ ${escapeHtml(board.name)}<small>${formatDate(board.createdAt)}</small></div>`).join('') : '<p class="empty-state">Salve seu primeiro rascunho com um nome.</p>'; }
function saveNamedBoard(sourceCanvas = canvas, inputSelector = '#board-name-input') {
  const input = $(inputSelector);
  const name = input.value.trim();
  if (!name) { input.focus(); toast('Digite um nome para salvar o quadro.'); return; }
  const now = new Date().toISOString();
  const image = sourceCanvas.toDataURL('image/png');
  const boards = readStorage('estuda-boards', []);
  boards.unshift({ name, image, createdAt: now });
  const notes = state.notes;
  notes.unshift({ id: crypto.randomUUID(), title: name, body: 'Quadro mágico salvo para continuar estudando.', image, updatedAt: now });
  if (!writeStorage('estuda-boards', boards.slice(0, 12)) || !writeStorage('estuda-notes', notes)) return;
  state.notes = notes;
  input.value = '';
  renderSavedBoards(); renderNotes(); renderRecent();
  toast('Quadro salvo em Minhas anotações!');
}
$('#save-board').addEventListener('click', () => saveNamedBoard());
$('#save-study-board').addEventListener('click', () => saveNamedBoard(studyCanvas, '#study-board-name'));

function formatDate(value) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value)); }
function escapeHtml(value) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
let toastTimer;
function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), 2600); }
const now = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date());
$('#current-date').textContent = now.toUpperCase();
renderHistory(); renderRecent(); renderNotes(); renderSavedBoards(); renderSettings(); applySettings(); window.addEventListener('resize', () => { resizeCanvas(); resizeStudyCanvas(); });
