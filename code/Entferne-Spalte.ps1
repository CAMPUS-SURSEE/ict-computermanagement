<#
.SYNOPSIS
  Löscht eine Spalte aus einer der Listen «Computer», «Benutzer» oder «Telefonnummern» –
  nach einer Sicherung ihrer Werte.

.DESCRIPTION
  Gegenstück zu Ergaenze-Spalten.ps1, das nie etwas löscht. Dieses Skript entfernt genau eine
  benannte Spalte, und zwar mit den Rechten des angemeldeten Menschen (Device-Code). Vorher
  schreibt es alle Werte der Spalte (Listen-ID, Titel, Wert) als JSON nach lokal\, damit nichts
  unwiederbringlich verloren geht. Die Titelspalte lässt sich nicht löschen.

  Mit -WhatIf wird nur gezählt und gesichert, nicht gelöscht – immer zuerst so laufen lassen.

  Erster Einsatz (2026-09-04): die manuelle Spalte «Seriennummer» der Computer-Liste. Die
  Seriennummer kommt seither ausschliesslich aus SCCM (SCCM_SerialNumber).

.PARAMETER Liste
  Computer, Benutzer oder Telefon.

.PARAMETER Spalte
  Interner Name der Spalte (wie in schema-*.json «internal»), z. B. Seriennummer.

.PARAMETER ClientId
  App-Registrierung für die Device-Code-Anmeldung, siehe Ergaenze-Spalten.ps1.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Entferne-Spalte.ps1 -Liste Computer -Spalte Seriennummer -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Entferne-Spalte.ps1 -Liste Computer -Spalte Seriennummer

.NOTES
  Windows PowerShell 5.1. Danach Build-Spalten.ps1 laufen lassen, falls das Schema geändert wurde.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Computer', 'Benutzer', 'Telefon')]
    [string]$Liste,
    [Parameter(Mandatory = $true)]
    [string]$Spalte,
    [string]$ConfigPath,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy()
[Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

if ($Spalte -eq 'Title') { throw 'Die Titelspalte lässt sich nicht löschen.' }

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$ServerDir = Join-Path $ScriptDir 'server'
. (Join-Path $ServerDir 'Inventar-Gemeinsam.ps1')

if (-not $ConfigPath) { $ConfigPath = Join-Path $ServerDir 'Sync-Inventar.config.json' }
$cfg = Read-JsonDatei $ConfigPath
$LogPath = Join-Path $ScriptDir 'Entferne-Spalte.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Entferne-Spalte.log' }
Set-InventarLog $LogPath

Log "==== Spalte entfernen: $Liste / $Spalte $(if ($WhatIf) { '(WhatIf)' }) ===="

$ListId = switch ($Liste) {
    'Computer' { $cfg.ComputerListId }
    'Benutzer' { $cfg.BenutzerListId }
    'Telefon'  { $cfg.TelefonListId }
}
if (-not $ListId) { throw "Für die Liste «$Liste» steht keine Listen-Id in der Konfiguration." }

Log "Device-Code-Anmeldung mit ClientId $ClientId"
Set-GraphToken (Get-GraphTokenDeviceCode -TenantId $cfg.TenantId -ClientId $ClientId)

$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}

# --- Spalte suchen ---------------------------------------------------------
$spalten = (Invoke-Graph -Uri "/sites/$SiteId/lists/$ListId/columns?`$select=id,name,displayName,readOnly").value
$treffer = @($spalten | Where-Object { $_.name -eq $Spalte })
if ($treffer.Count -eq 0) {
    Log "Spalte «$Spalte» gibt es in der Liste «$Liste» nicht (mehr). Nichts zu tun."
    exit 0
}
$col = $treffer[0]
Log "Gefunden: «$($col.displayName)» (intern $($col.name), Id $($col.id))"

# --- Werte sichern ---------------------------------------------------------
$items = Get-GraphAlle "/sites/$SiteId/lists/$ListId/items?`$expand=fields(`$select=Title,$Spalte)&`$top=500"
$sicherung = New-Object System.Collections.ArrayList
$gefuellt = 0
foreach ($it in $items) {
    $wert = Get-Text $it.fields $Spalte
    if ($wert -ne '') { $gefuellt++ }
    [void]$sicherung.Add([ordered]@{ Id = $it.id; Title = (Get-Text $it.fields 'Title'); Wert = $wert })
}
$lokal = Join-Path (Split-Path -Parent $ScriptDir) 'lokal'
if (-not (Test-Path $lokal)) { New-Item -ItemType Directory -Path $lokal | Out-Null }
$datei = Join-Path $lokal ("Spaltensicherung-{0}-{1}-{2}.json" -f $Liste, $Spalte, (Get-Date -Format 'yyyyMMdd-HHmmss'))
Write-JsonDatei -Objekt @($sicherung) -Pfad $datei
Log "$($items.Count) Zeilen gesichert, davon $gefuellt mit Wert: $datei"

# --- Löschen ---------------------------------------------------------------
if ($WhatIf) {
    Log "WHATIF: Spalte «$Spalte» würde jetzt gelöscht."
    exit 0
}
Invoke-Graph -Method DELETE -Uri "/sites/$SiteId/lists/$ListId/columns/$($col.id)" | Out-Null
Log "Spalte «$Spalte» aus der Liste «$Liste» gelöscht."
