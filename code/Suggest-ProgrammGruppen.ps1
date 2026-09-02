<#
.SYNOPSIS
  Schlägt für Programme ohne AD-Gruppe passende AD-Gruppen vor und schreibt sie nach programme.json.

.DESCRIPTION
  Wird von Hand ausgeführt. Das Skript
   1. lädt programme.json (aus SharePoint, sonst die lokale Kopie),
   2. liest die AD-Gruppen (gefiltert über AdGruppenPraefixe aus der Konfiguration; ohne Präfixe
      alle Sicherheitsgruppen),
   3. vergleicht die normalisierten Namen (Kleinbuchstaben, nur a-z und 0-9) und schlägt Gruppen vor,
      deren Name den Programmnamen bzw. die Programm-Id enthält oder umgekehrt (mindestens 4 Zeichen),
   4. schreibt die Treffer in das Feld «vorschlaege» und lädt programme.json wieder hoch.

  Vorschläge sind wirkungslos, bis sie jemand von Hand nach «adGruppen» verschiebt.
  Mit -WhatIf wird nur angezeigt, nichts geschrieben.

.NOTES
  Windows PowerShell 5.1. Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [ValidateSet('Certificate', 'DeviceCode')]
    [string]$Auth = 'Certificate',
    [switch]$WhatIf,
    [switch]$AuchMitGruppen,
    [string]$ClientId
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy(); [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')

# ===========================================================================
# Reine Funktionen
# ===========================================================================
function Get-NameNormalisiert {
    <# Name auf Kleinbuchstaben und Ziffern reduzieren: «Adobe Photoshop CS6» -> «adobephotoshopcs6». #>
    param([string]$Name)
    if (-not $Name) { return '' }
    $n = $Name.ToLowerInvariant()
    $n = $n -replace 'ä', 'ae' -replace 'ö', 'oe' -replace 'ü', 'ue' -replace 'ß', 'ss'
    return ($n -replace '[^a-z0-9]', '')
}

function Get-GruppenVorschlaege {
    <#
      Kandidaten für ein Programm ermitteln. Verglichen werden die normalisierten Namen:
      Der Gruppenname enthält den Programmnamen oder die Programm-Id (oder umgekehrt).
      Zeichenketten unter 4 Zeichen werden ignoriert, sonst passt fast alles auf fast alles.
    #>
    param($Programm, [string[]]$Gruppennamen, [int]$MindestLaenge = 4)
    $treffer = New-Object System.Collections.ArrayList
    $schluessel = @()
    foreach ($s in @((Get-NameNormalisiert ([string]$Programm.name)), (Get-NameNormalisiert ([string]$Programm.id)))) {
        if ($s.Length -ge $MindestLaenge -and $schluessel -notcontains $s) { $schluessel += $s }
    }
    if ($schluessel.Count -eq 0) { return @() }
    foreach ($g in $Gruppennamen) {
        $gn = Get-NameNormalisiert $g
        if ($gn.Length -lt $MindestLaenge) { continue }
        foreach ($s in $schluessel) {
            if ($gn.Contains($s) -or $s.Contains($gn)) {
                if (-not $treffer.Contains($g)) { [void]$treffer.Add($g) }
                break
            }
        }
    }
    return @($treffer)
}

function Get-DomainDnAusOu {
    <# Domänen-DN aus einem OU-DN ableiten: alle DC=-Teile. #>
    param([string]$Dn)
    if (-not $Dn) { return '' }
    $teile = @()
    foreach ($t in ($Dn -split ',')) {
        $x = $t.Trim()
        if ($x -match '^(?i)DC=') { $teile += $x }
    }
    return ($teile -join ',')
}

if ($InventarNurFunktionen) { return }

# ===========================================================================
# Hauptteil
# ===========================================================================
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'Sync-Inventar.config.json' }
$cfg = Read-JsonDatei $ConfigPath
$LogPath = Join-Path $ScriptDir 'Suggest-ProgrammGruppen.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Suggest-ProgrammGruppen.log' }
Set-InventarLog $LogPath

if ($Auth -eq 'Certificate') {
    Set-GraphTokenProvider { Get-GraphTokenZertifikat $cfg }
} else {
    if (-not $ClientId) { $ClientId = [string]$cfg.FrontendClientId }
    if (-not $ClientId) { throw 'ClientId fehlt (Parameter -ClientId oder FrontendClientId in der Konfiguration).' }
    Set-GraphToken (Get-GraphTokenDeviceCode -TenantId $cfg.TenantId -ClientId $ClientId)
}

$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}
$ProgrammeDateiPfad = 'Inventar/programme.json'
if ($cfg.ProgrammeDateiPfad) { $ProgrammeDateiPfad = [string]$cfg.ProgrammeDateiPfad }

Log '==== Vorschläge für Programm-Gruppen ===='

# programme.json laden
$programme = $null
try { $programme = Invoke-Graph -Uri "/sites/$SiteId/drive/root:/${ProgrammeDateiPfad}:/content" }
catch { Log "programme.json aus SharePoint nicht lesbar: $_" 'WARN' }
if (-not $programme) {
    $programme = Read-JsonDatei (Join-Path $ScriptDir 'programme.json')
    Log 'Verwende lokale Kopie code\programme.json' 'WARN'
}

# AD-Gruppen lesen
$adServer = [string]$cfg.AdServer
$praefixe = @()
if ($cfg.AdGruppenPraefixe) { $praefixe = @($cfg.AdGruppenPraefixe) }
$domainDn = ''
foreach ($ou in @($cfg.AdUserOUs)) { $domainDn = Get-DomainDnAusOu ([string]$ou); if ($domainDn) { break } }
if (-not $domainDn) { throw 'Domänen-DN konnte nicht aus AdUserOUs abgeleitet werden.' }

function Get-AdGruppenNamen {
    param([string]$DomainDn, [string]$Server, [string[]]$Praefixe)
    $filter = '(&(objectCategory=group)(groupType:1.2.840.113556.1.4.803:=2147483648))'
    if ($Praefixe -and $Praefixe.Count -gt 0) {
        $oder = ''
        foreach ($p in $Praefixe) { $oder += "(sAMAccountName=$p*)" }
        $filter = "(&(objectCategory=group)(|$oder))"
    }
    $pfad = "LDAP://$DomainDn"
    if ($Server) { $pfad = "LDAP://$Server/$DomainDn" }
    $wurzel = New-Object DirectoryServices.DirectoryEntry($pfad)
    $s = New-Object DirectoryServices.DirectorySearcher($wurzel)
    $s.Filter = $filter
    $s.PageSize = 1000
    $s.SearchScope = 'Subtree'
    [void]$s.PropertiesToLoad.Add('samaccountname')
    $namen = New-Object System.Collections.ArrayList
    foreach ($r in $s.FindAll()) {
        if ($r.Properties.Contains('samaccountname') -and $r.Properties['samaccountname'].Count -gt 0) {
            [void]$namen.Add([string]$r.Properties['samaccountname'][0])
        }
    }
    $s.Dispose()
    return $namen
}

$gruppen = @(Get-AdGruppenNamen $domainDn $adServer $praefixe)
Log "AD-Gruppen gefunden: $($gruppen.Count)"

$anzahl = 0
foreach ($p in $programme.programme) {
    if (-not $AuchMitGruppen -and @($p.adGruppen).Count -gt 0) { continue }
    $v = Get-GruppenVorschlaege $p $gruppen
    $p.vorschlaege = @($v)
    if ($v.Count -gt 0) {
        $anzahl++
        Log ("{0} ({1}): {2}" -f $p.id, $p.name, ($v -join ', '))
    }
}
Log "Programme mit Vorschlägen: $anzahl"

if ($WhatIf) {
    Log 'WHATIF: programme.json wurde nicht geschrieben.'
} else {
    $programme.aktualisiert = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    Write-JsonDatei $programme (Join-Path $ScriptDir 'programme.json')
    $json = $programme | ConvertTo-Json -Depth 8
    Invoke-Graph -Method PUT -Uri "/sites/$SiteId/drive/root:/${ProgrammeDateiPfad}:/content" -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json' | Out-Null
    Log "programme.json aktualisiert und hochgeladen ($ProgrammeDateiPfad)"
}
Log '==== Ende ===='
