# TODO — Kreslení hudby

Úkoly seřazené podle priority. Každý jde udělat samostatně v jedné session. Postup práce
(odškrtnutí, poznámka, commit, push) popisuje `CLAUDE.md`, sekce „Samostatná práce“.

Značky: velikost **S** / **M** / **L**; **[PARALELNĚ]** = nesahá na soubory, které mění ostatní
úkoly, takže jde dělat souběžně (v jiném worktree). Úkoly bez značky mění hlavně
`src/renderer/src/main.ts` nebo `editor.ts` a dělají se postupně, v pořadí.

Společné akceptační kritérium každého úkolu (dál se neopakuje): `npm run typecheck`, `npm test`
a `npm run test:e2e` projdou, README a CLAUDE.md odpovídají novému chování.

---

## Úkoly

### 1. [ ] Stabilita E2E testu — S
- **Cíl:** E2E test jednou (27. 10.) selhal v kroku kreslení klávesou `D`:
  `smoke.mjs:146` čekal „2 tahů“, dostal „1 tahů“. Napodruhé prošel. Najít příčinu
  a odstranit ji. Hypotéza: krátké testovací audio dohraje a nahrávání skončí dřív, než se
  tah přes `D` stihne zapsat, když je počítač vytížený (běžely souběžně jiné příkazy).
- **Soubory:** `tests/e2e/smoke.mjs`, případně `src/renderer/src/main.ts` (jen pokud jde o chybu aplikace).
- **Hotovo, když:** `npm run test:e2e` projde 5× za sebou; v poznámce je popsaná příčina
  (nebo že se nepodařilo reprodukovat a co se zpevnilo).

### 2. [ ] Jednotkové testy režimu úprav — M — [PARALELNĚ]
- **Cíl:** pokrýt části režimu úprav, které zkoušel jen E2E nebo nikdo: táhla (zrcadlení,
  `Alt` = roh), výběr úseku mezi uzly a jeho kopie, kopie/vložení celé čáry a ohňostroje
  na místo přehrávací hlavy, přesun ohňostroje, posun prvku v čase („Začátek (s)“), Delete,
  a to, že úprava vždy nahradí objekt tahu novým (původní objekt se nezmění).
- **Soubory:** nový `tests/editor.test.ts` s falešným `EditorHost`. `editor.ts` měnit jen
  minimálně (např. export pomocné funkce), aby úkol nekolidoval s úkolem 3.
- **Hotovo, když:** nové testy procházejí a pokrývají všechny výše uvedené operace
  včetně návratu přes Zpět (snapshot hostitele).

### 3. [ ] Časové okno v režimu úprav — L
- **Cíl (připomínka uživatele):** v režimu úprav je teď vidět obrys celé čáry, dokud je
  kterákoli její část živá — u dlouhého tahu tedy vše nakreslené od začátku a nedá se v tom
  vyznat. Nově:
  - na plátně jsou jen **úseky čar** (a ohňostroje), jejichž body leží v okně
    `[čas − zpět, čas + dopředu]` kolem přehrávací hlavy; uzly a táhla mimo okno se nekreslí
    a nejdou chytit,
  - výchozí okno = to, co je právě na plátně: zpět = doba mizení aktivní vrstvy,
    dopředu = dnešní `LEAD_SECONDS` (1 s),
  - na časové ose je v režimu úprav zvýrazněné pásmo okna; jeho dva okraje jdou táhnout myší
    a tím měnit „zpět“ a „dopředu“; šířka se pamatuje po dobu sezení (do projektu se neukládá)
    a pásmo jede s přehrávací hlavou,
  - vybraná čára mimo okno zůstává vybraná (kvůli Delete/Ctrl+C), ale kreslí se jen její část v okně.
- **Soubory:** `src/renderer/src/editor.ts`, `src/renderer/src/timeline.ts`, `main.ts`
  (propojení), `styles.css`, `tests/`.
- **Hotovo, když:** čistá funkce pro výřez tahu podle časového okna má jednotkové testy
  (tah celý v okně, částečně, mimo, posun vrstvy `offset`); E2E nakreslí dlouhý tah,
  v režimu úprav ověří, že klik na jeho část mimo okno nic nevybere a tažení okraje pásma
  okno rozšíří (stav vystavit pro test stejně jako jiné stavy v `smoke.mjs`).

### 4. [ ] README z větve `ccr` a úklid větví — S — [PARALELNĚ]
- **Cíl:** z větve `origin/ccr-4a7bd951-02x0mu` (dokumentace ze 4. 10., stav po fázi 1)
  převzít do README užitečné části a **aktualizovat je na stav po fázi 3**: požadavky
  (Node.js, npm, ffmpeg se instaluje sám), „Jak se s aplikací pracuje“ krok za krokem,
  tabulka nastavení vrstvy (rozsahy, výchozí hodnoty — ověřit v `index.html`
  a `DEFAULT_STYLE`), „Projekt a ukládání“, „Export“ (všechny formáty), popis E2E testu.
  Do `vizualizace_hudby_koncept_v3.md` doplnit krátkou poznámku o stavu realizace
  (fáze 1–3 hotové) po vzoru té větve. Pak smazat větve `ccr-4a7bd951-02x0mu`
  a `faze-1-mvp` lokálně i na GitHubu (`git push origin --delete …`) — uživatel to schválil.
- **Soubory:** `README.md`, `vizualizace_hudby_koncept_v3.md`. Obsah větve:
  `git diff main...origin/ccr-4a7bd951-02x0mu`.
- **Hotovo, když:** README popisuje aktuální ovládání včetně vrstev, režimu úprav a exportu;
  `git branch -a` už obě větve neukazuje. Pokud už předtím jiný úkol změnil README, sloučit, nepřepsat.

### 5. [ ] Ověření exportních formátů a rozlišení — M — [PARALELNĚ]
- **Cíl:** formáty H.265, ProRes a 4K nikdo z aplikace nespustil. Napsat test, který přes
  `src/main/exporter.ts` (stejné argumenty ffmpeg jako aplikace) zakóduje pár syntetických
  snímků + krátké audio v každém formátu z `EXPORT_FORMATS` a v rozlišení 720p i 4K,
  a ověří výstup (`ffmpeg -i` z `ffmpeg-static`: kodek, rozlišení, fps, audio stopa, délka).
- **Soubory:** nový `tests/exporter.test.ts` (nebo samostatný skript `tests/export-formats.mjs`
  + příkaz v `package.json`, pokud vitest neumí běžet s Electronem), případně oprava `exporter.ts`.
- **Hotovo, když:** test projde pro všechny kombinace formát × {720p, 4K}; nalezené chyby
  v argumentech ffmpeg jsou opravené.

### 6. [ ] Odolnost načítání projektu — S — [PARALELNĚ]
- **Cíl:** poškozený nebo ručně upravený `.khproj` nesmí aplikaci shodit ani tiše ztratit data.
  Ověřit `deserializeProject` na: neplatném JSON, chybějících polích vrstev, `NaN`/textu
  v bodech, prázdném tahu, liché délce plochého pole bodů, chybějícím `seed` ohňostroje.
  Chybná položka se přeskočí nebo nahradí výchozí hodnotou, celý soubor se odmítne jen tehdy,
  když nejde rozumně načíst nic.
- **Soubory:** `src/shared/project.ts`, `tests/core.test.ts` (nebo nový `tests/project.test.ts`).
- **Hotovo, když:** každý případ výše má test.

### 7. [ ] Přidání a smazání uzlu křivky — M
- **Cíl:** v režimu úprav dvojklik na vybranou čáru přidá uzel v tom místě (bez změny tvaru
  — rozdělení Bézierova oblouku de Casteljauem); `Delete` s vybraným uzlem smaže uzel
  (sousední oblouky se spojí a proloží), bez vybraného uzlu maže celý prvek jako dnes.
  Časy bodů zůstávají; `params` se přepočítají. Jde vrátit přes Zpět.
- **Soubory:** `src/renderer/src/curve.ts`, `editor.ts`, `tests/`.
- **Hotovo, když:** jednotkové testy: přidání uzlu nezmění dopočítané body (odchylka < 0,5 px),
  smazání uzlu sníží počet uzlů o 1 a zachová časy; u čáry se 2 uzly smazání uzlu nic
  neudělá (čára se maže až bez vybraného uzlu); chování je popsané v README.

### 8. [ ] Rozdělení čáry — S
- **Cíl:** v režimu úprav rozdělí klávesa (navrženo `X`, ověřit, že není obsazená)
  vybranou čáru ve vybraném uzlu na dva samostatné tahy (využít výřez mezi uzly z `curve.ts`).
  Jde vrátit přes Zpět.
- **Soubory:** `src/renderer/src/editor.ts`, `curve.ts`, `main.ts` (klávesa), `tests/`.
- **Hotovo, když:** jednotkový test: dva tahy dohromady mají stejné body a časy jako původní
  (dělicí bod je v obou); E2E rozdělí vlnovku a ověří počet tahů.

### 9. [ ] Výběr víc prvků — L
- **Cíl:** v režimu úprav `Ctrl` + klik přidá/odebere prvek z výběru, tažení obdélníku
  na prázdném místě vybere prvky (jen ty viditelné v časovém okně z úkolu 3). S výběrem víc
  prvků jde: přesun tažením, Delete, Ctrl+C/Ctrl+V (relativní časy zachovat, vloží se
  od přehrávací hlavy), pole „Začátek (s)“ posune celou skupinu. Uzly se ukazují jen při
  výběru jedné čáry. Jen v rámci aktivní vrstvy.
- **Soubory:** `src/renderer/src/editor.ts`, `main.ts`, `styles.css`, `tests/`.
- **Hotovo, když:** jednotkové testy pro skupinový přesun, kopii a posun v čase (jeden krok
  Zpět vrátí celou skupinovou operaci); E2E vybere dva prvky obdélníkem a smaže je.
- **Závisí na:** úkolu 3 (časové okno).

### 10. [ ] Vyhlazení přepínané klávesou `S` — L
- **Cíl (odložené přání uživatele):** ve vrstvě nový posuvník „Vyhlazení při držení S“
  (výchozí 0 %). Úsek tahu nakreslený při drženém `S` se vyhladí touto hodnotou, zbytek
  základním vyhlazením vrstvy. Nová vrstva má základ 5 % (dnes 50 %); existující projekty
  si svou hodnotu nechají. Funguje při nahrávání i nanečisto, s myší i s `D`/`T`.
- **Návrh dat:** tah si pamatuje úseky (rozsahy indexů bodů) kreslené s `S`; vyhlazení
  v `stroke.ts` pracuje po úsecích a na hranicích úseků nesmí čára skočit. Formát projektu
  verze 4, starší soubory se načtou bez úseků. Cache v `WeakMap` dál podle objektu tahu.
  Křivky (`curve`) se vyhlazením neřídí — beze změny.
- **Soubory:** `src/shared/types.ts`, `src/shared/project.ts`, `src/renderer/src/render/stroke.ts`,
  `main.ts` (klávesa, panel), `index.html`, `tests/`.
- **Hotovo, když:** jednotkové testy: úsek s 0 % vrací přesně zaznamenané body, zbytek je
  vyhlazený, hranice úseků je spojitá, postupné doplňování při nahrávání = výpočet najednou,
  uložení/načtení zachová úseky, soubor verze 3 se načte; E2E nakreslí tah s drženým `S`.

### 11. [ ] Jemnější kroky posuvníků — S
- **Cíl (odložené přání uživatele):** vyhlazení po 1 % (dnes 5 %), doba mizení po 0,1 s
  (dnes 0,5 s). Zobrazená hodnota u posuvníku tomu odpovídá. Platí i pro nový posuvník
  z úkolu 10, pokud už existuje.
- **Soubory:** `src/renderer/index.html`, `main.ts` (formátování hodnot), README (tabulka nastavení).
- **Hotovo, když:** E2E nastaví vyhlazení 7 % a mizení 2,3 s a po uložení a znovunačtení
  projektu hodnoty sedí.

### 12. [ ] Hudba během odpočtu — M
- **Cíl:** během 3 s odpočtu před nahráváním hraje hudba od místa 3 s před startem nahrávání
  (předehra), aby šlo chytit tempo. Kreslit se ukládá až od startu. Když je start blíž než
  3 s od začátku skladby, předehra začne od 0 s (odpočet trvá dál 3 s, hudba začne později).
  Zrušení odpočtu hudbu zastaví a vrátí přehrávací hlavu na původní místo.
- **Soubory:** `src/renderer/src/main.ts` (`beginCountdown`, `cancelCountdown`),
  `src/renderer/src/audio.ts`, `tests/e2e/smoke.mjs`.
- **Hotovo, když:** E2E ověří, že během odpočtu běží čas skladby, první zaznamenaný bod
  nemá čas menší než start nahrávání a zrušený odpočet vrátí hlavu zpět.

### 13. [ ] Výkon u dlouhé skladby — M
- **Cíl:** zjistit, jak se náhled, režim úprav a export chovají u 10minutové skladby
  s ~2000 tahy a ~1000 ohňostroji ve 3 vrstvách (vygenerovaný projekt). Pokud vykreslení
  snímku náhledu trvá > 16 ms nebo export klesne pod 10 snímků/s, optimalizovat (např.
  index tahů podle času místo procházení všech v `scene.ts` a v `editor.ts`).
- **Soubory:** `src/renderer/src/render/scene.ts`, `editor.ts`, nový benchmark v `tests/`.
- **Hotovo, když:** v poznámce jsou naměřená čísla před/po; vzhled snímků se nezměnil
  (porovnat pixely snímků před a po optimalizaci).

### 14. [ ] Rozdělení `main.ts` do modulů — L
- **Cíl:** `main.ts` má ~1200 řádků. Vyčlenit samostatné celky (panel vrstev, vstup a klávesy,
  nahrávání a odpočet, ukládání/autosave) do modulů po vzoru `editor.ts` (rozhraní hostitele).
  Čistý refaktoring — žádná změna chování.
- **Soubory:** `src/renderer/src/main.ts` + nové moduly v `src/renderer/src/`.
- **Hotovo, když:** E2E projde 3× za sebou beze změny testu; `main.ts` má < 600 řádků;
  CLAUDE.md (Architektura) popisuje nové moduly. Dělat až poslední, nikdy souběžně s jiným
  úkolem, který mění `main.ts`.

### Nové efekty (nápady uživatele z 27. 10.)

Úkoly 15–18 mění datový model, vykreslení i `main.ts`, takže se dělají postupně, ne souběžně
s úkoly 10, 11 a 14. Každá změna formátu `.khproj` = další verze (starší soubory se musí načíst).
Všechny efekty musí zůstat čistou funkcí (data, čas): náhled = export, žádné `Math.random()`.
Nové klávesy ověř proti obsluze v `main.ts` (dnes obsazené: D, T, F, R, E, mezerník, Home,
šipky, +, −, F11; plánované: S z úkolu 10, X z úkolu 8).

### 15. [ ] Prstenec, který smaže obrazovku — L
- **Cíl:** na místech, kde v hudbě přijde „bum“ a pak ticho, vyčistit plátno. Klávesa `W`
  vypustí prstenec z místa kurzoru, `Shift+W` ze středu plátna. Prstenec (barva ohňostroje
  vrstvy, se září) se rozepne přes celou obrazovku (k nejvzdálenějšímu rohu asi za 0,8 s)
  a **vše nakreslené před ním ve všech vrstvách** (čáry i ohňostroje) v místě, kudy prošel,
  zhasne. Co se nakreslí po jeho vypuštění, zůstává. Nahrává se jako ostatní prvky
  (s odpočtem, Zpět/Znovu po průchodu), nanečisto jen efekt.
- **Návrh:** nová událost ve vrstvě (`waves: { x, y, t }[]`). Mazání podle času skladby
  (pozor na `offset` vrstev): bod tahu / částice ohňostroje s časem vzniku před prstencem
  a ve vzdálenosti < poloměr prstence v daném čase se nekreslí. Prstenec ze skryté vrstvy
  nemaže ani nekreslí nic. `SceneRenderer.render` musí dostat prstence všech vrstev předem
  (dnes kreslí každou vrstvu zvlášť).
- **Soubory:** `src/shared/types.ts`, `project.ts`, `render/scene.ts`, `render/stroke.ts`,
  `render/fireworks.ts`, nový `render/wave.ts`, `main.ts`, `editor.ts` (výběr, přesun, smazání
  prstence jako ohňostroje), `timeline.ts` (značka na pruhu vrstvy), `tests/`.
- **Hotovo, když:** jednotkové testy: bod před prstencem uvnitř poloměru se nekreslí, vně
  ano, bod nakreslený po prstenci ano, platí napříč vrstvami s různým `offset`, skrytá vrstva
  nemaže; uložení/načtení prstence; E2E: tah, pak `W`, pak tah — v exportovaném snímku po
  průchodu prstence je vidět jen druhý tah.

### 16. [ ] Jiskry ze špičky čáry („světelný meč“) — M
- **Cíl:** z místa, kde se čára právě kreslí, odlétají jiskry jako při řezání kovu:
  vyletí do stran, padají gravitací a do ~0,6 s zhasnou. Čím rychlejší pohyb, tím víc jisker.
  Ve vzhledu vrstvy přepínač „Jiskry“ a posuvník množství (výchozí vypnuto, aby se staré
  projekty nezměnily). Barva podle barvy čáry s příměsí bílé. Nastavení se jako ostatní
  uplatní při vykreslení, takže jde zapnout i u už nahrané vrstvy.
- **Návrh:** jiskry jsou čistá funkce (tah, čas): vznikají z bodů tahu s časem v posledních
  ~0,6 s, PRNG se seedem odvozeným z bodu (index + čas), počet podle rychlosti mezi body.
  Funguje i pro tahy upravené jako křivka a pro tahy posunuté v čase.
- **Soubory:** `src/shared/types.ts` (`LayerStyle`), `project.ts` (`DEFAULT_STYLE`), nový
  `render/sparks.ts`, `render/scene.ts`, `index.html`, `main.ts` (panel), `tests/`.
- **Hotovo, když:** jednotkové testy: stejný tah a čas = stejné jiskry; pomalý pohyb dá
  méně jisker než rychlý; po 0,6 s od posledního bodu žádné jiskry; vypnuto = žádné.
  E2E: zapnutí jisker změní pixely snímku u špičky tahu.

### 17. [ ] Opakovaný ohňostroj ťukáním do rytmu — M
- **Cíl:** ohňostroj, který v jednom místě bouchá v pravidelném intervalu. Klávesa `G`:
  1. stisk = první výbuch v místě kurzoru, 2. stisk = druhý výbuch na stejném místě a jeho
  odstup od prvního je interval, dál bouchá sám, 3. stisk opakování ukončí. Když druhý stisk
  nepřijde do 10 s nebo skončí nahrávání, zůstane jediný výbuch. Konec nahrávání ukončí
  i běžící opakování. Každý výbuch má jiný seed (jinak by byly všechny stejné).
- **Návrh:** rozšířit `FireworkEvent` o nepovinné `every` (interval s) a `until` (čas konce),
  ať funguje výběr, přesun, kopie a posun v čase v režimu úprav bez další práce. V režimu
  úprav u vybraného opakovaného ohňostroje pole „Interval (s)“ a „Konec (s)“. Časová osa
  ukazuje opakování jako úsečku s ryskami.
- **Soubory:** `src/shared/types.ts`, `project.ts`, `render/fireworks.ts`, `render/scene.ts`,
  `main.ts`, `editor.ts`, `timeline.ts`, `index.html`, `tests/`. Konec obsahu
  (`projectContentEnd`) musí počítat s `until`.
- **Hotovo, když:** jednotkové testy: výbuchy přesně v časech `t + k·every` do `until`,
  každý s jiným seedem; uložení/načtení; starý soubor bez `every` beze změny. E2E: tři stisky
  `G` během nahrávání vytvoří jeden opakovaný ohňostroj se správným intervalem (tolerance 50 ms).

### 18. [ ] „Dýchající“ ohňostroj — M
- **Cíl:** ohňostroj, který vybuchne do pravidelného kolečka (jiskry nepadají, drží tvar),
  kolečko vydrží po dobu z nastavení vrstvy „Držení kolečka (s)“ (výchozí 1 s), pak se
  stáhne zpět do bodu — a takhle se opakuje, dokud ho uživatel nevypne. Ovládání jako
  úkol 17, jen klávesou `B` (ťuknutí určí interval cyklu, třetí stisk vypne).
- **Návrh:** `FireworkEvent.shape: 'breath'` (bez něj klasický výbuch); cyklus = rozepnutí
  (~0,35 s, zpomaluje) + držení + stažení (~0,35 s, zrychluje). Když je cyklus delší než
  interval, držení se zkrátí. Částice rovnoměrně po kružnici s jemným třpytem, záblesk
  při rozepnutí. Pořadí `rand()` u klasického ohňostroje se nesmí změnit — nový tvar má
  vlastní funkci.
- **Soubory:** jako úkol 17 + `LayerStyle` (držení), `index.html`.
- **Hotovo, když:** jednotkové testy: poloměr v čase odpovídá fázím cyklu, v čase držení
  je stálý, na konci cyklu je nulový, zkrácení držení při krátkém intervalu; E2E: `B` třikrát
  během nahrávání vytvoří dýchající ohňostroj a v exportovaném snímku uprostřed držení
  je kolečko.
- **Závisí na:** úkolu 17.

---

## Blokované / potřebuje mě

- [ ] **Vyzkoušet fáze 2 a 3 v aplikaci** a sepsat připomínky (vrstvy, posun v čase,
  režim úprav, export). Z připomínek vzniknou další úkoly.
- [ ] **Ověřit na skutečném hardwaru:** zámek kurzoru s druhým monitorem, pero/tablet,
  kreslení `D`/`T` na touchpadu, překryv „Načítám audio…“ u dlouhé skladby.
- [ ] **Pustit export 4K, H.265 a ProRes na projektoru / v cílovém přehrávači** (úkol 5
  ověří jen, že soubory jsou technicky v pořádku).
- [ ] **Úpravy ve víc vrstvách zároveň** — teď nezařazeno; rozhodnout po vyzkoušení úkolů 3 a 9.
- [ ] **Metronom, instalátor `.exe`** — teď ne (viz Rozhodnutí); vrátit se k tomu, až o to bude zájem.

(Sem zapisují samostatné sessiony rozhodnutí, která nešlo odvodit: číslo úkolu, otázka,
návrh odpovědi, co zatím udělaly.)

---

## Rozhodnutí

Odpovědi uživatele z 27. 10. 2026 (plánování před týdnem samostatné práce):

- **Necommitnutá práce:** fáze 2 a 3 se commitly jako jeden commit „Fáze 2 a 3“ (f190110).
- **Kam commitovat:** přímo do `main`, po každém úkolu commit a push.
- **Větve:** z `ccr-4a7bd951-02x0mu` převzít užitečné části dokumentace (úkol 4), pak ji
  i `faze-1-mvp` smazat lokálně i na GitHubu.
- **Priority tohoto týdne:** 1) spolehlivost a testy, 2) dodělat fázi 3, 3) odložené
  vyhlazení a posuvníky. Hudba během odpočtu ano, ale až za nimi.
- **Fáze 3 — dodělat:** přidání/smazání uzlu, rozdělení čáry, výběr víc prvků.
  Úpravy ve víc vrstvách zároveň zatím ne.
- **Režim úprav (připomínka):** ukazovat jen to, co je v čase kolem přehrávací hlavy;
  okno nastavitelné tažením okrajů pásma na časové ose (výchozí = co je na plátně).
- **Vyhlazení přepínané během kreslení:** držet `S` = vyhlazení z vlastního posuvníku
  „Vyhlazení při držení S“ (výchozí 0 %), jen pro právě kreslený úsek; základ nové vrstvy 5 %.
- **Metronom a instalátor `.exe`:** teď ne. **3 s hudby během odpočtu:** ano.
- **Pohyblivé plátno** (nápad z konceptu): dál jen nezávazný nápad, nezařazeno.
- **Nové efekty (úkoly 15–18):**
  - prstenec maže obsah **všech vrstev**, kudy projde; `W` z kurzoru, `Shift+W` ze středu,
  - jiskry létají **ze špičky** kreslené čáry, zapínají se ve vrstvě,
  - opakovaný ohňostroj: interval se určí **ťuknutím do rytmu** (`G`: 1. stisk výbuch,
    2. stisk určí interval, 3. vypne),
  - dýchající ohňostroj: **roztáhne se do kolečka, drží (nastavitelně), stáhne se do bodu**,
    opakuje se stejně jako opakovaný ohňostroj (klávesa `B`).
