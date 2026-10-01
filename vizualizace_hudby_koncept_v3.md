# **Vizualizace hudby** 

Interaktivní plátno s mizející stopou a particle efekty 

**Shrnutí konceptu — brainstorming** 

## **1. Základní myšlenka a motivace** 

Aplikace převádějící fyzickou a intuitivní reakci na vážnou hudbu do grafické podoby. Prvotním impulsem k vytvoření byla návštěva koncertu Pavla Šporcla (projekt _Rebel with the blue violin_ ). Vystoupení mělo natolik silnou energii, že vznikla potřeba ji vizuálně zachytit. 

- **Fyzická odezva:** Záznam plynulosti hudby (simulace pohybu ruky) a rytmických akcentů (kývání hlavy do beatu). 

- **Rozsah projektu (Scope):** Aplikace je primárně vyvíjena jako osobní/interní nástroj pro vlastní tvorbu vizuálů. Nejde o komerční produkt určený pro masový trh. 

- **Účel a využití:** Výsledný video export má fungovat jako plnohodnotný vizuální doprovod na živých koncertech (např. jako projekce na vystoupeních Pavla Šporcla či jiných interpretů). 

## **2. Core loop — kreslení a vizuální prvky** 

- **Kreslení v reálném čase:** Hráč/uživatel využívá interaktivní plátno pro záznam tahů synchronizovaně s právě hrající hudbou. 

- **Dynamická mizející stopa:** Nakreslená čára nezůstává na plátně trvale. Zanechává stopu viditelnou po výchozí dobu 5 sekund (parametr lze v nastavení upravit). 

- **Fyzika tahu:** Rychlost pohybu myši přímo ovlivňuje délku zobrazené stopy v reálném čase. Rychlejší pohyb = delší vizuální stopa. 

- **Bodové efekty (Fireworks):** Kliknutím na konkrétní místo na plátně se vytvoří jednorázový vizuální efekt ve stylu ohňostroje. Mechanika slouží pro vizualizaci přesných úderů, beatů nebo jiných hudebních akcentů. 

## **3. Práce s audiem a časová osa** 

- **Audio import:** Přímé vložení audio souboru do aplikace s možností jeho spuštění a přehrávání. 

- **Nelineární editace:** Aplikace obsahuje časovou osu pro orientaci v audiu. Umožňuje procházet skladbu a potenciálně upravovat či časovat již vytvořené vizuální záznamy. 

## **4. Export a výstup** 

- **Video render:** Funkce pro vyrenderování celého zaznamenaného průběhu do video formátu. 

- **Černé plátno:** Výstupní video má čistě černé pozadí, na kterém ostře kontrastují zaznamenané mizející čáry a vygenerované ohňostroje. 

• **Synchronizace:** Zvuková stopa je při exportu přesně synchronizována s vizuálním záznamem. 

