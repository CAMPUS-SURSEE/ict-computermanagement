<#
.SYNOPSIS
  Überführt die Spalte «Früherer Eintrag» der Liste «Telefonnummern» in den Verlauf und löscht sie.

.DESCRIPTION
  Die Spalte «Früherer Eintrag» stammt aus dem Excel-Import vom 04.09.2026 («wer die Nummer vorher
  hatte»). Sie war eine zweite, unstrukturierte Historie neben dem Verlauf. Dieses Skript räumt das
  in einem Lauf auf – es braucht nur die Device-Code-Anmeldung, alles Weitere passiert von selbst:

    1. alle Zeilen der Telefonliste lesen und als JSON nach lokal\ sichern (Id, Kurzwahl, alter
       Wert, alter Verlauf),
    2. für jede Zeile mit Wert einen Verlaufseintrag anhängen
         «Früherer Eintrag: <Wert> (aus der alten Telefonliste S4B übernommen)»
       mit Datum 31.07.2026 (Stand der alten Liste) und Quelle «sync», danach die Spalte leeren.
       Idempotent: Zeilen, deren Verlauf den Eintrag schon enthält, werden nur geleert.
       Zeilen mit unlesbarem Verlauf werden übersprungen und gemeldet – nichts wird überschrieben.
    3. prüfen, dass keine Zeile mehr einen Wert trägt, und dann die Spalte löschen
       (mit -SpalteBehalten bleibt sie stehen).

  Mit -WhatIf wird gelesen, gesichert und gezählt, aber nichts geschrieben oder gelöscht –
  immer zuerst so laufen lassen. Nicht während eines laufenden Syncs starten (geplante Aufgabe
  alle 4 h, siehe README 2.6); der Sync hängt selbst Verlaufseinträge an.

  Danach im Repository: schema-telefon.json ist bereits ohne die Spalte, Build-Spalten.ps1 hat
  spalten.js neu erzeugt, telefon.js zeigt das Feld nicht mehr. Dieses Skript ist der einzige
  noch offene Schritt.

.PARAMETER ConfigPath
  Pfad zu Sync-Inventar.config.json (Standard: server\Sync-Inventar.config.json).

.PARAMETER ClientId
  App-Registrierung für die Device-Code-Anmeldung, siehe Ergaenze-Spalten.ps1.

.PARAMETER SpalteBehalten
  Werte migrieren und leeren, die Spalte aber nicht löschen.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Migriere-FruehererEintrag.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Migriere-FruehererEintrag.ps1

.NOTES
  Windows PowerShell 5.1. Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen
  (für Test-Inventar.ps1).
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [switch]$SpalteBehalten,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$script:MigrationSpalte = 'FruehererEintrag'
$script:MigrationStand = '2026-07-31'   # Stand der alten Excel-Liste

# ---------------------------------------------------------------------------
# Reine Funktionen (testbar ohne Graph)
# ---------------------------------------------------------------------------

function Get-FruehererEintragText {
    <# Der Text des Verlaufseintrags für einen Wert der alten Spalte. #>
    param([string]$Wert)
    return ('Früherer Eintrag: {0} (aus der alten Telefonliste S4B übernommen)' -f ([string]$Wert).Trim())
}

function Get-FruehererEintragMigration {
    <#
      Berechnet den neuen Verlauf einer Zeile. Gibt ein Objekt zurück:
        Aktion   'ueberspringen' (kein Wert), 'leeren' (Eintrag schon im Verlauf, nur Spalte leeren),
                 'anhaengen' (Eintrag anhängen und Spalte leeren)
        Verlauf  der neue Spaltentext (nur bei 'anhaengen')
      Wirft bei unlesbarem Verlauf – der Aufrufer meldet die Zeile und lässt sie in Ruhe.
    #>
    param([string]$Verlauf, [string]$Wert, $Zeitpunkt)
    $w = ([string]$Wert).Trim()
    if ($w -eq '') { return [pscustomobject]@{ Aktion = 'ueberspringen'; Verlauf = $null } }
    $text = Get-FruehererEintragText $w
    $bestehend = @(ConvertFrom-Verlauf -Text $Verlauf -Streng)
    foreach ($e in $bestehend) {
        if ($e.text -eq $text) { return [pscustomobject]@{ Aktion = 'leeren'; Verlauf = $null } }
    }
    $neu = Add-VerlaufEintrag -Verlauf $Verlauf -Text $text -Datum $script:MigrationStand -Quelle 'sync' -Zeitpunkt $Zeitpunkt
    return [pscustomobject]@{ Aktion = 'anhaengen'; Verlauf = $neu }
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

# Konfiguration: die Server-Konfiguration, falls vorhanden – sonst genügen die
# öffentlichen Werte aus frontend\konfig.js (Mandant, Site, Listen-ID). Mehr
# braucht dieser Lauf nicht; angemeldet wird ohnehin per Device-Code.
if (-not $ConfigPath) { $ConfigPath = Join-Path $ServerDir 'Sync-Inventar.config.json' }
if (Test-Path $ConfigPath) {
    $cfg = Read-JsonDatei $ConfigPath
} else {
    $konfigJs = Join-Path (Split-Path -Parent $ScriptDir) 'frontend\konfig.js'
    if (-not (Test-Path $konfigJs)) { throw "Weder $ConfigPath noch $konfigJs gefunden." }
    $js = Get-Content $konfigJs -Raw -Encoding UTF8
    function Get-JsWert([string]$Name) {
        if ($js -match ('(?m)^\s*' + [regex]::Escape($Name) + '\s*:\s*"([^"]*)"')) { return $Matches[1] }
        return ''
    }
    $cfg = [pscustomobject]@{
        TenantId      = (Get-JsWert 'mandantId')
        SiteId        = (Get-JsWert 'siteId')
        SiteUrl       = ''
        TelefonListId = (Get-JsWert 'telefonListId')
        LogPath       = $null
    }
    foreach ($n in 'TenantId', 'SiteId', 'TelefonListId') {
        if (-not $cfg.$n) { throw "In $konfigJs fehlt der Wert für $n." }
    }
}
$LogPath = Join-Path $ScriptDir 'Migriere-FruehererEintrag.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Migriere-FruehererEintrag.log' }
Set-InventarLog $LogPath
if (-not (Test-Path $ConfigPath)) { Log "Keine Server-Konfiguration – Mandant, Site und Listen-ID aus frontend\konfig.js." }

$Spalte = $script:MigrationSpalte
Log "==== Migration «Früherer Eintrag» -> Verlauf $(if ($WhatIf) { '(WhatIf)' }) ===="

$ListId = $cfg.TelefonListId
if (-not $ListId) { throw 'TelefonListId fehlt in der Konfiguration.' }

Log "Device-Code-Anmeldung mit ClientId $ClientId"
Set-GraphToken (Get-GraphTokenDeviceCode -TenantId $cfg.TenantId -ClientId $ClientId)

$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}
$itemsBase = "/sites/$SiteId/lists/$ListId/items"

# --- Spalte vorhanden? -----------------------------------------------------
$spalten = (Invoke-Graph -Uri "/sites/$SiteId/lists/$ListId/columns?`$select=id,name,displayName").value
$col = @($spalten | Where-Object { $_.name -eq $Spalte })
if ($col.Count -eq 0) {
    Log "Spalte «$Spalte» gibt es in der Telefonliste nicht (mehr). Nichts zu tun."
    exit 0
}
$col = $col[0]
Log "Spalte gefunden: «$($col.displayName)» (Id $($col.id))"

# --- Lesen und sichern -----------------------------------------------------
$items = @(Get-GraphAlle "${itemsBase}?`$expand=fields(`$select=Title,$Spalte,Verlauf)&`$top=500")
$sicherung = New-Object System.Collections.ArrayList
$mitWert = New-Object System.Collections.ArrayList
foreach ($it in $items) {
    $wert = Get-Text $it.fields $Spalte
    [void]$sicherung.Add([ordered]@{
            Id = $it.id; Kurzwahl = (Get-Text $it.fields 'Title')
            FruehererEintrag = $wert; Verlauf = (Get-Text $it.fields 'Verlauf')
        })
    if ($wert -ne '') { [void]$mitWert.Add($it) }
}
$lokal = Join-Path (Split-Path -Parent $ScriptDir) 'lokal'
if (-not (Test-Path $lokal)) { New-Item -ItemType Directory -Path $lokal | Out-Null }
$datei = Join-Path $lokal ("Migration-FruehererEintrag-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Write-JsonDatei -Objekt @($sicherung) -Pfad $datei
Log "$($items.Count) Zeilen gelesen, $($mitWert.Count) mit Wert. Sicherung: $datei"

# --- Migrieren -------------------------------------------------------------
$jetzt = Get-Date
$stats = @{ angehaengt = 0; geleert = 0; fehler = 0 }
foreach ($it in $mitWert) {
    $kurz = Get-Text $it.fields 'Title'
    $wert = Get-Text $it.fields $Spalte
    try {
        $m = Get-FruehererEintragMigration -Verlauf (Get-Text $it.fields 'Verlauf') -Wert $wert -Zeitpunkt $jetzt
    } catch {
        $stats.fehler++
        Log "Kurzwahl $kurz (ID $($it.id)): Verlauf unlesbar, Zeile übersprungen – $($_.Exception.Message)" 'WARN'
        continue
    }
    $body = @{ $Spalte = $null }
    if ($m.Aktion -eq 'anhaengen') { $body['Verlauf'] = $m.Verlauf; $stats.angehaengt++ } else { $stats.geleert++ }
    $was = if ($m.Aktion -eq 'anhaengen') { 'Verlaufseintrag anhängen, Spalte leeren' } else { 'Eintrag schon vorhanden, nur Spalte leeren' }
    if ($WhatIf) {
        Log "WHATIF Kurzwahl $kurz (ID $($it.id)): «$wert» -> $was"
        continue
    }
    try {
        Invoke-Graph -Method PATCH -Uri "$itemsBase/$($it.id)/fields" -Body $body | Out-Null
        Log "Kurzwahl $kurz (ID $($it.id)): «$wert» -> $was"
    } catch {
        $stats.fehler++
        Log "Kurzwahl $kurz (ID $($it.id)): Schreiben fehlgeschlagen – $($_.Exception.Message)" 'ERROR'
    }
}
Log ("Migration: {0} Einträge angehängt, {1} nur geleert, {2} Fehler" -f $stats.angehaengt, $stats.geleert, $stats.fehler)

# --- Spalte löschen --------------------------------------------------------
if ($SpalteBehalten) {
    Log 'Spalte bleibt stehen (-SpalteBehalten).'
    exit 0
}
if ($WhatIf) {
    Log "WHATIF: Spalte «$Spalte» würde nach erfolgreicher Migration gelöscht."
    exit 0
}
if ($stats.fehler -gt 0) {
    Log "Spalte «$Spalte» wird NICHT gelöscht: $($stats.fehler) Zeilen konnten nicht migriert werden. Log prüfen, dann erneut starten." 'ERROR'
    exit 1
}

# Kontrolle direkt aus SharePoint: kein Rest darf mehr da sein.
$rest = @(Get-GraphAlle "${itemsBase}?`$expand=fields(`$select=Title,$Spalte)&`$top=500" |
    Where-Object { (Get-Text $_.fields $Spalte) -ne '' })
if ($rest.Count -gt 0) {
    Log "Spalte «$Spalte» wird NICHT gelöscht: $($rest.Count) Zeilen tragen noch einen Wert (z. B. Kurzwahl $(Get-Text $rest[0].fields 'Title'))." 'ERROR'
    exit 1
}
Invoke-Graph -Method DELETE -Uri "/sites/$SiteId/lists/$ListId/columns/$($col.id)" | Out-Null
Log "Spalte «$Spalte» aus der Telefonliste gelöscht. Fertig."
