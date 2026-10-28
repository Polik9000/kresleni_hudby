# Kreslení hudby

Desktopová aplikace (Electron + TypeScript) pro kreslení vizuálního doprovodu k hudbě: mizející stopa tahu
a ohňostroje nahrané synchronně se skladbou, export do MP4 s černým pozadím pro projekci.
Koncept a fázování: [vizualizace_hudby_koncept_v3.md](vizualizace_hudby_koncept_v3.md).

Stav: **fáze 1 a 2 jsou hotové, fáze 3 (úpravy čar) je rozpracovaná** — víc vrstev (overdub), posun vrstvy v čase, export v různých rozlišeních,
snímkových frekvencích a formátech, úpravy nahraných čar jako křivek s uzly.

## Spuštění

Potřeba je Node.js (vyvíjeno na verzi 24) a npm. ffmpeg se instaluje automaticky jako balíček
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
4. Další průchody nahrávají do vybrané vrstvy a přidávají k dřívějšímu záznamu. Celý průchod jde
   vrátit jedním **Zpět**.
5. Nahrané čáry jde doladit v režimu úprav (`E`, viz níže).
6. **Exportovat video** (`Ctrl+E`) vyrenderuje celou skladbu.

## Ovládání

| Akce | Ovládání |
| --- | --- |
| Kreslit čáru | tažení levým tlačítkem / perem |
| Kreslit bez tlačítka (touchpad) | držet `D` a hýbat kurzorem; `T` kreslení pohybem zapne/vypne natrvalo |
| Ohňostroj | klik bez tažení, pravé tlačítko, nebo `F` (v místě kurzoru); držení `F` sype proud menších ohňostrojů |
| Přehrát / pozastavit | mezerník |
| Nahrávat / zastavit (před nahráváním odpočet 3 s, jde zrušit) | `R` |
| Plátno na celou obrazovku (kurzor je zamčený v plátně, neodjede na druhý monitor) | `F11` (ukončení i `Esc`) |
| Na začátek | `Home` |
| Přetáčení | klik / tažení na časové ose |
| Předchozí / další vrstva | `↑` / `↓` (nebo klik v seznamu vrstev) |
| Posunout vrstvu v čase | pole „Posun v čase“, nebo `Shift` + tažení pruhu vrstvy na časové ose |
| Přiblížit / oddálit časovou osu | kolečko myši nad osou, `+` / `-`, tlačítka „Osa“; `Shift` + kolečko výřez posouvá |
| Režim úprav nahraných čar a ohňostrojů (viz níže) | `E` |
| Zpět / znovu (nahraný průchod, úprava, vymazání, přidání a smazání vrstvy) | `Ctrl+Z` / `Ctrl+Y` |
| Uložit / uložit jako / otevřít / nový | `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` / `Ctrl+N` |
| Export videa | `Ctrl+E` |
| Vývojářské nástroje | `F12` |

Při kreslení klávesou `D`/`T` se kliky na plátno ignorují (na touchpadu vznikají omylem),
ohňostroj jde jen klávesou `F`.

Mimo nahrávání se kreslí jen nanečisto (nic se neukládá). Nahrávání začíná od aktuální pozice
na časové ose a do vybrané vrstvy přidává — dřívější záznam nemaže.

**Vrstvy:** každá má vlastní název, vzhled a posun v čase. Při nahrávání se ostatní vrstvy
přehrávají jako reference; volba „Při nahrávání skrýt ostatní vrstvy“ je po dobu nahrávání schová.
Ikona oka vrstvu skryje úplně — skrytá vrstva není ani v exportu. Časová osa má pro každou vrstvu
vlastní pruh.

**Úpravy (`E`):** plátno přestane kreslit a místo toho vybírá. Vidět jsou obrysy čar a značky
ohňostrojů vybrané vrstvy, ale jen v **časovém okně** kolem přehrávací hlavy — u dlouhé čáry tedy
jen její část nakreslená v tomto čase. Co leží mimo okno (části čar, uzly, táhla, ohňostroje),
se nekreslí a nejde chytit. Okno je na časové ose modré pásmo, které jede s přehrávací hlavou;
tažením jeho levého okraje se mění, jak daleko sahá zpět, pravého jak daleko dopředu. Výchozí okno
odpovídá tomu, co je na plátně: zpět doba mizení vrstvy, dopředu 1 s. Nastavená šířka platí
do zavření aplikace (do projektu se neukládá); aktuální hodnoty ukazuje panel Úpravy.
Vybraná čára zůstává vybraná, i když z okna odjede — `Delete` a `Ctrl+C` s ní pracují dál.

| Akce v režimu úprav | Ovládání |
| --- | --- |
| Vybrat čáru nebo ohňostroj | klik |
| Přesunout celou čáru / ohňostroj | tažení (u vybrané čáry mimo uzly) |
| Změnit tvar čáry | tažení uzlu (čtvereček); časování kreslení zůstává |
| Změnit zakřivení | tažení táhla (kolečko) u vybraného uzlu; s `Alt` jen z jedné strany (roh) |
| Vybrat úsek čáry | klik na uzel, `Shift` + klik na druhý |
| Kopírovat / vložit na místo přehrávací hlavy | `Ctrl+C` / `Ctrl+V` (celá čára, vybraný úsek, ohňostroj) |
| Posunout vybrané v čase | pole „Začátek (s)“ v panelu |
| Smazat vybrané / zrušit výběr | `Delete` / `Esc` |
| Rozšířit / zúžit časové okno | tažení okraje modrého pásma na časové ose |

Čára se první úpravou tvaru převede na křivku; od té chvíle na ni už nepůsobí posuvník Vyhlazení.

## Export

- Rozlišení 1280×720, 1920×1080, 2560×1440 nebo 3840×2160 (4K), 24 / 25 / 30 / 50 / 60 snímků/s.
  Výchozí je 1080p, 30 fps. Volba se ukládá do projektu.
- Formáty: MP4 (H.264, CRF 17, AAC), MP4 (H.265, menší soubor), WebM (VP9, Opus) a MOV
  (ProRes 422 HQ, pro střih, velký soubor). Skrytá vrstva se neexportuje.
- Video se renderuje deterministicky snímek po snímku, ne nahráváním obrazovky: kvalita nezávisí
  na výkonu počítače a export vypadá jako náhled. Rychlost je kolem 20 snímků/s (1080p).
- Délka videa = délka skladby; bez audia se exportuje do konce posledního prvku.
- Export jde během renderu zrušit, nedokončený soubor se smaže.

## Nastavení vrstvy

| Nastavení | Rozsah | Výchozí |
| --- | --- | --- |
| Název vrstvy | text, max. 60 znaků | Vrstva 1, 2, … |
| Posun v čase | sekundy, záporný = dřív | 0 |
| Barva čáry | libovolná | modrá `#4db8ff` (nové vrstvy mají další barvy z palety) |
| Tloušťka: fixní / podle rychlosti (pomalý pohyb = tlustší čára) | 1–60 px | fixní, 8 px |
| Vyhlazení čáry | 0–100 % po 5 % | 50 % |
| Doba mizení stopy | 0,5–20 s po 0,5 s | 5 s |
| Záře | 0–100 % | 60 % |
| Barva ohňostroje | libovolná | žlutá `#ffc24d` |
| Velikost ohňostroje | 0,3–3× po 0,1 | 1× |

V panelu je dál počet nahraných tahů a ohňostrojů a tlačítka Zpět, Znovu a **Vymazat** (smaže vše
nahrané ve vrstvě, jde vrátit přes Zpět). Hlasitost přehrávání se do exportu nepromítá.

## Projekt a ukládání

- Projekt je soubor `.khproj` (JSON): vrstvy s nastavením, nahrané tahy a ohňostroje s časy,
  nastavení exportu a odkaz na audio. Samotné audio v projektu uložené není.
- Audio se při otevření hledá nejdřív relativně k projektu, pak na původní absolutní cestě, takže
  projekt přežije přesun celé složky i se skladbou. Když se nenajde, stačí ho importovat znovu.
- Změny se ukládají automaticky krátce po poslední úpravě. Uložený projekt se přepisuje na svém
  místě; projekt bez souboru se zálohuje do složky dat aplikace a po pádu se nabídne k obnovení.
- Ukládá se přes dočasný soubor, takže pád uprostřed zápisu projekt nepoškodí.


## Struktura

- `src/shared` — datový model a formát projektu `.khproj` (JSON)
- `src/main` — okno, souborové dialogy, ukládání a záloha, export přes ffmpeg (`exporter.ts`)
- `src/preload` — most mezi oknem a hlavním procesem (`window.kh`)
- `src/renderer/src/render` — vykreslení scény jako čistá funkce času (společné pro náhled i export)
- `src/renderer/src` — audio hodiny, časová osa, nahrávání a UI; `curve.ts` (prokládání tahu
  křivkou), `editor.ts` (režim úprav) a `timeWindow.ts` (časové okno úprav)

## Testy

```
npm run typecheck
npm test          # jednotkové testy (vitest, `tests/*.test.ts`)
npm run test:e2e  # projde celou pipeline ve skutečné aplikaci (výstupy v tests/e2e/output)
```

E2E test spustí aplikaci se ztlumeným zvukem a vlastní složkou dat. Naimportuje testovací audio,
nahraje tahy a ohňostroje (i přes `D`), ověří Zpět/Znovu, vrstvy, režim úprav, uložení, automatické
ukládání a zálohu, celou obrazovku a export (1080p H.264, 720p WebM). Nakonec projekt znovu načte
a vyzkouší obnovení po pádu. Za běhu na počítači nepracuj — okno testu bere fokus.

## Neověřeno na skutečném hardwaru

Jen simulovanou myší v testu: zámek kurzoru s druhým monitorem a s perem/tabletem, kreslení `D`/`T`
na skutečném touchpadu, překryv načítání u dlouhé skladby a export 4K, H.265 a ProRes.
