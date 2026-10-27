# Kreslení hudby — stav projektu

Desktopová aplikace (Electron + TypeScript) pro kreslení vizuálního doprovodu k hudbě a export
do MP4. Koncept a fázování: `vizualizace_hudby_koncept_v3.md`. Ovládání a spuštění: `README.md`.
S uživatelem se komunikuje česky, UI aplikace je česky. README je uživatelská dokumentace
(ovládání, nastavení, export); po změně chování ho aktualizuj spolu s tímto souborem.

## Samostatná práce (platí pro každou session)

**Pracuj podle `TODO.md`, po dokončení úkolu ho odškrtni, zapiš krátkou poznámku a commitni.
Když narazíš na rozhodnutí, které nejde odvodit, zapiš ho do sekce Blokované a pokračuj dalším
úkolem místo čekání.**

Uživatel řídí práci z mobilu krátkými pokyny typu „pokračuj bodem 4“ — číslo je číslo úkolu
v `TODO.md`. „Pokračuj“ bez čísla = první neodškrtnutý úkol, který není blokovaný.

Postup u každého úkolu:
1. Přečti úkol v `TODO.md` a sekci „Rozhodnutí“ tamtéž. Nedělej víc, než úkol říká; nápady
   navíc zapiš do `TODO.md` jako nový úkol na konec seznamu.
2. Před změnou ověř, že `main` je čistý a aktuální (`git status`, `git pull --ff-only`).
3. Implementuj včetně testů. Akceptační kritérium úkolu + `npm run typecheck`, `npm test`
   a `npm run test:e2e` musí projít. E2E nikdy nepouštěj dvakrát souběžně ve stejné složce.
4. Aktualizuj README (ovládání) a tento soubor (stav, architektura, pasti), pokud se změnily.
5. V `TODO.md` změň `[ ]` na `[x]` a pod úkol připiš `- **Poznámka (datum):**` — co se udělalo,
   co se nepodařilo, co je potřeba ověřit ručně.
6. Commit do `main` (česky, první řádek „Úkol N: …“, attribution řádek na konci) a `git push`.
   Commituj jen soubory, které úkol změnil; `tests/e2e/output` se necommituje.

Když se něco nedaří:
- Test selže a příčina není v tvé změně → zkus ho jednou znovu; když selže znovu, nepřepisuj
  test, aby prošel. Zapiš to do „Blokované“ a pokračuj jiným úkolem.
- E2E otevírá skutečné okno aplikace; pokud padá na věcech mimo úkol (zamčená obrazovka,
  ztráta fokusu), zapiš to do „Blokované“ s výpisem chyby.
- Nedokončenou práci necommituj do `main`. Raději ji vrať (`git stash` s popisem úkolu)
  a do poznámky úkolu napiš, kde skončila.
- Nikdy: `git push --force`, přepisování historie, mazání větví (kromě úkolu, který to výslovně
  říká), změny globální konfigurace gitu, `npm audit fix --force`, upgrade hlavních verzí
  závislostí bez úkolu.

## Kde jsme (stav k 27. 10. 2026)

**Fáze 1 (MVP), 2 (vrstvy, export) a 3 (úpravy křivek) jsou hotové a commitnuté.**
**Další krok: `TODO.md`** — na řadě je spolehlivost a testy, pak připomínka uživatele
k režimu úprav (časové okno), dodělání fáze 3 a odložené vyhlazení klávesou `S`.
Fáze 2 a 3 uživatel skoro nezkoušel — čekej další připomínky.

Hotovo:
- import a přehrávání audia (s překryvem „Načítám audio…“), časová osa s waveformem a přetáčením
- kreslení mizející stopy, tloušťka fixní / podle rychlosti, vyhlazení čáry, záře, ohňostroje
- nahrávání synchronní s audiem po odpočtu 3 s; nahrávání do vrstvy přidává, Zpět/Znovu po průchodech
- kreslení nanečisto mimo nahrávání (neukládá se)
- kreslení bez tlačítka pro touchpad: držet `D`, nebo `T` jako přepínač; během něj se kliky ignorují
  a ohňostroj jde jen klávesou `F`
- celá obrazovka (`F11`) se zámkem kurzoru v plátně (pointer lock + vlastní křížek)
- projekt `.khproj`, automatické ukládání, záloha neuloženého projektu s nabídkou obnovení po startu
- export snímek po snímku přes ffmpeg; dialog s volbou rozlišení (720p–4K), fps (24–60)
  a formátu (MP4 H.264/H.265, WebM VP9, MOV ProRes), volba se ukládá do projektu
- vrstvy: seznam v panelu (výběr, oko, přidat, smazat), `↑`/`↓` přepíná vrstvu, nahrává se
  do vybrané; ostatní se při nahrávání přehrávají jako reference, jdou schovat zaškrtávátkem
- posun vrstvy v čase: pole v panelu nebo `Shift` + tažení pruhu vrstvy na časové ose
- Zpět/Znovu pokrývá i přidání, smazání a vymazání vrstvy
- přiblížení časové osy (kolečko nad osou, `+`/`-`, tlačítka; `Shift` + kolečko posouvá výřez),
  aby šla vrstva posunout přesně; výřez při přehrávání skáče za přehrávací hlavou
- držení `F` sype ohňostroje s pětinou částic (`HELD_FIREWORK_DENSITY`), první stisk je plný
- režim úprav (`E`): výběr čáry/ohňostroje na plátně, tažení celého prvku, uzlů křivky a táhel
  (Alt = roh), výběr úseku mezi dvěma uzly (Shift+klik), Ctrl+C/Ctrl+V na místo přehrávací hlavy,
  Delete, pole „Začátek (s)“ pro posun vybraného prvku v čase; vše jde vrátit přes Zpět

Ve fázi 3 zatím chybí přidání/smazání uzlu, rozdělení čáry a výběr víc prvků (jsou v `TODO.md`).
Úpravy ve víc vrstvách zároveň, metronom a instalátor `.exe` uživatel teď nechce.

Neověřeno na skutečném hardwaru (jen simulovanou myší v testu): zámek kurzoru s druhým monitorem
a s perem/tabletem, kreslení `D`/`T` na skutečném touchpadu, překryv načítání u dlouhé skladby.
Režim úprav zkoušel v aplikaci jen E2E test na jedné vlnovce (úprava uzlu, přesun, kopie, smazání,
Zpět); ostatní operace (táhla, výběr úseku, ohňostroje, posun v čase) pokrývá `tests/editor.test.ts`.
Export 4K a formáty H.265/ProRes z aplikace nikdo nespustil (argumenty ffmpeg ověřeny jen ručně
na krátkém klipu); E2E test exportuje 1080p H.264 a 720p WebM.

## Architektura

- `src/shared/types.ts` — datový model (`Project` → `Layer[]` → `strokes`, `fireworks`, `style`,
  `offset`), nabídka exportu (`EXPORT_FORMATS`, `EXPORT_RESOLUTIONS`, `EXPORT_FPS`) a rozhraní IPC
  `KhApi`. Souřadnice jsou v logickém prostoru 1920×1080, časy ve vlastním čase vrstvy.
- `src/shared/project.ts` — výchozí hodnoty, (de)serializace `.khproj` (verze 3; starší se načtou
  s výchozími hodnotami). Body tahu jsou v souboru jako plochá pole `[x, y, t, …]`,
  křivky tahů zvlášť v `curves` podle indexu tahu. Chybějící položky
  stylu se doplní z `DEFAULT_STYLE`, neznámé nastavení exportu se nahradí výchozím.
- `src/main/index.ts` — okno, dialogy, čtení/zápis souborů (zápis přes dočasný soubor), záloha.
- `src/main/exporter.ts` — ffmpeg (`ffmpeg-static`): surové RGBA snímky na stdin + audio jako
  druhý vstup. Formáty jsou tabulka `FORMATS`; nový formát = nová položka tam a v `EXPORT_FORMATS`.
- `src/preload/index.ts` — most `window.kh` (contextIsolation, sandbox).
- `src/renderer/src/render/` — vykreslení scény jako **čistá funkce (vrstvy, čas)**, společná pro
  náhled i export: `scene.ts` (skládání vrstev, záře), `stroke.ts` (stopa, tloušťky, vyhlazení),
  `fireworks.ts` (částice z PRNG se seedem).
- `src/renderer/src/audio.ts` — Web Audio; hodiny AudioContextu jsou jediný zdroj času,
  kompenzuje se výstupní latence.
- `src/renderer/src/main.ts` — stav aplikace, vstup, nahrávání, autosave, UI. Vanilla TS bez frameworku.
- `src/renderer/src/curve.ts` — čistá matematika křivek: proložení bodů Bézierovými oblouky
  (Schneider), dopočet bodů z křivky, posun uzlu/táhla, výřez mezi uzly. Pokryto jednotkovými testy.
- `src/renderer/src/editor.ts` — režim úprav: výběr, tažení, schránka, překryv s uzly. S `main.ts`
  mluví přes `EditorHost`; překryv se kreslí přes hotový snímek do canvasu náhledu (v exportu není).
- `src/renderer/src/timeline.ts`, `exportVideo.ts` — časová osa (waveform + pruh na vrstvu,
  výšku si nastavuje sama podle počtu vrstev), smyčka exportu.

## Rozhodnutí a pasti, které nejsou z kódu zřejmé

- **Aktivní vrstva** je `layer()` v `main.ts` (podle `activeLayerId`); nahrává se do ní a upravuje
  ji panel. Během nahrávání ji nejde přepnout ani mazat/přidávat vrstvy.
- **Posun vrstvy se do zaznamenaných časů nezapisuje.** Body mají čas ve vlastním čase vrstvy,
  `offset` se odečítá až při vykreslení (`layersAt` ve `scene.ts`) a při nahrávání (`layerTime`
  v `main.ts`); přičítá se na časové ose a v `projectContentEnd`. Časy tedy mohou být i záporné.
- **Zpět/Znovu drží seznam objektů vrstev a jejich pole tahů/ohňostrojů** (`Snapshot`), ne kopie
  vrstev. Krok zpět proto vrací smazanou vrstvu a nahraný obsah, ale nemění název, vzhled ani posun.
- **Prořídlý ohňostroj** (`FireworkEvent.density`, v souboru nepovinná pátá položka) kreslí jen
  prvních N částic téže posloupnosti PRNG, takže pravidlo o pořadí `rand()` platí dál.
- **Přiblížení osy je stav `Timeline`** (`zoom`, `viewStart`), do projektu se neukládá. Všechny
  přepočty čas ↔ pixel na ose musí jít přes `view()`.
- **Skrytá vrstva (oko) se neexportuje**; „při nahrávání skrýt ostatní“ je jen stav sezení
  (`soloWhileRecording`), do projektu se neukládá a exportu se netýká.
- **Mizení = ztmavení barvy, ne průhlednost.** Pozadí je vždy černé, úseky tahu se kreslí
  neprůhledně ztmavenou barvou v režimu `lighten` (maximum), jinak by překryvy kulatých konců
  dělaly světlé skvrny. Vrstvy se mezi sebou sčítají (`lighter`).
- **Canvas je softwarový** (`willReadFrequently: true`) v náhledu i exportu: stovky krátkých úseků
  s `lighten` jsou na GPU canvasu ~3× pomalejší. Záře se rozostřuje ve čtvrtinovém rozlišení,
  plné softwarové rozostření stálo ~40 ms na snímek.
- **Export:** ~20 snímků/s. Úzké hrdlo je předání 8 MB snímku přes IPC, proto jsou až 3 snímky
  na cestě zároveň (`MAX_FRAMES_IN_FLIGHT`).
- **Vyhlazení a tloušťky se počítají při vykreslení** a cachují ve `WeakMap` podle objektu tahu;
  zaznamenaná data zůstávají surová.
- **Úprava nikdy nemění existující objekt tahu ani ohňostroje — vždy ho ve vrstvě nahradí novým.**
  Na tom stojí dvě věci: cache vykreslení se tím sama zneplatní a stavy pro Zpět (které drží staré
  objekty) zůstanou nedotčené. Změna bodů na místě by rozbila obojí.
- **Křivka je nadstavba nad body, ne náhrada.** Tah s `curve` má dál `points` (z křivky dopočítané
  přes `params`, časy původní) a kreslí se stejným kódem; jen se už nevyhlazuje (`strokePositions`).
  Křivka se do tahu zapíše až první úpravou tvaru — pouhý výběr nebo přesun celé čáry ji nevytvoří
  (uzly se do té doby počítají jen pro zobrazení, z bodů vyhlazených aspoň na 25 %).
- **Atomický zápis na Windows:** přejmenování dočasného souboru selže, když cíl někdo právě čte
  (E2E test, antivir), proto `renamePatiently` v `main/index.ts` zkouší znovu. Bez toho byl E2E
  test občas nestabilní (příčina ověřena jen nepřímo — po opravě 3 běhy bez chyby).
- **Výběr v editoru může ukazovat na zaniklý prvek** (po Zpět, přepnutí vrstvy). Každá veřejná
  operace s výběrem v `editor.ts` proto nejdřív volá `validate()`; nová operace musí taky.
- **Pořadí volání `rand()` v `drawFirework` se nesmí měnit** — určuje vzhled uložených ohňostrojů.
- Spotify napojit nejde (export potřebuje soubor, stream je chráněný); uživatel potřebuje audio soubor.

## Příkazy

Windows, Node.js 24, npm 11. Závislosti jsou nainstalované (`npm install` jen po změně `package.json`).

```
npm run build      # sestavit do out/ (electron-vite)
npm start          # sestavit a spustit
npm run dev        # vývoj s automatickým obnovením
npm run typecheck  # tsc --noEmit
npm test           # jednotkové testy (vitest, tests/*.test.ts), ~1 s
npm run test:e2e   # celá pipeline ve skutečné aplikaci (Playwright + Electron), ~1–2 min,
                   # výstupy v tests/e2e/output; úspěch = konec "OK — obnovení ze zálohy" a exit 0
```

E2E test běží se ztlumeným zvukem a vlastní složkou dat (`--mute-audio`, `--user-data-dir`), aby
nehrál testovací tón a nesahal na zálohu uživatele. Po změně chování ho aktualizuj a spusť.
Testovací skladba má 8 s a nahrávání končí s ní: každý pohyb myši z Playwrightu trvá ~60 ms
(na vytíženém počítači i 2–3× déle), takže kreslení během nahrávání musí být krátké. Proto se
nahrává ve dvou průchodech a `assertRecording` hlídá, že skladba ještě hraje; nové kreslení
při nahrávání přidávej spíš jako další průchod (od `Home`) než do stávajícího.
Okno testu bere fokus: když uživatel během běhu píše nebo hýbe myší, test spadne (nesouvisí
se změnou) — E2E pouštěj, když se na počítači nepracuje (`GetLastInputInfo`).
Návratový kód kontroluj přímo (ne přes `| tail`, roura ho schová).

## Konvence

- TypeScript strict, vanilla DOM bez frameworku; žádné nové runtime závislosti bez úkolu.
- Názvy v kódu anglicky, komentáře, texty UI, testy (`describe`/`it`), commity a dokumentace česky.
- Komentáře jen tam, kde vysvětlují proč; krátké, ve stylu existujícího kódu.
- Vykreslení (`render/`) zůstává čistá funkce (vrstvy, čas) — žádný stav sezení, žádné `Date.now()`
  ani `Math.random()`; náhodnost jen z PRNG se seedem.
- Matematiku a datové operace piš jako čisté funkce s jednotkovými testy (`curve.ts` je vzor);
  UI a vstup ověřuje E2E (`tests/e2e/smoke.mjs`, stav aplikace se čte z DOM). Režim úprav
  se testuje přes falešný `EditorHost` v `tests/editor.test.ts` (Zpět jako v `main.ts`).
- Změna formátu `.khproj` = zvýšit verzi v `project.ts`, starší soubory musí jít dál načíst
  (test na načtení starší verze).

## Co nesahat

- Pořadí volání `rand()` ve `drawFirework` a formát seedu (vzhled uložených ohňostrojů).
- Princip „úprava nahrazuje objekt, nemění ho“ (viz výše) a souřadný prostor 1920×1080.
- Zpětná kompatibilita načítání `.khproj` verzí 1–3.
- `vizualizace_hudby_koncept_v3.md` / `.pdf` — původní koncept uživatele; do `.md` jen poznámka
  o stavu realizace, `.pdf` neměnit.
- Složky `node_modules/`, `out/`, `tests/e2e/output/` (generované) a uživatelova data
  v `%APPDATA%` (záloha projektu).
