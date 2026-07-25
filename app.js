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
  openExcluded: false, // a kizárt jelöltek sávja nyitva nyíljon-e
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
  if (p.brief_final === undefined) p.brief_final = null;
  if (!p.exclusions) p.exclusions = {};
  if (!p.exclusions.companies) p.exclusions.companies = [];
  if (!p.exclusions.candidates) p.exclusions.candidates = {};
  if (!p.exclusions.client_aliases) p.exclusions.client_aliases = [];
  if (p.exclusions.allow_alumni === undefined) p.exclusions.allow_alumni = false;
  if (!p.strategy_chat) p.strategy_chat = [];
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
    brief_raw: "", intake: null, brief_final: null, query: null, candidates: [], talent_map: null,
    exclusions: { companies: [], candidates: {}, allow_alumni: false, client_aliases: [] },
    strategy_chat: [],
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

// ── Szerkeszthető lista (chip + törlés + hozzáadás) ─────────────────────
// Mindenhol ez adja a „vegyél hozzá / vegyél el” interakciót: brief-feltételek,
// keresési terv kategóriái, célpiac-térkép elemei.
function chipEditor(id, items, opts) {
  opts = opts || {};
  const label = (v) => (v && typeof v === "object" ? (v.name || v.query || "") : String(v == null ? "" : v));
  const body = (items || []).map((v, i) =>
    `<span class="ed-chip ${opts.cls || ""}">${esc(label(v))}<button class="ed-x" data-i="${i}" title="Eltávolítás" aria-label="Eltávolítás">×</button></span>`).join("");
  return `<div class="ed-list" id="${id}">${body || `<span class="ed-empty">${esc(opts.empty || "— még üres —")}</span>`}
    <span class="ed-add"><input class="ed-in" placeholder="${esc(opts.placeholder || "Új elem… (vesszővel több is)")}" aria-label="${esc(opts.placeholder || "Új elem")}" /><button class="btn ed-plus" title="Hozzáadás">+</button></span></div>`;
}
// onAdd: string[] · onRemove: index. A hívó a végén újrarendereli a nézetet.
function wireChipEditor(id, onAdd, onRemove) {
  const root = $("#" + id);
  if (!root) return;
  $$(".ed-x", root).forEach((b) => (b.onclick = (e) => { e.preventDefault(); onRemove(Number(b.dataset.i)); }));
  const inp = $(".ed-in", root), plus = $(".ed-plus", root);
  const commit = () => {
    const vals = inp.value.split(",").map((s) => s.trim()).filter(Boolean);
    if (!vals.length) return;
    inp.value = "";
    onAdd(vals);
  };
  if (plus) plus.onclick = (e) => { e.preventDefault(); commit(); };
  if (inp) inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } };
}
// A lenyíló blokkok nyitottsága túléli az újrarendert (a szerkesztés közben
// becsukódó panel a leggyakoribb apró bosszúság).
const openDetails = {};
function detailsOpen(id) { return openDetails[id] ? " open" : ""; }
function wireDetails(id) {
  const d = $("#" + id);
  if (d) d.ontoggle = () => { openDetails[id] = d.open; };
}
// Szerkesztés után: mentés, újrarender, és a fókusz visszaáll az input mezőre.
function afterChipEdit(renderFn, p, listId) {
  persist();
  renderFn(p);
  const i = $("#" + listId + " .ed-in");
  if (i) i.focus();
}
// Listaelem-azonosítás (címek, szinonimák, lekérdezések) — a cégnév-specifikus
// normCo-tól külön, mert az utótag-szűrés a szakmai kifejezéseket megcsonkítaná.
function normVal(v) {
  const s = v && typeof v === "object" ? (v.name || v.query || "") : v;
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
function addUnique(arr, vals) {
  let n = 0;
  (vals || []).forEach((v) => { if (!arr.some((x) => normVal(x) === normVal(v))) { arr.push(v); n++; } });
  return n;
}
function srcLabel(s) {
  return { linkedin: "LinkedIn", github: "GitHub", synthetic: "Mintaadat", web: "Web", blog: "Blog", community: "Közösség", xing: "Xing", stackoverflow: "StackOverflow", social: "Social", "egyéb": "Egyéb" }[s] || (s || "Egyéb");
}
function sentiLabel(s) { return { "pozitív": "pozitív válasz", "semleges": "semleges válasz", "negatív": "negatív válasz" }[s] || s; }
function sentiChip(s) { const m = { "pozitív": "good", "semleges": "warn", "negatív": "bad" }; return `<span class="chip ${m[s] || ""}">${esc(sentiLabel(s))}</span>`; }

/* ── KIZÁRÁSI MOTOR (ügyfél saját emberei + off-limits cégek) ────────────
   A hiring manager a saját (volt) munkatársait ismeri — ha ilyen név kerül a
   listára, az egész merítés hitelét viszi. A szabály nem törli a találatot
   (a néma törlés is bizalomvesztés), hanem külön sávra teszi, megindokolja,
   és a recruiter egy kattintással visszahozhatja.                          */
const CO_NOISE = /\b(kft|zrt|bt|nyrt|kkt|rt|ltd|limited|inc|llc|plc|gmbh|ag|sa|nv|bv|oy|ab|as|sp|zoo|co|company|group|holding|technologies|technology|tech|solutions|services|systems|software|labs|digital|international|hungary|magyarorszag|europe)\b/g;
function normCo(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[()\[\]{}.,\/&+'"’`|-]/g, " ").replace(CO_NOISE, " ").replace(/\s+/g, " ").trim();
}
// Két cégnév ugyanazt a céget jelöli-e (token-halmaz alapú, ragok/utótagok nélkül).
function coMatch(a, b) {
  const x = normCo(a), y = normCo(b);
  if (x.length < 3 || y.length < 3) return false;
  if (x === y) return true;
  const tx = x.split(" ").filter((t) => t.length > 2), ty = y.split(" ").filter((t) => t.length > 2);
  if (!tx.length || !ty.length) return false;
  return ty.every((t) => tx.includes(t)) || tx.every((t) => ty.includes(t));
}
function clientNames(p) {
  return [((p.position || {}).client || ""), ...((p.exclusions || {}).client_aliases || [])].filter(Boolean);
}
// null = a merítésben marad. Egyébként { kind, label, detail, soft }.
function exclusionFor(p, c) {
  if (!p || !c) return null;
  const ex = p.exclusions || {};
  const man = (ex.candidates || {})[c.id];
  if (man && man.state === "include") return null;                       // recruiter: mégis vigyük
  if (man && man.state === "exclude") return { kind: "manual", label: "Kézzel kizárva", detail: man.reason || "A recruiter vette ki a merítésből." };
  const cur = c.current_company || "", past = c.past_companies || [];
  for (const cn of clientNames(p)) {
    if (coMatch(cur, cn)) return { kind: "client_current", label: "Az ügyfélnél dolgozik", detail: `Jelenlegi munkahelye: ${cur} — ez az ügyfél (${cn}).` };
  }
  for (const cn of clientNames(p)) {
    for (const pc of past) if (coMatch(pc, cn)) return { kind: "client_alumni", label: "Korábban az ügyfélnél dolgozott", detail: `Volt munkahelye: ${pc} — az ügyfél ismeri.`, soft: true };
  }
  for (const o of ex.companies || []) {
    if (coMatch(cur, o)) return { kind: "offlimits", label: "Off-limits cég", detail: `${cur} szerepel a kizárt cégek között.` };
    for (const pc of past) if (coMatch(pc, o)) return { kind: "offlimits_past", label: "Off-limits cégnél dolgozott", detail: `${pc} szerepel a kizárt cégek között.`, soft: true };
  }
  return null;
}
// A „soft” kizárás (alumni) feloldható egyetlen kapcsolóval a Célpiac nézetben.
function isExcluded(p, c) {
  const e = exclusionFor(p, c);
  if (!e) return false;
  if (e.soft && (p.exclusions || {}).allow_alumni) return false;
  return true;
}
function activeCandidates(p) { return ((p && p.candidates) || []).filter((c) => !isExcluded(p, c)); }
function excludedCandidates(p) { return ((p && p.candidates) || []).filter((c) => isExcluded(p, c)); }
function setCandExclusion(p, id, state, reason) {
  p.exclusions.candidates = p.exclusions.candidates || {};
  if (state) p.exclusions.candidates[id] = { state, reason: reason || "", at: new Date().toISOString() };
  else delete p.exclusions.candidates[id];
  persist();
}

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

/* ── ÁLLAPOT-LÉTRA ───────────────────────────────────────────────────────
   Egyetlen hely mondja meg, hol tart egy jelölt. Korábban ugyanez a létra
   több helyen volt kézzel újraírva, eltérő sorrendben — ebből származott,
   hogy a felület több, egymásnak ellentmondó sorrendet tanított.
   A kulcsok finomak; a felület ezekből durvít oszlopokra.                */
const STAGE_LABEL = {
  kizart: "kizárva a merítésből",
  rangsorolatlan: "prioritás beállítása",
  figyelo: "figyelőlista",
  elvetve: "most nem javasolt",
  nincs_terv: "megközelítési terv készítése",
  nincs_vazlat: "üzenetvázlat készítése",
  jovahagyasra: "vázlat ellenőrzése",
  kuldesre: "kiküldés rögzítése",
  kikuldve: "válaszra vár",
  valaszolt: "folyamatban",
};
// A kizárás mindent megelőz: van A prioritású jelölt, aki az ügyfélnél dolgozik.
function candStage(p, c) {
  if (!c) return "rangsorolatlan";
  if (isExcluded(p, c)) return "kizart";
  const t = effTier(p, c.id);
  if (!t) return "rangsorolatlan";
  if (t === "C") return "figyelo";
  if (t === "D") return "elvetve";
  const s = orState(p, c.id);
  if (!s.hasAttr) return "nincs_terv";
  if (!s.hasDraft) return "nincs_vazlat";
  if (!s.reviewed && !s.sent) return "jovahagyasra";
  if (!s.sent) return "kuldesre";
  if (!s.replied) return "kikuldve";
  return "valaszolt";
}
// Egy jelölt teljes, származtatott sora. Semmit nem tárol — minden mező a
// meglévő projekt-mezőkből számolódik.
function candRow(p, c, ranked) {
  const id = c.id;
  const r = ranked || ((p.ranking && p.ranking.ranked) || []).find((x) => x.candidate_id === id) || {};
  return {
    id, cand: c,
    tier: effTier(p, id),
    stage: candStage(p, c),
    excluded: isExcluded(p, c),
    priority: F.prio(r),
    reason: F.strength((p.assessments || {})[id]) || shorten(r.rationale, 88),
    ...orState(p, id),
    touched: daysSince(c.last_touched),
  };
}
// A tábla öt oszlopa és két sávja. Minden jelölt pontosan egy vödörbe kerül.
const STAGE_BUCKET = {
  kizart: "kizart",
  rangsorolatlan: "rangsorolatlan",
  figyelo: "figyelolista", elvetve: "figyelolista",
  nincs_terv: "elokeszites", nincs_vazlat: "elokeszites",
  jovahagyasra: "jovahagyasra", kuldesre: "jovahagyasra",
  kikuldve: "kikuldve",
  valaszolt: "valaszolt",
};
function boardBuckets(p) {
  const out = { rangsorolatlan: [], elokeszites: [], jovahagyasra: [], kikuldve: [], valaszolt: [], figyelolista: [], kizart: [] };
  for (const c of (p && p.candidates) || []) out[STAGE_BUCKET[candStage(p, c)]].push(candRow(p, c));
  return out;
}

// A/B prioritású jelöltek munkalistája (a felülbírálatokkal együtt).
// A rangsor sorrendjében iterál — a stabil sorrend a lista sajátja.
function pipelineRows(p) {
  const ranked = (p.ranking && p.ranking.ranked) || [];
  const coolDays = (p.pilot && p.pilot.cooling_days) || 7;
  const rows = [];
  for (const r of ranked) {
    const cand = candById(p, r.candidate_id);
    if (!cand) continue;
    const row = candRow(p, cand, r);
    if (row.tier !== "A" && row.tier !== "B") continue;
    if (row.excluded) continue;          // kizárt jelölt nem kerül a munkalistára
    rows.push(row);
  }
  rows.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  return { rows, coolDays };
}

/* ── Következő teendő (megbízásonként egy kiemelt lépés) ─────────────────
   Szabálytábla, nem if-létra: a szabályok sorrendben értékelődnek, az első
   találó nyer. Így egy nézet átnevezése egy mező átírása, nem vezérlési
   szerkezet átszabása.                                                   */
const NEXT_STEP_RULES = [
  { when: (x) => !x.p.brief_raw && !x.p.intake, view: "pozicio", cta: "Pozíció és brief",
    label: () => "Illeszd be a briefet, majd futtasd az elemzést", sub: () => "A megbízás a brief tisztázásával indul" },
  { when: (x) => !x.p.intake, view: "pozicio", cta: "Pozíció és brief",
    label: () => "Brief elemzése", sub: () => "A brief megvan — kérj javasolt pozíció-összefoglalót" },
  { when: (x) => !x.c.length && x.p.intake_review !== "approved", view: "pozicio", cta: "Pozíció és brief",
    label: () => "Véglegesítsd a briefet", sub: () => "Szerkeszd a javaslatot, és hagyd jóvá — erre épül a keresés" },
  { when: (x) => !x.c.length && !x.p.query, view: "celpiac", cta: "Célpiac",
    label: () => "Keresési terv készítése", sub: () => "Ez adja a jelöltkutatás alapját" },
  { when: (x) => !x.c.length, view: "celpiac", cta: "Célpiac",
    label: () => "Jelöltkutatás indítása", sub: () => "A keresési terv kész — indíthatod a kutatást" },
  { when: (x) => !x.p.ranking, view: "jeloltek", cta: "Jelöltek",
    label: (x) => "Prioritási javaslat készítése", sub: (x) => `${x.c.length} jelölt vár prioritásra` },
  { when: (x) => x.newC, view: "jeloltek", cta: "Jelöltek",
    label: (x) => `Ellenőrizd a(z) ${x.newC} új jelöltet`, sub: () => "Az új találatok még nincsenek átnézve" },
  { when: (x) => x.blocked.length, view: "jeloltek", cta: "Jelöltek",
    label: (x) => `${x.blocked.length} jelöltnél hiányzik a megközelítési terv vagy az üzenetvázlat`, sub: () => "A prioritásos jelöltek megkereséséhez ezek kellenek" },
  { when: (x) => x.toReview.length, view: "megkeresesek", cta: "Megkeresések",
    label: (x) => `${x.toReview.length} üzenetvázlat vár ellenőrzésre`, sub: () => "Kiküldés előtt hagyd jóvá a vázlatokat" },
  { when: (x) => x.toSend.length, view: "megkeresesek", cta: "Megkeresések",
    label: (x) => `${x.toSend.length} jóváhagyott üzenetvázlat vár kiküldésre`, sub: () => "Küldd ki a saját csatornádon, és rögzítsd itt" },
  { when: (x) => x.cooling.length, view: "jeloltek", cta: "Jelöltek",
    label: (x) => `${x.cooling.length} jelöltnél régóta nincs lépés — utánkövetés`, sub: (x) => `${x.coolDays}+ napja nincs aktivitás` },
  { when: (x) => x.awaiting.length, view: "megkeresesek", cta: "Megkeresések",
    label: () => "Rögzítsd a beérkező válaszokat", sub: (x) => `${x.awaiting.length} kiküldött megkeresésre várunk választ` },
  { when: () => true, view: "eredmenyek", cta: "Eredmények",
    label: () => "Nézd át az eredményeket", sub: () => "Minden folyamatban lévő lépés naprakész" },
];
function nextStep(p) {
  if (!p) return null;
  const c = activeCandidates(p);
  const { rows, coolDays } = pipelineRows(p);
  const x = {
    p, c, coolDays, rows,
    newC: c.filter((y) => y.is_new).length,
    blocked: rows.filter((r) => !(r.hasAttr && r.hasDraft)),
    toReview: rows.filter((r) => r.hasDraft && !r.reviewed && !r.sent),
    toSend: rows.filter((r) => r.reviewed && !r.sent),
    // FIXME: a cooling feltétele itt (sent && !replied) és a needsAttention-ben
    // (hasAttr && !replied) eltér. Szándékosan nem egységesítjük ebben a
    // lépésben — láthatatlan szemantikai változás lenne.
    cooling: rows.filter((r) => r.sent && !r.replied && (r.touched == null || r.touched > coolDays)),
    awaiting: rows.filter((r) => r.sent && !r.replied),
  };
  const rule = NEXT_STEP_RULES.find((r) => r.when(x));
  return rule ? { view: rule.view, label: rule.label(x), sub: rule.sub(x), cta: rule.cta } : null;
}

// Figyelmet igényel? (nyitóképernyő jelzéshez)
function needsAttention(p) {
  if (!p.ranking) return false;
  const { rows, coolDays } = pipelineRows(p);
  const blocked = rows.filter((r) => !(r.hasAttr && r.hasDraft)).length;
  // FIXME: lásd a nextStep cooling-megjegyzését — a két feltétel eltér.
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
// A böngészőben eltárolt nézetnév túléli a felület átalakítását. Ha egy nézet
// megszűnik vagy átnevezik, a visszatérő látogató enélkül üres munkateret kap.
const VIEWS = ["home", "attekintes", "pozicio", "celpiac", "jeloltek", "megkeresesek", "ugyfel", "eredmenyek", "jegyzetek"];
function showView(v) {
  if (!VIEWS.includes(v)) v = state.project ? "attekintes" : "home";
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
function renderOverview(p) {
  const v = $("#view-attekintes");
  const ns = nextStep(p);
  const ms = MILESTONES.map(([lbl, fn]) => `<span class="ms ${fn(p) ? "done" : ""}">${fn(p) ? "✓" : "○"} ${lbl}</span>`).join("");
  const posSum = p.intake ? shorten(finalBriefText(p), 220) : (p.brief_raw ? shorten(p.brief_raw, 220) : "Még nincs brief.");
  v.innerHTML = `
    <div class="next-card">
      <div>
        <div class="next-lbl">Következő teendő</div>
        <div class="next-txt">${esc(ns.label)}</div>
        <div class="next-sub">${esc(ns.sub || "")}</div>
      </div>
      <button class="btn btn-primary" id="nsGo">${esc(ns.cta || "Megnyitás")}</button>
    </div>
    <div class="card"><h4>Folyamat</h4><div class="milestones">${ms}</div>
      <div class="kpi-desc" style="margin-top:8px">Nem minden mérföldkő kötelező — bármelyik nézet bármikor megnyitható.</div></div>
    <div class="ov-grid">
      <div class="ov-col">
        <div class="card"><h4>${p.intake && p.intake_review === "approved" ? "Véglegesített brief" : "Pozíció röviden"} ${p.intake ? aiTag(p.intake_review === "approved") : ""}</h4><p>${esc(posSum)}</p>
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
  </div>
  ${excludedCandidates(p).length ? `<div class="excl-banner sm"><span><b>${excludedCandidates(p).length} jelölt kizárva a merítésből</b> — az ügyfél jelenlegi vagy volt munkatársai, illetve off-limits cég.</span><button class="btn" id="ovExShow">Megnézem</button></div>` : ""}`;
  $$("#ovAttention .stuck-cta").forEach((btn) => (btn.onclick = () => btn.classList.contains("touch") ? touchCand(btn.dataset.id) : openDrawer(btn.dataset.id)));
  const ovEx = $("#ovExShow");
  if (ovEx) ovEx.onclick = () => { state.openExcluded = true; showView("jeloltek"); };
}
function renderCoverage(p) {
  const box = $("#ovCoverage"); if (!box) return;
  const c = activeCandidates(p);        // a lefedettséget a valódi merítésre mérjük
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
// A véglegesített brief a recruiter tulajdona: az AI-javaslatból indul, de a
// szerkesztett változat az, ami továbbmegy (keresés, megkeresés, ügyfél).
function ensureBriefFinal(p) {
  const o = p.intake || {};
  if (!p.brief_final) {
    p.brief_final = {
      text: o.reframed_brief || "",
      must_haves: [...(o.must_haves || [])],
      nice_to_haves: [...(o.nice_to_haves || [])],
      approved_at: null, edited: false,
    };
  }
  return p.brief_final;
}
function briefIsEdited(p) {
  const b = p.brief_final, o = p.intake || {};
  if (!b) return false;
  return b.text !== (o.reframed_brief || "")
    || (b.must_haves || []).join("|") !== (o.must_haves || []).join("|")
    || (b.nice_to_haves || []).join("|") !== (o.nice_to_haves || []).join("|");
}
function finalBriefText(p) { return (p.brief_final && p.brief_final.text) || (p.intake && p.intake.reframed_brief) || ""; }
// A szerkesztőmező tartalmát minden újrarender előtt visszamentjük.
function syncBriefText(p) {
  const ta = $("#bfText");
  if (ta && p.brief_final) p.brief_final.text = ta.value;
}
function renderIntake(p) {
  const o = p.intake;
  const out = $("#intakeOut");
  if (!o) { out.innerHTML = `<div class="ov-empty sm">Még nincs elemzés. Illeszd be a briefet, és kattints a „Brief elemzése” gombra.</div>`; return; }
  const b = ensureBriefFinal(p);
  const approved = p.intake_review === "approved";
  const edited = briefIsEdited(p);
  out.innerHTML = `
    <div class="card bf-card">
      <h4>Véglegesített brief
        <span class="ai-status ${approved ? "ok" : ""}">${approved ? "Recruiter által véglegesítve" : "Vázlat — még nincs véglegesítve"}</span>
        ${edited ? `<span class="ev-tag inference">szerkesztve</span>` : ""}
      </h4>
      <p class="kpi-desc" style="margin-top:0">Ez a szöveg megy tovább a keresésbe, a megkeresésekbe és az ügyfél-egyeztetésbe. Szerkeszd szabadon, majd véglegesítsd.</p>
      <textarea id="bfText" class="brief bf-text" placeholder="A véglegesített pozíció-összefoglaló…">${esc(b.text)}</textarea>
      <div class="bf-lists">
        <div><div class="cov-label">Elengedhetetlen feltételek</div>${chipEditor("bfMust", b.must_haves, { placeholder: "Új feltétel…" })}</div>
        <div><div class="cov-label">Előnyt jelent</div>${chipEditor("bfNice", b.nice_to_haves, { placeholder: "Új előny…" })}</div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn btn-primary" id="bfApprove">${approved ? "Módosítások mentése" : "Véglegesítés és jóváhagyás"}</button>
        <button class="btn" id="bfCopy">Másolás</button>
        <button class="btn btn-ghost" id="bfReset" title="Az AI eredeti javaslatának visszaállítása">Vissza az AI-javaslathoz</button>
      </div>
      ${approved && b.approved_at ? `<div class="kpi-desc">Véglegesítve: ${esc(String(b.approved_at).slice(0, 16).replace("T", " "))}${edited ? " · a recruiter módosította az AI-javaslatot" : ""}</div>` : ""}
    </div>
    <div class="card">
      <h4>Az AI eredeti javaslata ${demoTag(o)}</h4>
      <p class="lead">${esc(o.reframed_brief)}</p>
      <details class="or-why" style="margin-top:8px"><summary>Eredeti feltétel-listák</summary>
        <h4 style="margin-top:8px">Elengedhetetlen feltételek</h4>${list(o.must_haves)}
        <h4 style="margin-top:10px">Előnyt jelent</h4>${chips(o.nice_to_haves)}
      </details>
    </div>
    ${F.clarif(o).length ? `<div class="card"><h4>Tisztázandó pontok</h4>${F.clarif(o).map((f) => `<div class="flag">${esc(f)}</div>`).join("")}</div>` : ""}
    ${F.inferred(o).length ? `<div class="card"><h4>Feltételezett további igények <span class="ev-tag assume">Ellenőrizendő feltételezés</span></h4>${list(F.inferred(o))}</div>` : ""}
    ${(o.search_hypotheses || []).length ? `<div class="card"><h4>Keresési hipotézisek</h4>${list(o.search_hypotheses)}</div>` : ""}
  `;
  $("#bfText").oninput = () => { b.text = $("#bfText").value; };
  $("#bfText").onchange = () => { b.text = $("#bfText").value; persist(); };
  wireChipEditor("bfMust",
    (vals) => { syncBriefText(p); addUnique(b.must_haves, vals); afterChipEdit(renderIntake, p, "bfMust"); },
    (i) => { syncBriefText(p); b.must_haves.splice(i, 1); afterChipEdit(renderIntake, p, "bfMust"); });
  wireChipEditor("bfNice",
    (vals) => { syncBriefText(p); addUnique(b.nice_to_haves, vals); afterChipEdit(renderIntake, p, "bfNice"); },
    (i) => { syncBriefText(p); b.nice_to_haves.splice(i, 1); afterChipEdit(renderIntake, p, "bfNice"); });
  $("#bfApprove").onclick = () => {
    syncBriefText(p);
    if (!b.text.trim()) return toast("A véglegesített brief nem lehet üres.");
    b.approved_at = new Date().toISOString();
    b.edited = briefIsEdited(p);
    p.intake_review = "approved";
    persist();
    renderIntake(p);
    renderEngHeader(p);
    toast(b.edited ? "Brief véglegesítve a te módosításaiddal." : "Brief véglegesítve.");
  };
  $("#bfCopy").onclick = () => {
    syncBriefText(p);
    const txt = [b.text, "", "Elengedhetetlen: " + (b.must_haves || []).join("; "), "Előnyt jelent: " + (b.nice_to_haves || []).join("; ")].join("\n");
    navigator.clipboard.writeText(txt);
    toast("Véglegesített brief a vágólapon.");
  };
  $("#bfReset").onclick = () => {
    if (!confirm("Biztosan visszaállítod az AI eredeti javaslatát? A kézi módosításaid elvesznek.")) return;
    p.brief_final = null;
    p.intake_review = null;
    ensureBriefFinal(p);
    persist();
    renderIntake(p);
    toast("Visszaállítva az AI-javaslatra.");
  };
}

// ── CÉLPIAC ─────────────────────────────────────────────────────────────
function renderCelpiac(p) {
  renderQuery(p);
  renderExclusions(p);
  renderTalent(p);
  renderStrategyChat(p);
  $("#discoverNote").innerHTML = p.discover_note ? `<div class="note">${esc(p.discover_note)}</div>` : "";
  const qb = $("#queryBtn");
  if (qb) qb.textContent = p.query ? "Keresési terv frissítése" : "Keresési terv készítése";
  const tb = $("#talentBtn");
  if (tb) tb.textContent = p.talent_map ? "Célpiac-térkép frissítése" : "Célpiac-térkép";
  if (!p.intake && !p.query) {
    $("#queryOut").innerHTML = `<div class="dep-note"><span>A keresési tervhez előbb elemezd a briefet.</span><button class="btn" id="depToPoz">Pozíció és brief</button></div>`;
    const b = $("#depToPoz"); if (b) b.onclick = () => showView("pozicio");
  }
}
// A terv minden kategóriája szerkeszthető: hozzáadás és elvétel egyaránt.
function renderQuery(p) {
  const o = p.query;
  const out = $("#queryOut");
  if (!o) { if (p.intake) out.innerHTML = ""; return; }
  const edited = !!o._edited_by_recruiter;
  out.innerHTML = `
    <div class="card">
      <h4>Keresési terv ${demoTag(o)} ${edited ? `<span class="ai-status ok">Recruiter által szerkesztve</span>` : `<span class="ai-status">AI-javaslat — szerkeszthető</span>`}</h4>
      <p class="kpi-desc" style="margin-top:0">A kategóriákhoz bármikor hozzáadhatsz vagy elvehetsz belőlük — a frissítés nem törli a kézi elemeidet.</p>
      <div class="cov-label" style="margin-top:10px">Célpozíciók</div>${chipEditor("qTitles", o.target_titles, { placeholder: "Új célpozíció…" })}
      <div class="cov-label" style="margin-top:12px">Célcégek</div>${chipEditor("qCompanies", o.target_companies, { placeholder: "Új célcég…" })}
      <div class="cov-label" style="margin-top:12px">Kulcs-szinonimák</div>${chipEditor("qSyn", o.synonyms, { placeholder: "Új szinonima…" })}
      <details class="or-why" id="qDetails"${detailsOpen("qDetails")} style="margin-top:12px"><summary>Keresési lekérdezések (szerkeszthető)</summary>
        <div class="cov-label" style="margin-top:8px">Boolean / X-ray lekérdezések</div>
        ${(o.boolean_queries || []).map((q, i) => `<div class="q-row"><div class="q-plat">${esc(q.platform || "egyéb")}</div><textarea class="q-code q-edit" data-qi="${i}" rows="2">${esc(q.query || "")}</textarea><button class="btn ed-x-btn" data-qrm="${i}" title="Lekérdezés törlése">×</button></div>`).join("")
          || `<div class="ed-empty">— még nincs lekérdezés —</div>`}
        <div class="ed-add q-add"><input class="ed-in" id="qBoolNew" placeholder="Új boolean lekérdezés…" /><button class="btn" id="qBoolAdd">+</button></div>
        <div class="cov-label" style="margin-top:14px">Webes kereső-lekérdezések</div>
        ${chipEditor("qWeb", o.firecrawl_search_queries, { placeholder: "Új webes lekérdezés…" })}
      </details>
    </div>`;
  wireDetails("qDetails");
  const touch = () => { o._edited_by_recruiter = true; };
  // Minden kategória ugyanazt a szerződést kapja: hozzáadás + elvétel, és az
  // elvétel emlékezetes (a frissítés nem hozza vissza).
  const wireQ = (id, field) => wireChipEditor(id,
    (v) => { touch(); o[field] = o[field] || []; addUnique(o[field], v); v.forEach((x) => unnoteRemoval(o, field, x)); afterChipEdit(renderCelpiac, p, id); },
    (i) => { touch(); noteRemoval(o, field, (o[field] || [])[i]); o[field].splice(i, 1); afterChipEdit(renderCelpiac, p, id); });
  wireQ("qTitles", "target_titles");
  wireQ("qCompanies", "target_companies");
  wireQ("qSyn", "synonyms");
  wireQ("qWeb", "firecrawl_search_queries");
  $$("#queryOut .q-edit").forEach((ta) => (ta.onchange = () => { touch(); o.boolean_queries[Number(ta.dataset.qi)].query = ta.value; persist(); }));
  $$("#queryOut [data-qrm]").forEach((b) => (b.onclick = () => {
    touch();
    const i = Number(b.dataset.qrm);
    noteRemoval(o, "boolean_queries", (o.boolean_queries[i] || {}).query);
    o.boolean_queries.splice(i, 1);
    persist();
    renderCelpiac(p);
  }));
  const qAdd = $("#qBoolAdd");
  if (qAdd) qAdd.onclick = () => {
    const v = $("#qBoolNew").value.trim();
    if (!v) return;
    touch();
    o.boolean_queries = o.boolean_queries || [];
    o.boolean_queries.push({ platform: "egyéni", query: v });
    persist();
    renderCelpiac(p);
  };
}

// ── Kizárt cégek és jelöltek (off-limits) ───────────────────────────────
function renderExclusions(p) {
  const out = $("#exclOut");
  if (!out) return;
  if (!p.query && !(p.candidates || []).length) { out.innerHTML = ""; return; }
  const ex = p.exclusions;
  const client = (p.position || {}).client;
  const excl = excludedCandidates(p);
  const byKind = {};
  excl.forEach((c) => { const k = (exclusionFor(p, c) || {}).kind || "manual"; byKind[k] = (byKind[k] || 0) + 1; });
  const kindLbl = { client_current: "az ügyfélnél dolgozik", client_alumni: "volt ügyfél-munkatárs", offlimits: "off-limits cég", offlimits_past: "off-limits múlt", manual: "kézzel kizárva" };
  const sum = Object.entries(byKind).map(([k, v]) => `${v} ${kindLbl[k] || k}`).join(" · ");
  out.innerHTML = `
    <div class="card excl-card">
      <h4>Kizárás a merítésből ${excl.length ? `<span class="cov-flag">${excl.length} jelölt kiszűrve</span>` : `<span class="cov-ok">nincs ütközés</span>`}</h4>
      <p class="kpi-desc" style="margin-top:0">${client
        ? `Az ügyfél (<b>${esc(client)}</b>) jelenlegi és volt munkatársai nem kerülnek a jelöltlistára — őket a hiring manager ismeri. A cégnév-egyezés a leányvállalati és rövidített alakokat is felismeri.`
        : `Add meg az ügyfél nevét a <b>Pozíció és brief</b> nézetben, hogy a saját munkatársai automatikusan kimaradjanak.`}</p>
      ${sum ? `<div class="excl-sum">${esc(sum)}</div>` : ""}
      <div class="cov-label" style="margin-top:12px">További kizárt cégek (off-limits)</div>
      ${chipEditor("exCos", ex.companies, { cls: "bad", placeholder: "pl. testvércég, másik ügyfél…", empty: "— nincs további kizárt cég —" })}
      ${(ex.client_aliases || []).length || client ? `<div class="cov-label" style="margin-top:12px">Az ügyfél további cégnevei</div>${chipEditor("exAlias", ex.client_aliases, { placeholder: "pl. leányvállalat neve…", empty: "— nincs megadva —" })}` : ""}
      <label class="excl-toggle"><input type="checkbox" id="exAlumni" ${ex.allow_alumni ? "checked" : ""} />
        <span>A volt ügyfél-munkatársak (alumni) jelenjenek meg a listán — jelöléssel, ha szándékosan visszacsábítanátok valakit</span></label>
      ${excl.length ? `<div class="row" style="margin-top:10px"><button class="btn" id="exShow">Kizárt jelöltek megnyitása (${excl.length})</button></div>` : ""}
    </div>`;
  wireChipEditor("exCos",
    (v) => { addUnique(ex.companies, v); afterChipEdit(renderCelpiac, p, "exCos"); },
    (i) => { ex.companies.splice(i, 1); afterChipEdit(renderCelpiac, p, "exCos"); });
  wireChipEditor("exAlias",
    (v) => { addUnique(ex.client_aliases, v); afterChipEdit(renderCelpiac, p, "exAlias"); },
    (i) => { ex.client_aliases.splice(i, 1); afterChipEdit(renderCelpiac, p, "exAlias"); });
  const al = $("#exAlumni");
  if (al) al.onchange = () => { ex.allow_alumni = al.checked; persist(); renderCelpiac(p); toast(al.checked ? "Az alumni jelöltek megjelennek a listán." : "Az alumni jelöltek kikerültek a listáról."); };
  const sh = $("#exShow");
  if (sh) sh.onclick = () => { state.openExcluded = true; showView("jeloltek"); };
}

function renderTalent(p) {
  const o = p.talent_map;
  const out = $("#talentOut");
  if (!o) { out.innerHTML = ""; return; }
  const edited = !!o._edited_by_recruiter;
  const touch = () => { o._edited_by_recruiter = true; };
  out.innerHTML = `<div class="card"><h4>Célpiac-térkép ${demoTag(o)} ${edited ? `<span class="ai-status ok">Recruiter által szerkesztve</span>` : ""}</h4>
    <div class="cov-label">Célcégek</div>
    ${(o.target_companies || []).map((c, i) => `<div class="tm-row"><div><span class="rank-name">${esc(c.name)}</span>${c.why ? ` — <span class="crow-meta">${esc(c.why)}</span>` : ""}${(c.likely_roles || []).length ? chips(c.likely_roles) : ""}</div><button class="btn ed-x-btn" data-tmrm="${i}" title="Eltávolítás">×</button></div>`).join("")
      || `<div class="ed-empty">— még nincs célcég —</div>`}
    <div class="ed-add q-add"><input class="ed-in" id="tmNewName" placeholder="Célcég neve…" /><input class="ed-in" id="tmNewWhy" placeholder="Miért releváns? (opcionális)" /><button class="btn" id="tmAdd">+</button></div>
    ${(o.competitor_clusters || []).length || true ? `<div class="cov-label" style="margin-top:14px">Versenytárs-klaszterek</div>${chipEditor("tmClusters", o.competitor_clusters, { placeholder: "Új klaszter…" })}` : ""}
    <div class="cov-label" style="margin-top:12px">Közösségek, rendezvények</div>${chipEditor("tmGather", o.where_they_gather, { placeholder: "Új közösség / rendezvény…" })}
  </div>`;
  $$("#talentOut [data-tmrm]").forEach((b) => (b.onclick = () => { touch(); o.target_companies.splice(Number(b.dataset.tmrm), 1); persist(); renderCelpiac(p); }));
  const add = $("#tmAdd");
  if (add) add.onclick = () => {
    const name = $("#tmNewName").value.trim();
    if (!name) return toast("Adj meg cégnevet.");
    touch();
    o.target_companies = o.target_companies || [];
    o.target_companies.push({ name, why: $("#tmNewWhy").value.trim() || "A recruiter vette fel.", likely_roles: [] });
    persist();
    renderCelpiac(p);
  };
  wireChipEditor("tmClusters",
    (v) => { touch(); addUnique(o.competitor_clusters = o.competitor_clusters || [], v); afterChipEdit(renderCelpiac, p, "tmClusters"); },
    (i) => { touch(); o.competitor_clusters.splice(i, 1); afterChipEdit(renderCelpiac, p, "tmClusters"); });
  wireChipEditor("tmGather",
    (v) => { touch(); addUnique(o.where_they_gather = o.where_they_gather || [], v); afterChipEdit(renderCelpiac, p, "tmGather"); },
    (i) => { touch(); o.where_they_gather.splice(i, 1); afterChipEdit(renderCelpiac, p, "tmGather"); });
}

/* ── STRATÉGIA-ASSZISZTENS ───────────────────────────────────────────────
   Szűk hatókörű chat: a rendszer-promptja szerint kizárólag a keresési tervet
   és a célpiac-térképet szerkeszti. Nem „beszélget” — műveleteket hajt végre,
   tételesen visszajelzi őket, és minden lépés visszavonható.               */
const STRAT_QUICK = [
  "Milyen célcégeket javasolsz még?",
  "Adj hozzá a célpozíciókhoz: Backend Architect, Head of Platform",
  "Vedd ki a szinonimák közül az SRE-t",
  "Zárd ki: (az ügyfél leányvállalata)",
  "Készíts célpiac-térképet",
];
function strategyList(p, target, field) {
  if (target === "query") { p.query = p.query || {}; return (p.query[field] = p.query[field] || []); }
  if (target === "map") { p.talent_map = p.talent_map || {}; return (p.talent_map[field] = p.talent_map[field] || []); }
  if (target === "exclusions") { return (p.exclusions[field] = p.exclusions[field] || []); }
  return [];
}
function sameStratVal(a, b) { return normVal(a) === normVal(b); }
/* A kézi TÖRLÉS is szerkesztés: ha a recruiter kivett egy kategóriát, a terv
   frissítése nem hozhatja vissza csendben. Ezt tartja nyilván a _removed. */
function noteRemoval(q, field, value) {
  if (!q) return;
  q._removed = q._removed || {};
  const s = (q._removed[field] = q._removed[field] || []);
  if (!s.some((x) => sameStratVal(x, value))) s.push(normVal(value));
}
function unnoteRemoval(q, field, value) {
  const s = q && q._removed && q._removed[field];
  if (!s) return;
  const i = s.findIndex((x) => sameStratVal(x, value));
  if (i >= 0) s.splice(i, 1);
}
function wasRemoved(q, field, value) {
  const s = q && q._removed && q._removed[field];
  return !!(s && s.some((x) => sameStratVal(x, value)));
}
// invert=true → a művelet visszavonása. "generate" esetén a hívó futtatja az endpointot.
function applyStratAction(p, a, invert) {
  const op = invert ? (a.op === "add" ? "remove" : a.op === "remove" ? "add" : a.op) : a.op;
  if (op === "generate") return invert ? null : a.target;
  const arr = strategyList(p, a.target, a.field);
  if (op === "add") {
    if (!arr.some((x) => sameStratVal(x, a.value))) arr.push(a.value);
    if (a.target === "query") unnoteRemoval(p.query, a.field, a.value);
  } else if (op === "remove") {
    const i = arr.findIndex((x) => sameStratVal(x, a.value));
    if (i >= 0) arr.splice(i, 1);
    if (a.target === "query") noteRemoval(p.query, a.field, a.value);
  }
  if (a.target === "query" && p.query) p.query._edited_by_recruiter = true;
  if (a.target === "map" && p.talent_map) p.talent_map._edited_by_recruiter = true;
  return null;
}
function actionChip(a) {
  const sign = a.op === "remove" ? "−" : a.op === "generate" ? "⟳" : "+";
  const cls = a.op === "remove" ? "rm" : a.op === "generate" ? "gen" : "add";
  return `<span class="chat-act ${cls}">${sign} ${esc(a.label || "")}</span>`;
}
function renderStrategyChat(p) {
  const box = $("#stratChat");
  if (!box) return;
  const keep = $("#chatIn") ? $("#chatIn").value : "";   // a félig begépelt üzenet nem veszhet el
  const log = p.strategy_chat || [];
  box.innerHTML = `<div class="stage">
    <div class="stage-head"><h2>Stratégia-asszisztens</h2>
      <p class="stage-sub">Írd le szövegesen, mit változtasson a keresési terven vagy a célpiac-térképen. Minden módosítás tételes és visszavonható — az asszisztens csak ehhez a két dologhoz nyúlhat.</p></div>
    <details class="or-why" id="sysPromptBox"${detailsOpen("sysPromptBox")}><summary>Rendszer-prompt — mit tud és mit nem</summary>
      <pre class="sys-prompt" id="sysPromptTxt">${esc(p.strategy_system_prompt || "Betöltés…")}</pre></details>
    <div class="chat-log" id="chatLog">${log.length ? log.map((m, i) => {
      if (m.role === "user") return `<div class="chat-msg user">${esc(m.text)}</div>`;
      const acts = (m.actions || []).length ? `<div class="chat-acts">${m.actions.map(actionChip).join("")}</div>` : "";
      // Az alkalmazott javaslat már a művelet-chipek közt van — itt csak a maradék.
      const props = (m.proposals || []).map((x, j) => ({ x, j })).filter((o) => !o.x.applied);
      const propHtml = props.length
        ? `<div class="chat-props">${props.map((o) => `<button class="ck-mini chat-prop" data-mi="${i}" data-pi="${o.j}">+ ${esc(o.x.label)}</button>`).join("")}</div>` : "";
      const undo = (m.actions || []).length && !m.undone
        ? `<button class="btn btn-ghost chat-undo" data-mi="${i}">↺ Visszavonás</button>` : "";
      return `<div class="chat-msg bot${m.undone ? " undone" : ""}"><div>${esc(m.text)}</div>${acts}${propHtml}
        ${m.undone ? `<div class="chat-undone-lbl">visszavonva</div>` : undo}</div>`;
    }).join("") : `<div class="chat-empty">Például: „Adj hozzá a célcégekhez: (nemzetközi PSP D)” · „Vedd ki a célpozíciók közül a Tech Lead-et” · „Milyen szinonimákat javasolsz?”</div>`}</div>
    <div class="chat-quick">${STRAT_QUICK.map((q) => `<button class="ck-mini chat-q">${esc(q)}</button>`).join("")}</div>
    <div class="row" style="margin-top:10px">
      <input id="chatIn" class="brief-line" placeholder="Mit módosítsak a stratégián?" autocomplete="off" />
      <button id="chatSend" class="btn btn-primary">Küldés</button>
      ${log.length ? `<button id="chatClear" class="btn btn-ghost">Előzmény törlése</button>` : ""}
    </div>
  </div>`;
  wireDetails("sysPromptBox");
  if (keep) $("#chatIn").value = keep;
  const logEl = $("#chatLog");
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
  const send = () => {
    const v = $("#chatIn").value.trim();
    if (!v) return;
    $("#chatIn").value = "";
    sendStrategyChat(p, v);
  };
  $("#chatSend").onclick = send;
  $("#chatIn").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } };
  $$("#stratChat .chat-q").forEach((b) => (b.onclick = () => sendStrategyChat(p, b.textContent)));
  $$("#stratChat .chat-undo").forEach((b) => (b.onclick = () => undoStratEntry(p, Number(b.dataset.mi))));
  $$("#stratChat .chat-prop").forEach((b) => (b.onclick = () => applyProposal(p, Number(b.dataset.mi), Number(b.dataset.pi))));
  const cl = $("#chatClear");
  if (cl) cl.onclick = () => { p.strategy_chat = []; persist(); renderCelpiac(p); };
  // A rendszer-prompt a szerverről jön (mint élesben) — első kinyitáskor kérjük le.
  const sp = $("#sysPromptBox");
  const loadSysPrompt = async () => {
    if (!sp || !sp.open || p.strategy_system_prompt) return;
    try {
      const r = await api("POST", `/api/project/${p.id}/strategy-chat`, { message: "" });
      p.strategy_system_prompt = r.system_prompt || "—";
      persist();
      const t = $("#sysPromptTxt");
      if (t) t.textContent = p.strategy_system_prompt;
    } catch (e) { /* a demóban nem blokkoló */ }
  };
  if (sp) { const prev = sp.ontoggle; sp.ontoggle = () => { if (prev) prev(); loadSysPrompt(); }; loadSysPrompt(); }
}
async function sendStrategyChat(p, msg) {
  p.strategy_chat = p.strategy_chat || [];
  p.strategy_chat.push({ role: "user", text: msg, ts: new Date().toISOString() });
  persist();
  renderStrategyChat(p);
  const btn = $("#chatSend");   // az újrarender után kell lekérdezni
  await withLoading(btn, async () => {
    const res = await api("POST", `/api/project/${p.id}/strategy-chat`, { message: msg });
    if (res.system_prompt) p.strategy_system_prompt = res.system_prompt;
    const entry = { role: "assistant", text: res.reply || "", actions: [], proposals: (res.proposals || []).map((x) => ({ ...x, applied: false })), ts: new Date().toISOString() };
    for (const a of res.actions || []) {
      const gen = applyStratAction(p, a, false);
      if (gen === "map") p.talent_map = await api("POST", `/api/project/${p.id}/talent-map`);
      if (gen === "query") { const q = await api("POST", `/api/project/${p.id}/query`); p.query = mergeQueryPlan(p.query, q); }
      entry.actions.push(a);
    }
    p.strategy_chat.push(entry);
    persist();
    renderCelpiac(p);
    if (entry.actions.length) toast(`${entry.actions.length} módosítás alkalmazva a stratégián.`);
  }).catch(() => { renderStrategyChat(p); });
}
function undoStratEntry(p, i) {
  const m = (p.strategy_chat || [])[i];
  if (!m || m.undone) return;
  [...(m.actions || [])].reverse().forEach((a) => applyStratAction(p, a, true));
  (m.proposals || []).forEach((x) => (x.applied = false));
  m.undone = true;
  persist();
  renderCelpiac(p);
  toast("Módosítás visszavonva.");
}
function applyProposal(p, mi, pi) {
  const m = (p.strategy_chat || [])[mi];
  const prop = m && (m.proposals || [])[pi];
  if (!prop || prop.applied) return;
  applyStratAction(p, prop, false);
  prop.applied = true;
  if (m.undone) {
    // Visszavont bejegyzésbe nem írunk vissza — külön, önállóan visszavonható lépés lesz.
    p.strategy_chat.push({ role: "assistant", text: `Alkalmaztam a javaslatot: ${prop.label}`, actions: [prop], proposals: [], ts: new Date().toISOString() });
  } else {
    m.actions = m.actions || [];
    m.actions.push(prop);
  }
  persist();
  renderCelpiac(p);
  toast(`Hozzáadva: ${prop.label}`);
}
// Új AI-javaslat egyesítése a meglévő (kézzel szerkesztett) tervvel:
// a kézi hozzáadások megmaradnak, a kézi törlések nem jönnek vissza.
function mergeQueryPlan(oldQ, newQ) {
  if (!oldQ) return newQ;
  const out = { ...newQ };
  ["target_titles", "target_companies", "synonyms", "firecrawl_search_queries", "exclude_companies"].forEach((k) => {
    out[k] = (newQ[k] || []).filter((v) => !wasRemoved(oldQ, k, v));
    addUnique(out[k], oldQ[k] || []);
  });
  out.boolean_queries = (newQ.boolean_queries || []).filter((q) => !wasRemoved(oldQ, "boolean_queries", q.query));
  (oldQ.boolean_queries || []).forEach((q) => { if (!out.boolean_queries.some((x) => x.query === q.query)) out.boolean_queries.push(q); });
  out._edited_by_recruiter = !!oldQ._edited_by_recruiter;
  out._removed = oldQ._removed;
  return out;
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
// A jelölt következő lépése — az állapot-létra egyetlen címkéje.
function candNext(p, c) { return STAGE_LABEL[candStage(p, c)]; }
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
  const act = activeCandidates(p), exc = excludedCandidates(p);
  const strongCount = (x) => (x.signals || []).filter((s) => s.strength === "erős").length;
  const filtered = act.filter((x) => {
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
  const rankNote = p.ranking ? "" : `<div class="dep-note"><span>${act.length} jelölt még prioritás nélkül. A javaslatot te bírálhatod felül.</span><button class="btn btn-primary" id="rankBtn2">Prioritási javaslat készítése</button></div>`;
  v.innerHTML = `<div class="stage">
    <div class="stage-head"><h2>Jelöltek</h2>
      <p class="stage-sub">${act.length} jelölt a merítésben${exc.length ? ` · ${exc.length} kizárva` : ""} · a prioritás a lista tulajdonsága — az AI-javaslatot bármikor felülírhatod.</p></div>
    ${exc.length ? `<div class="excl-banner"><span><b>${exc.length} jelölt nem került a listára.</b> Az ügyfél jelenlegi vagy volt munkatársai, illetve off-limits cégnél dolgozók — őket a hiring manager ismeri.</span><button class="btn" id="candExShow">Megnézem</button></div>` : ""}
    <div class="cand-toolbar">
      ${p.ranking ? `<button class="btn" id="rankBtn">Prioritási javaslat frissítése</button>` : ""}
      <select id="fPrio"><option value="">prioritás: mind</option><option value="A" ${f.prio === "A" ? "selected" : ""}>A</option><option value="B" ${f.prio === "B" ? "selected" : ""}>B</option><option value="C" ${f.prio === "C" ? "selected" : ""}>C</option><option value="D" ${f.prio === "D" ? "selected" : ""}>D</option><option value="none" ${f.prio === "none" ? "selected" : ""}>nincs prioritás</option></select>
      <select id="fState"><option value="">állapot: mind</option><option value="new" ${f.state === "new" ? "selected" : ""}>új</option><option value="noplan" ${f.state === "noplan" ? "selected" : ""}>nincs terv</option><option value="nodraft" ${f.state === "nodraft" ? "selected" : ""}>nincs vázlat</option><option value="sent" ${f.state === "sent" ? "selected" : ""}>kiküldve</option><option value="replied" ${f.state === "replied" ? "selected" : ""}>válaszolt</option></select>
      <span class="mut" style="font-size:12px">${filtered.length}/${act.length} látható</span>
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
    ${exc.length ? `<details class="excl-details" id="exclDetails" ${state.openExcluded ? "open" : ""}>
      <summary>Kizárva a merítésből (${exc.length}) — indoklással, bármikor visszahozható</summary>
      <div id="exclRows">${exc.map((x) => {
        const e = exclusionFor(p, x) || {};
        return `<div class="crow crow-excl" data-id="${esc(x.id)}">
          <span class="excl-tag">${esc(e.label || "kizárva")}</span>
          <div><div class="crow-name">${esc(x.name)}</div><div class="crow-head">${esc(x.headline || "")}</div></div>
          <div class="crow-meta">${esc(x.current_company || "")}${x.location ? "<br>" + esc(x.location) : ""}</div>
          <div class="crow-meta excl-reason">${esc(e.detail || "")}</div>
          <button class="btn excl-back" data-id="${esc(x.id)}" title="Visszahozás a merítésbe">Mégis bevonom</button>
        </div>`;
      }).join("")}</div>
      <div class="note">A kizárás nem törlés: a találat megmarad, csak nem kerül a munkalistára és a megkeresésekbe. A szabályokat a <b>Célpiac</b> nézetben állíthatod.</div>
    </details>` : ""}
  </div>`;
  if (state.openExcluded) {
    state.openExcluded = false;
    const d0 = $("#exclDetails");
    if (d0) setTimeout(() => d0.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  }
  const exBtn = $("#candExShow");
  if (exBtn) exBtn.onclick = () => {
    const d = $("#exclDetails");
    if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); }
  };
  $$("#exclRows .excl-back").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    setCandExclusion(p, b.dataset.id, "include", "A recruiter szándékosan bevonta.");
    state.openExcluded = true;
    renderCandidatesView(p);
    toast("Jelölt visszahozva a merítésbe.");
  }));
  $$("#exclRows .crow-excl").forEach((r) => (r.onclick = () => openDrawer(r.dataset.id)));
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
  const exc = exclusionFor(p, c);
  const man = (p.exclusions.candidates || {})[c.id];
  body.innerHTML = `
    ${exc ? `<div class="excl-banner d"><div><b>${esc(exc.label)}</b><div class="crow-meta">${esc(exc.detail || "")}</div></div>
      <button class="btn" id="dExInclude">Mégis bevonom</button></div>`
      : man && man.state === "include" ? `<div class="excl-banner ok d"><div><b>Kizárás felülbírálva</b><div class="crow-meta">A recruiter szándékosan bevonta a merítésbe.</div></div>
      <button class="btn btn-ghost" id="dExRevert">Vissza a kizártakhoz</button></div>` : ""}
    <div class="d-sec"><h5>Profil</h5>
      <div class="crow-name">${esc(c.name)}</div>
      <div class="crow-head">${esc(c.headline || "")}</div>
      <div class="crow-meta" style="margin-top:4px">${[c.current_company, c.location].filter(Boolean).map(esc).join(" · ")}</div>
      ${(c.past_companies || []).length ? `<div class="crow-meta" style="margin-top:2px">Korábban: ${(c.past_companies || []).map(esc).join(" · ")}</div>` : ""}
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
      <div class="row" style="margin-top:8px"><button class="btn" id="dTouch">Aktivitás rögzítése</button>
        ${!exc ? `<button class="btn btn-ghost" id="dExExclude" title="Kivétel a merítésből">Kizárom a merítésből</button>` : ""}</div>
    </div>`;
  const dInc = $("#dExInclude");
  if (dInc) dInc.onclick = () => { setCandExclusion(p, c.id, "include", "A recruiter szándékosan bevonta."); renderDrawer(p, c); render(state.view); toast("Jelölt bevonva a merítésbe."); };
  const dRev = $("#dExRevert");
  if (dRev) dRev.onclick = () => { setCandExclusion(p, c.id, null); renderDrawer(p, c); render(state.view); toast("Visszaállítva az alapértelmezett kizárási szabály."); };
  const dExc = $("#dExExclude");
  if (dExc) dExc.onclick = () => {
    const r = prompt("Miért zárod ki ezt a jelöltet a merítésből? (opcionális)", "");
    if (r === null) return;
    setCandExclusion(p, c.id, "exclude", r);
    renderDrawer(p, c);
    // A jelölt nem tűnhet el nyomtalanul: nyitva mutatjuk, hova került.
    state.openExcluded = true;
    render(state.view);
    toast("Jelölt kizárva a merítésből — a kizártak közt megtalálod.");
  };
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
  const rows = [...ids].map((id) => ({ id, cand: candById(p, id), ...orState(p, id) })).filter((r) => r.cand && !isExcluded(p, r.cand));
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
  // Az újraelemzés felülírja a véglegesített briefet — kézi szerkesztésnél kérdezünk.
  if (p.brief_final && briefIsEdited(p) && !confirm("Már van szerkesztett véglegesített briefed. Az új elemzés felülírja. Folytatod?")) return;
  p.brief_raw = $("#briefInput").value;
  const out = await api("POST", `/api/project/${p.id}/intake`, { brief: p.brief_raw });
  p.intake = out;
  p.intake_review = null;
  p.brief_final = null;
  persist();
  renderIntake(p);
  toast("Elemzés kész — szerkeszd és véglegesítsd a briefet.");
});
$("#queryBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  const q = await api("POST", `/api/project/${p.id}/query`, { brief: finalBriefText(p), must_haves: (p.brief_final || {}).must_haves });
  const had = !!p.query;
  // A frissítés SOHA nem törli a kézzel felvett kategóriákat — egyesít.
  p.query = mergeQueryPlan(p.query, q);
  // Az ügyfél neve a kizárási listát vezérli, nem a terv szövegét.
  persist();
  renderCelpiac(p);
  renderEngHeader(p);
  toast(had ? "Keresési terv frissítve — a kézi módosításaid megmaradtak." : "Keresési terv elkészült — szerkeszd szabadon.");
});
$("#queryResetBtn").onclick = (e) => needEngagement() && withLoading(e.target, async () => {
  const p = state.project;
  if (p.query && !confirm("Új terv nulláról: a kézzel felvett kategóriáid elvesznek. Folytatod?")) return;
  p.query = await api("POST", `/api/project/${p.id}/query`, { brief: finalBriefText(p) });
  persist();
  renderCelpiac(p);
  renderEngHeader(p);
  toast("Új keresési terv készült.");
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
  // Az ügyfél saját (volt) emberei nem kerülnek a listára — de nem is tűnnek el
  // nyomtalanul: külön sávra kerülnek, indoklással, visszahozhatóan.
  const blocked = excludedCandidates(p).length;
  if (blocked) p.discover_note += ` · ${blocked} találat kizárva a merítésből (ügyfél jelenlegi/volt munkatársa vagy off-limits cég).`;
  persist();
  toast(blocked
    ? `${(out.candidates || []).length} találat · ${blocked} kizárva (ügyfél saját emberei).`
    : `${(out.candidates || []).length} találat feldolgozva.`);
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
