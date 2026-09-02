<#
.SYNOPSIS
  Synchronisiert Gerätedaten aus SCCM (SMS Provider, WMI) in die SharePoint-Liste "Computer Inventar".

.DESCRIPTION
  - Liest alle Geräte aus SCCM (SMS_R_System + SMS_CombinedDeviceResources + Hardware-/Software-Inventar,
    App-Deployments, Collections, Konsolenbenutzer).
  - Ordnet sie den Listenelementen über den PC-Namen (Title) zu. "Shared CAMPUS-001" wird auf CAMPUS-001
    abgebildet, d.h. alle Benutzerzeilen eines geteilten Geräts bekommen dieselben SCCM-Daten.
  - Geräte ohne Listenelement werden neu angelegt (nur Title + SCCM-Spalten, Excel-Spalten bleiben leer).
  - Listenelemente ohne SCCM-Gerät bekommen "In SCCM vorhanden = Nein".
  - Es werden nur geänderte Felder geschrieben (weniger Versionen, weniger API-Aufrufe).
  - Authentifizierung gegen Microsoft Graph per App-Registrierung + Zertifikat (Sites.Selected).

.NOTES
  PowerShell 5.1, benötigt Lesezugriff auf root\SMS\site_<SiteCode> (SCCM-Rolle "Read-only Analyst" reicht).
  Konfiguration: Sync-SccmToSharePoint.config.json neben dem Skript (siehe README.md).
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$WhatIf,          # nur anzeigen, was geschrieben würde
    [switch]$IncludeServers,  # standardmässig nur Workstation-Betriebssysteme
    [string[]]$OnlyDevices,   # zum Testen: nur diese Gerätenamen verarbeiten
    [switch]$DumpOnly         # nur SCCM auslesen und die aufbereiteten Felder ausgeben (kein SharePoint-Zugriff)
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy(); [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'Sync-SccmToSharePoint.config.json' }
$cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$LogPath = if ($cfg.LogPath) { $cfg.LogPath } else { Join-Path $ScriptDir 'Sync-SccmToSharePoint.log' }

function Log([string]$msg, [string]$lvl = 'INFO') {
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $lvl, $msg
    Write-Host $line
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
}

# ---------------------------------------------------------------------------
# 1) Graph-Token per Zertifikat (Client Credentials, JWT-Assertion)
# ---------------------------------------------------------------------------
function Get-GraphToken {
    $cert = Get-ChildItem -Path "Cert:\LocalMachine\My\$($cfg.CertThumbprint)" -ErrorAction SilentlyContinue
    if (-not $cert) { $cert = Get-ChildItem -Path "Cert:\CurrentUser\My\$($cfg.CertThumbprint)" -ErrorAction SilentlyContinue }
    if (-not $cert) { throw "Zertifikat $($cfg.CertThumbprint) nicht gefunden (LocalMachine\My oder CurrentUser\My)" }

    $b64 = { param($b) [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_') }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $header  = @{ alg = 'RS256'; typ = 'JWT'; x5t = (& $b64 $cert.GetCertHash()) } | ConvertTo-Json -Compress
    $payload = @{
        aud = "https://login.microsoftonline.com/$($cfg.TenantId)/oauth2/v2.0/token"
        iss = $cfg.ClientId; sub = $cfg.ClientId
        jti = [guid]::NewGuid().ToString()
        nbf = $now; exp = $now + 600
    } | ConvertTo-Json -Compress
    $unsigned = (& $b64 ([Text.Encoding]::UTF8.GetBytes($header))) + '.' + (& $b64 ([Text.Encoding]::UTF8.GetBytes($payload)))
    $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    if (-not $rsa) { throw "Kein Zugriff auf den privaten Schlüssel des Zertifikats (Berechtigung für das Task-Konto prüfen)" }
    $sig = $rsa.SignData([Text.Encoding]::UTF8.GetBytes($unsigned), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $jwt = $unsigned + '.' + (& $b64 $sig)

    $body = @{
        client_id             = $cfg.ClientId
        scope                 = 'https://graph.microsoft.com/.default'
        client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
        client_assertion      = $jwt
        grant_type            = 'client_credentials'
    }
    $resp = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$($cfg.TenantId)/oauth2/v2.0/token" -Body $body -ContentType 'application/x-www-form-urlencoded'
    return $resp.access_token
}

$script:Token = $null
$script:TokenTime = Get-Date
function Invoke-Graph {
    param([string]$Method = 'GET', [string]$Uri, $Body)
    if (-not $script:Token -or ((Get-Date) - $script:TokenTime).TotalMinutes -gt 45) { $script:Token = Get-GraphToken; $script:TokenTime = Get-Date }
    $headers = @{ Authorization = "Bearer $script:Token"; Accept = 'application/json' }
    if ($Uri -notmatch '^https://') { $Uri = 'https://graph.microsoft.com/v1.0' + $Uri }
    for ($try = 1; $try -le 5; $try++) {
        try {
            if ($null -ne $Body) {
                $json = $Body | ConvertTo-Json -Depth 10 -Compress
                return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8'
            } else {
                return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
            }
        } catch {
            $status = $null; try { $status = [int]$_.Exception.Response.StatusCode } catch {}
            if ($status -eq 429 -or $status -eq 503 -or $status -eq 504) {
                $wait = 5 * $try; try { $wait = [int]$_.Exception.Response.Headers['Retry-After'] } catch {}
                Log "Graph $status – warte $wait s (Versuch $try)" 'WARN'; Start-Sleep -Seconds $wait; continue
            }
            $detail = ''; try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $detail = $sr.ReadToEnd() } catch {}
            throw "Graph $Method $Uri fehlgeschlagen: $($_.Exception.Message) $detail"
        }
    }
}

# ---------------------------------------------------------------------------
# 2) Hilfsfunktionen
# ---------------------------------------------------------------------------
function ConvertFrom-WmiDate($s) {
    # SMS Provider liefert "20260902060738.000000+***" (UTC, Offset unbekannt)
    if (-not $s -or $s.Length -lt 14) { return $null }
    try { return [DateTime]::SpecifyKind([DateTime]::ParseExact($s.Substring(0,14), 'yyyyMMddHHmmss', $null), 'Utc') } catch { return $null }
}
function ToIso($d) { if ($d) { return ([DateTime]$d).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { return $null } }
function JaNein($b) { if ($null -eq $b -or ($b -is [string] -and $b.Trim() -eq '')) { return $null }; if ([bool]$b) { 'Ja' } else { 'Nein' } }
function Trunc([string]$s, [int]$max = 255) { if ($null -eq $s) { return $null }; $s = $s.Trim(); if ($s.Length -gt $max) { $s.Substring(0, $max - 1) + '…' } else { $s } }
function NormName([string]$n) { if (-not $n) { return '' }; $n = $n.Trim().ToUpperInvariant(); $n = $n -replace '^SHARED\s+', ''; return $n }

$ChassisMap = @{ 1='Andere'; 2='Unbekannt'; 3='Desktop'; 4='Low Profile Desktop'; 5='Pizza Box'; 6='Mini Tower'; 7='Tower'; 8='Portable'; 9='Laptop'; 10='Notebook'; 11='Hand Held'; 12='Docking Station'; 13='All in One'; 14='Sub Notebook'; 15='Space-Saving'; 16='Lunch Box'; 17='Main System Chassis'; 18='Expansion Chassis'; 19='SubChassis'; 20='Bus Expansion'; 21='Peripheral'; 22='Storage'; 23='Rack Mount'; 24='Sealed-Case PC'; 30='Tablet'; 31='Convertible'; 32='Detachable'; 35='Mini PC'; 36='Stick PC' }
$AppStatusMap = @{ 1='Erfolgreich'; 2='In Arbeit'; 3='Anforderungen nicht erfüllt'; 4='Unbekannt'; 5='Fehler' }
$IntentMap = @{ 1='Erforderlich'; 2='Verfügbar'; 3='Simulation' }
$EPInfectionMap = @{ 0='Unbekannt'; 1='Sauber'; 2='Sauber (Bedrohung entfernt)'; 3='Infiziert (Aktion ausstehend)'; 4='Infiziert (Bereinigung fehlgeschlagen)' }
$EncryptMap = @{ 0='Keine'; 1='AES 128 + Diffuser'; 2='AES 256 + Diffuser'; 3='AES 128'; 4='AES 256'; 5='Hardware'; 6='XTS-AES 128'; 7='XTS-AES 256' }

# ---------------------------------------------------------------------------
# 3) SCCM auslesen (alles in Bulk, gruppiert nach ResourceID)
# ---------------------------------------------------------------------------
$ns = "root\SMS\site_$($cfg.SiteCode)"; $srv = $cfg.SmsProvider
function Q([string]$wql) { Get-WmiObject -ComputerName $srv -Namespace $ns -Query $wql }
function Group-ById($objs, $key = 'ResourceID') { $h = @{}; foreach ($o in $objs) { $k = [string]$o.$key; if (-not $h.ContainsKey($k)) { $h[$k] = New-Object System.Collections.ArrayList }; [void]$h[$k].Add($o) }; return $h }

Log "==== Sync-Start (Provider $srv, Site $($cfg.SiteCode)) ===="
$osFilter = if ($IncludeServers) { '' } else { " and OperatingSystemNameandVersion not like '%Server%'" }
$systems = @(Q "select ResourceId,Name,Client,Active,Obsolete,Decommissioned,ClientVersion,ResourceDomainORWorkgroup,DistinguishedName,CreationDate,LastLogonTimestamp,LastLogonUserName,LastLogonUserDomain,IPAddresses,MACAddresses,ADSiteName,IsVirtualMachine,SMBIOSGUID,BuildExt,OperatingSystemNameandVersion,SMSUniqueIdentifier,AADDeviceID from SMS_R_System where Obsolete=0$osFilter")
if ($OnlyDevices) { $systems = @($systems | Where-Object { $OnlyDevices -contains $_.Name }) }
Log "SCCM: $($systems.Count) Geräte"
$idList = ($systems | ForEach-Object { $_.ResourceId }) -join ','
if (-not $idList) { throw 'Keine Geräte gefunden' }

$combined  = Group-ById (Q "select * from SMS_CombinedDeviceResources where ResourceID in ($idList)")
$compsys   = Group-ById (Q "select ResourceID,Manufacturer,Model,SystemType,Domain from SMS_G_System_COMPUTER_SYSTEM")
$os        = Group-ById (Q "select ResourceID,Caption,Version,InstallDate,LastBootUpTime,OSLanguage,TotalVisibleMemorySize from SMS_G_System_OPERATING_SYSTEM")
$bios      = Group-ById (Q "select ResourceID,SMBIOSBIOSVersion,ReleaseDate,SerialNumber from SMS_G_System_PC_BIOS")
$cpu       = Group-ById (Q "select ResourceID,Name,NumberOfCores,NumberOfLogicalProcessors from SMS_G_System_PROCESSOR")
$mem       = Group-ById (Q "select ResourceID,TotalPhysicalMemory from SMS_G_System_X86_PC_MEMORY")
$diskC     = Group-ById (Q "select ResourceID,Size,FreeSpace from SMS_G_System_LOGICAL_DISK where DeviceID='C:'")
$pdisk     = Group-ById (Q "select ResourceID,Model,Size,MediaType from SMS_G_System_PHYSICAL_DISK")
$encl      = Group-ById (Q "select ResourceID,ChassisTypes from SMS_G_System_SYSTEM_ENCLOSURE")
$tpm       = Group-ById (Q "select ResourceID,SpecVersion,IsEnabled_InitialValue,IsActivated_InitialValue from SMS_G_System_TPM")
$bitl      = Group-ById (Q "select ResourceID,DriveLetter,ProtectionStatus,EncryptionMethod,ConversionStatus from SMS_G_System_BITLOCKER_DETAILS")
$encv      = Group-ById (Q "select ResourceID,DriveLetter,ProtectionStatus from SMS_G_System_ENCRYPTABLE_VOLUME")
$conUsage  = Group-ById (Q "select ResourceID,TopConsoleUser,TotalConsoleUsers from SMS_G_System_SYSTEM_CONSOLE_USAGE")
$conUsers  = Group-ById (Q "select ResourceID,SystemConsoleUser,NumberOfConsoleLogons,TotalUserConsoleMinutes,LastConsoleUse from SMS_G_System_SYSTEM_CONSOLE_USER")
$nic       = Group-ById (Q "select ResourceID,IPAddress,MACAddress,DHCPEnabled from SMS_G_System_NETWORK_ADAPTER_CONFIGURATION where IPEnabled=1")
$mon       = Group-ById (Q "select ResourceID,Name,MonitorManufacturer,ScreenWidth,ScreenHeight from SMS_G_System_DESKTOP_MONITOR")
$batt      = Group-ById (Q "select ResourceID,Name,DesignCapacity,FullChargeCapacity,EstimatedChargeRemaining from SMS_G_System_BATTERY")
$office    = Group-ById (Q "select ResourceID,ProductName,ProductVersion,Channel,LicenseState from SMS_G_System_OFFICE_PRODUCTINFO")
$arp       = Group-ById (@(Q "select ResourceID,DisplayName,Version,Publisher from SMS_G_System_ADD_REMOVE_PROGRAMS") + @(Q "select ResourceID,DisplayName,Version,Publisher from SMS_G_System_ADD_REMOVE_PROGRAMS_64"))
$deploy    = Group-ById (Q "select MachineID,AppName,CollectionName,DeploymentIntent,AppStatusType,InstalledState,UserName from SMS_AppDeploymentAssetDetails") 'MachineID'
$collNames = @{}; foreach ($c in (Q "select CollectionID,Name from SMS_Collection")) { $collNames[$c.CollectionID] = $c.Name }
$members   = Group-ById (Q "select ResourceID,CollectionID from SMS_FullCollectionMembership")
$primary   = Group-ById (Q "select ResourceID,UniqueUserName,Types from SMS_UserMachineRelationship where IsActive=1")
Log "SCCM-Inventar geladen"

function First($h, $id) { if ($h.ContainsKey([string]$id)) { return $h[[string]$id][0] } else { return $null } }
function All($h, $id)   { if ($h.ContainsKey([string]$id)) { return $h[[string]$id] } else { return @() } }

$now = Get-Date
function Build-SccmFields($sys) {
    $id = [string]$sys.ResourceId
    $c = First $combined $id; $cs = First $compsys $id; $o = First $os $id; $b = First $bios $id; $p = First $cpu $id
    $m = First $mem $id; $d = First $diskC $id; $e = First $encl $id; $t = First $tpm $id; $cu = First $conUsage $id

    # Konsolenbenutzer
    $users = @(All $conUsers $id | Sort-Object { ConvertFrom-WmiDate $_.LastConsoleUse } -Descending)
    $lastConsole = if ($users.Count) { ConvertFrom-WmiDate $users[0].LastConsoleUse } else { $null }
    $consoleText = ($users | ForEach-Object { "{0} | {1} Anmeldungen | {2} Min | zuletzt {3:dd.MM.yyyy HH:mm}" -f $_.SystemConsoleUser, $_.NumberOfConsoleLogons, $_.TotalUserConsoleMinutes, (ConvertFrom-WmiDate $_.LastConsoleUse).ToLocalTime() }) -join "`n"

    # Deployments
    $deps = @(All $deploy $id | Sort-Object DeploymentIntent, AppName)
    $depText = ($deps | ForEach-Object { "{0} | {1} | {2} | {3}" -f $_.AppName, $_.CollectionName, $IntentMap[[int]$_.DeploymentIntent], $AppStatusMap[[int]$_.AppStatusType] }) -join "`n"
    $depReq = @($deps | Where-Object { $_.DeploymentIntent -eq 1 }).Count
    $depInst = @($deps | Where-Object { $_.AppStatusType -eq 1 }).Count

    # Installierte Software
    $sw = @(All $arp $id | Where-Object { $_.DisplayName } | Sort-Object DisplayName, Version -Unique)
    $swText = ($sw | ForEach-Object { if ($_.Version) { "$($_.DisplayName) ($($_.Version))" } else { $_.DisplayName } }) -join "`n"
    if ($swText.Length -gt 60000) { $swText = $swText.Substring(0, 60000) + "`n…" }

    # Collections
    $colls = @(All $members $id | ForEach-Object { $collNames[$_.CollectionID] } | Where-Object { $_ } | Sort-Object)
    # Primärer Benutzer
    $prim = (All $primary $id | ForEach-Object { $_.UniqueUserName } | Sort-Object -Unique) -join ', '
    if (-not $prim -and $c) { $prim = $c.PrimaryUser }

    # Netzwerk
    $nics = @(All $nic $id)
    $ipv4 = ($nics | ForEach-Object { $_.IPAddress } | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notlike '169.254.*' } | Select-Object -First 1)
    if (-not $ipv4 -and $sys.IPAddresses) { $ipv4 = @($sys.IPAddresses | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notlike '169.254.*' })[0] }
    $dhcp = ($nics | Where-Object { $_.DHCPEnabled -eq 1 } | Measure-Object).Count -gt 0

    # BitLocker
    $blText = (All $bitl $id | ForEach-Object { "{0} {1} ({2})" -f $_.DriveLetter, $(if ($_.ProtectionStatus -eq 1) { 'geschützt' } else { 'NICHT geschützt' }), $EncryptMap[[int]$_.EncryptionMethod] }) -join '; '
    if (-not $blText) { $blText = (All $encv $id | ForEach-Object { "{0} {1}" -f $_.DriveLetter, $(if ($_.ProtectionStatus -eq 1) { 'geschützt' } else { 'NICHT geschützt' }) }) -join '; ' }

    $monText = (All $mon $id | ForEach-Object { "{0} {1} {2}x{3}" -f $_.MonitorManufacturer, $_.Name, $_.ScreenWidth, $_.ScreenHeight }) -join "`n"
    $battText = (All $batt $id | ForEach-Object { "{0} (Design {1} mWh, voll {2} mWh)" -f $_.Name, $_.DesignCapacity, $_.FullChargeCapacity }) -join '; '
    $pdText = (All $pdisk $id | ForEach-Object { "{0} | {1} GB | {2}" -f $_.Model, [math]::Round($_.Size/1GB,0), $(switch ([int]$_.MediaType) { 3 {'HDD'} 4 {'SSD'} 5 {'SCM'} default {'Typ unbekannt'} }) }) -join "`n"
    $offText = (All $office $id | ForEach-Object { "{0} {1} [{2}] {3}" -f $_.ProductName, $_.ProductVersion, $_.Channel, $_.LicenseState }) -join "`n"

    $chassis = $null; if ($e -and $e.ChassisTypes) { $ct = [int]([string]$e.ChassisTypes -split ',')[0]; $chassis = $ChassisMap[$ct]; if (-not $chassis) { $chassis = "Typ $ct" } }
    $ramGB = $null; if ($m -and $m.TotalPhysicalMemory) { $ramGB = [math]::Round($m.TotalPhysicalMemory / 1MB, 0) } elseif ($o -and $o.TotalVisibleMemorySize) { $ramGB = [math]::Round($o.TotalVisibleMemorySize / 1024, 0) }
    $serial = if ($c -and $c.SerialNumber) { $c.SerialNumber } elseif ($b) { $b.SerialNumber } else { $null }
    $osLang = if ($o -and $o.OSLanguage) { try { [Globalization.CultureInfo]::GetCultureInfo([int]$o.OSLanguage).DisplayName } catch { [string]$o.OSLanguage } } else { $null }

    $f = [ordered]@{
        SCCM_Name              = $sys.Name
        SCCM_Found             = 'Ja'
        SCCM_ResourceID        = [int]$sys.ResourceId
        SCCM_SMSID             = $sys.SMSUniqueIdentifier
        SCCM_Domain            = $sys.ResourceDomainORWorkgroup
        SCCM_OU                = Trunc $sys.DistinguishedName
        SCCM_ADSite            = $sys.ADSiteName
        SCCM_ADCreated         = ToIso (ConvertFrom-WmiDate $sys.CreationDate)
        SCCM_ADLastLogon       = ToIso (ConvertFrom-WmiDate $sys.LastLogonTimestamp)
        SCCM_LastLogonUser     = $(if ($c -and $c.LastLogonUser) { if ($c.UserDomainName) { "$($c.UserDomainName)\$($c.LastLogonUser)" } else { $c.LastLogonUser } } elseif ($sys.LastLogonUserName) { "$($sys.LastLogonUserDomain)\$($sys.LastLogonUserName)" } else { $null })
        SCCM_CurrentLogonUser  = $(if ($c) { $c.CurrentLogonUser } else { $null })
        SCCM_PrimaryUser       = Trunc $prim
        SCCM_TopConsoleUser    = $(if ($cu) { $cu.TopConsoleUser } else { $null })
        SCCM_LastConsoleUse    = ToIso $lastConsole
        SCCM_ConsoleUsers      = $consoleText
        SCCM_ClientVersion     = $sys.ClientVersion
        SCCM_ClientActive      = JaNein ($sys.Client -eq 1 -and $sys.Active -eq 1)
        SCCM_Online            = $(if ($c) { JaNein $c.CNIsOnline } else { $null })
        SCCM_LastOnline        = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.CNLastOnlineTime) } else { $null })
        SCCM_LastOffline       = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.CNLastOfflineTime) } else { $null })
        SCCM_LastActive        = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.LastActiveTime) } else { $null })
        SCCM_LastHardwareScan  = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.LastHardwareScan) } else { $null })
        SCCM_LastSoftwareScan  = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.LastSoftwareScan) } else { $null })
        SCCM_LastDDR           = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.LastDDR) } else { $null })
        SCCM_LastPolicyRequest = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.LastPolicyRequest) } else { $null })
        SCCM_LastClientCheck   = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.LastClientCheckTime) } else { $null })
        SCCM_ClientCheckPass   = $(if ($c -and $null -ne $c.ClientCheckPass) { @{1='Bestanden';2='Fehlgeschlagen';3='Nicht ausgewertet'}[[int]$c.ClientCheckPass] } else { $null })
        SCCM_ManagementPoint   = $(if ($c) { $c.CNAccessMP } else { $null })
        SCCM_BoundaryGroups    = $(if ($c) { Trunc $c.BoundaryGroups } else { $null })
        SCCM_CoManaged         = $(if ($c) { JaNein $c.CoManaged } else { $null })
        SCCM_AADDeviceID       = $sys.AADDeviceID
        SCCM_Manufacturer      = $(if ($cs) { $cs.Manufacturer } else { $null })
        SCCM_Model             = $(if ($cs) { $cs.Model } else { $null })
        SCCM_SerialNumber      = $serial
        SCCM_SMBIOSGUID        = $sys.SMBIOSGUID
        SCCM_ChassisType       = $chassis
        SCCM_IsVirtual         = JaNein $sys.IsVirtualMachine
        SCCM_CPU               = $(if ($p) { Trunc $p.Name } else { $null })
        SCCM_CPUCores          = $(if ($p -and $p.NumberOfCores) { [int]$p.NumberOfCores } else { $null })
        SCCM_CPULogical        = $(if ($p -and $p.NumberOfLogicalProcessors) { [int]$p.NumberOfLogicalProcessors } else { $null })
        SCCM_RAMGB             = $ramGB
        SCCM_DiskCGB           = $(if ($d -and $d.Size) { [math]::Round($d.Size/1024,0) } else { $null })
        SCCM_DiskCFreeGB       = $(if ($d -and $null -ne $d.FreeSpace) { [math]::Round($d.FreeSpace/1024,0) } else { $null })
        SCCM_PhysicalDisks     = $pdText
        SCCM_BIOSVersion       = $(if ($b) { $b.SMBIOSBIOSVersion } else { $null })
        SCCM_BIOSDate          = $(if ($b) { ToIso (ConvertFrom-WmiDate $b.ReleaseDate) } else { $null })
        SCCM_TPMVersion        = $(if ($t) { $t.SpecVersion } else { $null })
        SCCM_TPMEnabled        = $(if ($t) { JaNein ($t.IsEnabled_InitialValue -eq 1) } else { $null })
        SCCM_BitLocker         = Trunc $blText
        SCCM_Monitors          = $monText
        SCCM_Battery           = Trunc $battText
        SCCM_OS                = $(if ($o) { $o.Caption } else { $sys.OperatingSystemNameandVersion })
        SCCM_OSVersion         = $(if ($sys.BuildExt) { $sys.BuildExt } elseif ($o) { $o.Version } else { $null })
        SCCM_OSInstallDate     = $(if ($o) { ToIso (ConvertFrom-WmiDate $o.InstallDate) } else { $null })
        SCCM_LastBoot          = $(if ($o) { ToIso (ConvertFrom-WmiDate $o.LastBootUpTime) } else { $null })
        SCCM_OSLanguage        = $osLang
        SCCM_SystemType        = $(if ($cs) { $cs.SystemType } else { $null })
        SCCM_IPv4              = $ipv4
        SCCM_IPAddresses       = Trunc (($sys.IPAddresses | Where-Object { $_ }) -join ', ')
        SCCM_MACAddresses      = Trunc (($sys.MACAddresses | Where-Object { $_ }) -join ', ')
        SCCM_DHCP              = $(if ($nics.Count) { JaNein $dhcp } else { $null })
        SCCM_EPEnabled         = $(if ($c) { JaNein $c.EPEnabled } else { $null })
        SCCM_EPClientVersion   = $(if ($c) { $c.EPClientVersion } else { $null })
        SCCM_EPSignatureVersion= $(if ($c) { $c.EPAntivirusSignatureLastVersion } else { $null })
        SCCM_EPSignatureDate   = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.EPAntivirusSignatureLastUpdateDateTime) } else { $null })
        SCCM_EPLastQuickScan   = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.EPLastQuickScanDateTimeEnd) } else { $null })
        SCCM_EPLastFullScan    = $(if ($c) { ToIso (ConvertFrom-WmiDate $c.EPLastFullScanDateTimeEnd) } else { $null })
        SCCM_EPInfectionStatus = $(if ($c -and $null -ne $c.EPInfectionStatus) { $EPInfectionMap[[int]$c.EPInfectionStatus] } else { $null })
        SCCM_EPLastThreat      = $(if ($c) { $c.EPLastThreatName } else { $null })
        SCCM_EPPendingReboot   = $(if ($c) { JaNein $c.EPPendingReboot } else { $null })
        SCCM_Office            = $offText
        SCCM_DeployedApps      = $depText
        SCCM_AppsRequired      = $depReq
        SCCM_AppsInstalled     = $depInst
        SCCM_InstalledSoftware = $swText
        SCCM_InstalledSoftwareCount = $sw.Count
        SCCM_Collections       = ($colls -join "`n")
        SCCM_LastSync          = ToIso $now
        SCCM_SyncStatus        = 'OK'
    }
    # leere Strings -> null (Graph löscht Feld mit null)
    foreach ($k in @($f.Keys)) { if ($f[$k] -is [string] -and $f[$k].Trim() -eq '') { $f[$k] = $null } }
    return $f
}

if ($DumpOnly) {
    foreach ($sys in $systems) { [pscustomobject](Build-SccmFields $sys) }
    return
}

# ---------------------------------------------------------------------------
# 4) SharePoint-Liste lesen
# ---------------------------------------------------------------------------
$siteHost = ([uri]$cfg.SiteUrl).Host; $sitePath = ([uri]$cfg.SiteUrl).AbsolutePath
$site = Invoke-Graph -Uri "/sites/${siteHost}:${sitePath}"
$listId = $cfg.ListId
if (-not $listId) {
    $lists = Invoke-Graph -Uri "/sites/$($site.id)/lists?`$filter=displayName eq '$($cfg.ListTitle)'&`$select=id,displayName"
    $listId = $lists.value[0].id
}
if (-not $listId) { throw "Liste '$($cfg.ListTitle)' nicht gefunden" }
$itemsBase = "/sites/$($site.id)/lists/$listId/items"

$sccmFieldNames = (Build-SccmFields $systems[0]).Keys
$select = 'Title,Arbeitsplatz,' + ($sccmFieldNames -join ',')
$items = New-Object System.Collections.ArrayList
$uri = "$itemsBase`?`$expand=fields(`$select=$select)&`$top=500"
do {
    $page = Invoke-Graph -Uri $uri
    foreach ($it in $page.value) { [void]$items.Add($it) }
    $uri = $page.'@odata.nextLink'
} while ($uri)
Log "SharePoint: $($items.Count) Listenelemente"

$byName = @{}
foreach ($it in $items) { $k = NormName $it.fields.Title; if (-not $byName.ContainsKey($k)) { $byName[$k] = New-Object System.Collections.ArrayList }; [void]$byName[$k].Add($it) }

# ---------------------------------------------------------------------------
# 5) Abgleich
# ---------------------------------------------------------------------------
function Norm($v) {
    if ($null -eq $v) { return '' }
    if ($v -is [bool]) { return $v.ToString().ToLower() }
    if ($v -is [double] -or $v -is [int] -or $v -is [long] -or $v -is [decimal]) { return ([double]$v).ToString([Globalization.CultureInfo]::InvariantCulture) }
    $s = [string]$v
    if ($s -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') { return $s }
    if ($s -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}') { try { return ([DateTime]::Parse($s, $null, 'AdjustToUniversal')).ToString('yyyy-MM-ddTHH:mm:ssZ') } catch {} }
    return ($s -replace "`r`n", "`n").Trim()
}

$stats = @{ updated = 0; created = 0; unchanged = 0; missing = 0; errors = 0 }
$matched = New-Object System.Collections.Generic.HashSet[string]

foreach ($sys in $systems) {
    $key = NormName $sys.Name
    try { $fields = Build-SccmFields $sys } catch { Log "Fehler beim Aufbereiten von $($sys.Name): $_" 'ERROR'; $stats.errors++; continue }

    if ($byName.ContainsKey($key)) {
        foreach ($it in $byName[$key]) {
            $matched.Add([string]$it.id) | Out-Null
            $delta = [ordered]@{}
            foreach ($k in $fields.Keys) {
                if ($k -eq 'SCCM_LastSync') { continue }
                if ((Norm $fields[$k]) -ne (Norm $it.fields.$k)) { $delta[$k] = $fields[$k] }
            }
            if ($delta.Count -eq 0) { $stats.unchanged++; continue }
            $delta['SCCM_LastSync'] = $fields['SCCM_LastSync']
            if ($WhatIf) { Log "WHATIF Update $($it.fields.Title) (ID $($it.id)): $($delta.Keys -join ', ')"; $stats.updated++; continue }
            try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($it.id)/fields" -Body $delta | Out-Null; $stats.updated++; Log "Update $($it.fields.Title) (ID $($it.id)): $($delta.Count) Felder" }
            catch { Log "Update-Fehler $($it.fields.Title): $_" 'ERROR'; $stats.errors++ }
        }
    } else {
        $new = [ordered]@{ Title = $sys.Name }
        foreach ($k in $fields.Keys) { if ($null -ne $fields[$k]) { $new[$k] = $fields[$k] } }
        if ($WhatIf) { Log "WHATIF Neu: $($sys.Name)"; $stats.created++; continue }
        try { $r = Invoke-Graph -Method POST -Uri $itemsBase -Body @{ fields = $new }; $stats.created++; Log "Neu angelegt: $($sys.Name) (ID $($r.id))" }
        catch { Log "Anlage-Fehler $($sys.Name): $_" 'ERROR'; $stats.errors++ }
    }
}

# Listenelemente ohne SCCM-Gerät
if (-not $OnlyDevices) {
    foreach ($it in $items) {
        if ($matched.Contains([string]$it.id)) { continue }
        $title = [string]$it.fields.Title
        if ((NormName $title) -match '^(KEIN PC|\(OHNE PC\)|)$') { continue }
        if ($it.fields.SCCM_Found -eq 'Nein' -or ($null -eq $it.fields.SCCM_Found -and -not $it.fields.SCCM_Name)) {
            if ($it.fields.SCCM_Found -eq 'Nein') { $stats.missing++; continue }
        }
        $stats.missing++
        if ($WhatIf) { Log "WHATIF Nicht in SCCM: $title"; continue }
        try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($it.id)/fields" -Body @{ SCCM_Found = 'Nein'; SCCM_SyncStatus = "Kein SCCM-Gerät zu '$title'"; SCCM_LastSync = (ToIso $now) } | Out-Null; Log "Nicht in SCCM: $title" }
        catch { Log "Fehler (nicht in SCCM) $title : $_" 'ERROR'; $stats.errors++ }
    }
}

Log ("==== Fertig: {0} aktualisiert, {1} neu, {2} unverändert, {3} ohne SCCM-Gerät, {4} Fehler ====" -f $stats.updated, $stats.created, $stats.unchanged, $stats.missing, $stats.errors)
if ($stats.errors) { exit 1 }
