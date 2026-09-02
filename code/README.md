# Computer Inventar – zwei SharePoint-Listen mit SCCM- und AD-Synchronisation

Stand: 02.09.2026 · Betrieb: ICT-Services Campus Sursee

---

## 1. Architektur

Aus der einen alten Liste «Computer Inventar» sind **zwei Listen plus eine Datei** geworden:

| Baustein | Inhalt | Wer schreibt |
|---|---|---|
| Liste **Computer** | Titel = PC-Name, dazu Seriennummer, Gebäude/Stock, Bemerkung, Beschaffungsjahr, Ersatz geplant und 79 `SCCM_*`-Spalten | Menschen (Frontend/SharePoint) + Sync (nur `SCCM_*`) |
| Liste **Benutzer** | Titel = Login (sAMAccountName), AD-Felder, Primärgerät (SCCM), Computer-Zuordnung, Bemerkung, dazu **eine Textspalte je Programm** | Sync (AD-Felder, Programmstufe 2) + Menschen (Computer, Bemerkung, Programmstufe 0/1) |
| **programme.json** | Liste aller Programme mit Kategorie, AD-Gruppen und Vorschlägen | Migration, `Suggest-ProgrammGruppen.ps1`, von Hand |

```
adminsrv319 (SCCM Site-Server)                        Microsoft 365 / SharePoint mgmts-ict-s
┌──────────────────────────────────┐                 ┌────────────────────────────────────┐
│ SMS Provider root\SMS\site_PS2   │                 │ Liste "Computer"                   │
│        ▲ WMI                     │  Graph API      │ Liste "Benutzer"                   │
│ Active Directory (LDAP/ADSI)     │  Zertifikat     │ Dokumente/Inventar/programme.json  │
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

**Geschäftsjahr**: 1. August bis 31. Juli, Schreibweise `2026/2027`. Ein Datum ab August gehört ins
Geschäftsjahr `Jahr/Jahr+1`, sonst `Jahr-1/Jahr`. Die Helfer stehen in `Inventar-Gemeinsam.ps1`
(`Get-GjVonDatum`, `Get-GjPlus`, `Get-GjVergleich`, `Get-GjAktuell`) und gespiegelt in `frontend/modell.js`.

---

## 2. Dateien im Ordner `code`

| Datei | Zweck |
|---|---|
| `Inventar-Gemeinsam.ps1` | gemeinsame Funktionen: Log, Geschäftsjahr, Graph (Zertifikat + Device-Code), Spaltendefinitionen |
| `schema-computer.json` | Spalten der Liste «Computer» (Quelle der Wahrheit) |
| `schema-benutzer.json` | Spalten der Liste «Benutzer» (ohne Programmspalten) |
| `programme.json` | Vorlage/lokale Kopie der Programmliste; produktiv gilt die Datei in SharePoint |
| `Build-Spalten.ps1` | erzeugt `frontend/spalten.js` aus den beiden Schemadateien |
| `Migrate-ToTwoLists.ps1` | einmalige Migration der alten Liste in die zwei neuen Listen |
| `Sync-Inventar.ps1` | der laufende Sync (SCCM → Computer, AD → Benutzer) |
| `Sync-Inventar.config.example.json` | Vorlage der Konfiguration |
| `Suggest-ProgrammGruppen.ps1` | schlägt AD-Gruppen für Programme ohne Gruppe vor |
| `Setup-EntraApp.ps1` | Zertifikat, App-Registrierung, Consent, Site-Berechtigung, Konfiguration |
| `Setup-FrontendApp.ps1` | App-Registrierung des Web-Frontends (SPA) inkl. «Allow public client flows» |
| `Test-Inventar.ps1` | Selbsttests der reinen Funktionen + Syntaxprüfung aller Skripte |
| `serve.ps1` | kleiner Testserver für die lokale Vorschau des Frontends |

Alle Skripte laufen mit **Windows PowerShell 5.1** ohne zusätzliche Module. Das Modul
`ActiveDirectory` wird benutzt, wenn es vorhanden ist; sonst greift der ADSI-Fallback.

### 2.1 Muster «nur Funktionen laden»

`Migrate-ToTwoLists.ps1`, `Sync-Inventar.ps1` und `Suggest-ProgrammGruppen.ps1` definieren zuerst ihre
reinen Funktionen und prüfen danach:

```powershell
if ($InventarNurFunktionen) { return }
```

Wer die Skripte mit `$InventarNurFunktionen = $true` dot-sourced, bekommt also nur die Funktionen und
keinen Netzwerkzugriff. Genau das macht `Test-Inventar.ps1`.

---

## 3. Migration (einmalig)

### 3.1 Voraussetzungen

- Die alte Liste «Computer Inventar» ist unverändert vorhanden (sie wird nur gelesen).
- `frontend/konfig.js` enthält `mandantId`, `clientId`, `siteId` und die alte `listId`
  (oder die Werte werden als Parameter übergeben).
- Die App-Registrierung «Computer Inventar Frontend» hat **«Allow public client flows» = Ja**.
  `Setup-FrontendApp.ps1` setzt das selbst; von Hand: Entra Admin Center → App-Registrierungen →
  *Computer Inventar Frontend* → Authentifizierung → «Öffentliche Clientflows zulassen» = Ja.
  Ohne diese Einstellung bricht der Device-Code-Login mit `AADSTS7000218` ab.
  **Alternative ohne Änderung der App-Registrierung:** den öffentlichen Microsoft-Standardclient
  «Microsoft Graph Command Line Tools» verwenden:
  `-ClientId 14d82eec-204b-4c2f-b7e8-296a70dab67e`. Beim ersten Mal erscheint eine
  Zustimmungsabfrage für `Sites.ReadWrite.All`. So wurde die Migration am 2026-09-02 ausgeführt
  (Listen-IDs siehe `frontend/konfig.js`).
- Das anmeldende Konto braucht Schreibrecht auf der Site (Websitebesitzer genügt).

### 3.2 Trockenlauf

```powershell
cd C:\ComputerInventar
powershell -ExecutionPolicy Bypass -File .\Migrate-ToTwoLists.ps1 -WhatIf
```

Das Skript zeigt einen Code und eine Adresse gross auf der Konsole:

```
==============================================================
   ANMELDUNG NOETIG

   1) Adresse oeffnen : https://microsoft.com/devicelogin
   2) Code eingeben   : ABCD-EFGH
==============================================================
```

Adresse im Browser öffnen, Code eintippen, mit dem M365-Konto anmelden – das Skript läuft dann weiter.

Der Trockenlauf liest nur und schreibt einen Bericht (auch als `Migrate-ToTwoLists.log`):
Anzahl Computer- und Benutzer-Zeilen, zusammengeführte Duplikate, übersprungene Zeilen ohne Login und
alle aus den zwölf Spezial-Software-Spalten eingesammelten AD-Gruppen. **Diesen Bericht vor dem echten
Lauf durchlesen**, vor allem die Gruppenliste.

### 3.3 Echter Lauf

```powershell
powershell -ExecutionPolicy Bypass -File .\Migrate-ToTwoLists.ps1 -UpdateKonfig
```

Ablauf:

1. Alte Liste lesen (Paging).
2. `programme.json` mit den gefundenen AD-Gruppen ergänzen, lokal speichern und nach
   `Dokumente/Inventar/programme.json` hochladen (Ordner wird angelegt).
3. Listen «Computer» und «Benutzer» anlegen (Spalten aus den Schemadateien, Programmspalten aus
   `programme.json`, Titelspalte umbenannt in «PC-Name» bzw. «Login»). Bestehende Listen werden nur um
   fehlende Spalten ergänzt.
4. Zeilen schreiben. Bereits vorhandene Titel werden übersprungen, das Skript ist also wiederholbar.
5. Mit `-UpdateKonfig`: `computerListId`, `benutzerListId`, `programmeDateiPfad` sowie die beiden
   SharePoint-URLs in `frontend/konfig.js` setzen. Fehlt ein Schlüssel in `konfig.js`, steht der
   nachzutragende Wert im Log.

Weitere Schalter:

| Parameter | Zweck |
|---|---|
| `-Auth Certificate` | Anmeldung als Anwendung mit dem Sync-Zertifikat statt per Device-Code |
| `-ProgrammeOnly` | nur `programme.json` neu aufbauen und hochladen, keine Listen, keine Zeilen |
| `-ConfigPath` | andere Konfigurationsdatei |
| `-TenantId -ClientId -SiteId -AltListId` | Werte übersteuern, wenn `konfig.js` sie nicht enthält |

**Abbildungsregeln** (identisch mit den Selbsttests):

- Zeilen mit Titel `Kein PC` oder `Shared …` werden **keine** Computer-Zeile; das Gerät einer
  `Shared`-Zeile steckt trotzdem beim Benutzer (`Shared CAMPUS-001` → `Computer = CAMPUS-001`).
  Existiert ein solches Gerät noch nicht, legt der erste SCCM-Sync die Computer-Zeile an.
- Doppelte PC-Namen werden zusammengeführt (leere Felder werden aus der zweiten Zeile gefüllt,
  Bemerkungen aneinandergehängt).
- `Beschaffungsjahr` = neuestes angekreuztes Jahr (`J20252026` → `2025/2026`).
- `ErsatzGeplant` = `Budget20262027` gesetzt → `2026/2027`, sonst Beschaffungsjahr + 5, sonst leer.
- Benutzer: `Anzeigename` = alte Spalte `Arbeitsplatz`, `Firma` = `Firma` (beides wird beim ersten
  AD-Sync überschrieben). Programme: Häkchen oder gefüllte Spezial-Textspalte → `1`.
- Doppelte Logins werden zusammengeführt: das erste Gerät gewinnt, Programme werden verodert.
- Zeilen ohne Login werden mit Warnung übersprungen.

Die alte Liste bleibt unverändert und kann als Sicherheitsnetz stehen bleiben.

---

## 4. Sync-Betrieb

### 4.1 Konfiguration

`Sync-Inventar.config.json` neben dem Skript (Vorlage: `Sync-Inventar.config.example.json`,
wird von `Setup-EntraApp.ps1` erzeugt). Wichtige Schlüssel:

| Schlüssel | Bedeutung |
|---|---|
| `TenantId`, `ClientId`, `CertThumbprint` | Anmeldung als Anwendung (Zertifikat) |
| `SiteUrl` / `SiteId` | die SharePoint-Site |
| `ComputerListId`, `BenutzerListId` | die beiden Listen (aus der Migration) |
| `ProgrammeDateiPfad` | Standard `Inventar/programme.json` |
| `AdUserOUs` | **Array von OU-DNs**, Vorgabe die OUs «Staff/users/Windows 11» und «Staff/users/Windows 10». Die echten DNs muss der Betrieb eintragen. |
| `AdServer` | optional ein bestimmter Domänencontroller |
| `AdGruppenPraefixe` | optional, filtert die Gruppensuche in `Suggest-ProgrammGruppen.ps1` |
| `LoeschSchutzProzent` | Standard 50 (siehe 4.3) |
| `SmsProvider`, `SiteCode` | SCCM |
| `LogPath` | Logdatei |

### 4.2 Ablauf eines Laufs

**Phase Computer** (wie bisher): SCCM per WMI lesen, über den PC-Namen zuordnen, nur geänderte
`SCCM_*`-Felder als PATCH schreiben, fehlende Geräte neu anlegen, Zeilen ohne SCCM-Gerät auf
«In SCCM vorhanden = Nein» setzen. Eine `Shared`-/`Kein PC`-Sonderlogik gibt es nicht mehr.

**Phase Benutzer**:

1. `programme.json` aus SharePoint laden (Fallback: lokale Kopie).
2. Fehlende Programmspalten in der Benutzer-Liste anlegen (Textspalte, Beschreibung mit den Stufen).
3. AD-Benutzer der konfigurierten OUs lesen (Subtree), Manager-DN in den Anzeigenamen auflösen (Cache).
4. Je Programm mit hinterlegten AD-Gruppen die Mitglieder **rekursiv** ermitteln. Bevorzugt eine
   einzige LDAP-Abfrage je Gruppe mit `memberOf:1.2.840.113556.1.4.1941:=<Gruppen-DN>`; schlägt das
   fehl, greift `Get-ADGroupMember -Recursive`. Eine fehlende Gruppe wird geloggt und übersprungen.
5. Primärgeräte aus `SMS_UserMachineRelationship` (bei mehreren das alphabetisch erste).
6. Upsert je AD-Benutzer, nur Deltas. Programme: Mitglied → `2`; nicht Mitglied und bisher `2` → `0`;
   `1` bleibt `1`, leer bleibt leer.
7. Zeilen, deren Login nicht mehr im AD-Scope liegt, werden gelöscht – mit Löschschutz.

Exit-Code 1, sobald ein Fehler aufgetreten ist.

### 4.3 Löschschutz

Nicht gelöscht wird, wenn

- das AD **keinen einzigen** Benutzer geliefert hat (typisch bei falscher OU oder AD-Ausfall), oder
- mehr als `LoeschSchutzProzent` % der Zeilen gelöscht würden.

In beiden Fällen schreibt der Sync einen ERROR ins Log und endet mit Exit-Code 1, ohne zu löschen.

### 4.4 Parameter

```
Sync-Inventar.ps1 [-ConfigPath <json>] [-WhatIf] [-IncludeServers]
                  [-OnlyComputers] [-OnlyBenutzer] [-DumpOnly] [-OnlyDevices <Name,Name>]
```

| Parameter | Zweck |
|---|---|
| `-WhatIf` | zeigt nur, was geschrieben/gelöscht würde |
| `-OnlyComputers` / `-OnlyBenutzer` | nur eine Phase |
| `-DumpOnly` | nur SCCM lesen und die aufbereiteten Felder ausgeben |
| `-IncludeServers` | Server-Betriebssysteme mitnehmen |
| `-OnlyDevices` | nur diese Geräte (zum Testen) |

### 4.5 Geplante Aufgabe umstellen

Die bestehende Aufgabe zeigt noch auf `Sync-SccmToSharePoint.ps1`. Umstellen:

```powershell
$name = 'SCCM SharePoint Computer Inventar Sync'
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-Inventar.ps1'
Set-ScheduledTask -TaskName $name -Action $a
```

Neu registrieren (falls die Aufgabe fehlt):

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-Inventar.ps1'
$t = New-ScheduledTaskTrigger -Once -At 06:00 -RepetitionInterval (New-TimeSpan -Hours 4)
Register-ScheduledTask -TaskName 'Computer Inventar Sync' -Action $a -Trigger $t -User 'SYSTEM' -RunLevel Highest
```

Danach einmal manuell starten und das Log prüfen. Die alte Datei `Sync-SccmToSharePoint.ps1` kann vom
Server entfernt werden; ihre Konfiguration `Sync-SccmToSharePoint.config.json` ebenfalls.

**SYSTEM** funktioniert auf dem Site-Server, weil das Computerkonto sowohl SCCM-Leserechte als auch
AD-Leserechte hat. Auf einem anderen Server ein Dienstkonto mit SCCM-Rolle «Read-only Analyst» und
AD-Leserecht verwenden und diesem in `certlm.msc` Leserecht auf den privaten Schlüssel geben.

---

## 5. Programme pflegen

`programme.json` ist die einzige Quelle der Programmliste – für den Sync **und** für das Frontend.

```json
{ "id": "AdobePhotoshopCS6", "name": "Adobe Photoshop CS6", "kategorie": "Spezial-Software",
  "adGruppen": ["Hot_Reze"], "vorschlaege": [] }
```

- `id` ist der interne Spaltenname in der Benutzer-Liste (max. 30 Zeichen, keine Sonderzeichen).
- `adGruppen` sind sAMAccountNames von AD-Gruppen; leer ist erlaubt (dann nur Stufe 0/1 von Hand).
- `vorschlaege` sind unverbindliche Kandidaten und **ohne Wirkung**, bis sie jemand nach `adGruppen` verschiebt.

**Neues Programm hinzufügen**: Eintrag in `programme.json` ergänzen (in SharePoint bearbeiten oder
lokal ändern und hochladen). Der nächste Sync legt die Spalte in der Benutzer-Liste automatisch an.

### 5.1 Vorschläge erzeugen

```powershell
powershell -ExecutionPolicy Bypass -File .\Suggest-ProgrammGruppen.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File .\Suggest-ProgrammGruppen.ps1
```

Das Skript liest alle AD-Sicherheitsgruppen (bzw. nur die mit den Präfixen aus `AdGruppenPraefixe`),
normalisiert die Namen auf Kleinbuchstaben und Ziffern und schlägt für Programme **ohne** AD-Gruppe die
Gruppen vor, deren Name den Programmnamen bzw. die Programm-Id enthält oder umgekehrt (mindestens vier
Zeichen). Mit `-AuchMitGruppen` werden auch Programme berücksichtigt, die schon eine Gruppe haben.

---

## 6. Spalten ändern

- **Manuelle Spalte** ändern: Eintrag in `schema-computer.json` bzw. `schema-benutzer.json` anpassen,
  Spalte in SharePoint anlegen/umbenennen, dann `Build-Spalten.ps1` ausführen (erzeugt
  `frontend/spalten.js` neu).
- **SCCM-Spalte hinzufügen**: (1) Eintrag in `schema-computer.json`, (2) Spalte in der Liste «Computer»
  anlegen (`SCCM_`-Präfix), (3) Feld in `Build-SccmFields` in `Sync-Inventar.ps1` ergänzen,
  (4) `-DumpOnly -OnlyDevices` prüfen, (5) `-WhatIf`, (6) laufen lassen, (7) `Build-Spalten.ps1`.
- **Programmspalte**: nur über `programme.json` (siehe Abschnitt 5). Nie von Hand in `spalten.js`.

`frontend/spalten.js` wird **generiert** und darf nicht von Hand bearbeitet werden.

---

## 7. Tests

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1
```

Geprüft werden ohne Pester, ohne Netz, ohne SCCM und ohne AD:

- Geschäftsjahr-Helfer (`2026-09-02` → `2026/2027`, `2026-07-31` → `2025/2026`, `+5`, Vergleich),
- Migrationsmapping (Shared-Zeile, «Kein PC», Duplikat-Zusammenführung, Beschaffungsjahr aus den
  Häkchen, Budget → `ErsatzGeplant`, gesammelte AD-Gruppen),
- Programm-Delta (`2` → `0`, `1` bleibt `1`, `0` → `2`),
- Löschschutz,
- Vorschlagslogik (Normalisierung, Mindestlänge),
- Anzahl und Eindeutigkeit der Schema- und Programmeinträge,
- Syntax aller `*.ps1` im Ordner über `[System.Management.Automation.Language.Parser]::ParseFile`.

Erwartete Ausgabe: `Ergebnis: 75 bestanden, 0 fehlgeschlagen`.

---

## 8. Fehlerbehebung

| Symptom | Ursache | Lösung |
|---|---|---|
| `AADSTS7000218` beim Device-Code | «Allow public client flows» steht auf Nein | `Setup-FrontendApp.ps1` erneut ausführen oder die Einstellung im Entra Admin Center setzen |
| Device-Code läuft ab | niemand hat den Code eingegeben | Skript neu starten |
| Frontend: «Die Daten konnten nicht geladen werden – Failed to fetch», in der Entwicklerkonsole ein CSP-Verstoss gegen `campussursee.sharepoint.com` | Graph liefert Dateien nicht selbst aus, sondern leitet für `Inventar/programme.json` auf SharePoint weiter. Fehlt der Host in `connect-src`, blockiert der Browser den Abruf stillschweigend | In `frontend/_headers` muss `connect-src` den Eintrag `https://campussursee.sharepoint.com` enthalten. Nach dem Ändern neu deployen; die Kopfzeilen kommen von Netlify, nicht aus dem Repository-Abzug im Browser-Cache (hart neu laden) |
| `invalid_client` / `AADSTS700027` | Zertifikat abgelaufen oder nicht mehr an der App | `Setup-EntraApp.ps1` erneut ausführen |
| `Kein Zugriff auf den privaten Schlüssel` | Task-Konto darf den Schlüssel nicht lesen | in `certlm.msc` Leserecht vergeben oder als SYSTEM laufen lassen |
| Graph `403` beim Schreiben | Site-Berechtigung fehlt | `Setup-EntraApp.ps1` erneut ausführen |
| Graph `404` bei einer Liste | `ComputerListId`/`BenutzerListId` falsch | IDs aus den Listeneinstellungen bzw. aus dem Migrationslog übernehmen |
| `field … is not recognized` | Spalte fehlt oder wurde umbenannt | Spalte wiederherstellen oder Eintrag im Skript entfernen |
| `Löschschutz greift: …` | AD lieferte nichts oder zu viele Löschungen | OU-DNs und AD-Verbindung prüfen; bei einer echten Massenmutation `LoeschSchutzProzent` bewusst erhöhen |
| `AD-Fehler in OU '<…>'` | Platzhalter statt echtem DN in `AdUserOUs` | echten Distinguished Name eintragen |
| `LDAP-Abfrage für Gruppe '…' fehlgeschlagen` | Gruppe existiert nicht (mehr) oder Name falsch | Name in `programme.json` korrigieren; der Lauf bricht deswegen nicht ab |
| `Get-WmiObject … Zugriff verweigert` | Konto ohne SCCM-Rechte oder DCOM blockiert | Konto als «Read-only Analyst» eintragen, Firewall prüfen |
| Viele Zeilen «In SCCM vorhanden = Nein» | PC-Name stimmt nicht mit SCCM überein | Namen korrigieren (Vergleich ohne Gross-/Kleinschreibung) |
| Umlaute in der Konsole falsch | OEM-Codepage | nur Anzeige; Log, JSON und SharePoint sind UTF-8 |
| `programme.json konnte nicht geladen werden` | Datei fehlt in SharePoint oder Pfad falsch | `Migrate-ToTwoLists.ps1 -ProgrammeOnly` ausführen; der Sync nutzt so lange die lokale Kopie |

Das Skript beendet sich mit Exit-Code 1, sobald mindestens ein Fehler aufgetreten ist; die
Aufgabenplanung zeigt dann «0x1». Details stehen immer im Log.

---

## 9. Entfernen

1. Geplante Aufgabe löschen: `Unregister-ScheduledTask -TaskName 'Computer Inventar Sync' -Confirm:$false`
2. App-Registrierungen «SCCM-SharePoint-Sync» und «Computer Inventar Frontend» im Entra Admin Center löschen.
3. Zertifikat in `certlm.msc` löschen, Ordner `C:\ComputerInventar` entfernen.
