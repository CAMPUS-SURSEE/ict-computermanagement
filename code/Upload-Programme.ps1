<#
.SYNOPSIS
  Lädt code\programme.json in die SharePoint-Dokumentbibliothek (produktive Fassung).

.DESCRIPTION
  programme.json ist die einzige Quelle der Programmliste – für den Sync und für das Frontend.
  Produktiv gilt die Datei in SharePoint; dieses Skript bringt die lokale Fassung dorthin.

  Ablauf: bestehende Fassung sichern, hochladen, zur Kontrolle zurücklesen und vergleichen.
  Mit -WhatIf wird nur verglichen, nichts geschrieben.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Upload-Programme.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Upload-Programme.ps1

.NOTES
  Windows PowerShell 5.1. Anmeldung wie beim Sync per Zertifikat, alternativ -Auth DeviceCode.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [ValidateSet('Certificate', 'DeviceCode')]
    [string]$Auth = 'Certificate',
    [string]$ClientId,
    [string]$SicherungsPfad,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy()
[Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')

if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'Sync-Inventar.config.json' }
$cfg = Read-JsonDatei $ConfigPath
$LogPath = Join-Path $ScriptDir 'Upload-Programme.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Upload-Programme.log' }
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
$Pfad = 'Inventar/programme.json'
if ($cfg.ProgrammeDateiPfad) { $Pfad = [string]$cfg.ProgrammeDateiPfad }

Log '==== programme.json hochladen ===='

$lokalPfad = Join-Path $ScriptDir 'programme.json'
$lokalText = Get-Content $lokalPfad -Raw -Encoding UTF8
$lokal = $lokalText | ConvertFrom-Json
Log ("Lokal: {0} Programme, {1} mit AD-Gruppe, aktualisiert {2}" -f `
    @($lokal.programme).Count, @($lokal.programme | Where-Object { @($_.adGruppen).Count -gt 0 }).Count, $lokal.aktualisiert)

# Bestehende Fassung sichern
if (-not $SicherungsPfad) { $SicherungsPfad = Join-Path $ScriptDir ('programme.sicherung.{0}.json' -f (Get-Date).ToString('yyyyMMdd-HHmmss')) }
try {
    $alt = Invoke-Graph -Uri "/sites/$SiteId/drive/root:/${Pfad}:/content"
    Log ("SharePoint bisher: {0} Programme, {1} mit AD-Gruppe, aktualisiert {2}" -f `
        @($alt.programme).Count, @($alt.programme | Where-Object { @($_.adGruppen).Count -gt 0 }).Count, $alt.aktualisiert)
    if (-not $WhatIf) {
        Write-JsonDatei $alt $SicherungsPfad
        Log "Sicherung: $SicherungsPfad"
    }
} catch {
    Log "Bestehende Datei nicht lesbar, sie wird neu angelegt: $_" 'WARN'
}

if ($WhatIf) { Log 'WHATIF: nichts hochgeladen.'; Log '==== Ende ===='; return }

Invoke-Graph -Method PUT -Uri "/sites/$SiteId/drive/root:/${Pfad}:/content" `
    -Body ([Text.Encoding]::UTF8.GetBytes($lokalText)) -ContentType 'application/json' | Out-Null
Log "Hochgeladen: $Pfad"

# Kontrolle
$zurueck = Invoke-Graph -Uri "/sites/$SiteId/drive/root:/${Pfad}:/content"
$gleich = (@($zurueck.programme).Count -eq @($lokal.programme).Count) -and ($zurueck.aktualisiert -eq $lokal.aktualisiert)
Log ("Kontrolle: {0} Programme, aktualisiert {1}" -f @($zurueck.programme).Count, $zurueck.aktualisiert)
if ($gleich) { Log 'Upload bestätigt.' } else { Log 'ABWEICHUNG zwischen lokaler und hochgeladener Fassung.' 'ERROR'; exit 1 }
Log '==== Ende ===='
