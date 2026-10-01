# Kreslení hudby

Desktopová aplikace (Electron) pro kreslení vizuálního doprovodu k hudbě: mizející stopa tahu
a ohňostroje nahrané synchronně se skladbou, export do MP4 s černým pozadím pro projekci.
Koncept a fázování: [vizualizace_hudby_koncept_v3.md](vizualizace_hudby_koncept_v3.md).

Stav: **fáze 1 (MVP)** — jedna vrstva, celá pipeline od nahrání po export.

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
| Ohňostroj | klik bez tažení, pravé tlačítko, nebo `F` (v místě kurzoru) |
| Přehrát / pozastavit | mezerník |
| Nahrávat / zastavit (před nahráváním odpočet 3 s, jde zrušit) | `R` |
| Plátno na celou obrazovku (kurzor je zamčený v plátně, neodjede na druhý monitor) | `F11` (ukončení i `Esc`) |
| Na začátek | `Home` |
| Zpět / znovu (celý nahraný průchod) | `Ctrl+Z` / `Ctrl+Y` |
| Uložit / uložit jako / otevřít / nový | `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O` / `Ctrl+N` |
| Export videa | `Ctrl+E` |

Mimo nahrávání se kreslí jen nanečisto (nic se neukládá). Nahrávání začíná od aktuální pozice
na časové ose a do vrstvy přidává — dřívější záznam nemaže.

Změny se ukládají automaticky: uložený projekt se přepisuje na svém místě, projekt bez souboru
se zálohuje do složky aplikace a po pádu se nabídne k obnovení.

## Struktura

- `src/shared` — datový model a formát projektu `.khproj` (JSON)
- `src/main` — okno, souborové dialogy, export přes ffmpeg (`exporter.ts`)
- `src/renderer/src/render` — vykreslení scény jako čistá funkce času (společné pro náhled i export)
- `src/renderer/src` — audio hodiny, časová osa, nahrávání a UI

## Testy

```
npm run typecheck
npm test          # jednotkové testy
npm run test:e2e  # projde celou pipeline ve skutečné aplikaci (výstupy v tests/e2e/output)
```
