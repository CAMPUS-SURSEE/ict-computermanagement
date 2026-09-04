<#
.SYNOPSIS
  Legt in den Listen «Computer», «Benutzer» und «Telefonnummern» alle Spalten an, die laut
  schema-computer.json, schema-benutzer.json, schema-telefon.json und programme.json fehlen.

.DESCRIPTION
  Der Sync ändert die Struktur der Listen bewusst nie – er füllt nur Daten und meldet fehlende
  Spalten als WARN. Dieses Skript ist die Gegenseite: es legt die fehlenden Spalten an, und zwar
  mit den Rechten des angemeldeten Menschen (Device-Code). Die Entra-App des Syncs hat auf der
  Site nur Schreibrecht auf Zeilen und bleibt davon unberührt.

  Idempotent: vorhandene Spalten bleiben unangetastet, es wird nie eine gelöscht oder geändert.
  Mit -WhatIf wird nur aufgelistet, was fehlt – immer zuerst so laufen lassen.

.PARAMETER Auth
  DeviceCode (Vorgabe, Anmeldung im Browser) oder Certificate (Anmeldung wie der Sync; scheitert
  beim Anlegen mit 403, solange die App auf der Site nur die Rolle «write» hat).

.PARAMETER ClientId
  App-Registrierung für die Device-Code-Anmeldung. Vorgabe ist der öffentliche Client «Microsoft
  Graph PowerShell». Die Frontend-Registrierung taugt dafür nicht: bei ihr steht «Allow public
  client flows» auf Nein, sie weist den Device-Code-Flow mit AADSTS7000218 ab.

.PARAMETER Listen
  Welche Listen geprüft werden: Computer, Benutzer, Telefon oder Alle (Vorgabe).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Ergaenze-Spalten.ps1

.NOTES
  Windows PowerShell 5.1. Nach dem Lauf Sync-Inventar.ps1 -WhatIf zur Kontrolle ausführen.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [ValidateSet('DeviceCode', 'Certificate')]
    [string]$Auth = 'DeviceCode',
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [ValidateSet('Alle', 'Computer', 'Benutzer', 'Telefon')]
    [string[]]$Listen = @('Alle'),
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

if (-not $ConfigPath) { $ConfigPath = Join-Path $ServerDir 'Sync-Inventar.config.json' }
$cfg = Read-JsonDatei $ConfigPath
$LogPath = Join-Path $ScriptDir 'Ergaenze-Spalten.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Ergaenze-Spalten.log' }
Set-InventarLog $LogPath

Log '==== Spalten ergänzen: Start ===='

if ($Auth -eq 'Certificate') {
    Set-GraphTokenProvider { Get-GraphTokenZertifikat $cfg }
} else {
    if (-not $ClientId) { throw 'ClientId fehlt (Parameter -ClientId).' }
    Log "Device-Code-Anmeldung mit ClientId $ClientId"
    Set-GraphToken (Get-GraphTokenDeviceCode -TenantId $cfg.TenantId -ClientId $ClientId)
}

$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}

$fehler = 0
$angelegt = 0
$offen = 0

function Sync-Spalten {
    <#
      Gleicht eine Liste gegen eine Spaltendefinition ab und legt an, was fehlt.
      Die Titelspalte wird nie angefasst; sie existiert immer und heisst je Liste anders.
    #>
    param([string]$Name, [string]$ListId, $Spalten)
    if (-not $ListId) { Log "$Name`: keine Listen-Id in der Konfiguration – übersprungen." 'WARN'; return }

    $vorhanden = @{}
    foreach ($c in (Invoke-Graph -Uri "/sites/$SiteId/lists/$ListId/columns?`$select=id,name,displayName").value) {
        if ($c.name) { $vorhanden[[string]$c.name] = $true }
        if ($c.displayName) { $vorhanden[[string]$c.displayName] = $true }
    }
    $fehlend = @($Spalten | Where-Object { -not ($vorhanden.ContainsKey([string]$_.name) -or $vorhanden.ContainsKey([string]$_.displayName)) })
    Log "$Name`: $(@($Spalten).Count) Spalten erwartet, $($fehlend.Count) fehlen."

    foreach ($s in $fehlend) {
        if ($WhatIf) { Log "  WHATIF: Spalte '$($s.name)' würde angelegt."; $script:offen++; continue }
        try {
            Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$ListId/columns" -Body $s | Out-Null
            Log "  Spalte angelegt: $($s.name)"
            $script:angelegt++
        } catch {
            Log "  Spalte '$($s.name)' konnte nicht angelegt werden: $_$(Get-SpaltenHinweis $_)" 'ERROR'
            $script:fehler++
        }
    }
}

$alle = ($Listen -contains 'Alle')

if ($alle -or $Listen -contains 'Computer') {
    $schema = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-computer.json'))
    $spalten = @($schema | Where-Object { $_.internal -ne 'Title' } | ForEach-Object { ConvertTo-GraphSpalte $_ })
    Sync-Spalten 'Computer' ([string]$cfg.ComputerListId) $spalten
}

if ($alle -or $Listen -contains 'Benutzer') {
    $schema = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-benutzer.json'))
    $spalten = @($schema | Where-Object { $_.internal -ne 'Title' } | ForEach-Object { ConvertTo-GraphSpalte $_ })
    # Programmspalten stehen nicht im Schema, sondern in programme.json (Quelle der Wahrheit).
    $programme = $null
    try { $programme = Invoke-Graph -Uri "/sites/$SiteId/drive/root:/$([string]$cfg.ProgrammeDateiPfad):/content" }
    catch { Log "programme.json aus SharePoint nicht lesbar – verwende die lokale Kopie: $_" 'WARN' }
    if (-not $programme) { $programme = Read-JsonDatei (Join-Path $ServerDir 'programme.json') }
    $spalten += @($programme.programme | ForEach-Object { New-ProgrammSpalte $_ })
    Sync-Spalten 'Benutzer' ([string]$cfg.BenutzerListId) $spalten
}

if ($alle -or $Listen -contains 'Telefon') {
    $telefonListId = [string]$cfg.TelefonListId
    if ($telefonListId -match '^<') { $telefonListId = '' }   # Platzhalter aus der Vorlage
    $schema = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-telefon.json'))
    $spalten = @($schema | Where-Object { $_.internal -ne 'Title' } | ForEach-Object { ConvertTo-GraphSpalte $_ })
    Sync-Spalten 'Telefonnummern' $telefonListId $spalten
}

if ($WhatIf) {
    Log "==== Fertig: $offen Spalten würden angelegt, $fehler Fehler ===="
} else {
    Log "==== Fertig: $angelegt Spalten angelegt, $fehler Fehler ===="
}
if ($fehler) { exit 1 }
