<#
.SYNOPSIS
  Einmalige Einrichtung: App-Registrierung "SCCM-SharePoint-Sync" in Entra ID mit Zertifikat,
  Berechtigung Sites.Selected (Application) inkl. Admin-Consent und Schreibrecht nur auf die Site mgmts-ict-s.

.DESCRIPTION
  Auf dem Rechner ausführen, der später den Sync ausführt (z. B. adminsrv319), damit das Zertifikat
  samt privatem Schlüssel dort im Speicher LocalMachine\My liegt. Benötigt lokale Admin-Rechte (Zertifikat)
  und ein Entra-Konto mit Rolle "Anwendungsadministrator" oder "Globaler Administrator" (Device-Code-Anmeldung).

  Ablauf (alles per Microsoft Graph REST, kein Modul nötig):
   1. Selbstsigniertes Zertifikat (5 Jahre) erzeugen
   2. App-Registrierung anlegen, öffentlichen Schlüssel hinterlegen
   3. Service Principal anlegen, Sites.Selected zuweisen (= Admin-Consent)
   4. Der App Schreibrecht ("write") auf die SharePoint-Site erteilen
   5. Konfigurationsdatei Sync-Inventar.config.json schreiben (bestehende Werte bleiben erhalten)

.NOTES
  Läuft auch ohne Global Admin, wenn das Konto Application Administrator ist UND Site-Collection-Admin
  der Ziel-Site (für Schritt 4).

  Das Konto, unter dem Sync-Inventar.ps1 später läuft, braucht zusätzlich Leserecht auf das
  Active Directory (Benutzerattribute und Gruppenmitgliedschaften der in AdUserOUs genannten OUs).
#>
[CmdletBinding()]
param(
    [string]$TenantId    = 'campus-sursee.ch',
    [string]$AppName     = 'SCCM-SharePoint-Sync',
    [string]$SiteUrl     = 'https://campussursee.sharepoint.com/sites/mgmts-ict-s',
    [string]$ListTitle   = 'Computer Inventar',
    [string]$ListId      = '70afe6a4-0d23-4582-80c7-0cd0776961f8',
    [string]$SmsProvider = 'adminsrv319.sasadmin.local',
    [string]$SiteCode    = 'PS2',
    [string]$CertStore   = 'Cert:\LocalMachine\My',
    [string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy(); [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'Sync-Inventar.config.json' }

# --- 1) Zertifikat ---------------------------------------------------------
$cert = Get-ChildItem $CertStore | Where-Object { $_.Subject -eq "CN=$AppName" -and $_.NotAfter -gt (Get-Date).AddDays(30) } | Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) {
    Write-Host "Erzeuge Zertifikat CN=$AppName in $CertStore ..."
    $cert = New-SelfSignedCertificate -Subject "CN=$AppName" -CertStoreLocation $CertStore -KeyExportPolicy NonExportable `
        -KeySpec Signature -KeyLength 2048 -KeyAlgorithm RSA -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(5) `
        -KeyUsage DigitalSignature -Provider 'Microsoft Enhanced RSA and AES Cryptographic Provider'
}
Write-Host "Zertifikat: $($cert.Thumbprint) gültig bis $($cert.NotAfter)"
$keyB64 = [Convert]::ToBase64String($cert.GetRawCertData())

# --- Device-Code-Anmeldung (Public Client der Microsoft Graph PowerShell) --
$pubClient = '14d82eec-204b-4c2f-b7e8-296a70dab67e'
$scopes = 'Application.ReadWrite.All AppRoleAssignment.ReadWrite.All Directory.Read.All Sites.FullControl.All offline_access'
$dc = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" -Body @{ client_id = $pubClient; scope = $scopes }
Write-Host "`n>>> $($dc.message)`n" -ForegroundColor Yellow
$token = $null
do {
    Start-Sleep -Seconds $dc.interval
    try {
        $t = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $pubClient; device_code = $dc.device_code }
        $token = $t.access_token
    } catch {
        $msg = "$($_.ErrorDetails.Message) $($_.Exception.Message)"
        if ($msg -notmatch 'authorization_pending|slow_down') { throw }
        if ($msg -match 'slow_down') { Start-Sleep -Seconds 5 }
    }
} while (-not $token)
$H = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
function G($m, $u, $b) {
    try {
        if ($b) { Invoke-RestMethod -Method $m -Uri "https://graph.microsoft.com/v1.0$u" -Headers $H -Body ([Text.Encoding]::UTF8.GetBytes(($b | ConvertTo-Json -Depth 10))) }
        else    { Invoke-RestMethod -Method $m -Uri "https://graph.microsoft.com/v1.0$u" -Headers $H }
    } catch {
        $detail = $_.ErrorDetails.Message
        if (-not $detail) { try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $detail = $sr.ReadToEnd() } catch {} }
        throw "Graph $m $u fehlgeschlagen: $($_.Exception.Message)`n$detail"
    }
}

# --- Diagnose: welche Berechtigungen stecken im Token, welche Rollen hat das Konto? ---
$payload = $token.Split('.')[1]; $payload = $payload.PadRight($payload.Length + (4 - $payload.Length % 4) % 4, '=').Replace('-','+').Replace('_','/')
$claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
Write-Host "Angemeldet als: $($claims.upn)  |  Token-Scopes: $($claims.scp)"
$roles = (G GET '/me/memberOf/microsoft.graph.directoryRole?$select=displayName').value.displayName
Write-Host "Entra-Rollen des Kontos: $(if ($roles) { $roles -join ', ' } else { 'keine' })"
if ($claims.scp -notmatch 'Application\.ReadWrite\.All') { Write-Warning 'Das Token enthält Application.ReadWrite.All NICHT – die Zustimmung wurde im Browser nicht erteilt oder das Konto darf nicht zustimmen.' }
if ($roles -notcontains 'Application Administrator' -and $roles -notcontains 'Global Administrator' -and $roles -notcontains 'Cloud Application Administrator') { Write-Warning 'Das Konto hat weder Anwendungsadministrator noch Globaler Administrator – App-Anlage wird mit 403 scheitern.' }

$org = G GET '/organization'; $tenantGuid = $org.value[0].id
Write-Host "Tenant: $($org.value[0].displayName) ($tenantGuid)"

# --- 2) App-Registrierung ----------------------------------------------------
$graphSp = (G GET "/servicePrincipals?`$filter=appId eq '00000003-0000-0000-c000-000000000000'&`$select=id,appRoles").value[0]
$sitesSelected = $graphSp.appRoles | Where-Object { $_.value -eq 'Sites.Selected' -and $_.allowedMemberTypes -contains 'Application' }
if (-not $sitesSelected) { throw 'App-Rolle Sites.Selected nicht gefunden' }

$app = (G GET "/applications?`$filter=displayName eq '$AppName'").value | Select-Object -First 1
$keyCred = @{ type = 'AsymmetricX509Cert'; usage = 'Verify'; key = $keyB64; displayName = "CN=$AppName $($cert.Thumbprint)" }
$rra = @(@{ resourceAppId = '00000003-0000-0000-c000-000000000000'; resourceAccess = @(@{ id = $sitesSelected.id; type = 'Role' }) })
if (-not $app) {
    Write-Host "Lege App-Registrierung '$AppName' an ..."
    $app = G POST '/applications' @{ displayName = $AppName; signInAudience = 'AzureADMyOrg'; keyCredentials = @($keyCred); requiredResourceAccess = $rra; notes = "Synchronisiert SCCM ($SiteCode) in die SharePoint-Liste '$ListTitle'. Erstellt $(Get-Date -Format 'dd.MM.yyyy')." }
} else {
    Write-Host "App-Registrierung existiert bereits ($($app.appId)) – Zertifikat/Berechtigung aktualisieren"
    # PATCH keyCredentials ersetzt die Liste: bestehende Schlüssel (nur keyId) + neuer Schlüssel
    $creds = @($app.keyCredentials | Where-Object { $_.customKeyIdentifier -ne [Convert]::ToBase64String($cert.GetCertHash()) } | ForEach-Object { @{ type = $_.type; usage = $_.usage; keyId = $_.keyId; displayName = $_.displayName } })
    $creds += $keyCred
    G PATCH "/applications/$($app.id)" @{ requiredResourceAccess = $rra; keyCredentials = $creds } | Out-Null
}
$appId = $app.appId
Write-Host "ClientId: $appId"

# --- 3) Service Principal + Admin-Consent -----------------------------------
$sp = (G GET "/servicePrincipals?`$filter=appId eq '$appId'").value | Select-Object -First 1
if (-not $sp) { $sp = G POST '/servicePrincipals' @{ appId = $appId } ; Start-Sleep 5 }
$assigned = (G GET "/servicePrincipals/$($sp.id)/appRoleAssignments").value | Where-Object { $_.appRoleId -eq $sitesSelected.id }
if (-not $assigned) {
    Write-Host 'Erteile Admin-Consent für Sites.Selected ...'
    G POST "/servicePrincipals/$($sp.id)/appRoleAssignments" @{ principalId = $sp.id; resourceId = $graphSp.id; appRoleId = $sitesSelected.id } | Out-Null
}

# --- 4) Site-Berechtigung (write) ---------------------------------------------
$u = [uri]$SiteUrl; $site = G GET "/sites/$($u.Host):$($u.AbsolutePath)"
$perms = (G GET "/sites/$($site.id)/permissions").value | Where-Object { $_.grantedToIdentitiesV2.application.id -eq $appId -or $_.grantedToIdentities.application.id -eq $appId }
if (-not $perms) {
    Write-Host "Erteile der App Schreibrecht auf $SiteUrl ..."
    G POST "/sites/$($site.id)/permissions" @{ roles = @('write'); grantedToIdentities = @(@{ application = @{ id = $appId; displayName = $AppName } }) } | Out-Null
} else { Write-Host "Site-Berechtigung existiert bereits: $($perms.roles -join ',')" }

# --- 5) Konfiguration schreiben ------------------------------------------------
# Bestehende Konfiguration nicht überschreiben, sondern nur die Anmeldedaten nachführen.
$alt = $null
if (Test-Path $ConfigPath) { $alt = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json }
function AltWert($name, $vorgabe) {
    if ($alt -and $alt.PSObject.Properties[$name] -and "$($alt.$name)" -ne '') { return $alt.$name }
    return $vorgabe
}
$cfg = [ordered]@{
    TenantId            = $tenantGuid
    ClientId            = $appId
    CertThumbprint      = $cert.Thumbprint
    FrontendClientId    = (AltWert 'FrontendClientId' '<App-ID der Registrierung Computer Inventar Frontend, nur für Migrate-ToTwoLists.ps1 -Auth DeviceCode>')
    SiteUrl             = $SiteUrl
    SiteId              = (AltWert 'SiteId' '')
    AltListId           = (AltWert 'AltListId' $ListId)
    ComputerListId      = (AltWert 'ComputerListId' '<Listen-ID der Liste Computer, siehe Migrate-ToTwoLists.ps1>')
    BenutzerListId      = (AltWert 'BenutzerListId' '<Listen-ID der Liste Benutzer, siehe Migrate-ToTwoLists.ps1>')
    ProgrammeDateiPfad  = (AltWert 'ProgrammeDateiPfad' 'Inventar/programme.json')
    SmsProvider         = $SmsProvider
    SiteCode            = $SiteCode
    AdServer            = (AltWert 'AdServer' '')
    AdUserOUs           = @(AltWert 'AdUserOUs' @('<DN der OU Staff/users/Windows 11>', '<DN der OU Staff/users/Windows 10>'))
    AdGruppenPraefixe   = @(AltWert 'AdGruppenPraefixe' @())
    LoeschSchutzProzent = (AltWert 'LoeschSchutzProzent' 50)
    LogPath             = (AltWert 'LogPath' (Join-Path $ScriptDir 'Sync-Inventar.log'))
}
$cfg | ConvertTo-Json -Depth 5 | Set-Content -Path $ConfigPath -Encoding UTF8
Write-Host "`nKonfiguration geschrieben: $ConfigPath" -ForegroundColor Green
Write-Host 'Noch von Hand einzutragen: ComputerListId, BenutzerListId und vor allem AdUserOUs (die echten OU-DNs).'
Write-Host "Hinweis: Das Task-Konto braucht Leserecht auf den privaten Schlüssel (certlm.msc > Zertifikat > Alle Aufgaben > Private Schlüssel verwalten)."
Write-Host "Hinweis: Das Konto, unter dem Sync-Inventar.ps1 läuft, braucht zusätzlich LESERECHT AUF DAS ACTIVE DIRECTORY"
Write-Host "         (Benutzerattribute und Gruppenmitgliedschaften der konfigurierten OUs). Das Computerkonto des"
Write-Host "         Site-Servers (SYSTEM) erfüllt das in einer Domäne normalerweise bereits."
Write-Host "Test:  powershell -File .\Sync-Inventar.ps1 -WhatIf -OnlyComputers -OnlyDevices CAMPUS-073"
