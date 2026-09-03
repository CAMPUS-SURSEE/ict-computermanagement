<#
.SYNOPSIS
  Einmalige Einrichtung: App-Registrierung "Computer Inventar Frontend" in Entra ID
  für ein statisches Web-Frontend (Single-Page-Application, MSAL im Browser).

.DESCRIPTION
  Legt die App-Registrierung als Plattform "SPA" (Single-Page-Application) an, hinterlegt die
  delegierten Microsoft-Graph-Berechtigungen User.Read und Sites.ReadWrite.All, erteilt dafür den
  Admin-Consent für den ganzen Tenant und setzt die Unternehmensanwendung auf
  "Zuweisung erforderlich" (nur zugewiesene Personen dürfen sich anmelden).

  Benötigt ein Entra-Konto mit Rolle "Anwendungsadministrator" (bzw. "Cloud-Anwendungsadministrator")
  oder "Globaler Administrator" – der Admin-Consent geht nur mit einer dieser Rollen.
  Alles läuft per Microsoft Graph REST, es wird kein PowerShell-Modul benötigt.

  Ablauf:
   1. Device-Code-Anmeldung + Diagnose (Token-Scopes, Entra-Rollen des Kontos)
   2. App-Registrierung suchen oder anlegen (signInAudience = AzureADMyOrg, Plattform SPA)
   3. Service Principal anlegen, "Zuweisung erforderlich" setzen
   4. Admin-Consent für die delegierten Scopes (oauth2PermissionGrants)
   5. Ausgabe von ClientId/TenantId + Hinweis zur Benutzerzuweisung
   6. frontend\konfig.js mit der ClientId befüllen, falls vorhanden

.PARAMETER RedirectUris
  Die Umleitungsadressen (Redirect URIs) der SPA. Wichtig:
   - Jede Adresse muss EXAKT so eingetragen sein, wie der Browser sie später aufruft,
     inklusive Schrägstrich am Ende und ohne Abfragezeichenfolge (kein "?..." und kein "#...").
     Beispiel: https://inventar.campus-sursee.ch/  (Netlify-Adresse der produktiven Seite)
   - http://localhost:8123/ dient ausschliesslich lokalen Tests (z. B. `python -m http.server 8123`).
     Für produktive Adressen ist ausser localhost immer https zwingend.
  Mehrere Adressen als Array übergeben, z. B.:
    .\Setup-FrontendApp.ps1 -RedirectUris @('http://localhost:8123/','https://inventar.campus-sursee.ch/')
  Bei einer bereits bestehenden App werden vorhandene und neue Adressen zusammengeführt,
  es geht also keine bestehende Adresse verloren.

.NOTES
  Idempotent: Das Skript kann beliebig oft ausgeführt werden, ohne etwas kaputt zu machen.
  Es werden bewusst KEINE impliziten Flows (implicit grant) aktiviert – die SPA nutzt
  Authorization Code Flow mit PKCE. Die Plattform muss deshalb "spa" sein und nicht "web",
  sonst scheitert der Token-Tausch im Browser mit AADSTS9002326.
#>
[CmdletBinding()]
param(
    [string]$TenantId       = 'campus-sursee.ch',
    [string]$AppName        = 'Computer Inventar Frontend',
    [string[]]$RedirectUris = @('http://localhost:8123/'),
    [switch]$AssignmentRequired = $true,
    # «Allow public client flows» (isFallbackPublicClient): nötig, damit sich
    # Wartungsskripte mit dieser Client-ID per Device-Code anmelden koennen.
    [bool]$PublicClientFlows = $true,
    [string]$KonfigPath
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy(); [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
if (-not $KonfigPath) { $KonfigPath = Join-Path $ScriptDir '..\frontend\konfig.js' }

$GraphAppId    = '00000003-0000-0000-c000-000000000000'
# Sites.ReadWrite.All statt Sites.Read.All: das Frontend pflegt seit dem
# Gerätefenster (frontend\geraet.html) die von Hand geführten Spalten der
# Liste. Die Berechtigung ist delegiert, das Token kann also nie mehr, als die
# angemeldete Person in SharePoint ohnehin darf. Wer bisher nur Sites.Read.All
# hatte, muss dieses Skript einmal erneut ausführen, damit der Admin-Consent
# für den erweiterten Umfang erteilt wird (Schritt 4 ergänzt den fehlenden
# Scope im bestehenden Grant).
$DelegatedList = @('User.Read', 'Sites.ReadWrite.All')

# --- 1) Device-Code-Anmeldung (Public Client der Microsoft Graph PowerShell) --
$pubClient = '14d82eec-204b-4c2f-b7e8-296a70dab67e'
$scopes = 'Application.ReadWrite.All AppRoleAssignment.ReadWrite.All DelegatedPermissionGrant.ReadWrite.All Directory.Read.All offline_access'
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
if ($claims.scp -notmatch 'DelegatedPermissionGrant\.ReadWrite\.All') { Write-Warning 'Das Token enthält DelegatedPermissionGrant.ReadWrite.All NICHT – der Admin-Consent (Schritt 4) wird scheitern.' }
if ($roles -notcontains 'Application Administrator' -and $roles -notcontains 'Global Administrator' -and $roles -notcontains 'Cloud Application Administrator') { Write-Warning 'Das Konto hat weder Anwendungsadministrator noch Globaler Administrator – App-Anlage wird mit 403 scheitern.' }

$org = G GET '/organization'; $tenantGuid = $org.value[0].id
Write-Host "Tenant: $($org.value[0].displayName) ($tenantGuid)"

# --- 2) App-Registrierung ----------------------------------------------------
# Die IDs der delegierten Scopes werden zur Laufzeit ermittelt (nicht hartcodieren).
$graphSp = (G GET "/servicePrincipals?`$filter=appId eq '$GraphAppId'&`$select=id,oauth2PermissionScopes").value[0]
if (-not $graphSp) { throw 'Service Principal von Microsoft Graph nicht gefunden' }
$scopeIds = @()
foreach ($name in $DelegatedList) {
    $s = $graphSp.oauth2PermissionScopes | Where-Object { $_.value -eq $name } | Select-Object -First 1
    if (-not $s) { throw "Delegierter Scope '$name' wurde bei Microsoft Graph nicht gefunden" }
    $scopeIds += @{ id = $s.id; type = 'Scope' }
}
$rra = @(@{ resourceAppId = $GraphAppId; resourceAccess = $scopeIds })

$app = (G GET "/applications?`$filter=displayName eq '$AppName'").value | Select-Object -First 1
if (-not $app) {
    Write-Host "Lege App-Registrierung '$AppName' an ..."
    $app = G POST '/applications' @{
        displayName            = $AppName
        signInAudience         = 'AzureADMyOrg'
        spa                    = @{ redirectUris = @($RedirectUris) }
        requiredResourceAccess = $rra
        isFallbackPublicClient = [bool]$PublicClientFlows
        notes                  = "Statisches Web-Frontend (SPA, MSAL im Browser) für die Listen 'Computer' und 'Benutzer'. Erstellt $(Get-Date -Format 'dd.MM.yyyy')."
    }
} else {
    Write-Host "App-Registrierung existiert bereits ($($app.appId)) – Umleitungsadressen/Berechtigungen aktualisieren"
    $merged = @()
    if ($app.spa -and $app.spa.redirectUris) { $merged += @($app.spa.redirectUris) }
    $merged += @($RedirectUris)
    $merged = @($merged | Where-Object { $_ } | Select-Object -Unique)
    G PATCH "/applications/$($app.id)" @{ spa = @{ redirectUris = $merged }; requiredResourceAccess = $rra; isFallbackPublicClient = [bool]$PublicClientFlows } | Out-Null
    $RedirectUris = $merged
}
$appId = $app.appId
Write-Host "ClientId: $appId"

# --- 3) Service Principal (Unternehmensanwendung) ----------------------------
$sp = (G GET "/servicePrincipals?`$filter=appId eq '$appId'").value | Select-Object -First 1
if (-not $sp) {
    Write-Host 'Lege Service Principal (Unternehmensanwendung) an ...'
    $sp = G POST '/servicePrincipals' @{ appId = $appId }
    Start-Sleep 5
}
$wantAssignment = [bool]$AssignmentRequired
if ($sp.appRoleAssignmentRequired -ne $wantAssignment) {
    Write-Host "Setze 'Zuweisung erforderlich' auf $wantAssignment ..."
    G PATCH "/servicePrincipals/$($sp.id)" @{ appRoleAssignmentRequired = $wantAssignment } | Out-Null
} else {
    Write-Host "'Zuweisung erforderlich' steht bereits auf $wantAssignment"
}

# --- 4) Admin-Consent für die delegierten Scopes -----------------------------
$scopeString = $DelegatedList -join ' '
$grant = (G GET "/oauth2PermissionGrants?`$filter=clientId eq '$($sp.id)'").value | Where-Object { $_.resourceId -eq $graphSp.id } | Select-Object -First 1
if (-not $grant) {
    Write-Host "Erteile Admin-Consent für: $scopeString ..."
    G POST '/oauth2PermissionGrants' @{ clientId = $sp.id; consentType = 'AllPrincipals'; resourceId = $graphSp.id; scope = $scopeString } | Out-Null
} else {
    $have = @($grant.scope -split '\s+' | Where-Object { $_ })
    $missing = @($DelegatedList | Where-Object { $have -notcontains $_ })
    if ($missing.Count -gt 0) {
        $newScope = (@($have + $missing) | Select-Object -Unique) -join ' '
        Write-Host "Ergänze Admin-Consent um: $($missing -join ', ') ..."
        G PATCH "/oauth2PermissionGrants/$($grant.id)" @{ scope = $newScope } | Out-Null
    } else {
        Write-Host "Admin-Consent besteht bereits: $($grant.scope)"
    }
}

# --- 5) Ausgabe ---------------------------------------------------------------
Write-Host ''
Write-Host '=== Ergebnis ===' -ForegroundColor Green
Write-Host "ClientId (Anwendungs-ID): $appId"
Write-Host "TenantId (Verzeichnis-ID): $tenantGuid"
Write-Host "Tenant-Name für MSAL:      $TenantId"
Write-Host "Umleitungsadressen (SPA):"
foreach ($u in $RedirectUris) { Write-Host "  - $u" }
Write-Host "Delegierte Berechtigungen: $scopeString (Admin-Consent erteilt)"
Write-Host ("Allow public client flows:  {0}" -f $(if ($PublicClientFlows) { 'Ja' } else { 'Nein' }))
if ($PublicClientFlows) {
    Write-Host '  Damit koennen sich Wartungsskripte mit dieser ClientId per Device-Code anmelden.'
} else {
    Write-Host '  Achtung: Ohne "Allow public client flows" scheitert der Device-Code-Login des' -ForegroundColor Yellow
    Write-Host '  Migrationsskripts mit AADSTS7000218. Entra Admin Center > App-Registrierungen >' -ForegroundColor Yellow
    Write-Host "  $AppName > Authentifizierung > 'Öffentliche Clientflows zulassen' = Ja." -ForegroundColor Yellow
}
Write-Host ''
if ($wantAssignment) {
    Write-Host 'Benutzerzuweisung nötig ("Zuweisung erforderlich" ist aktiv):' -ForegroundColor Yellow
    Write-Host '  Entra Admin Center > Unternehmensanwendungen > "' -NoNewline; Write-Host "$AppName" -NoNewline; Write-Host '" > Benutzer und Gruppen > Benutzer/Gruppe hinzufügen'
    Write-Host '  Ohne Entra ID P1 können dort nur einzelne Personen zugewiesen werden, keine Gruppen.'
    Write-Host '  Wer nicht zugewiesen ist, erhält beim Anmelden AADSTS50105.'
} else {
    Write-Host 'Hinweis: "Zuweisung erforderlich" ist deaktiviert – jede Person im Tenant kann die App öffnen.'
}

# --- 6) konfig.js befüllen ------------------------------------------------------
Write-Host ''
if (Test-Path $KonfigPath) {
    $full = (Resolve-Path $KonfigPath).Path
    $text = [IO.File]::ReadAllText($full, [Text.Encoding]::UTF8)
    if ($text -match 'clientId:\s*"[^"]*"') {
        $alt = ([regex]'clientId:\s*"([^"]*)"').Match($text).Groups[1].Value
        if ($alt -eq $appId) {
            Write-Host "konfig.js enthält bereits die richtige ClientId: $full"
        } else {
            $neu = [regex]::Replace($text, 'clientId:\s*"[^"]*"', ('clientId: "' + $appId + '"'))
            [IO.File]::WriteAllText($full, $neu, (New-Object Text.UTF8Encoding($false)))
            Write-Host "konfig.js aktualisiert: $full" -ForegroundColor Green
            Write-Host "  clientId: `"$alt`"  ->  `"$appId`""
        }
    } else {
        Write-Warning "In $full wurde kein Eintrag 'clientId: \"...\"' gefunden – bitte die ClientId $appId manuell eintragen."
    }
} else {
    Write-Host "konfig.js nicht gefunden ($KonfigPath)." -ForegroundColor Yellow
    Write-Host "Bitte in der Frontend-Konfiguration manuell eintragen:"
    Write-Host "  clientId: `"$appId`""
    Write-Host "  tenantId: `"$tenantGuid`""
}
