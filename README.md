# Computer Inventar

Drei SharePoint-Listen (Computer, Benutzer, Telefonnummern) mit SCCM- und AD-Synchronisation.
Stand: 04.09.2026 · Betrieb: ICT-Services Campus Sursee

---

## Kurzanleitung

| Ich möchte … | Das ist zu tun |
|---|---|
| **wissen, ob der Sync läuft** | Log unter `C:\ComputerInventar\Sync-Inventar.log` ansehen; die geplante Aufgabe zeigt `0x0` bei Erfolg, `0x1` bei Fehlern |
| **den Sync von Hand starten** | `powershell -ExecutionPolicy Bypass -File .\Sync-Inventar.ps1` (vorher gefahrlos mit `-WhatIf`) |
| **ein Programm hinzufügen oder ändern** | `programme.json` bearbeiten → `Upload-Programme.ps1` → nächster Sync legt die Spalte an (Abschnitt 3) |
| **eine AD-Gruppe an ein Programm hängen** | in `programme.json` unter `adGruppen` eintragen → `Upload-Programme.ps1` (Abschnitt 3) |
| **eine Spalte hinzufügen oder umbenennen** | `schema-computer.json` bzw. `schema-benutzer.json` ändern, Spalte in SharePoint anlegen, `Build-Spalten.ps1` (Abschnitt 4) |
| **nach einer Änderung prüfen, ob alles hält** | `powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1` — erwartet `210 bestanden, 0 fehlgeschlagen` |
| **eine Telefonnummer erfassen oder ändern** | Frontend → Reiter **«Telefonnummern»** → **«Neue Telefonnummer»** bzw. Klick auf eine Zeile; nicht zugewiesene Nummern sind gelb hervorgehoben (Abschnitt 2.6) |
| **wissen, wer eine Nummer hat** | Spalte **«Person (AD)»** in der Telefonliste: kommt live aus dem AD-Feld «Telefon» der Benutzer-Liste; der Sync schreibt den Login zusätzlich in `Benutzer` |
| **die Telefonliste (neu) aus der Excel-Datei aufbauen** | `Import-Telefonliste.ps1 -WhatIf`, dann ohne `-WhatIf` und mit `-UpdateKonfig` (Abschnitt 2.6) |
| **wissen, warum ein PC «Archiviert» ist** | Spalte `Verlauf` des Geräts ansehen; der Sync trägt Umbenennung, Archivierung und Reaktivierung dort ein (Abschnitt 2.2) |
| **archivierte Geräte im Frontend sehen** | in der Geräteliste den Schalter **«Archivierte anzeigen»**; ohne ihn sind sie ausgeblendet – auch in den Kacheln der Übersicht und im Zeitstrahl |
| **einen Verlaufseintrag erfassen** | Gerätefenster → Bereich «Stammdaten», Benutzerfenster → Bereich «Bemerkung»; Karte **«Verlauf»** → «Neuer Eintrag» (Datum wählbar), dann wie gewohnt speichern |
| **ein Gerät einlagern** | Status auf **`Lager`** setzen – nicht auf `Archiviert`: solange das Gerät in SCCM steht, setzt der nächste Sync `Archiviert` wieder auf `Aktiv` |
| **einen Fehler im Log verstehen** | Abschnitt 6, Fehlerbehebung |
| **das abgelaufene Zertifikat erneuern** | `Setup-EntraApp.ps1` erneut ausführen (Abschnitt 7) |

Alle Befehle laufen im Ordner `C:\ComputerInventar` auf dem SCCM-Site-Server (`adminsrv319`).
Die Skripte brauchen **Windows PowerShell 5.1** und kein Zusatzmodul; `ActiveDirectory` wird benutzt,
wenn es da ist, sonst greift der ADSI-Fallback.

---

## 1. Architektur

| Baustein | Inhalt | Wer schreibt |
|---|---|---|
| Liste **Computer** | Titel = PC-Name, dazu Seriennummer, Gebäude/Stock, Bemerkung, **Status**, **Verlauf**, Beschaffungsjahr, Ersatz geplant und 79 `SCCM_*`-Spalten | Menschen (Frontend/SharePoint) + Sync (`SCCM_*`, `Status`, an `Verlauf` angehängt, `Title` nur bei einer Umbenennung in SCCM) |
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

| Datei | Zweck |
|---|---|
| `Sync-Inventar.ps1` | der laufende Sync (SCCM → Computer, AD → Benutzer) |
| `Sync-Inventar.config.json` | Konfiguration; bleibt lokal, Vorlage: `Sync-Inventar.config.example.json` |
| `Inventar-Gemeinsam.ps1` | gemeinsame Funktionen: Log, Geschäftsjahr, Graph, Spaltendefinitionen |
| `programme.json` | Programmliste; produktiv gilt die Fassung in SharePoint |
| `Upload-Programme.ps1` | lädt `programme.json` nach SharePoint (mit Sicherung und Kontrolle) |
| `schema-computer.json` / `schema-benutzer.json` / `schema-telefon.json` | Spalten der drei Listen (Quelle der Wahrheit) |
| `Build-Spalten.ps1` | erzeugt `frontend/spalten.js` aus den Schemadateien |
| `Import-Telefonliste.ps1` | legt die Liste «Telefonnummern» an und übernimmt die alte Excel-Telefonliste (einmalig, wiederholbar; Abschnitt 2.6) |
| `Test-Inventar.ps1` | Selbsttests + Syntaxprüfung aller Skripte |
| `Setup-EntraApp.ps1` | Zertifikat, App-Registrierung, Site-Berechtigung, Konfiguration |
| `Setup-FrontendApp.ps1` | App-Registrierung des Web-Frontends (SPA) |
| `Add-Kontakte.ps1` | prüft und ergänzt die Telefonkontakte im AD (`OU=Contacts Sync`), die per Entra Connect nach Teams laufen; braucht ein Konto mit Schreibrecht auf der OU |
| `serve.ps1` | kleiner Testserver für die lokale Vorschau des Frontends |

`Sync-Inventar.ps1` definiert zuerst seine reinen Funktionen und prüft danach `$InventarNurFunktionen`.
Wer es mit `$InventarNurFunktionen = $true` dot-sourced, bekommt nur die Funktionen und keinen
Netzwerkzugriff – genau das macht `Test-Inventar.ps1`.

---

## 2. Der Sync

### 2.1 Konfiguration

`Sync-Inventar.config.json` neben dem Skript (Vorlage: `Sync-Inventar.config.example.json`,
wird von `Setup-EntraApp.ps1` erzeugt):

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

1. Fehlende Spalten `Status` und `Verlauf` in der Computer-Liste anlegen (idempotent).
2. SCCM per WMI lesen.
3. **Zuordnung über die Seriennummer**, nicht über den Namen. Verglichen wird die SCCM-Seriennummer
   mit der Spalte `SCCM_SerialNumber`, ersatzweise mit der manuellen Spalte `Seriennummer` (beides
   getrimmt und gross geschrieben). Platzhalter wie `To be filled by O.E.M.`, `Default string`,
   `System Serial Number`, `0`, `None` oder reine Füllmuster gelten als **keine** Seriennummer.
4. **Namensfallback**: Findet sich zur Seriennummer keine Zeile – oder hat das Gerät gar keine
   brauchbare Seriennummer (typisch bei VMs) –, wird über den PC-Namen zugeordnet, aber nur gegen
   Zeilen, die **selbst keine gültige Seriennummer** tragen und **nicht `Archiviert`** sind. So
   finden Altzeilen aus der Zeit vor der Seriennummer-Spalte ihr Gerät (und erben dessen Nummer),
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
2. Fehlende Spalten in der Benutzer-Liste anlegen: `Verlauf` (mehrzeilig, Klartext) und je Programm
   eine Textspalte mit den Stufen in der Beschreibung.
3. AD-Benutzer der konfigurierten OUs lesen (Subtree), Manager-DN in den Anzeigenamen auflösen (Cache).
4. Je Programm mit hinterlegten AD-Gruppen die Mitglieder **rekursiv** ermitteln. Bevorzugt eine
   einzige LDAP-Abfrage je Gruppe mit `memberOf:1.2.840.113556.1.4.1941:=<Gruppen-DN>`; schlägt das
   fehl, greift `Get-ADGroupMember -Recursive`. Eine fehlende Gruppe wird geloggt und übersprungen.
5. Primärgeräte aus `SMS_UserMachineRelationship` (bei mehreren das alphabetisch erste).
6. Upsert je AD-Benutzer, nur Deltas. Programme: Mitglied → `2`; nicht Mitglied und bisher `2` → `0`;
   `1` bleibt `1`, leer bleibt leer.
7. Zeilen, deren Login nicht mehr im AD-Scope liegt, werden gelöscht – mit Löschschutz.

**Phase Telefonnummern** (nur wenn `TelefonListId` gesetzt ist):

1. Fehlende Spalten der Liste «Telefonnummern» aus `schema-telefon.json` anlegen (idempotent).
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

### 2.5 Geplante Aufgabe

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

### 2.6 Telefonnummern

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

**Einmalige Einrichtung** (im Ordner `code`, Anmeldung als Person per Device-Code):

```powershell
powershell -ExecutionPolicy Bypass -File .\Import-Telefonliste.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\Import-Telefonliste.ps1 -UpdateKonfig
```

Das Skript liest die Excel-Datei ohne Excel, legt die Liste mit den Spalten aus `schema-telefon.json`
an, übernimmt alle Zeilen (Status-Umrechnung: `aktiv` → Aktiv, `inaktiv` mit Hinweis «frei» oder ohne
Namen → Frei, sonst Inaktiv; «FREI» als Name wird zu leer) und trägt die Listen-ID in
`frontend/konfig.js` ein. Die ID gehört danach auch als `TelefonListId` in `Sync-Inventar.config.json`.
Ein zweiter Lauf legt nichts doppelt an (Schlüssel: Kurzwahl).

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
powershell -ExecutionPolicy Bypass -File .\Sync-Inventar.ps1 -OnlyBenutzer -WhatIf
```

Zuerst `programme.json` bearbeiten, dann mit `-WhatIf` vergleichen, hochladen (die bisherige Fassung
wird als `programme.sicherung.<Zeitstempel>.json` gesichert) und zuletzt die Wirkung ansehen, bevor
der Sync wirklich schreibt. Der nächste Sync legt fehlende Programmspalten automatisch an.

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
  `schema-telefon.json` anpassen, Spalte in SharePoint anlegen/umbenennen, dann `Build-Spalten.ps1`
  ausführen (erzeugt `frontend/spalten.js` neu). Fehlende Spalten der Telefonliste legt der Sync
  selbst an.
- **SCCM-Spalte hinzufügen**: (1) Eintrag in `schema-computer.json`, (2) Spalte in der Liste «Computer»
  anlegen (`SCCM_`-Präfix), (3) Feld in `Build-SccmFields` in `Sync-Inventar.ps1` ergänzen,
  (4) `-DumpOnly -OnlyDevices` prüfen, (5) `-WhatIf`, (6) laufen lassen, (7) `Build-Spalten.ps1`.
- **Programmspalte**: nur über `programme.json` (siehe Abschnitt 3). Nie von Hand in `spalten.js`.
- **`Status` und `Verlauf`** legt der Sync selbst an, falls sie fehlen (Computer-Liste beide,
  Benutzer-Liste `Verlauf`). Von Hand anlegen muss man sie nicht; wer es tut, nimmt für `Verlauf`
  «Mehrere Textzeilen» ohne Rich-Text und für `Status` eine einzeilige Textspalte.

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
Archivieren und Reaktivieren), die Telefonnummern (Normalisierung, Kurzwahl, Abgleich mit dem AD,
Umrechnung der alten Excel-Liste – und, falls `lokal\Telefonnummerm S4B.xlsx` da ist, das Lesen der
Datei), Anzahl und Eindeutigkeit der Schema- und Programmeinträge sowie die Syntax aller `*.ps1`
im Ordner.

Erwartete Ausgabe: `Ergebnis: 210 bestanden, 0 fehlgeschlagen` (ohne die Excel-Datei zwei weniger).

Die Prüfung «`programme.json`: N Programme» ist eine feste Zahl im Test. Wer Programme hinzufügt oder
entfernt, zieht sie dort nach.

---

## 6. Fehlerbehebung

| Symptom | Ursache | Lösung |
|---|---|---|
| `invalid_client` / `AADSTS700027` | Zertifikat abgelaufen oder nicht mehr an der App | `Setup-EntraApp.ps1` erneut ausführen |
| `Kein Zugriff auf den privaten Schlüssel` | Task-Konto darf den Schlüssel nicht lesen | in `certlm.msc` Leserecht vergeben oder als SYSTEM laufen lassen |
| Graph `403` beim Schreiben | Site-Berechtigung fehlt | `Setup-EntraApp.ps1` erneut ausführen |
| Graph `404` bei einer Liste | `ComputerListId`/`BenutzerListId` falsch | IDs aus den Listeneinstellungen in SharePoint übernehmen |
| `field … is not recognized` | Spalte fehlt oder wurde umbenannt | Spalte wiederherstellen oder Eintrag im Skript entfernen |
| `Löschschutz greift: …` | AD lieferte nichts oder zu viele Löschungen | OU-DNs und AD-Verbindung prüfen; bei einer echten Massenmutation `LoeschSchutzProzent` bewusst erhöhen |
| `AD-Fehler in OU '<…>'` | Platzhalter statt echtem DN in `AdUserOUs` | echten Distinguished Name eintragen |
| `LDAP-Abfrage für Gruppe '…' fehlgeschlagen` | Gruppe existiert nicht (mehr) oder Name falsch | Name in `programme.json` korrigieren; der Lauf bricht deswegen nicht ab |
| `programme.json konnte nicht geladen werden` | Datei fehlt in SharePoint oder Pfad stimmt nicht | `Upload-Programme.ps1` ausführen; bis dahin nutzt der Sync die lokale Kopie |
| `Get-WmiObject … Zugriff verweigert` | Konto ohne SCCM-Rechte oder DCOM blockiert | Konto als «Read-only Analyst» eintragen, Firewall prüfen |
| `Archivschutz greift: …` | SCCM lieferte nichts oder zu viele Zeilen würden archiviert | SCCM-Provider und WMI-Rechte prüfen; bei einer echten Massenausmusterung `LoeschSchutzProzent` bewusst erhöhen |
| Viele Zeilen plötzlich «Archiviert» | die Seriennummern stimmen nicht überein (z. B. Mainboardtausch, Platzhalter im BIOS) | `SCCM_SerialNumber` und `Seriennummer` der betroffenen Zeilen vergleichen; notfalls die manuelle Seriennummer nachtragen und den Status wieder auf `Aktiv` setzen |
| Ein Gerät wird doppelt angelegt statt zugeordnet | die Zeile trägt eine andere Seriennummer als das SCCM-Gerät, deshalb greift auch der Namensfallback nicht | Seriennummer in der Zeile korrigieren oder leeren; die überzählige Zeile archivieren |
| `Verlauf von '…' ist unbrauchbar – Zeile übersprungen` | der Inhalt der Spalte `Verlauf` ist kein gültiges JSON-Array (von Hand bearbeitet?) | Inhalt in der Zeile sichten und auf `[]` oder ein gültiges Array setzen; der Sync überschreibt ihn absichtlich nicht |
| Ein PC fehlt in der Liste | er wurde nie gelöscht – die Computer-Phase löscht nie | in SharePoint nach Status `Archiviert` filtern; nur ein Mensch kann eine Zeile löschen |
| `TelefonListId fehlt in der Konfiguration – Telefon-Phase übersprungen` | die Liste ist noch nicht eingerichtet | `Import-Telefonliste.ps1` ausführen und die ausgegebene ID als `TelefonListId` eintragen |
| Frontend: Reiter «Telefonnummern» ist leer und nennt konfig.js | `telefonListId` in `frontend/konfig.js` steht noch auf dem Platzhalter | `Import-Telefonliste.ps1 -UpdateKonfig` oder die ID von Hand eintragen, neu deployen |
| `Nummer … steht im AD bei 'a' und 'b'` | zwei AD-Konten tragen dieselbe `telephoneNumber` | im AD bereinigen; bis dahin gilt der alphabetisch erste Login |
| Eine Person steht in der Telefonliste, aber «Person (AD)» ist leer | im AD fehlt bei diesem Konto das Feld «Telefon» (`telephoneNumber`) | Feld im AD setzen; beim nächsten Sync erscheint die Person, `Benutzer` wird geschrieben |
| Frontend: «Die Daten konnten nicht geladen werden – Failed to fetch», dazu ein CSP-Verstoss gegen `campussursee.sharepoint.com` | Graph leitet für `Inventar/programme.json` auf SharePoint um; fehlt der Host in `connect-src`, blockiert der Browser stillschweigend | In `frontend/_headers` muss `connect-src` den Eintrag `https://campussursee.sharepoint.com` enthalten. Nach dem Ändern neu deployen und hart neu laden |
| Umlaute in der Konsole falsch | OEM-Codepage | nur Anzeige; Log, JSON und SharePoint sind UTF-8 |
| Ein `.ps1` bricht mit «Zeichenfolge hat kein Abschlusszeichen» ab | Datei wurde ohne UTF-8-BOM gespeichert; PowerShell 5.1 liest sie dann als ANSI und zerlegt die Umlaute | Datei mit BOM speichern (`New-Object Text.UTF8Encoding($true)`). JSON dagegen bleibt **ohne** BOM, sonst kann der Browser es nicht lesen |

Das Skript beendet sich mit Exit-Code 1, sobald mindestens ein Fehler aufgetreten ist; die
Aufgabenplanung zeigt dann «0x1». Details stehen immer im Log.

---

## 7. Einrichtung und Wiederherstellung

Beides ist eingerichtet und nur bei Zertifikatsablauf, neuer Frontend-Adresse oder Neuaufbau nötig.

- **`Setup-EntraApp.ps1`** – Zertifikat, App-Registrierung «SCCM-SharePoint-Sync», Admin-Consent,
  Site-Berechtigung (`Sites.Selected`) und `Sync-Inventar.config.json`. Erneut ausführen, wenn das
  Zertifikat abläuft oder die Site-Berechtigung fehlt. Danach `AdUserOUs` in der Konfiguration prüfen.
- **`Setup-FrontendApp.ps1`** – App-Registrierung «Computer Inventar Frontend» (SPA) mit den
  delegierten Rechten `User.Read` und `Sites.ReadWrite.All`. Erneut ausführen, wenn eine
  Umleitungsadresse dazukommt (`-RedirectUris`). Die Adresse muss **exakt** so eingetragen sein, wie
  der Browser sie aufruft, inklusive Schrägstrich am Ende.

Beide brauchen ein Entra-Konto mit Rolle «Anwendungsadministrator» oder «Globaler Administrator».

---

## 8. Entfernen

1. Geplante Aufgabe löschen: `Unregister-ScheduledTask -TaskName 'Computer Inventar Sync' -Confirm:$false`
2. App-Registrierungen «SCCM-SharePoint-Sync» und «Computer Inventar Frontend» im Entra Admin Center löschen.
3. Zertifikat in `certlm.msc` löschen, Ordner `C:\ComputerInventar` entfernen.
