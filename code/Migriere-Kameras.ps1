<#
.SYNOPSIS
  Legt die Listen «Kameras» und «Kamera-Rollen» an und übernimmt den Bestand aus Milestone und
  der Excel «Zugriffsberechtigung Inventar Videokameras Milestone.xlsx» – einmalig.

.DESCRIPTION
  Bis Oktober 2026 führte die ICT das Kamera-Inventar und die Zugriffsrechte in einer Excel-Datei.
  Neu kommen Kameras und Rechte aus Milestone XProtect (Sync-Inventar.ps1, Phasen Kameras und
  Kamera-Rollen); die Liste ergänzt, was Milestone nicht kennt (Zuständig, Bewertung, Beschaffung,
  Bemerkung, Verlauf). Dieses Skript

    1. legt die beiden Listen auf der Site an, falls es sie noch nicht gibt, samt allen Spalten
       aus schema-kamera.json und schema-kamerarolle.json (fehlende Spalten werden ergänzt),
    2. liest die Hardware aus Milestone und legt je Hardware eine Zeile an – mit denselben
       Funktionen wie der Sync (Get-KameraZuordnung, ConvertTo-KameraFelder); vorhandene Zeilen
       bleiben stehen,
    3. ergänzt aus der Excel, was zur Hardware passt, aber nur in leere Felder:
         - Blatt «Inventar 2024.04»: Kamera-Nummer und Ort (über die IP-Adresse) als Verlaufseintrag,
         - Blätter «Bewertung 15.07.21» und «Inventar OLD»: Zuständig, Bildqualität, Positionierung,
           Verbesserungen, Bewertet am (über Raum und Bezeichnung, nur bei eindeutigem Treffer),
    4. schreibt ein Protokoll nach lokal\ mit allem, was nicht eindeutig zuzuordnen war.

  Die Blätter «Berechtigungen» übernimmt es nicht: die Rechte liest der Sync aus Milestone, das
  ist die führende Quelle. Kamera-Passwörter (Blatt «InventarORG») werden nie übernommen.

  Mit -WhatIf wird gelesen und geplant, aber nichts angelegt oder geschrieben – immer zuerst so.

.PARAMETER ExcelPfad
  Die Excel-Datei. Vorgabe: die Kopie im OneDrive unter «Microsoft Teams-Chatdateien».

.PARAMETER GraphTokenProvider
  Scriptblock, der ein Graph-Token liefert (etwa aus der AdminShell). Ohne ihn meldet sich das
  Skript per Device-Code an (Graph-Sitzung.ps1).

.PARAMETER MilestoneServer
  Management Server von Milestone, Vorgabe http://adminsrv347. Gelesen wird mit dem Windows-Konto,
  unter dem das Skript läuft (Leserecht auf die Hardware genügt).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Migriere-Kameras.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Migriere-Kameras.ps1

.NOTES
  Windows PowerShell 5.1 oder PowerShell 7. Braucht ein Konto mit Vollzugriff auf die Site (Listen
  und Spalten anlegen). Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [switch]$NeuAnmelden,
    [scriptblock]$GraphTokenProvider,
    [string]$ExcelPfad = (Join-Path $env:USERPROFILE 'OneDrive - CAMPUS SURSEE\Microsoft Teams-Chatdateien\Zugriffsberechtigung Inventar Videokameras Milestone.xlsx'),
    [string]$MilestoneServer = 'http://adminsrv347',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Reine Funktionen (testbar ohne Graph, Milestone und Excel)
# ---------------------------------------------------------------------------

function Get-XlsxText {
    <# Text eines <si>- bzw. <is>-Knotens der Excel-XML (einfacher Text oder Rich-Text-Läufe). #>
    param($Knoten)
    if ($null -eq $Knoten) { return '' }
    $t = $Knoten.t
    if ($t -is [string]) { return $t }
    if ($t -and $t.'#text') { return [string]$t.'#text' }
    $teile = foreach ($r in @($Knoten.r)) { if ($r.t -is [string]) { $r.t } elseif ($r.t) { $r.t.'#text' } }
    return (@($teile) -join '')
}

function Read-XlsxBlatt {
    <#
      Liest ein Blatt einer .xlsx-Datei ohne Excel und ohne Zusatzmodul. Rückgabe: je Zeile ein
      Hashtable Spaltenbuchstabe -> Text, dazu «_Zeile» mit der Zeilennummer.
    #>
    param([string]$Pfad, [string]$Blatt)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Pfad)
    try {
        $lies = {
            param($name)
            $e = $zip.GetEntry($name)
            if (-not $e) { return $null }
            $r = New-Object IO.StreamReader($e.Open(), [Text.Encoding]::UTF8)
            try { return $r.ReadToEnd() } finally { $r.Dispose() }
        }
        $wb = [xml](& $lies 'xl/workbook.xml')
        $rels = [xml](& $lies 'xl/_rels/workbook.xml.rels')
        $texte = New-Object System.Collections.ArrayList
        $sst = & $lies 'xl/sharedStrings.xml'
        if ($sst) { foreach ($si in ([xml]$sst).sst.si) { [void]$texte.Add((Get-XlsxText $si)) } }
        $eintrag = @($wb.workbook.sheets.sheet | Where-Object { $_.name -eq $Blatt })[0]
        if (-not $eintrag) { throw "Blatt «$Blatt» fehlt in $Pfad." }
        $ziel = [string](@($rels.Relationships.Relationship | Where-Object { $_.Id -eq $eintrag.id })[0].Target)
        $ziel = 'xl/' + ($ziel -replace '^/?xl/', '')
        $x = [xml](& $lies $ziel)
        $zeilen = New-Object System.Collections.ArrayList
        foreach ($row in @($x.worksheet.sheetData.row)) {
            $z = @{ _Zeile = [int]$row.r }
            foreach ($c in @($row.c)) {
                if (-not $c) { continue }
                $spalte = ([string]$c.r) -replace '\d', ''
                $wert = ''
                if ($c.t -eq 's') { $wert = [string]$texte[[int]$c.v] }
                elseif ($c.t -eq 'inlineStr') { $wert = Get-XlsxText $c.is }
                elseif ($null -ne $c.v) { $wert = [string]$c.v }
                $z[$spalte] = $wert.Trim()
            }
            [void]$zeilen.Add($z)
        }
        return @($zeilen.ToArray())
    } finally {
        $zip.Dispose()
    }
}

function Get-ExcelRaum {
    <#
      Raum aus der Excel vergleichbar machen. Excel speichert «10.210» als Zahl 10.210000000000001
      und «10.2» als 10.199999999999999: Zahlen werden auf drei Stellen gerundet («10.210»,
      «10.200»); Text («31.1.100.U102», «10 A03») bleibt, nur getrimmt und klein.
    #>
    param([string]$Raum)
    $r = ([string]$Raum).Trim()
    if ($r -match '^\d+[\.,]\d+$') {
        return ([double]($r -replace ',', '.')).ToString('0.000', [Globalization.CultureInfo]::InvariantCulture)
    }
    return $r.ToLowerInvariant()
}

function Get-ExcelGebaeude {
    <# Gebäude aus der Excel: «G17.3» -> 17, «10» -> 10, «G31» -> 31, «P3» -> P3, «Parkplatz» -> P. #>
    param([string]$Text)
    $t = ([string]$Text).Trim().ToUpperInvariant()
    if ($t -match '^G?(\d{1,3})') { return [string][int]$Matches[1] }
    if ($t -match '^(P\d+)') { return $Matches[1] }
    if ($t -like 'PARKPLATZ*') { return 'P' }
    return $t
}

function Test-GleichesGebaeude {
    <#
      Passt ein Gebäude aus der Excel zum Gebäude einer Kamera? Das Parkhaus P3 heisst in Milestone
      33 («33.A20 P3 Kasse A»); «P» (allgemein «Parkplatz») passt zu jedem Parkplatz.
    #>
    param([string]$Excel, [string]$Kamera)
    if ($Excel -eq '' -or $Kamera -eq '') { return $false }
    $norm = { param($g) if ($g -eq '33') { 'P3' } else { $g } }
    $e = & $norm $Excel; $k = & $norm $Kamera
    if ($e -eq $k) { return $true }
    $parken = @('P', 'P1', 'P3', 'P7')
    return (($e -eq 'P' -and $parken -contains $k) -or ($k -eq 'P' -and $parken -contains $e))
}

function Get-ExcelStock {
    <# Stock aus der Excel für die Unterscheidung im selben Gebäude: «17.100» / «G17.1» -> 17.1; sonst ''. #>
    param([string]$Text)
    $t = ([string]$Text).Trim().ToUpperInvariant() -replace '^G', ''
    if ($t -match '^(\d{1,3})[\.,](\d)') { return "$([int]$Matches[1]).$($Matches[2])" }
    return ''
}

function Test-OrtPasst {
    <# Enthält der Ort (oder die Bezeichnung) den Kameratext – oder umgekehrt («Ladestationen» / «Ladestation»)? #>
    param([string]$Ort, [string]$Kamera)
    $o = ([string]$Ort).Trim(); $k = ([string]$Kamera).Trim()
    if ($o -eq '' -or $k -eq '') { return $false }
    if ($o -like "*$k*") { return $true }
    $kern = ($o -replace '^G?\d{1,3}(\.\d+)*\s+', '').Trim()
    return ($kern.Length -ge 5 -and $k -like "*$kern*")
}

function Get-KameraExcelPlan {
    <#
      Ordnet die Zeilen der Excel der Hardware aus Milestone zu. Reine Funktion.

      $Geraete    Hardware (HardwareId, Adresse, Name, Gebaeude)
      $Inventar   Blatt «Inventar 2024.04»: A Kamera-Nr, B Gebäude, C Bezeichnung, D Ort, K IP
      $Alt        Blatt «Inventar OLD»: A Kamera-Nr, B Gebäude, C Raum, D Kamera, J Zuständig
      $Bewertung  Blatt «Bewertung 15.07.21»: A Gebäude, B Raum, C Kamera, D Zuständig,
                  E Qualität, F Positionierung, G Bemerkungen, H Verbesserungen durchgeführt

      Weg einer Bewertungszeile zur Hardware:
        1. Raum = Bezeichnung im Inventar 2024 (Sportarena: «31.1.100.U102») -> IP -> Hardware
        2. Raum und Kamera wie im Inventar OLD -> Kamera-Nr -> Inventar 2024 -> IP -> Hardware
        3. sonst: genau eine Zeile im Inventar 2024 im selben Gebäude, deren Ort oder Bezeichnung
           den Kameratext enthält -> IP -> Hardware
        4. sonst: genau eine Hardware im selben Gebäude, deren Name den Kameratext enthält
      Mehrdeutiges wird nie geraten, sondern als offen gemeldet.

      Rückgabe: Zuordnung je Hardware-ID (KameraNr, Ort, Zustaendig, Qualitaet, Positionierung,
      Verbesserungen, Bewertet) und die Listen Offen (Bewertung) und OhneHardware (Inventar).
    #>
    param($Geraete, $Inventar, $Alt, $Bewertung)
    $nachIp = @{}
    foreach ($g in @($Geraete)) { if ($g.Adresse) { $nachIp[[string]$g.Adresse] = $g } }
    $ergebnis = @{}
    $ohneHardware = New-Object System.Collections.ArrayList
    $offen = New-Object System.Collections.ArrayList

    function Eintrag([string]$hw) {
        if (-not $ergebnis.ContainsKey($hw)) {
            $ergebnis[$hw] = [ordered]@{ KameraNr = ''; Ort = ''; Zustaendig = ''; Qualitaet = ''; Positionierung = ''; Verbesserungen = ''; Bewertet = $false }
        }
        return $ergebnis[$hw]
    }

    # Inventar 2024: Kamera-Nr und Ort je Hardware (über die IP)
    $invNachNr = @{}
    $inv = @(@($Inventar) | Where-Object { $_['A'] -match '^C\d+' })
    foreach ($z in $inv) {
        $invNachNr[$z['A']] = $z
        $ip = [string]$z['K']
        if (-not $ip) { continue }
        if (-not $nachIp.ContainsKey($ip)) { [void]$ohneHardware.Add("$($z['A']) $ip $($z['D'])"); continue }
        $e = Eintrag ([string]$nachIp[$ip].HardwareId)
        $e.KameraNr = [string]$z['A']
        $e.Ort = (@($z['C'], $z['D']) | Where-Object { $_ }) -join ' · '
    }
    $hwVonZeile = { param($z) if ($z -and $z['K'] -and $nachIp.ContainsKey([string]$z['K'])) { $nachIp[[string]$z['K']] } else { $null } }

    # Inventar OLD: (Raum, Kamera) -> Kamera-Nr; Zuständig je Kamera-Nr
    $altNachSchluessel = @{}
    foreach ($z in @(@($Alt) | Where-Object { $_['_Zeile'] -gt 1 })) {
        $k = (Get-ExcelRaum $z['C']) + '|' + ([string]$z['D']).Trim().ToLowerInvariant()
        if ($z['A'] -match '^C\d+') { $altNachSchluessel[$k] = [string]$z['A'] }
    }

    foreach ($b in @(@($Bewertung) | Where-Object { $_['_Zeile'] -gt 1 -and $_['C'] })) {
        $kamera = ([string]$b['C']).Trim()
        $raum = Get-ExcelRaum $b['B']
        $geb = Get-ExcelGebaeude $b['A']
        # «Parkplatz | P1 | Kasse»: der Parkplatz steht in der Spalte Raum.
        if ($geb -eq 'P' -and ([string]$b['B']) -match '^P\d') { $geb = Get-ExcelGebaeude $b['B'] }
        $hw = $null; $weg = ''
        # 1. Bezeichnung im Inventar 2024
        $treffer = @($inv | Where-Object { (Get-ExcelRaum $_['C']) -eq $raum -and $raum -ne '' })
        if ($treffer.Count -eq 1) { $hw = & $hwVonZeile $treffer[0]; $weg = 'Bezeichnung' }
        # 2. über Inventar OLD
        if (-not $hw) {
            $nr = $altNachSchluessel["$raum|$($kamera.ToLowerInvariant())"]
            if ($nr -and $invNachNr.ContainsKey($nr)) { $hw = & $hwVonZeile $invNachNr[$nr]; $weg = "Inventar OLD ($nr)" }
        }
        # 3. Ort im Inventar 2024, gleiches Gebäude, eindeutig – bei mehreren derselbe Stock
        if (-not $hw) {
            $treffer = @($inv | Where-Object {
                    (Test-GleichesGebaeude $geb (Get-ExcelGebaeude $_['B'])) -and
                    ((Test-OrtPasst $_['D'] $kamera) -or (Test-OrtPasst $_['C'] $kamera))
                })
            $stock = Get-ExcelStock $b['B']
            if ($treffer.Count -gt 1 -and $stock) { $treffer = @($treffer | Where-Object { (Get-ExcelStock $_['B']) -eq $stock }) }
            if ($treffer.Count -eq 1) { $hw = & $hwVonZeile $treffer[0]; $weg = "Ort ($($treffer[0]['A']))" }
        }
        # 4. Name in Milestone, gleiches Gebäude, eindeutig
        if (-not $hw) {
            $treffer = @(@($Geraete) | Where-Object { (Test-GleichesGebaeude $geb ([string]$_.Gebaeude)) -and ([string]$_.Name) -like "*$kamera*" })
            if ($treffer.Count -eq 1) { $hw = $treffer[0]; $weg = 'Name in Milestone' }
        }
        $wer = "Zeile $($b['_Zeile']): $($b['A']) | $($b['B']) | $kamera"
        if (-not $hw) { [void]$offen.Add("$wer – keine eindeutige Kamera gefunden"); continue }
        $e = Eintrag ([string]$hw.HardwareId)
        $mitWerten = [bool](([string]$b['E']).Trim() -or ([string]$b['F']).Trim() -or ([string]$b['G']).Trim())
        if ($e.Bewertet) {
            # Dieselbe Kamera steht zweimal in der Bewertung: die Zeile mit Werten gewinnt.
            $bisherMitWerten = [bool]($e.Qualitaet -or $e.Positionierung -or $e.Verbesserungen)
            if ($bisherMitWerten -or -not $mitWerten) {
                if ($mitWerten) { [void]$offen.Add("$wer – die Kamera «$($hw.Name)» hat schon eine Bewertung aus einer anderen Zeile") }
                continue
            }
        }
        $e.Bewertet = $true
        $e.Zustaendig = ([string]$b['D']).Trim()
        $e.Qualitaet = ([string]$b['E']).Trim()
        $e.Positionierung = ([string]$b['F']).Trim()
        $text = ([string]$b['G']).Trim()
        # Ein «X» in «Verbesserungen durchgeführt» sagt nur etwas, wenn es eine Verbesserung gibt.
        if ($text -and ([string]$b['H']).Trim() -match '^(?i)x$') { $text = "$text – in der Excel als umgesetzt markiert." }
        $e.Verbesserungen = $text
        $e['Weg'] = $weg
    }
    return [pscustomobject]@{ Zuordnung = $ergebnis; Offen = @($offen.ToArray()); OhneHardware = @($ohneHardware.ToArray()) }
}

function Get-ZustaendigText {
    <# Zuständigkeit aus der Excel lesbar machen: «CSSZ_TeamLBad» -> «Team Bad (CSSZ_TeamLBad)». #>
    param([string]$Wert)
    $w = ([string]$Wert).Trim()
    switch ($w) {
        'CSSZ_TeamLBad' { return 'Team Bad (CSSZ_TeamLBad)' }
        'TechD' { return 'Technischer Dienst' }
    }
    return $w
}

if ($InventarNurFunktionen) { return }

# ---------------------------------------------------------------------------
# Hauptteil
# ---------------------------------------------------------------------------
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$CodeDir = $ScriptDir
$ServerDir = Join-Path $CodeDir 'server'
# Dot-Sourcing setzt die Parameter von Sync-Inventar.ps1 (WhatIf, ConfigPath …) im eigenen
# Geltungsbereich auf deren Vorgaben: die eigenen vorher sichern und danach zurückholen.
# Ebenso setzt Inventar-Gemeinsam.ps1 $script:GraphTokenProvider zurück – derselbe Name wie der
# Parameter dieses Skripts.
$eigene = @{ WhatIf = [bool]$WhatIf; ConfigPath = $ConfigPath; Provider = $GraphTokenProvider }
$InventarNurFunktionen = $true
. (Join-Path $ServerDir 'Inventar-Gemeinsam.ps1')
. (Join-Path $ServerDir 'Sync-Inventar.ps1')
$InventarNurFunktionen = $false
$WhatIf = $eigene.WhatIf
$ConfigPath = $eigene.ConfigPath
$tokenProvider = $eigene.Provider
$ScriptDir = $CodeDir

if (-not $ConfigPath) { $ConfigPath = Join-Path $ServerDir 'Sync-Inventar.config.json' }
$cfg = Get-InventarKonfiguration -KonfigPfad $ConfigPath -FrontendPfad (Join-Path (Split-Path -Parent $CodeDir) 'frontend\konfig.js')
$lokal = Join-Path (Split-Path -Parent $CodeDir) 'lokal'
if (-not (Test-Path $lokal)) { New-Item -ItemType Directory -Path $lokal | Out-Null }
$stempel = Get-Date -Format 'yyyyMMdd-HHmmss'
Set-InventarLog (Join-Path $lokal 'Migriere-Kameras.log')
$fehler = 0
$now = Get-Date
Log "==== Kameras übernehmen $(if ($WhatIf) { '(WhatIf)' }) ===="

if ($tokenProvider) { Set-GraphTokenProvider $tokenProvider }
else {
    . (Join-Path $CodeDir 'Graph-Sitzung.ps1')
    Connect-GraphSitzung -TenantId $cfg.TenantId -ClientId $ClientId -Neu:$NeuAnmelden | Out-Null
}
$SiteId = $cfg.SiteId
if (-not $SiteId) { $u = [uri]$cfg.SiteUrl; $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id }

# --- 1) Listen und Spalten ---------------------------------------------------
function Get-ListeNachTitel([string]$Titel) {
    foreach ($l in (Get-GraphAlle "/sites/$SiteId/lists?`$select=id,displayName&`$top=200")) {
        if ([string]$l.displayName -eq $Titel) { return [string]$l.id }
    }
    return ''
}

function Initialize-Liste {
    <# Liste suchen oder anlegen, fehlende Spalten ergänzen, Titelspalte benennen. Gibt die Listen-ID zurück. #>
    param([string]$Titel, [string]$Beschreibung, [string]$SchemaDatei)
    $id = Get-ListeNachTitel $Titel
    if (-not $id) {
        if ($WhatIf) { Log "WHATIF: Liste «$Titel» würde angelegt."; return '' }
        $id = [string](Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists" -Body @{ displayName = $Titel; description = $Beschreibung; list = @{ template = 'genericList' } }).id
        Log "Liste «$Titel» angelegt: $id"
    } else { Log "Liste «$Titel» gibt es schon: $id" }
    $schema = @(Read-JsonDatei (Join-Path $CodeDir $SchemaDatei))
    $vorhanden = @{}
    foreach ($c in (Get-GraphAlle "/sites/$SiteId/lists/$id/columns?`$select=id,name,displayName")) {
        $vorhanden[[string]$c.name] = $c
        if ($c.displayName) { $vorhanden[[string]$c.displayName] = $c }
    }
    foreach ($s in @($schema | Where-Object { $_.internal -ne 'Title' })) {
        if ($vorhanden.ContainsKey([string]$s.internal)) { continue }
        if ($WhatIf) { Log "  WHATIF: Spalte «$($s.internal)» würde angelegt."; continue }
        try { Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$id/columns" -Body (ConvertTo-GraphSpalte $s) | Out-Null; Log "  Spalte angelegt: $($s.internal)" }
        catch { Log "  Spalte «$($s.internal)» nicht angelegt: $_$(Get-SpaltenHinweis $_)" 'ERROR'; $script:fehler++ }
    }
    # Eigener Name: $Titel (der Parameter, [string]) und $titel wären in PowerShell dieselbe Variable.
    $titelDef = @($schema | Where-Object { $_.internal -eq 'Title' })[0]
    $anzeige = [string]$titelDef.display
    if ($anzeige -and $vorhanden.ContainsKey('Title') -and [string]$vorhanden['Title'].displayName -ne $anzeige -and -not $WhatIf) {
        Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/lists/$id/columns/$($vorhanden['Title'].id)" -Body @{ displayName = $anzeige } | Out-Null
        Log "  Titelspalte heisst jetzt «$anzeige»."
    }
    return $id
}

$KameraListId = Initialize-Liste 'Kameras' 'Videokameras aus Milestone XProtect, eine Zeile je Hardware. Abgleich: Sync-Inventar.ps1 (README Abschnitt 2.9).' 'schema-kamera.json'
$RolleListId = Initialize-Liste 'Kamera-Rollen' 'Rollen aus Milestone XProtect und ihre Rechte auf die Kameras. Abgleich: Sync-Inventar.ps1 (README Abschnitt 2.9).' 'schema-kamerarolle.json'
Log "Listen-IDs – in frontend\konfig.js (kameraListId, kameraRolleListId) und in der Server-Konfiguration (KameraListId, KameraRolleListId) eintragen: Kameras $KameraListId, Kamera-Rollen $RolleListId"

# --- 2) Milestone ------------------------------------------------------------
Set-MilestoneVerbindung ([pscustomobject]@{ MilestoneServer = $MilestoneServer; MilestoneAnmeldung = 'Windows' })
$geraete = @(Get-MilestoneGeraete)
Log "Milestone: $($geraete.Count) Kamera-Hardware"
$geraeteKurz = @($geraete | ForEach-Object {
        $n = Get-KameraName $_
        [pscustomobject]@{ HardwareId = $_.HardwareId; Adresse = $_.Adresse; Name = $n; Gebaeude = (Get-KameraOrt $n).Gebaeude }
    })

# --- 3) Excel ----------------------------------------------------------------
if (-not (Test-Path $ExcelPfad)) { throw "Excel nicht gefunden: $ExcelPfad" }
$plan = Get-KameraExcelPlan $geraeteKurz (Read-XlsxBlatt $ExcelPfad 'Inventar 2024.04') (Read-XlsxBlatt $ExcelPfad 'Inventar OLD') (Read-XlsxBlatt $ExcelPfad 'Bewertung 15.07.21')
Log "Excel: $($plan.Zuordnung.Count) Kameras zugeordnet, $(@($plan.Zuordnung.Values | Where-Object { $_.Bewertet }).Count) mit Bewertung, $($plan.Offen.Count) Bewertungszeilen offen, $($plan.OhneHardware.Count) Excel-Kameras ohne Hardware in Milestone"

# --- 4) Zeilen anlegen und ergänzen -----------------------------------------
$stats = @{ neu = 0; ergaenzt = 0; unveraendert = 0 }
$zeilen = @()
if ($KameraListId) {
    $kameraBase = "/sites/$SiteId/lists/$KameraListId/items"
    $items = @(Get-GraphAlle "$kameraBase`?`$expand=fields&`$top=500")
    $zeilen = @($items | ForEach-Object {
            [pscustomobject]@{ Id = [string]$_.id; Title = [string]$_.fields.Title; Status = [string]$_.fields.Status; Gebaeude = [string]$_.fields.Gebaeude; Raum = [string]$_.fields.Raum
                MS_HardwareId = [string]$_.fields.MS_HardwareId; MS_Mac = [string]$_.fields.MS_Mac; MS_Seriennummer = [string]$_.fields.MS_Seriennummer; MS_Adresse = [string]$_.fields.MS_Adresse; Item = $_ }
        })
}
$zuordnung = Get-KameraZuordnung $geraete $zeilen
$excelText = 'Aus der Excel «Zugriffsberechtigung Inventar Videokameras Milestone» übernommen'

function Get-ExcelFelder {
    <# Felder aus der Excel für eine Hardware, nur für leere Felder der Zeile. #>
    param([string]$HwId, $Fields)
    $f = [ordered]@{}
    if (-not $plan.Zuordnung.ContainsKey($HwId)) { return $f }
    $e = $plan.Zuordnung[$HwId]
    $leer = { param($n) -not $Fields -or -not ([string](Get-Feld $Fields $n)).Trim() }
    if ($e.Zustaendig -and (& $leer 'Zustaendig')) { $f['Zustaendig'] = Get-ZustaendigText $e.Zustaendig }
    if ($e.Qualitaet -and (& $leer 'Qualitaet')) { $f['Qualitaet'] = $e.Qualitaet }
    if ($e.Positionierung -and (& $leer 'Positionierung')) { $f['Positionierung'] = $e.Positionierung }
    if ($e.Verbesserungen -and (& $leer 'Verbesserungen')) { $f['Verbesserungen'] = $e.Verbesserungen }
    if (($e.Qualitaet -or $e.Positionierung) -and (& $leer 'BewertetAm')) { $f['BewertetAm'] = '2021-07-15' }
    return $f
}

function Get-ExcelVerlauf {
    param([string]$HwId)
    if (-not $plan.Zuordnung.ContainsKey($HwId)) { return '' }
    $e = $plan.Zuordnung[$HwId]
    $teile = @()
    if ($e.KameraNr) { $teile += "Kamera-Nr. $($e.KameraNr)" }
    if ($e.Ort) { $teile += "Ort «$($e.Ort)»" }
    if ($e.Bewertet) { $teile += 'Bewertung vom 15.07.2021' }
    if (-not $teile.Count) { return '' }
    return "$excelText ($($teile -join ', '))"
}

foreach ($n in $zuordnung.Neu) {
    $hw = [string]$n.Geraet.HardwareId
    $felder = ConvertTo-KameraFelder $n.Geraet $now
    $body = [ordered]@{ Title = $n.Name; Status = 'Aktiv' }
    if ($n.Gebaeude) { $body['Gebaeude'] = $n.Gebaeude }
    if ($n.Raum) { $body['Raum'] = $n.Raum }
    foreach ($k in $felder.Keys) { if ($null -ne $felder[$k]) { $body[$k] = $felder[$k] } }
    foreach ($kv in (Get-ExcelFelder $hw $null).GetEnumerator()) { $body[$kv.Key] = $kv.Value }
    $texte = @('Aus Milestone neu angelegt')
    $ex = Get-ExcelVerlauf $hw
    if ($ex) { $texte += $ex }
    $body['Verlauf'] = Add-VerlaufEintraege -Verlauf '' -Texte $texte -Datum $now -Quelle 'sync' -Zeitpunkt $now
    if ($WhatIf -or -not $KameraListId) { Log "WHATIF neu: $($n.Name) | $($felder['MS_Adresse']) | $(((Get-ExcelFelder $hw $null).Keys) -join ', ')"; $stats.neu++; continue }
    try { Invoke-Graph -Method POST -Uri $kameraBase -Body @{ fields = $body } | Out-Null; $stats.neu++; Log "neu: $($n.Name)" }
    catch { Log "Anlage-Fehler $($n.Name): $_" 'ERROR'; $fehler++ }
}
foreach ($zu in $zuordnung.Zuordnungen) {
    $hw = [string]$zu.Geraet.HardwareId
    $it = $zu.Zeile.Item
    $body = Get-ExcelFelder $hw $it.fields
    $ex = Get-ExcelVerlauf $hw
    $verlauf = [string]$it.fields.Verlauf
    if ($ex -and $verlauf -notlike "*$excelText*") { $body['Verlauf'] = Add-VerlaufEintrag -Verlauf $verlauf -Text $ex -Datum $now -Quelle 'sync' -Zeitpunkt $now }
    if ($body.Count -eq 0) { $stats.unveraendert++; continue }
    if ($WhatIf) { Log "WHATIF ergänzen: $($zu.Titel): $($body.Keys -join ', ')"; $stats.ergaenzt++; continue }
    try { Invoke-Graph -Method PATCH -Uri "$kameraBase/$($zu.ZeileId)/fields" -Body $body | Out-Null; $stats.ergaenzt++; Log "ergänzt: $($zu.Titel) ($($body.Keys -join ', '))" }
    catch { Log "Fehler bei $($zu.Titel): $_" 'ERROR'; $fehler++ }
}

# --- 5) Protokoll ---------------------------------------------------------------
$protokoll = Join-Path $lokal "Kamera-Uebernahme-Protokoll-$stempel.txt"
$zeilenP = @("Übernahme Kameras $(Get-Date -Format 'dd.MM.yyyy HH:mm') $(if ($WhatIf) { '(WhatIf)' })", '',
    "Neu angelegt: $($stats.neu), ergänzt: $($stats.ergaenzt), unverändert: $($stats.unveraendert)", '',
    'Bewertungen ohne eindeutige Kamera (nicht übernommen):') + @($plan.Offen | ForEach-Object { "  $_" }) + @('',
    'Kameras der Excel ohne Hardware in Milestone (nicht übernommen):') + @($plan.OhneHardware | ForEach-Object { "  $_" }) + @('',
    'Zugeordnete Bewertungen:') + @($plan.Zuordnung.GetEnumerator() | Where-Object { $_.Value.Bewertet } | ForEach-Object {
        $hwId = $_.Key
        $name = (@($geraeteKurz | Where-Object { $_.HardwareId -eq $hwId })[0]).Name
        "  ${name}: $($_.Value.Zustaendig) | $($_.Value.Qualitaet) | $($_.Value.Positionierung) (über $($_.Value.Weg))"
    } | Sort-Object)
[IO.File]::WriteAllLines($protokoll, [string[]]$zeilenP, (New-Object Text.UTF8Encoding($true)))
Log "Protokoll: $protokoll"
Log ("==== Fertig: {0} neu, {1} ergänzt, {2} unverändert, {3} Fehler ====" -f $stats.neu, $stats.ergaenzt, $stats.unveraendert, $fehler)
if ($fehler) { exit 1 }
