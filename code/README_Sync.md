# Computer Inventar – SharePoint-Liste mit automatischer SCCM-Synchronisation

Stand: 02.09.2026 · Betrieb: ICT-Services Campus Sursee

---

## 1. Überblick

Die SharePoint-Liste **Computer Inventar** ersetzt das Tabellenblatt «Computer und User» der Excel-Datei
«Computer und User Inventar.xlsx». Sie enthält alle Spalten dieses Tabellenblatts und zusätzlich rund 80 Spalten,
die automatisch aus SCCM (Configuration Manager, Site PS2) befüllt werden.

```
adminsrv319 (SCCM Site-Server)                              Microsoft 365
┌──────────────────────────────────────────┐               ┌────────────────────────────────┐
│ SMS Provider  root\SMS\site_PS2  (WMI)   │               │ SharePoint Site mgmts-ict-s     │
│        ▲                                 │   Graph API   │   Liste "Computer Inventar"     │
│        │ liest                           │  ───────────▶ │   (nur SCCM_*-Spalten werden    │
│ Geplante Aufgabe (SYSTEM), alle 4 h      │   Zertifikat  │    geschrieben)                 │
│  → C:\ComputerInventar\                  │   App-Auth    │                                 │
│     Sync-SccmToSharePoint.ps1            │               │ Entra ID: App "SCCM-SharePoint- │
│     Sync-SccmToSharePoint.config.json    │               │ Sync", Berechtigung Sites.Selected│
│     Sync-SccmToSharePoint.log            │               │ nur auf diese eine Site (write) │
└──────────────────────────────────────────┘               └────────────────────────────────┘
```

| Element | Wert |
|---|---|
| Liste | https://campussursee.sharepoint.com/sites/mgmts-ict-s/Lists/Computer%20Inventar/AllItems.aspx |
| List-ID | `70afe6a4-0d23-4582-80c7-0cd0776961f8` |
| Sync-Server | adminsrv319.sasadmin.local, Ordner `C:\ComputerInventar` |
| Geplante Aufgabe | «SCCM SharePoint Computer Inventar Sync», Konto SYSTEM, ab 06:00 alle 4 Stunden |
| Entra-App | «SCCM-SharePoint-Sync», ClientId siehe lokale Konfigurationsdatei (nicht im Repository) |
| Zertifikat | `CN=SCCM-SharePoint-Sync`, Thumbprint siehe lokale Konfigurationsdatei, LocalMachine\My auf adminsrv319, gültig bis **02.09.2031** |
| Logdatei | `C:\ComputerInventar\Sync-SccmToSharePoint.log` |

---

## 2. Die Liste

### 2.1 Spalten

| Herkunft | Anzahl | Typ | Beschreibung |
|---|---|---|---|
| Excel «Computer und User» | 112 | Text / Ja-Nein | Werden **manuell** gepflegt, der Sync fasst sie nie an. |
| SCCM | 79 | Text / Datum / Zahl / mehrzeilig | Interner Name mit Präfix `SCCM_`, in den Listeneinstellungen unter Gruppe «SCCM». Werden bei jedem Lauf überschrieben. |

Regeln bei der Übernahme aus Excel:
- **PC-Name** ist die Titelspalte und der Schlüssel für den Sync.
- Die 91 «x»-Spalten (Beschaffungsjahre, Software, Rechte) sind Ja/Nein-Spalten.
- Die 12 Spalten «AD Photo Edit» bis «Tiffany» sind Text, weil dort AD-Gruppennamen wie `Hot_Reze` stehen.
- Zwei doppelte Excel-Spaltennamen wurden eindeutig gemacht: «Human Resources (ABACUS)» und «Supermailer (AD-Gruppe)».
- In Excel ausgeblendete Spalten existieren, sind aber nicht in der Standardansicht.
- Zeilen «Shared CAMPUS-001» (mehrere Benutzer auf einem Gerät) wurden unverändert übernommen; siehe 3.2.

Die vollständige Spaltendefinition liegt in `schema.json` (interner Name, Anzeigename, Typ, Gruppe).

### 2.2 Ansichten

| Ansicht | Inhalt |
|---|---|
| Alle Elemente (Standard) | Stammdaten + Modell, Seriennummer, letzter Benutzer, letzte Anmeldung, zuletzt aktiv, online, OS-Build, letzter Sync |
| Software (Excel) | alle Software- und Rechte-Spalten aus Excel |
| Budget / Beschaffung | Beschaffungsjahre, Budget, Modell, Seriennummern, OS- und BIOS-Datum |
| SCCM Hardware | Hersteller, Modell, Gehäusetyp, CPU, RAM, Disk, BIOS, TPM, BitLocker, Monitore, Akku |
| SCCM Benutzer & Aktivität | letzter, aktueller und primärer Benutzer, Konsolenbenutzer, online/offline, letzter Neustart |
| SCCM Client & OS | Client-Status, Inventar- und Heartbeat-Zeiten, OS, AD-Infos, Netzwerk |
| SCCM Sicherheit (Defender) | Defender-Status, Signaturen, Scans, letzte Bedrohung |
| SCCM Applikationen | zugewiesene Applikationen (Deployments), Office, installierte Software, Sammlungen |

### 2.3 Wichtige SCCM-Spalten

| Spalte | Quelle in SCCM | Bedeutung |
|---|---|---|
| Letzter angemeldeter Benutzer | CombinedDeviceResources.LastLogonUser | letzter Benutzer laut Heartbeat |
| Aktuell angemeldeter Benutzer | CombinedDeviceResources.CurrentLogonUser | Benutzer beim letzten Client-Kontakt |
| Letzte Benutzeranmeldung | SYSTEM_CONSOLE_USER.LastConsoleUse (neuester Eintrag) | wann sich zuletzt jemand interaktiv angemeldet hat |
| Konsolenbenutzer | SYSTEM_CONSOLE_USER | alle Benutzer mit Anzahl Anmeldungen, Minuten, letzter Anmeldung |
| Hauptbenutzer (Konsolennutzung) | SYSTEM_CONSOLE_USAGE.TopConsoleUser | Benutzer mit der meisten Konsolenzeit |
| Primärer Benutzer (SCCM) | SMS_UserMachineRelationship | User Device Affinity |
| Zuletzt aktiv (SCCM) | CombinedDeviceResources.LastActiveTime | letzter Kontakt des Clients |
| Zuletzt online / offline | CNLastOnlineTime / CNLastOfflineTime | Client-Benachrichtigungskanal |
| Letzter Hardware-/Software-Inventar, Heartbeat | LastHardwareScan / LastSoftwareScan / LastDDR | «wann zuletzt mit SCCM synchronisiert» |
| Zugewiesene Applikationen | SMS_AppDeploymentAssetDetails | pro Zeile: App, Sammlung, Erforderlich/Verfügbar, Status |
| Installierte Software | ADD_REMOVE_PROGRAMS (+_64) | Name (Version), sortiert |
| Sammlungen | SMS_FullCollectionMembership | alle Collections des Geräts |
| In SCCM vorhanden | Sync | «Ja», oder «Nein» wenn kein SCCM-Gerät zum PC-Namen existiert |
| Letzte Synchronisation mit SCCM | Sync | Zeitpunkt des letzten Laufs, der etwas an dieser Zeile geändert hat |
| Sync-Status | Sync | «OK» oder Hinweis, z. B. «Kein SCCM-Gerät zu 'CAMPUS-124'» |

Alle SCCM-Zeitstempel sind UTC und werden von SharePoint in der Zeitzone der Site angezeigt.

---

## 3. Funktionsweise des Syncs

### 3.1 Ablauf eines Laufs

1. **SCCM lesen** (WMI, `root\SMS\site_PS2`): alle Geräte aus `SMS_R_System`, die nicht obsolet sind und ein
   Workstation-Betriebssystem haben (Server nur mit `-IncludeServers`). Dazu in einem Rutsch alle Inventarklassen
   (Computer System, OS, BIOS, CPU, RAM, logische und physische Disks, Gehäuse, TPM, BitLocker, Monitore, Akku,
   Netzwerk, Konsolenbenutzer, Office, Add/Remove Programs), Deployments, Collections und primäre Benutzer.
2. **Liste lesen** (Graph API): alle Elemente mit Titel und allen `SCCM_`-Spalten.
3. **Zuordnung** über den PC-Namen (Gross-/Kleinschreibung egal, Präfix «Shared » wird entfernt).
4. **Schreiben**:
   - Gerät hat eine oder mehrere Zeilen → jede Zeile bekommt die SCCM-Werte, aber **nur die Felder, die sich geändert haben** (PATCH). Unveränderte Zeilen erzeugen keine neue Version.
   - Gerät hat keine Zeile → neue Zeile mit PC-Name und SCCM-Feldern, Excel-Spalten bleiben leer.
   - Zeile hat kein SCCM-Gerät → «In SCCM vorhanden = Nein», Sync-Status mit Hinweis. Zeilen mit PC-Name «Kein PC» werden übersprungen.
5. **Log** mit Zusammenfassung: `Fertig: n aktualisiert, n neu, n unverändert, n ohne SCCM-Gerät, n Fehler`. Exit-Code 1 bei Fehlern.

Dauer auf adminsrv319: ca. 10 s SCCM + 1–2 Minuten Schreiben beim ersten Lauf, danach meist unter einer Minute.

### 3.2 Geteilte Geräte

Excel-Zeilen wie «Shared CAMPUS-001» beschreiben je einen Benutzer auf demselben Gerät. Der Sync ordnet alle diese
Zeilen dem SCCM-Gerät CAMPUS-001 zu; sie bekommen identische SCCM-Daten. Die Benutzerinformation steckt weiterhin in
den Excel-Spalten (Arbeitsplatz, Login).

### 3.3 Authentifizierung

Das Skript meldet sich als **Anwendung** an (kein Benutzerkonto, kein Passwort, keine MFA):
- Entra-App «SCCM-SharePoint-Sync» mit **Zertifikat** (privater Schlüssel liegt nur auf adminsrv319, nicht exportierbar).
- Graph-Berechtigung `Sites.Selected` (Application), Admin-Consent erteilt.
- Site-Berechtigung «write» ausschliesslich auf `sites/mgmts-ict-s`. Auf andere Sites hat die App keinen Zugriff.

### 3.4 Parameter

```
Sync-SccmToSharePoint.ps1 [-ConfigPath <json>] [-WhatIf] [-OnlyDevices <Name,Name>] [-DumpOnly] [-IncludeServers]
```

| Parameter | Zweck |
|---|---|
| `-WhatIf` | zeigt nur, welche Zeilen und Felder geändert würden |
| `-OnlyDevices CAMPUS-073,CAMPUS-001` | nur diese Geräte; die Prüfung «ohne SCCM-Gerät» entfällt dabei |
| `-DumpOnly` | nur SCCM lesen und die aufbereiteten Felder ausgeben, kein SharePoint-Zugriff (zum Prüfen der Werte) |
| `-IncludeServers` | Server-Betriebssysteme mitnehmen |
| `-ConfigPath` | andere Konfigurationsdatei (Standard: neben dem Skript) |

### 3.5 Konfiguration `Sync-SccmToSharePoint.config.json`

```json
{
  "TenantId":       "2553fb74-5dcc-4072-8bb5-399d18f72af9",
  "ClientId":       "<App-ID aus dem Setup>",
  "CertThumbprint": "<Thumbprint aus dem Setup>",
  "SiteUrl":        "https://campussursee.sharepoint.com/sites/mgmts-ict-s",
  "ListTitle":      "Computer Inventar",
  "ListId":         "70afe6a4-0d23-4582-80c7-0cd0776961f8",
  "SmsProvider":    "adminsrv319.sasadmin.local",
  "SiteCode":       "PS2",
  "LogPath":        "C:\\ComputerInventar\\Sync-SccmToSharePoint.log"
}
```

---

## 4. Installation (Neuaufbau oder Umzug auf einen anderen Server)

Voraussetzungen: Windows PowerShell 5.1, Netzwerkzugriff auf den SMS Provider (WMI/DCOM) und ausgehend HTTPS zu
`login.microsoftonline.com` und `graph.microsoft.com`. Für die Einrichtung ein Entra-Konto mit Rolle
**Anwendungsadministrator** oder Globaler Administrator.

1. Ordner `C:\ComputerInventar` anlegen und hineinkopieren:
   `Sync-SccmToSharePoint.ps1`, `Setup-EntraApp.ps1`, `Sync-SccmToSharePoint.config.example.json`.
2. Als lokaler Administrator ausführen:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\ComputerInventar\Setup-EntraApp.ps1
   ```
   Das Skript
   - erzeugt ein selbstsigniertes Zertifikat `CN=SCCM-SharePoint-Sync` (5 Jahre) in LocalMachine\My,
   - zeigt einen Device-Code; unter https://microsoft.com/devicelogin mit dem Admin-Konto anmelden,
   - legt die App-Registrierung an (oder hängt bei bestehender App das neue Zertifikat an),
   - erteilt Admin-Consent für `Sites.Selected` und Schreibrecht auf die Site,
   - schreibt `Sync-SccmToSharePoint.config.json`.
3. Testen, ohne zu schreiben:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-SccmToSharePoint.ps1 -WhatIf -OnlyDevices CAMPUS-073
   ```
4. Erster echter Lauf: `powershell -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-SccmToSharePoint.ps1`
5. Geplante Aufgabe registrieren (in einer PowerShell-Konsole, nicht in cmd):
   ```powershell
   $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\ComputerInventar\Sync-SccmToSharePoint.ps1'
   $t = New-ScheduledTaskTrigger -Once -At 06:00 -RepetitionInterval (New-TimeSpan -Hours 4)
   Register-ScheduledTask -TaskName 'SCCM SharePoint Computer Inventar Sync' -Action $a -Trigger $t -User 'SYSTEM' -RunLevel Highest
   ```
   Der Aufgabenname darf keine Zeichen wie `>` enthalten.
   SYSTEM funktioniert auf dem Site-Server, weil das Computerkonto SCCM-Leserechte hat. Auf einem anderen Server ein
   Dienstkonto mit SCCM-Rolle «Read-only Analyst» verwenden und diesem in `certlm.msc` (Zertifikat → Alle Aufgaben →
   Private Schlüssel verwalten) Leserecht geben.
6. Aufgabe einmal manuell starten und Log prüfen:
   ```powershell
   Start-ScheduledTask -TaskName 'SCCM SharePoint Computer Inventar Sync'; Start-Sleep 120; Get-Content C:\ComputerInventar\Sync-SccmToSharePoint.log -Tail 5
   ```

### 4.1 Liste neu anlegen (nur wenn die Liste selbst verloren geht)

Die Liste wurde per SharePoint-REST aus dem Browser erstellt. Vorgehen: im Browser auf der Site anmelden, die
Entwicklerkonsole öffnen (F12) und den Inhalt von `create-list.js` einfügen. Das Skript ist idempotent: es legt die
Liste an, falls sie fehlt, und ergänzt nur fehlende Spalten. Die Spaltendefinition kommt aus `schema.json`
(erzeugt durch `Build-Schema.ps1` aus `ComputerInventar_header.json`; `Build-CreateListJs.ps1` baut daraus das JS).
Danach in der Konfiguration die neue `ListId` eintragen (aus der URL der Listeneinstellungen) und die Ansichten
gemäss Abschnitt 2.2 anlegen. Der Erstimport der Excel-Daten liegt als `import-compact.json` bei.

---

## 5. Betrieb und Unterhalt

### 5.1 Regelmässig

| Was | Wie oft | Wie |
|---|---|---|
| Log kontrollieren | wöchentlich | letzte Zeile «Fertig: …» muss «0 Fehler» zeigen; Aufgabenplanung zeigt «Letztes Ergebnis 0x0» |
| Zeilen «In SCCM vorhanden = Nein» prüfen | monatlich | Ansicht filtern; Ursache ist meist ein Tippfehler im PC-Namen oder ein ausgemustertes Gerät |
| Neue Zeilen ohne Excel-Daten nachpflegen | nach Bedarf | Ansicht «Alle Elemente» nach leerem «Arbeitsplatz» filtern (vom Sync neu angelegte SCCM-Geräte) |
| Logdatei kürzen | jährlich | Datei löschen oder umbenennen, sie wird neu angelegt |

### 5.2 Zertifikat erneuern (spätestens August 2031)

`Setup-EntraApp.ps1` erneut ausführen. Es erzeugt ein neues Zertifikat, hängt es an die bestehende App-Registrierung
an und aktualisiert den Thumbprint in der Konfiguration. Das alte Zertifikat kann anschliessend in `certlm.msc` und
in der App-Registrierung (Entra Admin Center → App-Registrierungen → SCCM-SharePoint-Sync → Zertifikate) gelöscht
werden. Erinnerung eintragen: das Skript prüft die Gültigkeit nicht selbst; ein abgelaufenes Zertifikat führt zu
«invalid_client» beim Token-Abruf.

### 5.3 Spalten ändern

- **Excel-Spalte hinzufügen/umbenennen**: direkt in den Listeneinstellungen. Der Sync ist davon nicht betroffen.
- **SCCM-Spalte hinzufügen**: (1) Spalte in der Liste anlegen (interner Name mit Präfix `SCCM_`, Typ passend),
  (2) in `Sync-SccmToSharePoint.ps1` in der Funktion `Build-SccmFields` einen Eintrag ergänzen, (3) `-DumpOnly -OnlyDevices`
  zum Prüfen, (4) `-WhatIf`, (5) laufen lassen. Der Sync sendet nur Felder aus `Build-SccmFields`; unbekannte Namen
  führen zu einem Graph-Fehler «field not recognized» im Log.
- **SCCM-Spalte entfernen**: zuerst den Eintrag im Skript entfernen, dann die Spalte in der Liste löschen.

### 5.4 Geräteauswahl ändern

Standard: alle nicht obsoleten SCCM-Geräte mit Workstation-OS. Anpassung in `Sync-SccmToSharePoint.ps1`, Variable
`$osFilter` bzw. die WQL-Abfrage auf `SMS_R_System` (z. B. `and Name not like 'EDULAP%'`, um Schulungsgeräte auszuschliessen).

### 5.5 Server-Umzug

Abschnitt 4 auf dem neuen Server durchführen. Da das Zertifikat nicht exportierbar ist, entsteht ein neues; das
Setup-Skript hängt es an die bestehende App an. Alte Aufgabe auf dem bisherigen Server deaktivieren.

### 5.6 Entfernen

1. Geplante Aufgabe löschen: `Unregister-ScheduledTask -TaskName 'SCCM SharePoint Computer Inventar Sync' -Confirm:$false`
2. App-Registrierung «SCCM-SharePoint-Sync» im Entra Admin Center löschen (entfernt auch die Site-Berechtigung).
3. Zertifikat in `certlm.msc` löschen, Ordner `C:\ComputerInventar` entfernen.

---

## 6. Fehlerbehebung

| Symptom | Ursache | Lösung |
|---|---|---|
| `The underlying connection was closed` | TLS 1.2 nicht aktiv oder Proxy | Skripte setzen TLS 1.2 und System-Proxy selbst; sonst Firewall Richtung `login.microsoftonline.com` / `graph.microsoft.com` Port 443 prüfen |
| `Zertifikat … nicht gefunden` | Thumbprint falsch oder Zertifikat im falschen Speicher | `Get-ChildItem Cert:\LocalMachine\My` vergleichen, Konfiguration anpassen |
| `Kein Zugriff auf den privaten Schlüssel` | Task-Konto darf den Schlüssel nicht lesen | in `certlm.msc` Leserecht vergeben oder Aufgabe als SYSTEM ausführen |
| `invalid_client` / `AADSTS700027` beim Token | Zertifikat nicht (mehr) an der App hinterlegt oder abgelaufen | `Setup-EntraApp.ps1` erneut ausführen |
| Graph `403 Forbidden` beim Schreiben | Site-Berechtigung fehlt | `Setup-EntraApp.ps1` erneut ausführen (erteilt «write» nur, falls fehlend) |
| Graph `404` bei der Liste | ListId falsch oder Liste verschoben | ListId in der Konfiguration prüfen |
| `Get-WmiObject … Zugriff verweigert` | Konto ohne SCCM-Rechte oder DCOM blockiert | Konto in SCCM als Read-only Analyst eintragen; Firewall zwischen Sync-Server und Provider |
| `field … is not recognized` im Log | Spalte in der Liste gelöscht oder umbenannt | Spalte wiederherstellen oder Eintrag in `Build-SccmFields` entfernen |
| Viele Zeilen «In SCCM vorhanden = Nein» | PC-Name in der Liste stimmt nicht mit SCCM überein | Namen korrigieren; Vergleich ist ohne Präfix «Shared » und ohne Gross-/Kleinschreibung |
| Umlaute in der Konsole falsch («Ger„te») | OEM-Codepage der Konsole | nur Anzeige; Log und SharePoint sind korrekt (UTF-8) |
| Setup: `403` beim Anlegen der App | Konto ohne Rolle Anwendungsadministrator oder Zustimmung im Browser abgelehnt | Skript zeigt Rollen und Token-Scopes an; mit passendem Konto wiederholen |
| `Join-Path … empty string` | ältere Skriptversion | aktuelle Version verwenden (Ordner wird im Skriptkörper ermittelt) |

Das Skript beendet sich mit Exit-Code 1, sobald mindestens ein Gerät einen Fehler hatte; die Aufgabenplanung zeigt
dann «0x1» als letztes Ergebnis. Details stehen immer im Log mit Gerätename und Graph-Fehlertext.

---

## 7. Dateien

| Datei | Zweck |
|---|---|
| `Sync-SccmToSharePoint.ps1` | der Sync (läuft als geplante Aufgabe) |
| `Sync-SccmToSharePoint.config.json` | Konfiguration (wird vom Setup erzeugt, nicht in Git/Teams ablegen: enthält keine Geheimnisse, aber IDs) |
| `Sync-SccmToSharePoint.config.example.json` | Vorlage der Konfiguration |
| `Setup-EntraApp.ps1` | Einrichtung und Zertifikatserneuerung: Zertifikat, App-Registrierung, Consent, Site-Berechtigung, Konfiguration |
| `schema.json`, `Build-Schema.ps1` | Spaltendefinition der Liste und deren Generator |
| `create-list.js`, `Build-CreateListJs.ps1` | Anlegen der Liste und Spalten per SharePoint-REST aus dem Browser |
| `ComputerInventar_header.json`, `ComputerInventar_rows.json`, `import-compact.json` | Excel-Export vom 02.09.2026, Grundlage des Erstimports |
| `Setup-FrontendApp.ps1` | Einrichtung der App-Registrierung des Web-Frontends (SPA, MSAL im Browser) |
| `serve.ps1` | kleiner Testserver für die lokale Vorschau des Frontends |
| `README.md` | dieses Dokument |

Dateien des Frontends (Ordner `frontend`, wird von Netlify unverändert ausgeliefert):

| Datei | Zweck |
|---|---|
| `index.html`, `app.js`, `styles.css` | Hauptseite: Übersicht, Geräteliste, Software |
| `geraet.html`, `geraet.js`, `geraet.css` | Gerätefenster (Dashboard mit Bearbeitung), siehe Abschnitt 8 |
| `konfig.js` | Mandanten-, Client-, Site- und List-ID (keine Geheimnisse) |
| `spalten.js` | Spaltendefinition, erzeugt aus `schema.json` |
| `auth.js` | Anmeldung an Entra ID über MSAL |
| `graph.js` | Lesen und Schreiben über Microsoft Graph, dazu die Vorführdaten für `?mock=1` |
| `_headers` | Sicherheitsheader und Content Security Policy (nur hier nachführen) |

---

## 8. Web-Frontend «Computer Inventar»

Die Liste lässt sich in SharePoint direkt bearbeiten. Für den Alltag gibt es zusätzlich eine eigene
Webseite: reines HTML, CSS und JavaScript ohne Bauprozess, ausgeliefert von Netlify aus dem Ordner
`frontend`. Angemeldet wird mit dem Microsoft-365-Konto (MSAL im Browser, Authorization Code Flow
mit PKCE); die Berechtigung ist delegiert, es sieht und ändert also niemand mehr, als er in
SharePoint ohnehin dürfte.

### 8.1 Gerätefenster und Bearbeitung

Ein Klick auf eine Zeile der Geräteliste öffnet `geraet.html?id=<Listen-ID>` in einem eigenen Fenster.
Dort steht das Gerät als Dashboard: Kennzahlen, Auffälligkeiten mit Gesundheits-Score, Stammdaten,
Software und Rechte, Hardware, System und Netzwerk, Sicherheit, SCCM-Aktivität als Zeitachse, ein
Flottenvergleich und alle Rohdaten.

- **Bearbeitbar** sind genau die von Hand gepflegten Spalten (in `spalten.js` mit `q: "excel"`):
  PC-Name, Arbeitsplatz, Login, Firma, Typ, Seriennummer, Testuser SCCM, Gebäude/Stock, Bemerkung,
  die Beschaffungsjahre, das Budget-Häkchen sowie alle Software-, Rechte- und AD-Gruppen-Spalten.
- **Schreibgeschützt** sind alle `SCCM_*`-Spalten. Sie sind mit einem Schloss gekennzeichnet und
  werden bei jedem Sync-Lauf überschrieben; eine Änderung dort wäre spätestens nach vier Stunden weg.
- Geändertes sammelt das Fenster in einer Speicherleiste am unteren Rand («3 Änderungen · Speichern ·
  Verwerfen»). `Ctrl+S` speichert, `Esc` beendet die Bearbeitung. Wer das Fenster mit ungespeicherten
  Änderungen schliesst, wird vom Browser gewarnt.
- Gespeichert wird als `PATCH` auf `…/items/<id>/fields`, und zwar nur die tatsächlich geänderten
  Felder. Neue Zeilen entstehen mit `geraet.html?neu=1`, «Als Vorlage duplizieren» übernimmt
  Stammdaten und Häkchen einer bestehenden Zeile ohne PC-Name, Seriennummer, Person und Login.
- **Löschen** verlangt das Abtippen des PC-Namens. Die Zeile landet im Papierkorb der SharePoint-Site
  und lässt sich dort 93 Tage lang zurückholen.

### 8.2 Berechtigung: Setup-Skript einmal erneut ausführen

Solange das Frontend nur gelesen hat, genügte die delegierte Berechtigung `Sites.Read.All`. Für die
Bearbeitung braucht es `Sites.ReadWrite.All`. Deshalb einmalig ausführen:

```powershell
cd code
.\Setup-FrontendApp.ps1 -RedirectUris @('http://localhost:8123/','https://inventar.campus-sursee.ch/')
```

Das Skript ist idempotent: Es aktualisiert die verlangten Berechtigungen der App-Registrierung
«Computer Inventar Frontend» und ergänzt den fehlenden Scope im bestehenden Admin-Consent. Ohne
diesen Lauf lädt die Seite weiterhin, das Speichern scheitert aber mit HTTP 403 und der Meldung
«Keine Schreibberechtigung … Setup-FrontendApp.ps1 erneut ausführen».

Zwei weitere Punkte zur Anmeldung:

- Die Umleitungsadresse ist die **Wurzel** der Seite (`https://…/`), nicht `…/geraet.html`. MSAL kehrt
  nach der Anmeldung von selbst auf die ursprünglich gewünschte Adresse zurück, in der
  App-Registrierung muss also nur die Wurzel stehen.
- Die Token liegen in `localStorage` statt in `sessionStorage`, damit das mit `window.open()`
  geöffnete Gerätefenster die Anmeldung der Hauptseite übernimmt und nicht ein zweites Mal umleitet.

### 8.3 Vorführmodus

Mit `?mock=1` (auch `geraet.html?id=5&mock=1`) zeigt die Seite erfundene Daten ohne jede Verbindung
zu SharePoint — praktisch für Vorführungen und für die Entwicklung. Änderungen im Vorführmodus
landen in `localStorage` (Schlüssel `computerinventar.mock.aenderungen`) und lassen sich mit dem
Knopf «Vorführ-Änderungen zurücksetzen» im grünen Band wieder wegräumen.
