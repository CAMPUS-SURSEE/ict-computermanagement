<#
.SYNOPSIS
  Legt in den Listen «ADMIN-Clients», «EDU-Clients», «Benutzer», «Telefonnummern» und «Software»
  alle Spalten an, die laut den Schemadateien und der Liste «Software» fehlen.

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

.PARAMETER NeuAnmelden
  Erzwingt eine neue Device-Code-Anmeldung, statt die abgelegte Sitzung zu verwenden
  (lokal\graph-sitzung.xml, siehe Graph-Sitzung.ps1).

.PARAMETER Listen
  Welche Listen geprüft werden: Admin, Edu, Benutzer, Telefon, Software oder Alle (Vorgabe).
  Die Programmspalten der Benutzer-Liste kommen aus der Liste «Software»; sie muss dafür
  schon bestehen (Migriere-Clients.ps1 legt sie an).

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
    [ValidateSet('Alle', 'Admin', 'Edu', 'Benutzer', 'Telefon', 'Software')]
    [string[]]$Listen = @('Alle'),
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
if ($Auth -eq 'Certificate' -and -not (Test-Path $ConfigPath)) {
    throw "-Auth Certificate braucht $ConfigPath (Zertifikat-Thumbprint und ClientId)."
}
$LogPath = Join-Path $ScriptDir 'Ergaenze-Spalten.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Ergaenze-Spalten.log' }
Set-InventarLog $LogPath

Log '==== Spalten ergänzen: Start ===='

if ($Auth -eq 'Certificate') {
    Set-GraphTokenProvider { Get-GraphTokenZertifikat $cfg }
} else {
    if (-not $ClientId) { throw 'ClientId fehlt (Parameter -ClientId).' }
    Connect-GraphSitzung -TenantId $cfg.TenantId -ClientId $ClientId -Neu:$NeuAnmelden | Out-Null
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

function Get-ListId([string]$Wert) {
    # Platzhalter aus der Vorlage («<...>») gelten als «nicht konfiguriert».
    $t = ([string]$Wert).Trim()
    if ($t -match '^<') { return '' }
    return $t
}

function Get-SchemaSpalten([string]$Datei) {
    $schema = @(Read-JsonDatei (Join-Path $ScriptDir $Datei))
    return @($schema | Where-Object { $_.internal -ne 'Title' } | ForEach-Object { ConvertTo-GraphSpalte $_ })
}

$alle = ($Listen -contains 'Alle')

# Beide Client-Listen haben dieselben Spalten und teilen sich schema-client.json.
if ($alle -or $Listen -contains 'Admin') {
    Sync-Spalten 'ADMIN-Clients' (Get-ListId $cfg.AdminClientListId) (Get-SchemaSpalten 'schema-client.json')
}

if ($alle -or $Listen -contains 'Edu') {
    Sync-Spalten 'EDU-Clients' (Get-ListId $cfg.EduClientListId) (Get-SchemaSpalten 'schema-client.json')
}

if ($alle -or $Listen -contains 'Software') {
    Sync-Spalten 'Software' (Get-ListId $cfg.SoftwareListId) (Get-SchemaSpalten 'schema-software.json')
}

if ($alle -or $Listen -contains 'Benutzer') {
    $spalten = Get-SchemaSpalten 'schema-benutzer.json'
    # Programmspalten stehen nicht im Schema, sondern in der Liste «Software» (Quelle der Wahrheit).
    # Im Normalfall legt das Frontend sie beim Erfassen eines Programms gleich mit an; dieses
    # Skript ist der Reparaturweg, wenn eine Spalte fehlt.
    $softwareListId = Get-ListId $cfg.SoftwareListId
    if (-not $softwareListId) {
        Log 'SoftwareListId fehlt in der Konfiguration – die Programmspalten werden nicht geprüft.' 'WARN'
    } else {
        try {
            $swItems = Get-GraphAlle "/sites/$SiteId/lists/$softwareListId/items?`$expand=fields(`$select=Title,Name,Kategorie,AdGruppen,Reihenfolge)&`$top=500"
            foreach ($it in $swItems) {
                $prog = ConvertTo-Programm $it.fields
                if ($null -eq $prog) { continue }
                if (-not (Test-ProgrammId $prog.id)) {
                    Log "Software-Liste: «$($prog.id)» taugt nicht als Spaltenname – übergangen." 'WARN'
                    continue
                }
                $spalten += (New-ProgrammSpalte $prog)
            }
        } catch {
            Log "Liste «Software» nicht lesbar – die Programmspalten werden nicht geprüft: $_" 'ERROR'
            $fehler++
        }
    }
    Sync-Spalten 'Benutzer' (Get-ListId $cfg.BenutzerListId) $spalten
}

if ($alle -or $Listen -contains 'Telefon') {
    Sync-Spalten 'Telefonnummern' (Get-ListId $cfg.TelefonListId) (Get-SchemaSpalten 'schema-telefon.json')
}

if ($WhatIf) {
    Log "==== Fertig: $offen Spalten würden angelegt, $fehler Fehler ===="
} else {
    Log "==== Fertig: $angelegt Spalten angelegt, $fehler Fehler ===="
}
if ($fehler) { exit 1 }
