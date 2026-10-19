# Styleguide «ICT-Inventar»

Stand: 19.10.2026 · Gilt für alle Seiten unter `frontend/` (index, client, benutzer, telefon, software, kamera,
kamerarolle und styleguide.html).

**Massgebend ist [Dashboard-Style](https://github.com/saschazesiger/Dashboard-Style)**, das gemeinsame Design-System
(Material 3 im Aufbau der Google-Konsolen). Es liegt als unveränderte Kopie in `vendor/dashboard-style/` und bringt
Tokens, Bausteine, Bewegung und Sinnbilder mit. Seine Dokumentation (Englisch) gilt hier ohne Abstriche:

| Thema | Dashboard-Style |
|---|---|
| Tokens, drei Ebenen | [docs/tokens.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/tokens.md) |
| Thema überschreiben | [docs/theming.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/theming.md) |
| Markup jedes Bausteins | [docs/components.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/components.md) |
| Bewegung, `DS.motion` | [docs/motion.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/motion.md) |
| Sinnbilder, `DS.icons` | [docs/icons.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/icons.md) |
| Design-Regeln | [docs/rules.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/rules.md) |
| Kopie anlegen und prüfen | [docs/install.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/install.md) |
| Neutraler Styleguide | `styleguide/index.html` im Repository (läuft auch von der Festplatte) |

Dieses Dokument nennt nur, was ICT-Inventar **darüber hinaus** festlegt: das Campus-Thema, die Bausteine, die es nur
hier gibt, die deutschen Bauer (`UI.*`, `Rahmen.*`, `Bewegung.*`, `F.*`), die bewussten Abweichungen und die Regeln
für Inhalte. Die vollständigen Signaturen stehen in den Kopfkommentaren von `bausteine.js` (`UI`, `Bewegung`),
`rahmen.js` (`Rahmen` und Ebenen) und `fenster.js` (`F`); bei einem Widerspruch gilt der Code. Die Kurzfassung für
Agenten und neue Mitarbeitende (Befehle, Konventionen, welcher Bauer wofür) steht in [`AGENTS.md`](../AGENTS.md).

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
| Kopie | `vendor/dashboard-style/` (`ds.css`, `ds.js`, `css/`, `js/`, `fonts/`, `LICENSE`, `VERSION`, `SHA256SUMS`) | **Nie von Hand ändern.** Aktualisiert wird sie nur mit `vendor.ps1`/`vendor.sh` (§11); `code/Pruefe-Frontend.ps1` vergleicht jede Datei mit `SHA256SUMS`. `.gitattributes` schützt den Ordner vor umgeschriebenen Zeilenenden. |
| Gültigkeitsbereich | `<html class="ds-theme ds-base">` | Die Tokens hängen an `.ds-theme` (nicht an `:root`); `.ds-base` setzt Grund, Schrift, Links, Code, Fokus und `[hidden]`. |
| CSS | `ds.css` (alle Dateien in Kaskadenreihenfolge) | Danach `thema.css`, `bausteine.css`, `rahmen.css`, die Seitenvorlage (§12). |
| JavaScript | `ds.js`, klassisch → `window.DS` | `DS.motion`, `DS.indicator`, `DS.icons`. Seiten rufen `DS` nicht direkt auf: `Bewegung.*` und `UI.sinnbild` sind die deutschen Hüllen darum (§4, §6). Kein `DS.icons.icon()` (liefert HTML-Text) und kein `DS.dom.morphHtml` – nur `DS.icons.iconElement` (baut das `<svg>` ohne `innerHTML`). |
| Schriften | `vendor/dashboard-style/fonts/` (Google Sans), `schriften/` (Archivo) | Beide selbst gehostet, Lizenz SIL OFL 1.1 je als `OFL.txt` daneben. Kein Google Fonts mehr; die Inhaltsrichtlinie in `_headers` erlaubt Schriften nur von `'self'`. |

Namen: Tokens heissen `--ds-*`, Klassen `.ds-*`, die Keyframes `ds-*`. Deutsch bleiben die sichtbaren Texte, die
JS-Namensräume (`UI.knopf`, `Rahmen.zustand`, `Bewegung.eintreten`, `F.feld`) und die Klassen und Tokens der
ICT-eigenen Bausteine (`.speicherleiste`, `.zeitachse`, `--diagramm-a`). Die Tabelle alt → neu steht in §13.

Grundsätze (aus Dashboard-Style, hier verbindlich): getönter Grund mit **einer** weissen Tafel als einzigem Roller;
Haarlinien statt Schatten (Schatten nur für Schwebendes); **eine** Tönung (das Pastell); jede Aktion eine Pille,
Hover und Druck als Zustandsebene, nie Anheben oder Vergrössern; Status nie nur über Farbe; Links unterstrichen;
Hierarchie über Schrift (nur 400 und 500, Satzschreibung); 4er-Raster; ruhige Bewegung (§6); die Seite rollt nie
waagrecht.

---

## 2. Campus-Thema (`thema.css`)

`thema.css` wird direkt nach `ds.css` geladen und überschreibt Rollen auf demselben Selektor `.ds-theme`. Es enthält
**nur Tokens und die Schrift der Wortmarke**, keine Bausteine. Bewegungs-Tokens (`--ds-dur-*`, `--ds-ease-*`,
`--ds-distance-*`, `--ds-scale-*`, `--ds-stagger`, `--ds-delay-*`, `--ds-loop-*`) setzt kein Thema: der Schalter für
reduzierte Bewegung in Dashboard-Style hängt daran (Prüfung 2). Was Dashboard-Style schon richtig hat (Textfarben
#1f1f1f/#444746/#747775, Statusfarben, Radien, Schatten, Google Sans, Typo-Rollen, Masse), steht nicht noch einmal da.

### 2.1 Campus-Werte für Rollen von Dashboard-Style

| Token | Wert | Verwendung |
|---|---|---|
| `--ds-backdrop` | `#f3f4f2` | Grund, Kopf, Schublade; Hover von Tabellenzeilen – leicht grünlich statt Google-Grau |
| `--ds-surface-low` | `#f9f9f7` | Kacheln, gefüllte Karte, neutrales Banner, aktuelle Listenzeile, Code, nur lesbare Felder |
| `--ds-surface-high` | `#edeeec` | Suche, gefüllte Felder, neutraler Status-Chip, stiller Zähler, Zahlmarke |
| `--ds-surface-highest` | `#e2e3e1` | Schalterspur aus, Skelettlinien, Spinnerspur |
| `--ds-line` | `#e2e3e1` | passive Haarlinie: Karten, Trenner, Tabellenzeilen |
| `--ds-primary` | `#1a3c25` | gefüllter Knopf, Text-Knopf, Links, Fokus, Schalter an, Fortschritt, Zeitachsenpunkt |
| `--ds-primary-hover` / `-pressed` | `#2c4c36` / `#153220` | Referenzwerte (Primär + 8 % Weiss bzw. dunkler) |
| `--ds-accent` / `--ds-on-accent` | `#cfdfad` / `#1a3c25` | **die einzige Tönung**: aktive Navigation, gewählter Chip, Tonal-Knopf, Zähler, Leerzustand-Scheibe, Spur von Fortschritt und Ladebalken, Textauswahl |
| `--ds-inverse-primary` | `#a1d73b` | Erfolgs-Sinnbild und Aktion in der Meldung |
| `--ds-link-underline` | `rgba(26, 60, 37, .4)` | Linie unter Links in Ruhe |
| `--ds-spinner-track` | `var(--ds-surface-highest)` | Spur des Spinners wie die Skelette, nicht die Haarlinie |
| `--ds-input-font` | `var(--ds-font-body)` | Felder bleiben auch auf dem Telefon 14 px (§5) |

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

**Laufzeit- und Komponentenvariablen** der eigenen Bausteine setzen Bauer und `rahmen.js`, nie Seiten: `--anteil`
(Balken, Säulen), `--leiste-hoehe`, `--leiste-reserve`, `--leiste-rest`, `--leiste-unten` (Speicherleiste),
`--bahn-unten`, `--meldung-zusatz` (Meldung über der Leiste),
`--rollleiste`, `--dialog-fokusraum`, `--sinnbild-achse`. Die Variablen von Dashboard-Style (`--ds-i`,
`--ds-progress`, `--ds-indicator-*`, `--ds-toast-*`, `--ds-btn-*` …) setzt ebenso nur der Code.

---

## 3. Layout

### 3.1 Rahmen (alle Seiten gleich)

```
┌ Kopf 64 px: [≡ ≤900] ICT.INVENTAR ·············· ( (A) Name / E-Mail │ Abmelden ) ┐
│ Schublade 256 px │ ╭──── Tafel (weiss, Radius 20 oben, EINZIGER Roller) ───────────────╮ │
│ Gruppen in       │ │ ▔▔ Ladebalken 4 px (klebt)                                         │ │
│ Satzschreibung,  │ │  .ds-page  max 1280, Polster 24 / 32 / unten Platz, Abstand 20     │ │
│ 48-px-Pillen,    │ │   Seitenkopf (‹ Zurück · h1 24/32 · Teile · Status · Aktionen)    │ │
│ aktiv = Pastell  │ │   Karten · Kacheln · Tabellen …                                    │ │
│                  │ │                                        ╭ Speicherleiste ╮          │ │
└──────────────────┴─╰ [Meldung unten links] ──────────────────────────────────────────╯─┘
```

| Teil | Klasse / Bau | Regeln |
|---|---|---|
| Seite | `body.ds-app.ds-app--drawer[data-seite]` | Raster aus Kopf, Schublade, Tafel (Dashboard-Style `shell.css`); rollt nie. `rahmen.js` baut Kopf und Schublade **sofort beim Laden** aus dem Gerüst (§10.1). |
| Kopf | `header.ds-topbar` (rahmen.js) | Links [Menüknopf ≤ 900 px] und die **Wortmarke** «ICT.INVENTAR» (`.wortmarke`, Link zur Übersicht) auf der linken Kante der Navigationssinnbilder. Rechts **auf allen Seiten** EINE Kapsel `.kopf-konto` (48 px, Pille, weiss, Haarlinie) mit `.ds-account` (Initiale 32 px, Name, E-Mail bis `--konto-breit`), Trenner und «Abmelden» (Text-Knopf). Das Konto der vorigen Seite belegt den Kopf vom ersten Bild an vor; die Wortmarke wartet höchstens 300 ms auf Archivo. Vorführmodus: Konto «Vorführmodus», kein «Abmelden». |
| Schublade | `nav.ds-drawer` über `Rahmen.navigation` bzw. `F.navZeichnen` | Gruppentitel in Satzschreibung, Einträge 48-px-Pillen (`.ds-drawer__item`), Zähler `.schublade-zahl` rechts. Aktiv: gleitender Indikator + 500 + `aria-current="page"`. Einträge sind echte Links. Hauptseite: je Modul zuerst seine «Übersicht», dann die Listen · «Geräte»: Übersicht, ADMIN-Clients, EDU-Clients · «Verzeichnis»: Übersicht, Benutzer, Telefonnummern, Software · «Videoüberwachung»: Übersicht, Kameras, Kamerarechte (`Rahmen.HAUPTZIELE`, einzige Quelle). Detailseiten: zuoberst der Zurück-Eintrag `.schublade-zurueck` («← ADMIN-Clients», Link zur gemerkten Liste), darunter die Bereiche des Datensatzes in Gruppen. |
| Ohne Schublade | `navigation({ verstecken: true })` → `[data-drawer-hidden]` | Neu-Formulare, Fehler- und Endzustand der Detailseiten: Tafel volle Breite, die Wortmarke bleibt an ihrer Stelle. |
| Tafel | `.ds-panel > main.ds-view#tafel` | Weiss, Radius 20 oben, einziger Roller. |
| Ladebalken | `.ds-loadbar#ladebalken` | 4 px, klebt oben in der Tafel (nicht im Skelett, §5), erst nach 200 ms. |
| Bahn | `.ds-content.ds-page#inhalt` | Höchstens 1280 px, eine Spalte `minmax(0, 1fr)`, 20 px Abstand; unten Platz für eine zweizeilige Meldung (`--bahn-unten`). Container «bahn»: schmale Darstellungen richten sich nach der Bahn. `data-zustand="laden\|fehler\|ende"` blendet den Seiteninhalt aus (`.bahn-zustand`). |

### 3.2 Hauptseite (`index.html`)

- Ansichten `section.ansicht.ds-stack#ansicht-<n>` (Übersichten `geraete`, `verzeichnis`, `videoueberwachung`;
  Listen `admin`, `edu`, `benutzer`, `telefone`, `software`, `kameras`, `kamerarechte`), genau eine sichtbar. Der Hash trägt Ansicht und Zustand (`#admin?q=…`):
  Ansichtswechsel mit `pushState`, Filter, Sortierung und Spalten mit `replaceState`.
- Jede Ansicht beginnt mit einem Seitenkopf (h1 24/32, ohne Lead).
- **Tabellenansichten:** Werkzeugleiste `.ds-action-bar` (Suche · «Filter» · «Spalten» mit Zahl · «CSV» · rechts
  Trefferzahl und «Neuer …» – bei «Benutzer» keiner, die Liste pflegt der Abgleich), darunter die Chips aktiver Filter,
  darunter der Tabellenrahmen `.tabelle-rahmen`. `Rahmen.fest(true)`: ab 601 × 720 px rollt die Tafel nicht, die
  Liste füllt den Rest und rollt selbst (Kopf und erste Spalte kleben).
- **Übersicht**, je Modul eine (Geräte, Verzeichnis, Videoüberwachung; Inhalt aus `MODUL` in `app.js`):
  Handlungsbedarf (Zeilenliste mit Zahlmarken, Gefahr vor Warnung; leer: Erfolgsbanner) · Bestand (eine Karte je
  Liste: Hauptzahl als Kachel, darunter klickbare Kennwerte) · Ersatzplanung (Zeitstrahl je Geräte- bzw. Kameraliste,
  wo das Modul eine hat) · Verteilungen. Jede Zahl öffnet die passende Liste, schon gefiltert.
- **Software:** Suche + «Neues Programm», eine Karte je Programm.

### 3.3 Detailseiten (`client`, `benutzer`, `telefon`, `software`, `kamera`, `kamerarolle`)

In der Bahn stehen nur `header.ds-page-head#<p>-kopf` und `div.fenster-bereich#<p>-bereich` (Präfix `g`, `b`, `tf`,
`sw`, `km`, `kr`); alles andere baut das Gerüst `F` aus `fenster.js`.

| Teil | Regeln |
|---|---|
| Seitenkopf (`F.seitenkopf`) | Zurück-Link `.seitenkopf-pfad` («‹ ADMIN-Clients», Text-Knopf klein) zur **gemerkten Listenadresse samt Suche, Filtern und Sortierung** – nur, wo die Schublade ihn nicht trägt (Neu-Modus, Fehler- und Endzustand, Fenster ≤ 900 px); Titel h1; Teile-Zeile («Haus A / 1. OG · Latitude 5540 · …»); Status-Chips nur für Abweichungen; **Schnellaktionen rechts** als Text-Knöpfe mit Sinnbild, **«Löschen …» zuletzt**. Gesperrt mit Grund, solange etwas ungespeichert ist; die Knöpfe bleiben stehen, nur die Sperre wechselt (§4.4). |
| Bereich (`F.zeichneBereich`) | Karten im 20-px-Rhythmus (`.fenster-bereich`, `.ds-stack`, `.karten`, `.ds-grid-2`). Neu zeichnen bewahrt Fokus, Schreibmarke und Rollpositionen. |
| Bereichswechsel (`F.bereichWechseln`) | Adresse per `replaceState` (`#stammdaten`), Indikator gleitet, Inhalt blendet durch. |
| Zustände | `F.zeigeLaden`, `F.ladefehler`/`F.zeigeFehler` (mit Zurück-Link, ohne Schublade), Endzustand nach dem Löschen mit «Zur Liste». |
| Unten | Speicherleiste (§7.5), Meldungen (§7.3). |

### 3.4 Breiten und Umbrüche

| Grenze | Verhalten |
|---|---|
| Fenster ≤ 1100 px | Kacheln 4 → 2 Spalten |
| Bahn ≤ 1040 / ≤ 520 px | genau vier Fakten: 2 × 2 / untereinander |
| Fenster ≤ 900 px | **Schublade modal**: Menüknopf links im Kopf, Schleier, gleitet von links, Fokusfalle, Esc, schliesst bei Wahl. `.ds-grid-2` einspaltig. |
| Bahn ≤ 760 px (Dialog, Blatt: Fenster ≤ 760 px) | Formularraster einspaltig |
| Fenster ≤ 720 px | Konto als Initiale in der Kapsel (Tooltip mit Name und E-Mail, ein Tabstopp); Bahn-Polster 20 oben, 16 seitlich; Chip-Trenner weg |
| Bahn ≤ 600 px | Seitenkopf-Aktionen links unter dem Titel |
| Fenster ≤ 600 px | Tafel randlos (Oberkante bleibt rund); Wortmarke 16/24; Kartenpolster 16; Blatt volle Breite ohne Radius; Meldung über die ganze Breite; Speicherleiste 16 px vom Rand; Aktionen von Listenzeilen und Chips von Schalterzeilen rutschen unter den Text |
| unter 601 × 720 px | Tabellenansichten rollen mit der Tafel (§3.2) |
| Fenster ≤ 359 px (320 px, 400 % Zoom) | Kapsel nur mit «Abmelden» (Konto nur für Screenreader), Tabellenpolster 8 px |

---

## 4. Bausteine

Seiten bauen **nur** über `UI.*`, `Rahmen.*`, `Bewegung.*` und `F.*`. Für alle Bauer gilt: Sie geben einen DOM-Knoten
zurück, setzen Text nur per `textContent`, nehmen Optionen als Objekt (die alten Positionsparameter gehen weiter),
schreiben leere Werte als «–» und

- `fokus: 'schluessel'` setzt `data-fokus` – damit finden Neuzeichnen und Rückfokus das Element wieder (jedes Bedienelement ohne `id` braucht es);
- `titel` ist der eigene Tooltip (`data-tipp`), nie das Browser-`title`;
- was sich an Ort und Stelle ändert, hat Methoden am Knoten (`.setzen()` …): umschalten, nicht neu bauen.

### 4.1 Gemeinsame Bausteine: Bauer → Dashboard-Style

Aussehen, Masse und Zustände stehen in [docs/components.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/components.md).

| Bauer | Markup | Hinweise für ICT |
|---|---|---|
| `UI.knopf({ text, variante, sinnbild, klein, weiter, titel, gedrueckt, deaktiviert, gesperrt, … })` | `.ds-btn` + `--primary` / `--tonal` / `--text` (`'leise'`) / `--quiet` (`'still'`) / `--icon` (`'sinnbild'`) / `--sm` (`klein`) / `--disc` | genau **eine** gefüllte Hauptaktion je Bereich; keine roten Knöpfe; «…» am Ende heisst Rückfrage folgt; `weiter: true` → `.knopf-weiter` (§4.2); gedrückt = `aria-pressed` |
| `UI.knopfSperren`, `UI.knopfSperre`, `UI.beschaeftigt`, `UI.beschaeftigtAbwarten` | `[aria-disabled]`, `[aria-busy]`, `.ds-btn__swap` | **gesperrt mit Grund** bleibt fokussierbar, der Tooltip nennt den Grund, Klicks schluckt `bausteine.js` – immer so für Schnellaktionen; beschäftigt: Spinner nach 200 ms, mindestens 450 ms |
| `UI.status(text, ton, { sinnbild, titel })` | `.ds-status` + `--ok` / `--warning` / `--error` / `--running` | Töne `erfolg`, `warnung`, `gefahr`, `neutral`, `laeuft`, `wartet` (Uhr), `aus` (Verbot). Der **Normalfall bekommt keinen Chip**; «Frei» (Telefonnummer) ist neutral mit `checkKreis` |
| `UI.banner({ titel, text, ton, knopf, rolle })` | `.ds-alert` + `--success` / `--warning` / `--error` | `info` neutral, nie blau; mehrere Knöpfe in `.banner-knoepfe` (§5) |
| `UI.leerzustand({ sinnbild, titel, text, aktion })` | `.ds-empty` | höchstens ein Satz, höchstens eine Aktion (tonal) |
| `UI.hinweis`, `UI.meta`, `UI.teile` | `p.ds-muted`, `p.ds-meta`, `.ds-parts` | |
| `UI.spinner`, `UI.ladezeile`, `UI.skelettSeite`, `UI.fortschritt` | `.ds-spinner(--sm)`, `.ds-loading`, `.ds-skeleton`, `.ds-progress` | Ladeanzeigen erst nach 200 ms; kein Grossspinner |
| `UI.karte({ titel, unter, aktionen, fuss, sinnbild, breit, gefuellt, ebene })` | `section.ds-card` (`--filled`), `.ds-card__row`, `__title`, `__links`; dazu die ICT-Hilfen `.karte-inhalt`, `.karte-kopf-aktionen` | `unter` nur, wo er Nicht-Offensichtliches sagt; Zwischentitel `.ds-card__subtitle`, Teil `.ds-subsection` |
| `UI.kachel`, `UI.kacheln` | `.ds-tiles > .ds-tile` (als `button`/`a` klickbar) | **die Zahl wird nie gefärbt**; `ton` setzt nur ein Sinnbild; `zahl` zählt beim ersten Zeigen hoch |
| `UI.kennwerte`, `UI.fakten` | `ul.ds-kv-list`, `dl.ds-facts` | klickbare Kennwerte: `.kennwerte-klickbar` (§4.2) |
| `UI.feld`, `UI.eingabe`, `UI.feldFehler`, `UI.ankreuzen` | `.ds-field`, `.ds-input` (`--filled`), `.ds-field__hint(--error)`, `.ds-check(--sm)` | Beschriftung immer **über** dem Feld; Raster `.ds-form-grid--2/--3`, `.ds-field--full`, Reihe `.ds-inline-form`, Aktionszeile `.ds-form-actions` |
| `UI.suchfeld({ kuerzel: '/', … })` | `.ds-search` + `kbd.kuerzel` | Esc leert eine gefüllte Suche (und nur das) |
| `UI.tabelle` | `.ds-table-wrap > table.ds-table` | schlicht in Karten; Blenden nur, wo es seitlich weitergeht |
| `UI.tabellenKopf`, `UI.sortierKnopf` | `.ds-table__sort`, `th[aria-sort]`, `.ds-table--dense` | `thead` einmal bauen, `sortierungSetzen` nachführen |
| `UI.chips` | `.ds-chips`, `.ds-chips__divider` | Chips selbst sind ICT-eigen (§4.2) |
| `UI.sinnbild(name, groesse, klasse)` | `<svg class="icon">` aus `DS.icons.iconElement` | `UI.SINNBILDER` ordnet die deutschen Namen den Glyphen von `DS.icons` zu; ein neues Sinnbild kommt zuerst in Dashboard-Style, dann hier ein deutscher Name. Grössen: 20 Navigation/Icon-Knöpfe/Banner, 16 in Knöpfen/Chips/Listen, 18 Häkchen im Chip, 24 Leerzustand. Unbekannter Name → `console.error` |
| `Rahmen.*`, `UI.dialog`, `UI.blatt`, `UI.meldung`, `UI.tipp` | `.ds-topbar`, `.ds-drawer`, `.ds-panel`, `.ds-view`, `.ds-page-head`, `.ds-dialog`, `.ds-sheet`, `.ds-toast`, `.ds-tooltip` | §3, §7 |

### 4.2 Bausteine, die es nur in ICT-Inventar gibt

Klassen in `bausteine.css` (Bausteine) und `rahmen.css` (Rahmen und Ebenen), gebaut von denselben Bauern. Sie folgen
denselben Regeln wie Dashboard-Style und lesen nur `--ds-*`-Tokens und die ICT-Tokens aus §2.2.

| Baustein | Klassen | Bauer | Warum eigen |
|---|---|---|---|
| Wortmarke | `.wortmarke`, `.wortmarke-punkt` | `rahmen.js` | Zeichen des Inventars: Archivo 650, 112 % breit, Versalien, Punkt in `--campus-gruen`; steht auf der linken **Kante** der Navigationssinnbilder (eine Textmarke hat keine Achse) |
| Konto-Kapsel | `.kopf-konto`, `.kopf-konto-trenner`, `.kopf-abmelden` | `Rahmen.konto`, `Rahmen.abmelden` | Konto und «Abmelden» in einer Pille |
| Schublade: Zurück, Zähler | `.schublade-zurueck`, `.schublade-eintrag-zurueck`, `.schublade-zahl` | `Rahmen.navigation` | Detailseiten führen zur gemerkten Liste zurück |
| Seitenkopf-Zusätze | `.seitenkopf-pfad`, `-zeile`, `-text`, `-unter`, `-status`, `-aktionen` | `UI.seitenkopf`, `F.seitenkopf` | Zurück-Link, Status und Schnellaktionen neben dem Titel; `F.seitenkopf` gleicht an Ort und Stelle ab (Kopfaktionen nur mit `beiKlick`, gesperrt über `gesperrt:` bzw. `F.beschaeftigt`) |
| Zustände der Seite | `.bahn-zustand`, `.bahn-vorfuehrung`, `.zustand-laden`, `.zustand-fortschritt` | `Rahmen.zustand`, `Rahmen.vorfuehrung` | Laden, Fehler, Ende, Vorführband |
| Detailbereich | `.fenster-bereich`, `.wechsel-weg` | `F.zeichneBereich` | Gerüst der Detailseiten, Seitenübergänge |
| Speicherleiste | `.speicherleiste*` | `F.speicherleisteZeichnen`, `UI.speicherleiste` | genau ein Speicherweg (§7.5) |
| Knopf mit Weiter-Pfeil | `.knopf-weiter` | `UI.knopf({ weiter: true })` | der Pfeil rückt beim Hover 4 px nach |
| Filter-Chips als Knöpfe, Zähler | `.chip`, `.chip-haken`, `.chip-entfernbar`, `.chip-x`, `.chip-text`, `.zaehler(-still)` | `UI.chip`, `UI.zaehler` | Dashboard-Style baut Chips aus Kästchen; ICT braucht Umschalter mit `aria-pressed` und entfernbare aktive Filter («Hersteller: HP ×»). Zähler ploppt nur von leer auf eine Zahl |
| Datenzeilen | `.datenzeilen`, `.datenzeile*`, `.schloss`, `.geaendert` | `UI.datenzeilen`, `UI.feldZeile`, `UI.formZeile`, `F.feld` | Name/Wert-Zeilen zum Lesen und Bearbeiten; Schloss «Vom Abgleich gesetzt.»; geändert = Punkt + «(geändert)» |
| Hinweisliste | `.hinweise`, `.hinweis-zeile*` | `UI.hinweise`, `UI.hinweisZeile` | der Ton färbt nur das Sinnbild |
| Formular-Zusätze | `.eingabe-schmal`, `.mit-sinnbild`, `.hinweis-platz`, `.mehrfach` | `UI.eingabe({ schmal })`, `UI.feldHinweis`, `UI.hinweisPlatz`, `UI.mehrfach` | schmale Felder, Live-Hinweis, Kästchenliste mit Zahlen |
| Schalter mit drei Zuständen | `.schalter`, `.schalter-zeile`, `-feld`, `-name`, `-text`, `-unter`, `-wort`, `-zusatz` | `UI.schalter`, `UI.schalterZeile` | aus / an / an und gesperrt (Schloss im Griff, Tooltip nennt die AD-Gruppe); `.ds-switch` kennt die Sperre nicht |
| Liste über die ganze Seite | `.tabelle-rahmen`, `.tabelle-kopf-text`, `.name-link` | `UI.tabellenRahmen`, `UI.rollKanten` | eigener Roller, Kopf und erste Spalte kleben, Blende nur bei mehr Spalten rechts |
| Zeilenliste, Zahlmarke | `.zeilenliste`, `.listen-zeile*`, `.zahlmarke` | `UI.listenZeile`, `UI.zeilenliste`, `UI.zahlmarke` | ganze Zeile klickbar mit Pfeil; Zahlmarke tonal nach Dringlichkeit, dazu das Wort |
| Zeitachse | `.zeitachse*` | `UI.zeitachse` | Grundlage des Verlaufs; automatische Einträge grau mit `sync` |
| Balken, Säulen, Verteilung | `.balken*`, `.saeulen`, `.saeule*`, `.verteilung*`, `.kennwert*` | `UI.balken`, `UI.saeulen`, `UI.verteilung` | Anteil als `scaleX`/`scaleY` über `--anteil`; Farben nur `--diagramm-*`; wachsen nur beim ersten Zeigen |
| Verlauf | `verlauf.css` (`vl-*`) | `Verlauf.zeichnen` (`verlauf.js`) | genau eine Karte «Verlauf»; gespeichert wird über den Entwurf und die Speicherleiste |
| Hilfen | `.icon`, `.t-erfolg/-warnung/-gefahr/-info/-leise/-still/-stark`, `.kuerzel`, `.code-block`, `.anzahl` | – | Tonklassen nur zusammen mit Sinnbild oder Wort |

### 4.3 Regeln, die für ICT dazukommen

- **Knöpfe:** Im Dialog zuerst «Abbrechen» (Text), dann rechts die Hauptaktion, die die Folge nennt («Archivieren»,
  «Löschen»). `deaktiviert` (`disabled`) nur ohne erklärbaren Grund, sonst `gesperrt: 'Grund'`.
- **Status-Chips:** zeigen Abweichungen («Archiviert», «Im Lager», «Ersatz überfällig», «Nicht in SCCM», «Nicht
  zugewiesen»). Mit `titel` wird der Chip ein Tabstopp – darum `titel` nur, wo er etwas sagt. Zeilen werden nie
  getönt. Der Zustand eines AD-Kontos kommt immer aus `Modell.adStatus(b)`.
- **Formulare:** Felder einer Detailseite nur über `F.feld` (id `<p>-eingabe-<Feld>`, Wert aus dem Entwurf, Punkt
  «geändert», Feldfehler aus dem Speicherablauf) – Kästchen eingeschlossen. Eine ganze Zahl, die der Browser umdeuten
  könnte, ist ein Textfeld mit `inputMode = 'numeric'`, und `pruefen()` hält alles andere mit einem Feldfehler auf.
- **Tabellen:** Tabellenzeilen und Zahlen in Tabellen animieren nie; leere Liste: Rahmen `hidden`, Leerzustand
  zeigen. Ein Zeilenklick öffnet im selben Tab, Ctrl-/Mittelklick in einem neuen.
- **Schalter:** ein Klick schaltet an Ort und Stelle um; `beiWechsel` → `false`, abgelehntes Promise oder Fehler setzt
  zurück. Nie neu bauen, um umzuschalten – `.setzen()`.

### 4.4 Seitenkopf
`UI.seitenkopf({ titel, lead, unter, status, aktionen, pfad, ebene = 1, id, titelId, element })` → `.setzen({ … })`;
auf Detailseiten **`F.seitenkopf`**. Titel 24/32 (h1, `tabindex=-1` als Fokusziel), Teile-Zeile leise, Status-Chips
8 px darunter, Aktionen rechts (Bahn ≤ 600 px: darunter). Ein Text-Knopf hängt sein Polster in den Rand und fluchtet
mit Titel und Karten. Wechselt nur die Sperre eines Kopfknopfs (Tippen, Speichern, Verwerfen, `F.beschaeftigt`),
schaltet der stehende Knopf sie an Ort und Stelle um, und ein Fokus darauf bleibt.

---

## 5. Abweichungen von Dashboard-Style

Jede Abweichung steht mit Grund am Ort im Code (`bausteine.css` Abschnitt 2, `rahmen.css`). Neue Abweichungen nur mit
Grund – und lieber in Dashboard-Style selbst, wenn sie für jedes Projekt gelten (§11).

| Thema | Dashboard-Style | ICT-Inventar | Warum |
|---|---|---|---|
| Thema | neutral, Google-Blau | Campus-Grün, getönter Grund (§2) | Erscheinungsbild von Campus Sursee |
| Markenzeichen | `.ds-brand`: 32-px-Logo auf der Achse der Navigationssinnbilder | Wortmarke auf ihrer **Kante** | eine Textmarke hat keine Achse |
| Felder auf dem Telefon | 16 px unter 600 px (iOS zoomt sonst) | 14 px (`--ds-input-font`) | unverändert gegenüber dem bisherigen Frontend (wie die Admin-Oberfläche von ChatBob) |
| Filter-Chips, Schalter | Kästchen mit Label (`.ds-chip`, `.ds-switch`) | Knöpfe (`.chip`, `.schalter`) | Umschalter mit `aria-pressed`, entfernbare Filter, Sperre mit Schloss |
| Kartenrhythmus | Abstände je Baustein | 16 px zwischen allen Kindern einer Karte und ihres Inhaltsbereichs; Zwischentitel 24/8 px; Fakten 20 px | die ICT-Bausteine (Datenzeilen, Hinweise) bringen keinen eigenen Rand mit |
| Stapel | `.ds-stack` 16 px (20 px nur direkt in `.ds-page`) | 20 px auch verschachtelt, in Karten 16 px | Bereiche der Detailseiten sind Stapel in einem Stapel |
| Leiser Text | `p.ds-muted` ohne Rand nur in Karte und Seite | nie Browser-Ränder, auch in Blatt und Dialog | Blätter und Dialoge setzen den Abstand selbst |
| Banner mit Knöpfen | ein Knopf rechts | Knopf kompakt (32 px), auch mehrere (`.banner-knoepfe`), rutscht unter den Text, wenn dieser schmaler als 8em würde | lange Warnungen mit Handlung |
| Tabelle in Karte | Blende am Rand auf dem Telefon immer | Blende nur, solange es dort weitergeht (`data-mehr-rechts`, `data-gerollt-x`) | sonst wirkt eine vollständige Tabelle abgeschnitten |
| Ladebalken | steht im Skelett | klebt oben in der Tafel über dem Inhalt | die Tafel ist ein eigener Roller; der Balken bleibt beim Rollen sichtbar |
| Dialog | die ganze Fläche rollt | nur der Inhalt zwischen Titel und Knöpfen rollt (`.dialog-inhalt`, `.dialog-liste`) | «Abbrechen» darf nie unter den Rand rutschen |
| Seitenblatt | Kopf und Körper | dazu Unterzeile (live, «47 von 163») und klebende Fusszeile | Filter- und Spaltenblatt |
| Meldung | unten links in der Tafel | dazu: liegt über einer sichtbaren Speicherleiste (`rahmen.js` setzt `--ds-toast-bottom`), Aktion als Text-Knopf (`.meldung-aktion`) | Speicherleiste |
| Datumsfeld unter 720 px | Polster 8 px (zwei Daten nebeneinander auf 320 px) | 12 px wie jedes Feld (wie vor Dashboard-Style) | die Datumsfelder der Seiten stehen einzeln; der Wert bleibt auf der Kante der übrigen Felder |
| Kachelwert | schrumpft mit der Kachel | dazu «…», wenn auch verkleinert nicht passt | Texte statt Zahlen in Kacheln |
| Zeilenliste im Auftritt | Staffel 250 ms | 150 ms | Listen sind länger als Kartenraster |
| Seitenwechsel | eine Single-Page-App | mehrere HTML-Seiten mit Cross-Document View Transitions | kein Build-Schritt, klassische Skripte |

**Sichtbar anders als vor Dashboard-Style** (bewusst; alles Übrige ist Pixel für Pixel gleich geblieben, geprüft mit
Bildschirmfotos aller Seiten im Vorführmodus):

- **Styleguide, Abschnitt «Grundlagen»:** zeigt Fassung, Ort und Links von Dashboard-Style und die Tokens unter ihren
  `--ds-*`-Namen; die Seite wird dadurch länger.
- **Schriften:** Google Sans und Archivo kommen selbst gehostet mit allen Achsen. Google Fonts lieferte Google Sans
  nur mit der optischen Grösse 17–18 und Archivo nur in der Breite 112 %; Zeichen können in einzelnen Grössen leicht
  anders gezeichnet sein.
- **Druck:** Der Inhalt läuft bis an den rechten Papierrand; vorher blieb rechts der Rand der Tafel (16 px) stehen.

---

## 6. Bewegung

Regeln, Tokens, Keyframes und die Hilfsklassen (`.ds-enter`, `.ds-leave`, `.ds-stagger`, `.ds-collapsible`,
`.ds-stale`, `.ds-has-indicator`) sind die von Dashboard-Style
([docs/motion.md](https://github.com/saschazesiger/Dashboard-Style/blob/main/docs/motion.md)). Kurz: nur `transform`,
`opacity`, Farben, `box-shadow`, `clip-path`; Deckkraft auf der Standardkurve, eintretende Wege bremsen, gehende
beschleunigen; kleine Wege; kein Überschwingen; Hover nur in `@media (hover: hover)`; Fokusringe sofort; reduzierte
Bewegung nur über den einen Token-Schalter (Dauern 1 ms, Ladeanzeigen langsamer statt still).

**`@keyframes` stehen nur in `vendor/dashboard-style/css/motion.css`** (und seinem Bündel `ds.css`) – nie im eigenen
CSS, JS oder HTML. Das eigene CSS nennt sie nur beim Namen (`ds-fade-in` …).

Balken und Säulen, die beim ersten Zeigen wachsen (früher die eigenen Keyframes `aufziehen`/`aufrichten`), laufen über
`ds-fill-x`/`ds-fill-y` mit `.ds-enter--fill-x`/`--fill-y`. Diese sind dafür in Dashboard-Style aufgenommen worden:
wachsende Balken in Messleisten und Diagrammen braucht jedes Dashboard, und Keyframes dürfen nur an einem Ort stehen.
Ein Übergang (`transition`) hätte nicht gereicht – er spielt nur bei einer Wertänderung, nicht beim ersten Zeichnen.

### 6.1 `Bewegung.*` (in `bausteine.js`, über `DS.motion` und `DS.indicator`)

| Aufruf | Zweck |
|---|---|
| `LADE_VERZOEGERUNG_MS` 200 · `LADE_MINDESTENS_MS` 450 · `ZAEHLEN_MS` 600 · `STAFFEL_MAX` 5 | Konstanten, gleich den Tokens von Dashboard-Style |
| `reduziert()` | reduzierte Bewegung aktiv? |
| `eintreten(el, variante)` → Promise | `.ds-enter` einmal; Varianten `blenden`, `skalieren`, `schieben`, `tausch`, `verzoegert`, `ploppen`, `aufziehen`, `aufrichten` (= `--fade`, `--scale`, `--slide`, `--swap`, `--delayed`, `--pop`, `--fill-x`, `--fill-y`); wartet auf alle eigenen Animationen |
| `austreten(el, variante, { dann: 'entfernen'\|'verbergen'\|'behalten' })` → Promise | `.ds-leave` (`sinken`, `skalieren`, `schieben`) |
| `aufdecken(el)` → Promise | frischer Inhalt ersetzt einen Platzhalter |
| `staffeln(elemente, { ab, max })` | nummeriert `--ds-i` (CSP-sicher über das CSSOM) |
| `auftritt(behaelter, { wurzel })` | erster Auftritt einer Ansicht: staffelt `.karten`, `.ds-grid-2`, `.ds-stack`, `.ds-tiles`, `.zeilenliste`, zählt `[data-zahl]` hoch, zieht Balken auf |
| `hochzaehlen(el, ziel, { format, dauer })`, `zahlenHochzaehlen(behaelter)` | zählt von 0 in Schweizer Schreibweise; reduziert: sofort der Endwert |
| `aufziehen(behaelter)` | Balken und Säulen wachsen einmal |
| `ladeHaltenMs(start)`, `ladeAbwarten(start)` | eine sichtbar gewordene Ladeanzeige ≥ 450 ms halten |
| `abgeschlossen(el, { zeit, ereignis, eigenschaft })`, `wiederholen(el, …klassen)`, `kurveAusgleiten(t)` | Hilfen für eigene Abläufe – immer mit Frist |
| `indikator(spur, { aktiv, klasse })` | gleitende Pille (`DS.indicator.createIndicator`) |

Seiten brauchen davon fast nur `aufdecken`, `austreten` und `ladeAbwarten`.

### 6.2 Wann Auftritt, wann nie

| Anlass | Aufruf | Bewegung |
|---|---|---|
| erster Inhalt nach dem Laden | `await Rahmen.zustand('inhalt')` | Aufdecken + Staffeln + Hochzählen, **einmal** |
| Ansichtswechsel Hauptseite | `Rahmen.wechseln(fn)` | Fade-through + Staffeln + Hochzählen |
| Bereichswechsel Detailseite | `F.bereichWechseln(bereiche, k)` | Fade-through + Staffeln |
| frisch gezeigter Teilbereich | `Rahmen.erstauftritt(behaelter)` | Staffeln + Hochzählen |
| Banner oder Ergebnis durch eine Benutzeraktion | `Bewegung.aufdecken(el)` | Blende + 4 px |
| Element, das die Person entfernt | `Bewegung.austreten(el, 'skalieren')` | kurz, beschleunigend |
| Tippen, Schalter, Filter, Sortieren | zeichnen, `F.zeichneBereich`, `.setzen()` | **keine** |
| Auto-Nachladen, BroadcastChannel, nach dem Speichern | `Rahmen.stillZeichnen`, `F.zeichneBereich` | **keine**, kein `Rahmen.zustand` |

**Nie** `Bewegung.auftritt`, `eintreten` oder `aufdecken` in einer Zeichenfunktion aufrufen, die auch das Nachladen
benutzt. Seitenwechsel zwischen HTML-Seiten: Inhalt 250 ms Blende + 4 px nach 100 ms; Kopf, Schublade und Tafel
bleiben ruhig (`rahmen.css` §11). Achtung beim Prüfen: eine RDP-Sitzung meldet «reduzierte Bewegung» (§10.3).

---

## 7. Überlagerungen

Gemeinsam für Dialog, Blatt und modale Schublade (`rahmen.js`): eigene Ebenen über dem ganzen Fenster (kein natives
`<dialog>`), **Fokusfalle**, der Rest der Seite ist `inert`, **Esc schliesst nur die oberste Ebene**, der Fokus kehrt
an den Auslöser zurück – ist er inzwischen neu gezeichnet, an sein Gegenstück über `data-fokus` oder `id`. Der
Schleier schliesst nur mit einem eigenen einfachen Klick, nie in den ersten 300 ms. Stapel: Schublade = Blatt
(`--ds-z-drawer`) < Dialog (`--ds-z-dialog`) < Meldung und Tooltip (`--ds-z-toast`).

### 7.1 Dialog
`UI.dialog({ titel, inhalt, knoepfe, breit, rolle, fokus, beiSchliessen, klasse })` · `UI.bestaetigen({ titel, text, ja, nein = 'Abbrechen', breit })` → `Promise<boolean>`
- `.ds-dialog`; 400 px für Fragen, `breit` 560 px für Listen und Formulare. Text nennt die Folge.
- **Eine Rollfläche:** nur der Inhalt zwischen Titel und Knöpfen rollt (§5). Eine Trefferliste trägt `.dialog-liste`:
  sie rollt selbst und nimmt die Resthöhe; reicht diese nicht für gut eine Zeile, rollt der ganze Inhalt, und das
  Suchfeld klebt oben (`data-knapp`). Nie eine eigene Höchsthöhe in der Seiten-CSS.
- Fokus startet im ersten Feld, sonst auf dem ersten Knopf. `UI.bestaetigen` löst bei Esc, Schleier und «Abbrechen»
  mit `false` auf. Nie `window.confirm` oder `alert`. `sperren(true)` während einer Arbeit.
- Löschen mit Namenseingabe: `F.loeschenDialog({ titel, text, warnung, wort, knopfText = 'Löschen', beiLoeschen, ende })`.
  Text auf allen Seiten: «Die Zeile wird in den Papierkorb der SharePoint-Site verschoben und lässt sich dort 93 Tage
  lang zurückholen.»

### 7.2 Seitenblatt
`UI.blatt({ titel, unter, inhalt, fuss, breite: 560|720, beiSchliessen, klasse })`
- `.ds-sheet` von rechts; Kopf mit Titel, optional Unterzeile (`.blatt-unter`, live), ×; der Fokus startet auf ×.
  Fusszeile `.blatt-fuss` bleibt stehen (rechtsbündig: «Filter zurücksetzen» tonal – ohne Filter gesperrt mit «Kein
  Filter aktiv.» –, «Fertig» primär).
- **Filter und Spalten der Listen** stehen in einem Blatt; Änderungen wirken sofort. Filter: Trefferzahl live in der
  Unterzeile; jeder gesetzte Filter steht danach als entfernbarer Chip über der Liste. Spalten: Vorlagen, dann die
  Spalten nach Gruppen. Ein offenes Blatt wird beim Nachladen nie neu gebaut – nur `zahlenSetzen` und `blatt.unter()`.

### 7.3 Meldung (Snackbar)
`UI.meldung(text, { ton: 'erfolg'|'fehler'|'info', dauer = 3200, aktion: { text, beiKlick } })`
- `.ds-toast` unten links in der Tafel (bei offenem Blatt in dessen Ebene). Erfolg und Info gehen nach 3.2 s (die Zeit
  hält, solange Zeiger oder Fokus darauf liegen); **Fehler bleiben** mit ×; höchstens drei.
- Liegt immer **über** einer sichtbaren Speicherleiste. Angesagt wird über **eine** Live-Region `#ansage`.

### 7.4 Tooltip
`UI.tipp(element, text|null)` – automatisch für `[data-tipp]`. `.ds-tooltip`, nach 500 ms Zeigen, mit der Tastatur
sofort, **nie auf Touch**. Kein Tooltip, wenn das Element denselben Text sichtbar zeigt – ausser er ist abgeschnitten.
Ein Element, das nur einen Tooltip trägt, braucht `tabindex="0"`.

### 7.5 Speicherleiste
`F.speicherleisteZeichnen({ neuModus, geloescht, speichertGerade, speicherFehler, anzahl, neuText, meta })` · `UI.speicherleiste({ beiSpeichern, beiVerwerfen, fokusZiel })`
- Schwebt unten in der Tafel, bündig mit der Bahn, Radius 16, `--ds-elev-3`. Links «1 Änderung» + Meta, rechts
  «Verwerfen» (Text) und «Speichern» (primär, beschäftigt). Neu-Modus: «2 Angaben erfasst», «Formular leeren», «Anlegen».
- Sie trägt keine Höhe bei; solange sie steht, hält die Tafel darüber Platz frei.
- Fehler stehen als Meldung darüber + Feldfehler. Nach einem gescheiterten Schreiben heisst der Knopf «Nochmals
  speichern»; nach einem Konflikt (409/412) bietet die Meldung «Neu laden».
- Speichern läuft nur über `F.speicherAblauf`; Schnellaktionen in `F.beschaeftigt(fn)`; Verwerfen fragt über `F.verwerfen`.

---

## 8. Muster für Inhalte

### 8.1 Status nie nur Farbe

| Situation | So |
|---|---|
| Abweichung eines Datensatzes | `UI.status(text, ton)` – Sinnbild + Wort, im Seitenkopf oder in der Zelle |
| Auswahl (Navigation, Chip, Umschalter, Kästchen) | Pastell **und** Häkchen bzw. Gewicht 500 bzw. `aria-current`/`aria-pressed` |
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
| Halbgeviertstrich «–» als Gedankenstrich und Leerwert, nie «—» | «Übersicht – ICT-Inventar» |
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
| Warnung mit Handlung | Banner, Text links, Knopf rechts |
| Vergleich mit der Flotte | Kennwert mit Erklärung, darunter Säulen |
| Verteilung | `UI.verteilung`, höchstens 8 Zeilen + «und n weitere …» |
| Lange Texte | Titel und Werte brechen um; Tabellenzellen, Chips und Blatttitel enden mit «…», der Tooltip zeigt den ganzen Text |
| Vorführmodus (`?mock=1`) | `Rahmen.vorfuehrung` / `F.bandZeichnen`: Warnbanner als erster Block mit «Vorführdaten zurücksetzen»; der Text kommt aus `rahmen.js` |

---

## 9. Barrierefreiheit und Bedienung

Die Grundlagen (Fokusring sofort, Kontrastmodus, reduzierte Bewegung, Ziele ≥ 32 px, Druckstile des Rahmens) bringt
Dashboard-Style mit. ICT-Inventar ergänzt:

| Taste | Wirkung |
|---|---|
| Tab / Shift+Tab | erst die Sprungmarke «Zum Inhalt» (`.ds-skip`), dann Kopf, Schublade, Tafel; in Ebenen bleibt Tab in der Ebene |
| `/` | springt in die Suche der aktuellen Liste |
| Esc | verbirgt einen Tooltip, dann: 1. schliesst die oberste Ebene · 2. leert eine gefüllte Suche · 3. Detailseite: fragt, ob die Änderungen verworfen werden |
| Ctrl/Cmd+S | speichert, wenn es etwas zu speichern gibt und keine Ebene offen ist |
| Enter | im Löschdialog: löst aus, sobald das Wort stimmt |
| Ctrl-/Mittelklick | auf Zeilen, Namen, Schubladen-Einträgen, «Neuer …»: neuer Tab |

- **Fokus geht nie verloren:** Werte an Ort und Stelle ändern statt neu bauen (`UI.textSetzen`, `.setzen()`,
  `sortierungSetzen`, `zahlenSetzen`, `blatt.unter()`, `Rahmen.zahl`); neu zeichnen über `F.zeichneBereich` bzw.
  `Rahmen.stillZeichnen`. Verschwindet etwas unter dem Fokus, geht er vorher an das Gleichwertige. Auto-Nachladen läuft
  nie, solange ein Eingabefeld den Fokus hat, eine Ebene offen ist oder gearbeitet wird.
- **ARIA:** Schublade `nav` mit `aria-label`, aktiver Eintrag `aria-current="page"`; Menüknopf `aria-controls` +
  `aria-expanded`; Knopf, der ein Blatt öffnet, `aria-haspopup="dialog"` + `aria-expanded`; Schalter `role="switch"`,
  `aria-checked`, gesperrt `aria-disabled`; Felder `<label for>`, Fehler `aria-invalid` + `aria-describedby`,
  Kästchengruppen `fieldset`/`legend`; Tabellen `caption` (nur Screenreader) und `aria-sort`; Schloss `role="img"` mit
  Grund; Sinnbilder immer `aria-hidden`; `.ds-sr`-Texte «(geändert)», «(zu prüfen)», «(dringend)».
- **Kontrastmodus** (`forced-colors: active`): der aktive Schubladen-Eintrag, gedrückte und offene Knöpfe und der
  Schalter an tragen `Highlight`/`HighlightText`; Ladebalken, Balken, Säulen, Zahlmarken und der Punkt der Wortmarke
  bleiben sichtbar (`rahmen.css` §12, `bausteine.css`). Die Speicherleiste trägt wie Dialog, Blatt und Meldung einen
  durchsichtigen Umriss, den das System malt.
- **Druck:** nur der Inhalt, ohne Speicherleiste, Meldungen und Schnellaktionen.

---

## 10. Neue Seiten und Bausteine, Prüfen

### 10.1 Neue Seite, Schritt für Schritt

1. **HTML-Gerüst** übernehmen: `<html lang="de-CH" class="ds-theme ds-base">`, `body.ds-app.ds-app--drawer[data-seite="…"]`
   mit `a.ds-skip`, `header.ds-topbar#kopf`, `nav.ds-drawer#schublade`, `.ds-panel > main.ds-view#tafel[tabindex=-1]`
   mit `.ds-loadbar#ladebalken[hidden]` und `.ds-content.ds-page#inhalt[data-zustand="laden"]`. Detailseite: in der Bahn
   nur `header.ds-page-head#<p>-kopf` und `div.fenster-bereich#<p>-bereich`. Kein statisches Markup für Dialog,
   Meldung, Speicherleiste, Laden oder Fehler.
2. **Kopf:** Stilvorlagen und Skripte in der Reihenfolge aus §12, die Zeile
   `<style>@view-transition { navigation: auto; }</style>` inline; klassische Skripte ohne `defer`, keine
   Inline-Skripte (CSP).
3. **Seiten-CSS** mit eigenem Präfix (`g-`, `b-`, `tf-`, `sw-`, `km-`, `kr-`, `vl-`) – nur Raster, Breiten,
   Reihenfolge, Positionen, alle Werte als Tokens. Keine Farben, Radien, Schatten, Schriftgrössen oder -gewichte,
   Dauern, Kurven, keine `@keyframes`; `:hover` nur in `@media (hover: hover)`.
4. **Bauen nur über** `UI.*`, `Rahmen.*`, `Bewegung.*` und `F.*`. Kein `innerHTML`; kein `title` (→ `titel`,
   `UI.tipp`); kein `window.confirm`/`alert` (→ `UI.bestaetigen`, `UI.meldung`); Adressen nur über `UI.adresse.*`.
5. **Ablauf:** `Rahmen.zustand('laden', …)` → Daten holen → zeichnen → `await Rahmen.zustand('inhalt')`; Fehler über
   `Rahmen.zustand('fehler', …)` bzw. `F.ladefehler`.
6. **Jede Ansicht** bekommt Seitenkopf, Karten, Leerzustand und Fehlerzustand; genau eine gefüllte Hauptaktion je
   Bereich. **Bewegung** nur über die Anlässe aus §6.2. **Fokus:** jedes Bedienelement ohne `id` bekommt `fokus: '…'`.
7. **Detailseite zusätzlich:** `F.entwurf`, `F.feld`, `F.uebernehmen`, `F.speicherAblauf`, `F.beschaeftigt`,
   `F.loeschenDialog`, `F.ereignisse`; Fachregeln aus `modell.js`.
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
3. **Nur für ICT:** Klasse in `bausteine.css` (Rahmen und Ebenen in `rahmen.css`), Bauer in `bausteine.js` bzw.
   `rahmen.js` mit Kopfkommentar-Eintrag, nur Tokens (`--ds-*`, ICT-Tokens aus `thema.css`). Ein neuer Wert wird ein
   Token in `thema.css`. Keyframes gibt es nur in Dashboard-Style; Sinnbilder nur über `DS.icons` + `UI.SINNBILDER`.
4. Hover in `@media (hover: hover)`; eigene Media-Queries mitbringen; Kontrastmodus bedenken.
5. In `styleguide.js` ein Muster in allen Zuständen ergänzen (nur über die Bauer) und diese Datei (§4.2) nachführen.

### 10.3 Prüfen

**Statisch** – nach jeder Änderung in `frontend/`, im Ordner `code`:

```powershell
powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1
```

[`code/Pruefe-Frontend.ps1`](../code/Pruefe-Frontend.ps1) (Windows PowerShell 5.1 oder PowerShell 7, ohne
Zusatzmodul, ohne Browser, ohne Netz; die nächtliche Aktualisierung (§11) ruft es mit `pwsh` unter Linux auf, es muss
darum unter beiden laufen) prüft neun Regeln und meldet je Prüfung «OK» oder die Fundstellen mit Datei und Zeile; Exit-Code 0 heisst
in Ordnung. Geprüft wird der eigene Code (alle `.css`, `.js`, `.html` direkt in `frontend/`); Kommentare zählen nicht.

| Prüfung | Regel |
|---|---|
| 1. Tokens | jedes `var(--x)` im eigenen CSS und in `<style>` ist definiert – im eigenen CSS, in `vendor/dashboard-style/ds.css`, in `<style>` oder per `setProperty("--x")` in JS (auch `ds.js`); `var(--x, Ersatz)` gilt als Schalter |
| 2. Bewegung | `@keyframes` nur in `vendor/dashboard-style/css/motion.css` (und `ds.css`); jeder genannte Keyframe-Name existiert dort; kein eigenes CSS setzt Bewegungs-Tokens |
| 3. Literale | das eigene CSS ausser `thema.css` hat keine Farb-, Radius-, Schrift-, Dauer- oder Kurven-Literale |
| 4. JavaScript | kein `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, kein `(window.)confirm/alert/prompt`, kein Browser-`title`; kein `DS.icons.icon()`, kein `DS.dom.morphHtml` |
| 5. HTML | kein Inline-`<script>`, keine `on*`-Attribute, keine `javascript:`-Adressen |
| 6. MSAL | gleiche `integrity` und `crossorigin="anonymous"` auf allen Seiten, die MSAL laden |
| 7. Altlasten | keine alten Klassen und Tokens (§13), kein `design.css`/`bewegung.*`, kein Google Fonts (auch nicht in `_headers`) |
| 8. Kopie | `vendor/dashboard-style/` stimmt mit `SHA256SUMS` überein: keine Datei geändert, fehlend oder dazugekommen; `VERSION` vorhanden |
| 9. Seiten | `class="ds-theme ds-base"` auf `<html>`; Stilvorlagen in der Reihenfolge `fonts.css`, `ds.css`, `thema.css`, `bausteine.css`, `rahmen.css`, die Blätter der Seite erst danach; `ds.js` vor `bausteine.js`; jede verlinkte Datei (auch die Schriften in `thema.css`) existiert |

Mit `-Ordner <Pfad>` prüft es eine Kopie. Was es nicht sieht – Aussehen, Bewegung, Bedienung –, zeigt erst der Browser.

**Im Browser** (`code\serve.ps1`, Vorführmodus `?mock=1`, Fehlerfall `&fehler=1`):

| Prüfung | Wie |
|---|---|
| Konsole | keine Fehler auf allen Seiten, auch `styleguide.html` |
| Breiten | 1440, 900 und 390 px: kein waagrechtes Rollen der Seite, nichts ausserhalb des Fensters, kein abgeschnittener Text ohne «…»; dazu 200 % Zoom und ein niedriges Fenster |
| Zustände | Laden, Fehler (`&fehler=1`), unbekannte ID, Neu-Modus (`?neu=1`), Leerzustand, lange Texte |
| Bewegung | Erstauftritt und Wechsel ruhig; Tippen, Filtern, Speichern und Nachladen ohne Bewegung. Eine RDP-Sitzung meldet «reduzierte Bewegung» – in den DevTools «Rendering → prefers-reduced-motion: no-preference» emulieren |
| Tastatur | Tab durch alle Bedienelemente, Esc-Reihenfolge, Ctrl+S, Rückfokus nach Dialog und Blatt |
| Kontrastmodus | DevTools «Rendering → forced-colors: active» |

---

## 11. Dashboard-Style aktualisieren

Die Kopie ist auf einen Commit von Dashboard-Style festgenagelt (`vendor/dashboard-style/VERSION`). Normalerweise
kommt ein neuer Stand von selbst: `.github/workflows/update-dashboard-style.yml` (Vorlage aus Dashboard-Style)
vergleicht jede Nacht um 02.30 Uhr UTC den Commit in `VERSION` mit `main`; ist er neu, holt es die Kopie, lässt
`Pruefe-Frontend.ps1` laufen und committet auf `main`, worauf Cloudflare Pages neu baut. Sonst endet der Lauf ohne
Build. Von Hand geht es so:

1. **Änderungen lesen:** `CHANGELOG.md` von Dashboard-Style. Benennt der neue Stand Tokens, Klassen oder JS-Exporte
   um oder entfernt er sie (dort eine neue Hauptversion), dann `bausteine.css`, `rahmen.css`, `thema.css` und die
   Bauer nachführen.
2. **Kopie ersetzen** mit dem Werkzeug von Dashboard-Style (`scripts/` in dessen Repository; hier liegt es als
   Checkout neben diesem Repository), im Wurzelordner dieses Repositorys:

   ```powershell
   # Windows PowerShell 5.1: den neusten Stand von main auf GitHub holen …
   ..\Dashboard-Style\scripts\vendor.ps1 frontend\vendor\dashboard-style
   # … oder aus dem lokalen Checkout mit gebautem dist/
   ..\Dashboard-Style\scripts\vendor.ps1 -From ..\Dashboard-Style frontend\vendor\dashboard-style
   ```

   bzw. `sh ../Dashboard-Style/scripts/vendor.sh frontend/vendor/dashboard-style` (oder
   `--from ../Dashboard-Style`). `main` ist immer lieferbar, ein Update braucht keinen Tag-Wechsel; ein bestimmter
   Stand geht mit `vendor.ps1 <ref> …`. Das Werkzeug ersetzt den Ordner als Ganzes und schreibt `VERSION` (mit dem
   genauen Commit) und `SHA256SUMS` neu. Nie einzelne Dateien von Hand kopieren oder ändern.
3. **Prüfen:** `code\Pruefe-Frontend.ps1` (Prüfung 8 vergleicht die Prüfsummen, Prüfung 1 und 2 finden verschwundene
   Tokens und Keyframes), dann `styleguide.html` und die Seiten mit `?mock=1` bei 1440, 900 und 390 px ansehen.
4. **Einchecken:** Der Ordner ist in `.gitattributes` als `-text` markiert; Git schreibt die Zeilenenden nicht um, und
   Cloudflare Pages liefert die Dateien Byte für Byte aus.

Fehlt Dashboard-Style etwas, das jedes Projekt brauchen kann, wird es **dort** ergänzt (mit Doku, Tests und CHANGELOG)
und dann wie oben übernommen – nie in der Kopie.

### 11.1 Wenn die nächtliche Aktualisierung scheitert

GitHub meldet den gescheiterten Lauf «Update Dashboard-Style» (Actions). Die Seite bleibt bis zur Behebung auf dem
alten Stand; jede Nacht versucht es der Lauf von Neuem.

| Schritt scheitert | Bedeutung | Vorgehen |
|---|---|---|
| «Verify» | `Pruefe-Frontend.ps1` findet Fehler mit dem neuen Stand; nichts ist committet | lokal nachstellen (Schritte 2 und 3 oben), im `CHANGELOG.md` nachsehen, was umbenannt oder entfernt wurde, den eigenen Code nachführen und Kopie und Anpassung **zusammen** committen. Liegt der Fehler in Dashboard-Style selbst, wird er dort behoben; der nächste Lauf übernimmt ihn |
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
| `vendor/dashboard-style/` | Dashboard-Style: `ds.css`, `ds.js`, `fonts/` (Google Sans + `OFL.txt`), `css/`, `js/`, `LICENSE`, `VERSION`, `SHA256SUMS` – **nie von Hand ändern** | `DS` |
| `thema.css` | Campus-Thema: Werte für Rollen von Dashboard-Style, ICT-Tokens, `@font-face` Archivo | – |
| `schriften/` | Archivo (Wortmarke), selbst gehostet aus `@fontsource-variable/archivo` 5.3.0, mit `OFL.txt` | – |
| `bausteine.css` | die ICT-eigenen Bausteine und die Abweichungen von Dashboard-Style (§4.2, §5) | – |
| `rahmen.css` | was Rahmen und Ebenen über Dashboard-Style hinaus brauchen (Wortmarke, Konto, Seitenkopf, Speicherleiste, Seitenübergänge …) | – |
| `bausteine.js` | DOM-Helfer, Sinnbilder (über `DS.icons`), Bauer aller Bausteine; `Bewegung` (über `DS.motion`) | `UI`, `Bewegung` |
| `rahmen.js` | Rahmen, Navigation, Zustände, Seitenwechsel; Ebenen und Adressen | `Rahmen`; ergänzt `UI.dialog/bestaetigen/blatt/meldung/tipp/speicherleiste/seitenkopf/adresse …` |
| `fenster.js` | Gerüst der Detailseiten | `Fenster.erstellen()` → `F` |
| `verlauf.js`, `verlauf.css` | Verlauf (Client, Benutzer, Telefon) | `Verlauf` |
| `konfig.js` | Listen-IDs, Mandant, Takt des Nachladens (keine Geheimnisse) | `KONFIG` |
| `auth.js` | Anmeldung über MSAL | `Auth` |
| `graph.js` | Lesen/Schreiben über Microsoft Graph, Vorführdaten | `Hilfe`, `Daten`, `Mock` |
| `modell.js` | Fachlogik: Geschäftsjahr, Status, Programmstufen, Verknüpfungen | `Modell` |
| `spalten.js` | **generiert** von `code/Build-Spalten.ps1`, nie von Hand ändern | – |
| `index.html`, `app.js`, `styles.css` | Hauptseite | – |
| `client.*`, `benutzer.*`, `telefon.*`, `software.*`, `kamera.*`, `kamerarolle.*` | Detailseiten (`.css` nur Seitenlayout) | – |
| `styleguide.html`, `styleguide.js` | lebende Übersicht | – |
| `STYLEGUIDE.md` | dieses Dokument | – |
| `_headers` | Sicherheitsheader und Inhaltsrichtlinie (Cloudflare Pages) | – |

Ladereihenfolge auf jeder Seite (klassische Skripte, ohne `defer`; MSAL-Zeile samt SRI unverändert lassen):

```html
<html lang="de-CH" class="ds-theme ds-base">
…
<link rel="stylesheet" href="vendor/dashboard-style/fonts/fonts.css">
<link rel="stylesheet" href="vendor/dashboard-style/ds.css">
<link rel="stylesheet" href="thema.css">
<link rel="stylesheet" href="bausteine.css">
<link rel="stylesheet" href="rahmen.css">
<style>@view-transition { navigation: auto; }</style>     <!-- inline: aus einer Stilvorlage bricht Chrome ab -->
<link rel="stylesheet" href="<seite>.css">                <!-- + verlauf.css auf Seiten mit Verlauf -->
…
<script src="konfig.js"></script>
<script src="vendor/dashboard-style/ds.js"></script>      <!-- window.DS -->
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

`styleguide.html` lädt nur `ds.js`, `bausteine.js`, `rahmen.js` und `styleguide.js` (keine Anmeldung, keine Daten).
`bausteine.js` bricht ab, wenn `ds.js` fehlt; `rahmen.js`, wenn `bausteine.js` fehlt; ohne `body[data-seite]` baut
`rahmen.js` keinen Rahmen, die Ebenen gehen trotzdem.

---

## 13. Alte Namen → neue Namen

Bis 10.2026 hatte ICT-Inventar eine eigene deutsche Kopie des Design-Systems (`design.css`, `bewegung.css`,
`bewegung.js`, die gemeinsamen Teile von `rahmen.css`). Sie ist durch Dashboard-Style ersetzt; die alten Namen gibt es
nicht mehr (Prüfung 7 meldet sie). Die JS-Namen (`UI.*`, `Rahmen.*`, `Bewegung.*`, `F.*`) sind geblieben.

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
| `--bahn-max`, `--mass`, `--meldung-platz` | `--ds-content-max`, `--ds-measure`, `--ds-toast-room` | | `--schleife-dreh/-dreh-schnell/-unbestimmt/-puls` | `--ds-loop-spin/-spin-fast/-indeterminate/-pulse` |
| `--zustand-hover/-hover-gross/-druck/-deaktiviert` | `--ds-state-hover/-hover-lg/-pressed/-disabled` | | `--deckkraft-veraltet` | `--ds-state-stale` |
| `--z-erhoben/-klebend/-schublade/-dialog/-meldung` | `--ds-z-raised/-sticky/-drawer/-dialog/-toast` | | `--i`, `--fortschritt`, `--indikator-*` | `--ds-i`, `--ds-progress`, `--ds-indicator-*` |
| `--knopf-*` | `--ds-btn-*` | | `--eintritt-*`, `--austritt-*`, `--bewegung-weg/-skala` | `--ds-enter-*`, `--ds-leave-*`, `--ds-motion-distance/-scale` |

Geblieben (nur ICT): `--campus-gruen`, `--schrift-marke`, `--gewicht-marke`, `--konto-breit`, `--diagramm-*` (§2.2).

**Klassen**

| Alt | Neu | | Alt | Neu |
|---|---|---|---|---|
| `.knopf` (+ `-primaer`, `-tonal`, `-leise`, `-still`, `-sinnbild`, `-scheibe`, `-klein`) | `.ds-btn` (+ `--primary`, `--tonal`, `--text`, `--quiet`, `--icon`, `--disc`, `--sm`) | | `body.app`, `[data-ohne-schublade]` | `.ds-app.ds-app--drawer`, `[data-drawer-hidden]` |
| `.knopf-tausch` | `.ds-btn__swap` | | `.sprungmarke` | `.ds-skip` |
| `.spinner(-klein)` | `.ds-spinner(--sm)` | | `.kopf`, `.kopf-menue`, `.kopf-marke` | `.ds-topbar`, `.ds-topbar__menu`, `.ds-brand` |
| `.status` (+ `-erfolg`, `-warnung`, `-gefahr`, `-laeuft`), `.status-spinner` | `.ds-status` (+ `--ok`, `--warning`, `--error`, `--running`), `.ds-status__spinner` | | `.konto`, `-text`, `-name`, `-email`, `-initiale` | `.ds-account`, `__text`, `__name`, `__email`, `__avatar` |
| `.banner` (+ `-erfolg`, `-warnung`, `-gefahr`), `.banner-text` | `.ds-alert` (+ `--success`, `--warning`, `--error`), `.ds-alert__text` | | `.schublade`, `-kopf`, `-liste`, `-gruppe`, `-titel`, `-eintrag`, `-text`, `-indikator`, `-schleier` | `.ds-drawer`, `__head`, `__list`, `__group`, `__heading`, `__item`, `__label`, `__indicator`, `.ds-scrim` |
| `.karte`, `-gefuellt`, `-kopf`, `-titel`, `-untertitel`, `-aktionen` | `.ds-card`, `--filled`, `__row`, `__title`, `__subtitle`, `__links` | | `.tafel-rahmen`, `.tafel`, `.bahn` | `.ds-panel`, `.ds-view`, `.ds-content.ds-page` |
| `.unterabschnitt`, `.raster-2`, `.stapel` | `.ds-subsection`, `.ds-grid-2`, `.ds-stack` | | `.seitenkopf`, `-titel`, `-lead` | `.ds-page-head`, `__title`, `__lead` |
| `.kacheln`, `.kachel`, `-text`, `-wert`, `-unter` | `.ds-tiles`, `.ds-tile`, `__label`, `__value`, `__note` | | `.ladebalken`, `.ladezeile` | `.ds-loadbar`, `.ds-loading` |
| `.kennwerte`, `.fakten`, `.teile`, `.meta`, `.hinweis` | `.ds-kv-list`, `.ds-facts`, `.ds-parts`, `.ds-meta`, `.ds-muted` | | `.skelett` (+ `-karte`, `-zeile`, `-titel` …) | `.ds-skeleton` (+ `__card`, `__line`, `--heading` …) |
| `.leerzustand`, `-scheibe`, `-titel`, `-text` | `.ds-empty`, `__disc`, `__title`, `__text` | | `.fortschritt-gruppe`, `.fortschritt`, `-balken`, `-text`, `-detail`, `.unbestimmt` | `.ds-progress`, `__track`, `__bar`, `__label`, `__detail`, `--indeterminate` |
| `.feld`, `-label`, `-hinweis`, `-fehler` | `.ds-field`, `__label`, `__hint`, `__hint--error` | | `.dialog`, `-schleier`, `-flaeche`, `-titel`, `-text`, `-knoepfe` | `.ds-dialog`, `__backdrop`, `__box`, `__title`, `__text`, `__actions` |
| `.feld-eingabe`, `.feld-gefuellt` | `.ds-input`, `.ds-input--filled` | | `.blatt`, `-schleier`, `-flaeche`, `-breit`, `-kopf`, `-titel`, `-koerper` | `.ds-sheet`, `__backdrop`, `__panel`, `__panel--wide`, `__head`, `__title`, `__body` |
| `.feld-raster(-3)`, `.feld-voll`, `.feld-reihe` | `.ds-form-grid--2/--3`, `.ds-field--full`, `.ds-inline-form` | | `.meldungen`, `.meldung`, `-fehler`, `-info`, `-text`, `-schliessen` | `.ds-toasts`, `.ds-toast`, `--error`, `--info`, `__text`, `__close` |
| `.suchfeld`, `.suche` | `.ds-search`, `.ds-input` | | `.tipp` | `.ds-tooltip` |
| `.ankreuzen(-klein)` | `.ds-check(--sm)` | | `.eintritt` (+ `--blenden` … `--aufrichten`) | `.ds-enter` (+ `--fade`, `--scale`, `--slide`, `--swap`, `--delayed`, `--pop`, `--fill-x`, `--fill-y`) |
| `.aktionszeile`, `.werkzeugleiste` | `.ds-form-actions`, `.ds-action-bar` | | `.austritt` (+ `--sinken`, `--skalieren`, `--schieben`) | `.ds-leave` (+ `--sink`, `--scale`, `--slide`) |
| `.tabelle`, `-schlicht-rahmen`, `-sortierung`, `.dicht` | `.ds-table`, `.ds-table-wrap`, `.ds-table__sort`, `.ds-table--dense` | | `.staffel`, `.aufklappbar`, `.veraltet` | `.ds-stagger`, `.ds-collapsible`, `.ds-stale` |
| `.chips`, `.chips-trenner` | `.ds-chips`, `.ds-chips__divider` | | `.hat-indikator`, `.indikator(--sofort)` | `.ds-has-indicator`, `.ds-indicator(--instant)` |
| `.nur-sr`, `.ohne-umbruch`, `.zahl` | `.ds-sr`, `.ds-nowrap`, `.ds-num` | | `.aktiv` (gedrückter Knopf) | `[aria-pressed="true"]` |

**Keyframes:** `einblenden`/`ausblenden` → `ds-fade-in`/`ds-fade-out`, `anheben` → `ds-lift-in`, `wachsen` →
`ds-grow-in`, `einschieben` → `ds-shift-in`, `einrollen`/`ausrollen` → `ds-roll-in`/`ds-roll-out`, `aufploppen` →
`ds-pop-in`, `zeichnen` → `ds-draw`, `aufziehen`/`aufrichten` → `ds-fill-x`/`ds-fill-y`, `absinken` → `ds-sink-out`,
`schrumpfen` → `ds-scale-out`, `wegschieben` → `ds-slide-out`, `drehen`/`pulsieren`/`unbestimmt` →
`ds-spin`/`ds-pulse`/`ds-indeterminate`.

**Dateien:** `design.css` → `vendor/dashboard-style/ds.css` + `thema.css` + `bausteine.css`; `bewegung.css` →
`vendor/dashboard-style/css/motion.css`; `bewegung.js` → `vendor/dashboard-style/ds.js` (`DS.motion`, `DS.indicator`)
mit der Hülle `Bewegung` in `bausteine.js`; Google Fonts → `vendor/dashboard-style/fonts/` und `schriften/`.
