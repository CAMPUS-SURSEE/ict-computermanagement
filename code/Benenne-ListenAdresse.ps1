<#
.SYNOPSIS
  Benennt die Adresse (den internen Namen) einer SharePoint-Liste um.

.DESCRIPTION
  Beim Umbau vom 08.09.2026 bekam die Liste «Computer» den Anzeigenamen «ADMIN-Clients». Der
  interne Name blieb dabei «Computer» – und damit auch die Adresse .../Lists/Computer/. Graph
  kann diesen Namen nicht ändern (er ist dort schreibgeschützt); die SharePoint-REST-Schnittstelle
  kann es, indem sie den Ordner der Liste verschiebt.

  Das Skript meldet sich darum zusätzlich an SharePoint an (eigene Zielgruppe, eigener
  Device-Code) und ruft dann:

      POST /_api/web/getfolderbyserverrelativeurl('<alt>')/moveto(newurl='<neu>')

  «flags» gibt es dort nur für Dateien; ein Ordner kennt allein «newurl».

  Die Listen-ID bleibt dabei unverändert. Sync und Frontend sprechen die Listen ausschliesslich
  über die ID an und merken von der Umbenennung nichts. Alte Lesezeichen auf die frühere
  Adresse laufen danach ins Leere – das ist die einzige Folge.

  Mit -WhatIf wird nur gelesen und der geplante Aufruf ausgegeben.

.PARAMETER ListName
  Anzeigename der Liste (Vorgabe: ADMIN-Clients).

.PARAMETER NeuerName
  Neuer interner Name / Adressbestandteil (Vorgabe: ADMIN-Clients).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Benenne-ListenAdresse.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Benenne-ListenAdresse.ps1

.NOTES
  Windows PowerShell 5.1. Einmalig – nach dem Lauf kann das Skript weg.
#>
[CmdletBinding()]
param(
    [string]$ListName = 'ADMIN-Clients',
    [string]$NeuerName = 'ADMIN-Clients',
    [string]$ConfigPath,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [switch]$NeuAnmelden,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy()
[Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$ServerDir = Join-Path $ScriptDir 'server'
. (Join-Path $ServerDir 'Inventar-Gemeinsam.ps1')
. (Join-Path $ScriptDir 'Graph-Sitzung.ps1')

if (-not $ConfigPath) { $ConfigPath = Join-Path $ServerDir 'Sync-Inventar.config.json' }
$cfg = Get-InventarKonfiguration -KonfigPfad $ConfigPath `
    -FrontendPfad (Join-Path (Split-Path -Parent $ScriptDir) 'frontend\konfig.js')
Set-InventarLog (Join-Path $ScriptDir 'Benenne-ListenAdresse.log')

Log '==== Listen-Adresse umbenennen: Start ===='

# 1) Über Graph feststellen, wie die Liste heute heisst.
Connect-GraphSitzung -TenantId $cfg.TenantId -ClientId $ClientId | Out-Null
$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}
$liste = @((Invoke-Graph -Uri "/sites/$SiteId/lists?`$select=id,name,displayName").value |
        Where-Object { $_.displayName -eq $ListName })
if ($liste.Count -eq 0) { throw "Liste «$ListName» nicht gefunden." }
$alt = [string]$liste[0].name
Log "Liste «$ListName» (Id $($liste[0].id)): interner Name «$alt»"
if ($alt -eq $NeuerName) {
    Log "Der interne Name ist bereits «$NeuerName» – nichts zu tun."
    Log '==== Fertig: 0 Fehler ===='
    return
}

# 2) SharePoint-REST braucht ein eigenes Token (andere Zielgruppe als Graph).
$siteUri = [uri]$cfg.SiteUrl
$ressource = "https://$($siteUri.Host)"
$sitePfad = $siteUri.AbsolutePath.TrimEnd('/')
$altUrl = "$sitePfad/Lists/$alt"
$neuUrl = "$sitePfad/Lists/$NeuerName"
Log "Ordner verschieben: $altUrl  ->  $neuUrl"

if ($WhatIf) {
    Log "WHATIF: POST $ressource$sitePfad/_api/web/getfolderbyserverrelativeurl('$altUrl')/moveto(newurl='$neuUrl')"
    Log '==== Fertig (WHATIF, nichts geändert) ===='
    return
}

$spSitzung = Join-Path (Split-Path -Parent $ScriptDir) 'lokal\graph-sitzung-sharepoint.xml'
$scope = "$ressource/AllSites.Manage offline_access"
$token = $null
$alteSitzung = Read-GraphSitzung $spSitzung
if ($alteSitzung -and -not $NeuAnmelden) {
    try {
        $t = Get-GraphTokenPaarRefresh -TenantId $cfg.TenantId -ClientId $ClientId -RefreshToken $alteSitzung.RefreshToken -Scope $scope
        $token = [string]$t.access_token
        if ($t.refresh_token) { Save-GraphSitzung -Pfad $spSitzung -TenantId $cfg.TenantId -ClientId $ClientId -Scope $scope -RefreshToken ([string]$t.refresh_token) }
        Log 'SharePoint-Sitzung aus der Ablage erneuert.'
    } catch { Log "Abgelegte SharePoint-Sitzung nicht mehr gültig: $($_.Exception.Message)" 'WARN' }
}
if (-not $token) {
    Log "Zweite Anmeldung nötig – diesmal für SharePoint selbst ($ressource), nicht für Graph."
    $t = Get-GraphTokenPaarDeviceCode -TenantId $cfg.TenantId -ClientId $ClientId -Scope $scope
    $token = [string]$t.access_token
    if ($t.refresh_token) { Save-GraphSitzung -Pfad $spSitzung -TenantId $cfg.TenantId -ClientId $ClientId -Scope $scope -RefreshToken ([string]$t.refresh_token) }
}

$kopf = @{ Authorization = "Bearer $token"; Accept = 'application/json;odata=nometadata' }
$api = "$ressource$sitePfad/_api/web/getfolderbyserverrelativeurl('$altUrl')/moveto(newurl='$neuUrl')"
try {
    Invoke-RestMethod -Method Post -Uri $api -Headers $kopf | Out-Null
    Log 'Ordner verschoben.'
} catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $detail = $sr.ReadToEnd() } catch { } }
    Log "Verschieben fehlgeschlagen: $($_.Exception.Message) $detail" 'ERROR'
    Log '==== Fertig: 1 Fehler ===='
    exit 1
}

# 3) Kontrolle über Graph.
$nachher = @((Invoke-Graph -Uri "/sites/$SiteId/lists?`$select=id,name,displayName").value |
        Where-Object { $_.id -eq $liste[0].id })
Log "Kontrolle: Liste $($liste[0].id) heisst jetzt intern «$($nachher[0].name)», angezeigt «$($nachher[0].displayName)»"
if ([string]$nachher[0].name -ne $NeuerName) {
    Log "Der interne Name ist nicht «$NeuerName» – bitte in SharePoint nachsehen." 'ERROR'
    exit 1
}
Log '==== Fertig: 0 Fehler ===='
