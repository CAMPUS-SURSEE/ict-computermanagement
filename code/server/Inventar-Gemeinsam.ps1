<#
.SYNOPSIS
  Gemeinsame Funktionen aller Inventar-Skripte (Log, Geschäftsjahr, Graph-Zugriff, Spaltendefinitionen).

.DESCRIPTION
  Diese Datei enthält ausschliesslich Funktionen und wird von den anderen Skripten mit
  «. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')» eingebunden. Sie führt selbst nichts aus
  und lässt sich deshalb gefahrlos in Tests laden.

  Muster «nur Funktionen laden»: Sync-Inventar.ps1 prüft nach seinen Funktionsdefinitionen die Variable
  $InventarNurFunktionen. Ist sie $true, kehren sie vor dem eigentlichen Hauptteil zurück.
  Test-Inventar.ps1 setzt die Variable und kann die reinen Funktionen so ohne Graph, SCCM und AD prüfen.

.NOTES
  Windows PowerShell 5.1, keine Module nötig.
#>

# ---------------------------------------------------------------------------
# 1) Protokoll
# ---------------------------------------------------------------------------
$script:InventarLogPath = $null
$script:InventarLogZaehler = @{ ERROR = 0; WARN = 0 }
$script:InventarLogFehlerZeilen = New-Object System.Collections.ArrayList

function Set-InventarLog {
    <#
      Legt die Logdatei fest. Ohne Aufruf schreibt Log() nur auf die Konsole.
      Ist die Datei grösser als MaxMB, wird sie vorher weggerollt (Invoke-LogRotation) – das Log
      wächst so nie unbegrenzt, auch wenn der Sync jahrelang alle 30 Minuten läuft.
    #>
    param([string]$Pfad, [double]$MaxMB = 10, [int]$Behalten = 5)
    $script:InventarLogPath = $Pfad
    $script:InventarLogZaehler = @{ ERROR = 0; WARN = 0 }
    $script:InventarLogFehlerZeilen = New-Object System.Collections.ArrayList
    if ($Pfad) { try { [void](Invoke-LogRotation -Pfad $Pfad -MaxMB $MaxMB -Behalten $Behalten) } catch { } }
}

function Invoke-LogRotation {
    <#
      Rollt eine Logdatei weg, sobald sie MaxMB erreicht: Sync-Inventar.log -> .log.1 -> .log.2 …
      Die älteste (.log.<Behalten>) fällt weg. Rückgabe: $true, wenn gerollt wurde.
    #>
    param([string]$Pfad, [double]$MaxMB = 10, [int]$Behalten = 5)
    if (-not $Pfad -or -not (Test-Path -LiteralPath $Pfad)) { return $false }
    if ((Get-Item -LiteralPath $Pfad).Length -lt ($MaxMB * 1MB)) { return $false }
    if ($Behalten -lt 1) { $Behalten = 1 }
    for ($i = $Behalten; $i -ge 1; $i--) {
        $quelle = $(if ($i -eq 1) { $Pfad } else { "$Pfad.$($i - 1)" })
        if (Test-Path -LiteralPath $quelle) { Move-Item -LiteralPath $quelle -Destination "$Pfad.$i" -Force }
    }
    return $true
}

function Get-LogZaehler {
    <# Wie viele ERROR- und WARN-Zeilen seit Set-InventarLog geschrieben wurden, dazu die letzten Fehlertexte. #>
    return [pscustomobject]@{
        Fehler      = [int]$script:InventarLogZaehler['ERROR']
        Warnungen   = [int]$script:InventarLogZaehler['WARN']
        FehlerTexte = @($script:InventarLogFehlerZeilen)
    }
}

function Log {
    param([string]$msg, [string]$lvl = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $lvl, $msg
    Write-Host $line
    if ($script:InventarLogZaehler.ContainsKey($lvl)) { $script:InventarLogZaehler[$lvl]++ }
    if ($lvl -eq 'ERROR') {
        if ($null -eq $script:InventarLogFehlerZeilen) { $script:InventarLogFehlerZeilen = New-Object System.Collections.ArrayList }
        if ($script:InventarLogFehlerZeilen.Count -lt 10) { [void]$script:InventarLogFehlerZeilen.Add($msg) }
    }
    if ($script:InventarLogPath) {
        # Ein zweiter Versuch, falls die Datei gerade von jemandem geöffnet ist (Editor, Virenscanner).
        for ($i = 1; $i -le 2; $i++) {
            try { Add-Content -Path $script:InventarLogPath -Value $line -Encoding UTF8; break } catch { Start-Sleep -Milliseconds 200 }
        }
    }
}

# ---------------------------------------------------------------------------
# 2) Geschäftsjahr (1. August bis 31. Juli, Schreibweise 2026/2027)
# ---------------------------------------------------------------------------
function Get-GjVonDatum {
    <# Geschäftsjahr eines Datums: Monat >= 8 -> Jahr/Jahr+1, sonst Jahr-1/Jahr. #>
    param($Datum)
    if ($null -eq $Datum -or ($Datum -is [string] -and $Datum.Trim() -eq '')) { return '' }
    $d = $null
    if ($Datum -is [datetime]) { $d = [datetime]$Datum }
    else { try { $d = [datetime]::Parse([string]$Datum, [Globalization.CultureInfo]::InvariantCulture) } catch { return '' } }
    if ($d.Month -ge 8) { return ('{0}/{1}' -f $d.Year, ($d.Year + 1)) }
    return ('{0}/{1}' -f ($d.Year - 1), $d.Year)
}

function Test-Gj {
    <# Prüft die Schreibweise YYYY/YYYY+1. #>
    param([string]$Gj)
    if (-not $Gj) { return $false }
    if ($Gj -notmatch '^(\d{4})/(\d{4})$') { return $false }
    return ([int]$Matches[2] -eq ([int]$Matches[1] + 1))
}

function Get-GjPlus {
    <# Verschiebt ein Geschäftsjahr um n Jahre, z. B. Get-GjPlus '2023/2024' 5 -> '2028/2029'. #>
    param([string]$Gj, [int]$n)
    if (-not (Test-Gj $Gj)) { return '' }
    $a = [int]($Gj.Substring(0, 4)) + $n
    return ('{0}/{1}' -f $a, ($a + 1))
}

function Get-GjVergleich {
    <# -1 wenn a vor b liegt, 0 bei gleich, 1 wenn a nach b liegt. Leere Werte gelten als kleiner. #>
    param([string]$a, [string]$b)
    $na = 0; $nb = 0
    if (Test-Gj $a) { $na = [int]$a.Substring(0, 4) }
    if (Test-Gj $b) { $nb = [int]$b.Substring(0, 4) }
    if ($na -lt $nb) { return -1 }
    if ($na -gt $nb) { return 1 }
    return 0
}

function Get-GjAktuell {
    <# Laufendes Geschäftsjahr. #>
    param($Heute)
    if (-not $Heute) { $Heute = Get-Date }
    return (Get-GjVonDatum $Heute)
}

# ---------------------------------------------------------------------------
# 3) Kleine Helfer
# ---------------------------------------------------------------------------
function ToIso($d) { if ($d) { return ([DateTime]$d).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { return $null } }

function JaNein($b) {
    if ($null -eq $b -or ($b -is [string] -and $b.Trim() -eq '')) { return $null }
    if ([bool]$b) { 'Ja' } else { 'Nein' }
}

function Trunc([string]$s, [int]$max = 255) {
    if ($null -eq $s) { return $null }
    $s = $s.Trim()
    if ($s.Length -gt $max) { $s.Substring(0, $max - 1) + '…' } else { $s }
}

function Norm($v) {
    <# Vergleichsnormalisierung für das Delta-Schreiben. #>
    if ($null -eq $v) { return '' }
    if ($v -is [bool]) { return $v.ToString().ToLower() }
    if ($v -is [double] -or $v -is [int] -or $v -is [long] -or $v -is [decimal]) { return ([double]$v).ToString([Globalization.CultureInfo]::InvariantCulture) }
    $s = [string]$v
    if ($s -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') { return $s }
    if ($s -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}') { try { return ([DateTime]::Parse($s, $null, 'AdjustToUniversal')).ToString('yyyy-MM-ddTHH:mm:ssZ') } catch { } }
    return ($s -replace "`r`n", "`n").Trim()
}

function NormName([string]$n) {
    <# PC-Name für den Abgleich: Grossbuchstaben, ohne Präfix «Shared ». #>
    if (-not $n) { return '' }
    $n = $n.Trim().ToUpperInvariant()
    $n = $n -replace '^SHARED\s+', ''
    return $n
}

function NormLogin([string]$s) {
    <# Login für den Abgleich: getrimmt, klein, ohne Domäne (DOMAENE\login oder login@domain). #>
    if (-not $s) { return '' }
    $s = $s.Trim()
    if ($s -match '\\') { $s = $s.Substring($s.LastIndexOf('\') + 1) }
    if ($s -match '@') { $s = $s.Substring(0, $s.IndexOf('@')) }
    return $s.ToLowerInvariant()
}

function ToInternal {
    <# Interner Spaltenname wie im früheren Build-Schema.ps1 (max. 30 Zeichen). #>
    param([string]$s)
    if (-not $s) { return '' }
    $s = $s.Trim()
    $s = $s -replace 'ä', 'ae' -replace 'ö', 'oe' -replace 'ü', 'ue' -replace 'Ä', 'Ae' -replace 'Ö', 'Oe' -replace 'Ü', 'Ue' -replace 'ß', 'ss'
    $s = $s -replace '\+\+', 'PP' -replace '&', 'And'
    $s = ($s -split '[^A-Za-z0-9]+' | Where-Object { $_ } | ForEach-Object { $_.Substring(0, 1).ToUpper() + $_.Substring(1) }) -join ''
    if ($s -match '^\d') { $s = 'J' + $s }
    if ($s.Length -gt 30) { $s = $s.Substring(0, 30) }
    return $s
}

function Get-Feld {
    <# Liest ein Feld aus einem Hashtable oder einem PSCustomObject; fehlt es, kommt $null zurück. #>
    param($Objekt, [string]$Name)
    if ($null -eq $Objekt) { return $null }
    if ($Objekt -is [System.Collections.IDictionary]) {
        if ($Objekt.Contains($Name)) { return $Objekt[$Name] }
        return $null
    }
    $p = $Objekt.PSObject.Properties[$Name]
    if ($p) { return $p.Value }
    return $null
}

function Get-Text {
    <# Feld als getrimmter Text; $null wird zu ''. #>
    param($Objekt, [string]$Name)
    $v = Get-Feld $Objekt $Name
    if ($null -eq $v) { return '' }
    return ([string]$v).Trim()
}

# ---------------------------------------------------------------------------
# 3a0) Client-Listen: ADMIN-Clients und EDU-Clients
# ---------------------------------------------------------------------------
# Es gibt zwei Client-Listen mit identischen Spalten. Welche für ein SCCM-Gerät zuständig ist,
# entscheidet allein sein Name: alles, was mit «EDU» beginnt, gehört in die Liste «EDU-Clients»,
# alles Übrige in «ADMIN-Clients». Diese eine Regel steht hier – und gespiegelt in
# frontend/modell.js (clientListe). Beide Seiten müssen dasselbe rechnen.
$script:EduPraefix = 'EDU'

function Get-ClientListe {
    <#
      Zu welcher Client-Liste gehört dieser Gerätename?
      Rückgabe: 'edu' für Namen, die mit EDU beginnen, sonst 'admin'.
      Ein leerer Name gilt als 'admin' – er landet dort, wo alles Unbekannte hingehört.
    #>
    param([string]$Name)
    $n = ([string]$Name).Trim()
    if ($n -and $n.ToUpperInvariant().StartsWith($script:EduPraefix)) { return 'edu' }
    return 'admin'
}

function Test-InDomaene {
    <#
      Gehört das Gerät dieser Zeile zur Domäne? Gelesen wird die Spalte «InDomaene» (Ja/Nein).

      Leer gilt als Ja – so verhalten sich alle Zeilen wie vor der Spalte. Nur ein
      ausdrückliches Nein nimmt die Zeile aus dem SCCM-Abgleich: Der Sync ordnet ihr kein
      Gerät zu, schreibt keine SCCM-Felder und archiviert sie nie. Gedacht für Geräte, die
      es in SCCM nie geben wird (Gäste- und Prüfungsnotebooks ohne Domäne).

      SharePoint liefert eine Ja/Nein-Spalte als Boolean, ältere Exporte als Text; darum
      werden beide Schreibweisen erkannt.
    #>
    param($Zeile)
    $v = Get-Feld $Zeile 'InDomaene'
    if ($null -eq $v) { return $true }
    if ($v -is [bool]) { return $v }
    $s = ([string]$v).Trim().ToLowerInvariant()
    if ($s -eq '') { return $true }
    return -not ($s -eq 'false' -or $s -eq 'nein' -or $s -eq 'no' -or $s -eq '0')
}

function Get-ClientListenTitel {
    <# Anzeigename einer Client-Liste ('admin' | 'edu') für Log und Meldungen. #>
    param([string]$Liste)
    if ($Liste -eq 'edu') { return 'EDU-Clients' }
    return 'ADMIN-Clients'
}

# ---------------------------------------------------------------------------
# 3a) Seriennummern
# ---------------------------------------------------------------------------
# Werte, die zwar in SCCM/BIOS stehen, aber keine echte Seriennummer sind.
$script:SeriennummerPlatzhalter = @(
    'TO BE FILLED BY O.E.M.', 'TO BE FILLED BY OEM', 'DEFAULT STRING', 'SYSTEM SERIAL NUMBER',
    'CHASSIS SERIAL NUMBER', 'SERIAL NUMBER', 'BASE BOARD SERIAL NUMBER', 'NONE', 'N/A', 'NA',
    'NOT APPLICABLE', 'NOT SPECIFIED', 'NOT AVAILABLE', 'UNKNOWN', 'UNBEKANNT', 'INVALID',
    'EMPTY', 'FILLED BY O.E.M.', 'OEM', 'DEFAULT', 'NULL', '1234567890', '123456789'
)

function NormSeriennummer {
    <# Seriennummer für den Abgleich: getrimmt, Innenleerzeichen zusammengefasst, Grossbuchstaben. #>
    param([string]$s)
    if (-not $s) { return '' }
    $s = ([string]$s).Trim()
    $s = $s -replace '\s+', ' '
    return $s.ToUpperInvariant()
}

function Test-Seriennummer {
    <#
      Ist das eine brauchbare Seriennummer? Nein bei leer, bei einem der bekannten Platzhalter,
      bei weniger als drei Zeichen und bei reinen Füllmustern (nur 0, X, -, . oder Leerzeichen).
    #>
    param([string]$s)
    $n = NormSeriennummer $s
    if ($n -eq '') { return $false }
    if ($n.Length -lt 3) { return $false }
    if ($script:SeriennummerPlatzhalter -contains $n) { return $false }
    if ($n -match '^[0X\-\._ ]+$') { return $false }
    return $true
}

# ---------------------------------------------------------------------------
# 3a') Telefonnummern
# ---------------------------------------------------------------------------
# Die Telefonliste kennt Kurzwahlen (373) und vollständige Nummern (+41 41 926 23 73).
# Verglichen wird immer über die Ziffernfolge mit Landesvorwahl: 41419262373.
# $Praefix ist der Nummernblock des Hauses ohne Kurzwahl, Standard «+41 41 926 2».
$script:TelefonPraefixStandard = '+41 41 926 2'

function Get-TelefonZiffern {
    <#
      Nummer -> Ziffernfolge mit Landesvorwahl (41…), ohne Leerzeichen und Sonderzeichen.
      «0041 41 926 23 73», «+41 41 926 23 73», «041 926 23 73» -> 41419262373.
      Eine reine Kurzwahl (ein bis vier Ziffern) wird mit dem Präfix ergänzt.
      Leer oder unlesbar -> ''.
    #>
    param([string]$Nummer, [string]$Praefix)
    if (-not $Praefix) { $Praefix = $script:TelefonPraefixStandard }
    if ($null -eq $Nummer) { return '' }
    $z = ([string]$Nummer) -replace '[^\d]', ''
    if ($z -eq '') { return '' }
    if ($z.Length -le 4) {
        $p = ([string]$Praefix) -replace '[^\d]', ''
        return ($p + $z)
    }
    if ($z.StartsWith('0041')) { return $z.Substring(2) }
    if ($z.StartsWith('00')) { return $z.Substring(2) }
    if ($z.StartsWith('0')) { return ('41' + $z.Substring(1)) }
    return $z
}

function Format-Telefon {
    <#
      Ziffernfolge oder beliebige Schreibweise -> «+41 41 926 23 73».
      Nur Schweizer Nummern (41 + 9 Ziffern) werden formatiert, alles andere kommt getrimmt zurück.
    #>
    param([string]$Nummer, [string]$Praefix)
    $z = Get-TelefonZiffern $Nummer $Praefix
    if ($z -eq '') { return '' }
    if ($z.Length -eq 11 -and $z.StartsWith('41')) {
        return ('+41 {0} {1} {2} {3}' -f $z.Substring(2, 2), $z.Substring(4, 3), $z.Substring(7, 2), $z.Substring(9, 2))
    }
    return ('+' + $z)
}

function Get-TelefonKurzwahl {
    <#
      Kurzwahl einer Nummer im Hausblock: 41419262373 -> 373. Liegt die Nummer ausserhalb des
      Präfixes, kommt '' zurück.
    #>
    param([string]$Nummer, [string]$Praefix)
    if (-not $Praefix) { $Praefix = $script:TelefonPraefixStandard }
    $z = Get-TelefonZiffern $Nummer $Praefix
    $p = ([string]$Praefix) -replace '[^\d]', ''
    if ($z -eq '' -or $p -eq '') { return '' }
    if (-not $z.StartsWith($p)) { return '' }
    $rest = $z.Substring($p.Length)
    if ($rest.Length -lt 1 -or $rest.Length -gt 4) { return '' }
    return $rest
}

function Test-TelefonImBlock {
    <# Liegt die Nummer im Nummernblock des Hauses? #>
    param([string]$Nummer, [string]$Praefix)
    return ((Get-TelefonKurzwahl $Nummer $Praefix) -ne '')
}

function Get-StatusNorm {
    <#
      Status einer Client-Zeile vereinheitlichen (Aktiv, Lager, Archiviert).
      Leer bleibt leer – es gilt sonst als «Aktiv», und ein leeres Feld soll nicht allein
      dadurch zu einem geschriebenen Wert werden. Ein unbekannter Wert bleibt unverändert.
    #>
    param([string]$Status)
    if (-not $Status) { return '' }
    $s = ([string]$Status).Trim()
    if ($s -eq '') { return '' }
    switch ($s.ToLowerInvariant()) {
        'aktiv' { return 'Aktiv' }
        'lager' { return 'Lager' }
        'archiviert' { return 'Archiviert' }
    }
    return $s
}

function Get-TelefonStatusNorm {
    <# Status einer Telefonzeile vereinheitlichen: Aktiv, Inaktiv, Frei. Leer bleibt leer (gilt als Aktiv). #>
    param([string]$Status)
    if (-not $Status) { return '' }
    $s = ([string]$Status).Trim()
    if ($s -eq '') { return '' }
    switch ($s.ToLowerInvariant()) {
        'aktiv' { return 'Aktiv' }
        'inaktiv' { return 'Inaktiv' }
        'frei' { return 'Frei' }
    }
    return $s
}

# ---------------------------------------------------------------------------
# 3b) Verlauf (mehrzeilige Klartextspalte mit einem JSON-Array)
# ---------------------------------------------------------------------------
# Format eines Eintrags:
#   { "id": "<GUID>", "datum": "2026-09-03", "text": "Freitext",
#     "quelle": "manuell" | "sync", "erstellt": "2026-09-03T14:05:00Z" }
# Der Sync hängt nur an; er ändert oder löscht nie einen bestehenden Eintrag.

function Format-VerlaufDatum {
    <# Datum eines Verlaufseintrags als YYYY-MM-DD. Unlesbares oder fehlendes Datum -> heute. #>
    param($Datum, $Heute)
    if (-not $Heute) { $Heute = Get-Date }
    if ($null -eq $Datum -or ($Datum -is [string] -and ([string]$Datum).Trim() -eq '')) { return ([datetime]$Heute).ToString('yyyy-MM-dd') }
    if ($Datum -is [datetime]) { return ([datetime]$Datum).ToString('yyyy-MM-dd') }
    $s = ([string]$Datum).Trim()
    if ($s -match '^(\d{4}-\d{2}-\d{2})') { return $Matches[1] }
    try { return ([datetime]::Parse($s, [Globalization.CultureInfo]::InvariantCulture)).ToString('yyyy-MM-dd') } catch { }
    return ([datetime]$Heute).ToString('yyyy-MM-dd')
}

function ConvertFrom-Verlauf {
    <#
      Spaltentext -> Array von Verlaufseinträgen. Leerer Text ergibt ein leeres Array.
      Ohne -Streng ist die Funktion robust: unlesbarer Inhalt ergibt ein leeres Array (fürs Lesen/Anzeigen).
      Mit -Streng wirft sie einen Fehler – das braucht der Sync, damit er beim Schreiben keinen
      kaputten (aber vielleicht rettbaren) Inhalt stillschweigend überschreibt.
      PowerShell 5.1: ConvertFrom-Json liefert bei einem einzelnen Element kein Array, darum @().
    #>
    param([string]$Text, [switch]$Streng)
    if ($null -eq $Text) { $Text = '' }
    $t = ([string]$Text).Trim()
    if ($t -eq '') { return @() }
    $roh = $null
    try { $roh = ConvertFrom-Json $t } catch {
        if ($Streng) { throw "Verlauf ist kein gültiges JSON: $($_.Exception.Message)" }
        return @()
    }
    if ($null -eq $roh) { return @() }
    if ($Streng -and $t -notmatch '^\s*\[') { throw 'Verlauf ist kein JSON-Array.' }
    $ergebnis = New-Object System.Collections.ArrayList
    foreach ($e in @($roh)) {
        if ($null -eq $e) { continue }
        if ($e -is [string] -or $e -is [valuetype]) {
            if ($Streng) { throw 'Verlauf enthält einen Eintrag, der kein Objekt ist.' }
            continue
        }
        $id = Get-Text $e 'id'
        if ($id -eq '') { $id = [guid]::NewGuid().ToString() }
        [void]$ergebnis.Add([pscustomobject]@{
                id       = $id
                datum    = (Format-VerlaufDatum (Get-Text $e 'datum'))
                text     = (Get-Text $e 'text')
                quelle   = $(if ((Get-Text $e 'quelle') -eq '') { 'manuell' } else { (Get-Text $e 'quelle') })
                erstellt = (Get-Text $e 'erstellt')
            })
    }
    return @($ergebnis.ToArray())
}

function ConvertTo-Verlauf {
    <#
      Array von Verlaufseinträgen -> kompakter JSON-Text für die Spalte.
      Jeder Eintrag wird einzeln serialisiert und von Hand zusammengesetzt, weil ConvertTo-Json
      in PowerShell 5.1 aus einem einelementigen Array ein Objekt statt eines Arrays macht.
    #>
    param($Eintraege)
    $liste = @(@($Eintraege) | Where-Object { $null -ne $_ })
    if ($liste.Count -eq 0) { return '[]' }
    $teile = New-Object System.Collections.ArrayList
    foreach ($e in $liste) {
        $o = [ordered]@{
            id       = (Get-Text $e 'id')
            datum    = (Get-Text $e 'datum')
            text     = (Get-Text $e 'text')
            quelle   = (Get-Text $e 'quelle')
            erstellt = (Get-Text $e 'erstellt')
        }
        if ($o['id'] -eq '') { $o['id'] = [guid]::NewGuid().ToString() }
        [void]$teile.Add(($o | ConvertTo-Json -Depth 4 -Compress))
    }
    return '[' + ($teile -join ',') + ']'
}

function Add-VerlaufEintrag {
    <#
      Hängt einen Eintrag an einen bestehenden Verlauf an und gibt den neuen Spaltentext zurück.
      Bestehende Einträge bleiben unverändert; ist der bestehende Inhalt kein gültiges JSON,
      wirft die Funktion (der Aufrufer loggt den Fehler und überspringt die Zeile).
    #>
    param(
        [string]$Verlauf,
        [Parameter(Mandatory = $true)][string]$Text,
        $Datum,
        [string]$Quelle = 'sync',
        $Zeitpunkt
    )
    if (-not $Zeitpunkt) { $Zeitpunkt = Get-Date }
    $bestehend = @(ConvertFrom-Verlauf -Text $Verlauf -Streng)
    $neu = [pscustomobject]@{
        id       = [guid]::NewGuid().ToString()
        datum    = (Format-VerlaufDatum $Datum $Zeitpunkt)
        text     = $Text
        quelle   = $(if ($Quelle) { $Quelle } else { 'sync' })
        erstellt = (ToIso $Zeitpunkt)
    }
    return (ConvertTo-Verlauf (@($bestehend) + @($neu)))
}

function Add-VerlaufEintraege {
    <# Mehrere Texte auf einmal anhängen (gleiches Datum, gleiche Quelle). #>
    param([string]$Verlauf, [string[]]$Texte, $Datum, [string]$Quelle = 'sync', $Zeitpunkt)
    $t = $Verlauf
    foreach ($x in @($Texte)) {
        if (-not $x) { continue }
        $t = Add-VerlaufEintrag -Verlauf $t -Text $x -Datum $Datum -Quelle $Quelle -Zeitpunkt $Zeitpunkt
    }
    return $t
}

function Get-InventarKonfiguration {
    <#
      Die Konfiguration für ein Werkzeug aus code\: bevorzugt Sync-Inventar.config.json, sonst die
      öffentlichen Werte aus frontend\konfig.js.

      Die Werkzeuge (Ergaenze-Spalten, Entferne-Spalte, die Migrationsskripte) melden sich per
      Device-Code an und brauchen darum weder Zertifikat noch ClientId des Syncs – nur Mandant,
      Site und die Listen-Ids. Genau die stehen auch in konfig.js, öffentlich und aktuell. So
      lassen sich die Werkzeuge von jedem Arbeitsplatz aus starten, ohne dass jemand die
      Serverdatei kopiert (in der Zertifikat-Thumbprint und ClientId stehen).

      $KonfigPfad ist Sync-Inventar.config.json; $FrontendPfad ist frontend\konfig.js.
    #>
    param([string]$KonfigPfad, [string]$FrontendPfad)
    if ($KonfigPfad -and (Test-Path $KonfigPfad)) { return Read-JsonDatei $KonfigPfad }
    if (-not $FrontendPfad -or -not (Test-Path $FrontendPfad)) {
        throw "Weder $KonfigPfad noch $FrontendPfad gefunden."
    }
    $js = Get-Content $FrontendPfad -Raw -Encoding UTF8
    $wert = {
        param([string]$Name)
        if ($js -match ('(?m)^\s*' + [regex]::Escape($Name) + '\s*:\s*"([^"]*)"')) { return $Matches[1] }
        return ''
    }
    $cfg = [pscustomobject]@{
        TenantId          = (& $wert 'mandantId')
        SiteId            = (& $wert 'siteId')
        SiteUrl           = ''
        AdminClientListId = (& $wert 'adminClientListId')
        EduClientListId   = (& $wert 'eduClientListId')
        BenutzerListId    = (& $wert 'benutzerListId')
        TelefonListId     = (& $wert 'telefonListId')
        SoftwareListId    = (& $wert 'softwareListId')
        KameraListId      = (& $wert 'kameraListId')
        KameraRolleListId = (& $wert 'kameraRolleListId')
        LogPath           = $null
    }
    foreach ($n in 'TenantId', 'SiteId') {
        if (-not $cfg.$n) { throw "In $FrontendPfad fehlt der Wert für $n." }
    }
    return $cfg
}

function Read-JsonDatei {
    <# Liest eine JSON-Datei als UTF-8 ein. #>
    param([string]$Pfad)
    if (-not (Test-Path $Pfad)) { throw "Datei nicht gefunden: $Pfad" }
    return (Get-Content $Pfad -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-JsonDatei {
    <# Schreibt ein Objekt als JSON (UTF-8 ohne BOM, damit auch der Browser es lesen kann). #>
    param($Objekt, [string]$Pfad, [int]$Depth = 8)
    $json = $Objekt | ConvertTo-Json -Depth $Depth
    [IO.File]::WriteAllText($Pfad, $json, (New-Object Text.UTF8Encoding($false)))
}

# ---------------------------------------------------------------------------
# 4) Anmeldung an Microsoft Graph
# ---------------------------------------------------------------------------
$script:GraphToken = $null
$script:GraphTokenTime = Get-Date
$script:GraphTokenProvider = $null

function Set-GraphTokenProvider {
    <# Hinterlegt einen Scriptblock, der ein frisches Access-Token liefert. #>
    param([scriptblock]$Provider)
    $script:GraphTokenProvider = $Provider
    $script:GraphToken = $null
}

function Set-GraphToken {
    <# Setzt ein bereits vorhandenes Access-Token (z. B. aus dem Device-Code-Flow). #>
    param([string]$Token)
    $script:GraphToken = $Token
    $script:GraphTokenTime = Get-Date
}

function Get-SyncZertifikat {
    <# Das Anmeldezertifikat des Syncs (LocalMachine\My, sonst CurrentUser\My) zum Thumbprint der Konfiguration. #>
    param($Cfg)
    $cert = Get-ChildItem -Path "Cert:\LocalMachine\My\$($Cfg.CertThumbprint)" -ErrorAction SilentlyContinue
    if (-not $cert) { $cert = Get-ChildItem -Path "Cert:\CurrentUser\My\$($Cfg.CertThumbprint)" -ErrorAction SilentlyContinue }
    if (-not $cert) { throw "Zertifikat $($Cfg.CertThumbprint) nicht gefunden (LocalMachine\My oder CurrentUser\My)" }
    return $cert
}

function Get-ZertifikatHinweis {
    <#
      Warnt rechtzeitig vor dem Ablauf des Anmeldezertifikats. Rückgabe: Text oder '' (alles gut).
      Abgelaufen -> der Sync kann sich nicht mehr anmelden; das steht dann ohnehin als Fehler im Log.
    #>
    param([datetime]$GueltigBis, [datetime]$Heute = (Get-Date), [int]$VorlaufTage = 60)
    $rest = [math]::Floor(($GueltigBis - $Heute).TotalDays)
    if ($rest -lt 0) { return "Das Anmeldezertifikat ist am $($GueltigBis.ToString('dd.MM.yyyy')) abgelaufen – erneuern (README Abschnitt 7.1)." }
    if ($rest -le $VorlaufTage) { return "Das Anmeldezertifikat läuft in $rest Tagen ab ($($GueltigBis.ToString('dd.MM.yyyy'))) – erneuern (README Abschnitt 7.1)." }
    return ''
}

function Get-GraphTokenZertifikat {
    <#
      Client-Credentials-Flow mit Zertifikat (JWT-Assertion). Erwartet ein Objekt mit
      TenantId, ClientId und CertThumbprint. Ein kurzer Netzausfall beim Anmelden bricht den Lauf
      nicht ab: bis zu drei Versuche; eine Ablehnung durch Entra ID (4xx) wird sofort gemeldet.
    #>
    param($Cfg)
    $cert = Get-SyncZertifikat $Cfg

    $b64 = { param($b) [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $header = @{ alg = 'RS256'; typ = 'JWT'; x5t = (& $b64 $cert.GetCertHash()) } | ConvertTo-Json -Compress
    $payload = @{
        aud = "https://login.microsoftonline.com/$($Cfg.TenantId)/oauth2/v2.0/token"
        iss = $Cfg.ClientId; sub = $Cfg.ClientId
        jti = [guid]::NewGuid().ToString()
        nbf = $now; exp = $now + 600
    } | ConvertTo-Json -Compress
    $unsigned = (& $b64 ([Text.Encoding]::UTF8.GetBytes($header))) + '.' + (& $b64 ([Text.Encoding]::UTF8.GetBytes($payload)))
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    if (-not $rsa) { throw 'Kein Zugriff auf den privaten Schlüssel des Zertifikats (Berechtigung für das Task-Konto prüfen)' }
    $sig = $rsa.SignData([Text.Encoding]::UTF8.GetBytes($unsigned), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $jwt = $unsigned + '.' + (& $b64 $sig)

    $body = @{
        client_id             = $Cfg.ClientId
        scope                 = 'https://graph.microsoft.com/.default'
        client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
        client_assertion      = $jwt
        grant_type            = 'client_credentials'
    }
    for ($versuch = 1; $versuch -le 3; $versuch++) {
        try {
            $resp = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($Cfg.TenantId)/oauth2/v2.0/token" -Body $body -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 60
            return $resp.access_token
        } catch {
            $status = Get-HttpStatus $_
            if ($versuch -ge 3 -or ($status -ge 400 -and $status -lt 500)) {
                throw "Anmeldung an Entra ID fehlgeschlagen: $($_.Exception.Message) $($_.ErrorDetails.Message)"
            }
            Start-Sleep -Seconds (15 * $versuch)
        }
    }
}

function Get-HttpStatus {
    <# HTTP-Status aus einem Fehlerobjekt von Invoke-RestMethod; ohne Antwort (Netz, Zeitüberschreitung) $null. #>
    param($Fehler)
    try {
        $r = $Fehler.Exception.Response
        if ($null -ne $r -and $null -ne $r.StatusCode) { return [int]$r.StatusCode }
    } catch { }
    return $null
}

function Get-GraphWiederholung {
    <#
      Entscheidet nach einem fehlgeschlagenen Graph-Aufruf, ob und wann es nochmals versucht wird.
      Reine Funktion, damit Test-Inventar.ps1 sie ohne Netz prüfen kann.
        401                  -> einmal neu anmelden und sofort wiederholen (Token abgelaufen)
        429, 503             -> wiederholen, für jede Methode: der Aufruf wurde nicht ausgeführt
        500, 502, 504, Netz  -> wiederholen, aber nur für GET, PATCH, PUT und DELETE. Ein POST
                                könnte trotz Fehler angekommen sein; ein zweiter legte eine Dublette an.
        alles andere         -> nicht wiederholen
      Gewartet wird Retry-After (höchstens 120 s), sonst 5, 10, 20, 40 … s.
    #>
    param($Status, [string]$Methode = 'GET', [int]$Versuch = 1, $RetryAfter, [bool]$SchonNeuAngemeldet = $false)
    $m = ([string]$Methode).ToUpperInvariant()
    $idempotent = @('GET', 'PATCH', 'PUT', 'DELETE', 'MERGE') -contains $m
    $warten = [math]::Min(120, 5 * [math]::Pow(2, [math]::Max(0, $Versuch - 1)))
    $ra = 0
    if ($null -ne $RetryAfter -and [int]::TryParse(([string]$RetryAfter).Trim(), [ref]$ra) -and $ra -gt 0) { $warten = [math]::Min(120, $ra) }
    $ergebnis = [pscustomobject]@{ Wiederholen = $false; Warten = 0; NeuAnmelden = $false }
    if ($Status -eq 401) {
        if (-not $SchonNeuAngemeldet) { $ergebnis.Wiederholen = $true; $ergebnis.NeuAnmelden = $true }
        return $ergebnis
    }
    if ($Status -eq 429 -or $Status -eq 503) { $ergebnis.Wiederholen = $true; $ergebnis.Warten = $warten; return $ergebnis }
    if ($idempotent -and ($null -eq $Status -or $Status -eq 500 -or $Status -eq 502 -or $Status -eq 504)) {
        $ergebnis.Wiederholen = $true; $ergebnis.Warten = $warten; return $ergebnis
    }
    return $ergebnis
}

function Get-GraphTokenDeviceCode {
    <#
      Device-Code-Flow: zeigt Code und Adresse gross auf der Konsole und wartet auf die Anmeldung.
      Die App-Registrierung muss «Allow public client flows» aktiviert haben.
    #>
    param(
        [string]$TenantId,
        [string]$ClientId,
        [string]$Scope = 'https://graph.microsoft.com/Sites.ReadWrite.All offline_access'
    )
    if (-not $TenantId) { throw 'Get-GraphTokenDeviceCode: TenantId fehlt' }
    if (-not $ClientId) { throw 'Get-GraphTokenDeviceCode: ClientId fehlt' }

    $dc = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" `
        -Body @{ client_id = $ClientId; scope = $Scope } -ContentType 'application/x-www-form-urlencoded'

    $strich = '=' * 62
    Write-Host ''
    Write-Host $strich -ForegroundColor Yellow
    Write-Host '   ANMELDUNG NOETIG' -ForegroundColor Yellow
    Write-Host ''
    Write-Host "   1) Adresse oeffnen : $($dc.verification_uri)" -ForegroundColor Cyan
    Write-Host "   2) Code eingeben   : $($dc.user_code)" -ForegroundColor Cyan
    Write-Host ''
    Write-Host "   $($dc.message)"
    Write-Host $strich -ForegroundColor Yellow
    Write-Host ''

    $interval = 5
    if ($dc.interval) { $interval = [int]$dc.interval }
    $ende = (Get-Date).AddSeconds([int]$dc.expires_in)
    while ((Get-Date) -lt $ende) {
        Start-Sleep -Seconds $interval
        try {
            $t = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
                -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $ClientId; device_code = $dc.device_code } `
                -ContentType 'application/x-www-form-urlencoded'
            if ($t.access_token) { return $t.access_token }
        } catch {
            $msg = "$($_.ErrorDetails.Message) $($_.Exception.Message)"
            if ($msg -match 'authorization_pending') { continue }
            if ($msg -match 'slow_down') { $interval += 5; continue }
            if ($msg -match 'AADSTS7000218|unauthorized_client') {
                throw "Device-Code abgelehnt: In der App-Registrierung muss «Allow public client flows» auf «Ja» stehen. ($msg)"
            }
            if ($msg -match 'expired_token|AADSTS70020') { throw 'Device-Code-Anmeldung abgelaufen (keine Anmeldung innerhalb der Frist).' }
            if ($msg -match 'access_denied|AADSTS') { throw "Device-Code-Anmeldung fehlgeschlagen: $msg" }
            # Alles andere (DNS, Proxy, kurzer Netzausfall) ist vorübergehend: weiter warten.
            Write-Host "   (Netzwerkfehler, versuche weiter: $($_.Exception.Message))" -ForegroundColor DarkGray
            continue
        }
    }
    throw 'Device-Code-Anmeldung abgelaufen (keine Anmeldung innerhalb der Frist).'
}

function Update-GraphToken {
    <# Holt ein frisches Token, wenn keins da ist, es älter als 45 Minuten ist oder -Erzwingen gilt. #>
    param([switch]$Erzwingen)
    if ($Erzwingen -or -not $script:GraphToken -or ((Get-Date) - $script:GraphTokenTime).TotalMinutes -gt 45) {
        if ($script:GraphTokenProvider) {
            $script:GraphToken = & $script:GraphTokenProvider
            $script:GraphTokenTime = Get-Date
        }
    }
    if (-not $script:GraphToken) { throw 'Kein Graph-Token vorhanden (Set-GraphToken oder Set-GraphTokenProvider aufrufen).' }
}

function Invoke-Graph {
    <#
      Graph-Aufruf mit Wiederholung (Regeln in Get-GraphWiederholung): Drosselung, kurze Ausfälle
      und ein abgelaufenes Token führen nicht zum Fehler, solange ein späterer Versuch klappt.
    #>
    param([string]$Method = 'GET', [string]$Uri, $Body, [string]$ContentType = 'application/json; charset=utf-8', [int]$Versuche = 6)
    if ($Uri -notmatch '^https://') { $Uri = 'https://graph.microsoft.com/v1.0' + $Uri }
    $payload = $null
    if ($null -ne $Body) {
        $payload = $Body
        if ($Body -isnot [byte[]]) { $payload = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 12 -Compress)) }
    }
    $neuAngemeldet = $false
    for ($try = 1; $try -le $Versuche; $try++) {
        Update-GraphToken
        $headers = @{ Authorization = "Bearer $script:GraphToken"; Accept = 'application/json' }
        try {
            if ($null -ne $payload) {
                return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body $payload -ContentType $ContentType -TimeoutSec 120
            }
            return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -TimeoutSec 120
        } catch {
            $fehlerSatz = $_
            $status = Get-HttpStatus $fehlerSatz
            $retryAfter = $null
            try { $retryAfter = $fehlerSatz.Exception.Response.Headers['Retry-After'] } catch { }
            $plan = Get-GraphWiederholung -Status $status -Methode $Method -Versuch $try -RetryAfter $retryAfter -SchonNeuAngemeldet $neuAngemeldet
            if ($plan.Wiederholen -and $try -lt $Versuche) {
                if ($plan.NeuAnmelden) { $neuAngemeldet = $true; Update-GraphToken -Erzwingen; continue }
                $was = $(if ($null -eq $status) { 'ohne Antwort' } else { "HTTP $status" })
                Log "Graph $Method $was – neuer Versuch in $($plan.Warten) s (Versuch $try von $Versuche)" 'WARN'
                Start-Sleep -Seconds ([int]$plan.Warten)
                continue
            }
            $detail = $fehlerSatz.ErrorDetails.Message
            if (-not $detail) { try { $sr = New-Object IO.StreamReader($fehlerSatz.Exception.Response.GetResponseStream()); $detail = $sr.ReadToEnd() } catch { } }
            throw "Graph $Method $Uri fehlgeschlagen: $($fehlerSatz.Exception.Message) $detail"
        }
    }
    throw "Graph $Method $Uri nach $Versuche Versuchen fehlgeschlagen"
}

function Get-GraphAlle {
    <# Liest eine ganze Graph-Sammlung inklusive Paging. #>
    param([string]$Uri)
    $alle = New-Object System.Collections.ArrayList
    $u = $Uri
    do {
        $page = Invoke-Graph -Uri $u
        foreach ($v in $page.value) { [void]$alle.Add($v) }
        $u = $page.'@odata.nextLink'
    } while ($u)
    return $alle
}

# ---------------------------------------------------------------------------
# 5) Spaltendefinitionen für Graph
# ---------------------------------------------------------------------------
function ConvertTo-GraphSpalte {
    <#
      Wandelt eine Spaltendefinition aus schema-client.json / schema-benutzer.json in das
      columnDefinition-Format von Microsoft Graph. Die Titelspalte kommt hier nicht vor,
      sie wird nachträglich per PATCH umbenannt.

      «default» im Schema wird zum Vorgabewert der Spalte. SharePoint gibt ihn auch für Zeilen
      zurück, die es vor der Spalte schon gab – dadurch bedeutet eine neue Ja/Nein-Spalte mit
      Vorgabe «Ja» nicht plötzlich «Nein» für den ganzen Altbestand.
    #>
    param($Def)
    $c = [ordered]@{ name = $Def.internal; displayName = $Def.display }
    if ($Def.description) { $c['description'] = [string]$Def.description }
    switch ([string]$Def.type) {
        'Note'     { $c['text'] = @{ allowMultipleLines = $true; textType = 'plain' } }
        'Boolean'  { $c['boolean'] = @{} }
        'Number'   { $c['number'] = @{} }
        'DateTime' { $c['dateTime'] = @{ format = 'dateTime'; displayAs = 'default' } }
        default    { $c['text'] = @{ allowMultipleLines = $false; maxLength = 255 } }
    }
    $vorgabe = Get-Feld $Def 'default'
    if ($null -ne $vorgabe -and "$vorgabe" -ne '') { $c['defaultValue'] = @{ value = [string]$vorgabe } }
    return $c
}

function Get-SpaltenHinweis {
    <#
      Ergänzt eine Graph-Fehlermeldung um den Weg zur Lösung, wenn das Anlegen einer Spalte an
      der Berechtigung scheitert. Die Zertifikats-Anmeldung des Syncs hat auf der Site nur die
      Rolle «write» und darf damit ausschliesslich Zeilen schreiben – Spalten anlegen darf nur
      ein Mensch mit Vollzugriff auf die Site.
    #>
    param($Fehler)
    if ("$Fehler" -match '\(403\)|accessDenied|Access denied') {
        return ' -> Keine Berechtigung, in dieser Liste Spalten anzulegen. Mit -Auth DeviceCode als Konto mit Vollzugriff auf die Site anmelden oder die Spalte von Hand in den Listeneinstellungen anlegen.'
    }
    return ''
}

function Select-VorhandeneFelder {
    <#
      Filtert die Felder eines Schreibvorgangs auf die Spalten, die es in der Liste wirklich gibt.
      Title existiert immer. Fehlt eine Spalte, fällt nur ihr Feld weg – ohne den Filter weist
      Graph den ganzen PATCH mit «Field … is not recognized» zurück und eine fehlende Spalte
      kostet alle Zeilen.
    #>
    param($Vorhanden, $Felder)
    $gefiltert = [ordered]@{}
    if ($null -eq $Felder) { return $gefiltert }
    foreach ($k in @($Felder.Keys)) {
        if ($k -eq 'Title' -or ($Vorhanden -and $Vorhanden.ContainsKey([string]$k))) { $gefiltert[$k] = $Felder[$k] }
    }
    return $gefiltert
}

function New-ProgrammSpalte {
    <# Spaltendefinition für ein Programm in der Benutzer-Liste (Textspalte mit 0/1/2). #>
    param($Programm)
    return [ordered]@{
        name        = $Programm.id
        displayName = $Programm.name
        description = 'Berechtigungsstufe: 0 = aus, 1 = manuell aktiviert, 2 = durch AD-Gruppe aktiviert'
        text        = @{ allowMultipleLines = $false; maxLength = 8 }
    }
}

# ---------------------------------------------------------------------------
# 6) Software-Liste
# ---------------------------------------------------------------------------
function ConvertTo-Programm {
    <#
      Eine Zeile der SharePoint-Liste «Software» in ein Programm-Objekt umwandeln.
        Title        -> id          (interner Spaltenname in der Benutzer-Liste)
        Name         -> name        (Anzeigename; leer fällt auf die Id zurück)
        Kategorie    -> kategorie   (leer wird «Programme»)
        AdGruppen    -> adGruppen   (eine Gruppe je Zeile, leere Zeilen fallen weg)
        Reihenfolge  -> reihenfolge (leer sortiert ans Ende)

      Zeilen ohne Id sind unbrauchbar – der Aufrufer wirft sie weg.
      Dieselbe Umrechnung steht in frontend/modell.js (programmSpalten).
    #>
    param($Felder)
    $id = Get-Text $Felder 'Title'
    if ($id -eq '') { return $null }
    $name = Get-Text $Felder 'Name'
    if ($name -eq '') { $name = $id }
    $kategorie = Get-Text $Felder 'Kategorie'
    if ($kategorie -eq '') { $kategorie = 'Programme' }
    $gruppen = @()
    foreach ($z in ((Get-Text $Felder 'AdGruppen') -split "`r?`n")) {
        $g = ([string]$z).Trim()
        if ($g -ne '' -and $gruppen -notcontains $g) { $gruppen += $g }
    }
    $reihenfolge = [double]::MaxValue
    $r = Get-Feld $Felder 'Reihenfolge'
    if ($null -ne $r -and "$r" -ne '') { try { $reihenfolge = [double]$r } catch { } }
    return [pscustomobject]@{
        id          = $id
        name        = $name
        kategorie   = $kategorie
        adGruppen   = $gruppen
        reihenfolge = $reihenfolge
    }
}

function Sort-Programme {
    <#
      Reihenfolge der Programmliste: erst nach «Reihenfolge», bei Gleichstand nach Name.
      Ohne Sortierung hinge die Anzeige an der Zufallsreihenfolge der Listenzeilen.
    #>
    param($Programme)
    return @($Programme | Sort-Object -Property @{ Expression = 'reihenfolge' }, @{ Expression = 'name' })
}

function Test-ProgrammId {
    <#
      Taugt der Text als interner Spaltenname der Benutzer-Liste?
      Erlaubt sind Buchstaben und Ziffern, beginnend mit einem Buchstaben, höchstens 30 Zeichen.
      Dieselbe Regel prüft das Frontend, bevor es eine Spalte anlegt.
    #>
    param([string]$Id)
    return [bool](([string]$Id) -match '^[A-Za-z][A-Za-z0-9]{0,29}$')
}

# ---------------------------------------------------------------------------
# 7) Kameras: reine Helfer (Name, MAC, Hersteller, Rechte)
# ---------------------------------------------------------------------------
# Die Kameras kommen aus Milestone XProtect (Management Server adminsrv347, REST-API).
# Eine Zeile der Liste «Kameras» steht für eine Hardware (ein Gerät); ihre Kanäle (eine
# 360°-Kamera hat zwei) stehen in der Zeile als Text. Dieselben Regeln für Ort, Hersteller und
# Rechte stehen gespiegelt in frontend/modell.js.

function Get-KameraOrt {
    <#
      Gebäude und Raum aus dem Kameranamen in Milestone. Die Namen folgen dem Muster
      «<Raum> <Bezeichnung>», der Raum beginnt mit dem Gebäude:
        «10.300 Treppe Trakt 1»   -> Gebaeude 10, Raum 10.300
        «33.A20 P3 Kasse A»       -> Gebaeude 33, Raum 33.A20
        «P1.A03 Kasse»            -> Gebaeude P1, Raum P1.A03
        «17.101.5 Anlieferung»    -> Gebaeude 17, Raum 17.101.5
      Ein Name ohne dieses Muster («AXIS M3086-V (10.11.15.176) - Kamera 2») ergibt leere Werte.
    #>
    param([string]$Name)
    $n = ([string]$Name).Trim()
    if ($n -match '^(?<g>[A-Za-z]?\d{1,3})\.(?<r>[0-9A-Za-z][0-9A-Za-z.\-]*)(\s|$)') {
        $g = $Matches['g'].ToUpperInvariant()
        $r = ($Matches['g'].ToUpperInvariant() + '.' + $Matches['r']).TrimEnd('.')
        return [pscustomobject]@{ Gebaeude = $g; Raum = $r }
    }
    return [pscustomobject]@{ Gebaeude = ''; Raum = '' }
}

function NormMac {
    <# MAC-Adresse für Abgleich und Anzeige: 988B0A43B99D, 98-8b-0a-43-b9-9d -> 98:8B:0A:43:B9:9D; Unbrauchbares -> ''. #>
    param([string]$Mac)
    $h = (([string]$Mac) -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
    if ($h.Length -ne 12 -or $h -match '^0+$' -or $h -match '^F+$') { return '' }
    return (($h -split '(..)' | Where-Object { $_ }) -join ':')
}

function Get-KameraAdresse {
    <# IP-Adresse oder Hostname aus der Adresse der Hardware in Milestone («http://10.11.15.151/» -> 10.11.15.151). #>
    param([string]$Adresse)
    $a = ([string]$Adresse).Trim()
    if ($a -eq '') { return '' }
    try { $u = [uri]$a; if ($u.IsAbsoluteUri -and $u.Host) { return $u.Host } } catch { }
    return ($a -replace '^[a-z]+://', '' -replace '[:/].*$', '')
}

function Get-KameraModell {
    <#
      Hersteller und Modell aus dem Modelltext von Milestone:
        «HikVision DS-2CD2745FWD-IZS»            -> Hikvision | DS-2CD2745FWD-IZS
        «AXIS M3086-V Network Camera»            -> Axis | M3086-V
        «AXIS P3285-LV Dome Camera»              -> Axis | P3285-LV
        «Axis225FD»                              -> Axis | 225FD
        «Interlogix DS-2DE3204W-DE»              -> Interlogix | DS-2DE3204W-DE
    #>
    param([string]$Text)
    $t = ([string]$Text).Trim()
    if ($t -eq '') { return [pscustomobject]@{ Hersteller = ''; Modell = '' } }
    $bekannt = @{ 'hikvision' = 'Hikvision'; 'axis' = 'Axis'; 'interlogix' = 'Interlogix'; 'bosch' = 'Bosch'; 'dahua' = 'Dahua'; 'hanwha' = 'Hanwha'; 'mobotix' = 'Mobotix'; 'sony' = 'Sony'; 'panasonic' = 'Panasonic'; 'vivotek' = 'Vivotek'; 'uniview' = 'Uniview' }
    $hersteller = ''
    $rest = $t
    foreach ($k in $bekannt.Keys) {
        if ($t.ToLowerInvariant().StartsWith($k)) {
            $hersteller = $bekannt[$k]
            $rest = $t.Substring($k.Length).Trim()
            break
        }
    }
    if ($hersteller -eq '') {
        $teile = $t -split '\s+', 2
        $hersteller = $teile[0]
        $rest = $(if ($teile.Count -gt 1) { $teile[1] } else { '' })
    }
    $rest = ($rest -replace '\s+(Fixed\s+)?(Bullet\s+)?(Dome\s+)?(Network\s+)?Camera$', '').Trim()
    if ($rest -eq '') { $rest = $t }
    return [pscustomobject]@{ Hersteller = $hersteller; Modell = $rest }
}

# Rechte einer Rolle auf eine Kamera. Milestone liefert sie als Ja/Nein-Werte mit Namen wie
# VIEW_LIVE oder PLAYBACK (je nach Schnittstelle auch viewLive). Verglichen wird ohne
# Unterstriche und ohne Gross-/Kleinschreibung. GENERIC_READ ist Voraussetzung für alles und
# wird nicht eigens genannt; Unbekanntes bleibt mit seinem Namen stehen.
# Die Namen von XProtect 2024 R1 (Antwort vom 15.10.2026) stehen jeweils zuerst.
$script:KameraRechtNamen = [ordered]@{
    'viewlive'                     = 'Live'
    'viewrestrictedlive'           = 'Live (eingeschränkt)'
    'playback'                     = 'Wiedergabe'
    'playbackrestrictedrecordings' = 'Wiedergabe (eingeschränkt)'
    'export'                       = 'Export'
    'readsequences'                = 'Sequenzen'
    'sequences'                    = 'Sequenzen'
    'smartsearch'                  = 'Intelligente Suche'
    'ptzcontrol'                   = 'PTZ'
    'ptz'                          = 'PTZ'
    'activateptzpreset'            = 'PTZ-Positionen'
    'ptzpresetcontrol'             = 'PTZ-Positionen'
    'manageptzpreset'              = 'PTZ-Positionen verwalten'
    'managelockptzpreset'          = 'PTZ-Positionen sperren'
    'reserveptzsession'            = 'PTZ-Sitzung reservieren'
    'releaseptzsession'            = 'PTZ-Sitzung freigeben'
    'auxcommands'                  = 'AUX-Befehle'
    'startmanualrecording'         = 'Manuelle Aufzeichnung'
    'stopmanualrecording'          = 'Manuelle Aufzeichnung'
    'startrecording'               = 'Manuelle Aufzeichnung'
    'manualrecording'              = 'Manuelle Aufzeichnung'
    'readbookmarks'                = 'Lesezeichen ansehen'
    'bookmarkview'                 = 'Lesezeichen ansehen'
    'createbookmarks'              = 'Lesezeichen erstellen'
    'bookmarkadd'                  = 'Lesezeichen erstellen'
    'editbookmarks'                = 'Lesezeichen bearbeiten'
    'bookmarkedit'                 = 'Lesezeichen bearbeiten'
    'deletebookmarks'              = 'Lesezeichen löschen'
    'bookmarkdelete'               = 'Lesezeichen löschen'
    'readevidencelock'             = 'Beweissicherung ansehen'
    'evidencelockview'             = 'Beweissicherung ansehen'
    'createevidencelock'           = 'Beweissicherung erstellen'
    'evidencelockcreate'           = 'Beweissicherung erstellen'
    'evidencelockedit'             = 'Beweissicherung bearbeiten'
    'deleteevidencelock'           = 'Beweissicherung löschen'
    'evidencelockdelete'           = 'Beweissicherung löschen'
    'readrestrictions'             = 'Einschränkungen ansehen'
    'createrestrictions'           = 'Einschränkungen erstellen'
    'deleterestrictions'           = 'Einschränkungen löschen'
    'readremoterecordings'         = 'Edge-Aufnahmen abrufen'
    'retrieveedgerecordings'       = 'Edge-Aufnahmen abrufen'
    'deleterecordings'             = 'Aufnahmen löschen'
    'liftprivacymasking'           = 'Privatsphärenmaske aufheben'
    'audiolive'                    = 'Audio live'
    'audioplayback'                = 'Audio Wiedergabe'
}
$script:KameraRechtIgnorieren = @('genericread', 'genericwrite', 'genericdelete', 'managesecurity', 'readsecurity', 'fullcontrol', 'enabled', 'deviceptzpriority')

function Get-KameraRechtName {
    <# Anzeigename eines Rechts aus Milestone; '' für Rechte, die nicht genannt werden. #>
    param([string]$Schluessel)
    $k = (([string]$Schluessel) -replace '[_\s-]', '').ToLowerInvariant()
    if ($k -eq '' -or $script:KameraRechtIgnorieren -contains $k) { return '' }
    if ($script:KameraRechtNamen.Contains($k)) { return $script:KameraRechtNamen[$k] }
    return [string]$Schluessel
}

function Test-MilestoneWahr {
    <# Ja/Nein-Wert aus Milestone: $true, 'True', 'true', 'Allow' -> $true. #>
    param($Wert)
    if ($Wert -is [bool]) { return $Wert }
    $s = ([string]$Wert).Trim().ToLowerInvariant()
    return ($s -eq 'true' -or $s -eq 'allow' -or $s -eq 'ja' -or $s -eq 'yes')
}

function Find-MilestoneRechte {
    <#
      Sammelt rekursiv die Namen der Eigenschaften mit wahrem Ja/Nein-Wert, die nach einem Recht
      aussehen: GROSS_MIT_UNTERSTRICH (VIEW_LIVE) oder ein bekannter Name (viewLive). Andere
      Ja/Nein-Felder der Antwort (etwa «enabled» einer Hülle) zählen so nicht.
    #>
    param($Objekt, [System.Collections.ArrayList]$Gefunden, [int]$Tiefe)
    if ($null -eq $Objekt -or $Tiefe -gt 6 -or $Objekt -is [string] -or $Objekt -is [valuetype]) { return }
    if ($Objekt -is [System.Collections.IEnumerable] -and -not ($Objekt -is [System.Collections.IDictionary])) {
        foreach ($e in $Objekt) { Find-MilestoneRechte $e $Gefunden ($Tiefe + 1) }
        return
    }
    $paare = @()
    if ($Objekt -is [System.Collections.IDictionary]) { $paare = @($Objekt.Keys | ForEach-Object { [pscustomobject]@{ Name = [string]$_; Value = $Objekt[$_] } }) }
    else { $paare = @($Objekt.PSObject.Properties | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Value = $_.Value } }) }
    foreach ($p in $paare) {
        $v = $p.Value
        if ($v -is [bool] -or ($v -is [string] -and $v -match '^(?i)(true|false|allow|deny)$')) {
            $norm = ($p.Name -replace '[_\s-]', '').ToLowerInvariant()
            $wieRecht = ($p.Name -cmatch '^[A-Z][A-Z0-9_]+$') -or $script:KameraRechtNamen.Contains($norm)
            if ($wieRecht -and (Test-MilestoneWahr $v) -and -not $Gefunden.Contains($p.Name)) { [void]$Gefunden.Add($p.Name) }
        } elseif ($null -ne $v -and -not ($v -is [string])) {
            Find-MilestoneRechte $v $Gefunden ($Tiefe + 1)
        }
    }
}

function ConvertFrom-MilestoneRechte {
    <#
      Antwort der Aufgabe «ChangeSecurityPermissions» einer Kamera -> Liste der gewährten Rechte
      (Anzeigenamen, sortiert wie $KameraRechtNamen, Unbekanntes danach). Gesucht wird rekursiv
      nach Eigenschaften mit Ja/Nein-Wert, deren Name nach einem Recht aussieht (VIEW_LIVE,
      viewLive …); verschachtelte Hüllen («data», «properties») sind egal. Ohne Live und ohne
      Wiedergabe sieht die Rolle keine Bilder: dann ist die Liste leer.
    #>
    param($Antwort)
    $gefunden = New-Object System.Collections.ArrayList
    Find-MilestoneRechte $Antwort $gefunden 0
    $namen = New-Object System.Collections.ArrayList
    foreach ($k in $gefunden) {
        $n = Get-KameraRechtName $k
        if ($n -ne '' -and -not $namen.Contains($n)) { [void]$namen.Add($n) }
    }
    $bild = @('Live', 'Live (eingeschränkt)', 'Wiedergabe', 'Wiedergabe (eingeschränkt)')
    if (-not @($namen | Where-Object { $bild -contains $_ }).Count) { return @() }
    return @(Sort-KameraRechte $namen)
}

function Sort-KameraRechte {
    <# Rechte in fester Reihenfolge (Live, Wiedergabe, Export …), Unbekanntes alphabetisch danach, ohne Doppel. #>
    param($Rechte)
    $reihe = @($script:KameraRechtNamen.Values | Select-Object -Unique)
    $liste = @(@($Rechte) | Where-Object { $_ } | Select-Object -Unique)
    $bekannt = @($reihe | Where-Object { $liste -contains $_ })
    $rest = @($liste | Where-Object { $reihe -notcontains $_ } | Sort-Object)
    return @($bekannt + $rest)
}

# ---------------------------------------------------------------------------
# 8) Milestone XProtect: Anmeldung und REST-Zugriff
# ---------------------------------------------------------------------------
# Anmeldung am Identity Provider des Management Servers (http://<server>/idp/connect/token):
#   Windows - mit dem Konto, unter dem das Skript läuft (Sync: SYSTEM = Computerkonto des
#             Servers). Kein Kennwort; Kerberos/NTLM schützen die Anmeldung auch über HTTP.
#   Basis   - mit einem Basisbenutzer von Milestone (Benutzername und Kennwort). Das Kennwort
#             liegt mit DPAPI (LocalMachine) verschlüsselt in einer Datei neben dem Sync und
#             geht bei jeder Anmeldung im Klartext zum Server, solange nur HTTP geht.
# Das Token gilt eine Stunde; Invoke-Milestone holt nach 50 Minuten oder bei 401 ein neues.

$script:MilestoneBasis = $null
$script:MilestoneToken = $null
$script:MilestoneTokenZeit = Get-Date
$script:MilestoneTokenProvider = $null

function Protect-MilestoneKennwort {
    <# Kennwort (SecureString) -> Base64 mit DPAPI LocalMachine: nur auf diesem Rechner lesbar. #>
    param([Parameter(Mandatory = $true)][securestring]$Kennwort)
    Add-Type -AssemblyName System.Security
    $klar = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Kennwort))
    $bytes = [Text.Encoding]::UTF8.GetBytes($klar)
    $geschuetzt = [Security.Cryptography.ProtectedData]::Protect($bytes, [Text.Encoding]::UTF8.GetBytes('ICT-Inventar Milestone'), [Security.Cryptography.DataProtectionScope]::LocalMachine)
    return [Convert]::ToBase64String($geschuetzt)
}

function Unprotect-MilestoneKennwort {
    <# Gegenstück zu Protect-MilestoneKennwort; liefert den Klartext nur für die Anmeldung. #>
    param([Parameter(Mandatory = $true)][string]$Base64)
    Add-Type -AssemblyName System.Security
    $bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($Base64.Trim()), [Text.Encoding]::UTF8.GetBytes('ICT-Inventar Milestone'), [Security.Cryptography.DataProtectionScope]::LocalMachine)
    return [Text.Encoding]::UTF8.GetString($bytes)
}

function Get-MilestoneTokenAnfrage {
    <#
      Holt ein Access-Token beim Identity Provider. $Cfg braucht MilestoneServer und optional
      MilestoneAnmeldung (Windows | Basis), MilestoneBenutzer, MilestoneKennwortDatei.
      $Credential: Windows-Anmeldung mit einem anderen Konto (Werkzeuge vom Arbeitsplatz).
    #>
    param($Cfg, [pscredential]$Credential)
    $basis = ([string]$Cfg.MilestoneServer).TrimEnd('/')
    if (-not $basis) { throw 'MilestoneServer fehlt in der Konfiguration (z. B. http://adminsrv347).' }
    $art = [string]$Cfg.MilestoneAnmeldung
    if (-not $art) { $art = 'Windows' }
    $p = @{ Method = 'Post'; Uri = "$basis/idp/connect/token"; ContentType = 'application/x-www-form-urlencoded'; TimeoutSec = 60 }
    # PowerShell 7 verweigert Negotiate über HTTP ohne ausdrückliche Erlaubnis; Kerberos/NTLM
    # schicken dabei kein Kennwort im Klartext.
    if ($PSVersionTable.PSVersion.Major -ge 6 -and $basis -like 'http:*') { $p['AllowUnencryptedAuthentication'] = $true }
    if ($art -eq 'Basis') {
        $datei = [string]$Cfg.MilestoneKennwortDatei
        if (-not $Cfg.MilestoneBenutzer -or -not $datei -or -not (Test-Path $datei)) {
            throw 'Für die Anmeldung «Basis» fehlen MilestoneBenutzer oder die Kennwortdatei (Installiere-Sync.ps1 -MilestoneKennwort).'
        }
        $kennwort = Unprotect-MilestoneKennwort (Get-Content $datei -Raw)
        $p['Body'] = @{ grant_type = 'password'; username = [string]$Cfg.MilestoneBenutzer; password = $kennwort; client_id = 'GrantValidatorClient' }
    } else {
        $p['Body'] = @{ grant_type = 'windows_credentials'; client_id = 'GrantValidatorClient' }
        if ($Credential) { $p['Credential'] = $Credential } else { $p['UseDefaultCredentials'] = $true }
    }
    for ($versuch = 1; $versuch -le 3; $versuch++) {
        try {
            $antwort = Invoke-RestMethod @p
            if (-not $antwort.access_token) { throw 'Der Identity Provider hat kein Token geliefert.' }
            return [string]$antwort.access_token
        } catch {
            $status = Get-HttpStatus $_
            if ($versuch -ge 3 -or ($status -ge 400 -and $status -lt 500)) {
                $hinweis = ''
                if ($status -eq 400 -or $status -eq 401) { $hinweis = ' – das Konto ist in Milestone keiner Rolle zugeordnet oder das Kennwort stimmt nicht (README Abschnitt 7.5).' }
                throw "Anmeldung an Milestone ($basis, $art) fehlgeschlagen: $($_.Exception.Message) $($_.ErrorDetails.Message)$hinweis"
            }
            Start-Sleep -Seconds (10 * $versuch)
        }
    }
}

function Set-MilestoneVerbindung {
    <# Legt Server und Anmeldung für Invoke-Milestone fest. #>
    param($Cfg, [pscredential]$Credential)
    $script:MilestoneBasis = ([string]$Cfg.MilestoneServer).TrimEnd('/')
    $script:MilestoneCfg = $Cfg
    $script:MilestoneCredential = $Credential
    $script:MilestoneTokenProvider = { Get-MilestoneTokenAnfrage $script:MilestoneCfg $script:MilestoneCredential }
    $script:MilestoneToken = $null
}

function Invoke-Milestone {
    <#
      Aufruf der REST-Schnittstelle von Milestone (Pfad relativ zu /API/rest/v1, z. B. 'hardware').
      Wiederholt wie Invoke-Graph (Get-GraphWiederholung): 401 -> neu anmelden, 429/503 und
      Netzfehler bei lesenden Aufrufen -> warten. Ein POST einer Aufgabe ändert hier nie etwas
      (ChangeSecurityPermissions ohne Rechte liest nur), wird aber trotzdem nicht wiederholt.
    #>
    param([string]$Pfad, [string]$Methode = 'GET', $Body, [int]$Versuche = 4)
    if (-not $script:MilestoneTokenProvider) { throw 'Set-MilestoneVerbindung wurde nicht aufgerufen.' }
    $uri = $Pfad
    if ($uri -notmatch '^https?://') { $uri = $script:MilestoneBasis + '/API/rest/v1/' + $Pfad.TrimStart('/') }
    $neuAngemeldet = $false
    for ($try = 1; $try -le $Versuche; $try++) {
        if (-not $script:MilestoneToken -or ((Get-Date) - $script:MilestoneTokenZeit).TotalMinutes -gt 50) {
            $script:MilestoneToken = & $script:MilestoneTokenProvider
            $script:MilestoneTokenZeit = Get-Date
        }
        $p = @{ Method = $Methode; Uri = $uri; Headers = @{ Authorization = "Bearer $script:MilestoneToken"; Accept = 'application/json' }; TimeoutSec = 120 }
        if ($null -ne $Body) {
            $p['Body'] = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress))
            $p['ContentType'] = 'application/json; charset=utf-8'
        }
        try {
            return Invoke-RestMethod @p
        } catch {
            $f = $_
            $status = Get-HttpStatus $f
            $plan = Get-GraphWiederholung -Status $status -Methode $Methode -Versuch $try -SchonNeuAngemeldet $neuAngemeldet
            if ($plan.Wiederholen -and $try -lt $Versuche) {
                if ($plan.NeuAnmelden) { $neuAngemeldet = $true; $script:MilestoneToken = $null; continue }
                Start-Sleep -Seconds ([int][math]::Min(30, $plan.Warten))
                continue
            }
            $e = New-Object Exception("Milestone $Methode $Pfad fehlgeschlagen: $($f.Exception.Message) $($f.ErrorDetails.Message)")
            $e.Data['Status'] = $status
            # Rumpf der Fehlerantwort: ChangeSecurityPermissions ohne Rechte antwortet mit 400 und
            # liefert die aktuellen Werte trotzdem mit (Get-MilestoneKameraRechte).
            $e.Data['Antwort'] = [string]$f.ErrorDetails.Message
            throw $e
        }
    }
}

function Get-MilestoneListe {
    <# Eine Sammlung der REST-Schnittstelle als Array (die Antwort trägt sie in «array»). #>
    param([string]$Pfad)
    $r = Invoke-Milestone -Pfad $Pfad
    if ($null -eq $r) { return @() }
    if ($r.PSObject.Properties['array']) { return @($r.array) }
    return @($r)
}

function Get-MilestoneKameraRechte {
    <#
      Rechte einer Rolle auf einen Kamerakanal, roh wie von Milestone. Eine Leseschnittstelle dafür
      gibt es nicht (Stand XProtect 2024 R1, Auskunft Milestone im Entwicklerforum 04/2025): die
      Aufgabe «ChangeSecurityPermissions» nur mit userPath und ohne zu setzende Rechte ändert nichts,
      antwortet mit 400 und liefert die aktuellen Werte im Rumpf. Diese 400 ist hier der Normalfall;
      eine 400 ohne lesbaren Rumpf und alle anderen Fehler gehen weiter an den Aufrufer.
    #>
    param([string]$KanalId, [string]$RolleId)
    # «type» muss vor «id» stehen: sonst liest Milestone die ID als 00000000-… und antwortet mit
    # 404 «Unknown resource» (gesehen am 15.10.2026 mit 2024 R1) – daher [ordered].
    $body = [ordered]@{ userPath = [ordered]@{ type = 'roles'; id = $RolleId } }
    try {
        return Invoke-Milestone -Pfad "cameras/$KanalId`?task=ChangeSecurityPermissions" -Methode 'POST' -Body $body -Versuche 1
    } catch {
        $fehlerRecord = $_
        $text = [string]$fehlerRecord.Exception.Data['Antwort']
        if ($fehlerRecord.Exception.Data['Status'] -eq 400 -and $text.Trim().StartsWith('{')) {
            $obj = $null
            try { $obj = $text | ConvertFrom-Json } catch { }
            if ($null -ne $obj) { return $obj }
        }
        throw $fehlerRecord
    }
}

function Get-MilestoneGeraete {
    <#
      Liest alle Kamera-Hardware aus Milestone: Hardware, ihre Kanäle (Kameras) und die
      Treiber-Einstellungen (MAC, Seriennummer, Firmware) – ein Objekt je Hardware.
      Hardware ohne Kamera-Kanal (reine E/A-Module) zählt nicht.
    #>
    $server = @{}
    foreach ($rs in (Get-MilestoneListe 'recordingServers')) { $server[[string]$rs.id] = [string]$rs.displayName }
    $kanaeleVon = @{}
    foreach ($c in (Get-MilestoneListe 'cameras')) {
        $hw = [string]$c.relations.parent.id
        if (-not $kanaeleVon.ContainsKey($hw)) { $kanaeleVon[$hw] = New-Object System.Collections.ArrayList }
        [void]$kanaeleVon[$hw].Add([pscustomobject]@{
                Id           = [string]$c.id
                Name         = [string]$c.name
                Kanal        = [int]$c.channel
                Aktiv        = [bool]$c.enabled
                Aufzeichnung = [bool]$c.recordingEnabled
                Geaendert    = [string]$c.lastModified
            })
    }
    $liste = New-Object System.Collections.ArrayList
    foreach ($h in (Get-MilestoneListe 'hardware')) {
        $id = [string]$h.id
        if (-not $kanaeleVon.ContainsKey($id)) { continue }
        $mac = ''; $serie = ''; $firmware = ''; $treiberModell = ''
        try {
            $s = Invoke-Milestone -Pfad "hardware/$id/hardwareDriverSettings"
            $einst = @(@($s.array) + @($s.data) | Where-Object { $_ })
            foreach ($e in $einst) {
                $d = $e.hardwareDriverSettings
                if (-not $d) { continue }
                if ($d.macAddress) { $mac = [string]$d.macAddress }
                if ($d.serialNumber) { $serie = [string]$d.serialNumber }
                if ($d.firmwareVersion) { $firmware = [string]$d.firmwareVersion }
                if ($d.detectedModelName) { $treiberModell = [string]$d.detectedModelName }
            }
        } catch {
            # Ohne Treiberdaten bleibt die Hardware trotzdem zuordenbar (über ihre ID).
            Log "Milestone: Treiberdaten von $($h.name) nicht lesbar: $($_.Exception.Message)" 'WARN'
        }
        $kanaele = @($kanaeleVon[$id] | Sort-Object Kanal)
        [void]$liste.Add([pscustomobject]@{
                HardwareId      = $id
                HardwareName    = [string]$h.name
                Adresse         = Get-KameraAdresse ([string]$h.address)
                Modell          = $(if ($h.model) { [string]$h.model } else { $treiberModell })
                HardwareAktiv   = [bool]$h.enabled
                Geaendert       = [string]$h.lastModified
                RecordingServer = [string]$server[[string]$h.relations.parent.id]
                Mac             = $mac
                Seriennummer    = $serie
                Firmware        = $firmware
                Kanaele         = $kanaele
            })
    }
    return @($liste.ToArray())
}
