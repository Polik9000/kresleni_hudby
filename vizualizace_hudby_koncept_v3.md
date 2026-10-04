# **Vizualizace hudby** 

Interaktivní plátno s mizející stopou a particle efekty 

**Shrnutí konceptu — brainstorming** 

## **1. Základní myšlenka a motivace** 

Aplikace převádějící fyzickou a intuitivní reakci na vážnou hudbu do grafické podoby. Prvotním impulsem k vytvoření byla návštěva koncertu Pavla Šporcla (projekt _Rebel with the blue violin_ ). Vystoupení mělo natolik silnou energii, že vznikla potřeba ji vizuálně zachytit. 

- **Fyzická odezva:** Záznam plynulosti hudby (simulace pohybu ruky) a rytmických akcentů (kývání hlavy do beatu). Jde o inspiraci pro *styl* kreslení myší/touchpadem/perem — aplikace nesnímá reálný pohyb kamerou (žádné hand/head tracking). 

- **Rozsah projektu (Scope):** Aplikace je primárně vyvíjena jako osobní/interní nástroj pro vlastní tvorbu vizuálů. Nejde o komerční produkt určený pro masový trh. 

- **Účel a využití:** Výsledný video export má fungovat jako plnohodnotný vizuální doprovod na živých koncertech (např. jako projekce na vystoupeních Pavla Šporcla či jiných interpretů). Aplikace sama o sobě na koncertě neběží naživo — vždy jde o pre-render, při kterém se nejdřív nahraje výkon a z něj se vyrenderuje video, které se na koncertě pustí. 

- **Platforma:** Desktopová aplikace (Electron) — potřeba plného přístupu k souborovému systému kvůli importu audia a exportu videa. 

## **2. Core loop — kreslení a vizuální prvky** 

- **Kreslení v reálném čase:** Hráč/uživatel využívá interaktivní plátno pro záznam tahů synchronizovaně s právě hrající hudbou. 

- **Dynamická mizející stopa:** Nakreslená čára nezůstává na plátně trvale. Zanechává stopu viditelnou po výchozí dobu 5 sekund (parametr lze v nastavení upravit), která postupně mizí plynulým fade-outem opacity (ne tvrdým řezem). 

- **Fyzika tahu:** Rychlost pohybu myši přímo ovlivňuje délku zobrazené stopy v reálném čase. Rychlejší pohyb = delší vizuální stopa. Tloušťka čáry má dva možné režimy: buď fixní hodnota nastavená sliderem, nebo dynamická podle rychlosti pohybu (pomalejší pohyb = tlustší čára, rychlejší = tenčí — simuluje "kapání barvy"). 

- **Bodové efekty (Fireworks):** Kliknutím na konkrétní místo na plátně se vytvoří jednorázový vizuální efekt ve stylu ohňostroje. Mechanika slouží pro vizualizaci přesných úderů, beatů nebo jiných hudebních akcentů. 

- **Plátno:** Statické, pevné — nehýbe se a neposouvá. (Nápad na "pohyblivé plátno" ve stylu běžícího pásu, kde by se plocha posouvala v čase, je zaznamenaný jako nezávazný budoucí nápad, viz sekce 6.) 

- **Vzhled vrstvy:** Barva čáry, barva ohňostrojů, tloušťka/režim tloušťky a doba mizení stopy jsou nastavitelné per-vrstva, editovatelné před, během i po nahrávání. 

- **Vrstvy (multi-track nahrávání):** Uživatel může vytvořit libovolný počet pojmenovaných vrstev. Každá vrstva se nahrává jako samostatný průchod poslechem skladby (např. jeden průchod pro čáru, další jen pro ohňostroje, nebo cokoliv jiného). Při nahrávání nové vrstvy se výchozí nastavení přehrávají i předchozí vrstvy jako vizuální reference (overdub styl jako v hudebním sequenceru), s možností si je schovat. Jednotlivé vrstvy lze zobrazit/skrýt/smazat a posunout v čase jako celek. 

## **3. Práce s audiem a časová osa** 

- **Audio import:** Přímé vložení audio souboru do aplikace s možností jeho spuštění a přehrávání. 

- **Nelineární editace:** Aplikace obsahuje časovou osu pro orientaci v audiu. Umožňuje procházet skladbu a potenciálně upravovat či časovat již vytvořené vizuální záznamy. Konkrétně: 
  - Posun celé vrstvy v čase, smazání/skrytí vrstvy. 
  - Pokročilá editace (pozdější fáze, viz sekce 6): konverze nahraného tahu na editovatelnou vektorovou křivku s klikatelnými uzlovými body po celé délce čáry — každý bod má dva handly ovlivňující tvar/zakřivení (styl Figma/Illustrator). Posun bodu mění jen tvar/pozici čáry, původní časování kreslení zůstává zachované. Dále přesun jednotlivého ohňostroje a kopírování/vkládání části čáry jinam (pro opakující se pasáže). 

- **Ukládání projektu:** Aplikace ukládá/načítá projektový soubor (vrstvy, časování, odkaz na audio soubor, nastavení vzhledu), takže lze rozpracovaný projekt opustit a vrátit se k němu přes více sezení před finálním exportem. 

## **4. Export a výstup** 

- **Video render:** Funkce pro vyrenderování celého zaznamenaného průběhu do video formátu. Export se renderuje deterministicky snímek po snímku (ne jako screen-recording), takže kvalita exportu nezávisí na výkonu počítače při přehrávání. 

- **Černé plátno:** Výstupní video má čistě černé pozadí, na kterém ostře kontrastují zaznamenané mizející čáry a vygenerované ohňostroje. 

• **Synchronizace:** Zvuková stopa je při exportu přesně synchronizována s vizuálním záznamem. 

- **Parametry exportu:** Start s 1920×1080, 30fps, MP4/H.264. Exportní pipeline je navržená modulárně, aby šlo později snadno přidat jiná rozlišení, snímkovou frekvenci nebo formáty. 

## **5. Technická architektura** 

- **Electron** (shell) s rendererem v TypeScriptu. 

- **Canvas 2D** pro kreslení čáry, fade-out stopy a ohňostrojových particle efektů. WebGL je záložní varianta, pokud by 2D canvas výkonově nestačil na velké množství particles. 

- **Web Audio API** pro přehrávání audia a jako přesné časové "hodiny" pro synchronizaci kreslení a efektů. 

- **Export:** canvas vykreslený frame-by-frame + audio track smíchané přes ffmpeg do MP4/H.264. 

- **Projektový soubor:** vlastní JSON formát (např. přípona `.khproj`) — reference na audio soubor, pole vrstev (id, název, viditelnost, barva, režim tloušťky, doba mizení, časovaná data tahu, pole ohňostrojových událostí), globální nastavení. 

## **6. Fázování vývoje** 

> **Stav realizace (4. 10. 2026):** fáze 1 je hotová, další na řadě je fáze 2. Aktuální ovládání a funkce popisuje [README.md](README.md). Oproti konceptu se v realizaci liší: mizení stopy je řešené ztmavováním barvy k černé (na černém pozadí vypadá stejně jako fade-out opacity, ale nedělá světlé skvrny v místech překryvu) a navíc přibylo vyhlazení čáry, záře, kreslení bez tlačítka pro touchpad (`D` / `T`), celá obrazovka se zámkem kurzoru, odpočet před nahráváním a automatické ukládání se zálohou.

**Fáze 1 — MVP (jádro):** ✅ hotovo. Electron shell, černé plátno, import a přehrávání audia, kreslení jedné vrstvy (mizející stopa + ohňostroje), nastavení vzhledu vrstvy, záznam synchronizovaný s audiem, uložení/načtení projektu, export do videa (1920×1080/30fps/MP4). 

**Fáze 2 — vrstvy a základní timeline úpravy:** (další krok) Víc pojmenovaných vrstev, overdub nahrávání s možností schovat předchozí vrstvy, zobrazení/skrytí/smazání vrstvy, posun celé vrstvy v čase, rozšíření exportu o další rozlišení/fps/formáty. 

**Fáze 3 — pokročilé vektorové úpravy:** Konverze nahraného tahu na editovatelnou vektorovou křivku s uzlovými body a bezier handly, posun jednotlivého ohňostroje, kopírování/vkládání částí čáry. 

**Nápad do budoucna (nezávazný backlog):** Pohyblivé plátno ve stylu "běžícího pásu" — plátno by se posouvalo v čase a uživatel by kreslil na pohybující se ploše (starší části by odjížděly mimo viewport místo/vedle časovaného fade-outu). Designově samostatná věc oproti statickému plátnu z fází 1–3 — rozpracovat případně až jako vlastní fáze (F4+), pokud se ukáže jako potřebná. 

