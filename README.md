# Computer Inventar

Zwei SharePoint-Listen mit SCCM- und AD-Synchronisation.
Stand: 03.09.2026 · Betrieb: ICT-Services Campus Sursee

---

## Kurzanleitung

| Ich möchte … | Das ist zu tun |
|---|---|
| **wissen, ob der Sync läuft** | Log unter `C:\ComputerInventar\Sync-Inventar.log` ansehen; die geplante Aufgabe zeigt `0x0` bei Erfolg, `0x1` bei Fehlern |
| **den Sync von Hand starten** | `powershell -ExecutionPolicy Bypass -File .\Sync-Inventar.ps1` (vorher gefahrlos mit `-WhatIf`) |
| **ein Programm hinzufügen oder ändern** | `programme.json` bearbeiten → `Upload-Programme.ps1` → nächster Sync legt die Spalte an (Abschnitt 3) |
| **eine AD-Gruppe an ein Programm hängen** | in `programme.json` unter `adGruppen` eintragen → `Upload-Programme.ps1` (Abschnitt 3) |
| **eine Spalte hinzufügen oder umbenennen** | `schema-computer.json` bzw. `schema-benutzer.json` ändern, Spalte in SharePoint anlegen, `Build-Spalten.ps1` (Abschnitt 4) |
| **nach einer Änderung prüfen, ob alles hält** | `powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1` — erwartet `40 bestanden, 0 fehlgeschlagen` |
| **einen Fehler im Log verstehen** | Abschnitt 6, Fehlerbehebung |
| **das abgelaufene Zertifikat erneuern** | `Setup-EntraApp.ps1` erneut ausführen (Abschnitt 7) |

Alle Befehle laufen im Ordner `C:\ComputerInventar` auf dem SCCM-Site-Server (`adminsrv319`).
Die Skripte brauchen **Windows PowerShell 5.1** und kein Zusatzmodul; `ActiveDirectory` wird benutzt,
wenn es da ist, sonst greift der ADSI-Fallback.

---

## 1. Architektur

| Baustein | Inhalt | Wer schreibt |
|---|---|---|
| Liste **Computer** | Titel = PC-Name, dazu Seriennummer, Gebäude/Stock, Bemerkung, Beschaffungsjahr, Ersatz geplant und 79 `SCCM_*`-Spalten | Menschen (Frontend/SharePoint) + Sync (nur `SCCM_*`) |
| Liste **Benutzer** | Titel = Login (sAMAccountName), AD-Felder, Primärgerät (SCCM), Computer-Zuordnung, Bemerkung, dazu **eine Textspalte je Programm** | Sync (AD-Felder, Programmstufe 2) + Menschen (Computer, Bemerkung, Programmstufe 0/1) |
| **programme.json** | die Programmliste mit Kategorie und AD-Gruppen; liegt in `Dokumente/Inventar/` auf der Site | von Hand, hochgeladen mit `Upload-Programme.ps1` |

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

Der Sync setzt nur `2` und nimmt es wieder weg. **Eine manuelle `1` fasst er nie an** – wer eine
Berechtigung von Hand vergeben hat, verliert sie nicht, wenn später eine AD-Gruppe dazukommt.

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
| `schema-computer.json` / `schema-benutzer.json` | Spalten der beiden Listen (Quelle der Wahrheit) |
| `Build-Spalten.ps1` | erzeugt `frontend/spalten.js` aus den Schemadateien |
| `Test-Inventar.ps1` | Selbsttests + Syntaxprüfung aller Skripte |
| `Setup-EntraApp.ps1` | Zertifikat, App-Registrierung, Site-Berechtigung, Konfiguration |
| `Setup-FrontendApp.ps1` | App-Registrierung des Web-Frontends (SPA) |
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
| `ProgrammeDateiPfad` | Standard `Inventar/programme.json` |
| `AdUserOUs` | **Array von OU-DNs**; nur Benutzer aus diesen OUs kommen in die Liste |
| `AdServer` | optional ein bestimmter Domänencontroller |
| `LoeschSchutzProzent` | Standard 50 (siehe 2.3) |
| `SmsProvider`, `SiteCode` | SCCM |
| `LogPath` | Logdatei |

### 2.2 Ablauf eines Laufs

**Phase Computer**: SCCM per WMI lesen, über den PC-Namen zuordnen, nur geänderte `SCCM_*`-Felder
als PATCH schreiben, fehlende Geräte neu anlegen, Zeilen ohne SCCM-Gerät auf
«In SCCM vorhanden = Nein» setzen.

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

### 2.3 Löschschutz

Nicht gelöscht wird, wenn

- das AD **keinen einzigen** Benutzer geliefert hat (typisch bei falscher OU oder AD-Ausfall), oder
- mehr als `LoeschSchutzProzent` % der Zeilen gelöscht würden.

In beiden Fällen schreibt der Sync einen ERROR ins Log und endet mit Exit-Code 1, ohne zu löschen.

### 2.4 Parameter

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

- **Manuelle Spalte** ändern: Eintrag in `schema-computer.json` bzw. `schema-benutzer.json` anpassen,
  Spalte in SharePoint anlegen/umbenennen, dann `Build-Spalten.ps1` ausführen (erzeugt
  `frontend/spalten.js` neu).
- **SCCM-Spalte hinzufügen**: (1) Eintrag in `schema-computer.json`, (2) Spalte in der Liste «Computer»
  anlegen (`SCCM_`-Präfix), (3) Feld in `Build-SccmFields` in `Sync-Inventar.ps1` ergänzen,
  (4) `-DumpOnly -OnlyDevices` prüfen, (5) `-WhatIf`, (6) laufen lassen, (7) `Build-Spalten.ps1`.
- **Programmspalte**: nur über `programme.json` (siehe Abschnitt 3). Nie von Hand in `spalten.js`.

`frontend/spalten.js` wird **generiert** und darf nicht von Hand bearbeitet werden.

---

## 5. Tests

```powershell
powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1
```

Geprüft werden ohne Pester, ohne Netz, ohne SCCM und ohne AD: Geschäftsjahr-Helfer, Programm-Delta
des AD-Syncs, Löschschutz, Anzahl und Eindeutigkeit der Schema- und Programmeinträge sowie die Syntax
aller `*.ps1` im Ordner.

Erwartete Ausgabe: `Ergebnis: 40 bestanden, 0 fehlgeschlagen`.

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
| Viele Zeilen «In SCCM vorhanden = Nein» | PC-Name stimmt nicht mit SCCM überein | Namen korrigieren (Vergleich ohne Gross-/Kleinschreibung) |
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
