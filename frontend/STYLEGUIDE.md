# Styleguide «ICT-Inventar»

Stand: 23.10.2026 · Gilt für alle Seiten unter `frontend/` (index, client, benutzer, telefon, software, kamera,
kamerarolle und styleguide.html).

**Massgebend ist [Dashboard-Style](https://github.com/saschazesiger/Dashboard-Style)**, das gemeinsame Design-System
(Material 3 im Aufbau der Google-Konsolen), heute in der Fassung **1.6.2**. Es liegt als unveränderte Kopie in
`vendor/dashboard-style/` und bringt Tokens, Bausteine, Bewegung, Überlagerungen und Sinnbilder mit. Seine
Dokumentation (Englisch) gilt hier ohne Abstriche:

| Thema | Dashboard-Style |
|---|---|
| Tokens, drei Ebenen, Hooks | [docs/tokens.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/tokens.md) |
| Thema überschreiben | [docs/theming.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/theming.md) |
| Markup jedes Bausteins, App-Gerüst, `DS.overlay`, `DS.ripple` | [docs/components.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/components.md) |
| Bewegung, `DS.motion`, `DS.indicator`, `DS.dom` | [docs/motion.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/motion.md) |
| Sinnbilder, `DS.icons` | [docs/icons.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/icons.md) |
| Design-Regeln | [docs/rules.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/rules.md) |
| Kopie anlegen und prüfen, Kaskaden-Ebenen, mehrere Seiten | [docs/install.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/install.md) |
| Neutraler Styleguide | `styleguide/index.html` im Repository (läuft auch von der Festplatte) |

Dieses Dokument nennt nur, was ICT-Inventar **darüber hinaus** festlegt: das Campus-Thema, die Bausteine, die es nur
hier gibt, die deutschen Bauer (`UI.*`, `Rahmen.*`, `Bewegung.*`, `F.*`), die bewussten Abweichungen und die Regeln
für Inhalte. Die vollständigen Signaturen stehen in den Kopfkommentaren von `bausteine.js` (`UI`, `Bewegung`),
`rahmen.js` (`Rahmen` und Überlagerungen), `fenster.js` (`F`) und `verlauf.js` (`Verlauf`); bei einem Widerspruch
gilt der Code. Die Kurzfassung für Agenten und neue Mitarbeitende (Befehle, Konventionen, welcher Bauer wofür) steht
in [`AGENTS.md`](../AGENTS.md).

Lebende Übersicht: **[styleguide.html](styleguide.html)** – jeder Baustein in allen Zuständen, so wie ICT-Inventar
ihn über `UI.*` baut (gemeinsame im Campus-Thema und die eigenen), ohne Anmeldung und ohne Daten. Lokal:
`code\serve.ps1`, dann `http://localhost:8123/styleguide.html`; die Abschnitte sind Anker (`#grundlagen`, `#knoepfe`,
`#status`, `#karten`, `#daten`, `#formulare`, `#tabellen`, `#hinweise`, `#listen`, `#seitenkopf`, `#ueberlagerungen`,
`#rahmen`, `#bewegung`). «Grundlagen» zeigt Version und Ablage der Kopie und verweist auf die Dokumentation von
Dashboard-Style.

Inhalt: 1 Grundlage · 2 Campus-Thema · 3 Layout · 4 Bausteine · 5 Abweichungen · 6 Bewegung · 7 Überlagerungen ·
8 Muster für Inhalte · 9 Barrierefreiheit · 10 Neue Seiten und Bausteine, Prüfen · 11 Dashboard-Style aktualisieren ·
12 Dateien und Ladereihenfolge · 13 Alte Namen

---

## 1. Grundlage: Dashboard-Style

| Was | Wo | Regel |
|---|---|---|
| Kopie | `vendor/dashboard-style/` (`ds.css`, `ds.js`, `css/` samt `css/optional/`, `js/`, `fonts/`, `LICENSE`, `VERSION`, `SHA256SUMS`) | **Nie von Hand ändern.** Aktualisiert wird sie nur mit `vendor.ps1`/`vendor.sh` (§11); `code/Pruefe-Frontend.ps1` vergleicht jede Datei mit `SHA256SUMS`. `.gitattributes` schützt den Ordner vor umgeschriebenen Zeilenenden (`-text`) und führt ihn für GitHub als fremden Code (`linguist-vendored`). |
| Gültigkeitsbereich | `<html class="ds-theme ds-base">` | Die Tokens hängen an `.ds-theme` (nicht an `:root`); `.ds-base` setzt Grund, Schrift, Links, Code, Fokus, `[hidden]` und die Bildlaufsperre `body.ds-no-scroll`, die `DS.overlay` braucht. |
| Kaskaden-Ebenen | `ds.css` in `@layer ds.tokens, ds.base, ds.components, ds.motion, ds.utilities`; `grund.css` in `@layer grund` | CSS **ohne** Ebene schlägt jede Ebene, gleich wie spezifisch. Darum: `thema.css`, `bausteine.css`, `rahmen.css` und die Seiten-CSS stehen ohne Ebene und überschreiben einen gemeinsamen Baustein nur, wo ICT es wirklich anders will (mit Grund, §5) – keine doppelten Klassen, kein `!important`, keine `:where()`-Kniffe gegen Dashboard-Style, lieber seine Hooks (`--ds-btn-*`, `--ds-table-row-hover` …). Grundregeln, die keinen Baustein schlagen dürfen (Rollen der Überschriften h1–h6, Ränder 0 der ICT-Blöcke), stehen in `grund.css`: sie wird als **erste** Stilvorlage geladen und legt mit `@layer grund, ds;` die Reihenfolge fest. |
| CSS | `ds.css` (alle Dateien in Kaskadenreihenfolge), `css/optional/view-transitions.css` | Danach `thema.css`, `bausteine.css`, `rahmen.css`, die Seitenvorlage (§12). `view-transitions.css` schaltet die Seitenübergänge zwischen den HTML-Seiten ein (§6.2). |
| JavaScript | `ds.js`, klassisch → `window.DS` mit `DS.motion`, `DS.indicator`, `DS.dom`, `DS.ripple`, `DS.icons`, `DS.overlay` | Seiten rufen `DS` nicht direkt auf; die deutschen Hüllen sind die Schnittstelle: `Bewegung.*` → `DS.motion` und `DS.indicator` (§6.1); `UI.beschaeftigt` → `DS.motion.busy`; `UI.abgleichen`, `Rahmen.stillZeichnen`, `F.zeichneBereich` → `DS.dom.morphChildren`; `UI.dialog`, `UI.bestaetigen`, `UI.blatt` und die modale Schublade → `DS.overlay.open/close`; `UI.meldung` → `DS.overlay.toast`; Tooltips → `data-tip` und `DS.overlay.tooltips`; `UI.sinnbild` → `DS.icons.iconElement`. `rahmen.js` startet einmal je Seite `DS.ripple.attach(document)` und `DS.overlay.tooltips(document)`. Kein `DS.icons.icon()` und kein `DS.dom.morphHtml` (beide arbeiten mit HTML-Text). |
| Schriften | `vendor/dashboard-style/fonts/` (Google Sans), `schriften/` (Archivo) | Beide selbst gehostet, Lizenz SIL OFL 1.1 je als `OFL.txt` daneben. Kein Google Fonts; die Inhaltsrichtlinie in `_headers` erlaubt Schriften nur von `'self'`. |

Namen: Tokens heissen `--ds-*`, Klassen `.ds-*`, die Keyframes `ds-*`, Attribute `data-ds-*`. Deutsch bleiben die
sichtbaren Texte, die JS-Namensräume (`UI.knopf`, `Rahmen.zustand`, `Bewegung.eintreten`, `F.feld`) und die Klassen
und Tokens der ICT-eigenen Bausteine (`.speicherleiste`, `.zeitachse`, `--diagramm-a`). Die Tabelle alt → neu steht
in §13.

Grundsätze (aus Dashboard-Style, hier verbindlich): getönter Grund mit **einer** weissen Tafel als einzigem Roller;
Haarlinien statt Schatten (Schatten nur für Schwebendes); **eine** Tönung (das Pastell); jede Aktion eine Pille,
Hover und Druck als Zustandsebene, nie Anheben oder Vergrössern; Status nie nur über Farbe; Links unterstrichen;
Hierarchie über Schrift (nur 400 und 500, Satzschreibung); 4er-Raster; ruhige Bewegung, auf jedem Gerät gleich (§6);
die Seite rollt nie waagrecht.

---

## 2. Campus-Thema (`thema.css`)

`thema.css` wird nach `ds.css` und `view-transitions.css` geladen und überschreibt Rollen auf demselben Selektor
`.ds-theme`, **ohne Kaskaden-Ebene** (in einer Ebene verlöre es gegen die Standardwerte aus `ds.tokens`). Es enthält
**nur Tokens und die Schrift der Wortmarke**, keine Bausteine. Bewegung ist in Dashboard-Style ein festes Schema, auf
jedem Gerät gleich, die Dauern sind `calc()` × `--ds-time-scale`: Kein Thema setzt Bewegungs-Tokens (`--ds-dur-*`,
`--ds-ease-*`, `--ds-distance-*`, `--ds-scale-*`, `--ds-delay-*`, `--ds-loop-*`, `--ds-hold-*`, `--ds-stagger`,
`--ds-time-scale`) oder Bewegungs-Hooks (`--ds-motion-*`, `--ds-enter-*`, `--ds-leave-*`, `--ds-scan-*`,
`--ds-clip-from`, `--ds-draw-length`, `--ds-indicator-lag/-dur`, `--ds-i`) – Prüfung 2. Was Dashboard-Style schon
richtig hat (Textfarben #1f1f1f/#444746/#747775, Statusfarben, Radien, Schatten, Google Sans, Typo-Rollen, Masse,
16 px Feldtext auf dem Telefon), steht nicht noch einmal da.

### 2.1 Campus-Werte für Rollen von Dashboard-Style

| Token | Wert | Verwendung |
|---|---|---|
| `--ds-backdrop` | `#f3f4f2` | Grund, Kopf, Schublade; Hover von Tabellenzeilen – leicht grünlich statt Google-Grau |
| `--ds-surface-low` | `#f9f9f7` | Kacheln, gefüllte Karte, neutrales Banner, Code, nur lesbare Felder |
| `--ds-surface-high` | `#edeeec` | Suche, gefüllte Felder, neutraler Status-Chip, stiller Zähler, Zahlmarke |
| `--ds-surface-highest` | `#e2e3e1` | Schalterspur aus, Skelettlinien |
| `--ds-line` | `#e2e3e1` | passive Haarlinie: Karten, Trenner, Tabellenzeilen |
| `--ds-primary` | `#1a3c25` | gefüllter Knopf, Text-Knopf, Links, Fokus, Schalter an, Fortschritt, Zeitachsenpunkt |
| `--ds-primary-hover` / `-pressed` | `#2c4c36` / `#153220` | Referenzwerte (Primär + 8 % Weiss bzw. dunkler) |
| `--ds-accent` / `--ds-on-accent` | `#cfdfad` / `#1a3c25` | **die einzige Tönung**: aktive Navigation, gewählter Chip, Tonal-Knopf, Zähler, Leerzustand-Scheibe, Spur von Fortschritt und Ladebalken, Textauswahl |
| `--ds-inverse-primary` | `#a1d73b` | Erfolgs-Sinnbild und Aktion in der Meldung |
| `--ds-link-underline` | `rgba(26, 60, 37, .4)` | Linie unter Links in Ruhe |

**Kein Blau**, auch kein blaues «Info»: neutral = `--ds-surface-low` + grünes Sinnbild. Kontrast: `--ds-text-3`
erreicht 4.5:1 **nur auf Weiss**; das Pastell hat gegen Weiss 1.42:1 – eine Auswahl trägt darum immer zusätzlich ein
Häkchen, das Gewicht 500 oder ein `aria-*`-Attribut.

### 2.2 Tokens, die es nur in ICT-Inventar gibt

| Token | Wert | Verwendung |
|---|---|---|
| `--campus-gruen` | `#84b819` | nur Dekoration: der Punkt der Wortmarke, nie Text |
| `--schrift-marke` | `Archivo, 'Trade Gothic Next', 'Helvetica Neue', Arial, sans-serif` | nur die Wortmarke (das Campus-Logo ist in Trade Gothic Next gesetzt; Archivo in 112 % Breite kommt ihm am nächsten) |
| `--gewicht-marke` | `650` | nur die Wortmarke |
| `--konto-breit` | `240px` | Name und E-Mail in der Konto-Kapsel, danach «…» |
| `--diagramm-a` / `-b` | `var(--ds-primary)` / `var(--ds-accent)` | Balken, Säulen, Zeitstrahl (b = Vergleichsreihe) |
| `--diagramm-gefahr` / `-warnung` | `var(--ds-error)` / `var(--ds-warning)` | überfällig / im laufenden Geschäftsjahr |

**Laufzeit- und Komponentenvariablen** der eigenen Bausteine setzen Bauer, `rahmen.js` und das CSS der Bausteine, nie
Seiten: `--anteil` (Balken, Säulen, Zeitstrahl), `--rollleiste` (`UI.rollKanten`: Breite einer senkrechten
Rollleiste, die Blende lässt sie aus), `--leiste-hoehe`, `--leiste-reserve`, `--leiste-rest` (Speicherleiste, von
`rahmen.js` gemessen), dazu im CSS `--leiste-unten`, `--bahn-unten`, `--dialog-fokusraum`, `--sinnbild-kante`. Von
Dashboard-Style setzt der Code nur die dokumentierten Hooks `--ds-progress` (auf `.ds-progress`), `--ds-toast-bottom`
(Meldungen über der Speicherleiste) und `--ds-toast-reserve` mit `data-toast-reserve` (Platz für einen stehenden
Fehler); alle übrigen `--ds-toast-*`, `--ds-indicator-*`, `--ds-i` … setzt Dashboard-Style selbst.

---

## 3. Layout

### 3.1 Rahmen (alle Seiten gleich)

```
┌ Kopf 64 px: [≡ ≤900] ICT.INVENTAR ·············· ( (A) Name / E-Mail │ Abmelden ) ┐
│ Schublade 256 px │ ╭──── Tafel (weiss, Radius 20 oben, EINZIGER Roller) ───────────────╮ │
│ Gruppen in       │ │ ▔▔ Ladebalken (nur beim Laden)                                     │ │
│ Satzschreibung,  │ │  .ds-page  max 1280, Polster 24 / 32 / unten Platz, Abstand 20     │ │
│ 48-px-Pillen,    │ │   Seitenkopf (‹ Zurück · h1 24/32 · Teile · Status · Aktionen)    │ │
│ aktiv = Pastell  │ │   Karten · Kacheln · Tabellen …                                    │ │
│                  │ │                                        ╭ Speicherleiste ╮          │ │
└──────────────────┴─╰ [Meldung unten links] ──────────────────────────────────────────╯─┘
```

Das Gerüst ist das der Referenz-App von Dashboard-Style (docs/components.md, «App frame»); `<body>` trägt keine
`ds-*`-Klassen (Prüfung 12).

| Teil | Klasse / Bau | Regeln |
|---|---|---|
| Seite | `div.ds-app.ds-app--drawer[data-seite]`, erstes Element in `<body>` | Raster aus Kopf, Schublade, Tafel; rollt nie. `rahmen.js` baut Kopf und Schublade **sofort beim Laden** aus dem Gerüst (§10.1). Zustände an `.ds-app`: `data-drawer-open` (setzt `DS.overlay`), `data-drawer-hidden`, `data-scrolled` (Tafel gerollt; ein 1-px-Wächter `.rollwaechter` mit IntersectionObserver setzt es), `data-zurueck`. |
| Sprungmarke | `a.ds-skip` | «Zum Inhalt», Ziel `#inhalt`. |
| Kopf | `div.ds-topbar#kopf` (rahmen.js) | Links [Menüknopf ≤ 900 px] und die **Wortmarke** «ICT.INVENTAR» (`.wortmarke`, Link zur Übersicht) auf der linken Kante der Navigationssinnbilder. Rechts **auf allen Seiten** EINE Kapsel `.kopf-konto` (48 px, Pille, weiss, Haarlinie) mit `.ds-account` (Initiale 32 px, Name, E-Mail bis `--konto-breit`), Trenner und «Abmelden» (Text-Knopf). Das Konto der vorigen Seite belegt den Kopf vom ersten Bild an vor (sessionStorage); die Wortmarke wartet höchstens 300 ms auf Archivo. Vorführmodus: Konto «Vorführmodus», kein «Abmelden». |
| Schleier | `div.ds-scrim` vor der Schublade | nur für die modale Schublade (≤ 900 px). |
| Schublade | `nav.ds-drawer#schublade[tabindex=-1]` über `Rahmen.navigation` bzw. `F.navZeichnen` | Gruppentitel in Satzschreibung, Einträge 48-px-Pillen (`.ds-drawer__item`), Zähler `.schublade-zahl` rechts. Aktiv: gleitende Pille (`DS.indicator`, folgt `aria-current` selbst) + 500 + `aria-current="page"`. Einträge sind echte Links. Hauptseite: je Modul zuerst seine «Übersicht», dann die Listen · «Geräte»: Übersicht, ADMIN-Clients, EDU-Clients · «Verzeichnis»: Übersicht, Benutzer, Telefonnummern, Software · «Videoüberwachung»: Übersicht, Kameras, Kamerarechte (`Rahmen.HAUPTZIELE`, einzige Quelle). Detailseiten: zuoberst der Zurück-Eintrag `.schublade-zurueck` («← ADMIN-Clients», Link zur gemerkten Liste), darunter die Bereiche des Datensatzes in Gruppen. |
| Ohne Schublade | `navigation({ verstecken: true })` → `[data-drawer-hidden]` | Neu-Formulare, Fehler- und Endzustand der Detailseiten: Tafel volle Breite, die Wortmarke bleibt an ihrer Stelle. |
| Tafel | `.ds-panel > main.ds-view#tafel[tabindex=-1]` | Weiss, Radius 20 oben, einziger Roller. |
| Ladebalken | `span.ds-loadbar#ladebalken` | Muster von Dashboard-Style: steht nur, solange die Seite lädt, in `.ds-content` vor der Bahn, erscheint nach `--ds-delay-loader` und geht mit `DS.motion.leave`. Kein statisches Markup. |
| Bahn | `.ds-content > .ds-page#inhalt` | Höchstens 1280 px (`--ds-content-max`), eine Spalte, 20 px Abstand; unten Platz für eine zweizeilige Meldung (`--bahn-unten`). Container `ds-content` (von Dashboard-Style): schmale Darstellungen richten sich nach der Bahn. `data-zustand="laden\|fehler\|ende"` blendet den Seiteninhalt aus (`.bahn-zustand`). |
| Meldungen | `div.ds-toasts` direkt nach `.ds-app` | genau eine Region je Seite, **ohne** `role` und `aria-live` (die Ansagen legt `DS.overlay.toast` selbst daneben an; Prüfung 12). |

### 3.2 Hauptseite (`index.html`)

- Ansichten `section.ansicht.ds-stack#ansicht-<n>` (Übersichten `geraete`, `verzeichnis`, `videoueberwachung`;
  Listen `admin`, `edu`, `benutzer`, `telefone`, `software`, `kameras`, `kamerarechte`), genau eine sichtbar. Der
  Hash trägt Ansicht und Zustand (`#admin?q=…`): Ansichtswechsel mit `pushState`, Filter, Sortierung und Spalten mit
  `replaceState`.
- Jede Ansicht beginnt mit einem Seitenkopf (h1 24/32, ohne Lead).
- **Tabellenansichten:** Werkzeugleiste `.ds-action-bar` (Suche · «Filter» · «Spalten» mit Zahl · «CSV» · rechts
  Trefferzahl und «Neuer …» – bei «Benutzer» keiner, die Liste pflegt der Abgleich), darunter die Chips aktiver
  Filter, darunter der Tabellenrahmen `.tabelle-rahmen` mit `table.ds-table.ds-table--interactive` (der Name ist der
  Zeilenlink `a.ds-table__row-link`; «Kompakte Zeilen» setzt `.ds-table--dense`). `Rahmen.fest(true)`: ab
  601 × 720 px rollt die Tafel nicht, die Liste füllt den Rest und rollt selbst (Kopf und erste Spalte kleben).
- **Übersicht**, je Modul eine (Geräte, Verzeichnis, Videoüberwachung; Inhalt aus `MODUL` in `app.js`):
  Handlungsbedarf (interaktive Karten mit Zahlmarke vor dem Titel, `UI.karte({ href, marke })`, Gefahr vor Warnung,
  bei Gefahr zusätzlich der Status «Dringend»; leer: Erfolgsbanner) · Bestand (eine Karte je Liste: Hauptzahl als
  Kachel, darunter klickbare Kennwerte) · Ersatzplanung (Zeitstrahl je Geräte- bzw. Kameraliste, wo das Modul eine
  hat) · Verteilungen. Jede Zahl und jede Karte des Handlungsbedarfs öffnet die passende Liste, schon gefiltert.
- **Software** und **Kamerarechte:** Suche, eine Karte je Programm bzw. Rolle (bei Software dazu «Neues Programm»).

### 3.3 Detailseiten (`client`, `benutzer`, `telefon`, `software`, `kamera`, `kamerarolle`)

In der Bahn stehen nur `header.ds-page-head#<p>-kopf` und `div.fenster-bereich#<p>-bereich` (Präfix `g`, `b`, `tf`,
`sw`, `km`, `kr`); alles andere baut das Gerüst `F` aus `fenster.js`.

| Teil | Regeln |
|---|---|
| Seitenkopf (`F.seitenkopf`) | Zurück-Link `.seitenkopf-pfad` («‹ ADMIN-Clients», Text-Knopf klein) zur **gemerkten Listenadresse samt Suche, Filtern und Sortierung** – nur, wo die Schublade ihn nicht trägt (Neu-Modus, Fehler- und Endzustand, Fenster ≤ 900 px); Titel h1; Teile-Zeile («Haus A / 1. OG · Latitude 5540 · …»); Status-Chips nur für Abweichungen; **Schnellaktionen rechts** als Text-Knöpfe mit Sinnbild, **«Löschen …» zuletzt**. Gesperrt mit Grund, solange etwas ungespeichert ist; die Knöpfe bleiben stehen, nur die Sperre wechselt (§4.4). |
| Bereich (`F.zeichneBereich`) | Karten im 20-px-Rhythmus (`.fenster-bereich`, `.ds-stack`, `.karten`, `.ds-grid-2`). Derselbe Bereich wird **still abgeglichen** (`DS.dom.morphChildren`, §4): Fokus, Schreibmarke, Rollstand, Tooltip und laufende Spinner bleiben, kein Auftritt spielt noch einmal. |
| Bereichswechsel (`F.bereichWechseln`) | Adresse per `replaceState` (`#stammdaten`), die Pille gleitet, Inhalt über `Rahmen.wechseln` (`DS.motion.transition`, «fade-through»), Raster staffeln. |
| Zustände | `F.zeigeLaden`, `F.ladefehler`/`F.zeigeFehler` (mit Zurück-Link, ohne Schublade), Endzustand nach dem Löschen mit «Zur Liste». |
| Unten | Speicherleiste (§7.5), Meldungen (§7.3). |

### 3.4 Breiten und Umbrüche

| Grenze | Verhalten |
|---|---|
| Fenster ≤ 1100 px | Kacheln 4 → 2 Spalten |
| Bahn ≤ 1040 / ≤ 520 px | genau vier Fakten: 2 × 2 / untereinander |
| Fenster ≤ 900 px | **Schublade modal** über `DS.overlay`: Menüknopf links im Kopf, Schleier, gleitet von links, Fokusfalle, Esc, schliesst bei Wahl. `.ds-grid-2` einspaltig. |
| Bahn ≤ 760 px (Dialog, Blatt: Fenster ≤ 760 px) | Formularraster einspaltig |
| Fenster ≤ 720 px | Konto als Initiale in der Kapsel (Tooltip mit Name und E-Mail, ein Tabstopp); Chip-Trenner weg |
| Bahn ≤ 600 px | Seitenkopf-Aktionen links unter dem Titel |
| Fenster ≤ 600 px | Tafel randlos (Oberkante bleibt rund); Wortmarke 16/24; Kartenpolster 16; Blatt volle Breite ohne Radius; Meldung über die ganze Breite; Speicherleiste 16 px vom Rand; Feldtext 16 px; Aktionen von Listenzeilen und Chips von Schalterzeilen rutschen unter den Text |
| unter 601 × 720 px | Tabellenansichten rollen mit der Tafel (§3.2) |
| Fenster ≤ 359 px (320 px, 400 % Zoom) | Kapsel nur mit «Abmelden» (Konto nur für Screenreader) |

---

## 4. Bausteine

Seiten bauen **nur** über `UI.*`, `Rahmen.*`, `Bewegung.*` und `F.*`. Für alle Bauer gilt: Sie geben einen DOM-Knoten
zurück, setzen Text nur per `textContent`, nehmen Optionen als Objekt, schreiben leere Werte als «–» und

- `fokus: 'schluessel'` setzt `data-fokus` – damit finden Abgleich und Rückfokus das Element wieder (jedes
  Bedienelement ohne `id` braucht es);
- `titel` ist der Tooltip, geschrieben als **`data-tip`** und gezeigt von `DS.overlay.tooltips`; wiederholt er nur
  den sichtbaren Text (gekürzte Namen, Chips, Tabellenzellen), steht er in **`data-tip-abgeschnitten`** und zeigt sich
  nur, solange der Text wirklich abgeschnitten ist (`UI.tipp` entscheidet das selbst). Nie das Browser-`title`;
- was sich an Ort und Stelle ändert, hat Methoden am Knoten (`.setzen()` …): umschalten, nicht neu bauen. Der
  Zustand steht dabei im DOM (Schalter: `data-an`, `.schalter-gesperrt`; Hinweisplatz: `data-hinweis-schluessel`),
  nicht in einer Closure, und Teil-ids sind stabil – ein abgeglichener Knoten trägt so immer den richtigen Zustand.

**Neu zeichnen heisst still abgleichen.** Wo ein Bereich, eine Liste oder ein Kopf nach Daten neu entsteht, werden die
Knoten frisch und abgehängt gebaut und mit `UI.abgleichen(behaelter, knoten)` (= `DS.dom.morphChildren`) dem Bestand
angeglichen – nie leeren und neu einhängen. Der Schlüssel eines Knotens ist `data-ds-key` (sonst die `id`); Zeilen,
Karten und Bedienelemente mit Zuhörer tragen einen, damit ein behaltener Knoten immer zum selben Datensatz gehört.
Behaltene Knoten behalten ihre Zuhörer vom ersten Bauen: Handler lesen den aktuellen Stand (Modulvariablen, Entwurf)
statt Werte einzuschliessen, oder der Behälter hört (Delegation), oder der Teilbaum trägt `data-ds-replace` (wird dann
ersetzt statt gepatcht). Ein Knoten aus einem Bereich ist nur bis zum nächsten `F.zeichneBereich` der gezeigte: wer
später nachführt, sucht ihn über `id` bzw. `data-fokus`. Einzelheiten: Kopfkommentare von `bausteine.js`
(`UI.abgleichen`, `UI.kinderAbgleichen`), `rahmen.js` (`Rahmen.stillZeichnen`) und `fenster.js`.

### 4.1 Gemeinsame Bausteine: Bauer → Dashboard-Style

Aussehen, Masse und Zustände stehen in [docs/components.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/components.md).

| Bauer | Markup / Dashboard-Style | Hinweise für ICT |
|---|---|---|
| `UI.knopf({ text, variante, sinnbild, klein, weiter, titel, label, gedrueckt, deaktiviert, gesperrt, beschaeftigt, fertig, href, fokus, … })` | `.ds-btn` + `--primary` / `--tonal` / `--text` (`'leise'`) / `--quiet` (`'still'`) / `--icon` (`'sinnbild'`) / `--disc` (`'scheibe'`) / `--sm` (`klein`) | genau **eine** gefüllte Hauptaktion je Bereich; keine roten Knöpfe; «…» am Ende heisst Rückfrage folgt; `weiter: true` hängt einen Pfeil an (er bewegt sich beim Hover nicht); gedrückt = `aria-pressed`; `beschaeftigt: 'Wird gespeichert …'`/`fertig: 'Gespeichert'` bauen die Gesichter schon beim Bauen, der Knopf springt dann nie in der Breite |
| `UI.beschaeftigt(knopf, arbeit, { text, fertig })` → Promise, `UI.knopfSperren(knopf, grund)` | `[aria-busy]` + `.ds-btn__faces` über `DS.motion.busy`; `[aria-disabled]` | **gesperrt mit Grund** bleibt fokussierbar, der Tooltip nennt den Grund, Klicks schluckt `bausteine.js` – immer so für Schnellaktionen. Beschäftigt: `aria-busy` sofort, das Gesicht mit Spinner erst nach `--ds-delay-loader`, dann mindestens `--ds-hold-loader`; mit `fertig` danach das Erfolgsgesicht für `--ds-hold-success`. Scheitert `arbeit`, ist der Knopf sofort frei und das Promise verworfen; das Ergebnis meldet die Seite (`UI.meldung`) |
| `UI.status(text, ton, { sinnbild, titel })` | `.ds-status` + `--ok` / `--warning` / `--error` / `--running` | Töne `erfolg`, `warnung`, `gefahr`, `neutral`, `laeuft`, `wartet` (Uhr), `aus` (Verbot); `.setzen()` lässt Farbe und Sinnbild gleiten. Der **Normalfall bekommt keinen Chip** (§4.3); «Frei» (Telefonnummer) ist neutral mit `checkKreis` |
| `UI.banner({ titel, text, ton, knopf, rolle })` | `.ds-alert` + `--success` / `--warning` / `--error` | `info` neutral, nie blau; Rolle `alert` bei `gefahr`, sonst `status`, `null` = keine; Knöpfe kompakt (`.ds-btn--sm`), mehrere in `.banner-knoepfe` (§5); Kommen und Gehen über `Bewegung.umordnen` |
| `UI.leerzustand({ sinnbild, titel, text, aktion })` | `.ds-empty` | höchstens ein Satz, höchstens eine Aktion (tonal) |
| `UI.hinweis`, `UI.meta`, `UI.teile` | `p.ds-muted`, `p.ds-meta`, `.ds-parts` | |
| `UI.spinner(klein, { verzoegert })`, `UI.ladezeile`, `UI.skelettSeite`, `UI.fortschritt({ anteil, text, detail, unbestimmt, wartet, flach })` | `.ds-spinner(--sm)`, `.ds-loading` mit `.ds-loader--sm`, `.ds-skeleton`, `.ds-progress` (`--indeterminate`, `--waiting`, `--flat`) | Ladeanzeigen erst nach `--ds-delay-loader`, dann mindestens `--ds-hold-loader` (`Bewegung.ladeAbwarten` = `DS.motion.settleLoader`); der Bogen-Spinner steht nur in Knopf, Status-Chip oder `.ds-loading`, frei nur mit `verzoegert`; `--ds-progress` steht auf `.ds-progress`; `flach` für dichte Zellen |
| `UI.karte({ titel, unter, aktionen, fuss, sinnbild, breit, gefuellt, ebene, href, beiKlick, fokus, marke })` | `section.ds-card` (`--filled`, `--interactive` mit `.ds-card__action`), `.ds-card__row`, `__title`, `__links`; dazu die ICT-Hilfen `.karte-inhalt`, `.karte-kopf-aktionen`, `.karte-marke` | `unter` nur, wo er Nicht-Offensichtliches sagt; Zwischentitel `.ds-card__subtitle`, Teil `.ds-subsection`. Mit `href`/`beiKlick` öffnet die ganze Karte etwas (der Titel wird Link bzw. Knopf, Aktionen darin bleiben bedienbar); `marke: UI.zahlmarke(n, ton)` setzt die Zahlmarke vor den Titel (Handlungsbedarf) |
| `UI.kachel({ text, wert, unter, ton, zahl, schluessel, beiKlick, href, … })`, `UI.kacheln` | `.ds-tiles > .ds-tile` (als `button`/`a` klickbar) | **die Zahl wird nie gefärbt**; `ton` setzt nur ein Sinnbild; `zahl` ist der Rohwert fürs Hochzählen beim ersten Zeigen (am Knoten gemerkt, nicht im Markup), gezählt im Format von `wert`; mit `schluessel` (`data-ds-key`) zählt sie nach einem stillen Neuzeichnen vom gezeigten Wert (`Bewegung.kennzahlenStill`) |
| `UI.kennwerte`, `UI.fakten` | `ul.ds-kv-list`, `dl.ds-facts` | klickbare Kennwerte: `.kennwerte-klickbar` (§4.2) |
| `UI.feld`, `UI.eingabe`, `UI.feldFehler`, `UI.ankreuzen` | `.ds-field`, `.ds-input` (`--filled`), `.ds-field__hint(--error)`, `.ds-check(--sm)` | Beschriftung immer **über** dem Feld; Raster `.ds-form-grid--2/--3`, `.ds-field--full`, Reihe `.ds-inline-form`, Aktionszeile `.ds-form-actions` |
| `UI.suchfeld({ kuerzel: '/', … })` | `.ds-search` + `kbd.kuerzel` | Esc leert eine gefüllte Suche (und nur das) |
| `UI.schalter`, `UI.schalterZeile` | `label.ds-switch` mit `input[type=checkbox][role=switch]`, `.ds-switch__label`, `.ds-switch__state` | ein Klick schaltet an Ort und Stelle um, der Griff gleitet; die Sperre mit Schloss ist ICT-eigen (§4.2) |
| `UI.chip({ text, gewaehlt, art: 'kaestchen'\|'radio', name, wert, beiKlick, … })`, `UI.chips(chips, { legende })` | `label.ds-chip` (`input.ds-chip__input` + `.ds-chip__body` mit Haken); `fieldset.ds-chips` mit `legend.ds-sr` bzw. `div.ds-chips` | Umschalt-Chip mit `gewaehlt`; `art: 'radio'` = genau einer der Gruppe. Eine Reihe ohne Umschalt-Chip ist `div.chip-zeile` (ICT, §4.2); Chips mit × und Aktions-Chips sind ICT-eigen |
| `UI.tabelle` | `.ds-table-wrap > table.ds-table` | schlicht in Karten; die Randblende beim seitlichen Rollen kommt von Dashboard-Style |
| `UI.tabellenKopf` | `th[aria-sort]` mit `.ds-table__sort`, `.ds-table__sort-arrow`; `.ds-table--dense` | `thead` einmal bauen, `sortierungSetzen` nachführen; der Pfeil steht nur an der sortierten Spalte und dreht sich für «ab» über `aria-sort` |
| `UI.tabellenRahmen(table, { vorNeuemTab })` | `table.ds-table--interactive` mit `a.ds-table__row-link` | klickbare Zeilen nur so (§4.3); der Rahmen selbst ist ICT-eigen (§4.2) |
| `UI.sinnbild(name, groesse, klasse)` | `<svg class="icon">` aus `DS.icons.iconElement` | `UI.SINNBILDER` ordnet die deutschen Namen den Glyphen von `DS.icons` zu; ein neues Sinnbild kommt zuerst in Dashboard-Style, dann hier ein deutscher Name. Grössen: 20 Navigation/Icon-Knöpfe/Banner, 16 in Knöpfen/Status-Chips/Listen, 18 in Chips (führendes Sinnbild, Häkchen, ×), 24 Leerzustand. Unbekannter Name → `console.error` |
| `Rahmen.*`, `UI.dialog`, `UI.bestaetigen`, `UI.blatt`, `UI.meldung`, `UI.tipp` | `.ds-app`, `.ds-topbar`, `.ds-drawer`, `.ds-panel`, `.ds-view`, `.ds-page-head`, `dialog.ds-dialog`, `dialog.ds-sheet`, `.ds-toasts > .ds-toast`, `[data-tip]` (→ `.ds-tooltip`) | §3, §7 |

### 4.2 Bausteine, die es nur in ICT-Inventar gibt

Klassen in `bausteine.css` (Bausteine) und `rahmen.css` (Rahmen und Überlagerungen), gebaut von denselben Bauern. Sie
folgen denselben Regeln wie Dashboard-Style, lesen nur `--ds-*`-Tokens und die ICT-Tokens aus §2.2 und nutzen darunter
das Druckmodell von Dashboard-Style: drückbare ICT-Bausteine tragen `data-ds-ripple` (Welle und `.ds-pressed` von
`DS.ripple`), die Zustandsebene in der Inhaltsfarbe, Druck in `--ds-dur-micro`, und gesperrt über `--ds-disabled-*`.

| Baustein | Klassen | Bauer | Warum eigen |
|---|---|---|---|
| Wortmarke | `.wortmarke`, `.wortmarke-punkt` | `rahmen.js` | Zeichen des Inventars: Archivo 650, 112 % breit, Versalien, Punkt in `--campus-gruen`; steht auf der linken **Kante** der Navigationssinnbilder (eine Textmarke hat keine Achse) |
| Konto-Kapsel | `.kopf-konto`, `.kopf-konto-trenner`, `.kopf-abmelden` | `Rahmen.konto`, `Rahmen.abmelden` | Konto und «Abmelden» in einer Pille |
| Schublade: Zurück, Zähler | `.schublade-zurueck`, `.schublade-eintrag-zurueck`, `.schublade-zahl` | `Rahmen.navigation` | Detailseiten führen zur gemerkten Liste zurück |
| Seitenkopf-Zusätze | `.seitenkopf-pfad`, `-zeile`, `-text`, `-unter`, `-status`, `-aktionen` | `UI.seitenkopf`, `F.seitenkopf` | Zurück-Link, Status und Schnellaktionen neben dem Titel; `F.seitenkopf` gleicht an Ort und Stelle ab (Kopfaktionen nur mit `beiKlick`, gesperrt über `gesperrt:` bzw. `F.beschaeftigt`) |
| Zustände der Seite | `.bahn-zustand`, `.bahn-vorfuehrung`, `.zustand-laden`, `.zustand-fortschritt`, `.rollwaechter` | `Rahmen.zustand`, `Rahmen.vorfuehrung` | Laden, Fehler, Ende, Vorführband; Wächter für `data-scrolled` |
| Detailbereich | `.fenster-bereich` | `F.zeichneBereich` | Gerüst der Detailseiten |
| Speicherleiste | `.speicherleiste*` | `F.speicherleisteZeichnen`, `UI.speicherleiste` | genau ein Speicherweg (§7.5) |
| Rollflächen in Dialog und Blatt | `.dialog-inhalt`, `.dialog-liste`, `.dialog-breit`, `.blatt-unter`, `.blatt-fuss`, `.meldung-aktion` | `UI.dialog`, `UI.blatt`, `UI.meldung` | nur der Inhalt rollt, Unterzeile und Fusszeile im Blatt, Aktion in der Meldung (§5, §7) |
| Chips mit ×, Aktions-Chip, Reihe, Zähler | `.chip`, `.chip-entfernbar`, `.chip-x`, `.chip-text`, `.chip-zeile`, `.zaehler(-still)` | `UI.chip({ entfernen })` bzw. `UI.chip({ href \| beiKlick })` ohne `gewaehlt`, `UI.chips`, `UI.zaehler` | Dashboard-Style hat nur Chips auf Kästchen; ICT braucht entfernbare aktive Filter («Hersteller: HP ×») und Chips, die eine Seite öffnen. Masse, Druck und gesperrt wie `.ds-chip`. Zähler ploppt nur von leer auf eine Zahl |
| Karte mit Zahlmarke | `.karte-marke`, `.zahlmarke` | `UI.karte({ marke })`, `UI.zahlmarke` | Handlungsbedarf: Zahlmarke tonal nach Dringlichkeit vor Titel und Beschreibung |
| Datenzeilen | `.datenzeilen`, `.datenzeile*`, `.schloss`, `.geaendert` | `UI.datenzeilen`, `UI.feldZeile`, `UI.formZeile`, `F.feld` | Name/Wert-Zeilen zum Lesen und Bearbeiten; Schloss «Vom Abgleich gesetzt.»; geändert = Punkt + «(geändert)» |
| Hinweisliste | `.hinweise`, `.hinweis-zeile*` | `UI.hinweise`, `UI.hinweisZeile` | der Ton färbt nur das Sinnbild |
| Formular-Zusätze | `.eingabe-schmal`, `.mit-sinnbild`, `.hinweis-platz`, `.mehrfach` | `UI.eingabe({ schmal })`, `UI.feldHinweis`, `UI.hinweisPlatz`, `UI.mehrfach` | schmale Felder, Live-Hinweis, Kästchenliste mit Zahlen |
| Schalter mit Sperre, Schalterzeile | `.schalter-gesperrt`, `.schalter-schloss`, `.schalter-zeile`, `.schalter-feld`, `-name`, `-text`, `-unter`, `-zusatz` | `UI.schalter`, `UI.schalterZeile` | an und gesperrt (Schloss im Griff, `aria-disabled`, Tooltip nennt die AD-Gruppe); `.ds-switch` kennt die Sperre nicht |
| Liste über die ganze Seite | `.tabelle-rahmen`, `.tabelle-kopf-text`, `.name-link` | `UI.tabellenRahmen`, `UI.rollKanten` | eigener Roller, Kopf und erste Spalte kleben, Blende nur bei mehr Spalten rechts. Weil die klebende erste Spalte den Zeilenlink von Dashboard-Style auf ihre Zelle begrenzt, reicht der Rahmen einen Klick in eine Zelle an den Zeilenlink weiter (Ctrl-, Shift- und Mittelklick: neuer Tab; nicht bei markiertem Text); die Welle ist dort aus (`data-ds-ripple="off"`) |
| Zeilenliste | `.zeilenliste`, `.listen-zeile*` | `UI.listenZeile`, `UI.zeilenliste` | ganze Zeile klickbar mit Pfeil und Welle, solange sie keine Aktionen hat |
| Zeitachse | `.zeitachse*` | `UI.zeitachse` | Grundlage des Verlaufs; automatische Einträge grau mit `sync` |
| Balken, Säulen, Verteilung | `.balken*`, `.saeulen`, `.saeule*`, `.verteilung*`, `.kennwert*`, `.kennwerte-klickbar` | `UI.balken`, `UI.saeulen`, `UI.verteilung`, `UI.kennwerte` | Anteil als `scaleX`/`scaleY` über `--anteil`; Farben nur `--diagramm-*`; wachsen nur beim ersten Zeigen (`.ds-enter--fill-x/-y`) |
| Verlauf | `verlauf.css` (`vl-*`) | `Verlauf.zeichnen` (`verlauf.js`) | genau eine Karte «Verlauf»; gespeichert wird über den Entwurf und die Speicherleiste |
| Hilfen | `.icon`, `.t-erfolg/-warnung/-gefahr/-info/-leise/-still/-stark`, `.kuerzel`, `.code-block`, `.anzahl` | – | Tonklassen nur zusammen mit Sinnbild oder Wort |

### 4.3 Regeln, die für ICT dazukommen

- **Knöpfe:** Im Dialog zuerst «Abbrechen» (Text), dann rechts die Hauptaktion, die die Folge nennt («Archivieren»,
  «Löschen»). `deaktiviert` (`disabled`) nur ohne erklärbaren Grund, sonst `gesperrt: 'Grund'`.
- **Status-Chips nur für Abweichungen** («Archiviert», «Im Lager», «Ersatz überfällig», «Nicht in SCCM», «Nicht
  zugewiesen», «Gerät fehlt»). Der Normalfall steht als Text, als Teil der Teile-Zeile oder als Meta-Zeile – kein
  Chip für «Online», «In SCCM», «AD-Konto aktiv», «Im Plan», «Erfolgreich», «Sauber», neutrale AD-Gruppen, «Inhaber»
  oder «Administratoren». **Bewusste Ausnahme** (Entscheid vom 19.10.2026): das geplante Ersatzjahr in den Listen steht
  immer als Chip in der Farbe seines Ersatzstatus – überfällig rot, im laufenden Geschäftsjahr gelb (mit Kalender),
  später grün; das Statuswort («Überfällig» …) steht als `.ds-sr` im Chip und im Tooltip. Ebenfalls Chips sind die Stufen der Programmspalten in der Benutzerliste («An», «AD» mit Schloss): sie
  sind der Wert der Zelle. Mit `titel` wird ein Chip ein Tabstopp – darum `titel` nur, wo er etwas sagt. Zeilen werden nie
  getönt. Der Zustand eines AD-Kontos kommt immer aus `Modell.adStatus(b)`.
- **Formulare:** Felder einer Detailseite nur über `F.feld` (id `<p>-eingabe-<Feld>`, Wert aus dem Entwurf, Punkt
  «geändert», Feldfehler aus dem Speicherablauf) – Kästchen eingeschlossen. Eine ganze Zahl, die der Browser umdeuten
  könnte, ist ein Textfeld mit `inputMode = 'numeric'`, und `pruefen()` hält alles andere mit einem Feldfehler auf.
- **Tabellen:** Klickbare Zeilen sind `table.ds-table--interactive` mit genau einem `a.ds-table__row-link` je Zeile
  (dem Namen); ein Klick öffnet im selben Tab, Ctrl-/Mittelklick in einem neuen. Zeilen tragen `data-ds-key`;
  Sortieren, Suchen und Filtern lassen sie gleiten (§6.2), Zahlen in Tabellenzellen zählen nie. Leere Liste: Rahmen
  `hidden`, Leerzustand zeigen.
- **Schalter:** ein Klick schaltet an Ort und Stelle um; `beiWechsel` → `false`, abgelehntes Promise oder Fehler setzt
  zurück. Nie neu bauen, um umzuschalten – `.setzen()`.

### 4.4 Seitenkopf
`UI.seitenkopf({ titel, lead, unter, status, aktionen, pfad, ebene = 1, id, titelId, element })` → `.setzen({ … })`;
auf Detailseiten **`F.seitenkopf`**. Titel 24/32 (h1, `tabindex=-1` als Fokusziel), Teile-Zeile leise, Status-Chips
8 px darunter, Aktionen rechts (Bahn ≤ 600 px: darunter). Ein Text-Knopf hängt sein Polster in den Rand und fluchtet
mit Titel und Karten. `F.seitenkopf` gleicht Teile, Status und Knöpfe ab (Schlüssel aus `data-fokus`, `id` oder
Text): ein bleibender Status-Chip spielt seinen Auftritt nicht noch einmal, und wechselt nur die Sperre eines
Kopfknopfs (Tippen, Speichern, Verwerfen, `F.beschaeftigt`), schaltet der stehende Knopf sie an Ort und Stelle um –
ein Fokus darauf bleibt.

---

## 5. Abweichungen von Dashboard-Style

Jede Abweichung steht mit Grund am Ort im Code (`bausteine.css` Abschnitt 1, `rahmen.css`). Sie gewinnt, weil das
eigene CSS ohne Kaskaden-Ebene steht (§1) – nie über Spezifitäts-Kniffe oder `!important`, und wo es geht über einen
Hook von Dashboard-Style. Neue Abweichungen nur mit Grund – und lieber in Dashboard-Style selbst, wenn sie für jedes
Projekt gelten (§11).

| Thema | Dashboard-Style | ICT-Inventar | Warum |
|---|---|---|---|
| Thema | neutral, Google-Blau | Campus-Grün, getönter Grund (§2) | Erscheinungsbild von Campus Sursee |
| Markenzeichen | `.ds-brand`: 32-px-Logo auf der Achse der Navigationssinnbilder | Wortmarke auf ihrer **Kante** (`--sinnbild-kante`) | eine Textmarke hat keine Achse |
| Stapel | `.ds-stack` 16 px (20 px nur direkt in `.ds-page`) | 20 px auch verschachtelt, in Karten 16 px | Bereiche der Detailseiten sind Stapel in einem Stapel |
| Banner mit Knöpfen | ein Knopf rechts | Knopf kompakt (32 px), auch mehrere (`.banner-knoepfe`), rutscht unter den Text, wenn dieser schmaler als 8em würde | lange Warnungen mit Handlung |
| Kachelwert | schrumpft mit der Kachel | dazu «…», wenn er auch verkleinert nicht passt | Texte statt Zahlen in Kacheln |
| Datumsfeld unter 720 px | Polster 8 px (zwei Daten nebeneinander auf 320 px) | 12 px wie jedes Feld | die Datumsfelder der Seiten stehen einzeln; der Wert bleibt auf der Kante der übrigen Felder |
| Knopf mit Gesichtern und Sinnbild vorne | kürzeres Polster nur, wenn das Sinnbild direktes Kind des Knopfs ist | kürzeres Polster (12 px) auch in den Gesichtern von `DS.motion.busy` (Hook `--ds-btn-padding-start`) | Kopfaktionen mit Sinnbild springen sonst beim Bauen der Gesichter |
| Knopf, der ein Blatt öffnet | tonal nur mit `aria-pressed` | tonal, solange `aria-expanded="true"` (über die Hooks von `.ds-btn`) | «Filter» und «Spalten» schalten nichts um; `aria-pressed` wäre für den Screenreader falsch |
| Zeilenliste im ersten Auftritt | Eintritt in der Standarddauer | `--ds-enter-duration: var(--ds-dur-fast)` auf den Einträgen | Listen sind länger als Kartenraster |
| Kennwerte | Polster auch unter der letzten Zeile | unten ohne Polster, lange Namen brechen | oft der letzte Block einer Karte |
| Dialog | die ganze Fläche rollt | nur der Inhalt zwischen Titel und Knöpfen rollt (`.dialog-inhalt`, `.dialog-liste`) | «Abbrechen» darf nie unter den Rand rutschen |
| Seitenblatt | Kopf und Körper | dazu Unterzeile (live, «47 von 163») und klebende Fusszeile (`.blatt-fuss`) | Filter- und Spaltenblatt |
| Aktion in der Meldung | Knopf in der Meldung wie jeder Knopf | Text-Knopf in `--ds-inverse-primary` (`.meldung-aktion`) | Aktion («Neu laden») hebt sich auf der dunklen Meldung ab, wie Material es vorsieht |
| Schleier von Dialog und Blatt | ein Klick auf den Schleier schliesst | schliesst nur mit einem eigenen einfachen Klick: nicht mit dem zweiten Klick eines Doppelklicks und nicht in den ersten 300 ms (`rahmen.js`) | der Doppelklick, der eine Ebene öffnet, schlösse sie sonst gleich wieder |

Das Übrige, das früher hier stand (eigener Ladebalken, eigene Randblende der Tabelle in einer Karte, eigene
Seitenübergänge, eigene Meldungen über der Speicherleiste, Filter-Chips und Schalter als Knöpfe, 14 px Feldtext auf
dem Telefon), läuft heute über Dashboard-Style bzw. dessen Hooks und ist keine Abweichung mehr.

**Sichtbar anders als vor der Umstellung auf Dashboard-Style 1.6.2** (bewusst; geprüft mit Bildschirmfotos aller
Seiten im Vorführmodus):

- **Felder auf dem Telefon:** Feldtext 16 px wie in Dashboard-Style (iOS zoomt sonst); Suchfelder und Textbereiche
  sind dort etwas höher.
- **Kartentitel** wieder 16 px; Dialog- und Blatttitel in der Titelrolle von Dashboard-Style (`grund.css`).
- **Speichern-Knopf** von Anfang an so breit wie «Wird gespeichert …» (Gesichter von `DS.motion.busy`).
- **Handlungsbedarf** als interaktive Karten mit Zahlmarke statt als Zeilenliste; die Karten sind höher (bei 1440 px
  zwei statt drei Spalten).
- **Status-Chips** für den Normalfall sind weg (§4.3); AD-Gruppen in Software und Kamerarechte stehen als Meta-Zeile.
- **Meldungen** stehen 24 px vom Rand und bleiben mit Aktion stehen, bis man sie nutzt oder schliesst; ihre Lesezeit
  rechnet Dashboard-Style aus der Länge.
- **Styleguide, Abschnitt «Grundlagen»:** zeigt Fassung, Ort und Links von Dashboard-Style und die Tokens unter ihren
  `--ds-*`-Namen.
- **Schriften:** Google Sans und Archivo kommen selbst gehostet mit allen Achsen.
- **Druck:** Der Inhalt läuft bis an den rechten Papierrand.

---

## 6. Bewegung

Regeln, Tokens, Keyframes und Hilfsklassen sind die von Dashboard-Style
([docs/motion.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/motion.md)). Kurz: Federn
(`--ds-ease-spatial`, leichtes Überschwingen) nur für frei Bewegtes (Pille, Schaltergriff, Blatt, Schublade, Dialog,
Gleiten von Zeilen); Wirkungen (Deckkraft, Farbe, Werte) auf Material-Kurven ohne Überschwingen; Grössen, die das
Layout schieben, auf `--ds-ease-out`; Hover bewegt nie etwas und steht in `@media (hover: hover)`; ein Druck ist Welle,
Ebene und Form; eine Unterbrechung macht vom aktuellen Stand weiter; Daten gleiten (Werte zählen vom gezeigten Wert,
Umordnungen per FLIP) und spielen nie einen Auftritt neu; Fokusringe sofort. **Bewegung ist auf jedem Gerät gleich** –
es gibt keine reduzierte Fassung und keinen Schalter dafür, auch nicht im eigenen Code (Prüfung 11 sperrt
`prefers-reduced-motion`). Dauern sind `calc()`-Tokens: im Code nur über `DS.motion` bzw. `Bewegung.*` lesen, nie als
Zahl im eigenen Code.

**`@keyframes` stehen nur in `vendor/dashboard-style/css/motion.css`** (und seinem Bündel `ds.css`) – nie im eigenen
CSS, JS oder HTML. Das eigene CSS nennt sie nur beim Namen (`ds-fade-in` …). Wiederholt Ein- und Ausgeblendetes läuft
über `DS.overlay` (Dialog, Blatt, Schublade) oder `.ds-presence`, Einmaliges über `.ds-enter`/`.ds-leave` bzw.
`Bewegung.eintreten`/`austreten` – nie beides auf einem Element.

Balken und Säulen, die beim ersten Zeigen wachsen, laufen über `ds-fill-x`/`ds-fill-y` mit `.ds-enter--fill-x`/
`--fill-y`. Diese sind dafür in Dashboard-Style aufgenommen worden: wachsende Balken braucht jedes Dashboard, und
Keyframes dürfen nur an einem Ort stehen. Ein Übergang (`transition`) hätte nicht gereicht – er spielt nur bei einer
Wertänderung, nicht beim ersten Zeichnen.

### 6.1 `Bewegung.*` (in `bausteine.js`, über `DS.motion` und `DS.indicator`)

Jede Funktion reicht an genau eine Funktion von Dashboard-Style weiter; Zeiten, Kurven, Unterbrechung, `inert` und
Fokus regelt Dashboard-Style.

| Aufruf | Dashboard-Style | Zweck |
|---|---|---|
| `eintreten(el, variante)` → Promise | `enter` | Varianten `blenden`, `skalieren`, `schieben`, `tausch`, `verzoegert`, `ploppen`, `aufziehen`, `aufrichten` (= `fade`, `scale`, `slide`, `swap`, `delayed`, `pop`, `fill-x`, `fill-y`); hebt `hidden` und `inert` auf |
| `austreten(el, variante, { dann: 'entfernen'\|'verbergen'\|'behalten', fokus })` → Promise | `leave` | Varianten `sinken`, `skalieren`, `schieben`, `ploppen`; ein Fokus darin geht vorher auf `fokus`, sonst zum Auslöser |
| `abbrechen(el)` | `cancel` | laufende Bewegung beenden |
| `aufdecken(el)` → Promise | `cancel` + `enter('swap')` | frischer Inhalt ersetzt einen Platzhalter |
| `auftritt(behaelter, { wurzel })` | `staggerOnce`, `countUp` | erster Auftritt einer Ansicht: staffelt `.karten`, `.ds-grid-2`, `.ds-stack`, `.ds-tiles`, `.zeilenliste` (nur einmal, nur Sichtbares), zählt Kacheln hoch, zieht Balken auf |
| `hochzaehlen(el, ziel, { format, dauer, von })` → `{ cancel(), finished }` | `countUp` | zählt vom gezeigten Wert, Standardformat de-CH («1’284») |
| `kennzahlenStill(wurzel, zeichnen)` | `countUp` | stilles Neuzeichnen mit Kennzahlen: Kacheln mit `schluessel` und `zahl` zählen vom gezeigten zum neuen Wert |
| `aufziehen(behaelter)` | `enter('fill-x'/'fill-y')` | Balken und Säulen wachsen einmal |
| `ladeAbwarten(start, { element, verzoegerung, mindestens })` → Promise | `settleLoader` | eine sichtbar gewordene Ladeanzeige hält ihre Mindestzeit |
| `umordnen(behaelter, aendern(o), { eintraege, live, max, halten })` → Promise | `flip` | Einträge gleiten an ihren Platz, neue blenden ein, entfernte aus; Muster `Bewegung.umordnen(liste, o => UI.abgleichen(liste, neu, o))`; `live: true` hält eine Umordnung aus Abfragedaten an, solange Zeiger oder Fokus in der Liste sind |
| `wechseln(aktualisieren, { art: 'durchblenden'\|'vor'\|'zurueck'\|'behaelter', von })` → Promise | `transition` | nur Navigation, nie Daten |
| `abgeschlossen(el, { zeit, ereignis, eigenschaft, … })` → Promise | `settled` | Hilfe für eigene Abläufe; ohne `zeit` rechnet Dashboard-Style die Frist |
| `indikator(spur, { aktiv, klasse, beobachten, name })` | `DS.indicator.createIndicator` | gleitende Pille; folgt `aria-current`/`-pressed`/`-selected`/`-checked` selbst |

Seiten brauchen davon fast nur `aufdecken`, `austreten`, `umordnen` und `kennzahlenStill`.

### 6.2 Wann Auftritt, wann Gleiten, wann nichts

| Anlass | Aufruf | Bewegung |
|---|---|---|
| erster Inhalt nach dem Laden | `await Rahmen.zustand('inhalt')` | Aufdecken + Staffeln + Hochzählen + Balken, **einmal** |
| Ansichtswechsel Hauptseite | `Rahmen.wechseln(fn)` | `DS.motion.transition` («fade-through») + Staffeln |
| Bereichswechsel Detailseite | `F.bereichWechseln(bereiche, k)` | wie der Ansichtswechsel |
| Banner oder Hinweis, der durch eine Eingabe kommt oder geht | `UI.hinweisPlatz().setzen(…, { ausEingabe: true })`, sonst `Bewegung.umordnen(stapel, …)` | FLIP auf seinem Stapel: er blendet ein bzw. aus, was darunter steht, **gleitet** (Dashboard-Style, Alert); nie `aufdecken` pro Tastendruck |
| Ergebnis einer Wahl (Dialog, Knopf), das seinen Platzhalter ersetzt | `Bewegung.aufdecken(el)` | Tausch-Eintritt |
| Element, das die Person entfernt | `Bewegung.austreten(el, 'skalieren')` | kurz, beschleunigend |
| Sortieren, Suchen, Filtern, Chip entfernen | Zeichenfunktion mit `Bewegung.umordnen` | Zeilen, Karten und Chips **gleiten** an ihren neuen Platz, neue blenden ein |
| Tippen, Schalter, nach dem Speichern | `F.zeichneBereich`, `.setzen()` | kein Auftritt; nur, was der Baustein selbst tut (Griff gleitet, Status-Ton gleitet) |
| Auto-Nachladen, BroadcastChannel | `Rahmen.stillZeichnen`, `F.zeichneBereich`, `Bewegung.umordnen({ live: true })`, `Bewegung.kennzahlenStill` | kein Auftritt, kein `Rahmen.zustand`; Umordnungen warten, solange Zeiger oder Fokus in der Liste sind; Kennzahlen zählen vom gezeigten Wert |
| Seitenwechsel zwischen den HTML-Seiten | `css/optional/view-transitions.css` von Dashboard-Style | Kopf und Schublade bleiben stehen, die alte Ansicht geht kurz, die neue blendet ein und wächst |

**Nie** `Bewegung.auftritt`, `eintreten` oder `aufdecken` in einer Zeichenfunktion aufrufen, die auch das Nachladen
benutzt. Der Seitenwechsel braucht, dass das erste Bild auf den gebauten Rahmen wartet: `<link rel="expect"
href="#rahmen-gebaut" blocking="render">` im Kopf, `<div id="rahmen-gebaut" hidden>` direkt nach `rahmen.js` (§10.1);
sonst zeigt Chrome eine halb geparste Seite und bricht den Übergang ab.

---

## 7. Überlagerungen

Dialog, Blatt, modale Schublade und Meldungen öffnen und schliessen **nur über `DS.overlay`**, im Markup von
Dashboard-Style: natives `<dialog class="ds-dialog">` bzw. `<dialog class="ds-sheet">`, die Schublade
`nav.ds-drawer`, die Region `.ds-toasts`. Dashboard-Style regelt Fokus hinein und zurück zum Auslöser (nie auf
`body`), Fokusfalle und `inert`, die gemeinsame Esc-Reihenfolge (erst der Tooltip, dann die oberste Ebene), die
gezählte Bildlaufsperre und den z-Stapel; Meldungen wandern in einen offenen Dialog bzw. ein offenes Blatt. Die deutschen Hüllen
legen nur dazu, was Dashboard-Style nicht hat:

- `sperren(true)` während einer Arbeit: dann schliessen weder Esc noch Schleier noch `[data-close]`;
- `beiSchliessen(grund)` mit `'esc'`, `'schleier'`, `'knopf'`, `'schliessen'` oder dem Grund der Seite;
- Rückfokus an ein **neu gezeichnetes** Gegenstück des Auslösers (über `data-fokus` oder `id`);
- der Schleier schliesst nur mit einem eigenen einfachen Klick (§5);
- `UI.ebeneOffen()`: synchrone Abfrage «ist eine Überlagerung offen» (aus dem DOM), die die Tastenkürzel der Seiten
  (Esc, Ctrl+S, `/`) fragen.

### 7.1 Dialog
`UI.dialog({ titel, inhalt, knoepfe, breit, rolle, fokus, beschreibung, beiSchliessen, klasse })` · `UI.bestaetigen({ titel, text, ja, nein = 'Abbrechen', breit })` → `Promise<boolean>`
- `dialog.ds-dialog`; 400 px für Fragen, `breit` 560 px für Listen und Formulare. Text nennt die Folge.
- **Eine Rollfläche:** nur der Inhalt zwischen Titel und Knöpfen rollt (§5). Eine Trefferliste trägt `.dialog-liste`:
  sie rollt selbst und nimmt die Resthöhe; reicht diese nicht für gut eine Zeile, rollt der ganze Inhalt, und das
  Suchfeld klebt oben (`data-knapp`). Nie eine eigene Höchsthöhe in der Seiten-CSS.
- Fokus startet auf `fokus`, sonst im ersten Feld, sonst auf dem ersten Knopf; `UI.bestaetigen` (`alertdialog`)
  startet auf «Abbrechen» und löst bei Esc, Schleier und «Abbrechen» mit `false` auf. Nie `window.confirm` oder
  `alert`.
- Arbeit aus einem Dialog: `F.imDialog(dialog, knopf, arbeit, { fehlerText, grund, nachladen })` – Knopf beschäftigt,
  die übrigen gesperrt, Dialog gesperrt; gelungen schliesst er, gescheitert bleibt er offen mit Fehlermeldung.
- Löschen mit Namenseingabe: `F.loeschenDialog({ titel, text, warnung, wort, knopfText = 'Löschen', beiLoeschen, ende })`.
  Text auf allen Seiten: «Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage
  lang zurückholen.»

### 7.2 Seitenblatt
`UI.blatt({ titel, unter, inhalt, fuss, breite: 560|720, beiSchliessen, klasse })`
- `dialog.ds-sheet` von rechts; Kopf mit Titel, optional Unterzeile (`.blatt-unter`, live), × (`[data-close]`); der
  Fokus startet auf ×. Fusszeile `.blatt-fuss` bleibt stehen (rechtsbündig: «Filter zurücksetzen» tonal – ohne
  Filter gesperrt mit «Kein Filter aktiv.» –, «Fertig» primär).
- **Filter und Spalten der Listen** stehen in einem Blatt; Änderungen wirken sofort. Filter: Trefferzahl live in der
  Unterzeile; jeder gesetzte Filter steht danach als entfernbarer Chip über der Liste. Spalten: Vorlagen, dann die
  Spalten nach Gruppen. Ein offenes Blatt wird beim Nachladen nie neu gebaut – nur `zahlenSetzen`, `blatt.unter()`
  und stilles Abgleichen seines Körpers.

### 7.3 Meldung (Snackbar)
`UI.meldung(text, { ton: 'erfolg'|'fehler'|'info', dauer, aktion: { text, beiKlick } })` → `{ schliessen, element }`
- `DS.overlay.toast` in der Region `.ds-toasts` (unten links in der Tafel; bei offenem Dialog oder Blatt in dessen
  Ebene). Erfolg und Info gehen nach `dauer` bzw. der Lesezeit von Dashboard-Style (aus der Länge des Texts; hält,
  solange Zeiger oder Fokus darauf liegen); **Fehler und Meldungen mit Aktion bleiben** mit ×; höchstens drei.
- ICT dazu: dieselbe Meldung ersetzt die stehende, statt sich zu stapeln; ein neuer Fehler ersetzt den offenen;
  solange ein Fehler steht, hält die Tafel (bzw. das Blatt) an ihrem Ende Platz frei (`data-toast-reserve`).
- Liegt immer **über** einer sichtbaren Speicherleiste (`--ds-toast-bottom`). Angesagt wird über die Ansage-Regionen,
  die Dashboard-Style neben `.ds-toasts` anlegt.

### 7.4 Tooltip
`UI.tipp(element, text|null)` – gezeigt von `DS.overlay.tooltips(document)` (einmal in `rahmen.js`) für jedes
`[data-tip]`. Verzögerung, Aufwärmen, Esc und «nie auf Touch» regelt Dashboard-Style; ICT ergänzt zwei Dinge: Ein Text,
der nur den sichtbaren Text wiederholt, steht in `data-tip-abgeschnitten` und wird beim Zeigen nur dann zu `data-tip`,
wenn der Text abgeschnitten ist; ein Bild ohne eigene Handlung (`role="img"`, etwa die Initiale im Kopf) zeigt seinen
Tooltip auch beim Antippen. Ein Element, das nur einen Tooltip trägt, braucht `tabindex="0"`.

### 7.5 Speicherleiste
`F.speicherleisteZeichnen({ neuModus, anzahl, neuText })` · `UI.speicherleiste({ beiSpeichern, beiVerwerfen, fokusZiel })`
- Schwebt unten in der Tafel, bündig mit der Bahn, Radius wie ein Dialog, `--ds-elev-overlay`. Links «1 Änderung»,
  rechts «Verwerfen» (Text) und «Speichern» (primär, mit Gesichtern «Wird gespeichert …»). Neu-Modus: «2 Angaben
  erfasst», «Formular leeren», «Anlegen».
- Sie trägt keine Höhe bei; solange sie steht, hält die Tafel darüber Platz frei.
- Sie kommt und geht bei jeder Änderung und jedem Speichern: `.ds-presence` von Dashboard-Style (nur `hidden`
  umschalten; ein Umschalten mitten im Übergang macht vom aktuellen Stand weiter). Während des Austritts ist sie
  `inert` und ihr Inhalt eingefroren.
- Fehler stehen als Meldung darüber + Feldfehler. Nach einem gescheiterten Schreiben heisst der Knopf «Nochmals
  speichern»; nach einem Konflikt (409/412) bietet die Meldung «Neu laden».
- Speichern läuft nur über `F.speicherAblauf` (der Knopf ist beschäftigt, solange `schreiben()` läuft:
  `speicherleiste().beschaeftigt(arbeit)` → `DS.motion.busy`); Schnellaktionen in `F.beschaeftigt(fn)`; Verwerfen fragt
  über `F.verwerfen`.

---

## 8. Muster für Inhalte

### 8.1 Status nie nur Farbe

| Situation | So |
|---|---|
| Abweichung eines Datensatzes | `UI.status(text, ton)` – Sinnbild + Wort, im Seitenkopf oder in der Zelle; der Normalfall ohne Chip (§4.3) |
| Auswahl (Navigation, Chip, Umschalter, Kästchen) | Pastell **und** Häkchen bzw. Gewicht 500 bzw. `aria-current`/`aria-pressed`/`checked` |
| Hinweis mit Ton | Sinnbild in der Tonfarbe + Titel; der Text bleibt ruhig |
| Geändertes Feld | Punkt + «(geändert)» für Screenreader + Zahl in der Speicherleiste |
| Telefonnummer in Betrieb ohne Zuweisung | Status «Nicht zugewiesen» (Warnung) – **keine getönte Zeile**; zählt unter «Handlungsbedarf» |
| Freie Telefonnummer | Status «Frei» **neutral** mit `checkKreis` – überall gleich; kein Handlungsbedarf |
| Dringlichkeit in der Übersicht | Zahlmarke tonal + Status «Dringend» |
| Leerer Wert | «–» (Halbgeviertstrich), nie ein leeres Feld |

### 8.2 Kennzahlen ungefärbt
Die Zahl bleibt `--ds-text`. Ein Ton steht als Sinnbild in der Beschriftung (Kachel) oder vor dem Namen (Kennwert),
eine Null ist leise. Jede Zahl öffnet die Liste, die sie zählt, schon gefiltert.

### 8.3 Leerzustände

| Art | Sinnbild | Titel | Text | Aktion |
|---|---|---|---|---|
| noch nichts da | das der Liste | «Noch keine Telefonnummern» | der nächste Schritt | höchstens eine |
| nichts für diese Filter | `suche` | «Keine Treffer» | keiner | «Filter zurücksetzen» bzw. «Suche zurücksetzen» |

In Karten genügt oft ein Satz (`UI.hinweis`). Nie ein leerer Bereich.

### 8.4 Fehler

| Situation | Darstellung |
|---|---|
| Seite lädt nicht | `Rahmen.zustand('fehler', { titel, text, hinweis, beiKlick })` mit «Erneut laden» |
| Datensatz nicht gefunden | `F.ladefehler`: Fehlerzustand mit «Zur Liste» |
| Im anderen Tab gelöscht | Endzustand «Inzwischen gelöscht» mit «Zur Liste» |
| Teil der Daten fehlt | Banner `gefahr` mit «Erneut versuchen» bzw. Leerzustand, der sagt, was zu tun ist |
| Speichern scheitert | Meldung `fehler` (bleibt) + Feldfehler; Knopf «Nochmals speichern» |
| Konflikt (409/412) | Meldung mit Aktion «Neu laden» |
| Eingabe ungültig | `UI.feldFehler` am Feld, Fokus ins Feld; ein Satz, der sagt, was gilt; nie still umdeuten |
| Aktion gerade nicht möglich | Knopf gesperrt mit Grund (Tooltip), nicht verstecken |
| Nachladen im Hintergrund scheitert | still; der nächste Takt versucht es wieder |

### 8.5 Texte

| Regel | Beispiel |
|---|---|
| Schweizer Hochdeutsch: «ss» statt ß | «schliessen», «Grösse» |
| Guillemets für Namen und Zitate | Liste «ADMIN-Clients», Knopf «Speichern» |
| Halbgeviertstrich «–» als Gedankenstrich und Leerwert, nie «—» (Prüfung 14, auch in Kommentaren) | «Übersicht – ICT-Inventar» |
| Uhrzeit mit Punkt, Datum TT.MM.JJJJ (`UI.zeitText`) | «12.10.2026, 14.05» |
| Zahlen de-CH (`UI.zahlText`) | «1’284», «7.5» |
| Auslassung mit Leerschlag | «Wird geladen …», «Löschen …» |
| Satzschreibung, keine Versalien-Titel | «Ersatz überfällig» |
| Knöpfe nennen die Handlung bzw. Folge | «Ins Lager legen», nicht «OK» |
| Meldungen: was geschah, in einem Satz mit Punkt | «3 Änderungen gespeichert.» |
| Lead und Kartenuntertitel nur, wo sie Nicht-Offensichtliches sagen, höchstens 76 Zeichen | «SCCM sieht, wer am Gerät arbeitet, nicht, wem es gehört.» |
| Optionale Felder tragen «(optional)» | «Notiz für den Verlauf (optional)» |
| Fehlt ein Pflichtfeld: «Bitte … eingeben.» | «Bitte einen PC-Namen eingeben.» |

### 8.6 Typische Inhalte

| Situation | So wird es gezeigt |
|---|---|
| Datensatz mit Kennzahlen | Kachelreihe zuoberst, danach Karten |
| Feldliste zum Lesen | Datenzeilen in einer Karte, 4–9 Felder je Karte |
| Feldliste zum Bearbeiten | `F.feld` in einer Karte; gespeichert wird über die Speicherleiste, nie über einen Knopf in der Karte |
| Liste von Personen oder Geräten | Zeilenliste: Titel 500 + Unterzeile; Aktionen rechts als kleine Text-Knöpfe |
| Aufgabe, die zu einer Liste führt | interaktive Karte (`UI.karte({ href, marke })`) |
| Warnung mit Handlung | Banner, Text links, Knopf rechts |
| Vergleich mit der Flotte | Kennwert mit Erklärung, darunter Säulen |
| Verteilung | `UI.verteilung`, höchstens 8 Zeilen + «und n weitere …» |
| Lange Texte | Titel und Werte brechen um; Tabellenzellen, Chips und Blatttitel enden mit «…», der Tooltip zeigt den ganzen Text (`data-tip-abgeschnitten`) |
| Vorführmodus (`?mock=1`) | `Rahmen.vorfuehrung` / `F.bandZeichnen`: Warnbanner als erster Block mit «Vorführdaten zurücksetzen»; der Text kommt aus `rahmen.js` |

---

## 9. Barrierefreiheit und Bedienung

Die Grundlagen (Fokusring sofort, Kontrastmodus der gemeinsamen Bausteine, Ziele ≥ 32 px, Fokusfalle und Rückfokus
der Überlagerungen, Ansagen der Meldungen, Druckstile des Rahmens) bringt Dashboard-Style mit. ICT-Inventar ergänzt:

| Taste | Wirkung |
|---|---|
| Tab / Shift+Tab | erst die Sprungmarke «Zum Inhalt» (`.ds-skip`), dann Kopf, Schublade, Tafel; in Ebenen bleibt Tab in der Ebene |
| `/` | springt in die Suche der aktuellen Liste |
| Esc | verbirgt einen Tooltip, dann: 1. schliesst die oberste Ebene · 2. leert eine gefüllte Suche · 3. Detailseite: fragt, ob die Änderungen verworfen werden |
| Ctrl/Cmd+S | speichert, wenn es etwas zu speichern gibt und keine Ebene offen ist (`UI.ebeneOffen()`) |
| Enter | im Löschdialog: löst aus, sobald das Wort stimmt |
| Ctrl-/Mittelklick | auf Zeilen (auch in eine Zelle), Namen, Schubladen-Einträgen, «Neuer …»: neuer Tab |

- **Fokus geht nie verloren:** Werte an Ort und Stelle ändern statt neu bauen (`UI.textSetzen`, `.setzen()`,
  `sortierungSetzen`, `zahlenSetzen`, `blatt.unter()`, `Rahmen.zahl`); neu zeichnen nur still abgleichend über
  `UI.abgleichen`, `F.zeichneBereich` bzw. `Rahmen.stillZeichnen`: ein bleibender Knoten behält den Fokus, ein
  verschwundener Fokus geht samt Schreibmarke an sein Gegenstück (`data-fokus`, `id`). Verschwindet etwas unter dem
  Fokus, geht er vorher an das Gleichwertige. Auto-Nachladen läuft nie, solange ein Eingabefeld den Fokus hat, eine
  Ebene offen ist oder gearbeitet wird.
- **ARIA:** Schublade `nav` mit `aria-label`, aktiver Eintrag `aria-current="page"`; Menüknopf `aria-controls` +
  `aria-expanded`; Knopf, der ein Blatt öffnet, `aria-haspopup="dialog"` + `aria-expanded`; Schalter `role="switch"`,
  gesperrt `aria-disabled`; Felder `<label for>`, Fehler `aria-invalid` + `aria-describedby`, Kästchengruppen
  `fieldset`/`legend`; Tabellen `caption` (nur Screenreader) und `aria-sort`; Schloss `role="img"` mit Grund;
  Sinnbilder immer `aria-hidden`; `.ds-sr`-Texte «(geändert)», «(zu prüfen)», «(dringend)».
- **Kontrastmodus** (`forced-colors: active`): der aktive Schubladen-Eintrag, ein Knopf mit offenem Blatt und der
  aktive Filter-Chip mit × tragen `Highlight`/`HighlightText`; das Schloss der Schaltersperre ist `Highlight`;
  Balken, Säulen, Zahlmarken und der Punkt der Wortmarke bleiben sichtbar (`rahmen.css` Abschnitt 11,
  `bausteine.css`). Die Speicherleiste trägt wie Dialog, Blatt und Meldung einen durchsichtigen Umriss, den das
  System malt.
- **Druck:** nur der Inhalt (Dashboard-Style blendet Rahmen, Ladebalken und Meldungen aus), dazu ohne Speicherleiste
  und Schnellaktionen; die seitenfüllende Liste läuft über alle Seiten.

---

## 10. Neue Seiten und Bausteine, Prüfen

### 10.1 Neue Seite, Schritt für Schritt

1. **HTML-Gerüst** von einer bestehenden Seite übernehmen (das der Referenz-App von Dashboard-Style;
   Prüfung 12): `<html lang="de-CH" class="ds-theme ds-base">`, `<body>` ohne Klassen, darin als erstes Element
   `div.ds-app.ds-app--drawer[data-seite="…"]` mit `a.ds-skip`, `div.ds-topbar#kopf`, `div.ds-scrim`,
   `nav.ds-drawer#schublade[tabindex=-1]`, `div.ds-panel > main.ds-view#tafel[tabindex=-1] > div.ds-content >
   div.ds-page#inhalt[data-zustand="laden"]`; nach `.ds-app` genau ein `div.ds-toasts` ohne `role` und `aria-live`.
   Detailseite: in der Bahn nur `header.ds-page-head#<p>-kopf` und `div.fenster-bereich#<p>-bereich`. Kein statisches
   Markup für Ladebalken, Dialog, Meldung, Speicherleiste, Laden oder Fehler.
2. **Kopf:** Stilvorlagen und Skripte in der Reihenfolge aus §12 (Prüfung 9), dazu
   `<link rel="expect" href="#rahmen-gebaut" blocking="render">` im `<head>` und `<div id="rahmen-gebaut" hidden></div>`
   direkt nach `<script src="rahmen.js">`. Klassische Skripte ohne `defer`; kein `<style>` und kein Inline-Skript
   (Inhaltsrichtlinie).
3. **Seiten-CSS** mit eigenem Präfix (`g-`, `b-`, `tf-`, `sw-`, `km-`, `kr-`, `vl-`) – nur Raster, Breiten,
   Reihenfolge, Positionen, alle Werte als Tokens; jede Regel trifft eine Klasse mit dem Präfix. Keine Farben,
   Hintergründe, Schrift, Ränder, Schatten, Deckkraft, Bewegung oder `--ds-*`-Hooks (Prüfung 13), keine
   `@keyframes`; `:hover` nur in `@media (hover: hover)`. Eine neue Stilvorlage wird in Prüfung 13 eingeordnet.
4. **Bauen nur über** `UI.*`, `Rahmen.*`, `Bewegung.*` und `F.*`. Kein `innerHTML`; kein `title` (→ `titel`,
   `UI.tipp`); kein `window.confirm`/`alert` (→ `UI.bestaetigen`, `UI.meldung`); Adressen nur über `UI.adresse.*`.
5. **Ablauf:** `Rahmen.zustand('laden', …)` → Daten holen → zeichnen → `await Rahmen.zustand('inhalt')`; Fehler über
   `Rahmen.zustand('fehler', …)` bzw. `F.ladefehler`. Nachladen zeichnet still (§4, §6.2).
6. **Jede Ansicht** bekommt Seitenkopf, Karten, Leerzustand und Fehlerzustand; genau eine gefüllte Hauptaktion je
   Bereich. **Bewegung** nur über die Anlässe aus §6.2. **Fokus:** jedes Bedienelement ohne `id` bekommt `fokus: '…'`;
   Zeilen und Karten, die neu gezeichnet werden, ein `data-ds-key`.
7. **Detailseite zusätzlich:** `F.entwurf`, `F.feld`, `F.uebernehmen`, `F.speicherAblauf`, `F.beschaeftigt`,
   `F.imDialog`, `F.loeschenDialog`, `F.ereignisse`; Fachregeln aus `modell.js`.
8. **Prüfen** (§10.3).

**Neue Ansicht der Hauptseite** statt einer neuen Seite: `section.ansicht#ansicht-<n>` in `index.html`, Eintrag in
`ANSICHTEN` (`app.js`) und in `Rahmen.HAUPTZIELE` (`rahmen.js`). Eine Tabellenansicht zusätzlich in `TAB` (Spalten,
Facetten) und `TABELLEN`; eine neue SharePoint-Liste braucht ihre Listen-ID in `konfig.js` (und, solange sie fehlen
darf, einen Eintrag in `LISTEN_KONFIG`). Werkzeugleiste, Filterblatt, Filter-Chips und Tabelle bringt `app.js` mit
(Abschnitte 6 und 7: `blattKnopf`, `filterOeffnen`, `aktiveFilter`) – nicht mit `UI.blatt` und `UI.chip` neu bauen.

### 10.2 Neuer Baustein oder neue Animation

1. Gibt es ihn schon? Erst in Dashboard-Style ([docs/components.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/components.md),
   sein Styleguide), dann in `styleguide.html`, `bausteine.js` und `rahmen.js` nachsehen.
2. **Gilt er für jedes Dashboard** (nichts Campus- oder ICT-Spezifisches), gehört er nach Dashboard-Style: dort nach
   dessen `AGENTS.md`, Abschnitt «Making a change», projektneutral und auf Englisch mit Doku, Tests und CHANGELOG
   ergänzen und auf dessen `main` bringen. Die nächtliche Aktualisierung übernimmt ihn hier (§11), sofort geht es von
   Hand mit `vendor.ps1`; danach den Bauer in `bausteine.js` ergänzen und ein Muster in `styleguide.js`. Nie die Kopie
   in `vendor/` ändern. Weil jeder Stand von `main` innert etwa 24 Stunden hier live ist (sofern «Verify» besteht), vor
   dem Push mit `vendor.ps1 -From ..\Dashboard-Style …` lokal übernehmen und `Pruefe-Frontend.ps1` sowie
   `styleguide.html` ansehen.
3. **Nur für ICT:** Klasse in `bausteine.css` (Rahmen und Überlagerungen in `rahmen.css`), Bauer in `bausteine.js` bzw.
   `rahmen.js` mit Kopfkommentar-Eintrag, nur Tokens (`--ds-*`, ICT-Tokens aus `thema.css`). Ein neuer Wert wird ein
   Token in `thema.css`. Keyframes gibt es nur in Dashboard-Style; Bewegung nur über `Bewegung.*`/`DS.motion`;
   Sinnbilder nur über `DS.icons` + `UI.SINNBILDER`; drückbar mit `data-ds-ripple` und dem Druckmodell (§4.2).
4. Hover in `@media (hover: hover)`; eigene Media-Queries mitbringen; Kontrastmodus bedenken.
5. In `styleguide.js` ein Muster in allen Zuständen ergänzen (nur über die Bauer) und diese Datei (§4.2) nachführen.

### 10.3 Prüfen

**Statisch** – nach jeder Änderung in `frontend/`, im Ordner `code`:

```powershell
powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1
```

[`code/Pruefe-Frontend.ps1`](../code/Pruefe-Frontend.ps1) (Windows PowerShell 5.1 oder PowerShell 7, ohne
Zusatzmodul, ohne Browser, ohne Netz; die nächtliche Aktualisierung (§11) ruft es mit `pwsh` unter Linux auf, es muss
darum unter beiden laufen) prüft **14 Regeln** und meldet je Prüfung «OK» oder die Fundstellen mit Datei und Zeile;
erwartet ist «Ergebnis: alle 14 Prüfungen OK», Exit-Code 0. Geprüft wird der eigene Code (alle `.css`, `.js`,
`.html` direkt in `frontend/`) und die Kopie; Kommentare zählen nicht mit, ausser in Prüfung 14.

| Prüfung | Regel |
|---|---|
| 1. Tokens | jedes `var(--x)` im eigenen CSS ist definiert – im eigenen CSS, in `vendor/dashboard-style/ds.css` oder per `setProperty("--x")` in JS (auch `ds.js`); `var(--x, Ersatz)` gilt als Schalter |
| 2. Bewegung | `@keyframes` nur in `vendor/dashboard-style/css/motion.css` (und `ds.css`); jeder genannte Keyframe-Name existiert dort; weder eigenes CSS noch JS (`setProperty`) setzt Bewegungs-Tokens (`--ds-dur/-ease/-distance/-scale/-delay/-loop/-hold-*`, `--ds-stagger`, `--ds-time-scale`); `thema.css` setzt keine Bewegungs-Hooks (§2) |
| 3. Literale | das eigene CSS ausser `thema.css` hat keine Farb-, Radius-, Schrift-, Dauer- oder Kurven-Literale |
| 4. JavaScript | kein `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, kein `(window.)confirm/alert/prompt`, kein Browser-`title`; kein `DS.icons.icon()`, kein `DS.dom.morphHtml` |
| 5. HTML | kein Inline-`<script>`, keine `on*`-Attribute, keine `javascript:`-Adressen |
| 6. MSAL | gleiche `integrity` und `crossorigin="anonymous"` auf allen Seiten, die MSAL laden |
| 7. Altlasten | keine alten Klassen und Tokens (§13), kein `design.css`/`bewegung.*`, kein Google Fonts (auch nicht in `_headers`); keine ICT-Namen, die mit der Umstellung auf Dashboard-Style 1.6 weggefallen sind (`Bewegung.reduziert`, `UI.beschaeftigtAbwarten`, die alte Form `UI.beschaeftigt(knopf, true\|false)`, `UI.knopfSperre`, `UI.feldFrei`, `Rahmen.erstauftritt`, `Rahmen.bereit`, `setzen({ beschaeftigt … })`, `umschalten:`, `data-tipp` …) |
| 8. Kopie | `vendor/dashboard-style/` stimmt mit `SHA256SUMS` überein: keine Datei geändert, fehlend oder dazugekommen (auch versteckte), kein symbolischer Link; `VERSION` vorhanden |
| 9. Seiten | `class="ds-theme ds-base"` auf `<html>`; Stilvorlagen in der Reihenfolge `grund.css` (als erste), `fonts.css`, `ds.css`, `css/optional/view-transitions.css`, `thema.css`, `bausteine.css`, `rahmen.css`, falls gebraucht `verlauf.css`, die Blätter der Seite zuletzt; `ds.js` vor `bausteine.js`; eine Seite mit `view-transitions.css` trägt `<link rel="expect" href="#…" blocking="render">`, dessen Ziel direkt nach `rahmen.js` steht; jede verlinkte Datei (auch die Schriften in `thema.css`) existiert |
| 10. DS-API | was der eigene Code von Dashboard-Style nennt, gibt es in der Kopie: jedes `DS.<modul>.<name>` (auch über ein Kürzel wie `const M = DS.motion;`) ist ein Export von `ds.js`, jede Glyphe in `UI.SINNBILDER` steht in `DS.icons`, jede Klasse `ds-*` in `ds.css`, jedes `--ds-*` und `data-ds-*` in `ds.css` oder `ds.js`. Die Listen liest das Skript aus der Kopie selbst |
| 11. Veraltet | keine Namen, die Dashboard-Style als veraltet führt: was die Kopie mit «Deprecated» markiert, dazu eine gepflegte Liste aus dem CHANGELOG (`--ds-ease`, `--ds-spinner-sm-track`, `--ds-state-pulse`, `--ds-loop-pulse`, `ds-pulse`, `ds-indeterminate`, `ds-sink-out`/`-scale-out`/`-slide-out`, `.ds-btn__swap`, `easeOutCubic`, `prefersReducedMotion`, `prefers-reduced-motion`, `.ds-motion-full`, `.ds-toast--shown` und `--ds-toast-shift` von Hand, `.ds-view--leaving`, `role`/`aria-live` auf `.ds-toasts`, `data-open` auf `.ds-combo`, `--ds-spinner-track` im Thema) |
| 12. Seitengerüst | kein `<style>`, `<body>` ohne `ds-*`-Klassen; `div.ds-app[data-seite]` als erstes Element in `<body>`, darin in dieser Reihenfolge `a.ds-skip`, `.ds-topbar`, `.ds-scrim`, `nav.ds-drawer`, `.ds-panel`, `main.ds-view`, `.ds-content`, `.ds-page`; nach `.ds-app` genau ein `div.ds-toasts` ohne `role` und `aria-live` |
| 13. Seiten-CSS | die Blätter mit Präfix (`benutzer.css` b-, `client.css` g-, `kamera.css` km-, `kamerarolle.css` kr-, `software.css` sw-, `telefon.css` tf-, `verlauf.css` vl-) enthalten nur Layout (§10.1, Schritt 3); ausgenommen mit Grund `styles.css` (Hauptseite, trägt den Zeitstrahl) und `styleguide.css` (Farbfelder, Masse, Bühne); eine unbekannte neue Stilvorlage wird gemeldet |
| 14. Text | kein Geviertstrich «—» im eigenen CSS, JS, HTML und in `_headers`, auch nicht in Kommentaren |

Mit `-Ordner <Pfad>` prüft es eine Kopie. Was es nicht sieht – Aussehen, Bewegung, Bedienung und ob ein Aufruf von
`UI.*`, `Rahmen.*`, `Bewegung.*` oder `F.*` einen Export trifft (die bekannten weggefallenen Namen fängt Prüfung 7) –,
zeigt erst der Browser.

**Im Browser** (`code\serve.ps1`, Vorführmodus `?mock=1`, Fehlerfall `&fehler=1`). `serve.ps1` schickt die Header aus
`_headers` mit; ein Verstoss gegen die Inhaltsrichtlinie zeigt sich so schon lokal in der Konsole.

| Prüfung | Wie |
|---|---|
| Konsole | keine Fehler und keine Verstösse gegen die Inhaltsrichtlinie auf allen Seiten, auch `styleguide.html` |
| Breiten | 1440, 900 und 390 px: kein waagrechtes Rollen der Seite, nichts ausserhalb des Fensters, kein abgeschnittener Text ohne «…»; dazu 200 % Zoom und ein niedriges Fenster |
| Zustände | Laden, Fehler (`&fehler=1`), unbekannte ID, Neu-Modus (`?neu=1`), Leerzustand, lange Texte |
| Bewegung | Erstauftritt und Wechsel ruhig; Sortieren und Filtern gleiten; Tippen, Speichern und Nachladen ohne Auftritt; Seitenwechsel zwischen den HTML-Seiten mit Übergang (Chrome, keine «Transition was aborted» in der Konsole) |
| Tastatur | Tab durch alle Bedienelemente, Esc-Reihenfolge, Ctrl+S, Rückfokus nach Dialog, Blatt und modaler Schublade |
| Kontrastmodus | DevTools «Rendering → forced-colors: active» |

---

## 11. Dashboard-Style aktualisieren

Die Kopie ist auf einen Commit von Dashboard-Style festgenagelt (`vendor/dashboard-style/VERSION`; heute 1.6.2).
Normalerweise kommt ein neuer Stand von selbst: `.github/workflows/update-dashboard-style.yml` (Vorlage aus
Dashboard-Style) vergleicht jede Nacht um 02.30 Uhr UTC den Commit in `VERSION` mit `main`; ist er neu, holt es die
Kopie, lässt `Pruefe-Frontend.ps1` laufen und committet auf `main`, worauf Cloudflare Pages neu baut. Sonst endet der
Lauf ohne Build. Von Hand geht es so:

1. **Änderungen lesen:** `CHANGELOG.md` von Dashboard-Style, auch die Abschnitte «Deprecated». Was dort als veraltet
   steht, gleich umstellen (Prüfung 11 meldet es, und die nächste Hauptversion entfernt es); benennt der neue Stand
   Tokens, Klassen oder JS-Exporte um oder entfernt er sie (dort eine neue Hauptversion), dann `grund.css`,
   `thema.css`, `bausteine.css`, `rahmen.css` und die Bauer nachführen.
2. **Kopie ersetzen** mit dem Werkzeug von Dashboard-Style (`scripts/` in dessen Repository; hier liegt es als
   Checkout neben diesem Repository), im Wurzelordner dieses Repositorys:

   ```powershell
   # Windows PowerShell 5.1: den neusten Stand von main auf GitHub holen …
   ..\Dashboard-Style\scripts\vendor.ps1 frontend\vendor\dashboard-style
   # … oder aus dem lokalen Checkout mit gebautem dist/
   ..\Dashboard-Style\scripts\vendor.ps1 -From ..\Dashboard-Style frontend\vendor\dashboard-style
   # nur prüfen, ob die Kopie zu ihrer SHA256SUMS passt
   ..\Dashboard-Style\scripts\vendor.ps1 -Check frontend\vendor\dashboard-style
   ```

   bzw. `sh ../Dashboard-Style/scripts/vendor.sh frontend/vendor/dashboard-style` (oder `--from ../Dashboard-Style`,
   `--check`). `main` ist immer lieferbar, ein Update braucht keinen Tag-Wechsel; ein bestimmter Stand geht mit
   `vendor.ps1 <ref> …`. Das Werkzeug ersetzt den Ordner als Ganzes und schreibt `VERSION` (mit dem genauen Commit)
   und `SHA256SUMS` neu. Nie einzelne Dateien von Hand kopieren oder ändern.
3. **Prüfen:** `code\Pruefe-Frontend.ps1` (Prüfung 8 vergleicht die Prüfsummen, Prüfung 1 und 2 finden verschwundene
   Tokens und Keyframes, Prüfung 10 entfernte JS-Exporte, Klassen und Sinnbilder, Prüfung 11 neu als veraltet
   markierte Namen), dann `styleguide.html` und die Seiten mit `?mock=1` bei 1440, 900 und 390 px ansehen.
4. **Einchecken:** Der Ordner ist in `.gitattributes` als `-text` markiert; Git schreibt die Zeilenenden nicht um, und
   Cloudflare Pages liefert die Dateien Byte für Byte aus.

Fehlt Dashboard-Style etwas, das jedes Projekt brauchen kann, wird es **dort** ergänzt (mit Doku, Tests und CHANGELOG)
und dann wie oben übernommen – nie in der Kopie.

### 11.1 Wenn die nächtliche Aktualisierung scheitert

GitHub meldet den gescheiterten Lauf «Update Dashboard-Style» (Actions). Die Seite bleibt bis zur Behebung auf dem
alten Stand; jede Nacht versucht es der Lauf von Neuem.

| Schritt scheitert | Bedeutung | Vorgehen |
|---|---|---|
| «Verify» | `Pruefe-Frontend.ps1` findet Fehler mit dem neuen Stand; nichts ist committet | lokal nachstellen (Schritte 2 und 3 oben), im `CHANGELOG.md` nachsehen, was umbenannt, entfernt oder als veraltet markiert wurde, den eigenen Code nachführen und Kopie und Anpassung **zusammen** committen. Liegt der Fehler in Dashboard-Style selbst, wird er dort behoben; der nächste Lauf übernimmt ihn |
| «Compare with main of Dashboard-Style» | die GitHub-API oder das Netz war nicht erreichbar | Lauf später erneut starten |
| «Vendor main» | Dashboard-Style war nicht erreichbar oder sein `main` ist unvollständig | Lauf später erneut starten; bleibt der Fehler, in Dashboard-Style beheben |
| «Commit and push» | der Push auf `main` wurde abgelehnt, meist durch einen Zweigschutz | den Zweigschutz für den Bot freigeben oder die Kopie von Hand aktualisieren (oben) |

Danach in GitHub unter Actions → «Update Dashboard-Style» → *Run workflow* neu starten oder die nächste Nacht
abwarten. **Nie die Kopie in `vendor/` flicken und keine Prüfung in `Pruefe-Frontend.ps1` abschwächen, damit das
Update durchgeht.**

---

## 12. Dateien und Ladereihenfolge

| Datei | Inhalt | Namensraum |
|---|---|---|
| `vendor/dashboard-style/` | Dashboard-Style 1.6.2: `ds.css`, `ds.js`, `css/` (samt `css/optional/view-transitions.css`), `js/`, `fonts/` (Google Sans + `OFL.txt`), `LICENSE`, `VERSION`, `SHA256SUMS` – **nie von Hand ändern** | `DS` |
| `grund.css` | Grundregeln unter Dashboard-Style in `@layer grund` (Rollen der Überschriften, Ränder 0); erste Stilvorlage | – |
| `thema.css` | Campus-Thema: Werte für Rollen von Dashboard-Style, ICT-Tokens, `@font-face` Archivo | – |
| `schriften/` | Archivo (Wortmarke), selbst gehostet aus `@fontsource-variable/archivo` 5.3.0, mit `OFL.txt` | – |
| `bausteine.css` | die ICT-eigenen Bausteine und die Abweichungen von Dashboard-Style (§4.2, §5) | – |
| `rahmen.css` | was Rahmen und Überlagerungen über Dashboard-Style hinaus brauchen (Wortmarke, Konto, Zurück-Eintrag, Zustände, Seitenkopf, Rollflächen in Dialog und Blatt, Aktion der Meldung, Speicherleiste) | – |
| `bausteine.js` | DOM-Helfer und Abgleich (über `DS.dom`), Sinnbilder (über `DS.icons`), Bauer aller Bausteine; `Bewegung` (über `DS.motion`, `DS.indicator`) | `UI`, `Bewegung` |
| `rahmen.js` | Rahmen, Navigation, Zustände, Ansichtswechsel; Überlagerungen über `DS.overlay`, Speicherleiste, Adressen; startet `DS.ripple` und `DS.overlay.tooltips` | `Rahmen`; ergänzt `UI.dialog/bestaetigen/blatt/ebeneOffen/meldung/meldungenFehlerSchliessen/tipp/speicherleiste/seitenkopf/adresse` |
| `fenster.js` | Gerüst der Detailseiten | `Fenster.erstellen()` → `F` |
| `verlauf.js`, `verlauf.css` | Verlauf (Client, Benutzer, Telefon, Kamera, Kamerarolle) | `Verlauf` |
| `konfig.js` | Listen-IDs, Mandant, Takt des Nachladens (keine Geheimnisse) | `KONFIG` |
| `auth.js` | Anmeldung über MSAL | `Auth` |
| `graph.js` | Lesen/Schreiben über Microsoft Graph, Vorführdaten | `Hilfe`, `Daten`, `Mock` |
| `modell.js` | Fachlogik: Geschäftsjahr, Status, Programmstufen, Verknüpfungen | `Modell` |
| `spalten.js` | **generiert** von `code/Build-Spalten.ps1`, nie von Hand ändern | – |
| `index.html`, `app.js`, `styles.css` | Hauptseite (`styles.css` ohne Präfix, mit dem Zeitstrahl `.zeitstrahl-*`) | – |
| `client.*`, `benutzer.*`, `telefon.*`, `software.*`, `kamera.*`, `kamerarolle.*` | Detailseiten (`.css` nur Seitenlayout, Prüfung 13) | – |
| `styleguide.html`, `styleguide.js`, `styleguide.css` | lebende Übersicht (`styleguide.css`: Layout der Seite, Farbfelder, Bühne) | – |
| `STYLEGUIDE.md` | dieses Dokument | – |
| `_headers` | Sicherheitsheader und Inhaltsrichtlinie (Cloudflare Pages), mit einer Erklärung je Regel | – |

Ladereihenfolge auf jeder Seite (klassische Skripte, ohne `defer`; MSAL-Zeile samt SRI unverändert lassen):

```html
<html lang="de-CH" class="ds-theme ds-base">
<head>
…
<link rel="expect" href="#rahmen-gebaut" blocking="render">  <!-- erstes Bild wartet auf rahmen.js, nicht auf MSAL -->
<link rel="stylesheet" href="grund.css">                      <!-- @layer grund, ds; – immer zuerst -->
<link rel="stylesheet" href="vendor/dashboard-style/fonts/fonts.css">
<link rel="stylesheet" href="vendor/dashboard-style/ds.css">
<link rel="stylesheet" href="vendor/dashboard-style/css/optional/view-transitions.css">
<link rel="stylesheet" href="thema.css">
<link rel="stylesheet" href="bausteine.css">
<link rel="stylesheet" href="rahmen.css">
<link rel="stylesheet" href="verlauf.css">                    <!-- nur Seiten mit Verlauf -->
<link rel="stylesheet" href="<seite>.css">
</head>
<body>
<div class="ds-app ds-app--drawer" data-seite="<seite>"> … Gerüst aus §10.1 … </div>
<div class="ds-toasts"></div>
<script src="konfig.js"></script>
<script src="vendor/dashboard-style/ds.js"></script>          <!-- window.DS -->
<script src="bausteine.js"></script>
<script src="rahmen.js"></script>                              <!-- baut Kopf und Schublade sofort -->
<div id="rahmen-gebaut" hidden></div>
<script src="https://cdn.jsdelivr.net/npm/@azure/msal-browser@4.30.0/lib/msal-browser.min.js" integrity="…" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="spalten.js"></script>
<script src="auth.js"></script>
<script src="graph.js"></script>
<script src="modell.js"></script>
<script src="verlauf.js"></script>                             <!-- nur client, benutzer, telefon, kamera, kamerarolle -->
<script src="fenster.js"></script>                             <!-- nur Detailseiten -->
<script src="<seite>.js"></script>
</body>
```

`styleguide.html` lädt nur `ds.js`, `bausteine.js`, `rahmen.js` und `styleguide.js` (keine Anmeldung, keine Daten).
`bausteine.js` bricht ab, wenn `ds.js` fehlt; `rahmen.js`, wenn `bausteine.js` oder `ds.js` fehlt; ohne
`.ds-app[data-seite]` baut `rahmen.js` keinen Rahmen, die Überlagerungen gehen trotzdem.

---

## 13. Alte Namen → neue Namen

Bis 10.2026 hatte ICT-Inventar eine eigene deutsche Kopie des Design-Systems (`design.css`, `bewegung.css`,
`bewegung.js`, die gemeinsamen Teile von `rahmen.css`). Sie ist durch Dashboard-Style ersetzt; die alten Namen gibt es
nicht mehr (Prüfung 7 meldet sie). Die JS-Namen (`UI.*`, `Rahmen.*`, `Bewegung.*`, `F.*`) sind geblieben; was bei der
Umstellung auf Dashboard-Style 1.6.2 an ihnen wegfiel, steht am Ende. Wo das Ziel von damals inzwischen in
Dashboard-Style veraltet ist, steht das heutige Ziel (Prüfung 11).

**Tokens** (`:root` → `.ds-theme`)

| Alt | Neu | | Alt | Neu |
|---|---|---|---|---|
| `--hintergrund` | `--ds-backdrop` | | `--r-xs` … `--r-2xl` | `--ds-radius-xs/-sm/-md/-lg/-xl/-2xl` |
| `--flaeche`, `-tief`, `-hoch`, `-hoechst` | `--ds-surface`, `-low`, `-high`, `-highest` | | `--r-rund`, `--r-aktion` | `--ds-radius-action` |
| `--text`, `--text-leise`, `--text-still` | `--ds-text`, `--ds-text-2`, `--ds-text-3` | | `--r-feld`, `--r-chip`, `--r-karte`, `--r-dialog`, `--r-tafel` | `--ds-radius-field`, `-chip`, `-card`, `-dialog`, `-panel` |
| `--linie`, `--linie-stark`, `--umriss` | `--ds-line`, `--ds-line-2`, `--ds-outline` | | `--r-status`, `--r-kachel` | `--ds-status-radius`, `--ds-tile-radius` |
| `--primaer`, `-hover`, `-druck`, `--auf-primaer` | `--ds-primary`, `-hover`, `-pressed`, `--ds-on-primary` | | `--erhebung-1/-2/-3` | `--ds-elev-1/-2/-3` |
| `--akzent`, `--auf-akzent` | `--ds-accent`, `--ds-on-accent` | | `--schrift`, `--schrift-mono` | `--ds-font`, `--ds-font-mono` |
| `--erfolg`, `-container`, `--auf-erfolg` | `--ds-success`, `-container`, `--ds-on-success-container` | | `--gewicht-text/-titel/-beschriftung` | `--ds-weight-regular/-title/-label` |
| `--warnung`, `-container`, `-flaeche`, `--auf-warnung` | `--ds-warning`, `-container`, `-surface`, `--ds-on-warning-container` | | `--groesse-anzeige` | `--ds-size-display` |
| `--gefahr`, `-container`, `--auf-gefahr` | `--ds-error`, `-container`, `--ds-on-error-container` | | `--t-ueberschrift/-titel/-untertitel/-lesen/-text/-dicht` | `--ds-font-headline/-title/-subtitle/-reading/-body/-dense` |
| `--invers`, `--auf-invers`, `--invers-primaer` | `--ds-inverse`, `--ds-on-inverse`, `--ds-inverse-primary` | | `--t-beschriftung/-chip/-meta/-klein/-anzeige/-code` | `--ds-font-label/-chip/-meta/-caption/-display/-code` |
| `--schleier` | `--ds-scrim` | | `--a1` … `--a8`, `--a10`, `--a12` | `--ds-space-1` … `-8`, `-10`, `-12` |
| `--deaktiviert-flaeche`, `-text` | `--ds-disabled-fill`, `--ds-disabled-ink` | | `--dauer-sofort/-schnell/-basis/-mittel/-langsam/-gleiten` | `--ds-dur-instant/-fast/-base/-medium/-slow/-glide` |
| `--link-unterstrich`, `-dicke`, `-abstand` | `--ds-link-underline`, `-thickness`, `-offset` | | `--kurve-standard/-bremsen/-beschleunigen/-betont` | `--ds-ease-in-out/-out/-in/-emphasized` |
| `--fuell-rund` | `--ds-fill-round` | | `--weg-s/-m/-l/-xl`, `--weg-blatt` | `--ds-distance-sm/-md/-lg/-xl`, `--ds-distance-sheet` |
| `--fokus`, `-breite`, `-abstand`, `-umriss`, `-ring` | `--ds-focus`, `-width`, `-offset`, `-outline`, `-ring` | | `--skala-eintritt`, `--skala-klein`, `--staffel` | `--ds-scale-enter`, `--ds-scale-small`, `--ds-stagger` |
| `--kopf-hoch`, `--schublade-breit` | `--ds-topbar-height`, `--ds-drawer-width` | | `--verzoegerung-lader/-start` | `--ds-delay-loader/-boot` |
| `--bahn-max`, `--mass`, `--meldung-platz` | `--ds-content-max`, `--ds-measure`, `--ds-toast-room` | | `--schleife-dreh/-dreh-schnell/-unbestimmt` | `--ds-loop-spin/-spin-fast/-indeterminate` |
| `--zustand-hover/-hover-gross/-druck/-deaktiviert` | `--ds-state-hover/-hover-lg/-pressed/-disabled` | | `--schleife-puls` | entfällt (`--ds-loop-pulse` ist veraltet; Skelette laufen auf `--ds-loop-skeleton`) |
| `--z-erhoben/-klebend/-schublade/-dialog/-meldung` | `--ds-z-raised/-sticky/-drawer/-dialog/-toast` | | `--deckkraft-veraltet` | `--ds-state-stale` |
| `--knopf-*` | `--ds-btn-*` | | `--i`, `--fortschritt`, `--indikator-*` | `--ds-i`, `--ds-progress`, `--ds-indicator-*` |
| | | | `--eintritt-*`, `--austritt-*`, `--bewegung-weg/-skala` | `--ds-enter-*`, `--ds-leave-*`, `--ds-motion-distance/-scale` |

Geblieben (nur ICT): `--campus-gruen`, `--schrift-marke`, `--gewicht-marke`, `--konto-breit`, `--diagramm-*` (§2.2).

**Klassen**

| Alt | Neu | | Alt | Neu |
|---|---|---|---|---|
| `.knopf` (+ `-primaer`, `-tonal`, `-leise`, `-still`, `-sinnbild`, `-scheibe`, `-klein`) | `.ds-btn` (+ `--primary`, `--tonal`, `--text`, `--quiet`, `--icon`, `--disc`, `--sm`) | | `body.app`, `[data-ohne-schublade]` | `div.ds-app.ds-app--drawer`, `[data-drawer-hidden]` |
| `.knopf-tausch` | `.ds-btn__faces` (über `DS.motion.busy`) | | `.sprungmarke` | `.ds-skip` |
| `.spinner(-klein)` | `.ds-spinner(--sm)` | | `.kopf`, `.kopf-menue`, `.kopf-marke` | `.ds-topbar`, `.ds-topbar__menu`, `.ds-brand` |
| `.status` (+ `-erfolg`, `-warnung`, `-gefahr`, `-laeuft`), `.status-spinner` | `.ds-status` (+ `--ok`, `--warning`, `--error`, `--running`), `.ds-status__spinner` | | `.konto`, `-text`, `-name`, `-email`, `-initiale` | `.ds-account`, `__text`, `__name`, `__email`, `__avatar` |
| `.banner` (+ `-erfolg`, `-warnung`, `-gefahr`), `.banner-text` | `.ds-alert` (+ `--success`, `--warning`, `--error`), `.ds-alert__text` | | `.schublade`, `-kopf`, `-liste`, `-gruppe`, `-titel`, `-eintrag`, `-text`, `-indikator`, `-schleier` | `.ds-drawer`, `__head`, `__list`, `__group`, `__heading`, `__item`, `__label`, `__indicator`, `.ds-scrim` |
| `.karte`, `-gefuellt`, `-kopf`, `-titel`, `-untertitel`, `-aktionen` | `.ds-card`, `--filled`, `__row`, `__title`, `__subtitle`, `__links` | | `.tafel-rahmen`, `.tafel`, `.bahn` | `.ds-panel`, `.ds-view`, `.ds-content > .ds-page` |
| `.unterabschnitt`, `.raster-2`, `.stapel` | `.ds-subsection`, `.ds-grid-2`, `.ds-stack` | | `.seitenkopf`, `-titel`, `-lead` | `.ds-page-head`, `__title`, `__lead` |
| `.kacheln`, `.kachel`, `-text`, `-wert`, `-unter` | `.ds-tiles`, `.ds-tile`, `__label`, `__value`, `__note` | | `.ladebalken`, `.ladezeile` | `.ds-loadbar`, `.ds-loading` (mit `.ds-loader--sm`) |
| `.kennwerte`, `.fakten`, `.teile`, `.meta`, `.hinweis` | `.ds-kv-list`, `.ds-facts`, `.ds-parts`, `.ds-meta`, `.ds-muted` | | `.skelett` (+ `-karte`, `-zeile`, `-titel` …) | `.ds-skeleton` (+ `__card`, `__line`, `--heading` …) |
| `.leerzustand`, `-scheibe`, `-titel`, `-text` | `.ds-empty`, `__disc`, `__title`, `__text` | | `.fortschritt-gruppe`, `.fortschritt`, `-balken`, `-text`, `-detail`, `.unbestimmt` | `.ds-progress`, `__track`, `__bar`, `__label`, `__detail`, `--indeterminate` |
| `.feld`, `-label`, `-hinweis`, `-fehler` | `.ds-field`, `__label`, `__hint`, `__hint--error` | | `.dialog`, `-schleier`, `-flaeche`, `-titel`, `-text`, `-knoepfe` | `dialog.ds-dialog` (nativ), `__backdrop`, `__box`, `__title`, `__text`, `__actions` |
| `.feld-eingabe`, `.feld-gefuellt` | `.ds-input`, `.ds-input--filled` | | `.blatt`, `-schleier`, `-flaeche`, `-breit`, `-kopf`, `-titel`, `-koerper` | `dialog.ds-sheet` (nativ), `__backdrop`, `__panel`, `__panel--wide`, `__head`, `__title`, `__body` |
| `.feld-raster(-3)`, `.feld-voll`, `.feld-reihe` | `.ds-form-grid--2/--3`, `.ds-field--full`, `.ds-inline-form` | | `.meldungen`, `.meldung`, `-fehler`, `-info`, `-text`, `-schliessen` | `.ds-toasts`, `.ds-toast`, `--error`, `--info`, `__text`, `__close` (gebaut von `DS.overlay.toast`) |
| `.suchfeld`, `.suche` | `.ds-search`, `.ds-input` | | `.tipp` | `[data-tip]`; das `.ds-tooltip` baut `DS.overlay.tooltips` |
| `.ankreuzen(-klein)` | `.ds-check(--sm)` | | `.eintritt` (+ `--blenden` … `--aufrichten`) | `.ds-enter` (+ `--fade`, `--scale`, `--slide`, `--swap`, `--delayed`, `--pop`, `--fill-x`, `--fill-y`) |
| `.aktionszeile`, `.werkzeugleiste` | `.ds-form-actions`, `.ds-action-bar` | | `.austritt` (+ `--sinken`, `--skalieren`, `--schieben`) | `.ds-leave` (+ `--sink`, `--scale`, `--slide`) |
| `.tabelle`, `-schlicht-rahmen`, `-sortierung`, `.dicht` | `.ds-table`, `.ds-table-wrap`, `.ds-table__sort`, `.ds-table--dense` | | `.staffel`, `.aufklappbar`, `.veraltet` | `.ds-stagger`, `.ds-collapsible`, `.ds-stale` |
| `.chips`, `.chips-trenner` | `.ds-chips`, `.ds-chips__divider` | | `.hat-indikator`, `.indikator(--sofort)` | `.ds-has-indicator`, `.ds-indicator(--instant)` |
| `.nur-sr`, `.ohne-umbruch`, `.zahl` | `.ds-sr`, `.ds-nowrap`, `.ds-num` | | `.aktiv` (gedrückter Knopf) | `[aria-pressed="true"]` |

**Keyframes:** `einblenden`/`ausblenden` → `ds-fade-in`/`ds-fade-out`, `anheben` → `ds-lift-in`, `wachsen` →
`ds-grow-in`, `einschieben` → `ds-shift-in`, `einrollen`/`ausrollen` → `ds-roll-in`/`ds-roll-out`, `aufploppen` →
`ds-pop-in`, `zeichnen` → `ds-draw`, `aufziehen`/`aufrichten` → `ds-fill-x`/`ds-fill-y`, `drehen` → `ds-spin`. Gehende
Elemente laufen auf `ds-fade-out` plus einer reinen Bewegung: `absinken` → `ds-drop-out`, `schrumpfen` →
`ds-shrink-out`, `wegschieben` → `ds-shift-out` (die alten Ziele `ds-sink-out`, `ds-scale-out`, `ds-slide-out` sind in
Dashboard-Style veraltet). `pulsieren` → `ds-skeleton-wave` (Skelette; `ds-pulse` ist veraltet), `unbestimmt` →
`ds-progress-head`/`ds-progress-tail` (`ds-indeterminate` ist veraltet). Das eigene CSS nennt Keyframes ohnehin nur
selten; meist laufen sie über die Klassen und `DS.motion`.

**Dateien:** `design.css` → `vendor/dashboard-style/ds.css` + `grund.css` + `thema.css` + `bausteine.css`;
`bewegung.css` → `vendor/dashboard-style/css/motion.css`; `bewegung.js` → `vendor/dashboard-style/ds.js` (`DS.motion`,
`DS.indicator`) mit der Hülle `Bewegung` in `bausteine.js`; Google Fonts → `vendor/dashboard-style/fonts/` und
`schriften/`.

**Umstellung auf Dashboard-Style 1.6.2 (Oktober 2026).** Weggefallen oder umbenannt sind diese ICT-Namen (Prüfung 7
meldet die meisten):

| Alt | Neu |
|---|---|
| `Bewegung.reduziert`, `DS.motion.prefersReducedMotion`, eigene `prefers-reduced-motion`-Weichen | entfällt: Bewegung ist auf jedem Gerät gleich (§6) |
| `Bewegung.kurveAusgleiten`, `staffeln`, `wiederholen`, `ladeHaltenMs`, `LADE_VERZOEGERUNG_MS`, `LADE_MINDESTENS_MS`, `ZAEHLEN_MS`, `STAFFEL_MAX` | die Tokens von Dashboard-Style; Abläufe über die Hüllen in §6.1 (`auftritt` = `staggerOnce`, `ladeAbwarten` = `settleLoader`) |
| `Bewegung.zahlenHochzaehlen` (Export), `[data-zahl]` | `UI.kachel({ zahl, schluessel })`, `Bewegung.auftritt`, `Bewegung.kennzahlenStill` |
| `UI.beschaeftigt(knopf, true\|false, text)`, `UI.beschaeftigtAbwarten` | `UI.beschaeftigt(knopf, arbeit, { text, fertig })` → Promise; Gesichter über `UI.knopf({ beschaeftigt, fertig })` |
| `speicherleiste().setzen({ beschaeftigt })`, `F.speicherleisteZeichnen({ geloescht, speichertGerade, speicherFehler, meta })`, `.speicherleiste-meta` | `speicherleiste().beschaeftigt(arbeit)`; `F.speicherleisteZeichnen({ neuModus, anzahl, neuText })` |
| `UI.knopfSperre`, `UI.feldFrei` | `UI.knopfSperren(knopf, grund)` bzw. `UI.feldFehler(feld, '')` |
| `UI.datenliste`, `UI.auswahlFuellen`, `UI.sortierKnopf`, `UI.meldungenAusrichten` | nur noch intern in `bausteine.js` bzw. `rahmen.js` (Vorschläge über `UI.eingabe({ vorschlaege })`, Sortierung über `UI.tabellenKopf`) |
| `Rahmen.erstauftritt`, `Rahmen.bereit` | `Rahmen.zustand('inhalt')`, `Rahmen.wechseln`, `Bewegung.auftritt` |
| `UI.tipp.verbergen`, `UI.meldung.fehlerSchliessen` | Esc und `DS.overlay`; `UI.meldungenFehlerSchliessen()` |
| `data-tipp`, eigenes `.tipp`-Element | `data-tip` bzw. `data-tip-abgeschnitten`, gezeigt von `DS.overlay.tooltips` |
| `#ansage` (eigene Live-Region), Meldungs-Timer 3,2 s, `--meldung-zusatz` | Ansagen, Lesezeit und Platz von `DS.overlay.toast` (`--ds-toast-bottom`, `--ds-toast-reserve`) |
| eigene Ebenen für Dialog, Blatt und Schublade (`div`, eigene Fokusfalle) | natives `<dialog>` über `DS.overlay.open/close` (§7) |
| `chip({ umschalten })`, Umschalt-Chip als `button.chip` mit `aria-pressed`, `.chip-haken` | `UI.chip({ gewaehlt })` → `label.ds-chip`; `art: 'radio'` für genau einen |
| `UI.schalter` als eigener Knopf `.schalter` | `label.ds-switch` mit `input[role=switch]`; ICT-eigen nur `.schalter-gesperrt` |
| `.knopf-weiter`, `knopf({ sinnbildGroesse })` | `UI.knopf({ weiter: true })` (Pfeil ohne eigene Klasse); feste Sinnbild-Grössen |
| `listenZeile({ marke, pfeil })`, `zaehler({ ploppen })`, `skelettSeite({ ladeleiste })`, `F.zeichneBereich` mit `neuBauen` | entfällt (Zahlmarke über `UI.karte({ marke })`; der Zähler ploppt von selbst von leer auf eine Zahl) |
| `.aufgabe*` (Handlungsbedarf als Zeilenliste) | `UI.karte({ href, marke })` mit `.karte-marke` |
| `.wechsel-weg` | `Rahmen.wechseln` über `DS.motion.transition` |
| `UI.bestaetigen(titel, frage, knopf)`, `UI.meldung(text, true\|"ton")`, `UI.knopf`/`banner`/`leerzustand`/`karte`/`kachel`/`formZeile` mit Positionsparametern, Status-Töne `info`/`leise`/`marke`/`fehler`/`ok` | nur noch die Formen mit Optionsobjekt und die Töne aus §4.1 |
| `body.ds-app[data-seite]`, `header.ds-topbar`, Ladebalken im Gerüst, `.ds-content.ds-page` auf einem Element | Gerüst aus §10.1 (`div.ds-app[data-seite]`, `div.ds-topbar`, `.ds-content > .ds-page`, Ladebalken nur beim Laden) |
| `<style>@view-transition { navigation: auto; }</style>` in jeder Seite | `css/optional/view-transitions.css` + `<link rel="expect">` (§10.1) |
| `--ds-input-font` und `--ds-spinner-track` in `thema.css` | entfällt (Feldtext 16 px auf dem Telefon, Bogen-Spinner ohne Spur wie in Dashboard-Style) |
| `.ds-table--interactive` nachgebaut (`cursor: pointer` auf Zeilen, `zeileOeffnen`) | `table.ds-table--interactive` + `a.ds-table__row-link`, Zellklick über `UI.tabellenRahmen` |
