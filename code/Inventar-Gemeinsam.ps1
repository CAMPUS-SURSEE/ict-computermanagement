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

function Set-InventarLog {
    <# Legt die Logdatei fest. Ohne Aufruf schreibt Log() nur auf die Konsole. #>
    param([string]$Pfad)
    $script:InventarLogPath = $Pfad
}

function Log {
    param([string]$msg, [string]$lvl = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $lvl, $msg
    Write-Host $line
    if ($script:InventarLogPath) {
        try { Add-Content -Path $script:InventarLogPath -Value $line -Encoding UTF8 } catch { }
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

function Get-GraphTokenZertifikat {
    <#
      Client-Credentials-Flow mit Zertifikat (JWT-Assertion). Erwartet ein Objekt mit
      TenantId, ClientId und CertThumbprint.
    #>
    param($Cfg)
    $cert = Get-ChildItem -Path "Cert:\LocalMachine\My\$($Cfg.CertThumbprint)" -ErrorAction SilentlyContinue
    if (-not $cert) { $cert = Get-ChildItem -Path "Cert:\CurrentUser\My\$($Cfg.CertThumbprint)" -ErrorAction SilentlyContinue }
    if (-not $cert) { throw "Zertifikat $($Cfg.CertThumbprint) nicht gefunden (LocalMachine\My oder CurrentUser\My)" }

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
    $resp = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($Cfg.TenantId)/oauth2/v2.0/token" -Body $body -ContentType 'application/x-www-form-urlencoded'
    return $resp.access_token
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

function Invoke-Graph {
    <# Graph-Aufruf mit Wiederholung bei 429/503/504. #>
    param([string]$Method = 'GET', [string]$Uri, $Body, [string]$ContentType = 'application/json; charset=utf-8')
    if (-not $script:GraphToken -or ((Get-Date) - $script:GraphTokenTime).TotalMinutes -gt 45) {
        if ($script:GraphTokenProvider) {
            $script:GraphToken = & $script:GraphTokenProvider
            $script:GraphTokenTime = Get-Date
        }
    }
    if (-not $script:GraphToken) { throw 'Kein Graph-Token vorhanden (Set-GraphToken oder Set-GraphTokenProvider aufrufen).' }
    $headers = @{ Authorization = "Bearer $script:GraphToken"; Accept = 'application/json' }
    if ($Uri -notmatch '^https://') { $Uri = 'https://graph.microsoft.com/v1.0' + $Uri }
    for ($try = 1; $try -le 5; $try++) {
        try {
            if ($null -ne $Body) {
                $payload = $Body
                if ($Body -isnot [byte[]]) {
                    $json = $Body | ConvertTo-Json -Depth 12 -Compress
                    $payload = [Text.Encoding]::UTF8.GetBytes($json)
                }
                return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body $payload -ContentType $ContentType
            } else {
                return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
            }
        } catch {
            $status = $null; try { $status = [int]$_.Exception.Response.StatusCode } catch { }
            if ($status -eq 429 -or $status -eq 503 -or $status -eq 504) {
                $wait = 5 * $try; try { $wait = [int]$_.Exception.Response.Headers['Retry-After'] } catch { }
                if ($wait -le 0) { $wait = 5 * $try }
                Log "Graph $status – warte $wait s (Versuch $try)" 'WARN'
                Start-Sleep -Seconds $wait
                continue
            }
            $detail = $_.ErrorDetails.Message
            if (-not $detail) { try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $detail = $sr.ReadToEnd() } catch { } }
            throw "Graph $Method $Uri fehlgeschlagen: $($_.Exception.Message) $detail"
        }
    }
    throw "Graph $Method $Uri nach 5 Versuchen fehlgeschlagen"
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
      Wandelt eine Spaltendefinition aus schema-computer.json / schema-benutzer.json in das
      columnDefinition-Format von Microsoft Graph. Die Titelspalte kommt hier nicht vor,
      sie wird nachträglich per PATCH umbenannt.
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
    return $c
}

function Get-SpaltenHinweis {
    <#
      Ergänzt eine Graph-Fehlermeldung um den Weg zur Lösung, wenn das Anlegen einer Spalte an
      der Berechtigung scheitert: Sites.Selected mit der Rolle «write» darf Zeilen schreiben,
      aber keine Spalten anlegen – dafür braucht die App mindestens die Rolle «manage».
    #>
    param($Fehler)
    if ("$Fehler" -match '\(403\)|accessDenied|Access denied') {
        return ' -> Die App darf auf dieser Site keine Spalten anlegen. Setup-EntraApp.ps1 erneut ausführen (hebt die Site-Rolle auf «manage») oder die Spalte von Hand in den Listeneinstellungen anlegen.'
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
