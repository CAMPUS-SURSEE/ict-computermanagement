<#
.SYNOPSIS
  Stellt die Inhaberschaft in der Benutzer-Liste vom PC-Namen auf die Listen-ID des Geräts um.

.DESCRIPTION
  Bis Oktober 2026 stand in der Spalte «Computer» der Benutzer-Liste der PC-Name des Geräts,
  dessen Inhaber die Person ist. Damit hing die Inhaberschaft am Namen statt an der Hardware:
  ein in SCCM umbenanntes Gerät verlor seinen Inhaber, und ein neues Gerät mit dem Namen eines
  archivierten erbte ihn. Neu steht in der Spalte «AdminClientId» die Listen-ID der Zeile in
  «ADMIN-Clients». Frontend und Schema sind bereits umgestellt; dieses Skript zieht den Bestand
  nach:

    1. die Spalte «AdminClientId» in der Benutzer-Liste anlegen, falls sie fehlt
       (Definition aus schema-benutzer.json),
    2. ADMIN-Clients und Benutzer lesen und nach lokal\ sichern,
    3. je Person mit einem Namen in «Computer» die Zeile bestimmen – mit derselben Regel, nach
       der das Frontend bisher angezeigt hat: gleicher Name (Gross/Klein egal), bei mehreren
       gleichnamigen die erste nicht archivierte, sonst die erste – und ihre Listen-ID in
       «AdminClientId» schreiben,
    4. mit -AlteSpalteLoeschen: prüfen, dass jede Person mit Namen die passende ID trägt, und
       dann die Spalte «Computer» löschen.

  Idempotent: schon umgestellte Personen bleiben unberührt. Trägt eine Person bereits eine
  andere ID, als der Name ergäbe, wird nichts überschrieben, nur gemeldet (Konflikt). Ein Name
  ohne passende Zeile wird gemeldet und bleibt ohne ID.

  Mit -WhatIf wird gelesen, gesichert und gezählt, aber nichts geschrieben, angelegt oder
  gelöscht – immer zuerst so laufen lassen. Nicht während eines laufenden Syncs starten
  (geplante Aufgabe alle 4 h, siehe README 2.6).

  Reihenfolge (README Abschnitt 11): Frontend veröffentlichen, dieses Skript mit -WhatIf, dann
  ohne, später mit -AlteSpalteLoeschen.

.PARAMETER ConfigPath
  Pfad zu Sync-Inventar.config.json (Standard: server\Sync-Inventar.config.json). Fehlt die
  Datei, genügen die öffentlichen Werte aus frontend\konfig.js.

.PARAMETER ClientId
  App-Registrierung für die Device-Code-Anmeldung, siehe Ergaenze-Spalten.ps1.

.PARAMETER NeuAnmelden
  Erzwingt eine neue Device-Code-Anmeldung statt der abgelegten Sitzung (Graph-Sitzung.ps1).

.PARAMETER AlteSpalteLoeschen
  Nach erfolgreicher Umstellung die Spalte «Computer» löschen. Nur, wenn keine Person mehr
  offen ist (kein Konflikt, kein unbekannter Name, kein Schreibfehler).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Migriere-Inhaberschaft.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Migriere-Inhaberschaft.ps1
  powershell -ExecutionPolicy Bypass -File .\Migriere-Inhaberschaft.ps1 -AlteSpalteLoeschen

.NOTES
  Windows PowerShell 5.1. Braucht ein Konto mit Vollzugriff auf die Site (Spalte anlegen und
  löschen). Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen
  (für Test-Inventar.ps1).
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [switch]$NeuAnmelden,
    [switch]$AlteSpalteLoeschen,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$script:AlteSpalte = 'Computer'
$script:NeueSpalte = 'AdminClientId'

# ---------------------------------------------------------------------------
# Reine Funktionen (testbar ohne Graph)
# ---------------------------------------------------------------------------

function Get-GeraetIdText {
    <#
      Listen-ID aus «AdminClientId» als Text («17»), '' wenn keine brauchbare drinsteht.
      Graph liefert die Zahlenspalte als Zahl (auch 17.0), ältere Exporte als Text.
      Gespiegelt in frontend/modell.js (geraetId).
    #>
    param($Wert)
    if ($null -eq $Wert) { return '' }
    $t = ([string]$Wert).Trim()
    if ($t -notmatch '^\d+([\.,]0+)?$') { return '' }
    $n = [long]($t -replace '[\.,]0+$', '')
    if ($n -le 0) { return '' }
    return [string]$n
}

function Get-InhaberMigration {
    <#
      Plant die Umstellung. $Benutzer: Objekte mit Id, Title, Computer, AdminClientId.
      $Clients: Zeilen der Liste «ADMIN-Clients» mit Id, Title, Status.

      Rückgabe je Person mit Namen oder ID ein Objekt:
        Aktion    'setzen'    ID aus dem Namen eintragen
                  'fertig'    trägt schon die passende ID (oder nur eine ID, keinen Namen)
                  'unbekannt' kein ADMIN-Client heisst so – bleibt ohne ID
                  'konflikt'  trägt eine andere ID, als der Name ergäbe – wird nicht überschrieben
        ClientId  die Listen-ID aus dem Namen ('' bei 'unbekannt')
        Mehrdeutig true, wenn mehrere Zeilen so heissen (gewählt wie bisher im Frontend)

      Die Regel ist die des bisherigen Frontends (Modell.anreichern): gleicher Name nach Trim
      und Kleinschreibung; von mehreren gleichnamigen die erste nicht archivierte in der
      Reihenfolge der Listen-ID, sonst die erste.
    #>
    param($Benutzer, $Clients)

    $nachName = @{}
    $sortiert = @(@($Clients) | Where-Object { $null -ne $_ } | Sort-Object { [long](Get-GeraetIdText (Get-Feld $_ 'Id')) })
    foreach ($c in $sortiert) {
        $k = (Get-Text $c 'Title').ToLowerInvariant()
        if ($k -eq '') { continue }
        if (-not $nachName.ContainsKey($k)) { $nachName[$k] = New-Object System.Collections.ArrayList }
        [void]$nachName[$k].Add($c)
    }

    $plan = New-Object System.Collections.ArrayList
    foreach ($b in @($Benutzer)) {
        if ($null -eq $b) { continue }
        $name = Get-Text $b 'Computer'
        $ist = Get-GeraetIdText (Get-Feld $b 'AdminClientId')
        if ($name -eq '' -and $ist -eq '') { continue }

        $eintrag = [ordered]@{
            BenutzerId = [string](Get-Feld $b 'Id')
            Login      = Get-Text $b 'Title'
            Name       = $name
            IstId      = $ist
            ClientId   = ''
            Mehrdeutig = $false
            Aktion     = ''
        }
        if ($name -eq '') {
            $eintrag.Aktion = 'fertig'
            [void]$plan.Add([pscustomobject]$eintrag)
            continue
        }
        $treffer = @()
        if ($nachName.ContainsKey($name.ToLowerInvariant())) { $treffer = @($nachName[$name.ToLowerInvariant()]) }
        if ($treffer.Count -eq 0) {
            $eintrag.Aktion = 'unbekannt'
            [void]$plan.Add([pscustomobject]$eintrag)
            continue
        }
        $imEinsatz = @($treffer | Where-Object { (Get-StatusNorm (Get-Text $_ 'Status')) -ne 'Archiviert' })
        $gewaehlt = if ($imEinsatz.Count) { $imEinsatz[0] } else { $treffer[0] }
        $eintrag.ClientId = Get-GeraetIdText (Get-Feld $gewaehlt 'Id')
        $eintrag.Mehrdeutig = ($treffer.Count -gt 1)
        if ($ist -eq '') { $eintrag.Aktion = 'setzen' }
        elseif ($ist -eq $eintrag.ClientId) { $eintrag.Aktion = 'fertig' }
        else { $eintrag.Aktion = 'konflikt' }
        [void]$plan.Add([pscustomobject]$eintrag)
    }
    return @($plan.ToArray())
}

if ($InventarNurFunktionen) { return }

# ---------------------------------------------------------------------------
# Hauptteil
# ---------------------------------------------------------------------------

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

$LogPath = Join-Path $ScriptDir 'Migriere-Inhaberschaft.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Migriere-Inhaberschaft.log' }
Set-InventarLog $LogPath

function Get-ListId([string]$Wert) {
    $t = ([string]$Wert).Trim()
    if ($t -match '^<') { return '' }
    return $t
}

$Alt = $script:AlteSpalte
$Neu = $script:NeueSpalte
Log "==== Inhaberschaft: «$Alt» (PC-Name) -> «$Neu» (Listen-ID) $(if ($WhatIf) { '(WhatIf)' }) ===="

$AdminListId = Get-ListId $cfg.AdminClientListId
$BenutzerListId = Get-ListId $cfg.BenutzerListId
if (-not $AdminListId) { throw 'AdminClientListId fehlt in der Konfiguration.' }
if (-not $BenutzerListId) { throw 'BenutzerListId fehlt in der Konfiguration.' }

Connect-GraphSitzung -TenantId $cfg.TenantId -ClientId $ClientId -Neu:$NeuAnmelden | Out-Null

$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}
$benutzerBase = "/sites/$SiteId/lists/$BenutzerListId"

# --- Spalten ---------------------------------------------------------------
function Get-BenutzerSpalten {
    $h = @{}
    foreach ($c in (Invoke-Graph -Uri "$benutzerBase/columns?`$select=id,name,displayName").value) { $h[[string]$c.name] = $c }
    return $h
}
$spalten = Get-BenutzerSpalten
if (-not $spalten.ContainsKey($Alt)) {
    Log "Die Spalte «$Alt» gibt es in der Benutzer-Liste nicht (mehr). Nichts zu tun."
    exit 0
}
$neuVorhanden = $spalten.ContainsKey($Neu)
if (-not $neuVorhanden) {
    $def = @(Read-JsonDatei (Join-Path $ScriptDir 'schema-benutzer.json') | Where-Object { $_.internal -eq $Neu })
    if ($def.Count -ne 1) { throw "schema-benutzer.json kennt die Spalte «$Neu» nicht." }
    if ($WhatIf) {
        Log "WHATIF: Spalte «$Neu» würde in der Benutzer-Liste angelegt."
    } else {
        try {
            Invoke-Graph -Method POST -Uri "$benutzerBase/columns" -Body (ConvertTo-GraphSpalte $def[0]) | Out-Null
            Log "Spalte «$Neu» angelegt."
            $neuVorhanden = $true
        } catch {
            throw "Spalte «$Neu» konnte nicht angelegt werden: $_$(Get-SpaltenHinweis $_)"
        }
    }
} else {
    Log "Spalte «$Neu» ist schon da."
}

# --- Lesen und sichern -----------------------------------------------------
function Get-BenutzerZeilen {
    $felder = "Title,$Alt"
    if ($neuVorhanden) { $felder += ",$Neu" }
    $zeilen = New-Object System.Collections.ArrayList
    foreach ($it in (Get-GraphAlle "$benutzerBase/items?`$expand=fields(`$select=$felder)&`$top=500")) {
        [void]$zeilen.Add([pscustomobject]@{
                Id            = [string]$it.id
                Title         = Get-Text $it.fields 'Title'
                Computer      = Get-Text $it.fields $Alt
                AdminClientId = Get-Feld $it.fields $Neu
            })
    }
    return @($zeilen.ToArray())
}

$clients = New-Object System.Collections.ArrayList
foreach ($it in (Get-GraphAlle "/sites/$SiteId/lists/$AdminListId/items?`$expand=fields(`$select=Title,Status)&`$top=500")) {
    [void]$clients.Add([pscustomobject]@{ Id = [string]$it.id; Title = (Get-Text $it.fields 'Title'); Status = (Get-Text $it.fields 'Status') })
}
$benutzer = Get-BenutzerZeilen
$plan = @(Get-InhaberMigration $benutzer $clients)
Log "$($clients.Count) ADMIN-Clients, $($benutzer.Count) Benutzer, $($plan.Count) davon mit Gerät."

$lokal = Join-Path (Split-Path -Parent $ScriptDir) 'lokal'
if (-not (Test-Path $lokal)) { New-Item -ItemType Directory -Path $lokal | Out-Null }
$datei = Join-Path $lokal ("Migration-Inhaberschaft-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Write-JsonDatei -Objekt ([ordered]@{ Benutzer = $benutzer; Clients = @($clients.ToArray()); Plan = $plan }) -Pfad $datei
Log "Sicherung: $datei"

# --- Umstellen -------------------------------------------------------------
$stats = @{ gesetzt = 0; fertig = 0; unbekannt = 0; konflikt = 0; mehrdeutig = 0; fehler = 0 }
foreach ($p in $plan) {
    $wer = "$($p.Login) (ID $($p.BenutzerId))"
    if ($p.Mehrdeutig) {
        $stats.mehrdeutig++
        Log "$wer`: «$($p.Name)» heisst mehrfach – gewählt wie bisher im Frontend: Listen-ID $($p.ClientId)." 'WARN'
    }
    switch ($p.Aktion) {
        'fertig' { $stats.fertig++; continue }
        'unbekannt' {
            $stats.unbekannt++
            Log "$wer`: kein ADMIN-Client heisst «$($p.Name)» – bleibt ohne Gerät. Auf der Benutzerseite ein Gerät zuweisen." 'WARN'
            continue
        }
        'konflikt' {
            $stats.konflikt++
            Log "$wer`: trägt schon Listen-ID $($p.IstId), der Name «$($p.Name)» ergäbe $($p.ClientId) – nicht überschrieben. Auf der Benutzerseite prüfen." 'WARN'
            continue
        }
        'setzen' {
            if ($WhatIf) { Log "WHATIF $wer`: «$($p.Name)» -> Listen-ID $($p.ClientId)"; $stats.gesetzt++; continue }
            if (-not $neuVorhanden) { continue }
            try {
                Invoke-Graph -Method PATCH -Uri "$benutzerBase/items/$($p.BenutzerId)/fields" -Body @{ $Neu = [long]$p.ClientId } | Out-Null
                $stats.gesetzt++
                Log "$wer`: «$($p.Name)» -> Listen-ID $($p.ClientId)"
            } catch {
                $stats.fehler++
                Log "$wer`: Schreiben fehlgeschlagen – $($_.Exception.Message)" 'ERROR'
            }
        }
    }
}
Log ("Umstellung: {0} gesetzt, {1} schon umgestellt, {2} ohne passendes Gerät, {3} Konflikte, {4} mehrdeutige Namen, {5} Fehler" -f `
        $stats.gesetzt, $stats.fertig, $stats.unbekannt, $stats.konflikt, $stats.mehrdeutig, $stats.fehler)

# --- Alte Spalte löschen ---------------------------------------------------
if (-not $AlteSpalteLoeschen) {
    Log "Spalte «$Alt» bleibt stehen. Später mit -AlteSpalteLoeschen entfernen."
    if ($stats.fehler) { exit 1 }
    exit 0
}
if ($WhatIf) {
    Log "WHATIF: Spalte «$Alt» würde gelöscht, sofern danach keine Person mehr offen ist."
    exit 0
}
$offen = $stats.unbekannt + $stats.konflikt + $stats.fehler
if ($offen -gt 0) {
    Log "Spalte «$Alt» wird NICHT gelöscht: $offen Personen sind offen (siehe WARN/ERROR oben). Bereinigen, dann erneut starten." 'ERROR'
    exit 1
}
# Kontrolle direkt aus SharePoint: jede Person mit Namen muss jetzt die passende ID tragen.
$kontrolle = @(Get-InhaberMigration (Get-BenutzerZeilen) $clients | Where-Object { $_.Aktion -ne 'fertig' })
if ($kontrolle.Count -gt 0) {
    Log "Spalte «$Alt» wird NICHT gelöscht: $($kontrolle.Count) Personen tragen noch keine passende ID (z. B. $($kontrolle[0].Login))." 'ERROR'
    exit 1
}
Invoke-Graph -Method DELETE -Uri "$benutzerBase/columns/$($spalten[$Alt].id)" | Out-Null
Log "Spalte «$Alt» aus der Benutzer-Liste gelöscht. Fertig."
