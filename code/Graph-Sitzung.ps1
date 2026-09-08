<#
.SYNOPSIS
  Haltbare Graph-Anmeldung für die Werkzeuge in code\: einmal Device-Code, danach still weiter.

.DESCRIPTION
  Der Device-Code-Flow in Inventar-Gemeinsam.ps1 liefert nur ein Access-Token; das ist nach
  einer Stunde abgelaufen und zwingt zu einer neuen Anmeldung. Dieses Skript holt zusätzlich das
  Refresh-Token (Scope «offline_access»), legt es verschlüsselt neben den Datenexporten ab
  (lokal\graph-sitzung.xml, per DPAPI an Benutzer und Rechner gebunden, in .gitignore) und
  richtet einen Token-Provider ein, der sich selbst erneuert. Ein zweiter Lauf eines Werkzeugs
  fragt darum nichts mehr.

  Verwendung in einem Werkzeug:

      . (Join-Path $ScriptDir 'Graph-Sitzung.ps1')
      Connect-GraphSitzung -TenantId $cfg.TenantId -ClientId $ClientId

  Danach arbeitet Invoke-Graph wie gewohnt. Läuft das Refresh-Token ab (Standard 90 Tage
  Inaktivität) oder wird die Sitzung widerrufen, kommt einmalig wieder der Device-Code.

  Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen (kein Netzzugriff).

.NOTES
  Windows PowerShell 5.1. Setzt Inventar-Gemeinsam.ps1 als bereits geladen voraus
  (Set-GraphTokenProvider, Log).
#>

# Standard-App für die Anmeldung: «Microsoft Graph Command Line Tools». Sie ist in jedem
# Mandanten vorhanden und erlaubt öffentliche Client-Flows; die Frontend-App tut das nicht.
$script:GraphSitzungClientIdStandard = '14d82eec-204b-4c2f-b7e8-296a70dab67e'
$script:GraphSitzungScopeStandard = 'https://graph.microsoft.com/Sites.ReadWrite.All offline_access'

# Wird von Connect-GraphSitzung gefüllt, damit der Provider ohne Parameter erneuern kann.
$script:GraphSitzung = $null

function Get-GraphSitzungPfad {
    <#
      Ablageort der Sitzung: lokal\graph-sitzung.xml neben dem Ordner code. Der Ordner lokal
      steht als Ganzes in .gitignore, die Datei kommt darum nie nach GitHub.
    #>
    param([string]$ScriptOrdner)
    if (-not $ScriptOrdner) { $ScriptOrdner = $PSScriptRoot }
    if (-not $ScriptOrdner) { $ScriptOrdner = (Get-Location).Path }
    $ordner = Join-Path $ScriptOrdner '..\lokal'
    return (Join-Path $ordner 'graph-sitzung.xml')
}

function Save-GraphSitzung {
    <#
      Legt das Refresh-Token verschlüsselt ab. ConvertFrom-SecureString benutzt DPAPI: die Datei
      lässt sich nur von demselben Windows-Benutzer auf demselben Rechner wieder lesen.
    #>
    param(
        [string]$Pfad,
        [string]$TenantId,
        [string]$ClientId,
        [string]$Scope,
        [string]$RefreshToken
    )
    if (-not $RefreshToken) { return }
    $ordner = Split-Path -Parent $Pfad
    if ($ordner -and -not (Test-Path $ordner)) { [void](New-Item -ItemType Directory -Path $ordner -Force) }
    $sicher = ConvertTo-SecureString $RefreshToken -AsPlainText -Force
    [pscustomobject]@{
        TenantId     = $TenantId
        ClientId     = $ClientId
        Scope        = $Scope
        RefreshToken = (ConvertFrom-SecureString $sicher)
        Gespeichert  = (Get-Date).ToString('o')
    } | Export-Clixml -Path $Pfad -Force
}

function Read-GraphSitzung {
    <# Liest die abgelegte Sitzung; gibt $null zurück, wenn es keine gibt oder sie unlesbar ist. #>
    param([string]$Pfad)
    if (-not (Test-Path $Pfad)) { return $null }
    try {
        $s = Import-Clixml -Path $Pfad
        if (-not $s.RefreshToken) { return $null }
        $sicher = ConvertTo-SecureString ([string]$s.RefreshToken)
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicher)
        try { $klar = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
        return [pscustomobject]@{
            TenantId     = [string]$s.TenantId
            ClientId     = [string]$s.ClientId
            Scope        = [string]$s.Scope
            RefreshToken = $klar
            Gespeichert  = [string]$s.Gespeichert
        }
    } catch {
        return $null
    }
}

function Get-GraphTokenPaarDeviceCode {
    <#
      Device-Code-Flow wie in Inventar-Gemeinsam.ps1, gibt aber die ganze Antwort zurück
      (access_token UND refresh_token). Zeigt Code und Adresse gross auf der Konsole.
    #>
    param(
        [string]$TenantId,
        [string]$ClientId,
        [string]$Scope = $script:GraphSitzungScopeStandard
    )
    if (-not $TenantId) { throw 'Get-GraphTokenPaarDeviceCode: TenantId fehlt' }
    if (-not $ClientId) { throw 'Get-GraphTokenPaarDeviceCode: ClientId fehlt' }

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
            if ($t.access_token) { return $t }
        } catch {
            $msg = "$($_.ErrorDetails.Message) $($_.Exception.Message)"
            if ($msg -match 'authorization_pending') { continue }
            if ($msg -match 'slow_down') { $interval += 5; continue }
            if ($msg -match 'AADSTS7000218|unauthorized_client') {
                throw "Device-Code abgelehnt: In der App-Registrierung muss «Allow public client flows» auf «Ja» stehen. ($msg)"
            }
            if ($msg -match 'expired_token|AADSTS70020') { throw 'Device-Code-Anmeldung abgelaufen (keine Anmeldung innerhalb der Frist).' }
            if ($msg -match 'access_denied|AADSTS') { throw "Device-Code-Anmeldung fehlgeschlagen: $msg" }
            Write-Host "   (Netzwerkfehler, versuche weiter: $($_.Exception.Message))" -ForegroundColor DarkGray
            continue
        }
    }
    throw 'Device-Code-Anmeldung abgelaufen (keine Anmeldung innerhalb der Frist).'
}

function Get-GraphTokenPaarRefresh {
    <#
      Tauscht ein Refresh-Token gegen ein frisches Tokenpaar. Wirft, wenn das Refresh-Token
      abgelaufen oder widerrufen ist – dann hilft nur eine neue Device-Code-Anmeldung.
    #>
    param(
        [string]$TenantId,
        [string]$ClientId,
        [string]$RefreshToken,
        [string]$Scope = $script:GraphSitzungScopeStandard
    )
    return Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
        -Body @{
            grant_type    = 'refresh_token'
            client_id     = $ClientId
            refresh_token = $RefreshToken
            scope         = $Scope
        } -ContentType 'application/x-www-form-urlencoded'
}

if ($InventarNurFunktionen) { return }

function Update-GraphSitzungToken {
    <#
      Holt ein frisches Access-Token für die laufende Sitzung und schreibt das (bei jedem
      Tausch neue) Refresh-Token zurück in die Ablage. Das ist der Token-Provider, den
      Invoke-Graph aufruft, sobald sein Token älter als 45 Minuten ist.
    #>
    $s = $script:GraphSitzung
    if (-not $s) { throw 'Keine Graph-Sitzung: zuerst Connect-GraphSitzung aufrufen.' }
    $t = Get-GraphTokenPaarRefresh -TenantId $s.TenantId -ClientId $s.ClientId -RefreshToken $s.RefreshToken -Scope $s.Scope
    if ($t.refresh_token) {
        $script:GraphSitzung.RefreshToken = [string]$t.refresh_token
        Save-GraphSitzung -Pfad $s.Pfad -TenantId $s.TenantId -ClientId $s.ClientId -Scope $s.Scope -RefreshToken ([string]$t.refresh_token)
    }
    return [string]$t.access_token
}

function Connect-GraphSitzung {
    <#
      Stellt die Verbindung her: erst still über die abgelegte Sitzung, sonst per Device-Code.
      Registriert danach den Token-Provider, damit Invoke-Graph beliebig lange weiterläuft.

      -Neu erzwingt eine frische Anmeldung (etwa nach einem Wechsel des Kontos).
    #>
    param(
        [string]$TenantId,
        [string]$ClientId = $script:GraphSitzungClientIdStandard,
        [string]$Scope = $script:GraphSitzungScopeStandard,
        [string]$Pfad,
        [switch]$Neu
    )
    if (-not $TenantId) { throw 'Connect-GraphSitzung: TenantId fehlt' }
    if (-not $Pfad) { $Pfad = Get-GraphSitzungPfad $PSScriptRoot }

    $token = $null
    if (-not $Neu) {
        $alt = Read-GraphSitzung $Pfad
        if ($alt -and $alt.TenantId -eq $TenantId -and $alt.ClientId -eq $ClientId) {
            try {
                $t = Get-GraphTokenPaarRefresh -TenantId $TenantId -ClientId $ClientId -RefreshToken $alt.RefreshToken -Scope $Scope
                $token = [string]$t.access_token
                $script:GraphSitzung = [pscustomobject]@{
                    TenantId = $TenantId; ClientId = $ClientId; Scope = $Scope; Pfad = $Pfad
                    RefreshToken = $(if ($t.refresh_token) { [string]$t.refresh_token } else { $alt.RefreshToken })
                }
                if ($t.refresh_token) {
                    Save-GraphSitzung -Pfad $Pfad -TenantId $TenantId -ClientId $ClientId -Scope $Scope -RefreshToken ([string]$t.refresh_token)
                }
                Log 'Graph-Sitzung aus der Ablage erneuert (keine Anmeldung nötig).'
            } catch {
                Log "Abgelegte Graph-Sitzung nicht mehr gültig: $($_.Exception.Message)" 'WARN'
                $token = $null
            }
        }
    }

    if (-not $token) {
        $t = Get-GraphTokenPaarDeviceCode -TenantId $TenantId -ClientId $ClientId -Scope $Scope
        $token = [string]$t.access_token
        $script:GraphSitzung = [pscustomobject]@{
            TenantId = $TenantId; ClientId = $ClientId; Scope = $Scope; Pfad = $Pfad
            RefreshToken = [string]$t.refresh_token
        }
        if ($t.refresh_token) {
            Save-GraphSitzung -Pfad $Pfad -TenantId $TenantId -ClientId $ClientId -Scope $Scope -RefreshToken ([string]$t.refresh_token)
            Log "Graph-Sitzung angelegt: $Pfad"
        } else {
            Log 'Anmeldung ohne Refresh-Token – die Sitzung hält nur diesen Lauf.' 'WARN'
        }
    }

    Set-GraphTokenProvider { Update-GraphSitzungToken }
    Set-GraphToken $token
    return $token
}
