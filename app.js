/* =====================================================================
   SURVEY MUSIK FAVORIT — app.js
   ---------------------------------------------------------------------
   LANGKAH WAJIB:
   Tempel link Web App dari Apps Script (yang berakhiran /exec) pada
   WEB_APP_URL di bawah ini. Selama belum diisi, halaman berjalan dalam
   mode demo (data contoh, jawaban tidak terkirim).
   ===================================================================== */

const CONFIG = {
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzGZQlSdKyzFNw3bn8zo6mk0E6c28chpTvY-xOgRf9Zlr-1zxy382u8r2thBe_0wrBLGg/exec", // contoh: https://script.google.com/macros/s/AKfycb.../exec
  AUTO_REFRESH_MS: 60000,                    // perbarui hasil otomatis tiap 60 detik (0 = mati)
  REQUEST_TIMEOUT_MS: 25000
};

// Pilihan jawaban — boleh kamu ubah sesuka hati.
const OPTIONS = {
  usia: ["Di bawah 17", "17–24", "25–34", "35–44", "45 ke atas"],
  genre: ["Pop", "Rock", "Hip-hop", "R&B", "EDM", "Jazz", "Indie", "Dangdut", "K-pop", "Metal", "Lo-fi", "Klasik", "Reggae", "Country", "Lainnya"],
  platform: ["Spotify", "YouTube Music", "Apple Music", "JOOX", "YouTube", "TikTok", "Radio", "Lainnya"],
  momen: ["Saat santai", "Belajar atau kerja", "Olahraga", "Di perjalanan", "Saat galau", "Pesta atau kumpul"]
};
const MAX_GENRE = 3;

/* ---------------------------------------------------------------------
   Data contoh untuk mode demo
   --------------------------------------------------------------------- */
const DEMO = {
  ok: true,
  total: 128,
  avgHours: 3.4,
  genres: [
    { name: "Pop", count: 74 }, { name: "Indie", count: 51 }, { name: "Hip-hop", count: 38 },
    { name: "Rock", count: 33 }, { name: "K-pop", count: 27 }, { name: "Lo-fi", count: 21 },
    { name: "Jazz", count: 14 }, { name: "Dangdut", count: 11 }
  ],
  artists: [
    { name: "Tulus", count: 14 }, { name: "Taylor Swift", count: 12 }, { name: "Hindia", count: 9 },
    { name: "NewJeans", count: 8 }, { name: "Coldplay", count: 7 }
  ],
  songs: [
    { name: "Hati-hati di Jalan", count: 6 }, { name: "Cruel Summer", count: 5 }, { name: "Evaluasi", count: 4 },
    { name: "Super Shy", count: 4 }, { name: "Yellow", count: 3 }
  ],
  platforms: [
    { name: "Spotify", count: 71 }, { name: "YouTube Music", count: 28 }, { name: "TikTok", count: 14 },
    { name: "Apple Music", count: 9 }, { name: "JOOX", count: 6 }
  ],
  moments: [
    { name: "Belajar atau kerja", count: 44 }, { name: "Saat santai", count: 39 }, { name: "Di perjalanan", count: 24 },
    { name: "Saat galau", count: 13 }, { name: "Olahraga", count: 8 }
  ],
  ages: [
    { name: "17–24", count: 63 }, { name: "25–34", count: 38 }, { name: "Di bawah 17", count: 14 },
    { name: "35–44", count: 9 }, { name: "45 ke atas", count: 4 }
  ],
  recent: [
    { nama: "Sari", pesan: "Musik itu teman paling setia pas lembur. Playlist lo-fi nggak pernah gagal.", genre: "Lo-fi" },
    { nama: "Bima", pesan: "Konser pertama tahun ini bikin aku makin jatuh cinta sama musik live.", genre: "Rock" },
    { nama: "Anonim", pesan: "Lagu lama yang diputar lagi selalu terasa seperti pulang ke rumah.", genre: "Pop" },
    { nama: "Dewi", pesan: "Tiap pagi mulai dengan satu lagu ceria, harinya jadi lebih enteng.", genre: "K-pop" }
  ]
};

(function () {
  "use strict";

  /* ---------- util ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const fmt = (v, d) => Number(v).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

  function h(tag, props) {
    const n = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const kids = [].concat(arguments[i]);
      kids.forEach((c) => {
        if (c == null || c === false) return;
        n.append(c.nodeType ? c : document.createTextNode(String(c)));
      });
    }
    return n;
  }

  const isConfigured = () => /^https:\/\/script\.google\.com\//i.test(String(CONFIG.WEB_APP_URL || "").trim());

  function apiUrl(params) {
    const base = String(CONFIG.WEB_APP_URL).trim();
    return base + (base.indexOf("?") > -1 ? "&" : "?") + new URLSearchParams(params).toString();
  }

  async function request(url, options) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, Object.assign({ redirect: "follow", signal: ctrl.signal }, options || {}));
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("BAD_JSON");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  function friendlyError(err) {
    if (err && err.name === "AbortError") return "Koneksi terlalu lama. Periksa internetmu lalu coba lagi.";
    if (err && err.message === "BAD_JSON") return "Server tidak membalas dengan benar. Pastikan Web App di-deploy dengan akses \"Anyone\" dan memakai URL berakhiran /exec.";
    if (err instanceof TypeError) return "Tidak bisa terhubung ke server. Periksa internet dan pastikan akses Web App diatur ke \"Anyone\".";
    return (err && err.message) || "Terjadi kesalahan. Coba lagi sebentar lagi.";
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, type) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show" + (type ? " " + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
  }

  /* =====================================================================
     FORM
     ===================================================================== */
  const form = $("#surveyForm");
  let sending = false;
  let attempted = false;

  const RULES = {
    usia: (d) => (d.usia ? "" : "Pilih salah satu rentang usia."),
    genre: (d) => (d.genre.length ? "" : "Pilih minimal 1 genre."),
    artis: (d) => (d.artis ? "" : "Tulis artis atau band favoritmu."),
    lagu: (d) => (d.lagu ? "" : "Tulis judul lagu favoritmu."),
    platform: (d) => (d.platform ? "" : "Pilih platform yang paling sering kamu pakai."),
    momen: (d) => (d.momen ? "" : "Pilih momen favorit untuk mendengarkan musik.")
  };

  function buildChips() {
    $$("[data-chips]").forEach((box) => {
      const name = box.getAttribute("data-chips");
      const multi = box.getAttribute("data-multi") === "true";
      (OPTIONS[name] || []).forEach((label, i) => {
        const id = name + "-" + i;
        const input = h("input", { type: multi ? "checkbox" : "radio", name: name, value: label, id: id });
        box.append(h("label", { class: "chip", for: id }, input, h("span", null, label)));
      });
    });
  }

  function collect() {
    const f = form.elements;
    const val = (n) => String((f[n] && f[n].value) || "").trim();
    return {
      nama: val("nama"),
      usia: val("usia"),
      genre: $$('input[name="genre"]:checked', form).map((i) => i.value),
      artis: val("artis"),
      lagu: val("lagu"),
      platform: val("platform"),
      momen: val("momen"),
      jam: Number(val("jam") || 0),
      pesan: val("pesan"),
      website: val("website")
    };
  }

  function setError(key, msg) {
    const box = $('[data-field="' + key + '"]');
    if (!box) return;
    box.classList.toggle("has-error", !!msg);
    const e = $(".err", box);
    if (e) e.textContent = msg || "";
  }

  function validateAll() {
    const d = collect();
    let first = null;
    Object.keys(RULES).forEach((k) => {
      const msg = RULES[k](d);
      setError(k, msg);
      if (msg && !first) first = k;
    });
    return first;
  }

  function focusField(key) {
    const box = $('[data-field="' + key + '"]');
    if (!box) return;
    box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    const target = $("input,textarea,select", box);
    if (target) setTimeout(() => target.focus({ preventScroll: true }), 350);
  }

  function updateProgress() {
    const d = collect();
    const keys = Object.keys(RULES);
    const done = keys.filter((k) => !RULES[k](d)).length;
    const p = Math.round((done / keys.length) * 100);
    $("#pgFill").style.width = p + "%";
    $("#pgText").textContent = p + "%";
    $("#pgBar").setAttribute("aria-valuenow", String(p));
  }

  function syncGenreLimit() {
    const boxes = $$('input[name="genre"]', form);
    const n = boxes.filter((b) => b.checked).length;
    boxes.forEach((b) => { b.disabled = !b.checked && n >= MAX_GENRE; });
    $("#genreCount").textContent = n + "/" + MAX_GENRE + " dipilih";
  }

  function syncRange() {
    const r = $("#jam");
    const v = Number(r.value);
    const max = Number(r.max) || 12;
    r.style.setProperty("--p", (v / max) * 100 + "%");
    $("#jamOut").textContent = v >= max ? max + "+ jam" : v + " jam";
  }

  function syncCounter() {
    const t = $("#pesan");
    $("#msgCount").textContent = t.value.length + "/" + (t.maxLength > 0 ? t.maxLength : 160);
  }

  function setStatus(msg, type) {
    const s = $("#formStatus");
    s.textContent = msg || "";
    s.className = "form-status" + (type ? " " + type : "");
  }

  function setSending(on) {
    sending = on;
    const b = $("#submitBtn");
    b.disabled = on;
    b.classList.toggle("loading", on);
    $(".btn-label", b).textContent = on ? "Mengirim..." : "Kirim jawaban";
  }

  function resetForm() {
    form.reset();
    attempted = false;
    Object.keys(RULES).forEach((k) => setError(k, ""));
    syncGenreLimit();
    syncRange();
    syncCounter();
    updateProgress();
    setStatus("");
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    if (sending) return;

    attempted = true;
    const first = validateAll();
    if (first) {
      setStatus("Ada pertanyaan yang belum diisi. Lengkapi dulu ya.", "error");
      focusField(first);
      return;
    }

    const data = collect();
    setStatus("");
    setSending(true);

    try {
      if (!isConfigured()) {
        await sleep(900); // simulasi untuk mode demo
        onSuccess(true);
        return;
      }
      const res = await request(String(CONFIG.WEB_APP_URL).trim(), {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data)
      });
      if (!res || !res.ok) throw new Error((res && res.error) || "Server menolak data. Coba lagi.");
      onSuccess(false);
    } catch (err) {
      setStatus(friendlyError(err), "error");
    } finally {
      setSending(false);
    }
  }

  function onSuccess(demo) {
    resetForm();
    openModal(demo);
    confetti();
    if (!demo) setTimeout(() => loadResults({ silent: true }), 900);
  }

  /* ---------- modal ---------- */
  const modal = $("#modal");
  let lastFocus = null;

  function openModal(demo) {
    lastFocus = document.activeElement;
    $("#mText").textContent = demo
      ? "Mode demo: link Web App belum diisi di app.js, jadi jawabanmu belum tersimpan."
      : "Jawabanmu sudah masuk ke spreadsheet. Lihat lagu dan artis apa yang sedang jadi favorit bersama.";
    modal.hidden = false;
    void modal.offsetWidth;
    modal.classList.add("open");
    setTimeout(() => $("#mGo").focus(), 60);
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.classList.remove("open");
    setTimeout(() => { modal.hidden = true; }, 260);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function confetti() {
    if (reduce) return;
    const glyphs = ["♪", "♫", "★", "♬", "●"];
    const colors = ["#f3ff2a", "#ff7fe6", "#ffffff", "#ffb42e", "#2fe38b"];
    const layer = h("div", { class: "confetti", "aria-hidden": "true" });
    for (let i = 0; i < 30; i++) {
      layer.append(h("span", {
        style: "--dx:" + rand(-46, 46).toFixed(1) + "vw;--dy:" + rand(-46, 40).toFixed(1) + "vh;--r:" + rand(-540, 540).toFixed(0) +
          "deg;--s:" + rand(0.9, 2).toFixed(2) + ";color:" + colors[i % colors.length] + ";animation-delay:" + rand(0, 0.18).toFixed(2) + "s"
      }, glyphs[i % glyphs.length]));
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 2400);
  }

  /* =====================================================================
     HASIL SURVEY
     ===================================================================== */
  let lastData = null;
  let loading = false;

  function cardOf(node) { return node.closest(".card, .stat"); }

  function setContent(container, nodes) {
    container.classList.remove("on");
    container.replaceChildren.apply(container, nodes);
    void container.offsetWidth;
    const card = cardOf(container);
    if (!card || card.classList.contains("in")) {
      requestAnimationFrame(() => container.classList.add("on"));
    }
  }

  function emptyState(text) {
    return h("p", { class: "empty" }, text || "Belum ada data. Jadilah yang pertama ikut survey!");
  }

  function renderBars(id, items, total) {
    const box = document.getElementById(id);
    if (!items || !items.length) { setContent(box, [emptyState()]); return; }
    const max = Math.max.apply(null, items.map((i) => i.count).concat(1));
    const rows = items.map((it, i) => {
      const pct = total ? Math.round((it.count / total) * 100) : 0;
      return h("div", { class: "bar-row", title: it.count + " vote" },
        h("span", { class: "bar-label" }, it.name),
        h("div", { class: "btrack" },
          h("div", { class: "fill c" + (i % 5), style: "--w:" + ((it.count / max) * 100).toFixed(1) + "%;--d:" + (i * 0.07).toFixed(2) + "s" })),
        h("span", { class: "bar-val" }, pct + "%"));
    });
    setContent(box, rows);
  }

  function renderRank(id, items) {
    const box = document.getElementById(id);
    if (!items || !items.length) { setContent(box, [emptyState()]); return; }
    const rows = items.map((it, i) =>
      h("div", { class: "rank-item" + (i === 0 ? " top" : ""), style: "--d:" + (i * 0.08).toFixed(2) + "s" },
        h("span", { class: "medal m" + Math.min(i + 1, 4) }, String(i + 1)),
        h("span", { class: "r-name" }, it.name),
        h("span", { class: "r-count" }, it.count + " vote")));
    setContent(box, rows);
  }

  function renderRecent(items) {
    const box = $("#recent");
    if (!items || !items.length) { setContent(box, [emptyState("Belum ada pesan dari responden.")]); return; }
    const tints = ["t0", "t1", "t2", "t3"];
    const rots = [-1.6, 1.2, -0.8, 1.8, -1.2, 0.9];
    const rows = items.map((it, i) =>
      h("figure", { class: "bubble " + tints[i % 4], style: "--r:" + rots[i % rots.length] + "deg;--d:" + (i * 0.09).toFixed(2) + "s" },
        h("blockquote", null, it.pesan),
        h("figcaption", null, it.nama + (it.genre ? " · " + it.genre : ""))));
    setContent(box, rows);
  }

  function setCount(id, value, decimals) {
    const el = document.getElementById(id);
    el.dataset.target = String(value);
    el.dataset.dec = String(decimals || 0);
    const card = cardOf(el);
    if (!card || card.classList.contains("in")) runCount(el);
  }

  function runCount(el) {
    const to = Number(el.dataset.target);
    if (!isFinite(to)) return;
    const dec = Number(el.dataset.dec || 0);
    const from = Number(el._cur || 0);
    cancelAnimationFrame(el._raf);
    if (reduce || from === to) { el._cur = to; el.textContent = fmt(to, dec); return; }
    const dur = 1100;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el._cur = from + (to - from) * e;
      el.textContent = fmt(el._cur, dec);
      if (t < 1) el._raf = requestAnimationFrame(step);
      else { el._cur = to; el.textContent = fmt(to, dec); }
    };
    el._raf = requestAnimationFrame(step);
  }

  function render(data) {
    const total = Number(data.total) || 0;
    setCount("statTotal", total, 0);
    setCount("statAvg", Number(data.avgHours) || 0, 1);
    $("#statTop").textContent = data.genres && data.genres[0] ? data.genres[0].name : "–";

    renderBars("barGenre", data.genres, total);
    renderBars("barPlatform", data.platforms, total);
    renderBars("barMoment", data.moments, total);

    const order = OPTIONS.usia;
    const ages = (data.ages || []).slice().sort((a, b) => {
      const ia = order.indexOf(a.name), ib = order.indexOf(b.name);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    renderBars("barAge", ages, total);

    renderRank("rankArtist", data.artists);
    renderRank("rankSong", data.songs);
    renderRecent(data.recent);
  }

  function showSkeleton() {
    ["barGenre", "barPlatform", "barMoment", "barAge", "rankArtist", "rankSong"].forEach((id) => {
      const box = document.getElementById(id);
      box.classList.remove("on");
      box.replaceChildren.apply(box, [1, 2, 3, 4].map(() => h("div", { class: "sk" })));
    });
  }

  function showNotice(msg, withRetry) {
    const n = $("#resNotice");
    n.replaceChildren();
    n.append(h("span", null, msg));
    if (withRetry) n.append(h("button", { type: "button", class: "btn-mini", onclick: () => loadResults() }, "Coba lagi"));
    n.hidden = false;
  }

  function hideNotice() { $("#resNotice").hidden = true; }

  async function loadResults(opts) {
    const silent = !!(opts && opts.silent);
    if (loading) return;
    loading = true;
    const btn = $("#refreshBtn");
    btn.classList.add("spinning");
    btn.disabled = true;

    try {
      let data;
      if (!isConfigured()) {
        if (!lastData && !silent) showSkeleton();
        await sleep(650);
        data = DEMO;
        showNotice("Mode demo: ini data contoh. Isi WEB_APP_URL di app.js agar hasil asli dari spreadsheet tampil.", false);
      } else {
        if (!lastData && !silent) showSkeleton();
        data = await request(apiUrl({ action: "results", t: Date.now() }));
        if (!data || !data.ok) throw new Error((data && data.error) || "Gagal memuat hasil.");
        hideNotice();
      }
      lastData = data;
      render(data);
      const time = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      $("#updatedAt").textContent = "Diperbarui " + time + (isConfigured() ? "" : " (demo)");
    } catch (err) {
      showNotice(friendlyError(err), true);
      if (!lastData) {
        ["barGenre", "barPlatform", "barMoment", "barAge", "rankArtist", "rankSong", "recent"].forEach((id) => {
          setContent(document.getElementById(id), [emptyState("Data belum bisa dimuat.")]);
        });
      }
      $("#updatedAt").textContent = "Gagal memuat";
    } finally {
      loading = false;
      btn.classList.remove("spinning");
      btn.disabled = false;
    }
  }

  function activate(card) {
    $$("[data-anim]", card).forEach((n) => n.classList.add("on"));
    $$("[data-target]", card).forEach(runCount);
  }

  /* =====================================================================
     INIT
     ===================================================================== */
  function init() {
    buildChips();

    form.addEventListener("submit", onSubmit);
    form.addEventListener("input", (e) => {
      if (e.target.name === "jam") syncRange();
      if (e.target.name === "pesan") syncCounter();
      updateProgress();
      if (attempted) {
        const box = e.target.closest("[data-field]");
        const key = box && box.getAttribute("data-field");
        if (key && RULES[key]) setError(key, RULES[key](collect()));
      }
    });
    form.addEventListener("change", (e) => {
      if (e.target.name === "genre") syncGenreLimit();
      updateProgress();
      if (attempted) {
        const box = e.target.closest("[data-field]");
        const key = box && box.getAttribute("data-field");
        if (key && RULES[key]) setError(key, RULES[key](collect()));
      }
    });

    syncGenreLimit();
    syncRange();
    syncCounter();
    updateProgress();

    if (!isConfigured()) {
      const n = $("#demoNotice");
      if (n) n.hidden = false;
    }

    // modal
    modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]") || e.target.closest("#mGo")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (modal.hidden) return;
      if (e.key === "Escape") closeModal();
      if (e.key === "Tab") {
        const f = $$("a[href],button", modal).filter((x) => !x.disabled);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // hasil
    $("#refreshBtn").addEventListener("click", () => loadResults({ silent: true }));
    document.addEventListener("reveal", (e) => {
      const el = e.target;
      if (el && el.matches && el.matches(".card, .stat")) setTimeout(() => activate(el), reduce ? 0 : 250);
    });
    loadResults();

    if (CONFIG.AUTO_REFRESH_MS > 0) {
      setInterval(() => {
        if (!document.hidden && isConfigured()) loadResults({ silent: true });
      }, CONFIG.AUTO_REFRESH_MS);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
