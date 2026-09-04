# Styleguide «Computer Inventar»

Stand: 04.09.2026 · Gilt für alle Seiten unter `frontend/` (index.html, geraet.html, benutzer.html, telefon.html).
Lebende Komponentenübersicht mit echtem Markup: **[styleguide.html](styleguide.html)** (lokal über `code\serve.ps1` öffnen).

Das Design folgt **Google Material Design 3**, so wie Google es in seinen eigenen Konsolen einsetzt
(Admin-Konsole, Search Console, Cloud Console). Quellen: [m3.material.io/styles](https://m3.material.io/styles),
[Typografie-Tokens](https://m3.material.io/styles/typography/type-scale-tokens),
[Farbrollen](https://m3.material.io/styles/color/roles).

---

## 1. Grundsätze

| Grundsatz | Konkret |
|---|---|
| **Weisser Grund** | Seite, Karten, Tabellen und Navigation sind reines Weiss `#ffffff`. Keine getönte Seite, keine grauen Flächen als Hintergrund. |
| **Trennung durch Hairlines** | 1 px Linien in `#dadce0` trennen Karten, Kopfzeile, Navigation und Tabellen. Innerhalb von Listen `#e8eaed`. Nie dickere Rahmen, nie farbige Seitenkanten. |
| **Schatten nur für Schwebendes** | Menüs (Panels), Dialoge und Snackbars bekommen Material-Elevation. Karten und Kacheln bekommen **keinen** Schatten. |
| **Eine Akzentfarbe** | Google-Blau `#0b57d0` für Aktionen, Auswahl, Links, Sortierpfeil, Datenreihen. Das Campus-Grün lebt nur im Logo. |
| **Status über Farbe, nicht über Form** | Grün, Orange, Rot ausschliesslich als Text- oder Chipfarbe. Ein Wert ohne Auffälligkeit bleibt schwarz. |
| **Hierarchie über Typografie** | Grösse und Gewicht ordnen den Inhalt. Grossbuchstaben-Titel und Letterspacing werden nicht verwendet. |
| **8er-Raster** | Alle Abstände sind Vielfache von 4 px, bevorzugt 8 / 16 / 24 / 32. |
| **Alles hat einen Platz** | Aktionen unten in der Karte, Titel oben, Hinweise als Banner. Nichts klebt direkt an einer Liste. |
| **Die Seite rollt nie waagrecht** | Tabellen, Reiterleisten und Zeitstrahl rollen in ihrem eigenen Behälter. Raster fallen auf eine Spalte zurück. |

---

## 2. Tokens (design.css, `:root`)

### 2.1 Farben

| Token | Wert | Verwendung |
|---|---|---|
| `--primaer` | `#0b57d0` | Gefüllte Knöpfe, Text von Outlined-/Text-Knöpfen, Links, aktive Navigation, Sortierpfeil, Fokusring, erste Datenreihe |
| `--primaer-dunkel` | `#0842a0` | Hover auf gefülltem Knopf, gesperrter Schalter |
| `--primaer-hell` | `#e8f0fe` | Aktive Navigation, Tonal-Knopf, gewählter Filterchip, laufendes Geschäftsjahr |
| `--primaer-container` | `#d3e3fd` | Hover auf Tonal-Flächen |
| `--primaer-schwach` | `#a8c7fa` | Zweite Datenreihe (Ersatz im Zeitstrahl) |
| `--erfolg` / `--erfolg-hell` | `#137333` / `#e6f4ea` | Online, in SCCM, aktiv, im Plan |
| `--warnung` / `--warnung-hell` | `#b06000` / `#fef7e0` | Ersatz im laufenden GJ, fehlende Angabe, Vorführmodus-Band |
| `--gefahr` / `--gefahr-hell` | `#b3261e` / `#fce8e6` | Überfällig, deaktiviert, Fehler, zerstörende Knöpfe |
| `--info` / `--info-hell` | `#0b57d0` / `#e8f0fe` | Lager, Co-Managed, AD-Gruppe |
| `--text` | `#1f1f1f` | Fliesstext, Werte, Titel (On-Surface) |
| `--text-leise` | `#444746` | Beschriftungen, Untertitel, Tabellenkopf (On-Surface-Variant) |
| `--text-still` | `#747775` | Nebensächliches: Hinweise, leere Werte «—», Zähler |
| `--weiss` | `#ffffff` | Alle Flächen |
| `--flaeche` | `#f8f9fa` | Hover auf Zeilen, Banner-Grund, Verlaufsformular |
| `--flaeche-2` | `#f1f3f4` | Suchfeld, Hover auf Navigation, neutrale Chips, Spuren |
| `--flaeche-3` | `#e8eaed` | Gedrückt, Balkenspur, stille Zähler |
| `--linie` | `#dadce0` | Hairline: Karten, Kopfzeile, Navigation, Tabellenkopf, Eingaberahmen im Lesemodus |
| `--linie-leicht` | `#e8eaed` | Zeilen innerhalb einer Liste oder Tabelle |
| `--umriss` | `#747775` | Rahmen von Outlined-Knöpfen, Eingabefeldern, Schalter «aus» |
| `--umriss-leicht` | `#c4c7c5` | Rahmen von Filterchips, Hover-Rahmen von Kacheln |

Diagrammfarben (nur im Zeitstrahl und in Balken): Blau `--primaer`, Hellblau `--primaer-schwach`, Rot `#d93025`, Gelb `#f9ab00`.

**Verboten:** neue Hex-Werte in Seiten-CSS. Wer eine Farbe braucht, nimmt ein Token. `--marke`, `--marke-dunkel`, `--marke-hell` sind Aliasse auf `--primaer` und bleiben nur aus Kompatibilität.

### 2.2 Typografie

Schrift: **Roboto** (Google Fonts, 400/500/700) für Text, `"Google Sans"` mit Roboto-Fallback für Titel, Knöpfe und Navigation (`--schrift-titel`). Fällt Google Fonts aus, greift Helvetica/Arial, nichts bricht.

| Rolle | Grösse / Zeile | Gewicht | Farbe | Wo |
|---|---|---|---|---|
| Seitentitel (Detailfenster) | 28 / 36 px | 400 | `--text` | `.seitenkopf h1` |
| Wortmarke «ICT.INVENTAR» (App-Leiste) | 22 / 28 px (18 / 24 unter 760 px) | 650, Archivo 112 % breit, Versalien | `--text`, Punkt `--campus-gruen` | `.wortmarke`, `.wortmarke-punkt` |
| Dialogtitel, Fehlertitel | 22 / 28 px | 400 | `--text` | `.dialog h2`, `.fehler-titel` |
| Kennzahl | 32 / 40 px | 400 | `--text` oder Ton | `.kachel-wert` (`.klein`: 22 / 32 px) |
| Kartentitel, Abschnittstitel | 16 / 24 px | 500 | `--text` | `.karte-titel`, `.bereich-titel` |
| Fliesstext, Werte, Knöpfe, Navigation | 14 / 20 px | 400 (Knöpfe 500) | `--text` | Standard |
| Beschriftungen, Untertitel, Hinweise | 13 / 18 px | 400 | `--text-leise` | `.datenzeile-name`, `.hinweis`, `.karte-unter` |
| Tabellenkopf, Feldlabel, Chip klein | 12 / 16 px | 500 | `--text-leise` | `th`, `.feld-label`, `.chip` |
| Kleinste Angaben | 12 / 16 px | 400 | `--text-still` | `.kachel-unter`, `.g-roh-intern` |

Zahlen immer mit `font-variant-numeric: tabular-nums` (Klasse `.zahl`), damit Spalten fluchten.
Keine Grossbuchstaben-Titel, kein Letterspacing, kein Fettdruck über 500 im Fliesstext.

### 2.3 Abstände

| Token | Wert | Verwendung |
|---|---|---|
| `--a1` | 4 px | Chip-Innenabstand, Label zu Feld |
| `--a2` | 8 px | Knöpfe nebeneinander, Chips, Zeilen in Listen |
| `--a3` | 12 px | Werkzeugleiste, Navigation innen, Formularzeilen |
| `--a4` | 16 px | **Standard**: Blöcke in einer Karte, Kartenraster, Kachelraster |
| `--a5` | 24 px | Innenabstand von Karten und Dialogen, Seitenkopf, Inhaltsrand |
| `--a6` | 32 px | Abschnitte auf der Übersicht, Seitenrand auf dem Desktop |
| `--a7` | 48 px | Leerzustände, unterer Seitenrand |

Innenabstand des Inhalts: 24 px oben, 32 px seitlich (Desktop), 24 px (bis 1100 px), 16 px (Handy).
Maximale Textbreite `.bahn` und `.fenster-bahn`: 1400 px.

### 2.4 Form und Erhebung

| Token | Wert | Verwendung |
|---|---|---|
| `--r-klein` | 4 px | Eingabefelder, Snackbar, Mehrfachauswahl |
| `--r` | 8 px | Karten, Kacheln, Tabellenrahmen, Chips, Panels, Banner |
| `--r-gross` | 12 px | Dialog |
| `--r-rund` | 999 px | Knöpfe, Navigation, Suchfeld, Konto, Schalter |
| `--schatten` | Elevation 1 | Hover auf gefülltem Knopf |
| `--schatten-hoch` | Elevation 2 | Panels, Snackbar |
| `--schatten-dialog` | Elevation 3 | Dialog |

---

## 3. Layout

### 3.1 Hauptseite (index.html)

```
┌──────────────────────────────────────────────────────────────┐
│ App-Leiste 64 px: Logo · Produktname          Stand · Knöpfe · Konto │
├──────────────────────────────────────────────────────────────┤
│ Band (nur im Vorführmodus / bei Warnungen)                    │
├────────────┬─────────────────────────────────────────────────┤
│ Navigation │ Bühne: genau eine Ansicht                        │
│ 240 px     │   Übersicht   → rollt selbst (.inhalt)           │
│ Pillen mit │   Geräte      → Werkzeugleiste + Tabelle, die    │
│ Icon       │   Benutzer      selbst rollt (.inhalt-fest)      │
│            │   Telefonnummern                                 │
│            │   Software    → rollt selbst                     │
└────────────┴─────────────────────────────────────────────────┘
```

- `body.seite` ist genau fensterhoch und rollt **nie**; gerollt wird in `.inhalt` oder `.tabelle-rahmen`.
- Unter 760 px wird die Navigation zur Reiterleiste (Text, blauer Unterstrich) über dem Inhalt.
- Der Datenstand (`.stand`) ist ab 1000 px sichtbar; sein Tooltip nennt zusätzlich den automatischen Nachlade-Takt.
- Es gibt **keinen** Knopf «Neu laden». Alle Seiten holen den Stand selbst nach (`KONFIG.autoTaktMs`, still und nur im sichtbaren Fenster); für sofort frische Daten lädt man die Seite neu.

### 3.2 Detailfenster (geraet.html, benutzer.html, telefon.html)

```
┌──────────────────────────────────────────────────────────────┐
│ App-Leiste: ICT.INVENTAR                        Aktionen      │
├──────────────────────────────────────────────────────────────┤
│ Band (Vorführmodus)                                           │
├────────────┬─────────────────────────────────────────────────┤
│ Bereichs-  │ ‹ Geräte                        (Pfad zur Liste) │
│ navigation │ CAMPUS-901                       (Titel 28 px)   │
│ 240 px,    │ Haus C / UG · Latitude 7440 · …  (Untertitel)    │
│ klebend    │ [Online] [In SCCM] [Client aktiv]   (Statuschips)│
│            │ ───────────────────────────────────── Hairline   │
│            │ Karten im Raster (mind. 420 px je Spalte)        │
├────────────┴─────────────────────────────────────────────────┤
│ Speicherleiste (fest unten, nur bei Änderungen)               │
└──────────────────────────────────────────────────────────────┘
```

- Die Seite rollt normal; die Navigation klebt oben (`.fenster-nav-menue`).
- Die Titelzeile `.seitenkopf` steht **in der Inhaltsspalte**, nicht in der App-Leiste. Der Pfad `.seitenkopf-pfad` («‹ Geräte») führt in die passende Liste.
- Unter 760 px wird die Bereichsnavigation zur waagrecht rollenden Reiterleiste; der aktive Reiter wird ins Bild gerollt.
- Der Inhalt hat unten 104 px Innenabstand, damit die Speicherleiste nichts verdeckt.

### 3.3 Breiten und Umbrüche

| Breite | Verhalten |
|---|---|
| ≥ 1200 px | Vollständige App-Leiste inkl. Datenstand. Kacheln der Übersicht in einer Reihe. |
| 1100–1200 px | Datenstand weicht. |
| 760–1100 px | Navigation 200 px, Seitenränder 24 px, Kartenraster meist einspaltig. |
| < 760 px | App-Leiste 56 px mit kleinerer Wortmarke, Reiterleiste statt Navigation, Kacheln zweispaltig, Karten einspaltig, Suchfeld volle Breite, Dialog randlos. |

Geprüft: 360, 375, 768, 1024, 1280, 1440, 1920 px sowie 200 % Zoom (entspricht 720 px).

---

## 4. Komponenten

Für jede Komponente: Markup, Regeln, Zustände. Das vollständige Markup steht in **styleguide.html**.

### 4.1 App-Leiste `.kopf`
- 64 px hoch (56 px auf dem Handy), weiss, Hairline unten.
- Links `.kopf-marke`: Wortmarke `.wortmarke` «ICT.INVENTAR» als Link zur Übersicht (Archivo 650, 112 % breit, Versalien, 22 px `--text`); der Punkt `.wortmarke-punkt` steht in `--campus-gruen` (#84b819, das Grün aus dem Logo von Campus Sursee) und ist wie im Logo ein satter Kreis auf der Grundlinie (0.3 em, als Fläche gezeichnet, nicht als Schriftzeichen). Das Campus-Logo selbst wird nicht mehr gezeigt.
- Rechts `.kopf-rechts`: Datenstand, Knöpfe, Konto-Pille. Auf dem Handy in einer Zeile, rollt notfalls waagrecht, Wortmarke 18 px.
- Enthält **nie** den Titel des Datensatzes; der steht in `.seitenkopf`.

### 4.2 Navigation `.reiter` / `.fenster-nav`
- Pillen-Knöpfe 40 px hoch, 14 px 500, Text `--text`, Icon 20 px `--text-leise`.
- Hover `--flaeche-2`, aktiv `--primaer-hell` mit blauem Text und Icon.
- Zähler rechts (`.fenster-nav-zahl`) in 12 px `--text-still`, aktiv blau.
- Handy: Reiter mit 3 px blauem Unterstrich, 48 px hoch, waagrecht rollend ohne Rollbalken.

### 4.3 Titelzeile `.seitenkopf`
- Reihenfolge: Pfad (13 px 500, Winkel «‹»), Titel 28 px, Untertitel 14 px `--text-leise` einzeilig mit «…» (Handy: mehrzeilig), Statuschips.
- Unten Hairline, 24 px Abstand zum Inhalt.
- Der Titel darf beliebig lang sein und bricht um (`overflow-wrap: anywhere`).

### 4.4 Karte `.karte`
- Weiss, 1 px `--linie`, 8 px Radius, kein Schatten.
- `.karte-kopf` (16 px oben, 24 px seitlich): `.karte-titel` 16 px 500 und optional `.karte-unter` 13 px `--text-leise`.
- `.karte-inhalt` (24 px seitlich und unten). **Jeder Block darin hat 16 px Abstand zum vorherigen** (`.karte-inhalt > * + *`). Zeilen derselben Liste (Datenzeilen, Personen, Hinweise, Rohdaten) sind davon ausgenommen.
- `.karte-aktionen`: Fusszeile mit Knöpfen, 16 px Abstand, Hairline oben. Hauptaktion gefüllt, Nebenaktionen als Text.
- Raster `.karten`: auto-fit, mindestens 420 px je Spalte, 16 px Lücke; `.karte-breit` über alle Spalten.
- Karten strecken sich **nicht** auf gleiche Höhe (`align-items: start`).

### 4.5 Kennzahl-Kachel `.kachel`
- Aufbau wie in der Search Console: **Beschriftung oben** (14 px `--text-leise`), **Zahl darunter** (32 px 400), optional Zusatz (12 px `--text-still`). Die DOM-Reihenfolge ist egal, CSS ordnet über `order`.
- Ton `.ton-erfolg | .ton-warnung | .ton-gefahr | .ton-info` färbt **nur die Zahl**.
- Als `<button>` klickbar: Hover `--flaeche` und Rahmen `--umriss-leicht`. `data-klickbar="nein"` für reine Anzeige.
- Raster `.kacheln`: auto-fill 190 px (Übersicht: auto-fit 140 px, damit sieben Kacheln in eine Reihe passen). Handy: zwei Spalten.

### 4.6 Knöpfe `.knopf`
| Variante | Klasse | Aussehen | Einsatz |
|---|---|---|---|
| Outlined | `.knopf` | weiss, 1 px `--umriss`, blauer Text, Pille 36 px | Standardaktion |
| Filled | `.knopf-primaer` | blau, weisser Text | **genau eine** Hauptaktion je Bereich (Speichern, Neues Gerät, Benutzer zuordnen) |
| Text | `.knopf-leise` | nur blauer Text | Nebenaktionen, Aktionen pro Zeile, Abbrechen |
| Tonal | `.knopf.aktiv` | `--primaer-hell`, blauer Text | gedrückter Schalter (Filter offen, Kompakt, Archiv) |
| Gefahr | `.knopf-gefahr` | rot, weisser Text | zerstörende Bestätigung im Dialog |
| Deaktiviert | `[disabled]` | grau 6 %, Text 38 % | |

- Höhe 36 px (Handy 40 px), Schrift 14 px 500 `--schrift-titel`, Innenabstand 16 px (mit Icon links 12 px).
- Icon 18 px in `currentColor`, per `sinnbild()` (app.js) oder `symbol()` (geraet.js) als inline-SVG.
- Zähler im Knopf: `.zaehler` (blau) oder `.zaehler-still` (grau).
- Knöpfe in Dialogen: rechts, Abbrechen links davon, Hauptaktion ganz rechts.

### 4.7 Chips
| Art | Markup | Aussehen |
|---|---|---|
| Statusmarke | `<span class="chip chip-erfolg">Online</span>` | 24 px, 12 px 500, gefärbte Fläche, kein Rahmen, einzeilig mit «…» |
| Neutral | `<span class="chip">Offline</span>` | `--flaeche-2` mit `--text-leise` |
| Still | `.chip-leise` | nur Text `--text-still` (Archiviert) |
| Filterchip | `<button class="chip">Suche: … <span class="x">×</span></button>` | 32 px, 14 px 500, 1 px `--umriss-leicht`, **bricht bei langem Text um** |
| Gewählter Filterchip | `button.chip.chip-marke` | `--primaer-hell`, blauer Text |
| Link-Chip | `<a class="chip">` | wie Statusmarke, Hover `--flaeche-3` |

Töne: `chip-erfolg`, `chip-warnung`, `chip-gefahr`, `chip-info`, `chip-marke`, `chip-leise`. Behälter `.chips` mit 8 px Lücke, leerer Behälter wird ausgeblendet.

### 4.8 Suche `.suchfeld > .suche`
- Pille 40 px, `--flaeche-2`, ohne Rahmen; Lupe 20 px links (inline-SVG). Ohne Lupe rückt der Text automatisch nach links.
- Hover `--flaeche-3`, Fokus weiss mit Google-Suchschatten.
- Tastenkürzel `.kuerzel` («/») rechts, auf dem Handy ausgeblendet.

### 4.9 Eingabefelder (Material Outlined)
- 40 px hoch, 14 px, 1 px `--umriss`, 4 px Radius, weiss.
- Hover Rahmen `--text`, Fokus Rahmen `--primaer` doppelt (1 px + 1 px innen), ungültig `--gefahr` doppelt.
- Schreibgeschützt: `--flaeche` mit `--linie`-Rahmen und `--text-leise`.
- Gilt für `.feld-eingabe` (das Feld des Design-Systems, auch für `select` und `textarea`), `.g-eingabe`, `.g-textarea`, `.feld input/select/textarea`, `.vl-datum-feld`, `.vl-text-feld`, `.filterfeld select`, `.datenzeile-breit textarea`.
- Neue Seiten nehmen `.feld-eingabe` aus design.css und ergänzen in ihrem Seiten-CSS nur Breiten und den Ungültig-Zustand (Beispiel: `.tf-eingabe-schmal`, `.tf-ungueltig` in telefon.css).
- Checkboxen und Radios: `accent-color: --primaer`.

### 4.10 Datenzeilen `.datenzeilen > .datenzeile`
- **Lesen:** Name links (13 px `--text-leise`, 36 % Breite, mind. 110 px), Wert rechts (14 px `--text`), Hairline `--linie-leicht` dazwischen, 10 px senkrecht.
- **Bearbeiten:** Klasse `.datenzeile-form` — Beschriftung oben (12 px 500), Feld in voller Breite (max. 560 px) darunter, Hinweis unter dem Feld. Schmale Felder (`.g-eingabe-schmal`, 200 px) für Jahre und Auswahlen.
- Schreibgeschützte Felder tragen `.schloss` (🔒) im Namen mit Tooltip.
- Geänderte, ungespeicherte Zeilen: `.geaendert` setzt einen blauen Punkt hinter den Namen.
- Leerer Wert: «—» in `--text-still`, nie ein leeres Feld.
- Nebenangabe `.datenzeile-neben` (12 px `--text-still`) direkt hinter dem Wert, Hinweis `.datenzeile-hinweis` darunter.

### 4.11 Tabellen `.tabelle-rahmen > .tabelle`
- Rahmen 1 px `--linie`, 8 px Radius; rollt in beide Richtungen, Kopf und erste Spalte kleben.
- Kopf 12 px 500 `--text-leise`, 48 px hoch, Hairline unten; sortierte Spalte dunkel mit blauem Pfeil.
- Zeilen 48 px (13 px Schrift), Trennlinie `--linie-leicht`, Hover `--flaeche`. **Kein Zebra.**
- Kompakt (`.dicht` auf einem Vorfahren): 36 px Zeilen, 12 px Schrift.
- Zellen einzeilig mit «…» bis 280 px; die erste Spalte mindestens 180 px.
- **Auffällige Zeilen** (Telefonliste: nicht zugewiesene Nummern, Klasse `.zeile-frei`): Kurzwahl und Nummer in `--warnung`, dazu ein Chip `chip-warnung` in der Spalte «Zugewiesen». **Kein getönter Zeilenhintergrund** — Status kommt über Text- und Chipfarbe, die Hover-Fläche bleibt `--flaeche`.
- In Karten `.tabelle-schlicht`: kein klebender Kopf, keine Handzeiger, Zellen dürfen umbrechen.
- Leerzustand `.tabelle-leer` zentriert im Rahmen.

### 4.12 Schalter `.schalter` (Material Switch, drei Zustände)
| Zustand | Klasse | Aussehen |
|---|---|---|
| 0 aus | `.schalter` | weiss, 2 px `--umriss`, kleiner grauer Griff links |
| 1 an | `.schalter.an` | blau, weisser Griff rechts |
| 2 an und gesperrt | `.schalter.gesperrt` | dunkelblau, weisser Griff, Schloss, `cursor: not-allowed`, `title` mit Gruppenname |

Zeile `.schalter-zeile`: 44 px hoch, Schalter · Name (darf umbrechen) · Chips rechts (max. 50 %, rechtsbündig).

### 4.13 Hinweise und Banner
- **Hinweisliste** `.g-hinweis` (Übersicht des Geräts): Icon 18 px + Titel 14 px 500 + Text 13 px, Zeilen durch Hairline getrennt, Farbe über `.t-warnung | .t-gefahr | .t-info` auf dem Icon und Titel.
- **Banner** `.b-hinweis`: getönte Fläche (`--warnung-hell` bei `.t-warnung`, `--gefahr-hell`, `--info-hell`, sonst `--flaeche` mit Hairline), 8 px Radius, 12/16 px Innenabstand. Text links, Knopf rechts, Chips auf eigener Zeile.
- **Hinweistext** `.hinweis`: 13 px `--text-leise` — für Erklärungen, Leermeldungen in Karten, Zähler.
- **Band** `.band`: volle Breite unter der App-Leiste, 13 px, `.band-warnung` gelb, `.band-info` blau.

### 4.14 Panels (Filter, Spalten) `.panel`
- Schwebend unter der Werkzeugleiste, weiss, 8 px Radius, Elevation 2, max. 64 vh hoch, rollt innen.
- `.panel-kopf` klebt oben mit Hairline; Schliessen-Knopf als Text-Icon-Knopf.
- `.panel-koerper` 16/24 px; Filterfelder im Raster ab 230 px, Mehrfachauswahl `.mehrfach` als Liste mit Rahmen und Zahl in Klammern.

### 4.15 Dialog `.dialog`
- Zentriert, max. 560 px, 12 px Radius, Elevation 3, 24 px Innenabstand, Hintergrund `rgba(31,31,31,.32)`.
- Titel 22 px 400, Text 14 px `--text-leise`, Knöpfe rechts unten (`.dialog-knoepfe`).
- Trefferliste `.g-trefferliste` mit Rahmen, max. 260 px hoch, rollt innen.
- Handy: 16 px Rand, Höhe max. 100 vh − 48 px.

### 4.16 Speicherleiste, Snackbar, Toast
- `.speicherleiste`: fest unten, weiss, Hairline oben, leichter Schatten nach oben. Links «n Änderungen» (14 px 500), rechts «Verwerfen» (Text) und «Speichern» (Filled). Fehlertext `.speicher-fehler` als rote Fläche.
- `.toast` / `.hinweisband`: `#3c4043` mit weissem Text, 4 px Radius, 14 px, 280–60 ch breit, unten rechts (Toast 80 px über der Speicherleiste). `.toast-fehler` rot. Handy: volle Breite.

### 4.17 Zustände
- **Laden** `.lade`: Spinner 32 px blau auf `--flaeche-3`, Text 14 px, Fortschritt 12 px. Zentriert in der Restfläche über Flex, nie über `100vh` gerechnet.
- **Fehler** `.fehler`: Titel 22 px, Text, Hinweis, Knopf «Erneut laden» (Filled). Navigation ist dabei ausgeblendet.
- **Leer** `.leerzustand` / `.tabelle-leer`: Titel 14 px 500, Text 13 px `--text-leise`, zentriert; in Karten ohne Mindesthöhe.
- **Skelett** `.skelett`: schimmernde Fläche für nachladende Zeilen.

### 4.18 Zeitstrahl `.zeitstrahl`
- Karte ohne Schatten; je Geschäftsjahr ein Tick (56 px, Handy 64 px) mit zwei Säulen 14 px: Beschaffung blau, Ersatz hellblau, überfällig rot, im laufenden GJ gelb.
- Laufendes Jahr `--primaer-hell`, vergangene Jahre 60 % Deckkraft, klickbare Ticks mit Hover.
- Legende `.zeitstrahl-legende` unter einer Hairline mit 10 px Farbquadraten.
- Rollt waagrecht in der Karte, nie die Seite.

### 4.19 Verlauf `.vl`
- Werkzeugzeile mit «Neuer Eintrag» (Filled) und Zähler; Formular auf `--flaeche` mit Hairline, Datum als Outlined-Feld, Text als Textarea.
- Zeitachse: 2 px Linie `--linie`, Punkte 10 px blau (Abgleich grau), Einträge durch Hairline getrennt. Datum 14 px 500, Quelle 12 px 500, Aktionen als Text-Knöpfe.

### 4.20 Sinnbilder `.icon`
- Inline-SVG 24er-Viewbox, `stroke: currentColor`, 1.8 px, runde Enden; 18 px in Knöpfen, 20 px in Navigation und Suche.
- Keine Icon-Schriften, keine fremden Bilder (Inhaltsrichtlinie). Neue Sinnbilder in `SINNBILDER` (app.js) eintragen.

---

## 5. Muster für Inhalte

| Situation | So wird es gezeigt |
|---|---|
| Datensatz mit Kennzahlen | Kachelreihe zuoberst, danach Karten. Kennzahlen nur, wenn sie eine Aussage haben (Zeit seit, Anteil, Anzahl). |
| Feldliste zum Lesen | Datenzeilen, Name links, Wert rechts. Zusammengehörige Felder in einer Karte, 4–9 Felder je Karte. |
| Feldliste zum Bearbeiten | Gestapelte Formzeilen in einer Karte, Speichern über die Speicherleiste, nie ein Speichern-Knopf in der Karte. |
| Liste von Personen / Geräten | Zeilen mit Name (14 px 500) und Untertitel (13 px), Aktionen rechts als Text-Knöpfe, Hauptaktion in der Kartenfusszeile. |
| Suche in einer Karte | Suchpille oben, Treffer als Liste mit Rahmen, Hinweis statt leerem Rahmen, wenn nichts gesucht wurde. |
| Warnung mit Handlung | Banner mit Text links und Knopf rechts. |
| Mehrere Werte eines Merkmals | Chips in `.chips`; bei mehr als etwa acht Werten eine Tabelle. |
| Vergleich mit der Flotte | Zeile mit Name, Wert rechts, Erklärung darunter, Mini-Verteilung max. 360 px. |
| Nichts vorhanden | Immer ein Satz (`.hinweis` oder Leerzustand), nie ein leerer Bereich. |
| Lange Texte | Titel und Werte brechen um (`overflow-wrap: anywhere`); Untertitel und Statusmarken enden mit «…» und tragen den vollen Text als `title`. |

---

## 6. Barrierefreiheit und Bedienung

- Fokus sichtbar: 2 px `--primaer` mit 2 px Abstand auf allen fokussierbaren Elementen (`:focus-visible`).
- Berührungsflächen mindestens 40 px auf dem Handy (`--tippziel`), Reiter 48 px.
- Kontrast: alle Textfarben erreichen mindestens 4.5 : 1 auf Weiss (`--text-still` 4.6 : 1, `--warnung` 5.9 : 1).
- Schalter mit `role="switch"` und `aria-checked`; Panels mit `aria-expanded`; Dialoge mit `role="dialog"` und `aria-modal`; Snackbars mit `aria-live="polite"`.
- Gesperrte Elemente erklären sich im `title`.
- Tastatur: «/» springt in die Suche, Esc schliesst Panels und Dialoge.

---

## 7. Geprüfte Grenzfälle

Automatisch geprüft (Sonde in jeder Ansicht: kein waagrechtes Rollen der Seite, kein Element ausserhalb des Fensters, kein abgeschnittener Text ohne «…»), dazu Sichtprüfung:

| Fall | Ergebnis |
|---|---|
| Breiten 360 / 375 / 768 / 1024 / 1280 / 1440 / 1920 px, alle Ansichten und alle 15 Bereiche | sauber |
| Gerätename 70 Zeichen ohne Leerzeichen im Titel, in der Tabelle, als Chip | bricht um bzw. endet mit «…» |
| Untertitel mit 200 Zeichen | «…», voller Text als Tooltip |
| 12 Statuschips im Seitenkopf | brechen in mehrere Zeilen um |
| Suchbegriff mit 80 Zeichen als Filterchip auf dem Handy | Chip bricht um, Seite rollt nicht |
| Programmname 90 Zeichen mit drei langen AD-Gruppen-Chips | Name bricht um, Chips rechts umgebrochen |
| Wert mit 180 Zeichen ohne Leerzeichen in «Alle Felder» | bricht um |
| Keine Treffer (Geräte, Benutzer, Software, Programme) | Leerzustand mit Satz |
| Kein Gerät zugeordnet / kein Benutzer zugeordnet | Leerzustand in der Karte, Hauptaktion bleibt |
| Ladezustand, Fehlerzustand (`?fehler=1`), unbekannte ID, Neu-Modus (`?neu=1`) | zentriert, Navigation ausgeblendet |
| Telefonliste: 74 Nummern, 7 nicht zugewiesen, Filter «Zugewiesen: Nein», Telefonfenster mit und ohne AD-Person, `telefon.html?neu=1` | Warnfarbe nur auf Text und Chip, Kacheln in einer Reihe, Formular mit Design-System-Feldern |
| Dialog «Benutzer zuordnen» mit Trefferliste auf 360 px | randlos, Liste rollt innen |
| Speicherleiste mit Toast gleichzeitig | Toast liegt 80 px über der Leiste |
| Verlaufsformular offen, Zeile in Bearbeitung | Felder Outlined, Knöpfe in Formularzeile |
| Filter- und Spaltenpanel auf 360 px | volle Breite, rollt innen |
| Kompakte Tabellendichte | 36 px Zeilen |

---

## 8. Regeln für neue Seiten und Bereiche

1. `design.css` zuerst laden, Seitenlayout in eine eigene Datei mit Präfix (`g-`, `b-`, `tf-`, `vl-`).
2. Nur Tokens verwenden; keine neuen Farben, Radien oder Schatten.
3. Jede neue Ansicht bekommt: Titelzeile (`.seitenkopf` oder `.bereich-titel`), Karten, Leerzustand, Fehlerzustand.
4. Genau eine gefüllte Hauptaktion je Bereich; alles andere Outlined oder Text.
5. Aktionen einer Karte in `.karte-aktionen`, nie lose hinter einer Liste.
6. Bearbeitbare Felder als `.datenzeile-form`, Lesefelder als `.datenzeile`.
7. Breite Inhalte (Tabellen, Zeitstrahl) in einen eigenen rollenden Behälter.
8. Vor dem Abschluss: Sonde in 360 / 768 / 1440 px laufen lassen (Abschnitt 7) und Sichtprüfung mit langen Texten.
