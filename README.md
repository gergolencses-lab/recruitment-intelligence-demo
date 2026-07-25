# Recruitment Intelligence — statikus demo

Megbízás-alapú recruitment munkatér **kattintható demója**, mintaadatokkal, API-kulcs és szerver nélkül.
A `mock-api.js` a böngészőben helyettesíti a backendet; minden adat minta, nem valós személy.

▶ **Élő demo (GitHub Pages):** https://gergolencses-lab.github.io/recruitment-intelligence-demo/

A recruiter mindenhol felülírhatja a rendszert:

- **Kizárás a merítésből** — az ügyfél jelenlegi és volt munkatársai (leányvállalati és rövidített cégnév-alakokkal együtt), valamint a kézzel megadott off-limits cégek nem kerülnek a jelöltlistára. Nem törlődnek: külön sávban, indoklással, egy kattintással visszahozhatók.
- **Véglegesített brief** — az AI javaslata szerkesztőmezőbe kerül; a recruiter átírja, feltételeket vesz fel vagy el, és az általa jóváhagyott változat megy tovább a keresésbe.
- **Szerkeszthető keresési stratégia** — a terv és a célpiac-térkép minden kategóriája bővíthető és szűkíthető futás után is, kézzel vagy a szűk hatókörű **stratégia-asszisztenssel** (látható rendszer-prompt, tételes és visszavonható módosítások).

Az éles, teljes funkciós alkalmazás (élő Claude + webes jelöltkutatás): https://recruitment-intelligence-copilot.vercel.app
A forráskód és a szerveroldali mag privát repóban él.
