# WILDNIS — Upcoming Implementations

## Multiplayer / Persistent Survival Servers

Status: **Zwei-Spieler-Koop-Prototyp umgesetzt · dedizierter Serverausbau geplant**

### Bereits umgesetzt

- Private Zwei-Spieler-Welten mit sechsstelligen Raumcodes
- Supabase-Accounts, persistente Welt und getrennte persönliche Spielstände
- Frischer Start für jede neue Koop-Welt ohne Übernahme des Singleplayer-Saves
- Koop-Chronik mit Mitspieler, Tag, Baufortschritt und direktem Fortsetzen
- Realtime-Bewegung, Anwesenheit und sichtbare Low-Poly-Mitspieler
- Gemeinsame Gebäude und Tageszeit mit Wiederverbinden
- Einfaches PvP für Nahkampf und Bogen

Ziel ist ein serverbasiertes Survival-Erlebnis, bei dem mehrere Spieler einer
persistenten Welt beitreten. Charakterfortschritt, Inventare, Lagerinhalte und
Gebäude bleiben nach dem Ausloggen und nach Serverneustarts erhalten.

### Geplanter Umfang

- Dedizierter, autoritativer Gameserver statt clientseitiger Spielstände
- Serverbrowser, Accounts, Sessions und Wiederverbinden
- Synchronisierte Spieler, Tiere, Projektile, Wetter und Weltereignisse
- Persistente Inventare, Gebäude, Kisten, Ressourcen und Weltzustände
- PvP, Tod, plünderbare Beute und Respawn
- Teams, Einladungen, gemeinsame Baurechte und optional Friendly Fire
- Gebäude-Schaden, Raids, Schlösser und Zugriffsrechte für Lager
- Interest Management, Client Prediction und Lag Compensation
- Serverseitige Validierung sämtlicher Aktionen als Anti-Cheat-Grundlage
- Adminwerkzeuge, Backups, Moderation sowie konfigurierbare Wipes

### Empfohlene Umsetzungsschritte

1. Gemeinsame Netzwerk- und Itemdefinitionen aus dem Client herauslösen.
2. ~~Prototyp für zwei Spieler mit Bewegung und Wiederverbinden erstellen.~~
3. Ressourcenabbau, Inventar, Crafting und Bauen serverautoritativ machen.
4. Persistente Datenbank für Spieler, Gebäude, Kisten und Weltzustand anbinden.
5. PvP, Loot, Teams, Baurechte und Raids ergänzen.
6. Von 4–16 Spielern ausgehend Lasttests durchführen und anschließend skalieren.

### Wichtige Designentscheidungen vor der Umsetzung

- Sind Offline-Raids erlaubt oder erhalten ausgeloggte Spieler Schutz?
- Welche Inhalte bleiben bei einem Server-Wipe erhalten?
- Gibt es Anfängerzonen, sichere Lager oder zeitlich begrenzten Startschutz?
- Sind Charaktere servergebunden oder zwischen Servern übertragbar?
- Welche maximale Spielerzahl und Weltgröße soll die erste Version unterstützen?

## Gothic-1-Remake-Inspiration (Low-Poly)

Status: **Ideensammlung — noch nichts umgesetzt**

Referenz ist die Kolonie aus Gothic 1 (Remake 2025): ein abgeschlossenes Tal
mit drei Lagern, Minen und klaren Wegen dazwischen. Alles hier ist bewusst auf
den Low-Poly-Stil und die bestehende Engine (Instancing, `WORLD_RADIUS` 680)
heruntergebrochen — keine realistischen Assets, keine Story-Kapitel 1:1.

### Map: Das Tal als Kolonie

- **Kessel-Layout statt offener Insel:** Die Welt wird am Rand von
  Low-Poly-Bergketten umschlossen (einfache Kegel-/Prisma-Geometrie), sodass
  sie sich wie ein abgeschlossenes Tal anfühlt. Optional als "Barriere" eine
  dezente, leicht leuchtende Kuppel am Weltrand (Shader-Sphäre mit
  Fresnel-Glow) — Gothics magische Barriere als reines Stimmungselement.
- **Drei Lager als große Siedlungs-Landmarks** (analog Altes Lager / Neues
  Lager / Sumpflager):
  - *Altes Lager:* Palisadenring mit Hütten und zentralem Burg-/Turmbau auf
    einer Anhöhe — Handels- und Quest-Hub.
  - *Neues Lager:* am See/Wasser, mit Feldern und einer Höhle im Fels —
    Fokus auf Ressourcen und Werkzeuge.
  - *Sumpflager:* im Feucht-/Sumpfbiom, Stelzenhütten, Fackeln, Pilze —
    mystische Stimmung, seltene Kräuter und Rezepte.
- **Minen als Ressourcen-Hotspots:** Eine "Alte Mine" und eine "Freie Mine"
  als begehbare Höhleneingänge mit Erzadern (bestehendes Pickaxe-Gameplay),
  Stützbalken, Loren und höherer Gefahr (aggressive Tiere) — Risiko gegen
  bessere Ausbeute.
- **Wegenetz und Wegweiser:** Sichtbare Trampelpfade (helleres Bodenmaterial
  entlang Splines) verbinden die Lager; Holzschilder an Kreuzungen geben
  Orientierung ohne Minimap.
- **Vertikalität:** Höhenzonen wie in der Kolonie — Sumpf tief im Süden,
  Wald in der Mitte, Erzberge und ein Ruinen-/Tempel-Plateau oben. Aussicht
  als Belohnung fürs Klettern.
- **Ein Dungeon-Landmark:** Ein versunkener Tempel (Sleeper-Anleihe) als
  spätes Ziel — Low-Poly-Ruinen, Fackelpuzzle, einzigartige Beute.

### Gameplay-Anleihen

- **Karte als Item:** Die Weltkarte ist nicht von Anfang an offen, sondern
  wird bei einem Händler im Alten Lager gekauft oder in einem Landmark
  gefunden.
- **Lehrer statt Auto-Skills:** Fähigkeiten (schneller Abbau, Tiere häuten,
  besserer Bogen) werden bei NPC-Lehrern in den Lagern gegen Erz gelernt —
  Levelaufstieg gibt Lernpunkte, ausgegeben wird bei Personen. Das macht die
  Lager zu Zielen.
- **Erz als Währung:** Statt abstrakter Münzen ist Erzklumpen das
  Tauschmittel — passt direkt zum bestehenden Mining.
- **Essen vs. Tränke (Remake-Mechanik):** Essen regeneriert nur außerhalb
  des Kampfes langsam; Tränke heilen sofort und sind kostbar. Trennt
  Survival-Loop und Kampf sauber.
- **Gerichteter Nahkampf light:** Angriffsrichtung folgt der Bewegungstaste
  (links/rechts/oben), plus Block und Ausweichrolle mit Timing-Fenster.
  Höhere Skill-Stufe schaltet sichtbar schnellere Kombo-Animationen frei —
  Fortschritt, den man *sieht*.
- **Trophäen von Tieren:** Erlegte Tiere geben erst mit gelerntem Skill
  Zähne, Felle und Hörner — Crafting-Material und Verkaufsware.
- **Reputation je Lager:** Quests/Lieferungen erhöhen Ansehen; ab Schwelle
  gibt es Zugang zu besseren Händlern oder dem inneren Ring des Lagers.
- **NPC-Tagesroutinen:** Lager-NPCs haben einfache Routinen (schmieden am
  Tag, am Feuer sitzen nachts, schlafen) — mit dem bestehenden
  Tag/Nacht-System machbar und macht Lager lebendig.

### Sinnvolle Reihenfolge

1. Bergrand + Wegenetz + Wegweiser (reine Weltgeometrie, kein neues System).
2. Erstes Lager (Altes Lager) mit Händler, Karte als Item, Erz als Währung.
3. Minen-Landmark mit Erzadern und Gefahr.
4. Lehrer-/Lernpunkte-System und Tiertrophäen.
5. Zweites und drittes Lager, Reputation, NPC-Routinen.
6. Tempel-Dungeon als Endgame-Ziel.
