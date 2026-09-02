<#
.SYNOPSIS
  Synchronisiert die SharePoint-Listen «Computer» (aus SCCM) und «Benutzer» (aus Active Directory).

.DESCRIPTION
  Phase Computer (wie bisher Sync-SccmToSharePoint.ps1):
    - liest alle Geräte samt Inventar aus SCCM (SMS Provider, WMI),
    - ordnet sie über den PC-Namen den Zeilen der Computer-Liste zu,
    - schreibt nur geänderte SCCM_*-Felder, legt fehlende Geräte neu an,
    - setzt bei Zeilen ohne SCCM-Gerät «In SCCM vorhanden = Nein».

  Phase Benutzer:
    - lädt programme.json aus der Dokumentbibliothek,
    - legt fehlende Programmspalten in der Benutzer-Liste an,
    - liest die AD-Benutzer der konfigurierten OUs (Modul ActiveDirectory, Fallback ADSI),
    - ermittelt je Programm die rekursiven Mitglieder der hinterlegten AD-Gruppen,
    - schreibt AD-Felder, Primärgerät (SCCM) und die Programmstufen (2 = aus AD-Gruppe),
    - löscht Zeilen, deren Login im AD-Scope fehlt (mit Löschschutz).

.PARAMETER OnlyComputers
  Nur die Computer-Phase ausführen.

.PARAMETER OnlyBenutzer
  Nur die Benutzer-Phase ausführen.

.PARAMETER DumpOnly
  Nur SCCM auslesen und die aufbereiteten Felder ausgeben (kein SharePoint-Zugriff).

.NOTES
  Windows PowerShell 5.1. Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die Funktionen.
  Das ausführende Konto braucht Leserecht auf SCCM (Rolle «Read-only Analyst») und auf das AD.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$WhatIf,
    [switch]$IncludeServers,
    [switch]$OnlyComputers,
    [switch]$OnlyBenutzer,
    [switch]$DumpOnly,
    [string[]]$OnlyDevices
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy(); [Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')

# ===========================================================================
# Reine Funktionen (ohne Graph, SCCM oder AD - werden von Test-Inventar.ps1 geprüft)
# ===========================================================================

function Get-ProgrammDelta {
    <#
      Neue Programmstufen eines Benutzers berechnen.
        Mitglied einer hinterlegten AD-Gruppe            -> '2'
        nicht Mitglied, bisher '2' (AD-Berechtigung weg) -> '0'
        sonst                                            -> unverändert (manuelle 1 bleibt 1)
      Rückgabe: Hashtable mit den zu schreibenden Feldern (nur die Änderungen).
    #>
    param(
        $Aktuell,                 # Hashtable/Objekt: Programm-Id -> bisheriger Wert
        [string[]]$MitgliedIds,   # Programme, in deren AD-Gruppen der Benutzer Mitglied ist
        [string[]]$ProgrammIds    # alle Programme
    )
    $delta = [ordered]@{}
    if (-not $MitgliedIds) { $MitgliedIds = @() }
    foreach ($id in $ProgrammIds) {
        $altRoh = Get-Feld $Aktuell $id
        $alt = ''
        if ($null -ne $altRoh) { $alt = ([string]$altRoh).Trim() }
        if ($alt -eq '') { $alt = '0' }
        $neu = $alt
        if ($MitgliedIds -contains $id) { $neu = '2' }
        elseif ($alt -eq '2') { $neu = '0' }
        # Ein leeres Feld gilt als '0'; es wird nur geschrieben, wenn sich die Stufe wirklich ändert.
        if ($neu -ne $alt) { $delta[$id] = $neu }
    }
    return $delta
}

function Test-Loeschschutz {
    <#
      Prüft, ob gelöscht werden darf.
        - AD liefert keinen einzigen Benutzer  -> nein
        - Anteil der zu löschenden Zeilen > Grenze -> nein
      Rückgabe: Objekt mit Erlaubt (bool), Grund (Text) und Prozent.
    #>
    param(
        [int]$AnzahlAdBenutzer,
        [int]$AnzahlZeilen,
        [int]$AnzahlLoeschen,
        [double]$GrenzeProzent = 50
    )
    if ($AnzahlAdBenutzer -le 0) {
        return [pscustomobject]@{ Erlaubt = $false; Prozent = 0; Grund = 'Das AD hat keinen einzigen Benutzer geliefert – es wird nichts gelöscht.' }
    }
    if ($AnzahlLoeschen -le 0) {
        return [pscustomobject]@{ Erlaubt = $true; Prozent = 0; Grund = 'Nichts zu löschen.' }
    }
    if ($AnzahlZeilen -le 0) {
        return [pscustomobject]@{ Erlaubt = $true; Prozent = 0; Grund = 'Liste ist leer.' }
    }
    $prozent = [math]::Round(100.0 * $AnzahlLoeschen / $AnzahlZeilen, 1)
    if ($prozent -gt $GrenzeProzent) {
        return [pscustomobject]@{ Erlaubt = $false; Prozent = $prozent; Grund = "Es würden $AnzahlLoeschen von $AnzahlZeilen Zeilen ($prozent %) gelöscht – mehr als die Grenze von $GrenzeProzent %." }
    }
    return [pscustomobject]@{ Erlaubt = $true; Prozent = $prozent; Grund = "Löschen erlaubt ($AnzahlLoeschen von $AnzahlZeilen Zeilen, $prozent %)." }
}

function Get-DomainDnAusOu {
    <# Domänen-DN aus einem OU-DN ableiten: alle DC=-Teile. #>
    param([string]$Dn)
    if (-not $Dn) { return '' }
    $teile = @()
    foreach ($t in ($Dn -split ',')) {
        $x = $t.Trim()
        if ($x -match '^(?i)DC=') { $teile += $x }
    }
    return ($teile -join ',')
}

function ConvertTo-BenutzerFelder {
    <#
      AD-Benutzerobjekt -> Felder der Benutzer-Liste (ohne Programme).
      $Primaergeraet ist optional und kommt aus SCCM.
    #>
    param($AdBenutzer, [string]$Primaergeraet, $Zeitpunkt)
    if (-not $Zeitpunkt) { $Zeitpunkt = Get-Date }
    $f = [ordered]@{
        Title             = [string]$AdBenutzer.Login
        Anzeigename       = [string]$AdBenutzer.Anzeigename
        EMail             = [string]$AdBenutzer.EMail
        Abteilung         = [string]$AdBenutzer.Abteilung
        Funktion          = [string]$AdBenutzer.Funktion
        Vorgesetzter      = [string]$AdBenutzer.Vorgesetzter
        Telefon           = [string]$AdBenutzer.Telefon
        Firma             = [string]$AdBenutzer.Firma
        ADAktiviert       = $(if ($AdBenutzer.Aktiviert) { 'Ja' } else { 'Nein' })
        ADLetzterSync     = (ToIso $Zeitpunkt)
        SCCMPrimaerGeraet = [string]$Primaergeraet
    }
    return $f
}

if ($InventarNurFunktionen) { return }

# ===========================================================================
# Hauptteil
# ===========================================================================
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'Sync-Inventar.config.json' }
$cfg = Read-JsonDatei $ConfigPath
$LogPath = $cfg.LogPath
if (-not $LogPath) { $LogPath = Join-Path $ScriptDir 'Sync-Inventar.log' }
Set-InventarLog $LogPath
Set-GraphTokenProvider { Get-GraphTokenZertifikat $cfg }

$fehler = 0
$now = Get-Date

$LoeschSchutzProzent = 50
if ($null -ne $cfg.LoeschSchutzProzent) { $LoeschSchutzProzent = [double]$cfg.LoeschSchutzProzent }
$ProgrammeDateiPfad = 'Inventar/programme.json'
if ($cfg.ProgrammeDateiPfad) { $ProgrammeDateiPfad = [string]$cfg.ProgrammeDateiPfad }

# ---------------------------------------------------------------------------
# SCCM auslesen
# ---------------------------------------------------------------------------
$ns = "root\SMS\site_$($cfg.SiteCode)"; $srv = $cfg.SmsProvider
function Q([string]$wql) { Get-WmiObject -ComputerName $srv -Namespace $ns -Query $wql }
function Group-ById($objs, $key = 'ResourceID') { $h = @{}; foreach ($o in $objs) { $k = [string]$o.$key; if (-not $h.ContainsKey($k)) { $h[$k] = New-Object System.Collections.ArrayList }; [void]$h[$k].Add($o) }; return $h }
function First($h, $id) { if ($h.ContainsKey([string]$id)) { return $h[[string]$id][0] } else { return $null } }
function All($h, $id) { if ($h.ContainsKey([string]$id)) { return $h[[string]$id] } else { return @() } }

function ConvertFrom-WmiDate($s) {
    # SMS Provider liefert "20260902060738.000000+***" (UTC, Offset unbekannt)
    if (-not $s -or $s.Length -lt 14) { return $null }
    try { return [DateTime]::SpecifyKind([DateTime]::ParseExact($s.Substring(0, 14), 'yyyyMMddHHmmss', $null), 'Utc') } catch { return $null }
}

$ChassisMap = @{ 1 = 'Andere'; 2 = 'Unbekannt'; 3 = 'Desktop'; 4 = 'Low Profile Desktop'; 5 = 'Pizza Box'; 6 = 'Mini Tower'; 7 = 'Tower'; 8 = 'Portable'; 9 = 'Laptop'; 10 = 'Notebook'; 11 = 'Hand Held'; 12 = 'Docking Station'; 13 = 'All in One'; 14 = 'Sub Notebook'; 15 = 'Space-Saving'; 16 = 'Lunch Box'; 17 = 'Main System Chassis'; 18 = 'Expansion Chassis'; 19 = 'SubChassis'; 20 = 'Bus Expansion'; 21 = 'Peripheral'; 22 = 'Storage'; 23 = 'Rack Mount'; 24 = 'Sealed-Case PC'; 30 = 'Tablet'; 31 = 'Convertible'; 32 = 'Detachable'; 35 = 'Mini PC'; 36 = 'Stick PC' }
$AppStatusMap = @{ 1 = 'Erfolgreich'; 2 = 'In Arbeit'; 3 = 'Anforderungen nicht erfüllt'; 4 = 'Unbekannt'; 5 = 'Fehler' }
$IntentMap = @{ 1 = 'Erforderlich'; 2 = 'Verfügbar'; 3 = 'Simulation' }
$EPInfectionMap = @{ 0 = 'Unbekannt'; 1 = 'Sauber'; 2 = 'Sauber (Bedrohung entfernt)'; 3 = 'Infiziert (Aktion ausstehend)'; 4 = 'Infiziert (Bereinigung fehlgeschlagen)' }
$EncryptMap = @{ 0 = 'Keine'; 1 = 'AES 128 + Diffuser'; 2 = 'AES 256 + Diffuser'; 3 = 'AES 128'; 4 = 'AES 256'; 5 = 'Hardware'; 6 = 'XTS-AES 128'; 7 = 'XTS-AES 256' }

Log "==== Sync-Start (Provider $srv, Site $($cfg.SiteCode)) ===="
$nurBenutzer = [bool]$OnlyBenutzer -and -not $OnlyComputers

$osFilter = ''
if (-not $IncludeServers) { $osFilter = " and OperatingSystemNameandVersion not like '%Server%'" }
$systems = @(Q "select ResourceId,Name,Client,Active,Obsolete,Decommissioned,ClientVersion,ResourceDomainORWorkgroup,DistinguishedName,CreationDate,LastLogonTimestamp,LastLogonUserName,LastLogonUserDomain,IPAddresses,MACAddresses,ADSiteName,IsVirtualMachine,SMBIOSGUID,BuildExt,OperatingSystemNameandVersion,SMSUniqueIdentifier,AADDeviceID from SMS_R_System where Obsolete=0$osFilter")
if ($OnlyDevices) { $systems = @($systems | Where-Object { $OnlyDevices -contains $_.Name }) }
Log "SCCM: $($systems.Count) Geräte"
$idList = ($systems | ForEach-Object { $_.ResourceId }) -join ','
if (-not $idList) { throw 'Keine Geräte gefunden' }

$primary = Group-ById (Q "select ResourceID,UniqueUserName,Types from SMS_UserMachineRelationship where IsActive=1")

if (-not $nurBenutzer) {
    $combined = Group-ById (Q "select * from SMS_CombinedDeviceResources where ResourceID in ($idList)")
    $compsys = Group-ById (Q 'select ResourceID,Manufacturer,Model,SystemType,Domain from SMS_G_System_COMPUTER_SYSTEM')
    $os = Group-ById (Q 'select ResourceID,Caption,Version,InstallDate,LastBootUpTime,OSLanguage,TotalVisibleMemorySize from SMS_G_System_OPERATING_SYSTEM')
    $bios = Group-ById (Q 'select ResourceID,SMBIOSBIOSVersion,ReleaseDate,SerialNumber from SMS_G_System_PC_BIOS')
    $cpu = Group-ById (Q 'select ResourceID,Name,NumberOfCores,NumberOfLogicalProcessors from SMS_G_System_PROCESSOR')
    $mem = Group-ById (Q 'select ResourceID,TotalPhysicalMemory from SMS_G_System_X86_PC_MEMORY')
    $diskC = Group-ById (Q "select ResourceID,Size,FreeSpace from SMS_G_System_LOGICAL_DISK where DeviceID='C:'")
    $pdisk = Group-ById (Q 'select ResourceID,Model,Size,MediaType from SMS_G_System_PHYSICAL_DISK')
    $encl = Group-ById (Q 'select ResourceID,ChassisTypes from SMS_G_System_SYSTEM_ENCLOSURE')
    $tpm = Group-ById (Q 'select ResourceID,SpecVersion,IsEnabled_InitialValue,IsActivated_InitialValue from SMS_G_System_TPM')
    $bitl = Group-ById (Q 'select ResourceID,DriveLetter,ProtectionStatus,EncryptionMethod,ConversionStatus from SMS_G_System_BITLOCKER_DETAILS')
    $encv = Group-ById (Q 'select ResourceID,DriveLetter,ProtectionStatus from SMS_G_System_ENCRYPTABLE_VOLUME')
    $conUsage = Group-ById (Q 'select ResourceID,TopConsoleUser,TotalConsoleUsers from SMS_G_System_SYSTEM_CONSOLE_USAGE')
    $conUsers = Group-ById (Q 'select ResourceID,SystemConsoleUser,NumberOfConsoleLogons,TotalUserConsoleMinutes,LastConsoleUse from SMS_G_System_SYSTEM_CONSOLE_USER')
    $nic = Group-ById (Q 'select ResourceID,IPAddress,MACAddress,DHCPEnabled from SMS_G_System_NETWORK_ADAPTER_CONFIGURATION where IPEnabled=1')
    $mon = Group-ById (Q 'select ResourceID,Name,MonitorManufacturer,ScreenWidth,ScreenHeight from SMS_G_System_DESKTOP_MONITOR')
    $batt = Group-ById (Q 'select ResourceID,Name,DesignCapacity,FullChargeCapacity,EstimatedChargeRemaining from SMS_G_System_BATTERY')
    $office = Group-ById (Q 'select ResourceID,ProductName,ProductVersion,Channel,LicenseState from SMS_G_System_OFFICE_PRODUCTINFO')
    $arp = Group-ById (@(Q 'select ResourceID,DisplayName,Version,Publisher from SMS_G_System_ADD_REMOVE_PROGRAMS') + @(Q 'select ResourceID,DisplayName,Version,Publisher from SMS_G_System_ADD_REMOVE_PROGRAMS_64'))
    $deploy = Group-ById (Q 'select MachineID,AppName,CollectionName,DeploymentIntent,AppStatusType,InstalledState,UserName from SMS_AppDeploymentAssetDetails') 'MachineID'
    $collNames = @{}; foreach ($c in (Q 'select CollectionID,Name from SMS_Collection')) { $collNames[$c.CollectionID] = $c.Name }
    $members = Group-ById (Q 'select ResourceID,CollectionID from SMS_FullCollectionMembership')
    Log 'SCCM-Inventar geladen'
}

function Build-SccmFields($sys) {
    $id = [string]$sys.ResourceId
    $c = First $combined $id; $cs = First $compsys $id; $o = First $os $id; $b = First $bios $id; $p = First $cpu $id
    $m = First $mem $id; $d = First $diskC $id; $e = First $encl $id; $t = First $tpm $id; $cu = First $conUsage $id

    # Konsolenbenutzer
    $users = @(All $conUsers $id | Sort-Object { ConvertFrom-WmiDate $_.LastConsoleUse } -Descending)
    $lastConsole = $null; if ($users.Count) { $lastConsole = ConvertFrom-WmiDate $users[0].LastConsoleUse }
    $consoleText = ($users | ForEach-Object { '{0} | {1} Anmeldungen | {2} Min | zuletzt {3:dd.MM.yyyy HH:mm}' -f $_.SystemConsoleUser, $_.NumberOfConsoleLogons, $_.TotalUserConsoleMinutes, (ConvertFrom-WmiDate $_.LastConsoleUse).ToLocalTime() }) -join "`n"

    # Deployments
    $deps = @(All $deploy $id | Sort-Object DeploymentIntent, AppName)
    $depText = ($deps | ForEach-Object { '{0} | {1} | {2} | {3}' -f $_.AppName, $_.CollectionName, $IntentMap[[int]$_.DeploymentIntent], $AppStatusMap[[int]$_.AppStatusType] }) -join "`n"
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
    $blText = (All $bitl $id | ForEach-Object { '{0} {1} ({2})' -f $_.DriveLetter, $(if ($_.ProtectionStatus -eq 1) { 'geschützt' } else { 'NICHT geschützt' }), $EncryptMap[[int]$_.EncryptionMethod] }) -join '; '
    if (-not $blText) { $blText = (All $encv $id | ForEach-Object { '{0} {1}' -f $_.DriveLetter, $(if ($_.ProtectionStatus -eq 1) { 'geschützt' } else { 'NICHT geschützt' }) }) -join '; ' }

    $monText = (All $mon $id | ForEach-Object { '{0} {1} {2}x{3}' -f $_.MonitorManufacturer, $_.Name, $_.ScreenWidth, $_.ScreenHeight }) -join "`n"
    $battText = (All $batt $id | ForEach-Object { '{0} (Design {1} mWh, voll {2} mWh)' -f $_.Name, $_.DesignCapacity, $_.FullChargeCapacity }) -join '; '
    $pdText = (All $pdisk $id | ForEach-Object { '{0} | {1} GB | {2}' -f $_.Model, [math]::Round($_.Size / 1GB, 0), $(switch ([int]$_.MediaType) { 3 { 'HDD' } 4 { 'SSD' } 5 { 'SCM' } default { 'Typ unbekannt' } }) }) -join "`n"
    $offText = (All $office $id | ForEach-Object { '{0} {1} [{2}] {3}' -f $_.ProductName, $_.ProductVersion, $_.Channel, $_.LicenseState }) -join "`n"

    $chassis = $null; if ($e -and $e.ChassisTypes) { $ct = [int]([string]$e.ChassisTypes -split ',')[0]; $chassis = $ChassisMap[$ct]; if (-not $chassis) { $chassis = "Typ $ct" } }
    $ramGB = $null; if ($m -and $m.TotalPhysicalMemory) { $ramGB = [math]::Round($m.TotalPhysicalMemory / 1MB, 0) } elseif ($o -and $o.TotalVisibleMemorySize) { $ramGB = [math]::Round($o.TotalVisibleMemorySize / 1024, 0) }
    $serial = if ($c -and $c.SerialNumber) { $c.SerialNumber } elseif ($b) { $b.SerialNumber } else { $null }
    $osLang = $null; if ($o -and $o.OSLanguage) { try { $osLang = [Globalization.CultureInfo]::GetCultureInfo([int]$o.OSLanguage).DisplayName } catch { $osLang = [string]$o.OSLanguage } }

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
        SCCM_ClientCheckPass   = $(if ($c -and $null -ne $c.ClientCheckPass) { @{1 = 'Bestanden'; 2 = 'Fehlgeschlagen'; 3 = 'Nicht ausgewertet' }[[int]$c.ClientCheckPass] } else { $null })
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
        SCCM_DiskCGB           = $(if ($d -and $d.Size) { [math]::Round($d.Size / 1024, 0) } else { $null })
        SCCM_DiskCFreeGB       = $(if ($d -and $null -ne $d.FreeSpace) { [math]::Round($d.FreeSpace / 1024, 0) } else { $null })
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
        SCCM_EPSignatureVersion = $(if ($c) { $c.EPAntivirusSignatureLastVersion } else { $null })
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
    # leere Strings -> null (Graph löscht das Feld mit null)
    foreach ($k in @($f.Keys)) { if ($f[$k] -is [string] -and $f[$k].Trim() -eq '') { $f[$k] = $null } }
    return $f
}

if ($DumpOnly) {
    foreach ($sys in $systems) { [pscustomobject](Build-SccmFields $sys) }
    return
}

# ---------------------------------------------------------------------------
# Graph: Site und Listen
# ---------------------------------------------------------------------------
$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}
$ComputerListId = $cfg.ComputerListId
$BenutzerListId = $cfg.BenutzerListId

# ===========================================================================
# Phase 1: Computer
# ===========================================================================
if (-not $OnlyBenutzer) {
    if (-not $ComputerListId) { throw 'ComputerListId fehlt in der Konfiguration.' }
    $itemsBase = "/sites/$SiteId/lists/$ComputerListId/items"
    $sccmFieldNames = (Build-SccmFields $systems[0]).Keys
    $select = 'Title,' + ($sccmFieldNames -join ',')
    $items = Get-GraphAlle "$itemsBase`?`$expand=fields(`$select=$select)&`$top=500"
    Log "Computer-Liste: $($items.Count) Zeilen"

    $byName = @{}
    foreach ($it in $items) { $k = NormName $it.fields.Title; if (-not $byName.ContainsKey($k)) { $byName[$k] = New-Object System.Collections.ArrayList }; [void]$byName[$k].Add($it) }

    $stats = @{ updated = 0; created = 0; unchanged = 0; missing = 0 }
    $matched = New-Object System.Collections.Generic.HashSet[string]

    foreach ($sys in $systems) {
        $key = NormName $sys.Name
        try { $fields = Build-SccmFields $sys } catch { Log "Fehler beim Aufbereiten von $($sys.Name): $_" 'ERROR'; $fehler++; continue }

        if ($byName.ContainsKey($key)) {
            foreach ($it in $byName[$key]) {
                [void]$matched.Add([string]$it.id)
                $delta = [ordered]@{}
                foreach ($k in $fields.Keys) {
                    if ($k -eq 'SCCM_LastSync') { continue }
                    if ((Norm $fields[$k]) -ne (Norm $it.fields.$k)) { $delta[$k] = $fields[$k] }
                }
                if ($delta.Count -eq 0) { $stats.unchanged++; continue }
                $delta['SCCM_LastSync'] = $fields['SCCM_LastSync']
                if ($WhatIf) { Log "WHATIF Update $($it.fields.Title) (ID $($it.id)): $($delta.Keys -join ', ')"; $stats.updated++; continue }
                try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($it.id)/fields" -Body $delta | Out-Null; $stats.updated++; Log "Update $($it.fields.Title) (ID $($it.id)): $($delta.Count) Felder" }
                catch { Log "Update-Fehler $($it.fields.Title): $_" 'ERROR'; $fehler++ }
            }
        } else {
            $new = [ordered]@{ Title = ([string]$sys.Name).ToUpperInvariant() }
            foreach ($k in $fields.Keys) { if ($null -ne $fields[$k]) { $new[$k] = $fields[$k] } }
            if ($WhatIf) { Log "WHATIF Neu: $($sys.Name)"; $stats.created++; continue }
            try { $r = Invoke-Graph -Method POST -Uri $itemsBase -Body @{ fields = $new }; $stats.created++; Log "Neu angelegt: $($sys.Name) (ID $($r.id))" }
            catch { Log "Anlage-Fehler $($sys.Name): $_" 'ERROR'; $fehler++ }
        }
    }

    # Zeilen ohne SCCM-Gerät
    if (-not $OnlyDevices) {
        foreach ($it in $items) {
            if ($matched.Contains([string]$it.id)) { continue }
            $title = [string]$it.fields.Title
            if ((NormName $title) -eq '') { continue }
            $stats.missing++
            if ($it.fields.SCCM_Found -eq 'Nein') { continue }
            if ($WhatIf) { Log "WHATIF Nicht in SCCM: $title"; continue }
            try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($it.id)/fields" -Body @{ SCCM_Found = 'Nein'; SCCM_SyncStatus = "Kein SCCM-Gerät zu '$title'"; SCCM_LastSync = (ToIso $now) } | Out-Null; Log "Nicht in SCCM: $title" }
            catch { Log "Fehler (nicht in SCCM) $title : $_" 'ERROR'; $fehler++ }
        }
    }
    Log ('Computer fertig: {0} aktualisiert, {1} neu, {2} unverändert, {3} ohne SCCM-Gerät' -f $stats.updated, $stats.created, $stats.unchanged, $stats.missing)
}

# ===========================================================================
# Phase 2: Benutzer (Active Directory)
# ===========================================================================
function Test-AdModul {
    return [bool](Get-Module -ListAvailable -Name ActiveDirectory -ErrorAction SilentlyContinue)
}

function New-AdSucher {
    <# DirectorySearcher auf einen LDAP-Pfad (ADSI-Fallback und Gruppensuche). #>
    param([string]$Basis, [string]$Filter, [string[]]$Eigenschaften, [string]$Server)
    $pfad = "LDAP://$Basis"
    if ($Server) { $pfad = "LDAP://$Server/$Basis" }
    $wurzel = New-Object DirectoryServices.DirectoryEntry($pfad)
    $s = New-Object DirectoryServices.DirectorySearcher($wurzel)
    $s.Filter = $Filter
    $s.PageSize = 1000
    $s.SearchScope = 'Subtree'
    foreach ($e in $Eigenschaften) { [void]$s.PropertiesToLoad.Add($e) }
    return $s
}

function Get-AdWert {
    param($Ergebnis, [string]$Name)
    if ($Ergebnis.Properties.Contains($Name) -and $Ergebnis.Properties[$Name].Count -gt 0) { return [string]$Ergebnis.Properties[$Name][0] }
    return ''
}

function Get-AdBenutzerAusOu {
    <#
      Benutzer einer OU lesen. Bevorzugt das Modul ActiveDirectory, sonst DirectorySearcher (ADSI).
      Rückgabe: Objekte mit Login, Anzeigename, EMail, Abteilung, Funktion, ManagerDn, Telefon, Firma, Aktiviert.
    #>
    param([string]$Ou, [string]$Server, [bool]$MitModul)
    $liste = New-Object System.Collections.ArrayList
    if ($MitModul) {
        $p = @{ SearchBase = $Ou; SearchScope = 'Subtree'; Filter = '*'; Properties = @('DisplayName', 'mail', 'department', 'title', 'manager', 'telephoneNumber', 'company', 'Enabled') }
        if ($Server) { $p['Server'] = $Server }
        foreach ($u in (Get-ADUser @p)) {
            [void]$liste.Add([pscustomobject]@{
                    Login       = [string]$u.SamAccountName
                    Anzeigename = [string]$u.DisplayName
                    EMail       = [string]$u.mail
                    Abteilung   = [string]$u.department
                    Funktion    = [string]$u.title
                    ManagerDn   = [string]$u.manager
                    Telefon     = [string]$u.telephoneNumber
                    Firma       = [string]$u.company
                    Aktiviert   = [bool]$u.Enabled
                })
        }
    } else {
        $eig = @('samaccountname', 'displayname', 'mail', 'department', 'title', 'manager', 'telephonenumber', 'company', 'useraccountcontrol')
        $s = New-AdSucher $Ou '(&(objectCategory=person)(objectClass=user))' $eig $Server
        foreach ($r in $s.FindAll()) {
            $uac = 0; $v = Get-AdWert $r 'useraccountcontrol'; if ($v) { $uac = [int]$v }
            [void]$liste.Add([pscustomobject]@{
                    Login       = Get-AdWert $r 'samaccountname'
                    Anzeigename = Get-AdWert $r 'displayname'
                    EMail       = Get-AdWert $r 'mail'
                    Abteilung   = Get-AdWert $r 'department'
                    Funktion    = Get-AdWert $r 'title'
                    ManagerDn   = Get-AdWert $r 'manager'
                    Telefon     = Get-AdWert $r 'telephonenumber'
                    Firma       = Get-AdWert $r 'company'
                    Aktiviert   = (($uac -band 2) -eq 0)
                })
        }
        $s.Dispose()
    }
    return $liste
}

$script:ManagerCache = @{}
function Resolve-ManagerName {
    <# Manager-DN in den Anzeigenamen auflösen (mit Cache). #>
    param([string]$Dn, [string]$Server, [bool]$MitModul)
    if (-not $Dn) { return '' }
    if ($script:ManagerCache.ContainsKey($Dn)) { return $script:ManagerCache[$Dn] }
    $name = ''
    try {
        if ($MitModul) {
            $p = @{ Identity = $Dn; Properties = 'DisplayName' }
            if ($Server) { $p['Server'] = $Server }
            $name = [string](Get-ADUser @p).DisplayName
        } else {
            $pfad = "LDAP://$Dn"
            if ($Server) { $pfad = "LDAP://$Server/$Dn" }
            $e = New-Object DirectoryServices.DirectoryEntry($pfad)
            if ($e.Properties['displayName'].Count -gt 0) { $name = [string]$e.Properties['displayName'][0] }
        }
    } catch { $name = '' }
    $script:ManagerCache[$Dn] = $name
    return $name
}

function Get-GruppenMitgliederRekursiv {
    <#
      Rekursive Mitglieder einer AD-Gruppe (sAMAccountName der Gruppe) als Logins.
      Bevorzugt eine einzige LDAP-Abfrage mit memberOf:1.2.840.113556.1.4.1941 (schnell),
      Fallback auf Get-ADGroupMember -Recursive.
    #>
    param([string]$Gruppe, [string]$DomainDn, [string]$Server, [bool]$MitModul)
    $logins = New-Object System.Collections.ArrayList
    try {
        $gs = New-AdSucher $DomainDn ("(&(objectCategory=group)(sAMAccountName=$Gruppe))") @('distinguishedname') $Server
        $g = $gs.FindOne()
        $gs.Dispose()
        if (-not $g) { throw "Gruppe '$Gruppe' nicht gefunden" }
        $gdn = Get-AdWert $g 'distinguishedname'
        $ms = New-AdSucher $DomainDn ("(&(objectCategory=person)(objectClass=user)(memberOf:1.2.840.113556.1.4.1941:=$gdn))") @('samaccountname') $Server
        foreach ($r in $ms.FindAll()) {
            $l = Get-AdWert $r 'samaccountname'
            if ($l) { [void]$logins.Add($l) }
        }
        $ms.Dispose()
        return $logins
    } catch {
        Log "LDAP-Abfrage für Gruppe '$Gruppe' fehlgeschlagen: $_" 'WARN'
    }
    if ($MitModul) {
        try {
            $p = @{ Identity = $Gruppe; Recursive = $true }
            if ($Server) { $p['Server'] = $Server }
            foreach ($m in (Get-ADGroupMember @p)) {
                if ($m.objectClass -eq 'user' -and $m.SamAccountName) { [void]$logins.Add([string]$m.SamAccountName) }
            }
            return $logins
        } catch {
            Log "Get-ADGroupMember für Gruppe '$Gruppe' fehlgeschlagen: $_" 'ERROR'
        }
    }
    return $logins
}

if (-not $OnlyComputers) {
    if (-not $BenutzerListId) { throw 'BenutzerListId fehlt in der Konfiguration.' }
    $benutzerBase = "/sites/$SiteId/lists/$BenutzerListId/items"

    # 1) programme.json laden
    $programme = $null
    try {
        $programme = Invoke-Graph -Uri "/sites/$SiteId/drive/root:/${ProgrammeDateiPfad}:/content"
    } catch {
        Log "programme.json konnte nicht aus SharePoint geladen werden ($ProgrammeDateiPfad): $_" 'WARN'
    }
    if (-not $programme) {
        Log 'Verwende lokale Kopie code\programme.json' 'WARN'
        $programme = Read-JsonDatei (Join-Path $ScriptDir 'programme.json')
    }
    $programmIds = @($programme.programme | ForEach-Object { $_.id })
    Log "Programme: $($programmIds.Count)"

    # 2) fehlende Programmspalten anlegen
    $spalten = @{}
    foreach ($c in (Invoke-Graph -Uri "/sites/$SiteId/lists/$BenutzerListId/columns?`$select=id,name,displayName").value) { $spalten[$c.name] = $c }
    foreach ($p in $programme.programme) {
        if ($spalten.ContainsKey($p.id)) { continue }
        if ($WhatIf) { Log "WHATIF: Programmspalte '$($p.id)' würde angelegt."; continue }
        try {
            Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$BenutzerListId/columns" -Body (New-ProgrammSpalte $p) | Out-Null
            Log "Programmspalte angelegt: $($p.id) ($($p.name))"
        } catch { Log "Fehler beim Anlegen der Programmspalte '$($p.id)': $_" 'ERROR'; $fehler++ }
    }

    # 3) AD-Benutzer lesen
    $mitModul = Test-AdModul
    if ($mitModul) { Import-Module ActiveDirectory -ErrorAction SilentlyContinue; Log 'AD: Modul ActiveDirectory wird verwendet' }
    else { Log 'AD: Modul ActiveDirectory fehlt – Fallback auf ADSI/DirectorySearcher' 'WARN' }
    $adServer = [string]$cfg.AdServer
    $ous = @($cfg.AdUserOUs)
    if (-not $ous -or $ous.Count -eq 0) { throw 'AdUserOUs fehlt in der Konfiguration (Array von OU-DNs).' }

    $adBenutzer = @{}
    foreach ($ou in $ous) {
        if (-not $ou -or [string]$ou -match '^<') { Log "OU-Eintrag '$ou' sieht nach Platzhalter aus – bitte den echten DN eintragen." 'ERROR'; $fehler++; continue }
        try {
            $gefunden = Get-AdBenutzerAusOu $ou $adServer $mitModul
            Log "AD: $($gefunden.Count) Benutzer in $ou"
            foreach ($u in $gefunden) {
                $k = NormLogin $u.Login
                if ($k -eq '') { continue }
                if (-not $adBenutzer.ContainsKey($k)) { $adBenutzer[$k] = $u }
            }
        } catch { Log "AD-Fehler in OU '$ou': $_" 'ERROR'; $fehler++ }
    }
    Log "AD: $($adBenutzer.Count) Benutzer insgesamt"

    $domainDn = ''
    foreach ($ou in $ous) { $domainDn = Get-DomainDnAusOu ([string]$ou); if ($domainDn) { break } }

    # Vorgesetzte auflösen
    foreach ($k in @($adBenutzer.Keys)) {
        $u = $adBenutzer[$k]
        $u | Add-Member -NotePropertyName Vorgesetzter -NotePropertyValue (Resolve-ManagerName $u.ManagerDn $adServer $mitModul) -Force
    }

    # 4) Gruppenmitgliedschaften je Programm
    $mitgliedschaft = @{}   # Login -> Liste Programm-Ids
    foreach ($p in $programme.programme) {
        $gruppen = @($p.adGruppen)
        if ($gruppen.Count -eq 0) { continue }
        foreach ($g in $gruppen) {
            if (-not $g) { continue }
            $mitglieder = Get-GruppenMitgliederRekursiv ([string]$g) $domainDn $adServer $mitModul
            Log "AD-Gruppe '$g' ($($p.id)): $($mitglieder.Count) Mitglieder"
            foreach ($m in $mitglieder) {
                $k = NormLogin $m
                if (-not $mitgliedschaft.ContainsKey($k)) { $mitgliedschaft[$k] = New-Object System.Collections.ArrayList }
                if (-not $mitgliedschaft[$k].Contains($p.id)) { [void]$mitgliedschaft[$k].Add($p.id) }
            }
        }
    }

    # 5) Primärgeräte aus SCCM (Login -> Gerätename)
    $primaerGeraet = @{}
    $nameVonId = @{}
    foreach ($sys in $systems) { $nameVonId[[string]$sys.ResourceId] = [string]$sys.Name }
    foreach ($rid in $primary.Keys) {
        $geraet = $nameVonId[[string]$rid]
        if (-not $geraet) { continue }
        foreach ($rel in $primary[$rid]) {
            $k = NormLogin ([string]$rel.UniqueUserName)
            if ($k -eq '') { continue }
            if (-not $primaerGeraet.ContainsKey($k)) { $primaerGeraet[$k] = New-Object System.Collections.ArrayList }
            if (-not $primaerGeraet[$k].Contains($geraet)) { [void]$primaerGeraet[$k].Add($geraet) }
        }
    }

    # 6) Benutzer-Liste lesen und abgleichen
    $bItems = Get-GraphAlle "$benutzerBase`?`$expand=fields&`$top=200"
    Log "Benutzer-Liste: $($bItems.Count) Zeilen"
    $bByLogin = @{}
    foreach ($it in $bItems) {
        $k = NormLogin ([string]$it.fields.Title)
        if ($k -eq '') { continue }
        if (-not $bByLogin.ContainsKey($k)) { $bByLogin[$k] = $it }
    }

    $bstats = @{ updated = 0; created = 0; unchanged = 0; deleted = 0 }
    foreach ($k in ($adBenutzer.Keys | Sort-Object)) {
        $u = $adBenutzer[$k]
        $geraet = ''
        if ($primaerGeraet.ContainsKey($k)) { $geraet = (@($primaerGeraet[$k]) | Sort-Object)[0] }
        $felder = ConvertTo-BenutzerFelder $u $geraet $now
        $mitgliedIds = @()
        if ($mitgliedschaft.ContainsKey($k)) { $mitgliedIds = @($mitgliedschaft[$k]) }

        if ($bByLogin.ContainsKey($k)) {
            $it = $bByLogin[$k]
            $delta = [ordered]@{}
            foreach ($f in $felder.Keys) {
                if ($f -eq 'ADLetzterSync') { continue }
                if ((Norm $felder[$f]) -ne (Norm $it.fields.$f)) { $delta[$f] = $felder[$f] }
            }
            foreach ($pd in (Get-ProgrammDelta $it.fields $mitgliedIds $programmIds).GetEnumerator()) { $delta[$pd.Key] = $pd.Value }
            if ($delta.Count -eq 0) { $bstats.unchanged++; continue }
            $delta['ADLetzterSync'] = $felder['ADLetzterSync']
            if ($WhatIf) { Log "WHATIF Benutzer-Update $($u.Login): $($delta.Keys -join ', ')"; $bstats.updated++; continue }
            try { Invoke-Graph -Method PATCH -Uri "$benutzerBase/$($it.id)/fields" -Body $delta | Out-Null; $bstats.updated++; Log "Benutzer-Update $($u.Login): $($delta.Count) Felder" }
            catch { Log "Benutzer-Update-Fehler $($u.Login): $_" 'ERROR'; $fehler++ }
        } else {
            $neu = [ordered]@{}
            foreach ($f in $felder.Keys) { if ($null -ne $felder[$f] -and [string]$felder[$f] -ne '') { $neu[$f] = $felder[$f] } }
            foreach ($id in $mitgliedIds) { $neu[$id] = '2' }
            if ($WhatIf) { Log "WHATIF Benutzer neu: $($u.Login)"; $bstats.created++; continue }
            try { Invoke-Graph -Method POST -Uri $benutzerBase -Body @{ fields = $neu } | Out-Null; $bstats.created++; Log "Benutzer neu: $($u.Login)" }
            catch { Log "Benutzer-Anlage-Fehler $($u.Login): $_" 'ERROR'; $fehler++ }
        }
    }

    # 7) Löschen mit Schutz
    $zuLoeschen = @()
    foreach ($it in $bItems) {
        $k = NormLogin ([string]$it.fields.Title)
        if ($k -eq '') { continue }
        if (-not $adBenutzer.ContainsKey($k)) { $zuLoeschen += $it }
    }
    $schutz = Test-Loeschschutz $adBenutzer.Count $bItems.Count $zuLoeschen.Count $LoeschSchutzProzent
    if (-not $schutz.Erlaubt) {
        Log "Löschschutz greift: $($schutz.Grund)" 'ERROR'
        $fehler++
    } else {
        foreach ($it in $zuLoeschen) {
            if ($WhatIf) { Log "WHATIF Benutzer löschen: $($it.fields.Title)"; $bstats.deleted++; continue }
            try { Invoke-Graph -Method DELETE -Uri "$benutzerBase/$($it.id)" | Out-Null; $bstats.deleted++; Log "Benutzer gelöscht (nicht mehr im AD): $($it.fields.Title)" }
            catch { Log "Lösch-Fehler $($it.fields.Title): $_" 'ERROR'; $fehler++ }
        }
    }
    Log ('Benutzer fertig: {0} aktualisiert, {1} neu, {2} unverändert, {3} gelöscht' -f $bstats.updated, $bstats.created, $bstats.unchanged, $bstats.deleted)
}

Log ("==== Fertig: {0} Fehler ====" -f $fehler)
if ($fehler) { exit 1 }
