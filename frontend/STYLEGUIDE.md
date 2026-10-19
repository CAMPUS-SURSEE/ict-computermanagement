# Styleguide «ICT-Inventar»

Stand: 12.10.2026 · Gilt für alle Seiten unter `frontend/` (index, client, benutzer, telefon, software und styleguide.html).

Lebende Übersicht: **[styleguide.html](styleguide.html)** – jede Komponente in allen Zuständen, gebaut über dieselben
Bauer wie die Seiten, ohne Anmeldung und ohne Daten. Lokal: `code\serve.ps1`, dann
`http://localhost:8123/styleguide.html`; die Abschnitte sind Anker (`#grundlagen`, `#knoepfe`, `#status`, `#karten`,
`#daten`, `#formulare`, `#tabellen`, `#hinweise`, `#listen`, `#seitenkopf`, `#ueberlagerungen`, `#rahmen`, `#bewegung`).

Dieses Dokument nennt die Regeln. Die vollständigen Signaturen stehen in den Kopfkommentaren von `bausteine.js`
(`UI`), `rahmen.js` (`Rahmen` und Ebenen), `bewegung.js` (`Bewegung`) und `fenster.js` (`F`); bei einem Widerspruch
gilt der Code.

Inhalt: 1 Grundsätze · 2 Tokens · 3 Layout · 4 Komponenten · 5 Bewegung · 6 Überlagerungen · 7 Muster für Inhalte ·
8 Barrierefreiheit und Bedienung · 9 Regeln für neue Seiten und Bausteine · 10 Dateien und Ladereihenfolge

---

## 1. Grundsätze

**Vorbild ist die Admin-Oberfläche von ChatBob** («ChatBob intern»: Material 3 im Aufbau der Google-Konsolen).
Werte, Regeln und Bewegung sind 1:1 übernommen und auf deutsche Namen umbenannt. Massgebend ist der Vertrag des
ChatBob-Designsystems: **`docs/designsystem.md`** im ChatBob-Repository, dazu `design/tokens.css`, `design/motion.css`,
`design/motion.js` und `app/src/styles/`. Wo dieses Dokument schweigt, gilt ChatBob. Abweichungen stehen in §1.2 und
am Ort im Code.

### 1.1 Leitlinien

| Grundsatz | Konkret |
|---|---|
| **Getönter Grund, eine weisse Tafel** | Fenster, Kopf und Schublade liegen auf `--hintergrund` #f3f4f2, ohne Linien und Schatten. Darauf **eine** weisse Tafel mit 20 px Radius oben – der einzige Roller der Seite. `html` und `body` rollen nie. |
| **Haarlinien statt Schatten** | Karten: weiss, 1 px `--linie`, Radius 12, kein Schatten. Schatten (Ebene 1–3) tragen nur Dinge, die schweben: Dialog, Blatt, Meldung, Speicherleiste, Menüs. |
| **Eine Tönung** | Primär #1a3c25 für die stärkste Aktion, Fokus, Schalter, Fortschritt und Links. Das Pastell #cfdfad ist die **einzige** Tönung: aktive Navigation, gewählte Chips, Tonal-Knopf, Leerzustand. **Kein Blau**, auch kein blaues «Info»: neutral = `--flaeche-tief` + grünes Sinnbild. Das Campus-Grün #84b819 lebt nur im Punkt der Wortmarke. |
| **Jede Aktion ist eine Pille** | Knöpfe, Navigation, Suche, Zähler. Hover und Druck sind eine Zustandsebene (`::before` in `currentColor`, 8 % / 6 % / 10 %) – nie Anheben, Vergrössern oder Skalieren. |
| **Status nie nur Farbe** | Immer Sinnbild + Wort. Kennzahlen färben die Zahl nie; ein Ton steht als Sinnbild daneben. |
| **Links sind unterstrichen** | Das Primärgrün hat gegen den Text nur 1.35:1 – erkennbar ist ein Link an der Linie. |
| **Hierarchie über Schrift** | Google Sans, nur 400 und 500. Überschriften nie fett, Satzschreibung, keine Versalien-Titel, kein Sperren. Zahlen tabellarisch. |
| **4er-Raster** | Seite: 20 px zwischen Blöcken. Karte: 16 px zwischen Kindern. Polster 24 (Handy 16). |
| **Ruhige Bewegung** | Charakter kommt aus Form und Farbe. Etwas erscheint nur beim ersten Zeigen oder bei einem Wechsel; aktualisierte Daten animieren nie (§5). |
| **Die Seite rollt nie waagrecht** | Tabellen und Zeitstrahl rollen in ihrem eigenen Behälter; die Bahn ist eine Spalte `minmax(0, 1fr)`. |
| **Jeder Baustein genau einmal** | Klasse in `design.css`/`rahmen.css`, Bauer in `bausteine.js`/`rahmen.js`. Seiten bauen nur über `UI.*`, `Rahmen.*`, `Bewegung.*` und `F.*`; Seiten-CSS enthält nur Layout und liest nur Tokens. |

### 1.2 Bewusste Abweichungen von ChatBob

| Thema | ChatBob | ICT-Inventar | Warum |
|---|---|---|---|
| Markenzeichen | Bob (32 px) + «ChatBob» 22/28 | Wortmarke «ICT.INVENTAR»: Archivo 650, 112 % breit, Versalien, Punkt als satter Kreis in `--campus-gruen` | Zeichen des Inventars. Sie steht auf der linken **Kante** der Navigationssinnbilder (28 px), nicht auf ihrer Achse: eine Textmarke hat keine Achse. |
| Modus-Umschalter | «Chat \| Admin» im Kopf | keiner | Das Inventar hat nur einen Modus. |
| Ort der Tokens | `.cb-theme` | `:root` | Nur eine Oberfläche, kein Einbetten in fremde Seiten. |
| Gesperrte Knöpfe | nicht bedienbar | mit Grund (`aria-disabled`) fokussierbar, Tooltip nennt den Grund; Klicks schluckt `bausteine.js` | «Zuerst speichern oder verwerfen.» muss erklärbar sein. |
| Seitenwechsel | eine Single-Page-App | fünf HTML-Seiten; Cross-Document View Transitions mit der Choreografie von `shell.show` | kein Build-Schritt, klassische Skripte |
| Eigene Bausteine | – | Speicherleiste, Schalterzeile mit drei Zuständen, Zeitachse, Balken, Säulen, Verteilung, Zahlmarke, klickbare Kennwerte, Zeitstrahl, Filterblatt mit Live-Trefferzahl | im ChatBob-Stil entworfen (Spezifikation «Mapping 7.2») |
| Datenzeilen | Polster oben und unten | erste Zeile ohne Polster oben, letzte ohne Polster unten | Hier beenden sie oft eine Karte (12 + 24 px wären ungleich). |
| Literale als Tokens | `.6`, `.55`, 64/256 px im CSS | `--skala-klein`, `--deckkraft-veraltet`, `--kopf-hoch`, `--schublade-breit`, `--a12`, `--diagramm-*` | keine Literale ausserhalb von `:root` |
| Ebene des Dialogs | `--cb-z-dialog` 40 (Combobox-Menü) | `--z-dialog` = Schublade + 1 | ChatBobs Bestätigungsdialog liegt ebenso auf 51, über einem offenen Blatt. |

---

## 2. Tokens (`design.css`, `:root`)

Alle Farben, Radien, Schatten, Schriften, Abstände, Dauern und Kurven kommen aus diesen Tokens. **Verboten:** Literale
in Seiten-CSS und neue Tokens ohne ChatBob-Gegenstück oder Begründung. Die alten Namen (`--primaer-hell`, `--flaeche-2`,
`--weiss`, `--marke*`, `--r`, `--r-gross`, `--schatten*`) gibt es nicht mehr; **`--a5` ist jetzt 20 px** (früher 24).
Spalte «ChatBob»: das Gegenstück aus `design/tokens.css` (`--cb-*`) bzw. dem App-Theme (`--cba-*`).

### 2.1 Farben

| Token | Wert | Verwendung | ChatBob |
|---|---|---|---|
| `--hintergrund` | `#f3f4f2` | Grund, Kopf, Schublade; Hover von Tabellenzeilen | `--cba-backdrop` |
| `--flaeche` | `#fff` | Tafel, Karten, Tabellen, Dialog, Blatt, Speicherleiste | `--cba-surface` / `--cb-surface` |
| `--flaeche-tief` | `#f9f9f7` | Kacheln, gefüllte Karte, neutrales Banner, aktuelle Listenzeile, Code, nur lesbare Felder | `--cba-surface-low` |
| `--flaeche-hoch` | `#edeeec` | Suche, gefüllte Felder, neutraler Status-Chip, stiller Zähler, Zahlmarke | `--cba-surface-high` / `--cb-fill` |
| `--flaeche-hoechst` | `#e2e3e1` | Schalterspur aus, Skelettlinien, Spinnerspur, Hover gefüllter Felder | `--cba-surface-highest` |
| `--text` | `#1f1f1f` | Text, Werte, Titel | `--cba-text` / `--cb-text` |
| `--text-leise` | `#444746` | Beschriftungen, Lead, Meta, inaktive Sinnbilder; trägt auf jeder getönten Fläche | `--cba-text-2` / `--cb-muted` |
| `--text-still` | `#747775` | **nur auf Weiss**: Platzhalter, Leerwert «–» in Datenzeilen | `--cba-text-3` |
| `--linie` | `#e2e3e1` | passive Haarlinie: Karten, Trenner, Tabellenzeilen | `--cba-line` / `--cb-border` |
| `--linie-stark` | `#c4c7c5` | Umriss von Bedienelementen (umrandeter Knopf, Filter-Chip), Rollleisten-Griff | `--cba-line-2` / `--cb-border-strong` |
| `--umriss` | `#747775` | Feldrahmen, Kästchen, Schalter | `--cba-outline` |
| `--primaer` | `#1a3c25` | gefüllter Knopf, Text-Knopf, Links, Fokus, Schalter an, Fortschritt, Zeitachsenpunkt | `--cb-primary` / `--cba-primary` |
| `--primaer-hover` | `#2c4c36` | Referenzwert (Primär + 8 % Weiss) | `--cb-primary-hover` |
| `--primaer-druck` | `#153220` | Referenzwert | `--cb-primary-pressed` |
| `--auf-primaer` | `#fff` | Schrift und Sinnbild auf Primär | `--cb-on-primary` |
| `--akzent` | `#cfdfad` | **die einzige Tönung**: aktive Navigation, gewählter Chip, Tonal-Knopf, Zähler, Leerzustand-Scheibe, Spur von Fortschritt und Ladebalken, Textauswahl | `--cb-accent` / `--cba-secondary-container` |
| `--auf-akzent` | `#1a3c25` | Text und Sinnbild auf dem Pastell | `--cb-on-accent` / `--cba-on-secondary-container` |
| `--campus-gruen` | `#84b819` | nur Dekoration: Punkt der Wortmarke, nie Text | `--cb-brand-lime` |
| `--erfolg` | `#146c2e` | Erfolgs-Sinnbild | `--cba-success` |
| `--erfolg-container` | `#c4eed0` | Erfolgs-Chip und -Banner | `--cba-success-container` |
| `--auf-erfolg` | `#0f5223` | Text darauf | `--cba-on-success-container` |
| `--warnung` | `#8f4e06` | Warn-Sinnbild | `--cba-warning` |
| `--warnung-container` | `#feefc3` | Warn-**Chip**, Zahlmarke «warnung» | `--cba-warning-container` |
| `--auf-warnung` | `#8f4e06` | Text auf dem Warn-Chip (5.6:1) | `--cba-on-warning-container` |
| `--warnung-flaeche` | `#fdf6e7` | Warn-**Banner** über die ganze Breite (ruhiger als der Chip; Text bleibt `--text`) | `--cba-warning-surface` |
| `--gefahr` | `#b3261e` | Fehler-Sinnbild, Rahmen ungültiger Felder | `--cba-error` / `--cb-danger` |
| `--gefahr-container` | `#f9dedc` | Fehler-Chip und -Banner | `--cba-error-container` |
| `--auf-gefahr` | `#8c1d18` | Text darauf, Feldfehler | `--cba-on-error-container` |
| `--invers` | `#303030` | Meldung, Tooltip | `--cba-inverse` |
| `--auf-invers` | `#f2f2f2` | Text darauf | `--cba-on-inverse` |
| `--invers-primaer` | `#a1d73b` | Erfolgs-Sinnbild und Aktion in der Meldung | `--cba-inverse-primary` |
| `--schleier` | `rgba(0,0,0,.32)` | hinter Dialog, Blatt, modaler Schublade; nie unscharf | `--cb-scrim` / `--cba-scrim` |
| `--deaktiviert-flaeche` | `rgba(31,31,31,.12)` | Fläche und Rand gesperrter Knöpfe | `--cb-disabled-fill` |
| `--deaktiviert-text` | `rgba(31,31,31,.38)` | Schrift gesperrter Knöpfe | `--cb-disabled-ink` |
| `--link-unterstrich` | `rgba(26,60,37,.4)` | Linie unter Links in Ruhe (Hover: `--primaer`) | `--cb-link-underline` |
| `--link-dicke` / `--link-abstand` | `1px` / `3px` | Linie unter Links | `--cb-link-underline-thickness` / `-offset` |
| `--fuell-rund` | `rgba(31,31,31,.08)` | Scheibe hinter runden Knöpfen (`.knopf-scheibe`) | `--cb-fill-round` |
| `--diagramm-a` / `-b` | `--primaer` / `--akzent` | Balken, Säulen, Zeitstrahl (b = Vergleichsreihe) | – (Mapping 7.2 #11–12) |
| `--diagramm-gefahr` / `-warnung` | `--gefahr` / `--warnung` | überfällig / im laufenden Geschäftsjahr | – |

Kontrast: `--text-still` erreicht 4.5:1 **nur auf Weiss**. Das Pastell hat gegen Weiss 1.42:1 und gegen den Grund
1.3:1 – eine Auswahl trägt darum immer zusätzlich ein Häkchen, das Gewicht 500 oder ein `aria-*`-Attribut.

### 2.2 Radien

| Token | Wert | Rolle | Verwendung | ChatBob |
|---|---|---|---|---|
| `--r-xs` | 4 px | | Tooltip, Inline-Code, Kürzel, Sortierknopf | `--cba-radius-xs` |
| `--r-s` | 8 px | `--r-feld`, `--r-chip` | Felder, Filter-Chips, Meldung, Skelett-Titel | `--cba-radius-sm`, `--cb-radius-field`, `--cb-radius-chip` |
| `--r-m` | 12 px | `--r-karte`, `--r-status` | Karten, Banner, Zeilenliste, Tabellenrahmen, Status-Chip | `--cb-radius-card`, `--cba-radius-md` |
| `--r-l` | 16 px | `--r-kachel`, `--r-dialog` | Kacheln, Dialog, Blatt (vordere Ecken), modale Schublade, Speicherleiste | `--cba-radius-lg`, `--cb-radius-dialog` |
| `--r-xl` | 20 px | `--r-tafel` | Tafel (nur oben) | `--cb-radius-panel`, `--cba-radius-xl` |
| `--r-2xl` | 28 px | | (Reserve) | `--cba-radius-2xl` |
| `--r-rund` | 9999 px | `--r-aktion` | jede Aktion: Knöpfe, Navigation, Suche, Zähler, Skelettlinien, Fortschritt | `--cb-radius-action` |

### 2.3 Erhebung

| Token | Verwendung | ChatBob |
|---|---|---|
| `--erhebung-1` | Hover gefüllter Knöpfe | `--cba-elev-1` (= `--cb-elev-hover`) |
| `--erhebung-2` | Sprungmarke (und Menüs, falls es welche gibt) | `--cba-elev-2` (= `--cb-elev-popover`) |
| `--erhebung-3` | Dialog, Blatt, Meldung, modale Schublade, Speicherleiste | `--cba-elev-3` (= `--cb-elev-panel`/`-dialog`) |

Karten, Kacheln und die Tafel haben **keinen** Schatten.

### 2.4 Schrift

Google Sans (variable `opsz`-Achse) und Archivo (nur Wortmarke) kommen von Google Fonts; fällt der Dienst aus, greifen
Roboto, Segoe UI, `system-ui`. Ohne Roboto-Webfont.

| Token | Wert | ChatBob |
|---|---|---|
| `--schrift` | `'Google Sans', Roboto, 'Segoe UI', system-ui, sans-serif` | `--cb-font` |
| `--schrift-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, …` | `--cb-font-mono` |
| `--schrift-marke` | `Archivo, 'Trade Gothic Next', …` – nur die Wortmarke (das Campus-Logo ist in Trade Gothic Next gesetzt) | – |
| `--gewicht-text` / `--gewicht-titel` | 400 / 400 – Überschriften sind nie fett | `--cb-weight-regular` / `-title` |
| `--gewicht-beschriftung` | 500 (`strong`, `b` ebenso) | `--cb-weight-label` |
| `--gewicht-marke` | 650 – nur die Wortmarke | – |
| `--groesse-anzeige` | 36 px – Kennzahlen, schrumpfen mit der Kachel | `--cb-size-display` |

Rollen als `font`-Kurzschrift. **Die Kurzschrift setzt `font-variant-numeric` zurück: `tabular-nums` danach setzen.**

| Rolle | Wert | Wo | ChatBob |
|---|---|---|---|
| `--t-ueberschrift` | 400 24/32 | Seitentitel (h1) | `--cb-font-headline` |
| `--t-titel` | 400 22/28 | Dialog- und Blatttitel, Wortmarke | `--cb-font-title` |
| `--t-untertitel` | 500 16/24 | Kartentitel, Leerzustand-Titel | `--cb-font-subtitle` |
| `--t-lesen` | 400 16/24 | Wortmarke ≤ 600 px; Lesetext | `--cb-font-reading` |
| `--t-text` | 400 14/20 | Standard: Text, Felder, Banner, Meldung, Navigation, Lead | `--cb-font-body` |
| `--t-dicht` | 400 14/20 | Tabellen | `--cb-font-dense` |
| `--t-beschriftung` | 500 14/20 | Knöpfe, Tabellenkopf, Schubladen-Gruppe, aktiver Eintrag, Kontoname, Listentitel | `--cb-font-label` |
| `--t-chip` | 500 14/20 | Filter-Chips | `--cb-font-chip` |
| `--t-meta` | 400 12/16 | Meta-Zeilen, Hinweise unter Feldern, Zeitstempel, Tooltip, E-Mail, Kachel-Unterzeile | `--cb-font-meta` |
| `--t-klein` | 500 12/16 | Status-Chips, Feldbeschriftungen, `dt` der Fakten, Zähler | `--cb-font-caption` |
| `--t-anzeige` | 400 36/44 | Kennzahlen (`min(36px, 26cqi)`) | `--cb-font-display` |
| `--t-code` | 400 13/20 mono | Code-Block (Rohdaten) | `--cb-font-code` |

### 2.5 Abstände

| Token | Wert | Typisch | ChatBob |
|---|---|---|---|
| `--a1` | 4 px | Label zu Feld, Status-Chip innen | `--cb-space-1` |
| `--a2` | 8 px | Knöpfe nebeneinander, Chips, Zeilen in Listen | `--cb-space-2` |
| `--a3` | 12 px | Datenzeilen senkrecht, Werkzeugleiste, Sinnbild zu Text | `--cb-space-3` |
| `--a4` | 16 px | **Rhythmus in Karten**, Polster Handy | `--cb-space-4` |
| `--a5` | 20 px | **Rhythmus der Seite** (Bahn, Stapel, Raster) | `--cb-space-5` |
| `--a6` | 24 px | Kartenpolster, Bahn oben, Dialogpolster | `--cb-space-6` |
| `--a7` | 28 px | (Reserve) | `--cb-space-7` |
| `--a8` | 32 px | Bahn seitlich, Leerzustand | `--cb-space-8` |
| `--a10` | 40 px | Feldhöhe, Icon-Knopf | `--cb-space-10` |
| `--a12` | 48 px | Schubladen-Eintrag, Meldung min. | – |

### 2.6 Bewegung

| Token | Wert | Reduziert | Wofür | ChatBob |
|---|---|---|---|---|
| `--dauer-sofort` | 100 ms | 1 ms | Druck, ausgehender Inhalt, Tooltip-Austritt | `--cb-dur-instant` |
| `--dauer-schnell` | 150 ms | 1 ms | Farbe, Deckkraft kleiner Dinge, kleine Austritte | `--cb-dur-fast` |
| `--dauer-basis` | 200 ms | 1 ms | Hover-Ende von Formen, Schalter, Austritt von Flächen, Schleier | `--cb-dur-base` |
| `--dauer-mittel` | 250 ms | 1 ms | Eintritte, Hover-Beginn von Formen, Indikator | `--cb-dur-medium` |
| `--dauer-langsam` | 350 ms | 1 ms | grosse Flächen: Blatt, modale Schublade | `--cb-dur-slow` |
| `--dauer-gleiten` | 600 ms | 1 ms | Werte, die reisen: Fortschritt, Hochzählen, Balken | `--cb-dur-glide` |
| `--kurve-standard` | `cubic-bezier(.2,0,0,1)` | gleich | Farben, **jede Deckkraft**, Indikator, Hover | `--cb-ease-in-out` |
| `--kurve-bremsen` | `cubic-bezier(.05,.7,.1,1)` | gleich | Weg eintretender kleiner Dinge | `--cb-ease-out` |
| `--kurve-beschleunigen` | `cubic-bezier(.3,0,1,1)` | gleich | alles, was geht | `--cb-ease-in` |
| `--kurve-betont` | `cubic-bezier(.2,0,0,1)`, mit `linear()` die exakte M3-Kurve | gleich | grosse Flächen | `--cb-ease-emphasized` |
| `--weg-s` / `-m` / `-l` / `-xl` | 4 / 8 / 12 / 24 px | 0 | Tausch / Standard-Heben / Blatt-Austritt / Blatt-Eintritt | `--cb-distance-sm…xl` |
| `--weg-blatt` | 100 % | 0 % | modale Schublade | `--cb-distance-sheet` |
| `--skala-eintritt` | .98 | 1 | Startgrösse von Dialog und Tooltip | `--cb-scale-enter` |
| `--skala-klein` | .6 | .6 | Zähler (aufploppen), Knopf-Scheibe | Literal `.6` |
| `--staffel` | 30 ms | 0 ms | Schritt der Staffelung (höchstens 6) | `--cb-stagger` |
| `--verzoegerung-lader` | 200 ms | gleich | Ladeanzeigen erscheinen erst danach | `--cb-delay-loader` |
| `--verzoegerung-start` | 400 ms | gleich | Reserve (ChatBob: Startbildschirm) | `--cb-delay-boot` |
| `--schleife-dreh` / `-dreh-schnell` | 1 s / .8 s | 1.4 s | Spinner / Spinner im Status-Chip | `--cb-loop-spin` / `-spin-fast` |
| `--schleife-unbestimmt` / `-puls` | 2 s / 2 s | 2.4 s | Ladebalken / Skelett | `--cb-loop-indeterminate` / `-pulse` |
| `--deckkraft-veraltet` | .55 | gleich | `.veraltet`: Inhalt, der gleich ersetzt wird | Literal in `.cba-stale` |

Keine Kurve verlässt [0, 1]: nichts schwingt über, nichts federt.

### 2.7 Zustandsebenen, Ebenen, Fokus, Masse

| Token | Wert | Verwendung | ChatBob |
|---|---|---|---|
| `--zustand-hover` | .08 | Hover auf Bedienelementen | `--cb-state-hover` |
| `--zustand-hover-gross` | .06 | Hover auf grossen Zielen: Navigation, Zeilen, Kacheln | `--cb-state-hover-lg` |
| `--zustand-druck` | .10 | `:active` | `--cb-state-pressed` |
| `--zustand-deaktiviert` | .38 | Deckkraft gesperrter Chips und Schalter | `--cb-state-disabled` |
| `--z-erhoben` | 1 | klebende Tabellenzellen | `--cb-z-raised` |
| `--z-klebend` | 20 | Kopf, Tafelkante, Ladebalken, Speicherleiste | `--cb-z-sticky` |
| `--z-schublade` | 50 | modale Schublade **und** Seitenblatt | `--cb-z-drawer` |
| `--z-dialog` | 51 | Dialog, auch über einem offenen Blatt | `calc(50 + 1)` |
| `--z-meldung` | 60 | Meldungen, Tooltip, Sprungmarke | `--cb-z-toast` |
| `--fokus` | `--primaer` | Farbe jedes Fokusrings | `--cb-focus` |
| `--fokus-breite` / `--fokus-abstand` | 2 px / 2 px | | `--cb-focus-width` / `-offset` |
| `--fokus-umriss` | `2px solid --fokus` | `:focus-visible` überall | `--cb-focus-outline` |
| `--fokus-ring` | `0 0 0 2px #fff, 0 0 0 4px --fokus` | Schattenform für Medien (derzeit ungenutzt) | `--cb-focus-ring` |
| `--kopf-hoch` | 64 px | Kopfzeile, Blattkopf | Literal in `shell.css` |
| `--schublade-breit` | 256 px | Schublade | Literal in `shell.css` |
| `--bahn-max` | 1280 px | grösste Inhaltsbreite | `--cba-max` |
| `--mass` | 76ch | Zeilenlänge von Lead und Hinweisen | `--cba-measure` |
| `--meldung-platz` | 64 px | Platz am Tafelende für eine zweizeilige Meldung | `--cba-toast-room` |

**Laufzeit- und Komponentenvariablen** setzen Bauer und `rahmen.js`, nie Seiten: `--i` (Staffelstufe), `--anteil`,
`--fortschritt`, `--indikator-x/-y/-w/-h`, `--leiste-hoehe`, `--leiste-reserve`, `--leiste-rest`, `--meldung-*`,
`--rollleiste`; dazu die Stellschrauben der Bausteine (`--knopf-*`, `--karte-polster`, `--bewegung-weg`,
`--bewegung-skala`, `--eintritt-*`, `--austritt-dauer`).

---

## 3. Layout

### 3.1 Rahmen (alle Seiten gleich)

```
┌ Kopf 64 px: [≡ ≤900] ICT.INVENTAR ·············· ( (A) Name / E-Mail │ Abmelden ) ┐
│ Schublade 256 px │ ╭──── Tafel (weiss, Radius 20 oben, EINZIGER Roller) ───────────────╮ │
│ Gruppen in       │ │ ▔▔ Ladebalken 4 px (klebt)                                         │ │
│ Satzschreibung,  │ │  .bahn  max 1280, Polster 24 / 32 / 96, Raster-Abstand 20          │ │
│ 48-px-Pillen,    │ │   Seitenkopf (‹ Zurück · h1 24/32 · Lead · Status · Aktionen)     │ │
│ aktiv = Pastell  │ │   Karten · Kacheln · Tabellen …                                    │ │
│                  │ │                                        ╭ Speicherleiste ╮          │ │
└──────────────────┴─╰ [Meldung unten links] ──────────────────────────────────────────╯─┘
```

| Teil | Klasse / Bau | Regeln |
|---|---|---|
| Seite | `body.app[data-seite]` | Raster aus Kopf, Schublade, Tafel; `100dvh` (nicht `100vh`); rollt nie. `rahmen.js` baut Kopf und Schublade **sofort beim Laden** aus dem Gerüst (§9.1). |
| Kopf | `.kopf` (rahmen.js) | Ohne Linie, ohne Schatten. Links [Menüknopf ≤ 900 px] und die Wortmarke (Link zur Übersicht). Rechts **auf allen Seiten** EINE Kapsel `.kopf-konto` (48 px, Pille, weiss, 1 px `--linie`): Initiale 32 px (Pastell), Name 14/20 500 und E-Mail 12/16 (höchstens `--konto-breit`, dann «…»), ein Trenner, «Abmelden» (Text-Knopf). Kein Datenstand im Kopf. Das Konto der vorigen Seite belegt den Kopf vom ersten Bild an vor; die Wortmarke wartet höchstens 300 ms auf Archivo. Vorführmodus: Konto «Vorführmodus», kein «Abmelden» (die Kapsel endet nach dem Text). |
| Schublade | `.schublade` über `Rahmen.navigation` bzw. `F.navZeichnen` | Gruppentitel in Satzschreibung (`--t-beschriftung`, `--text-leise`), nie Versalien. Einträge: 48-px-Pillen, Sinnbild 20 + Text 14/20 (`--text-leise`), Zähler als Beschriftung 12/16 500 rechts. Aktiv: gleitende Pastell-Pille + 500 + `aria-current="page"`. Einträge sind echte Links (Mittel-/Ctrl-Klick = neuer Tab). Hauptseite: je Modul zuerst seine «Übersicht», dann die Listen · «Geräte»: Übersicht, ADMIN-Clients, EDU-Clients · «Verzeichnis»: Übersicht, Benutzer, Telefonnummern, Software · «Videoüberwachung»: Übersicht, Kameras, Kamerarechte (`Rahmen.HAUPTZIELE`, einzige Quelle). Detailseiten: zuoberst der Zurück-Eintrag «← ADMIN-Clients» (`.schublade-zurueck`, Link zur gemerkten Liste, rollt nicht mit, Haarlinie darunter; `Rahmen.navigation({ zurueck })`, von `F.navZeichnen` gesetzt), darunter die Bereiche des Datensatzes in Gruppen (Client: «Gerät», «Aus SCCM», «Auswertung»). |
| Ohne Schublade | `navigation({ verstecken: true })` → `.app[data-ohne-schublade]` | Neu-Formulare, Fehler- und Endzustand der Detailseiten: Tafel volle Breite, die Wortmarke bleibt an ihrer Stelle. |
| Tafel | `.tafel-rahmen > main.tafel#tafel` | Weiss, Radius 20 oben, 16 px Abstand rechts, unten bis an den Fensterrand. Einziger Roller. Kante: Haarlinie oben nur, solange etwas darunter gerollt ist (`data-gerollt`). |
| Ladebalken | `.ladebalken#ladebalken` | 4 px, klebt oben, Pastell-Spur mit laufendem Primärsegment; erst nach 200 ms. |
| Bahn | `.bahn#inhalt` | Höchstens 1280 px, mittig; Polster 24 oben, 32 seitlich, 96 unten (Platz für eine Meldung). Raster mit **einer** Spalte `minmax(0, 1fr)` und 20 px Abstand. Container «bahn»: schmale Darstellungen richten sich nach der Bahn, nicht nach dem Fenster. `data-zustand="laden\|fehler\|ende"` blendet den Seiteninhalt aus. |

### 3.2 Hauptseite (`index.html`)

- Sechs Ansichten `section.ansicht.stapel#ansicht-<n>` (`uebersicht`, `admin`, `edu`, `benutzer`, `telefone`, `software`),
  genau eine sichtbar. Der Hash trägt Ansicht und Zustand (`#admin?q=…`): Ansichtswechsel mit `pushState`, Filter,
  Sortierung und Spalten mit `replaceState`.
- Jede Ansicht beginnt mit einem Seitenkopf (h1 24/32, ohne Lead).
- **Tabellenansichten:** Werkzeugleiste (Suche · «Filter» · «Spalten» mit Zahl der sichtbaren Spalten · «CSV» · rechts Trefferzahl und «Neuer …» – bei «Benutzer» keiner, die Liste pflegt der Abgleich aus dem AD), darunter
  die Chips aktiver Filter, darunter der Tabellenrahmen. `Rahmen.fest(true)`: ab 601 × 720 px rollt die Tafel nicht, die
  Liste füllt den Rest und rollt selbst (Kopf und erste Spalte kleben). Darunter rollt die Tafel wie jede Seite, die Liste
  bleibt ein eigener Roller, höchstens so hoch wie die Tafel.
- **Übersicht:** Handlungsbedarf (Zeilenliste mit Zahlmarken, Gefahr vor Warnung; leer: Erfolgsbanner) · Bestand (eine
  Bestandskarte je Liste: Hauptzahl als Kachel, darunter klickbare Kennwerte) · Ersatzplanung (Zeitstrahl je Client-Liste)
  · Verteilungen. Jede Zahl öffnet die passende Liste, schon gefiltert.
- **Software:** Suche + «Neues Programm», eine Karte je Programm.

### 3.3 Detailseiten (`client`, `benutzer`, `telefon`, `software`, `kamera`, `kamerarolle`)

In der Bahn stehen nur `header.seitenkopf#<p>-kopf` und `div.fenster-bereich#<p>-bereich` (Präfix `g`, `b`, `tf`,
`sw`, `km`, `kr`); alles andere baut das Gerüst `F` aus `fenster.js`.

| Teil | Regeln |
|---|---|
| Seitenkopf (`F.seitenkopf`) | Zurück-Link «‹ ADMIN-Clients» (`.knopf.knopf-leise.knopf-klein.seitenkopf-pfad` mit `chevronLinks`; Text = Name der Liste) zur **gemerkten Listenadresse samt Suche, Filtern und Sortierung** – nur, wo die Schublade ihn nicht trägt (Neu-Modus, Fehler- und Endzustand, Fenster ≤ 900 px); Titel h1; Teile-Zeile («Haus A / 1. OG · Latitude 5540 · …»), kein Lead; Status-Chips nur für Abweichungen; **Schnellaktionen rechts** als Text-Knöpfe mit Sinnbild («Ins Lager legen», «Ausgeben an …» bzw. bei EDU-Clients «In Betrieb nehmen», «Archivieren», «Reaktivieren», «Nummer freigeben»), **«Löschen …» zuletzt** (Client, Telefon, Software; Benutzer haben keinen Löschknopf, ihre Liste pflegt der Abgleich). Gesperrt mit Grund, solange etwas ungespeichert ist («Nummer freigeben» auch, solange das AD die Nummer bei jemandem führt); die Knöpfe bleiben dabei stehen, nur die Sperre wechselt (§4.15). |
| Bereich (`F.zeichneBereich`) | Karten im 20-px-Rhythmus (`.fenster-bereich`, `.stapel`, `.karten`, `.raster-2`). Neu zeichnen bewahrt Fokus, Schreibmarke und Rollpositionen. |
| Bereichswechsel (`F.bereichWechseln`) | Adresse per `replaceState` (`#stammdaten`), Pille gleitet, Inhalt blendet durch. |
| Zustände | `F.zeigeLaden`, `F.ladefehler`/`F.zeigeFehler` (mit Zurück-Link, ohne Schublade), Endzustand nach dem Löschen mit «Zur Liste» (Software: «Zur Software-Liste»); im Neu-Modus ohne Schublade, mit Zurück-Link. |
| Unten | Speicherleiste (§6.5), Meldungen (§6.3). |

### 3.4 Breiten und Umbrüche

| Grenze | Verhalten |
|---|---|
| Fenster ≤ 1100 px | Kacheln 4 → 2 Spalten |
| Bahn ≤ 1040 / ≤ 520 px | genau vier Fakten: 2 × 2 / untereinander (sonst 4 in einer Reihe) |
| Fenster ≤ 900 px | **Schublade modal**: Menüknopf links im Kopf, Schleier, gleitet von links, Fokusfalle, Esc, schliesst bei Wahl. `.raster-2` einspaltig. |
| Bahn ≤ 760 px (Dialog, Blatt: Fenster ≤ 760 px) | Formularraster einspaltig – neben der festen Schublade schon bei rund 1024-px-Fenstern |
| Fenster ≤ 720 px | Konto als Initiale in der Kapsel (Tooltip mit Name und E-Mail, dann ein Tabstopp); Bahn-Polster 20 oben, 16 seitlich; Chip-Trenner weg |
| Bahn ≤ 600 px | Seitenkopf-Aktionen links unter dem Titel |
| Fenster ≤ 600 px | Tafel randlos (Oberkante bleibt rund); Wortmarke 16/24; Kartenpolster 16; Kacheln 8 px Abstand; Blatt volle Breite ohne Radius; Meldung über die ganze Breite; Speicherleiste 16 px vom Rand; Aktionen von Listenzeilen und Chips von Schalterzeilen rutschen unter den Text; Tabellenkopf darf umbrechen |
| unter 601 × 720 px | Tabellenansichten rollen mit der Tafel (siehe §3.2) |
| Fenster ≤ 359 px (320 px, 400 % Zoom) | Kapsel nur mit «Abmelden» (Konto nur für Screenreader; im Vorführmodus keine Kapsel), Tabellenpolster 8 px |

Verglichen mit ChatBob bei 1440, 900 und 390 px; geprüft zusätzlich 320 px, 200 % Zoom und niedrige Fenster (fester Modus).

---

## 4. Komponenten

Je Komponente: Klassen (`design.css`), Bauer (`bausteine.js`, Ebenen in `rahmen.js`), Zustände, Regeln. Muster in
`styleguide.html`. Für **alle Bauer** gilt: Sie geben einen DOM-Knoten zurück, setzen Text nur per `textContent`,
nehmen Optionen als Objekt (die alten Positionsparameter gehen weiter), schreiben leere Werte als «–» und
- `fokus: 'schluessel'` setzt `data-fokus` – damit finden Neuzeichnen und Rückfokus das Element wieder (jedes Bedienelement ohne `id` braucht es);
- `titel` ist der eigene Tooltip (`data-tipp`), nie das Browser-`title`;
- was sich an Ort und Stelle ändert, hat Methoden am Knoten (`.setzen()` …): umschalten, nicht neu bauen.

### 4.1 Sinnbilder
`.icon` · `UI.sinnbild(name, groesse = 20, klasse?)` · `UI.SINNBILDER`
- Ein Set im Lucide-Stil: 24er-Raster, Strich 2, runde Enden, immer `currentColor`, immer `aria-hidden` (den Namen trägt das Bedienelement).
- Grössen: **20** Navigation, Icon-Knöpfe, Banner, Kachel-Beschriftung · **16** in Knöpfen, Chips, Listen, Meta-Zeilen · **18** Häkchen im Filter-Chip · **24** Leerzustand.
- Neue Glyphen kommen in `UI.SINNBILDER`, im selben Stil; nie inline-SVG oder Icon-Schriften in Seiten. Masken im CSS (Kalender, × der Suche, Schloss im Schalter) gleichen den Glyphen. Ein unbekannter Name meldet `console.error`.

### 4.2 Knöpfe
`.knopf` · `UI.knopf({ text, variante, sinnbild, klein, weiter, titel, label, beiKlick, typ, id, href, gedrueckt, deaktiviert, gesperrt, fokus, klasse })` · `UI.knopfText`, `UI.knopfSperren`, `UI.knopfSperre`, `UI.beschaeftigt`, `UI.beschaeftigtAbwarten`

| Variante | Klasse / `variante` | Aussehen | Einsatz |
|---|---|---|---|
| Umrandet | `.knopf` (Standard) | 36 px Pille, 1 px `--linie-stark`, Text Primär | Nebenaktion mit Gewicht |
| Gefüllt | `.knopf-primaer` / `'primaer'` | Primär, Schrift weiss, Hover Ebene 1 | **genau eine** Hauptaktion je Bereich: «Speichern», «Neuer ADMIN-Client», im Dialog die Folge |
| Tonal | `.knopf-tonal` / `'tonal'` | Pastell | weichere Hauptaktion in Karten: «Neuer Eintrag», «Filter zurücksetzen», Aktion im Leerzustand |
| Text | `.knopf-leise` / `'leise'` | nur Primärschrift, 12 px Polster | «Abbrechen», Zurück-Link, Schnellaktionen im Seitenkopf, Zeilen- und Fusszeilenaktionen, «Abmelden» |
| Gedämpft | `.knopf-still` / `'still'` | `--text-leise`, beim Hover `--text` | Werkzeugleiste: «Filter», «Spalten», «CSV» |
| Nur Sinnbild | `.knopf-sinnbild` / `'sinnbild'` oder `sinnbild` ohne `text` | rund 40 px (klein 32), gedämpft | ×, Menü; **`titel` ist Pflicht** (wird `aria-label` und Tooltip) |
| Scheibe | `.knopf-scheibe` | volle Scheibe `--fuell-rund` wächst .6 → 1 | runde Knöpfe auf dem Grund |
| Klein | `.knopf-klein` / `klein: true` | 32 px | Zurück-Link, Aktionen in Zeilen, Knöpfe im Banner |
| Weiter | `.knopf-weiter` / `weiter: true` | nachgestellter Pfeil rückt beim Hover 4 px nach | «Liste öffnen» |

| Zustand | So |
|---|---|
| Gedrückt | `gedrueckt: true` → `aria-pressed="true"` (oder `.aktiv`) = tonal |
| Öffnet ein Blatt | `aria-haspopup="dialog"` + `aria-expanded`; solange es offen ist `.aktiv` (tonal) |
| Beschäftigt | `UI.beschaeftigt(k, true)`: sofort gesperrt (`aria-busy`), Spinner erst nach 200 ms in gleicher Breite, sichtbar mindestens 450 ms; Fokus bleibt |
| Gesperrt mit Grund | `gesperrt: 'Zuerst speichern oder verwerfen.'` bzw. `UI.knopfSperren(k, grund)`: `aria-disabled`, bleibt fokussierbar, Tooltip nennt den Grund, Klicks werden geschluckt. **Immer so für Schnellaktionen.** `UI.knopfSperre(k)` liest Grund und freien Tooltip, ohne etwas zu ändern. |
| Deaktiviert | `deaktiviert: true` → `disabled`, nur ohne erklärbaren Grund. Aussehen neutral: Fläche 12 %, Schrift 38 % |

Regeln: **Keine roten Knöpfe** (`.knopf-gefahr` gibt es nicht): die Hauptaktion nennt die Folge («Eintrag löschen»,
«Archivieren»). «…» am Ende heisst: es folgt eine Rückfrage oder Auswahl («Löschen …», «Ausgeben an …»). Im Dialog
zuerst «Abbrechen» (Text), dann rechts die Hauptaktion. Ein führendes Sinnbild rückt den Text auf 12 px Polster. Einen
Zähler im Knopf baut `UI.zaehler` (auf tonaler Fläche dunkel).

### 4.3 Status-Chips
`.status.status-<ton>` · `UI.status(text, ton = 'neutral', { sinnbild, titel })` → `.setzen(text, ton, optionen)`

| Ton | Sinnbild | Fläche / Schrift |
|---|---|---|
| `erfolg` | check | `--erfolg-container` / `--auf-erfolg` |
| `warnung` | achtung (Dreieck) | `--warnung-container` / `--auf-warnung` |
| `gefahr` | achtung (Dreieck) | `--gefahr-container` / `--auf-gefahr` |
| `neutral` (Standard) | info | `--flaeche-hoch` / `--text-leise` |
| `laeuft` | Spinner 14 px (0.8 s) | neutral, Schrift `--text` |
| `wartet` / `aus` | uhr / Verbot | neutral |

24 px hoch, Radius 12, 12/16 500, Sinnbild 16 + Text. Regeln: Der **Normalfall bekommt keinen Chip** («Aktiv», «In
SCCM»); Chips zeigen Abweichungen («Archiviert», «Im Lager», «Ersatz überfällig», «Nicht in SCCM», «Nicht zugewiesen»).
Ein Ton sagt, ob etwas zu tun ist: «Frei» (Telefonnummer) ist darum **neutral** mit `checkKreis`,
kein Problem – auf allen Seiten gleich (§7.1).
`sinnbild: false` nur, wo der Text allein eindeutig ist. Mit `titel` wird der Chip ein Tabstopp (Tooltip auch per
Tastatur) – darum `titel` nur, wo er etwas sagt. In Tabellen bricht ein Chip nie um; Zeilen werden nie getönt. Der
Zustand eines AD-Kontos kommt immer aus `Modell.adStatus(b)`.

### 4.4 Filter-Chips und Zähler
`button.chip` · `UI.chip({ text, gewaehlt, beiKlick(gewaehlt), entfernen, titel, label, sinnbild, href, deaktiviert, umschalten })` → `.setzen()`, `.istGewaehlt()` · `UI.chips([…])` · `UI.zaehler(zahl, still, { ploppen })` → `.setzen(n)`
- Chip 32 px, Radius 8, 1 px `--linie-stark`, 14/20 500. **Gewählt** (`gewaehlt` gesetzt): Pastell + Häkchen + `aria-pressed`, schaltet selbst um. **Entfernbar** (`entfernen: fn`): aktiver Filter «Hersteller: HP ×», Pastell, `aria-label` «Filter «…» entfernen»; mit Bewegung entfernen: `Bewegung.austreten(chip, 'skalieren')`.
- Ein Chip ist höchstens so breit wie seine Zeile; langer Text endet mit «…», der Tooltip zeigt ihn ganz.
- Reihe `.chips` (8 px), Trenner `.chips-trenner`; die Ergebniszahl `p.anzahl` («47 von 163») steht als letztes Kind rechts.
- Zähler: 20 px Pille, Pastell (Anzahl aktiver Filter) oder still (Anzahl Spalten). Leer = verborgen. Einmal bauen, dann `.setzen(n)`: von leer auf eine Zahl ploppt er einmal (.6 → 1), Zahl → Zahl ohne Bewegung.

### 4.5 Karten
`.karte` · `UI.karte({ titel, unter, aktionen, fuss, sinnbild, breit, gefuellt, ebene = 2, klasse, id })` → `.inhalt`, `.kopf`, `.aktionen`, `.fuss`
- Weiss, Haarlinie, Radius 12, Polster 24 (Handy 16), **kein Schatten**. Zwischen allen Kindern 16 px.
- Kopf: Titel 16/24 500 (h2; `ebene` ändert die Stufe) links, `aktionen` rechts. Knöpfe ragen über die 24-px-Titelzeile hinaus, damit jeder Kartentitel auf derselben Höhe beginnt; schmal brechen sie links unter den Titel. `sinnbild`: 20 px vor dem Titel.
- `unter`: Beschreibungssatz 14/20 leise, 16 px unter dem Titel (höchstens 76 Zeichen) – nur, wo er Nicht-Offensichtliches sagt, nie als Wiederholung des Titels.
- Zwischentitel `.karte-untertitel` (h3, 24 px Luft darüber, 8 darunter); Teil mit Haarlinie `.unterabschnitt`.
- `fuss`: Fusszeile (`.karte-aktionen`) unter einer Haarlinie, immer zuunterst; im Raster liegen die Fusszeilen nebeneinander stehender Karten auf einer Linie.
- `gefuellt` (`.karte-gefuellt`): `--flaeche-tief` ohne Rahmen, Polster 20 – ein ruhiger Block **in** einer Karte (Formular, Testergebnis).
- Raster: `.karten` (auto-fit, mindestens 420 px), `.raster-2` (≤ 900 px einspaltig), `.karte-breit` (über alle Spalten), `.stapel` (20 px, in Karten 16).

### 4.6 Kennzahl-Kacheln
`.kacheln > .kachel` · `UI.kachel({ text, wert, unter, ton, sinnbild, beiKlick, href, zahl, titel })` · `UI.kacheln([…])`
- Tonal `--flaeche-tief`, Radius 16, kein Rahmen. Beschriftung 14/20 leise (darf ein Sinnbild tragen), Wert 36/44 tabellarisch – schrumpft mit der Kachel (`min(36px, 26cqi)`), statt umzubrechen –, Unterzeile 12/16.
- 4 Spalten, ≤ 1100 px 2. Klickbar als `button`/`a` (`beiKlick`/`href`): 6-%-Ebene + Fokusring, kein Anheben.
- **Die Zahl wird nie gefärbt.** `ton` (`erfolg`/`warnung`/`gefahr`) setzt nur ein Sinnbild in die Beschriftung. `wert` ist der fertige Text («41 %», «1’284»), `zahl` die Zahl fürs Hochzählen beim ersten Zeigen. Leer «–».

### 4.7 Datenzeilen, Kennwerte, Fakten

| Baustein | Bauer | Regeln |
|---|---|---|
| Lesen `.datenzeilen > .datenzeile` | `UI.datenzeilen`, `UI.feldZeile(name, wert, { neben, gesperrt, hinweis })`, `UI.feldGesperrt`, `UI.feldFrei` | Name links (36 %, leise), Wert links in der zweiten Spalte, Haarlinien, 12 px senkrecht. Leer «–» in `--text-still`. `.datenzeile-neben` (Meta daneben), `.datenzeile-hinweis` (darunter), `.datenzeile-zeile` (Knopfzeile darunter). Schloss 16 px mit Tooltip «Vom Abgleich gesetzt.»; ein eigener `hinweis` ersetzt ihn («Auf der Geräteseite änderbar.»). Ist eine ganze Karte schreibgeschützt, sagt es der Kartentext **einmal** statt eines Schlosses je Zeile. |
| Bearbeiten `.datenzeile-form` | `UI.formZeile(beschriftung, feld, { geaendert, hinweis, zusatz })`; in Detailseiten **`F.feld(feld, { … })`**, auch als Kästchen (`art: 'ankreuzen'`) | Beschriftung 12/16 500 oben (`<label for>`), Feld volle Breite (höchstens 560 px). Geändert: 6-px-Punkt in Primär hinter der Beschriftung + «(geändert)» für Screenreader; im Neu-Modus nie. |
| Kennwerte `.kennwerte` | `UI.kennwerte([[name, wert], …])` | Kurze Zahlenlisten: Name links leise, Wert rechts 500 tabellarisch. |
| Klickbare Kennwerte | `UI.kennwerte([{ name, wert, href, beiKlick, ton, titel, fokus }])` | Zeilen als Link/Knopf mit 6-%-Ebene (Sprung in die gefilterte Liste); Null leise; `ton` als Sinnbild vor dem Namen + «(zu prüfen)»/«(dringend)» für Screenreader. |
| Fakten `dl.fakten` | `UI.fakten([[name, wert], …])` | Beschriftung 12/16 500 über dem Wert, auto-fit ab 220 px; genau vier: 4 / 2 / 1 nach Bahnbreite; in einer Karte 20 px unter dem, was darüber steht. |

### 4.8 Formulare

| Element | Klasse | Bauer | Regeln |
|---|---|---|---|
| Feld | `.feld-eingabe` | `UI.eingabe({ art: 'text'\|'zahl'\|'datum'\|'textbereich'\|'auswahl'\|'suche'\|'mail'\|'telefon', id, wert, platzhalter, label, werte, leer, vorschlaege, schmal, gefuellt, … beiEingabe, beiAenderung })` | 40 px, Radius 8, 1 px `--umriss`; Hover Rahmen `--text`; **Fokus sofort** Primärrahmen + 1 px innen; Textbereich ab 88 px, senkrecht ziehbar; Auswahl mit M3-Dreieck, behält einen unbekannten gespeicherten Wert als Option; Datum mit Kalender-Maske; Zahl ohne Drehknopf; `vorschlaege` legt die `datalist` selbst an. Nur lesbar / gesperrt: `--flaeche-tief`, leise. |
| Gefüllt | `.feld-gefuellt` | `gefuellt: true` | Werkzeugleisten: `--flaeche-hoch` ohne sichtbaren Rahmen |
| Schmal | `.eingabe-schmal` | `schmal: true` | 200 px: Jahre, Auswahlen, Kurzwahl |
| Feld mit Beschriftung | `.feld > .feld-label + … + .feld-hinweis` | `UI.feld(beschriftung, feld, { hinweis, voll })` | Filter, Dialog, Blatt; Beschriftung 12/16 500 oben, Hinweis 12/16 darunter (`aria-describedby`) |
| Fehler | `.feld-fehler`, `[aria-invalid]` | `UI.feldFehler(feld, meldung\|'')` | Fehlerrahmen, Meldung mit Sinnbild unter dem Feld, die erste Eingabe löscht ihn |
| Live-Hinweis | `.mit-sinnbild` | `UI.feldHinweis(hinweis, text, { sinnbild, ton })` | Prüfung «in Ordnung» an Ort und Stelle; der Ton färbt nur das Sinnbild |
| Hinweis am Getippten | `.hinweis-platz` | `UI.hinweisPlatz().setzen(schluessel, bauen)` | baut nur bei neuem Schlüssel, deckt nur auf, wenn er durch eine Eingabe erscheint; Fokus bleibt |
| Raster | `.feld-raster(-3)`, `.feld-voll`, `.feld-reihe` | – | 2 bzw. 3 Spalten, einspaltig ab Bahn ≤ 760 px; Feld + Knopf in einer Reihe |
| Kästchen, Option | `.ankreuzen` | `UI.ankreuzen({ text, an, beiAenderung, art, gesperrt, klein, fokus })`; am Entwurf `F.feld(feld, { art: 'ankreuzen', eingabe: { text } })` (Boolean; ein leerer gespeicherter Wert gilt als `leer[Feld]` aus `F.entwurf`, sonst als Nein) | 40-px-Zeile, Kästchen 18 px in Primär |
| Mehrfachauswahl | `fieldset.feld > .mehrfach` | `UI.mehrfach({ legende, eintraege, name, fokus, beiAenderung })` → `.gewaehlt()`, `.setzen()`, `.zahlenSetzen()` | Umrandete Liste, Zahl rechts, gewählt zusätzlich 500. In der Seite höchstens 264 px mit eigenem Roller, im Blatt in voller Länge |
| Aktionszeile | `.aktionszeile` | – | Primär · Umrandet · Text · Meta am Ende |

Regeln: Die Beschriftung steht **über** dem Feld, nie schwebend und nie nur als Platzhalter. Jede Auswahl hat einen
Namen (`UI.feld`), Kästchengruppen sind `fieldset` + `legend`. Felder einer Detailseite nur über `F.feld` (id
`<p>-eingabe-<Feld>`, Wert aus dem Entwurf, Punkt «geändert», Feldfehler aus dem Speicherablauf) – Kästchen eingeschlossen
(«In Domäne»). Eine ganze Zahl, die der Browser umdeuten könnte (Komma als Tausendertrenner: «1,5» → 15), ist
ein Textfeld mit `inputMode = 'numeric'`; `pruefen()` hält alles andere als Ziffern mit einem Feldfehler auf
(Programmseite, «Reihenfolge»).

### 4.9 Suche
`.suchfeld > .icon + input.suche + kbd.kuerzel` · `UI.suchfeld({ id, platzhalter, label, wert, kuerzel: '/', verzoegerung = 150, beiEingabe })` → `.eingabe`, `.wert()`, `.setzen()`, `.sofort()`
- Gefüllte Pille `--flaeche-hoch`, 40 px, **ein** Sinnbild (Lupe 20) links; Fokus weiss + 2-px-Ring innen; das × zum Leeren ist das Schliessen-Sinnbild als Maske.
- Kürzel «/» rechts; es weicht bei Fokus oder Text und fehlt auf Touch-Geräten.
- `.setzen()` schreibt nie, solange getippt wird oder das Feld den Fokus hat. **Esc** in einer gefüllten Suche leert sie (und nur das); erst Esc in der leeren Suche geht an die Seite.

### 4.10 Schalter
`button.schalter[role=switch][aria-checked]` · `UI.schalter({ an, gesperrt, deaktiviert, label, titel, beiWechsel(an) → false|Promise })` → `.setzen(an, gesperrt, titel)`, `.sperren()`, `.istAn()` · `UI.schalterZeile({ schalter | an/gesperrt/titel/beiWechsel, name, unter, wort, zusatz, kompakt })`

| Zustand | Aussehen |
|---|---|
| aus | 52 × 32, Spur `--flaeche-hoechst`, Rahmen `--umriss`, Griff klein und grau links |
| an | Spur Primär, Griff 24 px weiss rechts |
| an und gesperrt (`.gesperrt`) | wie an + Schloss im Griff, `aria-disabled`, fokussierbar; Tooltip nennt die AD-Gruppe («Aus der AD-Gruppe «SW-Adobe».»); das Zustandswort bleibt «Aktiv», die Sperre zeigt das Schloss |

Schalterzeile: Schalter · Name (das `<label>`) mit Unterzeile · Zusatz-Chips · Zustandswort in einer festen,
rechtsbündigen Spalte ganz rechts (die Wörter aller Zeilen fluchten; Chips stehen links davon, am Handy unter dem
Namen). `kompakt`: `.schalter-feld` im Kartenkopf. Regeln: Ein Klick schaltet an Ort und Stelle um (der Übergang
spielt); `beiWechsel` → `false`, abgelehntes Promise oder Fehler setzt zurück. **Nie neu bauen, um umzuschalten** –
`.setzen()`.

### 4.11 Tabellen

**Liste (Hauptseite)** `.tabelle-rahmen > table.tabelle` · `UI.tabellenRahmen(table, { id })`, `UI.tabellenKopf(spalten, { sortiert, richtung, beiSortieren })` → `.sortierungSetzen()`, `UI.sortierKnopf`, `UI.rollKanten`
- Eigener Roller mit Haarlinie und Radius 12. Kopf 48 px, 14/20 500 leise, klebt oben (Linie als Schatten); erste Spalte klebt (mindestens 180 px), ihre Haarlinie rechts erscheint nur beim seitlichen Rollen.
- Zeilen 52 px (`.dicht` 40 px, Schrift bleibt 14/20), Haarlinien, Hover `--hintergrund` – auch in der klebenden Zelle –, **kein Zebra**. Zellen einzeilig, höchstens 280 px, mit «…» (Tooltip zeigt den ganzen Wert). Zahlen rechts und tabellarisch (`th.zahl`, `td.zahl`).
- Name als unterstrichener Link `a.name-link` (500). Ein Zeilenklick öffnet im selben Tab, Ctrl-/Mittelklick in einem neuen.
- Sortierung: Knopf im `th`, 16-px-Pfeil **nur** an der sortierten Spalte, `aria-sort` an allen sortierbaren. Spaltenerklärung über `titel` (Tooltip, auch per Tastatur).
- Blende am rechten Rand nur, solange rechts noch Spalten liegen (`data-mehr-rechts`).

**Schlicht in Karten** `UI.tabelle(kopfzeilen, datenzeilen, { beschriftung })` → `.tabelle-schlicht-rahmen > .tabelle.tabelle-schlicht`
- Läuft bis an den Kartenrand; erste und letzte Zelle fluchten mit dem Kartentext; Blenden links/rechts nur, wo es seitlich weitergeht.

Regeln: `thead` einmal bauen und mit `sortierungSetzen` nachführen, nur `tbody` neu zeichnen. Tabellenzeilen und Zahlen
in Tabellen animieren nie. Leere Liste: Rahmen `hidden`, Leerzustand zeigen.

### 4.12 Banner, Hinweise, Leerzustand, Texte

| Baustein | Bauer | Regeln |
|---|---|---|
| Banner `.banner` | `UI.banner({ titel, text, ton, knopf, rolle, sinnbild })` | Radius 12, Polster 12/16, Sinnbild 20. `info` neutral (`--flaeche-tief` + grünes `info`, **nie blau**), `erfolg` (Container, checkKreis), `warnung` (`--warnung-flaeche`, Text `--text`, Dreieck), `gefahr` (Container, achtungKreis). Knopf rechts (32 px); er rutscht unter den Text, wenn dieser sonst schmaler als 8em würde. |
| Hinweisliste `.hinweise > .hinweis-zeile` | `UI.hinweisZeile({ ton, titel, text })`, `UI.hinweise([…])` | Sinnbild 20 in der Tonfarbe + Titel 500 + Text leise, Haarlinien. Der Ton färbt nur das Sinnbild. |
| Leerzustand `.leerzustand` | `UI.leerzustand({ sinnbild, titel, text, aktion })` | Zentriert, höchstens 400 px: Pastell-Scheibe 48 px mit Sinnbild 24, Titel 16/24 500, höchstens **ein** Satz (keiner, wo Titel und Aktion genügen), höchstens **eine** Aktion (tonal). |
| Hinweistext `.hinweis` | `UI.hinweis(…)` | 14/20 leise, höchstens 76 Zeichen breit |
| Meta `.meta` | `UI.meta(…)` | 12/16 leise («Zuletzt gespeichert 12.10.2026, 14.05») |
| Teile `.teile` | `UI.teile([…])` | Teile mit «·», die nur zwischen den Teilen umbrechen; leere fallen weg |
| Weitere | – | `.kuerzel` (Tastenkürzel), `.code-block` (Rohdaten), `.anzahl` (Ergebniszahl), `.nur-sr` (nur Screenreader), `.ohne-umbruch`, Tonklassen `.t-erfolg/-warnung/-gefahr/-leise/-still/-stark` (nur zusammen mit Sinnbild oder Wort) |

### 4.13 Laden

| Baustein | Bauer | Regeln |
|---|---|---|
| Seitenladezustand | `Rahmen.zustand('laden', { text, fortschritt })` | Rahmen sofort da (aktiver Eintrag markiert); nach 200 ms Skelett + Ladebalken + Fortschritt als Meta. **Kein Grossspinner.** |
| Skelett `.skelett` | `UI.skelettSeite({ karten, text })` | `role=status`, unsichtbar für 200 ms, dann pulsierend (kein Schimmer) |
| Spinner `.spinner` | `UI.spinner(klein)` | 16 px Primärbogen auf `--flaeche-hoechst`; klein 12 px in der Textfarbe |
| Ladezeile `.ladezeile` | `UI.ladezeile(text)` | «Wird geladen …» nach 200 ms (Blatt, Nachladen) |
| Fortschritt `.fortschritt` | `UI.fortschritt({ anteil, text, detail, unbestimmt, label })` → `.setzen()` | 4 px, Pastell-Spur, Balken per `scaleX` gleitet 600 ms; unbestimmt: ein Segment läuft durch |

### 4.14 Listen und Diagramme

| Baustein | Bauer | Regeln |
|---|---|---|
| Zeilenliste `.zeilenliste > .listen-zeile` | `UI.listenZeile({ titel, unter, href, beiKlick, aktionen, status, aktuell, marke, sinnbild, pfeil, fokus })`, `UI.zeilenliste([…])` | Umrandet, Radius 12, Haarlinien, Polster 16/20. Ohne `aktionen` ist die Zeile ganz klickbar (6-%-Ebene, Pfeil rückt 4 px nach); mit `aktionen` wird der Titel zum Link. `aktuell`: ruhig getönt + `aria-current`. |
| Zahlmarke `.zahlmarke` | `UI.zahlmarke(zahl, ton)` | 32 px rund, tonal nach Dringlichkeit, vorne in der Listenzeile; die Dringlichkeit steht zusätzlich als Wort («Dringend»). |
| Zeitachse `.zeitachse` | `UI.zeitachse([{ titel, zeit, zeitSinnbild, text, still, zusatz, aktionen }])` | 2-px-Linie, 10-px-Punkte in Primär; automatische Einträge grau (`still`) mit `sync` vor der Meta-Zeile. Grundlage des Verlaufs. |
| Balken `.balken` | `UI.balken(anteil, ton)` → `.setzen()` | 4 px, Anteil als `scaleX`; `still`, `ton-warnung`, `ton-gefahr` |
| Säulen `.saeulen` | `UI.saeulen(werte, { max, hervorheben, label })` | Mini-Verteilung, `role=img` mit Beschriftung, die eigene Säule hervorgehoben |
| Verteilung `.verteilung` | `UI.verteilung([{ text, zahl, anteil, titel, beiKlick, href }])` | Name einzeilig (Tooltip mit ganzem Namen), Zahl rechts 500, Balken darunter, klickbar; höchstens 8 Zeilen, Rest als «und 4 weitere Werte …» |

Diagrammfarben nur `--diagramm-*`; Balken und Säulen wachsen nur beim ersten Zeigen, spätere Werte springen.
Eigene Diagramme (Zeitstrahl der Hauptseite) benutzen `.saeule-fuell` mit `--anteil`.

### 4.15 Seitenkopf
`UI.seitenkopf({ titel, lead, unter, status, aktionen, pfad, ebene = 1, id, titelId, element })` → `.setzen({ … })`; auf Detailseiten **`F.seitenkopf`**
- Zurück-Link (`pfad`; weicht, solange die feste Schublade den Zurück-Eintrag trägt) · Titel 24/32 (h1, `tabindex=-1` als Fokusziel, bricht beliebig um) · Teile-Zeile 14/20 leise (`lead` gibt es noch, die Seiten nutzen ihn nicht) · Status-Chips 8 px darunter · Aktionen rechts (Bahn ≤ 600 px: darunter). Ein Text-Knopf hängt sein Polster in den Rand und fluchtet mit Titel und Karten.
- `F.seitenkopf` gleicht an Ort und Stelle ab und darf bei jedem Tastendruck laufen: Knöpfe bleiben stehen, solange sie gleich aussehen – die **Sperre zählt nicht dazu**: Wechselt nur sie (der erste Tastendruck in einem Feld, Speichern, Verwerfen, `F.beschaeftigt`), schaltet der stehende Knopf sie an Ort und Stelle um (`UI.knopfSperren`, Tooltip wechselt mit), und ein Fokus darauf bleibt. Kopfaktionen darum **nur mit `beiKlick`** bauen (kein eigenes `addEventListener`) und keine Referenz auf einen Kopfknopf über Aufrufe hinweg halten; gesperrt wird über `gesperrt:` bzw. `F.beschaeftigt`.

### 4.16 Verlauf (`verlauf.js`)
`Verlauf.zeichnen(ziel, { schluessel, wert, gesperrt, beiAenderung(json), titel, beschreibung })` · `Verlauf.offeneEingabe()` · `Verlauf.zuruecksetzen()`
- Genau **eine** Karte «Verlauf» (Zahl der Einträge, «Neuer Eintrag» tonal) mit der Zeitachse. Das Formular erscheint inline als gefüllte Karte; ein neuer Eintrag deckt sich auf. Löschen fragt über `UI.bestaetigen`.
- Unter dem Titel steht kein Satz (die Option `beschreibung` gibt es noch, keine Seite übergibt eine). Der Leerzustand heisst nur «Noch kein Verlauf», denn «Neuer Eintrag» steht schon im Kartenkopf. Einträge des Abgleichs tragen den Chip «Abgleich» (grauer Punkt, `sync` vor der Meta-Zeile); von Hand erfasste sind der Normalfall und tragen keinen Chip.
- Gespeichert wird nicht hier, sondern über den Entwurf der Seite und die Speicherleiste – es gibt genau einen Speicherweg. Ein halb getippter Eintrag hält beim Verlassen auf; «Verwerfen» schliesst auch das Formular.

---

## 5. Bewegung

Port von ChatBob `design/motion.css` + `motion.js` + `indicator.js`. Charakter kommt aus Form und Farbe; Bewegung fällt
nur als Ruhe auf.

### 5.1 Regeln

1. Nur `transform`, `opacity`, Farben, `box-shadow` und `clip-path` animieren – kein `width`, `height`, `padding`, `max-height`, `font-weight`, kein `transition: all`. Ausnahmen: der Indikator gleitet in Lage **und** Grösse; `details.aufklappbar` animiert die Höhe nur, wo der Browser `interpolate-size` kann.
2. Deckkraft immer auf `--kurve-standard`; der Weg eintretender Dinge bremst (`--kurve-bremsen`), was geht, beschleunigt. Ein Eintritt sind darum zwei Animationen: `einblenden` + eine Bewegung.
3. Verschwinden ist kürzer als Erscheinen (250 → 150 ms, 350 → 200 ms).
4. Kleine Wege (4–12 px, Blatt 24 px), Skala höchstens .98 → 1 (Ausnahmen: Zähler und Knopf-Scheibe ab .6). Kein Überschwingen, keine Feder, kein Anheben oder Vergrössern beim Hover, kein Skalieren beim Drücken, keine Drehung ausser Ladeanzeigen.
5. Hover ist asymmetrisch: Farbe 150 ms hin und zurück; Formen 250 ms hin, 200 ms zurück. Hover-Regeln nur in `@media (hover: hover)`; Touch zeigt beim Drücken sofort den Endzustand.
6. Staffelung 30 ms × höchstens 6 Stufen, nur beim ersten Zeigen einer Ansicht.
7. **Aktualisierte Daten animieren nie**: Auto-Nachladen, BroadcastChannel, Tippen, Filtern, Sortieren, Speichern zeichnen still. Tabellenzeilen und Zahlen in Tabellen nie.
8. Ladeanzeigen erst nach 200 ms, dann mindestens 450 ms sichtbar.
9. Fokusringe erscheinen sofort, nie animiert.
10. Nur Tokens (§2.6). `@keyframes` **nur** in `bewegung.css`. Reduzierte Bewegung nur über den einen Token-Schalter in `design.css` – keine Komponente schreibt eine eigene Regel dafür.

### 5.2 Keyframes (`bewegung.css`, der einzige Ort)

Eintritte haben nur `from` (das Element läuft zu seinen eigenen Stilen), Austritte nur `to`.

| Name | Bewegung | ChatBob |
|---|---|---|
| `einblenden` / `ausblenden` | Deckkraft | `cb-fade-in` / `cb-fade-out` |
| `anheben` | von unten (`--bewegung-weg`, sonst 8 px) | `cb-lift-in` |
| `wachsen` | von unten + Skala .98 | `cb-grow-in` |
| `einschieben` | von der Seite (sonst 24 px) | `cb-shift-in` |
| `einrollen` / `ausrollen` | eine Zeile von unten herein / nach oben hinaus | `cb-roll-in` / `cb-roll-out` |
| `aufploppen` | Skala ab .6 (Zähler) | `cb-pop-in` |
| `zeichnen` | Strich zeichnet sich (`pathLength=1`) | `cb-draw` |
| `aufziehen` / `aufrichten` | Balken ab `scaleX(0)` / Säule ab `scaleY(0)` | – (neu) |
| `absinken` | ausblenden + nach unten | `cb-sink-out` |
| `schrumpfen` | ausblenden + 4 px + Skala .98 | `cb-scale-out` |
| `wegschieben` | ausblenden + zur Seite (sonst 12 px) | `cb-slide-out` |
| `drehen`, `pulsieren`, `unbestimmt` | Spinner, Skelett (1 → .45 → 1), Ladebalken-Segment | `cb-spin`, `cb-pulse`, `cb-indeterminate` |

### 5.3 Hilfsklassen (setzt normalerweise `Bewegung.*`, nicht die Seite)

| Klasse | Wirkung |
|---|---|
| `.eintritt.eintritt` | einmaliger Eintritt: einblenden + anheben, 250 ms (die doppelte Klasse überstimmt den eigenen Auftritt einer Komponente) |
| `--blenden` · `--skalieren` · `--schieben` · `--tausch` · `--verzoegert` · `--ploppen` · `--aufziehen` · `--aufrichten` | nur Blende · + wachsen · + einschieben 350 ms betont · kleinster Weg 4 px · Blende erst nach 200 ms · + aufploppen · Balken 600 ms · Säule 600 ms |
| `.austritt.austritt` (+ `--sinken`, `--skalieren`, `--schieben`) | einmaliger Austritt, 200 ms, beschleunigend, beginnt sofort |
| `.staffel > *` | Kinder blenden nacheinander ein (`--i` × 30 ms); in `.zeilenliste` 150 statt 250 ms |
| `details.aufklappbar` | Höhe animiert, wo der Browser es kann; der Pfeil kippt sofort |
| `.veraltet` | Inhalt auf dem Weg hinaus, gedimmt auf .55 |
| `.hat-indikator > .indikator` | gleitender Auswahl-Indikator |

### 5.4 `Bewegung.*` (`bewegung.js`)

| Aufruf | Zweck |
|---|---|
| `LADE_VERZOEGERUNG_MS` 200 · `LADE_MINDESTENS_MS` 450 · `ZAEHLEN_MS` 600 · `STAFFEL_MAX` 5 | Konstanten, gleich den Tokens |
| `reduziert()` | reduzierte Bewegung aktiv? |
| `eintreten(el, variante)` → Promise | spielt `.eintritt` einmal, entfernt die Klassen danach; ein neuerer Ein-/Austritt überholt |
| `austreten(el, variante, { dann: 'entfernen'\|'verbergen'\|'behalten' })` → Promise | spielt `.austritt`, dann entfernen, verbergen oder behalten |
| `aufdecken(el)` → Promise | frischer Inhalt ersetzt einen Platzhalter (bricht einen laufenden Eintritt im selben Takt ab) |
| `staffeln(elemente, { ab, max })` | nummeriert `--i` (CSP-sicher über das CSSOM) |
| `auftritt(behaelter, { wurzel })` | Auftritt einer frisch gezeigten Ansicht: staffelt `.karten .raster-2 .stapel .kacheln .zeilenliste`, zählt `[data-zahl]` hoch, zieht Balken auf. `wurzel: false` = nur Raster im Behälter |
| `hochzaehlen(el, ziel, { format, dauer })`, `zahlenHochzaehlen(behaelter)` | zählt von 0 (ease-out cubic, 600 ms); reduziert: sofort der Endwert |
| `aufziehen(behaelter)` | Balken und Säulen wachsen einmal |
| `ladeHaltenMs(start)`, `ladeAbwarten(start)` | eine sichtbar gewordene Ladeanzeige ≥ 450 ms halten |
| `abgeschlossen(el, { zeit, ereignis, eigenschaft })` | auf das Ende der eigenen Animation warten – immer mit Frist |
| `wiederholen(el, …klassen)`, `kurveAusgleiten(t)` | Animation neu starten; Kurve für eigene Schritte |
| `indikator(spur, { aktiv, klasse })` → `{ aktualisieren(), zerstoeren() }` | gleitende Pille; erste Platzierung und Grössenänderungen springen |

Seiten brauchen davon fast nur `aufdecken` (ein Banner oder Ergebnis, das eine Benutzeraktion bringt), `austreten`
(etwas, das die Person entfernt) und `ladeAbwarten` (eigene Nachladeanzeige).

### 5.5 Wann Auftritt, wann nie

| Anlass | Aufruf | Bewegung |
|---|---|---|
| erster Inhalt nach dem Laden | `await Rahmen.zustand('inhalt')` | Aufdecken + Staffeln + Hochzählen, **einmal** |
| Ansichtswechsel Hauptseite | `Rahmen.wechseln(fn)` | Fade-through + Staffeln + Hochzählen |
| Bereichswechsel Detailseite | `F.bereichWechseln(bereiche, k)` | Fade-through + Staffeln |
| frisch gezeigter Teilbereich | `Rahmen.erstauftritt(behaelter)` | Staffeln + Hochzählen |
| Banner oder Ergebnis durch eine Benutzeraktion | `Bewegung.aufdecken(el)` | Blende + 4 px |
| Element, das die Person entfernt | `Bewegung.austreten(el, 'skalieren')` | kurz, beschleunigend |
| «Erneut laden» nach einem Fehler | `Rahmen.zustand('laden')` … `('inhalt')` | Aufdecken ohne Staffeln |
| Tippen, Schalter, Filter, Sortieren | zeichnen, `F.zeichneBereich`, `.setzen()` | **keine** |
| Auto-Nachladen, BroadcastChannel, nach dem Speichern | `Rahmen.stillZeichnen`, `F.zeichneBereich` | **keine**, kein `Rahmen.zustand` |

**Nie** `Bewegung.auftritt`, `eintreten` oder `aufdecken` in einer Zeichenfunktion aufrufen, die auch das Nachladen benutzt.

### 5.6 Was sich wie bewegt

| Was | Erscheinen | Gehen |
|---|---|---|
| Ansicht/Bereich (`Rahmen.wechseln`) | 250 ms Blende + 4 px; Karten und Kacheln staffeln | alter Inhalt 100 ms ausblenden (beschleunigend); letzter Klick gewinnt |
| Seitenwechsel zwischen HTML-Seiten | Inhalt 250 ms Blende + 4 px nach 100 ms; Kopf, Schublade und Tafel bleiben ruhig | alter Inhalt 100 ms |
| Dialog | 250 ms Blende + 8 px + .98 → 1; Schleier 200 ms | 150 ms absinken 4 px; Schleier 150 ms |
| Seitenblatt | 350 ms Blende + 24 px von rechts (betont) | 200 ms wegschieben 12 px; Schleier 200 ms |
| Modale Schublade | 350 ms gleiten (betont); Schleier 200 ms | 200 ms beschleunigend |
| Meldung | 250 ms Blende + 8 px; wechselt sie die Ebene, gleitet sie 250 ms an die neue Kante | 150 ms Blende |
| Tooltip | 150 ms Blende + .98 (ohne Weg) | 100 ms |
| Speicherleiste | 250 ms Blende + 8 px | 200 ms absinken |
| Ladeanzeigen | nach 200 ms 250 ms Blende, dann ≥ 450 ms | Inhalt ersetzt sie in einem Schritt |
| Zähler, Zahlen, Balken | Zähler ploppt beim Erscheinen; Kennzahlen zählen 600 ms hoch; Balken und Säulen wachsen 600 ms – nur beim ersten Zeigen | – |
| Indikator der Schublade | gleitet 250 ms; erste Platzierung springt; modal: kein Gleiten | – |
| Schalter | Griff und Farbe 200 ms | – |
| Hover | Farbe 150 ms; Pfeil 250 hin / 200 zurück; Scheibe 200 hin / 150 zurück | – |
| Druck | Zustandsebene 100 ms | – |

### 5.7 Reduzierte Bewegung

Ein `@media (prefers-reduced-motion: reduce)`-Block in `design.css`: alle Dauern 1 ms (nicht 0 – `animationend` und
`transitionend` feuern weiter), Wege 0, `--skala-eintritt` 1, Staffel 0 ms. Ladeanzeigen sind keine Dekoration und
drehen bzw. pulsieren langsamer weiter (1.4 s / 2.4 s). Hochzählen zeigt sofort den Endwert, weiches Rollen wird ein
Sprung. Achtung beim Prüfen: eine RDP-Sitzung meldet «reduzierte Bewegung» (§9.3).

---

## 6. Überlagerungen

Gemeinsam für Dialog, Blatt und modale Schublade (`rahmen.js`): eigene Ebenen über dem ganzen Fenster (kein natives
`<dialog>`), **Fokusfalle**, der Rest der Seite ist `inert`, **Esc schliesst nur die oberste Ebene** (vor der Seite),
der Fokus kehrt an den Auslöser zurück – ist er inzwischen neu gezeichnet, an sein Gegenstück über `data-fokus` oder
`id`. Der Schleier schliesst nur mit einem eigenen einfachen Klick, nie in den ersten 300 ms (zweiter Klick eines
Doppelklicks). Zustand und Fokus wechseln sofort, nur die Darstellung blendet noch aus. Stapel: Schublade = Blatt (50)
< Dialog (51) < Meldung und Tooltip (60).

### 6.1 Dialog
`UI.dialog({ titel, inhalt, knoepfe, breit, rolle, fokus, beiSchliessen, klasse })` → `{ element, flaeche, inhalt, knoepfe, titel(), schliessen(), offen(), fokussieren(), sperren() }` · `UI.bestaetigen({ titel, text, ja, nein = 'Abbrechen', breit })` → `Promise<boolean>`
- 400 px für Fragen, `breit` 560 px für Listen und Formulare; Polster 24, Radius 16, Ebene 3. Titel 22/28, Text 14/20 leise (nennt die Folge), Knöpfe rechts unten.
- **Eine Rollfläche:** Ist der Dialog höher als das Fenster, bleiben Titel und Knopfzeile stehen, und nur der Inhalt dazwischen rollt (der Fokusring eines Felds am Rand bleibt ganz). Eine Trefferliste im Dialog trägt `.dialog-liste`: sie rollt selbst und nimmt die Resthöhe – wird es knapp, schrumpft sie, statt «Abbrechen» aus dem Bild zu schieben; sonst höchstens 420 px. Reicht die Resthöhe nicht für gut eine Zeile, rollt der ganze Inhalt mit der Liste in voller Länge, und das Suchfeld darüber klebt oben (`data-knapp`, setzt `rahmen.js`). Nie eine eigene Höchsthöhe in der Seiten-CSS.
- Knöpfe: zuerst «Abbrechen» (`variante: 'leise'`), dann die Hauptaktion (`'primaer'`), die die Folge nennt («Archivieren», «Löschen»). Kein roter Knopf.
- Fokus startet im ersten Feld, sonst auf dem ersten Knopf (bei Fragen «Abbrechen»).
- `UI.bestaetigen` löst bei Esc, Schleier und «Abbrechen» mit `false` auf. Nie `window.confirm` oder `alert`.
- `sperren(true)` während einer Arbeit (Löschen): Esc und Schleier schliessen dann nicht.
- Löschen mit Namenseingabe: `F.loeschenDialog({ titel, text, warnung, wort, knopfText = 'Löschen', beiLoeschen, ende })` – Feld «Zur Bestätigung «…» eingeben», Gross/Klein egal, Enter löst aus; danach Endzustand mit «Zur Liste». Der Text lautet auf allen Seiten «Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage lang zurückholen.» – darum heisst der Knopf «Löschen», nicht «Endgültig löschen».

### 6.2 Seitenblatt
`UI.blatt({ titel, unter, inhalt, fuss, breite: 560|720, beiSchliessen, klasse })` → `{ element, koerper, fuss, titel(), unter(), schliessen(), offen(), fokusSchliessen(), sperren() }`
- Von rechts, volle Höhe, 560 px (`720` breit), Radius 16 an der vorderen Kante, Ebene 3; Handy volle Breite ohne Radius.
- Kopf 64 px: Titel 22/28 (einzeilig), optional Unterzeile 12/16 – live, z. B. «47 von 163» –, × rechts. Der Fokus startet auf ×. Haarlinie unter dem Kopf nur, wenn der Körper gerollt ist. Der Kopf ist ein `div`, kein zweites `<header>`.
- Körper rollt (eigener Tabstopp); Fusszeile unter einer Haarlinie bleibt stehen (rechtsbündig: «Filter zurücksetzen» tonal – ohne gesetzten Filter gesperrt mit dem Grund «Kein Filter aktiv.» –, «Fertig» primär).
- **Filter und Spalten der Listen** stehen in einem Blatt (nie mehr als schwebendes Panel): Änderungen wirken sofort. **Filter:** die Trefferzahl steht live in der Unterzeile («44 von 47 ADMIN-Clients»); oben Archiv (Client-Listen), Zeiträume und Auswahlen, darunter die Kästchengruppen; jeder gesetzte Filter steht danach als entfernbarer Chip über der Liste. **Spalten:** Unterzeile «9 von 93 Spalten sichtbar», Vorlagen «Standardspalten», «Nur Name», «Alle Spalten», «Kompakte Zeilen (gilt für alle Listen)», dann die Spalten nach Gruppen; im Fuss nur «Fertig». Ein offenes Blatt wird beim Nachladen nie neu gebaut – nur `zahlenSetzen` und `blatt.unter()`. Auswahlen über `UI.feld`, Kästchengruppen über `UI.mehrfach`. Der öffnende Knopf trägt `aria-expanded` und ist, solange das Blatt offen ist, tonal.

### 6.3 Meldung (Snackbar)
`UI.meldung(text, { ton: 'erfolg'|'fehler'|'info', dauer = 3200, aktion: { text, beiKlick } })` → `{ schliessen(), element }`
- Unten links in der Tafel (24 px von der Kante; bei offenem Blatt in dessen Ebene; Handy über die ganze Breite), `--invers`, Radius 8, Ebene 3, Sinnbild 20 + Text 14/20, höchstens 560 px.
- Erfolg (`checkKreis` in `--invers-primaer`) und Info gehen nach 3.2 s; die Zeit hält, solange Zeiger oder Fokus darauf liegen. Die gleiche Erfolgsmeldung startet nur ihre Zeit neu.
- **Fehler bleiben** mit × stehen; ein neuer Fehler ersetzt den alten; solange einer offen ist, hält die Tafel unten Platz frei. Höchstens drei Meldungen.
- Liegt immer **über** einer sichtbaren Speicherleiste. Aktion als Text-Knopf in `--invers-primaer` («Rückgängig», «Neu laden»).
- Angesagt wird über **eine** Live-Region `#ansage` (`role=status`, `polite`), die `rahmen.js` beim Start anlegt.

### 6.4 Tooltip
`UI.tipp(element, text|null)`, `UI.tipp.verbergen()` – automatisch für `[data-tipp]` und für `title` an Knöpfen, `a.knopf`, Schaltern, Status, Chips und Sortierknöpfen (wird beim ersten Kontakt zu `data-tipp`).
- `--invers`, 12/16, Radius 4, Polster 4/8, höchstens 320 px, unter dem Element.
- Nach 500 ms Zeigen, mit der Tastatur sofort, **nie auf Touch**. Der Zeiger darf auf den Tooltip wechseln (100 ms Gnadenfrist).
- Kein Tooltip, wenn das Element denselben Text sichtbar zeigt – ausser er ist mit «…» abgeschnitten.
- Ein Element, das **nur** einen Tooltip trägt (kein Bedienelement), braucht `tabindex="0"`; die Bauer tun das für `UI.status({ titel })`, `UI.kachel({ titel })` ohne Klick und Spaltenerklärungen.

### 6.5 Speicherleiste
`F.speicherleisteZeichnen({ neuModus, geloescht, speichertGerade, speicherFehler, anzahl, neuText, meta })` (darf bei jedem Tastendruck laufen) · darunter `UI.speicherleiste({ beiSpeichern, beiVerwerfen, fokusZiel })`
- Schwebt unten in der Tafel, 24 px vom Rand (Handy 16), bündig mit der Bahn; Radius 16, Ebene 3. Links «1 Änderung» / «3 Änderungen» (14/20 500) + Meta, rechts «Verwerfen» (Text) und «Speichern» (primär, beschäftigt). Neu-Modus: «2 Angaben erfasst», «Formular leeren», «Anlegen».
- Sie trägt keine Höhe bei: Kommen und Gehen verschieben nichts. Solange sie steht, hält die Tafel darüber Platz frei, und ein fokussiertes Feld darunter rollt über sie. Eine gehende Leiste friert Text und Knöpfe ein.
- Fehler stehen **nicht** rot in der Leiste, sondern als Meldung darüber + Feldfehler. Nach einem gescheiterten Schreiben heisst der Knopf «Nochmals speichern»; nach einem Konflikt (409/412) bietet die Meldung «Neu laden» (frisches eTag, der Entwurf bleibt).
- Speichern läuft nur über `F.speicherAblauf({ pruefen, schreiben, nachladen, erfolgText, … })`: ohne Änderungen geschieht nichts (auch nicht mit Ctrl+S), Prüffehler gehen ans Feld, Schreiben und Nachladen sind getrennt, Doppelauslösung ist gesperrt. Schnellaktionen laufen in `F.beschaeftigt(fn)` (Leiste und Kopfaktionen gesperrt, danach still nachladen). Verwerfen fragt einheitlich über `F.verwerfen` («2 Änderungen verwerfen?»).

---

## 7. Muster für Inhalte

### 7.1 Status nie nur Farbe

| Situation | So |
|---|---|
| Abweichung eines Datensatzes | `UI.status(text, ton)` – Sinnbild + Wort, im Seitenkopf oder in der Zelle |
| Auswahl (Navigation, Chip, Umschalter, Kästchen) | Pastell **und** Häkchen bzw. Gewicht 500 bzw. `aria-current`/`aria-pressed` |
| Hinweis mit Ton | Sinnbild in der Tonfarbe + Titel; der Text bleibt ruhig |
| Geändertes Feld | Punkt + «(geändert)» für Screenreader + Zahl in der Speicherleiste |
| Telefonnummer in Betrieb ohne Zuweisung | Status «Nicht zugewiesen» (Warnung) in der Spalte «Zugewiesen» – **keine getönte Zeile**; zählt unter «Handlungsbedarf» |
| Freie Telefonnummer | Status «Frei» **neutral** mit `checkKreis`, ohne Tooltip – in Liste, Telefon- und Benutzerseite gleich; in «Zugewiesen» ein schlichtes «Nein»; kein Handlungsbedarf |
| Dringlichkeit in der Übersicht | Zahlmarke tonal + Status «Dringend» |
| Leerer Wert | «–» (Halbgeviertstrich), nie ein leeres Feld |

### 7.2 Kennzahlen ungefärbt
Die Zahl bleibt `--text`. Ein Ton steht als Sinnbild in der Beschriftung (Kachel) oder vor dem Namen (Kennwert), eine
Null ist leise. Jede Zahl öffnet die Liste, die sie zählt, schon gefiltert – sie zählt dieselben Zeilen wie der Filter.
Kennzahlen nur, wo sie eine Aussage haben (Anzahl, Anteil, Zeit seit).

### 7.3 Leerzustände
Zwei Arten, beide mit `UI.leerzustand`:

| Art | Sinnbild | Titel | Text | Aktion |
|---|---|---|---|---|
| noch nichts da | das der Liste | «Noch keine Telefonnummern» | der nächste Schritt («Die erste Nummer lässt sich über «Neue Telefonnummer» erfassen.») | höchstens eine |
| nichts für diese Filter | `suche` | «Keine Treffer» | keiner, Titel und Aktion genügen | «Filter zurücksetzen» bzw. «Suche zurücksetzen» |

In Karten genügt oft ein Satz (`UI.hinweis`). Nie ein leerer Bereich. Bei leerer Liste: Tabellenrahmen `hidden`.

### 7.4 Fehler

| Situation | Darstellung |
|---|---|
| Seite lädt nicht | `Rahmen.zustand('fehler', { titel, text, hinweis, beiKlick })`: Fehlerkasten in der Tafel mit «Erneut laden»; setzt Titel und Dokumenttitel |
| Datensatz nicht gefunden | `F.ladefehler(fehler, …)`: Fehlerzustand mit «Zur Liste», Zurück-Link bleibt |
| Im anderen Tab gelöscht | Endzustand «Inzwischen gelöscht» mit «Zur Liste» |
| Teil der Daten fehlt (eine Liste) | Banner `gefahr` mit «Erneut versuchen» (Text-Knopf) bzw. Leerzustand, der sagt, was zu tun ist (Listen-ID in `konfig.js`) |
| Speichern scheitert | Meldung `fehler` (bleibt) über der Leiste + Feldfehler; Knopf «Nochmals speichern» |
| Konflikt (409/412) | Meldung mit Aktion «Neu laden» |
| Eingabe ungültig | `UI.feldFehler` am Feld, Fokus ins Feld; ein Satz, der sagt, was gilt («Die Reihenfolge ist eine ganze Zahl ab 0, ohne Komma, Punkt oder Buchstaben (z. B. 10).»); nie still umdeuten |
| Aktion gerade nicht möglich | Knopf gesperrt mit Grund (Tooltip), nicht verstecken |
| Nachladen im Hintergrund scheitert | still; der bisherige Stand bleibt, der nächste Takt versucht es wieder |

### 7.5 Texte

| Regel | Beispiel |
|---|---|
| Schweizer Hochdeutsch: «ss» statt ß | «schliessen», «Grösse» |
| Guillemets für Namen und Zitate | Liste «ADMIN-Clients», Knopf «Speichern» |
| Halbgeviertstrich «–» als Gedankenstrich und Leerwert, nie «—» | «Übersicht – ICT-Inventar» |
| Uhrzeit mit Punkt, Datum TT.MM.JJJJ (`UI.zeitText`) | «12.10.2026, 14.05» |
| Zahlen de-CH (`UI.zahlText`) | «1’284», «7.5» |
| Auslassung mit Leerschlag | «Wird geladen …», «Löschen …» |
| Satzschreibung, keine Versalien-Titel | «Ersatz überfällig», nicht «ERSATZ ÜBERFÄLLIG» |
| Knöpfe nennen die Handlung bzw. Folge | «Ins Lager legen», «Eintrag löschen», nicht «OK» |
| Meldungen: was geschah, in einem Satz mit Punkt | «3 Änderungen gespeichert.» |
| Dialogtext: was passiert, ohne Drohung | «Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage lang zurückholen.» |
| Lead und Kartenuntertitel nur, wo sie Nicht-Offensichtliches sagen: ein Satz, höchstens 76 Zeichen | «SCCM sieht, wer am Gerät arbeitet, nicht, wem es gehört.» |
| Felder, die man nicht ausfüllen muss, tragen «(optional)», nie «(freiwillig)» | «Notiz für den Verlauf (optional)» |
| Fehlt ein Pflichtfeld: «Bitte … eingeben.» (eingeben, nicht eintippen) | «Bitte einen PC-Namen eingeben.» |

### 7.6 Typische Inhalte

| Situation | So wird es gezeigt |
|---|---|
| Datensatz mit Kennzahlen | Kachelreihe zuoberst, danach Karten |
| Feldliste zum Lesen | Datenzeilen in einer Karte, 4–9 Felder je Karte |
| Feldliste zum Bearbeiten | Formzeilen (`F.feld`) in einer Karte; gespeichert wird über die Speicherleiste, nie über einen Knopf in der Karte |
| Liste von Personen oder Geräten | Zeilenliste: Titel 500 + Unterzeile; Aktionen rechts als kleine Text-Knöpfe; Hauptaktion in der Fusszeile der Karte |
| Suche in einer Karte | Suchfeld oben, Treffer als Zeilenliste, ein Satz statt leerem Rahmen |
| Warnung mit Handlung | Banner, Text links, Knopf rechts |
| Mehrere Werte eines Merkmals | Status-Chips in einer Reihe; ab etwa acht Werten eine schlichte Tabelle |
| Vergleich mit der Flotte | Kennwert mit Erklärung, darunter Säulen (Mini-Verteilung) |
| Verteilung | `UI.verteilung`, höchstens 8 Zeilen + «und n weitere …» |
| Lange Texte | Titel und Werte brechen um (`overflow-wrap: anywhere`); Tabellenzellen, Chips und Blatttitel enden mit «…», der Tooltip zeigt den ganzen Text |
| Vorführmodus (`?mock=1`) | `Rahmen.vorfuehrung` / `F.bandZeichnen`: Warnbanner als erster Block mit «Vorführdaten zurücksetzen» (Rückfrage). Der Text ist auf allen Seiten derselbe und kommt als Vorgabe aus `rahmen.js` («Vorführmodus mit erfundenen Daten. Änderungen bleiben nur in diesem Browser.»); Seiten übergeben keinen eigenen (`F.bandZeichnen(undefined, …)`) |

---

## 8. Barrierefreiheit und Bedienung

### 8.1 Tastatur

| Taste | Wirkung |
|---|---|
| Tab / Shift+Tab | Erst die Sprungmarke «Zum Inhalt», dann Kopf, Schublade, Tafel. In Dialog, Blatt und modaler Schublade bleibt Tab in der Ebene. |
| `/` | springt in die Suche der aktuellen Liste (Hauptseite; nicht beim Tippen) |
| Esc | verbirgt einen offenen Tooltip, dann der Reihe nach: 1. schliesst die oberste Ebene (Dialog, Blatt, modale Schublade) · 2. leert eine gefüllte Suche · 3. Detailseite: fragt, ob die Änderungen verworfen werden – nicht, während gespeichert oder gearbeitet wird |
| Ctrl/Cmd+S | speichert, wenn es etwas zu speichern gibt und keine Ebene offen ist |
| Enter | im Löschdialog: löst aus, sobald das Wort stimmt |
| Ctrl-/Mittelklick | auf Zeilen, Namen, Schubladen-Einträgen, «Neuer …»: neuer Tab |

Bewusst **nicht**: Pfeiltasten-Bedienung der Listen.

### 8.2 Fokus
- Ring sofort, nie animiert: `2px solid --primaer` mit 2 px Abstand (`:focus-visible`), folgt dem Radius. Felder und die Suche zeigen stattdessen den inneren 2-px-Ring; in beschnittenen Listen (Zeilenliste, Mehrfachauswahl) liegt der Ring innen.
- **Fokus geht nie verloren:** Werte an Ort und Stelle ändern statt neu bauen (`UI.textSetzen`, `.setzen()`, `sortierungSetzen`, `zahlenSetzen`, `blatt.unter()`, `Rahmen.zahl`); neu zeichnen über `F.zeichneBereich` bzw. `Rahmen.stillZeichnen` – sie finden Fokus, Schreibmarke und Rollpositionen über `data-fokus` (Vorrang) oder `id` wieder.
- Verschwindet etwas unter dem Fokus, geht er vorher an das Gleichwertige (Nachbarzeile, h1 der Ansicht, × des Blatts). Programmatische Ziele (Tafel, h1 mit `tabindex=-1`) zeigen keinen Ring.
- Auto-Nachladen läuft nie, solange ein Eingabefeld den Fokus hat, eine Ebene offen ist oder gearbeitet wird.

### 8.3 ARIA und Semantik

| Element | Auszeichnung |
|---|---|
| Schublade | `nav` mit `aria-label` («Hauptnavigation» bzw. «Bereiche»), aktiver Eintrag `aria-current="page"` |
| Menüknopf | `aria-label` «Navigation öffnen», `aria-controls`, `aria-expanded` |
| Ebenen | Fokusfalle, Rest `inert`; Blatt ohne zweites `<header>` |
| Umschalter, gedrückte Knöpfe | `aria-pressed` |
| Knopf, der ein Blatt öffnet | `aria-haspopup="dialog"`, `aria-expanded` |
| Schalter | `role="switch"`, `aria-checked`; gesperrt `aria-disabled` |
| Gesperrte Knöpfe | `aria-disabled` + Grund im Tooltip; beschäftigt `aria-busy` |
| Felder | `<label for>`; Fehler `aria-invalid` + `aria-describedby`; Kästchengruppen `fieldset`/`legend` |
| Tabellen | `caption` (nur Screenreader), `aria-sort` an allen sortierbaren Spalten |
| Meldungen | eine Live-Region `#ansage` (`role=status`, `polite`); Trefferzahl `aria-live="polite"` |
| Schloss | `role="img"` + `aria-label` mit dem Grund |
| Konto-Initiale | breit `aria-hidden` (Name und E-Mail stehen daneben); ≤ 720 px `role="img"` mit Name und E-Mail, Tabstopp mit Tooltip |
| Sinnbilder | immer `aria-hidden`; den Namen trägt das Bedienelement (Icon-Knöpfe: `titel` → `aria-label`) |
| Geändert, Dringlichkeit | `.nur-sr`-Texte «(geändert)», «(zu prüfen)», «(dringend)» |

### 8.4 Kontrast und Kontrastmodus
- Text `--text` und `--text-leise` tragen auf jeder Fläche; `--text-still` nur auf Weiss. Links sind unterstrichen.
- **Kontrastmodus** (Windows, `forced-colors: active`): Ränder, die nur aus Schatten oder Fläche bestehen (Dialog, Blatt, Meldung, Tooltip, Speicherleiste, Schublade), tragen einen durchsichtigen Umriss, den das System malt. Aktive Auswahl (Schubladen-Eintrag, gedrückter Knopf, Schalter an) bekommt `Highlight`/`HighlightText`; Auswahllisten erhalten ihren nativen Pfeil zurück; Sinnbilder folgen der Textfarbe; Spinner, Ladebalken, Balken und Zahlmarken bleiben sichtbar.

### 8.5 Reduzierte Bewegung, Touch, Zoom, Druck
- Reduzierte Bewegung: §5.7.
- Touch: kein Hover, keine Tooltips, kein Tastenkürzel-Hinweis; Drücken zeigt sofort den Endzustand. Ziele mindestens 32 px (Icon-Knöpfe 40, Schubladen-Einträge 48).
- Zoom: bis 400 % (320 px breit) ohne waagrechtes Rollen der Seite; schmale Darstellungen richten sich nach der Bahn (Container-Abfragen).
- Druck: nur der Inhalt, ohne Kopf, Schublade, Ladebalken, Speicherleiste, Meldungen, Tooltip und Schnellaktionen; die Tafel läuft über alle Seiten.

---

## 9. Regeln für neue Seiten und Bausteine

### 9.1 Neue Seite, Schritt für Schritt

1. **HTML-Gerüst** übernehmen: `body.app[data-seite="…"]` mit Sprungmarke, `header.kopf#kopf`, `nav.schublade#schublade`, `.tafel-rahmen > main.tafel#tafel[tabindex=-1]` mit `.ladebalken#ladebalken[hidden]` und `.bahn#inhalt[data-zustand="laden"]`. Detailseite: in der Bahn nur `header.seitenkopf#<p>-kopf` und `div.fenster-bereich#<p>-bereich`. Kein statisches Markup für Dialog, Meldung, Speicherleiste, Laden oder Fehler.
2. **Kopf:** Google Fonts, `design.css`, `bewegung.css`, `rahmen.css`, die Zeile `<style>@view-transition { navigation: auto; }</style>` (inline, alle Seiten gleich), dann die eigene Seiten-CSS. **Skripte** in der Reihenfolge aus §10, klassisch, ohne `defer`, keine Inline-Skripte (CSP).
3. **Seiten-CSS** mit eigenem Präfix (`g-`, `b-`, `tf-`, `sw-`, `km-`, `kr-`, `vl-`; die Hauptseite benennt nach Ansichten) – nur Raster, Breiten, Reihenfolge, Positionen, alle Werte als Tokens. Keine Farben, Radien, Schatten, Schriftgrössen oder -gewichte, Dauern, Kurven, keine `@keyframes`; `:hover` nur in `@media (hover: hover)`.
4. **Bauen nur über** `UI.*`, `Rahmen.*`, `Bewegung.*` und – auf Detailseiten – `F.*` (`const F = Fenster.erstellen(p, { liste, neuLaden, nachladen })`). Keine eigenen Kopien von `el`, `knopf`, `sinnbild`, `karte`, `dialog`, `meldung`; kein `innerHTML` mit Daten; kein `title` (→ `titel`, `UI.tipp`); kein `window.confirm`/`alert` (→ `UI.bestaetigen`, `UI.meldung`); Adressen nur über `UI.adresse.*` (hängt `mock=1` selbst an).
5. **Ablauf:** `Rahmen.zustand('laden', { text, fortschritt })` → Daten holen → zeichnen → `await Rahmen.zustand('inhalt')`; Fehler über `Rahmen.zustand('fehler', …)` bzw. `F.ladefehler`. Kopf: `Rahmen.konto`, `Rahmen.abmelden` (Detailseiten `F.kontoZeigen`); Vorführmodus `Rahmen.vorfuehrung` bzw. `F.bandZeichnen`.
6. **Jede Ansicht** bekommt Seitenkopf (h1, ohne Lead), Karten, Leerzustand und Fehlerzustand; **genau eine** gefüllte Hauptaktion je Bereich.
7. **Bewegung** nur über die Anlässe aus §5.5. Zeichenfunktionen sind still; Auto-Nachladen über `F.autoStarten` bzw. `Rahmen.stillZeichnen`.
8. **Fokus:** jedes Bedienelement ohne `id` bekommt `fokus: '…'` (stabil und eindeutig); innere Roller `id` oder `data-rolle`.
9. **Detailseite zusätzlich:** Entwurf `F.entwurf`, Felder `F.feld`, nach dem Schreiben `F.uebernehmen(zeile, felder, antwort)`, Speichern `F.speicherAblauf`, Schnellaktionen in `F.beschaeftigt` und mit `gesperrt: grund`, Löschen `F.loeschenDialog`, Tastatur und Verlassen-Schutz `F.ereignisse`. Fachliche Regeln aus `modell.js` (`Modell.istBearbeitbar`, `Modell.adStatus`).
10. **Prüfen** (§9.3).

### 9.2 Neuer Baustein oder neue Animation

1. Gibt es ihn schon? Erst in `styleguide.html`, `bausteine.js` und `rahmen.js` nachsehen; dann im ChatBob-Designsystem (`docs/designsystem.md`, Spezifikation «Mapping 7.2»).
2. Gemeinsames gehört ins Fundament: Klasse in `design.css` (Ebenen und Rahmen in `rahmen.css`), Bauer in `bausteine.js` (bzw. `rahmen.js`), mit Kopfkommentar-Eintrag. Nie in einer Seite nachbauen – fehlt etwas, das Fundament ergänzen.
3. Nur Tokens; ein neuer Wert wird ein Token mit ChatBob-Gegenstück (§2). Keyframes nur in `bewegung.css`, Sinnbilder nur in `UI.SINNBILDER`.
4. Bauer: Knoten zurück, `textContent`, Optionen als Objekt, `fokus`, `titel`, `.setzen()` für alles, was sich an Ort und Stelle ändert; Hover in `@media (hover: hover)`; eigene Media-Queries mitbringen; Kontrastmodus bedenken.
5. In `styleguide.js` einen Abschnitt bzw. ein Muster in allen Zuständen ergänzen (nur über die Bauer).
6. Diese Datei (§4) nachführen.

### 9.3 Prüfen

**Statisch** – nach jeder Änderung im Ordner `code`:

```powershell
powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1
```

[`code/Pruefe-Frontend.ps1`](../code/Pruefe-Frontend.ps1) (Windows PowerShell 5.1, ohne Zusatzmodul, ohne Browser)
prüft sieben Regeln und meldet je Prüfung «OK» oder die Fundstellen mit Datei und Zeile; Exit-Code 0 heisst in
Ordnung. Kommentare zählen nicht mit.

| Prüfung | Regel |
|---|---|
| 1. Tokens | jedes `var(--x)` in den CSS-Dateien und in `<style>` ist definiert (CSS, `<style>` oder `setProperty("--x")` in JS); `var(--x, Ersatz)` gilt als Schalter |
| 2. Keyframes | `@keyframes` nur in `bewegung.css` |
| 3. Seiten-CSS | `styles.css`, `client.css`, `benutzer.css`, `telefon.css`, `software.css`, `kamera.css`, `kamerarolle.css`, `verlauf.css`: keine Farb-, Radius-, Schrift-, Dauer- oder Kurven-Literale |
| 4. JavaScript | kein `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, kein `(window.)confirm/alert/prompt`, kein Browser-`title` (→ `titel`, `UI.tipp`) |
| 5. HTML | kein Inline-`<script>`, keine `on*`-Attribute, keine `javascript:`-Adressen (die `<style>`-Zeile für `@view-transition` ist erlaubt) |
| 6. MSAL | gleiche `integrity` und `crossorigin="anonymous"` auf allen Seiten, die MSAL laden |
| 7. Altlasten | kein `#0b57d0`, `#e8f0fe`, `--primaer-hell`, `knopf-gefahr` |

Mit `-Ordner <Pfad>` prüft es eine Kopie. Was es nicht sieht – Aussehen, Bewegung, Bedienung –, zeigt erst der Browser.

**Im Browser** (`code\serve.ps1`, Vorführmodus `?mock=1`, Fehlerfall `&fehler=1`):

| Prüfung | Wie |
|---|---|
| Konsole | keine Fehler auf allen Seiten, auch `styleguide.html` |
| Breiten | 1440, 900 und 390 px: kein waagrechtes Rollen der Seite, nichts ausserhalb des Fensters, kein abgeschnittener Text ohne «…»; dazu 200 % Zoom und ein niedriges Fenster (Tabellenansichten) |
| Zustände | Laden, Fehler (`&fehler=1`), unbekannte ID, Neu-Modus (`?neu=1`), Leerzustand, lange Texte |
| Bewegung | Erstauftritt und Wechsel ruhig; Tippen, Filtern, Speichern und Nachladen ohne Bewegung; Fokus bleibt. Achtung: Eine RDP-Sitzung meldet «reduzierte Bewegung» – zum Prüfen in den DevTools «Rendering → prefers-reduced-motion: no-preference» emulieren |
| Tastatur | Tab durch alle Bedienelemente, Esc-Reihenfolge, Ctrl+S, Rückfokus nach Dialog und Blatt |
| Kontrastmodus | DevTools «Rendering → forced-colors: active» |
| Vergleich | mit dem ChatBob-Admin bei denselben Breiten |

---

## 10. Dateien und Ladereihenfolge

| Datei | Inhalt | Namensraum |
|---|---|---|
| `design.css` | Tokens, Grundstil, **alle** gemeinsamen Komponenten | – |
| `bewegung.css` | **alle** `@keyframes`, `.eintritt*`, `.austritt*`, `.staffel`, `.aufklappbar`, `.veraltet`, Indikator | – |
| `rahmen.css` | Rahmen (Kopf, Schublade, Tafel, Bahn, Seitenkopf, Zustände), Dialog, Blatt, Meldung, Tooltip, Speicherleiste, Seitenübergänge, Kontrastmodus, Druck | – |
| `bewegung.js` | JS-Hälfte der Bewegung (eingefroren) | `Bewegung` |
| `bausteine.js` | DOM-Helfer, Sinnbilder, Bauer aller Komponenten | `UI` |
| `rahmen.js` | Rahmen, Navigation, Zustände, Seitenwechsel; Ebenen und Adressen | `Rahmen`; ergänzt `UI.dialog/bestaetigen/blatt/ebeneOffen/meldung/meldungenFehlerSchliessen/meldungenAusrichten/tipp/speicherleiste/seitenkopf/adresse` |
| `fenster.js` | Gerüst der vier Detailseiten | `Fenster.erstellen()` → `F` |
| `verlauf.js`, `verlauf.css` | Verlauf (Client, Benutzer, Telefon) | `Verlauf` |
| `konfig.js` | Listen-IDs, Mandant, Takt des Nachladens (keine Geheimnisse) | `KONFIG` |
| `auth.js` | Anmeldung über MSAL | `Auth` |
| `graph.js` | Lesen/Schreiben über Microsoft Graph, Vorführdaten | `Hilfe`, `Daten`, `Mock` |
| `modell.js` | Fachlogik: Geschäftsjahr, Status, Programmstufen, Verknüpfungen | `Modell` |
| `spalten.js` | **generiert** von `code/Build-Spalten.ps1`, nie von Hand ändern | – |
| `index.html`, `app.js`, `styles.css` | Hauptseite | – |
| `client.*`, `benutzer.*`, `telefon.*`, `software.*` | Detailseiten (`.css` nur Seitenlayout) | – |
| `styleguide.html`, `styleguide.js` | lebende Komponentenübersicht | – |
| `STYLEGUIDE.md` | dieses Dokument | – |
| `_headers` | Sicherheitsheader und CSP (Cloudflare Pages) | – |

Ladereihenfolge auf jeder Seite (klassische Skripte, ohne `defer`; MSAL-Zeile samt SRI unverändert lassen):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:opsz,wght@17..18,400..700&family=Archivo:wdth,wght@112,500..700&display=swap">
<link rel="stylesheet" href="design.css">
<link rel="stylesheet" href="bewegung.css">
<link rel="stylesheet" href="rahmen.css">
<style>@view-transition { navigation: auto; }</style>     <!-- inline: aus einer Stilvorlage bricht Chrome ab -->
<link rel="stylesheet" href="<seite>.css">                <!-- + verlauf.css auf Seiten mit Verlauf -->
…
<script src="konfig.js"></script>
<script src="bewegung.js"></script>
<script src="bausteine.js"></script>
<script src="rahmen.js"></script>                          <!-- baut Kopf und Schublade sofort -->
<script src="https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.30.0/lib/msal-browser.min.js" integrity="…" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="spalten.js"></script>
<script src="auth.js"></script>
<script src="graph.js"></script>
<script src="modell.js"></script>
<script src="verlauf.js"></script>                         <!-- nur client, benutzer, telefon -->
<script src="fenster.js"></script>                         <!-- nur Detailseiten -->
<script src="<seite>.js"></script>
```

`styleguide.html` lädt nur `bewegung.js`, `bausteine.js`, `rahmen.js` und `styleguide.js` (keine Anmeldung, keine Daten).
`rahmen.js` bricht ab, wenn `bewegung.js` und `bausteine.js` fehlen; ohne `body[data-seite]` baut es keinen Rahmen,
die Ebenen gehen trotzdem.
