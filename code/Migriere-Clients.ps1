<#
.SYNOPSIS
  Stellt SharePoint auf ADMIN-Clients, EDU-Clients und die Liste «Software» um.

.DESCRIPTION
  Einmaliger Umbau, danach kann das Skript weg. Es macht in einem Lauf alles, was in
  SharePoint anzufassen ist – der Rest (Frontend, Sync, Schemadateien) steht bereits im
  Repository. Fünf Schritte, jeder für sich wiederholbar:

    1. Liste «Computer» in «ADMIN-Clients» umbenennen (Anzeigename; die Listen-Id bleibt,
       darum ändert sich an den Konfigurationen nichts).
    2. Spalte «Computer» der Benutzer-Liste auf den Anzeigenamen «ADMIN-Client» setzen.
       Der interne Name bleibt «Computer» – SharePoint kann ihn nicht mehr ändern, und der
       Sync wie das Frontend sprechen die Spalte über den internen Namen an.
    3. Liste «EDU-Clients» anlegen (falls sie fehlt) und mit allen Spalten aus
       schema-client.json füllen. Sie hat dieselben Spalten wie die ADMIN-Liste.
    4. Liste «Software» anlegen (falls sie fehlt), mit den Spalten aus schema-software.json,
       und aus der bisherigen Inventar/programme.json füllen. Die Datei bleibt liegen; sie
       wird ab jetzt von niemandem mehr gelesen und kann später von Hand gelöscht werden.
    5. Zeilen, deren Name mit «EDU» beginnt, aus «ADMIN-Clients» nach «EDU-Clients» umziehen:
       erst drüben anlegen (mit allen Feldern samt Verlauf), dann hier löschen. Gelöschte
       Zeilen liegen 93 Tage im Papierkorb der Site. Vorher wird alles nach lokal\ gesichert.

  Mit -WhatIf wird nur gelesen, gesichert und gezählt – immer zuerst so laufen lassen.
  Nicht während eines laufenden Syncs starten (geplante Aufgabe alle 4 h, siehe README 2.6).

  Nach dem Lauf: die ausgegebenen Listen-Ids in server\Sync-Inventar.config.json und in
  frontend\konfig.js eintragen, dann Sync-Inventar.ps1 -WhatIf zur Kontrolle.

.PARAMETER ConfigPath
  Pfad zu Sync-Inventar.config.json (Standard: server\Sync-Inventar.config.json). Fehlt die
  Datei, genügen die öffentlichen Werte aus frontend\konfig.js.

.PARAMETER ClientId
  App-Registrierung für die Device-Code-Anmeldung, siehe Ergaenze-Spalten.ps1.

.PARAMETER Schritte
  Welche Schritte laufen: Alle (Vorgabe), Umbenennen, Edu, Software oder Umzug.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Migriere-Clients.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Migriere-Clients.ps1

.NOTES
  Windows PowerShell 5.1. Braucht ein Konto mit Vollzugriff auf die Site: Listen anlegen und
  umbenennen darf die Zertifikats-App des Syncs bewusst nicht.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [ValidateSet('Alle', 'Umbenennen', 'Edu', 'Software', 'Umzug')]
    [string[]]$Schritte = @('Alle'),
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

# Konfiguration: die Server-Konfiguration, falls vorhanden – sonst die öffentlichen Werte aus
# frontend\konfig.js (Mandant, Site, Listen-Ids). Angemeldet wird ohnehin per Device-Code, also
# braucht dieser Lauf weder ClientId noch Zertifikat des Syncs.
if (-not $ConfigPath) { $ConfigPath = Join-Path $ServerDir 'Sync-Inventar.config.json' }
$cfg = Get-InventarKonfiguration -KonfigPfad $ConfigPath `
    -FrontendPfad (Join-Path (Split-Path -Parent $ScriptDir) 'frontend\konfig.js')

$LogPath = Join-Path $ScriptDir 'Migriere-Clients.log'
if ($cfg.LogPath) { $LogPath = Join-Path (Split-Path -Parent $cfg.LogPath) 'Migriere-Clients.log' }
Set-InventarLog $LogPath

function Get-ListId([string]$Wert) {
    $t = ([string]$Wert).Trim()
    if ($t -match '^<') { return '' }
    return $t
}

$alle = ($Schritte -contains 'Alle')
function Tun([string]$Name) { return ($alle -or ($Schritte -contains $Name)) }

Log "==== Umbau auf ADMIN-/EDU-Clients und die Liste «Software» $(if ($WhatIf) { '(WhatIf)' }) ===="

Log "Device-Code-Anmeldung mit ClientId $ClientId"
Set-GraphToken (Get-GraphTokenDeviceCode -TenantId $cfg.TenantId -ClientId $ClientId)

$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}

$AdminListId = Get-ListId $cfg.AdminClientListId
if (-not $AdminListId) { throw 'AdminClientListId fehlt in der Konfiguration (bisher ComputerListId).' }
$BenutzerListId = Get-ListId $cfg.BenutzerListId
$EduListId = Get-ListId $cfg.EduClientListId
$SoftwareListId = Get-ListId $cfg.SoftwareListId

$fehler = 0
$lokal = Join-Path (Split-Path -Parent $ScriptDir) 'lokal'
if (-not (Test-Path $lokal)) { New-Item -ItemType Directory -Path $lokal | Out-Null }
$stempel = Get-Date -Format 'yyyyMMdd-HHmmss'

# ---------------------------------------------------------------------------
# Kleine Helfer
# ---------------------------------------------------------------------------
function Get-ListeNachTitel([string]$Titel) {
    <# Listen-Id zu einem Anzeigenamen, oder '' wenn es die Liste nicht gibt. #>
    foreach ($l in (Invoke-Graph -Uri "/sites/$SiteId/lists?`$select=id,displayName&`$top=200").value) {
        if ([string]$l.displayName -eq $Titel) { return [string]$l.id }
    }
    return ''
}

function New-Liste {
    <# Legt eine generische Liste an und gibt ihre Id zurück. #>
    param([string]$Titel, [string]$Beschreibung)
    $body = @{
        displayName = $Titel
        description = $Beschreibung
        list        = @{ template = 'genericList' }
    }
    $r = Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists" -Body $body
    return [string]$r.id
}

function Sync-Spalten {
    <# Legt in einer Liste alle Spalten einer Schemadatei an, die fehlen. Nie löschen, nie ändern. #>
    param([string]$Name, [string]$ListId, [string]$SchemaDatei)
    $schema = @(Read-JsonDatei (Join-Path $ScriptDir $SchemaDatei))
    $spalten = @($schema | Where-Object { $_.internal -ne 'Title' } | ForEach-Object { ConvertTo-GraphSpalte $_ })
    $vorhanden = @{}
    foreach ($c in (Invoke-Graph -Uri "/sites/$SiteId/lists/$ListId/columns?`$select=id,name,displayName").value) {
        if ($c.name) { $vorhanden[[string]$c.name] = $true }
        if ($c.displayName) { $vorhanden[[string]$c.displayName] = $true }
    }
    $fehlend = @($spalten | Where-Object { -not ($vorhanden.ContainsKey([string]$_.name) -or $vorhanden.ContainsKey([string]$_.displayName)) })
    Log "$Name`: $($spalten.Count) Spalten erwartet, $($fehlend.Count) fehlen."
    foreach ($s in $fehlend) {
        try {
            Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$ListId/columns" -Body $s | Out-Null
            Log "  Spalte angelegt: $($s.name)"
        } catch {
            Log "  Spalte '$($s.name)' konnte nicht angelegt werden: $_$(Get-SpaltenHinweis $_)" 'ERROR'
            $script:fehler++
        }
    }
    # Die Titelspalte gibt es immer; sie bekommt nur ihren Anzeigenamen aus dem Schema.
    $titelDef = @($schema | Where-Object { $_.internal -eq 'Title' })[0]
    if ($titelDef) { Set-TitelSpalte $ListId ([string]$titelDef.display) }
}

function Set-TitelSpalte {
    <# Anzeigename der Titelspalte einer Liste nachführen (der interne Name bleibt «Title»). #>
    param([string]$ListId, [string]$Anzeige)
    $col = @((Invoke-Graph -Uri "/sites/$SiteId/lists/$ListId/columns?`$select=id,name,displayName").value |
        Where-Object { $_.name -eq 'Title' })
    if (-not $col) { return }
    if ([string]$col[0].displayName -eq $Anzeige) { return }
    try {
        Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/lists/$ListId/columns/$($col[0].id)" -Body @{ displayName = $Anzeige } | Out-Null
        Log "  Titelspalte heisst jetzt «$Anzeige»."
    } catch {
        Log "  Titelspalte konnte nicht auf «$Anzeige» gesetzt werden: $_" 'ERROR'
        $script:fehler++
    }
}

# ---------------------------------------------------------------------------
# Schritt 1: Liste «Computer» -> «ADMIN-Clients»
# ---------------------------------------------------------------------------
if (Tun 'Umbenennen') {
    Log '--- Schritt 1: Liste umbenennen ---'
    $liste = Invoke-Graph -Uri "/sites/$SiteId/lists/$AdminListId`?`$select=id,displayName"
    $bisher = [string]$liste.displayName
    if ($bisher -eq 'ADMIN-Clients') {
        Log 'Die Liste heisst bereits «ADMIN-Clients» – nichts zu tun.'
    } elseif ($WhatIf) {
        Log "WHATIF: Liste «$bisher» würde in «ADMIN-Clients» umbenannt."
    } else {
        try {
            Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/lists/$AdminListId" -Body @{ displayName = 'ADMIN-Clients' } | Out-Null
            Log "Liste «$bisher» heisst jetzt «ADMIN-Clients» (Id $AdminListId, unverändert)."
        } catch {
            Log "Umbenennen fehlgeschlagen: $_" 'ERROR'
            $fehler++
        }
    }

    # ---- Schritt 2: Spalte «Computer» der Benutzer-Liste ----
    Log '--- Schritt 2: Spalte «Computer» der Benutzer-Liste ---'
    if (-not $BenutzerListId) {
        Log 'BenutzerListId fehlt in der Konfiguration – Schritt übersprungen.' 'WARN'
    } else {
        $col = @((Invoke-Graph -Uri "/sites/$SiteId/lists/$BenutzerListId/columns?`$select=id,name,displayName").value |
            Where-Object { $_.name -eq 'Computer' })
        if (-not $col) {
            Log 'Die Benutzer-Liste hat keine Spalte «Computer» – nichts zu tun.' 'WARN'
        } elseif ([string]$col[0].displayName -eq 'ADMIN-Client') {
            Log 'Die Spalte heisst bereits «ADMIN-Client» – nichts zu tun.'
        } elseif ($WhatIf) {
            Log "WHATIF: Spalte «$($col[0].displayName)» würde als «ADMIN-Client» angezeigt (interner Name bleibt «Computer»)."
        } else {
            try {
                Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/lists/$BenutzerListId/columns/$($col[0].id)" -Body @{ displayName = 'ADMIN-Client' } | Out-Null
                Log 'Spalte heisst jetzt «ADMIN-Client» (interner Name bleibt «Computer»).'
            } catch {
                Log "Spalte konnte nicht umbenannt werden: $_" 'ERROR'
                $fehler++
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Schritt 3: Liste «EDU-Clients»
# ---------------------------------------------------------------------------
if (Tun 'Edu') {
    Log '--- Schritt 3: Liste «EDU-Clients» ---'
    if (-not $EduListId) { $EduListId = Get-ListeNachTitel 'EDU-Clients' }
    if ($EduListId) {
        Log "Liste «EDU-Clients» besteht bereits (Id $EduListId)."
    } elseif ($WhatIf) {
        Log 'WHATIF: Liste «EDU-Clients» würde angelegt und mit den Spalten aus schema-client.json gefüllt.'
    } else {
        $EduListId = New-Liste 'EDU-Clients' 'Clients aus SCCM, deren Name mit EDU beginnt. Gleiche Spalten wie ADMIN-Clients.'
        Log "Liste «EDU-Clients» angelegt (Id $EduListId)."
    }
    if ($EduListId -and -not $WhatIf) { Sync-Spalten 'EDU-Clients' $EduListId 'schema-client.json' }
}

# ---------------------------------------------------------------------------
# Schritt 4: Liste «Software»
# ---------------------------------------------------------------------------
if (Tun 'Software') {
    Log '--- Schritt 4: Liste «Software» ---'
    if (-not $SoftwareListId) { $SoftwareListId = Get-ListeNachTitel 'Software' }
    if ($SoftwareListId) {
        Log "Liste «Software» besteht bereits (Id $SoftwareListId)."
    } elseif ($WhatIf) {
        Log 'WHATIF: Liste «Software» würde angelegt und aus Inventar/programme.json gefüllt.'
    } else {
        $SoftwareListId = New-Liste 'Software' 'Programme des Inventars: je Zeile eine Spalte der Benutzer-Liste. Ersetzt Inventar/programme.json.'
        Log "Liste «Software» angelegt (Id $SoftwareListId)."
    }

    if ($SoftwareListId -and -not $WhatIf) { Sync-Spalten 'Software' $SoftwareListId 'schema-software.json' }

    # Inhalt aus der bisherigen programme.json übernehmen – idempotent über die Programm-Id.
    $programme = $null
    try { $programme = Invoke-Graph -Uri "/sites/$SiteId/drive/root:/Inventar/programme.json:/content" }
    catch { Log "Inventar/programme.json nicht lesbar: $_" 'WARN' }
    if (-not $programme -or -not $programme.programme) {
        Log 'Keine programme.json gefunden – die Liste «Software» bleibt leer und wird im Frontend gefüllt.' 'WARN'
    } else {
        $eintraege = @($programme.programme)
        $kategorien = @($programme.kategorien)
        Log "programme.json: $($eintraege.Count) Programme, $($kategorien.Count) Kategorien."

        $vorhanden = @{}
        if ($SoftwareListId) {
            foreach ($it in (Get-GraphAlle "/sites/$SiteId/lists/$SoftwareListId/items?`$expand=fields(`$select=Title)&`$top=500")) {
                $t = Get-Text $it.fields 'Title'
                if ($t -ne '') { $vorhanden[$t.ToLowerInvariant()] = $true }
            }
        }

        # Reihenfolge in Zehnerschritten: erst nach der Kategorienfolge aus der Datei, innerhalb
        # einer Kategorie in der Reihenfolge der Datei. So sieht die Software-Ansicht danach
        # genauso aus wie vorher, und eine Lücke von 10 lässt Platz zum Einschieben.
        $rang = @{}
        for ($i = 0; $i -lt $kategorien.Count; $i++) { $rang[[string]$kategorien[$i]] = $i }
        $sortiert = @($eintraege | Sort-Object @{ Expression = {
                    $k = [string]$_.kategorie
                    if ($rang.ContainsKey($k)) { $rang[$k] } else { 1000 }
                }
            })

        $nr = 0
        $stats = @{ neu = 0; da = 0; fehler = 0 }
        foreach ($p in $sortiert) {
            $nr += 10
            $id = ([string]$p.id).Trim()
            if ($id -eq '') { continue }
            if ($vorhanden.ContainsKey($id.ToLowerInvariant())) { $stats.da++; continue }
            $felder = [ordered]@{
                Title       = $id
                Name        = $(if ($p.name) { [string]$p.name } else { $id })
                Kategorie   = $(if ($p.kategorie) { [string]$p.kategorie } else { 'Programme' })
                AdGruppen   = (@($p.adGruppen) | Where-Object { $_ }) -join "`n"
                Reihenfolge = $nr
            }
            if ($WhatIf) { Log "WHATIF Software neu: $id ($($felder.Name), Reihenfolge $nr)"; $stats.neu++; continue }
            try {
                Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$SoftwareListId/items" -Body @{ fields = $felder } | Out-Null
                $stats.neu++
                Log "Software neu: $id"
            } catch {
                $stats.fehler++
                Log "Software «$id» konnte nicht angelegt werden: $_" 'ERROR'
            }
        }
        $fehler += $stats.fehler
        Log ("Software: {0} neu, {1} waren schon da, {2} Fehler" -f $stats.neu, $stats.da, $stats.fehler)
    }
}

# ---------------------------------------------------------------------------
# Schritt 5: EDU-Zeilen umziehen
# ---------------------------------------------------------------------------
if (Tun 'Umzug') {
    Log '--- Schritt 5: EDU-Zeilen von ADMIN-Clients nach EDU-Clients ---'
    if (-not $EduListId) { $EduListId = Get-ListeNachTitel 'EDU-Clients' }
    if (-not $EduListId) {
        Log 'Es gibt keine Liste «EDU-Clients» – zuerst Schritt «Edu» laufen lassen.' 'ERROR'
        $fehler++
    } else {
        $adminItems = @(Get-GraphAlle "/sites/$SiteId/lists/$AdminListId/items?`$expand=fields&`$top=500")
        $umzug = @($adminItems | Where-Object { (Get-ClientListe ([string]$_.fields.Title)) -eq 'edu' })
        Log "ADMIN-Clients: $($adminItems.Count) Zeilen, davon $($umzug.Count) mit Namen ab «EDU»."

        # Sicherung, bevor irgendetwas gelöscht wird: der ganze Feldsatz jeder betroffenen Zeile.
        if ($umzug.Count -gt 0) {
            $datei = Join-Path $lokal ("Migration-EduClients-{0}.json" -f $stempel)
            Write-JsonDatei -Objekt @($umzug | ForEach-Object { [ordered]@{ Id = $_.id; Felder = $_.fields } }) -Pfad $datei
            Log "Sicherung: $datei"
        }

        # Was drüben schon steht, wird nicht ein zweites Mal angelegt (Wiederholbarkeit).
        $schonDort = @{}
        foreach ($it in (Get-GraphAlle "/sites/$SiteId/lists/$EduListId/items?`$expand=fields(`$select=Title,SCCM_SerialNumber)&`$top=500")) {
            $t = NormName ([string]$it.fields.Title)
            if ($t -ne '') { $schonDort[$t] = $true }
        }

        # Nur Spalten schreiben, die es drüben gibt – sonst weist Graph den ganzen POST zurück.
        $eduSpalten = @{}
        foreach ($c in (Invoke-Graph -Uri "/sites/$SiteId/lists/$EduListId/columns?`$select=id,name").value) {
            if ($c.name) { $eduSpalten[[string]$c.name] = $true }
        }
        # Felder, die Graph selbst verwaltet und die nicht mitkommen dürfen.
        $nichtKopieren = @('id', 'ContentType', 'Modified', 'Created', 'AuthorLookupId', 'EditorLookupId',
            '_UIVersionString', 'Attachments', 'Edit', 'LinkTitleNoMenu', 'LinkTitle', 'ItemChildCount',
            'FolderChildCount', '_ComplianceFlags', '_ComplianceTag', '_ComplianceTagWrittenTime',
            '_ComplianceTagUserId', 'AppAuthorLookupId', 'AppEditorLookupId', '@odata.etag')

        $stats = @{ kopiert = 0; da = 0; geloescht = 0; fehler = 0 }
        foreach ($it in $umzug) {
            $titel = [string]$it.fields.Title
            $schluessel = NormName $titel

            if ($schonDort.ContainsKey($schluessel)) {
                Log "«$titel» steht bereits in EDU-Clients – wird hier nur noch entfernt."
                $stats.da++
            } else {
                $felder = [ordered]@{}
                foreach ($prop in $it.fields.PSObject.Properties) {
                    if ($nichtKopieren -contains $prop.Name) { continue }
                    if (-not $eduSpalten.ContainsKey($prop.Name) -and $prop.Name -ne 'Title') { continue }
                    if ($null -eq $prop.Value) { continue }
                    $felder[$prop.Name] = $prop.Value
                }
                if ($WhatIf) {
                    Log "WHATIF Umzug: «$titel» ($($felder.Count) Felder) nach EDU-Clients, danach in ADMIN-Clients löschen"
                    $stats.kopiert++
                    continue
                }
                try {
                    Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$EduListId/items" -Body @{ fields = $felder } | Out-Null
                    $stats.kopiert++
                    Log "«$titel» nach EDU-Clients kopiert ($($felder.Count) Felder)."
                } catch {
                    $stats.fehler++
                    Log "«$titel» konnte nicht nach EDU-Clients kopiert werden – die Zeile bleibt, wo sie ist: $_" 'ERROR'
                    continue
                }
            }
            if ($WhatIf) { continue }
            # Erst löschen, wenn die Zeile drüben wirklich steht.
            try {
                Invoke-Graph -Method DELETE -Uri "/sites/$SiteId/lists/$AdminListId/items/$($it.id)" | Out-Null
                $stats.geloescht++
                Log "«$titel» aus ADMIN-Clients entfernt (Papierkorb der Site, 93 Tage)."
            } catch {
                $stats.fehler++
                Log "«$titel» konnte nicht aus ADMIN-Clients entfernt werden – jetzt steht sie in beiden Listen: $_" 'ERROR'
            }
        }
        $fehler += $stats.fehler
        Log ("Umzug: {0} kopiert, {1} waren schon drüben, {2} in ADMIN-Clients entfernt, {3} Fehler" -f `
                $stats.kopiert, $stats.da, $stats.geloescht, $stats.fehler)
    }
}

# ---------------------------------------------------------------------------
# Abschluss
# ---------------------------------------------------------------------------
Log '--- Diese Werte gehören in die Konfiguration ---'
Log "  Sync-Inventar.config.json: AdminClientListId = $AdminListId"
Log "  Sync-Inventar.config.json: EduClientListId   = $(if ($EduListId) { $EduListId } else { '(noch keine)' })"
Log "  Sync-Inventar.config.json: SoftwareListId    = $(if ($SoftwareListId) { $SoftwareListId } else { '(noch keine)' })"
Log '  frontend\konfig.js: adminClientListId, eduClientListId, softwareListId – dieselben Werte.'

if ($WhatIf) {
    Log '==== Fertig (WhatIf: es wurde nichts geschrieben) ===='
    exit 0
}
Log "==== Fertig: $fehler Fehler ===="
if ($fehler) { exit 1 }
