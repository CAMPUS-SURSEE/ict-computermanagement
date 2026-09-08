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
. (Join-Path $TestDir 'Abgleich-Excel.ps1')

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
Pruefe 'Benutzer-Schema: Computer heisst ADMIN-Client' 'ADMIN-Client' (@($schemaB | Where-Object { $_.internal -eq 'Computer' })[0].display)

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
Abschnitt 'Abgleich Excel -> SharePoint'

# Zellbezug und Zahlenformat der .xlsx
Pruefe 'Spaltenindex A'   1  (ConvertTo-SpaltenIndex 'A1')
Pruefe 'Spaltenindex Z'   26 (ConvertTo-SpaltenIndex 'Z9')
Pruefe 'Spaltenindex AA'  27 (ConvertTo-SpaltenIndex 'AA12')
Pruefe 'Spaltenindex DH' 112 (ConvertTo-SpaltenIndex 'DH474')
Pruefe 'Zahl 17.1 ohne Rattenschwanz' '17.1' (Format-XlsxZahl '17.100000000000001')
Pruefe 'Zahl bleibt ganzzahlig'       '373'  (Format-XlsxZahl '373')
Pruefe 'Text bleibt Text'             '17.3' (Format-XlsxZahl '17.3')
Pruefe 'Nichtzahl bleibt unverändert' 'EDU-1' (Format-XlsxZahl 'EDU-1')

# Arbeitsplatz ohne eigenes Gerät
Pruefe 'Kein PC ist kein Gerät'        'False' (Test-EigenesGeraet 'Kein PC')
Pruefe 'kein pc ist kein Gerät'        'False' (Test-EigenesGeraet 'kein pc')
Pruefe 'Shared ist kein eigenes Gerät' 'False' (Test-EigenesGeraet 'Shared CAMPUS-070')
Pruefe 'Leer ist kein Gerät'           'False' (Test-EigenesGeraet '')
Pruefe 'CAMPUS-001 ist ein Gerät'      'True'  (Test-EigenesGeraet 'CAMPUS-001')

# Gerätename und Standort im EDU-Blatt
Pruefe 'Name ohne Standort'       'EDU-155-01'  (Split-GeraeteName 'EDU-155-01').Name
Pruefe 'Standort leer'            ''            (Split-GeraeteName 'EDU-155-01').Standort
Pruefe 'Name vor Leerzeichen'     'EDULAP-031'  (Split-GeraeteName 'EDULAP-031 Konferenzsaal 1').Name
Pruefe 'Standort nach Leerzeichen' 'Konferenzsaal 1' (Split-GeraeteName 'EDULAP-031 Konferenzsaal 1').Standort
Pruefe 'Bindestrich fällt weg'    'Halle 23 - Schmidlin' (Split-GeraeteName 'EDULAP-107 - Halle 23 - Schmidlin').Standort
Pruefe 'Name bei Bindestrich'     'EDULAP-107'  (Split-GeraeteName 'EDULAP-107 - Halle 23 - Schmidlin').Name

# Beschaffungsjahr und Ersatz aus den Kreuzen
Pruefe 'Jüngstes Jahr zählt'  '2025/2026' (Get-BeschaffungsjahrAusKreuzen @('2019/2020', '2025/2026') '2026/2027')
Pruefe 'Budgetjahr zählt nicht' '2021/2022' (Get-BeschaffungsjahrAusKreuzen @('2021/2022', '2026/2027') '2026/2027')
Pruefe 'Ohne Kreuz kein Jahr'  ''          (Get-BeschaffungsjahrAusKreuzen @() '2026/2027')
Pruefe 'Ersatz = Beschaffung + 5' '2026/2027' (Get-ErsatzGeplant '2021/2022' $false '2026/2027')
Pruefe 'Ersatz schlägt Budget'    '2030/2031' (Get-ErsatzGeplant '2025/2026' $true '2026/2027')
Pruefe 'Budget ohne Beschaffung'  '2026/2027' (Get-ErsatzGeplant '' $true '2026/2027')
Pruefe 'Weder noch'               ''          (Get-ErsatzGeplant '' $false '2026/2027')

# Programmstufen: die Excel gilt, eine vom AD gesetzte 2 bleibt
Pruefe 'Kreuz auf leer -> 1'   '1'   (Get-ProgrammstufeNeu $true '')
Pruefe 'Kreuz auf 0 -> 1'      '1'   (Get-ProgrammstufeNeu $true '0')
Pruefe 'Kreuz auf 1 -> nichts' ''    ([string](Get-ProgrammstufeNeu $true '1'))
Pruefe 'Kreuz auf 2 -> nichts' ''    ([string](Get-ProgrammstufeNeu $true '2'))
Pruefe 'Leer auf 1 -> 0'       '0'   (Get-ProgrammstufeNeu $false '1')
Pruefe 'Leer auf 2 -> nichts'  ''    ([string](Get-ProgrammstufeNeu $false '2'))
Pruefe 'Leer auf leer -> nichts' ''  ([string](Get-ProgrammstufeNeu $false ''))
Pruefe 'Leer auf 0 -> nichts'  ''    ([string](Get-ProgrammstufeNeu $false '0'))

# Dubletten im EDU-Blatt zusammenfassen
$mg = Merge-GeraeteZeilen @(
    [pscustomobject]@{ Title = 'EDULAP-147'; GebaeudeStock = 'Halle 23'; Seriennummer = ''; InDomaene = $false },
    [pscustomobject]@{ Title = 'edulap-147'; GebaeudeStock = ''; Seriennummer = 'SN-1'; InDomaene = $true },
    [pscustomobject]@{ Title = 'EDULAP-148'; GebaeudeStock = ''; Seriennummer = ''; InDomaene = $false }
) @('GebaeudeStock', 'Seriennummer')
Pruefe 'Dublette zusammengefasst'   2 @($mg.Geraete).Count
Pruefe 'Dublette gemeldet'          'edulap-147' ([string]@($mg.Doppelt)[0])
Pruefe 'Erster Wert gewinnt'        'Halle 23' @($mg.Geraete)[0].GebaeudeStock
Pruefe 'Leeres Feld wird aufgefüllt' 'SN-1'    @($mg.Geraete)[0].Seriennummer
Pruefe 'In Domäne einmal Ja reicht' 'True'     @($mg.Geraete)[0].InDomaene

# Login-Zuordnung: Leerzeichen, 20-Zeichen-Grenze des AD, Anzeigename
Pruefe 'Login ohne Leerzeichen' 'thameur.midassi' (Get-ExcelLoginSchluessel 'Thameur. Midassi')
$bLogin = @{ 'michael.roethlisberg' = 'A'; 'karina.fruman' = 'B' }
$bName = @{ 'fruman karina' = @('B'); 'doppelt name' = @('C', 'D') }
Pruefe 'Treffer über gekürzten Login' 'Gekürzt' (Find-BenutzerZeile $bLogin $bName 'Michael.Roethlisberger' 'Röthlisberger Michael').Weg
Pruefe 'Treffer über Anzeigename'  'Anzeigename' (Find-BenutzerZeile $bLogin $bName 'Karina.Frumann' 'Fruman Karina').Weg
Pruefe 'Mehrdeutiger Name zählt nicht' '' (Find-BenutzerZeile $bLogin $bName 'X.Y' 'Doppelt Name').Weg
Pruefe 'Kein Treffer'              ''  (Find-BenutzerZeile $bLogin $bName 'Nicht.Da' 'Da Nicht').Weg

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
