const app = document.querySelector("#app");
const STORAGE_KEY = "pep-vocab-cards:v1";
const MODE_LABELS = { all: "全部单词", favorites: "收藏夹", unfavorited: "未收藏" };

const icons = {
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>`,
  shuffle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h3.5a6 6 0 0 0 5-2.7L13.5 11A6 6 0 0 1 18.5 8H22"/><path d="M2 6h3.5a6 6 0 0 1 4.8 2.4"/></svg>`,
  star: filled => `<svg viewBox="0 0 24 24" ${filled ? 'fill="currentColor"' : 'fill="none"'} stroke="currentColor" stroke-width="2"><path d="m12 2.5 3 6.1 6.7 1-4.9 4.7 1.2 6.7-6-3.2-6 3.2 1.2-6.7-4.9-4.7 6.7-1 3-6.1Z"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>`
};

let words = [];
let state = loadState();
let activeMode = null;
let revealed = false;
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      favorites: Array.isArray(saved?.favorites) ? saved.favorites : [],
      sessions: saved?.sessions && typeof saved.sessions === "object" ? saved.sessions : {}
    };
  } catch {
    return { favorites: [], sessions: {} };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function wordKey(word) {
  return `${word.book_id}|${word.unit_id}|${word.word_order}|${word.english}`;
}

function getPool(mode) {
  const favorites = new Set(state.favorites);
  if (mode === "favorites") return words.filter(word => favorites.has(wordKey(word)));
  if (mode === "unfavorited") return words.filter(word => !favorites.has(wordKey(word)));
  return words;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function validSession(mode) {
  const session = state.sessions[mode];
  return session && Array.isArray(session.queue) && Number.isInteger(session.index) && session.queue.length > 0;
}

function startMode(mode, forceNew = false) {
  activeMode = mode;
  revealed = false;
  const pool = getPool(mode);
  if (!pool.length) return renderEmpty(mode);
  if (forceNew || !validSession(mode)) {
    state.sessions[mode] = { queue: shuffle(pool.map(wordKey)), index: 0, startedAt: Date.now() };
    saveState();
  }
  renderStudy();
}

function findWord(key) {
  return words.find(word => wordKey(word) === key);
}

function currentSession() { return state.sessions[activeMode]; }
function currentWord() {
  const session = currentSession();
  return session ? findWord(session.queue[session.index]) : null;
}

function renderHome() {
  activeMode = null;
  const favoriteCount = state.favorites.length;
  const modes = [
    { id: "all", title: "全部单词随机", count: words.length, icon: "Aa", cls: "" },
    { id: "favorites", title: "收藏夹随机", count: favoriteCount, icon: "★", cls: "favorite" },
    { id: "unfavorited", title: "未收藏随机", count: words.length - favoriteCount, icon: "○", cls: "unfavorite" }
  ];
  const cards = modes.map(mode => {
    const session = state.sessions[mode.id];
    const has = validSession(mode.id);
    const done = has ? Math.min(session.index + 1, session.queue.length) : 0;
    const percent = has ? Math.round(done / session.queue.length * 100) : 0;
    return `<button class="mode-card ${mode.cls}" data-mode="${mode.id}">
      <span class="mode-icon">${mode.icon}</span>
      <h2>${mode.title}</h2>
      <span class="mode-count">${mode.count.toLocaleString()} 个词条</span>
      <span class="mode-progress">
        <span class="mode-progress-label"><span>${has ? "继续上次进度" : "开始新一轮"}</span><span>${has ? `${done}/${session.queue.length}` : ""}</span></span>
        <span class="track"><span class="fill" style="width:${percent}%"></span></span>
      </span>
    </button>`;
  }).join("");

  app.innerHTML = `<main class="home">
    <header class="home-header">
      <div><p class="eyebrow">PEP · 2019</p><h1>高中英语词卡</h1><p class="subtitle">七册词汇，随机学习，进度留在本机。</p></div>
      <span class="offline-badge"><span>可离线使用</span></span>
    </header>
    <section class="overview" aria-label="词库概览">
      <div class="stat"><span class="stat-value">${words.length.toLocaleString()}</span><span class="stat-label">全部词条</span></div>
      <div class="stat"><span class="stat-value">${favoriteCount.toLocaleString()}</span><span class="stat-label">已收藏</span></div>
      <div class="stat"><span class="stat-value">7</span><span class="stat-label">教材分册</span></div>
    </section>
    <section class="mode-grid">${cards}</section>
    <p class="helper">学习顺序、当前位置和收藏均自动保存在当前设备。第一次完整打开后，可断网继续使用。</p>
  </main>`;
  app.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => startMode(button.dataset.mode)));
}

function renderStudy() {
  const session = currentSession();
  const word = currentWord();
  if (!word) return renderComplete();
  const favorite = state.favorites.includes(wordKey(word));
  const number = session.index + 1;
  const progress = Math.round(number / session.queue.length * 100);
  const source = `${word.book} · ${word.unit}`;

  app.innerHTML = `<main class="study">
    <header class="study-top">
      <button class="icon-button" id="home" aria-label="返回首页">${icons.back}</button>
      <div class="study-title"><strong>${MODE_LABELS[activeMode]}</strong><span>${number.toLocaleString()} / ${session.queue.length.toLocaleString()}</span></div>
      <button class="icon-button" id="reshuffle" aria-label="重新随机">${icons.shuffle}</button>
    </header>
    <div class="progress-bar" aria-label="本轮进度"><div style="width:${progress}%"></div></div>
    <section class="card-wrap">
      <button class="word-card ${revealed ? "revealed" : ""}" id="word-card" aria-label="${revealed ? "显示英文" : "显示释义"}">
        <span class="card-inner">
          <span class="card-face card-front">
            <span class="word">${escapeHtml(word.english)}</span>
            <span class="phonetic">${escapeHtml(word.phonetic || "")}</span>
            <span class="tap-hint">点击卡片查看释义</span>
          </span>
          <span class="card-face card-back">
            <span class="back-label">释义</span>
            <span class="back-word">${escapeHtml(word.english)}</span>
            <span class="definition">${escapeHtml(word.definition)}</span>
            <span class="source-line">${escapeHtml(source)}</span>
          </span>
        </span>
      </button>
    </section>
    <nav class="study-actions" aria-label="学习操作">
      <button class="action" id="prev" ${session.index === 0 ? "disabled" : ""}>${icons.prev}<span>上一个</span></button>
      <button class="action ${favorite ? "favorited" : ""}" id="favorite">${icons.star(favorite)}<span>${favorite ? "已收藏" : "收藏"}</span></button>
      <button class="action primary" id="next"><span>${session.index === session.queue.length - 1 ? "完成" : "下一个"}</span>${icons.next}</button>
    </nav>
  </main><div class="toast" id="toast"></div>`;

  document.querySelector("#home").addEventListener("click", renderHome);
  document.querySelector("#reshuffle").addEventListener("click", confirmRestart);
  document.querySelector("#word-card").addEventListener("click", () => { revealed = !revealed; renderStudy(); });
  document.querySelector("#favorite").addEventListener("click", toggleFavorite);
  document.querySelector("#prev").addEventListener("click", previousWord);
  document.querySelector("#next").addEventListener("click", nextWord);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function toggleFavorite() {
  const word = currentWord();
  if (!word) return;
  const key = wordKey(word);
  const index = state.favorites.indexOf(key);
  if (index >= 0) state.favorites.splice(index, 1);
  else state.favorites.push(key);
  saveState();
  renderStudy();
  showToast(index >= 0 ? "已移出收藏夹" : "已加入收藏夹");
}

function nextWord() {
  const session = currentSession();
  if (session.index >= session.queue.length - 1) {
    session.index = session.queue.length;
    saveState();
    return renderComplete();
  }
  session.index += 1;
  revealed = false;
  saveState();
  renderStudy();
}

function previousWord() {
  const session = currentSession();
  if (session.index <= 0) return;
  session.index -= 1;
  revealed = false;
  saveState();
  renderStudy();
}

function confirmRestart() {
  if (window.confirm(`重新打乱“${MODE_LABELS[activeMode]}”并从第一个开始？`)) startMode(activeMode, true);
}

function renderEmpty(mode) {
  activeMode = mode;
  const message = mode === "favorites" ? "收藏夹里还没有单词。在全部单词或未收藏模式中，点击收藏即可加入。" : "这里暂时没有可学习的单词。";
  app.innerHTML = `<main class="empty-state"><div class="state-icon">☆</div><h2>还没有单词</h2><p>${message}</p><div class="state-actions"><button class="state-button primary" id="back-home">返回首页</button></div></main>`;
  document.querySelector("#back-home").addEventListener("click", renderHome);
}

function renderComplete() {
  const total = currentSession()?.queue.length || 0;
  app.innerHTML = `<main class="complete-state"><div class="state-icon">✓</div><h2>这一轮完成了</h2><p>你已经看完“${MODE_LABELS[activeMode]}”中的 ${total.toLocaleString()} 个词条。</p><div class="state-actions"><button class="state-button" id="back-home">返回首页</button><button class="state-button primary" id="again">重新随机</button></div></main>`;
  document.querySelector("#back-home").addEventListener("click", renderHome);
  document.querySelector("#again").addEventListener("click", () => startMode(activeMode, true));
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("show"));
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
}

async function init() {
  try {
    words = Array.isArray(window.VOCAB_PARTS) ? window.VOCAB_PARTS.flat() : [];
    if (!words.length) throw new Error("词库为空");
    const validKeys = new Set(words.map(wordKey));
    state.favorites = state.favorites.filter(key => validKeys.has(key));
    for (const [mode, session] of Object.entries(state.sessions)) {
      if (!Array.isArray(session?.queue)) delete state.sessions[mode];
      else {
        session.queue = session.queue.filter(key => validKeys.has(key));
        session.index = Math.min(Math.max(0, session.index || 0), session.queue.length);
      }
    }
    saveState();
    renderHome();
  } catch (error) {
    app.innerHTML = `<main class="empty-state"><div class="state-icon">!</div><h2>词库没有载入</h2><p>${escapeHtml(error.message)}。请重新打开应用。</p><div class="state-actions"><button class="state-button primary" onclick="location.reload()">重新加载</button></div></main>`;
  }
}

init();
