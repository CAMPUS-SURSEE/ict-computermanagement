<#
.SYNOPSIS
  Einmalige Migration der alten Liste «Computer Inventar» in die zwei Listen «Computer» und «Benutzer»
  sowie Aufbau von programme.json.

.DESCRIPTION
  Ablauf:
   1. Alte Liste vollständig lesen (Graph, $expand=fields, mit Paging).
   2. Listen «Computer» und «Benutzer» anlegen, falls sie fehlen (Spalten aus schema-computer.json,
      schema-benutzer.json und den Programmen aus programme.json).
   3. programme.json aufbauen: AD-Gruppen der zwölf Spezial-Software-Textspalten einsammeln,
      Datei nach «Inventar/programme.json» in die Standard-Dokumentbibliothek hochladen und die
      lokale Kopie code\programme.json aktualisieren.
   4. Zeilen migrieren (Computer und Benutzer, Duplikate zusammenführen).
   5. Auf Wunsch (-UpdateKonfig) die neuen Listen-IDs in frontend\konfig.js eintragen.

  Die alte Liste wird nicht verändert. Mit -WhatIf wird nur gelesen und ein Bericht ausgegeben.

.PARAMETER Auth
  DeviceCode (Standard): Anmeldung als Person über den Device-Code-Flow mit der Client-ID des
  Frontends aus frontend\konfig.js. Die App-Registrierung braucht dafür «Allow public client flows».
  Certificate: Anmeldung als Anwendung mit dem Zertifikat des Syncs (wie Sync-Inventar.ps1).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Migrate-ToTwoLists.ps1 -WhatIf

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Migrate-ToTwoLists.ps1 -UpdateKonfig

.NOTES
  Windows PowerShell 5.1. Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [ValidateSet('DeviceCode', 'Certificate')]
    [string]$Auth = 'DeviceCode',
    [switch]$WhatIf,
    [switch]$UpdateKonfig,
    [switch]$ProgrammeOnly,
    [string]$TenantId,
    [string]$ClientId,
    [string]$SiteId,
    [string]$AltListId,
    [string]$ComputerListName = 'Computer',
    [string]$BenutzerListName = 'Benutzer'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy(); [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')

# ===========================================================================
# Reine Funktionen (ohne Graph, ohne AD - werden von Test-Inventar.ps1 geprüft)
# ===========================================================================

# Die Beschaffungsjahr-Häkchen der alten Liste.
$script:JahrSpaltenStandard = @('J20192020', 'J20202021', 'J20212022', 'J20222023', 'J20232024', 'J20242025', 'J20252026')

function ConvertTo-GjAusJahrSpalte {
    <# Spaltenname J20252026 -> Geschäftsjahr 2025/2026. #>
    param([string]$Name)
    if ($Name -match '^J(\d{4})(\d{4})$') { return ('{0}/{1}' -f $Matches[1], $Matches[2]) }
    return ''
}

function ConvertTo-BoolWert {
    <# Werte der alten Liste als Wahrheitswert deuten («x», «ja», «true», 1 = wahr). #>
    param($v)
    if ($null -eq $v) { return $false }
    if ($v -is [bool]) { return [bool]$v }
    $s = ([string]$v).Trim().ToLowerInvariant()
    if ($s -eq '') { return $false }
    if ($s -in @('0', 'nein', 'no', 'false', '-')) { return $false }
    return $true
}

function Get-ProgrammWertAusAlt {
    <#
      Wert einer alten Programm-/Rechte-Spalte in die neue Stufe umrechnen:
      Häkchen gesetzt oder Textspalte gefüllt -> '1', sonst '0'.
    #>
    param($v)
    if (ConvertTo-BoolWert $v) { return '1' } else { return '0' }
}

function Get-AdGruppenAusWert {
    <#
      AD-Gruppennamen aus einer Spezial-Software-Textspalte lesen.
      Alles ausser leer, «ja» und «nein» gilt als Gruppenname; mehrere Namen dürfen mit
      Komma oder Strichpunkt getrennt sein.
    #>
    param($v)
    $ergebnis = @()
    if ($null -eq $v) { return $ergebnis }
    if ($v -is [bool]) { return $ergebnis }
    foreach ($teil in ([string]$v -split '[;,]')) {
        $t = $teil.Trim()
        if ($t -eq '') { continue }
        if ($t.ToLowerInvariant() -in @('ja', 'nein', 'x', 'true', 'false')) { continue }
        $ergebnis += $t
    }
    return $ergebnis
}

function Get-BeschaffungsjahrAusZeile {
    <# Neuestes angekreuztes Beschaffungsjahr einer alten Zeile als Geschäftsjahr. #>
    param($Zeile, [string[]]$JahrSpalten)
    if (-not $JahrSpalten) { $JahrSpalten = $script:JahrSpaltenStandard }
    $treffer = ''
    foreach ($sp in $JahrSpalten) {
        if (-not (ConvertTo-BoolWert (Get-Feld $Zeile $sp))) { continue }
        $gj = ConvertTo-GjAusJahrSpalte $sp
        if ($gj -eq '') { continue }
        if ($treffer -eq '' -or (Get-GjVergleich $gj $treffer) -gt 0) { $treffer = $gj }
    }
    return $treffer
}

function Get-ErsatzGeplantAusZeile {
    <#
      Ersatzjahr: Budget-Häkchen gesetzt -> 2026/2027, sonst Beschaffungsjahr + 5, sonst leer.
    #>
    param($Zeile, [string]$Beschaffungsjahr, [string]$BudgetSpalte = 'Budget20262027', [string]$BudgetGj = '2026/2027')
    if (ConvertTo-BoolWert (Get-Feld $Zeile $BudgetSpalte)) { return $BudgetGj }
    if (Test-Gj $Beschaffungsjahr) { return (Get-GjPlus $Beschaffungsjahr 5) }
    return ''
}

function Get-ComputerNameAusTitel {
    <#
      PC-Name aus dem Titel einer alten Zeile:
      «Shared CAMPUS-001» -> CAMPUS-001, «Kein PC» -> '' (kein Gerät), sonst Grossbuchstaben.
    #>
    param([string]$Titel)
    if (-not $Titel) { return '' }
    $t = $Titel.Trim()
    if ($t -eq '') { return '' }
    if ($t.ToUpperInvariant() -in @('KEIN PC', '(OHNE PC)')) { return '' }
    if ($t -match '^(?i)shared\s+(.+)$') { $t = $Matches[1] }
    return $t.Trim().ToUpperInvariant()
}

function Test-AltZeileIstComputer {
    <# Nur echte Gerätezeilen werden zu Computer-Zeilen: kein «Kein PC», kein «Shared …». #>
    param([string]$Titel)
    if (-not $Titel) { return $false }
    $t = $Titel.Trim()
    if ($t -eq '') { return $false }
    if ($t -match '^(?i)shared\s+') { return $false }
    if ($t.ToUpperInvariant() -in @('KEIN PC', '(OHNE PC)')) { return $false }
    return $true
}

function ConvertTo-ComputerZeile {
    <#
      Alte Zeile -> Felder der Computer-Liste. Gibt $null zurück, wenn die Zeile kein Gerät beschreibt.
    #>
    param($Zeile, [string[]]$SccmSpalten, [string[]]$JahrSpalten)
    $titel = Get-Text $Zeile 'Title'
    if (-not (Test-AltZeileIstComputer $titel)) { return $null }
    $beschaffung = Get-BeschaffungsjahrAusZeile $Zeile $JahrSpalten
    $f = [ordered]@{
        Title            = $titel.ToUpperInvariant()
        Seriennummer     = Get-Text $Zeile 'Seriennummer'
        GebaeudeStock    = Get-Text $Zeile 'GebaeudeStock'
        Bemerkung        = Get-Text $Zeile 'Bemerkung'
        Beschaffungsjahr = $beschaffung
        ErsatzGeplant    = Get-ErsatzGeplantAusZeile $Zeile $beschaffung
    }
    foreach ($sp in $SccmSpalten) {
        $v = Get-Feld $Zeile $sp
        if ($null -ne $v -and -not ($v -is [string] -and ([string]$v).Trim() -eq '')) { $f[$sp] = $v }
    }
    return $f
}

function Merge-ComputerZeile {
    <# Zwei Computer-Zeilen mit gleichem PC-Namen zusammenführen: leere Felder werden gefüllt. #>
    param($Ziel, $Quelle)
    foreach ($k in @($Quelle.Keys)) {
        if ($k -eq 'Title') { continue }
        $alt = $Ziel[$k]
        $leer = ($null -eq $alt -or ($alt -is [string] -and ([string]$alt).Trim() -eq ''))
        if ($leer) { $Ziel[$k] = $Quelle[$k]; continue }
        if ($k -eq 'Bemerkung') {
            $neu = [string]$Quelle[$k]
            if ($neu.Trim() -ne '' -and ([string]$alt) -notlike "*$neu*") { $Ziel[$k] = ([string]$alt) + "`n" + $neu }
        }
    }
    return $Ziel
}

function ConvertTo-BenutzerZeile {
    <#
      Alte Zeile -> Felder der Benutzer-Liste. Gibt $null zurück, wenn kein Login gesetzt ist.
      Anzeigename und Firma stammen aus der alten Liste und werden vom AD-Sync überschrieben.
    #>
    param($Zeile, [string[]]$ProgrammIds)
    $login = Get-Text $Zeile 'Login'
    if ($login -eq '') { return $null }
    $f = [ordered]@{
        Title       = $login
        Anzeigename = Get-Text $Zeile 'Arbeitsplatz'
        Firma       = Get-Text $Zeile 'Firma'
        Computer    = Get-ComputerNameAusTitel (Get-Text $Zeile 'Title')
    }
    foreach ($id in $ProgrammIds) {
        $f[$id] = Get-ProgrammWertAusAlt (Get-Feld $Zeile $id)
    }
    return $f
}

function Merge-BenutzerZeile {
    <#
      Zwei Benutzer-Zeilen mit gleichem Login zusammenführen:
      das erste Gerät gewinnt, Programme werden verodert, leere Textfelder gefüllt.
    #>
    param($Ziel, $Quelle, [string[]]$ProgrammIds)
    foreach ($k in @($Quelle.Keys)) {
        if ($k -eq 'Title') { continue }
        if ($ProgrammIds -contains $k) {
            $a = [string]$Ziel[$k]; $b = [string]$Quelle[$k]
            if ($b -eq '1' -or $b -eq '2') { if ($a -ne '2') { $Ziel[$k] = $b } }
            continue
        }
        $alt = $Ziel[$k]
        if ($null -eq $alt -or ($alt -is [string] -and ([string]$alt).Trim() -eq '')) { $Ziel[$k] = $Quelle[$k] }
    }
    return $Ziel
}

function Build-Migration {
    <#
      Kern der Migration ohne jeden Netzwerkzugriff: bildet aus den Zeilen der alten Liste
      die Computer- und Benutzer-Zeilen und sammelt die AD-Gruppen der Spezial-Software.

      Rückgabe: Objekt mit Computer, Benutzer, AdGruppen (Hashtable Programm-Id -> Gruppennamen),
      Warnungen, OhneLogin, DuplikateComputer, DuplikateBenutzer.
    #>
    param(
        $Zeilen,
        [string[]]$ProgrammIds,
        [string[]]$SpezialIds = @(),
        [string[]]$SccmSpalten = @(),
        [string[]]$JahrSpalten
    )
    $computer = [ordered]@{}
    $benutzer = [ordered]@{}
    $adGruppen = @{}
    $warnungen = New-Object System.Collections.ArrayList
    $ohneLogin = 0
    $dupComputer = 0
    $dupBenutzer = 0

    foreach ($z in $Zeilen) {
        $titel = Get-Text $z 'Title'

        $c = ConvertTo-ComputerZeile $z $SccmSpalten $JahrSpalten
        if ($c) {
            $key = [string]$c.Title
            if ($computer.Contains($key)) {
                $dupComputer++
                [void]$warnungen.Add("Doppelter PC-Name '$key' – Zeilen zusammengeführt.")
                $computer[$key] = Merge-ComputerZeile $computer[$key] $c
            } else {
                $computer[$key] = $c
            }
        }

        $b = ConvertTo-BenutzerZeile $z $ProgrammIds
        if ($b) {
            $key = (NormLogin ([string]$b.Title))
            if ($benutzer.Contains($key)) {
                $dupBenutzer++
                [void]$warnungen.Add("Doppeltes Login '$($b.Title)' – Zeilen zusammengeführt (erstes Gerät gewinnt).")
                $benutzer[$key] = Merge-BenutzerZeile $benutzer[$key] $b $ProgrammIds
            } else {
                $benutzer[$key] = $b
            }
        } else {
            $ohneLogin++
            [void]$warnungen.Add("Zeile ohne Login übersprungen (Titel '$titel').")
        }

        foreach ($id in $SpezialIds) {
            foreach ($g in (Get-AdGruppenAusWert (Get-Feld $z $id))) {
                if (-not $adGruppen.ContainsKey($id)) { $adGruppen[$id] = New-Object System.Collections.ArrayList }
                $vorhanden = $false
                foreach ($x in $adGruppen[$id]) { if ($x.ToLowerInvariant() -eq $g.ToLowerInvariant()) { $vorhanden = $true; break } }
                if (-not $vorhanden) { [void]$adGruppen[$id].Add($g) }
            }
        }
    }

    return [pscustomobject]@{
        Computer          = @($computer.Values)
        Benutzer          = @($benutzer.Values)
        AdGruppen         = $adGruppen
        Warnungen         = @($warnungen)
        OhneLogin         = $ohneLogin
        DuplikateComputer = $dupComputer
        DuplikateBenutzer = $dupBenutzer
    }
}

function Read-KonfigJs {
    <# Liest mandantId, clientId, siteId und listId aus frontend\konfig.js. #>
    param([string]$Pfad)
    $werte = @{}
    if (-not (Test-Path $Pfad)) { return $werte }
    $text = Get-Content $Pfad -Raw -Encoding UTF8
    foreach ($schluessel in @('mandantId', 'clientId', 'siteId', 'listId', 'computerListId', 'benutzerListId')) {
        $m = [regex]::Match($text, ($schluessel + '\s*:\s*"([^"]*)"'))
        if ($m.Success) { $werte[$schluessel] = $m.Groups[1].Value }
    }
    return $werte
}

if ($InventarNurFunktionen) { return }

# ===========================================================================
# Hauptteil
# ===========================================================================
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'Sync-Inventar.config.json' }
$cfg = $null
if (Test-Path $ConfigPath) { $cfg = Read-JsonDatei $ConfigPath }

$KonfigJsPfad = Join-Path $ScriptDir '..\frontend\konfig.js'
$konfigJs = Read-KonfigJs $KonfigJsPfad

$LogPath = Join-Path $ScriptDir 'Migrate-ToTwoLists.log'
if ($cfg -and $cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Migrate-ToTwoLists.log' }
Set-InventarLog $LogPath

if (-not $TenantId) { if ($cfg -and $cfg.TenantId) { $TenantId = $cfg.TenantId } elseif ($konfigJs['mandantId']) { $TenantId = $konfigJs['mandantId'] } }
if (-not $SiteId) { if ($cfg -and $cfg.SiteId) { $SiteId = $cfg.SiteId } elseif ($konfigJs['siteId']) { $SiteId = $konfigJs['siteId'] } }
if (-not $AltListId) { if ($cfg -and $cfg.AltListId) { $AltListId = $cfg.AltListId } elseif ($konfigJs['listId']) { $AltListId = $konfigJs['listId'] } }
if (-not $TenantId) { throw 'TenantId fehlt (Parameter -TenantId, Config oder frontend\konfig.js).' }
if (-not $AltListId) { throw 'AltListId fehlt (Parameter -AltListId, Config-Schlüssel AltListId oder listId in frontend\konfig.js).' }

Log '==== Migration Start ===='
Log "Anmeldeart: $Auth"

if ($Auth -eq 'Certificate') {
    if (-not $cfg) { throw "Für -Auth Certificate wird die Konfigurationsdatei benötigt: $ConfigPath" }
    Set-GraphTokenProvider { Get-GraphTokenZertifikat $cfg }
} else {
    if (-not $ClientId) { if ($konfigJs['clientId']) { $ClientId = $konfigJs['clientId'] } elseif ($cfg -and $cfg.FrontendClientId) { $ClientId = $cfg.FrontendClientId } }
    if (-not $ClientId) { throw 'ClientId fehlt (Parameter -ClientId oder clientId in frontend\konfig.js).' }
    Log "Device-Code-Anmeldung mit ClientId $ClientId"
    Set-GraphToken (Get-GraphTokenDeviceCode -TenantId $TenantId -ClientId $ClientId)
}

# Site bestimmen -------------------------------------------------------------
if (-not $SiteId) {
    if ($cfg -and $cfg.SiteUrl) {
        $u = [uri]$cfg.SiteUrl
        $SiteId = (Invoke-Graph -Uri ("/sites/{0}:{1}" -f $u.Host, $u.AbsolutePath)).id
    } else {
        throw 'SiteId oder SiteUrl fehlt.'
    }
}
Log "Site: $SiteId"

# Schemadateien und Programme ------------------------------------------------
$schemaComputer = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-computer.json'))
$schemaBenutzer = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-benutzer.json'))
$programmeDatei = Join-Path $ScriptDir 'programme.json'
$programme = Read-JsonDatei $programmeDatei
$programmIds = @($programme.programme | ForEach-Object { $_.id })
$spezialIds = @($programme.programme | Where-Object { $_.kategorie -eq 'Spezial-Software' } | ForEach-Object { $_.id })
$sccmSpalten = @($schemaComputer | Where-Object { $_.source -eq 'sccm' } | ForEach-Object { $_.internal })
Log "Schema: $($schemaComputer.Count) Computer-Spalten, $($schemaBenutzer.Count) Benutzer-Spalten, $($programmIds.Count) Programme"

# 1) Alte Liste lesen --------------------------------------------------------
Log "Lese alte Liste $AltListId ..."
$altItems = Get-GraphAlle "/sites/$SiteId/lists/$AltListId/items?`$expand=fields&`$top=200"
Log "Alte Liste: $($altItems.Count) Zeilen"
$altZeilen = @($altItems | ForEach-Object { $_.fields })

# 2) Migration rechnen -------------------------------------------------------
$erg = Build-Migration -Zeilen $altZeilen -ProgrammIds $programmIds -SpezialIds $spezialIds -SccmSpalten $sccmSpalten
Log "Ergebnis: $($erg.Computer.Count) Computer, $($erg.Benutzer.Count) Benutzer"
Log "Duplikate: $($erg.DuplikateComputer) Computer, $($erg.DuplikateBenutzer) Benutzer; $($erg.OhneLogin) Zeilen ohne Login"
foreach ($w in $erg.Warnungen) { Log $w 'WARN' }

# 3) programme.json aufbauen -------------------------------------------------
foreach ($p in $programme.programme) {
    if ($erg.AdGruppen.ContainsKey($p.id)) {
        $p.adGruppen = @($erg.AdGruppen[$p.id])
    }
}
$programme.aktualisiert = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$gefundeneGruppen = 0
foreach ($k in $erg.AdGruppen.Keys) { $gefundeneGruppen += $erg.AdGruppen[$k].Count }
Log "AD-Gruppen aus den Spezial-Spalten: $gefundeneGruppen"
foreach ($k in ($erg.AdGruppen.Keys | Sort-Object)) { Log ("  {0}: {1}" -f $k, ($erg.AdGruppen[$k] -join ', ')) }

$driveOrdner = 'Inventar'
$programmeZielPfad = "$driveOrdner/programme.json"

function Publish-Programme {
    <# Lädt programme.json in die Standard-Dokumentbibliothek der Site (Ordner wird angelegt). #>
    param($Doc, [string]$Ordner, [string]$Pfad)
    $ordnerDa = $true
    try { Invoke-Graph -Uri "/sites/$SiteId/drive/root:/${Ordner}" | Out-Null } catch { $ordnerDa = $false }
    if (-not $ordnerDa) {
        Log "Lege Ordner '$Ordner' in der Dokumentbibliothek an"
        Invoke-Graph -Method POST -Uri "/sites/$SiteId/drive/root/children" -Body @{ name = $Ordner; folder = @{}; '@microsoft.graph.conflictBehavior' = 'fail' } | Out-Null
    }
    $json = $Doc | ConvertTo-Json -Depth 8
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    Invoke-Graph -Method PUT -Uri "/sites/$SiteId/drive/root:/${Pfad}:/content" -Body $bytes -ContentType 'application/json' | Out-Null
    Log "programme.json hochgeladen: $Pfad"
}

if ($WhatIf) {
    Log 'WHATIF: programme.json würde hochgeladen und code\programme.json aktualisiert.'
} else {
    Write-JsonDatei $programme $programmeDatei
    Log "Lokale Kopie aktualisiert: $programmeDatei"
    Publish-Programme $programme $driveOrdner $programmeZielPfad
}

# 4) Listen anlegen ----------------------------------------------------------
function Get-ListeByName {
    param([string]$Name)
    $lists = Invoke-Graph -Uri "/sites/$SiteId/lists?`$select=id,displayName"
    return ($lists.value | Where-Object { $_.displayName -eq $Name } | Select-Object -First 1)
}

function New-InventarListe {
    <#
      Legt eine Liste mit den Spalten aus einem Schema an und benennt die Titelspalte um.
      Vorhandene Listen werden nur um fehlende Spalten ergänzt.
    #>
    param([string]$Name, $Schema, $ZusatzSpalten = @())
    $liste = Get-ListeByName $Name
    $titelSpalte = @($Schema | Where-Object { $_.type -eq 'Title' })[0]
    $spalten = @()
    foreach ($s in $Schema) { if ($s.type -ne 'Title') { $spalten += ConvertTo-GraphSpalte $s } }
    foreach ($z in $ZusatzSpalten) { $spalten += $z }

    if (-not $liste) {
        if ($WhatIf) { Log "WHATIF: Liste '$Name' würde mit $($spalten.Count + 1) Spalten angelegt."; return $null }
        Log "Lege Liste '$Name' an ($($spalten.Count + 1) Spalten) ..."
        $body = [ordered]@{ displayName = $Name; list = @{ template = 'genericList' }; columns = $spalten }
        $liste = Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists" -Body $body
        Log "Liste '$Name' angelegt: $($liste.id)"
    } else {
        Log "Liste '$Name' existiert bereits: $($liste.id)"
        $vorhanden = @{}
        foreach ($c in (Invoke-Graph -Uri "/sites/$SiteId/lists/$($liste.id)/columns?`$select=id,name,displayName").value) { $vorhanden[$c.name] = $c }
        foreach ($sp in $spalten) {
            if ($vorhanden.ContainsKey($sp.name)) { continue }
            if ($WhatIf) { Log "WHATIF: Spalte '$($sp.name)' würde in '$Name' angelegt."; continue }
            Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$($liste.id)/columns" -Body $sp | Out-Null
            Log "  Spalte angelegt: $($sp.name)"
        }
    }

    # Titelspalte umbenennen (PC-Name bzw. Login)
    if ($liste -and $titelSpalte -and -not $WhatIf) {
        $titel = (Invoke-Graph -Uri "/sites/$SiteId/lists/$($liste.id)/columns?`$select=id,name,displayName").value | Where-Object { $_.name -eq 'Title' } | Select-Object -First 1
        if ($titel -and $titel.displayName -ne $titelSpalte.display) {
            Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/lists/$($liste.id)/columns/$($titel.id)" -Body @{ displayName = $titelSpalte.display } | Out-Null
            Log "  Titelspalte umbenannt in '$($titelSpalte.display)'"
        }
    }
    return $liste
}

$programmSpalten = @($programme.programme | ForEach-Object { New-ProgrammSpalte $_ })

$listeComputer = $null
$listeBenutzer = $null
if (-not $ProgrammeOnly) {
    $listeComputer = New-InventarListe $ComputerListName $schemaComputer
    $listeBenutzer = New-InventarListe $BenutzerListName $schemaBenutzer $programmSpalten
} else {
    Log 'ProgrammeOnly: Listen werden nicht angelegt und keine Zeilen geschrieben.'
}

# 5) Zeilen schreiben --------------------------------------------------------
$stats = @{ computer = 0; benutzer = 0; fehler = 0 }

function Write-Zeilen {
    param($Liste, $Zeilen, [string]$Was)
    if (-not $Liste) { return 0 }
    $n = 0
    $vorhanden = @{}
    foreach ($it in (Get-GraphAlle "/sites/$SiteId/lists/$($Liste.id)/items?`$expand=fields(`$select=Title)&`$top=500")) {
        $vorhanden[([string]$it.fields.Title).Trim().ToLowerInvariant()] = $it.id
    }
    foreach ($z in $Zeilen) {
        $key = ([string]$z.Title).Trim().ToLowerInvariant()
        if ($vorhanden.ContainsKey($key)) { continue }
        $felder = [ordered]@{}
        foreach ($k in $z.Keys) {
            $v = $z[$k]
            if ($null -eq $v) { continue }
            if ($v -is [string] -and $v.Trim() -eq '') { continue }
            $felder[$k] = $v
        }
        if ($WhatIf) { $n++; continue }
        try {
            Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$($Liste.id)/items" -Body @{ fields = $felder } | Out-Null
            $n++
            if ($n % 50 -eq 0) { Log "  $Was : $n geschrieben" }
        } catch {
            Log "Fehler beim Anlegen von '$($z.Title)' ($Was): $_" 'ERROR'
            $script:migFehler++
        }
    }
    return $n
}

$script:migFehler = 0
if (-not $ProgrammeOnly) {
    $stats.computer = Write-Zeilen $listeComputer $erg.Computer 'Computer'
    $stats.benutzer = Write-Zeilen $listeBenutzer $erg.Benutzer 'Benutzer'
    $stats.fehler = $script:migFehler
}

# 6) konfig.js aktualisieren -------------------------------------------------
if ($UpdateKonfig -and -not $WhatIf) {
    if (-not (Test-Path $KonfigJsPfad)) {
        Log "konfig.js nicht gefunden: $KonfigJsPfad" 'WARN'
    } else {
        $text = Get-Content $KonfigJsPfad -Raw -Encoding UTF8
        $ersetzungen = [ordered]@{}
        if ($listeComputer) { $ersetzungen['computerListId'] = $listeComputer.id }
        if ($listeBenutzer) { $ersetzungen['benutzerListId'] = $listeBenutzer.id }
        $ersetzungen['programmeDateiPfad'] = $programmeZielPfad
        $basis = ''
        if ($cfg -and $cfg.SiteUrl) { $basis = [string]$cfg.SiteUrl }
        if ($basis) {
            $ersetzungen['sharepointComputerListUrl'] = "$basis/Lists/$ComputerListName/AllItems.aspx"
            $ersetzungen['sharepointBenutzerListUrl'] = "$basis/Lists/$BenutzerListName/AllItems.aspx"
        }
        foreach ($k in $ersetzungen.Keys) {
            $muster = $k + '\s*:\s*"[^"]*"'
            if ([regex]::IsMatch($text, $muster)) {
                $text = [regex]::Replace($text, $muster, ($k + ': "' + $ersetzungen[$k] + '"'))
                Log "konfig.js: $k gesetzt"
            } else {
                Log "konfig.js: Schlüssel '$k' fehlt – bitte von Hand ergänzen: $k`: `"$($ersetzungen[$k])`"" 'WARN'
            }
        }
        [IO.File]::WriteAllText($KonfigJsPfad, $text, (New-Object Text.UTF8Encoding($false)))
        Log "konfig.js aktualisiert: $KonfigJsPfad"
    }
}

# 7) Bericht -----------------------------------------------------------------
Log '---- Bericht ----'
Log "Alte Zeilen gelesen        : $($altZeilen.Count)"
Log "Computer-Zeilen            : $($erg.Computer.Count) (davon zusammengeführt: $($erg.DuplikateComputer))"
Log "Benutzer-Zeilen            : $($erg.Benutzer.Count) (davon zusammengeführt: $($erg.DuplikateBenutzer))"
Log "Zeilen ohne Login          : $($erg.OhneLogin)"
Log "AD-Gruppen gesammelt       : $gefundeneGruppen"
if ($listeComputer) { Log "ComputerListId             : $($listeComputer.id)" }
if ($listeBenutzer) { Log "BenutzerListId             : $($listeBenutzer.id)" }
Log "programme.json             : $programmeZielPfad"
if ($WhatIf) {
    Log 'WHATIF: es wurde nichts geschrieben.'
} else {
    Log "Geschrieben                : $($stats.computer) Computer, $($stats.benutzer) Benutzer, $($stats.fehler) Fehler"
}
Log '==== Migration Ende ===='
if ($stats.fehler -gt 0) { exit 1 }
