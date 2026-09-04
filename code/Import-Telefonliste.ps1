<#
.SYNOPSIS
  Legt die SharePoint-Liste «Telefonnummern» an und übernimmt die alte Excel-Telefonliste.

.DESCRIPTION
  Ablauf:
   1. Blatt «Telefonnummer» der Excel-Datei lesen (ohne Excel, direkt aus der .xlsx-Datei).
   2. Liste «Telefonnummern» anlegen, falls sie fehlt (Spalten aus schema-telefon.json,
      Titelspalte wird zu «Kurzwahl»).
   3. Zeilen übernehmen, die noch nicht in der Liste stehen (Schlüssel: Kurzwahl). Der Import
      ist damit wiederholbar: ein zweiter Lauf legt nichts doppelt an.
   4. Auf Wunsch (-UpdateKonfig) die Listen-ID in frontend\konfig.js eintragen.

  Zuordnung der alten Spalten:
    Nr.               -> Kurzwahl (Title)
    Telefonnummer     -> Telefonnummer (formatiert, +41 41 926 23 73)
    Name              -> Name («FREI» wird zu leer)
    Typ               -> Typ (Person, Dienst, Raum, Notruf)
    Status            -> Status: «aktiv» -> Aktiv; «inaktiv» mit Hinweis «frei» oder ohne Namen -> Frei;
                         sonst Inaktiv
    Grund / Hinweis   -> Hinweis
    Früherer Eintrag  -> Früherer Eintrag
  Jede Zeile bekommt einen Verlaufseintrag «Aus der Telefonliste S4B importiert (Stand …)».
  Die Zuordnung zu AD-Benutzern (Spalte «Benutzer») schreibt danach der Sync (Sync-Inventar.ps1,
  Phase Telefonnummern); das Frontend zeigt sie schon vorher live aus der Benutzer-Liste.

  Mit -WhatIf wird nur gelesen und ein Bericht ausgegeben; es wird nichts angelegt.

.PARAMETER ExcelPfad
  Die alte Liste. Standard: ..\lokal\Telefonnummerm S4B.xlsx neben dem Ordner code.

.PARAMETER ClientId
  App für den Device-Code-Login. Standard ist der Microsoft-Standardclient «Microsoft Graph
  Command Line Tools», weil die Frontend-App keine öffentlichen Client-Flows erlaubt.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Import-Telefonliste.ps1 -WhatIf

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Import-Telefonliste.ps1 -UpdateKonfig

.NOTES
  Windows PowerShell 5.1. Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen.
#>
[CmdletBinding()]
param(
    [string]$ExcelPfad,
    [string]$Blatt = 'Telefonnummer',
    [string]$ListName = 'Telefonnummern',
    [string]$TenantId,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [string]$SiteId,
    [string]$Praefix,
    [switch]$WhatIf,
    [switch]$UpdateKonfig
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy(); [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')

# ===========================================================================
# Reine Funktionen (ohne Graph – werden von Test-Inventar.ps1 geprüft)
# ===========================================================================

function ConvertTo-SpaltenIndex {
    <# Zellbezug «C12» -> Spaltennummer 3. #>
    param([string]$Bezug)
    $buchstaben = ($Bezug -replace '\d', '')
    $n = 0
    foreach ($c in $buchstaben.ToUpperInvariant().ToCharArray()) { $n = $n * 26 + ([int][char]$c - 64) }
    return $n
}

function Read-XlsxBlatt {
    <#
      Liest ein Tabellenblatt einer .xlsx-Datei ohne Excel: die Datei ist ein ZIP mit XML.
      Rückgabe: Array von Zeilen; jede Zeile ist ein String-Array (Spalte A = Index 0).
      Formeln werden nicht ausgewertet, es zählt der gespeicherte Wert.
    #>
    param([string]$Pfad, [string]$Blatt)
    if (-not (Test-Path $Pfad)) { throw "Excel-Datei nicht gefunden: $Pfad" }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $Pfad).Path)
    try {
        function LiesEintrag([string]$Name) {
            $e = $zip.GetEntry($Name)
            if (-not $e) { return $null }
            $sr = New-Object IO.StreamReader($e.Open(), [Text.Encoding]::UTF8)
            try { return $sr.ReadToEnd() } finally { $sr.Dispose() }
        }

        [xml]$wb = LiesEintrag 'xl/workbook.xml'
        [xml]$rels = LiesEintrag 'xl/_rels/workbook.xml.rels'
        $sheet = @($wb.workbook.sheets.sheet | Where-Object { $_.name -eq $Blatt })
        if ($sheet.Count -eq 0) {
            $namen = (@($wb.workbook.sheets.sheet | ForEach-Object { $_.name }) -join ', ')
            throw "Blatt '$Blatt' nicht gefunden. Vorhanden: $namen"
        }
        $rid = $sheet[0].GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $rel = @($rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid })[0]
        $ziel = [string]$rel.Target
        if ($ziel.StartsWith('/')) { $ziel = $ziel.Substring(1) } else { $ziel = 'xl/' + $ziel }

        $strings = New-Object System.Collections.ArrayList
        $ssText = LiesEintrag 'xl/sharedStrings.xml'
        if ($ssText) {
            [xml]$ss = $ssText
            foreach ($si in @($ss.sst.si)) {
                $t = ''
                if ($si.t) {
                    $t = if ($si.t -is [string]) { $si.t } else { [string]$si.t.'#text' }
                } elseif ($si.r) {
                    foreach ($r in @($si.r)) { $t += $(if ($r.t -is [string]) { $r.t } else { [string]$r.t.'#text' }) }
                }
                [void]$strings.Add([string]$t)
            }
        }

        [xml]$sh = LiesEintrag $ziel
        $zeilen = New-Object System.Collections.ArrayList
        foreach ($row in @($sh.worksheet.sheetData.row)) {
            if ($null -eq $row) { continue }
            $zellen = @{}; $max = 0
            foreach ($c in @($row.c)) {
                if ($null -eq $c) { continue }
                $i = ConvertTo-SpaltenIndex ([string]$c.r)
                if ($i -gt $max) { $max = $i }
                $v = $null
                if ($c.t -eq 's') { if ($null -ne $c.v) { $v = $strings[[int]$c.v] } }
                elseif ($c.t -eq 'inlineStr') { $v = $(if ($c.is.t -is [string]) { $c.is.t } else { [string]$c.is.t.'#text' }) }
                elseif ($null -ne $c.v) { $v = $(if ($c.v -is [string]) { $c.v } else { [string]$c.v.'#text' }) }
                $zellen[$i] = [string]$v
            }
            $arr = @()
            for ($i = 1; $i -le $max; $i++) { $arr += [string]$zellen[$i] }
            [void]$zeilen.Add([string[]]$arr)
        }
        return @($zeilen.ToArray())
    } finally {
        $zip.Dispose()
    }
}

function Get-StandAusBlatt {
    <# Sucht in den ersten Zeilen «Stand TT.MM.JJJJ» und gibt das Datum als Text zurück, sonst ''. #>
    param($Zeilen)
    $n = 0
    foreach ($z in @($Zeilen)) {
        $n++
        if ($n -gt 6) { break }
        foreach ($c in @($z)) {
            if ([string]$c -match 'Stand\s+(\d{2}\.\d{2}\.\d{4})') { return $Matches[1] }
        }
    }
    return ''
}

function ConvertFrom-TelefonBlatt {
    <#
      Zeilen des Blatts «Telefonnummer» (String-Arrays) -> Einträge mit Nr, Nummer, Name, Typ,
      Status, Hinweis, Frueher. Die Kopfzeile wird über die Beschriftungen gefunden, die
      Reihenfolge der Spalten ist damit egal. Zeilen ohne Nr. und ohne Nummer werden übersprungen.
    #>
    param($Zeilen)
    $eintraege = New-Object System.Collections.ArrayList
    $spalte = $null
    foreach ($z in @($Zeilen)) {
        $felder = @($z | ForEach-Object { ([string]$_).Trim() })
        if ($null -eq $spalte) {
            $iNr = -1; $iNummer = -1
            for ($i = 0; $i -lt $felder.Count; $i++) {
                if ($felder[$i] -match '^Nr\.?$') { $iNr = $i }
                if ($felder[$i] -match '^Telefonnummer$') { $iNummer = $i }
            }
            if ($iNr -ge 0 -and $iNummer -ge 0) {
                $spalte = @{ Nr = $iNr; Nummer = $iNummer; Name = -1; Typ = -1; Status = -1; Hinweis = -1; Frueher = -1 }
                for ($i = 0; $i -lt $felder.Count; $i++) {
                    switch -Regex ($felder[$i]) {
                        '^Name$' { $spalte.Name = $i }
                        '^Typ$' { $spalte.Typ = $i }
                        '^Status$' { $spalte.Status = $i }
                        '^Grund' { $spalte.Hinweis = $i }
                        '^Fr.herer Eintrag$' { $spalte.Frueher = $i }
                    }
                }
            }
            continue
        }
        $feld = { param([int]$i) if ($i -ge 0 -and $i -lt $felder.Count) { return $felder[$i] } else { return '' } }
        $nr = & $feld $spalte.Nr
        $nummer = & $feld $spalte.Nummer
        if ($nr -eq '' -and $nummer -eq '') { continue }
        [void]$eintraege.Add([pscustomobject]@{
                Nr      = $nr
                Nummer  = $nummer
                Name    = (& $feld $spalte.Name)
                Typ     = (& $feld $spalte.Typ)
                Status  = (& $feld $spalte.Status)
                Hinweis = (& $feld $spalte.Hinweis)
                Frueher = (& $feld $spalte.Frueher)
            })
    }
    if ($null -eq $spalte) { throw "Kopfzeile mit 'Nr.' und 'Telefonnummer' nicht gefunden." }
    return @($eintraege.ToArray())
}

function Get-TelefonStatusAusAlt {
    <#
      Status der alten Liste -> Aktiv, Inaktiv oder Frei.
        aktiv                                        -> Aktiv
        inaktiv + Hinweis «frei» oder ohne Namen     -> Frei
        inaktiv sonst                                -> Inaktiv
        leer                                         -> Aktiv mit Name, sonst Frei
    #>
    param([string]$Status, [string]$Name, [string]$Hinweis)
    $s = ([string]$Status).Trim().ToLowerInvariant()
    $n = ([string]$Name).Trim()
    $istFreiName = ($n -eq '' -or $n.ToUpperInvariant() -eq 'FREI')
    if ($s -eq 'aktiv') { if ($istFreiName) { return 'Frei' } else { return 'Aktiv' } }
    if ($s -eq 'inaktiv') {
        if ($istFreiName -or ([string]$Hinweis) -match '(?i)\bfrei\b') { return 'Frei' }
        return 'Inaktiv'
    }
    if ($istFreiName) { return 'Frei' }
    return 'Aktiv'
}

function ConvertTo-TelefonZeile {
    <# Eintrag der alten Liste -> Felder der Liste «Telefonnummern» (ohne Verlauf). #>
    param($Eintrag, [string]$Praefix)
    if (-not $Praefix) { $Praefix = $script:TelefonPraefixStandard }
    $nr = ([string]$Eintrag.Nr).Trim()
    $nummer = ([string]$Eintrag.Nummer).Trim()
    if ($nr -eq '' -and $nummer -ne '') { $nr = Get-TelefonKurzwahl $nummer $Praefix }
    if ($nummer -eq '' -and $nr -ne '') { $nummer = $nr }
    $name = ([string]$Eintrag.Name).Trim()
    if ($name.ToUpperInvariant() -eq 'FREI') { $name = '' }
    $status = Get-TelefonStatusAusAlt $Eintrag.Status $name $Eintrag.Hinweis
    $f = [ordered]@{
        Title            = $nr
        Telefonnummer    = (Format-Telefon $nummer $Praefix)
        Name             = $name
        Typ              = ([string]$Eintrag.Typ).Trim()
        Status           = $status
        Hinweis          = ([string]$Eintrag.Hinweis).Trim()
        FruehererEintrag = ([string]$Eintrag.Frueher).Trim()
    }
    return $f
}

function Read-KonfigJs {
    <# Liest mandantId, siteId und telefonListId aus frontend\konfig.js. #>
    param([string]$Pfad)
    $werte = @{}
    if (-not (Test-Path $Pfad)) { return $werte }
    $text = Get-Content $Pfad -Raw -Encoding UTF8
    foreach ($schluessel in @('mandantId', 'clientId', 'siteId', 'telefonListId', 'telefonPraefix')) {
        $m = [regex]::Match($text, ($schluessel + '\s*:\s*"([^"]*)"'))
        if ($m.Success) { $werte[$schluessel] = $m.Groups[1].Value }
    }
    return $werte
}

if ($InventarNurFunktionen) { return }

# ===========================================================================
# Hauptteil
# ===========================================================================
if (-not $ExcelPfad) { $ExcelPfad = Join-Path $ScriptDir '..\lokal\Telefonnummerm S4B.xlsx' }
$KonfigJsPfad = Join-Path $ScriptDir '..\frontend\konfig.js'
$konfigJs = Read-KonfigJs $KonfigJsPfad
$cfgPfad = Join-Path $ScriptDir 'Sync-Inventar.config.json'
$cfg = $null
if (Test-Path $cfgPfad) { $cfg = Read-JsonDatei $cfgPfad }

Set-InventarLog (Join-Path $ScriptDir 'Import-Telefonliste.log')

if (-not $TenantId) { if ($konfigJs['mandantId']) { $TenantId = $konfigJs['mandantId'] } elseif ($cfg -and $cfg.TenantId) { $TenantId = $cfg.TenantId } }
if (-not $SiteId) { if ($konfigJs['siteId']) { $SiteId = $konfigJs['siteId'] } elseif ($cfg -and $cfg.SiteId) { $SiteId = $cfg.SiteId } }
if (-not $Praefix) { if ($konfigJs['telefonPraefix']) { $Praefix = $konfigJs['telefonPraefix'] } elseif ($cfg -and $cfg.TelefonPraefix) { $Praefix = $cfg.TelefonPraefix } else { $Praefix = $script:TelefonPraefixStandard } }
if (-not $TenantId) { throw 'TenantId fehlt (Parameter -TenantId oder mandantId in frontend\konfig.js).' }
if (-not $SiteId) { throw 'SiteId fehlt (Parameter -SiteId oder siteId in frontend\konfig.js).' }

Log '==== Import Telefonliste Start ===='
Log "Excel: $ExcelPfad (Blatt '$Blatt'), Präfix $Praefix"

# 1) Excel lesen und umrechnen (ohne Netz) ------------------------------------
$blattZeilen = Read-XlsxBlatt $ExcelPfad $Blatt
$stand = Get-StandAusBlatt $blattZeilen
$eintraege = ConvertFrom-TelefonBlatt $blattZeilen
Log ("Excel: $($eintraege.Count) Einträge gelesen" + $(if ($stand) { " (Stand $stand)" } else { '' }))

$zeilenNeu = [ordered]@{}
$doppelt = 0
foreach ($e in $eintraege) {
    $f = ConvertTo-TelefonZeile $e $Praefix
    if ([string]$f.Title -eq '') { Log "Eintrag ohne Kurzwahl übersprungen: $($e.Nummer) $($e.Name)" 'WARN'; continue }
    if ($zeilenNeu.Contains([string]$f.Title)) { $doppelt++; Log "Kurzwahl $($f.Title) kommt doppelt vor – zweite Zeile ($($e.Name)) übersprungen." 'WARN'; continue }
    $zeilenNeu[[string]$f.Title] = $f
}
$statistik = @{}
foreach ($f in $zeilenNeu.Values) { $k = [string]$f.Status; if (-not $statistik.ContainsKey($k)) { $statistik[$k] = 0 }; $statistik[$k]++ }
Log ("Umgerechnet: {0} Zeilen ({1}); {2} Dubletten" -f $zeilenNeu.Count, (($statistik.Keys | Sort-Object | ForEach-Object { "$_ $($statistik[$_])" }) -join ', '), $doppelt)

# 2) Anmeldung ----------------------------------------------------------------
Log "Device-Code-Anmeldung mit ClientId $ClientId"
Set-GraphToken (Get-GraphTokenDeviceCode -TenantId $TenantId -ClientId $ClientId)
Log "Site: $SiteId"

# 3) Liste suchen oder anlegen -------------------------------------------------
$schema = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-telefon.json'))
$listen = @((Invoke-Graph -Uri "/sites/$SiteId/lists?`$select=id,displayName,name").value | Where-Object { $_.displayName -eq $ListName })
$listId = $null
if ($listen.Count -gt 0) {
    $listId = [string]$listen[0].id
    Log "Liste «$ListName» vorhanden: $listId"
    # Fehlende Spalten ergänzen (idempotent)
    $vorhanden = @{}
    foreach ($c in (Invoke-Graph -Uri "/sites/$SiteId/lists/$listId/columns?`$select=id,name,displayName").value) {
        if ($c.name) { $vorhanden[[string]$c.name] = $c }
        if ($c.displayName) { $vorhanden[[string]$c.displayName] = $c }
    }
    foreach ($s in $schema) {
        if ($s.internal -eq 'Title') { continue }
        if ($vorhanden.ContainsKey([string]$s.internal) -or $vorhanden.ContainsKey([string]$s.display)) { continue }
        if ($WhatIf) { Log "WHATIF: Spalte '$($s.internal)' würde angelegt."; continue }
        Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$listId/columns" -Body (ConvertTo-GraphSpalte $s) | Out-Null
        Log "Spalte angelegt: $($s.internal)"
    }
} else {
    if ($WhatIf) {
        Log "WHATIF: Liste «$ListName» würde mit $($schema.Count) Spalten angelegt."
    } else {
        $spalten = @($schema | Where-Object { $_.internal -ne 'Title' } | ForEach-Object { ConvertTo-GraphSpalte $_ })
        $body = [ordered]@{
            displayName = $ListName
            description = 'Telefonnummern des Hauses: Kurzwahl, Zuordnung, Status. Die Spalte Benutzer pflegt der Sync aus dem AD.'
            columns     = $spalten
            list        = @{ template = 'genericList' }
        }
        $neu = Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists" -Body $body
        $listId = [string]$neu.id
        Log "Liste «$ListName» angelegt: $listId"
        # Titelspalte umbenennen
        $titel = @((Invoke-Graph -Uri "/sites/$SiteId/lists/$listId/columns?`$select=id,name").value | Where-Object { $_.name -eq 'Title' })
        if ($titel.Count -gt 0) {
            $anzeige = @($schema | Where-Object { $_.internal -eq 'Title' })[0].display
            Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/lists/$listId/columns/$($titel[0].id)" -Body @{ displayName = $anzeige } | Out-Null
            Log "Titelspalte heisst jetzt «$anzeige»"
        }
    }
}

# 4) Zeilen übernehmen ----------------------------------------------------------
$vorhandenKurz = @{}
if ($listId) {
    $items = Get-GraphAlle "/sites/$SiteId/lists/$listId/items?`$expand=fields(`$select=Title)&`$top=500"
    foreach ($it in $items) { $k = ([string]$it.fields.Title).Trim(); if ($k) { $vorhandenKurz[$k] = $it.id } }
    Log "Liste enthält bereits $($vorhandenKurz.Count) Zeilen"
}
$verlaufText = 'Aus der Telefonliste S4B importiert' + $(if ($stand) { " (Stand $stand)" } else { '' })
$jetzt = Get-Date
$angelegt = 0; $uebersprungen = 0; $fehler = 0
foreach ($k in $zeilenNeu.Keys) {
    if ($vorhandenKurz.ContainsKey($k)) { $uebersprungen++; continue }
    $f = [ordered]@{}
    foreach ($n in $zeilenNeu[$k].Keys) { $v = $zeilenNeu[$k][$n]; if ($null -ne $v -and [string]$v -ne '') { $f[$n] = $v } }
    $f['Verlauf'] = Add-VerlaufEintrag -Verlauf '' -Text $verlaufText -Datum $jetzt -Quelle 'sync' -Zeitpunkt $jetzt
    if ($WhatIf -or -not $listId) { Log "WHATIF Neu: $k $($f.Telefonnummer) $($f.Name) [$($f.Status)]"; $angelegt++; continue }
    try {
        Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$listId/items" -Body @{ fields = $f } | Out-Null
        $angelegt++
        if ($angelegt % 25 -eq 0) { Log "  … $angelegt Zeilen angelegt" }
    } catch { Log "Fehler bei Kurzwahl ${k}: $_" 'ERROR'; $fehler++ }
}
Log ("Import fertig: {0} angelegt, {1} schon vorhanden, {2} Fehler" -f $angelegt, $uebersprungen, $fehler)

# 5) konfig.js -----------------------------------------------------------------
if ($listId) {
    Log "TelefonListId für Sync-Inventar.config.json und frontend\konfig.js: $listId"
    if ($UpdateKonfig -and -not $WhatIf) {
        $text = Get-Content $KonfigJsPfad -Raw -Encoding UTF8
        $neuText = [regex]::Replace($text, 'telefonListId\s*:\s*"[^"]*"', ('telefonListId: "' + $listId + '"'))
        if ($neuText -ne $text) {
            [IO.File]::WriteAllText((Resolve-Path $KonfigJsPfad).Path, $neuText, (New-Object Text.UTF8Encoding($false)))
            Log "frontend\konfig.js aktualisiert (telefonListId)."
        } else { Log 'frontend\konfig.js: telefonListId nicht gefunden oder bereits gesetzt.' 'WARN' }
    }
}
Log '==== Import Telefonliste Ende ===='
if ($fehler) { exit 1 }
