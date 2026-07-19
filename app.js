// JEL — frontend (vanilla JS, nulla build). Jelöltből jó döntés.
// Megbízás-alapú munkatér: nézetek (Áttekintés / Pozíció / Célpiac / Jelöltek /
// Megkeresések / Ügyfél / Eredmények / Jegyzetek), állandó megbízás-fejléccel.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = {
  projectId: null, project: null, status: null,
  view: "home", homeFilter: "aktiv",
  candFilter: { prio: "", state: "", q: "" },
  orOpen: null,        // megkeresés-szerkesztőben nyitott jelölt
  drawerId: null,      // jelölt-részletpanelben nyitott jelölt
  newEngStep: 0,       // 0 = zárva, 1 = alapadatok, 2 = brief
};

// ── Kliens-oldali megbízás-tár (localStorage) ───────────────────────────
// A szerver STATELESS (Vercel-kompatibilis): nincs szerveroldali lemez, a
// megbízás-állapot a böngészőben él, és minden művelethez elküldjük a body-ban.
// (A technikai adatmodellben a neve "project" — a felületen: Megbízás.)
const LS_KEY = "ric.projects.v1";
const UI_KEY = "ric.ui.v1";

const STATUSES = [
  "Előkészítés", "Kutatás folyamatban", "Megkeresés folyamatban",
  "Interjúk folyamatban", "Várakozik az ügyfélre", "Szüneteltetve",
  "Betöltve", "Lezárva",
];
const STATUS_CLS = {
  "Előkészítés": "", "Kutatás folyamatban": "st-active", "Megkeresés folyamatban": "st-outreach",
  "Interjúk folyamatban": "st-interview", "Várakozik az ügyfélre": "st-wait",
  "Szüneteltetve": "st-wait", "Betöltve": "st-done", "Lezárva": "st-closed",
};
const TIER_LABEL = { A: "A — elsőként keresd meg", B: "B — következő kör", C: "C — figyelőlista", D: "D — most nem javasolt" };
const WORK_MODES = ["", "helyszíni", "hibrid", "távoli"];

function emptyPosition() {
  return { title: "", client: "", location: "", work_mode: "", seniority: "", owner: "", hiring_manager: "", language: "", salary_band: "", due_date: "", priority: "" };
}
function migrate(p) {
  if (!p.position) p.position = { ...emptyPosition(), title: p.name || p.id };
  if (!p.status) p.status = (p.candidates || []).length ? "Kutatás folyamatban" : "Előkészítés";
  if (!p.priority_overrides) p.priority_overrides = {};
  if (p.intake_review === undefined) p.intake_review = null;
  if (!p.outreach_status) p.outreach_status = {};
  if (!p.outreach) p.outreach = {};
  if (!p.attraction) p.attraction = {};
  if (!p.assessments) p.assessments = {};
  if (!p.coach_notes) p.coach_notes = [];
  if (!p.memory) p.memory = [];
  // Régi build: a ranking csupasz tömbként mentődött (guard-mellékhatás) — normalizáljuk.
  if (Array.isArray(p.ranking)) p.ranking = { ranked: p.ranking };
  return p;
}
function lsAll() { try { const a = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); Object.values(a).forEach(migrate); return a; } catch { return {}; } }
function lsSave(p) {
  if (!p || !p.id) return p;
  const all = lsAll();
  p.updated_at = new Date().toISOString();
  all[p.id] = p;
  try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (e) { toast("A böngésző tárhelye megtelt — törölj régi megbízást."); }
  return p;
}
function lsGet(id) { return lsAll()[id] || null; }
function lsListFull() { return Object.values(lsAll()).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")); }
function persist() { if (state.project) lsSave(state.project); }
function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify({ projectId: state.projectId, view: state.view, homeFilter: state.homeFilter })); } catch {} }
function loadUi() { try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}"); } catch { return {}; } }

function emptyProjectJS(id, name) {
  return migrate({
    id, name: name || id,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    brief_raw: "", intake: null, query: null, candidates: [], talent_map: null,
    assessments: {}, ranking: null, attraction: {}, outreach: {}, outreach_status: {},
    baseline_response_rate: null, first_shortlist_at: null,
    pilot: { cooling_days: 7, mono_source_threshold: 0.7 },
    advisory: null, interview: null, coach_notes: [], memory: [], interactions: [],
  });
}

// ── Mező-fallbackok: az új sémanevek mellett a régi mentett adatot is olvassuk ──
const F = {
  clarif: (o) => (o && (o.clarification_points || o.bad_brief_flags)) || [],
  inferred: (o) => (o && (o.inferred_requirements || o.hidden_requirements)) || [],
  summary: (o) => (o && (o.profile_summary || o.seniority_read)) || "",
  signals: (o) => (o && (o.role_relevant_signals || o.fit_signals)) || [],
  qclarify: (o) => (o && (o.questions_to_clarify || o.gaps_to_explore)) || [],
  strength: (o) => (o && (o.key_strength || o.standout)) || "",
  prio: (r) => (r && (r.contact_priority != null ? r.contact_priority : r.pursue_priority)),
  meetPrep: (o) => (o && (o.meeting_preparation || o.seniority_framing)) || "",
  ivSignals: (o) => (o && (o.signals_to_clarify || o.red_flags_to_probe)) || [],
  coachRec: (o) => (o && (o.recommended_approach || o.what_a_senior_would_do)) || "",
};

// ── Segédek ─────────────────────────────────────────────────────────────
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2600);
}
async function api(method, path, body) {
  if (method === "POST" && /^\/api\/project\/[^/]/.test(path) && state.project) {
    body = { ...(body || {}), project: state.project };
  }
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function withLoading(btn, fn) {
  if (!btn) return fn();
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast("Hiba: " + e.message);
    throw e;
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}
function demoTag(o) {
  return o && (o._demo || o._mode === "demo") ? '<span class="demo-tag">MINTA</span>' : "";
}
function aiTag(reviewed) {
  return reviewed
    ? '<span class="ai-status ok">Recruiter által jóváhagyva</span>'
    : '<span class="ai-status">AI-javaslat — még nincs ellenőrizve</span>';
}
function needEngagement() {
  if (!state.projectId) { toast("Nyiss meg egy megbízást."); return false; }
  return true;
}
function daysSince(iso) { if (!iso) return null; const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return isNaN(d) ? null : d; }
function relTime(iso) {
  const d = daysSince(iso);
  if (d == null) return "—";
  if (d <= 0) return "ma";
  if (d === 1) return "tegnap";
  return `${d} napja`;
}
function shorten(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }
function list(items) { return `<ul class="klist">${(items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`; }
function chips(items, cls) { return `<div class="chips">${(items || []).map((i) => `<span class="chip ${cls || ""}">${esc(i)}</span>`).join("")}</div>`; }
function tierLetter(t) { const s = String(t || ""); return s.startsWith("A") ? "A" : s.startsWith("B") ? "B" : s.startsWith("D") ? "D" : "C"; }
function srcLabel(s) {
  return { linkedin: "LinkedIn", github: "GitHub", synthetic: "Mintaadat", web: "Web", blog: "Blog", community: "Közösség", xing: "Xing", stackoverflow: "StackOverflow", social: "Social", "egyéb": "Egyéb" }[s] || (s || "Egyéb");
}
function sentiLabel(s) { return { "pozitív": "pozitív válasz", "semleges": "semleges válasz", "negatív": "negatív válasz" }[s] || s; }
function sentiChip(s) { const m = { "pozitív": "good", "semleges": "warn", "negatív": "bad" }; return `<span class="chip ${m[s] || ""}">${esc(sentiLabel(s))}</span>`; }

// A jelölt effektív prioritása: a recruiter felülbírálata győz az AI-javaslat felett.
function effTier(p, id) {
  const ov = p.priority_overrides && p.priority_overrides[id];
  if (ov) return ov;
  const r = ((p.ranking && p.ranking.ranked) || []).find((x) => x.candidate_id === id);
  return r ? tierLetter(r.tier) : null;
}
function orState(p, id) {
  const st = (p.outreach_status || {})[id] || {};
  return {
    hasAttr: !!(p.attraction || {})[id],
    hasDraft: !!(p.outreach || {})[id],
    reviewed: !!st.reviewed_at,
    sent: !!st.sent_at,
    replied: !!st.replied,
    sentiment: st.sentiment,
  };
}
function candById(p, id) { return ((p && p.candidates) || []).find((c) => c.id === id); }

// A/B prioritású jelöltek munkalistája (a felülbírálatokkal együtt)
function pipelineRows(p) {
  const ranked = (p.ranking && p.ranking.ranked) || [];
  const coolDays = (p.pilot && p.pilot.cooling_days) || 7;
  const rows = [];
  for (const r of ranked) {
    const id = r.candidate_id;
    const tier = effTier(p, id);
    if (tier !== "A" && tier !== "B") continue;
    const cand = candById(p, id) || {};
    const os = orState(p, id);
    rows.push({
      id, cand, tier, priority: F.prio(r),
      reason: F.strength((p.assessments || {})[id]) || shorten(r.rationale, 88),
      ...os,
      touched: daysSince(cand.last_touched),
    });
  }
  rows.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  return { rows, coolDays };
}

// ── Következő teendő (megbízásonként egy kiemelt lépés) ─────────────────
function nextStep(p) {
  if (!p) return null;
  const c = p.candidates || [];
  if (!p.brief_raw && !p.intake) return { view: "pozicio", label: "Illeszd be a briefet, majd futtasd az elemzést", sub: "A megbízás a brief tisztázásával indul", cta: "Pozíció és brief" };
  if (!p.intake) return { view: "pozicio", label: "Brief elemzése", sub: "A brief megvan — kérj javasolt pozíció-összefoglalót", cta: "Pozíció és brief" };
  if (!c.length) {
    if (!p.query) return { view: "celpiac", label: "Keresési terv készítése", sub: "Ez adja a jelöltkutatás alapját", cta: "Célpiac" };
    return { view: "celpiac", label: "Jelöltkutatás indítása", sub: "A keresési terv kész — indíthatod a kutatást", cta: "Célpiac" };
  }
  if (!p.ranking) return { view: "jeloltek", label: "Prioritási javaslat készítése", sub: `${c.length} jelölt vár prioritásra`, cta: "Jelöltek" };
  const newC = c.filter((x) => x.is_new).length;
  if (newC) return { view: "jeloltek", label: `Ellenőrizd a(z) ${newC} új jelöltet`, sub: "Az új találatok még nincsenek átnézve", cta: "Jelöltek" };
  const { rows, coolDays } = pipelineRows(p);
  const blocked = rows.filter((r) => !(r.hasAttr && r.hasDraft));
  if (blocked.length) return { view: "jeloltek", label: `${blocked.length} jelöltnél hiányzik a megközelítési terv vagy az üzenetvázlat`, sub: "A prioritásos jelöltek megkereséséhez ezek kellenek", cta: "Jelöltek" };
  const toReview = rows.filter((r) => r.hasDraft && !r.reviewed && !r.sent);
  if (toReview.length) return { view: "megkeresesek", label: `${toReview.length} üzenetvázlat vár ellenőrzésre`, sub: "Kiküldés előtt hagyd jóvá a vázlatokat", cta: "Megkeresések" };
  const toSend = rows.filter((r) => r.reviewed && !r.sent);
  if (toSend.length) return { view: "megkeresesek", label: `${toSend.length} jóváhagyott üzenetvázlat vár kiküldésre`, sub: "Küldd ki a saját csatornádon, és rögzítsd itt", cta: "Megkeresések" };
  const cooling = rows.filter((r) => r.sent && !r.replied && (r.touched == null || r.touched > coolDays));
  if (cooling.length) return { view: "jeloltek", label: `${cooling.length} jelöltnél régóta nincs lépés — utánkövetés`, sub: `${coolDays}+ napja nincs aktivitás`, cta: "Jelöltek" };
  const awaiting = rows.filter((r) => r.sent && !r.replied);
  if (awaiting.length) return { view: "megkeresesek", label: "Rögzítsd a beérkező válaszokat", sub: `${awaiting.length} kiküldött megkeresésre várunk választ`, cta: "Megkeresések" };
  return { view: "eredmenyek", label: "Nézd át az eredményeket", sub: "Minden folyamatban lévő lépés naprakész", cta: "Eredmények" };
}

// Figyelmet igényel? (nyitóképernyő jelzéshez)
function needsAttention(p) {
  if (!p.ranking) return false;
  const { rows, coolDays } = pipelineRows(p);
  const blocked = rows.filter((r) => !(r.hasAttr && r.hasDraft)).length;
  const cooling = rows.filter((r) => r.hasAttr && !r.replied && (r.touched == null || r.touched > coolDays)).length;
  return blocked > 0 || cooling > 0;
}

// ── STATUS (rendszerállapot) ────────────────────────────────────────────
async function loadStatus() {
  const s = await api("GET", "/api/status");
  state.status = s;
  const live = `<span class="badge ${s.brain ? "badge-live" : "badge-demo"}">${s.brain ? "🟢 AI elérhető" : "🟡 Bemutató mód"}</span>`;
  const src = `<span class="badge ${s.reach_live ? "badge-live" : "badge-demo"}">${s.reach_live ? "🟢 Nyilvános webes források" : "🟡 Mintaadatok"}</span>`;
  $("#badges").innerHTML = live + src;
  $("#badgesTop").innerHTML = live + src;
  $("#modelLine").textContent = `modell: ${s.model} · ${s.knowledge_version}`;
  const sel = $("#sourceSel");
  if (sel && !s.reach_live) sel.value = "synthetic";
}

// ── NÉZET-VÁLTÁS ────────────────────────────────────────────────────────
function showView(v) {
  if (v !== "home" && !state.project) v = "home";
  state.view = v;
  $("#view-home").classList.toggle("active", v === "home");
  $("#workspace").classList.toggle("hidden", v === "home");
  $$(".eng-view").forEach((s) => s.classList.toggle("active", s.id === "view-" + v));
  $$(".step").forEach((s) => s.classList.toggle("active", s.dataset.view === v));
  $("#engNav").classList.toggle("hidden", !state.project);
  if (state.project) {
    $("#engNavLabel").textContent = shorten(state.project.position.title || state.project.name, 26);
  }
  render(v);
  saveUi();
}
function render(v) {
  if (v === "home") return renderHome();
  const p = state.project;
  if (!p) return;
  renderEngHeader(p);
  if (v === "attekintes") renderOverview(p);
  if (v === "pozicio") renderPositionView(p);
  if (v === "celpiac") renderCelpiac(p);
  if (v === "jeloltek") renderCandidatesView(p);
  if (v === "megkeresesek") renderOutreachView(p);
  if (v === "ugyfel") renderClientView(p);
  if (v === "eredmenyek") renderResults(p);
  if (v === "jegyzetek") renderNotes(p);
}
function openEngagement(id, view) {
  const p = lsGet(id);
  if (!p) { toast("A megbízás nem található ebben a böngészőben."); return; }
  state.projectId = id;
  state.project = p;
  state.orOpen = null;
  closeDrawer();
  showView(view || "attekintes");
}
function closeEngagement() {
  state.projectId = null;
  state.project = null;
  closeDrawer();
  showView("home");
}

// ── MEGBÍZÁSOK NYITÓKÉPERNYŐ ────────────────────────────────────────────
const HOME_FILTERS = [
  ["aktiv", "Aktív"], ["figyelem", "Figyelmet igényel"], ["varakozik", "Várakozik"], ["lezart", "Lezárt"], ["mind", "Mind"],
];
function homeFilterFn(key) {
  return (p) => {
    const closed = p.status === "Betöltve" || p.status === "Lezárva";
    if (key === "aktiv") return !closed;
    if (key === "figyelem") return !closed && needsAttention(p);
    if (key === "varakozik") return p.status === "Várakozik az ügyfélre" || p.status === "Szüneteltetve";
    if (key === "lezart") return closed;
    return true;
  };
}
function renderHome() {
  const all = lsListFull();
  $("#engFilters").innerHTML = HOME_FILTERS.map(([k, lbl]) =>
    `<button class="filter-pill ${state.homeFilter === k ? "active" : ""}" data-f="${k}">${lbl}</button>`).join("");
  $$("#engFilters .filter-pill").forEach((b) => (b.onclick = () => { state.homeFilter = b.dataset.f; saveUi(); renderHome(); }));
  renderHomeRail(all);

  const listEl = $("#engList");
  if (!all.length) {
    listEl.innerHTML = `<div class="eng-empty"><h3>Még nincs megbízás</h3><p>Egy megbízás = egy ügyfél egy konkrét pozíciója.</p><button class="btn btn-primary" id="emptyNewBtn">Új megbízás</button></div>`;
    const b = $("#emptyNewBtn"); if (b) b.onclick = () => openNewEngForm();
    renderNewEngForm();
    return;
  }
  const filtered = all.filter(homeFilterFn(state.homeFilter));
  listEl.innerHTML = filtered.length ? `<div class="eng-grid">` + filtered.map((p) => {
    const ns = nextStep(p);
    const attn = needsAttention(p);
    const pg = progressInfo(p);
    const meta2 = [p.position.location, p.position.work_mode, p.position.owner ? "Felelős: " + p.position.owner : ""].filter(Boolean).join(" · ");
    return `<div class="eng-card" data-id="${esc(p.id)}">
      <div class="eng-card-top">
        <div><div class="eng-title">${esc(p.position.title || p.name)}</div><div class="eng-client">${esc(p.position.client || "—")}</div></div>
        <span class="status-chip ${STATUS_CLS[p.status] || ""}">${esc(p.status)}</span>
      </div>
      <div class="pg-mini" title="${pg.done}/${pg.total} mérföldkő kész"><div class="bar"><span style="width:${pg.pct}%"></span></div><span class="d"></span><span class="v">${pg.pct}%</span></div>
      ${meta2 ? `<div class="eng-meta">${esc(meta2)}</div>` : ""}
      ${ns ? `<div class="eng-next"><b>Következő:</b> ${esc(ns.label)}</div>` : ""}
      <div class="eng-card-foot">
        <span>${(p.candidates || []).length} jelölt</span><span>·</span><span>${relTime(p.updated_at)}</span>
        <span class="spacer"></span>
        ${attn ? `<span class="attn-flag">figyelmet igényel</span>` : ""}
      </div>
    </div>`;
  }).join("") + `</div>` : `<div class="eng-empty"><h3>Nincs megbízás ebben a szűrőben</h3><p>Válts szűrőt, vagy hozz létre újat.</p></div>`;
  $$("#engList .eng-card").forEach((r) => (r.onclick = () => openEngagement(r.dataset.id)));
  renderNewEngForm();
}

// Jobb oldali sötét dashboard-oszlop — a nem lezárt megbízások összesített számai.
function renderHomeRail(all) {
  const rail = $("#homeRail"); if (!rail) return;
  const act = all.filter((p) => p.status !== "Betöltve" && p.status !== "Lezárva");
  const sum = act.reduce((a, p) => {
    const s = engStats(p);
    a.cands += s.cands; a.pipeline += s.pipeline; a.sent += s.sent; a.replied += s.replied;
    if (needsAttention(p)) a.attn++;
    return a;
  }, { cands: 0, pipeline: 0, sent: 0, replied: 0, attn: 0 });
  const resp = sum.sent ? Math.round((sum.replied / sum.sent) * 100) + "%" : "—";
  rail.innerHTML = `
    <div class="rail-title">Összkép</div>
    <div class="rail-item"><div class="rail-num">${act.length}</div><div class="rail-lbl">aktív megbízás</div><div class="rail-sub">${all.length - act.length} lezárva / betöltve</div></div>
    <div class="rail-item"><div class="rail-num ${sum.attn ? "coral" : ""}">${sum.attn}</div><div class="rail-lbl">figyelmet igényel</div><div class="rail-sub">hiányzó lépés vagy elakadt jelölt</div></div>
    <div class="rail-item"><div class="rail-num">${sum.cands}</div><div class="rail-lbl">jelölt a merítésben</div><div class="rail-sub">${sum.pipeline} A/B prioritással</div></div>
    <div class="rail-item"><div class="rail-num">${sum.sent}</div><div class="rail-lbl">kiküldött megkeresés</div></div>
    <div class="rail-item"><div class="rail-num mint">${resp}</div><div class="rail-lbl">válaszadási arány</div><div class="rail-sub">${sum.replied}/${sum.sent} rögzített válasz</div></div>`;
}

// Új megbízás — két lépés: 1) alapadatok, 2) brief
function openNewEngForm() { state.newEngStep = 1; renderNewEngForm(); $("#newEngForm").scrollIntoView({ behavior: "smooth", block: "start" }); }
function slugify(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function renderNewEngForm() {
  const box = $("#newEngForm");
  if (!state.newEngStep) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  const d = renderNewEngForm._draft || (renderNewEngForm._draft = { ...emptyPosition(), brief: "" });
  if (state.newEngStep === 1) {
    box.innerHTML = `<div class="new-eng">
      <h3>Új megbízás — 1/2 · Alapadatok</h3>
      <div class="step-note">Egy megbízás = egy ügyfél egy konkrét pozíciója.</div>
      <div class="form-grid">
        <div class="fld"><label>Pozíció neve *</label><input id="ne_title" value="${esc(d.title)}" placeholder="pl. Staff Backend Engineer" /></div>
        <div class="fld"><label>Ügyfél *</label><input id="ne_client" value="${esc(d.client)}" placeholder="pl. Acme Payments" /></div>
        <div class="fld"><label>Helyszín</label><input id="ne_location" value="${esc(d.location)}" placeholder="pl. Budapest" /></div>
        <div class="fld"><label>Munkavégzés</label><select id="ne_work">${WORK_MODES.map((m) => `<option value="${m}" ${d.work_mode === m ? "selected" : ""}>${m || "—"}</option>`).join("")}</select></div>
        <div class="fld"><label>Tapasztalati szint</label><input id="ne_seniority" value="${esc(d.seniority)}" placeholder="pl. Staff / Senior" /></div>
        <div class="fld"><label>Felelős recruiter</label><input id="ne_owner" value="${esc(d.owner)}" placeholder="pl. Zita" /></div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn btn-primary" id="ne_next">Tovább a briefhez</button>
        <button class="btn btn-ghost" id="ne_cancel">Mégse</button>
      </div>
    </div>`;
    // A begépelt érték azonnal a draftba kerül, hogy egy közbeeső újrarender
    // (pl. szűrő-kattintás) ne veszítse el.
    const syncStep1 = () => {
      d.title = $("#ne_title").value.trim();
      d.client = $("#ne_client").value.trim();
      d.location = $("#ne_location").value.trim();
      d.work_mode = $("#ne_work").value;
      d.seniority = $("#ne_seniority").value.trim();
      d.owner = $("#ne_owner").value.trim();
    };
    ["ne_title", "ne_client", "ne_location", "ne_work", "ne_seniority", "ne_owner"].forEach((id) => {
      const inp = $("#" + id);
      if (inp) inp.oninput = syncStep1;
    });
    $("#ne_next").onclick = () => {
      syncStep1();
      if (!d.title) return toast("A pozíció neve kötelező.");
      if (!d.client) return toast("Az ügyfél neve kötelező.");
      state.newEngStep = 2;
      renderNewEngForm();
    };
    $("#ne_cancel").onclick = () => { state.newEngStep = 0; renderNewEngForm._draft = null; renderNewEngForm(); };
  } else {
    box.innerHTML = `<div class="new-eng">
      <h3>Új megbízás — 2/2 · Brief</h3>
      <div class="step-note">${esc(d.title)} · ${esc(d.client)} — illeszd be a hiring manager nyers briefjét (később is megteheted).</div>
      <textarea id="ne_brief" class="brief" placeholder="Illeszd be a nyers briefet ide…">${esc(d.brief)}</textarea>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="ne_create">Megbízás létrehozása</button>
        <button class="btn btn-ghost" id="ne_back">← Vissza</button>
      </div>
    </div>`;
    $("#ne_brief").oninput = () => { d.brief = $("#ne_brief").value; };
    $("#ne_back").onclick = () => { d.brief = $("#ne_brief").value; state.newEngStep = 1; renderNewEngForm(); };
    $("#ne_create").onclick = () => {
      d.brief = $("#ne_brief").value;
      let id = slugify(`${d.client}-${d.title}`) || "megbizas";
      const all = lsAll();
      if (all[id]) { let i = 2; while (all[`${id}-${i}`]) i++; id = `${id}-${i}`; }
      const p = emptyProjectJS(id, `${d.title} · ${d.client}`);
      p.position = { ...emptyPosition(), title: d.title, client: d.client, location: d.location, work_mode: d.work_mode, seniority: d.seniority, owner: d.owner };
      p.brief_raw = d.brief || "";
      lsSave(p);
      state.newEngStep = 0;
      renderNewEngForm._draft = null;
      toast("Megbízás létrehozva.");
      openEngagement(id, d.brief ? "pozicio" : "attekintes");
    };
  }
}

// ── ÁLLANDÓ MEGBÍZÁS-FEJLÉC ─────────────────────────────────────────────
function renderEngHeader(p) {
  const pos = p.position;
  const sub = [pos.client, pos.location, pos.work_mode, pos.seniority ? pos.seniority + " szint" : ""].filter(Boolean).join(" · ");
  const sub2 = [pos.owner ? "Felelős: " + pos.owner : "", "Frissítve: " + relTime(p.updated_at)].filter(Boolean).join(" · ");
  const chipsArr = [
    ...(((p.query || {}).synonyms) || []).slice(0, 2),
    pos.salary_band, pos.language,
  ].filter(Boolean).slice(0, 4);
  // Progress: menta szegmensek futnak be a korall döntési pontba (JEL-motívum).
  const pg = progressInfo(p);
  const pgHtml = `<div class="pg" role="progressbar" aria-valuenow="${pg.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Megbízás előrehaladása">
    <div class="pg-track">${pg.items.map((m, i) =>
      `<span class="pg-seg ${m.done ? "done" : ""}${i === pg.done && pg.done < pg.total ? " cur" : ""}" title="${esc(m.label)}${m.done ? " ✓" : ""}"></span>`).join("")}</div>
    <span class="pg-dot ${pg.pct === 100 ? "full" : ""}"></span>
    <div class="pg-pct">${pg.pct}%<span class="pg-frac">${pg.done}/${pg.total} lépés</span></div>
  </div>`;
  $("#engHeader").innerHTML = `<div class="eng-header">
    <div class="eng-header-top">
      <div>
        <div class="eng-h-title">${esc(pos.title || p.name)}</div>
        <div class="eng-h-sub">${esc(sub || "—")}${sub2 ? " · " + esc(sub2) : ""}</div>
      </div>
      <div class="eng-h-actions">
        <select id="statusSel" title="Státusz módosítása">${STATUSES.map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
        <button class="btn" id="exportBtn" title="Megbízás exportálása JSON-ban">Export</button>
        <button class="btn btn-ghost" id="backBtn">← Megbízások</button>
      </div>
    </div>
    ${pgHtml}
    ${chipsArr.length ? `<div class="eng-chips">${chipsArr.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}
  </div>`;
  $("#statusSel").onchange = async (e) => {
    p.status = e.target.value;
    persist();
    try { await api("POST", `/api/project/${p.id}/meta`, { status: p.status }); } catch {}
    toast("Státusz frissítve.");
    render(state.view);
  };
  $("#exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${p.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Megbízás exportálva.");
  };
  $("#backBtn").onclick = () => closeEngagement();
}

// ── ÁTTEKINTÉS ──────────────────────────────────────────────────────────
const MILESTONES = [
  ["Brief tisztázva", (p) => !!p.intake],
  ["Célpiac összeállítva", (p) => !!(p.query || p.talent_map)],
  ["Jelöltek felkutatva", (p) => (p.candidates || []).length > 0],
  ["Prioritások ellenőrizve", (p) => !!p.ranking],
  ["Megkeresések előkészítve", (p) => Object.keys(p.outreach || {}).length > 0],
  ["Megkeresések kiküldve", (p) => Object.values(p.outreach_status || {}).some((s) => s && s.sent_at)],
  ["Válaszok rögzítve", (p) => Object.values(p.outreach_status || {}).some((s) => s && s.replied)],
];
// Előrehaladás a mérföldkövekből — a fejléc-progress bar és a kártyák mini-sávja is ebből él.
function progressInfo(p) {
  const items = MILESTONES.map(([label, fn]) => ({ label, done: !!fn(p) }));
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, pct: Math.round((done / items.length) * 100) };
}
// Megbízás-szintű alapszámok (dashboard-kártyák + összkép-oszlop)
function engStats(p) {
  const vals = Object.values(p.outreach_status || {});
  const sent = vals.filter((s) => s && s.sent_at).length;
  const replied = vals.filter((s) => s && s.replied).length;
  return {
    cands: (p.candidates || []).length,
    newC: (p.candidates || []).filter((c) => c.is_new).length,
    pipeline: p.ranking ? pipelineRows(p).rows.length : 0,
    sent, replied,
    respRate: sent ? Math.round((replied / sent) * 100) : null,
  };
}
function renderOverview(p) {
  const v = $("#view-attekintes");
  const ns = nextStep(p);
  const ms = MILESTONES.map(([lbl, fn]) => `<span class="ms ${fn(p) ? "done" : ""}">${fn(p) ? "✓" : "○"} ${lbl}</span>`).join("");
  const posSum = p.intake ? shorten(p.intake.reframed_brief, 220) : (p.brief_raw ? shorten(p.brief_raw, 220) : "Még nincs brief.");
  const st = engStats(p);
  v.innerHTML = `
    <div class="next-card">
      <div>
        <div class="next-lbl">Következő teendő</div>
        <div class="next-txt">${esc(ns.label)}</div>
        <div class="next-sub">${esc(ns.sub || "")}</div>
      </div>
      <button class="btn btn-primary" id="nsGo">${esc(ns.cta || "Megnyitás")}</button>
    </div>
    <div class="stat-row">
      <div class="stat-card"><div class="lbl">Jelölt a merítésben</div><div class="num">${st.cands}</div><div class="sub">${st.newC ? st.newC + " új, átnézésre vár" : "nincs átnézetlen új"}</div></div>
      <div class="stat-card mint"><div class="lbl">Folyamatban (A/B)</div><div class="num">${st.pipeline}</div><div class="sub">prioritásos jelölt</div></div>
      <div class="stat-card"><div class="lbl">Kiküldött megkeresés</div><div class="num">${st.sent}</div><div class="sub">${Object.keys(p.outreach || {}).length} vázlatból</div></div>
      <div class="stat-card"><div class="lbl">Válaszadási arány</div><div class="num">${st.respRate == null ? "—" : st.respRate + "%"}</div><div class="sub">${st.replied}/${st.sent} kiküldöttre érkezett válasz</div></div>
    </div>
    <div class="card"><h4>Folyamat</h4><div class="milestones">${ms}</div>
      <div class="kpi-desc" style="margin-top:8px">Nem minden mérföldkő kötelező — bármelyik nézet bármikor megnyitható.</div></div>
    <div class="ov-grid">
      <div class="ov-col">
        <div class="card"><h4>Pozíció röviden ${p.intake ? aiTag(p.intake_review === "approved") : ""}</h4><p>${esc(posSum)}</p>
          <div class="row" style="margin-top:6px"><button class="btn" id="ovToPoz">Pozíció és brief</button></div></div>
        <div id="ovAttention"></div>
      </div>
      <div class="ov-col">
        <div id="ovCoverage"></div>
        <div class="card"><h4>Módszertani segítség</h4>
          <p class="kpi-desc">Írd le, hol tartasz vagy hol akadtál el — javaslatot kapsz a következő lépésre.</p>
          <div class="row"><input id="coachCtx" class="brief-line" placeholder="Mit csináltál / hol akadtál el? (opcionális)" />
          <button id="coachBtn" class="btn">Javaslat kérése</button></div>
          <div id="coachOut" class="out"></div></div>
      </div>
    </div>`;
  $("#nsGo").onclick = () => showView(ns.view);
  $("#ovToPoz").onclick = () => showView("pozicio");
  renderAttentionBlock(p);
  renderCoverage(p);
  const notes = p.coach_notes || [];
  const last = notes[notes.length - 1];
  if (last) renderCoach(last);
  $("#coachBtn").onclick = (e) => withLoading(e.target, async () => {
    const out = await api("POST", `/api/project/${p.id}/coach`, { context: $("#coachCtx").value });
    p.coach_notes = p.coach_notes || [];
    p.coach_notes.push({ ts: new Date().toISOString(), ...out });
    persist();
    renderCoach(out);
  });
}
function renderCoach(o) {
  const out = $("#coachOut"); if (!out) return;
  out.innerHTML = `<div class="card">
    <h4>Javaslat ${demoTag(o)}</h4>
    <p>${esc(F.coachRec(o))}</p>
    ${o.one_lever_now ? `<p><b>Most bevethető:</b> ${esc(o.one_lever_now)}</p>` : ""}
    ${o.skill_focus ? `<p><b>Készség-fókusz:</b> ${esc(o.skill_focus)}</p>` : ""}
    ${o.encouragement ? `<p class="mut">${esc(o.encouragement)}</p>` : ""}</div>`;
}
function renderAttentionBlock(p) {
  const box = $("#ovAttention"); if (!box) return;
  if (!p.ranking) { box.innerHTML = ""; return; }
  const { rows, coolDays } = pipelineRows(p);
  const blockers = rows.map((r) => {
    const need = !r.hasAttr ? { txt: "hiányzik a megközelítési terv", cta: "Terv" }
      : !r.hasDraft ? { txt: "hiányzik az üzenetvázlat", cta: "Vázlat" }
      : (String(r.cand.art14_status || "").includes("pending") ? { txt: "GDPR Art. 14 rendezetlen", cta: "Megnyit" } : null);
    return need ? { ...r, need } : null;
  }).filter(Boolean);
  const cooling = rows.filter((r) => r.hasAttr && !r.replied && (r.touched == null || r.touched > coolDays))
    .sort((a, b) => (b.touched == null ? 9999 : b.touched) - (a.touched == null ? 9999 : a.touched));
  const bHtml = blockers.length ? blockers.slice(0, 8).map((r) => `<div class="stuck-item"><span class="tier-badge tb tier-${r.tier}">${r.tier}</span><span class="stuck-name">${esc(r.cand.name || r.id)}</span><span class="stuck-need">${esc(r.need.txt)}</span><button class="btn stuck-cta" data-id="${r.id}">${r.need.cta}</button></div>`).join("") : `<div class="ov-empty sm">Minden prioritásos jelöltnél megvan a következő lépés.</div>`;
  const cHtml = cooling.length ? cooling.slice(0, 8).map((r) => `<div class="stuck-item"><span class="stuck-days">${r.touched == null ? "—" : r.touched + "n"}</span><span class="stuck-name">${esc(r.cand.name || r.id)}</span><span class="stuck-need">${r.touched == null ? "még nem volt lépés" : "nincs lépés"}</span><button class="btn stuck-cta touch" data-id="${r.id}">Aktivitás rögzítése</button></div>`).join("") : `<div class="ov-empty sm">Minden prioritásos jelöltnél friss az aktivitás.</div>`;
  box.innerHTML = `<div class="stuck-grid">
    <div><div class="ck-sec-head sm"><h3>Hiányzó lépések</h3><span class="ck-sec-note">${blockers.length} jelölt</span></div>${bHtml}</div>
    <div><div class="ck-sec-head sm"><h3>Figyelmet igénylő jelöltek</h3><span class="ck-sec-note">régóta nincs rajtuk lépés</span></div>${cHtml}</div>
  </div>`;
  $$("#ovAttention .stuck-cta").forEach((btn) => (btn.onclick = () => btn.classList.contains("touch") ? touchCand(btn.dataset.id) : openDrawer(btn.dataset.id)));
}
function renderCoverage(p) {
  const box = $("#ovCoverage"); if (!box) return;
  const c = p.candidates || [];
  if (!c.length) { box.innerHTML = ""; return; }
  const dist = {}; c.forEach((x) => { const k = x.source_type || "egyéb"; dist[k] = (dist[k] || 0) + 1; });
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const top = entries[0] || ["—", 0];
  const topShare = c.length ? top[1] / c.length : 0;
  const thr = (p.pilot && p.pilot.mono_source_threshold) || 0.7;
  const mono = topShare >= thr && entries.length <= 2;
  const targets = (p.talent_map && p.talent_map.target_companies && p.talent_map.target_companies.map((t) => t.name)) || (p.query && p.query.target_companies) || [];
  const companies = c.map((x) => (x.current_company || "").toLowerCase()).filter(Boolean);
  const covered = targets.filter((t) => { const key = String(t || "").toLowerCase().replace(/[()]/g, "").slice(0, 7); return key && companies.some((cc) => cc.includes(key)); }).length;
  const blind = Math.max(0, targets.length - covered);
  let callout = "";
  if (mono) callout = `A jelöltek <b>${Math.round(topShare * 100)}%-a egy forrásból</b> jön (${esc(srcLabel(top[0]))}). A többi csatorna kimarad — bővítsd a kutatást más forrással, mielőtt a listából következtetsz.`;
  else if (blind > 0) callout = `<b>${blind} célcég érintetlen</b> a ${targets.length}-ből. Érdemes ezekre is kutatni, mielőtt lezárnád a merítést.`;
  else callout = `A merítés forrás- és cégoldalról kiegyensúlyozott.`;
  const alert = mono || blind > 0;
  const distHtml = entries.map(([k, v]) => `<div class="cov-src"><span class="cov-src-lbl">${esc(srcLabel(k))}</span><span class="cov-bar"><span style="width:${Math.round(v / c.length * 100)}%;background:${k === top[0] && mono ? "var(--bad)" : "var(--accent)"}"></span></span><span class="cov-src-val">${Math.round(v / c.length * 100)}%</span></div>`).join("");
  box.innerHTML = `<div class="cov-card ${alert ? "alert" : ""}">
    <div class="ck-sec-head sm"><h3>Keresési lefedettség</h3>${alert ? `<span class="cov-flag">figyelem</span>` : `<span class="cov-ok">rendben</span>`}</div>
    <div class="cov-block"><div class="cov-label">Forrás-eloszlás</div>${distHtml || "<div class='ov-empty sm'>—</div>"}</div>
    <div class="cov-block"><div class="cov-label">Célcég-lefedettség</div><div class="cov-targets">${covered}/${targets.length} érintve</div></div>
    <div class="cov-callout ${alert ? "alert" : ""}">${callout}</div>
  </div>`;
}
async function touchCand(id) {
  try {
    await api("POST", `/api/project/${state.projectId}/touch`, { candidateId: id });
    const cd = candById(state.project, id); if (cd) cd.last_touched = new Date().toISOString();
    persist();
    render(state.view);
    toast("Aktivitás rögzítve.");
  } catch (e) { toast("Hiba: " + e.message); }
}

// ── POZÍCIÓ ÉS BRIEF ────────────────────────────────────────────────────
const POS_FIELDS = [
  ["title", "Pozíció neve"], ["client", "Ügyfél"], ["location", "Helyszín"],
  ["work_mode", "Munkavégzés"], ["seniority", "Tapasztalati szint"], ["owner", "Felelős recruiter"],
  ["hiring_manager", "Hiring manager"], ["language", "Nyelv"], ["salary_band", "Bérsáv"], ["due_date", "Céldátum"],
];
function renderPositionView(p) {
  $("#briefInput").value = p.brief_raw || "";
  $("#posForm").innerHTML = `<div class="form-grid">` + POS_FIELDS.map(([k, lbl]) => {
    if (k === "work_mode") return `<div class="fld"><label>${lbl}</label><select data-pos="${k}">${WORK_MODES.map((m) => `<option value="${m}" ${p.position[k] === m ? "selected" : ""}>${m || "—"}</option>`).join("")}</select></div>`;
    const type = k === "due_date" ? "date" : "text";
    return `<div class="fld"><label>${lbl}</label><input type="${type}" data-pos="${k}" value="${esc(p.position[k] || "")}" /></div>`;
  }).join("") + `</div>`;
  $$("#posForm [data-pos]").forEach((inp) => (inp.onchange = async () => {
    p.position[inp.dataset.pos] = inp.value.trim();
    p.name = [p.position.title, p.position.client].filter(Boolean).join(" · ") || p.name;
    persist();
    try { await api("POST", `/api/project/${p.id}/meta`, { position: p.position, name: p.name }); } catch {}
    renderEngHeader(p);
  }));
  renderIntake(p);
}
function renderIntake(p) {
  const o = p.intake;
  const out = $("#intakeOut");
  if (!o) { out.innerHTML = `<div class="ov-empty sm">Még nincs elemzés. Illeszd be a briefet, és kattints a „Brief elemzése” gombra.</div>`; return; }
  out.innerHTML = `
    <div class="card">
      <h4>Javasolt pozíció-összefoglaló ${demoTag(o)} ${aiTag(p.intake_review === "approved")}</h4>
      <p class="lead">${esc(o.reframed_brief)}</p>
      ${p.intake_review !== "approved" ? `<div class="row" style="margin-top:8px"><button class="btn" id="intakeApprove">Jóváhagyás</button></div>` : ""}
    </div>
    <div class="card">
      <h4>Elengedhetetlen feltételek</h4>${list(o.must_haves)}
      <h4 style="margin-top:10px">Előnyt jelent</h4>${chips(o.nice_to_haves)}
    </div>
    ${F.clarif(o).length ? `<div class="card"><h4>Tisztázandó pontok</h4>${F.clarif(o).map((f) => `<div class="flag">${esc(f)}</div>`).join("")}</div>` : ""}
    ${F.inferred(o).length ? `<div class="card"><h4>Feltételezett további igények <span class="ev-tag assume">Ellenőrizendő feltételezés</span></h4>${list(F.inferred(o))}</div>` : ""}
    ${(o.search_hypotheses || []).length ? `<div class="card"><h4>Keresési hipotézisek</h4>${list(o.search_hypotheses)}</div>` : ""}
  `;
  const ap = $("#intakeApprove");
  if (ap) ap.onclick = () => { p.intake_review = "approved"; persist(); renderIntake(p); toast("Összefoglaló jóváhagyva."); };
}

// ── CÉLPIAC ─────────────────────────────────────────────────────────────
function renderCelpiac(p) {
  renderQuery(p);
  renderTalent(p);
  $("#discoverNote").innerHTML = p.discover_note ? `<div class="note">${esc(p.discover_note)}</div>` : "";
  if (!p.intake && !p.query) {
    $("#queryOut").innerHTML = `<div class="dep-note"><span>A keresési tervhez előbb elemezd a briefet.</span><button class="btn" id="depToPoz">Pozíció és brief</button></div>`;
    const b = $("#depToPoz"); if (b) b.onclick = () => showView("pozicio");
  }
}
function renderQuery(p) {
  const o = p.query;
  const out = $("#queryOut");
  if (!o) { if (p.intake) out.innerHTML = ""; return; }
  out.innerHTML = `
    <div class="card">
      <h4>Keresési terv ${demoTag(o)}</h4>
      ${(o.target_titles || []).length ? `<h4 style="margin-top:4px">Célpozíciók</h4>${chips(o.target_titles)}` : ""}
      ${(o.target_companies || []).length ? `<h4 style="margin-top:8px">Célcégek</h4>${chips(o.target_companies)}` : ""}
      ${(o.synonyms || []).length ? `<h4 style="margin-top:8px">Kulcs-szinonimák</h4>${chips(o.synonyms)}` : ""}
      <details class="or-why" style="margin-top:10px"><summary>Keresési lekérdezések (részletek)</summary>
        ${(o.boolean_queries || []).map((q) => `<div class="q-plat">${esc(q.platform)}</div><code class="q-code">${esc(q.query)}</code>`).join("")}
        <h4 style="margin-top:8px">Webes kereső-lekérdezések</h4>
        ${(o.firecrawl_search_queries || []).map((q) => `<code class="q-code">${esc(q)}</code>`).join("")}
      </details>
    </div>`;
}
function renderTalent(p) {
  const o = p.talent_map;
  const out = $("#talentOut");
  if (!o) { out.innerHTML = ""; return; }
  out.innerHTML = `<div class="card"><h4>Célpiac-térkép ${demoTag(o)}</h4>
    ${(o.target_companies || []).map((c) => `<div class="rank-body" style="margin-bottom:8px"><span class="rank-name">${esc(c.name)}</span> — ${esc(c.why)} ${chips(c.likely_roles)}</div>`).join("")}
    ${(o.where_they_gather || []).length ? `<h4 style="margin-top:6px">Közösségek, rendezvények</h4>${chips(o.where_they_gather)}` : ""}
  </div>`;
}

// ── JELÖLTEK ────────────────────────────────────────────────────────────
function candStateChips(p, c) {
  const s = orState(p, c.id);
  const bits = [];
  if (c.is_new) bits.push(`<span class="new-chip">Új</span>`);
  if (s.replied) bits.push(sentiChip(s.sentiment));
  else if (s.sent) bits.push(`<span class="chip good">kiküldve</span>`);
  else if (s.hasDraft) bits.push(`<span class="chip">${s.reviewed ? "vázlat jóváhagyva" : "vázlat kész"}</span>`);
  else if (s.hasAttr) bits.push(`<span class="chip warn">nincs vázlat</span>`);
  return bits.join("");
}
function candNext(p, c) {
  const s = orState(p, c.id);
  const t = effTier(p, c.id);
  if (!t) return "prioritás beállítása";
  if (t === "C" || t === "D") return t === "C" ? "figyelőlista" : "most nem javasolt";
  if (!s.hasAttr) return "megközelítési terv készítése";
  if (!s.hasDraft) return "üzenetvázlat készítése";
  if (!s.reviewed && !s.sent) return "vázlat ellenőrzése";
  if (!s.sent) return "kiküldés rögzítése";
  if (!s.replied) return "válaszra vár";
  return "folyamatban";
}
function renderCandidatesView(p) {
  const v = $("#view-jeloltek");
  const c = p.candidates || [];
  if (!c.length) {
    v.innerHTML = `<div class="stage"><div class="stage-head"><h2>Jelöltek</h2></div>
      <div class="dep-note"><span>Még nincs felkutatott jelölt. A jelöltkutatás a Célpiac nézetből indítható.</span><button class="btn btn-primary" id="depToCel">Célpiac</button></div></div>`;
    $("#depToCel").onclick = () => showView("celpiac");
    return;
  }
  const f = state.candFilter;
  const strongCount = (x) => (x.signals || []).filter((s) => s.strength === "erős").length;
  const filtered = c.filter((x) => {
    if (f.q && !`${x.name} ${x.headline} ${x.current_company} ${x.location}`.toLowerCase().includes(f.q)) return false;
    const t = effTier(p, x.id);
    if (f.prio === "none" && t) return false;
    if (f.prio && f.prio !== "none" && t !== f.prio) return false;
    if (f.state) {
      const s = orState(p, x.id);
      if (f.state === "new" && !x.is_new) return false;
      if (f.state === "noplan" && s.hasAttr) return false;
      if (f.state === "nodraft" && (s.hasDraft || !s.hasAttr)) return false;
      if (f.state === "sent" && !s.sent) return false;
      if (f.state === "replied" && !s.replied) return false;
    }
    return true;
  });
  const order = (x) => { const t = effTier(p, x.id); return { A: 0, B: 1, C: 2, D: 3 }[t] ?? 4; };
  filtered.sort((a, b) => order(a) - order(b) || strongCount(b) - strongCount(a));
  const rankNote = p.ranking ? "" : `<div class="dep-note"><span>${c.length} jelölt még prioritás nélkül. A javaslatot te bírálhatod felül.</span><button class="btn btn-primary" id="rankBtn2">Prioritási javaslat készítése</button></div>`;
  v.innerHTML = `<div class="stage">
    <div class="stage-head"><h2>Jelöltek</h2>
      <p class="stage-sub">${c.length} jelölt · a prioritás a lista tulajdonsága — az AI-javaslatot bármikor felülírhatod.</p></div>
    <div class="cand-toolbar">
      ${p.ranking ? `<button class="btn" id="rankBtn">Prioritási javaslat frissítése</button>` : ""}
      <select id="fPrio"><option value="">prioritás: mind</option><option value="A" ${f.prio === "A" ? "selected" : ""}>A</option><option value="B" ${f.prio === "B" ? "selected" : ""}>B</option><option value="C" ${f.prio === "C" ? "selected" : ""}>C</option><option value="D" ${f.prio === "D" ? "selected" : ""}>D</option><option value="none" ${f.prio === "none" ? "selected" : ""}>nincs prioritás</option></select>
      <select id="fState"><option value="">állapot: mind</option><option value="new" ${f.state === "new" ? "selected" : ""}>új</option><option value="noplan" ${f.state === "noplan" ? "selected" : ""}>nincs terv</option><option value="nodraft" ${f.state === "nodraft" ? "selected" : ""}>nincs vázlat</option><option value="sent" ${f.state === "sent" ? "selected" : ""}>kiküldve</option><option value="replied" ${f.state === "replied" ? "selected" : ""}>válaszolt</option></select>
      <span class="mut" style="font-size:12px">${filtered.length}/${c.length} látható</span>
    </div>
    ${rankNote}
    ${p.ranking && p.ranking.note ? `<div class="kpi-desc" style="margin:6px 0 2px">${esc(p.ranking.note)} ${demoTag(p.ranking)}</div>` : ""}
    <div id="candRows" style="margin-top:10px">${filtered.map((x) => {
      const t = effTier(p, x.id);
      const ov = p.priority_overrides[x.id];
      return `<div class="crow tier-${t || "none"}" data-id="${esc(x.id)}">
        <select class="prio-sel" data-id="${esc(x.id)}" title="Prioritás — a recruiter felülbírálhatja">
          <option value="" ${!t ? "selected" : ""}>—</option>
          ${["A", "B", "C", "D"].map((k) => `<option value="${k}" ${t === k ? "selected" : ""}>${k}</option>`).join("")}
        </select>
        <div><div class="crow-name">${esc(x.name)}</div><div class="crow-head">${esc(x.headline || "")}</div></div>
        <div class="crow-meta">${esc(x.current_company || "")}${x.location ? "<br>" + esc(x.location) : ""}</div>
        <div class="crow-meta">${srcLabel(x.source_type)}<br><span class="mut">${strongCount(x)} erős jel</span>${ov ? `<br><span class="mut" style="font-size:10px">kézzel állítva</span>` : ""}</div>
        <div class="crow-state">${candStateChips(p, x)}<div class="mut" style="margin-top:3px">Következő: ${candNext(p, x)}</div></div>
        <button class="btn crow-open" data-id="${esc(x.id)}">Részletek</button>
      </div>`;
    }).join("") || `<div class="ov-empty sm">Nincs a szűrőknek megfelelő jelölt.</div>`}</div>
  </div>`;
  const rb = $("#rankBtn") || $("#rankBtn2");
  if (rb) rb.onclick = (e) => withLoading(e.target, async () => {
    const r = await api("POST", `/api/project/${p.id}/rank`);
    p.ranking = r;
    persist();
    renderCandidatesView(p);
    toast("Prioritási javaslat kész — ellenőrizd és igazítsd, ha kell.");
  });
  $$("#candRows .prio-sel").forEach((sel) => {
    sel.onclick = (e) => e.stopPropagation();
    sel.onchange = (e) => {
      const id = sel.dataset.id;
      if (sel.value) p.priority_overrides[id] = sel.value;
      else delete p.priority_overrides[id];
      persist();
      renderCandidatesView(p);
    };
  });
  $$("#candRows .crow-open").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); openDrawer(b.dataset.id); }));
  $$("#candRows .crow").forEach((r) => (r.onclick = () => openDrawer(r.dataset.id)));
  $$("#fPrio, #fState").forEach((sel) => (sel.onchange = () => {
    state.candFilter.prio = $("#fPrio").value;
    state.candFilter.state = $("#fState").value;
    renderCandidatesView(p);
  }));
}

// ── JELÖLT RÉSZLETES NÉZET (oldalsó panel) ──────────────────────────────
function openDrawer(id) {
  const p = state.project; if (!p) return;
  const c = candById(p, id); if (!c) return;
  state.drawerId = id;
  if (c.is_new) { c.is_new = false; persist(); }
  $("#candDrawer").classList.remove("hidden");
  renderDrawer(p, c);
}
function closeDrawer() { state.drawerId = null; $("#candDrawer").classList.add("hidden"); }
function renderDrawer(p, c) {
  $("#candDrawerTitle").textContent = c.name || c.id;
  const a = (p.assessments || {})[c.id];
  const at = (p.attraction || {})[c.id];
  const o = (p.outreach || {})[c.id];
  const s = orState(p, c.id);
  const t = effTier(p, c.id);
  const body = $("#candDrawerBody");
  body.innerHTML = `
    <div class="d-sec"><h5>Profil</h5>
      <div class="crow-name">${esc(c.name)}</div>
      <div class="crow-head">${esc(c.headline || "")}</div>
      <div class="crow-meta" style="margin-top:4px">${[c.current_company, c.location].filter(Boolean).map(esc).join(" · ")}</div>
      <div class="row" style="margin-top:8px">
        <label style="font-size:12px">Prioritás:</label>
        <select class="prio-sel" id="dPrio"><option value="">—</option>${["A", "B", "C", "D"].map((k) => `<option ${t === k ? "selected" : ""}>${k}</option>`).join("")}</select>
        ${t ? `<span class="chip">${esc(TIER_LABEL[t])}</span>` : ""}
      </div>
    </div>
    <div class="d-sec"><h5>Evidenciák és források <span class="ev-tag fact">Forrással igazolt</span></h5>
      ${(c.signals || []).map((sg) => `<div class="cand-sig"><span class="s">• ${esc(sg.signal)} <span class="chip ${sg.strength === "erős" ? "good" : sg.strength === "gyenge" ? "" : "warn"}">${esc(sg.strength || "")}</span></span></div>`).join("") || "<div class='mut'>Nincs rögzített jel.</div>"}
      <div class="prov" style="margin-top:6px">${c.source_url ? `<a href="${esc(c.source_url)}" target="_blank" rel="noopener">forrás ↗</a> · ` : ""}<span class="art14">Art. 14: ${esc(c.art14_status || "—")}</span> · ${srcLabel(c.source_type)}</div>
    </div>
    <div class="d-sec"><h5>Profil összegzése ${a ? demoTag(a) : ""}</h5>
      ${a ? `
        ${a.fit ? `<span class="chip ${String(a.fit).includes("nem") ? "crit" : a.fit === "erős" ? "good" : "warn"}">illeszkedés: ${esc(a.fit)}</span>` : ""}
        ${a.fit_reason ? `<p style="margin-top:6px">${esc(a.fit_reason)}</p>` : ""}
        ${F.summary(a) ? `<p><b>Összegzés:</b> ${esc(F.summary(a))} <span class="ev-tag inference">Következtetés</span></p>` : ""}
        ${F.strength(a) ? `<p><b>Erősség:</b> ${esc(F.strength(a))}</p>` : ""}
        ${F.qclarify(a).length ? `<h5 style="margin-top:8px">A beszélgetésen tisztázandó</h5>${list(F.qclarify(a))}` : ""}
        ${(a.unknowns || []).length ? `<h5 style="margin-top:8px">Amit nem tudunk</h5>${a.unknowns.map((u) => `<div class="flag">? ${esc(u)}</div>`).join("")}` : ""}`
      : `<button class="btn" id="dAssess">Profil összegzése</button>`}
    </div>
    <div class="d-sec"><h5>Megközelítési terv ${at ? demoTag(at) : ""}</h5>
      ${at ? renderAttractInner(at) : `<button class="btn btn-primary" id="dAttract">Megközelítési terv készítése</button>`}
    </div>
    <div class="d-sec"><h5>Üzenetvázlat</h5>
      ${o ? `<p class="mut" style="font-size:12px">${esc(shorten(o.subject || o.body || "", 90))}</p><button class="btn" id="dToOutreach">Megnyitás a Megkeresésekben</button>`
        : at ? `<button class="btn" id="dDraft">Üzenetvázlat készítése</button>` : `<span class="mut" style="font-size:12px">Üzenetvázlathoz előbb készíts megközelítési tervet.</span>`}
    </div>
    <div class="d-sec"><h5>Aktivitás</h5>
      <div class="crow-meta">Utolsó lépés: ${relTime(c.last_touched)}${s.sent ? " · kiküldve" : ""}${s.replied ? " · " + esc(sentiLabel(s.sentiment)) : ""}</div>
      <div class="row" style="margin-top:8px"><button class="btn" id="dTouch">Aktivitás rögzítése</button></div>
    </div>`;
  $("#dPrio").onchange = (e) => {
    if (e.target.value) p.priority_overrides[c.id] = e.target.value;
    else delete p.priority_overrides[c.id];
    persist();
    renderDrawer(p, c);
    if (state.view === "jeloltek") renderCandidatesView(p);
  };
  const dA = $("#dAssess");
  if (dA) dA.onclick = (e) => withLoading(e.target, async () => {
    const out = await api("POST", `/api/project/${p.id}/assess`, { candidateId: c.id });
    p.assessments = p.assessments || {};
    p.assessments[c.id] = out;
    c.last_touched = new Date().toISOString();
    persist();
    renderDrawer(p, c);
  });
  const dAt = $("#dAttract");
  if (dAt) dAt.onclick = (e) => withLoading(e.target, async () => {
    const out = await api("POST", `/api/project/${p.id}/attract`, { candidateId: c.id });
    p.attraction = p.attraction || {};
    p.attraction[c.id] = out;
    c.last_touched = new Date().toISOString();
    persist();
    renderDrawer(p, c);
  });
  const dD = $("#dDraft");
  if (dD) dD.onclick = (e) => withLoading(e.target, async () => {
    const out = await api("POST", `/api/project/${p.id}/outreach`, { candidateId: c.id });
    p.outreach = p.outreach || {};
    p.outreach[c.id] = out;
    c.last_touched = new Date().toISOString();
    persist();
    state.orOpen = c.id;
    closeDrawer();
    showView("megkeresesek");
  });
  const dTo = $("#dToOutreach");
  if (dTo) dTo.onclick = () => { state.orOpen = c.id; closeDrawer(); showView("megkeresesek"); };
  $("#dTouch").onclick = () => touchCand(c.id).then(() => renderDrawer(p, c));
}
function renderAttractInner(o) {
  const gr = o.grounded_read || {};
  const facts = (gr.known_facts || []).map((f) =>
    `<div class="driver"><div class="driver-h">${esc(f.fact || "")}</div>${f.from_signal ? `<div class="driver-e">🔗 ${esc(f.from_signal)}</div>` : ""}</div>`
  ).join("") || `<div class="mut" style="font-size:12px">Nincs a jelekből visszavezethető tény — ez önmagában jelzés.</div>`;
  const ideas = (o.attraction_ideas || []).slice().sort((a, b) => (a.rank || 9) - (b.rank || 9));
  const best = ideas[0];
  const rest = ideas.slice(1);
  return `
    <h5>Amit tudunk <span class="ev-tag fact">Forrással igazolt</span></h5>${facts}
    ${(gr.unknowns || []).length ? `<h5 style="margin-top:8px">Amit nem tudunk</h5>${gr.unknowns.map((u) => `<div class="flag">? ${esc(u)}</div>`).join("")}` : ""}
    ${gr.confidence ? `<div class="kpi-desc">Bizonyosság: ${esc(gr.confidence)}</div>` : ""}
    <h5 style="margin-top:10px">Megközelítési javaslat <span class="ev-tag assume">Ellenőrizendő feltételezés</span></h5>
    ${best ? `<div class="idea idea-best"><div class="angle">${esc(best.angle || "")}</div>
      ${best.hook ? `<div class="attract-hook">Nyitómondat-ötlet: „${esc(best.hook)}”</div>` : ""}
      ${best.why_might_work ? `<div class="driver-e">Miért működhet: ${esc(best.why_might_work)}</div>` : ""}</div>` : ""}
    ${rest.length ? `<div style="margin-top:6px">${rest.map((i) => `<div class="driver"><div class="driver-h">#${i.rank || "?"} — ${esc(i.angle || "")}</div>${i.why_might_work ? `<div class="driver-e">${esc(i.why_might_work)}</div>` : ""}</div>`).join("")}</div>` : ""}
    ${o.channel ? `<h5 style="margin-top:8px">Csatorna</h5><p style="font-size:12.5px">${esc(o.channel)}</p>` : ""}
    ${o.timing ? `<h5 style="margin-top:6px">Miért lehet időszerű</h5><p style="font-size:12.5px">${esc(o.timing)}</p>` : ""}
    ${(o.risks || []).length ? `<h5 style="margin-top:6px">Kerülendő megközelítések</h5>${o.risks.map((r) => `<div class="flag">${esc(r)}</div>`).join("")}` : ""}
    ${gr._stripped_ungrounded ? `<div class="kpi-desc" style="margin-top:6px">🛡️ ${gr._stripped_ungrounded} nem-visszavezethető állítás automatikusan kiszűrve (evidencia-földelés).</div>` : ""}`;
}

// ── MEGKERESÉSEK ────────────────────────────────────────────────────────
function renderOutreachView(p) {
  const v = $("#view-megkeresesek");
  const ids = new Set([
    ...Object.keys(p.outreach || {}),
    ...Object.keys(p.attraction || {}),
    ...pipelineRows(p).rows.map((r) => r.id),
  ]);
  const rows = [...ids].map((id) => ({ id, cand: candById(p, id), ...orState(p, id) })).filter((r) => r.cand);
  rows.sort((a, b) => (b.hasDraft - a.hasDraft) || (a.sent - b.sent));
  if (!rows.length) {
    v.innerHTML = `<div class="stage"><div class="stage-head"><h2>Megkeresések</h2></div>
      <div class="dep-note"><span>Megkereséshez előbb válassz prioritásos jelöltet, és készíts megközelítési tervet.</span><button class="btn btn-primary" id="depToCand">Jelöltek</button></div></div>`;
    $("#depToCand").onclick = () => showView("jeloltek");
    return;
  }
  v.innerHTML = `<div class="stage">
    <div class="stage-head"><h2>Megkeresések</h2>
      <p class="stage-sub">A rendszer nem küld üzenetet — a vázlatot te ellenőrzöd, a saját csatornádon küldöd, és itt rögzíted az állapotát.</p></div>
    <div id="orRows">${rows.map((r) => {
      const st = [];
      if (r.hasDraft) st.push(`<span class="chip">vázlat kész</span>`);
      if (r.reviewed) st.push(`<span class="chip good">ellenőrizve</span>`);
      if (r.sent) st.push(`<span class="chip good">kiküldve</span>`);
      if (r.replied) st.push(sentiChip(r.sentiment));
      if (!r.hasDraft) st.push(`<span class="chip warn">${r.hasAttr ? "nincs vázlat" : "nincs terv"}</span>`);
      return `<div class="or-row">
        <div><div class="crow-name">${esc(r.cand.name)}</div><div class="crow-head">${esc(r.cand.current_company || "")}</div></div>
        <div class="crow-meta">${esc(((p.outreach || {})[r.id] || {}).channel || shorten(((p.attraction || {})[r.id] || {}).channel || "", 40) || "—")}</div>
        <div class="or-states">${st.join("")}</div>
        <button class="btn ${state.orOpen === r.id ? "btn-primary" : ""}" data-id="${esc(r.id)}">${r.hasDraft ? "Megnyitás" : "Vázlat készítése"}</button>
      </div>`;
    }).join("")}</div>
    <div id="orEditor"></div>
  </div>`;
  $$("#orRows button").forEach((b) => (b.onclick = (e) => {
    const id = b.dataset.id;
    if ((p.outreach || {})[id]) { state.orOpen = id; renderOutreachView(p); }
    else makeDraft(p, id, e.target);
  }));
  if (state.orOpen && (p.outreach || {})[state.orOpen]) renderOrEditor(p, state.orOpen);
}
async function makeDraft(p, id, btn) {
  return withLoading(btn, async () => {
    if (!(p.attraction || {})[id]) {
      const at = await api("POST", `/api/project/${p.id}/attract`, { candidateId: id });
      p.attraction = p.attraction || {};
      p.attraction[id] = at;
    }
    const out = await api("POST", `/api/project/${p.id}/outreach`, { candidateId: id });
    p.outreach = p.outreach || {};
    p.outreach[id] = out;
    const cd = candById(p, id); if (cd) cd.last_touched = new Date().toISOString();
    persist();
    state.orOpen = id;
    renderOutreachView(p);
  });
}
function renderOrEditor(p, id) {
  const o = p.outreach[id];
  const c = candById(p, id) || {};
  const s = orState(p, id);
  const box = $("#orEditor");
  box.innerHTML = `<div class="or-editor">
    <div class="ck-sec-head"><h3>Üzenetvázlat — ${esc(c.name || id)} ${demoTag(o)} ${aiTag(s.reviewed || s.sent)}</h3>
      <span class="ck-sec-note">${esc(o.channel || "")}${o.language ? " · " + esc(o.language) : ""}</span></div>
    <input class="subj" id="orSubj" value="${esc(o.subject || "")}" placeholder="Tárgy" />
    <textarea class="body" id="orBody">${esc(o.body || "")}</textarea>
    ${(o.why_this_works || []).length ? `<details class="or-why"><summary>A javaslat indoklása</summary>${list(o.why_this_works)}</details>` : ""}
    <div class="row" style="margin-top:12px">
      ${!s.reviewed && !s.sent ? `<button class="btn btn-primary" id="orApprove">Jóváhagyva ✓</button>` : ""}
      <button class="btn" id="orCopy">Másolás</button>
      ${!s.sent ? `<button class="btn" id="orSent">Kiküldés rögzítése</button>` : ""}
      ${s.sent && !s.replied ? `<span class="ck-mini-lbl">válasz:</span>
        <button class="ck-mini good" data-s="pozitív">pozitív</button>
        <button class="ck-mini warn" data-s="semleges">semleges</button>
        <button class="ck-mini bad" data-s="negatív">negatív</button>` : ""}
      ${s.sent ? `<button class="btn btn-ghost" id="orReset" title="állapot visszavonása">↺</button>` : ""}
      <button class="btn btn-ghost" id="orArt14">GDPR Art. 14 értesítő</button>
      <button class="btn btn-ghost" id="orClose">Bezárás</button>
    </div>
    <div id="art14Slot"></div>
    <div class="note">A kiküldés a te csatornádon történik (e-mail, LinkedIn) — itt csak az állapotát rögzíted.</div>
  </div>`;
  const save = () => {
    o.subject = $("#orSubj").value;
    o.body = $("#orBody").value;
    o.edited_by_recruiter = true;
    persist();
  };
  $("#orSubj").onchange = save;
  $("#orBody").onchange = save;
  const ap = $("#orApprove");
  if (ap) ap.onclick = async () => {
    save();
    await setOrStatus(p, id, { status: "reviewed" });
    renderOutreachView(p);
    toast("Vázlat jóváhagyva.");
  };
  $("#orCopy").onclick = () => {
    navigator.clipboard.writeText(($("#orSubj").value ? $("#orSubj").value + "\n\n" : "") + $("#orBody").value);
    toast("Vágólapra másolva.");
  };
  const sb = $("#orSent");
  if (sb) sb.onclick = async () => {
    save();
    await setOrStatus(p, id, { status: "sent" });
    renderOutreachView(p);
    toast("Kiküldés rögzítve.");
  };
  $$("#orEditor .ck-mini").forEach((b) => (b.onclick = async () => {
    await setOrStatus(p, id, { sentiment: b.dataset.s });
    renderOutreachView(p);
  }));
  const rs = $("#orReset");
  if (rs) rs.onclick = async () => { await setOrStatus(p, id, { status: "reset" }); renderOutreachView(p); };
  $("#orArt14").onclick = (e) => withLoading(e.target, async () => {
    const a = await api("POST", `/api/project/${p.id}/art14`, { candidateId: id });
    $("#art14Slot").innerHTML = `<div class="mail" style="margin-top:10px"><div class="mail-head"><span class="mail-subj">${esc(a.subject)}</span><span>${esc(a.must_send_within)}</span></div><div class="mail-body">${esc(a.body)}</div></div><div class="note">${esc(a.note)}</div>`;
  });
  $("#orClose").onclick = () => { state.orOpen = null; renderOutreachView(p); };
}
async function setOrStatus(p, id, body) {
  try {
    const r = await api("POST", `/api/project/${p.id}/outreach-status`, { candidateId: id, ...body });
    p.outreach_status = p.outreach_status || {};
    if (r.status) p.outreach_status[id] = r.status; else delete p.outreach_status[id];
    const cd = candById(p, id); if (cd) cd.last_touched = new Date().toISOString();
    persist();
  } catch (e) { toast("Hiba: " + e.message); }
}

// ── ÜGYFÉL ÉS INTERJÚ ───────────────────────────────────────────────────
function renderClientView(p) {
  renderAdvisory(p.advisory);
  renderInterview(p.interview);
}
function renderAdvisory(o) {
  const out = $("#advisoryOut"); if (!out) return;
  if (!o) { out.innerHTML = ""; return; }
  out.innerHTML = `<div class="card"><h4>Egyeztetési javaslatok ${demoTag(o)}</h4>${list(o.talking_points)}
    ${F.meetPrep(o) ? `<h4 style="margin-top:8px">Felkészülés az egyeztetésre</h4><p>${esc(F.meetPrep(o))}</p>` : ""}
    ${(o.watch_outs || []).length ? `<h4 style="margin-top:8px">Kockázatok</h4>${chips(o.watch_outs, "warn")}` : ""}</div>`;
}
function renderInterview(o) {
  const out = $("#interviewOut"); if (!out) return;
  if (!o) { out.innerHTML = ""; return; }
  out.innerHTML = `<div class="card"><h4>Interjúterv ${demoTag(o)}</h4>
    ${(o.competency_questions || []).map((q) => `<div style="margin-bottom:10px"><div class="q-plat">${esc(q.competency)}</div><p style="margin:2px 0"><b>${esc(q.question)}</b></p><div class="driver-e">Erős válasz: ${esc(q.what_good_looks_like)}</div></div>`).join("")}
    ${F.ivSignals(o).length ? `<h4>Tisztázandó jelek</h4>${chips(F.ivSignals(o), "warn")}` : ""}</div>`;
}

// ── EREDMÉNYEK ──────────────────────────────────────────────────────────
function renderResults(p) {
  const v = $("#view-eredmenyek");
  const vals = Object.values(p.outreach_status || {});
  const sent = vals.filter((s) => s && s.sent_at).length;
  const replied = vals.filter((s) => s && s.replied).length;
  const positive = vals.filter((s) => s && s.replied && s.sentiment === "pozitív").length;
  const respRate = sent ? Math.round(replied / sent * 100) : null;
  const posRate = sent ? Math.round(positive / sent * 100) : null;
  const base = p.baseline_response_rate;
  const delta = (respRate != null && base != null) ? respRate - base : null;
  const age = daysSince(p.created_at);
  const shortDays = (p.first_shortlist_at && p.created_at) ? Math.floor((new Date(p.first_shortlist_at) - new Date(p.created_at)) / 86400000) : null;
  const inPipeline = pipelineRows(p).rows.length;
  v.innerHTML = `<div class="stage">
    <div class="stage-head"><h2>Eredmények</h2>
      <p class="stage-sub">A számok a Megkeresések nézetben rögzített kiküldésekből és válaszokból épülnek — a rendszer nem küld semmit, kitalált számot nem mutatunk.</p></div>
    <div class="res-grid">
      <div class="res-card"><div class="res-num">${sent}</div><div class="res-lbl">Kiküldött megkeresés</div><div class="res-sub">${Object.keys(p.outreach || {}).length} vázlatból</div></div>
      <div class="res-card"><div class="res-num acc">${respRate == null ? "—" : respRate + "%"}</div><div class="res-lbl">Válaszadási arány</div><div class="res-sub">${replied}/${sent || 0} kiküldött megkeresésre érkezett válasz</div></div>
      <div class="res-card"><div class="res-num acc">${posRate == null ? "—" : posRate + "%"}</div><div class="res-lbl">Pozitív válaszok aránya</div><div class="res-sub">${positive}/${sent || 0} — a semleges válasz nem számít pozitívnak</div></div>
    </div>
    <div class="res-grid" style="margin-top:16px">
      <div class="res-card"><div class="cov-label">Korábbi kézi válaszarány</div>
        <div class="proof-baseline-row"><input id="resBaseline" class="brief-line" type="number" min="0" max="100" placeholder="%" value="${base == null ? "" : base}" style="max-width:100px"><button class="btn" id="resBaselineSave">Mentés</button></div>
        <div class="kpi-desc">Ehhez méri magát a keresés (önbevallás vagy korábbi ATS-adat).${delta != null ? ` Eltérés most: <b>${delta >= 0 ? "+" : ""}${delta} százalékpont</b>.` : ""}</div>
      </div>
      <div class="res-card"><div class="cov-label">Idő az első shortlistig</div>
        ${shortDays != null ? `<div class="res-num" style="font-size:22px">${shortDays} nap</div><button class="btn btn-ghost" id="resShortClear" style="margin-top:6px">visszavonás</button>`
          : `<div class="res-sub" style="margin-top:4px">A megbízás ${age == null ? "?" : age} napja fut.</div><button class="btn" id="resShortDone" style="margin-top:8px">Shortlist kész — rögzítés</button>`}
      </div>
      <div class="res-card"><div class="res-num">${inPipeline}</div><div class="res-lbl">Folyamatban lévő jelölt</div><div class="res-sub">A/B prioritással</div></div>
    </div>
  </div>`;
  $("#resBaselineSave").onclick = async () => {
    const r = await api("POST", `/api/project/${p.id}/baseline`, { rate: $("#resBaseline").value });
    p.baseline_response_rate = r.baseline_response_rate;
    persist();
    renderResults(p);
    toast("Kiinduló érték mentve.");
  };
  const sd = $("#resShortDone");
  if (sd) sd.onclick = async () => {
    const r = await api("POST", `/api/project/${p.id}/shortlist-done`, {});
    p.first_shortlist_at = r.first_shortlist_at;
    persist();
    renderResults(p);
    toast("Shortlist-idő rögzítve.");
  };
  const sc = $("#resShortClear");
  if (sc) sc.onclick = async () => {
    await api("POST", `/api/project/${p.id}/shortlist-done`, { clear: true });
    p.first_shortlist_at = null;
    persist();
    renderResults(p);
  };
}

// ── JEGYZETEK ───────────────────────────────────────────────────────────
function renderNotes(p) {
  const v = $("#view-jegyzetek");
  const mem = (p.memory || []).slice().reverse();
  const cands = p.candidates || [];
  const f = renderNotes._filter || "";
  const shown = f ? mem.filter((e) => (e.kind || "note") === f) : mem;
  v.innerHTML = `<div class="stage">
    <div class="stage-head"><h2>Jegyzetek</h2>
      <p class="stage-sub">Megbízás- és jelölt-szintű jegyzetek, időrendben.</p></div>
    <div class="row">
      <select id="noteKind"><option value="note">megbízás</option><option value="candidate">jelölt</option></select>
      <select id="noteCand" class="hidden">${cands.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select>
      <input id="noteInput" class="brief-line" placeholder="Jegyzet…" />
      <button id="noteSave" class="btn btn-primary">Mentés</button>
      <select id="noteFilter" style="margin-left:auto"><option value="">minden jegyzet</option><option value="note" ${f === "note" ? "selected" : ""}>megbízás</option><option value="candidate" ${f === "candidate" ? "selected" : ""}>jelölt</option></select>
    </div>
    <div style="margin-top:12px">${shown.map((e) => {
      const cn = e.candidate_id ? (candById(p, e.candidate_id) || {}).name : null;
      return `<div class="note-row"><span class="note-kind">${e.kind === "candidate" ? "jelölt" : "megbízás"}</span>
        <div class="note-body">${cn ? `<b>${esc(cn)}</b> — ` : ""}${esc(e.note)}<div class="note-ts">${esc((e.ts || "").slice(0, 16).replace("T", " "))}</div></div></div>`;
    }).join("") || `<div class="ov-empty sm">Még nincs jegyzet.</div>`}</div>
  </div>`;
  $("#noteKind").onchange = (e) => $("#noteCand").classList.toggle("hidden", e.target.value !== "candidate");
  $("#noteFilter").onchange = (e) => { renderNotes._filter = e.target.value; renderNotes(p); };
  $("#noteSave").onclick = () => {
    const note = $("#noteInput").value.trim();
    if (!note) return;
    const kind = $("#noteKind").value;
    p.memory = p.memory || [];
    p.memory.push({ ts: new Date().toISOString(), kind, candidate_id: kind === "candidate" ? $("#noteCand").value : undefined, note });
    persist();
    renderNotes(p);
    toast("Jegyzet mentve.");
  };
}

// ── STATIKUS GOMBOK (pozíció / célpiac / ügyfél nézetek) ────────────────
$("#intakeBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  p.brief_raw = $("#briefInput").value;
  const out = await api("POST", `/api/project/${p.id}/intake`, { brief: p.brief_raw });
  p.intake = out;
  p.intake_review = null;
  persist();
  renderIntake(p);
  toast("Elemzés kész — ellenőrizd a javaslatot.");
});
$("#queryBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  const q = await api("POST", `/api/project/${p.id}/query`);
  p.query = q;
  persist();
  renderCelpiac(p);
  renderEngHeader(p);
});
$("#talentBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  const t = await api("POST", `/api/project/${p.id}/talent-map`);
  p.talent_map = t;
  persist();
  renderCelpiac(p);
});
$("#discoverBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  const src = $("#sourceSel").value;
  const wantsLive = src !== "synthetic" && state.status && state.status.reach_live;
  if (wantsLive && !(p.query && (p.query.firecrawl_search_queries || []).length)) {
    toast("Az élő kutatáshoz előbb készíts keresési tervet.");
    return;
  }
  const out = await api("POST", `/api/project/${p.id}/discover`, { source: src });
  const existing = p.candidates || [];
  if (!existing.length) {
    p.candidates = out.candidates;
    p.discover_note = out.note;
  } else {
    // Új futtatás nem írja felül a korábbi listát: hozzáadás + jelölés.
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
    const seen = new Set(existing.map((c) => norm(c.name)));
    const ids = new Set(existing.map((c) => c.id));
    let added = 0, dup = 0;
    for (const n of out.candidates || []) {
      if (seen.has(norm(n.name))) { dup++; continue; }
      let id = n.id;
      if (ids.has(id)) { let i = 1; while (ids.has(`${id}-${i}`)) i++; id = `${id}-${i}`; }
      existing.push({ ...n, id, is_new: true });
      ids.add(id);
      seen.add(norm(n.name));
      added++;
    }
    p.candidates = existing;
    p.discover_note = `${out.note} · Új futtatás: ${added} új jelölt hozzáadva, ${dup} már ismert (nem írtuk felül).`;
  }
  p.discover_source = out.source;
  if (p.status === "Előkészítés") p.status = "Kutatás folyamatban";
  persist();
  toast(`${(out.candidates || []).length} találat feldolgozva.`);
  showView("jeloltek");
});
$("#advisoryBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  const a = await api("POST", `/api/project/${p.id}/advisory`);
  p.advisory = a;
  persist();
  renderAdvisory(a);
});
$("#interviewBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  const iv = await api("POST", `/api/project/${p.id}/interview`);
  p.interview = iv;
  persist();
  renderInterview(iv);
});

// ── GLOBÁLIS ────────────────────────────────────────────────────────────
$("#newEngBtn").onclick = () => { if (state.view !== "home") closeEngagement(); openNewEngForm(); };
$("#candDrawerClose").onclick = () => closeDrawer();
$$(".step").forEach((s) => (s.onclick = (e) => {
  e.preventDefault();
  const v = s.dataset.view;
  if (v === "home") { closeEngagement(); return; }
  showView(v);
}));
$("#globalSearch").oninput = (e) => {
  state.candFilter.q = e.target.value.trim().toLowerCase();
  if (state.project && state.view !== "jeloltek") showView("jeloltek");
  else if (state.project) renderCandidatesView(state.project);
};
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && state.project) {
    e.preventDefault();
    $("#globalSearch").focus();
  }
  if (e.key === "Escape") closeDrawer();
});

// Init — a visszatérő felhasználót a legutóbbi állapothoz visszük.
(async () => {
  await loadStatus();
  const ui = loadUi();
  if (ui.homeFilter) state.homeFilter = ui.homeFilter;
  if (ui.projectId && lsGet(ui.projectId)) {
    openEngagement(ui.projectId, ui.view && ui.view !== "home" ? ui.view : "attekintes");
  } else {
    showView("home");
  }
})();
