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
    { name: "Bogdán Ádám", headline: "Staff Backend Engineer — payments, Go/Rust", current_company: "(régiós fintech scale-up)", location: "Budapest, HU", past_companies: ["(neobank B)", "(telco digital unit)"], signals: [{ signal: "8+ év elosztott rendszerek, utolsó 3 év payments core", strength: "erős" }, { signal: "Konferencia-előadó (Craft Conf), skálázás-témában", strength: "közepes" }, { signal: "OSS: karbantart egy idempotency-key libet", strength: "közepes" }] },
    { name: "Nowak Katarzyna", headline: "Principal Platform Engineer — Kubernetes, SRE", current_company: "(lengyel unicorn)", location: "Kraków, PL", signals: [{ signal: "Platform-csapatot épített 0-ról 12 főre", strength: "erős" }, { signal: "CNCF meetup társszervező Krakkóban", strength: "közepes" }] },
    { name: "Varga Eszter", headline: "Senior ML Engineer — MLOps, forecasting", current_company: "(energetikai adatcég)", location: "Budapest, HU", signals: [{ signal: "Idősoros előrejelző pipeline productionben (villamosenergia)", strength: "erős" }, { signal: "PyData Budapest előadás feature-store témában", strength: "közepes" }] },
    { name: "Horák Tomáš", headline: "Engineering Manager — embedded / IoT", current_company: "(cseh ipari OEM)", location: "Brno, CZ", signals: [{ signal: "Firmware + felhő-kapcsolat, 20 fős szervezet", strength: "erős" }, { signal: "Korábban IC-ként RTOS-scheduler contribs", strength: "közepes" }] },
    { name: "Kovács Bence", headline: "Staff Frontend Engineer — design systems, React/TS", current_company: "(SaaS scale-up)", location: "Szeged/Remote, HU", signals: [{ signal: "Design-system libet vezet, 40 fejlesztő használja", strength: "erős" }, { signal: "Aktív tech-blog performancia-témában", strength: "közepes" }] },
    { name: "Ionescu Andrei", headline: "Senior Data Engineer — streaming, Kafka/Flink", current_company: "(román e-commerce)", location: "Cluj-Napoca, RO", signals: [{ signal: "Valós idejű pipeline 2M event/perc", strength: "erős" }, { signal: "Meetup-előadó stream processing témában", strength: "közepes" }] },
    { name: "Szabó Réka", headline: "Principal Security Engineer — appsec, cloud", current_company: "(régiós bank tech-leánya)", location: "Budapest, HU", signals: [{ signal: "Threat-modeling programot vezetett be", strength: "erős" }, { signal: "CVE-jelentések, felelős disclosure track", strength: "közepes" }] },
    { name: "Wójcik Marek", headline: "Staff Engineer — distributed databases", current_company: "(infra startup)", location: "Warsaw/Remote, PL", signals: [{ signal: "Consensus/replikáció mély szakértelem", strength: "erős" }, { signal: "OSS commitok egy elosztott KV-store-ba", strength: "erős" }] },
    { name: "Tóth Gergely", headline: "Senior Site Reliability Engineer — observability", current_company: "(telco digital unit)", location: "Budapest, HU", past_companies: ["(régiós bank tech-leánya)"], signals: [{ signal: "SLO-kultúrát honosított meg 6 csapatnál", strength: "erős" }, { signal: "OpenTelemetry contributor", strength: "közepes" }] },
    { name: "Novák Lucia", headline: "Engineering Lead — fintech mobile", current_company: "(szlovák neobank)", location: "Bratislava, SK", signals: [{ signal: "iOS+Android csapat, 0-1 termékindítás", strength: "erős" }, { signal: "Női tech-mentorprogram szervezője", strength: "közepes" }] },
    { name: "Farkas Dániel", headline: "Senior Backend Engineer — event-sourcing, .NET", current_company: "(logisztikai SaaS)", location: "Debrecen/Remote, HU", signals: [{ signal: "CQRS/event-sourcing productionben 4 éve", strength: "erős" }] },
    { name: "Popescu Maria", headline: "Staff Data Scientist — pricing, optimization", current_company: "(marketplace)", location: "Bucharest, RO", signals: [{ signal: "Dinamikus árazó modell, mért árbevétel-hatás", strength: "erős" }, { signal: "Kaggle Grandmaster", strength: "közepes" }] },
    { name: "Kiss Márton", headline: "Principal Engineer — cloud cost & FinOps tooling", current_company: "(régiós ISV)", location: "Budapest/Remote, HU", signals: [{ signal: "Belső FinOps-platform, 7-jegyű megtakarítás", strength: "erős" }] },
    { name: "Svoboda Petr", headline: "Senior Full-stack — healthtech", current_company: "(cseh healthtech)", location: "Prague, CZ", signals: [{ signal: "Szabályozott környezet (orvostech) szoftver", strength: "erős" }, { signal: "Konferencia-előadás compliance-by-design témában", strength: "közepes" }] },
  ];
  function synthPool() {
    return POOL.map(function (c, i) {
      return Object.assign({ past_companies: [] }, c, {
        id: "syn-" + String(i + 1).padStart(3, "0"), synthetic: true, source_url: null,
        source_type: "synthetic", art14_status: "n/a (mintaadat)", is_person: true,
        provenance: { method: "synthetic-pool", query: null, fetched_at: new Date().toISOString() },
      });
    });
  }

  // ── Az ügyfélhez kötődő jelöltek ────────────────────────────────────────
  // A kutatás a valóságban is bedobja őket (publikus profil = publikus profil),
  // ezért a demóban is megjelennek — a felület dolga kiszűrni és megindokolni,
  // nem eltitkolni. Három tipikus eset: jelenlegi munkatárs, volt munkatárs,
  // és leányvállalat/eltérő cégnév-alak.
  function clientInsiders(client) {
    const cl = client || "(az ügyfél)";
    return [
      {
        id: "syn-cli-01", name: "Deák Zsófia", headline: "Senior Backend Engineer — payments platform",
        current_company: cl, location: "Budapest, HU", past_companies: ["(régiós ISV)"],
        signals: [{ signal: "3 éve a payments platformon dolgozik", strength: "erős" }, { signal: "Belső platform-guild vezetője", strength: "közepes" }],
      },
      {
        id: "syn-cli-02", name: "Rácz Ábel", headline: "Staff Engineer — core banking integrations",
        current_company: "(kereskedelmi bank IT-leánya)", location: "Budapest, HU", past_companies: [cl, "(telco digital unit)"],
        signals: [{ signal: "Korábban az ügyfélnél épített fizetési integrációkat", strength: "erős" }, { signal: "9 év JVM-ökoszisztéma", strength: "közepes" }],
      },
      {
        id: "syn-cli-03", name: "Halász Petra", headline: "Engineering Manager — fizetési integrációk",
        current_company: cl + " Technologies", location: "Budapest/Remote, HU", past_companies: [],
        signals: [{ signal: "8 fős integrációs csapatot vezet", strength: "erős" }, { signal: "Korábban IC-ként ledger-rendszeren dolgozott", strength: "közepes" }],
      },
    ].map(function (c) {
      return Object.assign({}, c, {
        synthetic: true, source_url: null, source_type: "synthetic",
        art14_status: "n/a (mintaadat)", is_person: true,
        provenance: { method: "synthetic-pool", query: null, fetched_at: new Date().toISOString() },
      });
    });
  }
  // ── Késői találatok ─────────────────────────────────────────────────────
  // Egy második kutatási kör eredménye: még nincs prioritásuk, és „Új” jelzést
  // kapnak. A merítésbe a rangsorolás UTÁN kerülnek, ezért nem tolják el a
  // korábbi tier-besorolásokat (a rangsor tömbindex alapján oszt).
  function lateFinds() {
    return [
      {
        id: "syn-015", name: "Balogh Réka", headline: "Senior Backend Engineer — ledger, event sourcing",
        current_company: "(skandináv neobank)", location: "Budapest/Remote, HU", past_companies: ["(régiós PSP)"],
        signals: [{ signal: "Kettős könyvelésű ledgert vezetett be", strength: "erős" }, { signal: "Konferencia-előadás event sourcingról", strength: "közepes" }],
      },
      {
        id: "syn-016", name: "Nagy Bertalan", headline: "Staff Engineer — payment orchestration",
        current_company: "(nemzetközi PSP)", location: "Debrecen/Remote, HU", past_companies: ["(kártyatársaság)"],
        signals: [{ signal: "Napi több millió tranzakciós útvonalválasztó tulajdonosa", strength: "erős" }],
      },
    ].map(function (c) {
      return Object.assign({}, c, {
        synthetic: true, source_url: null, source_type: "synthetic",
        art14_status: "n/a (mintaadat)", is_person: true, is_new: true,
        provenance: { method: "synthetic-pool", query: null, fetched_at: new Date().toISOString() },
      });
    });
  }
  // A kutatás kimenete: a nyers merítés, benne az ügyfélhez kötődőkkel.
  function discoverPool(client) {
    const pool = synthPool(), ins = clientInsiders(client);
    pool.splice(1, 0, ins[0]);
    pool.splice(4, 0, ins[1]);
    pool.splice(7, 0, ins[2]);
    return pool;
  }

  // ── Minta-outputok (az éles kimenetek formája) ──
  const demo = {
    intakeReframe: function () { return { _demo: true, reframed_brief: "Nem 'senior Java fejlesztőt' kerestek — hanem valakit, aki egy skálázódó payments core-t stabilan tud tartani növekvő terhelés alatt, és mellé csapatot is emel. A nyelv másodlagos, a rendszergondolkodás az elsődleges.", must_haves: ["Bizonyított elosztott-rendszer tapasztalat production terhelésen", "Volt már 'on-call' felelőssége éles pénzügyi rendszerért", "Mentorált/emelt más mérnököket"], nice_to_haves: ["Payments/fintech domain", "Go vagy Rust", "OSS-jelenlét"], clarification_points: ["A '10+ év Java' fölösleges szűkítés — kizár erős poliglott mérnököket.", "A brief 'egyedül vigye a rendszert' + 'csapatépítés' — ez két külön szerep; tisztázni kell a hiring managerrel."], inferred_requirements: ["A briefből következtetve valószínűleg tech-lead kell, nem tiszta IC — a 'senior' szó itt lead-szerepet takarhat. Egyeztetendő."], search_hypotheses: ["Régiós fintech scale-upök payments-csapatai", "Craft Conf / infra-meetup előadók", "OSS: idempotency / distributed-tx libek karbantartói"] }; },
    queryBuild: function (input) {
      // Az ügyfél saját cégét a lekérdezés szintjén is kizárjuk — a kizárás
      // nem utólagos szűrés, hanem a keresési terv része.
      const client = (input && input.client) || "";
      const neg = client ? ' -"' + client + '"' : "";
      return {
        _demo: true,
        boolean_queries: [
          { platform: "linkedin-xray", query: 'site:linkedin.com/in ("staff engineer" OR "principal engineer" OR "tech lead") payments (Go OR Rust OR Java) (Budapest OR Warsaw OR Prague OR remote)' + neg },
          { platform: "github", query: "site:github.com payments idempotency location:Hungary OR location:Poland" + neg },
          { platform: "google", query: '"craft conf" OR "pycon" speaker distributed systems payments 2024 2025' + neg },
        ],
        firecrawl_search_queries: [
          "site:linkedin.com/in staff engineer payments Go Rust Budapest OR Warsaw" + neg,
          "site:github.com senior backend engineer payments idempotency Hungary OR Poland" + neg,
          "craft conf speaker distributed systems payments CEE",
          "principal platform engineer Kubernetes SRE Krakow OR Prague site:linkedin.com/in" + neg,
        ],
        target_companies: ["(régiós fintechek)", "(neobankok)", "(payment PSP-k)", "(infra startupok)"],
        target_titles: ["Staff Engineer", "Principal Engineer", "Tech Lead", "Engineering Manager (hands-on)"],
        synonyms: ["distributed systems", "payments core", "high-throughput", "event-sourcing", "SRE"],
        exclude_companies: client ? [client] : [],
        exclusion_note: client
          ? "Az ügyfél (" + client + ") jelenlegi és volt munkatársai nem kerülnek a merítésbe — őket a hiring manager amúgy is ismeri."
          : "Add meg az ügyfél nevét a pozícióadatoknál, hogy a saját munkatársai automatikusan kimaradjanak.",
      };
    },
    talentMap: function () { return { _demo: true, target_companies: [{ name: "(régiós fintech A)", why: "Payments core, ismert magas terhelés", likely_roles: ["Staff BE", "SRE"], url_guess: null }, { name: "(neobank B)", why: "Skálázódó mobil+backend, friss tőkebevonás → mozgásban a piac", likely_roles: ["Tech Lead"], url_guess: null }, { name: "(infra startup C)", why: "Elosztott DB szakértelem koncentrálódik", likely_roles: ["Staff Engineer"], url_guess: null }], competitor_clusters: ["Payments PSP-k", "Neobankok", "B2B fintech infra"], where_they_gather: ["Craft Conf", "CNCF/K8s meetupok (Krakkó, Bp)", "PyData", "belső platform-guildök"] }; },
    profileAssess: function (input) { return { _demo: true, candidate_id: input && input.candidate_id, fit: "erős", fit_reason: "A jelek payments-core productiont és OSS-karbantartást mutatnak — a szerep magja lefedve; a formális vezetés nyitott kérdés, de nem kizáró.", profile_summary: "A jelek staff-szintre utalnak: rendszer-szintű döntések, mások emelése. A payments-terhelés éles felelősség volt.", role_relevant_signals: [{ signal: "Payments core productionben 3 év", strength: "erős", evidence: "headline + konferencia-téma" }, { signal: "OSS idempotency-lib karbantartás", strength: "közepes", evidence: "GitHub" }, { signal: "Craft Conf előadás skálázásról", strength: "közepes", evidence: "publikus program" }], questions_to_clarify: ["Vezetett-e formálisan csapatot, vagy technikai lead volt?", "Mennyire volt on-call felelőssége?"], unknowns: ["Jelenlegi elégedettsége / vált-e szívesen", "Fizetési elvárás", "Remote vs. iroda preferencia"], key_strength: "Ritka kombináció: mély elosztott-rendszer tapasztalat + valós payments-felelősség + közösségi láthatóság.", evidence: ["headline", "GitHub", "konferencia-program"] }; },
    rankTargets: function (input) { var cands = (input && input.candidates) || []; var n = cands.length; return { _demo: true, ranked: cands.map(function (c, i) { return { candidate_id: c.id, name: c.name, contact_priority: i + 1, tier: i < 3 ? "A — elsőként keresd meg" : i < 7 ? "B — következő kör" : i < n - 2 ? "C — figyelőlista" : "D — most nem javasolt", rationale: i < 3 ? "Legerősebb evidencia + jó elérhetőség; itt a legmagasabb a válasz-esély." : i < n - 2 ? "Erős jel, de gyengébb elérhetőség vagy kevesebb megerősítés." : "A jelek gyengék vagy szerep-irrelevánsak — most nem javasolt megkeresni.", evidence: (c.signals || []).slice(0, 1).map(function (s) { return s.signal; }) }; }), note: "Prioritási javaslat evidencia alapján — a recruiter felülbírálhatja." }; },
    attractionStrategy: function (input) { return { _demo: true, candidate_id: input && input.candidate_id, grounded_read: { known_facts: [{ fact: "Payments core rendszert vitt productionben", from_signal: "Payments core productionben 3 év" }, { fact: "Nyílt forrású idempotency-libet tart karban", from_signal: "OSS idempotency-lib karbantartás" }, { fact: "Konferencián adott elő skálázásról", from_signal: "Craft Conf előadás skálázásról" }], unknowns: ["Mi motiválja (pénz / scope / tech) — nem tudjuk", "Mennyire elégedett a jelenlegi helyén", "Nyitott-e váltásra"], confidence: "közepes" }, attraction_ideas: [{ rank: 1, angle: "A szakmai kihívás és a hatáskör: a payments core, amelynek architektúrájáról ő dönthet, és a csapat, amelyet köré építhet.", hook: "A munkájára reflektálva: 'Láttam a skálázás-előadásod — olyan embert keresünk, aki eldönti, milyen legyen a rendszer, nem csak beáll egy meglévőbe.'", why_might_work: "A földelt jelek (OSS + konferencia) arra utalnak, fontos neki, hogy a munkája látható legyen és számítson. Feltételezés: a motiváció nem megerősített.", speculative: true }, { rank: 2, angle: "IC→lead hatáskör-bővülés, ha váltáskész.", why_might_work: "Staff-jel van, formális vezetésre nincs — lehet neki új szint. Feltételezés.", speculative: true }, { rank: 3, angle: "Zöldmezős rendszer a legacy-karbantartás helyett.", why_might_work: "Gyakori senior-motiváció, de erre konkrét jel nincs — a leggyengébb hipotézis.", speculative: true }], recommended: 1, channel: "Első kör ne LinkedIn-InMail legyen (zajos). Ha van közös ismerős vagy kapcsolódás a konferencia-Q&A-ból → azon. Másodlagos: rövid, személyes e-mail.", timing: "A friss régiós tőkebevonások után sok seniornál nyitott kérdés a 'mit építek a következő 2 évben'.", risks: ["Sablonos megkeresés → azonnal elveszíti a figyelmét.", "Megalapozatlan hatáskör-ígéret — egy tapasztalt jelölt azonnal átlátja."] }; },
    outreachDraft: function (input) { return { _demo: true, candidate_id: input && input.candidate_id, language: "en", channel: "warm email / referral", subject: "Your idempotency talk — and a payments core that needs an owner", body: "Hi Ádám,\n\nI caught your Craft Conf talk on idempotency keys — the part about partial failures was exactly the kind of thinking most teams skip.\n\nI'm helping a payments team that's at the point where the core either scales or breaks. They don't want someone to *maintain* it — they want someone to decide what it should be, and build the team around it. Staff-to-lead scope, architecture ownership from day one, remote-first.\n\nNot a pitch, just a question: is 'the payments core is yours' the kind of problem you'd want to hear more about?\n\n— [név]", why_this_works: ["Az első mondat a SAJÁT munkájára reflektál (nem sablon).", "A szakmai kihívást és a hatáskört mutatja be, nem csak a pozíciót.", "Alacsony súrlódású zárás: egy kérdés, nem egy CV-kérés."], note: "Vázlat — a recruiter ellenőrzi és küldi. A rendszer nem küld semmit." }; },
    clientAdvisory: function () { return { _demo: true, talking_points: ["A '10+ év Java' feltétel kizár erős jelölteket — javasold a nyelv-agnosztikus szűrést.", "Amit leírtatok, az valójában tech-lead, nem tiszta IC — igazítsuk a szintet és a bérsávot.", "A piac mozgásban: ha 3 hétnél tovább vársz a döntéssel, a top jelölt elmegy máshova."], meeting_preparation: "Az egyeztetésre vigyél 2 konkrét piaci adatot (bérszint, elérhetőség) és egy kockázatot, amit a hiring manager még nem lát — így a beszélgetés a piacról szól, nem a CV-kről.", watch_outs: ["Túl hosszú folyamat", "Homályos hatáskör", "Alulárazott sáv a régiós szinthez képest"] }; },
    interviewIntel: function () { return { _demo: true, competency_questions: [{ competency: "Elosztott rendszerek", question: "Mesélj egy partial-failure esetről a payments-ben — hogyan vetted észre, mit tettél?", what_good_looks_like: "Konkrét eset, mérés, trade-off, nem tankönyv." }, { competency: "Vezetés/emelés", question: "Volt, akit te emeltél a következő szintre? Hogyan?", what_good_looks_like: "Nevesített példa, konkrét lépések, nem 'segítettem a csapatnak'." }, { competency: "Rendszer-döntés", question: "Egy architektúra-döntés, amit ma másképp hoznál meg — miért?", what_good_looks_like: "Önreflexió + tanulás, nem védekezés." }], signals_to_clarify: ["Csak 'mi' nyelv, sose 'én' a felelősségnél", "Nem tud mérést mondani a hatásához"] }; },
    recruitmentCoach: function () { return { _demo: true, recommended_approach: "Ne a briefből indulj, hanem tisztázd: 'miért pont Java?' és 'IC vagy lead?'. A brief végrehajtása helyett a brief pontosítása hozza a legtöbb értéket — mielőtt keresel.", one_lever_now: "A megkeresésnél mindig kösd az első mondatot a jelölt saját munkájához — ez önmagában érdemben emeli a válaszarányt.", skill_focus: "Brief-tisztázás: az ellentmondások kiszúrása és egyeztetése a hiring managerrel.", encouragement: "A jelöltlistád releváns — a következő lépés a személyre szabott megkeresésben van." }; },
  };

  /* ───────────────────────────────────────────────────────────────────────
     Stratégia-asszisztens — szűk hatókörű chat a keresési terv és a
     célpiac-térkép szerkesztésére. A rendszer-prompt rögzíti, hogy ez az
     asszisztens KIZÁRÓLAG stratégiát és térképet szerkeszt: nem értékel
     jelöltet és nem ír megkeresést. A statikus demóban élő modell helyett
     szándék-felismerés fut, de a szerződés (bemenet → válasz + műveletek)
     azonos az élessel.
     ─────────────────────────────────────────────────────────────────────── */
  function strategySystemPrompt(p) {
    const pos = (p && p.position) || {};
    return [
      "Te a JEL keresési stratégia-asszisztense vagy.",
      "Hatókör: EGYETLEN megbízás keresési terve (célpozíciók, célcégek, kulcs-szinonimák, kizárt cégek, boolean és webes lekérdezések) és célpiac-térképe (célcégek, versenytárs-klaszterek, közösségek).",
      "Amit NEM csinálsz: jelöltet nem értékelsz, megkeresést nem írsz, briefet nem elemzel, üzenetet nem küldesz — ezekre átirányítod a recruitert a megfelelő nézetre.",
      "Minden módosítást tételesen visszajelzel, és a recruiter egy kattintással visszavonhatja.",
      "Ha nincs elég információd a végrehajtáshoz, javaslatot teszel — de magadtól nem alkalmazod.",
      "Az ügyfél saját cégét és a kizárt (off-limits) cégeket soha nem javaslod célcégként.",
      "Megbízás: " + [pos.title, pos.client, pos.location, pos.seniority].filter(Boolean).join(" · "),
    ].join("\n");
  }

  const fold = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Sorrend számít: a szűkebb kulcsszavak előrébb (a „kizárt cégek” előzi a „cégek”-et).
  const CHAT_FIELDS = [
    { target: "exclusions", field: "companies", label: "kizárt cégek", kws: ["kizart ceg", "kizart", "off limits", "offlimits", "off-limits", "tiltolista", "tilto lista", "blacklist"] },
    { target: "map", field: "target_companies", label: "célpiac-térkép cégei", kws: ["terkep", "talent map", "celpiac terkep"] },
    { target: "map", field: "competitor_clusters", label: "versenytárs-klaszterek", kws: ["klaszter", "versenytars", "cluster", "szegmens"] },
    { target: "map", field: "where_they_gather", label: "közösségek és rendezvények", kws: ["kozosseg", "rendezveny", "meetup", "konferencia", "esemeny", "community"] },
    { target: "query", field: "target_titles", label: "célpozíciók", kws: ["celpozicio", "pozicio", "titulus", "job title", "szerepkor", "title"] },
    { target: "query", field: "synonyms", label: "kulcs-szinonimák", kws: ["szinonima", "kulcsszo", "kulcs szo", "kifejezes", "keyword"] },
    { target: "query", field: "boolean_queries", label: "boolean lekérdezések", kws: ["boolean", "xray", "x-ray", "x ray"] },
    { target: "query", field: "firecrawl_search_queries", label: "webes kereső-lekérdezések", kws: ["webes lekerdezes", "kereso lekerdezes", "firecrawl", "web query"] },
    { target: "query", field: "target_companies", label: "célcégek", kws: ["celceg", "cel ceg", "ceget", "cegek", "ceg", "company", "companies", "munkaltato"] },
  ];
  const RM_KWS = ["vedd ki", "vedd le", "szedd ki", "torold", "torol", "tavolits", "tavolitsd", "ne legyen", "hagyd ki", "kivesz", "remove", "delete", "vegyel ki", "vegyuk ki"];
  const ADD_KWS = ["adj hozza", "add hozza", "adjatok", "vedd fel", "vegyuk fel", "vegyel fel", "bovitsd", "bovits", "egeszitsd", "tegyel hozza", "tedd hozza", "irj be", "sorolj fel", "add "];
  const EXCL_KWS = ["zard ki", "zarjuk ki", "kizar", "ne keress", "tiltsd", "tilts", "off limits", "offlimits", "off-limits"];
  const ASK_KWS = ["javasol", "javaslat", "milyen", "mit ajanl", "otlet", "mire gondolsz", "adnal", "tudsz ajanlani", "?"];
  const HELP_KWS = ["mit tudsz", "segitseg", "mire vagy kepes", "help", "hogyan mukod"];

  const SUGGESTIONS = {
    "query:target_companies": ["(nemzetközi PSP D)", "(kártyakibocsátó platform E)", "(B2B fintech infra F)", "(treasury/ledger SaaS G)"],
    "query:target_titles": ["Backend Architect", "Head of Platform", "Senior Staff Engineer", "Payments Domain Lead"],
    "query:synonyms": ["idempotency", "ledger", "double-entry", "PCI DSS", "reconciliation", "high-availability"],
    "query:boolean_queries": ['site:linkedin.com/in ("payments platform" OR "billing platform") ("staff" OR "principal") (Budapest OR Prague)'],
    "query:firecrawl_search_queries": ["fintech engineering blog payments architecture CEE 2025"],
    "exclusions:companies": ["(az ügyfél leányvállalata)", "(közös tulajdonú testvércég)"],
    "map:target_companies": ["(nemzetközi PSP D)", "(kártyakibocsátó platform E)", "(treasury/ledger SaaS G)"],
    "map:competitor_clusters": ["Kártyakibocsátók", "Treasury/ledger SaaS", "Fizetési orchestrátorok"],
    "map:where_they_gather": ["FinTech meetup Budapest", "KubeCon EU", "Rust/Go Budapest meetup"],
  };

  function detectField(t) {
    for (const f of CHAT_FIELDS) for (const k of f.kws) if (t.indexOf(k) >= 0) return f;
    return null;
  }
  function currentList(p, target, field) {
    if (target === "query") return ((p.query || {})[field] || []);
    if (target === "map") return ((p.talent_map || {})[field] || []);
    if (target === "exclusions") return ((p.exclusions || {})[field] || []);
    return [];
  }
  function valOf(x) { return x && typeof x === "object" ? (x.name || x.query || "") : String(x == null ? "" : x); }
  // Tisztítás: parancsszavak, névelők, magyar tárgyrag-maradványok levágása.
  function cleanTok(s) {
    let t = String(s || "").replace(/^[\s\-–—•*"'„”]+|[\s.!?"'„”]+$/g, "").trim();
    t = t.replace(/^(a|az|és|meg|valamint|the)\s+/i, "").trim();
    if (t.length < 2) return "";
    if (RM_KWS.concat(ADD_KWS, EXCL_KWS).some((k) => fold(t) === k.trim())) return "";
    return t;
  }
  function extractValues(raw) {
    let s = String(raw || "");
    const quoted = s.match(/[„"'”]([^„"'”]{2,80})[„"'”]/g);
    if (quoted && quoted.length) return quoted.map((q) => cleanTok(q.replace(/[„"'”]/g, ""))).filter(Boolean);
    const i = s.search(/[:：]/);
    if (i >= 0) s = s.slice(i + 1);
    else {
      // Nincs kettőspont: leszedjük a parancs- és mezőszavakat a mondat elejéről.
      let f = fold(s);
      const kill = RM_KWS.concat(ADD_KWS, EXCL_KWS).concat(CHAT_FIELDS.reduce((a, x) => a.concat(x.kws), []));
      kill.sort((a, b) => b.length - a.length);
      for (const k of kill) { const at = f.indexOf(k); if (at >= 0) { s = s.slice(0, at) + " " + s.slice(at + k.length); f = fold(s); } }
      s = s.replace(/\b(kozott|kozul|kozze|hoz|hez|höz|ba|be|ra|re|tol|tol|bol|bol)\b/gi, " ");
    }
    return s.split(/,|;|\bés\b|\band\b|\bvalamint\b|\billetve\b/i).map(cleanTok).filter(Boolean).slice(0, 8);
  }
  // Meglévő elem megkeresése lazán (ragos alak, kis-nagybetű, részleges egyezés).
  function findExisting(listArr, token) {
    const t = fold(token);
    if (!t) return null;
    let hit = listArr.find((x) => fold(valOf(x)) === t);
    if (hit !== undefined) return hit;
    hit = listArr.find((x) => { const v = fold(valOf(x)); return v.length > 2 && (t.indexOf(v) >= 0 || v.indexOf(t) >= 0); });
    return hit === undefined ? null : hit;
  }

  function strategyChat(msg, p) {
    const raw = String(msg || "").trim();
    const t = fold(raw);
    const sys = strategySystemPrompt(p);
    if (!raw) return { _demo: true, reply: "Írd le, mit módosítsak a keresési terven vagy a célpiac-térképen.", actions: [], proposals: [], system_prompt: sys };

    // Hatókörön kívüli kérés — a rendszer-prompt szerint átirányítunk.
    if (/(jelolt|candidate)\w*\s*(ertekel|pontoz|rangsor)|irj (egy )?(uzenet|megkeres|emailt|levelet)|outreach szoveg|brief elemz/.test(t)) {
      return {
        _demo: true, system_prompt: sys, actions: [], proposals: [],
        reply: "Ez kívül esik a hatókörömön — én a keresési tervet és a célpiac-térképet szerkesztem. Jelölt-értékeléshez a Jelöltek, üzenetvázlathoz a Megkeresések, briefhez a Pozíció és brief nézet való.",
      };
    }
    if (HELP_KWS.some((k) => t.indexOf(k) >= 0)) {
      return {
        _demo: true, system_prompt: sys, actions: [], proposals: [],
        reply: "A keresési terv és a célpiac-térkép szerkesztése a dolgom. Például: „Adj hozzá a célcégekhez: (nemzetközi PSP D), (kártyakibocsátó E)” · „Vedd ki a szinonimák közül az SRE-t” · „Zárd ki az ügyfél leányvállalatát” · „Milyen célpozíciókat javasolsz még?” · „Készíts célpiac-térképet”.",
      };
    }
    // Térkép/terv generálás
    if (/(keszits|csinalj|generalj|allits ossze)/.test(t) && /(terkep|talent map)/.test(t)) {
      return { _demo: true, system_prompt: sys, actions: [{ op: "generate", target: "map", label: "célpiac-térkép elkészítése" }], proposals: [], reply: "Összeállítottam a célpiac-térképet. Nézd át, és mondd, mit vegyek ki vagy hozzá." };
    }
    if (/(keszits|csinalj|generalj|frissitsd|allits ossze)/.test(t) && /(keresesi terv|search plan|lekerdezes)/.test(t) && !/(vedd|torol|hagyd)/.test(t)) {
      return { _demo: true, system_prompt: sys, actions: [{ op: "generate", target: "query", label: "keresési terv frissítése" }], proposals: [], reply: "Frissítettem a keresési tervet. A kézzel felvett elemeidet megtartottam." };
    }

    const isExcl = EXCL_KWS.some((k) => t.indexOf(k) >= 0);
    const isRm = !isExcl && RM_KWS.some((k) => t.indexOf(k) >= 0);
    let f = detectField(t);
    if (isExcl) f = CHAT_FIELDS[0]; // kizárás → mindig az off-limits lista
    const asks = ASK_KWS.some((k) => t.indexOf(k) >= 0);

    if (!f) {
      return {
        _demo: true, system_prompt: sys, actions: [], proposals: [],
        reply: "Nem tudtam eldönteni, melyik listát módosítsam. Nevezd meg: célcégek, célpozíciók, kulcs-szinonimák, kizárt cégek, versenytárs-klaszterek, közösségek, boolean lekérdezések, vagy a célpiac-térkép cégei.",
      };
    }

    const key = f.target + ":" + f.field;
    const listArr = currentList(p, f.target, f.field);
    let values = extractValues(raw);

    // Kérdés vagy nincs kinyerhető érték → javaslat, nem végrehajtás.
    if ((asks && !isRm && !isExcl) || !values.length) {
      const have = new Set(listArr.map((x) => fold(valOf(x))));
      const pool = (SUGGESTIONS[key] || []).filter((s) => !have.has(fold(s)));
      if (!pool.length) {
        return { _demo: true, system_prompt: sys, actions: [], proposals: [], reply: "Erre a listára most nincs olyan javaslatom, ami ne szerepelne már benne. Írd be konkrétan, mit vegyek fel — például „" + f.label + ": …”." };
      }
      return {
        _demo: true, system_prompt: sys, actions: [],
        proposals: pool.slice(0, 4).map((v) => ({ op: isRm ? "remove" : "add", target: f.target, field: f.field, value: v, label: v })),
        reply: "Ezeket javaslom a(z) " + f.label + " listához. Egyenként alkalmazhatod — magamtól nem írom felül a tervedet.",
      };
    }

    const actions = [], skipped = [];
    for (const v of values) {
      if (isRm) {
        const hit = findExisting(listArr, v);
        if (hit == null) { skipped.push(v); continue; }
        actions.push({ op: "remove", target: f.target, field: f.field, value: hit, label: valOf(hit) });
      } else {
        if (findExisting(listArr, v) != null) { skipped.push(v); continue; }
        const val = f.target === "map" && f.field === "target_companies"
          ? { name: v, why: "A recruiter vette fel a stratégia-asszisztensen keresztül.", likely_roles: [] }
          : v;
        actions.push({ op: "add", target: f.target, field: f.field, value: val, label: v });
      }
    }
    if (!actions.length) {
      return { _demo: true, system_prompt: sys, actions: [], proposals: [], reply: (isRm ? "Nem találtam a listában: " : "Már szerepel a listában: ") + skipped.join(", ") + ". A(z) " + f.label + " így változatlan." };
    }
    const verb = isRm ? "Kivettem" : isExcl ? "Kizártam" : "Felvettem";
    let reply = verb + " a(z) " + f.label + " közül/közé: " + actions.map((a) => a.label).join(", ") + ".";
    if (skipped.length) reply += " Kihagytam (" + (isRm ? "nem találtam" : "már szerepelt") + "): " + skipped.join(", ") + ".";
    if (isExcl) reply += " A kizárt cégek jelenlegi és volt munkatársai nem kerülnek a jelöltlistára.";
    return { _demo: true, system_prompt: sys, actions, proposals: [], reply };
  }

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
    return { id, name: name || id, position: { title: "", client: "", location: "", work_mode: "", seniority: "", owner: "", hiring_manager: "", language: "", salary_band: "", due_date: "", priority: "" }, status: "Előkészítés", priority_overrides: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), brief_raw: "", intake: null, brief_final: null, query: null, candidates: [], talent_map: null, exclusions: { companies: [], candidates: {}, allow_alumni: false, client_aliases: [] }, strategy_chat: [], assessments: {}, ranking: null, attraction: {}, outreach: {}, outreach_status: {}, baseline_response_rate: null, first_shortlist_at: null, pilot: { cooling_days: 7, mono_source_threshold: 0.7 }, advisory: null, interview: null, coach_notes: [], memory: [], interactions: [] };
  }
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  function seed() {
    const p = emptyProject("acme-payments-staff-backend-engineer", "Staff Backend Engineer · Acme Payments");
    p.position = { title: "Staff Backend Engineer", client: "Acme Payments", location: "Budapest", work_mode: "hibrid", seniority: "Staff", owner: "Zita", hiring_manager: "", language: "angol", salary_band: "", due_date: "", priority: "" };
    p.status = "Megkeresés folyamatban";
    p.brief_raw = "Senior Java fejlesztő, 10+ év, aki egyedül viszi a payments rendszerünket, de csapatot is épít. Budapest, hibrid.";
    p.intake = demo.intakeReframe();
    p.query = demo.queryBuild({ client: p.position.client });
    p.exclusions = { companies: [], candidates: {}, allow_alumni: false, client_aliases: [] };
    p.candidates = discoverPool(p.position.client);
    p.discover_source = "synthetic";
    p.discover_note = "Mintaadatok (senior tech / CEE) — statikus demo, nem valós személyek. Élő kutatáshoz a helyi futtatásnál kell kulcs.";
    p.created_at = daysAgo(6);
    p.ranking = demo.rankTargets({ candidates: p.candidates });
    // A rangsor tömbindexből oszt tier-t, ezért a késői találatok CSAK a
    // rangsorolás után kerülnek a merítésbe — így a fenti besorolások állnak.
    p.candidates.push(...lateFinds());
    // A recruiter felülbírálata: két jelöltet felhoz a figyelőlistáról.
    p.priority_overrides = { "syn-006": "B", "syn-007": "A" };
    p.assessments["syn-001"] = demo.profileAssess({ candidate_id: "syn-001" });
    ["syn-001", "syn-002", "syn-003", "syn-004", "syn-006", "syn-007"].forEach((id) => (p.attraction[id] = demo.attractionStrategy({ candidate_id: id })));
    ["syn-001", "syn-002", "syn-003", "syn-004", "syn-007"].forEach((id) => (p.outreach[id] = demo.outreachDraft({ candidate_id: id })));
    p.outreach_status["syn-002"] = { sent_at: daysAgo(3), replied: true, replied_at: daysAgo(2), sentiment: "pozitív", reviewed_at: daysAgo(3) };
    p.outreach_status["syn-001"] = { sent_at: daysAgo(1), reviewed_at: daysAgo(1) };
    // syn-003: vázlat kész, még nincs ellenőrizve · syn-004: jóváhagyva, még nem ment ki
    p.outreach_status["syn-004"] = { reviewed_at: daysAgo(2) };
    // syn-007: kiküldve, negatív választ adott — nem minden válasz jó válasz
    p.outreach_status["syn-007"] = { sent_at: daysAgo(5), reviewed_at: daysAgo(5), replied: true, replied_at: daysAgo(4), sentiment: "negatív" };
    p.baseline_response_rate = 8;
    // last_touched: az aktívan mozgatottak frissek, kettő már régóta áll
    const touch = { "syn-001": 1, "syn-002": 2, "syn-003": 1, "syn-004": 11, "syn-006": 14, "syn-007": 4 };
    p.candidates.forEach((c) => { if (touch[c.id] != null) c.last_touched = daysAgo(touch[c.id]); });
    p.talent_map = demo.talentMap();
    p.advisory = demo.clientAdvisory();
    STORE[p.id] = p;
    // A kliens localStorage-ból dolgozik → beültetjük a minta-megbízást,
    // ha még nincs ilyen kulcs (először megnyitott statikus demo).
    // A SEED_V emelésekor a MINTA-megbízás frissül a visszatérő látogatónál is
    // (a saját megbízásaihoz nem nyúlunk).
    const SEED_V = 3;
    p.seed_version = SEED_V;
    try {
      const LS = "ric.projects.v1", VK = "ric.seed.v";
      const all = JSON.parse(localStorage.getItem(LS) || "{}");
      const stale = Number(localStorage.getItem(VK) || 0) < SEED_V;
      if (!all[p.id] || stale) {
        all[p.id] = p;
        localStorage.setItem(LS, JSON.stringify(all));
        localStorage.setItem(VK, String(SEED_V));
      }
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
      if (action === "query") { p.query = demo.queryBuild({ client: (p.position || {}).client }); return p.query; }
      if (action === "discover") { const cs = discoverPool((p.position || {}).client); return { source: "synthetic", candidates: cs, note: "Mintaadatok (senior tech / CEE) — statikus demo, nincs élő kutatás." }; }
      if (action === "strategy-chat") return strategyChat(body.message, p);
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
