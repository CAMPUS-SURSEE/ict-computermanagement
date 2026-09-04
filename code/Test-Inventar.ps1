<#
.SYNOPSIS
  Selbsttests der reinen Funktionen (ohne Pester, ohne Graph, ohne SCCM, ohne AD).

.DESCRIPTION
  Lädt die Funktionen der Skripte mit dem Muster $InventarNurFunktionen = $true (die Skripte kehren
  dann vor ihrem Hauptteil zurück) und prüft:
   - Geschäftsjahr-Helfer,
   - Programm-Delta des AD-Syncs,
   - Löschschutz (Benutzer) und Archivschutz (Computer),
   - Verlauf-Helfer (JSON-Array in der Spalte «Verlauf»),
   - Seriennummern-Normalisierung und Platzhalter-Erkennung,
   - Zuordnung SCCM-Gerät <-> Computer-Zeile (Seriennummer, Namensfallback, Umbenennung,
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
Abschnitt 'Zuordnung SCCM <-> Computer-Liste'
function Geraet($rid, $name, $sn, $akt) { [pscustomobject]@{ ResourceId = $rid; Name = $name; Seriennummer = $sn; Aktivitaet = $akt } }
function Zeile($id, $titel, $sccmSn, $sn, $status) { [pscustomobject]@{ Id = $id; Title = $titel; SCCM_SerialNumber = $sccmSn; Seriennummer = $sn; Status = $status } }

# a) Seriennummer schlägt Name
$p = Get-ComputerZuordnung @((Geraet 1 'PC-NEU' 'SN-A' '2026-09-01')) @((Zeile 10 'PC-ALT' 'SN-A' '' 'Aktiv'), (Zeile 11 'PC-NEU' '' '' 'Aktiv'))
Pruefe 'Treffer über Seriennummer'      '10' $p.Zuordnungen[0].ZeileId
Pruefe 'Grund Seriennummer'             'Seriennummer' $p.Zuordnungen[0].Grund
Pruefe 'Umbenennung erkannt'            'True' $p.Zuordnungen[0].Umbenennen
Pruefe 'Neuer Titel'                    'PC-NEU' $p.Zuordnungen[0].NeuerTitel
Pruefe 'Verlaufstext Umbenennung'       'Umbenannt von PC-ALT zu PC-NEU (SCCM)' $p.Zuordnungen[0].VerlaufTexte[0]
Pruefe 'Namenszeile bleibt unbelegt'    1 $p.Archivieren.Count
Pruefe 'Unbelegte Zeile wird archiviert' '11' $p.Archivieren[0].ZeileId
Pruefe 'Kein neues Gerät'               0 $p.Neu.Count

# b) Gleiche Seriennummer, gleicher Name: keine Umbenennung
$p = Get-ComputerZuordnung @((Geraet 1 'PC1' 'SN-A' '2026-09-01')) @((Zeile 10 'PC1' 'SN-A' '' 'Aktiv'))
Pruefe 'Keine Umbenennung bei gleichem Namen' 'False' $p.Zuordnungen[0].Umbenennen
Pruefe 'Status Aktiv bleibt'                  '' $p.Zuordnungen[0].StatusNeu

# c) Namensfallback nur gegen Zeilen ohne Seriennummer
$p = Get-ComputerZuordnung @((Geraet 1 'VM1' 'To be filled by O.E.M.' '2026-09-01')) @((Zeile 10 'VM1' '' '' ''), (Zeile 11 'VM1' 'SN-X' '' 'Aktiv'))
Pruefe 'Namensfallback trifft serienlose Zeile' '10' $p.Zuordnungen[0].ZeileId
Pruefe 'Grund Name'                             'Name' $p.Zuordnungen[0].Grund
Pruefe 'Leerer Status wird Aktiv'               'Aktiv' $p.Zuordnungen[0].StatusNeu
Pruefe 'Zeile mit fremder Serie archivieren'    '11' $p.Archivieren[0].ZeileId

# d) Archivierte Zeile wird nie über den Namen wiederverwendet
$p = Get-ComputerZuordnung @((Geraet 1 'PC9' '' '2026-09-01')) @((Zeile 10 'PC9' '' '' 'Archiviert'))
Pruefe 'Archivierte Zeile nicht über Namen'  0 $p.Zuordnungen.Count
Pruefe 'Stattdessen neu angelegt'            1 $p.Neu.Count
Pruefe 'Neu mit Status Aktiv'                'Aktiv' $p.Neu[0].Status
Pruefe 'Neu mit Verlaufstext'                'Aus SCCM neu angelegt' $p.Neu[0].Verlauf
Pruefe 'Archivierte Zeile bleibt liegen'     0 $p.Archivieren.Count

# e) Reaktivieren über die Seriennummer
$p = Get-ComputerZuordnung @((Geraet 1 'PC9' 'SN-B' '2026-09-01')) @((Zeile 10 'PC9' 'SN-B' '' 'Archiviert'))
Pruefe 'Archiviert -> Aktiv'          'Aktiv' $p.Zuordnungen[0].StatusNeu
Pruefe 'Verlaufstext Reaktivierung'   'Wieder in SCCM vorhanden, reaktiviert' $p.Zuordnungen[0].VerlaufTexte[0]

# f) Lager bleibt Lager, solange das Gerät in SCCM ist
$p = Get-ComputerZuordnung @((Geraet 1 'PC5' 'SN-C' '2026-09-01')) @((Zeile 10 'PC5' 'SN-C' '' 'Lager'))
Pruefe 'Lager bleibt unangetastet' '' $p.Zuordnungen[0].StatusNeu
# … ist es nicht mehr in SCCM, wird auch ein Lager-Gerät archiviert
$p = Get-ComputerZuordnung @((Geraet 1 'PC6' 'SN-D' '2026-09-01')) @((Zeile 10 'PC5' 'SN-C' '' 'Lager'))
Pruefe 'Lager ohne SCCM wird archiviert' '10' $p.Archivieren[0].ZeileId
Pruefe 'Verlaufstext Archivierung' 'In SCCM nicht mehr vorhanden, archiviert' $p.Archivieren[0].Verlauf

# g) Dublette in SCCM: jüngste Aktivität gewinnt
$p = Get-ComputerZuordnung @((Geraet 1 'PC-ALT' 'SN-E' '2025-01-01'), (Geraet 2 'PC-NEU' 'SN-E' '2026-09-01')) @((Zeile 10 'PC-ALT' 'SN-E' '' 'Aktiv'))
Pruefe 'Dublette: jüngstes Gerät gewinnt' '2' $p.Zuordnungen[0].Geraet.ResourceId
Pruefe 'Dublette wird gemeldet'           'True' ($p.Warnungen.Count -ge 1)
Pruefe 'Dublette: keine neue Zeile'       0 $p.Neu.Count

# h) Mehrere Zeilen und Geräte mit demselben Namen
$p = Get-ComputerZuordnung @((Geraet 1 'PC7' '' '2026-09-01'), (Geraet 2 'PC7' '' '2024-01-01')) @((Zeile 10 'PC7' '' '' 'Aktiv'), (Zeile 11 'PC7' '' '' 'Aktiv'))
Pruefe 'Doppelter Name: beide zugeordnet' 2 $p.Zuordnungen.Count
Pruefe 'Doppelter Name: nichts archiviert' 0 $p.Archivieren.Count
Pruefe 'Doppelter Name: nichts neu'        0 $p.Neu.Count
$zuJung = @($p.Zuordnungen | Where-Object { $_.ZeileId -eq '10' })[0]
Pruefe 'Jüngstes Gerät zuerst' '1' $zuJung.Geraet.ResourceId

# i) Eine manuelle Spalte «Seriennummer» gibt es nicht mehr – ein solcher Wert zählt nicht.
$p = Get-ComputerZuordnung @((Geraet 1 'PC8' 'SN-F' '2026-09-01')) @((Zeile 10 'ALT8' '' 'sn-f' 'Aktiv'))
Pruefe 'Manuelle Seriennummer zählt nicht'  0 $p.Zuordnungen.Count
Pruefe 'Gerät wird neu angelegt'           1 $p.Neu.Count

# j) Leere Zeile (weder Titel noch Seriennummer) wird ignoriert
$p = Get-ComputerZuordnung @((Geraet 1 'PC1' 'SN-A' '2026-09-01')) @((Zeile 10 'PC1' 'SN-A' '' 'Aktiv'), (Zeile 11 '' '' '' ''))
Pruefe 'Leere Zeile wird ignoriert' 0 $p.Archivieren.Count

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
Abschnitt 'Schema- und Programmdateien'
$schemaC = @(Read-JsonDatei (Join-Path $TestDir 'schema-computer.json'))
$schemaB = @(Read-JsonDatei (Join-Path $TestDir 'schema-benutzer.json'))
$schemaT = @(Read-JsonDatei (Join-Path $TestDir 'schema-telefon.json'))
$prg = Read-JsonDatei (Join-Path $ServerDir 'programme.json')
Pruefe 'Computer-Schema: 7 manuelle Spalten' 7 (@($schemaC | Where-Object { $_.source -eq 'manuell' }).Count)
Pruefe 'Computer-Schema: 79 SCCM-Spalten'   79 (@($schemaC | Where-Object { $_.source -eq 'sccm' }).Count)
Pruefe 'Benutzer-Schema: 14 Spalten'        14 $schemaB.Count
Pruefe 'Telefon-Schema: 12 Spalten'         12 $schemaT.Count
Pruefe 'Telefon-Schema: 2 AD-Spalten'       2 (@($schemaT | Where-Object { $_.source -eq 'ad' }).Count)
Pruefe 'Telefon-Schema: Verlauf ist Note'   'Note' (@($schemaT | Where-Object { $_.internal -eq 'Verlauf' })[0].type)
Pruefe 'Telefon-Schema: Titel heisst Kurzwahl' 'Kurzwahl' (@($schemaT | Where-Object { $_.internal -eq 'Title' })[0].display)
Pruefe 'Computer-Schema: Status vorhanden'  'Text' (@($schemaC | Where-Object { $_.internal -eq 'Status' })[0].type)
Pruefe 'Computer-Schema: Verlauf ist Note'  'Note' (@($schemaC | Where-Object { $_.internal -eq 'Verlauf' })[0].type)
Pruefe 'Benutzer-Schema: Verlauf ist Note'  'Note' (@($schemaB | Where-Object { $_.internal -eq 'Verlauf' })[0].type)
Pruefe 'programme.json: 71 Programme'       71 @($prg.programme).Count
Pruefe 'programme.json: 6 Kategorien'        6 @($prg.kategorien).Count
$ids = @($prg.programme | ForEach-Object { $_.id })
Pruefe 'Programm-Ids eindeutig' $ids.Count (@($ids | Sort-Object -Unique).Count)
$zuLang = @($ids | Where-Object { $_.Length -gt 30 })
Pruefe 'Programm-Ids max. 30 Zeichen' 0 $zuLang.Count

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
