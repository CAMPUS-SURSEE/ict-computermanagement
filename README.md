# ICT-Inventar

Sieben SharePoint-Listen (ADMIN-Clients, EDU-Clients, Benutzer, Telefonnummern, Software, Kameras,
Kamera-Rollen) mit SCCM-, AD- und Milestone-Synchronisation.
Stand: 08.09.2026 · Betrieb: ICT-Services Campus Sursee

> **Umbau vom 08.09.2026.** Die Liste «Computer» heisst neu **«ADMIN-Clients»**. Alle SCCM-Geräte,
> deren Name mit `EDU` beginnt, stehen in der neuen Liste **«EDU-Clients»** – gleiche Spalten,
> gleiches Frontend, nur ohne Inhaberschaft. Die Programmliste ist von der Datei
> `programme.json` in die neue SharePoint-Liste **«Software»** gezogen und wird jetzt im Frontend
> gepflegt. Den Umbau in SharePoint macht `Migriere-Clients.ps1` (Abschnitt 9).
>
> **Excel-Abgleich vom 08.09.2026.** Die beiden Excel-Inventare («Computer und User Inventar.xlsx»,
> «Telefonnummerm S4B.xlsx») sind einmalig in die Listen übernommen worden – `Abgleich-Excel.ps1`
> (Abschnitt 10; seit dem 13.10.2026 nur noch in der Git-Historie). Dabei neu: die Spalte **«In Domäne»** in beiden Client-Listen. Steht sie auf
> Nein, lässt der SCCM-Abgleich die Zeile vollständig in Ruhe – das ist der Weg für die 94
> Gäste- und Prüfungsnotebooks ohne Domäne, die es in SCCM nie geben wird.
>
> **Umstellung vom 13.10.2026.** Die Inhaberschaft hängt an der **Hardware**, nicht mehr am PC-Namen:
> Die Benutzer-Liste speichert in der neuen Spalte **«AdminClientId»** die Listen-ID des Geräts statt
> seines Namens in «Computer». Ein umbenanntes Gerät behält so seinen Inhaber, und ein neues Gerät mit
> dem Namen eines archivierten erbt ihn nicht. `Migriere-Inhaberschaft.ps1` hat den Bestand am selben
> Tag umgestellt und die alte Spalte gelöscht (Abschnitt 11).
>
> **Produktivstart vom 13.10.2026.** Die Excel-Listen sind abgelöst: Der Stand vom 13.10.2026 ist in die
> Listen übernommen, und die Blätter «Computer und User», «EDU-Geräte» (Inventar) und «Telefonnummer»
> (S4B) tragen ein Overlay «Abgelöst» mit Link auf das Tool. Gepflegt wird nur noch im Tool (Abschnitt 12).
>
> **Videoüberwachung vom 13.10.2026.** Neu die Listen **«Kameras»** (eine Zeile je Hardware in Milestone
> XProtect) und **«Kamera-Rollen»** (die Rollen aus Milestone mit ihren Rechten auf die Kameras, dazu
> Zweck und Bewilligung). Der Sync liest beides aus dem Management Server `adminsrv347` (Abschnitt 2.9);
> die Excel «Zugriffsberechtigung Inventar Videokameras Milestone» ist damit abgelöst (Abschnitt 13).
> Im Frontend: Navigation «Videoüberwachung» mit «Kameras» und «Kamerarechte».

---

## Kurzanleitung

| Ich möchte … | Das ist zu tun |
|---|---|
| **wissen, ob der Sync läuft** | Frontend → **Übersicht**: zuoberst unter «Handlungsbedarf» steht «Letzter Abgleich mit SCCM und AD: …»; ein Banner erscheint, wenn der letzte Lauf Fehler hatte oder länger als 2 Stunden her ist. Details: `C:\ComputerInventar\Sync-Inventar.log` und `Sync-Inventar.status.json` auf `adminsrv319`; die geplante Aufgabe zeigt `0x0` bei Erfolg, `0x1` bei Fehlern |
| **den Sync von Hand starten** | auf dem Server: Aufgabenplanung → «Computer Inventar Sync» → Ausführen, oder `powershell -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-Inventar.ps1` (vorher gefahrlos mit `-WhatIf`) |
| **eine neue Fassung des Syncs auf den Server bringen** | `Installiere-Sync.ps1` im Ordner `code` (Abschnitt 2.5): testet, sichert, kopiert, prüft mit einem Probelauf und richtet die geplante Aufgabe ein |
| **ein Programm hinzufügen oder ändern** | Frontend → Navigation links **«Software»** → **«Neues Programm»** bzw. Klick auf den Namen einer Karte. Die Spalte in der Benutzer-Liste entsteht dabei von selbst (Abschnitt 3) |
| **eine AD-Gruppe an ein Programm hängen** | Programmseite → Feld **«AD-Gruppen»**, eine Gruppe je Zeile → speichern (Abschnitt 3) |
| **ein Gerät ohne Domäne erfassen** | Geräteseite → Bereich «Stammdaten» → Häkchen **«In Domäne»** wegnehmen. Der SCCM-Abgleich holt für das Gerät danach keine Daten mehr aus SCCM und archiviert es nie (Abschnitt 2.2) |
| **eine Spalte hinzufügen oder umbenennen** | `schema-client.json` bzw. `schema-benutzer.json` ändern, Spalte in SharePoint anlegen, `Build-Spalten.ps1` (Abschnitt 4) |
| **nach einer Änderung prüfen, ob alles hält** | Skripte: `powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1` – erwartet `439 bestanden, 0 fehlgeschlagen`. Frontend: `powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1` – erwartet `alle 14 Prüfungen OK` (Abschnitt 1, «Dateien im Ordner `frontend`») |
| **eine Telefonnummer freigeben** | Telefonseite → **«Nummer freigeben»** rechts im Seitenkopf: Status «Frei», der bisherige Name kommt in den Verlauf. Steht die Nummer im AD bei jemandem, ist der Knopf gesperrt; sein Tooltip nennt die Person |
| **eine Telefonnummer erfassen oder ändern** | Frontend → Navigation links **«Telefonnummern»** → **«Neue Telefonnummer»** bzw. Klick auf eine Zeile; Nummern in Betrieb ohne Person tragen in der Spalte «Zugewiesen» den Status **«Nicht zugewiesen»** (Warnung); freie Nummern zeigen den neutralen Status «Frei» (Abschnitt 2.7) |
| **wissen, wer eine Nummer hat** | Spalte **«Person (AD)»** in der Telefonliste: kommt live aus dem AD-Feld «Telefon» der Benutzer-Liste; der Sync schreibt den Login zusätzlich in `Benutzer` |
| **wissen, warum ein PC «Archiviert» ist** | Spalte `Verlauf` des Clients ansehen; der Sync trägt Umbenennung, Archivierung und Reaktivierung dort ein (Abschnitt 2.2) |
| **wissen, warum ein PC in der EDU-Liste steht** | Der Name entscheidet: alles ab `EDU` gehört in «EDU-Clients», alles Übrige in «ADMIN-Clients» (Abschnitt 2.2) |
| **archivierte Geräte im Frontend sehen** | in der Client-Liste **«Filter»** → im Seitenblatt unter «Archiv» **«Archivierte Geräte anzeigen»**; ohne das Häkchen sind sie ausgeblendet – auch in den Zahlen der Übersicht und im Zeitstrahl |
| **eine Liste filtern oder Spalten wählen** | in der Liste **«Filter»** bzw. **«Spalten»**: Das Seitenblatt rechts wirkt sofort; oben steht beim Filter die Trefferzahl («44 von 47 ADMIN-Clients»), bei den Spalten «9 von 93 Spalten sichtbar» (dazu «Standardspalten», «Nur Name», «Alle Spalten» und «Kompakte Zeilen»); «Fertig» oder Esc schliesst es, «Filter zurücksetzen» leert alle Filter. Aktive Filter stehen als Chips über der Liste (ein Klick entfernt den Filter). Filter, Sortierung und Spalten stehen im Link; Spaltenwahl und «Kompakte Zeilen» merkt sich der Browser |
| **von einer Detailseite zur Liste zurück** | Eintrag **«← ADMIN-Clients»** (bzw. «← Benutzer» …) zuoberst in der Navigation links; in schmalen Fenstern und in den Neu-Formularen steht derselbe Link **«‹ ADMIN-Clients»** über dem Titel. Er führt zur Liste so, wie man sie verlassen hat – mit Suche, Filtern und Sortierung. Die Wortmarke «ICT.INVENTAR» oben links führt zur Übersicht |
| **einen Verlaufseintrag erfassen** | Geräteseite → Bereich «Stammdaten», Benutzerseite → Bereich «Bemerkung», Telefonseite → Bereich «Hinweis & Verlauf»; Karte **«Verlauf»** → «Neuer Eintrag» (Datum wählbar), dann in der Speicherleiste unten **«Speichern»** (oder Ctrl+S) |
| **den Inhaber eines Geräts ändern** | Geräteseite eines ADMIN-Clients → Bereich **«Inhaber»** → «Inhaber wechseln»; der bisherige Inhaber gibt das Gerät dabei automatisch ab (Abschnitt 2.8). EDU-Clients haben bewusst keinen Inhaber |
| **einem neu aufgesetzten PC den bisherigen Inhaber geben** | Ein neues Gerät unter altem Namen bekommt eine eigene Zeile ohne Inhaber – der Inhaber hängt am archivierten Vorgänger. Geräteseite des neuen Geräts → Bereich **«Inhaber»** → beim Hinweis auf den Vorgänger **«Übernehmen»**. Oder auf der Benutzerseite → Bereich «Gerät» → «SCCM meldet … als Primärgerät» → «Übernehmen» (Abschnitt 2.8) |
| **ein Gerät ins Lager legen, ausgeben oder archivieren** | Geräteseite → Schnellaktionen rechts im Seitenkopf (**«Ins Lager legen»**, **«Ausgeben an …»**, **«Archivieren»**, bei archivierten **«Reaktivieren»**; bei EDU-Clients statt «Ausgeben an …» **«In Betrieb nehmen»**): setzt Status, Inhaber und Verlauf in einem Schritt. Solange etwas ungespeichert ist, sind sie gesperrt; der Tooltip sagt warum |
| **ein Gerät einlagern** | Status auf **`Lager`** setzen – nicht auf `Archiviert`: solange das Gerät in SCCM steht, setzt der nächste Sync `Archiviert` wieder auf `Aktiv` |
| **ein Gerät ausser Betrieb nehmen** | das Gerät **aus SCCM löschen** – der nächste Sync setzt die Zeile dann selbst auf `Archiviert`. Von Hand archivieren ist nur für Geräte nötig, die nicht in SCCM stehen («In Domäne» = Nein); das Frontend weist beim Status «Archiviert» und im Dialog «Archivieren?» darauf hin |
| **einen Client von Hand anlegen** | meist **nicht nötig**: Geräte in SCCM legt der Sync selbst an. «Neuer ADMIN-Client» (bzw. «Neuer EDU-Client») nur für Geräte, die nicht in SCCM stehen; das Formular der ADMIN-Clients sagt das zuoberst |
| **ein Gerät, eine Nummer oder ein Programm löschen** | auf der Detailseite **«Löschen …»** rechts im Seitenkopf; zur Bestätigung den PC-Namen, die Kurzwahl bzw. die Programm-ID eingeben, dann **«Löschen»**. Die Zeile kommt in den Papierkorb der SharePoint-Site und lässt sich dort 93 Tage lang zurückholen. Danach führt «Zur Liste» (bzw. «Zur Software-Liste») zurück. Benutzer haben keinen Löschknopf: ihre Liste pflegt der Sync aus dem AD |
| **mich abmelden** | **«Abmelden»** oben rechts in der Kopfzeile – auf jeder Seite, auch auf den Detailseiten. Es steht mit Initiale, Name und E-Mail des Kontos in einer umrandeten Kapsel (in schmalen Fenstern nur die Initiale) |
| **wissen, wer eine Kamera sehen darf** | Kameraseite → Bereich **«Berechtigungen»**; umgekehrt Navigation **«Kamerarechte»** (eine Karte je Rolle) und auf der Benutzerseite die Karte **«Videoüberwachung»**. Die Rechte kommen aus Milestone und werden dort im Management Client geändert, nie im Tool (Abschnitt 2.9) |
| **eine Notiz zu einer Kamera-Rolle festhalten** | Kamerarechte → Rolle öffnen → Bereich «Rolle», Karte **«Bemerkung»**. Den früheren Nachweis (Zweck, Bewilligt durch/am) gibt es seit dem 19.10.2026 nicht mehr |
| **eine Kamera erfassen** | **nicht nötig** und im Frontend nicht möglich: Kameras in Milestone legt der Sync selbst an. Eine ausgebaute Kamera bleibt erhalten, wenn ihr Status vor dem Entfernen aus Milestone auf **`Lager`** steht |
| **eine Kamera bewerten** | Kameraseite → Bereich **«Bewertung»** (Zuständig, Bildqualität, Positionierung, Verbesserungen, Bewertet am) |
| **nachschlagen, wie das Frontend aussehen soll** | `frontend/STYLEGUIDE.md` (Regeln auf Dashboard-Style: Campus-Thema, eigene Bausteine, Abweichungen) und `frontend/styleguide.html` (lebende Übersicht, ohne Anmeldung) – Abschnitt 1, «Dateien im Ordner `frontend`» |
| **das Design-System (Dashboard-Style) aktualisieren** | meist **nicht nötig**: `.github/workflows/update-dashboard-style.yml` holt jede Nacht den neusten Stand von `main`, prüft ihn mit `tools/check-project.mjs` der Kopie und `Pruefe-Frontend.ps1` und veröffentlicht. Von Hand im Wurzelordner dieses Repositorys `..\Dashboard-Style\scripts\vendor.ps1 frontend\vendor\dashboard-style` (Dashboard-Style als Checkout daneben; `-From ..\Dashboard-Style` für den lokalen Stand), danach `Pruefe-Frontend.ps1`, `node frontend/vendor/dashboard-style/tools/check-project.mjs --config ds-check.json` und `styleguide.html` ansehen. Die Kopie nie von Hand ändern (`frontend/STYLEGUIDE.md`, Abschnitt 11) |
| **wissen, was zu tun ist, wenn die nächtliche Aktualisierung scheitert** | `frontend/STYLEGUIDE.md`, Abschnitt 11.1: Bis zur Behebung bleibt die Seite auf dem alten Stand |
| **als Agent oder neu im Repository die Regeln kennen** | `AGENTS.md` im Wurzelordner: Befehle, Konventionen, sensible Daten und Design-Regeln in Kurzform (`CLAUDE.md` verweist darauf) |
| **das Frontend neu veröffentlichen** | Änderung in `frontend` nach `main` pushen – Cloudflare Pages baut und veröffentlicht von selbst (Abschnitt 7.4) |
| **einen Fehler im Log verstehen** | Abschnitt 6, Fehlerbehebung |
| **das abgelaufene Zertifikat erneuern** | neues Zertifikat erzeugen und an der App hinterlegen (Abschnitt 7.1) |

Der Sync läuft im Ordner `C:\ComputerInventar` auf dem SCCM-Site-Server (`adminsrv319`); dessen
Inhalt ist `code/server/` aus diesem Repository. Die Werkzeuge daneben (Spalten, Programme, Tests)
laufen von einem Arbeitsplatz aus dem Ordner `code/`. Die Skripte brauchen **Windows PowerShell 5.1**
und kein Zusatzmodul; `ActiveDirectory` wird benutzt, wenn es da ist, sonst greift der ADSI-Fallback.

---

## 1. Architektur

| Baustein | Inhalt | Wer schreibt |
|---|---|---|
| Liste **ADMIN-Clients** | Titel = PC-Name, dazu Gebäude/Stock, Bemerkung, **Status**, **In Domäne**, **Verlauf**, Beschaffungsjahr, Ersatz geplant und 79 `SCCM_*`-Spalten | Menschen (Frontend/SharePoint) + Sync (`SCCM_*`, `Status`, an `Verlauf` angehängt, `Title` nur bei einer Umbenennung in SCCM) |
| Liste **EDU-Clients** | dieselben Spalten wie «ADMIN-Clients» (`schema-client.json`); enthält alle SCCM-Geräte, deren Name mit `EDU` beginnt. Ohne Inhaberschaft | dieselben wie oben |
| Liste **Benutzer** | Titel = Login (sAMAccountName), AD-Felder, Primärgerät (SCCM), **AdminClientId** (die Inhaberschaft: Listen-ID des ADMIN-Clients, im Frontend als «ADMIN-Client» mit seinem Namen angezeigt, Abschnitt 2.8), Bemerkung, **Verlauf**, dazu **eine Textspalte je Programm** | Sync (AD-Felder, Programmstufe 2) + Menschen (AdminClientId, Bemerkung, Verlauf, Programmstufe 0/1) |
| Liste **Telefonnummern** | Titel = Kurzwahl (373), Telefonnummer, Name, Typ, **Status** (Aktiv/Inaktiv/Frei), Apparat, Standort, Hinweis, **Verlauf**, dazu `Benutzer` (Login aus dem AD) und `ADLetzterSync` | Menschen (Frontend) + Sync (`Benutzer`, `ADLetzterSync`, leerer Name aus AD, Frei → Aktiv, neue Nummern aus dem AD) |
| Liste **Software** | Titel = Programm-Id (= interner Spaltenname in der Benutzer-Liste), dazu Name, Kategorie, AD-Gruppen, Reihenfolge, Bemerkung. Ersetzt seit dem 08.09.2026 die Datei `programme.json` | Menschen (Frontend, Software-Liste) + Sync (legt eine fehlende Programmspalte in der Benutzer-Liste selbst an) |
| Liste **Kameras** | Titel = Name der Kamera in Milestone, dazu Gebäude, Raum, **Status**, Bemerkung, **Verlauf**, Beschaffung, Bewertung (Zuständig, Bildqualität, Positionierung, Verbesserungen, Bewertet am) und 18 `MS_*`-Spalten aus Milestone. Eine Zeile je Hardware (Abschnitt 2.9) | Menschen + Sync (`MS_*`, `Status`, `Title` bei Umbenennung in Milestone, leere Gebäude/Raum, an `Verlauf` angehängt) |
| Liste **Kamera-Rollen** | Titel = Rolle in Milestone, dazu Bemerkung, **Verlauf** und die `MS_*`-Spalten (Mitglieder, AD-Gruppen, aufgelöste Personen, Rechte, Kameras als JSON) | Menschen (Bemerkung) + Sync (alles aus Milestone, Verlauf der Änderungen) |

```
adminsrv319 (SCCM Site-Server)                        Microsoft 365 / SharePoint mgmts-ict-s
┌──────────────────────────────────┐                 ┌────────────────────────────────────┐
│ SMS Provider root\SMS\site_PS2   │                 │ Liste "ADMIN-Clients"              │
│        ▲ WMI                     │  Graph API      │ Liste "EDU-Clients"                │
│ Active Directory (LDAP/ADSI)     │  Zertifikat     │ Liste "Benutzer"                   │
│   Benutzer + telephoneNumber     │                 │ Liste "Telefonnummern"             │
│        ▲                         │ ──────────────▶ │ Liste "Software"                   │
│ Geplante Aufgabe (SYSTEM), 30 min│  Sites.Selected │                                    │
│  → C:\ComputerInventar\          │                 │ Entra-App "SCCM-SharePoint-Sync"   │
│     Sync-Inventar.ps1            │                 │ Entra-App "Computer Inventar       │
└──────────────────────────────────┘                 │            Frontend" (SPA)         │
                                                     └────────────────────────────────────┘
```

**Programmstufen** in der Benutzer-Liste (Textwert je Programmspalte):

| Wert | Bedeutung | Frontend |
|---|---|---|
| `0` oder leer | nicht berechtigt | umschaltbar |
| `1` | von Hand aktiviert (ohne AD-Gruppe) | umschaltbar |
| `2` | über eine AD-Gruppe aktiviert | gesperrt, Tooltip mit dem Gruppennamen |

Der Sync setzt nur `2` und nimmt es wieder weg. **Eine manuelle `1` fasst er nie an** – wer eine
Berechtigung von Hand vergeben hat, verliert sie nicht, wenn später eine AD-Gruppe dazukommt.

**Status** eines Clients (Textspalte `Status`, leer gilt als `Aktiv`):

| Wert | Bedeutung | Wer setzt ihn |
|---|---|---|
| `Aktiv` | im Einsatz | Menschen; der Sync setzt ihn beim ersten Kontakt und beim Reaktivieren |
| `Lager` | eingelagert, aber noch in SCCM | nur Menschen – der Sync fasst `Lager` nie an, solange das Gerät in SCCM ist |
| `Archiviert` | kein SCCM-Gerät mehr dazu | der Sync (und Menschen von Hand) |

**In Domäne** (Ja/Nein-Spalte `InDomaene`, leer gilt als Ja) entscheidet, ob der Sync die Zeile
überhaupt anfasst:

| Wert | Bedeutung |
|---|---|
| `Ja` (oder leer) | Normalfall: der Sync ordnet der Zeile ein SCCM-Gerät zu, schreibt die `SCCM_*`-Felder und archiviert sie, sobald das Gerät aus SCCM verschwindet |
| `Nein` | Der Sync überspringt die Zeile vollständig – kein Gerät, keine SCCM-Felder, **keine Archivierung**, und sie zählt nicht in die aktiven Zeilen des Archivschutzes. Für Geräte, die es in SCCM nie geben wird: Gäste- und Prüfungsnotebooks ohne Domäne |

Ohne diese Spalte müsste ein Gerät ohne Domäne bei jedem Lauf archiviert werden – und weil das bei
94 von 119 EDU-Zeilen der Fall wäre, würde der Archivschutz (Abschnitt 2.3) greifen und die ganze
Phase mit einem Fehler abbrechen. Gesetzt wird sie auf der Geräteseite unter «Stammdaten».

`Archiviert` von Hand zu setzen lohnt sich nur für Geräte, die auch in SCCM verschwunden sind:
Steht das Gerät noch in SCCM, setzt der nächste Sync es wieder auf `Aktiv` und schreibt
«Wieder in SCCM vorhanden, reaktiviert» in den Verlauf. Für eingelagerte Geräte ist `Lager`
gedacht – das fasst der Sync nie an. Im Frontend sind archivierte Geräte in den Client-Listen,
in den Zahlen der Übersicht (ausser der Zeile «Archiviert») und im Ersatz-Zeitstrahl ausgeblendet; im
Filterblatt der Client-Liste (Knopf «Filter») blendet «Archivierte Geräte anzeigen» sie wieder ein (wird je
Liste im Browser gemerkt und steht als `ar=1` im Link).

**Verlauf** (mehrzeilige Klartextspalte `Verlauf` in beiden Listen) enthält ein JSON-Array:

```json
[{"id":"<GUID>","datum":"2026-09-03","text":"Freitext","quelle":"manuell","erstellt":"2026-09-03T14:05:00Z"}]
```

`datum` ist das Datum des Ereignisses (im Frontend wählbar), `erstellt` der Zeitstempel der Erfassung,
`quelle` ist `manuell` (Frontend) oder `sync`. Angezeigt wird nach `datum` absteigend, bei Gleichstand
nach `erstellt`. **Der Sync hängt nur an** – er ändert und löscht keinen bestehenden Eintrag. Leerer
Inhalt gilt als leeres Array; ist der Inhalt kein gültiges JSON, überspringt der Sync die Zeile mit
einem ERROR im Log, statt sie zu überschreiben. Die Spalte ist Klartext (kein Rich-Text) und wird
nicht von Hand bearbeitet.

**Geschäftsjahr**: 1. August bis 31. Juli, Schreibweise `2026/2027`. Ein Datum ab August gehört ins
Geschäftsjahr `Jahr/Jahr+1`, sonst `Jahr-1/Jahr`. Die Helfer stehen in `Inventar-Gemeinsam.ps1`
(`Get-GjVonDatum`, `Get-GjPlus`, `Get-GjVergleich`, `Get-GjAktuell`) und gespiegelt in `frontend/modell.js`.

### Dateien im Ordner `code`

`code/server/` ist der **Inhalt von `C:\ComputerInventar\`** auf `adminsrv319`: genau diese Dateien
gehören auf den SCCM-Server, sonst keine. Alles andere in `code/` läuft von einem Arbeitsplatz aus
und wird nie auf den Server kopiert. Der Ordnername auf dem Server bleibt bewusst
`C:\ComputerInventar` – ihn umzubenennen hiesse, die geplante Aufgabe neu zu registrieren, ohne
dass irgendetwas besser würde.

| `code/server/` – gehört auf den SCCM-Server | Zweck |
|---|---|
| `Sync-Inventar.ps1` | der laufende Sync (SCCM → ADMIN-/EDU-Clients, AD → Benutzer, AD → Telefonnummern, Milestone → Kameras und Kamera-Rollen) |
| `Inventar-Gemeinsam.ps1` | gemeinsame Funktionen: Log, Geschäftsjahr, Graph, Spaltendefinitionen |
| `Sync-Inventar.config.json` | Konfiguration mit den echten Werten. **Führend ist die Fassung auf dem Server**; `Installiere-Sync.ps1` überschreibt sie nie. Die Kopie im Arbeitsverzeichnis ist in `.gitignore` und kommt nie nach GitHub – sie enthält ClientId und Zertifikat-Thumbprint. Vorlage ohne Geheimnisse: `Sync-Inventar.config.example.json` |

Auf dem Server entstehen daneben `Sync-Inventar.log` (rollt ab 10 MB weg, die letzten fünf bleiben als
`.log.1` … `.log.5`), `Sync-Inventar.status.json` (Zustand des letzten vollständigen Laufs) und
`_sicherung\` (die Skripte vor jeder Installation, die letzten zehn). Den Zustand schreibt der Sync
ausserdem als `Inventar/sync-status.json` in die Dokumentbibliothek der Site; dessen Titel liest die
Übersicht im Frontend.

| `code/` – läuft vom Arbeitsplatz | Zweck |
|---|---|
| `schema-client.json` / `schema-benutzer.json` / `schema-telefon.json` / `schema-software.json` / `schema-kamera.json` / `schema-kamerarolle.json` | Spalten der Listen (Quelle der Wahrheit). `schema-client.json` gilt für **beide** Client-Listen – sie haben dieselben Spalten |
| `Migriere-Kameras.ps1` | einmalig: legt «Kameras» und «Kamera-Rollen» an, übernimmt die Hardware aus Milestone und ergänzt Zuständig und Bewertung aus der Excel (Abschnitt 13) |
| `Build-Spalten.ps1` | erzeugt `frontend/spalten.js` aus den Schemadateien |
| `Ergaenze-Spalten.ps1` | legt in SharePoint die Spalten an, die laut Schemadateien und Liste «Software» fehlen – der Reparaturweg, wenn eine Spalte fehlt (Abschnitt 4) |
| `Entferne-Spalte.ps1` | löscht eine benannte Spalte nach Sicherung ihrer Werte (Gegenstück zu `Ergaenze-Spalten.ps1`) |
| `Graph-Sitzung.ps1` | haltbare Anmeldung: einmal Device-Code, danach still über das Refresh-Token aus `lokal\graph-sitzung.xml` (DPAPI-verschlüsselt). Wird von den Werkzeugen daneben eingebunden |
| `Benenne-ListenAdresse.ps1` | einmalig: ändert die Adresse einer Liste (`.../Lists/Computer` → `.../Lists/ADMIN-Clients`) über die SharePoint-REST-Schnittstelle |
| `Migriere-Clients.ps1` | einmalig: benennt «Computer» in «ADMIN-Clients» um, legt «EDU-Clients» und «Software» an, zieht die EDU-Zeilen um (Abschnitt 9) |
| `Migriere-FruehererEintrag.ps1` | einmalig: überführt «Früherer Eintrag» der Telefonliste in den Verlauf und löscht die Spalte (Abschnitt 2.7) |
| `Migriere-Inhaberschaft.ps1` | einmalig: stellt die Inhaberschaft vom PC-Namen («Computer») auf die Listen-ID des Geräts («AdminClientId») um, auf Wunsch löscht es danach «Computer» (Abschnitt 11) |
| `Installiere-Sync.ps1` | bringt `code/server/` auf `adminsrv319` und richtet die geplante Aufgabe ein: Tests, Sicherung, Kopie mit Prüfsumme, Probelauf als SYSTEM, Aufgabe alle 30 Minuten (Abschnitt 2.5) |
| `Test-Inventar.ps1` | Selbsttests + Syntaxprüfung aller Skripte in `code/` und `code/server/` |
| `Pruefe-Frontend.ps1` | statische Prüfung des Frontends nach jeder Änderung, 14 Prüfungen: Tokens, Keyframes und Bewegungs-Tokens, Literale im eigenen CSS, kein `innerHTML` & Co., kein Inline-Skript, MSAL-Prüfsumme, Altlasten, unveränderte Kopie von Dashboard-Style, Ladereihenfolge, Aufrufe gegen die Schnittstelle der Kopie, entfernte Namen von Dashboard-Style (veraltete als Hinweis), Seitengerüst, Seiten-CSS nur Layout, kein Geviertstrich (Abschnitt 1, «Dateien im Ordner `frontend`») |
| `serve.ps1` | kleiner Testserver für die lokale Vorschau des Frontends, mit den Headern aus `frontend/_headers` (Windows PowerShell 5.1 und PowerShell 7) |

Die Arbeitsplatz-Skripte laden `Inventar-Gemeinsam.ps1` und die Konfiguration aus `server/` – es gibt
keine zweite Kopie. Auf dem Server liegt alles flach nebeneinander, dort greift derselbe Code über
`$ScriptDir`.

`Sync-Inventar.ps1` definiert zuerst seine reinen Funktionen und prüft danach `$InventarNurFunktionen`.
Wer es mit `$InventarNurFunktionen = $true` dot-sourced, bekommt nur die Funktionen und keinen
Netzwerkzugriff – genau das macht `Test-Inventar.ps1`.

### Dateien im Ordner `frontend`

Stand 23.10.2026. Das Frontend ist reines HTML, CSS und JavaScript ohne Bauschritt: klassische `<script>`-Dateien
mit je einem Namensraum, kein einziges Inline-Skript und kein `<style>` (die Inhaltsrichtlinie in `_headers` verbietet
beides). **Grundlage ist [Dashboard-Style](https://github.com/saschazesiger/Dashboard-Style)** 2.0.0, das gemeinsame
Design-System (dasselbe wie in ChatBob): Tokens, Bausteine, Bewegung, Überlagerungen und Sinnbilder liegen als
unveränderte, mit Prüfsummen festgenagelte Kopie in `frontend/vendor/dashboard-style/`. Darauf setzt ICT-Inventar nur
das Campus-Thema (`thema.css`), ein paar Grundregeln darunter (`grund.css`) und die Bausteine, die es nur hier gibt
(Speicherleiste, Zeitachse, Diagramme, Wortmarke …). **Die Regeln stehen in
[`frontend/STYLEGUIDE.md`](frontend/STYLEGUIDE.md)** (Thema, eigene Bausteine, Abweichungen, Bewegung,
Überlagerungen, Barrierefreiheit, Vorgehen für neue Seiten, Aktualisieren von Dashboard-Style), die lebende Übersicht
aller Bausteine in `frontend/styleguide.html` (ohne Anmeldung, ohne Daten).

Jede Seite hat denselben Rahmen: oben die Kopfzeile (links die Wortmarke «ICT.INVENTAR» als Weg zur Übersicht,
rechts eine umrandete Kapsel mit Konto und «Abmelden»; alle Seiten laden alle 5 Minuten still nach), links die
Navigation – auf der Hauptseite die Listen, auf einer Detailseite zuoberst «← Liste» und darunter die Bereiche des
Datensatzes –, rechts die weisse Tafel mit dem Inhalt. Schmaler als 900 px klappt die Navigation hinter einen
Menüknopf links in der Kopfzeile; dann steht der Link zurück zur Liste über dem Titel. Filter und Spaltenwahl der
Listen öffnen sich als Seitenblatt von rechts; Schnellaktionen und «Löschen …» eines Datensatzes stehen rechts im
Seitenkopf; Änderungen speichert die Leiste, die unten erscheint, sobald etwas geändert ist.

| Datei | Zweck |
|---|---|
| `vendor/dashboard-style/` | Dashboard-Style: `ds.css` (alle Bausteine, in Kaskaden-Ebenen `@layer ds.*`), `css/optional/view-transitions.css` (Seitenübergänge zwischen den HTML-Seiten), `ds.js` (`DS`: `motion` Bewegung, `indicator` gleitende Pille, `dom` stilles Abgleichen, `ripple` Druckwelle, `icons` Sinnbilder, `overlay` Dialoge, Blätter, Meldungen, Tooltips), Google Sans mit Lizenz, `tools/` (Prüfwerkzeuge), `deprecations.json`, `VERSION`, `SHA256SUMS` – **nie von Hand ändern**, nur mit `vendor.ps1` ersetzen (`STYLEGUIDE.md`, Abschnitt 11) |
| `grund.css` | Grundregeln, die keinen Baustein von Dashboard-Style schlagen dürfen (Ränder 0), in der Ebene `@layer grund` vor `ds`; als erste Stilvorlage geladen |
| `thema.css` | Campus-Thema: Farben von Campus Sursee auf den Rollen von Dashboard-Style, die eigenen Tokens, Schrift der Wortmarke |
| `schriften/` | Archivo für die Wortmarke, selbst gehostet (Lizenz SIL OFL 1.1, `OFL.txt` daneben) |
| `bausteine.css`, `bausteine.js` | die eigenen Bausteine und ein Bauer je Baustein (gemeinsame bauen das Markup von Dashboard-Style): Knöpfe, Karten, Kacheln, Felder, Tabellen, Chips, Schalter, Listen, Diagramme, Sinnbilder … (`UI`), dazu `Bewegung` über `DS.motion`; `bausteine.css` trägt nur, was es nur hier gibt |
| `rahmen.css`, `rahmen.js` | Rahmen aller Seiten (Kopf, Navigation, Tafel, Lade- und Fehlerzustand, Ansichtswechsel), Dialog, Seitenblatt, Meldung und Tooltip über `DS.overlay`, dazu die Speicherleiste (`Rahmen`, ergänzt `UI`) |
| `fenster.js` | gemeinsames Gerüst der Detailseiten: Seitenkopf, Bereiche, Speichern, Löschen, Nachladen (`Fenster`) |
| `verlauf.js`, `verlauf.css` | Verlauf auf der Geräte-, Benutzer-, Telefon-, Kamera- und Kamerarollen-Seite (`Verlauf`) |
| `index.html`, `app.js`, `styles.css` | Hauptseite: Übersicht, Listen, Software, Kamerarechte |
| `client.*`, `benutzer.*`, `telefon.*`, `software.*`, `kamera.*`, `kamerarolle.*` | die Detailseiten eines Datensatzes (die `.css` nur mit Seitenlayout) |
| `styleguide.html`, `styleguide.js`, `styleguide.css` | lebende Übersicht aller Bausteine in allen Zuständen |
| `STYLEGUIDE.md` | Regeln des Frontends auf Dashboard-Style |
| `konfig.js` | Mandant, Client-ID, Listen-IDs, Takt des Nachladens – keine Geheimnisse (Abschnitt 7.4) |
| `auth.js` | Anmeldung über MSAL (`Auth`) |
| `graph.js` | Lesen und Schreiben über Microsoft Graph, erfundene Daten für `?mock=1` (`Daten`, `Mock`) |
| `modell.js` | Fachlogik: Geschäftsjahr, Status, Programmstufen, Verknüpfungen (`Modell`) |
| `spalten.js` | **generiert** von `Build-Spalten.ps1`, nie von Hand ändern (Abschnitt 4) |
| `_headers` | Sicherheitsheader und Inhaltsrichtlinie, mit einer Erklärung je Regel (Abschnitt 7.4) |

**Ladereihenfolge** – auf jeder Seite gleich, und sie ist wichtig: `<html class="ds-theme ds-base">`; im `<head>`
zuerst `<link rel="expect" href="#rahmen-gebaut" blocking="render">` (das erste Bild wartet, bis `rahmen.js` Kopf und
Schublade gebaut hat, nicht aber auf MSAL; sonst bricht Chrome den Seitenübergang ab), dann die Stilvorlagen
`grund.css` → `vendor/dashboard-style/fonts/fonts.css` → `vendor/dashboard-style/ds.css` →
`vendor/dashboard-style/css/optional/view-transitions.css` → `thema.css` → `bausteine.css` → `rahmen.css` → auf Seiten
mit Verlauf `verlauf.css` → die eigene Seitenvorlage. Im `<body>` das Gerüst `div.ds-app[data-seite]` und danach die
Meldungsregion `div.ds-toasts`; Skripte `konfig.js` → `vendor/dashboard-style/ds.js` → `bausteine.js` → `rahmen.js` →
`<div id="rahmen-gebaut" hidden>` → MSAL (vom CDN, mit Prüfsumme) → `spalten.js` → `auth.js` → `graph.js` →
`modell.js` → auf den Detailseiten `verlauf.js` (ausser Software) und `fenster.js` → das Skript der Seite. Die
vollständige Vorlage steht in `STYLEGUIDE.md`, Abschnitte 10.1 und 12. Ausser MSAL und dem Favicon lädt das Frontend
nichts von fremden Servern, auch keine Schriften.

**Inhaltsrichtlinie** (`_headers`, je Regel dort erklärt): Skripte nur aus eigenen Dateien und MSAL von
`cdn.jsdelivr.net`; Stile nur aus eigenen Stilvorlagen (`style-src 'self'`, kein `<style>` und keine
`style`-Attribute: Skripte und Dashboard-Style setzen Stile über das CSSOM); Bilder von `'self'`, `data:` (Masken in `ds.css`) und campus-sursee.ch (Favicon);
Schriften nur von `'self'`; Verbindungen nur zum eigenen Ursprung, zu Microsoft Graph und zur Anmeldung von Microsoft. Eine neue fremde
Adresse kommt nur mit Grund dazu, und zwar nur in `_headers`.

Lokal ansehen: `.\serve.ps1` im Ordner `code` (Windows PowerShell 5.1 oder PowerShell 7, `pwsh`), dann
`http://localhost:8123/?mock=1` (Vorführmodus mit erfundenen Daten; `&fehler=1` zeigt den Fehlerzustand) oder
`http://localhost:8123/styleguide.html`. Der Testserver schickt wie Cloudflare Pages die Header aus `_headers` mit;
ein Verstoss gegen die Inhaltsrichtlinie zeigt sich so schon lokal in der Konsole.

**Nach jeder Änderung prüfen:** `powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1` im Ordner `code`
(Windows PowerShell 5.1 oder PowerShell 7, ohne Browser und ohne Netz; mit `pwsh` läuft es auch in der nächtlichen
Aktualisierung von Dashboard-Style auf GitHub und muss darum unter beiden laufen). Es prüft in 14 Prüfungen statisch,
ob jedes Token definiert ist (auch die von Dashboard-Style), `@keyframes` nur in Dashboard-Style stehen und niemand
Bewegungs-Tokens setzt, das eigene CSS nur Tokens liest, kein `innerHTML`, `eval` oder `window.confirm` vorkommt,
keine Seite ein Inline-Skript trägt, MSAL überall mit derselben Prüfsumme geladen wird, keine Altlasten (alte Klassen,
Tokens und ICT-Namen, Google Fonts) zurückkommen, die Kopie von Dashboard-Style unverändert ist (`SHA256SUMS`), jede
Seite sie in der richtigen Reihenfolge lädt, jeder Aufruf von `DS.*`, jede Klasse `ds-*` und jedes Sinnbild in der
Kopie wirklich vorkommt, kein entfernter Name von Dashboard-Style benutzt wird (ein veralteter ist ein Hinweis, der
den Exit-Code nicht ändert), jede Seite das Gerüst der
Referenz-App hat, die Seiten-CSS nur Layout enthalten und kein Geviertstrich «—» im Code steht – je Prüfung «OK» oder
die Fundstellen mit Datei und Zeile, Exit-Code 0/1, erwartet «alle 14 Prüfungen OK». Dazu prüft das Werkzeug von
Dashboard-Style selbst die Projektregeln (im Wurzelordner, Node 18 oder neuer):
`node frontend/vendor/dashboard-style/tools/check-project.mjs --config ds-check.json`, erwartet «0 errors, 0
warnings»; die bewussten Abweichungen stehen in `ds-check.json` mit Grund. Was danach im Browser anzusehen ist, steht
in `STYLEGUIDE.md`, Abschnitt 10.3.

---

## 2. Der Sync

### 2.1 Konfiguration

`Sync-Inventar.config.json` neben dem Skript (Vorlage: `Sync-Inventar.config.example.json`):

| Schlüssel | Bedeutung |
|---|---|
| `TenantId`, `ClientId`, `CertThumbprint` | Anmeldung als Anwendung (Zertifikat) |
| `SiteUrl` / `SiteId` | die SharePoint-Site |
| `AdminClientListId`, `EduClientListId` | die beiden Client-Listen (siehe Listeneinstellungen in SharePoint). Fehlt eine, meldet der Sync das als ERROR und überspringt genau diese Phase |
| `BenutzerListId` | die Benutzer-Liste |
| `SoftwareListId` | die Liste «Software»; fehlt sie, laufen die AD-Felder normal weiter und nur die Programmstufen bleiben unangetastet |
| `TelefonListId` | die Liste «Telefonnummern»; fehlt sie, wird die Telefon-Phase mit einer Warnung übersprungen |
| `TelefonPraefix` | Nummernblock des Hauses ohne Kurzwahl, Standard `+41 41 926 2`; muss mit `telefonPraefix` in `frontend/konfig.js` übereinstimmen |
| `AdUserOUs` | **Array von OU-DNs**; nur Benutzer aus diesen OUs kommen in die Liste |
| `AdServer` | optional ein bestimmter Domänencontroller |
| `LoeschSchutzProzent` | Standard 50 (siehe 2.3) |
| `InventarWartezeitTage` | Standard 7: so lange wartet der Sync bei einem neu aufgesetzten Gerät ohne Hardware-Inventar auf die Seriennummer, bevor er es wie ein neues Gerät anlegt (2.2, Schritt 4a) |
| `SmsProvider`, `SiteCode` | SCCM |
| `LogPath` | Logdatei |

### 2.2 Ablauf eines Laufs

**Phase Clients** – sie läuft **zweimal**, einmal je Liste. Die Aufteilung entscheidet allein der
Gerätename: alles, was mit `EDU` beginnt, gehört in «EDU-Clients», alles Übrige in «ADMIN-Clients».
Diese eine Regel steht in `Get-ClientListe` (`Inventar-Gemeinsam.ps1`) und gespiegelt in
`frontend/modell.js` (`clientListe`); beide Seiten müssen dasselbe rechnen. Der Ablauf ist für beide
Listen derselbe:

1. Prüfen, ob die Liste `Status`, `InDomaene` und `Verlauf` hat. Der Sync **legt in den
   Client-Listen keine Spalten an** –
   er füllt nur Daten. Fehlt eine Spalte, meldet er das **einmal** als WARN und lässt genau ihre
   Felder aus; alles andere läuft normal weiter. Das gilt in allen drei Phasen: eine fehlende
   Spalte kostet nur ihre eigenen Felder, nie eine ganze Zeile. Anlegen: `Ergaenze-Spalten.ps1`
   oder von Hand in den Listeneinstellungen (Abschnitt 4).
2. SCCM per WMI lesen – auch Datensätze, die noch kein Betriebssystem tragen (das ist bei einem
   frisch aufgesetzten Gerät die ersten Stunden so; bis zum 13.10.2026 fielen sie durch den Filter
   gegen Server-Betriebssysteme und galten als verschwunden). Zeilen mit **«In Domäne = Nein»** fallen hier vollständig heraus: Sie
   bekommen kein Gerät, keine SCCM-Felder, werden nie archiviert und zählen nicht in die aktiven
   Zeilen des Archivschutzes. Leer gilt als Ja, ältere Zeilen verhalten sich also wie bisher.
3. **Zuordnung über die Seriennummer**, nicht über den Namen – je Liste getrennt. Verglichen wird die SCCM-Seriennummer
   mit der Spalte `SCCM_SerialNumber` (beides getrimmt und gross geschrieben); eine manuelle
   Seriennummer-Spalte gibt es seit dem 4. September 2026 nicht mehr. Platzhalter wie `To be filled by O.E.M.`, `Default string`,
   `System Serial Number`, `0`, `None` oder reine Füllmuster gelten als **keine** Seriennummer.
4. **Namensfallback**: Findet sich zur Seriennummer keine Zeile – oder hat das Gerät gar keine
   brauchbare Seriennummer (typisch bei VMs) –, wird über den PC-Namen zugeordnet, aber nur gegen
   Zeilen, die **selbst keine gültige Seriennummer** tragen und **nicht `Archiviert`** sind. So
   finden von Hand angelegte Zeilen ihr Gerät (und erben dessen Nummer),
   während ein neu aufgesetztes Gerät nie die archivierte Leiche gleichen Namens erbt.

   4a. **Neu aufgesetzte Geräte («Inventar ausstehend»)**. Beim Neuaufsetzen löscht SCCM oft den
   alten Datensatz und legt einen neuen an, der Stunden bis Tage lang weder Hardware-Inventar noch
   Seriennummer hat. Ob es dieselbe Hardware ist, zeigt erst die Seriennummer. Bis dahin gilt für
   ein solches Gerät, wenn Schritt 4 keine Zeile findet:

   | Gleichnamige Zeile | Was der Sync tut |
   |---|---|
   | im Einsatz (`Aktiv`/`Lager`), mit Seriennummer | **festhalten**: die Zeile wird weder archiviert noch überschrieben, es entsteht keine Dublette. Kommt das Inventar, trifft die Seriennummer dieselbe Zeile (gleiche Hardware) – oder die Zeile wird archiviert und eine neue angelegt (andere Hardware) |
   | archiviert, ohne Seriennummer | **reaktivieren** (die jüngste solche Zeile): sie hatte nie eine Hardware-Identität |
   | archiviert, mit Seriennummer | **warten**, nichts anlegen – höchstens `InventarWartezeitTage` (7) ab Anlage des SCCM-Datensatzes, danach wie ein neues Gerät |
   | keine | sofort neu anlegen |

   Das Log nennt jedes wartende Gerät («… ist neu aufgesetzt und hat noch kein Hardware-Inventar …»).
   Anlass waren CAMPUS-041 (am 09.10.2026 archiviert, weil SCCM das neu aufgesetzte Gerät bis zum
   13.10. ohne Betriebssystem führte) und die EDU-155-Notebooks (am 02.10.2026 je doppelt angelegt).
5. **Mehrere Geräte mit demselben Namen sind erlaubt**, in der Liste wie in SCCM. Nichts im Sync
   setzt voraus, dass der Titel eindeutig ist; bei gleichen Namen wird der Reihe nach zugeteilt,
   das Gerät mit der jüngsten Aktivität zuerst. Liefert SCCM mehrere Ressourcen mit **derselben
   Seriennummer** (Neuaufsetzung, Altdatensatz), gilt die mit der jüngsten Aktivität
   (`LastActive`, `LastHardwareScan`, `LastDDR`, `LastPolicyRequest`, AD-Anmeldung); die Dublette
   wird ins Log geschrieben. Eine Zeile gehört damit immer einer Hardware: Wird ein alter PC aus SCCM
   gelöscht (Zeile archiviert) und sein Name für ein anderes Gerät wiederverwendet, entsteht eine neue
   Zeile. Auch die Inhaberschaft hängt an der Zeile, nicht am Namen (Abschnitt 2.8) – das neue Gerät
   erbt den Inhaber des alten nicht.
6. **Umbenennung**: Weicht bei einem Treffer über die Seriennummer der SCCM-Name vom Titel ab, setzt
   der Sync `Title` auf den neuen Namen und hängt «Umbenannt von ALT zu NEU (SCCM)» an den Verlauf.
   Das ist der **einzige** Fall, in dem der Sync die manuelle Spalte `Title` schreibt. Der Inhaber
   bleibt dabei, wo er ist: er zeigt auf die Listen-ID, nicht auf den Namen.
7. Nur geänderte `SCCM_*`-Felder als PATCH schreiben.
8. Geräte ohne passende Zeile neu anlegen, mit Status `Aktiv` und dem Verlaufseintrag
   «Aus SCCM neu angelegt».
9. **Archivieren statt löschen**: Zeilen ohne SCCM-Gerät bekommen `SCCM_Found = Nein`, Status
   `Archiviert` und den Verlaufseintrag «In SCCM nicht mehr vorhanden, archiviert» – auch
   `Lager`-Geräte. Trägt die Zeile die ResourceID eines Geräts, das in diesem Lauf einer anderen
   Zeile zugeordnet ist, ist sie eine Dublette; ihr Verlaufseintrag lautet dann «Doppelte Zeile: das
   SCCM-Gerät (ResourceID …) steht in Zeile ID …, archiviert». Taucht ein archiviertes Gerät wieder in SCCM auf, setzt der Sync es auf `Aktiv`
   und schreibt «Wieder in SCCM vorhanden, reaktiviert». `Lager` bleibt unangetastet, solange das
   Gerät in SCCM ist, ein leerer Status wird beim ersten Kontakt zu `Aktiv`.
   **Die Client-Phasen löschen nie eine Zeile** – sie kennen keinen `DELETE`-Pfad. Vorgeschaltet ist
   der Archivschutz aus Abschnitt 2.3, und er zählt je Liste einzeln.
10. **Ein Gerät, das die Seite wechselt** (Umbenennung `CAMPUS-073` → `EDU-073`), verschwindet nicht:
   in der alten Liste findet der Sync kein SCCM-Gerät mehr und archiviert die Zeile, in der neuen
   legt er sie neu an. Der Verlauf bleibt in der alten Zeile stehen. Wer ihn mitnehmen will,
   verschiebt die Zeile von Hand oder mit `Migriere-Clients.ps1 -Schritte Umzug`.

**Phase Benutzer**:

1. Die Programmliste aus der SharePoint-Liste «Software» laden. Zeilen ohne Programm-Id und
   solche, deren Id kein gültiger Spaltenname wäre, werden gemeldet und übergangen.
2. Prüfen, welche Spalten die Benutzer-Liste hat: `Verlauf` und je Programm eine Textspalte.
   Programme ohne Spalte werden übersprungen und gemeldet.
3. AD-Benutzer der konfigurierten OUs lesen (Subtree), Manager-DN in den Anzeigenamen auflösen (Cache).
4. Je Programm mit hinterlegten AD-Gruppen die Mitglieder **rekursiv** ermitteln. Bevorzugt eine
   einzige LDAP-Abfrage je Gruppe mit `memberOf:1.2.840.113556.1.4.1941:=<Gruppen-DN>`; schlägt das
   fehl, greift `Get-ADGroupMember -Recursive`. Eine Gruppe, die es im AD nicht gibt, wird geloggt
   und zählt als leer. Lässt sich eine Gruppe dagegen **nicht lesen** (AD-Fehler), bleiben die
   Stufen dieses Programms im Lauf unverändert – ein kurzer AD-Fehler nimmt niemandem die `2` weg.
5. Primärgeräte aus `SMS_UserMachineRelationship` (bei mehreren das alphabetisch erste).
6. Upsert je AD-Benutzer, nur Deltas. Programme: Mitglied → `2`; nicht Mitglied und bisher `2` → `0`;
   `1` bleibt `1`, leer bleibt leer.
7. Zeilen, deren Login nicht mehr im AD-Scope liegt, werden gelöscht – mit Löschschutz.

**Phase Telefonnummern** (nur wenn `TelefonListId` gesetzt ist):

1. Prüfen, welche Spalten aus `schema-telefon.json` die Liste «Telefonnummern» hat.
2. Dieselben AD-Benutzer wie in der Benutzer-Phase verwenden (werden nur einmal gelesen).
3. Jede Zeile über die **Ziffernfolge** vergleichen (`+41 41 926 23 73`, `041 926 23 73` und die
   Kurzwahl `373` sind dieselbe Nummer). Steht die Nummer im AD-Feld `telephoneNumber` eines
   Benutzers, kommt sein Login in `Benutzer`; ein leerer Name wird mit dem AD-Anzeigenamen gefüllt,
   ein leerer Typ wird `Person`, Status `Frei` wird `Aktiv`. Jede dieser Änderungen steht im Verlauf.
4. Steht die Nummer bei niemandem mehr, wird `Benutzer` geleert (mit Verlaufseintrag). Name, Typ und
   Status bleiben stehen – ob eine Nummer frei ist, entscheidet ein Mensch. Konnte das AD in diesem
   Lauf nicht vollständig gelesen werden, wird nichts geleert. Eine unvollständige Nummer im AD
   (z. B. nur `+41 41 926 2` ohne Kurzwahl) wird gemeldet und nicht abgeglichen.
5. Nummern aus dem Hausblock (`TelefonPraefix`), die im AD stehen, aber in der Liste fehlen, werden
   **neu angelegt** (Typ `Person`, Status `Aktiv`, Verlauf «Aus dem AD neu angelegt»). Mobil- und
   Fremdnummern werden nur zugeordnet, nie angelegt.
6. Haben zwei AD-Benutzer dieselbe Nummer, gilt der alphabetisch erste Login; die Dublette wird
   geloggt. **Diese Phase löscht nie.**

Exit-Code 1, sobald ein Fehler aufgetreten ist.

**Robustheit** (seit 13.10.2026) – damit der Sync ohne Pflege läuft:

| Störung | Verhalten |
|---|---|
| eine Phase scheitert (SCCM, eine Liste, AD) | Fehler ins Log, die übrigen Phasen laufen weiter; ohne SCCM bleibt das Primärgerät der Benutzer unverändert |
| Graph drosselt (429) oder antwortet kurz nicht (5xx, Netz) | bis zu 6 Versuche mit wachsender Wartezeit bzw. `Retry-After`; ein POST wird nach 5xx/Netzfehler nicht wiederholt (sonst Dublette) |
| Token abgelaufen (401) | einmal neu anmelden und wiederholen |
| Anmeldung bei Entra ID scheitert am Netz | drei Versuche; eine Ablehnung (Zertifikat, App) wird sofort gemeldet |
| eine AD-OU lässt sich nicht lesen | ein zweiter Versuch nach 10 s; scheitert auch er, wird in diesem Lauf kein Benutzer gelöscht und keine Telefonzuordnung geleert |
| das AD ist ganz weg | eine Fehlermeldung, Benutzer- und Telefon-Phase ändern nichts |
| ein Lauf dauert länger als das Intervall | der nächste beendet sich sofort (Sperre `Global\ComputerInventar-Sync`); die Aufgabe bricht nach 25 Minuten ab |
| das Log wächst | ab 10 MB weggerollt, fünf alte Dateien bleiben |
| das Zertifikat läuft bald ab | ab 60 Tagen vorher eine Warnung je Lauf (Abschnitt 7.1); das jetzige gilt bis 02.09.2031 |
| etwas Unvorhergesehenes | ein Fangnetz schreibt es ins Log und in den Status, statt still abzubrechen |

### 2.3 Löschschutz (Benutzer) und Archivschutz (Clients)

Gelöscht wird überhaupt nur in der Benutzer-Phase. Nicht gelöscht wird, wenn

- das AD **keinen einzigen** Benutzer geliefert hat (typisch bei falscher OU oder AD-Ausfall), oder
- mehr als `LoeschSchutzProzent` % der Zeilen gelöscht würden.

In den Client-Phasen gibt es nichts zu schützen, weil dort nie gelöscht wird. Stattdessen greift
derselbe Prozentsatz beim Archivieren, **je Liste einzeln**: Würden mehr als `LoeschSchutzProzent` %
der nicht archivierten Zeilen einer Liste in einem Lauf archiviert – oder liefert SCCM für diese
Liste überhaupt kein Gerät –, archiviert der Sync in dieser Liste nichts. Die andere Liste ist davon
unberührt.

In allen Fällen schreibt der Sync einen ERROR ins Log und endet mit Exit-Code 1, ohne zu löschen oder
zu archivieren.

### 2.4 Parameter

```
Sync-Inventar.ps1 [-ConfigPath <json>] [-WhatIf] [-IncludeServers]
                  [-OnlyClients] [-ClientListen Alle|Admin|Edu]
                  [-OnlyBenutzer] [-OnlyTelefone] [-OnlyKameras]
                  [-KameraRechteJetzt] [-MilestoneDiagnose]
                  [-DumpOnly] [-OnlyDevices <Name,Name>] [-LogPath <Datei>]
```

| Parameter | Zweck |
|---|---|
| `-WhatIf` | zeigt nur, was geschrieben/gelöscht würde; darf neben einem laufenden Sync laufen |
| `-OnlyClients` / `-OnlyBenutzer` / `-OnlyTelefone` | nur eine Phase (`-OnlyTelefone` liest kein SCCM) |
| `-OnlyKameras` | nur die Kamera-Phasen (Milestone → Kameras und Kamera-Rollen), kein SCCM |
| `-KameraRechteJetzt` | die Rechte der Milestone-Rollen jetzt abgleichen, auch wenn der letzte Abgleich jünger ist als `MilestoneRechteStunden` |
| `-MilestoneDiagnose` | schreibt die ersten Antworten von Milestone zu Rollen, Mitgliedern und Rechten roh nach `Milestone-Diagnose.json` neben dem Log |
| `-ClientListen` | nur eine der beiden Client-Listen abgleichen: `Admin` oder `Edu` (Vorgabe `Alle`) |
| `-DumpOnly` | nur SCCM lesen und die aufbereiteten Felder ausgeben |
| `-IncludeServers` | Server-Betriebssysteme mitnehmen |
| `-OnlyDevices` | nur diese Geräte (zum Testen) |
| `-LogPath` | anderes Log als in der Konfiguration (Probeläufe von `Installiere-Sync.ps1`) |

Den Status (`Sync-Inventar.status.json`, `Inventar/sync-status.json`) schreiben nur vollständige
Läufe ohne diese Schalter – ein Probelauf verfälscht die Anzeige im Frontend also nie.

### 2.5 Auf den Server bringen

`C:\ComputerInventar\` auf `adminsrv319` enthält `Sync-Inventar.ps1` und `Inventar-Gemeinsam.ps1` aus
`code/server/` und die Konfiguration. Verteilt wird mit **`Installiere-Sync.ps1`** von einem
Arbeitsplatz aus, mit einem Konto, das auf dem Server Administrator ist – am einfachsten aus der
AdminShell, wo das Domänenkonto in `$Cred` steht:

```powershell
& .\code\Installiere-Sync.ps1 -Credential $Cred -JetztStarten
```

Das Skript

1. führt `Test-Inventar.ps1` aus und verteilt nichts, wenn ein Test fehlschlägt,
2. sichert die Skripte und die Konfiguration auf dem Server nach `_sicherung\<Zeitstempel>\`
   (die letzten zehn bleiben),
3. kopiert die beiden Skripte und vergleicht die Prüfsummen,
4. macht einen **Probelauf als SYSTEM** mit `-WhatIf -KameraRechteJetzt -MilestoneDiagnose` über eine
   einmalige Aufgabe (genau wie der echte Sync; in einer Remote-Sitzung erreichte er das AD nicht).
   Er zeigt je Milestone-Rolle Mitglieder, Kameras und Rechte und legt `Milestone-Diagnose.json`
   neben das Log. Bricht der Probelauf ab, spielt
   es die gesicherten Skripte zurück,
5. legt die geplante Aufgabe an oder gleicht sie an (Abschnitt 2.6),
6. startet mit `-JetztStarten` einen echten Lauf, wartet ihn ab und zeigt Ergebnis, Log-Ende und Status.

`-NurAnzeigen` zeigt nur, was auf dem Server liegt und wie die Aufgabe steht; `-IntervallMinuten`
ändert den Takt (Vorgabe 30).

**Die Konfiguration auf dem Server ist die führende Fassung** und wird nie überschrieben. Wer eine
Listen-ID, eine OU oder den Zertifikat-Thumbprint ändert, ändert sie dort (eine Sicherung legt
`Installiere-Sync.ps1` bei jedem Lauf an). Die Kopie in `code/server/` dient nur den Werkzeugen am
Arbeitsplatz; sie steht in `.gitignore` (`Sync-Inventar.config*.json`, mit Ausnahme der Vorlage) und
kommt nie nach GitHub – sie enthält die ClientId der Entra-App und den Thumbprint des
Anmeldezertifikats.

Die übrigen Werkzeuge aus `code/` gehören **nicht** auf den Server: sie ändern Listenstrukturen und
die Software-Liste und werden bewusst von Hand von einem Arbeitsplatz aus gestartet.

### 2.6 Geplante Aufgabe

«Computer Inventar Sync» läuft als **SYSTEM** **alle 30 Minuten** rund um die Uhr (Beginn jeweils
fünf Minuten nach der vollen Stunde), höchstens 25 Minuten lang, nie zweimal gleichzeitig, holt einen
verpassten Lauf nach einem Neustart nach und hängt nicht am Akku- oder Netzbetrieb. Eine Änderung in
SCCM oder im AD steht damit spätestens nach einer halben Stunde im Tool (bei einem neu aufgesetzten
Gerät zählt die Zeit, bis SCCM dessen Hardware-Inventar hat, Abschnitt 2.2). Ein Lauf dauert gut
eine Minute.

Das funktioniert auf dem Site-Server, weil das Computerkonto sowohl SCCM- als auch AD-Leserechte hat.
Auf einem anderen Server ein Dienstkonto mit SCCM-Rolle «Read-only Analyst» und AD-Leserecht verwenden
und diesem in `certlm.msc` Leserecht auf den privaten Schlüssel geben.

Fehlt die Aufgabe oder stimmt ihr Takt nicht, legt `Installiere-Sync.ps1` sie neu an; dabei verteilt es
immer auch die Skripte aus dem Arbeitsverzeichnis.
### 2.7 Telefonnummern

Die Liste «Telefonnummern» ersetzt die Excel-Datei «Telefonnummerm S4B.xlsx» (Blatt «Telefonnummer»).
Schlüssel ist die **Kurzwahl** (Titelspalte, z. B. `373`); die vollständige Nummer
(`+41 41 926 23 73`) ergibt sich aus `TelefonPraefix` + Kurzwahl und wird im Frontend vorgeschlagen.

| Spalte | Bedeutung |
|---|---|
| `Status` | `Aktiv` (in Betrieb, leer gilt als Aktiv), `Inaktiv` (vorhanden, aber nicht in Teams – SIP-Apparat, deaktiviertes Konto), `Frei` (zu vergeben) |
| `Typ` | `Person`, `Dienst`, `Raum`, `Notruf` |
| `Benutzer` | Login des AD-Benutzers mit dieser `telephoneNumber` – schreibt der Sync |
| `Name` | Bezeichnung von Hand; bei leerem Namen übernimmt der Sync den AD-Anzeigenamen |

Das Frontend ermittelt die Person **live** über das AD-Feld «Telefon» der Benutzer-Liste, unabhängig
davon, ob die Telefon-Phase des Syncs schon gelaufen ist. Eine Nummer gilt als **nicht zugewiesen**,
wenn weder eine Person noch ein Name noch ein Login dran hängt oder der Status `Frei` ist. Eine **freie**
Nummer ist das mit Absicht und kein Problem: sie trägt überall (Liste, Telefon- und Benutzerseite) den
neutralen Status «Frei» mit Haken, in der Spalte «Zugewiesen» ein schlichtes «Nein», und die Übersicht zählt
sie nur in der Zeile «Frei». Ist eine Nummer dagegen in Betrieb (`Aktiv` oder `Inaktiv`) und niemandem
zugewiesen, trägt sie in der Liste den Status «Nicht zugewiesen» als Warnung (Spalte «Zugewiesen»; die Zeile
selbst wird nicht eingefärbt), und die Übersicht zählt sie in der Karte «Telefonnummern» unter «Nicht
zugewiesen» und unter «Handlungsbedarf».
Ebenso: «Name weicht vom AD ab» (Liste und AD nennen verschiedene Personen) und in der Karte «Benutzer»
«Ohne Telefonnummer» (aktive AD-Konten ohne Telefonnummer).

Die Liste wurde am 04.09.2026 aus der Excel-Datei aufgebaut (307 Nummern, Stand 31.07.2026). Das
Importskript dafür war einmalig und ist entfernt; wer den Ablauf nachlesen will, findet es in der
Git-Historie (`git log -- code/Import-Telefonliste.ps1`). Gepflegt wird die Liste seither im
Frontend, ergänzt vom Sync.

Die Import-Spalte «Früherer Eintrag» (wer die Nummer vorher hatte) wurde im September 2026 in den
**Verlauf** überführt: `Migriere-FruehererEintrag.ps1` hängt je Zeile einen Eintrag
«Früherer Eintrag: … (aus der alten Telefonliste S4B übernommen)» mit Datum 31.07.2026 an, leert
die Spalte und löscht sie. Zuerst mit `-WhatIf`, dann ohne; braucht nur die Device-Code-Anmeldung.

### 2.8 Inhaberschaft (wem ein Gerät gehört)

Jeder **ADMIN-Client** hat **genau einen Inhaber**: die Person, der er formal gehört. Gespeichert
wird das in der Spalte `AdminClientId` der Benutzer-Liste (Anzeigename «ADMIN-Client-ID», Zahl) –
dort steht die **Listen-ID** der Zeile in «ADMIN-Clients», nicht ihr Name. Daraus folgt beides
zugleich: eine Person ist Inhaber von höchstens einem Gerät, und ein Gerät hat höchstens einen
Inhaber. Das Frontend zeigt statt der Zahl den PC-Namen (Spalte «ADMIN-Client» der Benutzertabelle).

**Die Inhaberschaft hängt an der Hardware, nicht am Namen.** Eine Zeile steht für ein Gerät
(Abschnitt 2.2, Zuordnung über die Seriennummer), und die Inhaberschaft zeigt auf diese Zeile:

| Fall | Was mit der Inhaberschaft passiert |
|---|---|
| Gerät wird umbenannt (im Frontend oder in SCCM) | nichts – der Inhaber bleibt |
| Alter PC wird aus SCCM gelöscht (Zeile «Archiviert»), ein anderes Gerät bekommt seinen Namen | Das neue Gerät bekommt eine eigene Zeile **ohne** Inhaber; der Inhaber hängt weiter am archivierten Vorgänger. Die Geräteseite des neuen Geräts bietet im Bereich «Inhaber» an, ihn zu übernehmen («Übernehmen»), die Benutzerseite meldet «… ist archiviert» und bietet das SCCM-Primärgerät zum Übernehmen an |
| Dieselbe Hardware wird neu aufgesetzt (gleiche Seriennummer) | nichts – der Sync findet dieselbe Zeile wieder und reaktiviert sie |
| Gerät wird gelöscht (Papierkorb) | Die Listen-ID bleibt bei der Person stehen und zeigt ins Leere («Gerät fehlt»). Holt man die Zeile aus dem Papierkorb zurück, behält sie ihre Listen-ID, und die Inhaberschaft gilt wieder |

Bis zum 13.10.2026 stand in der Spalte `Computer` der PC-Name. Damit verlor ein in SCCM umbenanntes
Gerät still seinen Inhaber, und ein neues Gerät erbte den Inhaber eines gleichnamigen alten.
`Migriere-Inhaberschaft.ps1` hat den Bestand am 13.10.2026 umgestellt (Abschnitt 11).

**EDU-Clients haben bewusst keinen Inhaber.** Sie sind Schulungsgeräte und gehören niemandem
persönlich. Auf ihrer Geräteseite fehlen darum der Bereich «Inhaber» und die Aktion «Ausgeben an …»
(an ihrer Stelle steht «In Betrieb nehmen»), in der Tabelle die Spalten «Inhaber» und «Inhaber gesetzt».
`AdminClientId` zeigt immer in die Liste «ADMIN-Clients».

**Nur von Hand.** Der Sync fasst `AdminClientId` **nie** an; `ConvertTo-BenutzerFelder` schreibt die
Spalte gar nicht erst. Gepflegt wird sie ausschliesslich im Frontend:

| Wo | Was |
|---|---|
| Geräteseite → Bereich **«Inhaber»** | «Inhaber festlegen» / «Inhaber wechseln» / «Inhaber entfernen». Beim Wechsel wird die Inhaberschaft des bisherigen Inhabers entfernt, bevor die des neuen gesetzt wird – so gibt es nie zwei. Hat das Gerät keinen Inhaber, aber ein archiviertes Gerät gleichen Namens einen, steht dort «Übernehmen» |
| Benutzerseite → Bereich **«Gerät»** | «Zuweisen» für einen gesuchten ADMIN-Client, «Inhaberschaft aufheben». Gleichnamige Geräte zeigen in der Suche ihre Seriennummer |
| Liste «ADMIN-Clients», Spalte **«Inhaber»** | Anzeige mit Verweis auf die Benutzerseite; Facette «Inhaber gesetzt» |
| Liste «Benutzer», Spalte **«ADMIN-Client»** | PC-Name des Geräts mit Verweis auf die Geräteseite, bei einem archivierten mit Status «Archiviert», bei einer Listen-ID ohne Zeile «Gerät fehlt» |

**SCCM ist nur Hinweisgeber.** `SCCM_PrimaryUser`, `SCCM_LastLogonUser`, `SCCM_CurrentLogonUser`,
`SCCM_TopConsoleUser` und `SCCMPrimaerGeraet` sagen, wer an einem Gerät *arbeitet* – nicht, wem es
*gehört*. Weichen sie vom Inhaber ab, zeigt die Geräteseite einen Hinweis («Primärer Benutzer
(SCCM) ist nicht der Inhaber»); geändert wird nichts. Das SCCM-Primärgerät lässt sich auf der
Benutzerseite auf Klick übernehmen. SCCM meldet es nur als Namen: heissen mehrere Geräte so, gilt das
nicht archivierte, darunter das, das in SCCM steht.

**Gleiche PC-Namen** sind erlaubt und nach einer Neuaufsetzung der Normalfall. Die Geräteseite nennt
gleichnamige Geräte mit Verweis: ein archiviertes als Info («Ein archiviertes Gerät heisst gleich»),
ein zweites Gerät **im Einsatz** als Warnung («Noch ein Gerät im Einsatz heisst gleich»). Dasselbe
sagt der Hinweis unter dem PC-Namen beim Tippen.

**Altlasten:**

| Fall | Was das Frontend tut |
|---|---|
| Zwei Personen tragen dieselbe Listen-ID | Die Geräteseite meldet «Mehr als ein Inhaber» (als Gefahr, mit Sinnbild), zeigt die überzähligen Einträge in einer eigenen Karte und bietet «Eintrag entfernen». Als Inhaber gilt der alphabetisch erste Name. In der Liste steht ein Status «+n» neben dem Namen. |
| Die Listen-ID zeigt auf keine Zeile (Gerät gelöscht) | Benutzerseite und Benutzertabelle melden «Gerät fehlt»; auf der Benutzerseite ein Gerät zuweisen oder die Inhaberschaft aufheben |
| Der Inhaber hängt an einem archivierten Gerät | Geräteseite: «Status «Archiviert», aber ein Inhaber ist eingetragen»; Benutzerseite: «… ist archiviert» |

### 2.9 Kameras und Kamera-Rollen (Milestone XProtect)

Die Videoüberwachung läuft auf **Milestone XProtect 2024 R1**: Management Server `adminsrv347`,
Recording Server `adminsrv346`. Der Sync liest über die REST-Schnittstelle des Management Servers
(`http://adminsrv347/API/rest/v1/…`); angemeldet wird am Identity Provider (`/idp/connect/token`), mit
dem Computerkonto des Sync-Servers oder einem Basisbenutzer von Milestone (Abschnitt 7.5).
**Milestone ist führend.** Das Tool ändert in Milestone nie etwas – auch die Rechte werden nur gelesen.

**Phase Kameras** (bei jedem Lauf, braucht `KameraListId` und `MilestoneServer`):

| Regel | Folge |
|---|---|
| Eine Zeile je **Hardware** | Kanäle (eine 360°-Kamera hat zwei) stehen als Text in `MS_Kanaele`; der Titel ist der Name des ersten Kanals |
| Zuordnung über Hardware-ID, dann MAC, dann Seriennummer, dann IP | eine Kamera, die in Milestone entfernt und neu hinzugefügt wurde (neue ID), behält ihre Zeile; die IP gilt nur für Zeilen, die nie verknüpft waren |
| Umbenennung in Milestone | Titel wird nachgeführt, Verlauf «Umbenannt in Milestone: alt → neu». Der Name ist im Frontend gesperrt, solange die Kamera in Milestone steht |
| Leeres Gebäude oder leerer Raum | wird aus dem Namen gefüllt («10.300 Treppe» → 10 / 10.300); von Hand gesetzte Werte bleiben |
| Neue Hardware | neue Zeile, Status «Aktiv», Verlauf «Aus Milestone neu angelegt» |
| Hardware verschwunden | Status «Archiviert», `MS_Gefunden` = Nein, Verlauf – ausser die Zeile steht auf **«Lager»** (ausgebaut) oder war nie mit Milestone verknüpft. Archivschutz wie bei den Clients (Abschnitt 2.3). Gelöscht wird nie |
| Neue IP, ersetzte Hardware (gleiche ID, andere Seriennummer) | Verlaufseintrag |

**Phase Kamera-Rollen** (höchstens alle `MilestoneRechteStunden` Stunden, Vorgabe 6, sofort mit
`-KameraRechteJetzt`; der Zeitpunkt steht in `Sync-Inventar.kamerarechte.json` neben dem Log):

1. Rollen und ihre Mitglieder lesen (`roles`, `roles/<id>/users`).
2. Je Rolle und Kamera die Rechte lesen. Eine Leseschnittstelle dafür hat Milestone nicht (Stand
   2024 R1, Auskunft Milestone im Entwicklerforum 04/2025); der Sync ruft die Aufgabe
   «ChangeSecurityPermissions» nur mit der Rolle und **ohne** zu setzende Rechte auf. Milestone ändert
   dann nichts, antwortet mit **400** und liefert die aktuellen Werte trotzdem mit
   (`Get-MilestoneKameraRechte`). Im Rumpf muss `type` vor `id` stehen, sonst liest Milestone die
   Rollen-ID als `00000000-…` und antwortet mit 404 «Unknown resource». Gezählt wird eine Kamera, wenn die Rolle **Live** oder
   **Wiedergabe** hat; dazu stehen die übrigen Rechte (Export, PTZ, Lesezeichen …). Die Rolle der
   Administratoren sieht alles («Vollzugriff»).
3. AD-Gruppen unter den Mitgliedern rekursiv in Logins auflösen (wie bei den Programmen, Abschnitt 3).
4. Liste «Kamera-Rollen» schreiben: Mitglieder, AD-Gruppen, Personen, Rechte, Kameras als JSON
   (Hardware-ID → Rechte). Änderungen an Mitgliedern und Kameras kommen in den Verlauf («Mitglied
   hinzugefügt», «Zugriff auf 3 Kameras erhalten: …») – das ist der Nachweis, wer wann was sehen durfte.
   Eine Rolle, die es in Milestone nicht mehr gibt, bekommt `MS_Gefunden` = Nein und bleibt stehen.
5. Je Kamera die Spalte «Sichtbar für» (`MS_Rollen`) schreiben.

Scheitert die Rechteabfrage (403, 404 oder ein anderer Fehler), bleiben Kameras, Rechte und «Sichtbar
für» in diesem Lauf unverändert – ein halbes Bild wäre ein falscher Nachweis. Mitglieder und Personen
werden trotzdem abgeglichen; im Log steht **ein** ERROR mit dem Grund, und der nächste Lauf versucht es
neu. Der erste erfolgreiche Abgleich einer Rolle steht im Verlauf als «Rechte erstmals aus Milestone
gelesen», nicht als «Zugriff erhalten». Eingebaute Konten des Milestone-Servers unter den Mitgliedern
(`NT AUTHORITY\NETWORK SERVICE`, `BUILTIN\…`) erscheinen als «Systemkonto» und werden nicht im AD gesucht. Bleiben die Rechte leer, obwohl kein Fehler kommt: einmal mit `-OnlyKameras
-KameraRechteJetzt -MilestoneDiagnose` laufen lassen und `Milestone-Diagnose.json` ansehen – dort steht,
wie Milestone die Rechte nennt (die Namen liest `ConvertFrom-MilestoneRechte`).

**Von Hand gepflegt** wird nur, was Milestone nicht kennt: Gebäude, Raum, Status, Bemerkung,
Beschaffung, Bewertung, Verlauf (Kameras) und die Bemerkung (Rollen). Im Frontend zählt die Übersicht
unter «Handlungsbedarf»: Kameras im Status «Aktiv», die nicht in Milestone stehen, in Milestone
deaktivierte, Kameras ohne Aufzeichnung, Kanäle ohne eigenen Namen (Milestone-Vorgabe «Modell (IP) -
Kamera 2») und überfälligen Ersatz.

**Verwandt:** Die Liste «Software» hat ein Programm «Milestone». Wer dort die AD-Gruppen der Rollen
einträgt, sieht die Berechtigung auch in der Benutzerliste als Stufe 2.

---

## 3. Software pflegen

Die SharePoint-Liste **«Software»** ist die einzige Quelle der Programmliste – für den Sync **und**
für das Frontend. Gepflegt wird sie im Frontend: Navigation links **«Software»**, Knopf **«Neues Programm»**
oder Klick auf den Namen einer Karte. Bis zum 08.09.2026 stand sie in der Datei
`Inventar/programme.json`; die Datei wird nicht mehr gelesen und kann in SharePoint gelöscht werden.

| Spalte | Bedeutung |
|---|---|
| `Title` («Programm-ID») | der **interne Spaltenname** in der Benutzer-Liste: Buchstaben und Ziffern, Beginn mit einem Buchstaben, max. 30 Zeichen. **Nach dem Anlegen unveränderlich** – SharePoint kann interne Namen nicht ändern, und eine neue Id ergäbe eine zweite Spalte, während die bisherigen Berechtigungen in der ersten liegen blieben |
| `Name` | Anzeigename, z. B. «Adobe Creative Suite». Wird auch der Anzeigename der Spalte |
| `Kategorie` | Gruppe in der Software-Liste und in der Spaltenwahl. Eine neue Kategorie entsteht, indem man sie eingibt |
| `AdGruppen` | sAMAccountNames von AD-Gruppen, **eine je Zeile**. Mehrere sind erlaubt, der Sync bildet die Vereinigung. Leer ist erlaubt: dann gibt es das Programm nur auf Stufe 0/1 von Hand |
| `Reihenfolge` | Sortiernummer. Kategorien erscheinen in der Reihenfolge ihres kleinsten Werts; leer sortiert ans Ende. Die Migration hat in Zehnerschritten vergeben, damit dazwischen Platz bleibt |
| – | Seit dem Excel-Abgleich (Abschnitt 10) stehen **94 Programme** in sieben Kategorien; neu dazu kam **«Protel-Abteilungen»** mit den 15 Abteilungen, die in der Excel als eigene Spalten neben Protel standen |
| `Bemerkung` | Freitext: wozu das Programm dient, wer es lizenziert |

**Ein Programm ist zwei Dinge zugleich**: eine Zeile in «Software» *und* eine Textspalte in der
Benutzer-Liste, deren interner Name die Programm-Id ist. Dort steht je Person die Stufe (0/1/2).
Ohne diese Spalte wäre das Programm wirkungslos – **darum legt die Programmseite sie beim Anlegen
gleich mit an**, mit den Rechten der angemeldeten Person (delegiert `Sites.ReadWrite.All`).

**Eine Zeile in «Software» genügt.** Wer ein Programm nicht im Frontend, sondern direkt in
SharePoint erfasst, bekommt die Spalte trotzdem: Seit dem 08.09.2026 legt auch der **Sync** eine
fehlende Programmspalte selbst an – das ist die einzige Stelle, an der er eine Spalte erzeugt.
Scheitert das (Berechtigung), bleibt es bei der bisherigen Warnung im Log, und das Programm wird
in diesem Lauf übergangen; `Ergaenze-Spalten.ps1 -Listen Benutzer` hilft dann nach.

**Reihenfolge beim Anlegen**: erst die Spalte, dann die Zeile. Scheitert die Spalte an der
Berechtigung, entsteht gar kein Programm – besser als eine Software-Zeile, die nirgends wirkt.

**Ein Programm entfernen**: auf der Programmseite **«Löschen …»** rechts im Seitenkopf (Programm-Id zur
Bestätigung eingeben, dann «Löschen»). Gelöscht wird nur die Zeile in «Software»; sie liegt danach 93 Tage
im Papierkorb der SharePoint-Site. **Die
Spalte in der Benutzer-Liste bleibt mit ihren Werten stehen** – sie mitzulöschen hiesse, die Berechtigungen aller Personen zu vernichten.
Der Sync ignoriert sie ab dann. Wer sie wirklich loswerden will, nimmt `Entferne-Spalte.ps1`
(sichert die Werte vorher) oder löscht sie in den Listeneinstellungen.

**Vorsicht bei `AdGruppen`**: Stufe 2 ist im Frontend gesperrt. Eine zu weit gefasste Gruppe vergibt
Berechtigungen automatisch an alle ihre Mitglieder. Es muss keine reine Software-Gruppe sein –
Abteilungs- und Rollengruppen (`MgmtS_*`, `Hot_*`, `BLD_*`, `Spo_*`) sind der Normalfall, `CS_ALLE`
für Software, die alle bekommen. Im Zweifel lieber leer lassen und von Hand auf 1 setzen.

Nach einer Änderung an den AD-Gruppen lohnt sich ein Blick auf die Wirkung, bevor der Sync
wirklich schreibt:

```powershell
powershell -ExecutionPolicy Bypass -File .\server\Sync-Inventar.ps1 -OnlyBenutzer -WhatIf
```

---

## 4. Spalten ändern

- **Manuelle Spalte** ändern: Eintrag in `schema-client.json`, `schema-benutzer.json`,
  `schema-telefon.json` bzw. `schema-software.json` anpassen, Spalte in SharePoint
  anlegen/umbenennen (siehe unten), dann `Build-Spalten.ps1` ausführen (erzeugt
  `frontend/spalten.js` neu).
- **SCCM-Spalte hinzufügen**: (1) Eintrag in `schema-client.json`, (2) Spalte in **beiden**
  Client-Listen anlegen (`SCCM_`-Präfix; `Ergaenze-Spalten.ps1` macht das in einem Lauf),
  (3) Feld in `Build-SccmFields` in `Sync-Inventar.ps1` ergänzen, (4) `-DumpOnly -OnlyDevices`
  prüfen, (5) `-WhatIf`, (6) laufen lassen, (7) `Build-Spalten.ps1`.
- **Programmspalte**: nur über die Liste «Software» (siehe Abschnitt 3). Nie von Hand in
  `spalten.js`.

`schema-client.json` beschreibt **beide** Client-Listen. Sie auseinanderlaufen zu lassen wäre der
sicherste Weg, sich zwei Frontends einzuhandeln – deshalb gibt es nur eine Datei.
**Der Sync legt nie eine Spalte an.** Er füllt nur Daten und meldet fehlende Spalten als WARN.
Spalten anlegen ist ein bewusster, eigener Schritt – von Hand in den Listeneinstellungen oder mit
`Ergaenze-Spalten.ps1`:

```
powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1
```

Erst mit `-WhatIf` prüfen, was angelegt würde: das Skript vergleicht die fünf Listen mit den
Schemadateien und der Liste «Software» und legt nur an, was fehlt – gelöscht oder geändert wird nie.
Mit `-Listen Admin|Edu|Benutzer|Telefon|Software` lässt sich eine einzelne Liste prüfen.
Angemeldet wird per Device-Code mit den Rechten eines Menschen; die Entra-App des Syncs hat auf der
Site bewusst nur Schreibrecht auf Zeilen und bleibt unberührt.

Wer von Hand anlegt, nimmt für `Verlauf` «Mehrere Textzeilen» ohne Rich-Text, für `Status` und die
Programmspalten eine einzeilige Textspalte. Der **interne Name** muss stimmen (er entsteht aus dem
Namen, den man beim Anlegen eingibt – späteres Umbenennen ändert ihn nicht mehr).

`frontend/spalten.js` wird **generiert** und darf nicht von Hand bearbeitet werden.

---

## 5. Tests

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1
```

Geprüft werden ohne Pester, ohne Netz, ohne SCCM und ohne AD: Geschäftsjahr-Helfer, Programm-Delta
des AD-Syncs, Löschschutz und Archivschutz, die Verlauf-Helfer (leer, ungültig, ein Eintrag, mehrere,
Anhängen ohne Verlust, kompakte Ausgabe), die Seriennummern-Normalisierung samt Platzhaltern, die
Zuordnung SCCM-Gerät ↔ Client-Zeile (Seriennummer vor Name, Dublettenwahl, Umbenennung,
Archivieren und Reaktivieren), die **Aufteilung ADMIN-/EDU-Clients** (`Get-ClientListe`), die
**Umrechnung Software-Zeile → Programm** samt Sortierung und Id-Prüfung, die Telefonnummern
(Normalisierung, Kurzwahl, Abgleich mit dem AD), das Verhalten bei fehlenden Spalten, **«In Domäne»**
(leer gilt als Ja, eine Zeile mit Nein wird nie archiviert und zählt nicht in den Archivschutz), die
**Umstellung der Inhaberschaft** vom PC-Namen auf die
Listen-ID (`Get-InhaberMigration`: eindeutiger Name, gleichnamige Geräte, unbekannter Name, schon
umgestellt, Konflikt), **neu aufgesetzte Geräte** ohne Hardware-Inventar (festhalten, reaktivieren, warten,
Wartezeit, Vorrang des inventarisierten Geräts) und **Dubletten**, unvollständige AD-Telefonnummern, die
**Betriebsregeln** (Wiederholung von Graph-Aufrufen samt nachgebautem `Invoke-RestMethod`, Zertifikatswarnung,
Status-Kurztext, Log-Rotation und -Zähler), Anzahl und Form der Schemaeinträge sowie die Syntax aller
`*.ps1` in `code/` und `code/server/`. Dazu die **Kameras**: Gebäude und Raum aus dem Namen, MAC,
Hersteller und Modell, das Lesen der Rechte (VIEW_LIVE wie viewLive, ohne Live/Wiedergabe leer), die
Zuordnung Milestone-Hardware ↔ Kamerazeile (Hardware-ID, MAC, Seriennummer, IP, Umbenennung, ersetzte
Hardware, Lager wird nie archiviert), Rollen-Mitglieder, Rollen-Verlauf, die Verschlüsselung des
Milestone-Kennworts und die Zuordnung der Excel-Bewertungen (`Migriere-Kameras.ps1`).

Erwartete Ausgabe: `Ergebnis: 439 bestanden, 0 fehlgeschlagen`.

---

## 6. Fehlerbehebung

| Symptom | Ursache | Lösung |
|---|---|---|
| `invalid_client` / `AADSTS700027` | Zertifikat abgelaufen oder nicht mehr an der App | Zertifikat erneuern (Abschnitt 7.1) |
| `Kein Zugriff auf den privaten Schlüssel` | Task-Konto darf den Schlüssel nicht lesen | in `certlm.msc` Leserecht vergeben oder als SYSTEM laufen lassen |
| Graph `403` beim Schreiben | Site-Berechtigung fehlt | der App die Rolle `write` auf die Site geben (Abschnitt 7.1, Schritt 5) |
| `… Spalte(n) fehlen und werden nicht geschrieben: …` | die Spalte gibt es in der Liste nicht (neu im Schema, umbenannt oder gelöscht) | `Ergaenze-Spalten.ps1` ausführen oder die Spalte von Hand in den Listeneinstellungen anlegen (Abschnitt 4). Bis dahin läuft der Sync normal weiter und lässt nur die Felder dieser Spalte aus |
| Graph `404` bei einer Liste | eine der `*ListId` in der Konfiguration ist falsch | IDs aus den Listeneinstellungen in SharePoint übernehmen |
| `field … is not recognized` | Spalte fehlt oder wurde umbenannt | Spalte wiederherstellen oder Eintrag im Skript entfernen |
| `Löschschutz greift: …` | AD lieferte nichts oder zu viele Löschungen | OU-DNs und AD-Verbindung prüfen; bei einer echten Massenmutation `LoeschSchutzProzent` bewusst erhöhen |
| `AD-Fehler in OU '<…>'` | Platzhalter statt echtem DN in `AdUserOUs` | echten Distinguished Name eintragen |
| `LDAP-Abfrage für Gruppe '…' fehlgeschlagen` | Gruppe existiert nicht (mehr) oder Name falsch | Name auf der Programmseite unter «AD-Gruppen» korrigieren; der Lauf bricht deswegen nicht ab |
| `SoftwareListId fehlt in der Konfiguration` | `SoftwareListId` fehlt in `Sync-Inventar.config.json` | ID aus den Listeneinstellungen der Liste «Software» eintragen (steht auch in `frontend/konfig.js`). Bis dahin bleiben die Programmstufen unangetastet |
| `Liste «Software» konnte nicht gelesen werden` | Liste fehlt oder keine Berechtigung | Liste in SharePoint prüfen; `Migriere-Clients.ps1 -Schritte Software` legt sie an |
| `Software-Liste: «…» taugt nicht als Spaltenname` | die Programm-Id enthält Sonderzeichen, beginnt mit einer Ziffer oder ist zu lang | Zeile in der Liste «Software» korrigieren. Achtung: eine schon angelegte Spalte behält ihren Namen – dann die Zeile löschen und neu erfassen |
| Ein neues Programm wirkt nicht | die Spalte in der Benutzer-Liste fehlt | Programmseite → Banner «Spalte nicht gefunden.» → «Spalte anlegen», oder `Ergaenze-Spalten.ps1 -Listen Benutzer` |
| `Get-WmiObject … Zugriff verweigert` | Konto ohne SCCM-Rechte oder DCOM blockiert | Konto als «Read-only Analyst» eintragen, Firewall prüfen |
| `Archivschutz greift: …` | SCCM lieferte nichts oder zu viele Zeilen würden archiviert | SCCM-Provider und WMI-Rechte prüfen; bei einer echten Massenausmusterung `LoeschSchutzProzent` bewusst erhöhen |
| Viele Zeilen plötzlich «Archiviert» | die Seriennummern stimmen nicht überein (z. B. Mainboardtausch, Platzhalter im BIOS) | `SCCM_SerialNumber` der betroffenen Zeilen mit SCCM vergleichen; den Status wieder auf `Aktiv` setzen, der nächste Lauf ordnet über den Namen neu zu |
| Ein Gerät wird doppelt angelegt statt zugeordnet | die Zeile trägt in `SCCM_SerialNumber` eine andere Seriennummer als das SCCM-Gerät, deshalb greift auch der Namensfallback nicht | `SCCM_SerialNumber` in der Zeile leeren; die überzählige Zeile archivieren |
| Ein neu aufgesetzter PC hat keinen Inhaber, der alte (archivierte) schon | so gewollt: die Inhaberschaft hängt an der Hardware, das neue Gerät ist eine eigene Zeile | Geräteseite des neuen Geräts → «Inhaber» → «Übernehmen» (Abschnitt 2.8) |
| Frontend: «Gerät fehlt» bei einer Person | ihre `AdminClientId` zeigt auf eine gelöschte Zeile | auf der Benutzerseite ein Gerät zuweisen oder die Inhaberschaft aufheben; oder die Zeile aus dem Papierkorb der Site zurückholen |
| `Verlauf von '…' ist unbrauchbar – Zeile übersprungen` | der Inhalt der Spalte `Verlauf` ist kein gültiges JSON-Array (von Hand bearbeitet?) | Inhalt in der Zeile sichten und auf `[]` oder ein gültiges Array setzen; der Sync überschreibt ihn absichtlich nicht |
| Ein PC fehlt in der Liste | er wurde nie gelöscht – die Client-Phasen löschen nie | in SharePoint nach Status `Archiviert` filtern; nur ein Mensch kann eine Zeile löschen. Zweiter Verdacht: der Name beginnt mit `EDU` und der PC steht in der anderen Liste. Dritter: er ist neu aufgesetzt und SCCM hat noch kein Hardware-Inventar – das Log sagt «… ist neu aufgesetzt und hat noch kein Hardware-Inventar …»; er erscheint, sobald SCCM die Seriennummer kennt (Abschnitt 2.2, Schritt 4a) |
| Übersicht: «Abgleich steht.» | der letzte vollständige Lauf ist über 2 Stunden her: Aufgabe deaktiviert, Server aus, Lauf hängt | auf `adminsrv319` die Aufgabe «Computer Inventar Sync» und das Log-Ende ansehen; `Installiere-Sync.ps1 -NurAnzeigen` zeigt beides vom Arbeitsplatz aus |
| Übersicht: «Letzter Abgleich mit Fehlern.» | der letzte Lauf hatte mindestens einen ERROR; der Kurztext nennt den ersten | Log auf dem Server; die übrigen Phasen sind trotzdem gelaufen |
| `Ein anderer Sync-Lauf ist noch aktiv – dieser Lauf entfällt.` | der vorige Lauf arbeitet noch (sehr langsames Graph oder SCCM) | nichts zu tun, solange es nicht bei jedem Lauf steht |
| `Doppelte Zeile: das SCCM-Gerät (ResourceID …) steht in Zeile ID …` im Verlauf | zwei Zeilen gehörten zum selben SCCM-Gerät (vor dem 13.10.2026 beim Neuaufsetzen entstanden) | die archivierte Dublette kann gelöscht werden; Inhaber und Verlauf stehen in der genannten Zeile |
| `Telefonnummer '…' von '…' im AD ist unvollständig` | im AD-Feld «Telefon» steht nur ein Teil der Nummer | im AD die ganze Nummer eintragen oder das Feld leeren |
| `Das AD ist nicht erreichbar …` | der Server erreicht keinen Domänencontroller | DC und Netz prüfen; Benutzer und Telefonnummern bleiben unverändert, bis der nächste Lauf durchkommt |
| `Sync-Status konnte nicht nach SharePoint geschrieben werden` | der Entra-App fehlt das Schreibrecht auf die Dokumentbibliothek der Site | Rolle `write` der App auf die Site prüfen (Abschnitt 7.1, Schritt 5); der Sync selbst läuft weiter |
| `Das Anmeldezertifikat läuft in … Tagen ab` | Zertifikat bald abgelaufen | erneuern (Abschnitt 7.1) |
| Ein PC steht plötzlich in der anderen Client-Liste | er wurde in SCCM umbenannt und hat dabei die Seite gewechselt (`EDU`-Präfix dazu oder weg) | Das ist so gewollt: die alte Zeile ist archiviert, die neue frisch angelegt. Wer den Verlauf mitnehmen will, verschiebt die Zeile mit `Migriere-Clients.ps1 -Schritte Umzug` |
| Ein Gerät steht in **beiden** Client-Listen | ein Umzug ist zwischen Anlegen und Löschen abgebrochen | Die überzählige Zeile von Hand löschen; das Log von `Migriere-Clients.ps1` nennt den Namen |
| `TelefonListId fehlt in der Konfiguration – Telefon-Phase übersprungen` | `TelefonListId` fehlt in `Sync-Inventar.config.json` | ID aus den Listeneinstellungen der Liste «Telefonnummern» eintragen (steht auch in `frontend/konfig.js`) |
| Frontend: Ansicht «Telefonnummern» ist leer und nennt konfig.js | `telefonListId` in `frontend/konfig.js` steht noch auf dem Platzhalter | ID von Hand eintragen und neu deployen |
| Ein Client lässt sich nicht speichern: «… gehört in die Liste …» | Der Name passt nicht zur offenen Liste (`EDU`-Präfix) | Namen korrigieren oder den Client in der anderen Liste erfassen. Ohne diese Sperre legte der nächste Sync das Gerät drüben neu an und archivierte die Zeile hier |
| `Nummer … steht im AD bei 'a' und 'b'` | zwei AD-Konten tragen dieselbe `telephoneNumber` | im AD bereinigen; bis dahin gilt der alphabetisch erste Login |
| Eine Person steht in der Telefonliste, aber «Person (AD)» ist leer | im AD fehlt bei diesem Konto das Feld «Telefon» (`telephoneNumber`) | Feld im AD setzen; beim nächsten Sync erscheint die Person, `Benutzer` wird geschrieben |
| Frontend: Ansicht «EDU-Clients» oder «Software» ist leer und nennt konfig.js | `eduClientListId` bzw. `softwareListId` steht noch auf dem Platzhalter | ID von Hand eintragen und neu deployen |
| Frontend: «Neues Programm» meldet «Keine Schreibberechtigung» beim Anlegen der Spalte | Das Konto darf in SharePoint keine Spalten anlegen | Entweder das Konto berechtigen oder die Spalte mit `Ergaenze-Spalten.ps1 -Listen Benutzer` nachziehen |
| Frontend: die Konsole meldet einen Verstoss gegen die Inhaltsrichtlinie («Refused to …»), ein Stil oder Skript fehlt | ein `<style>`, ein Inline-Skript, ein `on*`-Attribut oder eine fremde Adresse in einer Seite | in eine `.css`- bzw. `.js`-Datei verschieben bzw. die Adresse mit Grund in `frontend/_headers` nachtragen; `code\serve.ps1` zeigt den Verstoss schon lokal, `Pruefe-Frontend.ps1` (Prüfungen 5 und 12) vor dem Push |
| Frontend: die nächtliche Aktualisierung von Dashboard-Style scheitert in «Check» oder «Verify» | der neue Stand entfernt oder markiert etwas als veraltet, das ICT-Inventar noch benutzt (Prüfungen 10 und 11 bzw. `check-project.mjs` nennen die Stellen) | `frontend/STYLEGUIDE.md`, Abschnitt 11.1; die Seite bleibt bis dahin auf dem alten Stand |
| Umlaute in der Konsole falsch | OEM-Codepage | nur Anzeige; Log, JSON und SharePoint sind UTF-8 |
| Ein `.ps1` bricht mit «Zeichenfolge hat kein Abschlusszeichen» ab | Datei wurde ohne UTF-8-BOM gespeichert; PowerShell 5.1 liest sie dann als ANSI und zerlegt die Umlaute | Datei mit BOM speichern (`New-Object Text.UTF8Encoding($true)`). JSON dagegen bleibt **ohne** BOM, sonst kann der Browser es nicht lesen |

Das Skript beendet sich mit Exit-Code 1, sobald mindestens ein Fehler aufgetreten ist; die
Aufgabenplanung zeigt dann «0x1». Details stehen immer im Log.

---

## 7. Einrichtung von Hand

Alles hier ist **eingerichtet** und nur bei Zertifikatsablauf, neuer Frontend-Adresse oder Neuaufbau
nötig. Es gibt bewusst keine Setup-Skripte mehr: Schritte, die man alle paar Jahre einmal macht,
gehören in eine Anleitung und nicht in Code, der ungetestet verstaubt. Alle Schritte brauchen ein
Entra-Konto mit Rolle «Anwendungsadministrator» oder «Globaler Administrator».

### 7.1 Entra-App «SCCM-SharePoint-Sync» (der Sync)

Meldet sich mit einem Zertifikat als Anwendung an und darf Zeilen auf genau einer Site schreiben.

**1 – Zertifikat auf `adminsrv319` erzeugen** (PowerShell als Administrator). Der private Schlüssel
bleibt auf dem Server, `NonExportable` ist Absicht:

```powershell
New-SelfSignedCertificate -Subject 'CN=SCCM-SharePoint-Sync' -CertStoreLocation Cert:\LocalMachine\My `
  -KeyExportPolicy NonExportable -KeySpec Signature -KeyLength 2048 -KeyAlgorithm RSA `
  -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(5) -KeyUsage DigitalSignature `
  -Provider 'Microsoft Enhanced RSA and AES Cryptographic Provider'
```

Thumbprint notieren und den öffentlichen Teil für den Upload exportieren:

```powershell
$c = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq 'CN=SCCM-SharePoint-Sync' }
Export-Certificate -Cert $c -FilePath C:\ComputerInventar\SCCM-SharePoint-Sync.cer
```

**2 – App-Registrierung** (Entra Admin Center → App-Registrierungen → Neue Registrierung):
Name `SCCM-SharePoint-Sync`, «Nur Konten in diesem Organisationsverzeichnis», **keine**
Umleitungs-URI. Die ClientId von der Übersichtsseite notieren.

**3 – Zertifikat hinterlegen**: Zertifikate & Geheimnisse → Zertifikate → die `.cer` hochladen.

**4 – Graph-Berechtigung**: API-Berechtigungen → Microsoft Graph → **Anwendungsberechtigungen** →
`Sites.Selected` → «Administratorzustimmung erteilen». `Sites.Selected` allein gibt noch **keinen**
Zugriff – erst Schritt 5 öffnet genau eine Site.

**5 – Schreibrecht auf die Site**. Das geht nur über Graph, nicht im Portal. Im
[Graph Explorer](https://developer.microsoft.com/graph/graph-explorer) als Konto mit
`Sites.FullControl.All` (oder als Site-Collection-Admin) zuerst die Site-Id holen:

```
GET https://graph.microsoft.com/v1.0/sites/campussursee.sharepoint.com:/sites/mgmts-ict-s
```

Dann der App die Rolle `write` auf diese Site geben:

```
POST https://graph.microsoft.com/v1.0/sites/<site-id>/permissions
{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "<ClientId>", "displayName": "SCCM-SharePoint-Sync" } }
  ]
}
```

`write` genügt bewusst: der Sync schreibt nur Zeilen, nie Spalten (Abschnitt 4). Die bestehende
Berechtigung prüft man mit `GET /sites/<site-id>/permissions`.

**6 – Konfiguration**: `Sync-Inventar.config.example.json` nach `Sync-Inventar.config.json` kopieren
und `TenantId`, `ClientId`, `CertThumbprint` eintragen; `AdUserOUs` auf die echten OU-DNs prüfen.

**7 – Leserecht auf den privaten Schlüssel** für das Konto der geplanten Aufgabe:
`certlm.msc` → Zertifikat → Alle Aufgaben → Private Schlüssel verwalten. Läuft die Aufgabe als
SYSTEM auf dem Site-Server, ist das normalerweise schon gegeben. Dasselbe Konto braucht
**Leserecht auf das Active Directory** (Benutzerattribute und Gruppenmitgliedschaften der OUs aus
`AdUserOUs`); das Computerkonto des Site-Servers erfüllt das in einer Domäne bereits.

**8 – Probe**:

```powershell
powershell -ExecutionPolicy Bypass -File .\Sync-Inventar.ps1 -WhatIf -OnlyClients -OnlyDevices CAMPUS-073
```

**Zertifikat erneuern** (alle 5 Jahre, oder bei `AADSTS700027`): Schritte 1 und 3 wiederholen, den
neuen Thumbprint in die Konfiguration eintragen, einen Lauf abwarten und **erst dann** das alte
Zertifikat an der App entfernen. Beide Zertifikate dürfen gleichzeitig hinterlegt sein.

### 7.2 Entra-App «Computer Inventar Frontend» (SPA)

**1 – App-Registrierung**: Name `Computer Inventar Frontend`, «Nur Konten in diesem
Organisationsverzeichnis».

**2 – Plattform**: Authentifizierung → Plattform hinzufügen → **Einzelseitige Anwendung (SPA)**.
Nicht «Web» – sonst scheitert der Token-Tausch im Browser mit `AADSTS9002326`. Implizite Flows
(«Zugriffstoken», «ID-Token») bleiben **aus**, die SPA nutzt Authorization Code Flow mit PKCE.

**3 – Umleitungsadressen**: exakt so, wie der Browser sie aufruft – **mit** Schrägstrich am Ende,
ohne `?` und `#`. Produktiv `https://inventar.campus-sursee.ch/`, für lokale Tests zusätzlich
`http://localhost:8765/` (die Portnummer von `serve.ps1` bzw. `.claude/launch.json`). Ausser
`localhost` ist immer `https` zwingend.

**4 – Graph-Berechtigungen**: **Delegiert** `User.Read` und `Sites.ReadWrite.All` →
«Administratorzustimmung erteilen».

**5 – Zugang einschränken**: Unternehmensanwendungen → «Computer Inventar Frontend» →
Eigenschaften → **Zuweisung erforderlich = Ja**, dann unter «Benutzer und Gruppen» die berechtigten
Personen zuweisen. Ohne das darf sich jede Person im Tenant anmelden.

**6 – ClientId** in `frontend/konfig.js` als `clientId` eintragen und neu deployen.

Der Name der Registrierung bleibt `Computer Inventar Frontend` – in Entra ID ist er ein Bezeichner,
und ihn umzubenennen brächte nichts als eine Nacht voll Umleitungsfehler. Im Frontend heisst die
Anwendung «ICT-Inventar».

Die Option «Öffentliche Clientflows zulassen» steht bei dieser App auf **Nein**. Sie ist für die SPA
nicht nötig – deshalb meldet sich `Ergaenze-Spalten.ps1` per Device-Code mit dem öffentlichen Client
von Microsoft Graph PowerShell (`14d82eec-204b-4c2f-b7e8-296a70dab67e`) an und nicht mit dieser
ClientId; die würde den Device-Code-Flow mit `AADSTS7000218` abweisen.

### 7.3 Telefonkontakte im AD (Teams-Adressbuch)

Kontakte wie «Nachtdienst» stehen als AD-Kontaktobjekte in
`OU=Contacts Sync,OU=Lync 2010,OU=Resources,OU=Staff,DC=sasadmin,DC=local` und laufen über Entra
Connect ins Adressbuch und nach Teams. Ein Kontakt erscheint dort **nur**, wenn alle vier Attribute
gesetzt sind:

| Attribut | Inhalt |
|---|---|
| `displayName` | Anzeigename, identisch mit dem Objektnamen |
| `mail` | Mailadresse – ohne sie ignoriert der Kontakt-Sync den Eintrag |
| `mobile` | die Nummer; dieses Feld nutzt der Kontakt-Sync |
| `telephoneNumber` | dieselbe Nummer |

Schreibweise wie bei den bestehenden Kontakten der OU: `+41 79 392 21 63`. Schreibrecht auf die OU
haben nur Domain Admins; bearbeitet wird im Attribut-Editor von «Active Directory-Benutzer und
-Computer» oder mit `Set-ADObject`. Bis der Kontakt in Teams sichtbar ist, dauert es einen
Entra-Connect-Zyklus (Standard 30 Minuten).

**Offen (Stand 04.09.2026)**: «Nachtdienst 2 (Spät)» hat weder `displayName` noch `mobile`.
Einzutragen: `displayName` = `Nachtdienst 2 (Spät)`, `mobile` = `+41 79 376 41 98`.
Von 52 Kontakten in der OU haben 3 kein `displayName` oder `mail`.

### 7.4 Cloudflare Pages (Hosting des Frontends)

Der Ordner `frontend` wird von **Cloudflare Pages** direkt aus GitHub ausgeliefert – ohne
Bauprozess. Die Einstellungen, die im Repository stehen können, stehen in `wrangler.toml`; alles
Übrige wird einmalig im Cloudflare-Dashboard gesetzt.

**1 – Projekt anlegen**: Cloudflare-Dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git** → Repository `CAMPUS-SURSEE/ict-computermanagement` auswählen.

**2 – Projektname**: `campussursee-ictinventar`. Cloudflare schlägt beim Anlegen den
Repository-Namen vor (`ict-computermanagement`) – der ist zu überschreiben. Der Projektname muss mit
`name` in `wrangler.toml` übereinstimmen, sonst bricht der Build ab. Wer einen anderen Namen will,
führt ihn in `wrangler.toml` nach.

**3 – Build-Einstellungen**:

| Feld | Wert |
|---|---|
| Production branch | `main` |
| Framework preset | *None* |
| Build command | **leer lassen** |
| Build output directory | `frontend` (kommt aus `wrangler.toml` und ist deshalb nur lesbar) |
| Root directory | `/` |

Es gibt keine Umgebungsvariablen. Client-ID, Mandant und die sieben Listen-IDs stehen offen in
`frontend/konfig.js` – das ist bei einer SPA so vorgesehen, der Schutz kommt aus der Anmeldung und
aus den SharePoint-Berechtigungen (Abschnitt 7.2).

**4 – Eigene Domain**: Projekt → **Custom domains** → **Set up a custom domain** →
`inventar.campus-sursee.ch`. Liegt die Zone bei Cloudflare, wird der CNAME automatisch gesetzt;
sonst den angezeigten CNAME auf `campussursee-ictinventar.pages.dev` beim DNS-Anbieter eintragen. Das
Zertifikat stellt Cloudflare selbst aus. Erst wenn die Domain aktiv ist, passt sie zur
Umleitungsadresse `https://inventar.campus-sursee.ch/` aus der App-Registrierung (Abschnitt 7.2).

**5 – Veröffentlichen**: Jeder Push auf `main` löst einen Deploy aus, meist in unter einer Minute.
Ein Push auf einen anderen Zweig oder ein Pull Request erzeugt eine Vorschau unter einer eigenen
`*.pages.dev`-Adresse. Dort scheitert die Anmeldung, weil die Adresse nicht in der
App-Registrierung steht – Vorschauen deshalb mit `?mock=1` anschauen oder die Adresse dort ergänzen.

**Sicherheitsheader** kommen aus `frontend/_headers`. Cloudflare Pages liest diese Datei im
Wurzelverzeichnis der Ausgabe – genau dort liegt sie – und liefert sie selbst nicht aus. Das Format
ist dasselbe wie zuvor bei Netlify; geändert wird ausschliesslich dort, nie im Dashboard und nie in
`wrangler.toml`.

**Eigenheit**: Cloudflare Pages liefert Seiten ohne die Endung `.html` aus und leitet
`/client.html?id=…` mit 308 auf `/client?id=…` um. Die Abfragezeichenfolge bleibt erhalten, die
Verweise im Frontend dürfen weiter `client.html` heissen. Die Anmeldung ist davon nicht betroffen:
`auth.js` benutzt als Umleitungsadresse immer die Wurzel, nie einen Dateinamen.

### 7.5 Lesekonto für Milestone (Kameras und Rechte)

> **Stand 15.10.2026 – in Betrieb mit dem Basisbenutzer.** Der Sync meldet sich als Basisbenutzer
> **`inventar-sync`** an (`MilestoneAnmeldung` = `Basis`, Kennwort verschlüsselt in
> `C:\ComputerInventar\Milestone.kennwort`). `inventar-sync` gehört in Milestone der Rolle
> **«Administrators»** an (Entscheid Janis Zesiger) – damit sieht der Sync alle Rollen und Rechte. Er
> schreibt trotzdem nie etwas nach Milestone: der einzige POST ist die Rechteabfrage ohne Werte
> (Abschnitt 2.9). Die AD-Gruppe `Milestone_InventarSync` (Mitglied `ADMINSRV319$`) besteht noch, wird
> aber nicht gebraucht. Kennwort ändern: in Milestone ändern, dann
> `Installiere-Sync.ps1 -Credential $Cred -MilestoneBenutzer 'inventar-sync' -MilestoneKennwort (Read-Host -AsSecureString 'Kennwort')`.

Der Sync läuft als SYSTEM auf `adminsrv319` und kann sich bei Milestone auch mit dem
**Computerkonto `SASADMIN\ADMINSRV319$`** anmelden (`MilestoneAnmeldung` = `Windows`, kein Kennwort). Das
funktioniert, sobald das Konto in Milestone einer Rolle angehört – ohne Rolle antwortet Milestone mit
403.

1. **AD-Gruppe** anlegen, z. B. `Milestone_InventarSync`, Mitglied: Computerkonto `ADMINSRV319$`.
   Danach `adminsrv319` neu starten oder `klist -li 0x3e7 purge` als Administrator ausführen, damit
   das Computerkonto die neue Gruppe im Kerberos-Ticket trägt.
2. **Rolle in Milestone** (Management Client → Sicherheit → Rollen → Rolle hinzufügen), z. B.
   «Inventar-Sync (nur lesen)»: Mitglied die AD-Gruppe aus Schritt 1; im Register «Gesamtsicherheit»
   Leserecht auf Management Server, Hardware, Kameras, Recording Server und **Rollen**. Für die Rechte
   je Kamera braucht die Rolle zusätzlich das Recht, die Sicherheit der Kameras zu sehen («Sicherheit
   verwalten» bzw. «Manage security» bei Kameras) – der Sync ändert damit nichts, er liest nur.
   Ohne Live-, Wiedergabe- oder Exportrecht sieht das Konto keine Bilder.
3. **Einschalten und prüfen:** Bis hierhin überspringt der Sync die Kamera-Phasen mit einer Warnung
   («MilestoneServer fehlt»), damit die Übersicht keinen Fehler meldet. Eingeschaltet werden sie aus
   der AdminShell mit

   ```powershell
   & .\code\Installiere-Sync.ps1 -Credential $Cred -MilestoneServer 'http://adminsrv347' -JetztStarten
   ```

   Im Probelauf und im Log erscheinen «Milestone (…): 112 Kamera-Hardware», «Milestone: n Rollen» und
   je Rolle eine Zeile «Milestone-Rolle «…»: … Kameras, Rechte: …». Bei «403» fehlt der Rolle ein
   Recht (Schritt 2). Eine eigene Rolle mit nur diesen Rechten ist gegen echte Daten nicht geprüft;
   der Betrieb läuft über die Rolle «Administrators» (siehe oben).

**Alternative: Basisbenutzer von Milestone** (lokales Konto ohne AD) – geht ebenso, mit zwei Nachteilen:
das Kennwort muss auf dem Server liegen (mit DPAPI LocalMachine verschlüsselt in
`C:\ComputerInventar\Milestone.kennwort`, lesbar nur für SYSTEM und Administratoren), und solange der
Management Server nur über HTTP erreichbar ist, geht es bei jeder Anmeldung im Klartext durchs Netz.
Einrichten: Basisbenutzer in Milestone anlegen, der Rolle aus Schritt 2 hinzufügen, dann aus der AdminShell

```powershell
& .\code\Installiere-Sync.ps1 -Credential $Cred -MilestoneBenutzer 'inventar-sync' -MilestoneKennwort (Read-Host -AsSecureString 'Kennwort')
```

Das setzt `MilestoneAnmeldung` = `Basis`. Zurück zum Computerkonto: in der Server-Konfiguration
`MilestoneAnmeldung` auf `Windows` setzen.

**HTTPS:** `https://adminsrv347` scheitert am Zertifikat (Stand 13.10.2026). Ist es repariert,
`MilestoneServer` in der Server-Konfiguration auf `https://adminsrv347.sasadmin.local` umstellen.

---

## 8. Entfernen

1. Geplante Aufgabe löschen: `Unregister-ScheduledTask -TaskName 'Computer Inventar Sync' -Confirm:$false`
2. App-Registrierungen «SCCM-SharePoint-Sync» und «Computer Inventar Frontend» im Entra Admin Center löschen.
3. Zertifikat in `certlm.msc` löschen, Ordner `C:\ComputerInventar` entfernen.
4. Pages-Projekt «campussursee-ictinventar» im Cloudflare-Dashboard löschen und den CNAME für `inventar.campus-sursee.ch` im DNS entfernen.

---

## 9. Der Umbau vom 08.09.2026

Einmaliger Schritt. `Migriere-Clients.ps1` macht in einem Lauf alles, was in SharePoint anzufassen
ist; Frontend, Sync und Schemadateien stehen bereits im Repository. Fünf Schritte, jeder für sich
wiederholbar:

| Schritt | Was passiert |
|---|---|
| `Umbenennen` | Liste «Computer» heisst neu «ADMIN-Clients» (Anzeigename; die Listen-ID bleibt, darum ändern sich die Konfigurationen nicht). Die Spalte `Computer` der Benutzer-Liste bekommt den Anzeigenamen «ADMIN-Client» |
| `Edu` | Liste «EDU-Clients» anlegen und mit allen Spalten aus `schema-client.json` füllen |
| `Software` | Liste «Software» anlegen, mit den Spalten aus `schema-software.json`, und aus der bisherigen `Inventar/programme.json` füllen (Reihenfolge in Zehnerschritten, Kategorienfolge wie in der Datei) |
| `Umzug` | Zeilen, deren Name mit `EDU` beginnt, von «ADMIN-Clients» nach «EDU-Clients» umziehen: **erst drüben anlegen, dann hier löschen**. Gelöschte Zeilen liegen 93 Tage im Papierkorb der Site; vorher wird alles nach `lokal\` gesichert |

```powershell
powershell -ExecutionPolicy Bypass -File .\Migriere-Clients.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\Migriere-Clients.ps1
```

Immer zuerst mit `-WhatIf` – dann wird nur gelesen, gesichert und gezählt. Nicht während eines
laufenden Syncs starten (geplante Aufgabe alle 4 h, Abschnitt 2.6). Angemeldet wird per Device-Code
mit einem Konto, das **Vollzugriff auf die Site** hat: Listen anlegen und umbenennen darf die
Zertifikats-App des Syncs bewusst nicht. Mit `-Schritte Edu` (oder `Software`, `Umzug`,
`Umbenennen`) läuft nur ein einzelner Schritt.

Am Ende gibt das Skript die drei Listen-IDs aus. Sie gehören an zwei Stellen eingetragen:

| Datei | Schlüssel |
|---|---|
| `code/server/Sync-Inventar.config.json` (auf dem Server) | `AdminClientListId`, `EduClientListId`, `SoftwareListId` |
| `frontend/konfig.js` | `adminClientListId`, `eduClientListId`, `softwareListId` |

**Gelaufen am 08.09.2026, 0 Fehler.** Die Werte stehen bereits in `frontend/konfig.js`, in
`code/server/Sync-Inventar.config.json` und in der Vorlage daneben. Auf den Server kommen sie
mit dem Kopierbefehl aus Abschnitt 2.5 – dort ist nichts mehr von Hand einzutragen:

| Liste | Listen-ID | Stand danach |
|---|---|---|
| ADMIN-Clients | `7870205c-bfa6-4d18-8035-d16d0a082637` (unverändert) | 163 Zeilen, keine mit EDU-Namen |
| EDU-Clients | `a7a8bd95-6978-4cf1-bd0b-416319dcd58f` | 31 Zeilen, 13 davon mit übernommenem Verlauf |
| Software | `047562f5-2646-48e4-a03a-51b5c3a7a5fd` | 71 Programme, 58 davon mit AD-Gruppe |

Die Benutzer-Liste hat alle 71 Programmspalten, und die Spalte `Computer` wird als
«ADMIN-Client» angezeigt. Die Sicherung der 31 umgezogenen Zeilen liegt unter
`lokal/Migration-EduClients-20260908-094204.json`.

Bei der Gelegenheit sind aus der Konfiguration drei Schlüssel verschwunden, die kein Skript je
gelesen hat: `AltListId` (die Liste «Computer Inventar» aus der Zeit vor der Aufteilung),
`FrontendClientId` und `AdGruppenPraefixe`. `ComputerListId` heisst jetzt `AdminClientListId`,
`ProgrammeDateiPfad` ist ersatzlos weg. **`TelefonListId` fehlte in der Server-Konfiguration** –
die Telefon-Phase wurde damit seit dem 04.09.2026 bei jedem Lauf mit einer Warnung übersprungen;
sie steht jetzt drin.

Danach zur Kontrolle:

```powershell
powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\server\Sync-Inventar.ps1 -WhatIf
```

**Was nach dem Umbau liegen bleibt und aufgeräumt werden kann:**

- `Dokumente/Inventar/programme.json` samt den `programme.sicherung.*.json` in SharePoint. Sie werden
  von niemandem mehr gelesen; das Repository kennt sie nicht mehr.
- `C:\ComputerInventar\programme.json` auf dem Server: der Rückfall von früher. Der Kopierbefehl aus
  Abschnitt 2.5 löscht sie nicht (er spiegelt bewusst nicht), also einmal von Hand wegnehmen.
- `Migriere-Clients.ps1` selbst, sobald der Umbau überall gelaufen ist.

Der Eintrag `https://campussursee.sharepoint.com` in `connect-src` von `frontend/_headers` ist
bereits entfernt: er war nur für den Dateidownload von `programme.json` nötig. Listenzeilen kommen
direkt von `graph.microsoft.com`.

---

## 10. Der Excel-Abgleich vom 08.09.2026

Vor den SharePoint-Listen wurde das Inventar in zwei Excel-Dateien geführt, und beide sind
danach weitergepflegt worden. `Abgleich-Excel.ps1` hat sie einmalig übernommen: **was in der Excel
steht, gilt** – mit einer begründeten Ausnahme bei den Telefonnummern (siehe unten).

Das Skript ist am 13.10.2026 gelöscht worden und steht nur noch in der Git-Historie: Es schrieb die
Inhaberschaft als PC-Namen in die Spalte `Computer`, die es seit der Umstellung (Abschnitt 11) nicht
mehr gibt. Seit dem Abgleich wird nur noch in SharePoint gepflegt.

### Was woher kommt

| Excel | Liste | Übernommen |
|---|---|---|
| Blatt «Computer und User», Spalte `PC-Name` | **ADMIN-Clients** | Gebäude/Stock, Bemerkung, Beschaffungsjahr, Ersatz geplant |
| Blatt «Computer und User», Spalte `Login` | **Benutzer** | Bemerkung, Inhaberschaft (`Computer`), Programmstufen |
| Blatt «EDU-Geräte», Spalte `Arbeitsplatz` | **EDU-Clients** | PC-Name, Gebäude/Stock, Bemerkung, Beschaffungsjahr, Ersatz geplant, In Domäne |
| Blatt «Computer und User», Programmspalten | **Software** | fehlende Programme samt Spalte in der Benutzer-Liste |
| Blatt «Telefonnummer» | **Telefonnummern** | nur Bericht, siehe unten |

Die Regeln, die dabei nicht in der Excel stehen, sondern aus dem Datenmodell kommen:

- **Kein Gerät ist kein Gerät.** Steht im PC-Namen `Kein PC` oder `Shared CAMPUS-070`, hat die
  Person kein eigenes Gerät. Solche Zeilen sind Arbeitsplätze, keine Clients – sie kommen in
  keine Client-Liste, und die Inhaberschaft der Person wird geleert.
- **Beschaffungsjahr** ist das jüngste angekreuzte Jahr (mehrere Kreuze heissen «ersetzt»).
  **Ersatz geplant** ist Beschaffungsjahr + 5; nur wenn es gar kein Beschaffungsjahr gibt, zählt
  ein Kreuz in «Budget 2026/2027».
- **Gerätename und Standort.** Im EDU-Blatt steht beides im selben Feld
  («EDULAP-107 - Halle 23 - Schmidlin»). Der Teil vor dem ersten Leerzeichen wird der PC-Name,
  der Rest der Standort. `EDU-155-01` bleibt dabei ganz.
- **Programmstufen.** Ein Kreuz wird zu `1`. Eine vom Sync gesetzte `2` (AD-Gruppe) bleibt stehen –
  sie bedeutet dasselbe, und der nächste Lauf setzte eine `1` ohnehin wieder auf `2`. Steht in der
  Excel kein Kreuz, während in der Liste eine `1` steht, wird sie auf `0` gesetzt.
- **Login-Zuordnung.** Zuerst der Login selbst, dann der auf 20 Zeichen gekürzte (so lang darf ein
  sAMAccountName höchstens sein: aus «Michael.Roethlisberger» wird im AD «Michael.Roethlisberg»),
  zuletzt der Anzeigename, falls er eindeutig ist. Jeder Umweg steht als Warnung im Log.
- **Angelegt wird nie ein Benutzer.** Die Liste kommt aus dem AD; eine von Hand angelegte Zeile
  löscht der nächste Sync wieder (Abschnitt 2.3).

### Stand nach dem Lauf

| Liste | Vorher | Nachher | Was passiert ist |
|---|---|---|---|
| ADMIN-Clients | 188 | **163** | 159 Excel-Geräte abgeglichen, 25 EDU-Karteileichen entfernt, 4 Zeilen ohne Excel-Eintrag bewusst behalten |
| EDU-Clients | 31 | **119** | 25 Geräte ergänzt (Beschaffungsjahr), 94 Geräte neu angelegt, 6 archivierte Doppel entfernt |
| Benutzer | 202 | **202** | 160 Zeilen abgeglichen (Inhaberschaft, Bemerkung, Programmstufen) |
| Software | 71 | **94** | 23 Programme angelegt, dazu 15 neue Spalten in der Benutzer-Liste |
| Telefonnummern | 307 | **307** | unverändert, siehe unten |

Die vier Zeilen, die es nur in SharePoint gibt, bleiben stehen: `CAMPUS-125` und `CAMPUS-BIHA`
stehen aktiv in SCCM (gelöscht legte der nächste Sync sie leer wieder an), `CAMPUS-180` und
`GASTRONOMIE G17` sind archiviert und halten fest, dass es diese Geräte einmal gab. Sie gehören
in der Excel nachgetragen, nicht in SharePoint gelöscht.

### Die Telefonliste wird nicht geschrieben

Alle 307 Nummern stimmen überein – bis auf **Kurzwahl 318**. Dort ist SharePoint neuer: Der Sync
hat die Nummer am 08.09.2026 im AD bei `auviso.technik` gefunden, den Namen übernommen und den
Status von «Frei» auf «Aktiv» gesetzt. Die Excel steht auf Stand 31.07.2026. Diesen Stand
zurückzuschreiben hiesse, ein richtiges Ergebnis durch ein veraltetes zu ersetzen – der nächste
Sync korrigierte es ohnehin wieder. Der Bereich `Telefon` vergleicht darum nur und meldet.

### Was in der Excel aufzuräumen ist

Der Lauf hat 15 Einträge gemeldet, die sich nicht zuordnen liessen – sie brauchen eine
menschliche Entscheidung:

| Excel | Befund |
|---|---|
| `Driton.Lazaraj` («Lazaraj Driton») | im AD heisst er `driton.lazraj` («Lazraj Driton»); Login **und** Name weichen ab |
| `Celina.Inderbinden`, `Florian.Steffen`, `Simon.Hintermann`, `Tamara.Unternaehrer`, `Yvonne.Estermann` | kein AD-Konto im Sync-Bereich – ausgetreten oder in einer anderen OU |
| `Marketing`, `Seminarsupport`, `TechD (lokaler User)`, `-` | keine AD-Konten (Sammelbegriffe bzw. lokale Konten) |
| `Amira.Lustenberger ?` | zweite Zeile derselben Person («Reserve ICT 5 (alt Mira)»); das Fragezeichen gehört weg |
| `EDULAP-147` | steht im EDU-Blatt zweimal, einmal mit Standort, einmal mit Seriennummer – zusammengefasst |
| 3 Zeilen im EDU-Blatt ohne Gerätenamen | drei Surface Pro 10, nur mit Seriennummer erfasst |
| 46 Benutzer nur in SharePoint | Dienstkonten, Stiftungsrat und weitere AD-Konten, die in der Excel nie standen |

Danach zur Kontrolle:

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1
powershell -ExecutionPolicy Bypass -File .\server\Sync-Inventar.ps1 -WhatIf
```

---

## 11. Die Umstellung der Inhaberschaft vom 13.10.2026

Bis zu diesem Tag hielt die Spalte `Computer` der Benutzer-Liste den **PC-Namen** des Geräts. Die
Inhaberschaft hing damit am Namen statt an der Hardware: Ein in SCCM umbenanntes Gerät verlor still
seinen Inhaber (der Sync ändert nur den Titel), und ein neues Gerät mit dem Namen eines archivierten
übernahm dessen Inhaber. Neu steht in **`AdminClientId`** die Listen-ID der Zeile (Abschnitt 2.8).
Der Sync ist nicht betroffen – er hat die Spalte nie geschrieben.

Den Bestand in SharePoint stellt `Migriere-Inhaberschaft.ps1` um:

1. Spalte `AdminClientId` in der Benutzer-Liste anlegen, falls sie fehlt.
2. ADMIN-Clients und Benutzer lesen und nach `lokal\Migration-Inhaberschaft-<Zeitstempel>.json` sichern.
3. Je Person mit einem Namen in `Computer` die Zeile bestimmen – nach derselben Regel, nach der das
   Frontend bisher angezeigt hat (gleicher Name; bei mehreren die erste nicht archivierte) – und ihre
   Listen-ID eintragen. Schon umgestellte Personen bleiben unberührt; eine abweichende ID wird nicht
   überschrieben, sondern als Konflikt gemeldet; ein Name ohne Zeile bleibt ohne ID und steht als WARN im Log.
4. Mit `-AlteSpalteLoeschen`: prüfen, dass jede Person mit Namen die passende ID trägt, dann `Computer` löschen.

Mit `-WhatIf` wird nur gelesen, gesichert und gezählt. Das Skript braucht ein Konto mit Vollzugriff
auf die Site (Spalte anlegen und löschen) und läuft nicht während eines Syncs.

**Gelaufen am 13.10.2026:** 133 Personen umgestellt, keine ohne passendes Gerät, keine Konflikte, keine
mehrdeutigen Namen. Danach ist `Computer` gelöscht worden; der alte Stand liegt in
`lokal\Migration-Inhaberschaft-20261013-110223.json`. Das Leeren von `AdminClientId` mit `null` ist gegen
das echte SharePoint geprüft. Ein erneuter Lauf meldet nur noch, dass es `Computer` nicht mehr gibt.

---

## 12. Die Ablösung der Excel-Listen vom 13.10.2026

Zwischen dem Abgleich vom 08.09.2026 (Abschnitt 10) und dem Produktivstart wurden die beiden Excel-Dateien
weitergepflegt, das Tool lief nur im Test. Am 13.10.2026 ist der Excel-Stand ein letztes Mal übernommen
worden, als Dreiwegevergleich zwischen der Excel-Fassung vor dem Abgleich (Version 758 vom 07.09.), der
aktuellen Excel und SharePoint. Ein Skript im Repository gibt es dafür nicht, der Lauf war einmalig.

| Regel | Folge |
|---|---|
| Wo die Excel etwas sagt, gilt sie, auch gegen Testeingaben im Tool | 113 Zeilen geändert: Bemerkungen, Standort und Beschaffungsjahr neu aufgesetzter Geräte, Inhaberschaften (u. a. CAMPUS-124 → Simon Hintermann, CAMPUS-147 → Driton Lazraj), Programmstufen |
| Eine «2» (AD-Gruppe) bleibt | wie beim Abgleich vom 08.09. |
| Firefox: Kreuz in der Excel wird «1» | Der Sync hatte am 08.09. die alten «2» auf «0» gesetzt, weil Firefox keine AD-Gruppe hat |
| Telefon: vom AD-Sync gesetzte Werte bleiben | 318 (Auviso Technik), 356 (Ruiz Elisabete), 371 (Typ) – der nächste Sync setzte sie sonst zurück |
| Testeinträge im Verlauf werden entfernt | CAMPUS-002, -007, -055, -073 und Janis Zesiger |

Nicht übernommen, weil es kein AD-Konto im Sync-Bereich gibt: Isabella.Memaj, Florian.Steffen,
Celina.Inderbinden, Yvonne.Estermann, Tamara.Unternaehrer und die Sammelbegriffe (Marketing,
Seminarsupport, TechD, FRW). Die Tablets «Mercato» und «Piazza» haben keinen PC-Namen und stehen
darum in keiner Client-Liste; ihre Benutzerzeilen sind übernommen.

Sicherung vorher: `lokal\Ablösung-Excel-Sicherung-20261013-155353.json`, Protokoll:
`lokal\Ablösung-Excel-Protokoll-20261013-161529.txt`. Danach wurden die Blätter «Computer und User»,
«EDU-Geräte» und «Telefonnummer» unbenutzbar gemacht: ein weisses, halbtransparentes Feld über das ganze
Blatt (Form `Abgeloest-Overlay`), darauf im Raster das Wasserzeichen «Abgelöst» mit Link auf
https://campussursee-ictinventar.pages.dev/ (Formen `Abgeloest-Text-n`), Fixierung aufgehoben, Blatt
geschützt ohne Passwort. Die übrigen Blätter («Tel-Mitarbeiter», «TV Gebäude 1», «Budget 2025_26») sind
unberührt. Die Fassungen ohne Overlay liegen in der Versionshistorie der Dateien.

## 13. Die Ablösung der Kamera-Excel vom 13.10.2026

Bis Oktober 2026 führte die ICT Kameras und Zugriffsrechte in der Excel «Zugriffsberechtigung Inventar
Videokameras Milestone.xlsx» (OneDrive von Janis Zesiger, «Microsoft Teams-Chatdateien», Stand 10.10.2024).
Seit dem 13.10.2026 stehen sie in den Listen «Kameras» und «Kamera-Rollen» (Abschnitt 2.9).
`Migriere-Kameras.ps1` hat dazu einmalig

- die beiden Listen angelegt (IDs in `frontend/konfig.js` und `Sync-Inventar.config.example.json`),
- je Hardware in Milestone eine Zeile angelegt (112 Kameras),
- aus der Excel ergänzt: Zuständig, Bildqualität, Positionierung, Verbesserungen und «Bewertet am»
  (15.07.2021) aus den Blättern «Bewertung 15.07.21» und «Inventar OLD» (82 Kameras), dazu je Kamera
  einen Verlaufseintrag mit der früheren Kamera-Nummer (C001 …) und dem Ort aus «Inventar 2024.04».

| Blatt | Was damit geschah |
|---|---|
| Berechtigungen, Berechtigungen OLD | nicht übernommen – die Rechte liest der Sync aus Milestone, das ist die führende Quelle |
| Inventar 2024.04 | über die IP-Adresse der Hardware zugeordnet; Kamera-Nummer und Ort als Verlaufseintrag. Die C-Nummern werden nicht weitergeführt: der Name in Milestone ist der Titel |
| InventarORG | nicht übernommen, auch die Kamera-Passwörter nicht (gehören nicht in SharePoint) |
| Inventar OLD, Bewertung 15.07.21, ERFA 2021 Kamerabewertung | Zuständig und Bewertung, nur bei eindeutigem Treffer |
| ERFA 2021 Pendenzen, Kamerabewertung Vorlage | nicht übernommen (Sitzungsnotizen 2021, leere Vorlage) |

Nicht zugeordnet (Protokoll `lokal\Kamera-Uebernahme-Protokoll-20261013-172117.txt`): die Bewertungen
von «Freizeitraum» (19) und «Indentifikation Aussen» (31) – beide Kameras gibt es in Milestone nicht mehr –
und die Excel-Kameras C015, C057, C117, C119, C120 und C121 ohne Hardware in Milestone.

Die so übernommene Bewertung stammte von 2021. Am 19.10.2026 wurde sie aus der gepflegten Fassung der Excel
nachgeführt (siehe unten).

Am 15.10.2026 wurde die Excel wie die übrigen (Abschnitt 12) unbenutzbar gemacht: auf allen neun Blättern ein
weisses, halbtransparentes Feld (Form `Abgeloest-Overlay`), darauf im Raster «Abgelöst – seit 13.10.2026 im
ICT-Inventar» mit Link auf die Kameraliste (Formen `Abgeloest-Text-n`), Fixierung aufgehoben, Blatt geschützt
ohne Passwort. Die Fassung ohne Overlay liegt in der Versionshistorie der Datei.

### Nachtrag 19.10.2026: die gepflegte Fassung auf der Site

`Migriere-Kameras.ps1` las die Kopie im OneDrive (Stand 10.10.2024). Das Team pflegte aber eine zweite Datei
gleichen Namens weiter: Site mgmts-ict-s, «Freigegebene Dokumente» (Wurzel), mit den Blättern «Übersicht»
(Modell, Markteinführung, Herstelldatum aus der Seriennummer, Lebenszyklus, Zuständig) und «Kamerabewertung
2024.11», «2025.01», «2026.01», «2027.01» (Bewertung, Massnahme, Austauschjahr, Ersatzmodell mit Preis).
Diese Datei trägt kein Overlay. Daraus wurde am 19.10.2026 in alle 112 Kameras nachgetragen, je mit
Verlaufseintrag (Sicherungen vorher: `lokal\Kamera-Ersatzplanung-Sicherung-20261019.json`,
`lokal\Kamera-Bewertung-Sicherung-20261019.json`):

| Feld | Regel |
|---|---|
| Zuständig | verantwortliche Stelle aus «Kamerabewertung 2027.01», sonst «Übersicht»; ersetzt die Werte von 2021 (Leitung Réception, Leitung Sport, MLS Jugendarbeit, Technischer Dienst) |
| Bildqualität, Positionierung, Bewertet am | die neueste Bewertung je Kamera: 2026.01 (Datum 2026-01-01), sonst 2025.01 (2025-01-01), sonst 2021. Die zehn 2026 neu montierten Kameras (10.200–10.430, 10.A01, 17.007) «Gut»/«Gut» mit Datum 19.10.2026 – die alte Bewertung galt der ersetzten Kamera. Das Parkhaus P3/P1/P7 und 17.161 sind nie bewertet worden und bleiben leer |
| Verbesserungen | die Notizen aller Bewertungen, älteste zuerst, «Bewertung 2025.01 (Kürzel): Befund → umgesetzt: Massnahme» |
| Bemerkung | technische Hinweise aus der «Übersicht» und die Ersatzplanung aus 2027.01 (heutiges Modell, Ersatzmodell, Preis) |
| Beschaffungsjahr | geschätzt: Hikvision aus dem Herstelldatum der Seriennummer + 2 Monate, Axis ab Markteinführung des Modells, Austausch/Neu laut 2025.01 und 2026.01 genau |
| Ersatz geplant | «Austausch 2027» = GJ 2026/2027, «Austausch 2028» = 2027/2028; die übrigen Kameras älteste zuerst auf 2027/2028 bis 2035/2036 verteilt, je etwa 11 |

Offen: C015 «31.A01 Drehtüre Haupteingang» ist nicht in Milestone eingebunden und steht deshalb nicht in der
Liste; Milestone führt zwei Hardware mit dem Namen «33.020 P3 Sektor B Nord»; die Excel nennt für
«17.102 Foyer Nord Treppe» den Standort 17.100 und meldet bei «31.A07 Allwetterplatz» «fehlt meines Wissens».
