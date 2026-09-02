# Spezifikation Umbau «Computer Inventar» → zwei Listen, AD-Integration, neues Frontend

Stand: 2026-09-02. Diese Datei ist die verbindliche Vorgabe für den Umbau. Alle Entscheide darin
wurden mit dem Auftraggeber abgestimmt. Abweichungen nur mit gutem Grund und dokumentiert.

Sprache im Code und UI: Deutsch (Schweiz, kein ß). Kommentare deutsch. Keine externen Abhängigkeiten
ausser MSAL (bereits vorhanden). CSP in `frontend/_headers` bleibt gültig: kein Inline-Script,
kein `innerHTML` mit Daten, keine externen Fonts/Bilder ausser dem Campus-Logo.

---

## 1. Datenmodell

### 1.1 Liste «Computer» (SharePoint-Liste, Titel = PC-Name)

| Interner Name | Anzeige | Typ | Quelle | Bemerkung |
|---|---|---|---|---|
| Title | PC-Name | Title | manuell | Grossbuchstaben, eindeutig |
| Seriennummer | Seriennummer | Text | manuell | für Geräte ohne SCCM |
| GebaeudeStock | Gebäude / Stock | Text | manuell | |
| Bemerkung | Bemerkung | Note | manuell | |
| Beschaffungsjahr | Beschaffungsjahr | Text | manuell | Geschäftsjahr, Format `2023/2024` |
| ErsatzGeplant | Ersatz geplant | Text | manuell | Geschäftsjahr, Format `2028/2029`; Vorschlag = Beschaffung + 5 |
| SCCM_* (79 Spalten) | wie bisher | wie bisher | sccm | unverändert aus `frontend/spalten.js` übernehmen |

Entfernt gegenüber heute: `Arbeitsplatz`, `Login`, `Firma` (→ Benutzer), `Typ`, `TestuserSCCM`,
`J20192020 … J20252026`, `Budget20262027`, alle Software-/Rechte-Spalten.

Quelle-Kennung in `spalten.js`: `q: "manuell"` (bearbeitbar) oder `q: "sccm"` (schreibgeschützt).

### 1.2 Liste «Benutzer» (SharePoint-Liste, Titel = Login)

| Interner Name | Anzeige | Typ | Quelle | Bemerkung |
|---|---|---|---|---|
| Title | Login | Title | ad | sAMAccountName, wie im AD geschrieben |
| Anzeigename | Name | Text | ad | displayName |
| EMail | E-Mail | Text | ad | mail |
| Abteilung | Abteilung | Text | ad | department |
| Funktion | Funktion | Text | ad | title |
| Vorgesetzter | Vorgesetzter | Text | ad | displayName des `manager` |
| Telefon | Telefon | Text | ad | telephoneNumber |
| Firma | Firma | Text | ad | company |
| ADAktiviert | AD-Konto aktiv | Text | ad | `Ja` / `Nein` (Enabled) |
| ADLetzterSync | Letzter AD-Sync | DateTime | ad | |
| SCCMPrimaerGeraet | Primärgerät (SCCM) | Text | sccm | aus SMS_UserMachineRelationship, nur Hinweis |
| Computer | Computer | Text | manuell | PC-Name (= Title der Computer-Liste), leer = kein Gerät |
| Bemerkung | Bemerkung | Note | manuell | |
| *ein Feld pro Programm* | Programmname | Text | programm | Wert `0`, `1` oder `2`; leer = `0` |

Bedeutung der Programm-Werte:
- `0` deaktiviert
- `1` manuell aktiviert (ohne AD-Gruppe), im Frontend umschaltbar
- `2` durch AD-Gruppe aktiviert, im Frontend gesperrt (Tooltip: «Berechtigung aus AD-Gruppe ‹X› übernommen»)

Quelle-Kennungen: `ad` und `sccm` sind im Frontend schreibgeschützt, `manuell` und `programm` bearbeitbar
(bei `programm` nur wenn Wert ≠ 2).

Der Sync **löscht** Benutzerzeilen, deren Login im AD-Scope nicht mehr vorkommt (Entscheid des Auftraggebers).
Das Frontend legt deshalb keine Benutzer an; es bearbeitet nur `Computer`, `Bemerkung` und Programme.

### 1.3 Programme (`programme.json` in SharePoint-Dokumentbibliothek)

Ablage: Standard-Dokumentbibliothek der Site, Pfad `Inventar/programme.json`
(Graph: `GET /sites/{siteId}/drive/root:/Inventar/programme.json:/content`). Pfad in `konfig.js`
als `programmeDateiPfad` und in der Sync-Config als `ProgrammeDateiPfad`.

```json
{
  "version": 1,
  "aktualisiert": "2026-09-02T08:00:00Z",
  "kategorien": ["Standard-Software und Rechte", "ABACUS", "Zusatz-Software",
                 "Spezial-Software", "Technik-Software", "Bpanda"],
  "programme": [
    { "id": "AdobePhotoshopCS6", "name": "Adobe Photoshop CS6", "kategorie": "Spezial-Software",
      "adGruppen": ["Hot_Reze"], "vorschlaege": [] },
    { "id": "Microsoft365", "name": "Microsoft 365", "kategorie": "Standard-Software und Rechte",
      "adGruppen": [], "vorschlaege": ["SW_M365"] }
  ]
}
```

- `id` = interner Spaltenname in der Benutzer-Liste (Regeln wie `Build-Schema.ps1 ToInternal`, max 30 Zeichen).
- `adGruppen` = Array von AD-Gruppennamen (sAMAccountName der Gruppe), leer erlaubt.
- `vorschlaege` = vom Skript `Suggest-ProgrammGruppen.ps1` befüllte Kandidaten, wirkungslos bis manuell nach `adGruppen` übernommen.
- programme.json ist die **einzige Quelle** für die Programmliste. Der Sync legt fehlende Programmspalten
  in der Benutzer-Liste automatisch an (Text). Das Frontend baut die Programmspalten zur Laufzeit aus programme.json.

Initiale Programmliste (80 Einträge), Anzeigenamen aus dem heutigen `spalten.js`:

- **Standard-Software und Rechte** (33): Microsoft365, Project2019, Visio2019, SharePoint, ZeitAG, TimePro,
  Presento, Projekto, Dispo, Exporto, PerformX, CampusAdmin, CampusBenutzer, CampusSchuladmin,
  RechtBearbeitungLogin, RechtBewertungen, RechtHonorar, RechtLohnDebi, RechtReferentenAdmin, Protel,
  PDFCreator, CitrixClient, VLCPlayer, AdobeReader, CAFMMeldeformular, Frontify, KeePass, EvaSysCloud,
  Milestone, Monocard, Wallboard, AppCore, ABACUS
- **ABACUS** (8): AbaView, Administrator, Anlagenbuchhaltung, Debitorenbuchhaltung, Finanzbuchhaltung,
  AbacusHumanResources, Kreditorenbuchhaltung, Lohnbuchhaltung
- **Zusatz-Software** (15): AdobeAcrobatPro, AdobeCreativeSuite, AttendantPro, CADdyPP2D, CADdyPP3D,
  Microsoft365Copilot, MicrosoftPowerBIDesktop, MicrosoftPowerBIProLizenz, PDFXChangeEditor, PrismaPrepare,
  Sunetplus, Supermailer, TACReservationssystem, TCPOSAdmin, Silverlight
- **Spezial-Software** (12, heute Textspalten «Spezial-Software (AD-Gruppe)»): ADPhotoEdit, AdobePhotoshopCS6,
  ContentStudio, Firefox, ForatableReservationsbuch, KeyMagic, PaulisKitchenSolution, PostPWC, Salto,
  SupermailerADGruppe, TACVista, Tiffany
- **Technik-Software** (9): AutoCADLT, ChauvinArnoux, ELDESConfigTool, ETS6KNX, GateControl, SaltoPPDUSB,
  SnapformViewer, Testo, Woehler
- **Bpanda** (3): BpandaConsumer, BpandaContributor, BpandaManager

**Nicht übernommen** (Rollen/Abteilungen, Entscheid: entfernen): Bildung, Direktion, Sport, Finanzen,
HumanResources, HWSSupport, Infrastruktur, Lernende, Manager, MarKom, Nachdienst, Reception, Resto,
TechnischerDienst, Veranstaltungen.

### 1.4 Geschäftsjahr

1. August bis 31. Juli. Schreibweise `YYYY/YYYY+1`. Das GJ eines Datums: Monat ≥ 8 → `Jahr/Jahr+1`,
sonst `Jahr-1/Jahr`. Heute (2. Sept 2026) = `2026/2027`. Gemeinsame Helfer in `frontend/modell.js`
(`gjVonDatum`, `gjPlus(gj, n)`, `gjVergleich`, `gjAktuell`) und im PowerShell-Sync.

---

## 2. Backend (Ordner `code/`)

### 2.1 Schema als Quelle der Wahrheit
- `code/schema-computer.json` und `code/schema-benutzer.json`: Spaltendefinitionen wie bisher
  (`internal, display, type, group, source, inDefaultView, description`). Benutzer-Schema enthält **keine**
  Programmspalten; diese kommen aus `code/programme.json` (Vorlage, wird bei der Migration nach SharePoint hochgeladen).
- `code/Build-Spalten.ps1` erzeugt `frontend/spalten.js` mit `SPALTEN_COMPUTER` und `SPALTEN_BENUTZER`
  aus den beiden Schemadateien. Alte Dateien `Build-Schema.ps1`, `ComputerInventar_header.json`, `schema.json`,
  `create-list.js`, `Build-CreateListJs.ps1` löschen.

### 2.2 `code/Migrate-ToTwoLists.ps1`
Parameter: `-ConfigPath`, `-Auth DeviceCode|Certificate` (Standard DeviceCode mit der Frontend-Client-ID aus
konfig.js; Certificate wie im Sync), `-WhatIf`, `-UpdateKonfig`, `-ProgrammeOnly`.
Ablauf:
1. Alte Liste komplett lesen (Graph, `$expand=fields`, Paging).
2. Listen «Computer» und «Benutzer» anlegen (Graph `POST /sites/{id}/lists` mit Spalten aus den Schemadateien;
   Programmspalten aus programme.json), falls nicht vorhanden. Listen-IDs ausgeben.
3. `programme.json` aufbauen: Programme aus Abschnitt 1.3; für die 12 Spezial-Spalten alle in der alten Liste
   vorkommenden Textwerte ausser `ja`/`nein`/leer (case-insensitive, getrimmt) als `adGruppen` sammeln.
   Nach `Inventar/programme.json` hochladen (Ordner anlegen). Lokale Kopie `code/programme.json` aktualisieren.
4. Zeilen migrieren:
   - Computer: jede Zeile mit Title ≠ `Kein PC` und nicht mit `Shared ` beginnend → eine Computer-Zeile
     (Title in Grossbuchstaben, Duplikate zusammenführen). Übernahme: Seriennummer, GebaeudeStock, Bemerkung,
     alle SCCM_*. `Beschaffungsjahr` = neuestes angekreuztes Jahr (`J20252026` → `2025/2026`).
     `ErsatzGeplant` = `Budget20262027` wahr → `2026/2027`, sonst Beschaffungsjahr + 5, sonst leer.
   - Benutzer: jede Zeile mit nicht-leerem `Login` → eine Benutzer-Zeile (Title = Login). `Computer` =
     PC-Name (bei `Shared X` → `X`, bei `Kein PC` → leer). `Anzeigename` = `Arbeitsplatz`, `Firma` = `Firma`
     (werden vom AD-Sync überschrieben). Programme: Boolean wahr → `1`; Spezial-Textspalte nicht leer → `1`.
     Doppelte Logins zusammenführen (erstes Gerät gewinnt, Programme OR, Warnung ins Log).
     Zeilen mit leerem Login werden mit Warnung übersprungen.
5. Bei `-UpdateKonfig`: `computerListId`, `benutzerListId`, URLs in `frontend/konfig.js` ersetzen.
Alte Liste bleibt unverändert. Ausführlicher Report (Anzahl, Warnungen) am Ende und als Logdatei.

### 2.3 `code/Sync-Inventar.ps1` (ersetzt `Sync-SccmToSharePoint.ps1`)
Behält: Zertifikats-Auth, Graph-Helfer, gesamte SCCM-Logik (`Build-SccmFields`), Delta-Schreiben.
Parameter: `-ConfigPath -WhatIf -IncludeServers -OnlyComputers -OnlyBenutzer -DumpOnly`.
Config neu (Beispiel in `Sync-Inventar.config.example.json`): `ComputerListId`, `BenutzerListId`,
`ProgrammeDateiPfad`, `AdUserOUs` (Array DNs, Vorgabe die OUs «Staff/users/Windows 11» und
«Staff/users/Windows 10», DN muss vom Betreiber eingetragen werden), `AdServer` (optional),
`AdGruppenPraefixe` (Array, für Vorschläge), `LoeschSchutzProzent` (Standard 50).

Phase Computer (wie bisher, nur gegen die Computer-Liste; keine `Shared`/`Kein PC`-Logik mehr).

Phase Benutzer:
1. programme.json laden.
2. Fehlende Programmspalten in der Benutzer-Liste anlegen (`POST /lists/{id}/columns`, Text).
3. `Get-ADUser` (Modul ActiveDirectory, Fallback ADSI) je OU, SearchScope Subtree, Properties: DisplayName, mail,
   department, title, manager, telephoneNumber, company, Enabled. Manager-DN → DisplayName (Cache).
4. Für jedes Programm mit `adGruppen`: Mitglieder rekursiv (`Get-ADGroupMember -Recursive`, Fehler bei
   fehlender Gruppe loggen, nicht abbrechen) → Set von Logins.
5. SCCM `SMS_UserMachineRelationship` → Login → Primärgerät (erstes bei mehreren, alphabetisch).
6. Upsert je AD-Benutzer: AD-Felder, `ADAktiviert`, `ADLetzterSync`, `SCCMPrimaerGeraet`. Programme:
   Mitglied → `2`; nicht Mitglied und bisher `2` → `0`; sonst unverändert. Nur Deltas schreiben.
7. Löschen: Zeilen, deren Title (case-insensitive) nicht in der AD-Menge ist. Schutz: wenn AD 0 Benutzer liefert
   oder mehr als `LoeschSchutzProzent` % der Zeilen gelöscht würden → nicht löschen, Fehler loggen, Exit 1.
Log wie bisher, Exit 1 bei Fehlern.

### 2.4 `code/Suggest-ProgrammGruppen.ps1`
Liest programme.json, holt alle AD-Gruppen (Filter nach `AdGruppenPraefixe`, ohne Präfixe: alle Sicherheitsgruppen),
normalisiert Namen (Kleinbuchstaben, nur a-z0-9), schlägt für Programme mit leerem `adGruppen` Gruppen vor,
deren normalisierter Name den normalisierten Programmnamen/-id enthält oder umgekehrt (mindestens 4 Zeichen).
Schreibt `vorschlaege` und lädt programme.json hoch (`-WhatIf` zeigt nur). Wird manuell ausgeführt.

### 2.5 Setup-Skripte und Doku
- `Setup-EntraApp.ps1`: Config-Vorlage mit neuen Schlüsseln; Hinweis, dass das Sync-Konto AD-Leserecht braucht.
- `Setup-FrontendApp.ps1`: unverändert bis auf Bezeichnungen; zusätzlich Hinweis «Allow public client flows»
  für den Device-Code-Login des Migrationsskripts.
- `README_Sync.md` → `README.md` im Ordner `code/` vollständig überarbeiten: Architektur (zwei Listen +
  programme.json), Migration, Sync, Vorschläge, Betrieb (geplante Aufgabe auf `Sync-Inventar.ps1` umstellen).

---

## 3. Frontend (Ordner `frontend/`)

### 3.1 Dateien
```
index.html / app.js / styles.css      Hauptseite: Tabs Übersicht, Geräte, Benutzer, Software
geraet.html / geraet.js / geraet.css   Gerätefenster
benutzer.html / benutzer.js / benutzer.css   Benutzerfenster (neu)
design.css                            Design-System: Tokens, Komponenten (Karten, Kacheln, Tabellen,
                                      Schalter, Chips, Ladezustände, Zeitstrahl); wird von allen Seiten geladen
konfig.js                             + computerListId, benutzerListId, programmeDateiPfad,
                                      sharepointComputerListUrl, sharepointBenutzerListUrl
spalten.js                            SPALTEN_COMPUTER, SPALTEN_BENUTZER (generiert)
modell.js                             gemeinsame Logik: Programmspalten aus programme.json, Anreicherung,
                                      Join Benutzer↔Computer, GJ-Helfer, Berechtigungsstufen
graph.js                              Daten.computer(), Daten.benutzer(), Daten.programme(),
                                      speichern(liste, id, felder), anlegen/loeschen(liste, …), Mock für beides
auth.js                               unverändert
```
Skriptreihenfolge: msal → konfig → spalten → auth → graph → modell → seite.

### 3.2 Hauptseite
- Tabs: **Übersicht**, **Geräte**, **Benutzer**, **Software**.
- **Geräte**: Tabelle wie heute, ohne Benutzer-Spalten aus der alten Zeile; Spalte «Benutzer» (abgeleitet:
  Anzeigenamen der zugeordneten Benutzer, Komma-getrennt). Facetten: Beschaffungsjahr, Ersatz geplant,
  Gebäude/Stock, SCCM-Status wie heute. Klick → `geraet.html?id=…`.
- **Benutzer**: eigene Tabelle (Standardspalten Name, Login, Abteilung, Funktion, Computer, AD aktiv), Suche,
  Facetten (Abteilung, Firma, Computer vorhanden ja/nein, AD aktiv), Programm-Filter mit Stufe (beliebig / manuell /
  AD). Klick → `benutzer.html?id=…`.
- **Software**: pro Programm Kategorie, AD-Gruppen als Chips, Anzahl Benutzer mit Stufe 1 und 2, Vorschläge
  (gedämpft dargestellt). Klick → Benutzer-Tab mit Programmfilter.
- **Übersicht**: Kennzahlen Geräte (online, nicht in SCCM, Ersatz überfällig = ErsatzGeplant < aktuelles GJ,
  ohne Beschaffungsjahr) und Benutzer (gesamt, ohne Gerät, Geräte ohne Benutzer, AD-Konto deaktiviert);
  **Ersatzplanung als Zeitstrahl**: Geschäftsjahre von min(Beschaffungsjahr) bis max(ErsatzGeplant) als Achse,
  pro Jahr Anzahl beschaffter und Anzahl zum Ersatz geplanter Geräte, aktuelles GJ markiert, überfällig in danger;
  Klick auf ein Jahr → Geräte-Tab gefiltert.
- **URL-Zustand** im Hash wie heute, neu zusätzlich `c=<Spalten,komma>` (sichtbare Spalten) und `d=kompakt`
  (Dichte) pro Tab. Fehlt der Parameter, gilt localStorage; Änderungen schreiben beides. Ein gespeicherter Link
  stellt damit Filter, Spalten und Dichte wieder her.
- **Ladezustände**: zentriert (vertikal und horizontal im Inhaltsbereich), Spinner + Text + Fortschritt
  («Geräte 120 / Benutzer 80 / Programme»), Fehlerzustand ebenfalls zentriert mit Aktion «Erneut laden».
  Tabellen dürfen während des Ladens ein Skeleton zeigen.

### 3.3 Gerätefenster `geraet.html`
- **Gesundheitsscore vollständig entfernen** (score, ABZUG, scoreFarbe, Badges, Nav-Zähler, CSS).
  Die Hinweise aus `auffaelligkeiten()` bleiben als schlichte Liste «Hinweise» (ohne Punkte, ohne Stufen-Rahmen),
  Wichtigkeit nur über Text-/Symbolfarbe.
- **Zeitstrahl** in der Übersicht des Geräts: horizontale Achse über Geschäftsjahre von min(AD-Konto erstellt,
  OS installiert, Beschaffungsjahr) bis max(ErsatzGeplant, aktuelles GJ) + 1. Marken: AD-Konto erstellt,
  OS installiert, Beschaffung (GJ), heute, Ersatz geplant (GJ). Überfälliger Ersatz in danger, Ersatz im
  aktuellen GJ in warning. Ohne Beschaffungsjahr: Hinweis und Eingabe direkt an Ort.
- Abschnitt **Beschaffung**: Felder Beschaffungsjahr (Eingabe mit Datalist der GJ 2015/2016 … 2035/2036),
  ErsatzGeplant (Vorschlag +5 als Knopf «Vorschlag übernehmen»).
- Abschnitt **Benutzer**: Liste der Benutzer mit `Computer == PC-Name` (Name, Login, Abteilung, Link ins
  Benutzerfenster), Hinweis wenn SCCM-Primärbenutzer/letzter Benutzer keinem zugeordneten Benutzer entspricht,
  Aktion «Benutzer zuordnen» (Suche über alle Benutzer, setzt dessen `Computer`) und «Zuordnung lösen».
- Software-Abschnitt: nur noch SCCM-Daten (installierte Software, Deployments); die Programm-Rechte sind beim Benutzer.
- Entfernt: Typ, Testuser, Jahres-Chips, Budget.
- **Scroll-Fehler beheben**: Die Seite muss horizontal und vertikal scrollbar sein, wenn der Inhalt breiter/höher
  als das Fenster ist (heute erbt `body` `overflow:hidden` aus styles.css). Lösung im Design-System sauber lösen,
  nicht mit `!important`.

### 3.4 Benutzerfenster `benutzer.html` (neu)
- Kopf: Anzeigename, Login, Abteilung/Funktion, AD-Status (Text-Farbe), Knopf «In SharePoint öffnen».
- Abschnitte: **Übersicht** (AD-Felder schreibgeschützt mit Schloss-Symbol, Gerät mit Link, Hinweis wenn
  `SCCMPrimaerGeraet` ≠ `Computer`), **Gerät** (Zuordnung ändern: Suche über Computer-Liste, oder lösen),
  **Berechtigungen** (nach Kategorie, Suche, Filter «nur aktive»; pro Programm ein Schalter mit drei Zuständen:
  0 aus/umschaltbar, 1 an/umschaltbar, 2 an/gesperrt mit Schloss und Tooltip «Berechtigung aus AD-Gruppe ‹X›
  übernommen»; bei Programmen ohne adGruppen kein AD-Hinweis), **Bemerkung**.
- Speichern wie im Gerätefenster (Speicherleiste, Ctrl+S, Esc, beforeunload, BroadcastChannel
  `{typ:"benutzer-geaendert"}`; Hauptseite lädt still nach).
- Benutzer werden nicht angelegt und nicht gelöscht (das macht der AD-Sync). Kein «Löschen»-Knopf.

### 3.5 Design-System (design.css)
- Modern, minimal, trotzdem «advanced»: grosszügige Weissräume, klare Typo-Hierarchie (System-Font-Stack,
  Grössen 12/13/14/16/20/28), ruhige Flächen (`--flaeche` leicht getönt, Karten weiss ohne Rahmen, nur sehr
  weiche Schatten oder gar keine), Trennung durch Abstand statt Linien.
- **Keine Rahmen an Karten und keine farbigen Seitenkanten.** Status ausschliesslich über Text-, Zahlen- und
  Symbolfarbe: `--success` (Campus-Grün #84B819 als Marke, für Status ein dunkleres Grün #3f8f2e für Lesbarkeit),
  `--warning` #b45309, `--danger` #b91c1c, `--info` #1d4ed8, jeweils mit `-hell` Fläche für Chips.
- Kennzahl-Kacheln: grosse Zahl, kleines Label, optional Trend/Unterzeile, Farbe nur auf der Zahl.
- Tabellen: kopf sticky, zebra sehr dezent, Hover, Dichte-Schalter, Sortier-Pfeile.
- Schalter (Toggle) mit drei Zuständen (siehe 3.4), Chips, Tooltips (title-Attribut genügt).
- Ladezustand-Komponente `.lade` (zentriert, Spinner 28 px, Text darunter), Skeleton-Zeilen.
- Zeitstrahl-Komponente: Achse mit Jahres-Ticks, Marken als Punkt + Label, Bereich «heute» hervorgehoben.
- Keine Dark-Mode-Pflicht. Alle Farben als CSS-Variablen in `design.css`; `styles.css`, `geraet.css`,
  `benutzer.css` enthalten nur Seitenlayout.

### 3.6 Mock-Modus
`?mock=1` liefert beide Listen und programme.json (seeded PRNG wie heute), inklusive Benutzer ohne Gerät,
Geräte ohne Benutzer, Geräte mit zwei Benutzern, Programme mit Stufe 0/1/2 und Vorschlägen.
Änderungen im Mock bleiben im localStorage. Der Mock ist die Grundlage für die Browser-Tests.

---

## 4. Tests und Abnahme
- PowerShell: alle Skripte müssen mit `[System.Management.Automation.Language.Parser]::ParseFile` fehlerfrei
  parsen; reine Funktionen (GJ-Helfer, Programm-Delta, Vorschlagslogik, Migrationsmapping) mit kleinen
  Pester-freien Selbsttests (`-SelfTest`-Schalter oder separates `Test-*.ps1`) prüfen.
- Frontend: Dev-Server `.claude/launch.json` («inventar», Port 8765). Mit `?mock=1` alle vier Tabs, beide
  Fenster, Speichern, URL-Zustand (Spalten/Dichte/Filter aus Link), Ladezustände, horizontales Scrollen in
  geraet.html bei schmalem Fenster, Tri-State-Schalter, Zeitstrahl. Keine Konsolenfehler, keine CSP-Verstösse.
