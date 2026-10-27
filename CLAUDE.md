# Kreslení hudby — stav projektu

Desktopová aplikace (Electron + TypeScript) pro kreslení vizuálního doprovodu k hudbě a export
do MP4. Koncept a fázování: `vizualizace_hudby_koncept_v3.md`. Ovládání a spuštění: `README.md`.
S uživatelem se komunikuje česky, UI aplikace je česky.

## Kde jsme (stav k 2. 10. 2026)

**Fáze 1 (MVP), 2 (vrstvy, export) a 3 (úpravy křivek) jsou hotové.** Fáze 2 a 3 uživatel
skoro nezkoušel („dá se to upravit i pak“) — čekej připomínky k ovládání vrstev a režimu úprav.
**Další krok:** připomínky ze zkoušení, odložené věci níže, případně nezávazný nápad „pohyblivé
plátno“ z konceptu.

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

Ve fázi 3 záměrně chybí: přidání a smazání jednotlivého uzlu, rozdělení čáry, výběr víc prvků
najednou, úpravy ve víc vrstvách zároveň.

Odloženo na další verzi (uživatel o to stál, ale ne hned):
- vyhlazení přepínané během kreslení: nízký základ (~5 %) a při držení klávesy jiná hodnota
  (0 % nebo nastavené minimum) jen pro právě kreslený úsek — vyhlazení tedy po úsecích, ne po vrstvě
- jemnější kroky posuvníků: vyhlazení bez skoků po 5 %, doba mizení bez skoků po 0,5 s
- nabídnuto a nerozhodnuto: metronom (tiché klepání jen při nahrávání), přehrání 3 s hudby během
  odpočtu, instalátor `.exe`

Neověřeno na skutečném hardwaru (jen simulovanou myší v testu): zámek kurzoru s druhým monitorem
a s perem/tabletem, kreslení `D`/`T` na skutečném touchpadu, překryv načítání u dlouhé skladby.
Režim úprav zkoušel jen E2E test na jedné vlnovce (úprava uzlu, přesun, kopie, smazání, Zpět);
táhla, výběr úseku a posun ohňostroje jsou pokryté jen jednotkovými testy nebo vůbec.
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
- **Pořadí volání `rand()` v `drawFirework` se nesmí měnit** — určuje vzhled uložených ohňostrojů.
- Spotify napojit nejde (export potřebuje soubor, stream je chráněný); uživatel potřebuje audio soubor.

## Příkazy

```
npm start          # sestavit a spustit
npm run dev        # vývoj s automatickým obnovením
npm run typecheck
npm test           # jednotkové testy (vitest)
npm run test:e2e   # celá pipeline ve skutečné aplikaci (Playwright + Electron), výstupy v tests/e2e/output
```

E2E test běží se ztlumeným zvukem a vlastní složkou dat (`--mute-audio`, `--user-data-dir`), aby
nehrál testovací tón a nesahal na zálohu uživatele. Po změně chování ho aktualizuj a spusť.
