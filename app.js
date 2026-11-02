(() => {
  "use strict";
  const config = window.APP_CONFIG || {};
  const API = String(config.API_BASE_URL || "").replace(/\/$/, "");
  const app = document.getElementById("app");
  const toast = document.getElementById("toast");
  const telegramUsername = String(config.TELEGRAM_USERNAME || "beemax_1").replace(/^@/, "");
  let socket = null;
  let toastTimer = null;
  let currentState = null;
  let friendRoom = null;
  let noPosition = 0;

  const heartSvg = `<svg class="heart-sticker" viewBox="0 0 120 120" role="img" aria-label="قلب قرمز"><defs><linearGradient id="hg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ff7c8d"/><stop offset="1" stop-color="#df1639"/></linearGradient></defs><path d="M60 101S11 70 11 38C11 19 35 8 50 24l10 11 10-11c15-16 39-5 39 14 0 32-49 63-49 63Z" fill="url(#hg)" stroke="#bd1533" stroke-width="3"/><path d="M26 39c2-10 13-15 21-10" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".75"/><path d="m78 15 4-9 4 9 9 4-9 4-4 9-4-9-9-4Z" fill="#ffb7c0"/><circle cx="20" cy="77" r="5" fill="#ffc0c7"/></svg>`;
  const questionSvg = `<svg class="question-sticker" viewBox="0 0 110 110" aria-hidden="true"><path d="M55 7c6 0 8 12 14 15s18-1 22 5-4 16-2 23 13 13 11 20-15 8-19 14-3 18-10 21-15-7-22-7-16 8-22 4-4-17-8-23S3 69 5 62s15-11 17-18-5-17 0-22 18 0 25-3 3-12 8-12Z" fill="#fff0f2" stroke="#ed2945" stroke-width="3"/><path d="M55 29c-13 0-21 9-21 19h12c0-5 4-8 9-8s8 3 8 8c0 7-10 8-10 18v4h12v-3c0-8 11-12 11-21 0-10-8-17-21-17Z" fill="#ed2945"/><circle cx="55" cy="83" r="6" fill="#ed2945"/><path d="m11 17 3-7 3 7 7 3-7 3-3 7-3-7-7-3Z" fill="#ff9caa"/><path d="m90 88 3-7 3 7 7 3-7 3-3 7-3-7-7-3Z" fill="#ff9caa"/></svg>`;
  const calendarSvg = `<svg class="calendar-sticker" viewBox="0 0 110 110" aria-hidden="true"><rect x="13" y="21" width="84" height="78" rx="17" fill="#fff" stroke="#ed2945" stroke-width="4"/><path d="M13 39h84" stroke="#ed2945" stroke-width="15"/><path d="M35 12v19M75 12v19" stroke="#b91d39" stroke-width="7" stroke-linecap="round"/><path d="M31 55h9v9h-9zM51 55h9v9h-9zM71 55h9v9h-9zM31 75h9v9h-9zM51 75h9v9h-9z" fill="#ff9aa8"/><path d="m69 78 6 6 13-15" fill="none" stroke="#e42644" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const catSvg = `<svg class="cat-svg" viewBox="0 0 260 250" role="img" aria-label="گربه‌ی بامزه با قلب"><defs><linearGradient id="catfur" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#fff4ed"/><stop offset="1" stop-color="#f7c9bc"/></linearGradient><linearGradient id="catheart" x1="0" x2="1"><stop stop-color="#ff7185"/><stop offset="1" stop-color="#df183b"/></linearGradient></defs><ellipse cx="132" cy="226" rx="78" ry="12" fill="#ed2945" opacity=".12"/><path d="M61 82 48 21q-2-10 9-3l36 30M163 48l38-30q11-8 9 5l-9 61" fill="url(#catfur)" stroke="#9d6a69" stroke-width="5" stroke-linejoin="round"/><path d="m61 49 1-16 23 20M178 53l27-21-3 29" fill="#ee929b"/><path d="M53 102c0-43 34-72 80-72s79 29 79 72v58c0 39-34 63-79 63s-80-24-80-63Z" fill="url(#catfur)" stroke="#9d6a69" stroke-width="5"/><path d="M93 116q-12-13-22 0M188 116q-12-13-22 0" fill="none" stroke="#543a42" stroke-width="7" stroke-linecap="round"/><path d="M122 132q10-9 20 0-10 14-20 0Z" fill="#d86f7b"/><path d="M132 145q-6 12-18 6M132 145q6 12 18 6" fill="none" stroke="#543a42" stroke-width="4" stroke-linecap="round"/><path d="M75 139 34 132M76 151l-43 4M188 139l40-7M188 151l42 5" stroke="#9d6a69" stroke-width="3" stroke-linecap="round"/><path d="M93 88q16-18 32 0M144 87q16-18 31 0" fill="none" stroke="#eab3a8" stroke-width="5" stroke-linecap="round"/><path d="M132 186c-17-17-33-4-27 10 5 12 27 24 27 24s22-12 27-24c6-14-10-27-27-10Z" fill="url(#catheart)" stroke="#b41e3a" stroke-width="2"/><path d="M224 42c-14-17-31-5-26 8 3 8 20 18 20 18s17-10 20-18c5-13-12-25-26-8Z" fill="#ed2945"/><path d="m26 63 4-10 4 10 10 4-10 4-4 10-4-10-10-4Z" fill="#ff8f9e"/><path d="m227 180 4-10 4 10 10 4-10 4-4 10-4-10-10-4Z" fill="#ff8f9e"/></svg>`;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function configured() {
    return API && !API.includes("SET-WORKER-URL-HERE");
  }
  function shell(content, tag = "") {
    app.innerHTML = `<header class="topbar"><div class="brand"><span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20S3.5 14.7 3.5 9.3C3.5 4.5 9.2 3.2 12 7c2.8-3.8 8.5-2.5 8.5 2.3C20.5 14.7 12 20 12 20Z" fill="currentColor"/></svg></span><span class="brand-name">حرف بزنیم؟</span></div><span class="top-tag">${tag || "دعوت کوچولو"}</span></header>${content}<footer class="footer">♥</footer>`;
  }
  function configError() {
    shell(`<section class="panel"><div class="panel-content error-card"><div class="error-icon">🛠️</div><h2>یه تنظیم کوچولو مونده</h2><p>آدرس Worker هنوز داخل فایل <b>config.js</b> وارد نشده. بعد از Deploy کردن Worker در Cloudflare، آدرسش را در API_BASE_URL بگذار و دوباره سایت را باز کن.</p></div></section>`, "راه‌اندازی");
  }
  async function api(path, options = {}) {
    if (!configured()) throw new Error("آدرس سرور هنوز تنظیم نشده است.");
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), ...(options.body ? { "Content-Type": "application/json" } : {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "ارتباط با سرور برقرار نشد.");
    return data;
  }
  function connect(room, role, ownerKey = "") {
    if (socket) { try { socket.close(); } catch (_) {} }
    const wsBase = API.replace(/^http/, "ws");
    const query = new URLSearchParams({ room, role });
    if (ownerKey) query.set("key", ownerKey);
    socket = new WebSocket(`${wsBase}/api/connect?${query.toString()}`);
    socket.addEventListener("message", event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          currentState = message.state;
          if (role === "owner") renderOwner(room, ownerKey, message.state, true);
          else renderFriend(message.state);
        }
      } catch (_) { /* نادیده گرفتن پیام خراب */ }
    });
    socket.addEventListener("close", () => {
      if (role === "owner") {
        const pill = document.getElementById("connection-status");
        if (pill) { pill.textContent = "در حال اتصال دوباره"; pill.classList.remove("live"); }
      }
    });
    socket.addEventListener("open", () => {
      const pill = document.getElementById("connection-status");
      if (pill) { pill.textContent = "اتصال زنده"; pill.classList.add("live"); }
    });
  }
  function humanSchedule(slot) {
    return slot === "tomorrow_noon" ? "فردا ظهر" : slot === "tomorrow_night" ? "فردا شب" : "هنوز انتخاب نشده";
  }
  function eventIcon(text) {
    if (text.includes("نه")) return "✕";
    if (text.includes("آره")) return "♥";
    if (text.includes("ظهر")) return "☀";
    if (text.includes("شب")) return "☾";
    return "🎀";
  }
  function renderHome() {
    shell(`<section class="panel"><div class="panel-content hero"><div class="hero-art">${heartSvg}<span class="spark s1">✦</span><span class="spark s2">✳</span><span class="spark s3">♡</span></div><div class="owner-intro"><span class="kicker"><span class="kicker-dot"></span>پنل دعوت</span><h1>حرف بزنیم؟</h1><p class="lead">لینک مخصوص دوستت رو بساز و جوابش رو زنده توی پنل خودت ببین.</p><button id="create-session" class="primary-btn full">ساخت لینک دعوت <span aria-hidden="true">↗</span></button><p class="mini-note">بعد از ساخت لینک، فقط همون لینک رو براش بفرست.</p></div></div></section>`, "پنل تو");
    document.getElementById("create-session").addEventListener("click", async () => {
      const button = document.getElementById("create-session");
      button.disabled = true; button.textContent = "در حال ساخت لینک...";
      try {
        const result = await api("/api/create", { method: "POST", body: "{}" });
        localStorage.setItem(`hb-owner-${result.room}`, result.ownerKey);
        location.href = `${location.pathname}?owner=${encodeURIComponent(result.room)}`;
      } catch (error) {
        showToast(error.message);
        button.disabled = false; button.textContent = "ساخت لینک دعوت ↗";
      }
    });
  }
  function renderOwner(room, ownerKey, state, fromSocket = false) {
    const invite = new URL(location.pathname, location.origin);
    invite.searchParams.set("room", room);
    const events = Array.isArray(state.events) ? [...state.events].reverse() : [];
    const eventMarkup = events.length ? events.map(item => `<li class="event-item"><span class="event-icon">${eventIcon(item.label || "")}</span><span>${escapeHtml(item.label || "یک انتخاب ثبت شد")}</span></li>`).join("") : `<li class="empty-events">هنوز انتخابی ثبت نشده؛ منتظر جواب دوستت باش.</li>`;
    const statusText = state.phase === "question" ? "منتظر جواب دوستت" : state.phase === "schedule" ? "جواب آره ثبت شد" : state.phase === "complete" ? "زمان گفت‌وگو انتخاب شد" : "جلسه بسته شد";
    const schedule = state.schedule ? humanSchedule(state.schedule) : "در انتظار انتخاب";
    const telegramText = state.telegramStatus === "sent" ? "نتیجه به تلگرام ارسال شد" : state.telegramStatus === "failed" ? "ارسال تلگرام ناموفق بود؛ تنظیمات ربات را بررسی کن" : state.telegramStatus === "not_configured" ? "تلگرام هنوز تنظیم نشده" : "بعد از انتخاب زمان ارسال می‌شود";
    shell(`<section class="panel"><div class="panel-content"><div class="dashboard-head"><div><span class="kicker"><span class="kicker-dot"></span>پنل تو</span><h2>وضعیت دعوت</h2></div><span id="connection-status" class="status-pill">در حال اتصال</span></div><div class="status-pill">${statusText}</div><div class="stats-grid"><div class="stat-card"><div class="stat-label">تعداد دفعات زدن «نه»</div><div id="no-count" class="stat-value">${state.noCount || 0} <span style="font-size:14px;color:#b99da3">/ ۱۰</span></div></div><div class="stat-card"><div class="stat-label">زمان انتخاب‌شده</div><div id="schedule-value" class="stat-value small">${schedule}</div></div></div><div class="invite-box"><div class="invite-title">لینک دوستت</div><div class="invite-row"><input id="invite-link" class="invite-input" readonly value="${invite.href.replace(/&/g,"&amp;").replace(/"/g,"&quot;")}"><button id="copy-invite" class="copy-btn">کپی لینک</button></div></div><div class="events-box"><div class="events-title"><span>انتخاب‌های دوستت</span><span id="event-count" style="font-size:10px;color:#b99da3">${events.length} رویداد</span></div><ul id="event-list" class="event-list">${eventMarkup}</ul><p id="telegram-status" class="connection-note">${telegramText}</p></div></div></section>`, "داشبورد");
    document.getElementById("copy-invite").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(invite.href); showToast("لینک دعوت کپی شد 🎀"); }
      catch (_) { const input = document.getElementById("invite-link"); input.select(); document.execCommand("copy"); showToast("لینک دعوت کپی شد 🎀"); }
    });
    if (fromSocket) {
      const pill = document.getElementById("connection-status");
      if (pill && socket && socket.readyState === WebSocket.OPEN) { pill.textContent = "اتصال زنده"; pill.classList.add("live"); }
    }
  }
  function renderFriend(state) {
    currentState = state;
    if (!state || state.phase === "question") renderQuestion(state || { noCount: 0 });
    else if (state.phase === "schedule") renderSchedule(state);
    else renderCat(state);
  }
  function renderQuestion(state) {
    const count = Math.min(Number(state.noCount) || 0, 10);
    noPosition = count;
    shell(`<section class="panel"><div class="panel-content question-wrap">${questionSvg}<span class="kicker"><span class="kicker-dot"></span>یه سؤال کوچولو</span><h1>حرف بزنیم؟</h1><p class="lead">${count >= 10 ? "دیگه راه فراری نیست! حالا نوبت آره‌ست 😼" : "جوابت رو انتخاب کن..."}</p><div class="counter">نه‌های ثبت‌شده: <b id="counter-value">${count}</b> / ۱۰</div><div id="choice-zone" class="choice-zone"><button id="yes-button" class="choice-btn yes-btn ${count >= 10 ? "ready" : ""}" ${count < 10 ? "disabled" : ""}>آره ♥</button><button id="no-button" class="choice-btn no-btn ${count > 0 ? "running" : ""}" ${count >= 10 ? "disabled" : ""}>نه</button></div><p id="question-hint" class="hint">${count >= 10 ? "آره رو بزن تا زمان حرف زدن رو انتخاب کنیم." : ""}</p><span class="scribble" aria-hidden="true">✳</span></div></section>`, "برای دوستت");
    const noButton = document.getElementById("no-button");
    const yesButton = document.getElementById("yes-button");
    if (count > 0) moveNoButton(noButton, count);
    noButton.addEventListener("click", async () => {
      noButton.disabled = true;
      try {
        const result = await api("/api/action", { method: "POST", body: JSON.stringify({ room: friendRoom, action: "no" }) });
        renderQuestion(result.state);
      } catch (error) { showToast(error.message); noButton.disabled = false; }
    });
    yesButton.addEventListener("click", async () => {
      if (count < 10) return;
      yesButton.disabled = true;
      try {
        const result = await api("/api/action", { method: "POST", body: JSON.stringify({ room: friendRoom, action: "yes" }) });
        renderFriend(result.state);
      } catch (error) { showToast(error.message); yesButton.disabled = false; }
    });
  }
  function moveNoButton(button, count) {
    const zone = document.getElementById("choice-zone");
    if (!zone || !button) return;
    button.classList.add("running");
    const scale = Math.max(.32, 1 - count * .067);
    button.style.transform = `scale(${scale}) rotate(${count % 2 ? 8 : -8}deg)`;
    const zoneWidth = zone.clientWidth || 350;
    const leftMax = Math.max(0, zoneWidth - Math.max(70, 108 * scale));
    const positions = [[.02,.05],[.65,.12],[.28,.55],[.72,.62],[.08,.61],[.48,.05],[.83,.34],[.18,.25],[.57,.72],[.02,.42]];
    const pos = positions[(count - 1) % positions.length];
    button.style.left = `${Math.min(leftMax, Math.max(0, pos[0] * zoneWidth))}px`;
    button.style.top = `${pos[1] * 83}px`;
    const yes = document.getElementById("yes-button");
    if (yes) yes.style.transform = `scale(${1 + Math.min(count, 10) * .055})`;
  }
  function renderSchedule(state) {
    shell(`<section class="panel"><div class="panel-content schedule-wrap">${calendarSvg}<span class="kicker"><span class="kicker-dot"></span>قرار شد حرف بزنیم</span><h2>خب، امشب که کارات زیاده...</h2><p class="lead">فردا کِی برات بهتره؟</p><div class="schedule-grid"><button class="slot-btn" data-slot="tomorrow_noon"><span class="slot-emoji">☀️</span><span class="slot-main">فردا ظهر</span><span class="slot-sub">یه گپ وسط روز</span></button><button class="slot-btn" data-slot="tomorrow_night"><span class="slot-emoji">🌙</span><span class="slot-main">فردا شب</span><span class="slot-sub">یه گفت‌وگوی آروم</span></button></div><p class="mini-note">یکی رو انتخاب کن 🎀</p></div></section>`, "انتخاب زمان");
    document.querySelectorAll("[data-slot]").forEach(button => button.addEventListener("click", async () => {
      document.querySelectorAll("[data-slot]").forEach(item => item.disabled = true);
      try {
        const result = await api("/api/action", { method: "POST", body: JSON.stringify({ room: friendRoom, action: "schedule", slot: button.dataset.slot }) });
        renderFriend(result.state);
      } catch (error) { showToast(error.message); document.querySelectorAll("[data-slot]").forEach(item => item.disabled = false); }
    }));
  }
  function renderCat(state) {
    shell(`<section class="panel"><div class="panel-content cat-result"><div class="cat-wrap">${catSvg}</div><div class="cat-caption">منمووووننننن همین خلاصه! 🎀</div><p class="result-sub">${state.schedule ? `پس: ${humanSchedule(state.schedule)} ♥` : "ممنون که اومدی ♥"}</p><button id="exit-button" class="primary-btn full">خروج</button></div></section>`, "قرار ثبت شد");
    document.getElementById("exit-button").addEventListener("click", showExitModal);
  }
  function showExitModal() {
    const overlay = document.createElement("div");
    overlay.className = "exit-overlay";
    overlay.innerHTML = `<div class="exit-modal" role="dialog" aria-modal="true" aria-labelledby="exit-title"><span class="bow">🎀</span><h2 id="exit-title">ممنون که صادقانه جواب دادی</h2><p>و با عدالت طاهایی راه اومدی 💗</p><div class="modal-actions"><button id="stay-button" class="soft-btn">برگردم</button><button id="leave-button" class="primary-btn">خروج</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
    document.getElementById("stay-button").addEventListener("click", () => overlay.remove());
    document.getElementById("leave-button").addEventListener("click", async () => {
      const leave = document.getElementById("leave-button"); leave.disabled = true; leave.textContent = "...";
      try { await api("/api/action", { method: "POST", body: JSON.stringify({ room: friendRoom, action: "exit" }) }); }
      catch (error) { showToast(error.message); }
      location.href = `https://t.me/${encodeURIComponent(telegramUsername)}`;
    });
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
  }
  async function startOwner(room) {
    const key = localStorage.getItem(`hb-owner-${room}`);
    if (!key) {
      shell(`<section class="panel"><div class="panel-content error-card"><div class="error-icon">🔐</div><h2>کلید پنل پیدا نشد</h2><p>این پنل روی همان مرورگری باز می‌شود که لینک دعوت را ساخته. ممکن است داده‌های مرورگر پاک شده باشد.</p><button id="home-button" class="secondary-btn">صفحه اول</button></div></section>`, "پنل تو");
      document.getElementById("home-button").addEventListener("click", () => location.href = location.pathname);
      return;
    }
    try {
      const result = await api(`/api/state?room=${encodeURIComponent(room)}&role=owner`, { headers: { "X-Owner-Key": key } });
      currentState = result.state;
      renderOwner(room, key, result.state);
      connect(room, "owner", key);
    } catch (error) {
      shell(`<section class="panel"><div class="panel-content error-card"><div class="error-icon">🥺</div><h2>پنل باز نشد</h2><p>${escapeHtml(error.message)}</p></div></section>`, "خطا");
    }
  }
  async function startFriend(room) {
    friendRoom = room;
    try {
      const result = await api(`/api/state?room=${encodeURIComponent(room)}&role=friend`);
      currentState = result.state;
      renderFriend(result.state);
      connect(room, "friend");
    } catch (error) {
      shell(`<section class="panel"><div class="panel-content error-card"><div class="error-icon">💌</div><h2>این لینک پیدا نشد</h2><p>از کسی که دعوتت کرده بخواه لینک تازه‌ای برات بفرسته.</p></div></section>`, "دعوت");
    }
  }
  function start() {
    if (!configured()) { configError(); return; }
    const params = new URLSearchParams(location.search);
    const owner = params.get("owner");
    const room = params.get("room");
    if (owner) startOwner(owner);
    else if (room) startFriend(room);
    else renderHome();
  }
  start();
})();
