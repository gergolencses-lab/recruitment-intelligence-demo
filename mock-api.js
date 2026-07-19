/* ─────────────────────────────────────────────────────────────
   mock-api.js — a backend kliens-oldali helyettesítője.
   A statikus demóhoz (GitHub Pages / Artifact): nincs szerver, nincs
   API-kulcs. A window.fetch-et patcheli, és a /api/* hívásokat a
   minta-outputokból + minta-jelöltekből szolgálja ki (in-memory store).
   A Knowledge Core NINCS benne — csak kész minta-eredmények.
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ── Minta jelölt-készlet (senior tech / CEE) — nem valós személyek ──
  const POOL = [
    { name: "Bogdán Ádám", headline: "Staff Backend Engineer — payments, Go/Rust", current_company: "(régiós fintech scale-up)", location: "Budapest, HU", signals: [{ signal: "8+ év elosztott rendszerek, utolsó 3 év payments core", strength: "erős" }, { signal: "Konferencia-előadó (Craft Conf), skálázás-témában", strength: "közepes" }, { signal: "OSS: karbantart egy idempotency-key libet", strength: "közepes" }] },
    { name: "Nowak Katarzyna", headline: "Principal Platform Engineer — Kubernetes, SRE", current_company: "(lengyel unicorn)", location: "Kraków, PL", signals: [{ signal: "Platform-csapatot épített 0-ról 12 főre", strength: "erős" }, { signal: "CNCF meetup társszervező Krakkóban", strength: "közepes" }] },
    { name: "Varga Eszter", headline: "Senior ML Engineer — MLOps, forecasting", current_company: "(energetikai adatcég)", location: "Budapest, HU", signals: [{ signal: "Idősoros előrejelző pipeline productionben (villamosenergia)", strength: "erős" }, { signal: "PyData Budapest előadás feature-store témában", strength: "közepes" }] },
    { name: "Horák Tomáš", headline: "Engineering Manager — embedded / IoT", current_company: "(cseh ipari OEM)", location: "Brno, CZ", signals: [{ signal: "Firmware + felhő-kapcsolat, 20 fős szervezet", strength: "erős" }, { signal: "Korábban IC-ként RTOS-scheduler contribs", strength: "közepes" }] },
    { name: "Kovács Bence", headline: "Staff Frontend Engineer — design systems, React/TS", current_company: "(SaaS scale-up)", location: "Szeged/Remote, HU", signals: [{ signal: "Design-system libet vezet, 40 fejlesztő használja", strength: "erős" }, { signal: "Aktív tech-blog performancia-témában", strength: "közepes" }] },
    { name: "Ionescu Andrei", headline: "Senior Data Engineer — streaming, Kafka/Flink", current_company: "(román e-commerce)", location: "Cluj-Napoca, RO", signals: [{ signal: "Valós idejű pipeline 2M event/perc", strength: "erős" }, { signal: "Meetup-előadó stream processing témában", strength: "közepes" }] },
    { name: "Szabó Réka", headline: "Principal Security Engineer — appsec, cloud", current_company: "(régiós bank tech-leánya)", location: "Budapest, HU", signals: [{ signal: "Threat-modeling programot vezetett be", strength: "erős" }, { signal: "CVE-jelentések, felelős disclosure track", strength: "közepes" }] },
    { name: "Wójcik Marek", headline: "Staff Engineer — distributed databases", current_company: "(infra startup)", location: "Warsaw/Remote, PL", signals: [{ signal: "Consensus/replikáció mély szakértelem", strength: "erős" }, { signal: "OSS commitok egy elosztott KV-store-ba", strength: "erős" }] },
    { name: "Tóth Gergely", headline: "Senior Site Reliability Engineer — observability", current_company: "(telco digital unit)", location: "Budapest, HU", signals: [{ signal: "SLO-kultúrát honosított meg 6 csapatnál", strength: "erős" }, { signal: "OpenTelemetry contributor", strength: "közepes" }] },
    { name: "Novák Lucia", headline: "Engineering Lead — fintech mobile", current_company: "(szlovák neobank)", location: "Bratislava, SK", signals: [{ signal: "iOS+Android csapat, 0-1 termékindítás", strength: "erős" }, { signal: "Női tech-mentorprogram szervezője", strength: "közepes" }] },
    { name: "Farkas Dániel", headline: "Senior Backend Engineer — event-sourcing, .NET", current_company: "(logisztikai SaaS)", location: "Debrecen/Remote, HU", signals: [{ signal: "CQRS/event-sourcing productionben 4 éve", strength: "erős" }] },
    { name: "Popescu Maria", headline: "Staff Data Scientist — pricing, optimization", current_company: "(marketplace)", location: "Bucharest, RO", signals: [{ signal: "Dinamikus árazó modell, mért árbevétel-hatás", strength: "erős" }, { signal: "Kaggle Grandmaster", strength: "közepes" }] },
    { name: "Kiss Márton", headline: "Principal Engineer — cloud cost & FinOps tooling", current_company: "(régiós ISV)", location: "Budapest/Remote, HU", signals: [{ signal: "Belső FinOps-platform, 7-jegyű megtakarítás", strength: "erős" }] },
    { name: "Svoboda Petr", headline: "Senior Full-stack — healthtech", current_company: "(cseh healthtech)", location: "Prague, CZ", signals: [{ signal: "Szabályozott környezet (orvostech) szoftver", strength: "erős" }, { signal: "Konferencia-előadás compliance-by-design témában", strength: "közepes" }] },
  ];
  function synthPool() {
    return POOL.map(function (c, i) {
      return Object.assign({}, c, {
        id: "syn-" + String(i + 1).padStart(3, "0"), synthetic: true, source_url: null,
        source_type: "synthetic", art14_status: "n/a (mintaadat)", is_person: true,
        provenance: { method: "synthetic-pool", query: null, fetched_at: new Date().toISOString() },
      });
    });
  }

  // ── Minta-outputok (az éles kimenetek formája) ──
  const demo = {
    intakeReframe: function () { return { _demo: true, reframed_brief: "Nem 'senior Java fejlesztőt' kerestek — hanem valakit, aki egy skálázódó payments core-t stabilan tud tartani növekvő terhelés alatt, és mellé csapatot is emel. A nyelv másodlagos, a rendszergondolkodás az elsődleges.", must_haves: ["Bizonyított elosztott-rendszer tapasztalat production terhelésen", "Volt már 'on-call' felelőssége éles pénzügyi rendszerért", "Mentorált/emelt más mérnököket"], nice_to_haves: ["Payments/fintech domain", "Go vagy Rust", "OSS-jelenlét"], clarification_points: ["A '10+ év Java' fölösleges szűkítés — kizár erős poliglott mérnököket.", "A brief 'egyedül vigye a rendszert' + 'csapatépítés' — ez két külön szerep; tisztázni kell a hiring managerrel."], inferred_requirements: ["A briefből következtetve valószínűleg tech-lead kell, nem tiszta IC — a 'senior' szó itt lead-szerepet takarhat. Egyeztetendő."], search_hypotheses: ["Régiós fintech scale-upök payments-csapatai", "Craft Conf / infra-meetup előadók", "OSS: idempotency / distributed-tx libek karbantartói"] }; },
    queryBuild: function () { return { _demo: true, boolean_queries: [{ platform: "linkedin-xray", query: 'site:linkedin.com/in ("staff engineer" OR "principal engineer" OR "tech lead") payments (Go OR Rust OR Java) (Budapest OR Warsaw OR Prague OR remote)' }, { platform: "github", query: 'site:github.com payments idempotency location:Hungary OR location:Poland' }, { platform: "google", query: '"craft conf" OR "pycon" speaker distributed systems payments 2024 2025' }], firecrawl_search_queries: ["site:linkedin.com/in staff engineer payments Go Rust Budapest OR Warsaw", "site:github.com senior backend engineer payments idempotency Hungary OR Poland", "craft conf speaker distributed systems payments CEE", "principal platform engineer Kubernetes SRE Krakow OR Prague site:linkedin.com/in"], target_companies: ["(régiós fintechek)", "(neobankok)", "(payment PSP-k)", "(infra startupok)"], target_titles: ["Staff Engineer", "Principal Engineer", "Tech Lead", "Engineering Manager (hands-on)"], synonyms: ["distributed systems", "payments core", "high-throughput", "event-sourcing", "SRE"] }; },
    talentMap: function () { return { _demo: true, target_companies: [{ name: "(régiós fintech A)", why: "Payments core, ismert magas terhelés", likely_roles: ["Staff BE", "SRE"], url_guess: null }, { name: "(neobank B)", why: "Skálázódó mobil+backend, friss tőkebevonás → mozgásban a piac", likely_roles: ["Tech Lead"], url_guess: null }, { name: "(infra startup C)", why: "Elosztott DB szakértelem koncentrálódik", likely_roles: ["Staff Engineer"], url_guess: null }], competitor_clusters: ["Payments PSP-k", "Neobankok", "B2B fintech infra"], where_they_gather: ["Craft Conf", "CNCF/K8s meetupok (Krakkó, Bp)", "PyData", "belső platform-guildök"] }; },
    profileAssess: function (input) { return { _demo: true, candidate_id: input && input.candidate_id, fit: "erős", fit_reason: "A jelek payments-core productiont és OSS-karbantartást mutatnak — a szerep magja lefedve; a formális vezetés nyitott kérdés, de nem kizáró.", profile_summary: "A jelek staff-szintre utalnak: rendszer-szintű döntések, mások emelése. A payments-terhelés éles felelősség volt.", role_relevant_signals: [{ signal: "Payments core productionben 3 év", strength: "erős", evidence: "headline + konferencia-téma" }, { signal: "OSS idempotency-lib karbantartás", strength: "közepes", evidence: "GitHub" }, { signal: "Craft Conf előadás skálázásról", strength: "közepes", evidence: "publikus program" }], questions_to_clarify: ["Vezetett-e formálisan csapatot, vagy technikai lead volt?", "Mennyire volt on-call felelőssége?"], unknowns: ["Jelenlegi elégedettsége / vált-e szívesen", "Fizetési elvárás", "Remote vs. iroda preferencia"], key_strength: "Ritka kombináció: mély elosztott-rendszer tapasztalat + valós payments-felelősség + közösségi láthatóság.", evidence: ["headline", "GitHub", "konferencia-program"] }; },
    rankTargets: function (input) { var cands = (input && input.candidates) || []; var n = cands.length; return { _demo: true, ranked: cands.map(function (c, i) { return { candidate_id: c.id, name: c.name, contact_priority: i + 1, tier: i < 3 ? "A — elsőként keresd meg" : i < 7 ? "B — következő kör" : i < n - 2 ? "C — figyelőlista" : "D — most nem javasolt", rationale: i < 3 ? "Legerősebb evidencia + jó elérhetőség; itt a legmagasabb a válasz-esély." : i < n - 2 ? "Erős jel, de gyengébb elérhetőség vagy kevesebb megerősítés." : "A jelek gyengék vagy szerep-irrelevánsak — most nem javasolt megkeresni.", evidence: (c.signals || []).slice(0, 1).map(function (s) { return s.signal; }) }; }), note: "Prioritási javaslat evidencia alapján — a recruiter felülbírálhatja." }; },
    attractionStrategy: function (input) { return { _demo: true, candidate_id: input && input.candidate_id, grounded_read: { known_facts: [{ fact: "Payments core rendszert vitt productionben", from_signal: "Payments core productionben 3 év" }, { fact: "Nyílt forrású idempotency-libet tart karban", from_signal: "OSS idempotency-lib karbantartás" }, { fact: "Konferencián adott elő skálázásról", from_signal: "Craft Conf előadás skálázásról" }], unknowns: ["Mi motiválja (pénz / scope / tech) — nem tudjuk", "Mennyire elégedett a jelenlegi helyén", "Nyitott-e váltásra"], confidence: "közepes" }, attraction_ideas: [{ rank: 1, angle: "A szakmai kihívás és a hatáskör: a payments core, amelynek architektúrájáról ő dönthet, és a csapat, amelyet köré építhet.", hook: "A munkájára reflektálva: 'Láttam a skálázás-előadásod — olyan embert keresünk, aki eldönti, milyen legyen a rendszer, nem csak beáll egy meglévőbe.'", why_might_work: "A földelt jelek (OSS + konferencia) arra utalnak, fontos neki, hogy a munkája látható legyen és számítson. Feltételezés: a motiváció nem megerősített.", speculative: true }, { rank: 2, angle: "IC→lead hatáskör-bővülés, ha váltáskész.", why_might_work: "Staff-jel van, formális vezetésre nincs — lehet neki új szint. Feltételezés.", speculative: true }, { rank: 3, angle: "Zöldmezős rendszer a legacy-karbantartás helyett.", why_might_work: "Gyakori senior-motiváció, de erre konkrét jel nincs — a leggyengébb hipotézis.", speculative: true }], recommended: 1, channel: "Első kör ne LinkedIn-InMail legyen (zajos). Ha van közös ismerős vagy kapcsolódás a konferencia-Q&A-ból → azon. Másodlagos: rövid, személyes e-mail.", timing: "A friss régiós tőkebevonások után sok seniornál nyitott kérdés a 'mit építek a következő 2 évben'.", risks: ["Sablonos megkeresés → azonnal elveszíti a figyelmét.", "Megalapozatlan hatáskör-ígéret — egy tapasztalt jelölt azonnal átlátja."] }; },
    outreachDraft: function (input) { return { _demo: true, candidate_id: input && input.candidate_id, language: "en", channel: "warm email / referral", subject: "Your idempotency talk — and a payments core that needs an owner", body: "Hi Ádám,\n\nI caught your Craft Conf talk on idempotency keys — the part about partial failures was exactly the kind of thinking most teams skip.\n\nI'm helping a payments team that's at the point where the core either scales or breaks. They don't want someone to *maintain* it — they want someone to decide what it should be, and build the team around it. Staff-to-lead scope, architecture ownership from day one, remote-first.\n\nNot a pitch, just a question: is 'the payments core is yours' the kind of problem you'd want to hear more about?\n\n— [név]", why_this_works: ["Az első mondat a SAJÁT munkájára reflektál (nem sablon).", "A szakmai kihívást és a hatáskört mutatja be, nem csak a pozíciót.", "Alacsony súrlódású zárás: egy kérdés, nem egy CV-kérés."], note: "Vázlat — a recruiter ellenőrzi és küldi. A rendszer nem küld semmit." }; },
    clientAdvisory: function () { return { _demo: true, talking_points: ["A '10+ év Java' feltétel kizár erős jelölteket — javasold a nyelv-agnosztikus szűrést.", "Amit leírtatok, az valójában tech-lead, nem tiszta IC — igazítsuk a szintet és a bérsávot.", "A piac mozgásban: ha 3 hétnél tovább vársz a döntéssel, a top jelölt elmegy máshova."], meeting_preparation: "Az egyeztetésre vigyél 2 konkrét piaci adatot (bérszint, elérhetőség) és egy kockázatot, amit a hiring manager még nem lát — így a beszélgetés a piacról szól, nem a CV-kről.", watch_outs: ["Túl hosszú folyamat", "Homályos hatáskör", "Alulárazott sáv a régiós szinthez képest"] }; },
    interviewIntel: function () { return { _demo: true, competency_questions: [{ competency: "Elosztott rendszerek", question: "Mesélj egy partial-failure esetről a payments-ben — hogyan vetted észre, mit tettél?", what_good_looks_like: "Konkrét eset, mérés, trade-off, nem tankönyv." }, { competency: "Vezetés/emelés", question: "Volt, akit te emeltél a következő szintre? Hogyan?", what_good_looks_like: "Nevesített példa, konkrét lépések, nem 'segítettem a csapatnak'." }, { competency: "Rendszer-döntés", question: "Egy architektúra-döntés, amit ma másképp hoznál meg — miért?", what_good_looks_like: "Önreflexió + tanulás, nem védekezés." }], signals_to_clarify: ["Csak 'mi' nyelv, sose 'én' a felelősségnél", "Nem tud mérést mondani a hatásához"] }; },
    recruitmentCoach: function () { return { _demo: true, recommended_approach: "Ne a briefből indulj, hanem tisztázd: 'miért pont Java?' és 'IC vagy lead?'. A brief végrehajtása helyett a brief pontosítása hozza a legtöbb értéket — mielőtt keresel.", one_lever_now: "A megkeresésnél mindig kösd az első mondatot a jelölt saját munkájához — ez önmagában érdemben emeli a válaszarányt.", skill_focus: "Brief-tisztázás: az ellentmondások kiszúrása és egyeztetése a hiring managerrel.", encouragement: "A jelöltlistád releváns — a következő lépés a személyre szabott megkeresésben van." }; },
  };

  function art14(candidate, controller) {
    const c = controller || {};
    const name = c.name || "[ADATKEZELŐ CÉG NEVE]";
    const contact = c.contact || "[adatvédelmi kapcsolat e-mail]";
    const src = (candidate && (candidate.source_url || candidate.source_type)) || "publikusan elérhető szakmai forrás";
    const cand = (candidate && candidate.name) || "[jelölt neve]";
    return { _template: true, subject: "Adatkezelési tájékoztató – kapcsolatfelvétel toborzási céllal (GDPR 14. cikk)", must_send_within: "1 hónap a megszerzéstől, vagy az első kapcsolatfelvételkor", legal_basis: "jogos érdek (GDPR 6(1)f) + dokumentált LIA", body: `Tisztelt ${cand}!\n\nAz alábbi tájékoztatót a GDPR 14. cikke alapján küldjük, mert az Ön szakmai adatait toborzási céllal kezeljük.\n\n1) Adatkezelő: ${name}. Kapcsolat: ${contact}.\n2) Milyen adatot kezelünk: kizárólag szerep-releváns, publikus szakmai adatokat.\n3) Az adatok forrása: ${src} (publikusan elérhető információ).\n4) Cél és jogalap: potenciális álláslehetőséggel kapcsolatos megkeresés; jogos érdek (GDPR 6(1)f).\n5) Tárolás: a megbízás lezárásáig, illetve az Ön tiltakozásáig.\n6) Jogai: hozzáférés, helyesbítés, törlés, korlátozás, hordozhatóság, TILTAKOZÁS. Panasz: NAIH.\n7) Ha nem kíván megkereséseket kapni, egy válaszban jelezze, és töröljük.\n\nÜdvözlettel,\n${name}`, note: "Sablon. Kiküldés előtt töltsd ki a cégadatokat és a LIA-t. Jogász-review a skálázás előtt." };
  }

  // ── In-memory megbízás-store ──
  const STORE = {};
  function emptyProject(id, name) {
    return { id, name: name || id, position: { title: "", client: "", location: "", work_mode: "", seniority: "", owner: "", hiring_manager: "", language: "", salary_band: "", due_date: "", priority: "" }, status: "Előkészítés", priority_overrides: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), brief_raw: "", intake: null, query: null, candidates: [], talent_map: null, assessments: {}, ranking: null, attraction: {}, outreach: {}, outreach_status: {}, baseline_response_rate: null, first_shortlist_at: null, pilot: { cooling_days: 7, mono_source_threshold: 0.7 }, advisory: null, interview: null, coach_notes: [], memory: [], interactions: [] };
  }
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  function seed() {
    const p = emptyProject("acme-payments-staff-backend-engineer", "Staff Backend Engineer · Acme Payments");
    p.position = { title: "Staff Backend Engineer", client: "Acme Payments", location: "Budapest", work_mode: "hibrid", seniority: "Staff", owner: "Zita", hiring_manager: "", language: "angol", salary_band: "", due_date: "", priority: "" };
    p.status = "Megkeresés folyamatban";
    p.brief_raw = "Senior Java fejlesztő, 10+ év, aki egyedül viszi a payments rendszerünket, de csapatot is épít. Budapest, hibrid.";
    p.intake = demo.intakeReframe();
    p.query = demo.queryBuild();
    p.candidates = synthPool();
    p.discover_source = "synthetic";
    p.discover_note = "Mintaadatok (senior tech / CEE) — statikus demo, nem valós személyek. Élő kutatáshoz a helyi futtatásnál kell kulcs.";
    p.created_at = daysAgo(6);
    p.ranking = demo.rankTargets({ candidates: p.candidates });
    p.assessments["syn-001"] = demo.profileAssess({ candidate_id: "syn-001" });
    ["syn-001", "syn-002", "syn-003", "syn-004", "syn-006"].forEach((id) => (p.attraction[id] = demo.attractionStrategy({ candidate_id: id })));
    ["syn-001", "syn-002"].forEach((id) => (p.outreach[id] = demo.outreachDraft({ candidate_id: id })));
    p.outreach_status["syn-002"] = { sent_at: daysAgo(3), replied: true, replied_at: daysAgo(2), sentiment: "pozitív", reviewed_at: daysAgo(3) };
    p.outreach_status["syn-001"] = { sent_at: daysAgo(1), reviewed_at: daysAgo(1) };
    p.baseline_response_rate = 8;
    // last_touched: az aktívan mozgatottak frissek, kettő már régóta áll
    const touch = { "syn-001": 1, "syn-002": 2, "syn-003": 1, "syn-004": 11, "syn-006": 14 };
    p.candidates.forEach((c) => { if (touch[c.id] != null) c.last_touched = daysAgo(touch[c.id]); });
    p.talent_map = demo.talentMap();
    p.advisory = demo.clientAdvisory();
    STORE[p.id] = p;
    // A kliens localStorage-ból dolgozik → beültetjük a minta-megbízást,
    // ha még nincs ilyen kulcs (először megnyitott statikus demo).
    try {
      const LS = "ric.projects.v1";
      const all = JSON.parse(localStorage.getItem(LS) || "{}");
      if (!all[p.id]) { all[p.id] = p; localStorage.setItem(LS, JSON.stringify(all)); }
    } catch (e) {}
  }
  seed();

  function listProjects() {
    return Object.values(STORE).map((p) => ({ id: p.id, name: p.name, updated_at: p.updated_at, candidates: (p.candidates || []).length, has_brief: !!p.intake })).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  }

  // ── Router ──
  function route(method, path, body) {
    const parts = path.replace(/^\/api\/?/, "").split("/");
    if (path === "/api/status") return { brain: false, reach_live: false, model: "claude-sonnet-5 (statikus demo)", knowledge_version: "kc-2026-07-19.v2", mode: "demo" };
    if (path === "/api/projects") return listProjects();
    if (path === "/api/project" && method === "POST") { const id = body.id; if (!STORE[id]) STORE[id] = emptyProject(id, body.name); return STORE[id]; }

    // /api/project/:id/...
    if (parts[0] === "project" && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      // Stateless mód: ha a kliens elküldi a teljes megbízást, abból dolgozunk.
      if (body && body.project && body.project.id) STORE[body.project.id] = body.project;
      const p = STORE[id];
      const action = parts[2];
      if (!p) return { __status: 404, error: "Nincs ilyen megbízás: " + id };
      const cand = (cid) => (p.candidates || []).find((c) => c.id === cid);
      if (!action) return p;
      if (action === "meta") { if (body.position) p.position = Object.assign({}, p.position, body.position); if (body.status) p.status = body.status; if (body.name) p.name = body.name; return { ok: true, position: p.position, status: p.status, name: p.name }; }
      if (action === "intake") { p.brief_raw = body.brief || ""; p.intake = demo.intakeReframe(); return p.intake; }
      if (action === "query") { p.query = demo.queryBuild(); return p.query; }
      if (action === "discover") { const cs = synthPool(); return { source: "synthetic", candidates: cs, note: "Mintaadatok (senior tech / CEE) — statikus demo, nincs élő kutatás." }; }
      if (action === "talent-map") { p.talent_map = demo.talentMap(); return p.talent_map; }
      const touch = (cid) => { const cd = cand(cid); if (cd) cd.last_touched = new Date().toISOString(); };
      if (action === "assess") { const o = demo.profileAssess({ candidate_id: body.candidateId }); p.assessments[body.candidateId] = o; touch(body.candidateId); return o; }
      if (action === "rank") { p.ranking = demo.rankTargets({ candidates: p.candidates }); return p.ranking; }
      if (action === "attract") { const o = demo.attractionStrategy({ candidate_id: body.candidateId }); p.attraction[body.candidateId] = o; touch(body.candidateId); return o; }
      if (action === "outreach") { const o = demo.outreachDraft({ candidate_id: body.candidateId }); p.outreach[body.candidateId] = o; touch(body.candidateId); return o; }
      if (action === "touch") { touch(body.candidateId); return { ok: true }; }
      if (action === "outreach-status") {
        const cid = body.candidateId, cur = p.outreach_status[cid] || {};
        if (body.status === "reset") { delete p.outreach_status[cid]; return { ok: true, status: null }; }
        if (body.status === "sent") cur.sent_at = cur.sent_at || new Date().toISOString();
        if (body.status === "reviewed") cur.reviewed_at = cur.reviewed_at || new Date().toISOString();
        if (body.sentiment) { cur.replied = true; cur.replied_at = new Date().toISOString(); cur.sentiment = body.sentiment; }
        p.outreach_status[cid] = cur; touch(cid); return { ok: true, status: cur };
      }
      if (action === "baseline") { const r = Number(body.rate); p.baseline_response_rate = isFinite(r) ? r : null; return { ok: true, baseline_response_rate: p.baseline_response_rate }; }
      if (action === "shortlist-done") { p.first_shortlist_at = body.clear ? null : (p.first_shortlist_at || new Date().toISOString()); return { ok: true, first_shortlist_at: p.first_shortlist_at }; }
      if (action === "advisory") { p.advisory = demo.clientAdvisory(); return p.advisory; }
      if (action === "interview") { p.interview = demo.interviewIntel(); return p.interview; }
      if (action === "coach") { const o = demo.recruitmentCoach(); p.coach_notes.push({ ts: new Date().toISOString(), ...o }); return o; }
      if (action === "art14") { return art14(cand(body.candidateId), body.controller); }
      if (action === "memory" && method === "POST") { const e = { ts: new Date().toISOString(), kind: body.kind || "note", note: body.note }; p.memory.push(e); return e; }
      if (action === "memory") return { project: { id: p.id, name: p.name, updated_at: p.updated_at }, intake: p.intake, candidates: (p.candidates || []).length, memory: p.memory || [], interactions: p.interactions || [] };
    }
    return { __status: 404, error: "mock: ismeretlen útvonal " + path };
  }

  // ── fetch patch ──
  const orig = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, opts) {
    const u = typeof url === "string" ? url : (url && url.url) || "";
    const path = u.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
    if (path.indexOf("/api") === 0) {
      try {
        const method = (opts && opts.method) || "GET";
        const bodyObj = opts && opts.body ? JSON.parse(opts.body) : {};
        const data = route(method, path, bodyObj);
        const status = data && data.__status ? data.__status : 200;
        if (data && data.__status) delete data.__status;
        return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
      } catch (e) {
        return Promise.resolve(new Response(JSON.stringify({ error: String((e && e.message) || e) }), { status: 500, headers: { "Content-Type": "application/json" } }));
      }
    }
    return orig ? orig(url, opts) : Promise.reject(new Error("no fetch"));
  };
})();
