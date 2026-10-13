<#
.SYNOPSIS
  Selbsttests der reinen Funktionen (ohne Pester, ohne Graph, ohne SCCM, ohne AD).

.DESCRIPTION
  Lädt die Funktionen der Skripte mit dem Muster $InventarNurFunktionen = $true (die Skripte kehren
  dann vor ihrem Hauptteil zurück) und prüft:
   - Geschäftsjahr-Helfer,
   - Programm-Delta des AD-Syncs,
   - Löschschutz (Benutzer) und Archivschutz (Clients),
   - Verlauf-Helfer (JSON-Array in der Spalte «Verlauf»),
   - Seriennummern-Normalisierung und Platzhalter-Erkennung,
   - Aufteilung ADMIN-/EDU-Clients und Zuordnung SCCM-Gerät <-> Client-Zeile
     (Seriennummer, Namensfallback, Umbenennung,
     Archivieren/Reaktivieren),
   - Telefonnummern: Normalisierung, Kurzwahl, Abgleich mit dem AD,
   - Verhalten bei fehlenden Spalten,
   - Syntax aller PowerShell-Skripte in code\ und code\server\ (Parser).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Test-Inventar.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }

$script:Ok = 0
$script:Fehlgeschlagen = 0

function Pruefe {
    param([string]$Name, $Erwartet, $Tatsaechlich)
    $e = if ($null -eq $Erwartet) { '<null>' } else { [string]$Erwartet }
    $t = if ($null -eq $Tatsaechlich) { '<null>' } else { [string]$Tatsaechlich }
    if ($e -eq $t) {
        $script:Ok++
        Write-Host ("  OK   {0}" -f $Name)
    } else {
        $script:Fehlgeschlagen++
        Write-Host ("  FAIL {0}: erwartet '{1}', erhalten '{2}'" -f $Name, $e, $t) -ForegroundColor Red
    }
}

function Abschnitt([string]$Titel) { Write-Host ''; Write-Host "== $Titel" -ForegroundColor Cyan }

# --- Funktionen laden -------------------------------------------------------
# Achtung: Dot-Sourcing läuft im Geltungsbereich des Aufrufers und überschreibt $ScriptDir mit
# dem Ordner des geladenen Skripts. Die eigenen Pfade darum vorher in eigenen Namen sichern.
$TestDir = $ScriptDir
$ServerDir = Join-Path $TestDir 'server'
$InventarNurFunktionen = $true
. (Join-Path $ServerDir 'Inventar-Gemeinsam.ps1')
. (Join-Path $ServerDir 'Sync-Inventar.ps1')
. (Join-Path $TestDir 'Migriere-FruehererEintrag.ps1')
. (Join-Path $TestDir 'Migriere-Inhaberschaft.ps1')

# ---------------------------------------------------------------------------
Abschnitt 'Geschäftsjahr'
Pruefe 'gjVonDatum 2026-09-02'  '2026/2027' (Get-GjVonDatum ([datetime]'2026-09-02'))
Pruefe 'gjVonDatum 2026-07-31'  '2025/2026' (Get-GjVonDatum ([datetime]'2026-07-31'))
Pruefe 'gjVonDatum 2026-08-01'  '2026/2027' (Get-GjVonDatum ([datetime]'2026-08-01'))
Pruefe 'gjVonDatum leer'        ''          (Get-GjVonDatum $null)
Pruefe 'gjPlus +5'              '2028/2029' (Get-GjPlus '2023/2024' 5)
Pruefe 'gjPlus -1'              '2022/2023' (Get-GjPlus '2023/2024' -1)
Pruefe 'gjPlus ungültig'        ''          (Get-GjPlus 'abc' 5)
Pruefe 'gjVergleich kleiner'    '-1'        (Get-GjVergleich '2023/2024' '2025/2026')
Pruefe 'gjVergleich gleich'     '0'         (Get-GjVergleich '2025/2026' '2025/2026')
Pruefe 'gjVergleich groesser'   '1'         (Get-GjVergleich '2026/2027' '2025/2026')
Pruefe 'Test-Gj gültig'         'True'      (Test-Gj '2025/2026')
Pruefe 'Test-Gj ungültig'       'False'     (Test-Gj '2025/2027')

# ---------------------------------------------------------------------------
Abschnitt 'Programm-Delta (AD-Sync)'
$alle = @('P1', 'P2', 'P3', 'P4')
$aktuell = [pscustomobject]@{ P1 = '2'; P2 = '1'; P3 = '0'; P4 = '' }
$delta = Get-ProgrammDelta $aktuell @('P3') $alle
Pruefe '2 -> 0 wenn nicht mehr Mitglied' '0' $delta['P1']
Pruefe '1 bleibt 1 (kein Eintrag)'       'False' ($delta.Contains('P2'))
Pruefe '0 -> 2 wenn Mitglied'            '2' $delta['P3']
Pruefe 'leer bleibt leer (kein Eintrag)' 'False' ($delta.Contains('P4'))
Pruefe 'Anzahl Änderungen'               2 $delta.Count

$delta2 = Get-ProgrammDelta $aktuell @('P1', 'P2') $alle
Pruefe '2 bleibt 2 bei Mitgliedschaft'   'False' ($delta2.Contains('P1'))
Pruefe '1 -> 2 wenn Mitglied'            '2' $delta2['P2']

# ---------------------------------------------------------------------------
Abschnitt 'Löschschutz'
$s1 = Test-Loeschschutz 0 100 10 50
Pruefe 'AD leer -> kein Löschen' 'False' $s1.Erlaubt
$s2 = Test-Loeschschutz 100 100 60 50
Pruefe 'zu viele Löschungen -> gesperrt' 'False' $s2.Erlaubt
$s3 = Test-Loeschschutz 100 100 10 50
Pruefe 'wenige Löschungen -> erlaubt' 'True' $s3.Erlaubt
$s4 = Test-Loeschschutz 100 100 0 50
Pruefe 'nichts zu löschen -> erlaubt' 'True' $s4.Erlaubt
$s5 = Test-Loeschschutz 100 100 50 50
Pruefe 'genau an der Grenze -> erlaubt' 'True' $s5.Erlaubt

Pruefe 'Domänen-DN aus OU' 'DC=sasadmin,DC=local' (Get-DomainDnAusOu 'OU=Windows 11,OU=users,OU=Staff,DC=sasadmin,DC=local')

# ---------------------------------------------------------------------------
Abschnitt 'Verlauf-Helfer'
Pruefe 'Verlauf leer -> leeres Array'      0 (@(ConvertFrom-Verlauf '').Count)
Pruefe 'Verlauf null -> leeres Array'      0 (@(ConvertFrom-Verlauf $null).Count)
Pruefe 'Verlauf nur Leerzeichen'           0 (@(ConvertFrom-Verlauf "  `n ").Count)
Pruefe 'Verlauf [] -> leeres Array'        0 (@(ConvertFrom-Verlauf '[]').Count)
Pruefe 'Verlauf ungültiges JSON -> leer'   0 (@(ConvertFrom-Verlauf 'kein json {').Count)
$einEintrag = '[{"id":"a1","datum":"2026-08-01","text":"Erster","quelle":"manuell","erstellt":"2026-08-01T10:00:00Z"}]'
$e1 = @(ConvertFrom-Verlauf $einEintrag)
Pruefe 'Verlauf einzelnes Element -> Array' 1 $e1.Count
Pruefe 'Verlauf Text gelesen'              'Erster' $e1[0].text
Pruefe 'Verlauf Quelle gelesen'            'manuell' $e1[0].quelle
$dreiEintraege = '[{"id":"a","datum":"2026-08-01","text":"A","quelle":"manuell","erstellt":"2026-08-01T10:00:00Z"},{"id":"b","datum":"2026-08-02","text":"B","quelle":"sync","erstellt":"2026-08-02T10:00:00Z"},{"id":"c","datum":"2026-08-03","text":"C","quelle":"sync","erstellt":"2026-08-03T10:00:00Z"}]'
Pruefe 'Verlauf mehrere Elemente'          3 (@(ConvertFrom-Verlauf $dreiEintraege).Count)
$objektStattArray = '{"id":"a","datum":"2026-08-01","text":"A","quelle":"manuell","erstellt":"2026-08-01T10:00:00Z"}'
Pruefe 'Verlauf einzelnes Objekt tolerant' 1 (@(ConvertFrom-Verlauf $objektStattArray).Count)
Pruefe 'Verlauf fehlende Felder ergänzt'   'manuell' (@(ConvertFrom-Verlauf '[{"text":"X"}]')[0].quelle)
Pruefe 'Verlauf ohne id bekommt eine'      'True' ((@(ConvertFrom-Verlauf '[{"text":"X"}]')[0].id).Length -gt 0)

$strengFehler = $false
try { [void](ConvertFrom-Verlauf 'kaputt {' -Streng) } catch { $strengFehler = $true }
Pruefe 'Verlauf -Streng meldet Fehler'     'True' $strengFehler
$strengOk = $true
try { [void](ConvertFrom-Verlauf '' -Streng) } catch { $strengOk = $false }
Pruefe 'Verlauf -Streng: leer ist gültig'  'True' $strengOk

Pruefe 'ConvertTo-Verlauf leer'            '[]' (ConvertTo-Verlauf @())
$kompakt = ConvertTo-Verlauf (ConvertFrom-Verlauf $einEintrag)
Pruefe 'ConvertTo-Verlauf ist ein Array'   'True' ($kompakt.StartsWith('[') -and $kompakt.EndsWith(']'))
Pruefe 'ConvertTo-Verlauf ohne Einrückung' 'True' (-not ($kompakt -match "`n"))
Pruefe 'ConvertTo-Verlauf Rundlauf'        1 (@(ConvertFrom-Verlauf $kompakt).Count)

$zeit = [datetime]'2026-09-03T14:05:00Z'
$angehaengt = Add-VerlaufEintrag -Verlauf $einEintrag -Text 'Zweiter' -Datum '2026-09-03' -Quelle 'sync' -Zeitpunkt $zeit
$ae = @(ConvertFrom-Verlauf $angehaengt)
Pruefe 'Append: Bestehendes bleibt'        2 $ae.Count
Pruefe 'Append: alter Eintrag unverändert' 'Erster' $ae[0].text
Pruefe 'Append: alte id unverändert'       'a1' $ae[0].id
Pruefe 'Append: neuer Text'                'Zweiter' $ae[1].text
Pruefe 'Append: Quelle sync'               'sync' $ae[1].quelle
Pruefe 'Append: Datum übernommen'          '2026-09-03' $ae[1].datum
Pruefe 'Append: erstellt als ISO-UTC'      'True' ($ae[1].erstellt -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
Pruefe 'Append: kompakt geschrieben'       'True' (-not ($angehaengt -match "`n"))
$leerAngehaengt = Add-VerlaufEintrag -Verlauf '' -Text 'Neu' -Zeitpunkt $zeit
Pruefe 'Append auf leeren Verlauf'         1 (@(ConvertFrom-Verlauf $leerAngehaengt).Count)
Pruefe 'Append: Datum ohne Angabe = heute' (Get-Date $zeit -Format 'yyyy-MM-dd') (@(ConvertFrom-Verlauf $leerAngehaengt)[0].datum)
$mehrfach = Add-VerlaufEintraege -Verlauf $einEintrag -Texte @('X', 'Y') -Zeitpunkt $zeit
Pruefe 'Append mehrerer Texte'             3 (@(ConvertFrom-Verlauf $mehrfach).Count)
$appendFehler = $false
try { [void](Add-VerlaufEintrag -Verlauf 'kaputt {' -Text 'Neu') } catch { $appendFehler = $true }
Pruefe 'Append auf kaputtem JSON meldet'   'True' $appendFehler

# ---------------------------------------------------------------------------
Abschnitt 'Seriennummern'
Pruefe 'Serie normalisiert'                'ABC123' (NormSeriennummer '  abc123 ')
Pruefe 'Serie Innenleerzeichen'            'AB CD' (NormSeriennummer "ab   cd")
Pruefe 'Serie gültig'                      'True'  (Test-Seriennummer 'PF2ABCD9')
Pruefe 'Serie leer ungültig'               'False' (Test-Seriennummer '')
Pruefe 'Serie null ungültig'               'False' (Test-Seriennummer $null)
Pruefe 'Serie OEM-Platzhalter'             'False' (Test-Seriennummer 'To be filled by O.E.M.')
Pruefe 'Serie Default string'              'False' (Test-Seriennummer 'Default string')
Pruefe 'Serie System Serial Number'        'False' (Test-Seriennummer 'System Serial Number')
Pruefe 'Serie 0'                           'False' (Test-Seriennummer '0')
Pruefe 'Serie None'                        'False' (Test-Seriennummer 'none')
Pruefe 'Serie 0000000'                     'False' (Test-Seriennummer '0000000')
Pruefe 'Serie XXXXXXX'                     'False' (Test-Seriennummer 'XXXXXXX')
Pruefe 'Serie zu kurz'                     'False' (Test-Seriennummer 'AB')

# ---------------------------------------------------------------------------
Abschnitt 'Status und Zeilenschlüssel'
Pruefe 'Status leer bleibt leer'  ''           (Get-StatusNorm '')
Pruefe 'Status klein geschrieben' 'Archiviert' (Get-StatusNorm 'archiviert')
Pruefe 'Status Lager'             'Lager'      (Get-StatusNorm '  Lager ')
Pruefe 'Status unbekannt bleibt'  'Defekt'     (Get-StatusNorm 'Defekt')
Pruefe 'Zeilenserie: SCCM'          'SN1' (Get-ZeilenSeriennummer ([pscustomobject]@{ SCCM_SerialNumber = 'sn1'; Seriennummer = 'SN2' }))
Pruefe 'Zeilenserie: kein Fallback' ''    (Get-ZeilenSeriennummer ([pscustomobject]@{ SCCM_SerialNumber = '0'; Seriennummer = 'sn2' }))
Pruefe 'Zeilenserie: keine'         ''    (Get-ZeilenSeriennummer ([pscustomobject]@{ SCCM_SerialNumber = 'Default string' }))

# ---------------------------------------------------------------------------
Abschnitt 'Zuordnung SCCM <-> Client-Liste'
function Geraet($rid, $name, $sn, $akt) { [pscustomobject]@{ ResourceId = $rid; Name = $name; Seriennummer = $sn; Aktivitaet = $akt } }
function Zeile($id, $titel, $sccmSn, $sn, $status) { [pscustomobject]@{ Id = $id; Title = $titel; SCCM_SerialNumber = $sccmSn; Seriennummer = $sn; Status = $status } }

# a) Seriennummer schlägt Name
$p = Get-ClientZuordnung @((Geraet 1 'PC-NEU' 'SN-A' '2026-09-01')) @((Zeile 10 'PC-ALT' 'SN-A' '' 'Aktiv'), (Zeile 11 'PC-NEU' '' '' 'Aktiv'))
Pruefe 'Treffer über Seriennummer'      '10' $p.Zuordnungen[0].ZeileId
Pruefe 'Grund Seriennummer'             'Seriennummer' $p.Zuordnungen[0].Grund
Pruefe 'Umbenennung erkannt'            'True' $p.Zuordnungen[0].Umbenennen
Pruefe 'Neuer Titel'                    'PC-NEU' $p.Zuordnungen[0].NeuerTitel
Pruefe 'Verlaufstext Umbenennung'       'Umbenannt von PC-ALT zu PC-NEU (SCCM)' $p.Zuordnungen[0].VerlaufTexte[0]
Pruefe 'Namenszeile bleibt unbelegt'    1 $p.Archivieren.Count
Pruefe 'Unbelegte Zeile wird archiviert' '11' $p.Archivieren[0].ZeileId
Pruefe 'Kein neues Gerät'               0 $p.Neu.Count

# b) Gleiche Seriennummer, gleicher Name: keine Umbenennung
$p = Get-ClientZuordnung @((Geraet 1 'PC1' 'SN-A' '2026-09-01')) @((Zeile 10 'PC1' 'SN-A' '' 'Aktiv'))
Pruefe 'Keine Umbenennung bei gleichem Namen' 'False' $p.Zuordnungen[0].Umbenennen
Pruefe 'Status Aktiv bleibt'                  '' $p.Zuordnungen[0].StatusNeu

# c) Namensfallback nur gegen Zeilen ohne Seriennummer
$p = Get-ClientZuordnung @((Geraet 1 'VM1' 'To be filled by O.E.M.' '2026-09-01')) @((Zeile 10 'VM1' '' '' ''), (Zeile 11 'VM1' 'SN-X' '' 'Aktiv'))
Pruefe 'Namensfallback trifft serienlose Zeile' '10' $p.Zuordnungen[0].ZeileId
Pruefe 'Grund Name'                             'Name' $p.Zuordnungen[0].Grund
Pruefe 'Leerer Status wird Aktiv'               'Aktiv' $p.Zuordnungen[0].StatusNeu
Pruefe 'Zeile mit fremder Serie archivieren'    '11' $p.Archivieren[0].ZeileId

# d) Archivierte Zeile wird nie über den Namen wiederverwendet
$p = Get-ClientZuordnung @((Geraet 1 'PC9' '' '2026-09-01')) @((Zeile 10 'PC9' '' '' 'Archiviert'))
Pruefe 'Archivierte Zeile nicht über Namen'  0 $p.Zuordnungen.Count
Pruefe 'Stattdessen neu angelegt'            1 $p.Neu.Count
Pruefe 'Neu mit Status Aktiv'                'Aktiv' $p.Neu[0].Status
Pruefe 'Neu mit Verlaufstext'                'Aus SCCM neu angelegt' $p.Neu[0].Verlauf
Pruefe 'Archivierte Zeile bleibt liegen'     0 $p.Archivieren.Count

# e) Reaktivieren über die Seriennummer
$p = Get-ClientZuordnung @((Geraet 1 'PC9' 'SN-B' '2026-09-01')) @((Zeile 10 'PC9' 'SN-B' '' 'Archiviert'))
Pruefe 'Archiviert -> Aktiv'          'Aktiv' $p.Zuordnungen[0].StatusNeu
Pruefe 'Verlaufstext Reaktivierung'   'Wieder in SCCM vorhanden, reaktiviert' $p.Zuordnungen[0].VerlaufTexte[0]

# f) Lager bleibt Lager, solange das Gerät in SCCM ist
$p = Get-ClientZuordnung @((Geraet 1 'PC5' 'SN-C' '2026-09-01')) @((Zeile 10 'PC5' 'SN-C' '' 'Lager'))
Pruefe 'Lager bleibt unangetastet' '' $p.Zuordnungen[0].StatusNeu
# … ist es nicht mehr in SCCM, wird auch ein Lager-Gerät archiviert
$p = Get-ClientZuordnung @((Geraet 1 'PC6' 'SN-D' '2026-09-01')) @((Zeile 10 'PC5' 'SN-C' '' 'Lager'))
Pruefe 'Lager ohne SCCM wird archiviert' '10' $p.Archivieren[0].ZeileId
Pruefe 'Verlaufstext Archivierung' 'In SCCM nicht mehr vorhanden, archiviert' $p.Archivieren[0].Verlauf

# g) Dublette in SCCM: jüngste Aktivität gewinnt
$p = Get-ClientZuordnung @((Geraet 1 'PC-ALT' 'SN-E' '2025-01-01'), (Geraet 2 'PC-NEU' 'SN-E' '2026-09-01')) @((Zeile 10 'PC-ALT' 'SN-E' '' 'Aktiv'))
Pruefe 'Dublette: jüngstes Gerät gewinnt' '2' $p.Zuordnungen[0].Geraet.ResourceId
Pruefe 'Dublette wird gemeldet'           'True' ($p.Warnungen.Count -ge 1)
Pruefe 'Dublette: keine neue Zeile'       0 $p.Neu.Count

# h) Mehrere Zeilen und Geräte mit demselben Namen
$p = Get-ClientZuordnung @((Geraet 1 'PC7' '' '2026-09-01'), (Geraet 2 'PC7' '' '2024-01-01')) @((Zeile 10 'PC7' '' '' 'Aktiv'), (Zeile 11 'PC7' '' '' 'Aktiv'))
Pruefe 'Doppelter Name: beide zugeordnet' 2 $p.Zuordnungen.Count
Pruefe 'Doppelter Name: nichts archiviert' 0 $p.Archivieren.Count
Pruefe 'Doppelter Name: nichts neu'        0 $p.Neu.Count
$zuJung = @($p.Zuordnungen | Where-Object { $_.ZeileId -eq '10' })[0]
Pruefe 'Jüngstes Gerät zuerst' '1' $zuJung.Geraet.ResourceId

# i) Eine manuelle Spalte «Seriennummer» gibt es nicht mehr – ein solcher Wert zählt nicht.
$p = Get-ClientZuordnung @((Geraet 1 'PC8' 'SN-F' '2026-09-01')) @((Zeile 10 'ALT8' '' 'sn-f' 'Aktiv'))
Pruefe 'Manuelle Seriennummer zählt nicht'  0 $p.Zuordnungen.Count
Pruefe 'Gerät wird neu angelegt'           1 $p.Neu.Count

# j) Leere Zeile (weder Titel noch Seriennummer) wird ignoriert
$p = Get-ClientZuordnung @((Geraet 1 'PC1' 'SN-A' '2026-09-01')) @((Zeile 10 'PC1' 'SN-A' '' 'Aktiv'), (Zeile 11 '' '' '' ''))
Pruefe 'Leere Zeile wird ignoriert' 0 $p.Archivieren.Count

# k) «In Domäne = Nein»: der Abgleich lässt die Zeile vollständig in Ruhe.
function ZeileD($id, $titel, $status, $domaene) {
    [pscustomobject]@{ Id = $id; Title = $titel; SCCM_SerialNumber = ''; Seriennummer = ''; Status = $status; InDomaene = $domaene }
}
Pruefe 'InDomaene: leer gilt als Ja'   'True'  (Test-InDomaene (ZeileD 10 'PC1' 'Aktiv' $null))
Pruefe 'InDomaene: True ist Ja'        'True'  (Test-InDomaene (ZeileD 10 'PC1' 'Aktiv' $true))
Pruefe 'InDomaene: False ist Nein'     'False' (Test-InDomaene (ZeileD 10 'PC1' 'Aktiv' $false))
Pruefe 'InDomaene: Text «Nein»'        'False' (Test-InDomaene (ZeileD 10 'PC1' 'Aktiv' 'Nein'))
Pruefe 'InDomaene: Text «false»'       'False' (Test-InDomaene (ZeileD 10 'PC1' 'Aktiv' 'false'))
Pruefe 'InDomaene: Text «Ja»'          'True'  (Test-InDomaene (ZeileD 10 'PC1' 'Aktiv' 'Ja'))

# Ein Gerät ohne Domäne wird nie archiviert, obwohl SCCM es nicht kennt …
$p = Get-ClientZuordnung @((Geraet 1 'PC1' 'SN-A' '2026-09-01')) @((ZeileD 10 'GAST-01' 'Aktiv' $false))
Pruefe 'Ohne Domäne: nicht archiviert'   0 $p.Archivieren.Count
Pruefe 'Ohne Domäne: gezählt'            1 $p.Ausserhalb
Pruefe 'Ohne Domäne: zählt nicht als aktive Zeile' 0 $p.AktiveZeilen
Pruefe 'Ohne Domäne: Gerät wird neu angelegt' 1 $p.Neu.Count
# … und eine Zeile in der Domäne daneben verhält sich unverändert.
$p = Get-ClientZuordnung @((Geraet 1 'PC1' 'SN-A' '2026-09-01')) @((ZeileD 10 'GAST-01' 'Aktiv' $false), (ZeileD 11 'PC1' 'Aktiv' $true))
Pruefe 'Ohne Domäne: Nachbarzeile trifft' '11' $p.Zuordnungen[0].ZeileId
Pruefe 'Ohne Domäne: nur eine aktive Zeile' 1 $p.AktiveZeilen

# l) Neu aufgesetzte Geräte: SCCM hat einen neuen Datensatz ohne Hardware-Inventar (Regel 6).
#    Vorbild: CAMPUS-041 (09.10.2026) und die EDU-155-Notebooks (02.10.2026).
$heute = [datetime]'2026-10-13T12:00:00Z'
function GeraetNeu($rid, $name, $erstellt) {
    [pscustomobject]@{ ResourceId = $rid; Name = $name; Seriennummer = ''; Aktivitaet = '2026-10-13'; InventarAusstehend = $true; Erstellt = [datetime]$erstellt }
}
function ZeileR($id, $titel, $sccmSn, $status, $rid) {
    [pscustomobject]@{ Id = $id; Title = $titel; SCCM_SerialNumber = $sccmSn; Seriennummer = ''; Status = $status; SCCM_ResourceID = $rid }
}
# a) Zeile im Einsatz mit Seriennummer wird festgehalten: nicht archiviert, keine Dublette
$p = Get-ClientZuordnung @((GeraetNeu 9 'EDU-155-03' '2026-10-02')) @((ZeileR 18 'EDU-155-03' 'CZC1527N2P' 'Aktiv' 93)) -Heute $heute
Pruefe 'Neu aufgesetzt: Zeile festgehalten'      1 $p.Wartend.Count
Pruefe 'Neu aufgesetzt: Grund festgehalten'      'festgehalten' $p.Wartend[0].Grund
Pruefe 'Neu aufgesetzt: welche Zeile'            '18' $p.Wartend[0].ZeileId
Pruefe 'Neu aufgesetzt: keine Dublette'          0 $p.Neu.Count
Pruefe 'Neu aufgesetzt: nicht archiviert'        0 $p.Archivieren.Count
Pruefe 'Neu aufgesetzt: nicht überschrieben'     0 $p.Zuordnungen.Count
Pruefe 'Neu aufgesetzt: Archivschutz zählt Zeile' 1 $p.AktiveZeilen
# … sobald das Inventar da ist, trifft die Seriennummer dieselbe Zeile
$p = Get-ClientZuordnung @((Geraet 9 'EDU-155-03' 'CZC1527N2P' '2026-10-13')) @((ZeileR 18 'EDU-155-03' 'CZC1527N2P' 'Aktiv' 93)) -Heute $heute
Pruefe 'Nach dem Inventar: dieselbe Zeile'       '18' $p.Zuordnungen[0].ZeileId
# b) archivierte Zeile ohne Seriennummer wird reaktiviert (CAMPUS-041: Zeilen 44 und 222)
$p = Get-ClientZuordnung @((GeraetNeu 16780104 'CAMPUS-041' '2026-10-09')) @((ZeileR 44 'CAMPUS-041' '' 'Archiviert' ''), (ZeileR 222 'CAMPUS-041' '' 'Archiviert' 16780084)) -Heute $heute
Pruefe 'Neu aufgesetzt: archivierte Zeile ohne Serie trifft' 1 $p.Zuordnungen.Count
Pruefe 'Neu aufgesetzt: die jüngste Zeile'       '222' $p.Zuordnungen[0].ZeileId
Pruefe 'Neu aufgesetzt: reaktiviert'             'Aktiv' $p.Zuordnungen[0].StatusNeu
Pruefe 'Neu aufgesetzt: Verlauf reaktiviert'     'Wieder in SCCM vorhanden, reaktiviert' $p.Zuordnungen[0].VerlaufTexte[0]
Pruefe 'Neu aufgesetzt: keine dritte Zeile'      0 $p.Neu.Count
# c) archivierte Zeile mit Seriennummer: warten statt anlegen …
$p = Get-ClientZuordnung @((GeraetNeu 7 'PC-A' '2026-10-12')) @((ZeileR 10 'PC-A' 'SN-ALT' 'Archiviert' 3)) -Heute $heute
Pruefe 'Archiviert mit Serie: wartet'            'wartet' $p.Wartend[0].Grund
Pruefe 'Archiviert mit Serie: nichts neu'        0 $p.Neu.Count
Pruefe 'Archiviert mit Serie: nicht reaktiviert' 0 $p.Zuordnungen.Count
# … aber höchstens WartezeitTage lang
$p = Get-ClientZuordnung @((GeraetNeu 7 'PC-A' '2026-10-01')) @((ZeileR 10 'PC-A' 'SN-ALT' 'Archiviert' 3)) -Heute $heute -WartezeitTage 7
Pruefe 'Nach der Wartezeit: neu angelegt'        1 $p.Neu.Count
Pruefe 'Nach der Wartezeit: nichts wartet'       0 $p.Wartend.Count
$ohneDatum = [pscustomobject]@{ ResourceId = 7; Name = 'PC-A'; Seriennummer = ''; Aktivitaet = ''; InventarAusstehend = $true; Erstellt = $null }
$p = Get-ClientZuordnung @($ohneDatum) @((ZeileR 10 'PC-A' 'SN-ALT' 'Archiviert' 3)) -Heute $heute
Pruefe 'Ohne Anlagedatum: lieber anlegen'        1 $p.Neu.Count
# d) ohne gleichnamige Zeile entsteht die Zeile sofort
$p = Get-ClientZuordnung @((GeraetNeu 7 'PC-NEU' '2026-10-13')) @((ZeileR 10 'PC-ANDERS' 'SN-X' 'Aktiv' 3)) -Heute $heute
Pruefe 'Neues Gerät ohne Inventar: sofort neu'   1 $p.Neu.Count
# e) gleichnamige Zeile ohne Seriennummer: normaler Namensfallback
$p = Get-ClientZuordnung @((GeraetNeu 7 'PC-B' '2026-10-13')) @((ZeileR 10 'PC-B' '' 'Aktiv' '')) -Heute $heute
Pruefe 'Ohne Inventar, Zeile ohne Serie: Treffer' '10' $p.Zuordnungen[0].ZeileId
Pruefe 'Ohne Inventar, Zeile ohne Serie: Grund'   'Name' $p.Zuordnungen[0].Grund
# f) ein fertig inventarisiertes Gerät gleichen Namens hat Vorrang
$p = Get-ClientZuordnung @((GeraetNeu 8 'PC-C' '2026-10-13'), (Geraet 2 'PC-C' '' '2026-10-01')) @((ZeileR 10 'PC-C' '' 'Aktiv' '')) -Heute $heute
Pruefe 'Vorrang: inventarisiertes Gerät trifft'  '2' $p.Zuordnungen[0].Geraet.ResourceId
Pruefe 'Vorrang: das andere wartet'              1 $p.Wartend.Count
# g) ohne InventarAusstehend bleibt alles wie bisher (archivierte Zeile wird nicht über den Namen genommen)
$p = Get-ClientZuordnung @((Geraet 1 'PC-D' '' '2026-10-13')) @((ZeileR 10 'PC-D' 'SN-D' 'Archiviert' 3)) -Heute $heute
Pruefe 'Mit Inventar: neue Zeile wie bisher'     1 $p.Neu.Count

# m) Dublette: zwei Zeilen tragen dieselbe ResourceID – die überzählige wird mit Hinweis archiviert
$p = Get-ClientZuordnung @((Geraet 93 'EDU-155-03' 'CZC1527N2P' '2026-10-13')) @((ZeileR 18 'EDU-155-03' 'CZC1527N2P' 'Aktiv' '93'), (ZeileR 128 'EDU-155-03' '' 'Aktiv' '93.0')) -Heute $heute
Pruefe 'Dublette: Original trifft'               '18' $p.Zuordnungen[0].ZeileId
Pruefe 'Dublette: überzählige archiviert'        '128' $p.Archivieren[0].ZeileId
Pruefe 'Dublette: Verlaufstext nennt Zeile'      'Doppelte Zeile: das SCCM-Gerät (ResourceID 93) steht in Zeile ID 18, archiviert' $p.Archivieren[0].Verlauf
$p = Get-ClientZuordnung @((Geraet 1 'PC6' 'SN-D' '2026-09-01')) @((ZeileR 10 'PC5' 'SN-C' 'Aktiv' '55'))
Pruefe 'Ohne Dublette: Standardtext'             'In SCCM nicht mehr vorhanden, archiviert' $p.Archivieren[0].Verlauf

# ---------------------------------------------------------------------------
Abschnitt 'Archivschutz'
$a1 = Test-ArchivSchutz 0 100 10 50
Pruefe 'SCCM leer -> kein Archivieren'      'False' $a1.Erlaubt
$a2 = Test-ArchivSchutz 100 100 60 50
Pruefe 'zu viele Archivierungen -> gesperrt' 'False' $a2.Erlaubt
$a3 = Test-ArchivSchutz 100 100 10 50
Pruefe 'wenige Archivierungen -> erlaubt'    'True' $a3.Erlaubt
$a4 = Test-ArchivSchutz 100 100 50 50
Pruefe 'genau an der Grenze -> erlaubt'      'True' $a4.Erlaubt
$a5 = Test-ArchivSchutz 100 100 0 50
Pruefe 'nichts zu archivieren -> erlaubt'    'True' $a5.Erlaubt

# ---------------------------------------------------------------------------
Abschnitt 'Telefonnummern: Normalisierung'
Pruefe 'Ziffern aus +41-Schreibweise'   '41419262373' (Get-TelefonZiffern '+41 41 926 23 73')
Pruefe 'Ziffern aus 0041'               '41419262373' (Get-TelefonZiffern '0041 41 926 23 73')
Pruefe 'Ziffern aus 041'                '41419262373' (Get-TelefonZiffern '041 926 23 73')
Pruefe 'Ziffern aus Kurzwahl'           '41419262373' (Get-TelefonZiffern '373')
Pruefe 'Ziffern aus Kurzwahl, Präfix'   '41419262373' (Get-TelefonZiffern '373' '+41 41 926 2')
Pruefe 'Ziffern aus Mobilnummer'        '41793922163' (Get-TelefonZiffern '079 392 21 63')
Pruefe 'Ziffern leer'                   ''            (Get-TelefonZiffern '')
Pruefe 'Ziffern null'                   ''            (Get-TelefonZiffern $null)
Pruefe 'Ziffern nur Text'               ''            (Get-TelefonZiffern 'keine')
Pruefe 'Format +41'                     '+41 41 926 23 73' (Format-Telefon '41419262373')
Pruefe 'Format aus Kurzwahl'            '+41 41 926 23 73' (Format-Telefon '373')
Pruefe 'Format aus 041'                 '+41 41 926 21 11' (Format-Telefon '041 926 21 11')
Pruefe 'Format Mobil'                   '+41 79 392 21 63' (Format-Telefon '+41 79 392 21 63')
Pruefe 'Format leer'                    ''                 (Format-Telefon '')
Pruefe 'Format fremd bleibt Ziffern'    '+4912345678901'   (Format-Telefon '+49 123 456 78901')
Pruefe 'Kurzwahl aus Vollnummer'        '373' (Get-TelefonKurzwahl '+41 41 926 23 73')
Pruefe 'Kurzwahl aus Ziffern'           '111' (Get-TelefonKurzwahl '41419262111')
Pruefe 'Kurzwahl ausserhalb Block'      ''    (Get-TelefonKurzwahl '+41 79 392 21 63')
Pruefe 'Kurzwahl anderes Präfix'        '929' (Get-TelefonKurzwahl '+41 41 926 29 29' '+41 41 926 2')
Pruefe 'Im Block: ja'                   'True'  (Test-TelefonImBlock '+41 41 926 25 92')
Pruefe 'Im Block: nein'                 'False' (Test-TelefonImBlock '+41 41 925 25 92')
Pruefe 'Telefonstatus leer'             ''        (Get-TelefonStatusNorm '')
Pruefe 'Telefonstatus frei'             'Frei'    (Get-TelefonStatusNorm ' frei ')
Pruefe 'Telefonstatus inaktiv'          'Inaktiv' (Get-TelefonStatusNorm 'INAKTIV')
Pruefe 'Telefonstatus unbekannt bleibt' 'Defekt'  (Get-TelefonStatusNorm 'Defekt')

# ---------------------------------------------------------------------------
Abschnitt 'Telefonnummern: Abgleich mit dem AD'
function TelZeile($id, $kurz, $voll, $name, $typ, $status, $benutzer) { [pscustomobject]@{ Id = $id; Title = $kurz; Telefonnummer = $voll; Name = $name; Typ = $typ; Status = $status; Benutzer = $benutzer } }
function AdUser($login, $name, $tel) { [pscustomobject]@{ Login = $login; Anzeigename = $name; Telefon = $tel; Aktiviert = $true } }

# a) Freie Nummer, im AD vergeben: Benutzer, Name, Typ und Status werden gesetzt
$t = Get-TelefonAbgleich @((TelZeile 1 '373' '+41 41 926 23 73' '' '' 'Frei' '')) @((AdUser 'janis.zesiger' 'Zesiger Janis' '+41 41 926 23 73'))
Pruefe 'Abgleich: ein Update'              1 $t.Updates.Count
Pruefe 'Abgleich: Benutzer gesetzt'        'janis.zesiger' $t.Updates[0].Felder['Benutzer']
Pruefe 'Abgleich: Name aus AD'             'Zesiger Janis' $t.Updates[0].Felder['Name']
Pruefe 'Abgleich: Typ Person'              'Person' $t.Updates[0].Felder['Typ']
Pruefe 'Abgleich: Frei -> Aktiv'           'Aktiv' $t.Updates[0].Felder['Status']
Pruefe 'Abgleich: Verlaufstext Zuordnung'  'Im AD bei janis.zesiger hinterlegt' $t.Updates[0].VerlaufTexte[0]
Pruefe 'Abgleich: drei Verlaufstexte'      3 $t.Updates[0].VerlaufTexte.Count
Pruefe 'Abgleich: nichts neu'              0 $t.Neu.Count

# b) Alles stimmt schon: kein Update
$t = Get-TelefonAbgleich @((TelZeile 1 '373' '+41 41 926 23 73' 'Zesiger Janis' 'Person' 'Aktiv' 'janis.zesiger')) @((AdUser 'janis.zesiger' 'Zesiger Janis' '041 926 23 73'))
Pruefe 'Abgleich: unverändert -> kein Update' 0 $t.Updates.Count
Pruefe 'Abgleich: Login-Vergleich ohne Gross/Klein' 0 (Get-TelefonAbgleich @((TelZeile 1 '373' '+41 41 926 23 73' 'X' 'Person' '' 'Janis.Zesiger')) @((AdUser 'janis.zesiger' 'Zesiger Janis' '+41 41 926 23 73'))).Updates.Count

# c) Nummer nicht mehr im AD: Benutzer wird geleert, Name und Status bleiben
$t = Get-TelefonAbgleich @((TelZeile 1 '222' '+41 41 926 22 22' 'Egger Bernadette' 'Person' 'Aktiv' 'bernadette.egger')) @()
Pruefe 'Abgleich: Benutzer geleert (Feld da)' 'True' ($t.Updates[0].Felder.Contains('Benutzer'))
Pruefe 'Abgleich: Benutzer geleert (null)'   '<null>' $t.Updates[0].Felder['Benutzer']
Pruefe 'Abgleich: Status bleibt'             'False' ($t.Updates[0].Felder.Contains('Status'))
Pruefe 'Abgleich: Verlaufstext Wegfall'      'Nicht mehr im AD bei bernadette.egger hinterlegt' $t.Updates[0].VerlaufTexte[0]

# d) Wechsel der Person
$t = Get-TelefonAbgleich @((TelZeile 1 '207' '+41 41 926 22 07' 'Staub Natalie' 'Person' 'Aktiv' 'natalie.staub')) @((AdUser 'michael.roethlisberger' 'Röthlisberger Michael' '+41 41 926 22 07'))
Pruefe 'Abgleich: Wechsel Benutzer'     'michael.roethlisberger' $t.Updates[0].Felder['Benutzer']
Pruefe 'Abgleich: Name bleibt bei Wechsel' 'False' ($t.Updates[0].Felder.Contains('Name'))
Pruefe 'Abgleich: Verlaufstext Wechsel' 'AD-Zuordnung geändert: natalie.staub → michael.roethlisberger' $t.Updates[0].VerlaufTexte[0]

# e) Nummer im Block fehlt in der Liste: neu anlegen; Mobilnummer nicht
$t = Get-TelefonAbgleich @() @((AdUser 'a.b' 'B A' '+41 41 926 24 99'), (AdUser 'c.d' 'D C' '+41 79 111 22 33'))
Pruefe 'Abgleich: eine neue Zeile'        1 $t.Neu.Count
Pruefe 'Abgleich: neu Kurzwahl'           '499' $t.Neu[0].Felder['Title']
Pruefe 'Abgleich: neu Telefonnummer'      '+41 41 926 24 99' $t.Neu[0].Felder['Telefonnummer']
Pruefe 'Abgleich: neu Benutzer'           'a.b' $t.Neu[0].Felder['Benutzer']
Pruefe 'Abgleich: neu Status Aktiv'       'Aktiv' $t.Neu[0].Felder['Status']
Pruefe 'Abgleich: neu Verlauf'            'Aus dem AD neu angelegt (a.b)' $t.Neu[0].Verlauf

# f) Dublette im AD: alphabetisch erster Login gewinnt, Warnung
$t = Get-TelefonAbgleich @((TelZeile 1 '300' '' '' '' '' '')) @((AdUser 'zoe.z' 'Z' '300'), (AdUser 'anna.a' 'A' '+41 41 926 23 00'))
Pruefe 'Abgleich: Dublette gewinnt alphabetisch' 'anna.a' $t.Updates[0].Felder['Benutzer']
Pruefe 'Abgleich: Dublette gemeldet'             'True' ($t.Warnungen.Count -ge 1)
Pruefe 'Abgleich: Telefonnummer ergänzt'         '+41 41 926 23 00' $t.Updates[0].Felder['Telefonnummer']

# g) Zeile ohne Nummer wird gemeldet, doppelte Nummer in der Liste nur einmal abgeglichen
$t = Get-TelefonAbgleich @((TelZeile 1 '' '' 'Leer' '' '' ''), (TelZeile 2 '111' '' '' '' '' ''), (TelZeile 3 '111' '' '' '' '' '')) @((AdUser 'x.y' 'Y X' '111'))
Pruefe 'Abgleich: leere Zeile gemeldet'   'True' (($t.Warnungen -join ' ') -match 'ID 1')
Pruefe 'Abgleich: nur eine Zeile je Nummer' 1 $t.Updates.Count
Pruefe 'Abgleich: Nummer aus AD nicht neu' 0 $t.Neu.Count

# h) Unvollständige Nummer im AD (nur der Hausblock «+41 41 926 2»): keine Nummer, keine Dublette
$t = Get-TelefonAbgleich @() @((AdUser 'ana.andrade' 'A' '+41 41 926 2'), (AdUser 'arne.decker' 'D' '+41419262'))
Pruefe 'Unvollständig: nichts angelegt'      0 $t.Neu.Count
Pruefe 'Unvollständig: keine Dublette'       'False' (($t.Warnungen -join ' ') -match 'steht im AD bei')
Pruefe 'Unvollständig: gemeldet'             'True' (($t.Warnungen -join ' ') -match 'unvollständig')
Pruefe 'Kurzwahl im AD bleibt gültig'        1 (Get-TelefonAbgleich @() @((AdUser 'x.y' 'Y' '300'))).Neu.Count
# i) AD nicht vollständig gelesen: Benutzer wird nicht geleert
$t = Get-TelefonAbgleich @((TelZeile 1 '222' '+41 41 926 22 22' 'Egger Bernadette' 'Person' 'Aktiv' 'bernadette.egger')) @() -NichtLeeren
Pruefe 'NichtLeeren: kein Update'            0 $t.Updates.Count

# ---------------------------------------------------------------------------
Abschnitt 'Schemadateien'
$schemaC = @(Read-JsonDatei (Join-Path $TestDir 'schema-client.json'))
$schemaB = @(Read-JsonDatei (Join-Path $TestDir 'schema-benutzer.json'))
$schemaT = @(Read-JsonDatei (Join-Path $TestDir 'schema-telefon.json'))
$schemaS = @(Read-JsonDatei (Join-Path $TestDir 'schema-software.json'))
Pruefe 'Client-Schema: 8 manuelle Spalten' 8 (@($schemaC | Where-Object { $_.source -eq 'manuell' }).Count)
Pruefe 'Client-Schema: InDomaene ist Boolean' 'Boolean' (@($schemaC | Where-Object { $_.internal -eq 'InDomaene' })[0].type)
Pruefe 'Client-Schema: InDomaene hat Vorgabe Ja' '1' (@($schemaC | Where-Object { $_.internal -eq 'InDomaene' })[0].default)
Pruefe 'Client-Schema: 79 SCCM-Spalten'   79 (@($schemaC | Where-Object { $_.source -eq 'sccm' }).Count)
Pruefe 'Benutzer-Schema: 14 Spalten'        14 $schemaB.Count
Pruefe 'Telefon-Schema: 11 Spalten'         11 $schemaT.Count
Pruefe 'Telefon-Schema: 2 AD-Spalten'       2 (@($schemaT | Where-Object { $_.source -eq 'ad' }).Count)
Pruefe 'Telefon-Schema: Verlauf ist Note'   'Note' (@($schemaT | Where-Object { $_.internal -eq 'Verlauf' })[0].type)
Pruefe 'Telefon-Schema: Titel heisst Kurzwahl' 'Kurzwahl' (@($schemaT | Where-Object { $_.internal -eq 'Title' })[0].display)
Pruefe 'Client-Schema: Status vorhanden'  'Text' (@($schemaC | Where-Object { $_.internal -eq 'Status' })[0].type)
Pruefe 'Client-Schema: Verlauf ist Note'  'Note' (@($schemaC | Where-Object { $_.internal -eq 'Verlauf' })[0].type)
Pruefe 'Benutzer-Schema: Verlauf ist Note'  'Note' (@($schemaB | Where-Object { $_.internal -eq 'Verlauf' })[0].type)
Pruefe 'Software-Schema: 6 Spalten'          6 $schemaS.Count
Pruefe 'Software-Schema: Titel heisst Programm-ID' 'Programm-ID' (@($schemaS | Where-Object { $_.internal -eq 'Title' })[0].display)
Pruefe 'Software-Schema: AdGruppen ist Note' 'Note' (@($schemaS | Where-Object { $_.internal -eq 'AdGruppen' })[0].type)
Pruefe 'Benutzer-Schema: keine Spalte Computer mehr' 0 (@($schemaB | Where-Object { $_.internal -eq 'Computer' }).Count)
Pruefe 'Benutzer-Schema: AdminClientId ist Number' 'Number' (@($schemaB | Where-Object { $_.internal -eq 'AdminClientId' })[0].type)
Pruefe 'Benutzer-Schema: AdminClientId von Hand' 'manuell' (@($schemaB | Where-Object { $_.internal -eq 'AdminClientId' })[0].source)
# Ergaenze-Spalten erkennt Spalten auch am Anzeigenamen: der neue darf nicht der alte sein.
Pruefe 'Benutzer-Schema: AdminClientId nicht «ADMIN-Client»' 'True' ((@($schemaB | Where-Object { $_.internal -eq 'AdminClientId' })[0].display) -ne 'ADMIN-Client')

# ---------------------------------------------------------------------------
Abschnitt 'Aufteilung ADMIN-Clients / EDU-Clients'
Pruefe 'EDU-Name -> edu'              'edu'   (Get-ClientListe 'EDU-101')
Pruefe 'Kleinschreibung zaehlt auch'  'edu'   (Get-ClientListe 'edu-101')
Pruefe 'EDU ohne Trennzeichen'        'edu'   (Get-ClientListe 'EDUPC1')
Pruefe 'CAMPUS-Name -> admin'         'admin' (Get-ClientListe 'CAMPUS-073')
Pruefe 'EDU nur am Anfang'            'admin' (Get-ClientListe 'PC-EDU-1')
Pruefe 'Leerer Name -> admin'         'admin' (Get-ClientListe '')
Pruefe 'Titel admin'  'ADMIN-Clients' (Get-ClientListenTitel 'admin')
Pruefe 'Titel edu'    'EDU-Clients'   (Get-ClientListenTitel 'edu')

# ---------------------------------------------------------------------------
Abschnitt 'Liste «Software» -> Programme'
$swZeile = [pscustomobject]@{ Title = 'AdobeCS'; Name = 'Adobe Creative Suite'; Kategorie = 'Zusatz-Software'
    AdGruppen = "MgmtS_MarKom`r`n`r`n BLD_D&G "; Reihenfolge = 30 }
$swProg = ConvertTo-Programm $swZeile
Pruefe 'Software: Id'          'AdobeCS'              $swProg.id
Pruefe 'Software: Name'        'Adobe Creative Suite' $swProg.name
Pruefe 'Software: Kategorie'   'Zusatz-Software'      $swProg.kategorie
Pruefe 'Software: 2 AD-Gruppen' 2                     @($swProg.adGruppen).Count
Pruefe 'Software: Gruppe getrimmt' 'BLD_D&G'          $swProg.adGruppen[1]
Pruefe 'Software: Reihenfolge' 30                     $swProg.reihenfolge
$swLeer = ConvertTo-Programm ([pscustomobject]@{ Title = ' '; Name = 'X' })
Pruefe 'Software: Zeile ohne Id faellt weg' '<null>' $(if ($null -eq $swLeer) { '<null>' } else { 'da' })
$swOhne = ConvertTo-Programm ([pscustomobject]@{ Title = 'NurId' })
Pruefe 'Software: Name faellt auf Id zurueck' 'NurId'     $swOhne.name
Pruefe 'Software: Kategorie faellt auf Programme zurueck' 'Programme' $swOhne.kategorie
Pruefe 'Software: keine Gruppen'  0 @($swOhne.adGruppen).Count
$swSort = @(Sort-Programme @($swOhne, $swProg))
Pruefe 'Software: Reihenfolge sortiert' 'AdobeCS' $swSort[0].id
Pruefe 'Programm-Id gueltig'      'True'  (Test-ProgrammId 'Microsoft365').ToString()
Pruefe 'Programm-Id mit Zeichen'  'False' (Test-ProgrammId 'Adobe CS').ToString()
Pruefe 'Programm-Id mit Ziffer vorn' 'False' (Test-ProgrammId '365Office').ToString()
Pruefe 'Programm-Id zu lang'      'False' (Test-ProgrammId ('A' * 31)).ToString()
Pruefe 'Programm-Id leer'         'False' (Test-ProgrammId '').ToString()

# ---------------------------------------------------------------------------
Abschnitt 'Fehlende Spalten'
$spaltenDa = @{ Title = 1; Status = 1; SCCM_Found = 1 }
$gef = Select-VorhandeneFelder $spaltenDa ([ordered]@{ Title = 'PC-1'; Status = 'Aktiv'; Verlauf = '[]'; SCCM_Found = 'Ja' })
Pruefe 'Filter: drei Felder bleiben'      3      $gef.Count
Pruefe 'Filter: Verlauf fällt weg'        'False' ($gef.Contains('Verlauf'))
Pruefe 'Filter: Status bleibt'            'Aktiv' $gef['Status']
Pruefe 'Filter: Title bleibt immer'       'PC-1'  ((Select-VorhandeneFelder @{} ([ordered]@{ Title = 'PC-1'; Status = 'Aktiv' }))['Title'])
Pruefe 'Filter: nur Title übrig'          1      (Select-VorhandeneFelder @{} ([ordered]@{ Title = 'PC-1'; Status = 'Aktiv' })).Count
Pruefe 'Filter: leere Felder'             0      (Select-VorhandeneFelder $spaltenDa ([ordered]@{})).Count
Pruefe 'Filter: null Felder'              0      (Select-VorhandeneFelder $spaltenDa $null).Count
Pruefe 'Hinweis bei 403'                  'True' ((Get-SpaltenHinweis 'Graph POST … fehlgeschlagen: (403) Forbidden.') -match 'DeviceCode').ToString()
Pruefe 'Hinweis bei accessDenied'         'True' ((Get-SpaltenHinweis '{"error":{"code":"accessDenied"}}') -ne '').ToString()
Pruefe 'Kein Hinweis bei 400'             ''     (Get-SpaltenHinweis 'Graph PATCH … (400) Bad Request.')
Pruefe 'Kein Hinweis bei leerem Fehler'   ''     (Get-SpaltenHinweis $null)

# ---------------------------------------------------------------------------
Abschnitt 'Migration «Früherer Eintrag» -> Verlauf'
$migZeit = [datetime]'2026-09-07T10:00:00Z'
$migLeer = Get-FruehererEintragMigration -Verlauf '' -Wert '' -Zeitpunkt $migZeit
Pruefe 'Migration ohne Wert: überspringen'   'ueberspringen' $migLeer.Aktion
$migNeu = Get-FruehererEintragMigration -Verlauf '' -Wert ' Muster Hans ' -Zeitpunkt $migZeit
Pruefe 'Migration neuer Eintrag: anhängen'   'anhaengen' $migNeu.Aktion
$migEintraege = @(ConvertFrom-Verlauf $migNeu.Verlauf)
Pruefe 'Migration: ein Eintrag im Verlauf'   1 $migEintraege.Count
Pruefe 'Migration: Text'                     'Früherer Eintrag: Muster Hans (aus der alten Telefonliste S4B übernommen)' $migEintraege[0].text
Pruefe 'Migration: Datum = Stand alte Liste' '2026-07-31' $migEintraege[0].datum
Pruefe 'Migration: Quelle sync'              'sync' $migEintraege[0].quelle
$migBestehend = '[{"id":"x","datum":"2026-09-04","text":"Aus der Telefonliste S4B importiert","quelle":"sync","erstellt":"2026-09-04T10:00:00Z"}]'
$migZwei = Get-FruehererEintragMigration -Verlauf $migBestehend -Wert 'Muster Hans' -Zeitpunkt $migZeit
Pruefe 'Migration: bestehende Einträge bleiben' 2 (@(ConvertFrom-Verlauf $migZwei.Verlauf)).Count
Pruefe 'Migration: alter Eintrag unverändert'  'Aus der Telefonliste S4B importiert' (@(ConvertFrom-Verlauf $migZwei.Verlauf))[0].text
$migNochmal = Get-FruehererEintragMigration -Verlauf $migZwei.Verlauf -Wert 'Muster Hans' -Zeitpunkt $migZeit
Pruefe 'Migration idempotent: nur leeren'    'leeren' $migNochmal.Aktion
$migFehler = $false
try { [void](Get-FruehererEintragMigration -Verlauf 'kaputt {' -Wert 'X' -Zeitpunkt $migZeit) } catch { $migFehler = $true }
Pruefe 'Migration: unlesbarer Verlauf wirft'  'True' $migFehler

# ---------------------------------------------------------------------------
Abschnitt 'Inhaberschaft: PC-Name -> Listen-ID (Migriere-Inhaberschaft)'
Pruefe 'GeraetId: Zahl'          '17' (Get-GeraetIdText 17)
Pruefe 'GeraetId: Kommazahl'     '17' (Get-GeraetIdText 17.0)
Pruefe 'GeraetId: Text'          '17' (Get-GeraetIdText ' 17 ')
Pruefe 'GeraetId: Text mit ,0'   '17' (Get-GeraetIdText '17,0')
Pruefe 'GeraetId: leer'          ''   (Get-GeraetIdText '')
Pruefe 'GeraetId: null'          ''   (Get-GeraetIdText $null)
Pruefe 'GeraetId: 0'             ''   (Get-GeraetIdText 0)
Pruefe 'GeraetId: Name'          ''   (Get-GeraetIdText 'CAMPUS-073')
function InhClient($id, $titel, $status) { [pscustomobject]@{ Id = $id; Title = $titel; Status = $status } }
function InhBenutzer($id, $login, $pc, $gid) { [pscustomobject]@{ Id = $id; Title = $login; Computer = $pc; AdminClientId = $gid } }
$mClients = @((InhClient '12' 'CAMPUS-073' 'Archiviert'), (InhClient '40' 'CAMPUS-073' 'Aktiv'), (InhClient '5' 'CAMPUS-001' ''), (InhClient '7' 'CAMPUS-009' 'Archiviert'))
$mPlan = @(Get-InhaberMigration @(
        (InhBenutzer '1' 'a' 'CAMPUS-001' $null),
        (InhBenutzer '2' 'b' 'campus-073' $null),
        (InhBenutzer '3' 'c' 'CAMPUS-009' $null),
        (InhBenutzer '4' 'd' 'CAMPUS-999' $null),
        (InhBenutzer '5' 'e' 'CAMPUS-001' 5),
        (InhBenutzer '6' 'f' 'CAMPUS-001' 40),
        (InhBenutzer '7' 'g' '' 12),
        (InhBenutzer '8' 'h' '' $null)) $mClients)
function InhPlan($id) { @($mPlan | Where-Object { $_.BenutzerId -eq $id })[0] }
Pruefe 'Migration: nur Personen mit Gerät'        7 $mPlan.Count
Pruefe 'Migration: eindeutiger Name -> setzen'    'setzen' (InhPlan '1').Aktion
Pruefe 'Migration: eindeutiger Name -> ID'        '5' (InhPlan '1').ClientId
Pruefe 'Migration: Gross/Klein egal'              'setzen' (InhPlan '2').Aktion
Pruefe 'Migration: gleichnamig -> nicht archiviert' '40' (InhPlan '2').ClientId
Pruefe 'Migration: gleichnamig gemeldet'          'True' (InhPlan '2').Mehrdeutig
Pruefe 'Migration: nur archiviert -> trotzdem'    '7' (InhPlan '3').ClientId
Pruefe 'Migration: unbekannter Name'              'unbekannt' (InhPlan '4').Aktion
Pruefe 'Migration: unbekannt ohne ID'             '' (InhPlan '4').ClientId
Pruefe 'Migration: schon umgestellt'              'fertig' (InhPlan '5').Aktion
Pruefe 'Migration: andere ID -> Konflikt'         'konflikt' (InhPlan '6').Aktion
Pruefe 'Migration: nur ID, kein Name'             'fertig' (InhPlan '7').Aktion

# ---------------------------------------------------------------------------
Abschnitt 'Betrieb: Graph-Wiederholung, Zertifikat, Status, Log'
$w = Get-GraphWiederholung -Status 401 -Methode 'GET' -Versuch 1
Pruefe '401: neu anmelden'                 'True'  $w.NeuAnmelden
Pruefe '401: wiederholen'                  'True'  $w.Wiederholen
Pruefe '401 zweimal: aufgeben'             'False' (Get-GraphWiederholung -Status 401 -Methode 'GET' -Versuch 2 -SchonNeuAngemeldet $true).Wiederholen
Pruefe '429 POST: wiederholen'             'True'  (Get-GraphWiederholung -Status 429 -Methode 'POST').Wiederholen
Pruefe '429: Retry-After befolgt'          7       (Get-GraphWiederholung -Status 429 -Methode 'GET' -RetryAfter '7').Warten
Pruefe '429: Retry-After höchstens 120 s'  120     (Get-GraphWiederholung -Status 429 -Methode 'GET' -RetryAfter '999').Warten
Pruefe '503 POST: wiederholen'             'True'  (Get-GraphWiederholung -Status 503 -Methode 'POST').Wiederholen
Pruefe '500 GET: wiederholen'              'True'  (Get-GraphWiederholung -Status 500 -Methode 'GET').Wiederholen
Pruefe '502 PATCH: wiederholen'            'True'  (Get-GraphWiederholung -Status 502 -Methode 'PATCH').Wiederholen
Pruefe '500 POST: nicht (Dublette)'        'False' (Get-GraphWiederholung -Status 500 -Methode 'POST').Wiederholen
Pruefe 'Netzfehler PATCH: wiederholen'     'True'  (Get-GraphWiederholung -Status $null -Methode 'PATCH').Wiederholen
Pruefe 'Netzfehler POST: nicht'            'False' (Get-GraphWiederholung -Status $null -Methode 'POST').Wiederholen
Pruefe '404: nicht wiederholen'            'False' (Get-GraphWiederholung -Status 404 -Methode 'GET').Wiederholen
Pruefe '400: nicht wiederholen'            'False' (Get-GraphWiederholung -Status 400 -Methode 'PATCH').Wiederholen
Pruefe 'Wartezeit wächst (Versuch 3)'      20      (Get-GraphWiederholung -Status 503 -Methode 'GET' -Versuch 3).Warten

# Invoke-Graph mit nachgebautem Invoke-RestMethod: erst 503, dann Erfolg; 401 holt ein neues Token.
function Neuer-HttpFehler([int]$Status) {
    $ex = New-Object System.Exception "HTTP $Status (Test)"
    Add-Member -InputObject $ex -NotePropertyName Response -NotePropertyValue ([pscustomobject]@{ StatusCode = $Status; Headers = @{ 'Retry-After' = '1' } })
    return $ex
}
$script:IrmAntworten = New-Object System.Collections.ArrayList
$script:IrmAufrufe = 0
function Invoke-RestMethod {
    $script:IrmAufrufe++
    $naechste = $script:IrmAntworten[0]; $script:IrmAntworten.RemoveAt(0)
    if ($naechste -is [int]) { throw (Neuer-HttpFehler $naechste) }
    return $naechste
}
$script:TokenAbrufe = 0
Set-GraphTokenProvider { $script:TokenAbrufe++; "token-$($script:TokenAbrufe)" }
[void]$script:IrmAntworten.Add(503); [void]$script:IrmAntworten.Add([pscustomobject]@{ ok = 1 })
$r = Invoke-Graph -Uri '/test'
Pruefe 'Invoke-Graph: 503 dann Erfolg'      1 $r.ok
Pruefe 'Invoke-Graph: zwei Aufrufe'         2 $script:IrmAufrufe
$script:IrmAufrufe = 0; $script:IrmAntworten.Clear()
[void]$script:IrmAntworten.Add(401); [void]$script:IrmAntworten.Add([pscustomobject]@{ ok = 2 })
$vorher = $script:TokenAbrufe
$r = Invoke-Graph -Uri '/test'
Pruefe 'Invoke-Graph: 401 dann Erfolg'      2 $r.ok
Pruefe 'Invoke-Graph: Token neu geholt'     1 ($script:TokenAbrufe - $vorher)
$script:IrmAufrufe = 0; $script:IrmAntworten.Clear()
[void]$script:IrmAntworten.Add(500); [void]$script:IrmAntworten.Add([pscustomobject]@{ ok = 3 })
$postFehler = $false
try { [void](Invoke-Graph -Method POST -Uri '/test' -Body @{ a = 1 }) } catch { $postFehler = $true }
Pruefe 'Invoke-Graph: POST 500 wirft'       'True' $postFehler
Pruefe 'Invoke-Graph: POST nur ein Aufruf'  1 $script:IrmAufrufe
Remove-Item function:Invoke-RestMethod

Pruefe 'Zertifikat: lange gültig'          ''     (Get-ZertifikatHinweis -GueltigBis ([datetime]'2031-09-02') -Heute ([datetime]'2026-10-13'))
Pruefe 'Zertifikat: bald fällig'           'True' ((Get-ZertifikatHinweis -GueltigBis ([datetime]'2026-11-12') -Heute ([datetime]'2026-10-13')) -match 'in 30 Tagen')
Pruefe 'Zertifikat: abgelaufen'            'True' ((Get-ZertifikatHinweis -GueltigBis ([datetime]'2026-10-01') -Heute ([datetime]'2026-10-13')) -match 'abgelaufen')

Pruefe 'Kurztext: OK'                      'OK'              (Get-SyncStatusKurztext -Fehler 0 -Warnungen 0)
Pruefe 'Kurztext: eine Warnung'            'OK, 1 Warnung'   (Get-SyncStatusKurztext -Fehler 0 -Warnungen 1)
Pruefe 'Kurztext: Warnungen'               'OK, 3 Warnungen' (Get-SyncStatusKurztext -Fehler 0 -Warnungen 3)
Pruefe 'Kurztext: Fehler mit Meldung'      '2 Fehler: SCCM weg' (Get-SyncStatusKurztext -Fehler 2 -Warnungen 0 -Meldungen @('SCCM   weg', 'zweiter'))
Pruefe 'Kurztext: höchstens 255 Zeichen'   255 (Get-SyncStatusKurztext -Fehler 1 -Warnungen 0 -Meldungen @('x' * 400)).Length

# Log-Rotation in einem leeren Testordner
$logOrdner = Join-Path ([IO.Path]::GetTempPath()) ('inventar-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $logOrdner | Out-Null
$logDatei = Join-Path $logOrdner 'test.log'
Set-Content -Path $logDatei -Value ('x' * 2000) -Encoding ASCII
Pruefe 'Rotation: klein bleibt'            'False' (Invoke-LogRotation -Pfad $logDatei -MaxMB 1)
Pruefe 'Rotation: gross wird gerollt'      'True'  (Invoke-LogRotation -Pfad $logDatei -MaxMB 0.001 -Behalten 2)
Pruefe 'Rotation: .1 vorhanden'            'True'  (Test-Path "$logDatei.1")
Pruefe 'Rotation: Original weg'            'False' (Test-Path $logDatei)
Set-Content -Path $logDatei -Value ('y' * 2000) -Encoding ASCII
[void](Invoke-LogRotation -Pfad $logDatei -MaxMB 0.001 -Behalten 2)
Set-Content -Path $logDatei -Value ('z' * 2000) -Encoding ASCII
[void](Invoke-LogRotation -Pfad $logDatei -MaxMB 0.001 -Behalten 2)
Pruefe 'Rotation: höchstens 2 alte'        'False' (Test-Path "$logDatei.3")
Pruefe 'Rotation: jüngstes in .1'          'True'  ((Get-Content "$logDatei.1" -Raw) -match '^z')
Pruefe 'Rotation: älteres in .2'           'True'  ((Get-Content "$logDatei.2" -Raw) -match '^y')
Set-InventarLog $logDatei
Log 'eins' 'ERROR'; Log 'zwei' 'WARN'; Log 'drei'
$zl = Get-LogZaehler
Pruefe 'Log zählt Fehler'                  1 $zl.Fehler
Pruefe 'Log zählt Warnungen'               1 $zl.Warnungen
Pruefe 'Log merkt Fehlertext'              'eins' $zl.FehlerTexte[0]
Pruefe 'Log schreibt in die Datei'         3 @(Get-Content $logDatei).Count
Set-InventarLog $null
Remove-Item -LiteralPath $logOrdner -Recurse -Force

# ---------------------------------------------------------------------------
Abschnitt 'Syntaxprüfung aller Skripte'
foreach ($f in (Get-ChildItem -Path $TestDir -Filter '*.ps1' -Recurse | Sort-Object FullName)) {
    $kurz = $f.FullName.Substring($TestDir.Length).TrimStart('\', '/')
    $tokens = $null; $parseFehler = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$parseFehler)
    if ($parseFehler -and $parseFehler.Count -gt 0) {
        $script:Fehlgeschlagen++
        Write-Host ("  FAIL {0}: {1}" -f $kurz, ($parseFehler[0].Message)) -ForegroundColor Red
    } else {
        $script:Ok++
        Write-Host ("  OK   {0}" -f $kurz)
    }
}

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host ("Ergebnis: {0} bestanden, {1} fehlgeschlagen" -f $script:Ok, $script:Fehlgeschlagen) -ForegroundColor $(if ($script:Fehlgeschlagen) { 'Red' } else { 'Green' })
if ($script:Fehlgeschlagen) { exit 1 }
