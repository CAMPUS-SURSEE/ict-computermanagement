<#
.SYNOPSIS
  Synchronisiert die SharePoint-Listen «Computer» (aus SCCM) und «Benutzer» (aus Active Directory).

.DESCRIPTION
  Der Sync füllt nur Daten. Er ändert die Struktur der Listen nie: keine Spalte wird angelegt,
  umbenannt oder gelöscht. Fehlt eine erwartete Spalte, meldet er das als WARN und lässt genau
  ihre Felder aus – alles andere läuft weiter. Angelegt werden Spalten mit Ergaenze-Spalten.ps1
  oder von Hand in den Listeneinstellungen.

  Phase Computer:
    - liest alle Geräte samt Inventar aus SCCM (SMS Provider, WMI),
    - ordnet sie über die Seriennummer den Zeilen der Computer-Liste zu (Fallback: PC-Name),
    - führt den Titel nach, wenn ein Gerät in SCCM umbenannt wurde (mit Verlaufseintrag),
    - schreibt nur geänderte SCCM_*-Felder, legt fehlende Geräte neu an (Status «Aktiv»),
    - setzt Zeilen ohne SCCM-Gerät auf «In SCCM vorhanden = Nein» und Status «Archiviert».
      Gelöscht wird in dieser Phase nie – es gibt keinen Löschpfad.

  Phase Benutzer:
    - lädt programme.json aus der Dokumentbibliothek,
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

.PARAMETER OnlyComputers
  Nur die Computer-Phase ausführen.

.PARAMETER OnlyBenutzer
  Nur die Benutzer-Phase ausführen.

.PARAMETER OnlyTelefone
  Nur die Telefon-Phase ausführen (liest AD, aber kein SCCM).

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
    [switch]$OnlyTelefone,
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

# ---------------------------------------------------------------------------
# Zuordnung SCCM-Gerät <-> Zeile der Computer-Liste (rein, ohne Graph und WMI)
# ---------------------------------------------------------------------------

function Get-StatusNorm {
    <# Status einer Computer-Zeile vereinheitlichen. Leer bleibt leer (gilt sonst als «Aktiv»). #>
    param([string]$Status)
    if (-not $Status) { return '' }
    $s = ([string]$Status).Trim()
    if ($s -eq '') { return '' }
    switch ($s.ToLowerInvariant()) {
        'aktiv' { return 'Aktiv' }
        'lager' { return 'Lager' }
        'archiviert' { return 'Archiviert' }
    }
    return $s   # unbekannter Wert: unverändert lassen
}

function Get-ZeilenSeriennummer {
    <# Gültige Seriennummer einer Zeile: SCCM_SerialNumber vor der manuellen Spalte Seriennummer. #>
    param($Zeile)
    $a = NormSeriennummer (Get-Text $Zeile 'SCCM_SerialNumber')
    if (Test-Seriennummer $a) { return $a }
    $b = NormSeriennummer (Get-Text $Zeile 'Seriennummer')
    if (Test-Seriennummer $b) { return $b }
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
      (Gelöscht wird in der Computer-Phase ohnehin nie.)
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

function Get-ComputerZuordnung {
    <#
      Ordnet SCCM-Geräte den Zeilen der Computer-Liste zu. Reine Funktion, damit sie ohne
      SCCM und ohne Graph geprüft werden kann.

      $SccmGeraete: Objekte mit ResourceId, Name, Seriennummer, Aktivitaet (jüngste SCCM-Aktivität)
      $Zeilen     : Objekte mit Id, Title, Seriennummer, SCCM_SerialNumber, Status

      Regeln:
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
    #>
    param($SccmGeraete, $Zeilen)

    $warnungen = New-Object System.Collections.ArrayList
    $zuordnungen = New-Object System.Collections.ArrayList
    $neu = New-Object System.Collections.ArrayList
    $archivieren = New-Object System.Collections.ArrayList

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
    $zeilenSortiert = @(@($Zeilen) | Where-Object { $null -ne $_ } | Sort-Object { Get-ZeilenSortierschluessel $_ })
    $zNachSerie = @{}
    $zNachName = @{}
    $zustand = @{}   # ZeileId -> Hilfsdaten
    foreach ($z in $zeilenSortiert) {
        $id = [string](Get-Feld $z 'Id')
        $sn = Get-ZeilenSeriennummer $z
        $st = Get-StatusNorm (Get-Text $z 'Status')
        $zustand[$id] = [pscustomobject]@{ Zeile = $z; Seriennummer = $sn; Status = $st; Titel = (Get-Text $z 'Title') }
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
    $ueberNamenSortiert = @(@($ueberNamen) | Sort-Object `
        @{ Expression = { NormName (Get-Text $_ 'Name') } }, `
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
        if ($null -eq $z) {
            [void]$neu.Add([pscustomobject]@{ Geraet = $g; Name = (Get-Text $g 'Name'); Verlauf = 'Aus SCCM neu angelegt'; Status = 'Aktiv' })
            continue
        }
        [void]$zuordnungen.Add((New-Zuordnung $g $zustand[[string](Get-Feld $z 'Id')] 'Name'))
        [void]$belegt.Add([string](Get-Feld $z 'Id'))
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
        [void]$archivieren.Add([pscustomobject]@{
                Zeile     = $z
                ZeileId   = $id
                Titel     = $s.Titel
                StatusAlt = $s.Status
                StatusNeu = 'Archiviert'
                Verlauf   = 'In SCCM nicht mehr vorhanden, archiviert'
            })
    }

    return [pscustomobject]@{
        Zuordnungen  = @($zuordnungen.ToArray())
        Neu          = @($neu.ToArray())
        Archivieren  = @($archivieren.ToArray())
        AktiveZeilen = $aktiveZeilen
        Warnungen    = @($warnungen.ToArray())
    }
}

function New-Zuordnung {
    <#
      Baut einen Zuordnungseintrag samt Titeländerung, neuem Status und Verlaufstexten.
      $Zustand ist das Hilfsobjekt aus Get-ComputerZuordnung (Zeile, Seriennummer, Status, Titel).
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
    param($Zeilen, $AdBenutzer, [string]$Praefix)
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
        } elseif ($alt -ne '') {
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
# Nur die Telefon-Phase: braucht das AD, aber kein SCCM.
$nurTelefone = [bool]$OnlyTelefone -and -not $OnlyComputers -and -not $OnlyBenutzer

$systems = @()
$primary = @{}
if (-not $nurTelefone) {
    $osFilter = ''
    if (-not $IncludeServers) { $osFilter = " and OperatingSystemNameandVersion not like '%Server%'" }
    $systems = @(Q "select ResourceId,Name,Client,Active,Obsolete,Decommissioned,ClientVersion,ResourceDomainORWorkgroup,DistinguishedName,CreationDate,LastLogonTimestamp,LastLogonUserName,LastLogonUserDomain,IPAddresses,MACAddresses,ADSiteName,IsVirtualMachine,SMBIOSGUID,BuildExt,OperatingSystemNameandVersion,SMSUniqueIdentifier,AADDeviceID from SMS_R_System where Obsolete=0$osFilter")
    if ($OnlyDevices) { $systems = @($systems | Where-Object { $OnlyDevices -contains $_.Name }) }
    Log "SCCM: $($systems.Count) Geräte"
    $idList = ($systems | ForEach-Object { $_.ResourceId }) -join ','
    if (-not $idList) { throw 'Keine Geräte gefunden' }

    $primary = Group-ById (Q "select ResourceID,UniqueUserName,Types from SMS_UserMachineRelationship where IsActive=1")
}

if (-not $nurBenutzer -and -not $nurTelefone) {
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
$TelefonListId = [string]$cfg.TelefonListId
if ($TelefonListId -match '^<') { $TelefonListId = '' }   # Platzhalter aus der Vorlage

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
# Phase 1: Computer
# ===========================================================================
if (-not $OnlyBenutzer -and -not $OnlyTelefone) {
    if (-not $ComputerListId) { throw 'ComputerListId fehlt in der Konfiguration.' }
    $itemsBase = "/sites/$SiteId/lists/$ComputerListId/items"

    # Nur Spalten abfragen und schreiben, die es wirklich gibt.
    $cSpalten = Get-ListenSpalten $ComputerListId 'Computer-Liste' @('Status', 'Verlauf')
    $hatStatus = $cSpalten.ContainsKey('Status')
    $hatVerlauf = $cSpalten.ContainsKey('Verlauf')
    if (-not $hatStatus) { Log 'Ohne Spalte «Status» werden Archivierung und Reaktivierung nicht festgehalten.' 'WARN' }
    if (-not $hatVerlauf) { Log 'Ohne Spalte «Verlauf» werden keine Verlaufseinträge geschrieben.' 'WARN' }
    $zusatz = @('Title', 'Seriennummer')
    if ($hatStatus) { $zusatz += 'Status' }
    if ($hatVerlauf) { $zusatz += 'Verlauf' }
    $sccmFieldNames = (Build-SccmFields $systems[0]).Keys
    $select = ($zusatz -join ',') + ',' + ($sccmFieldNames -join ',')
    $items = Get-GraphAlle "$itemsBase`?`$expand=fields(`$select=$select)&`$top=500"
    Log "Computer-Liste: $($items.Count) Zeilen"

    # SCCM-Geräte auf die Felder herunterbrechen, die die Zuordnung braucht.
    $geraete = New-Object System.Collections.ArrayList
    foreach ($sys in $systems) {
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
        [void]$geraete.Add([pscustomobject]@{
                ResourceId   = $rid
                Name         = [string]$sys.Name
                Seriennummer = [string]$serial
                Aktivitaet   = $akt
                Sys          = $sys
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
                Status            = [string]$it.fields.Status
                Verlauf           = [string]$it.fields.Verlauf
                Item              = $it
            })
    }

    $plan = Get-ComputerZuordnung $geraete $zeilen
    foreach ($w in $plan.Warnungen) { Log $w 'WARN' }

    $stats = @{ updated = 0; created = 0; unchanged = 0; archiviert = 0; reaktiviert = 0; umbenannt = 0; uebersprungen = 0 }

    # --- Zugeordnete Zeilen ---------------------------------------------------
    foreach ($zu in $plan.Zuordnungen) {
        $it = $zu.Zeile.Item
        try { $fields = Build-SccmFields $zu.Geraet.Sys } catch { Log "Fehler beim Aufbereiten von $($zu.Geraet.Name): $_" 'ERROR'; $fehler++; continue }

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
                $fehler++; $stats.uebersprungen++; continue
            }
        }
        if ($delta.Count -eq 0) { $stats.unchanged++; continue }
        if ($zu.Umbenennen) { $stats.umbenannt++ }
        if ($zu.StatusAlt -eq 'Archiviert') { $stats.reaktiviert++ }
        $delta['SCCM_LastSync'] = $fields['SCCM_LastSync']
        if ($WhatIf) { Log "WHATIF Update $($zu.AlterTitel) (ID $($zu.ZeileId), Treffer über $($zu.Grund)): $($delta.Keys -join ', ')"; $stats.updated++; continue }
        try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($zu.ZeileId)/fields" -Body $delta | Out-Null; $stats.updated++; Log "Update $($zu.AlterTitel) (ID $($zu.ZeileId)): $($delta.Count) Felder" }
        catch { Log "Update-Fehler $($zu.AlterTitel): $_" 'ERROR'; $fehler++ }
    }

    # --- Neue Geräte ----------------------------------------------------------
    foreach ($n in $plan.Neu) {
        try { $fields = Build-SccmFields $n.Geraet.Sys } catch { Log "Fehler beim Aufbereiten von $($n.Name): $_" 'ERROR'; $fehler++; continue }
        $new = [ordered]@{ Title = ([string]$n.Name).ToUpperInvariant() }
        if ($hatStatus) { $new['Status'] = $n.Status }
        foreach ($k in $fields.Keys) { if ($null -ne $fields[$k]) { $new[$k] = $fields[$k] } }
        if ($hatVerlauf) { $new['Verlauf'] = Add-VerlaufEintrag -Verlauf '' -Text $n.Verlauf -Datum $now -Quelle 'sync' -Zeitpunkt $now }
        if ($WhatIf) { Log "WHATIF Neu: $($n.Name)"; $stats.created++; continue }
        try { $r = Invoke-Graph -Method POST -Uri $itemsBase -Body @{ fields = $new }; $stats.created++; Log "Neu angelegt: $($n.Name) (ID $($r.id))" }
        catch { Log "Anlage-Fehler $($n.Name): $_" 'ERROR'; $fehler++ }
    }

    # --- Zeilen ohne SCCM-Gerät: archivieren, nie löschen ---------------------
    # Die Computer-Phase kennt bewusst KEINEN Löschpfad (kein Invoke-Graph -Method DELETE).
    # Ein PC verschwindet nie aus der Liste, er wird höchstens auf Status «Archiviert» gesetzt.
    if (-not $OnlyDevices) {
        $schutz = Test-ArchivSchutz $systems.Count $plan.AktiveZeilen $plan.Archivieren.Count $LoeschSchutzProzent
        if (-not $schutz.Erlaubt) {
            Log "Archivschutz greift: $($schutz.Grund)" 'ERROR'
            $fehler++
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
                        $fehler++; $stats.uebersprungen++; continue
                    }
                }
                if ($WhatIf) { Log "WHATIF Archivieren (nicht mehr in SCCM): $($a.Titel)"; $stats.archiviert++; continue }
                try { Invoke-Graph -Method PATCH -Uri "$itemsBase/$($a.ZeileId)/fields" -Body $body | Out-Null; $stats.archiviert++; Log "Archiviert (nicht mehr in SCCM): $($a.Titel)" }
                catch { Log "Fehler beim Archivieren von $($a.Titel): $_" 'ERROR'; $fehler++ }
            }
        }
    }
    Log ('Computer fertig: {0} aktualisiert, {1} neu, {2} unverändert, {3} archiviert, {4} reaktiviert, {5} umbenannt, {6} übersprungen' -f $stats.updated, $stats.created, $stats.unchanged, $stats.archiviert, $stats.reaktiviert, $stats.umbenannt, $stats.uebersprungen)
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
    foreach ($ou in $ous) {
        if (-not $ou -or [string]$ou -match '^<') { Log "OU-Eintrag '$ou' sieht nach Platzhalter aus – bitte den echten DN eintragen." 'ERROR'; $script:fehler++; continue }
        try {
            $gefunden = Get-AdBenutzerAusOu $ou $adServer $mitModul
            Log "AD: $($gefunden.Count) Benutzer in $ou"
            foreach ($u in $gefunden) {
                $k = NormLogin $u.Login
                if ($k -eq '') { continue }
                if (-not $alle.ContainsKey($k)) { $alle[$k] = $u }
            }
        } catch { Log "AD-Fehler in OU '$ou': $_" 'ERROR'; $script:fehler++ }
    }
    Log "AD: $($alle.Count) Benutzer insgesamt"
    $script:AdBenutzerCache = $alle
    $script:AdMitModul = $mitModul
    return $alle
}

if (-not $OnlyComputers -and -not $OnlyTelefone) {
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
    Log "Programme: $(@($programme.programme).Count)"

    # 2) vorhandene Spalten feststellen: Verlauf und je Programm eine Spalte
    $erwartet = @('Verlauf') + @($programme.programme | ForEach-Object { [string]$_.id })
    $spalten = Get-ListenSpalten $BenutzerListId 'Benutzer-Liste' $erwartet
    # Nur Programme abgleichen, deren Spalte es in der Liste wirklich gibt.
    $programmIds = @($programme.programme | Where-Object { $spalten.ContainsKey([string]$_.id) } | ForEach-Object { $_.id })

    # 3) AD-Benutzer lesen
    $adBenutzer = Get-AdBenutzerAlle
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

# ===========================================================================
# Phase 3: Telefonnummern (AD-Attribut telephoneNumber)
# ===========================================================================
if (-not $OnlyComputers -and -not $OnlyBenutzer) {
    if (-not $TelefonListId) {
        Log 'TelefonListId fehlt in der Konfiguration – Telefon-Phase übersprungen (ID steht in den Listeneinstellungen und in frontend\konfig.js).' 'WARN'
    } else {
        $telefonBase = "/sites/$SiteId/lists/$TelefonListId/items"
        $praefix = $script:TelefonPraefixStandard
        if ($cfg.TelefonPraefix) { $praefix = [string]$cfg.TelefonPraefix }

        # 1) Vorhandene Spalten feststellen. Geprüft werden nur die Spalten, die diese Phase
        #    wirklich schreibt – die manuellen Spalten der Liste (Apparat, Standort, Hinweis,
        #    Früherer Eintrag) gehen den Sync nichts an.
        $tErwartet = @('Telefonnummer', 'Name', 'Typ', 'Status', 'Benutzer', 'ADLetzterSync', 'Verlauf')
        $tVorhanden = Get-ListenSpalten $TelefonListId 'Telefonliste' $tErwartet

        # 2) AD-Benutzer (aus der Benutzer-Phase, sonst jetzt lesen)
        $adBenutzer = Get-AdBenutzerAlle

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
        $tPlan = Get-TelefonAbgleich $tZeilen @($adBenutzer.Values) $praefix
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
    }
}

Log ("==== Fertig: {0} Fehler ====" -f $fehler)
if ($fehler) { exit 1 }
