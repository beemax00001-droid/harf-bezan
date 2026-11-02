const ROOM_TTL_SECONDS = 60 * 60 * 24 * 30;
const VALID_SLOTS = new Set(["tomorrow_noon", "tomorrow_night"]);
const SLOT_LABELS = {
  tomorrow_noon: "فردا ظهر",
  tomorrow_night: "فردا شب"
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });
}
function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
function safeRoomId(value) {
  return typeof value === "string" && /^[a-f0-9-]{30,40}$/i.test(value);
}
function corsHeaders(origin, env) {
  const allowed = env.SITE_ORIGIN || "";
  if (!origin || origin === allowed) {
    return {
      "Access-Control-Allow-Origin": allowed || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Owner-Key, X-Admin-Key",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
  }
  return { "Vary": "Origin" };
}
function withCors(response, origin, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (url.pathname === "/api/health") {
      return withCors(json({ ok: true, service: "harf-bezan-room" }), origin, env);
    }

    if (origin && origin !== env.SITE_ORIGIN) {
      return json({ ok: false, error: "Origin مجاز نیست." }, 403, cors);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/setup/chat-id" && request.method === "GET") {
      if (!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) {
        return withCors(json({ ok: false, error: "کلید راه‌اندازی نادرست است." }, 401), origin, env);
      }
      if (!env.TELEGRAM_BOT_TOKEN) {
        return withCors(json({ ok: false, error: "توکن ربات تلگرام هنوز تنظیم نشده است." }, 400), origin, env);
      }
      try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`);
        const telegramData = await telegramResponse.json();
        if (!telegramResponse.ok || !telegramData.ok) {
          return withCors(json({ ok: false, error: telegramData.description || "گرفتن اطلاعات تلگرام ناموفق بود." }, 502), origin, env);
        }
        const chats = new Map();
        for (const update of telegramData.result || []) {
          const message = update.message || update.edited_message || update.channel_post || update.callback_query?.message;
          const chat = message?.chat;
          if (chat?.id !== undefined) {
            chats.set(String(chat.id), {
              chat_id: chat.id,
              type: chat.type || "unknown",
              first_name: chat.first_name || "",
              username: chat.username || ""
            });
          }
        }
        return withCors(json({ ok: true, chats: [...chats.values()] }), origin, env);
      } catch (_) {
        return withCors(json({ ok: false, error: "ارتباط با تلگرام برقرار نشد." }, 502), origin, env);
      }
    }

    if (url.pathname === "/api/create" && request.method === "POST") {
      const room = crypto.randomUUID();
      const ownerKey = randomSecret();
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      const response = await stub.fetch("https://room.internal/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, ownerKey })
      });
      if (!response.ok) return withCors(json({ ok: false, error: "ساخت اتاق دعوت ناموفق بود." }, 500), origin, env);
      return withCors(json({ ok: true, room, ownerKey }), origin, env);
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const room = url.searchParams.get("room") || "";
      const role = url.searchParams.get("role") || "friend";
      if (!safeRoomId(room) || !["owner", "friend"].includes(role)) {
        return withCors(json({ ok: false, error: "لینک دعوت معتبر نیست." }, 400), origin, env);
      }
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      const headers = new Headers();
      if (role === "owner") headers.set("X-Owner-Key", request.headers.get("X-Owner-Key") || "");
      const response = await stub.fetch(`https://room.internal/state?role=${role}`, { headers });
      const body = await response.json().catch(() => ({ ok: false, error: "پاسخ سرور قابل خواندن نیست." }));
      return withCors(json(body, response.status), origin, env);
    }

    if (url.pathname === "/api/action" && request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch (_) { return withCors(json({ ok: false, error: "درخواست معتبر نیست." }, 400), origin, env); }
      const room = body?.room || "";
      if (!safeRoomId(room)) return withCors(json({ ok: false, error: "لینک دعوت معتبر نیست." }, 400), origin, env);
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      const response = await stub.fetch("https://room.internal/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({ ok: false, error: "پاسخ سرور قابل خواندن نیست." }));
      return withCors(json(data, response.status), origin, env);
    }

    if (url.pathname === "/api/connect" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const room = url.searchParams.get("room") || "";
      const role = url.searchParams.get("role") || "friend";
      if (!safeRoomId(room) || !["owner", "friend"].includes(role)) {
        return json({ ok: false, error: "لینک دعوت معتبر نیست." }, 400);
      }
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      return stub.fetch(new Request(`https://room.internal/connect?role=${role}&key=${encodeURIComponent(url.searchParams.get("key") || "")}`, request));
    }

    return withCors(json({ ok: false, error: "این مسیر وجود ندارد." }, 404), origin, env);
  }
};

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async getState() {
    const state = await this.ctx.storage.get("state");
    if (!state) return undefined;
    const ageSeconds = (Date.now() - new Date(state.createdAt).getTime()) / 1000;
    if (!Number.isFinite(ageSeconds) || ageSeconds > ROOM_TTL_SECONDS) {
      await this.ctx.storage.delete("state");
      return undefined;
    }
    return state;
  }

  async saveState(state) {
    state.updatedAt = new Date().toISOString();
    await this.ctx.storage.put("state", state);
    this.broadcast(state);
  }

  broadcast(state) {
    const payload = JSON.stringify({ type: "state", state });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(payload); } catch (_) { /* اتصال بسته شده است */ }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const existing = await this.getState();
      if (existing) return json({ ok: false, error: "این اتاق قبلاً ساخته شده است." }, 409);
      let input;
      try { input = await request.json(); } catch (_) { return json({ ok: false, error: "درخواست نامعتبر است." }, 400); }
      if (!safeRoomId(input.room) || typeof input.ownerKey !== "string") return json({ ok: false, error: "اطلاعات اتاق ناقص است." }, 400);
      const state = {
        room: input.room,
        ownerKey: input.ownerKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        phase: "question",
        noCount: 0,
        schedule: null,
        events: [],
        notified: false,
        telegramStatus: this.env.TELEGRAM_BOT_TOKEN && this.env.TELEGRAM_CHAT_ID ? "waiting" : "not_configured"
      };
      await this.ctx.storage.put("state", state);
      return json({ ok: true });
    }

    if (url.pathname === "/state" && request.method === "GET") {
      const state = await this.getState();
      if (!state) return json({ ok: false, error: "این لینک دعوت منقضی شده یا وجود ندارد." }, 404);
      const role = url.searchParams.get("role") || "friend";
      if (role === "owner" && request.headers.get("X-Owner-Key") !== state.ownerKey) {
        return json({ ok: false, error: "دسترسی به پنل مالک مجاز نیست." }, 403);
      }
      const { ownerKey, ...publicState } = state;
      return json({ ok: true, state: publicState });
    }

    if (url.pathname === "/connect" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const state = await this.getState();
      if (!state) return new Response("اتاق پیدا نشد", { status: 404 });
      const role = url.searchParams.get("role") || "friend";
      const key = url.searchParams.get("key") || "";
      if (role === "owner" && key !== state.ownerKey) return new Response("دسترسی غیرمجاز", { status: 403 });
      if (!["owner", "friend"].includes(role)) return new Response("نقش نامعتبر", { status: 400 });
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role });
      const { ownerKey, ...publicState } = state;
      server.send(JSON.stringify({ type: "state", state: publicState }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/action" && request.method === "POST") {
      const state = await this.getState();
      if (!state) return json({ ok: false, error: "این لینک دعوت منقضی شده یا وجود ندارد." }, 404);
      let input;
      try { input = await request.json(); } catch (_) { return json({ ok: false, error: "درخواست نامعتبر است." }, 400); }
      const action = input.action;
      const addEvent = label => {
        state.events.push({ label, at: new Date().toISOString() });
        if (state.events.length > 35) state.events = state.events.slice(-35);
      };

      if (action === "no") {
        if (state.phase !== "question") return json({ ok: false, error: "این مرحله تمام شده است." }, 409);
        if (state.noCount >= 10) return json({ ok: false, error: "به اندازه کافی نه زدی؛ حالا آره رو امتحان کن!" }, 409);
        state.noCount += 1;
        if (state.noCount === 10) addEvent("۱۰ بار نه زده شد؛ آره فعال شد");
        await this.saveState(state);
        const { ownerKey, ...publicState } = state;
        return json({ ok: true, state: publicState });
      }

      if (action === "yes") {
        if (state.phase !== "question") return json({ ok: false, error: "این مرحله تمام شده است." }, 409);
        if (state.noCount < 10) return json({ ok: false, error: "اول باید ده بار نه زده شود." }, 409);
        state.phase = "schedule";
        addEvent("آره انتخاب شد");
        await this.saveState(state);
        const { ownerKey, ...publicState } = state;
        return json({ ok: true, state: publicState });
      }

      if (action === "schedule") {
        if (state.phase !== "schedule") return json({ ok: false, error: "انتخاب زمان در این مرحله ممکن نیست." }, 409);
        if (!VALID_SLOTS.has(input.slot)) return json({ ok: false, error: "زمان انتخابی معتبر نیست." }, 400);
        state.schedule = input.slot;
        state.phase = "complete";
        addEvent(`زمان انتخاب شد: ${SLOT_LABELS[input.slot]}`);
        await this.notifyTelegram(state, "زمان انتخاب شد");
        await this.saveState(state);
        const { ownerKey, ...publicState } = state;
        return json({ ok: true, state: publicState });
      }

      if (action === "exit") {
        if (state.phase === "exited") {
          const { ownerKey, ...publicState } = state;
          return json({ ok: true, state: publicState });
        }
        state.phase = "exited";
        addEvent("دوستت از صفحه خارج شد");
        await this.notifyTelegram(state, state.schedule ? "خروج از صفحه" : "خروج پیش از انتخاب زمان");
        await this.saveState(state);
        const { ownerKey, ...publicState } = state;
        return json({ ok: true, state: publicState });
      }

      return json({ ok: false, error: "این انتخاب شناخته نشد." }, 400);
    }

    return json({ ok: false, error: "مسیر داخلی وجود ندارد." }, 404);
  }

  async notifyTelegram(state, statusLabel) {
    if (state.notified) return;
    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) {
      state.telegramStatus = "not_configured";
      return;
    }
    const scheduleLine = state.schedule ? `زمان انتخابی: ${SLOT_LABELS[state.schedule]}` : "زمان انتخابی: انتخاب نشد";
    const finalChoice = state.noCount >= 10 ? "آره" : "بدون انتخاب آره";
    const message = [
      "🎀 نتیجه‌ی «حرف بزنیم؟»",
      `تعداد کلیک روی نه: ${state.noCount} از ۱۰`,
      `پاسخ نهایی: ${finalChoice}`,
      scheduleLine,
      `وضعیت: ${statusLabel}`
    ].join("\n");
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: this.env.TELEGRAM_CHAT_ID, text: message })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.description || "Telegram sendMessage failed");
      state.notified = true;
      state.telegramStatus = "sent";
    } catch (_) {
      state.telegramStatus = "failed";
    }
  }

  webSocketMessage() {
    // این اتصال فقط برای پخش زنده‌ی تغییر وضعیت است؛ پیام دلخواه از کلاینت پذیرفته نمی‌شود.
  }
  webSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch (_) { /* اتصال بسته شده است */ }
  }
  webSocketError(socket) {
    try { socket.close(1011, "WebSocket error"); } catch (_) { /* نادیده گرفتن خطای اتصال */ }
  }
}
