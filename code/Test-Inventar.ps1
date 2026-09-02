<#
.SYNOPSIS
  Selbsttests der reinen Funktionen (ohne Pester, ohne Graph, ohne SCCM, ohne AD).

.DESCRIPTION
  Lädt die Funktionen der Skripte mit dem Muster $InventarNurFunktionen = $true (die Skripte kehren
  dann vor ihrem Hauptteil zurück) und prüft:
   - Geschäftsjahr-Helfer,
   - Migrationsmapping (Shared-Zeile, «Kein PC», Duplikat-Zusammenführung, Beschaffungsjahr, Budget),
   - Programm-Delta des AD-Syncs,
   - Löschschutz,
   - Vorschlagslogik,
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
. (Join-Path $ScriptDir 'Migrate-ToTwoLists.ps1')
. (Join-Path $ScriptDir 'Sync-Inventar.ps1')
. (Join-Path $ScriptDir 'Suggest-ProgrammGruppen.ps1')

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
Abschnitt 'Migrationsmapping'

$programmIds = @('Microsoft365', 'AdobePhotoshopCS6', 'Salto')
$spezialIds = @('AdobePhotoshopCS6', 'Salto')

$zeilen = @(
    [pscustomobject]@{
        Title = 'campus-001'; Login = 'mmuster'; Arbeitsplatz = 'Max Muster'; Firma = 'Campus Sursee'
        Seriennummer = 'SN-1'; GebaeudeStock = 'HG / 2. OG'; Bemerkung = 'Gerät A'
        J20232024 = $true; J20212022 = $true; Budget20262027 = $false
        Microsoft365 = $true; AdobePhotoshopCS6 = 'Hot_Reze'; Salto = ''
        SCCM_Name = 'CAMPUS-001'; SCCM_Found = 'Ja'
    },
    [pscustomobject]@{
        Title = 'Shared CAMPUS-001'; Login = 'zweit'; Arbeitsplatz = 'Zweit Person'; Firma = ''
        Seriennummer = ''; GebaeudeStock = ''; Bemerkung = ''
        Microsoft365 = $false; AdobePhotoshopCS6 = ''; Salto = 'Salto_User'
    },
    [pscustomobject]@{
        Title = 'Kein PC'; Login = 'ohnepc'; Arbeitsplatz = 'Ohne Gerät'; Firma = ''
        Microsoft365 = $true; AdobePhotoshopCS6 = ''; Salto = ''
    },
    [pscustomobject]@{
        Title = 'CAMPUS-001'; Login = 'mmuster'; Arbeitsplatz = ''; Firma = ''
        Seriennummer = ''; GebaeudeStock = 'HG / 3. OG'; Bemerkung = ''
        Microsoft365 = $false; AdobePhotoshopCS6 = ''; Salto = 'Salto_User'
    },
    [pscustomobject]@{
        Title = 'CAMPUS-002'; Login = ''; Arbeitsplatz = 'Leerzeile'; Firma = ''
        J20252026 = $true; Budget20262027 = $true
        Microsoft365 = $false; AdobePhotoshopCS6 = ''; Salto = ''
    }
)

$erg = Build-Migration -Zeilen $zeilen -ProgrammIds $programmIds -SpezialIds $spezialIds -SccmSpalten @('SCCM_Name', 'SCCM_Found')

Pruefe 'Computer-Zeilen (Shared und Kein PC übersprungen)' 2 $erg.Computer.Count
Pruefe 'Benutzer-Zeilen (Duplikat zusammengeführt)'        3 $erg.Benutzer.Count
Pruefe 'Zeilen ohne Login'                                 1 $erg.OhneLogin
Pruefe 'Duplikat Computer erkannt'                         1 $erg.DuplikateComputer
Pruefe 'Duplikat Benutzer erkannt'                         1 $erg.DuplikateBenutzer

$c1 = @($erg.Computer | Where-Object { $_.Title -eq 'CAMPUS-001' })[0]
Pruefe 'Computer Title in Grossbuchstaben' 'CAMPUS-001' $c1.Title
Pruefe 'Beschaffungsjahr neuestes Häkchen' '2023/2024'  $c1.Beschaffungsjahr
Pruefe 'ErsatzGeplant = Beschaffung + 5'   '2028/2029'  $c1.ErsatzGeplant
Pruefe 'Seriennummer übernommen'           'SN-1'       $c1.Seriennummer
Pruefe 'GebaeudeStock erste Zeile gewinnt' 'HG / 2. OG' $c1.GebaeudeStock
Pruefe 'SCCM-Spalte übernommen'            'CAMPUS-001' $c1.SCCM_Name

$c2 = @($erg.Computer | Where-Object { $_.Title -eq 'CAMPUS-002' })[0]
Pruefe 'Beschaffungsjahr 2025/2026' '2025/2026' $c2.Beschaffungsjahr
Pruefe 'Budget-Häkchen -> ErsatzGeplant 2026/2027' '2026/2027' $c2.ErsatzGeplant

$b1 = @($erg.Benutzer | Where-Object { $_.Title -eq 'mmuster' })[0]
Pruefe 'Benutzer Computer aus Titel'      'CAMPUS-001' $b1.Computer
Pruefe 'Benutzer Anzeigename aus Arbeitsplatz' 'Max Muster' $b1.Anzeigename
Pruefe 'Programm Boolean wahr -> 1'       '1' $b1.Microsoft365
Pruefe 'Spezial-Text gefüllt -> 1'        '1' $b1.AdobePhotoshopCS6
Pruefe 'Programme werden verodert'        '1' $b1.Salto

$b2 = @($erg.Benutzer | Where-Object { $_.Title -eq 'zweit' })[0]
Pruefe 'Shared-Zeile: Benutzer bekommt das Gerät' 'CAMPUS-001' $b2.Computer

$b3 = @($erg.Benutzer | Where-Object { $_.Title -eq 'ohnepc' })[0]
Pruefe 'Kein PC -> Computer leer' '' $b3.Computer

Pruefe 'AD-Gruppe aus Spezial-Spalte gesammelt (Photoshop)' 'Hot_Reze'   ($erg.AdGruppen['AdobePhotoshopCS6'] -join ',')
Pruefe 'AD-Gruppe aus Spezial-Spalte gesammelt (Salto)'     'Salto_User' ($erg.AdGruppen['Salto'] -join ',')
Pruefe 'ja/nein zählt nicht als Gruppe' 0 (@(Get-AdGruppenAusWert 'Ja').Count)
Pruefe 'leerer Wert zählt nicht'        0 (@(Get-AdGruppenAusWert '').Count)
Pruefe 'zwei Gruppen aus einem Feld'    2 (@(Get-AdGruppenAusWert 'A_Gruppe; B_Gruppe').Count)

Pruefe 'Get-ComputerNameAusTitel Shared' 'CAMPUS-007' (Get-ComputerNameAusTitel 'Shared campus-007')
Pruefe 'Get-ComputerNameAusTitel Kein PC' '' (Get-ComputerNameAusTitel 'Kein PC')

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
Abschnitt 'Vorschlagslogik'
Pruefe 'Normalisierung' 'adobephotoshopcs6' (Get-NameNormalisiert 'Adobe Photoshop CS6')
Pruefe 'Normalisierung Umlaut' 'woehler' (Get-NameNormalisiert 'Wöhler')
Pruefe 'Normalisierung Sonderzeichen' 'caddy2d' (Get-NameNormalisiert 'CADdy++ 2D')

$prog = [pscustomobject]@{ id = 'AdobePhotoshopCS6'; name = 'Adobe Photoshop CS6'; adGruppen = @(); vorschlaege = @() }
$gruppen = @('SW_AdobePhotoshopCS6', 'Hot_Reze', 'SW-Adobe-Photoshop-CS6', 'SW_Salto')
$v = Get-GruppenVorschlaege $prog $gruppen
Pruefe 'zwei passende Gruppen gefunden' 2 $v.Count
Pruefe 'Treffer 1' 'SW_AdobePhotoshopCS6' $v[0]

$kurz = [pscustomobject]@{ id = 'ABC'; name = 'ABC'; adGruppen = @(); vorschlaege = @() }
Pruefe 'zu kurzer Name -> keine Vorschläge' 0 (@(Get-GruppenVorschlaege $kurz $gruppen).Count)

$salto = [pscustomobject]@{ id = 'Salto'; name = 'Salto'; adGruppen = @(); vorschlaege = @() }
Pruefe 'Teiltreffer Salto' 'SW_Salto' ((Get-GruppenVorschlaege $salto $gruppen) -join ',')

# ---------------------------------------------------------------------------
Abschnitt 'Schema- und Programmdateien'
$schemaC = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-computer.json'))
$schemaB = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-benutzer.json'))
$prg = Read-JsonDatei (Join-Path $ScriptDir 'programme.json')
Pruefe 'Computer-Schema: 6 manuelle Spalten' 6 (@($schemaC | Where-Object { $_.source -eq 'manuell' }).Count)
Pruefe 'Computer-Schema: 79 SCCM-Spalten'   79 (@($schemaC | Where-Object { $_.source -eq 'sccm' }).Count)
Pruefe 'Benutzer-Schema: 13 Spalten'        13 $schemaB.Count
Pruefe 'programme.json: 80 Programme'       80 @($prg.programme).Count
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
