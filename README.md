# Kreslení hudby

Desktopová aplikace (Electron) pro kreslení vizuálního doprovodu k hudbě: mizející stopa tahu
a ohňostroje nahrané synchronně se skladbou, export do MP4 s černým pozadím pro projekci.
Koncept a fázování: [vizualizace_hudby_koncept_v3.md](vizualizace_hudby_koncept_v3.md).

Stav: **fáze 3** — víc vrstev (overdub), posun vrstvy v čase, export v různých rozlišeních,
snímkových frekvencích a formátech, úpravy nahraných čar jako křivek s uzly.

## Spuštění

```
npm install
npm start        # sestaví a spustí aplikaci
npm run dev      # vývojový režim s automatickým obnovením
```

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
| Předchozí / další vrstva | `↑` / `↓` (nebo klik v seznamu vrstev) |
| Posunout vrstvu v čase | pole „Posun v čase“, nebo `Shift` + tažení pruhu vrstvy na časové ose |
| Přiblížit / oddálit časovou osu | kolečko myši nad osou, `+` / `-`, tlačítka „Osa“; `Shift` + kolečko výřez posouvá |
| Režim úprav nahraných čar a ohňostrojů (viz níže) | `E` |
| Zpět / znovu (nahraný průchod, úprava, vymazání, přidání a smazání vrstvy) | `Ctrl+Z` / `Ctrl+Y` |
| Uložit / uložit jako / otevřít / nový | `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` / `Ctrl+N` |
| Export videa | `Ctrl+E` |

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

**Export:** rozlišení 720p až 4K, 24–60 snímků/s, formáty MP4 (H.264 nebo H.265), WebM (VP9)
a MOV (ProRes 422 HQ). Volba se ukládá do projektu.

Změny se ukládají automaticky: uložený projekt se přepisuje na svém místě, projekt bez souboru
se zálohuje do složky aplikace a po pádu se nabídne k obnovení.

## Struktura

- `src/shared` — datový model a formát projektu `.khproj` (JSON)
- `src/main` — okno, souborové dialogy, export přes ffmpeg (`exporter.ts`)
- `src/renderer/src/render` — vykreslení scény jako čistá funkce času (společné pro náhled i export)
- `src/renderer/src` — audio hodiny, časová osa, nahrávání a UI; `curve.ts` (prokládání tahu
  křivkou), `editor.ts` (režim úprav) a `timeWindow.ts` (časové okno úprav)

## Testy

```
npm run typecheck
npm test          # jednotkové testy
npm run test:e2e  # projde celou pipeline ve skutečné aplikaci (výstupy v tests/e2e/output)
```
