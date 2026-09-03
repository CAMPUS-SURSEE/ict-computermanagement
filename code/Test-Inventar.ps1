<#
.SYNOPSIS
  Selbsttests der reinen Funktionen (ohne Pester, ohne Graph, ohne SCCM, ohne AD).

.DESCRIPTION
  Lädt die Funktionen der Skripte mit dem Muster $InventarNurFunktionen = $true (die Skripte kehren
  dann vor ihrem Hauptteil zurück) und prüft:
   - Geschäftsjahr-Helfer,
   - Programm-Delta des AD-Syncs,
   - Löschschutz,
   - Syntax aller PowerShell-Skripte im Ordner (Parser).

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
$InventarNurFunktionen = $true
. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')
. (Join-Path $ScriptDir 'Sync-Inventar.ps1')

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
Abschnitt 'Schema- und Programmdateien'
$schemaC = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-computer.json'))
$schemaB = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-benutzer.json'))
$prg = Read-JsonDatei (Join-Path $ScriptDir 'programme.json')
Pruefe 'Computer-Schema: 6 manuelle Spalten' 6 (@($schemaC | Where-Object { $_.source -eq 'manuell' }).Count)
Pruefe 'Computer-Schema: 79 SCCM-Spalten'   79 (@($schemaC | Where-Object { $_.source -eq 'sccm' }).Count)
Pruefe 'Benutzer-Schema: 13 Spalten'        13 $schemaB.Count
Pruefe 'programme.json: 71 Programme'       71 @($prg.programme).Count
Pruefe 'programme.json: 6 Kategorien'        6 @($prg.kategorien).Count
$ids = @($prg.programme | ForEach-Object { $_.id })
Pruefe 'Programm-Ids eindeutig' $ids.Count (@($ids | Sort-Object -Unique).Count)
$zuLang = @($ids | Where-Object { $_.Length -gt 30 })
Pruefe 'Programm-Ids max. 30 Zeichen' 0 $zuLang.Count

# ---------------------------------------------------------------------------
Abschnitt 'Syntaxprüfung aller Skripte'
foreach ($f in (Get-ChildItem -Path $ScriptDir -Filter '*.ps1' | Sort-Object Name)) {
    $tokens = $null; $parseFehler = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$parseFehler)
    if ($parseFehler -and $parseFehler.Count -gt 0) {
        $script:Fehlgeschlagen++
        Write-Host ("  FAIL {0}: {1}" -f $f.Name, ($parseFehler[0].Message)) -ForegroundColor Red
    } else {
        $script:Ok++
        Write-Host ("  OK   {0}" -f $f.Name)
    }
}

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host ("Ergebnis: {0} bestanden, {1} fehlgeschlagen" -f $script:Ok, $script:Fehlgeschlagen) -ForegroundColor $(if ($script:Fehlgeschlagen) { 'Red' } else { 'Green' })
if ($script:Fehlgeschlagen) { exit 1 }
