# Kreslení hudby

Desktopová aplikace (Electron + TypeScript) pro kreslení vizuálního doprovodu k hudbě: mizející
stopa tahu a ohňostroje nahrané synchronně se skladbou, export do MP4 s černým pozadím pro projekci.
Koncept a fázování: [vizualizace_hudby_koncept_v3.md](vizualizace_hudby_koncept_v3.md).

Stav: **fáze 1 (MVP) je hotová**. Aplikace pracuje s jednou vrstvou a zvládá celou pipeline
od importu audia přes nahrání po export. Další na řadě je fáze 2 (víc vrstev), viz [Plán](#plán).

## Spuštění

Potřeba je Node.js (vyvíjeno na verzi 22) a npm. ffmpeg se instaluje automaticky jako balíček
`ffmpeg-static`, nic dalšího se instalovat nemusí.

```
npm install
npm start        # sestaví a spustí aplikaci
npm run dev      # vývojový režim s automatickým obnovením
```

## Jak se s aplikací pracuje

1. **Importovat audio** (MP3, WAV, OGG, FLAC, M4A, AAC, Opus). U dlouhé skladby se po dobu
   načítání ukáže překryv „Načítám audio…“. Kreslit jde i bez audia, čas pak běží jako tiché hodiny.
2. V panelu vpravo nastavit vzhled vrstvy. Nastavení jde měnit kdykoli, i po nahrání, protože se
   uplatní při vykreslení a nahraná data se tím nemění.
3. Klávesou `R` nebo tlačítkem **● Nahrát** spustit nahrávání: po odpočtu 3 s se rozehraje skladba
   od aktuální pozice na časové ose a všechno nakreslené se ukládá s časem skladby. Nahrávání
   končí dalším `R`, mezerníkem, nebo samo s koncem skladby.
4. Další průchody nahrávají do stejné vrstvy a přidávají k dřívějšímu záznamu. Celý průchod jde
   vrátit jedním **Zpět**.
5. **Exportovat video** (`Ctrl+E`) vyrenderuje celou skladbu do MP4.

Mimo nahrávání se kreslí jen nanečisto, takže si jde vyzkoušet pohyb nebo nastavení. Nic z toho
se neukládá.

## Ovládání

| Akce | Ovládání |
| --- | --- |
| Kreslit čáru | tažení levým tlačítkem / perem |
| Kreslit bez tlačítka (touchpad) | držet `D` a hýbat kurzorem; `T` kreslení pohybem zapne/vypne natrvalo |
| Ohňostroj | klik bez tažení, pravé tlačítko, nebo `F` (v místě kurzoru; při kreslení přes `D`/`T` jen `F`) |
| Přehrát / pozastavit | mezerník |
| Nahrávat / zastavit (před nahráváním odpočet 3 s, jde zrušit) | `R` |
| Plátno na celou obrazovku (kurzor je zamčený v plátně, neodjede na druhý monitor) | `F11` (ukončení i `Esc`) |
| Na začátek | `Home` |
| Přetáčení | klik / tažení na časové ose |
| Zpět / znovu (celý nahraný průchod) | `Ctrl+Z` / `Ctrl+Y` (nebo `Ctrl+Shift+Z`) |
| Uložit / uložit jako / otevřít / nový | `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` / `Ctrl+N` |
| Export videa | `Ctrl+E` |
| Vývojářské nástroje | `F12` |

Při kreslení klávesou `D`/`T` se kliky na plátno ignorují, protože na touchpadu vznikají omylem.

## Nastavení vrstvy

| Nastavení | Rozsah | Výchozí |
| --- | --- | --- |
| Název vrstvy | text | Vrstva 1 |
| Barva čáry | libovolná | modrá `#4db8ff` |
| Tloušťka: fixní / podle rychlosti (pomalý pohyb = tlustší čára) | 1–60 px | fixní, 8 px |
| Vyhlazení čáry | 0–100 % po 5 % | 50 % |
| Doba mizení stopy | 0,5–20 s po 0,5 s | 5 s |
| Záře | 0–100 % | 60 % |
| Barva ohňostroje | libovolná | žlutá `#ffc24d` |
| Velikost ohňostroje | 0,3–3× | 1× |

V panelu je dál počet nahraných tahů a ohňostrojů a tlačítka Zpět, Znovu a **Vymazat**, které smaže
vše nahrané ve vrstvě (jde vrátit přes Zpět). Hlasitost přehrávání je u ovládání přehrávání; do
exportu se nepromítá.

## Projekt a ukládání

- Projekt je soubor `.khproj` (JSON): vrstvy s nastavením, nahrané tahy a ohňostroje s časy a odkaz
  na audio. Samotné audio v projektu uložené není.
- Audio se při otevření hledá nejdřív relativně k projektu, pak na původní absolutní cestě, takže
  projekt přežije přesun celé složky i se skladbou. Když se audio nenajde, aplikace to ohlásí
  a stačí ho importovat znovu.
- Změny se ukládají automaticky asi 1 s po poslední úpravě. Uložený projekt se přepisuje na svém
  místě. Projekt bez souboru se zálohuje do složky dat aplikace a po pádu se při příštím spuštění
  nabídne k obnovení.
- Ukládá se přes dočasný soubor, takže pád uprostřed zápisu projekt nepoškodí.

## Export

- 1920×1080, 30 fps, MP4 (H.264, CRF 17, barvy bt709) + AAC 256 kb/s.
- Video se renderuje deterministicky snímek po snímku, ne nahráváním obrazovky. Kvalita tedy
  nezávisí na výkonu počítače a export vypadá stejně jako náhled. Rychlost je kolem 20 snímků/s.
- Délka videa = délka skladby. Bez audia se exportuje do konce posledního prvku.
- Export jde během renderu zrušit, nedokončený soubor se smaže.

## Plán

- **Fáze 2:** víc pojmenovaných vrstev, overdub nahrávání s možností schovat předchozí vrstvy,
  zobrazení/skrytí/smazání vrstvy, posun celé vrstvy v čase, další rozlišení/fps/formáty exportu.
- **Odloženo:** vyhlazení přepínané klávesou během kreslení (po úsecích tahu), jemnější kroky
  posuvníků vyhlazení a doby mizení.
- **Nerozhodnuto:** metronom při nahrávání, přehrání 3 s hudby během odpočtu, instalátor `.exe`.
- **Fáze 3:** editace tahů jako vektorových křivek, posun jednotlivého ohňostroje,
  kopírování částí čáry.

Zatím ověřeno jen simulovanou myší v testu, ne na skutečném hardwaru: zámek kurzoru s druhým
monitorem a s perem/tabletem, kreslení `D`/`T` na skutečném touchpadu a překryv načítání
u dlouhé skladby.

## Struktura

- `src/shared` — datový model a formát projektu `.khproj` (JSON)
- `src/main` — okno, souborové dialogy, ukládání a záloha, export přes ffmpeg (`exporter.ts`)
- `src/preload` — most mezi oknem a hlavním procesem (`window.kh`)
- `src/renderer/src/render` — vykreslení scény jako čistá funkce času (společné pro náhled i export)
- `src/renderer/src` — audio hodiny, časová osa, nahrávání a UI
- `tests` — jednotkové testy (`core.test.ts`) a end-to-end test (`e2e/smoke.mjs`)

## Testy

```
npm run typecheck
npm test          # jednotkové testy (vitest)
npm run test:e2e  # projde celou pipeline ve skutečné aplikaci (výstupy v tests/e2e/output)
```

E2E test spustí aplikaci se ztlumeným zvukem a vlastní složkou dat. Postupně naimportuje
testovací audio, nahraje tahy a ohňostroje (i přes `D`), ověří Zpět/Znovu, uložení, automatické
ukládání a zálohu, celou obrazovku a export do MP4. Nakonec projekt znovu načte a vyzkouší
obnovení neuloženého projektu po pádu.
