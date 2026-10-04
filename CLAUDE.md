# Kreslení hudby — stav projektu

Desktopová aplikace (Electron + TypeScript) pro kreslení vizuálního doprovodu k hudbě a export
do MP4. Koncept a fázování: `vizualizace_hudby_koncept_v3.md`. Ovládání a spuštění: `README.md`.
S uživatelem se komunikuje česky, UI aplikace je česky. README je uživatelská dokumentace
(ovládání, nastavení, export, plán). Po změně chování ho aktualizuj spolu s tímto souborem.

## Kde jsme (stav k 4. 10. 2026)

**Fáze 1 (MVP) je hotová** a rozšířená o věci, které si uživatel vyžádal při zkoušení.
**Další krok: fáze 2** (víc vrstev, overdub, skrytí/smazání vrstvy, posun vrstvy v čase,
další rozlišení/fps/formáty exportu).

Hotovo:
- import a přehrávání audia (s překryvem „Načítám audio…“), časová osa s waveformem a přetáčením
- kreslení mizející stopy, tloušťka fixní / podle rychlosti, vyhlazení čáry, záře, ohňostroje
- nahrávání synchronní s audiem po odpočtu 3 s; nahrávání do vrstvy přidává, Zpět/Znovu po průchodech
- kreslení nanečisto mimo nahrávání (neukládá se)
- kreslení bez tlačítka pro touchpad: držet `D`, nebo `T` jako přepínač; během něj se kliky ignorují
  a ohňostroj jde jen klávesou `F`
- celá obrazovka (`F11`) se zámkem kurzoru v plátně (pointer lock + vlastní křížek)
- projekt `.khproj`, automatické ukládání, záloha neuloženého projektu s nabídkou obnovení po startu
- export 1920×1080 / 30 fps / MP4 H.264 + AAC, snímek po snímku přes ffmpeg

Odloženo na další verzi (uživatel o to stál, ale ne hned):
- vyhlazení přepínané během kreslení: nízký základ (~5 %) a při držení klávesy jiná hodnota
  (0 % nebo nastavené minimum) jen pro právě kreslený úsek — vyhlazení tedy po úsecích, ne po vrstvě
- jemnější kroky posuvníků: vyhlazení bez skoků po 5 %, doba mizení bez skoků po 0,5 s
- nabídnuto a nerozhodnuto: metronom (tiché klepání jen při nahrávání), přehrání 3 s hudby během
  odpočtu, instalátor `.exe`

Neověřeno na skutečném hardwaru (jen simulovanou myší v testu): zámek kurzoru s druhým monitorem
a s perem/tabletem, kreslení `D`/`T` na skutečném touchpadu, překryv načítání u dlouhé skladby.

## Architektura

- `src/shared/types.ts` — datový model (`Project` → `Layer[]` → `strokes`, `fireworks`, `style`)
  a rozhraní IPC `KhApi`. Souřadnice jsou v logickém prostoru 1920×1080, časy v sekundách skladby.
- `src/shared/project.ts` — výchozí hodnoty, (de)serializace `.khproj`. Body tahu jsou v souboru
  jako plochá pole `[x, y, t, …]`. Chybějící položky stylu se doplní z `DEFAULT_STYLE`.
- `src/main/index.ts` — okno (bez nativního menu, `F12` = devtools), dialogy, čtení/zápis souborů
  (zápis přes dočasný soubor, zápisy jdou za sebou), záloha `neulozeny-projekt.khproj` v `userData`.
  Audio projektu se hledá nejdřív přes `relativePath` (doplňuje ho hlavní proces při uložení),
  pak na absolutní cestě. Podporované přípony audia: `AUDIO_EXTENSIONS`.
- `src/main/exporter.ts` — ffmpeg (`ffmpeg-static`): surové RGBA snímky na stdin + audio jako
  druhý vstup. Formáty jsou tabulka `FORMATS`; nový formát = nová položka.
- `src/preload/index.ts` — most `window.kh` (contextIsolation, sandbox).
- `src/renderer/src/render/` — vykreslení scény jako **čistá funkce (vrstvy, čas)**, společná pro
  náhled i export: `scene.ts` (skládání vrstev, záře), `stroke.ts` (stopa, tloušťky, vyhlazení),
  `fireworks.ts` (částice z PRNG se seedem).
- `src/renderer/src/audio.ts` — Web Audio; hodiny AudioContextu jsou jediný zdroj času,
  kompenzuje se výstupní latence.
- `src/renderer/src/main.ts` — stav aplikace, vstup, nahrávání, autosave, UI. Vanilla TS bez frameworku.
- `src/renderer/src/timeline.ts`, `exportVideo.ts` — časová osa, smyčka exportu.

## Rozhodnutí a pasti, které nejsou z kódu zřejmé

- **Datový model už má pole vrstev**, ale `main.ts` pracuje jen s `project.layers[0]` (funkce
  `layer()`), stejně tak Zpět/Znovu (`Snapshot` jedné vrstvy) a panel nastavení. To je hlavní
  místo, které fáze 2 mění. `SceneRenderer.render` a časová osa už víc vrstev zvládají.
- **Mizení = ztmavení barvy, ne průhlednost.** Pozadí je vždy černé, úseky tahu se kreslí
  neprůhledně ztmavenou barvou v režimu `lighten` (maximum), jinak by překryvy kulatých konců
  dělaly světlé skvrny. Vrstvy se mezi sebou sčítají (`lighter`).
- **Canvas je softwarový** (`willReadFrequently: true`) v náhledu i exportu: stovky krátkých úseků
  s `lighten` jsou na GPU canvasu ~3× pomalejší. Záře se rozostřuje ve čtvrtinovém rozlišení,
  plné softwarové rozostření stálo ~40 ms na snímek.
- **Export:** ~20 snímků/s. Úzké hrdlo je předání 8 MB snímku přes IPC, proto jsou až 3 snímky
  na cestě zároveň (`MAX_FRAMES_IN_FLIGHT`).
- **Vyhlazení a tloušťky se počítají při vykreslení** a cachují ve `WeakMap` podle objektu tahu;
  zaznamenaná data zůstávají surová. Při editaci bodů (fáze 3) je potřeba cache zneplatnit.
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
