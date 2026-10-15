<#
.SYNOPSIS
  Synchronisiert die SharePoint-Listen «ADMIN-Clients» und «EDU-Clients» (aus SCCM) und
  «Benutzer» (aus Active Directory).

.DESCRIPTION
  Der Sync füllt Daten. Er benennt keine Spalte um und löscht keine; fehlt eine erwartete
  Spalte, meldet er das als WARN und lässt genau ihre Felder aus – alles andere läuft weiter.
  Angelegt werden Spalten mit Ergaenze-Spalten.ps1 oder von Hand in den Listeneinstellungen.
  Eine einzige Ausnahme: Fehlt in der Benutzer-Liste die Spalte zu einem Programm der Liste
  «Software», legt er sie selbst an – sonst wäre ein direkt in SharePoint erfasstes Programm
  wirkungslos. Scheitert das, bleibt es bei der Warnung.

  Phase Clients (läuft zweimal, einmal je Liste):
    - liest alle Geräte samt Inventar aus SCCM (SMS Provider, WMI),
    - teilt sie über den Namen auf: alles, was mit «EDU» beginnt, gehört in die Liste
      «EDU-Clients», alles Übrige in «ADMIN-Clients» (Get-ClientListe in Inventar-Gemeinsam.ps1),
    - ordnet sie je Liste über die Seriennummer den Zeilen zu (Fallback: PC-Name),
    - führt den Titel nach, wenn ein Gerät in SCCM umbenannt wurde (mit Verlaufseintrag),
    - schreibt nur geänderte SCCM_*-Felder, legt fehlende Geräte neu an (Status «Aktiv»),
    - lässt Zeilen mit «In Domäne = Nein» vollständig in Ruhe (Geräte ohne Domäne, die es in
      SCCM nie geben wird – Gäste- und Prüfungsnotebooks),
    - setzt Zeilen ohne SCCM-Gerät auf «In SCCM vorhanden = Nein» und Status «Archiviert».
      Gelöscht wird in dieser Phase nie – es gibt keinen Löschpfad. Wird ein Gerät umbenannt und
      wechselt dabei die Seite (EDU ↔ ADMIN), verschwindet es aus der einen Liste (archiviert)
      und entsteht in der anderen neu; verschoben wird von Hand oder mit Migriere-Clients.ps1.

  Phase Benutzer:
    - lädt die Programmliste aus der SharePoint-Liste «Software»,
    - prüft, welche Spalten (Verlauf, Programme) die Benutzer-Liste hat,
    - liest die AD-Benutzer der konfigurierten OUs (Modul ActiveDirectory, Fallback ADSI),
    - ermittelt je Programm die rekursiven Mitglieder der hinterlegten AD-Gruppen,
    - schreibt AD-Felder, Primärgerät (SCCM) und die Programmstufen (2 = aus AD-Gruppe),
    - löscht Zeilen, deren Login im AD-Scope fehlt (mit Löschschutz).

  Phase Telefonnummern (nur wenn TelefonListId konfiguriert ist):
    - prüft, welche Spalten die Liste «Telefonnummern» hat,
    - vergleicht die Nummern der Liste mit dem AD-Attribut telephoneNumber der Benutzer,
    - schreibt den Login in «Benutzer», übernimmt bei leerem Namen den AD-Anzeigenamen,
      setzt «Frei» auf «Aktiv», sobald die Nummer im AD vergeben ist,
    - legt Nummern aus dem Hausblock (TelefonPraefix), die im AD stehen, aber in der Liste fehlen, neu an.
      Gelöscht wird in dieser Phase nie.

  Phase Kameras (nur wenn KameraListId und MilestoneServer konfiguriert sind):
    - liest die Hardware aus Milestone XProtect (REST-API des Management Servers),
    - ordnet sie über Hardware-ID, MAC, Seriennummer und IP den Zeilen der Liste «Kameras» zu,
    - schreibt die MS_*-Felder, führt Umbenennungen nach, füllt leere Felder Gebäude und Raum,
    - legt neue Hardware an und archiviert verschwundene (mit Archivschutz). Gelöscht wird nie.

  Phase Kamera-Rollen (nur wenn KameraRolleListId konfiguriert ist; höchstens alle
  MilestoneRechteStunden Stunden, Standard 6):
    - liest Rollen, Mitglieder und die Rechte jeder Rolle auf jede Kamera aus Milestone,
    - löst die AD-Gruppen der Mitglieder rekursiv in Logins auf,
    - schreibt die Liste «Kamera-Rollen» und je Kamera die Spalte «Sichtbar für».
      Die Rechte werden nur gelesen, nie geändert.

.PARAMETER OnlyClients
  Nur die Client-Phasen ausführen (ADMIN-Clients und EDU-Clients).

.PARAMETER ClientListen
  Welche Client-Listen abgeglichen werden: Alle (Vorgabe), Admin oder Edu.

.PARAMETER OnlyBenutzer
  Nur die Benutzer-Phase ausführen.

.PARAMETER OnlyTelefone
  Nur die Telefon-Phase ausführen (liest AD, aber kein SCCM).

.PARAMETER OnlyKameras
  Nur die Kamera-Phasen ausführen (Milestone -> Kameras und Kamera-Rollen; kein SCCM).

.PARAMETER KameraRechteJetzt
  Die Rechte der Milestone-Rollen jetzt abgleichen, auch wenn der letzte Abgleich jünger ist als
  MilestoneRechteStunden.

.PARAMETER MilestoneDiagnose
  Schreibt die ersten Antworten von Milestone zu Rollen, Mitgliedern und Rechten roh nach
  Milestone-Diagnose.json neben dem Log (zum Nachsehen, wenn die Rechte leer bleiben).

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
    [switch]$OnlyClients,
    [ValidateSet('Alle', 'Admin', 'Edu')]
    [string]$ClientListen = 'Alle',
    [switch]$OnlyBenutzer,
    [switch]$OnlyTelefone,
    [switch]$OnlyKameras,
    [switch]$KameraRechteJetzt,
    [switch]$MilestoneDiagnose,
    [switch]$DumpOnly,
    [string[]]$OnlyDevices,
    [string]$LogPath    # überschreibt LogPath der Konfiguration (Probeläufe von Installiere-Sync.ps1)
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

# ---------------------------------------------------------------------------
# Zuordnung SCCM-Gerät <-> Zeile einer Client-Liste (rein, ohne Graph und WMI)
# ---------------------------------------------------------------------------

function Get-ZeilenSeriennummer {
    <# Gültige Seriennummer einer Zeile: ausschliesslich SCCM_SerialNumber.
       Eine manuelle Spalte «Seriennummer» gibt es seit 2026-09-04 nicht mehr. #>
    param($Zeile)
    $a = NormSeriennummer (Get-Text $Zeile 'SCCM_SerialNumber')
    if (Test-Seriennummer $a) { return $a }
    return ''
}

function ConvertTo-Zeitpunkt {
    <# Beliebige Datumsangabe -> DateTime; nicht lesbar oder leer -> DateTime.MinValue. #>
    param($Wert)
    if ($null -eq $Wert) { return [datetime]::MinValue }
    if ($Wert -is [datetime]) { return [datetime]$Wert }
    $s = ([string]$Wert).Trim()
    if ($s -eq '') { return [datetime]::MinValue }
    try { return [datetime]::Parse($s, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal) } catch { return [datetime]::MinValue }
}

function Get-ZeilenSortierschluessel {
    <# Zeilen deterministisch ordnen: numerische Listen-Ids zuerst nach Zahl, sonst nach Text. #>
    param($Zeile)
    $s = [string](Get-Feld $Zeile 'Id')
    $n = 0
    if ([int]::TryParse($s, [ref]$n)) { return ('0{0:D9}' -f $n) }
    return ('1' + $s)
}

function Test-ArchivSchutz {
    <#
      Plausibilitätsschutz für das Archivieren: liefert SCCM gar nichts oder würde ein einziger Lauf
      mehr als GrenzeProzent % der nicht archivierten Zeilen archivieren, wird nicht archiviert.
      (Gelöscht wird in den Client-Phasen ohnehin nie.)
    #>
    param(
        [int]$AnzahlSccmGeraete,
        [int]$AnzahlAktiveZeilen,
        [int]$AnzahlArchivieren,
        [double]$GrenzeProzent = 50
    )
    if ($AnzahlSccmGeraete -le 0) {
        return [pscustomobject]@{ Erlaubt = $false; Prozent = 0; Grund = 'SCCM hat kein einziges Gerät geliefert – es wird nichts archiviert.' }
    }
    if ($AnzahlArchivieren -le 0) {
        return [pscustomobject]@{ Erlaubt = $true; Prozent = 0; Grund = 'Nichts zu archivieren.' }
    }
    if ($AnzahlAktiveZeilen -le 0) {
        return [pscustomobject]@{ Erlaubt = $true; Prozent = 0; Grund = 'Keine aktiven Zeilen.' }
    }
    $prozent = [math]::Round(100.0 * $AnzahlArchivieren / $AnzahlAktiveZeilen, 1)
    if ($prozent -gt $GrenzeProzent) {
        return [pscustomobject]@{ Erlaubt = $false; Prozent = $prozent; Grund = "Es würden $AnzahlArchivieren von $AnzahlAktiveZeilen nicht archivierten Zeilen ($prozent %) archiviert – mehr als die Grenze von $GrenzeProzent %." }
    }
    return [pscustomobject]@{ Erlaubt = $true; Prozent = $prozent; Grund = "Archivieren erlaubt ($AnzahlArchivieren von $AnzahlAktiveZeilen Zeilen, $prozent %)." }
}

function Get-ClientZuordnung {
    <#
      Ordnet SCCM-Geräte den Zeilen einer Client-Liste zu. Reine Funktion, damit sie ohne
      SCCM und ohne Graph geprüft werden kann.

      $SccmGeraete: Objekte mit ResourceId, Name, Seriennummer, Aktivitaet (jüngste SCCM-Aktivität),
                    optional InventarAusstehend (kein Hardware-Inventar und keine Seriennummer)
                    und Erstellt (Anlage des SCCM-Datensatzes)
      $Zeilen     : Objekte mit Id, Title, SCCM_SerialNumber, SCCM_ResourceID, Status, InDomaene

      Regeln:
       0. Zeilen mit «In Domäne = Nein» sind vom Abgleich ausgenommen: kein Gerät, keine
          Archivierung, und sie zählen nicht in die aktiven Zeilen des Archivschutzes. Leer
          gilt als Ja (Test-InDomaene).
       1. Schlüssel ist die Seriennummer (Platzhalter zählen nicht als Seriennummer).
          Liefert SCCM mehrere Ressourcen mit derselben Seriennummer (Neuaufsetzung, Altdatensatz),
          gilt die mit der jüngsten Aktivität; die anderen werden nur gemeldet.
       2. Passt keine Seriennummer, wird über den Namen zugeordnet – aber nur gegen Zeilen, die
          selbst keine gültige Seriennummer tragen und nicht «Archiviert» sind. Das deckt zwei Fälle
          ab: Geräte ohne Seriennummer (VMs) und Zeilen aus der Zeit vor dieser Spalte. Eine
          archivierte Zeile wird nie über den Namen wiederverwendet, sonst würde ein neu
          aufgesetztes Gerät die alte Leiche erben.
       3. Namen sind ausdrücklich nicht eindeutig: mehrere Zeilen und mehrere SCCM-Geräte dürfen
          gleich heissen. Je Name wird der Reihe nach zugeteilt (jüngstes Gerät zuerst).
       4. Weicht der SCCM-Name bei einer Zuordnung über die Seriennummer vom Titel ab, wird der
          Titel nachgeführt und ein Verlaufseintrag vorgemerkt.
       5. Zeilen ohne SCCM-Gerät werden archiviert (nie gelöscht), archivierte Zeilen mit Gerät
          reaktiviert. «Lager» bleibt unangetastet, solange das Gerät in SCCM ist.
       6. Neu aufgesetzte Geräte («Inventar ausstehend»): Beim Neuaufsetzen legt SCCM einen neuen
          Datensatz an, der Stunden bis Tage lang weder Hardware-Inventar noch Seriennummer hat.
          Ob es dieselbe Hardware ist, entscheidet erst die Seriennummer. Bis dahin gilt, falls
          Regel 2 keine Zeile findet:
            a) eine gleichnamige Zeile im Einsatz (mit Seriennummer) wird festgehalten – sie wird
               weder archiviert noch geändert, und es entsteht keine Dublette;
            b) sonst wird eine archivierte gleichnamige Zeile ohne Seriennummer reaktiviert (sie
               hatte nie eine Hardware-Identität, es spricht also nichts dagegen);
            c) sonst, wenn eine archivierte gleichnamige Zeile mit Seriennummer existiert, wird
               gewartet und nichts angelegt – höchstens WartezeitTage lang ab Anlage des
               SCCM-Datensatzes, danach entsteht die Zeile wie bei einem neuen Gerät.
    #>
    param($SccmGeraete, $Zeilen, [datetime]$Heute = (Get-Date), [int]$WartezeitTage = 7)

    $warnungen = New-Object System.Collections.ArrayList
    $zuordnungen = New-Object System.Collections.ArrayList
    $neu = New-Object System.Collections.ArrayList
    $archivieren = New-Object System.Collections.ArrayList
    $wartend = New-Object System.Collections.ArrayList

    # --- 1) SCCM-Geräte nach Seriennummer gruppieren --------------------------
    $nachSerie = @{}
    $ohneSerie = New-Object System.Collections.ArrayList
    foreach ($g in @($SccmGeraete)) {
        if ($null -eq $g) { continue }
        $sn = NormSeriennummer (Get-Text $g 'Seriennummer')
        if (Test-Seriennummer $sn) {
            if (-not $nachSerie.ContainsKey($sn)) { $nachSerie[$sn] = New-Object System.Collections.ArrayList }
            [void]$nachSerie[$sn].Add($g)
        } else {
            [void]$ohneSerie.Add($g)
        }
    }

    # Dublette in SCCM: jüngste Aktivität gewinnt, bei Gleichstand die höhere ResourceID.
    $massgeblich = New-Object System.Collections.ArrayList
    foreach ($sn in @($nachSerie.Keys | Sort-Object)) {
        $liste = @($nachSerie[$sn])
        $best = $null
        foreach ($g in $liste) {
            if ($null -eq $best) { $best = $g; continue }
            $a = ConvertTo-Zeitpunkt (Get-Feld $g 'Aktivitaet')
            $b = ConvertTo-Zeitpunkt (Get-Feld $best 'Aktivitaet')
            if ($a -gt $b -or ($a -eq $b -and ([string](Get-Feld $g 'ResourceId')) -gt ([string](Get-Feld $best 'ResourceId')))) { $best = $g }
        }
        if ($liste.Count -gt 1) {
            $namen = (@($liste | ForEach-Object { '{0} (ResourceID {1})' -f (Get-Text $_ 'Name'), (Get-Text $_ 'ResourceId') }) -join ', ')
            [void]$warnungen.Add("Seriennummer $sn kommt in SCCM $($liste.Count)-mal vor: $namen – massgeblich ist $(Get-Text $best 'Name') (ResourceID $(Get-Text $best 'ResourceId')).")
        }
        [void]$massgeblich.Add($best)
    }

    # --- 2) Zeilen indexieren -------------------------------------------------
    $alleZeilen = @(@($Zeilen) | Where-Object { $null -ne $_ } | Sort-Object { Get-ZeilenSortierschluessel $_ })

    # Zeilen mit «In Domäne = Nein» fallen hier ganz heraus: Sie bekommen kein SCCM-Gerät
    # zugeordnet, keine SCCM-Felder und werden nie archiviert. Sie zählen auch nicht in die
    # aktiven Zeilen – sonst würde der Archivschutz an Geräten gemessen, die in SCCM
    # gar nicht vorkommen können.
    $ausserhalb = @($alleZeilen | Where-Object { -not (Test-InDomaene $_) })
    $zeilenSortiert = @($alleZeilen | Where-Object { Test-InDomaene $_ })
    $zNachSerie = @{}
    $zNachName = @{}
    $zAlleNachName = @{}   # alle Zeilen je Name, auch mit Seriennummer und archivierte (Regel 6)
    $zustand = @{}   # ZeileId -> Hilfsdaten
    foreach ($z in $zeilenSortiert) {
        $id = [string](Get-Feld $z 'Id')
        $sn = Get-ZeilenSeriennummer $z
        $st = Get-StatusNorm (Get-Text $z 'Status')
        $zustand[$id] = [pscustomobject]@{ Zeile = $z; Seriennummer = $sn; Status = $st; Titel = (Get-Text $z 'Title') }
        $kAlle = NormName (Get-Text $z 'Title')
        if ($kAlle -ne '') {
            if (-not $zAlleNachName.ContainsKey($kAlle)) { $zAlleNachName[$kAlle] = New-Object System.Collections.ArrayList }
            [void]$zAlleNachName[$kAlle].Add($z)
        }
        if ($sn -ne '') {
            if (-not $zNachSerie.ContainsKey($sn)) { $zNachSerie[$sn] = New-Object System.Collections.ArrayList }
            [void]$zNachSerie[$sn].Add($z)
        } elseif ($st -ne 'Archiviert') {
            $k = NormName (Get-Text $z 'Title')
            if ($k -eq '') { continue }
            if (-not $zNachName.ContainsKey($k)) { $zNachName[$k] = New-Object System.Collections.ArrayList }
            [void]$zNachName[$k].Add($z)
        }
    }
    # Mehrere Zeilen zur gleichen Seriennummer: die erste nicht archivierte gewinnt.
    foreach ($sn in @($zNachSerie.Keys)) {
        $liste = @($zNachSerie[$sn])
        if ($liste.Count -le 1) { continue }
        $bevorzugt = @($liste | Where-Object { $zustand[[string](Get-Feld $_ 'Id')].Status -ne 'Archiviert' })
        if ($bevorzugt.Count -eq 0) { $bevorzugt = $liste }
        [void]$warnungen.Add("Seriennummer $sn steht in $($liste.Count) Zeilen (IDs $((@($liste | ForEach-Object { Get-Feld $_ 'Id' })) -join ', ')) – verwendet wird ID $(Get-Feld $bevorzugt[0] 'Id'), die übrigen gelten als ohne Gerät.")
        $zNachSerie[$sn] = New-Object System.Collections.ArrayList
        [void]$zNachSerie[$sn].Add($bevorzugt[0])
    }

    # --- 3) Zuordnen ----------------------------------------------------------
    $belegt = New-Object System.Collections.Generic.HashSet[string]
    $ueberNamen = New-Object System.Collections.ArrayList

    foreach ($g in $massgeblich) {
        $sn = NormSeriennummer (Get-Text $g 'Seriennummer')
        if ($zNachSerie.ContainsKey($sn)) {
            $z = $zNachSerie[$sn][0]
            [void]$zuordnungen.Add((New-Zuordnung $g $zustand[[string](Get-Feld $z 'Id')] 'Seriennummer'))
            [void]$belegt.Add([string](Get-Feld $z 'Id'))
        } else {
            [void]$ueberNamen.Add($g)
        }
    }
    foreach ($g in $ohneSerie) { [void]$ueberNamen.Add($g) }

    # Namensfallback: jüngstes Gerät zuerst, damit es bei gleichen Namen die Zeile bekommt.
    # Geräte mit ausstehendem Inventar kommen je Name zuletzt – ein fertig inventarisiertes
    # Gerät gleichen Namens hat Vorrang.
    $ueberNamenSortiert = @(@($ueberNamen) | Sort-Object `
        @{ Expression = { NormName (Get-Text $_ 'Name') } }, `
        @{ Expression = { [bool](Get-Feld $_ 'InventarAusstehend') } }, `
        @{ Expression = { ConvertTo-Zeitpunkt (Get-Feld $_ 'Aktivitaet') }; Descending = $true }, `
        @{ Expression = { [string](Get-Feld $_ 'ResourceId') } })
    foreach ($g in $ueberNamenSortiert) {
        $k = NormName (Get-Text $g 'Name')
        $z = $null
        if ($k -ne '' -and $zNachName.ContainsKey($k)) {
            foreach ($kandidat in @($zNachName[$k])) {
                if (-not $belegt.Contains([string](Get-Feld $kandidat 'Id'))) { $z = $kandidat; break }
            }
        }
        if ($null -eq $z -and [bool](Get-Feld $g 'InventarAusstehend') -and $k -ne '' -and $zAlleNachName.ContainsKey($k)) {
            # Regel 6: neu aufgesetztes Gerät ohne Inventar – noch nicht entscheidbar, ob es
            # dieselbe Hardware ist wie eine gleichnamige Zeile.
            $frei = @(@($zAlleNachName[$k]) | Where-Object { -not $belegt.Contains([string](Get-Feld $_ 'Id')) })
            $imEinsatz = @($frei | Where-Object { $zustand[[string](Get-Feld $_ 'Id')].Status -ne 'Archiviert' })
            $archiviertOhneSerie = @($frei | Where-Object { $s = $zustand[[string](Get-Feld $_ 'Id')]; $s.Status -eq 'Archiviert' -and $s.Seriennummer -eq '' })
            if ($imEinsatz.Count -gt 0) {
                # a) festhalten: weder archivieren noch überschreiben
                $h = $imEinsatz[0]
                [void]$belegt.Add([string](Get-Feld $h 'Id'))
                [void]$wartend.Add([pscustomobject]@{ Geraet = $g; Name = (Get-Text $g 'Name'); ZeileId = [string](Get-Feld $h 'Id'); Grund = 'festgehalten' })
                continue
            }
            if ($archiviertOhneSerie.Count -gt 0) {
                # b) die jüngste archivierte Zeile ohne Seriennummer reaktivieren
                $z = $archiviertOhneSerie[$archiviertOhneSerie.Count - 1]
            } else {
                # c) archivierte Zeile mit Seriennummer: warten, höchstens WartezeitTage. Ist das
                #    Anlagedatum unbekannt, lieber sichtbar anlegen als unbegrenzt warten.
                $erstellt = ConvertTo-Zeitpunkt (Get-Feld $g 'Erstellt')
                if ($erstellt -ne [datetime]::MinValue -and ($Heute - $erstellt).TotalDays -lt $WartezeitTage) {
                    [void]$wartend.Add([pscustomobject]@{ Geraet = $g; Name = (Get-Text $g 'Name'); ZeileId = ''; Grund = 'wartet' })
                    continue
                }
            }
        }
        if ($null -eq $z) {
            [void]$neu.Add([pscustomobject]@{ Geraet = $g; Name = (Get-Text $g 'Name'); Verlauf = 'Aus SCCM neu angelegt'; Status = 'Aktiv' })
            continue
        }
        [void]$zuordnungen.Add((New-Zuordnung $g $zustand[[string](Get-Feld $z 'Id')] 'Name'))
        [void]$belegt.Add([string](Get-Feld $z 'Id'))
    }

    # ResourceID -> Zeile, der das Gerät in diesem Lauf zugeordnet ist (für den Verlaufstext
    # einer Dublette: dasselbe SCCM-Gerät steht schon in einer anderen Zeile).
    $zeileVonRessource = @{}
    foreach ($zu in $zuordnungen) {
        $rid = [string](Get-Feld $zu.Geraet 'ResourceId')
        if ($rid -ne '' -and -not $zeileVonRessource.ContainsKey($rid)) { $zeileVonRessource[$rid] = $zu.ZeileId }
    }

    # --- 4) Zeilen ohne SCCM-Gerät -------------------------------------------
    $aktiveZeilen = 0
    foreach ($z in $zeilenSortiert) {
        $id = [string](Get-Feld $z 'Id')
        $s = $zustand[$id]
        if ($s.Titel -eq '' -and $s.Seriennummer -eq '') { continue }
        if ($s.Status -ne 'Archiviert') { $aktiveZeilen++ }
        if ($belegt.Contains($id)) { continue }
        if ($s.Status -eq 'Archiviert') { continue }
        $text = 'In SCCM nicht mehr vorhanden, archiviert'
        $eigeneRid = ([string](Get-Feld $z 'SCCM_ResourceID')) -replace '\.0+$', ''
        if ($eigeneRid -ne '' -and $zeileVonRessource.ContainsKey($eigeneRid)) {
            $text = "Doppelte Zeile: das SCCM-Gerät (ResourceID $eigeneRid) steht in Zeile ID $($zeileVonRessource[$eigeneRid]), archiviert"
        }
        [void]$archivieren.Add([pscustomobject]@{
                Zeile     = $z
                ZeileId   = $id
                Titel     = $s.Titel
                StatusAlt = $s.Status
                StatusNeu = 'Archiviert'
                Verlauf   = $text
            })
    }

    return [pscustomobject]@{
        Zuordnungen  = @($zuordnungen.ToArray())
        Neu          = @($neu.ToArray())
        Archivieren  = @($archivieren.ToArray())
        Wartend      = @($wartend.ToArray())
        AktiveZeilen = $aktiveZeilen
        Ausserhalb   = @($ausserhalb).Count
        Warnungen    = @($warnungen.ToArray())
    }
}

function New-Zuordnung {
    <#
      Baut einen Zuordnungseintrag samt Titeländerung, neuem Status und Verlaufstexten.
      $Zustand ist das Hilfsobjekt aus Get-ClientZuordnung (Zeile, Seriennummer, Status, Titel).
    #>
    param($Geraet, $Zustand, [string]$Grund)
    $alterTitel = $Zustand.Titel
    $neuerTitel = ([string](Get-Text $Geraet 'Name')).ToUpperInvariant()
    $umbenennen = ($Grund -eq 'Seriennummer' -and $neuerTitel -ne '' -and (NormName $alterTitel) -ne (NormName $neuerTitel))
    $verlauf = New-Object System.Collections.ArrayList
    if ($umbenennen) { [void]$verlauf.Add("Umbenannt von $alterTitel zu $neuerTitel (SCCM)") }

    $statusNeu = ''
    if ($Zustand.Status -eq 'Archiviert') {
        $statusNeu = 'Aktiv'
        [void]$verlauf.Add('Wieder in SCCM vorhanden, reaktiviert')
    } elseif ($Zustand.Status -eq '') {
        $statusNeu = 'Aktiv'   # erster Sync-Kontakt, kein Verlaufseintrag nötig
    }
    # «Lager» und «Aktiv» bleiben unverändert, solange das Gerät in SCCM ist.

    return [pscustomobject]@{
        Geraet       = $Geraet
        Zeile        = $Zustand.Zeile
        ZeileId      = [string](Get-Feld $Zustand.Zeile 'Id')
        Grund        = $Grund
        AlterTitel   = $alterTitel
        NeuerTitel   = $neuerTitel
        Umbenennen   = $umbenennen
        StatusAlt    = $Zustand.Status
        StatusNeu    = $statusNeu
        VerlaufTexte = @($verlauf.ToArray())
    }
}

# ---------------------------------------------------------------------------
# Abgleich Telefonliste <-> AD-Telefonnummern (rein, ohne Graph und AD)
# ---------------------------------------------------------------------------

function Get-TelefonAbgleich {
    <#
      Vergleicht die Zeilen der Liste «Telefonnummern» mit den Telefonnummern der AD-Benutzer.
      Reine Funktion, damit sie ohne AD und ohne Graph geprüft werden kann.

      $Zeilen     : Objekte mit Id, Title (Kurzwahl), Telefonnummer, Name, Typ, Status, Benutzer
      $AdBenutzer : Objekte mit Login, Anzeigename, Telefon (AD-Attribut telephoneNumber)
      $Praefix    : Nummernblock des Hauses, z. B. «+41 41 926 2»

      Regeln:
       1. Verglichen wird über die Ziffernfolge (Get-TelefonZiffern). Eine Zeile ohne
          Telefonnummer wird über die Kurzwahl plus Präfix verglichen.
       2. Steht die Nummer im AD bei einem Benutzer, kommt sein Login in «Benutzer». Ein
          Wechsel wird im Verlauf festgehalten. Bei leerem Namen wird der AD-Anzeigename
          übernommen, bei leerem Typ «Person»; Status «Frei» wird zu «Aktiv».
       3. Steht die Nummer bei niemandem mehr, wird «Benutzer» geleert (mit Verlaufseintrag).
          Name, Typ und Status bleiben – ob die Nummer frei ist, entscheidet ein Mensch.
       4. Nummern im Hausblock, die im AD vorkommen, aber in der Liste fehlen, werden neu
          angelegt. Nummern ausserhalb des Blocks (Mobil, extern) werden nur zugeordnet,
          nie angelegt.
       5. Haben mehrere AD-Benutzer dieselbe Nummer, gilt der alphabetisch erste Login;
          die Dublette wird gemeldet. Gelöscht wird nie.
    #>
    param($Zeilen, $AdBenutzer, [string]$Praefix, [switch]$NichtLeeren)
    # -NichtLeeren: das AD wurde nicht vollständig gelesen – eine Nummer, die bei niemandem steht,
    # behält dann ihren Benutzer (Regel 3 entfällt für diesen Lauf).
    if (-not $Praefix) { $Praefix = $script:TelefonPraefixStandard }

    $warnungen = New-Object System.Collections.ArrayList
    $updates = New-Object System.Collections.ArrayList
    $neu = New-Object System.Collections.ArrayList

    # --- 1) AD-Benutzer nach Nummer ------------------------------------------
    $adNachNummer = @{}
    foreach ($u in @($AdBenutzer)) {
        if ($null -eq $u) { continue }
        $z = Get-TelefonZiffern (Get-Text $u 'Telefon') $Praefix
        if ($z -eq '') { continue }
        $login = Get-Text $u 'Login'
        if ($login -eq '') { continue }
        # Eine Schweizer Nummer hat mit Landesvorwahl genau 11 Ziffern. Steht im AD nur ein Teil
        # (z. B. der Hausblock «+41 41 926 2» ohne Kurzwahl), ist das keine Nummer: sonst gälten
        # alle Konten mit demselben Bruchstück als Dublette derselben Nummer.
        if ($z.StartsWith('41') -and $z.Length -ne 11) {
            [void]$warnungen.Add("Telefonnummer '$(Get-Text $u 'Telefon')' von '$login' im AD ist unvollständig – nicht abgeglichen.")
            continue
        }
        if ($adNachNummer.ContainsKey($z)) {
            $bisher = $adNachNummer[$z]
            $bisherLogin = Get-Text $bisher 'Login'
            $gewinner = $bisher
            if ([string]::Compare($login, $bisherLogin, $true) -lt 0) { $gewinner = $u }
            [void]$warnungen.Add("Nummer $(Format-Telefon $z $Praefix) steht im AD bei '$bisherLogin' und '$login' – verwendet wird '$(Get-Text $gewinner 'Login')'.")
            $adNachNummer[$z] = $gewinner
            continue
        }
        $adNachNummer[$z] = $u
    }

    # --- 2) Zeilen abgleichen ------------------------------------------------
    $belegt = New-Object System.Collections.Generic.HashSet[string]
    foreach ($zeile in @($Zeilen)) {
        if ($null -eq $zeile) { continue }
        $id = [string](Get-Feld $zeile 'Id')
        $kurz = Get-Text $zeile 'Title'
        $voll = Get-Text $zeile 'Telefonnummer'
        $ziffern = ''
        if ($voll -ne '') { $ziffern = Get-TelefonZiffern $voll $Praefix }
        if ($ziffern -eq '' -and $kurz -ne '') { $ziffern = Get-TelefonZiffern $kurz $Praefix }
        if ($ziffern -eq '') {
            [void]$warnungen.Add("Zeile ID $id hat weder Kurzwahl noch Telefonnummer – übersprungen.")
            continue
        }
        if ($belegt.Contains($ziffern)) {
            [void]$warnungen.Add("Nummer $(Format-Telefon $ziffern $Praefix) steht mehrfach in der Liste (Zeile ID $id) – nur die erste Zeile wird abgeglichen.")
            continue
        }
        [void]$belegt.Add($ziffern)

        $alt = Get-Text $zeile 'Benutzer'
        $name = Get-Text $zeile 'Name'
        $typ = Get-Text $zeile 'Typ'
        $status = Get-TelefonStatusNorm (Get-Text $zeile 'Status')
        $delta = [ordered]@{}
        $texte = New-Object System.Collections.ArrayList

        if ($adNachNummer.ContainsKey($ziffern)) {
            $u = $adNachNummer[$ziffern]
            $login = Get-Text $u 'Login'
            if ((NormLogin $alt) -ne (NormLogin $login)) {
                $delta['Benutzer'] = $login
                if ($alt -ne '') { [void]$texte.Add("AD-Zuordnung geändert: $alt → $login") }
                else { [void]$texte.Add("Im AD bei $login hinterlegt") }
            }
            $anzeige = Get-Text $u 'Anzeigename'
            if ($name -eq '' -and $anzeige -ne '') {
                $delta['Name'] = $anzeige
                [void]$texte.Add("Name aus dem AD übernommen: $anzeige")
            }
            if ($typ -eq '') { $delta['Typ'] = 'Person' }
            if ($status -eq 'Frei') {
                $delta['Status'] = 'Aktiv'
                [void]$texte.Add("Nummer ist im AD bei $login vergeben – Status von Frei auf Aktiv gesetzt")
            }
            if ($voll -eq '') { $delta['Telefonnummer'] = Format-Telefon $ziffern $Praefix }
        } elseif ($alt -ne '' -and -not $NichtLeeren) {
            $delta['Benutzer'] = $null
            [void]$texte.Add("Nicht mehr im AD bei $alt hinterlegt")
        }

        if ($delta.Count -eq 0) { continue }
        [void]$updates.Add([pscustomobject]@{
                Zeile        = $zeile
                ZeileId      = $id
                Titel        = $kurz
                Felder       = $delta
                VerlaufTexte = @($texte.ToArray())
            })
    }

    # --- 3) AD-Nummern im Hausblock, die in der Liste fehlen ------------------
    foreach ($z in @($adNachNummer.Keys | Sort-Object)) {
        if ($belegt.Contains($z)) { continue }
        $kurz = Get-TelefonKurzwahl $z $Praefix
        if ($kurz -eq '') { continue }
        $u = $adNachNummer[$z]
        $login = Get-Text $u 'Login'
        [void]$neu.Add([pscustomobject]@{
                Felder  = [ordered]@{
                    Title         = $kurz
                    Telefonnummer = (Format-Telefon $z $Praefix)
                    Name          = (Get-Text $u 'Anzeigename')
                    Typ           = 'Person'
                    Status        = 'Aktiv'
                    Benutzer      = $login
                }
                Verlauf = "Aus dem AD neu angelegt ($login)"
            })
    }

    return [pscustomobject]@{
        Updates   = @($updates.ToArray())
        Neu       = @($neu.ToArray())
        Warnungen = @($warnungen.ToArray())
    }
}

# ---------------------------------------------------------------------------
# Abgleich Milestone-Hardware <-> Liste «Kameras» (rein, ohne Graph und Milestone)
# ---------------------------------------------------------------------------

function Get-KameraName {
    <# Name einer Hardware für die Liste: der Name ihres ersten Kanals, sonst der Hardware-Name. #>
    param($Geraet)
    $kanaele = @(@(Get-Feld $Geraet 'Kanaele') | Where-Object { $_ } | Sort-Object { [int](Get-Feld $_ 'Kanal') })
    foreach ($k in $kanaele) { $n = Get-Text $k 'Name'; if ($n -ne '') { return $n } }
    return (Get-Text $Geraet 'HardwareName')
}

function Get-KameraKanalText {
    <# Kanäle als Text, einer je Zeile: «1 | 10.300 Treppe Trakt 1 | Aktiv | Aufzeichnung ein». #>
    param($Kanaele)
    $zeilen = foreach ($k in @(@($Kanaele) | Where-Object { $_ } | Sort-Object { [int](Get-Feld $_ 'Kanal') })) {
        '{0} | {1} | {2} | {3}' -f ([int](Get-Feld $k 'Kanal') + 1), (Get-Text $k 'Name'),
            $(if ([bool](Get-Feld $k 'Aktiv')) { 'Aktiv' } else { 'Deaktiviert' }),
            $(if ([bool](Get-Feld $k 'Aufzeichnung')) { 'Aufzeichnung ein' } else { 'Aufzeichnung aus' })
    }
    return (@($zeilen) -join "`n")
}

function ConvertTo-KameraFelder {
    <#
      Hardware aus Milestone (Get-MilestoneGeraete) -> Felder MS_* der Liste «Kameras».
      «In Milestone aktiv» heisst: Hardware aktiviert und mindestens ein Kanal aktiviert;
      «Aufzeichnung»: mindestens ein aktiver Kanal zeichnet auf. Leere Texte werden $null
      (Graph leert damit das Feld).
    #>
    param($Geraet, $Zeitpunkt)
    if (-not $Zeitpunkt) { $Zeitpunkt = Get-Date }
    $kanaele = @(@(Get-Feld $Geraet 'Kanaele') | Where-Object { $_ })
    $aktiveKanaele = @($kanaele | Where-Object { [bool](Get-Feld $_ 'Aktiv') })
    $hwAktiv = [bool](Get-Feld $Geraet 'HardwareAktiv')
    $modell = Get-KameraModell (Get-Text $Geraet 'Modell')
    # Jüngste Änderung an Hardware oder Kanälen; Milestone liefert «0001-01-01» für «unbekannt».
    $geaendert = $null
    foreach ($w in @((Get-Text $Geraet 'Geaendert')) + @($kanaele | ForEach-Object { Get-Text $_ 'Geaendert' })) {
        if (-not $w -or $w -like '0001-*') { continue }
        $d = $null
        try { $d = [datetime]::Parse($w, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal) } catch { continue }
        if ($null -eq $geaendert -or $d -gt $geaendert) { $geaendert = $d }
    }
    $serie = ([string](Get-Text $Geraet 'Seriennummer')).Trim()
    $f = [ordered]@{
        MS_HardwareId      = (Get-Text $Geraet 'HardwareId')
        MS_Gefunden        = 'Ja'
        MS_HardwareName    = Trunc (Get-Text $Geraet 'HardwareName')
        MS_Adresse         = (Get-Text $Geraet 'Adresse')
        MS_Mac             = (NormMac (Get-Text $Geraet 'Mac'))
        MS_Seriennummer    = Trunc $serie
        MS_Hersteller      = $modell.Hersteller
        MS_Modell          = Trunc $modell.Modell
        MS_Firmware        = (Get-Text $Geraet 'Firmware')
        MS_Aktiv           = JaNein ($hwAktiv -and $aktiveKanaele.Count -gt 0)
        MS_Aufzeichnung    = JaNein ($hwAktiv -and @($aktiveKanaele | Where-Object { [bool](Get-Feld $_ 'Aufzeichnung') }).Count -gt 0)
        MS_KanalAnzahl     = $kanaele.Count
        MS_Kanaele         = (Get-KameraKanalText $kanaele)
        MS_RecordingServer = (Get-Text $Geraet 'RecordingServer')
        MS_Geaendert       = (ToIso $geaendert)
        MS_LetzterSync     = (ToIso $Zeitpunkt)
        MS_SyncStatus      = 'OK'
    }
    foreach ($k in @($f.Keys)) { if ($f[$k] -is [string] -and $f[$k].Trim() -eq '') { $f[$k] = $null } }
    return $f
}

function Get-KameraZuordnung {
    <#
      Ordnet die Hardware aus Milestone den Zeilen der Liste «Kameras» zu. Reine Funktion.

      $Geraete: Objekte aus Get-MilestoneGeraete (HardwareId, Mac, Seriennummer, Adresse, Kanaele …)
      $Zeilen : Objekte mit Id, Title, Status, Gebaeude, Raum, MS_HardwareId, MS_Mac,
                MS_Seriennummer, MS_Adresse

      Regeln:
       1. Schlüssel ist die Hardware-ID aus Milestone. Danach die MAC-Adresse, danach die
          Seriennummer – so bleibt eine Zeile bei ihrer Hardware, auch wenn die Kamera in
          Milestone entfernt und neu hinzugefügt wurde (neue ID).
       2. Zeilen ohne Hardware-ID (von Hand oder aus der Excel-Übernahme) werden zusätzlich über
          die IP-Adresse gefunden, solange sie nicht archiviert sind.
       3. Stehen mehrere Zeilen für dieselbe Hardware, gilt die erste nicht archivierte; die
          übrigen gelten als ohne Hardware (Dublette, wird archiviert).
       4. Hardware ohne Zeile wird neu angelegt (Status «Aktiv»).
       5. Eine Zeile, die schon einmal mit Milestone verknüpft war (Hardware-ID gesetzt) und
          deren Hardware fehlt, wird archiviert – ausser sie ist «Lager» (ausgebaut, liegt im
          Lager) oder schon archiviert. Zeilen, die nie verknüpft waren, bleiben unberührt.
          Gelöscht wird nie.
       6. Umbenennung in Milestone, Reaktivierung, neue IP-Adresse und ersetzte Hardware
          (gleiche ID, andere Seriennummer) kommen in den Verlauf; leere Felder «Gebäude» und
          «Raum» werden aus dem Namen gefüllt.
    #>
    param($Geraete, $Zeilen)
    $warnungen = New-Object System.Collections.ArrayList
    $zuordnungen = New-Object System.Collections.ArrayList
    $neu = New-Object System.Collections.ArrayList
    $archivieren = New-Object System.Collections.ArrayList

    $alle = @(@($Zeilen) | Where-Object { $null -ne $_ } | Sort-Object { Get-ZeilenSortierschluessel $_ })
    $zustand = @{}
    $nachId = @{}; $nachMac = @{}; $nachSerie = @{}; $nachIp = @{}
    foreach ($z in $alle) {
        $id = [string](Get-Feld $z 'Id')
        $st = Get-StatusNorm (Get-Text $z 'Status')
        $s = [pscustomobject]@{ Zeile = $z; Id = $id; Status = $st; HwId = (Get-Text $z 'MS_HardwareId') }
        $zustand[$id] = $s
        $schluesselListe = @(
            @($nachId, $s.HwId),
            @($nachMac, (NormMac (Get-Text $z 'MS_Mac'))),
            @($nachSerie, $(if (Test-Seriennummer (Get-Text $z 'MS_Seriennummer')) { NormSeriennummer (Get-Text $z 'MS_Seriennummer') } else { '' }))
        )
        foreach ($paar in $schluesselListe) {
            $index = $paar[0]; $k = [string]$paar[1]
            if ($k -eq '') { continue }
            if (-not $index.ContainsKey($k)) { $index[$k] = New-Object System.Collections.ArrayList }
            [void]$index[$k].Add($s)
        }
        $ip = Get-Text $z 'MS_Adresse'
        if ($s.HwId -eq '' -and $st -ne 'Archiviert' -and $ip -ne '') {
            if (-not $nachIp.ContainsKey($ip)) { $nachIp[$ip] = New-Object System.Collections.ArrayList }
            [void]$nachIp[$ip].Add($s)
        }
    }

    $belegt = New-Object System.Collections.Generic.HashSet[string]
    function Waehle($index, [string]$k) {
        if ($k -eq '' -or -not $index.ContainsKey($k)) { return $null }
        $frei = @($index[$k] | Where-Object { -not $belegt.Contains($_.Id) })
        if ($frei.Count -eq 0) { return $null }
        $bevorzugt = @($frei | Where-Object { $_.Status -ne 'Archiviert' })
        if ($bevorzugt.Count -gt 0) { return $bevorzugt[0] }
        return $frei[0]
    }

    foreach ($g in @(@($Geraete) | Where-Object { $_ } | Sort-Object { Get-Text $_ 'HardwareId' })) {
        $hwId = Get-Text $g 'HardwareId'
        $mac = NormMac (Get-Text $g 'Mac')
        $serie = $(if (Test-Seriennummer (Get-Text $g 'Seriennummer')) { NormSeriennummer (Get-Text $g 'Seriennummer') } else { '' })
        $ip = Get-Text $g 'Adresse'
        $s = $null; $grund = ''
        foreach ($versuch in @(@($nachId, $hwId, 'Hardware-ID'), @($nachMac, $mac, 'MAC-Adresse'), @($nachSerie, $serie, 'Seriennummer'), @($nachIp, $ip, 'IP-Adresse'))) {
            $s = Waehle $versuch[0] ([string]$versuch[1])
            if ($s) { $grund = $versuch[2]; break }
        }
        if (-not $s) {
            $name = Get-KameraName $g
            $ort = Get-KameraOrt $name
            [void]$neu.Add([pscustomobject]@{ Geraet = $g; Name = $name; Gebaeude = $ort.Gebaeude; Raum = $ort.Raum; Verlauf = 'Aus Milestone neu angelegt'; Status = 'Aktiv' })
            continue
        }
        [void]$belegt.Add($s.Id)
        [void]$zuordnungen.Add((New-KameraZuordnung $g $s $grund))
    }

    # Mehrfach verknüpfte Hardware-IDs melden (Regel 3).
    foreach ($k in @($nachId.Keys)) {
        if (@($nachId[$k]).Count -gt 1) {
            [void]$warnungen.Add("Hardware-ID $k steht in $(@($nachId[$k]).Count) Zeilen (IDs $((@($nachId[$k]) | ForEach-Object { $_.Id }) -join ', ')).")
        }
    }

    $hwImLauf = @{}
    foreach ($zu in $zuordnungen) { $hwImLauf[(Get-Text $zu.Geraet 'HardwareId')] = $zu.ZeileId }
    $aktiveZeilen = 0
    foreach ($s in @($zustand.Values | Sort-Object { Get-ZeilenSortierschluessel $_.Zeile })) {
        if ($s.HwId -eq '') { continue }
        if ($s.Status -ne 'Archiviert') { $aktiveZeilen++ }
        if ($belegt.Contains($s.Id) -or $s.Status -eq 'Archiviert' -or $s.Status -eq 'Lager') { continue }
        $text = 'In Milestone nicht mehr vorhanden, archiviert'
        if ($hwImLauf.ContainsKey($s.HwId)) { $text = "Doppelte Zeile: die Hardware steht in Zeile ID $($hwImLauf[$s.HwId]), archiviert" }
        [void]$archivieren.Add([pscustomobject]@{ Zeile = $s.Zeile; ZeileId = $s.Id; Titel = (Get-Text $s.Zeile 'Title'); Verlauf = $text })
    }

    return [pscustomobject]@{
        Zuordnungen  = @($zuordnungen.ToArray())
        Neu          = @($neu.ToArray())
        Archivieren  = @($archivieren.ToArray())
        AktiveZeilen = $aktiveZeilen
        Warnungen    = @($warnungen.ToArray())
    }
}

function New-KameraZuordnung {
    <# Zuordnungseintrag einer Hardware zu einer Zeile: Name, Status, leere Ortsfelder, Verlaufstexte (Regel 6). #>
    param($Geraet, $Zustand, [string]$Grund)
    $z = $Zustand.Zeile
    $verlauf = New-Object System.Collections.ArrayList
    $felder = [ordered]@{}

    $alterName = Get-Text $z 'Title'
    $name = Get-KameraName $Geraet
    if ($name -ne '' -and $alterName -cne $name) {
        $felder['Title'] = $name
        if ($alterName -ne '') { [void]$verlauf.Add("Umbenannt in Milestone: $alterName → $name") }
    }
    if ($Grund -ne 'Hardware-ID') {
        [void]$verlauf.Add("Mit Milestone verknüpft (über $Grund)")
    }
    if ($Zustand.Status -eq 'Archiviert') {
        $felder['Status'] = 'Aktiv'
        [void]$verlauf.Add('Wieder in Milestone vorhanden, reaktiviert')
    } elseif ($Zustand.Status -eq '') {
        $felder['Status'] = 'Aktiv'
    }
    $altIp = Get-Text $z 'MS_Adresse'
    $ip = Get-Text $Geraet 'Adresse'
    if ($altIp -ne '' -and $ip -ne '' -and $altIp -ne $ip) { [void]$verlauf.Add("IP-Adresse geändert: $altIp → $ip") }
    $altSerie = NormSeriennummer (Get-Text $z 'MS_Seriennummer')
    $serie = NormSeriennummer (Get-Text $Geraet 'Seriennummer')
    if ($Grund -eq 'Hardware-ID' -and $altSerie -ne '' -and $serie -ne '' -and $altSerie -ne $serie) {
        [void]$verlauf.Add("Hardware in Milestone ersetzt: Seriennummer $altSerie → $serie")
    }
    $ort = Get-KameraOrt $name
    if ((Get-Text $z 'Gebaeude') -eq '' -and $ort.Gebaeude -ne '') { $felder['Gebaeude'] = $ort.Gebaeude }
    if ((Get-Text $z 'Raum') -eq '' -and $ort.Raum -ne '') { $felder['Raum'] = $ort.Raum }

    return [pscustomobject]@{
        Geraet       = $Geraet
        Zeile        = $z
        ZeileId      = $Zustand.Id
        Grund        = $Grund
        Titel        = $(if ($alterName) { $alterName } else { $name })
        StatusAlt    = $Zustand.Status
        Felder       = $felder
        VerlaufTexte = @($verlauf.ToArray())
    }
}

# ---------------------------------------------------------------------------
# Milestone-Rollen und Kamerarechte (rein)
# ---------------------------------------------------------------------------

function ConvertTo-RollenMitglied {
    <#
      Ein Mitglied einer Milestone-Rolle (roles/<id>/users) -> Art, Name, Konto.
        Art   'AD-Gruppe' | 'AD-Benutzer' | 'Basisbenutzer'
        Name  wie Milestone es zeigt (SASADMIN\Hot_NachtD)
        Konto sAMAccountName ohne Domäne (Hot_NachtD); bei Basisbenutzern leer
      Milestone nennt die Art je nach Version identityType, memberType oder userType.
    #>
    param($Mitglied)
    $name = ''
    foreach ($f in 'accountName', 'name', 'displayName') { $name = Get-Text $Mitglied $f; if ($name) { break } }
    $domaene = Get-Text $Mitglied 'domain'
    if ($domaene -and $name -and $name -notmatch '\\') { $name = "$domaene\$name" }
    $artRoh = ((@('identityType', 'memberType', 'userType', 'type') | ForEach-Object { Get-Text $Mitglied $_ }) -join ' ').ToLowerInvariant()
    $art = 'AD-Benutzer'
    if ($artRoh -match 'group|gruppe') { $art = 'AD-Gruppe' }
    elseif ($artRoh -match 'basic') { $art = 'Basisbenutzer' }
    # Lokale und eingebaute Konten des Milestone-Servers (NT AUTHORITY\NETWORK SERVICE,
    # BUILTIN\Administrators) gibt es im AD nicht – sie werden nicht aufgelöst.
    $kurz = $(if ($name -match '\\') { $name.Substring($name.LastIndexOf('\') + 1) } else { $name })
    if ($name -match '^(?i)(NT AUTHORITY|NT-AUTORIT\S*|BUILTIN|VORDEFINIERT)\\' -or
        $kurz -match '^(?i)(NETWORK SERVICE|NETZWERKDIENST|LOCAL SERVICE|LOKALER DIENST|SYSTEM|Everyone|Jeder)$') { $art = 'Systemkonto' }
    $konto = ''
    if ($art -ne 'Basisbenutzer' -and $art -ne 'Systemkonto') { $konto = $(if ($name -match '\\') { $name.Substring($name.LastIndexOf('\') + 1) } else { $name }) }
    return [pscustomobject]@{ Art = $art; Name = $name; Konto = $konto }
}

function Get-ListenAenderung {
    <# Vergleicht zwei Textlisten (ohne Gross-/Kleinschreibung): was dazugekommen und was weggefallen ist. #>
    param([string[]]$Alt, [string[]]$Neu)
    $a = @(@($Alt) | Where-Object { $_ } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $n = @(@($Neu) | Where-Object { $_ } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $dazu = @($n | Where-Object { $x = $_; -not ($a | Where-Object { $_ -ieq $x }) } | Sort-Object -Unique)
    $weg = @($a | Where-Object { $x = $_; -not ($n | Where-Object { $_ -ieq $x }) } | Sort-Object -Unique)
    return [pscustomobject]@{ Dazu = $dazu; Weg = $weg }
}

function Format-Aufzaehlung {
    <# «a, b, c» – nach $Max Namen «und n weitere». #>
    param([string[]]$Namen, [int]$Max = 8)
    $l = @($Namen)
    if ($l.Count -le $Max) { return ($l -join ', ') }
    return (($l | Select-Object -First $Max) -join ', ') + " und $($l.Count - $Max) weitere"
}

function ConvertFrom-RollenKameras {
    <# Spalte MS_Kameras (JSON Hardware-ID -> Rechte) -> Hashtable; leer oder unlesbar -> leer. #>
    param([string]$Text)
    $h = @{}
    $t = ([string]$Text).Trim()
    if ($t -eq '') { return $h }
    try { $o = ConvertFrom-Json $t } catch { return $h }
    if ($null -eq $o) { return $h }
    foreach ($p in $o.PSObject.Properties) { $h[[string]$p.Name] = @(@($p.Value) | Where-Object { $_ } | ForEach-Object { [string]$_ }) }
    return $h
}

function ConvertTo-RollenKameras {
    <# Hashtable Hardware-ID -> Rechte -> kompaktes JSON, nach ID sortiert (stabil, damit nur echte Änderungen schreiben). #>
    param($Tabelle)
    $teile = foreach ($k in @(@($Tabelle.Keys) | Sort-Object)) {
        $rechte = @(@($Tabelle[$k]) | Where-Object { $_ })
        (ConvertTo-Json -InputObject ([string]$k) -Compress) + ':[' + ((@($rechte | ForEach-Object { ConvertTo-Json -InputObject ([string]$_) -Compress })) -join ',') + ']'
    }
    return '{' + (@($teile) -join ',') + '}'
}

function Get-RollenVerlauf {
    <#
      Verlaufstexte einer Rollenzeile aus altem und neuem Stand: Mitglieder und Kameras, die
      dazugekommen oder weggefallen sind, und Kameras mit geänderten Rechten. $Namen: Hardware-ID ->
      Kameraname (für lesbare Texte).
    #>
    param([string]$MitgliederAlt, [string]$MitgliederNeu, [string]$KamerasAlt, [string]$KamerasNeu, $Namen)
    $texte = New-Object System.Collections.ArrayList
    $m = Get-ListenAenderung ($MitgliederAlt -split "`r?`n") ($MitgliederNeu -split "`r?`n")
    if ($m.Dazu.Count) { [void]$texte.Add("Mitglied hinzugefügt: $(Format-Aufzaehlung $m.Dazu)") }
    if ($m.Weg.Count) { [void]$texte.Add("Mitglied entfernt: $(Format-Aufzaehlung $m.Weg)") }
    $alt = ConvertFrom-RollenKameras $KamerasAlt
    $neu = ConvertFrom-RollenKameras $KamerasNeu
    # Leere Spalte = Rechte wurden noch nie gelesen ('{}' = gelesen, keine Kamera): der erste Abgleich
    # ist keine Änderung und erscheint nicht als «Zugriff erhalten».
    if (([string]$KamerasAlt).Trim() -eq '' -and ([string]$KamerasNeu).Trim() -ne '') {
        [void]$texte.Add("Rechte erstmals aus Milestone gelesen: Zugriff auf $($neu.Count) Kamera$(if ($neu.Count -ne 1) { 's' })")
        return @($texte.ToArray())
    }
    $name = { param($id) if ($Namen -and $Namen.ContainsKey($id)) { $Namen[$id] } else { $id } }
    $dazu = @($neu.Keys | Where-Object { -not $alt.ContainsKey($_) } | ForEach-Object { & $name $_ } | Sort-Object)
    $weg = @($alt.Keys | Where-Object { -not $neu.ContainsKey($_) } | ForEach-Object { & $name $_ } | Sort-Object)
    $anders = @($neu.Keys | Where-Object { $alt.ContainsKey($_) -and ((@($alt[$_]) -join ',') -ne (@($neu[$_]) -join ',')) } | ForEach-Object { & $name $_ } | Sort-Object)
    if ($dazu.Count) { [void]$texte.Add("Zugriff auf $($dazu.Count) Kamera$(if ($dazu.Count -ne 1) { 's' }) erhalten: $(Format-Aufzaehlung $dazu)") }
    if ($weg.Count) { [void]$texte.Add("Zugriff auf $($weg.Count) Kamera$(if ($weg.Count -ne 1) { 's' }) verloren: $(Format-Aufzaehlung $weg)") }
    if ($anders.Count) { [void]$texte.Add("Rechte geändert bei $(Format-Aufzaehlung $anders)") }
    return @($texte.ToArray())
}

function Get-KameraRollenText {
    <# Spalte MS_Rollen einer Kamera: eine Rolle je Zeile, «Rolle: Live, Wiedergabe», nach Rolle sortiert. #>
    param($Eintraege)
    $zeilen = foreach ($e in @(@($Eintraege) | Where-Object { $_ } | Sort-Object { Get-Text $_ 'Rolle' })) {
        '{0}: {1}' -f (Get-Text $e 'Rolle'), ((@(Get-Feld $e 'Rechte') | Where-Object { $_ }) -join ', ')
    }
    return (@($zeilen) -join "`n")
}

function Test-RollenAbgleichFaellig {
    <# Ist der Abgleich der Rechte fällig? Ja ohne früheren Lauf, sonst nach Ablauf von $Stunden. #>
    param($LetzterLauf, [double]$Stunden = 6, [datetime]$Jetzt = (Get-Date))
    if ($Stunden -le 0) { return $true }
    $d = ConvertTo-Zeitpunkt $LetzterLauf
    if ($d -eq [datetime]::MinValue) { return $true }
    return (($Jetzt.ToUniversalTime() - $d.ToUniversalTime()).TotalHours -ge $Stunden)
}

function Get-SyncStatusKurztext {
    <#
      Einzeiliger Zustand des Laufs für das Frontend (Titel der Datei Inventar/sync-status.json,
      höchstens 255 Zeichen): «OK», «OK, 3 Warnungen» oder «2 Fehler: <erste Meldung>».
      Das Frontend zeigt bei «Fehler» einen Hinweis in der Übersicht.
    #>
    param([int]$Fehler, [int]$Warnungen, [string[]]$Meldungen)
    if ($Fehler -le 0) {
        if ($Warnungen -le 0) { return 'OK' }
        return "OK, $Warnungen Warnung$(if ($Warnungen -ne 1) { 'en' })"
    }
    $t = "$Fehler Fehler"
    $erste = @(@($Meldungen) | Where-Object { $_ })[0]
    if ($erste) { $t += ': ' + (([string]$erste) -replace '\s+', ' ').Trim() }
    if ($t.Length -gt 255) { $t = $t.Substring(0, 254) + '…' }
    return $t
}

if ($InventarNurFunktionen) { return }

# ===========================================================================
# Hauptteil
# ===========================================================================
# Robustheit des Hauptteils:
#  - Jede Phase (SCCM lesen, ADMIN-Clients, EDU-Clients, Benutzer, Telefonnummern) läuft in
#    einem eigenen try/catch. Scheitert eine, laufen die übrigen trotzdem; der Fehler steht im Log.
#  - Ein zweiter Lauf, während der erste noch arbeitet, beendet sich sofort (Sperre).
#  - Am Ende steht der Zustand des Laufs in Sync-Inventar.status.json neben dem Log und – für die
#    Übersicht im Frontend – als Inventar/sync-status.json in der Dokumentbibliothek der Site.
$SyncVersion = '2026-10-13.2'
if (-not $ConfigPath) { $ConfigPath = Join-Path $ScriptDir 'Sync-Inventar.config.json' }
$LogVorgabe = $LogPath
if (-not $LogPath) { $LogPath = Join-Path $ScriptDir 'Sync-Inventar.log' }
try {
    $cfg = Read-JsonDatei $ConfigPath
} catch {
    Set-InventarLog $LogPath
    Log "Konfiguration $ConfigPath ist nicht lesbar – Abbruch: $_" 'ERROR'
    exit 1
}
if ($cfg.LogPath -and -not $LogVorgabe) { $LogPath = [string]$cfg.LogPath }
Set-InventarLog $LogPath
Set-GraphTokenProvider { Get-GraphTokenZertifikat $cfg }

$fehler = 0
$now = Get-Date
$script:PhasenStatus = [ordered]@{}

$LoeschSchutzProzent = 50
if ($null -ne $cfg.LoeschSchutzProzent) { $LoeschSchutzProzent = [double]$cfg.LoeschSchutzProzent }
$InventarWartezeitTage = 7
if ($null -ne $cfg.InventarWartezeitTage) { $InventarWartezeitTage = [int]$cfg.InventarWartezeitTage }

# Sperre gegen überlappende Läufe. -WhatIf und -DumpOnly schreiben nichts und dürfen parallel laufen.
$script:Sperre = $null
if (-not $WhatIf -and -not $DumpOnly) {
    $frei = $true
    try {
        $script:Sperre = New-Object System.Threading.Mutex($false, 'Global\ComputerInventar-Sync')
        try { $frei = $script:Sperre.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $frei = $true }
    } catch { $frei = $true }
    if (-not $frei) {
        Log 'Ein anderer Sync-Lauf ist noch aktiv – dieser Lauf entfällt.' 'WARN'
        exit 0
    }
}

$SiteId = $null
function Write-SyncStatus {
    <#
      Hält den Zustand eines vollständigen Laufs fest (Teilläufe mit -Only…, -WhatIf usw. nicht):
        - Sync-Inventar.status.json neben dem Log (zum Nachsehen auf dem Server),
        - Inventar/sync-status.json in der Dokumentbibliothek der Site; der Titel der Datei trägt
          den Kurztext (Get-SyncStatusKurztext). Das Frontend liest Titel und Änderungszeit über
          Graph und meldet in der Übersicht, wenn der letzte Lauf Fehler hatte oder zu lange her ist.
      Scheitert das Hochladen, steht eine Warnung im Log – der Lauf selbst gilt deswegen nicht als
      fehlgeschlagen.
    #>
    $teil = [bool]($WhatIf -or $DumpOnly -or $OnlyDevices -or $OnlyClients -or $OnlyBenutzer -or $OnlyTelefone -or $OnlyKameras -or $IncludeServers -or $ClientListen -ne 'Alle')
    if ($teil) { return }
    $ende = Get-Date
    $z = Get-LogZaehler
    $kurz = Get-SyncStatusKurztext -Fehler $script:fehler -Warnungen $z.Warnungen -Meldungen $z.FehlerTexte
    $status = [ordered]@{
        version       = $SyncVersion
        rechner       = $env:COMPUTERNAME
        start         = (ToIso $now)
        ende          = (ToIso $ende)
        dauerSekunden = [int]($ende - $now).TotalSeconds
        fehler        = [int]$script:fehler
        warnungen     = [int]$z.Warnungen
        kurztext      = $kurz
        phasen        = $script:PhasenStatus
        meldungen     = @($z.FehlerTexte)
    }
    try { Write-JsonDatei $status (Join-Path (Split-Path -Parent $LogPath) 'Sync-Inventar.status.json') } catch { Log "Statusdatei konnte nicht geschrieben werden: $_" 'WARN' }
    if (-not $SiteId) { return }
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($status | ConvertTo-Json -Depth 6))
        $datei = Invoke-Graph -Method PUT -Uri "/sites/$SiteId/drive/root:/Inventar/sync-status.json:/content" -Body $bytes -ContentType 'application/json'
        Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/drive/items/$($datei.id)/listItem/fields" -Body @{ Title = $kurz } | Out-Null
    } catch {
        Log "Sync-Status konnte nicht nach SharePoint geschrieben werden (die Übersicht im Frontend zeigt dann keinen Zustand): $_" 'WARN'
    }
}

# Fangnetz: Was trotz der try/catch-Blöcke je Phase durchschlägt, landet im Log und im Status,
# statt den Lauf stumm zu beenden.
trap {
    Log "Unerwarteter Abbruch: $_ $($_.InvocationInfo.PositionMessage)" 'ERROR'
    $script:fehler++
    try { Write-SyncStatus } catch { }
    exit 1
}

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

Log "==== Sync-Start (Version $SyncVersion, Provider $srv, Site $($cfg.SiteCode)) ===="
$nurBenutzer = [bool]$OnlyBenutzer -and -not $OnlyClients
# Nur die Telefon-Phase: braucht das AD, aber kein SCCM.
$nurTelefone = [bool]$OnlyTelefone -and -not $OnlyClients -and -not $OnlyBenutzer
# Nur die Kamera-Phasen: Milestone (und für die Rollen das AD), kein SCCM.
$nurKameras = [bool]$OnlyKameras -and -not $OnlyClients -and -not $OnlyBenutzer -and -not $OnlyTelefone
$mitKameras = $nurKameras -or -not ($OnlyClients -or $OnlyBenutzer -or $OnlyTelefone)

# Rechtzeitig vor dem Ablauf des Anmeldezertifikats warnen (README Abschnitt 7.1).
try {
    $hinweis = Get-ZertifikatHinweis -GueltigBis (Get-SyncZertifikat $cfg).NotAfter -Heute $now
    if ($hinweis) { Log $hinweis 'WARN' }
} catch { }

$systems = @()
$primary = @{}
$sccmOk = $false
if (-not $nurTelefone -and -not $nurKameras) {
  try {
    # Ein frisch aufgesetztes Gerät steht in SCCM zuerst ohne Betriebssystem da (manueller Eintrag
    # der Betriebssystembereitstellung). «not like '%Server%'» allein liesse es weg (NULL ist nicht
    # «nicht wie»), und der Sync hielte es für verschwunden – darum ausdrücklich «is null».
    $osFilter = ''
    if (-not $IncludeServers) { $osFilter = " and (OperatingSystemNameandVersion is null or OperatingSystemNameandVersion not like '%Server%')" }
    $systems = @(Q "select ResourceId,Name,Client,Active,Obsolete,Decommissioned,ClientVersion,ResourceDomainORWorkgroup,DistinguishedName,CreationDate,LastLogonTimestamp,LastLogonUserName,LastLogonUserDomain,IPAddresses,MACAddresses,ADSiteName,IsVirtualMachine,SMBIOSGUID,BuildExt,OperatingSystemNameandVersion,SMSUniqueIdentifier,AADDeviceID from SMS_R_System where Obsolete=0$osFilter" |
        Where-Object { $_.Name -and $_.Name -notmatch 'Unknown Computer' })
    if ($OnlyDevices) { $systems = @($systems | Where-Object { $OnlyDevices -contains $_.Name }) }
    Log "SCCM: $($systems.Count) Geräte"
    $idList = ($systems | ForEach-Object { $_.ResourceId }) -join ','
    if (-not $idList) { throw 'SCCM hat kein einziges Gerät geliefert.' }

    $primary = Group-ById (Q "select ResourceID,UniqueUserName,Types from SMS_UserMachineRelationship where IsActive=1")
    $sccmOk = $true
  } catch {
    Log "SCCM konnte nicht gelesen werden – die Client-Phasen entfallen, die Benutzer-Phase lässt das Primärgerät unverändert: $_" 'ERROR'
    $fehler++
    $script:PhasenStatus['SCCM'] = 'Fehler'
  }
}

if ($sccmOk -and -not $nurBenutzer) {
  try {
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
    $script:PhasenStatus['SCCM'] = 'OK'
  } catch {
    Log "SCCM-Inventar konnte nicht gelesen werden – die Client-Phasen entfallen: $_" 'ERROR'
    $fehler++
    $sccmOk = $false
    $script:PhasenStatus['SCCM'] = 'Fehler'
  }
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
    try {
        $u = [uri]$cfg.SiteUrl
        $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
    } catch {
        # Ohne Site (Anmeldung gescheitert, Graph nicht erreichbar) ist keine Phase möglich.
        Log "Anmeldung an Microsoft Graph bzw. Zugriff auf die Site gescheitert – Lauf abgebrochen: $_" 'ERROR'
        $fehler++
        $script:PhasenStatus['Graph'] = 'Fehler'
        Write-SyncStatus
        exit 1
    }
}
function Get-ListId([string]$Wert) {
    # Platzhalter aus der Vorlage («<...>») gelten als «nicht konfiguriert».
    $t = ([string]$Wert).Trim()
    if ($t -match '^<') { return '' }
    return $t
}
$AdminClientListId = Get-ListId $cfg.AdminClientListId
$EduClientListId = Get-ListId $cfg.EduClientListId
$BenutzerListId = Get-ListId $cfg.BenutzerListId
$TelefonListId = Get-ListId $cfg.TelefonListId
$SoftwareListId = Get-ListId $cfg.SoftwareListId
$KameraListId = Get-ListId $cfg.KameraListId
$KameraRolleListId = Get-ListId $cfg.KameraRolleListId

# ---------------------------------------------------------------------------
# Vorhandene Spalten feststellen (nur lesen)
# ---------------------------------------------------------------------------
function Get-ListenSpalten {
    <#
      Liest die Spalten einer Liste und meldet, welche der erwarteten fehlen.

      Der Sync ändert die Struktur der Listen NICHT: er legt keine Spalten an, benennt keine um
      und löscht keine. Er füllt nur Daten. Fehlende Spalten legt Ergaenze-Spalten.ps1 an oder
      ein Mensch in den Listeneinstellungen.

      Rückgabe: Hashtable der vorhandenen Spalten, unter internem Namen und Anzeigenamen.
      Der Aufrufer schreibt nur Felder, die darin stehen; sonst weist Graph den ganzen PATCH mit
      «Field … is not recognized» zurück und eine fehlende Spalte kostet alle Zeilen.
    #>
    param([string]$ListId, [string]$Bezeichnung, [string[]]$Erwartet)
    $vorhanden = @{}
    try {
        foreach ($c in (Invoke-Graph -Uri "/sites/$SiteId/lists/$ListId/columns?`$select=id,name,displayName").value) {
            if ($c.name) { $vorhanden[[string]$c.name] = $c }
            if ($c.displayName) { $vorhanden[[string]$c.displayName] = $c }
        }
    } catch {
        Log "Spalten der Liste $ListId ($Bezeichnung) konnten nicht gelesen werden: $_" 'ERROR'
        $script:fehler++
        return $vorhanden
    }
    $fehlend = @($Erwartet | Where-Object { $_ -and -not $vorhanden.ContainsKey([string]$_) })
    if ($fehlend.Count -gt 0) {
        Log "$Bezeichnung`: $($fehlend.Count) Spalte(n) fehlen und werden nicht geschrieben: $($fehlend -join ', '). Anlegen mit Ergaenze-Spalten.ps1 oder von Hand in den Listeneinstellungen." 'WARN'
    }
    return $vorhanden
}

# ===========================================================================
# Phase 1: Clients (ADMIN-Clients und EDU-Clients)
# ===========================================================================
# Beide Listen haben dieselben Spalten und werden gleich behandelt; sie unterscheiden sich
# einzig darin, welche SCCM-Geräte hineingehören (Get-ClientListe: Name beginnt mit EDU?).
# Deshalb steht der ganze Ablauf einmal hier und wird zweimal aufgerufen.
function Invoke-ClientPhase {
    param(
        [string]$Liste,            # 'admin' | 'edu'
        [string]$ListId,
        $SccmGeraete               # nur die Geräte, die in DIESE Liste gehören
    )
    $titel = Get-ClientListenTitel $Liste
    $itemsBase = "/sites/$SiteId/lists/$ListId/items"

    # Nur Spalten abfragen und schreiben, die es wirklich gibt.
    $cSpalten = Get-ListenSpalten $ListId "Liste «$titel»" @('Status', 'Verlauf', 'InDomaene')
    $hatStatus = $cSpalten.ContainsKey('Status')
    $hatVerlauf = $cSpalten.ContainsKey('Verlauf')
    $hatDomaene = $cSpalten.ContainsKey('InDomaene')
    if (-not $hatStatus) { Log "$titel`: Ohne Spalte «Status» werden Archivierung und Reaktivierung nicht festgehalten." 'WARN' }
    if (-not $hatVerlauf) { Log "$titel`: Ohne Spalte «Verlauf» werden keine Verlaufseinträge geschrieben." 'WARN' }
    if (-not $hatDomaene) { Log "$titel`: Ohne Spalte «InDomaene» gelten alle Zeilen als in der Domäne." 'WARN' }
    $zusatz = @('Title')
    if ($hatStatus) { $zusatz += 'Status' }
    if ($hatVerlauf) { $zusatz += 'Verlauf' }
    if ($hatDomaene) { $zusatz += 'InDomaene' }
    $sccmFieldNames = (Build-SccmFields $systems[0]).Keys
    $select = ($zusatz -join ',') + ',' + ($sccmFieldNames -join ',')
    $items = Get-GraphAlle "$itemsBase`?`$expand=fields(`$select=$select)&`$top=500"
    Log "$titel`: $($items.Count) Zeilen, $(@($SccmGeraete).Count) SCCM-Geräte"

    # SCCM-Geräte auf die Felder herunterbrechen, die die Zuordnung braucht.
    $geraete = New-Object System.Collections.ArrayList
    foreach ($sys in $SccmGeraete) {
        $rid = [string]$sys.ResourceId
        $c = First $combined $rid; $b = First $bios $rid
        $serial = $null
        if ($c -and $c.SerialNumber) { $serial = $c.SerialNumber } elseif ($b) { $serial = $b.SerialNumber }
        $akt = [datetime]::MinValue
        $rohZeiten = @()
        if ($c) { $rohZeiten = @($c.LastActiveTime, $c.LastHardwareScan, $c.LastDDR, $c.LastPolicyRequest) }
        $rohZeiten += @($sys.LastLogonTimestamp)
        foreach ($w in $rohZeiten) {
            $d = ConvertFrom-WmiDate $w
            if ($d -and $d -gt $akt) { $akt = $d }
        }
        # Neu aufgesetzt und noch nicht inventarisiert: weder Seriennummer noch Hardware-Scan.
        $ohneHwScan = -not ($c -and (ConvertFrom-WmiDate $c.LastHardwareScan))
        [void]$geraete.Add([pscustomobject]@{
                ResourceId         = $rid
                Name               = [string]$sys.Name
                Seriennummer       = [string]$serial
                Aktivitaet         = $akt
                InventarAusstehend = ($ohneHwScan -and -not (Test-Seriennummer ([string]$serial)))
                Erstellt           = (ConvertFrom-WmiDate $sys.CreationDate)
                Sys                = $sys
            })
    }

    # Listenzeilen auf die Felder herunterbrechen, die die Zuordnung braucht.
    $zeilen = New-Object System.Collections.ArrayList
    foreach ($it in $items) {
        [void]$zeilen.Add([pscustomobject]@{
                Id                = [string]$it.id
                Title             = [string]$it.fields.Title
                Seriennummer      = [string]$it.fields.Seriennummer
                SCCM_SerialNumber = [string]$it.fields.SCCM_SerialNumber
                SCCM_ResourceID   = [string]$it.fields.SCCM_ResourceID
                Status            = [string]$it.fields.Status
                Verlauf           = [string]$it.fields.Verlauf
                InDomaene         = $it.fields.InDomaene
                Item              = $it
            })
    }

    $plan = Get-ClientZuordnung $geraete $zeilen -Heute $now -WartezeitTage $InventarWartezeitTage
    foreach ($w in $plan.Warnungen) { Log "$titel`: $w" 'WARN' }
    if ($plan.Ausserhalb -gt 0) {
        Log "$titel`: $($plan.Ausserhalb) Zeile(n) mit «In Domäne = Nein» – vom Abgleich ausgenommen (kein SCCM-Gerät, keine Archivierung)."
    }
    foreach ($w in $plan.Wartend) {
        if ($w.Grund -eq 'festgehalten') {
            Log "$titel`: $($w.Name) (ResourceID $($w.Geraet.ResourceId)) ist neu aufgesetzt und hat noch kein Hardware-Inventar – Zeile ID $($w.ZeileId) bleibt unverändert, bis SCCM die Seriennummer kennt."
        } else {
            Log "$titel`: $($w.Name) (ResourceID $($w.Geraet.ResourceId)) hat noch kein Hardware-Inventar; eine archivierte Zeile gleichen Namens hat eine Seriennummer – angelegt wird erst, wenn SCCM die Seriennummer kennt (spätestens nach $InventarWartezeitTage Tagen)."
        }
    }

    $stats = @{ updated = 0; created = 0; unchanged = 0; archiviert = 0; reaktiviert = 0; umbenannt = 0; uebersprungen = 0 }

    # --- Zugeordnete Zeilen ---------------------------------------------------
    foreach ($zu in $plan.Zuordnungen) {
        $it = $zu.Zeile.Item
        try { $fields = Build-SccmFields $zu.Geraet.Sys } catch { Log "Fehler beim Aufbereiten von $($zu.Geraet.Name): $_" 'ERROR'; $script:fehler++; continue }

        $delta = [ordered]@{}
        foreach ($k in $fields.Keys) {
            if ($k -eq 'SCCM_LastSync') { continue }
            if ((Norm $fields[$k]) -ne (Norm $it.fields.$k)) { $delta[$k] = $fields[$k] }
        }
        # Title ist eine manuelle Spalte: Der Sync schreibt sie einzig bei einer Umbenennung in SCCM.
        if ($zu.Umbenennen) { $delta['Title'] = $zu.NeuerTitel }
        if ($hatStatus -and $zu.StatusNeu -ne '' -and $zu.StatusNeu -ne $zu.StatusAlt) { $delta['Status'] = $zu.StatusNeu }
        if ($hatVerlauf -and $zu.VerlaufTexte.Count -gt 0) {
            try {
                $delta['Verlauf'] = Add-VerlaufEintraege -Verlauf ([string]$it.fields.Verlauf) -Texte $zu.VerlaufTexte -Datum $now -Quelle 'sync' -Zeitpunkt $now
            } catch {
                Log "Verlauf von '$($zu.AlterTitel)' (ID $($zu.ZeileId)) ist unbrauchbar – Zeile übersprungen, damit nichts verloren geht: $_" 'ERROR'
                $script:fehler++; $stats.uebersprungen++; continue
            }
        }
        if ($delta.Count -eq 0) { $stats.unchanged++; continue }
        if ($zu.Umbenennen) { $stats.umbenannt++ }
        if ($zu.StatusAlt -eq 'Archiviert') { $stats.reaktiviert++ }
        $delta['SCCM_LastSync'] = $fields['SCCM_LastSync']
        if ($WhatIf) { Log "WHATIF Update $($zu.AlterTitel) (ID $($zu.ZeileId), Treffer über $($zu.Grund)): $($delta.Keys -join ', ')"; $stats.updated++; continue }
        try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($zu.ZeileId)/fields" -Body $delta | Out-Null; $stats.updated++; Log "Update $($zu.AlterTitel) (ID $($zu.ZeileId)): $($delta.Count) Felder" }
        catch { Log "Update-Fehler $($zu.AlterTitel): $_" 'ERROR'; $script:fehler++ }
    }

    # --- Neue Geräte ----------------------------------------------------------
    foreach ($n in $plan.Neu) {
        try { $fields = Build-SccmFields $n.Geraet.Sys } catch { Log "Fehler beim Aufbereiten von $($n.Name): $_" 'ERROR'; $script:fehler++; continue }
        $new = [ordered]@{ Title = ([string]$n.Name).ToUpperInvariant() }
        if ($hatStatus) { $new['Status'] = $n.Status }
        foreach ($k in $fields.Keys) { if ($null -ne $fields[$k]) { $new[$k] = $fields[$k] } }
        if ($hatVerlauf) { $new['Verlauf'] = Add-VerlaufEintrag -Verlauf '' -Text $n.Verlauf -Datum $now -Quelle 'sync' -Zeitpunkt $now }
        if ($WhatIf) { Log "WHATIF Neu in $titel`: $($n.Name)"; $stats.created++; continue }
        try { $r = Invoke-Graph -Method POST -Uri $itemsBase -Body @{ fields = $new }; $stats.created++; Log "Neu angelegt in $titel`: $($n.Name) (ID $($r.id))" }
        catch { Log "Anlage-Fehler $($n.Name): $_" 'ERROR'; $script:fehler++ }
    }

    # --- Zeilen ohne SCCM-Gerät: archivieren, nie löschen ---------------------
    # Die Client-Phasen kennen bewusst KEINEN Löschpfad (kein Invoke-Graph -Method DELETE).
    # Ein PC verschwindet nie aus der Liste, er wird höchstens auf Status «Archiviert» gesetzt.
    if (-not $OnlyDevices) {
        $schutz = Test-ArchivSchutz (@($SccmGeraete).Count) $plan.AktiveZeilen $plan.Archivieren.Count $LoeschSchutzProzent
        if (-not $schutz.Erlaubt) {
            Log "$titel`: Archivschutz greift: $($schutz.Grund)" 'ERROR'
            $script:fehler++
        } else {
            foreach ($a in $plan.Archivieren) {
                $it = $a.Zeile.Item
                $body = [ordered]@{
                    SCCM_Found      = 'Nein'
                    SCCM_SyncStatus = "Kein SCCM-Gerät zu '$($a.Titel)'"
                    SCCM_LastSync   = (ToIso $now)
                }
                if ($hatStatus) { $body['Status'] = 'Archiviert' }
                if ($hatVerlauf) {
                    try { $body['Verlauf'] = Add-VerlaufEintrag -Verlauf ([string]$it.fields.Verlauf) -Text $a.Verlauf -Datum $now -Quelle 'sync' -Zeitpunkt $now }
                    catch {
                        Log "Verlauf von '$($a.Titel)' (ID $($a.ZeileId)) ist unbrauchbar – Zeile übersprungen: $_" 'ERROR'
                        $script:fehler++; $stats.uebersprungen++; continue
                    }
                }
                if ($WhatIf) { Log "WHATIF Archivieren $($a.Titel) (ID $($a.ZeileId)): $($a.Verlauf)"; $stats.archiviert++; continue }
                try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($a.ZeileId)/fields" -Body $body | Out-Null; $stats.archiviert++; Log "Archiviert $($a.Titel) (ID $($a.ZeileId)): $($a.Verlauf)" }
                catch { Log "Fehler beim Archivieren von $($a.Titel): $_" 'ERROR'; $script:fehler++ }
            }
        }
    }
    Log ("$titel fertig: {0} aktualisiert, {1} neu, {2} unverändert, {3} archiviert, {4} reaktiviert, {5} umbenannt, {6} übersprungen" -f $stats.updated, $stats.created, $stats.unchanged, $stats.archiviert, $stats.reaktiviert, $stats.umbenannt, $stats.uebersprungen)
}

if (-not $OnlyBenutzer -and -not $OnlyTelefone -and $sccmOk) {
    # SCCM-Geräte auf die beiden Listen aufteilen – allein über den Namen.
    $nachListe = @{ admin = New-Object System.Collections.ArrayList; edu = New-Object System.Collections.ArrayList }
    foreach ($sys in $systems) { [void]$nachListe[(Get-ClientListe ([string]$sys.Name))].Add($sys) }
    Log "SCCM-Geräte aufgeteilt: $($nachListe.admin.Count) ADMIN-Clients, $($nachListe.edu.Count) EDU-Clients (Präfix «EDU»)"

    $phasen = @(
        [pscustomobject]@{ Liste = 'admin'; ListId = $AdminClientListId; Schalter = 'Admin' }
        [pscustomobject]@{ Liste = 'edu'; ListId = $EduClientListId; Schalter = 'Edu' }
    )
    foreach ($ph in $phasen) {
        if ($ClientListen -ne 'Alle' -and $ClientListen -ne $ph.Schalter) { continue }
        $titel = Get-ClientListenTitel $ph.Liste
        if (-not $ph.ListId) {
            Log "$titel`: keine Listen-Id in der Konfiguration – Phase übersprungen. Die Id steht in den Listeneinstellungen in SharePoint." 'ERROR'
            $fehler++
            continue
        }
        $fehlerVorher = $fehler
        try {
            Invoke-ClientPhase -Liste $ph.Liste -ListId $ph.ListId -SccmGeraete @($nachListe[$ph.Liste])
        } catch {
            Log "$titel`: Phase abgebrochen – die übrigen Phasen laufen weiter: $_" 'ERROR'
            $fehler++
        }
        $script:PhasenStatus[$titel] = $(if ($fehler -gt $fehlerVorher) { 'Fehler' } else { 'OK' })
    }
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

      Rückgabe: Objekt mit Logins und Sicher. Sicher = $false heisst: die Mitglieder sind wegen
      eines Lesefehlers unbekannt – der Aufrufer darf dann niemandem die Stufe 2 wegnehmen. Eine
      Gruppe, die es im AD nicht (mehr) gibt, ist dagegen ein sicheres Ergebnis: keine Mitglieder.
    #>
    param([string]$Gruppe, [string]$DomainDn, [string]$Server, [bool]$MitModul)
    $logins = New-Object System.Collections.ArrayList
    # LDAP-Sonderzeichen im Gruppennamen maskieren (RFC 4515), z. B. «Spo_K&A» ist harmlos, «(» nicht.
    $gEsc = ([string]$Gruppe) -replace '\\', '\5c' -replace '\*', '\2a' -replace '\(', '\28' -replace '\)', '\29'
    try {
        $gs = New-AdSucher $DomainDn ("(&(objectCategory=group)(sAMAccountName=$gEsc))") @('distinguishedname') $Server
        $g = $gs.FindOne()
        $gs.Dispose()
        if (-not $g) {
            Log "AD-Gruppe '$Gruppe' gibt es nicht – Name auf der Programmseite unter «AD-Gruppen» prüfen." 'WARN'
            return [pscustomobject]@{ Logins = @(); Sicher = $true }
        }
        $gdn = Get-AdWert $g 'distinguishedname'
        $dnEsc = $gdn -replace '\\', '\5c' -replace '\*', '\2a' -replace '\(', '\28' -replace '\)', '\29'
        $ms = New-AdSucher $DomainDn ("(&(objectCategory=person)(objectClass=user)(memberOf:1.2.840.113556.1.4.1941:=$dnEsc))") @('samaccountname') $Server
        foreach ($r in $ms.FindAll()) {
            $l = Get-AdWert $r 'samaccountname'
            if ($l) { [void]$logins.Add($l) }
        }
        $ms.Dispose()
        return [pscustomobject]@{ Logins = @($logins.ToArray()); Sicher = $true }
    } catch {
        Log "LDAP-Abfrage für Gruppe '$Gruppe' fehlgeschlagen: $_" 'WARN'
    }
    if ($MitModul) {
        try {
            $logins = New-Object System.Collections.ArrayList
            $p = @{ Identity = $Gruppe; Recursive = $true }
            if ($Server) { $p['Server'] = $Server }
            foreach ($m in (Get-ADGroupMember @p)) {
                if ($m.objectClass -eq 'user' -and $m.SamAccountName) { [void]$logins.Add([string]$m.SamAccountName) }
            }
            return [pscustomobject]@{ Logins = @($logins.ToArray()); Sicher = $true }
        } catch {
            Log "Get-ADGroupMember für Gruppe '$Gruppe' fehlgeschlagen: $_" 'ERROR'
            $script:fehler++
        }
    }
    return [pscustomobject]@{ Logins = @(); Sicher = $false }
}

function Get-AdBenutzerAlle {
    <#
      Alle AD-Benutzer der konfigurierten OUs als Hashtable (normalisiertes Login -> Objekt).
      Wird von der Benutzer- und der Telefon-Phase gebraucht; gelesen wird nur einmal.
    #>
    if ($script:AdBenutzerCache) { return $script:AdBenutzerCache }
    $mitModul = Test-AdModul
    if ($mitModul) { Import-Module ActiveDirectory -ErrorAction SilentlyContinue; Log 'AD: Modul ActiveDirectory wird verwendet' }
    else { Log 'AD: Modul ActiveDirectory fehlt – Fallback auf ADSI/DirectorySearcher' 'WARN' }
    $adServer = [string]$cfg.AdServer
    $ous = @($cfg.AdUserOUs)
    if (-not $ous -or $ous.Count -eq 0) { throw 'AdUserOUs fehlt in der Konfiguration (Array von OU-DNs).' }

    $alle = @{}
    # Unvollständig = mindestens eine OU liess sich nicht lesen. Dann fehlen deren Benutzer nur
    # scheinbar; gelöscht bzw. als «nicht mehr im AD» geleert wird in diesem Lauf nichts.
    $script:AdUnvollstaendig = $false
    foreach ($ou in $ous) {
        if (-not $ou -or [string]$ou -match '^<') { Log "OU-Eintrag '$ou' sieht nach Platzhalter aus – bitte den echten DN eintragen." 'ERROR'; $script:fehler++; $script:AdUnvollstaendig = $true; continue }
        $gefunden = @(); $gelesen = $false
        for ($versuch = 1; $versuch -le 2 -and -not $gelesen; $versuch++) {
            try { $gefunden = @(Get-AdBenutzerAusOu $ou $adServer $mitModul); $gelesen = $true }
            catch {
                if ($versuch -lt 2) { Start-Sleep -Seconds 10; continue }
                Log "AD-Fehler in OU '$ou': $_" 'ERROR'; $script:fehler++; $script:AdUnvollstaendig = $true
            }
        }
        if (-not $gelesen) { continue }
        Log "AD: $($gefunden.Count) Benutzer in $ou"
        foreach ($u in $gefunden) {
            $k = NormLogin $u.Login
            if ($k -eq '') { continue }
            if (-not $alle.ContainsKey($k)) { $alle[$k] = $u }
        }
    }
    Log "AD: $($alle.Count) Benutzer insgesamt"
    $script:AdBenutzerCache = $alle
    $script:AdMitModul = $mitModul
    return $alle
}

if (-not $OnlyClients -and -not $OnlyTelefone -and -not $nurKameras) {
  $fehlerVorher = $fehler
  try {
    if (-not $BenutzerListId) { throw 'BenutzerListId fehlt in der Konfiguration.' }
    $benutzerBase = "/sites/$SiteId/lists/$BenutzerListId/items"

    # 1) Programmliste aus der SharePoint-Liste «Software» laden.
    #    Sie ist die einzige Quelle: gepflegt wird sie im Frontend, nicht mehr in einer Datei.
    #    Fehlt die Liste oder ist sie leer, laufen die AD-Felder trotzdem – nur die
    #    Programmstufen bleiben dann unangetastet.
    $programmListe = @()
    if (-not $SoftwareListId) {
        Log 'SoftwareListId fehlt in der Konfiguration – die Programmstufen werden nicht abgeglichen. Die Id steht in den Listeneinstellungen der Liste «Software».' 'WARN'
    } else {
        try {
            $swItems = Get-GraphAlle "/sites/$SiteId/lists/$SoftwareListId/items?`$expand=fields(`$select=Title,Name,Kategorie,AdGruppen,Reihenfolge)&`$top=500"
            $roh = New-Object System.Collections.ArrayList
            foreach ($it in $swItems) {
                $prog = ConvertTo-Programm $it.fields
                if ($null -eq $prog) { Log "Software-Liste: Zeile ID $($it.id) hat keine Programm-Id und wird übergangen." 'WARN'; continue }
                if (-not (Test-ProgrammId $prog.id)) {
                    Log "Software-Liste: «$($prog.id)» taugt nicht als Spaltenname (Buchstaben und Ziffern, Beginn mit einem Buchstaben, max. 30 Zeichen) – übergangen." 'WARN'
                    continue
                }
                [void]$roh.Add($prog)
            }
            $programmListe = @(Sort-Programme $roh)
        } catch {
            Log "Liste «Software» konnte nicht gelesen werden – die Programmstufen werden nicht abgeglichen: $_" 'ERROR'
            $fehler++
        }
    }
    Log "Programme: $($programmListe.Count)"

    # 2) vorhandene Spalten feststellen: Verlauf und je Programm eine Spalte
    $erwartet = @('Verlauf') + @($programmListe | ForEach-Object { [string]$_.id })
    $spalten = Get-ListenSpalten $BenutzerListId 'Benutzer-Liste' $erwartet

    # Fehlende Programmspalten legt der Sync selbst an. Das ist die einzige Stelle, an der er
    # eine Spalte erzeugt – und sie ist nötig, damit ein Programm mit einer Zeile in «Software»
    # vollständig ist: Wer eine Zeile direkt in SharePoint erfasst (statt im Frontend, das die
    # Spalte mit anlegt), bekäme sonst ein Programm, das nie eine Stufe speichern kann.
    # Scheitert das Anlegen (fehlende Berechtigung), bleibt es bei der bisherigen Warnung und
    # das Programm wird in diesem Lauf einfach übergangen.
    foreach ($p in $programmListe) {
        $progId = [string]$p.id
        if ($spalten.ContainsKey($progId)) { continue }
        if ($WhatIf) { Log "WHATIF Programmspalte anlegen: $progId («$($p.name)»)"; continue }
        try {
            $neu = Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$BenutzerListId/columns" -Body (New-ProgrammSpalte $p)
            $spalten[$progId] = $neu
            if ($p.name) { $spalten[[string]$p.name] = $neu }
            Log "Programmspalte «$progId» in der Benutzer-Liste angelegt (Anzeigename «$($p.name)»)."
        } catch {
            Log "Programmspalte «$progId» konnte nicht angelegt werden – das Programm wird in diesem Lauf übergangen: $_" 'WARN'
        }
    }

    # Nur Programme abgleichen, deren Spalte es in der Liste wirklich gibt.
    $programmIds = @($programmListe | Where-Object { $spalten.ContainsKey([string]$_.id) } | ForEach-Object { $_.id })

    # 3) AD-Benutzer lesen
    $adBenutzer = Get-AdBenutzerAlle
    if ($adBenutzer.Count -eq 0 -and $script:AdUnvollstaendig) {
        # Kein einziger Benutzer und ein Lesefehler: das AD ist nicht erreichbar. Gruppen
        # abzufragen brächte nur dieselbe Meldung je Gruppe; geändert wird ohnehin nichts.
        throw 'Das AD ist nicht erreichbar – Benutzer und Programmstufen bleiben in diesem Lauf unverändert.'
    }
    $mitModul = [bool]$script:AdMitModul
    $adServer = [string]$cfg.AdServer
    $ous = @($cfg.AdUserOUs)

    $domainDn = ''
    foreach ($ou in $ous) { $domainDn = Get-DomainDnAusOu ([string]$ou); if ($domainDn) { break } }

    # Vorgesetzte auflösen
    foreach ($k in @($adBenutzer.Keys)) {
        $u = $adBenutzer[$k]
        $u | Add-Member -NotePropertyName Vorgesetzter -NotePropertyValue (Resolve-ManagerName $u.ManagerDn $adServer $mitModul) -Force
    }

    # 4) Gruppenmitgliedschaften je Programm
    $mitgliedschaft = @{}   # Login -> Liste Programm-Ids
    $unsicherIds = New-Object System.Collections.Generic.HashSet[string]   # Programme mit Lesefehler
    foreach ($p in $programmListe) {
        $gruppen = @($p.adGruppen)
        if ($gruppen.Count -eq 0) { continue }
        foreach ($g in $gruppen) {
            if (-not $g) { continue }
            $erg = Get-GruppenMitgliederRekursiv ([string]$g) $domainDn $adServer $mitModul
            if (-not $erg.Sicher) { [void]$unsicherIds.Add([string]$p.id) }
            $mitglieder = @($erg.Logins)
            Log "AD-Gruppe '$g' ($($p.id)): $($mitglieder.Count) Mitglieder"
            foreach ($m in $mitglieder) {
                $k = NormLogin $m
                if (-not $mitgliedschaft.ContainsKey($k)) { $mitgliedschaft[$k] = New-Object System.Collections.ArrayList }
                if (-not $mitgliedschaft[$k].Contains($p.id)) { [void]$mitgliedschaft[$k].Add($p.id) }
            }
        }
    }

    # Programme, deren Gruppen nicht sicher gelesen werden konnten, bleiben in diesem Lauf, wie
    # sie sind – sonst verlöre jedes Mitglied bei einem kurzen AD-Fehler seine Stufe 2.
    if ($unsicherIds.Count -gt 0) {
        Log "Programmstufen von $(@($unsicherIds) -join ', ') bleiben in diesem Lauf unverändert (AD-Gruppe nicht lesbar)." 'WARN'
        $programmIds = @($programmIds | Where-Object { -not $unsicherIds.Contains([string]$_) })
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
                # Ohne SCCM-Daten (SCCM nicht erreichbar) bleibt das Primärgerät, wie es ist –
                # sonst würde ein Ausfall von SCCM es bei allen Benutzern leeren.
                if ($f -eq 'SCCMPrimaerGeraet' -and -not $sccmOk) { continue }
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
            foreach ($id in $mitgliedIds) { if ($programmIds -contains $id) { $neu[$id] = '2' } }
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
    if ($script:AdUnvollstaendig -and $zuLoeschen.Count -gt 0) {
        Log "Benutzer: $($zuLoeschen.Count) Zeile(n) ohne AD-Konto bleiben stehen, weil das AD in diesem Lauf nicht vollständig gelesen werden konnte." 'WARN'
    } elseif (-not $schutz.Erlaubt) {
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
  } catch {
    Log "Benutzer: Phase abgebrochen – die übrigen Phasen laufen weiter: $_" 'ERROR'
    $fehler++
  }
  $script:PhasenStatus['Benutzer'] = $(if ($fehler -gt $fehlerVorher) { 'Fehler' } else { 'OK' })
}

# ===========================================================================
# Phase 3: Telefonnummern (AD-Attribut telephoneNumber)
# ===========================================================================
if (-not $OnlyClients -and -not $OnlyBenutzer -and -not $nurKameras) {
    if (-not $TelefonListId) {
        Log 'TelefonListId fehlt in der Konfiguration – Telefon-Phase übersprungen (ID steht in den Listeneinstellungen und in frontend\konfig.js).' 'WARN'
    } else {
      $fehlerVorher = $fehler
      try {
        $telefonBase = "/sites/$SiteId/lists/$TelefonListId/items"
        $praefix = $script:TelefonPraefixStandard
        if ($cfg.TelefonPraefix) { $praefix = [string]$cfg.TelefonPraefix }

        # 1) Vorhandene Spalten feststellen. Geprüft werden nur die Spalten, die diese Phase
        #    wirklich schreibt – die manuellen Spalten der Liste (Apparat, Standort, Hinweis)
        #    gehen den Sync nichts an.
        $tErwartet = @('Telefonnummer', 'Name', 'Typ', 'Status', 'Benutzer', 'ADLetzterSync', 'Verlauf')
        $tVorhanden = Get-ListenSpalten $TelefonListId 'Telefonliste' $tErwartet

        # 2) AD-Benutzer (aus der Benutzer-Phase, sonst jetzt lesen)
        $adBenutzer = Get-AdBenutzerAlle
        if ($adBenutzer.Count -eq 0 -and $script:AdUnvollstaendig) {
            throw 'Das AD ist nicht erreichbar – die Telefonliste bleibt in diesem Lauf unverändert.'
        }

        # 3) Liste lesen
        $tItems = Get-GraphAlle "$telefonBase`?`$expand=fields&`$top=500"
        Log "Telefonliste: $($tItems.Count) Zeilen"
        $tZeilen = New-Object System.Collections.ArrayList
        foreach ($it in $tItems) {
            [void]$tZeilen.Add([pscustomobject]@{
                    Id            = [string]$it.id
                    Title         = [string]$it.fields.Title
                    Telefonnummer = [string]$it.fields.Telefonnummer
                    Name          = [string]$it.fields.Name
                    Typ           = [string]$it.fields.Typ
                    Status        = [string]$it.fields.Status
                    Benutzer      = [string]$it.fields.Benutzer
                    Verlauf       = [string]$it.fields.Verlauf
                    Item          = $it
                })
        }

        # 4) Abgleich rechnen und schreiben
        $tPlan = Get-TelefonAbgleich $tZeilen @($adBenutzer.Values) $praefix -NichtLeeren:([bool]$script:AdUnvollstaendig)
        foreach ($w in $tPlan.Warnungen) { Log $w 'WARN' }
        $tstats = @{ updated = 0; created = 0; uebersprungen = 0 }

        foreach ($u in $tPlan.Updates) {
            $body = [ordered]@{}
            foreach ($k in $u.Felder.Keys) { $body[$k] = $u.Felder[$k] }
            $body['ADLetzterSync'] = (ToIso $now)
            if ($u.VerlaufTexte.Count -gt 0) {
                try { $body['Verlauf'] = Add-VerlaufEintraege -Verlauf ([string]$u.Zeile.Verlauf) -Texte $u.VerlaufTexte -Datum $now -Quelle 'sync' -Zeitpunkt $now }
                catch {
                    Log "Verlauf der Nummer '$($u.Titel)' (ID $($u.ZeileId)) ist unbrauchbar – Zeile übersprungen: $_" 'ERROR'
                    $fehler++; $tstats.uebersprungen++; continue
                }
            }
            $body = Select-VorhandeneFelder $tVorhanden $body
            if ($body.Count -eq 0) { $tstats.uebersprungen++; continue }
            if ($WhatIf) { Log "WHATIF Telefon-Update $($u.Titel) (ID $($u.ZeileId)): $($u.Felder.Keys -join ', ')"; $tstats.updated++; continue }
            try { Invoke-Graph -Method PATCH -Uri "$telefonBase/$($u.ZeileId)/fields" -Body $body | Out-Null; $tstats.updated++; Log "Telefon-Update $($u.Titel): $($u.Felder.Keys -join ', ')" }
            catch { Log "Telefon-Update-Fehler $($u.Titel): $_" 'ERROR'; $fehler++ }
        }

        foreach ($n in $tPlan.Neu) {
            $body = [ordered]@{}
            foreach ($k in $n.Felder.Keys) { if ($null -ne $n.Felder[$k] -and [string]$n.Felder[$k] -ne '') { $body[$k] = $n.Felder[$k] } }
            $body['ADLetzterSync'] = (ToIso $now)
            $body['Verlauf'] = Add-VerlaufEintrag -Verlauf '' -Text $n.Verlauf -Datum $now -Quelle 'sync' -Zeitpunkt $now
            $body = Select-VorhandeneFelder $tVorhanden $body
            if ($WhatIf) { Log "WHATIF Telefon neu: $($n.Felder.Title) ($($n.Felder.Benutzer))"; $tstats.created++; continue }
            try { Invoke-Graph -Method POST -Uri $telefonBase -Body @{ fields = $body } | Out-Null; $tstats.created++; Log "Telefon neu: $($n.Felder.Title) ($($n.Felder.Benutzer))" }
            catch { Log "Telefon-Anlage-Fehler $($n.Felder.Title): $_" 'ERROR'; $fehler++ }
        }
        Log ('Telefone fertig: {0} aktualisiert, {1} neu, {2} übersprungen' -f $tstats.updated, $tstats.created, $tstats.uebersprungen)
      } catch {
        Log "Telefonnummern: Phase abgebrochen: $_" 'ERROR'
        $fehler++
      }
      $script:PhasenStatus['Telefonnummern'] = $(if ($fehler -gt $fehlerVorher) { 'Fehler' } else { 'OK' })
    }
}

# ===========================================================================
# Phase 4: Kameras (Milestone XProtect)
# ===========================================================================
$kGeraete = @()
$milestoneOk = $false
if ($mitKameras) {
    if (-not $KameraListId) {
        Log 'KameraListId fehlt in der Konfiguration – Kamera-Phasen übersprungen (ID steht in den Listeneinstellungen und in frontend\konfig.js).' 'WARN'
    } elseif (-not $cfg.MilestoneServer -or [string]$cfg.MilestoneServer -match '^<') {
        Log 'MilestoneServer fehlt in der Konfiguration – Kamera-Phasen übersprungen. Sobald das Lesekonto in Milestone eingerichtet ist: Installiere-Sync.ps1 -MilestoneServer http://adminsrv347 (README Abschnitt 7.5).' 'WARN'
    } else {
      $fehlerVorher = $fehler
      try {
        $kameraBase = "/sites/$SiteId/lists/$KameraListId/items"
        Set-MilestoneVerbindung $cfg
        $kGeraete = @(Get-MilestoneGeraete)
        $milestoneOk = $true
        Log "Milestone ($($cfg.MilestoneServer), Anmeldung $(if ($cfg.MilestoneAnmeldung) { $cfg.MilestoneAnmeldung } else { 'Windows' })): $($kGeraete.Count) Kamera-Hardware"

        $kErwartet = @('Gebaeude', 'Raum', 'Status', 'Verlauf') + @((ConvertTo-KameraFelder ([pscustomobject]@{ Kanaele = @() })).Keys)
        $kVorhanden = Get-ListenSpalten $KameraListId 'Kameraliste' $kErwartet
        $kItems = Get-GraphAlle "$kameraBase`?`$expand=fields&`$top=500"
        Log "Kameraliste: $($kItems.Count) Zeilen"
        $kZeilen = New-Object System.Collections.ArrayList
        foreach ($it in $kItems) {
            [void]$kZeilen.Add([pscustomobject]@{
                    Id              = [string]$it.id
                    Title           = [string]$it.fields.Title
                    Status          = [string]$it.fields.Status
                    Gebaeude        = [string]$it.fields.Gebaeude
                    Raum            = [string]$it.fields.Raum
                    MS_HardwareId   = [string]$it.fields.MS_HardwareId
                    MS_Mac          = [string]$it.fields.MS_Mac
                    MS_Seriennummer = [string]$it.fields.MS_Seriennummer
                    MS_Adresse      = [string]$it.fields.MS_Adresse
                    Item            = $it
                })
        }

        $kPlan = Get-KameraZuordnung $kGeraete $kZeilen
        foreach ($w in $kPlan.Warnungen) { Log "Kameras: $w" 'WARN' }
        $kstats = @{ updated = 0; created = 0; unchanged = 0; archiviert = 0; reaktiviert = 0; umbenannt = 0; uebersprungen = 0 }

        foreach ($zu in $kPlan.Zuordnungen) {
            $it = $zu.Zeile.Item
            $felder = ConvertTo-KameraFelder $zu.Geraet $now
            $delta = [ordered]@{}
            foreach ($k in $felder.Keys) {
                if ($k -eq 'MS_LetzterSync') { continue }
                if ((Norm $felder[$k]) -ne (Norm $it.fields.$k)) { $delta[$k] = $felder[$k] }
            }
            foreach ($k in $zu.Felder.Keys) { $delta[$k] = $zu.Felder[$k] }
            if ($zu.VerlaufTexte.Count -gt 0) {
                try { $delta['Verlauf'] = Add-VerlaufEintraege -Verlauf ([string]$it.fields.Verlauf) -Texte $zu.VerlaufTexte -Datum $now -Quelle 'sync' -Zeitpunkt $now }
                catch {
                    Log "Verlauf der Kamera '$($zu.Titel)' (ID $($zu.ZeileId)) ist unbrauchbar – Zeile übersprungen, damit nichts verloren geht: $_" 'ERROR'
                    $fehler++; $kstats.uebersprungen++; continue
                }
            }
            if ($delta.Count -eq 0) { $kstats.unchanged++; continue }
            if ($zu.Felder.Contains('Title') -and $zu.Titel) { $kstats.umbenannt++ }
            if ($zu.StatusAlt -eq 'Archiviert') { $kstats.reaktiviert++ }
            $delta['MS_LetzterSync'] = $felder['MS_LetzterSync']
            $delta = Select-VorhandeneFelder $kVorhanden $delta
            if ($WhatIf) { Log "WHATIF Kamera-Update $($zu.Titel) (ID $($zu.ZeileId), Treffer über $($zu.Grund)): $($delta.Keys -join ', ')"; $kstats.updated++; continue }
            try { Invoke-Graph -Method PATCH -Uri "$kameraBase/$($zu.ZeileId)/fields" -Body $delta | Out-Null; $kstats.updated++; Log "Kamera-Update $($zu.Titel) (ID $($zu.ZeileId)): $($delta.Count) Felder" }
            catch { Log "Kamera-Update-Fehler $($zu.Titel): $_" 'ERROR'; $fehler++ }
        }

        foreach ($n in $kPlan.Neu) {
            $felder = ConvertTo-KameraFelder $n.Geraet $now
            $body = [ordered]@{ Title = $n.Name; Status = $n.Status }
            if ($n.Gebaeude) { $body['Gebaeude'] = $n.Gebaeude }
            if ($n.Raum) { $body['Raum'] = $n.Raum }
            foreach ($k in $felder.Keys) { if ($null -ne $felder[$k]) { $body[$k] = $felder[$k] } }
            $body['Verlauf'] = Add-VerlaufEintrag -Verlauf '' -Text $n.Verlauf -Datum $now -Quelle 'sync' -Zeitpunkt $now
            $body = Select-VorhandeneFelder $kVorhanden $body
            if ($WhatIf) { Log "WHATIF Kamera neu: $($n.Name) ($($felder['MS_Adresse']))"; $kstats.created++; continue }
            try { $r = Invoke-Graph -Method POST -Uri $kameraBase -Body @{ fields = $body }; $kstats.created++; Log "Kamera neu: $($n.Name) (ID $($r.id))" }
            catch { Log "Kamera-Anlage-Fehler $($n.Name): $_" 'ERROR'; $fehler++ }
        }

        # Verschwundene Hardware: archivieren, nie löschen (Archivschutz wie bei den Clients).
        $schutz = Test-ArchivSchutz $kGeraete.Count $kPlan.AktiveZeilen $kPlan.Archivieren.Count $LoeschSchutzProzent
        if (-not $schutz.Erlaubt) {
            Log "Kameras: Archivschutz greift: $($schutz.Grund -replace 'SCCM', 'Milestone')" 'ERROR'
            $fehler++
        } else {
            foreach ($a in $kPlan.Archivieren) {
                $it = $a.Zeile.Item
                $body = [ordered]@{ Status = 'Archiviert'; MS_Gefunden = 'Nein'; MS_SyncStatus = 'Nicht mehr in Milestone'; MS_LetzterSync = (ToIso $now) }
                try { $body['Verlauf'] = Add-VerlaufEintrag -Verlauf ([string]$it.fields.Verlauf) -Text $a.Verlauf -Datum $now -Quelle 'sync' -Zeitpunkt $now }
                catch {
                    Log "Verlauf der Kamera '$($a.Titel)' (ID $($a.ZeileId)) ist unbrauchbar – Zeile übersprungen: $_" 'ERROR'
                    $fehler++; $kstats.uebersprungen++; continue
                }
                $body = Select-VorhandeneFelder $kVorhanden $body
                if ($WhatIf) { Log "WHATIF Kamera archivieren $($a.Titel) (ID $($a.ZeileId)): $($a.Verlauf)"; $kstats.archiviert++; continue }
                try { Invoke-Graph -Method PATCH -Uri "$kameraBase/$($a.ZeileId)/fields" -Body $body | Out-Null; $kstats.archiviert++; Log "Kamera archiviert $($a.Titel) (ID $($a.ZeileId)): $($a.Verlauf)" }
                catch { Log "Fehler beim Archivieren der Kamera $($a.Titel): $_" 'ERROR'; $fehler++ }
            }
        }
        Log ('Kameras fertig: {0} aktualisiert, {1} neu, {2} unverändert, {3} archiviert, {4} reaktiviert, {5} umbenannt, {6} übersprungen' -f $kstats.updated, $kstats.created, $kstats.unchanged, $kstats.archiviert, $kstats.reaktiviert, $kstats.umbenannt, $kstats.uebersprungen)
      } catch {
        Log "Kameras: Phase abgebrochen – die übrigen Phasen laufen weiter: $_" 'ERROR'
        $fehler++
      }
      $script:PhasenStatus['Kameras'] = $(if ($fehler -gt $fehlerVorher) { 'Fehler' } else { 'OK' })
    }
}

# ===========================================================================
# Phase 5: Kamera-Rollen (Rechte aus Milestone, nur lesen)
# ===========================================================================
if ($mitKameras -and $milestoneOk -and -not $KameraRolleListId) {
    Log 'KameraRolleListId fehlt in der Konfiguration – die Rechte der Milestone-Rollen werden nicht abgeglichen.' 'WARN'
}
if ($mitKameras -and $milestoneOk -and $KameraRolleListId) {
    $rechteStunden = 6
    if ($null -ne $cfg.MilestoneRechteStunden) { $rechteStunden = [double]$cfg.MilestoneRechteStunden }
    $zustandDatei = Join-Path (Split-Path -Parent $LogPath) 'Sync-Inventar.kamerarechte.json'
    $letzter = $null
    if (Test-Path $zustandDatei) { try { $letzter = (Read-JsonDatei $zustandDatei).zeit } catch { } }
    if (-not $KameraRechteJetzt -and -not (Test-RollenAbgleichFaellig $letzter $rechteStunden $now)) {
        Log "Kamera-Rollen: letzter Abgleich $letzter – nächster nach $rechteStunden Stunden (sofort mit -KameraRechteJetzt)."
    } else {
      $fehlerVorher = $fehler
      try {
        $rolleBase = "/sites/$SiteId/lists/$KameraRolleListId/items"
        $kameraBase = "/sites/$SiteId/lists/$KameraListId/items"
        $diagnose = [ordered]@{}
        $rollen = @()
        try { $rollen = @(Get-MilestoneListe 'roles') }
        catch {
            if ($_.Exception.Data['Status'] -eq 403) {
                throw "Das Konto des Syncs darf die Rollen in Milestone nicht lesen (403). Es braucht eine Rolle mit Leserecht auf «Rollen» bzw. Sicherheit (README Abschnitt 7.5)."
            }
            throw
        }
        if ($MilestoneDiagnose) { $diagnose['rollen'] = $rollen }
        Log "Milestone: $($rollen.Count) Rollen"

        # Kanal-ID -> Hardware-ID und Hardware-ID -> Name (aus Phase 4)
        $hwVonKanal = @{}; $hwName = @{}
        foreach ($g in $kGeraete) {
            $hwName[[string]$g.HardwareId] = Get-KameraName $g
            foreach ($k in @($g.Kanaele)) { $hwVonKanal[[string]$k.Id] = [string]$g.HardwareId }
        }

        # AD für die Auflösung der Gruppen
        $mitModul = Test-AdModul
        if ($mitModul) { Import-Module ActiveDirectory -ErrorAction SilentlyContinue }
        $domainDn = ''
        foreach ($ou in @($cfg.AdUserOUs)) { $domainDn = Get-DomainDnAusOu ([string]$ou); if ($domainDn) { break } }

        $rechteLesbar = $true
        $ergebnisse = New-Object System.Collections.ArrayList
        foreach ($r in $rollen) {
            $rid = [string]$r.id
            $istAdmin = ([string]$r.roleType) -match '(?i)admin'
            # Mitglieder
            $mitglieder = @()
            try {
                $roh = @(Get-MilestoneListe "roles/$rid/users")
                if ($MilestoneDiagnose -and -not $diagnose.Contains('mitglieder')) { $diagnose['mitglieder'] = $roh }
                $mitglieder = @($roh | ForEach-Object { ConvertTo-RollenMitglied $_ })
            } catch { Log "Rolle «$($r.name)»: Mitglieder nicht lesbar: $($_.Exception.Message)" 'WARN' }
            # Personen auflösen: direkte AD-Benutzer und rekursive Mitglieder der AD-Gruppen
            $logins = New-Object System.Collections.Generic.SortedSet[string]([StringComparer]::OrdinalIgnoreCase)
            $sicher = $true
            foreach ($m in $mitglieder) {
                if ($m.Art -eq 'AD-Benutzer' -and $m.Konto) { [void]$logins.Add($m.Konto) }
                elseif ($m.Art -eq 'AD-Gruppe' -and $m.Konto -and $domainDn) {
                    $erg = Get-GruppenMitgliederRekursiv $m.Konto $domainDn ([string]$cfg.AdServer) $mitModul
                    if (-not $erg.Sicher) { $sicher = $false }
                    foreach ($l in $erg.Logins) { [void]$logins.Add([string]$l) }
                }
            }
            # Rechte je Kamera (Hardware); Administratoren sehen alles
            $kameras = @{}
            if ($istAdmin) {
                foreach ($g in $kGeraete) { $kameras[[string]$g.HardwareId] = @('Vollzugriff') }
            } elseif ($rechteLesbar) {
                foreach ($kanalId in @($hwVonKanal.Keys)) {
                    try {
                        $antwort = Get-MilestoneKameraRechte $kanalId $rid
                        if ($MilestoneDiagnose -and -not $diagnose.Contains('rechte')) { $diagnose['rechte'] = $antwort }
                        $rechte = @(ConvertFrom-MilestoneRechte $antwort)
                        if ($rechte.Count -eq 0) { continue }
                        $hw = $hwVonKanal[$kanalId]
                        $bisher = @(); if ($kameras.ContainsKey($hw)) { $bisher = @($kameras[$hw]) }
                        $kameras[$hw] = @(Sort-KameraRechte (@($bisher) + @($rechte)))
                    } catch {
                        # Ein unvollständiges Bild wäre ein falscher Nachweis: bei jedem Fehler bleiben
                        # Rechte und «Sichtbar für» in diesem Lauf, wie sie sind (nächster Lauf versucht es neu).
                        $status = $_.Exception.Data['Status']
                        $warum = $(if ($status -eq 403) { 'keine Berechtigung (403)' } elseif ($status -eq 404) { 'Milestone kennt die Rolle für die Rechteabfrage nicht (404) – der Rolle des Syncs fehlt das Recht, die Sicherheit der Rollen zu verwalten' } else { "Fehler $status" })
                        Log "Rechte der Kameras nicht lesbar ($warum; Rolle «$($r.name)», Kamera $($hwName[$hwVonKanal[$kanalId]])) – nur Rollen und Mitglieder werden abgeglichen (README Abschnitt 7.5). $($_.Exception.Message)" 'ERROR'
                        $fehler++
                        $rechteLesbar = $false
                        break
                    }
                }
            }
            [void]$ergebnisse.Add([pscustomobject]@{ Rolle = $r; Id = $rid; Admin = $istAdmin; Mitglieder = $mitglieder; Logins = @($logins); Sicher = $sicher; Kameras = $kameras })
        }
        if ($MilestoneDiagnose) {
            try { Write-JsonDatei $diagnose (Join-Path (Split-Path -Parent $LogPath) 'Milestone-Diagnose.json') 10; Log 'Milestone-Diagnose.json geschrieben.' } catch { Log "Milestone-Diagnose.json nicht geschrieben: $_" 'WARN' }
        }

        # Liste «Kamera-Rollen» schreiben
        $rVorhanden = Get-ListenSpalten $KameraRolleListId 'Liste «Kamera-Rollen»' @('Verlauf', 'MS_RolleId', 'MS_Gefunden', 'MS_Mitglieder', 'MS_AdGruppen', 'MS_Benutzer', 'MS_Rechte', 'MS_Kameras', 'MS_KameraAnzahl')
        $rItems = @(Get-GraphAlle "$rolleBase`?`$expand=fields&`$top=500")
        $rNachId = @{}; $rNachName = @{}
        foreach ($it in $rItems) {
            $i = [string]$it.fields.MS_RolleId; if ($i) { $rNachId[$i] = $it }
            $t = ([string]$it.fields.Title).Trim().ToLowerInvariant(); if ($t -and -not $rNachName.ContainsKey($t)) { $rNachName[$t] = $it }
        }
        $rstats = @{ updated = 0; created = 0; unchanged = 0; fehlend = 0 }
        $gesehen = New-Object System.Collections.Generic.HashSet[string]
        $kameraRollen = @{}   # Hardware-ID -> Liste {Rolle, Rechte}
        foreach ($e in $ergebnisse) {
            $name = [string]$e.Rolle.name
            foreach ($hw in $e.Kameras.Keys) {
                if (-not $kameraRollen.ContainsKey($hw)) { $kameraRollen[$hw] = New-Object System.Collections.ArrayList }
                [void]$kameraRollen[$hw].Add([pscustomobject]@{ Rolle = $name; Rechte = @($e.Kameras[$hw]) })
            }
            $alleRechte = @(Sort-KameraRechte (@($e.Kameras.Values | ForEach-Object { $_ })))
            $felder = [ordered]@{
                Title           = $name
                MS_RolleId      = $e.Id
                MS_Gefunden     = 'Ja'
                MS_RollenTyp    = $(if ($e.Admin) { 'Administratoren' } else { 'Benutzerdefiniert' })
                MS_Beschreibung = [string]$e.Rolle.description
                MS_Mitglieder   = ((@($e.Mitglieder | Sort-Object Art, Name | ForEach-Object { "$($_.Art) | $($_.Name)" })) -join "`n")
                MS_AdGruppen    = ((@($e.Mitglieder | Where-Object { $_.Art -eq 'AD-Gruppe' } | ForEach-Object { $_.Konto } | Sort-Object -Unique)) -join "`n")
                MS_Benutzer     = ((@($e.Logins)) -join "`n")
                MS_Rechte       = ($alleRechte -join "`n")
                MS_Kameras      = (ConvertTo-RollenKameras $e.Kameras)
                MS_KameraAnzahl = $e.Kameras.Count
                MS_SyncStatus   = $(if (-not $rechteLesbar -and -not $e.Admin) { 'Rechte nicht lesbar (Berechtigung des Sync-Kontos in Milestone)' } elseif (-not $e.Sicher) { 'AD-Gruppe nicht vollständig lesbar' } else { 'OK' })
            }
            # Probeläufe zeigen je Rolle, was gelesen wurde (Installiere-Sync.ps1 filtert auf «Milestone»).
            if ($WhatIf -or $MilestoneDiagnose) {
                Log ('Milestone-Rolle «{0}»: {1} Mitglieder, {2} Personen, {3} Kameras, Rechte: {4}' -f $name, @($e.Mitglieder).Count, @($e.Logins).Count, $e.Kameras.Count, $(if ($alleRechte.Count) { $alleRechte -join ', ' } else { '–' }))
            }
            # Ohne lesbare Rechte bleiben Kameras und Rechte der Zeile, wie sie sind.
            if (-not $rechteLesbar -and -not $e.Admin) { $felder.Remove('MS_Rechte'); $felder.Remove('MS_Kameras'); $felder.Remove('MS_KameraAnzahl') }
            # Ist eine AD-Gruppe nicht lesbar, bleibt die Personenliste stehen.
            if (-not $e.Sicher) { $felder.Remove('MS_Benutzer') }
            $it = $null
            if ($rNachId.ContainsKey($e.Id)) { $it = $rNachId[$e.Id] } elseif ($rNachName.ContainsKey($name.ToLowerInvariant())) { $it = $rNachName[$name.ToLowerInvariant()] }
            if ($it) {
                [void]$gesehen.Add([string]$it.id)
                $delta = [ordered]@{}
                foreach ($k in $felder.Keys) { if ((Norm $felder[$k]) -ne (Norm $it.fields.$k)) { $delta[$k] = $felder[$k] } }
                $texte = @()
                if ($delta.Contains('Title') -and [string]$it.fields.Title) { $texte += "Umbenannt in Milestone: $($it.fields.Title) → $name" }
                if ([string]$it.fields.MS_Gefunden -eq 'Nein') { $texte += 'Wieder in Milestone vorhanden' }
                $texte += @(Get-RollenVerlauf ([string]$it.fields.MS_Mitglieder) ([string]$felder['MS_Mitglieder']) `
                        ([string]$it.fields.MS_Kameras) $(if ($felder.Contains('MS_Kameras')) { [string]$felder['MS_Kameras'] } else { [string]$it.fields.MS_Kameras }) $hwName)
                if ($texte.Count) {
                    try { $delta['Verlauf'] = Add-VerlaufEintraege -Verlauf ([string]$it.fields.Verlauf) -Texte $texte -Datum $now -Quelle 'sync' -Zeitpunkt $now }
                    catch { Log "Verlauf der Rolle '$name' ist unbrauchbar – Zeile übersprungen: $_" 'ERROR'; $fehler++; continue }
                }
                if ($delta.Count -eq 0) { $rstats.unchanged++; continue }
                $delta['MS_LetzterSync'] = (ToIso $now)
                $delta = Select-VorhandeneFelder $rVorhanden $delta
                if ($WhatIf) { Log "WHATIF Rolle-Update ${name}: $($delta.Keys -join ', ')"; $rstats.updated++; continue }
                try { Invoke-Graph -Method PATCH -Uri "$rolleBase/$($it.id)/fields" -Body $delta | Out-Null; $rstats.updated++; Log "Rolle-Update ${name}: $($delta.Count) Felder" }
                catch { Log "Rolle-Update-Fehler ${name}: $_" 'ERROR'; $fehler++ }
            } else {
                $body = [ordered]@{}
                foreach ($k in $felder.Keys) { if ($null -ne $felder[$k] -and [string]$felder[$k] -ne '') { $body[$k] = $felder[$k] } }
                $body['MS_LetzterSync'] = (ToIso $now)
                $body['Verlauf'] = Add-VerlaufEintrag -Verlauf '' -Text 'Aus Milestone neu angelegt' -Datum $now -Quelle 'sync' -Zeitpunkt $now
                $body = Select-VorhandeneFelder $rVorhanden $body
                if ($WhatIf) { Log "WHATIF Rolle neu: $name"; $rstats.created++; continue }
                try { Invoke-Graph -Method POST -Uri $rolleBase -Body @{ fields = $body } | Out-Null; $rstats.created++; Log "Rolle neu: $name" }
                catch { Log "Rolle-Anlage-Fehler ${name}: $_" 'ERROR'; $fehler++ }
            }
        }
        # Rollen, die es in Milestone nicht mehr gibt: festhalten, nie löschen.
        foreach ($it in $rItems) {
            if ($gesehen.Contains([string]$it.id) -or [string]$it.fields.MS_Gefunden -eq 'Nein' -or -not [string]$it.fields.MS_RolleId) { continue }
            $body = [ordered]@{ MS_Gefunden = 'Nein'; MS_SyncStatus = 'Nicht mehr in Milestone'; MS_LetzterSync = (ToIso $now) }
            try { $body['Verlauf'] = Add-VerlaufEintrag -Verlauf ([string]$it.fields.Verlauf) -Text 'In Milestone nicht mehr vorhanden' -Datum $now -Quelle 'sync' -Zeitpunkt $now } catch { }
            $body = Select-VorhandeneFelder $rVorhanden $body
            if ($WhatIf) { Log "WHATIF Rolle fehlt in Milestone: $($it.fields.Title)"; $rstats.fehlend++; continue }
            try { Invoke-Graph -Method PATCH -Uri "$rolleBase/$($it.id)/fields" -Body $body | Out-Null; $rstats.fehlend++; Log "Rolle fehlt in Milestone: $($it.fields.Title)" }
            catch { Log "Fehler bei der Rolle $($it.fields.Title): $_" 'ERROR'; $fehler++ }
        }

        # Je Kamera: «Sichtbar für» (nur wenn die Rechte gelesen werden konnten)
        $kStats2 = 0
        if ($rechteLesbar) {
            $kItems2 = @(Get-GraphAlle "$kameraBase`?`$expand=fields(`$select=Title,MS_HardwareId,MS_Rollen)&`$top=500")
            foreach ($it in $kItems2) {
                $hw = [string]$it.fields.MS_HardwareId
                if (-not $hw) { continue }
                $text = ''
                if ($kameraRollen.ContainsKey($hw)) { $text = Get-KameraRollenText $kameraRollen[$hw] }
                if ((Norm $text) -eq (Norm ([string]$it.fields.MS_Rollen))) { continue }
                $wert = $(if ($text) { $text } else { $null })
                if ($WhatIf) { $kStats2++; continue }
                try { Invoke-Graph -Method PATCH -Uri "$kameraBase/$($it.id)/fields" -Body @{ MS_Rollen = $wert } | Out-Null; $kStats2++ }
                catch { Log "Kamera $($it.fields.Title): «Sichtbar für» nicht geschrieben: $_" 'ERROR'; $fehler++ }
            }
        }
        Log ('Kamera-Rollen fertig: {0} aktualisiert, {1} neu, {2} unverändert, {3} fehlen in Milestone; {4} Kameras mit geänderter Sichtbarkeit' -f $rstats.updated, $rstats.created, $rstats.unchanged, $rstats.fehlend, $kStats2)
        if (-not $WhatIf -and $fehler -eq $fehlerVorher) {
            try { Write-JsonDatei ([ordered]@{ zeit = (ToIso $now) }) $zustandDatei } catch { Log "Zustand der Kamera-Rollen nicht geschrieben: $_" 'WARN' }
        }
      } catch {
        Log "Kamera-Rollen: Phase abgebrochen: $_" 'ERROR'
        $fehler++
      }
      $script:PhasenStatus['Kamera-Rollen'] = $(if ($fehler -gt $fehlerVorher) { 'Fehler' } else { 'OK' })
    }
}

Log ("==== Fertig: {0} Fehler, {1} Warnungen, {2:N0} s ====" -f $fehler, (Get-LogZaehler).Warnungen, ((Get-Date) - $now).TotalSeconds)
Write-SyncStatus
if ($fehler) { exit 1 }
exit 0
