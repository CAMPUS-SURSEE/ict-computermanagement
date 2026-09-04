# Computer Inventar

Drei SharePoint-Listen (Computer, Benutzer, Telefonnummern) mit SCCM- und AD-Synchronisation.
Stand: 04.09.2026 · Betrieb: ICT-Services Campus Sursee

---

## Kurzanleitung

| Ich möchte … | Das ist zu tun |
|---|---|
| **wissen, ob der Sync läuft** | Log unter `C:\ComputerInventar\Sync-Inventar.log` ansehen; die geplante Aufgabe zeigt `0x0` bei Erfolg, `0x1` bei Fehlern |
| **den Sync von Hand starten** | auf dem Server: `powershell -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-Inventar.ps1` (vorher gefahrlos mit `-WhatIf`) |
| **ein Programm hinzufügen oder ändern** | `programme.json` bearbeiten → `Upload-Programme.ps1` → `Ergaenze-Spalten.ps1` legt die Spalte an (Abschnitt 3) |
| **eine AD-Gruppe an ein Programm hängen** | in `programme.json` unter `adGruppen` eintragen → `Upload-Programme.ps1` (Abschnitt 3) |
| **eine Spalte hinzufügen oder umbenennen** | `schema-computer.json` bzw. `schema-benutzer.json` ändern, Spalte in SharePoint anlegen, `Build-Spalten.ps1` (Abschnitt 4) |
| **nach einer Änderung prüfen, ob alles hält** | `powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1` — erwartet `200 bestanden, 0 fehlgeschlagen` |
| **eine Telefonnummer erfassen oder ändern** | Frontend → Reiter **«Telefonnummern»** → **«Neue Telefonnummer»** bzw. Klick auf eine Zeile; nicht zugewiesene Nummern sind gelb hervorgehoben (Abschnitt 2.7) |
| **wissen, wer eine Nummer hat** | Spalte **«Person (AD)»** in der Telefonliste: kommt live aus dem AD-Feld «Telefon» der Benutzer-Liste; der Sync schreibt den Login zusätzlich in `Benutzer` |
| **wissen, warum ein PC «Archiviert» ist** | Spalte `Verlauf` des Geräts ansehen; der Sync trägt Umbenennung, Archivierung und Reaktivierung dort ein (Abschnitt 2.2) |
| **archivierte Geräte im Frontend sehen** | in der Geräteliste den Schalter **«Archivierte anzeigen»**; ohne ihn sind sie ausgeblendet – auch in den Kacheln der Übersicht und im Zeitstrahl |
| **einen Verlaufseintrag erfassen** | Gerätefenster → Bereich «Stammdaten», Benutzerfenster → Bereich «Bemerkung»; Karte **«Verlauf»** → «Neuer Eintrag» (Datum wählbar), dann wie gewohnt speichern |
| **ein Gerät einlagern** | Status auf **`Lager`** setzen – nicht auf `Archiviert`: solange das Gerät in SCCM steht, setzt der nächste Sync `Archiviert` wieder auf `Aktiv` |
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
| Liste **Computer** | Titel = PC-Name, dazu Gebäude/Stock, Bemerkung, **Status**, **Verlauf**, Beschaffungsjahr, Ersatz geplant und 79 `SCCM_*`-Spalten | Menschen (Frontend/SharePoint) + Sync (`SCCM_*`, `Status`, an `Verlauf` angehängt, `Title` nur bei einer Umbenennung in SCCM) |
| Liste **Benutzer** | Titel = Login (sAMAccountName), AD-Felder, Primärgerät (SCCM), Computer-Zuordnung, Bemerkung, **Verlauf**, dazu **eine Textspalte je Programm** | Sync (AD-Felder, Programmstufe 2) + Menschen (Computer, Bemerkung, Verlauf, Programmstufe 0/1) |
| Liste **Telefonnummern** | Titel = Kurzwahl (373), Telefonnummer, Name, Typ, **Status** (Aktiv/Inaktiv/Frei), Apparat, Standort, Hinweis, Früherer Eintrag, **Verlauf**, dazu `Benutzer` (Login aus dem AD) und `ADLetzterSync` | Menschen (Frontend) + Sync (`Benutzer`, `ADLetzterSync`, leerer Name aus AD, Frei → Aktiv, neue Nummern aus dem AD) |
| **programme.json** | die Programmliste mit Kategorie und AD-Gruppen; liegt in `Dokumente/Inventar/` auf der Site | von Hand, hochgeladen mit `Upload-Programme.ps1` |

```
adminsrv319 (SCCM Site-Server)                        Microsoft 365 / SharePoint mgmts-ict-s
┌──────────────────────────────────┐                 ┌────────────────────────────────────┐
│ SMS Provider root\SMS\site_PS2   │                 │ Liste "Computer"                   │
│        ▲ WMI                     │  Graph API      │ Liste "Benutzer"                   │
│ Active Directory (LDAP/ADSI)     │  Zertifikat     │ Liste "Telefonnummern"             │
│   Benutzer + telephoneNumber     │                 │ Dokumente/Inventar/programme.json  │
│        ▲                         │ ──────────────▶ │                                    │
│ Geplante Aufgabe (SYSTEM), 4 h   │  Sites.Selected │ Entra-App "SCCM-SharePoint-Sync"   │
│  → C:\ComputerInventar\          │                 │ Entra-App "Computer Inventar       │
│     Sync-Inventar.ps1            │                 │            Frontend" (SPA)         │
└──────────────────────────────────┘                 └────────────────────────────────────┘
```

**Programmstufen** in der Benutzer-Liste (Textwert je Programmspalte):

| Wert | Bedeutung | Frontend |
|---|---|---|
| `0` oder leer | nicht berechtigt | umschaltbar |
| `1` | von Hand aktiviert (ohne AD-Gruppe) | umschaltbar |
| `2` | über eine AD-Gruppe aktiviert | gesperrt, Tooltip mit dem Gruppennamen |

Der Sync setzt nur `2` und nimmt es wieder weg. **Eine manuelle `1` fasst er nie an** – wer eine
Berechtigung von Hand vergeben hat, verliert sie nicht, wenn später eine AD-Gruppe dazukommt.

**Status** eines Computers (Textspalte `Status`, leer gilt als `Aktiv`):

| Wert | Bedeutung | Wer setzt ihn |
|---|---|---|
| `Aktiv` | im Einsatz | Menschen; der Sync setzt ihn beim ersten Kontakt und beim Reaktivieren |
| `Lager` | eingelagert, aber noch in SCCM | nur Menschen – der Sync fasst `Lager` nie an, solange das Gerät in SCCM ist |
| `Archiviert` | kein SCCM-Gerät mehr dazu | der Sync (und Menschen von Hand) |

`Archiviert` von Hand zu setzen lohnt sich nur für Geräte, die auch in SCCM verschwunden sind:
Steht das Gerät noch in SCCM, setzt der nächste Sync es wieder auf `Aktiv` und schreibt
«Wieder in SCCM vorhanden, reaktiviert» in den Verlauf. Für eingelagerte Geräte ist `Lager`
gedacht – das fasst der Sync nie an. Im Frontend sind archivierte Geräte in der Geräteliste,
in den Kacheln der Übersicht und im Ersatz-Zeitstrahl ausgeblendet; der Schalter
«Archivierte anzeigen» blendet sie wieder ein (er wird im Browser gemerkt und steht als `ar=1`
im Link).

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
und wird nie auf den Server kopiert.

| `code/server/` – gehört auf den SCCM-Server | Zweck |
|---|---|
| `Sync-Inventar.ps1` | der laufende Sync (SCCM → Computer, AD → Benutzer, AD → Telefonnummern) |
| `Inventar-Gemeinsam.ps1` | gemeinsame Funktionen: Log, Geschäftsjahr, Graph, Spaltendefinitionen |
| `Sync-Inventar.config.json` | Konfiguration; bleibt lokal, Vorlage: `Sync-Inventar.config.example.json` |
| `programme.json` | Programmliste; produktiv gilt die Fassung in SharePoint, diese ist der Rückfall |

| `code/` – läuft vom Arbeitsplatz | Zweck |
|---|---|
| `schema-computer.json` / `schema-benutzer.json` / `schema-telefon.json` | Spalten der drei Listen (Quelle der Wahrheit) |
| `Build-Spalten.ps1` | erzeugt `frontend/spalten.js` aus den Schemadateien |
| `Ergaenze-Spalten.ps1` | legt in SharePoint die Spalten an, die laut Schemadateien und `programme.json` fehlen – der einzige Ort, an dem Spalten entstehen (Abschnitt 4) |
| `Upload-Programme.ps1` | lädt `server/programme.json` nach SharePoint (mit Sicherung und Kontrolle) |
| `Test-Inventar.ps1` | Selbsttests + Syntaxprüfung aller Skripte in `code/` und `code/server/` |
| `serve.ps1` | kleiner Testserver für die lokale Vorschau des Frontends |

Die Arbeitsplatz-Skripte laden `Inventar-Gemeinsam.ps1` und die Konfiguration aus `server/` – es gibt
keine zweite Kopie. Auf dem Server liegt alles flach nebeneinander, dort greift derselbe Code über
`$ScriptDir`.

`Sync-Inventar.ps1` definiert zuerst seine reinen Funktionen und prüft danach `$InventarNurFunktionen`.
Wer es mit `$InventarNurFunktionen = $true` dot-sourced, bekommt nur die Funktionen und keinen
Netzwerkzugriff – genau das macht `Test-Inventar.ps1`.

---

## 2. Der Sync

### 2.1 Konfiguration

`Sync-Inventar.config.json` neben dem Skript (Vorlage: `Sync-Inventar.config.example.json`):

| Schlüssel | Bedeutung |
|---|---|
| `TenantId`, `ClientId`, `CertThumbprint` | Anmeldung als Anwendung (Zertifikat) |
| `SiteUrl` / `SiteId` | die SharePoint-Site |
| `ComputerListId`, `BenutzerListId` | die beiden Listen (siehe Listeneinstellungen in SharePoint) |
| `TelefonListId` | die Liste «Telefonnummern»; fehlt sie, wird die Telefon-Phase mit einer Warnung übersprungen |
| `TelefonPraefix` | Nummernblock des Hauses ohne Kurzwahl, Standard `+41 41 926 2`; muss mit `telefonPraefix` in `frontend/konfig.js` übereinstimmen |
| `ProgrammeDateiPfad` | Standard `Inventar/programme.json` |
| `AdUserOUs` | **Array von OU-DNs**; nur Benutzer aus diesen OUs kommen in die Liste |
| `AdServer` | optional ein bestimmter Domänencontroller |
| `LoeschSchutzProzent` | Standard 50 (siehe 2.3) |
| `SmsProvider`, `SiteCode` | SCCM |
| `LogPath` | Logdatei |

### 2.2 Ablauf eines Laufs

**Phase Computer**:

1. Prüfen, ob die Computer-Liste `Status` und `Verlauf` hat. Der Sync **legt keine Spalten an** –
   er füllt nur Daten. Fehlt eine Spalte, meldet er das **einmal** als WARN und lässt genau ihre
   Felder aus; alles andere läuft normal weiter. Das gilt in allen drei Phasen: eine fehlende
   Spalte kostet nur ihre eigenen Felder, nie eine ganze Zeile. Anlegen: `Ergaenze-Spalten.ps1`
   oder von Hand in den Listeneinstellungen (Abschnitt 4).
2. SCCM per WMI lesen.
3. **Zuordnung über die Seriennummer**, nicht über den Namen. Verglichen wird die SCCM-Seriennummer
   mit der Spalte `SCCM_SerialNumber` (beides getrimmt und gross geschrieben); eine manuelle
   Seriennummer-Spalte gibt es seit dem 4. September 2026 nicht mehr. Platzhalter wie `To be filled by O.E.M.`, `Default string`,
   `System Serial Number`, `0`, `None` oder reine Füllmuster gelten als **keine** Seriennummer.
4. **Namensfallback**: Findet sich zur Seriennummer keine Zeile – oder hat das Gerät gar keine
   brauchbare Seriennummer (typisch bei VMs) –, wird über den PC-Namen zugeordnet, aber nur gegen
   Zeilen, die **selbst keine gültige Seriennummer** tragen und **nicht `Archiviert`** sind. So
   finden von Hand angelegte Zeilen ihr Gerät (und erben dessen Nummer),
   während ein neu aufgesetztes Gerät nie die archivierte Leiche gleichen Namens erbt.
5. **Mehrere Geräte mit demselben Namen sind erlaubt**, in der Liste wie in SCCM. Nichts im Sync
   setzt voraus, dass der Titel eindeutig ist; bei gleichen Namen wird der Reihe nach zugeteilt,
   das Gerät mit der jüngsten Aktivität zuerst. Liefert SCCM mehrere Ressourcen mit **derselben
   Seriennummer** (Neuaufsetzung, Altdatensatz), gilt die mit der jüngsten Aktivität
   (`LastActive`, `LastHardwareScan`, `LastDDR`, `LastPolicyRequest`, AD-Anmeldung); die Dublette
   wird ins Log geschrieben.
6. **Umbenennung**: Weicht bei einem Treffer über die Seriennummer der SCCM-Name vom Titel ab, setzt
   der Sync `Title` auf den neuen Namen und hängt «Umbenannt von ALT zu NEU (SCCM)» an den Verlauf.
   Das ist der **einzige** Fall, in dem der Sync die manuelle Spalte `Title` schreibt.
7. Nur geänderte `SCCM_*`-Felder als PATCH schreiben.
8. Geräte ohne passende Zeile neu anlegen, mit Status `Aktiv` und dem Verlaufseintrag
   «Aus SCCM neu angelegt».
9. **Archivieren statt löschen**: Zeilen ohne SCCM-Gerät bekommen `SCCM_Found = Nein`, Status
   `Archiviert` und den Verlaufseintrag «In SCCM nicht mehr vorhanden, archiviert» – auch
   `Lager`-Geräte. Taucht ein archiviertes Gerät wieder in SCCM auf, setzt der Sync es auf `Aktiv`
   und schreibt «Wieder in SCCM vorhanden, reaktiviert». `Lager` bleibt unangetastet, solange das
   Gerät in SCCM ist, ein leerer Status wird beim ersten Kontakt zu `Aktiv`.
   **Die Computer-Phase löscht nie eine Zeile** – sie kennt keinen `DELETE`-Pfad. Vorgeschaltet ist
   der Archivschutz aus Abschnitt 2.3.

**Phase Benutzer**:

1. `programme.json` aus SharePoint laden (Fallback: lokale Kopie).
2. Prüfen, welche Spalten die Benutzer-Liste hat: `Verlauf` und je Programm eine Textspalte.
   Programme ohne Spalte werden übersprungen und gemeldet.
3. AD-Benutzer der konfigurierten OUs lesen (Subtree), Manager-DN in den Anzeigenamen auflösen (Cache).
4. Je Programm mit hinterlegten AD-Gruppen die Mitglieder **rekursiv** ermitteln. Bevorzugt eine
   einzige LDAP-Abfrage je Gruppe mit `memberOf:1.2.840.113556.1.4.1941:=<Gruppen-DN>`; schlägt das
   fehl, greift `Get-ADGroupMember -Recursive`. Eine fehlende Gruppe wird geloggt und übersprungen.
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
   Status bleiben stehen – ob eine Nummer frei ist, entscheidet ein Mensch.
5. Nummern aus dem Hausblock (`TelefonPraefix`), die im AD stehen, aber in der Liste fehlen, werden
   **neu angelegt** (Typ `Person`, Status `Aktiv`, Verlauf «Aus dem AD neu angelegt»). Mobil- und
   Fremdnummern werden nur zugeordnet, nie angelegt.
6. Haben zwei AD-Benutzer dieselbe Nummer, gilt der alphabetisch erste Login; die Dublette wird
   geloggt. **Diese Phase löscht nie.**

Exit-Code 1, sobald ein Fehler aufgetreten ist.

### 2.3 Löschschutz (Benutzer) und Archivschutz (Computer)

Gelöscht wird überhaupt nur in der Benutzer-Phase. Nicht gelöscht wird, wenn

- das AD **keinen einzigen** Benutzer geliefert hat (typisch bei falscher OU oder AD-Ausfall), oder
- mehr als `LoeschSchutzProzent` % der Zeilen gelöscht würden.

In der Computer-Phase gibt es nichts zu schützen, weil dort nie gelöscht wird. Stattdessen greift
derselbe Prozentsatz beim Archivieren: Würden mehr als `LoeschSchutzProzent` % der nicht archivierten
Zeilen in einem Lauf archiviert – oder liefert SCCM überhaupt kein Gerät –, archiviert der Sync nichts.

In allen Fällen schreibt der Sync einen ERROR ins Log und endet mit Exit-Code 1, ohne zu löschen oder
zu archivieren.

### 2.4 Parameter

```
Sync-Inventar.ps1 [-ConfigPath <json>] [-WhatIf] [-IncludeServers]
                  [-OnlyComputers] [-OnlyBenutzer] [-OnlyTelefone]
                  [-DumpOnly] [-OnlyDevices <Name,Name>]
```

| Parameter | Zweck |
|---|---|
| `-WhatIf` | zeigt nur, was geschrieben/gelöscht würde |
| `-OnlyComputers` / `-OnlyBenutzer` / `-OnlyTelefone` | nur eine Phase (`-OnlyTelefone` liest kein SCCM) |
| `-DumpOnly` | nur SCCM lesen und die aufbereiteten Felder ausgeben |
| `-IncludeServers` | Server-Betriebssysteme mitnehmen |
| `-OnlyDevices` | nur diese Geräte (zum Testen) |

### 2.5 Auf den Server bringen

`C:\ComputerInventar\` auf `adminsrv319` ist eine flache Kopie von `code/server/`. Nach einer
Änderung am Sync die fünf Dateien dorthin kopieren – **ohne** `Sync-Inventar.config.json`, die
gehört dem Server und enthält Zertifikat-Thumbprint und ClientId:

```powershell
robocopy .\code\server \\adminsrv319\C$\ComputerInventar /XF Sync-Inventar.config.json
```

Danach auf dem Server einmal `Sync-Inventar.ps1 -WhatIf` laufen lassen. Die Werkzeuge aus `code/`
gehören **nicht** dorthin: sie ändern Listenstrukturen und Programmlisten und werden bewusst von
Hand von einem Arbeitsplatz aus gestartet.

### 2.6 Geplante Aufgabe

Läuft als **SYSTEM** alle 4 Stunden. Das funktioniert auf dem Site-Server, weil das Computerkonto
sowohl SCCM- als auch AD-Leserechte hat. Auf einem anderen Server ein Dienstkonto mit SCCM-Rolle
«Read-only Analyst» und AD-Leserecht verwenden und diesem in `certlm.msc` Leserecht auf den privaten
Schlüssel geben.

Neu registrieren, falls die Aufgabe fehlt:

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-Inventar.ps1'
$t = New-ScheduledTaskTrigger -Once -At 06:00 -RepetitionInterval (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName 'Computer Inventar Sync' -Action $a -Trigger $t -User 'SYSTEM' -RunLevel Highest
```

### 2.7 Telefonnummern

Die Liste «Telefonnummern» ersetzt die Excel-Datei «Telefonnummerm S4B.xlsx» (Blatt «Telefonnummer»).
Schlüssel ist die **Kurzwahl** (Titelspalte, z. B. `373`); die vollständige Nummer
(`+41 41 926 23 73`) ergibt sich aus `TelefonPraefix` + Kurzwahl und wird im Frontend vorgeschlagen.

| Spalte | Bedeutung |
|---|---|
| `Status` | `Aktiv` (in Betrieb, leer gilt als Aktiv), `Inaktiv` (vorhanden, aber nicht in Teams – SIP-Apparat, deaktiviertes Konto), `Frei` (sofort vergebbar) |
| `Typ` | `Person`, `Dienst`, `Raum`, `Notruf` |
| `Benutzer` | Login des AD-Benutzers mit dieser `telephoneNumber` – schreibt der Sync |
| `Name` | Bezeichnung von Hand; bei leerem Namen übernimmt der Sync den AD-Anzeigenamen |

Das Frontend ermittelt die Person **live** über das AD-Feld «Telefon» der Benutzer-Liste, unabhängig
davon, ob die Telefon-Phase des Syncs schon gelaufen ist. Eine Nummer gilt als **nicht zugewiesen**,
wenn weder eine Person noch ein Name noch ein Login dran hängt oder der Status `Frei` ist – solche
Zeilen sind in der Liste gelb hervorgehoben, die Übersicht zählt sie in einer eigenen Kachel.
Weitere Kacheln: «Name weicht vom AD ab» (Liste und AD nennen verschiedene Personen) und «Benutzer
ohne Nummer» (aktive AD-Konten ohne Telefonnummer).

Die Liste wurde am 04.09.2026 aus der Excel-Datei aufgebaut (307 Nummern, Stand 31.07.2026). Das
Importskript dafür war einmalig und ist entfernt; wer den Ablauf nachlesen will, findet es in der
Git-Historie (`git log -- code/Import-Telefonliste.ps1`). Gepflegt wird die Liste seither im
Frontend, ergänzt vom Sync.

---

## 3. Programme pflegen

`programme.json` ist die einzige Quelle der Programmliste – für den Sync **und** für das Frontend.

```json
{ "id": "AdobeCreativeSuite", "name": "Adobe Creative Suite", "kategorie": "Zusatz-Software",
  "adGruppen": ["MgmtS_MarKom", "BLD_D&G"], "vorschlaege": [] }
```

- `id` ist der interne Spaltenname in der Benutzer-Liste (max. 30 Zeichen, keine Sonderzeichen).
  **Nach dem ersten Sync nicht mehr ändern** – sonst entsteht eine zweite Spalte und die alten Werte
  bleiben in der ersten liegen.
- `adGruppen` sind sAMAccountNames von AD-Gruppen. **Mehrere sind erlaubt**, der Sync bildet die
  Vereinigung. Leer ist erlaubt: dann gibt es das Programm nur auf Stufe 0/1 von Hand.
  Es muss keine reine Software-Gruppe sein – Abteilungs- und Rollengruppen (`MgmtS_*`, `Hot_*`,
  `BLD_*`, `Spo_*`) sind der Normalfall, `CS_ALLE` für Software, die alle bekommen.
- `vorschlaege` ist ein Restfeld ohne Wirkung; es wird nicht mehr befüllt.

**Ablauf einer Änderung:**

```powershell
powershell -ExecutionPolicy Bypass -File .\Upload-Programme.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\Upload-Programme.ps1
powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1 -Listen Benutzer
powershell -ExecutionPolicy Bypass -File .\server\Sync-Inventar.ps1 -OnlyBenutzer -WhatIf
```

Zuerst `programme.json` bearbeiten, dann mit `-WhatIf` vergleichen, hochladen (die bisherige Fassung
wird als `programme.sicherung.<Zeitstempel>.json` gesichert), die neue Programmspalte anlegen und
zuletzt die Wirkung ansehen, bevor der Sync wirklich schreibt. Ohne den Schritt mit
`Ergaenze-Spalten.ps1` meldet der Sync die fehlende Spalte und überspringt das Programm.

**Ein Programm entfernen**: Eintrag aus `programme.json` löschen und hochladen. Die Spalte in der
Benutzer-Liste bleibt mit ihren Werten stehen; der Sync ignoriert sie. Wer sie wirklich loswerden
will, löscht sie von Hand in den Listeneinstellungen – die darin gespeicherten Berechtigungen sind
dann weg.

**Vorsicht bei `adGruppen`**: Stufe 2 ist im Frontend gesperrt. Eine zu weit gefasste Gruppe vergibt
Berechtigungen automatisch an alle ihre Mitglieder. Im Zweifel lieber leer lassen und von Hand auf 1
setzen.

---

## 4. Spalten ändern

- **Manuelle Spalte** ändern: Eintrag in `schema-computer.json`, `schema-benutzer.json` bzw.
  `schema-telefon.json` anpassen, Spalte in SharePoint anlegen/umbenennen (siehe unten), dann
  `Build-Spalten.ps1` ausführen (erzeugt `frontend/spalten.js` neu).
- **SCCM-Spalte hinzufügen**: (1) Eintrag in `schema-computer.json`, (2) Spalte in der Liste «Computer»
  anlegen (`SCCM_`-Präfix), (3) Feld in `Build-SccmFields` in `Sync-Inventar.ps1` ergänzen,
  (4) `-DumpOnly -OnlyDevices` prüfen, (5) `-WhatIf`, (6) laufen lassen, (7) `Build-Spalten.ps1`.
- **Programmspalte**: nur über `programme.json` (siehe Abschnitt 3). Nie von Hand in `spalten.js`.
**Der Sync legt nie eine Spalte an.** Er füllt nur Daten und meldet fehlende Spalten als WARN.
Spalten anlegen ist ein bewusster, eigener Schritt – von Hand in den Listeneinstellungen oder mit
`Ergaenze-Spalten.ps1`:

```
powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1
```

Erst mit `-WhatIf` prüfen, was angelegt würde: das Skript vergleicht die drei Listen mit den
Schemadateien und `programme.json` und legt nur an, was fehlt – gelöscht oder geändert wird nie.
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
Zuordnung SCCM-Gerät ↔ Computer-Zeile (Seriennummer vor Name, Dublettenwahl, Umbenennung,
Archivieren und Reaktivieren), die Telefonnummern (Normalisierung, Kurzwahl, Abgleich mit dem AD),
das Verhalten bei fehlenden Spalten, Anzahl und Eindeutigkeit der Schema- und Programmeinträge sowie
die Syntax aller `*.ps1` in `code/` und `code/server/`.

Erwartete Ausgabe: `Ergebnis: 199 bestanden, 0 fehlgeschlagen`.

Die Prüfung «`programme.json`: N Programme» ist eine feste Zahl im Test. Wer Programme hinzufügt oder
entfernt, zieht sie dort nach.

---

## 6. Fehlerbehebung

| Symptom | Ursache | Lösung |
|---|---|---|
| `invalid_client` / `AADSTS700027` | Zertifikat abgelaufen oder nicht mehr an der App | Zertifikat erneuern (Abschnitt 7.1) |
| `Kein Zugriff auf den privaten Schlüssel` | Task-Konto darf den Schlüssel nicht lesen | in `certlm.msc` Leserecht vergeben oder als SYSTEM laufen lassen |
| Graph `403` beim Schreiben | Site-Berechtigung fehlt | der App die Rolle `write` auf die Site geben (Abschnitt 7.1, Schritt 5) |
| `… Spalte(n) fehlen und werden nicht geschrieben: …` | die Spalte gibt es in der Liste nicht (neu im Schema, umbenannt oder gelöscht) | `Ergaenze-Spalten.ps1` ausführen oder die Spalte von Hand in den Listeneinstellungen anlegen (Abschnitt 4). Bis dahin läuft der Sync normal weiter und lässt nur die Felder dieser Spalte aus |
| Graph `404` bei einer Liste | `ComputerListId`/`BenutzerListId` falsch | IDs aus den Listeneinstellungen in SharePoint übernehmen |
| `field … is not recognized` | Spalte fehlt oder wurde umbenannt | Spalte wiederherstellen oder Eintrag im Skript entfernen |
| `Löschschutz greift: …` | AD lieferte nichts oder zu viele Löschungen | OU-DNs und AD-Verbindung prüfen; bei einer echten Massenmutation `LoeschSchutzProzent` bewusst erhöhen |
| `AD-Fehler in OU '<…>'` | Platzhalter statt echtem DN in `AdUserOUs` | echten Distinguished Name eintragen |
| `LDAP-Abfrage für Gruppe '…' fehlgeschlagen` | Gruppe existiert nicht (mehr) oder Name falsch | Name in `programme.json` korrigieren; der Lauf bricht deswegen nicht ab |
| `programme.json konnte nicht geladen werden` | Datei fehlt in SharePoint oder Pfad stimmt nicht | `Upload-Programme.ps1` ausführen; bis dahin nutzt der Sync die lokale Kopie |
| `Get-WmiObject … Zugriff verweigert` | Konto ohne SCCM-Rechte oder DCOM blockiert | Konto als «Read-only Analyst» eintragen, Firewall prüfen |
| `Archivschutz greift: …` | SCCM lieferte nichts oder zu viele Zeilen würden archiviert | SCCM-Provider und WMI-Rechte prüfen; bei einer echten Massenausmusterung `LoeschSchutzProzent` bewusst erhöhen |
| Viele Zeilen plötzlich «Archiviert» | die Seriennummern stimmen nicht überein (z. B. Mainboardtausch, Platzhalter im BIOS) | `SCCM_SerialNumber` der betroffenen Zeilen mit SCCM vergleichen; den Status wieder auf `Aktiv` setzen, der nächste Lauf ordnet über den Namen neu zu |
| Ein Gerät wird doppelt angelegt statt zugeordnet | die Zeile trägt in `SCCM_SerialNumber` eine andere Seriennummer als das SCCM-Gerät, deshalb greift auch der Namensfallback nicht | `SCCM_SerialNumber` in der Zeile leeren; die überzählige Zeile archivieren |
| `Verlauf von '…' ist unbrauchbar – Zeile übersprungen` | der Inhalt der Spalte `Verlauf` ist kein gültiges JSON-Array (von Hand bearbeitet?) | Inhalt in der Zeile sichten und auf `[]` oder ein gültiges Array setzen; der Sync überschreibt ihn absichtlich nicht |
| Ein PC fehlt in der Liste | er wurde nie gelöscht – die Computer-Phase löscht nie | in SharePoint nach Status `Archiviert` filtern; nur ein Mensch kann eine Zeile löschen |
| `TelefonListId fehlt in der Konfiguration – Telefon-Phase übersprungen` | `TelefonListId` fehlt in `Sync-Inventar.config.json` | ID aus den Listeneinstellungen der Liste «Telefonnummern» eintragen (steht auch in `frontend/konfig.js`) |
| Frontend: Reiter «Telefonnummern» ist leer und nennt konfig.js | `telefonListId` in `frontend/konfig.js` steht noch auf dem Platzhalter | ID von Hand eintragen und neu deployen |
| `Nummer … steht im AD bei 'a' und 'b'` | zwei AD-Konten tragen dieselbe `telephoneNumber` | im AD bereinigen; bis dahin gilt der alphabetisch erste Login |
| Eine Person steht in der Telefonliste, aber «Person (AD)» ist leer | im AD fehlt bei diesem Konto das Feld «Telefon» (`telephoneNumber`) | Feld im AD setzen; beim nächsten Sync erscheint die Person, `Benutzer` wird geschrieben |
| Frontend: «Die Daten konnten nicht geladen werden – Failed to fetch», dazu ein CSP-Verstoss gegen `campussursee.sharepoint.com` | Graph leitet für `Inventar/programme.json` auf SharePoint um; fehlt der Host in `connect-src`, blockiert der Browser stillschweigend | In `frontend/_headers` muss `connect-src` den Eintrag `https://campussursee.sharepoint.com` enthalten. Nach dem Ändern neu deployen und hart neu laden |
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
powershell -ExecutionPolicy Bypass -File .\Sync-Inventar.ps1 -WhatIf -OnlyComputers -OnlyDevices CAMPUS-073
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

Es gibt keine Umgebungsvariablen. Client-ID, Mandant und die Listen-IDs stehen offen in
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
`/geraet.html?id=…` mit 308 auf `/geraet?id=…` um. Die Abfragezeichenfolge bleibt erhalten, die
Verweise im Frontend dürfen weiter `geraet.html` heissen. Die Anmeldung ist davon nicht betroffen:
`auth.js` benutzt als Umleitungsadresse immer die Wurzel, nie einen Dateinamen.

---

## 8. Entfernen

1. Geplante Aufgabe löschen: `Unregister-ScheduledTask -TaskName 'Computer Inventar Sync' -Confirm:$false`
2. App-Registrierungen «SCCM-SharePoint-Sync» und «Computer Inventar Frontend» im Entra Admin Center löschen.
3. Zertifikat in `certlm.msc` löschen, Ordner `C:\ComputerInventar` entfernen.
4. Pages-Projekt «campussursee-ictinventar» im Cloudflare-Dashboard löschen und den CNAME für `inventar.campus-sursee.ch` im DNS entfernen.
