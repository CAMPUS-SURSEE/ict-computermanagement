# Erzeugt schema.json: alle Spalten der SharePoint-Liste "Computer Inventar"
# Excel-Spalten aus ComputerInventar_header.json + SCCM-Spalten (fest definiert)
$hdr = Get-Content (Join-Path $PSScriptRoot 'ComputerInventar_header.json') -Encoding UTF8 | ConvertFrom-Json

function ToInternal([string]$s) {
    $s = $s.Trim()
    $s = $s -replace 'ä','ae' -replace 'ö','oe' -replace 'ü','ue' -replace 'Ä','Ae' -replace 'Ö','Oe' -replace 'Ü','Ue' -replace 'ß','ss'
    $s = $s -replace '\+\+','PP' -replace '&','And'
    $s = ($s -split '[^A-Za-z0-9]+' | Where-Object { $_ } | ForEach-Object { $_.Substring(0,1).ToUpper() + $_.Substring(1) }) -join ''
    if ($s -match '^\d') { $s = 'J' + $s }
    if ($s.Length -gt 30) { $s = $s.Substring(0,30) }
    return $s
}

$groups = @{}
foreach ($i in 1..16)   { $groups[$i] = 'Stammdaten' }
$groups[17] = 'Budget'
foreach ($i in 18..65)  { $groups[$i] = 'Standard-Software und Rechte' }
foreach ($i in 66..73)  { $groups[$i] = 'ABACUS' }
foreach ($i in 74..88)  { $groups[$i] = 'Zusatz-Software' }
foreach ($i in 89..100) { $groups[$i] = 'Spezial-Software (AD-Gruppe)' }
foreach ($i in 101..109){ $groups[$i] = 'Technik-Software' }
foreach ($i in 110..112){ $groups[$i] = 'Bpanda' }

# Spalten, die mehr als nur "x" enthalten -> Text statt Ja/Nein
$textCols = @(89,90,91,92,93,94,95,96,97,98,99,100)

$cols = @()
$seen = @{}
foreach ($h in $hdr) {
    $i = [int]$h.idx
    $disp = $h.name.Trim()
    $int  = ToInternal $disp
    # Duplikate eindeutig machen
    if ($i -eq 71) { $disp = 'Human Resources (ABACUS)'; $int = 'AbacusHumanResources' }
    if ($i -eq 98) { $disp = 'Supermailer (AD-Gruppe)';  $int = 'SupermailerADGruppe' }
    if ($seen[$int]) { throw "Doppelter interner Name: $int" }
    $seen[$int] = $true

    if ($i -eq 5) { $cols += [pscustomobject]@{ excelIdx=$i; internal='Title'; display='PC-Name'; type='Title'; group='Stammdaten'; inDefaultView=$true; source='excel' }; continue }

    $type = 'Boolean'
    if ($i -le 9 -or $textCols -contains $i) { $type = 'Text' }
    if ($i -eq 4) { $type = 'Note' }
    $cols += [pscustomobject]@{ excelIdx=$i; internal=$int; display=$disp; type=$type; group=$groups[$i]; inDefaultView=(-not [bool]$h.hidden); source='excel' }
}

# ---- SCCM-Spalten ----
function S($int,$disp,$type='Text',$view=$false,$desc='') { [pscustomobject]@{ excelIdx=$null; internal=$int; display=$disp; type=$type; group='SCCM'; inDefaultView=$view; source='sccm'; description=$desc } }
$cols += @(
  S 'SCCM_Name'            'SCCM Gerätename' 'Text' $true 'Name des zugeordneten SCCM-Geräts (Abgleich über PC-Name)'
  S 'SCCM_Found'           'In SCCM vorhanden' 'Text' $true
  S 'SCCM_ResourceID'      'SCCM ResourceID' 'Number'
  S 'SCCM_SMSID'           'SCCM SMSID'
  S 'SCCM_Domain'          'Domäne'
  S 'SCCM_OU'              'AD Distinguished Name'
  S 'SCCM_ADSite'          'AD Standort'
  S 'SCCM_ADCreated'       'AD Computerkonto erstellt' 'DateTime'
  S 'SCCM_ADLastLogon'     'AD letzte Anmeldung (Computerkonto)' 'DateTime'
  S 'SCCM_LastLogonUser'   'Letzter angemeldeter Benutzer' 'Text' $true 'SMS_CombinedDeviceResources.LastLogonUser'
  S 'SCCM_CurrentLogonUser' 'Aktuell angemeldeter Benutzer' 'Text' $true
  S 'SCCM_PrimaryUser'     'Primärer Benutzer (SCCM)' 'Text' $true
  S 'SCCM_TopConsoleUser'  'Hauptbenutzer (Konsolennutzung)' 'Text' $true
  S 'SCCM_LastConsoleUse'  'Letzte Benutzeranmeldung' 'DateTime' $true 'Neueste LastConsoleUse aus SYSTEM_CONSOLE_USER'
  S 'SCCM_ConsoleUsers'    'Konsolenbenutzer (Anmeldungen / Minuten / zuletzt)' 'Note'
  S 'SCCM_ClientVersion'   'SCCM Client-Version'
  S 'SCCM_ClientActive'    'SCCM Client aktiv' 'Text' $true
  S 'SCCM_Online'          'Online (SCCM)' 'Text' $true
  S 'SCCM_LastOnline'      'Zuletzt online' 'DateTime' $true
  S 'SCCM_LastOffline'     'Zuletzt offline' 'DateTime'
  S 'SCCM_LastActive'      'Zuletzt aktiv (SCCM)' 'DateTime' $true
  S 'SCCM_LastHardwareScan' 'Letzter Hardware-Inventar' 'DateTime' $true
  S 'SCCM_LastSoftwareScan' 'Letzter Software-Inventar' 'DateTime'
  S 'SCCM_LastDDR'         'Letzter Heartbeat (DDR)' 'DateTime'
  S 'SCCM_LastPolicyRequest' 'Letzte Richtlinienanfrage' 'DateTime'
  S 'SCCM_LastClientCheck' 'Letzte Client-Prüfung' 'DateTime'
  S 'SCCM_ClientCheckPass' 'Client-Prüfung bestanden'
  S 'SCCM_ManagementPoint' 'Management Point'
  S 'SCCM_BoundaryGroups'  'Boundary Groups'
  S 'SCCM_CoManaged'       'Co-Managed (Intune)'
  S 'SCCM_AADDeviceID'     'Entra Device ID'
  S 'SCCM_Manufacturer'    'Hersteller' 'Text' $true
  S 'SCCM_Model'           'Modell' 'Text' $true
  S 'SCCM_SerialNumber'    'Seriennummer (SCCM)' 'Text' $true
  S 'SCCM_SMBIOSGUID'      'SMBIOS GUID'
  S 'SCCM_ChassisType'     'Gehäusetyp'
  S 'SCCM_IsVirtual'       'Virtuelle Maschine'
  S 'SCCM_CPU'             'Prozessor'
  S 'SCCM_CPUCores'        'CPU Kerne' 'Number'
  S 'SCCM_CPULogical'      'CPU logische Prozessoren' 'Number'
  S 'SCCM_RAMGB'           'RAM (GB)' 'Number' $true
  S 'SCCM_DiskCGB'         'Laufwerk C: Grösse (GB)' 'Number'
  S 'SCCM_DiskCFreeGB'     'Laufwerk C: frei (GB)' 'Number' $true
  S 'SCCM_PhysicalDisks'   'Physische Datenträger' 'Note'
  S 'SCCM_BIOSVersion'     'BIOS-Version'
  S 'SCCM_BIOSDate'        'BIOS-Datum' 'DateTime'
  S 'SCCM_TPMVersion'      'TPM-Version'
  S 'SCCM_TPMEnabled'      'TPM aktiviert'
  S 'SCCM_BitLocker'       'BitLocker'
  S 'SCCM_Monitors'        'Monitore' 'Note'
  S 'SCCM_Battery'         'Akku'
  S 'SCCM_OS'              'Betriebssystem' 'Text' $true
  S 'SCCM_OSVersion'       'OS-Version (Build)' 'Text' $true
  S 'SCCM_OSInstallDate'   'OS installiert am' 'DateTime'
  S 'SCCM_LastBoot'        'Letzter Neustart' 'DateTime' $true
  S 'SCCM_OSLanguage'      'OS-Sprache'
  S 'SCCM_SystemType'      'Systemtyp'
  S 'SCCM_IPv4'            'IPv4-Adresse' 'Text' $true
  S 'SCCM_IPAddresses'     'IP-Adressen (alle)'
  S 'SCCM_MACAddresses'    'MAC-Adressen'
  S 'SCCM_DHCP'            'DHCP'
  S 'SCCM_EPEnabled'       'Defender aktiv'
  S 'SCCM_EPClientVersion' 'Defender Client-Version'
  S 'SCCM_EPSignatureVersion' 'Defender Signaturversion'
  S 'SCCM_EPSignatureDate' 'Defender Signaturdatum' 'DateTime'
  S 'SCCM_EPLastQuickScan' 'Defender letzter Schnellscan' 'DateTime'
  S 'SCCM_EPLastFullScan'  'Defender letzter Vollscan' 'DateTime'
  S 'SCCM_EPInfectionStatus' 'Defender Infektionsstatus'
  S 'SCCM_EPLastThreat'    'Defender letzte Bedrohung'
  S 'SCCM_EPPendingReboot' 'Defender Neustart ausstehend'
  S 'SCCM_Office'          'Office-Produkte' 'Note'
  S 'SCCM_DeployedApps'    'Zugewiesene Applikationen (Deployments)' 'Note' $true 'AppName | Sammlung | Erforderlich/Verfügbar | Status'
  S 'SCCM_AppsRequired'    'Anzahl erforderliche Apps' 'Number'
  S 'SCCM_AppsInstalled'   'Anzahl installierte Apps (Deployments)' 'Number'
  S 'SCCM_InstalledSoftware' 'Installierte Software (Add/Remove)' 'Note'
  S 'SCCM_InstalledSoftwareCount' 'Anzahl installierte Software' 'Number'
  S 'SCCM_Collections'     'Sammlungen (Collections)' 'Note'
  S 'SCCM_LastSync'        'Letzte Synchronisation mit SCCM' 'DateTime' $true 'Zeitpunkt des letzten Sync-Laufs'
  S 'SCCM_SyncStatus'      'Sync-Status'
)

$cols | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $PSScriptRoot 'schema.json') -Encoding UTF8
"Spalten gesamt: $($cols.Count)"
$cols | Group-Object type | ForEach-Object { "  $($_.Name): $($_.Count)" }
