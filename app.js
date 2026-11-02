import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, set, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const appRoot = document.querySelector("#app");
const toast = document.querySelector("#toast");
const params = new URLSearchParams(location.search);
const roomId = params.get("room");
const mode = params.get("view") || (roomId ? "guest" : "admin");
let db = null, auth = null, currentUser = null, roomRef = null;
let unsubscribeRoom = null, guestAttempts = 0, roomData = null, drawerOpen = false;

const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_") &&
  firebaseConfig.projectId && !firebaseConfig.projectId.includes("YOUR_") &&
  firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes("YOUR_") &&
  firebaseConfig.appId && !firebaseConfig.appId.includes("YOUR_");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function baseMarkup(content, extraClass = "") {
  appRoot.innerHTML = `<section class="panel ${extraClass}">
    <div class="topline"><div class="brand"><span class="brand-mark">♡</span><span>یه قرار کوچولو</span></div><span class="eyebrow">ساخته شده با یه ذره شیطنت</span></div>
    ${content}
  </section>`;
}

function setupMarkup() {
  baseMarkup(`<div class="admin-empty">
    <div class="heart-sticker">♡</div>
    <h1>اول یه اتصال کوچولو لازمه</h1>
    <p class="lead">برای اینکه انتخاب دوستت از گوشی خودش به پنل تو برسه، باید سایت رو به Firebase وصل کنی. این کار فقط یک‌بار انجام می‌شه.</p>
    <div class="connection-hint"><strong>مراحل راه‌اندازی:</strong>
      <ol class="setup-list">
        <li>در <span class="code-chip">console.firebase.google.com</span> یک پروژه بساز.</li>
        <li>یک برنامه‌ی Web اضافه کن و اطلاعات config را در فایل <span class="code-chip">firebase-config.js</span> قرار بده.</li>
        <li>در Authentication، ورود Anonymous را فعال کن.</li>
        <li>Realtime Database بساز و قوانین فایل <span class="code-chip">database.rules.json</span> را در بخش Rules قرار بده.</li>
      </ol>
      راهنمای کامل تصویری/متنی داخل فایل README فارسی همین پروژه است.
    </div>
  </div>`);
}

function errorMarkup(title, detail) {
  baseMarkup(`<div class="admin-empty"><div class="heart-sticker">!</div><h1>${title}</h1><p class="lead">${detail}</p><button class="secondary-btn" id="reload-btn">تلاش دوباره</button></div>`);
  document.querySelector("#reload-btn")?.addEventListener("click", () => location.reload());
}

function randomRoomId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
function roomUrl(view) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomId);
  url.searchParams.set("view", view);
  return url.toString();
}
function flowerSvg() {
  return `<svg class="deco deco-flower" viewBox="0 0 100 100" aria-hidden="true"><g fill="#f6b0a8"><ellipse cx="50" cy="19" rx="13" ry="20"/><ellipse cx="50" cy="81" rx="13" ry="20"/><ellipse cx="19" cy="50" rx="20" ry="13"/><ellipse cx="81" cy="50" rx="20" ry="13"/><ellipse cx="28" cy="28" rx="13" ry="19" transform="rotate(-45 28 28)"/><ellipse cx="72" cy="72" rx="13" ry="19" transform="rotate(-45 72 72)"/><ellipse cx="72" cy="28" rx="13" ry="19" transform="rotate(45 72 28)"/><ellipse cx="28" cy="72" rx="13" ry="19" transform="rotate(45 28 72)"/></g><circle cx="50" cy="50" r="16" fill="#ffe08a"/><circle cx="45" cy="47" r="2" fill="#8b5b52"/><circle cx="55" cy="47" r="2" fill="#8b5b52"/><path d="M44 54 Q50 61 56 54" fill="none" stroke="#8b5b52" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}

function guestQuestionMarkup() {
  return `<div class="question-hero">
    <span class="deco deco-heart" aria-hidden="true">♡</span>${flowerSvg()}<span class="deco deco-ticket" aria-hidden="true">✉</span>
    <div class="heart-sticker">♥</div>
    <h1>حرف بزنیم؟</h1>
    <p class="lead">یه گفت‌وگوی کوچولو، یه حال خوبِ دوتایی...<br>نظرت چیه؟</p>
  </div>
  <div class="button-arena" id="button-arena">
    <button class="choice-btn yes-btn" id="yes-btn">آره، حتماً ♡</button>
    <button class="choice-btn no-btn" id="no-btn">نه 🙃</button>
  </div>
  <p class="attempt-note" id="attempt-note">قول می‌دم طولانی نشه... شاید! ✨</p>
  <p class="tiny-note">یه انتخاب کوچولو، کلی اتفاق بامزه</p>`;
}

const scheduleLabels = {
  tomorrow_noon: { title: "فردا ظهر", detail: "یه گپ قشنگ وسط روز ☀️", icon: "☀️" },
  tomorrow_night: { title: "فردا شب", detail: "یه گفت‌وگوی آروم آخر شب 🌙", icon: "🌙" }
};

function guestScheduleMarkup() {
  return `<div class="schedule-intro">
    <div class="heart-sticker">☁</div>
    <h2>خب امشب که سرت شلوغه...</h2>
    <p class="lead">پس فردا حرف می‌زنیم! تو بگو کدومش قشنگ‌تره؟</p>
  </div>
  <div class="schedule-grid">
    <button class="schedule-card" data-schedule="tomorrow_noon"><span class="schedule-icon">☀️</span><strong>فردا ظهر</strong><small>یه قرارِ روشن و پرانرژی</small></button>
    <button class="schedule-card" data-schedule="tomorrow_night"><span class="schedule-icon">🌙</span><strong>فردا شب</strong><small>یه گپ آروم و خودمونی</small></button>
  </div>
  <p class="schedule-foot">هر کدوم رو انتخاب کنی، همونه که ثبت می‌شه ♡</p>`;
}

function guestFinishMarkup(schedule) {
  const chosen = scheduleLabels[schedule] || scheduleLabels.tomorrow_noon;
  return `<div class="finish-view">
    <div class="deco deco-star" style="right:8%;top:8%">✦</div><div class="deco deco-star" style="left:9%;top:25%;animation-delay:.6s">✧</div>
    <div class="cat-frame"><img src="assets/cat-sticker.webp" alt="استیکر گربه‌ی بامزه با چشم‌های درشت"></div>
    <p class="finish-message">منموووونننن! 🥹</p>
    <h2>${chosen.title} حرف می‌زنیم</h2>
    <p class="finish-sub">قرارمون ثبت شد؛ دیگه قول دادی‌هااا 💌</p>
    <div class="footer-scribble">✿ یه عالمه قلب ریز برای تو ✿</div>
  </div>`;
}

function launchConfetti() {
  const glyphs = ["✦", "♡", "✿", "♥", "✧", "❀"];
  for (let i = 0; i < 22; i++) {
    const el = document.createElement("span");
    el.className = "sparkle-burst";
    el.textContent = glyphs[i % glyphs.length];
    el.style.left = `${8 + Math.random() * 84}%`;
    el.style.top = `${24 + Math.random() * 48}%`;
    el.style.setProperty("--dx", `${(Math.random() - .5) * 170}px`);
    el.style.setProperty("--dy", `${(Math.random() - .5) * 180}px`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  for (let i = 0; i < 52; i++) {
    const el = document.createElement("i");
    el.className = "confetti";
    el.style.left = `${Math.random() * 100}%`;
    el.style.background = ["#f08089", "#f7c4a8", "#e9a6b5", "#f5d67b", "#bc9dd8"][i % 5];
    el.style.setProperty("--drift", `${(Math.random() - .5) * 180}px`);
    el.style.animationDelay = `${Math.random() * .75}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
}

function renderGuest(data) {
  roomData = data;
  const status = data.status || "waiting";
  if (status === "done") {
    baseMarkup(guestFinishMarkup(data.schedule), "guest-shell");
    return;
  }
  if (status === "schedule") {
    baseMarkup(guestScheduleMarkup(), "guest-shell");
    document.querySelectorAll("[data-schedule]").forEach(button => {
      button.addEventListener("click", async () => {
        const schedule = button.dataset.schedule;
        button.disabled = true;
        try {
          // Write the guest-owned fields separately so the database rules can
          // authorize each child field without granting guest access to the room root.
          await set(ref(db, `rooms/${roomId}/schedule`), schedule);
          await set(ref(db, `rooms/${roomId}/noAttempts`), guestAttempts);
          await set(ref(db, `rooms/${roomId}/updatedAt`), Date.now());
          await set(ref(db, `rooms/${roomId}/status`), "done");
          launchConfetti();
        } catch (err) {
          showToast("ثبت انتخاب انجام نشد؛ اتصال اینترنت رو بررسی کن.");
          button.disabled = false;
          console.error(err);
        }
      });
    });
    return;
  }
  guestAttempts = Number(data.noAttempts || 0);
  baseMarkup(guestQuestionMarkup(), "guest-shell");
  const yes = document.querySelector("#yes-btn");
  const no = document.querySelector("#no-btn");
  const arena = document.querySelector("#button-arena");
  const note = document.querySelector("#attempt-note");
  const notes = [
    "قول می‌دم طولانی نشه... شاید! ✨",
    "اِ... انگار دکمه نه عجله داره! 🏃",
    "نه؟ مطمئنی؟ یه بار دیگه فکر کن 😌",
    "دکمه آره داره اعتمادبه‌نفس می‌گیره! 💅",
    "این نه گفتنت خیلی مشکوکه‌هااا 🤨",
    "آره رو ببین چه ناز شده! 🥺",
    "دیگه دکمه نه جا کم آورده!",
    "فقط یه کوچولو مونده تا آشتی کنیم ♡",
    "نه دیگه داره می‌ره تو افق...",
    "خبببب، حالا دیگه آره رو بزن 😇"
  ];
  const applyScale = () => {
    const scale = Math.min(1.72, 1 + guestAttempts * .067);
    yes.style.setProperty("--yes-scale", scale.toFixed(2));
  };
  applyScale();
  yes.addEventListener("click", async () => {
    yes.disabled = true;
    try {
      await set(ref(db, `rooms/${roomId}/status`), "schedule");
      await set(ref(db, `rooms/${roomId}/updatedAt`), Date.now());
    } catch (err) {
      yes.disabled = false;
      showToast("ارتباط برقرار نشد؛ دوباره امتحان کن.");
      console.error(err);
    }
  });
  no.addEventListener("click", () => {
    guestAttempts += 1;
    const count = Math.min(guestAttempts, 10);
    note.textContent = notes[Math.min(count - 1, notes.length - 1)];
    applyScale();
    if (guestAttempts >= 10) {
      no.classList.add("gone");
      note.textContent = "دیگه راه فراری نیست؛ آره رو بزن! 😇";
      return;
    }
    no.classList.add("running");
    const bounds = arena.getBoundingClientRect();
    const maxX = Math.max(5, bounds.width - no.offsetWidth - 8);
    const maxY = Math.max(5, bounds.height - no.offsetHeight - 8);
    no.style.left = `${Math.round(4 + Math.random() * (maxX - 4))}px`;
    no.style.top = `${Math.round(4 + Math.random() * (maxY - 4))}px`;
    const shrink = Math.max(.48, 1 - guestAttempts * .055);
    no.style.transform = `scale(${shrink}) rotate(${Math.random() * 20 - 10}deg)`;
    if (guestAttempts === 1) showToast("ای وااای! دکمه نه فرار کرد 😂");
  });
}

function drawerMarkup() {
  return `<button class="edge-grab" id="edge-grab" aria-label="باز کردن منوی مدیریت"><span>↤</span>بکش</button>
    <div class="drawer-shade" id="drawer-shade"></div>
    <aside class="side-drawer" id="side-drawer" aria-label="منوی خصوصی مدیریت">
      <div class="drawer-top"><strong>گوشه‌ی خصوصی تو ♡</strong><button class="close-drawer" id="close-drawer" aria-label="بستن">×</button></div>
      <p class="drawer-copy">این قسمت فقط در پنل تو دیده می‌شه. با شروع مجدد، صفحه‌ی دوستت هم از اول نمایش داده می‌شه و می‌تونه دوباره انتخاب کنه.</p>
      <button class="primary-btn reset-btn" id="reset-btn">↻ شروع مجدد</button>
      <p class="tiny-note">لینک پنل مدیریت رو برای کسی نفرست.</p>
    </aside>`;
}

function attachDrawer() {
  document.querySelector("#edge-grab")?.addEventListener("click", () => toggleDrawer(true));
  document.querySelector("#close-drawer")?.addEventListener("click", () => toggleDrawer(false));
  document.querySelector("#drawer-shade")?.addEventListener("click", () => toggleDrawer(false));
  const handle = document.querySelector("#edge-grab");
  let startX = null;
  handle?.addEventListener("pointerdown", e => { startX = e.clientX; });
  handle?.addEventListener("pointerup", e => {
    if (startX !== null && startX - e.clientX > 25) toggleDrawer(true);
    startX = null;
  });
  document.querySelector("#reset-btn")?.addEventListener("click", showResetConfirm);
}
function toggleDrawer(open) {
  drawerOpen = open;
  document.querySelector("#side-drawer")?.classList.toggle("open", open);
  document.querySelector("#drawer-shade")?.classList.toggle("open", open);
}

function showResetConfirm() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="heart-sticker">↻</div><h2>از اول شروع کنیم؟</h2><p>انتخاب قبلی پاک می‌شه و صفحه‌ی دوستت دوباره با سؤال «حرف بزنیم؟» باز می‌شه.</p><div class="modal-actions"><button class="secondary-btn" id="cancel-reset">بی‌خیال</button><button class="primary-btn" id="confirm-reset">آره، شروع کن</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector("#cancel-reset").addEventListener("click", () => modal.remove());
  modal.querySelector("#confirm-reset").addEventListener("click", async () => {
    const button = modal.querySelector("#confirm-reset");
    button.disabled = true;
    try {
      await update(ref(db, `rooms/${roomId}`), {
        status: "waiting", schedule: null, noAttempts: 0, updatedAt: Date.now()
      });
      guestAttempts = 0;
      modal.remove();
      toggleDrawer(false);
      showToast("از اول شروع شد! ♡");
    } catch (err) {
      button.disabled = false;
      showToast("شروع مجدد انجام نشد؛ اتصال رو بررسی کن.");
      console.error(err);
    }
  });
}

function renderAdmin(data) {
  roomData = data;
  const status = data.status || "waiting";
  let value = "منتظر انتخاب دوستتیم...";
  let caption = "وقتی انتخابش رو ثبت کنه، همین‌جا می‌بینیش.";
  if (status === "schedule") { value = "گفت‌وگو رو قبول کرده! ♡"; caption = "الان داره بین فردا ظهر و فردا شب انتخاب می‌کنه."; }
  if (status === "done") { value = `${scheduleLabels[data.schedule]?.title || "زمان انتخاب‌شده"} حرف می‌زنید ♥`; caption = "انتخاب دوستت ثبت شده؛ قرار قشنگتون مبارک!"; }
  const guestUrl = roomUrl("guest");
  const content = `<div class="admin-header"><div><h1>پنل کوچولوی <span class="red-text">تو</span></h1><p class="lead" style="margin-bottom:0">اینجا نتیجه‌ی انتخاب دوستت رو زنده می‌بینی.</p></div><span class="status-pill"><i class="status-dot"></i>${status === "done" ? "انتخاب ثبت شد" : status === "schedule" ? "در حال انتخاب زمان" : "منتظر دوستت"}</span></div>
    <div class="dashboard">
      <section class="result-card"><div class="result-label">نتیجه‌ی آخرین انتخاب</div><div class="result-value">${value}</div><p class="result-caption">${caption}</p></section>
      <div class="info-grid">
        <div class="info-tile"><span>جوابِ سؤال اول</span><strong>${status === "waiting" ? "هنوز انتخاب نکرده" : "آره، حرف بزنیم!"}</strong></div>
        <div class="info-tile"><span>زمان انتخاب‌شده</span><strong>${status === "done" ? (scheduleLabels[data.schedule]?.title || "ثبت‌شده") : "هنوز مشخص نیست"}</strong></div>
      </div>
      <section class="link-box"><label for="guest-link">لینک مخصوص دوستت (فقط همین لینک رو بفرست)</label><div class="link-row"><input id="guest-link" readonly value="${guestUrl}"><button class="copy-btn" id="copy-link">کپی لینک</button></div></section>
      <div class="connection-hint">پنل تو به‌صورت زنده به انتخاب‌ها گوش می‌ده. این صفحه رو در همین مرورگر نگه دار؛ لینک مدیریت مخصوص خودته و نباید برای دوستت فرستاده بشه.</div>
    </div>
    ${drawerMarkup()}`;
  baseMarkup(content, "admin-shell");
  attachDrawer();
  document.querySelector("#copy-link")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(guestUrl); showToast("لینک دوستت کپی شد! 💌"); }
    catch { document.querySelector("#guest-link").select(); showToast("لینک رو انتخاب کن و کپی بزن."); }
  });
}

function adminLanding() {
  baseMarkup(`<div class="admin-empty">
    <div class="heart-sticker">♡</div>
    <h1>یه گفت‌وگوی کوچولو<br><span class="red-text">از همین‌جا شروع می‌شه</span></h1>
    <p class="lead">یه لینک اختصاصی می‌سازیم؛ دوستت واردش می‌شه، با دکمه‌ی «نه» کل‌کل می‌کنه و آخرش انتخابش مستقیم به پنل تو میاد.</p>
    <button class="primary-btn" id="create-room">ساخت لینک اختصاصی ✨</button>
    <p class="create-note">هر بار می‌تونی از منوی کناری شروع مجدد بزنی.</p>
    </div>`);
  document.querySelector("#create-room")?.addEventListener("click", createRoom);
}

async function createRoom() {
  const button = document.querySelector("#create-room");
  button.disabled = true;
  button.textContent = "داریم لینک رو می‌سازیم...";
  try {
    const id = randomRoomId();
    await set(ref(db, `rooms/${id}`), {
      ownerUid: currentUser.uid, guestUid: null, status: "waiting", schedule: null,
      noAttempts: 0, createdAt: Date.now(), updatedAt: Date.now()
    });
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("room", id);
    url.searchParams.set("view", "admin");
    history.replaceState({}, "", url);
    location.reload();
  } catch (err) {
    console.error(err);
    showToast("ساخت لینک ناموفق بود. قوانین دیتابیس رو بررسی کن.");
    button.disabled = false;
    button.textContent = "ساخت لینک اختصاصی ✨";
  }
}

async function connect() {
  if (!configured) { setupMarkup(); return; }
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getDatabase(firebaseApp);
    const credential = await signInAnonymously(auth);
    currentUser = credential.user;
    if (mode === "guest") {
      if (!roomId) { errorMarkup("لینک کامل نیست!", "از دوستت بخواه لینک اختصاصی رو دوباره برات بفرسته."); return; }
      roomRef = ref(db, `rooms/${roomId}`);
      const joined = await runTransaction(ref(db, `rooms/${roomId}/guestUid`), current => current || currentUser.uid);
      if (!joined.committed || (joined.snapshot.val() !== currentUser.uid)) {
        errorMarkup("این لینک قبلاً استفاده شده", "برای حفظ حریم خصوصی، هر لینک فقط به یک دوست وصل می‌شه. از صاحب پنل بخواه شروع مجدد بزنه یا لینک تازه بسازه.");
        return;
      }
      onValue(roomRef, snap => {
        if (!snap.exists()) { errorMarkup("این قرار پیدا نشد", "احتمالاً لینک منقضی شده. از صاحب پنل بخواه یک لینک تازه بسازه."); return; }
        renderGuest(snap.val());
      }, err => {
        console.error(err);
        errorMarkup("اتصال برقرار نشد", "قوانین Realtime Database یا اتصال اینترنت رو بررسی کن.");
      });
    } else if (roomId) {
      roomRef = ref(db, `rooms/${roomId}`);
      onValue(roomRef, snap => {
        if (!snap.exists()) { errorMarkup("پنل پیدا نشد", "این لینک مدیریت معتبر نیست یا اتاق هنوز ساخته نشده."); return; }
        const data = snap.val();
        if (data.ownerUid !== currentUser.uid) {
          errorMarkup("این پنل متعلق به این مرورگر نیست", "پنل مدیریت به مرورگری وصل می‌شه که لینک رو ساخته. با همان گوشی و مرورگر اولیه بازش کن.");
          return;
        }
        renderAdmin(data);
      }, err => {
        console.error(err);
        errorMarkup("اتصال برقرار نشد", "قوانین Realtime Database یا اتصال اینترنت رو بررسی کن.");
      });
    } else {
      adminLanding();
    }
  } catch (err) {
    console.error(err);
    let message = "ورود ناشناس یا اتصال دیتابیس انجام نشد. تنظیمات Firebase رو بررسی کن.";
    if (err.code === "auth/operation-not-allowed") message = "ورود Anonymous در Firebase فعال نشده؛ از Authentication بخش Sign-in method فعالش کن.";
    if (err.code === "auth/network-request-failed") message = "اتصال اینترنت برقرار نیست یا Firebase در دسترس نیست.";
    errorMarkup("یه مشکلی پیش اومده", message);
  }
}

if (mode !== "admin" && mode !== "guest") {
  errorMarkup("لینک درست نیست", "پارامتر نوع صفحه باید admin یا guest باشد.");
} else {
  connect();
}
