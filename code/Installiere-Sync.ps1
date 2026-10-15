<#
.SYNOPSIS
  Bringt den Sync auf den SCCM-Server und richtet die geplante Aufgabe ein – wiederholbar.

.DESCRIPTION
  Läuft vom Arbeitsplatz aus (Windows PowerShell 5.1 oder PowerShell 7) mit einem Konto, das auf
  dem Server Administrator ist. In dieser Reihenfolge:

    1. Test-Inventar.ps1 lokal – schlägt ein Test fehl, wird nichts verteilt.
    2. Sicherung der Skripte auf dem Server nach <Ziel>\_sicherung\<Zeitstempel>\ (die letzten 10
       bleiben, ältere werden entfernt).
    3. Sync-Inventar.ps1 und Inventar-Gemeinsam.ps1 kopieren und per Prüfsumme kontrollieren.
       Die Konfiguration auf dem Server wird NIE überschrieben: sie ist dort die führende Fassung
       (ClientId, Thumbprint, Listen-IDs). Fehlt sie, bricht das Skript mit einem Hinweis ab.
       Schlüssel, die es auf dem Server noch nicht gibt, ergänzt das Skript aus
       Sync-Inventar.config.example.json (nur Werte ohne Platzhalter «<…>»; bestehende Werte
       bleiben unberührt) – so kommen neue Einstellungen wie KameraListId auf den Server.
       -MilestoneServer setzt die Adresse des Milestone Management Servers und schaltet damit die
       Kamera-Phasen ein – erst, wenn das Lesekonto in Milestone eingerichtet ist (README 7.5).
       Mit -MilestoneBenutzer und -MilestoneKennwort legt es zusätzlich die Anmeldung als
       Basisbenutzer von Milestone ab: das Kennwort mit DPAPI (LocalMachine) verschlüsselt in
       <Ziel>\Milestone.kennwort, lesbar nur auf dem Server, und MilestoneAnmeldung = Basis.
    4. Probelauf auf dem Server mit -WhatIf (schreibt nichts). Scheitert er mit einem Abbruch,
       werden die gesicherten Skripte zurückgespielt.
    5. Geplante Aufgabe «Computer Inventar Sync» anlegen oder angleichen: als SYSTEM, alle
       IntervallMinuten Minuten rund um die Uhr, höchstens 25 Minuten Laufzeit, kein zweiter Lauf
       parallel, nachholen nach einem Neustart, unabhängig von Akku/Netzbetrieb.
    6. Mit -JetztStarten: die Aufgabe sofort starten, das Ende abwarten und Ergebnis, Log-Ende
       und Status anzeigen.

.EXAMPLE
  # aus der AdminShell (dort steht das Domänenkonto in $Cred):
  & .\code\Installiere-Sync.ps1 -Credential $Cred -JetztStarten

.EXAMPLE
  # nur prüfen, was auf dem Server liegt und wie die Aufgabe eingestellt ist:
  & .\code\Installiere-Sync.ps1 -Credential $Cred -NurAnzeigen

.EXAMPLE
  # Anmeldung an Milestone als Basisbenutzer statt mit dem Computerkonto (Kennwort wird abgefragt):
  & .\code\Installiere-Sync.ps1 -Credential $Cred -MilestoneBenutzer 'inventar-sync' -MilestoneKennwort (Read-Host -AsSecureString 'Kennwort')
#>
[CmdletBinding()]
param(
    [string]$ComputerName = 'adminsrv319',
    [pscredential]$Credential,
    [string]$Ziel = 'C:\ComputerInventar',
    [ValidateRange(5, 240)]
    [int]$IntervallMinuten = 30,
    [switch]$OhneTests,
    [switch]$JetztStarten,
    [switch]$NurAnzeigen,
    [string]$MilestoneServer,
    [string]$MilestoneBenutzer,
    [securestring]$MilestoneKennwort
)

$ErrorActionPreference = 'Stop'
$CodeDir = $PSScriptRoot
if (-not $CodeDir) { $CodeDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$ServerDir = Join-Path $CodeDir 'server'
$Dateien = @('Sync-Inventar.ps1', 'Inventar-Gemeinsam.ps1')
$TaskName = 'Computer Inventar Sync'

function Schritt([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }

$sitzungParameter = @{ ComputerName = $ComputerName }
if ($Credential) { $sitzungParameter['Credential'] = $Credential }
$s = New-PSSession @sitzungParameter
try {
    if ($NurAnzeigen) {
        Schritt "Stand auf $ComputerName"
        Invoke-Command -Session $s -ArgumentList $Ziel, $TaskName {
            param($Ziel, $TaskName)
            Get-ChildItem $Ziel -File | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize | Out-String
            $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            if ($t) {
                $i = $t | Get-ScheduledTaskInfo
                "Aufgabe: $($t.State), zuletzt $($i.LastRunTime) mit $($i.LastTaskResult), nächster Lauf $($i.NextRunTime)"
                "Intervall: $($t.Triggers[0].Repetition.Interval), Zeitlimit: $($t.Settings.ExecutionTimeLimit)"
            } else { "Aufgabe '$TaskName' fehlt." }
        }
        return
    }

    # --- 1) Tests -------------------------------------------------------------
    if (-not $OhneTests) {
        Schritt 'Tests (Test-Inventar.ps1)'
        $ausgabe = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $CodeDir 'Test-Inventar.ps1') 2>&1
        $ergebnis = @($ausgabe | Where-Object { "$_" -match '^Ergebnis:' }) | Select-Object -Last 1
        Write-Host "  $ergebnis"
        if ($LASTEXITCODE -ne 0) {
            $ausgabe | Where-Object { "$_" -match 'FAIL' } | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            throw 'Tests fehlgeschlagen – es wird nichts verteilt.'
        }
    }

    # --- 2) Sicherung -----------------------------------------------------------
    Schritt "Sicherung auf $ComputerName"
    $sicherung = Invoke-Command -Session $s -ArgumentList $Ziel, $Dateien {
        param($Ziel, $Dateien)
        if (-not (Test-Path (Join-Path $Ziel 'Sync-Inventar.config.json'))) {
            throw "Auf dem Server fehlt $Ziel\Sync-Inventar.config.json. Zuerst nach README Abschnitt 7.1 anlegen."
        }
        $basis = Join-Path $Ziel '_sicherung'
        $ordner = Join-Path $basis (Get-Date -Format 'yyyyMMdd-HHmmss')
        New-Item -ItemType Directory -Force -Path $ordner | Out-Null
        foreach ($d in @($Dateien) + 'Sync-Inventar.config.json') {
            $q = Join-Path $Ziel $d
            if (Test-Path $q) { Copy-Item $q $ordner }
        }
        # Nur die letzten 10 Sicherungen behalten.
        Get-ChildItem $basis -Directory | Sort-Object Name -Descending | Select-Object -Skip 10 | Remove-Item -Recurse -Force
        $ordner
    }
    Write-Host "  $sicherung"

    # --- 3) Kopieren und prüfen -------------------------------------------------
    Schritt 'Skripte kopieren'
    foreach ($d in $Dateien) {
        Copy-Item -ToSession $s -Path (Join-Path $ServerDir $d) -Destination (Join-Path $Ziel $d) -Force
        $lokal = (Get-FileHash (Join-Path $ServerDir $d) -Algorithm SHA256).Hash
        $fern = Invoke-Command -Session $s -ArgumentList (Join-Path $Ziel $d) { param($p) (Get-FileHash $p -Algorithm SHA256).Hash }
        if ($lokal -ne $fern) { throw "Prüfsumme von $d stimmt nach dem Kopieren nicht." }
        Write-Host "  $d  $($lokal.Substring(0, 12))"
    }

    # --- 3b) Konfiguration ergänzen (nie überschreiben) ---------------------------
    Schritt 'Konfiguration auf dem Server ergänzen'
    $vorlage = Get-Content (Join-Path $ServerDir 'Sync-Inventar.config.example.json') -Raw -Encoding UTF8
    $kennwortText = $null
    if ($MilestoneKennwort) {
        if (-not $MilestoneBenutzer) { throw '-MilestoneKennwort braucht auch -MilestoneBenutzer.' }
        # Klartext nur für die Übergabe in die verschlüsselte Sitzung; auf dem Server sofort mit DPAPI geschützt.
        $kennwortText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($MilestoneKennwort))
    }
    $ergaenzt = Invoke-Command -Session $s -ArgumentList $Ziel, $vorlage, $MilestoneBenutzer, $kennwortText, $MilestoneServer {
        param($Ziel, $VorlageText, $Benutzer, $Kennwort, $Server)
        $pfad = Join-Path $Ziel 'Sync-Inventar.config.json'
        $cfg = Get-Content $pfad -Raw -Encoding UTF8 | ConvertFrom-Json
        $vorlage = $VorlageText | ConvertFrom-Json
        $neu = @()
        foreach ($p in $vorlage.PSObject.Properties) {
            if ($cfg.PSObject.Properties[$p.Name]) { continue }
            if ($p.Value -is [string] -and $p.Value -match '^<') { continue }
            $cfg | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value
            $neu += $p.Name
        }
        if ($Kennwort) {
            Add-Type -AssemblyName System.Security
            $geschuetzt = [Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($Kennwort), [Text.Encoding]::UTF8.GetBytes('ICT-Inventar Milestone'), [Security.Cryptography.DataProtectionScope]::LocalMachine)
            $datei = Join-Path $Ziel 'Milestone.kennwort'
            Set-Content -Path $datei -Value ([Convert]::ToBase64String($geschuetzt)) -Encoding ASCII
            # Nur SYSTEM und Administratoren dürfen die Datei lesen.
            $acl = New-Object Security.AccessControl.FileSecurity
            $acl.SetAccessRuleProtection($true, $false)
            foreach ($wer in 'NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators') {
                $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($wer, 'FullControl', 'Allow')))
            }
            Set-Acl -Path $datei -AclObject $acl
            foreach ($paar in @(@('MilestoneAnmeldung', 'Basis'), @('MilestoneBenutzer', $Benutzer), @('MilestoneKennwortDatei', $datei))) {
                if ($cfg.PSObject.Properties[$paar[0]]) { $cfg.($paar[0]) = $paar[1] } else { $cfg | Add-Member -NotePropertyName $paar[0] -NotePropertyValue $paar[1] }
            }
            $neu += 'Milestone-Anmeldung (Basis)'
        }
        # -MilestoneServer schaltet die Kamera-Phasen ein (überschreibt einen Platzhalter oder alten Wert).
        if ($Server) {
            if ($cfg.PSObject.Properties['MilestoneServer']) { $cfg.MilestoneServer = $Server } else { $cfg | Add-Member -NotePropertyName MilestoneServer -NotePropertyValue $Server }
            $neu += "MilestoneServer = $Server"
        }
        if ($neu.Count) {
            [IO.File]::WriteAllText($pfad, ($cfg | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
        }
        $neu
    }
    $kennwortText = $null
    if (@($ergaenzt).Count) { Write-Host "  ergänzt: $(@($ergaenzt) -join ', ')" } else { Write-Host '  nichts zu ergänzen' }

    # --- 4) Probelauf -------------------------------------------------------------
    # Der Probelauf läuft als SYSTEM über eine einmalige Aufgabe – genau wie der echte Sync. In der
    # Remote-Sitzung selbst erreichte er das AD nicht (zweiter Sprung ohne Anmeldedaten).
    Schritt 'Probelauf auf dem Server als SYSTEM (-WhatIf, schreibt nichts)'
    $probe = Invoke-Command -Session $s -ArgumentList $Ziel {
        param($Ziel)
        $name = 'Computer Inventar Sync (Probelauf)'
        $log = Join-Path $Ziel '_probelauf.log'
        if (Test-Path $log) { Remove-Item $log -Force }
        $aktion = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $Ziel `
            -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Ziel\Sync-Inventar.ps1`" -WhatIf -LogPath `"$log`""
        $konto = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        $einst = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $name -Action $aktion -Principal $konto -Settings $einst -Force | Out-Null
        try {
            Start-ScheduledTask -TaskName $name
            $bis = (Get-Date).AddMinutes(25)
            do { Start-Sleep -Seconds 5; $t = Get-ScheduledTask -TaskName $name } while ($t.State -eq 'Running' -and (Get-Date) -lt $bis)
            Start-Sleep -Seconds 2
            $exit = (Get-ScheduledTaskInfo -TaskName $name).LastTaskResult
        } finally {
            Unregister-ScheduledTask -TaskName $name -Confirm:$false
        }
        $zeilen = @()
        if (Test-Path $log) { $zeilen = @(Get-Content $log -Encoding UTF8) }
        [pscustomobject]@{ Exit = $exit; Zeilen = $zeilen }
    }
    $probe.Zeilen | Where-Object { $_ -match '\[(ERROR|WARN)\]|fertig:|Fertig:|WHATIF (Neu|Archiv)|WHATIF Kamera (neu|archiv)|Milestone' } | ForEach-Object { Write-Host "  $_" }
    $abbruch = @($probe.Zeilen | Where-Object { $_ -match 'Unerwarteter Abbruch|Lauf abgebrochen|Konfiguration .* nicht lesbar' })
    if ($abbruch.Count -gt 0) {
        Write-Host '  Probelauf abgebrochen – die gesicherten Skripte werden zurückgespielt.' -ForegroundColor Red
        Invoke-Command -Session $s -ArgumentList $Ziel, $sicherung, $Dateien {
            param($Ziel, $Sicherung, $Dateien)
            foreach ($d in $Dateien) { $q = Join-Path $Sicherung $d; if (Test-Path $q) { Copy-Item $q (Join-Path $Ziel $d) -Force } }
        }
        throw 'Probelauf fehlgeschlagen, alter Stand wiederhergestellt.'
    }
    if ($probe.Exit -ne 0) { Write-Host "  Probelauf mit Exit-Code $($probe.Exit): Fehler oben prüfen (der Sync selbst ist verteilt)." -ForegroundColor Yellow }
    else { Write-Host '  Probelauf ohne Fehler.' -ForegroundColor Green }

    # --- 5) Geplante Aufgabe ------------------------------------------------------
    Schritt "Geplante Aufgabe «$TaskName» (alle $IntervallMinuten Minuten)"
    Invoke-Command -Session $s -ArgumentList $Ziel, $TaskName, $IntervallMinuten {
        param($Ziel, $TaskName, $IntervallMinuten)
        $aktion = New-ScheduledTaskAction -Execute 'powershell.exe' `
            -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Ziel\Sync-Inventar.ps1`"" -WorkingDirectory $Ziel
        # Beginn fünf Minuten nach der vollen Stunde (nicht gleichzeitig mit stündlichen Aufgaben
        # von SCCM), danach endlos alle IntervallMinuten Minuten.
        $start = (Get-Date).Date.AddHours((Get-Date).Hour).AddMinutes(5)
        $ausloeser = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes $IntervallMinuten)
        $einstellungen = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -MultipleInstances IgnoreNew `
            -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
        $konto = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
        $beschreibung = "ICT-Inventar: SCCM, AD und Milestone nach SharePoint (ADMIN-Clients, EDU-Clients, Benutzer, Telefonnummern, Kameras, Kamera-Rollen). Eingerichtet mit Installiere-Sync.ps1 am $(Get-Date -Format 'dd.MM.yyyy HH:mm'). Log: $Ziel\Sync-Inventar.log"
        Register-ScheduledTask -TaskName $TaskName -Action $aktion -Trigger $ausloeser -Settings $einstellungen -Principal $konto -Description $beschreibung -Force | Out-Null
        $t = Get-ScheduledTask -TaskName $TaskName
        $i = $t | Get-ScheduledTaskInfo
        "  Intervall $($t.Triggers[0].Repetition.Interval), Zeitlimit $($t.Settings.ExecutionTimeLimit), nächster Lauf $($i.NextRunTime)"
    } | ForEach-Object { Write-Host $_ }

    # --- 6) Sofort starten --------------------------------------------------------
    if ($JetztStarten) {
        Schritt 'Lauf jetzt starten und abwarten'
        $bericht = Invoke-Command -Session $s -ArgumentList $Ziel, $TaskName {
            param($Ziel, $TaskName)
            $vorher = (Get-ScheduledTaskInfo -TaskName $TaskName).LastRunTime
            Start-ScheduledTask -TaskName $TaskName
            $bis = (Get-Date).AddMinutes(25)
            do {
                Start-Sleep -Seconds 10
                $t = Get-ScheduledTask -TaskName $TaskName
                $i = $t | Get-ScheduledTaskInfo
            } while (((Get-Date) -lt $bis) -and ($t.State -eq 'Running' -or $i.LastRunTime -eq $vorher))
            "Ergebnis: $($i.LastTaskResult) (0 = ohne Fehler), gestartet $($i.LastRunTime)"
            Get-Content (Join-Path $Ziel 'Sync-Inventar.log') -Tail 600 | Where-Object { $_ -match '\[(ERROR|WARN)\]|fertig:|Fertig:|Sync-Start|Neu angelegt|Archiviert|reaktiviert|neu aufgesetzt|Inventar|Milestone|Kamera neu|Rolle neu' } | Select-Object -Last 50
            $st = Join-Path $Ziel 'Sync-Inventar.status.json'
            if (Test-Path $st) { 'Status:'; Get-Content $st -Raw }
        }
        $bericht | ForEach-Object { Write-Host "  $_" }
    }
} finally {
    Remove-PSSession $s
}
