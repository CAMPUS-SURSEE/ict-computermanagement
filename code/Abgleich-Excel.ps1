<#
.SYNOPSIS
  Bringt die SharePoint-Listen auf den Stand der beiden Excel-Inventare.

.DESCRIPTION
  Die Listen «ADMIN-Clients», «EDU-Clients», «Benutzer», «Software» und «Telefonnummern» sind
  seit dem Umbau vom September 2026 die führende Fassung. Die beiden Excel-Dateien daneben
  («Computer und User Inventar.xlsx», «Telefonnummerm S4B.xlsx») waren es davor und wurden
  weitergepflegt. Dieses Skript gleicht sie einmalig ab: Was in der Excel steht, gilt.

  Abgeglichen wird je Bereich:

  Clients   Blatt «Computer und User» -> Liste «ADMIN-Clients». Schlüssel ist der PC-Name.
            Übernommen werden Gebäude/Stock, Bemerkung und Beschaffungsjahr; «Ersatz geplant»
            rechnet sich aus dem Beschaffungsjahr + 5 (ohne Beschaffungsjahr zählt ein Kreuz in
            «Budget 2026/2027»). Zeilen ohne eigenes Gerät («Kein PC», «Shared CAMPUS-…») sind
            Arbeitsplätze, keine Geräte – sie zählen nur für die Inhaberschaft.
            Zusätzlich wird «In Domäne» auf Ja gesetzt, wo das Feld noch leer ist.

  Edu       Blatt «EDU-Geräte» -> Liste «EDU-Clients». Dieselben Felder; «In Domäne» kommt aus
            der Spalte «IT-Schulungraum / BIM-Labor (Domäne)». Die Geräte ohne Domäne
            (Gäste- und Prüfungsnotebooks) werden angelegt und mit «In Domäne = Nein»
            dauerhaft aus dem SCCM-Abgleich genommen.

  Software  Die Programmspalten der Excel -> Liste «Software». Fehlende Programme werden
            angelegt, samt Spalte in der Benutzer-Liste.

  Benutzer  Blatt «Computer und User» -> Liste «Benutzer». Schlüssel ist der Login.
            Übernommen werden Bemerkung, Inhaberschaft (Spalte «Computer») und die
            Programmstufen: ein Kreuz wird zu «1». Eine vom Sync gesetzte «2» (AD-Gruppe)
            bleibt stehen – sie bedeutet dasselbe und käme beim nächsten Lauf ohnehin wieder.
            Angelegt wird hier nie: die Liste kommt aus dem AD, und der Sync löscht jede
            Zeile, deren Login es im AD nicht gibt.

  Telefon   Blatt «Telefonnummer» -> Liste «Telefonnummern». Nur Bericht: Die Liste ist
            seit dem Import vom 04.09.2026 die führende Fassung und wird vom Sync aus dem AD
            nachgeführt; die Excel ist älter. Abweichungen werden gemeldet, nicht geschrieben.

  Aufräumen Geräte, die in beiden Client-Listen stehen (Rückstand aus dem Umzug vom
            08.09.2026), werden in «ADMIN-Clients» gelöscht, sobald sie in «EDU-Clients»
            vorhanden sind. Dasselbe gilt für archivierte Doppel innerhalb von «EDU-Clients»,
            die dieselbe SCCM-ResourceID tragen wie eine aktive Zeile. Gelöscht wird in den
            Papierkorb der Site (93 Tage), und vorher wird jede betroffene Zeile vollständig
            nach lokal\ gesichert.

  Mit -WhatIf wird nur gelesen, gerechnet und berichtet – immer zuerst so laufen lassen.
  Nicht während eines laufenden Syncs starten (geplante Aufgabe alle 4 h, siehe README 2.6).

.PARAMETER Bereiche
  Alle (Vorgabe), Clients, Edu, Software, Benutzer, Telefon, Aufraeumen.

.PARAMETER ExcelClients
  «Computer und User Inventar.xlsx». Vorgabe: im Wurzelverzeichnis des Repositorys.

.PARAMETER ExcelTelefon
  «Telefonnummerm S4B.xlsx». Vorgabe: im Wurzelverzeichnis des Repositorys.

.PARAMETER NeuAnmelden
  Erzwingt eine neue Device-Code-Anmeldung statt der abgelegten Sitzung (Graph-Sitzung.ps1).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Abgleich-Excel.ps1 -WhatIf
  powershell -ExecutionPolicy Bypass -File .\Abgleich-Excel.ps1

.NOTES
  Windows PowerShell 5.1. Dot-Sourcing mit $InventarNurFunktionen = $true lädt nur die
  Funktionen (kein Netzzugriff) – so prüft Test-Inventar.ps1 die Umrechnung.
#>
[CmdletBinding()]
param(
    [string]$ExcelClients,
    [string]$ExcelTelefon,
    [ValidateSet('Alle', 'Clients', 'Edu', 'Software', 'Benutzer', 'Telefon', 'Aufraeumen')]
    [string[]]$Bereiche = @('Alle'),
    [string]$ConfigPath,
    [string]$ClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e',
    [switch]$NeuAnmelden,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[Net.WebRequest]::DefaultWebProxy = [Net.WebRequest]::GetSystemWebProxy()
[Net.WebRequest]::DefaultWebProxy.Credentials = [Net.CredentialCache]::DefaultNetworkCredentials

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$ServerDir = Join-Path $ScriptDir 'server'
. (Join-Path $ServerDir 'Inventar-Gemeinsam.ps1')
. (Join-Path $ScriptDir 'Graph-Sitzung.ps1')

# ===========================================================================
# Reine Funktionen (ohne Graph – werden von Test-Inventar.ps1 geprüft)
# ===========================================================================

function ConvertTo-SpaltenIndex {
    <# Zellbezug «C12» -> Spaltennummer 3. #>
    param([string]$Bezug)
    $buchstaben = ($Bezug -replace '\d', '')
    $n = 0
    foreach ($c in $buchstaben.ToUpperInvariant().ToCharArray()) { $n = $n * 26 + ([int][char]$c - 64) }
    return $n
}

function Format-XlsxZahl {
    <#
      Zahlenzellen einer .xlsx tragen den vollen Gleitkommawert: aus «17.1» in Excel wird in der
      Datei «17.100000000000001». Ungerundet stünde dieser Rattenschwanz nachher in SharePoint.
      G15 gibt genau die Stellen zurück, die Excel selbst anzeigt, und lässt alles andere
      (Text, Datum, leere Zelle) unverändert.
    #>
    param([string]$Wert)
    if ($Wert -eq $null -or $Wert -eq '') { return $Wert }
    $d = 0.0
    if (-not [double]::TryParse($Wert, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $Wert }
    return $d.ToString('G15', [Globalization.CultureInfo]::InvariantCulture)
}

function Read-XlsxBlatt {
    <#
      Liest ein Tabellenblatt einer .xlsx-Datei ohne Excel: die Datei ist ein ZIP mit XML.
      Rückgabe: Array von Zeilen; jede Zeile ist ein String-Array (Spalte A = Index 0).
      Formeln werden nicht ausgewertet, es zählt der gespeicherte Wert.
    #>
    param([string]$Pfad, [string]$Blatt)
    if (-not (Test-Path $Pfad)) { throw "Excel-Datei nicht gefunden: $Pfad" }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $Pfad).Path)
    try {
        function LiesEintrag([string]$Name) {
            $e = $zip.GetEntry($Name)
            if (-not $e) { return $null }
            $sr = New-Object IO.StreamReader($e.Open(), [Text.Encoding]::UTF8)
            try { return $sr.ReadToEnd() } finally { $sr.Dispose() }
        }

        [xml]$wb = LiesEintrag 'xl/workbook.xml'
        [xml]$rels = LiesEintrag 'xl/_rels/workbook.xml.rels'
        $sheet = @($wb.workbook.sheets.sheet | Where-Object { $_.name -eq $Blatt })
        if ($sheet.Count -eq 0) {
            $namen = (@($wb.workbook.sheets.sheet | ForEach-Object { $_.name }) -join ', ')
            throw "Blatt '$Blatt' nicht gefunden. Vorhanden: $namen"
        }
        $rid = $sheet[0].GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $rel = @($rels.Relationships.Relationship | Where-Object { $_.Id -eq $rid })[0]
        $ziel = [string]$rel.Target
        if ($ziel.StartsWith('/')) { $ziel = $ziel.Substring(1) } else { $ziel = 'xl/' + $ziel }

        $strings = New-Object System.Collections.ArrayList
        $ssText = LiesEintrag 'xl/sharedStrings.xml'
        if ($ssText) {
            [xml]$ss = $ssText
            foreach ($si in @($ss.sst.si)) {
                $t = ''
                if ($si.t) {
                    $t = if ($si.t -is [string]) { $si.t } else { [string]$si.t.'#text' }
                } elseif ($si.r) {
                    foreach ($r in @($si.r)) { $t += $(if ($r.t -is [string]) { $r.t } else { [string]$r.t.'#text' }) }
                }
                [void]$strings.Add([string]$t)
            }
        }

        [xml]$sh = LiesEintrag $ziel
        $zeilen = New-Object System.Collections.ArrayList
        foreach ($row in @($sh.worksheet.sheetData.row)) {
            if ($null -eq $row) { continue }
            $zellen = @{}; $max = 0
            foreach ($c in @($row.c)) {
                if ($null -eq $c) { continue }
                $i = ConvertTo-SpaltenIndex ([string]$c.r)
                if ($i -gt $max) { $max = $i }
                $v = $null
                if ($c.t -eq 's') { if ($null -ne $c.v) { $v = $strings[[int]$c.v] } }
                elseif ($c.t -eq 'inlineStr') { $v = $(if ($c.is.t -is [string]) { $c.is.t } else { [string]$c.is.t.'#text' }) }
                elseif ($null -ne $c.v) { $v = Format-XlsxZahl $(if ($c.v -is [string]) { $c.v } else { [string]$c.v.'#text' }) }
                $zellen[$i] = [string]$v
            }
            $arr = @()
            for ($i = 1; $i -le $max; $i++) { $arr += [string]$zellen[$i] }
            [void]$zeilen.Add([string[]]$arr)
        }
        return @($zeilen.ToArray())
    } finally {
        $zip.Dispose()
    }
}

function Get-BlattKopf {
    <#
      Sucht die Kopfzeile eines Blatts: die erste Zeile, in der die verlangte Beschriftung steht.
      Rückgabe: @{ Zeile = <Index der Kopfzeile>; Namen = <String-Array der Beschriftungen> }.
      Über den Index laufen alle weiteren Zeilen; die Reihenfolge der Spalten ist damit egal.
    #>
    param($Zeilen, [string]$Pflichtfeld)
    $n = -1
    foreach ($z in @($Zeilen)) {
        $n++
        foreach ($c in @($z)) {
            if (([string]$c).Trim() -eq $Pflichtfeld) {
                $namen = @(@($z) | ForEach-Object { ([string]$_).Trim() })
                return @{ Zeile = $n; Namen = $namen }
            }
        }
    }
    throw "Kopfzeile mit '$Pflichtfeld' nicht gefunden."
}

function Get-SpaltenIndex {
    <#
      Index der Spalte mit dieser Beschriftung; -1, wenn es sie nicht gibt.
      $Nte wählt bei mehrfach vergebenen Beschriftungen das n-te Vorkommen (1-basiert) –
      «Human Resources» steht in der Excel zweimal: als Protel-Abteilung und als ABACUS-Modul.
    #>
    param($Kopf, [string]$Name, [int]$Nte = 1)
    $treffer = 0
    for ($i = 0; $i -lt $Kopf.Namen.Count; $i++) {
        if ($Kopf.Namen[$i] -eq $Name) {
            $treffer++
            if ($treffer -eq $Nte) { return $i }
        }
    }
    return -1
}

function Get-ZellWert {
    <# Wert einer Zelle als getrimmter Text; fehlende Spalte oder fehlende Zelle wird ''. #>
    param($Zeile, [int]$Index)
    if ($Index -lt 0) { return '' }
    $z = @($Zeile)
    if ($Index -ge $z.Count) { return '' }
    return ([string]$z[$Index]).Trim()
}

function Test-EigenesGeraet {
    <#
      Trägt diese Excel-Zeile ein eigenes Gerät? «Kein PC» heisst: die Person arbeitet ohne
      eigenes Gerät, «Shared CAMPUS-070» heisst: sie teilt das Gerät einer anderen Person.
      Beides sind Arbeitsplätze, keine Geräte – in den Client-Listen haben sie nichts verloren,
      und Inhaberin ist die Person auch nicht.
    #>
    param([string]$PcName)
    $n = ([string]$PcName).Trim()
    if ($n -eq '') { return $false }
    if ($n -match '^(?i)kein\s*pc$') { return $false }
    if ($n -match '^(?i)shared\b') { return $false }
    return $true
}

function Split-GeraeteName {
    <#
      Im EDU-Blatt steht der Standort im selben Feld wie der Gerätename:
        «EDU-155-01»                                 -> Name «EDU-155-01», Standort «»
        «EDULAP-031 Konferenzsaal 1»                 -> Name «EDULAP-031», Standort «Konferenzsaal 1»
        «EDULAP-101 - Seminarsupport (ehemals Gbd 1)» -> Name «EDULAP-101», Standort «Seminarsupport (ehemals Gbd 1)»
      Der Name ist das erste Wort: Buchstaben, Ziffern und Bindestriche ohne Leerzeichen.
      Damit bleibt «EDU-155-01» ganz, und alles nach dem ersten Leerzeichen wird zum Standort.
    #>
    param([string]$Text)
    $t = ([string]$Text).Trim()
    if ($t -eq '') { return [pscustomobject]@{ Name = ''; Standort = '' } }
    $m = [regex]::Match($t, '^(?<name>[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\s*(?<rest>.*)$')
    if (-not $m.Success) { return [pscustomobject]@{ Name = $t; Standort = '' } }
    $rest = ([string]$m.Groups['rest'].Value).Trim()
    $rest = ($rest -replace '^[-–—]\s*', '').Trim()
    return [pscustomobject]@{ Name = [string]$m.Groups['name'].Value; Standort = $rest }
}

function Merge-GeraeteZeilen {
    <#
      Fasst Excel-Zeilen zusammen, die dasselbe Gerät meinen. Im EDU-Blatt steht «EDULAP-147»
      zweimal: einmal mit Standort, einmal mit Seriennummer – dieselbe Maschine, zwei Zeilen.
      Ohne dieses Zusammenfassen entstünden zwei Zeilen in SharePoint.

      Zusammengefasst wird über den Gerätenamen (ohne Gross-/Kleinschreibung). Es gewinnt die
      erste Zeile; leere Felder füllen spätere Zeilen auf, «In Domäne» ist Ja, sobald eine der
      Zeilen es sagt. Rückgabe: @{ Geraete = <Liste>; Doppelt = <Namen der Dubletten> }.
    #>
    param($Geraete, [string[]]$Felder)
    $reihenfolge = New-Object System.Collections.ArrayList
    $nach = @{}
    $doppelt = New-Object System.Collections.ArrayList
    foreach ($g in @($Geraete)) {
        $k = ([string]$g.Title).ToUpperInvariant()
        if ($k -eq '') { continue }
        if (-not $nach.ContainsKey($k)) {
            $nach[$k] = $g
            [void]$reihenfolge.Add($k)
            continue
        }
        [void]$doppelt.Add([string]$g.Title)
        $vorhanden = $nach[$k]
        foreach ($f in @($Felder)) {
            if ((Get-Text $vorhanden $f) -eq '' -and (Get-Text $g $f) -ne '') {
                $vorhanden | Add-Member -NotePropertyName $f -NotePropertyValue (Get-Feld $g $f) -Force
            }
        }
        if ((Get-Feld $g 'InDomaene') -eq $true) {
            $vorhanden | Add-Member -NotePropertyName 'InDomaene' -NotePropertyValue $true -Force
        }
    }
    return @{
        Geraete = @($reihenfolge | ForEach-Object { $nach[$_] })
        Doppelt = @($doppelt.ToArray())
    }
}

function Get-BeschaffungsjahrAusKreuzen {
    <#
      Aus den angekreuzten Jahresspalten das Beschaffungsjahr ableiten: das jüngste Jahr.
      Mehrere Kreuze bedeuten «Gerät wurde ersetzt» – dann zählt der letzte Kauf.
      $Budgetjahr (die Spalte «Budget 2026/2027» bzw. «2026/2027» im EDU-Blatt) ist kein Kauf,
      sondern eine Planung und wird darum nie zum Beschaffungsjahr.
    #>
    param([string[]]$Jahre, [string]$Budgetjahr)
    $letztes = ''
    foreach ($j in @($Jahre)) {
        if ($j -eq $Budgetjahr) { continue }
        if (-not (Test-Gj $j)) { continue }
        if ($letztes -eq '' -or (Get-GjVergleich $j $letztes) -gt 0) { $letztes = $j }
    }
    return $letztes
}

function Get-ErsatzGeplant {
    <#
      «Ersatz geplant» aus dem Beschaffungsjahr: Beschaffung + 5 Jahre. Das ist die Regel, nach
      der die Liste seit dem Aufbau geführt wird, und dieselbe, die das Frontend vorschlägt.
      Nur wenn es gar kein Beschaffungsjahr gibt, zählt ein Kreuz in der Budgetspalte.
    #>
    param([string]$Beschaffungsjahr, [bool]$Budget, [string]$Budgetjahr)
    if (Test-Gj $Beschaffungsjahr) { return Get-GjPlus $Beschaffungsjahr 5 }
    if ($Budget) { return $Budgetjahr }
    return ''
}

function ConvertFrom-ClientBlatt {
    <#
      Blatt «Computer und User» -> ein Objekt je Zeile mit allem, was die Listen brauchen.
      Die Programmkreuze kommen als Hashtable «Spaltenindex -> Wert» mit; welcher Index zu
      welchem Programm gehört, entscheidet erst Get-ProgrammZuordnung.
    #>
    param($Zeilen)
    $kopf = Get-BlattKopf $Zeilen 'Arbeitsplatz'
    $iLogin = Get-SpaltenIndex $kopf 'Login'
    $iPc = Get-SpaltenIndex $kopf 'PC-Name'
    $iGeb = Get-SpaltenIndex $kopf 'Gebäude / Stock'
    $iBem = Get-SpaltenIndex $kopf 'Bemerkung'
    $iTyp = Get-SpaltenIndex $kopf 'Typ'
    $iFirma = Get-SpaltenIndex $kopf 'Firma'
    $iArb = Get-SpaltenIndex $kopf 'Arbeitsplatz'
    $budgetJahr = '2026/2027'
    $iBudget = Get-SpaltenIndex $kopf "Budget $budgetJahr"

    # Jahresspalten: alles, was wie ein Geschäftsjahr aussieht, plus die Budgetspalte.
    # Bewusst eine gewöhnliche Hashtable: [ordered] würde einen ganzzahligen Schlüssel als
    # Position lesen statt als Schlüssel, und die Reihenfolge spielt hier keine Rolle.
    $jahrIndex = @{}
    for ($i = 0; $i -lt $kopf.Namen.Count; $i++) {
        if (Test-Gj $kopf.Namen[$i]) { $jahrIndex[$i] = $kopf.Namen[$i] }
    }
    # Programmspalten: alles rechts der Spalte «Budget 2026/2027».
    $ersteProgramm = $iBudget + 1

    $ergebnis = New-Object System.Collections.ArrayList
    for ($z = $kopf.Zeile + 1; $z -lt @($Zeilen).Count; $z++) {
        $zeile = @($Zeilen)[$z]
        $arbeitsplatz = Get-ZellWert $zeile $iArb
        $pc = Get-ZellWert $zeile $iPc
        if ($arbeitsplatz -eq '' -and $pc -eq '') { continue }

        $jahre = @()
        foreach ($i in $jahrIndex.Keys) { if ((Get-ZellWert $zeile $i) -ne '') { $jahre += [string]$jahrIndex[$i] } }
        $beschaffung = Get-BeschaffungsjahrAusKreuzen $jahre $budgetJahr
        $budget = ((Get-ZellWert $zeile $iBudget) -ne '')

        $programme = @{}
        for ($i = $ersteProgramm; $i -lt $kopf.Namen.Count; $i++) {
            if ($kopf.Namen[$i] -eq '') { continue }
            $w = Get-ZellWert $zeile $i
            if ($w -ne '') { $programme[$i] = $w }
        }

        [void]$ergebnis.Add([pscustomobject]@{
                Arbeitsplatz     = $arbeitsplatz
                Login            = (Get-ZellWert $zeile $iLogin)
                PcName           = $pc
                EigenesGeraet    = (Test-EigenesGeraet $pc)
                GebaeudeStock    = (Get-ZellWert $zeile $iGeb)
                Bemerkung        = (Get-ZellWert $zeile $iBem)
                Typ              = (Get-ZellWert $zeile $iTyp)
                Firma            = (Get-ZellWert $zeile $iFirma)
                Beschaffungsjahr = $beschaffung
                ErsatzGeplant    = (Get-ErsatzGeplant $beschaffung $budget $budgetJahr)
                Programme        = $programme
            })
    }
    return [pscustomobject]@{ Kopf = $kopf; Zeilen = @($ergebnis.ToArray()); ErsteProgrammSpalte = $ersteProgramm }
}

function ConvertFrom-EduBlatt {
    <#
      Blatt «EDU-Geräte» -> ein Objekt je Gerät. Der Gerätename steht auch hier in
      «Arbeitsplatz». Zeilen ohne Namen (noch nicht beschriftete Geräte) und die Zählzeile am
      Schluss fallen weg; der Aufrufer meldet, wie viele es waren.
    #>
    param($Zeilen)
    $kopf = Get-BlattKopf $Zeilen 'Arbeitsplatz'
    $iName = Get-SpaltenIndex $kopf 'Arbeitsplatz'
    $iBem = Get-SpaltenIndex $kopf 'Bemerkung'
    $iTyp = Get-SpaltenIndex $kopf 'Typ'
    $iSerie = Get-SpaltenIndex $kopf 'Seriennummer'
    $iDomaene = Get-SpaltenIndex $kopf 'IT-Schulungraum / BIM-Labor (Domäne)'
    $budgetJahr = '2026/2027'

    $jahrIndex = @{}
    for ($i = 0; $i -lt $kopf.Namen.Count; $i++) {
        if (Test-Gj $kopf.Namen[$i]) { $jahrIndex[$i] = $kopf.Namen[$i] }
    }
    $iBudget = Get-SpaltenIndex $kopf $budgetJahr

    $ergebnis = New-Object System.Collections.ArrayList
    $ohneNamen = 0
    for ($z = $kopf.Zeile + 1; $z -lt @($Zeilen).Count; $z++) {
        $zeile = @($Zeilen)[$z]
        $name = Get-ZellWert $zeile $iName
        if ($name -eq '') {
            # Zeile mit Inhalt, aber ohne Gerätenamen (z. B. noch nicht beschriftetes Gerät)
            if ((Get-ZellWert $zeile $iSerie) -ne '' -or (Get-ZellWert $zeile $iTyp) -ne '') { $ohneNamen++ }
            continue
        }
        $jahre = @()
        foreach ($i in $jahrIndex.Keys) { if ((Get-ZellWert $zeile $i) -ne '') { $jahre += [string]$jahrIndex[$i] } }
        $beschaffung = Get-BeschaffungsjahrAusKreuzen $jahre $budgetJahr
        $budget = ((Get-ZellWert $zeile $iBudget) -ne '')
        $geteilt = Split-GeraeteName $name
        [void]$ergebnis.Add([pscustomobject]@{
                Title            = $geteilt.Name
                GebaeudeStock    = $geteilt.Standort
                Bemerkung        = (Get-ZellWert $zeile $iBem)
                Typ              = (Get-ZellWert $zeile $iTyp)
                Seriennummer     = (Get-ZellWert $zeile $iSerie)
                InDomaene        = ((Get-ZellWert $zeile $iDomaene) -ne '')
                Beschaffungsjahr = $beschaffung
                ErsatzGeplant    = (Get-ErsatzGeplant $beschaffung $budget $budgetJahr)
            })
    }
    return [pscustomobject]@{ Kopf = $kopf; Geraete = @($ergebnis.ToArray()); OhneNamen = $ohneNamen }
}

# Programme, die es in der Excel gibt, in der Liste «Software» aber noch nicht. Die Id wird der
# interne Spaltenname der Benutzer-Liste und ist danach unveränderlich (Test-ProgrammId).
# «Reihenfolge» reiht sie in die bestehenden Kategorien ein: Firefox zwischen Spezial- (bis 660)
# und Technik-Software (ab 670), die Messgeräte-Programme in die Technik-Software, und die
# Protel-Abteilungen als eigene Kategorie hinter Bpanda (bis 710).
$script:NeueProgramme = @(
    [pscustomobject]@{ Spalte = 'Firefox';            Id = 'Firefox';                Name = 'Firefox';            Kategorie = 'Spezial-Software';   Reihenfolge = 665 }
    [pscustomobject]@{ Spalte = 'AutoCAD LT';         Id = 'AutoCADLT';              Name = 'AutoCAD LT';         Kategorie = 'Technik-Software';   Reihenfolge = 671 }
    [pscustomobject]@{ Spalte = 'Chauvin Arnoux';     Id = 'ChauvinArnoux';          Name = 'Chauvin Arnoux';     Kategorie = 'Technik-Software';   Reihenfolge = 672 }
    [pscustomobject]@{ Spalte = 'ELDES Config Tool';  Id = 'ELDESConfigTool';        Name = 'ELDES Config Tool';  Kategorie = 'Technik-Software';   Reihenfolge = 673 }
    [pscustomobject]@{ Spalte = 'ETS 6 (KNX)';        Id = 'ETS6KNX';                Name = 'ETS 6 (KNX)';        Kategorie = 'Technik-Software';   Reihenfolge = 674 }
    [pscustomobject]@{ Spalte = 'Gate Control';       Id = 'GateControl';            Name = 'Gate Control';       Kategorie = 'Technik-Software';   Reihenfolge = 675 }
    [pscustomobject]@{ Spalte = 'Testo';              Id = 'Testo';                  Name = 'Testo';              Kategorie = 'Technik-Software';   Reihenfolge = 676 }
    [pscustomobject]@{ Spalte = 'Wöhler';             Id = 'Woehler';                Name = 'Wöhler';             Kategorie = 'Technik-Software';   Reihenfolge = 677 }
    [pscustomobject]@{ Spalte = 'Bildung';            Id = 'ProtelBildung';          Name = 'Bildung';            Kategorie = 'Protel-Abteilungen'; Reihenfolge = 720 }
    [pscustomobject]@{ Spalte = 'Direktion';          Id = 'ProtelDirektion';        Name = 'Direktion';          Kategorie = 'Protel-Abteilungen'; Reihenfolge = 730 }
    [pscustomobject]@{ Spalte = 'Sport';              Id = 'ProtelSport';            Name = 'Sport';              Kategorie = 'Protel-Abteilungen'; Reihenfolge = 740 }
    [pscustomobject]@{ Spalte = 'Finanzen';           Id = 'ProtelFinanzen';         Name = 'Finanzen';           Kategorie = 'Protel-Abteilungen'; Reihenfolge = 750 }
    [pscustomobject]@{ Spalte = 'Human Resources';    Id = 'ProtelHumanResources';   Name = 'Human Resources';    Kategorie = 'Protel-Abteilungen'; Reihenfolge = 760; Nte = 1 }
    [pscustomobject]@{ Spalte = 'HWS/Support';        Id = 'ProtelHwsSupport';       Name = 'HWS/Support';        Kategorie = 'Protel-Abteilungen'; Reihenfolge = 770 }
    [pscustomobject]@{ Spalte = 'Infrastruktur';      Id = 'ProtelInfrastruktur';    Name = 'Infrastruktur';      Kategorie = 'Protel-Abteilungen'; Reihenfolge = 780 }
    [pscustomobject]@{ Spalte = 'Lernende';           Id = 'ProtelLernende';         Name = 'Lernende';           Kategorie = 'Protel-Abteilungen'; Reihenfolge = 790 }
    [pscustomobject]@{ Spalte = 'Manager';            Id = 'ProtelManager';          Name = 'Manager';            Kategorie = 'Protel-Abteilungen'; Reihenfolge = 800 }
    [pscustomobject]@{ Spalte = 'MarKom';             Id = 'ProtelMarKom';           Name = 'MarKom';             Kategorie = 'Protel-Abteilungen'; Reihenfolge = 810 }
    [pscustomobject]@{ Spalte = 'Nachdienst';         Id = 'ProtelNachdienst';       Name = 'Nachdienst';         Kategorie = 'Protel-Abteilungen'; Reihenfolge = 820 }
    [pscustomobject]@{ Spalte = 'Reception';          Id = 'ProtelReception';        Name = 'Reception';          Kategorie = 'Protel-Abteilungen'; Reihenfolge = 830 }
    [pscustomobject]@{ Spalte = 'Resto';              Id = 'ProtelResto';            Name = 'Resto';              Kategorie = 'Protel-Abteilungen'; Reihenfolge = 840 }
    [pscustomobject]@{ Spalte = 'Technischer Dienst'; Id = 'ProtelTechnischerDienst'; Name = 'Technischer Dienst'; Kategorie = 'Protel-Abteilungen'; Reihenfolge = 850 }
    [pscustomobject]@{ Spalte = 'Veranstaltungen';    Id = 'ProtelVeranstaltungen';  Name = 'Veranstaltungen';    Kategorie = 'Protel-Abteilungen'; Reihenfolge = 860 }
)

# Excel-Beschriftungen, die anders heissen als das Programm in der Liste «Software».
# «Human Resources» steht zweimal in der Excel: das zweite Vorkommen ist das ABACUS-Modul.
$script:ProgrammAlias = @{ 'Human Resources#2' = 'AbacusHumanResources' }

function Get-ProgrammZuordnung {
    <#
      Ordnet jeder Programmspalte der Excel eine Programm-Id zu.
        1. NeueProgramme (Beschriftung, bei Mehrfachnamen das $Nte Vorkommen)
        2. ProgrammAlias («Beschriftung#n» -> Id)
        3. Name in der Liste «Software»
      Rückgabe: Hashtable «Spaltenindex -> Programm-Id». Spalten ohne Zuordnung fehlen darin;
      der Aufrufer meldet sie.
    #>
    param($Kopf, [int]$ErsteSpalte, $SoftwareNachName)
    $zuordnung = @{}
    $gesehen = @{}
    for ($i = $ErsteSpalte; $i -lt $Kopf.Namen.Count; $i++) {
        $name = $Kopf.Namen[$i]
        if ($name -eq '') { continue }
        if (-not $gesehen.ContainsKey($name)) { $gesehen[$name] = 0 }
        $gesehen[$name]++
        $nte = $gesehen[$name]

        $neu = @($script:NeueProgramme | Where-Object {
                $_.Spalte -eq $name -and ($null -eq (Get-Feld $_ 'Nte') -or [int](Get-Feld $_ 'Nte') -eq $nte)
            })
        if ($neu.Count -gt 0) { $zuordnung[$i] = [string]$neu[0].Id; continue }

        $alias = $script:ProgrammAlias["$name#$nte"]
        if ($alias) { $zuordnung[$i] = [string]$alias; continue }

        if ($SoftwareNachName -and $SoftwareNachName.ContainsKey($name)) { $zuordnung[$i] = [string]$SoftwareNachName[$name]; continue }
    }
    return $zuordnung
}

function Get-ExcelLoginSchluessel {
    <#
      Vergleichsschlüssel für einen Login aus der Excel. Zusätzlich zu NormLogin fallen
      Leerzeichen weg: In der Excel steht «Thameur. Midassi», im AD «Thameur.Midassi» –
      ein sAMAccountName enthält nie ein Leerzeichen, das Trennen kostet also nichts.
    #>
    param([string]$Login)
    return (NormLogin (([string]$Login) -replace '\s', ''))
}

function Find-BenutzerZeile {
    <#
      Sucht die Zeile der Benutzer-Liste zu einem Excel-Login. Drei Wege, in dieser Reihenfolge:

        1. der Login selbst,
        2. der auf 20 Zeichen gekürzte Login – ein sAMAccountName ist höchstens 20 Zeichen lang,
           «Michael.Roethlisberger» heisst im AD darum «Michael.Roethlisberg»,
        3. der Anzeigename: In der Excel steht der Name in «Arbeitsplatz» genau so wie im
           AD-Feld «Anzeigename» («Fruman Karina»). Das fängt Tippfehler im Login ab
           («Karina.Frumann»), aber nur, wenn der Name eindeutig ist.

      Rückgabe: @{ Zeile = <Item oder $null>; Weg = 'Login' | 'Gekürzt' | 'Anzeigename' | '' }.
    #>
    param($NachLogin, $NachAnzeigename, [string]$Login, [string]$Anzeigename)
    $k = Get-ExcelLoginSchluessel $Login
    if ($k -ne '' -and $NachLogin.ContainsKey($k)) { return @{ Zeile = $NachLogin[$k]; Weg = 'Login' } }
    if ($k.Length -gt 20) {
        $kurz = $k.Substring(0, 20)
        if ($NachLogin.ContainsKey($kurz)) { return @{ Zeile = $NachLogin[$kurz]; Weg = 'Gekürzt' } }
    }
    $n = ([string]$Anzeigename).Trim().ToLowerInvariant()
    if ($n -ne '' -and $NachAnzeigename.ContainsKey($n)) {
        $treffer = @($NachAnzeigename[$n])
        if ($treffer.Count -eq 1) { return @{ Zeile = $treffer[0]; Weg = 'Anzeigename' } }
    }
    return @{ Zeile = $null; Weg = '' }
}

function Get-ProgrammstufeNeu {
    <#
      Welche Stufe gehört in die Benutzer-Liste?
        Excel angekreuzt  + SharePoint 2  -> 2 bleibt (die AD-Gruppe sagt dasselbe, und der
                                             nächste Sync setzte eine 1 ohnehin wieder auf 2)
        Excel angekreuzt  + sonst         -> 1
        Excel leer        + SharePoint 2  -> 2 bleibt (das entscheidet die AD-Gruppe, nicht die Excel)
        Excel leer        + sonst         -> 0
      Rückgabe: der zu schreibende Wert, oder $null, wenn nichts zu ändern ist.
    #>
    param([bool]$Angekreuzt, [string]$Ist)
    $ist = ([string]$Ist).Trim()
    if ($ist -eq '2') { return $null }
    $soll = $(if ($Angekreuzt) { '1' } else { '0' })
    if ($ist -eq $soll) { return $null }
    if (-not $Angekreuzt -and $ist -eq '') { return $null }   # leer und 0 sind dasselbe
    return $soll
}

function Get-TelefonStatusAusAlt {
    <#
      Status der alten Excel-Telefonliste -> Aktiv, Inaktiv oder Frei. Dieselbe Umrechnung wie
      beim Import vom 04.09.2026, damit der Vergleich nicht an der Schreibweise scheitert.
    #>
    param([string]$Status, [string]$Name, [string]$Hinweis)
    $s = ([string]$Status).Trim().ToLowerInvariant()
    $n = ([string]$Name).Trim()
    $istFreiName = ($n -eq '' -or $n.ToUpperInvariant() -eq 'FREI')
    if ($s -eq 'aktiv') { if ($istFreiName) { return 'Frei' } else { return 'Aktiv' } }
    if ($s -eq 'inaktiv') {
        if ($istFreiName -or ([string]$Hinweis) -match '(?i)\bfrei\b') { return 'Frei' }
        return 'Inaktiv'
    }
    if ($istFreiName) { return 'Frei' }
    return 'Aktiv'
}

if ($InventarNurFunktionen) { return }

# ===========================================================================
# Hauptteil
# ===========================================================================

$RepoDir = Split-Path -Parent $ScriptDir
if (-not $ExcelClients) { $ExcelClients = Join-Path $RepoDir 'Computer und User Inventar.xlsx' }
if (-not $ExcelTelefon) { $ExcelTelefon = Join-Path $RepoDir 'Telefonnummerm S4B.xlsx' }
if (-not $ConfigPath) { $ConfigPath = Join-Path $ServerDir 'Sync-Inventar.config.json' }

$cfg = Get-InventarKonfiguration -KonfigPfad $ConfigPath -FrontendPfad (Join-Path $RepoDir 'frontend\konfig.js')
Set-InventarLog (Join-Path $ScriptDir 'Abgleich-Excel.log')

$alle = ($Bereiche -contains 'Alle')
function Bereich([string]$Name) { return ($alle -or $Bereiche -contains $Name) }

$script:fehler = 0
$stat = [ordered]@{}
function Zaehle([string]$Was, [int]$Wieviel = 1) {
    if (-not $stat.Contains($Was)) { $stat[$Was] = 0 }
    $stat[$Was] += $Wieviel
}

Log '==== Abgleich Excel -> SharePoint: Start ===='
if ($WhatIf) { Log 'WHATIF: Es wird nur gelesen und gerechnet, nichts geschrieben.' }
Log "Excel Clients : $ExcelClients"
Log "Excel Telefon : $ExcelTelefon"

# --- 1) Excel lesen (ohne Netz) ---------------------------------------------
$cuBlatt = ConvertFrom-ClientBlatt (Read-XlsxBlatt $ExcelClients 'Computer und User')
$eduBlatt = ConvertFrom-EduBlatt (Read-XlsxBlatt $ExcelClients 'EDU-Geräte')
Log "Blatt «Computer und User»: $($cuBlatt.Zeilen.Count) Zeilen, davon $(@($cuBlatt.Zeilen | Where-Object { $_.EigenesGeraet }).Count) mit eigenem Gerät"
Log "Blatt «EDU-Geräte»: $($eduBlatt.Geraete.Count) Geräte mit Namen, $($eduBlatt.OhneNamen) Zeile(n) ohne Namen übersprungen"

$eduZusammen = Merge-GeraeteZeilen $eduBlatt.Geraete @('GebaeudeStock', 'Bemerkung', 'Typ', 'Seriennummer', 'Beschaffungsjahr', 'ErsatzGeplant')
$eduGeraete = @($eduZusammen.Geraete)
if (@($eduZusammen.Doppelt).Count -gt 0) {
    Log "Blatt «EDU-Geräte»: $(@($eduZusammen.Doppelt).Count) Gerät(e) stehen mehrfach und wurden zusammengefasst: $(@($eduZusammen.Doppelt) -join ', ')" 'WARN'
}
Log "EDU-Geräte nach dem Zusammenfassen: $($eduGeraete.Count)"

# --- 2) Anmelden -------------------------------------------------------------
Connect-GraphSitzung -TenantId $cfg.TenantId -ClientId $ClientId -Neu:$NeuAnmelden | Out-Null
$SiteId = $cfg.SiteId
if (-not $SiteId) {
    $u = [uri]$cfg.SiteUrl
    $SiteId = (Invoke-Graph -Uri ('/sites/{0}:{1}' -f $u.Host, $u.AbsolutePath)).id
}
Log "Site: $SiteId"

$LokalDir = Join-Path $RepoDir 'lokal'
if (-not (Test-Path $LokalDir)) { [void](New-Item -ItemType Directory -Path $LokalDir -Force) }
$Stempel = (Get-Date).ToString('yyyyMMdd-HHmmss')

function Lies-Liste {
    <# Alle Zeilen einer Liste samt Feldern. #>
    param([string]$ListId, [string]$Name)
    if (-not $ListId) { throw "$Name`: keine Listen-Id in der Konfiguration." }
    $items = Get-GraphAlle "/sites/$SiteId/lists/$ListId/items?`$expand=fields&`$top=999"
    Log "$Name`: $(@($items).Count) Zeilen gelesen"
    return @($items)
}

function Schreib-Felder {
    <# PATCH auf die Felder einer Zeile, mit -WhatIf und Fehlerzählung. #>
    param([string]$ListId, [string]$ItemId, $Felder, [string]$Was)
    if (@($Felder.Keys).Count -eq 0) { return $false }
    $text = (@($Felder.Keys | ForEach-Object { "$_=$($Felder[$_])" }) -join ', ')
    if ($WhatIf) { Log "  WHATIF $Was`: $text"; return $true }
    try {
        Invoke-Graph -Method PATCH -Uri "/sites/$SiteId/lists/$ListId/items/$ItemId/fields" -Body $Felder | Out-Null
        Log "  $Was`: $text"
        return $true
    } catch {
        Log "  $Was fehlgeschlagen: $_" 'ERROR'
        $script:fehler++
        return $false
    }
}

function Neu-Zeile {
    <# POST einer neuen Zeile. #>
    param([string]$ListId, $Felder, [string]$Was)
    if ($WhatIf) { Log "  WHATIF $Was"; return $true }
    try {
        Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$ListId/items" -Body @{ fields = $Felder } | Out-Null
        Log "  $Was"
        return $true
    } catch {
        Log "  $Was fehlgeschlagen: $_" 'ERROR'
        $script:fehler++
        return $false
    }
}

function Loesch-Zeile {
    <# DELETE einer Zeile (Papierkorb der Site, 93 Tage). #>
    param([string]$ListId, [string]$ItemId, [string]$Was)
    if ($WhatIf) { Log "  WHATIF $Was"; return $true }
    try {
        Invoke-Graph -Method DELETE -Uri "/sites/$SiteId/lists/$ListId/items/$ItemId" | Out-Null
        Log "  $Was"
        return $true
    } catch {
        Log "  $Was fehlgeschlagen: $_" 'ERROR'
        $script:fehler++
        return $false
    }
}

function Neuer-Verlauf {
    <# Ein einzelner Verlaufseintrag als Spaltentext, für eine frisch angelegte Zeile. #>
    param([string]$Text)
    return (Add-VerlaufEintrag -Verlauf '' -Text $Text -Quelle 'sync')
}

# ===========================================================================
# Phase Clients: Blatt «Computer und User» -> Liste «ADMIN-Clients»
# ===========================================================================
$adminItems = $null
if (Bereich 'Clients' -or (Bereich 'Aufraeumen')) {
    $adminItems = Lies-Liste $cfg.AdminClientListId 'ADMIN-Clients'
}

if (Bereich 'Clients') {
    Log '--- Clients: ADMIN-Clients gegen das Blatt «Computer und User» ---'
    $nachTitel = @{}
    foreach ($it in $adminItems) {
        $t = (Get-Text $it.fields 'Title').ToUpperInvariant()
        if ($t -eq '') { continue }
        if (-not $nachTitel.ContainsKey($t)) { $nachTitel[$t] = New-Object System.Collections.ArrayList }
        [void]$nachTitel[$t].Add($it)
    }

    $bearbeitet = @{}
    foreach ($e in @($cuBlatt.Zeilen | Where-Object { $_.EigenesGeraet })) {
        $schluessel = $e.PcName.ToUpperInvariant()
        # Steht derselbe PC-Name in zwei Excel-Zeilen (zwei Personen am selben Gerät), zählt die
        # erste; die zweite würde sonst eine zweite Zeile in SharePoint anlegen.
        if ($bearbeitet.ContainsKey($schluessel)) {
            Log "  «$($e.PcName)» steht mehrfach im Blatt (zuletzt bei «$($e.Arbeitsplatz)») – nur die erste Zeile zählt." 'WARN'
            continue
        }
        $bearbeitet[$schluessel] = $true
        $kandidaten = @()
        if ($nachTitel.ContainsKey($schluessel)) {
            # Bei mehreren gleichnamigen Zeilen zählt die nicht archivierte.
            $kandidaten = @($nachTitel[$schluessel] | Where-Object { (Get-StatusNorm (Get-Text $_.fields 'Status')) -ne 'Archiviert' })
            if ($kandidaten.Count -eq 0) { $kandidaten = @($nachTitel[$schluessel]) }
        }
        if ($kandidaten.Count -eq 0) {
            # Gerät nur in der Excel: anlegen. Steht es nicht in SCCM, archiviert der nächste
            # Sync es – das ist für ADMIN-Clients richtig so (Geräte ohne Domäne gehören in
            # die EDU-Liste und tragen dort «In Domäne = Nein»).
            $felder = [ordered]@{
                Title            = $e.PcName
                GebaeudeStock    = $e.GebaeudeStock
                Bemerkung        = $e.Bemerkung
                Beschaffungsjahr = $e.Beschaffungsjahr
                ErsatzGeplant    = $e.ErsatzGeplant
                Status           = 'Aktiv'
                InDomaene        = $true
                Verlauf          = (Neuer-Verlauf 'Aus dem Excel-Inventar übernommen')
            }
            if (Neu-Zeile $cfg.AdminClientListId $felder "ADMIN-Clients: «$($e.PcName)» angelegt") { Zaehle 'Clients angelegt' }
            continue
        }

        $it = $kandidaten[0]
        $aenderung = [ordered]@{}
        foreach ($paar in @(@('GebaeudeStock', $e.GebaeudeStock), @('Bemerkung', $e.Bemerkung),
                @('Beschaffungsjahr', $e.Beschaffungsjahr), @('ErsatzGeplant', $e.ErsatzGeplant))) {
            if ((Get-Text $it.fields $paar[0]) -ne [string]$paar[1]) { $aenderung[$paar[0]] = [string]$paar[1] }
        }
        # «In Domäne» ist bei ADMIN-Clients immer Ja; gesetzt wird nur, wo das Feld noch fehlt.
        if ($null -eq (Get-Feld $it.fields 'InDomaene')) { $aenderung['InDomaene'] = $true }
        if (@($aenderung.Keys).Count -gt 0) {
            if (Schreib-Felder $cfg.AdminClientListId $it.id $aenderung "ADMIN-Clients «$(Get-Text $it.fields 'Title')»") { Zaehle 'Clients geändert' }
        } else {
            Zaehle 'Clients unverändert'
        }
    }

    # Zeilen, die es nur in SharePoint gibt: unangetastet lassen, aber melden.
    $excelNamen = @{}
    foreach ($e in @($cuBlatt.Zeilen | Where-Object { $_.EigenesGeraet })) { $excelNamen[$e.PcName.ToUpperInvariant()] = $true }
    foreach ($it in $adminItems) {
        $t = Get-Text $it.fields 'Title'
        if ($t -eq '' -or $excelNamen.ContainsKey($t.ToUpperInvariant())) { continue }
        if ((Get-ClientListe $t) -eq 'edu') { continue }   # gehören in die EDU-Liste, siehe Aufräumen
        Log "  Nur in SharePoint (bleibt stehen): «$t» – Status $(Get-StatusNorm (Get-Text $it.fields 'Status')), in SCCM $(Get-Text $it.fields 'SCCM_Found')"
        Zaehle 'Clients nur in SharePoint'
        # Auch diesen Zeilen fehlt die neue Spalte noch.
        if ($null -eq (Get-Feld $it.fields 'InDomaene')) {
            if (Schreib-Felder $cfg.AdminClientListId $it.id ([ordered]@{ InDomaene = $true }) "ADMIN-Clients «$t»") { Zaehle 'Clients geändert' }
        }
    }
}

# ===========================================================================
# Phase Edu: Blatt «EDU-Geräte» -> Liste «EDU-Clients»
# ===========================================================================
$eduItems = $null
if ((Bereich 'Edu') -or (Bereich 'Aufraeumen')) {
    $eduItems = Lies-Liste $cfg.EduClientListId 'EDU-Clients'
}

if (Bereich 'Edu') {
    Log '--- Edu: EDU-Clients gegen das Blatt «EDU-Geräte» ---'
    $nachTitelEdu = @{}
    foreach ($it in $eduItems) {
        $t = (Get-Text $it.fields 'Title').ToUpperInvariant()
        if ($t -eq '') { continue }
        if (-not $nachTitelEdu.ContainsKey($t)) { $nachTitelEdu[$t] = New-Object System.Collections.ArrayList }
        [void]$nachTitelEdu[$t].Add($it)
    }

    foreach ($g in $eduGeraete) {
        $schluessel = $g.Title.ToUpperInvariant()
        $kandidaten = @()
        if ($nachTitelEdu.ContainsKey($schluessel)) {
            $kandidaten = @($nachTitelEdu[$schluessel] | Where-Object { (Get-StatusNorm (Get-Text $_.fields 'Status')) -ne 'Archiviert' })
            if ($kandidaten.Count -eq 0) { $kandidaten = @($nachTitelEdu[$schluessel]) }
        }
        if ($kandidaten.Count -eq 0) {
            $felder = [ordered]@{
                Title            = $g.Title
                GebaeudeStock    = $g.GebaeudeStock
                Bemerkung        = $g.Bemerkung
                Beschaffungsjahr = $g.Beschaffungsjahr
                ErsatzGeplant    = $g.ErsatzGeplant
                Status           = 'Aktiv'
                InDomaene        = [bool]$g.InDomaene
                Verlauf          = (Neuer-Verlauf $(if ($g.InDomaene) { 'Aus dem Excel-Inventar übernommen' } else { 'Aus dem Excel-Inventar übernommen; ohne Domäne, darum vom SCCM-Abgleich ausgenommen' }))
            }
            if (Neu-Zeile $cfg.EduClientListId $felder "EDU-Clients: «$($g.Title)» angelegt (In Domäne = $(JaNein $g.InDomaene)$(if ($g.GebaeudeStock) { ", Standort «$($g.GebaeudeStock)»" }))") { Zaehle 'EDU angelegt' }
            continue
        }

        $it = $kandidaten[0]
        $aenderung = [ordered]@{}
        foreach ($paar in @(@('Bemerkung', $g.Bemerkung), @('Beschaffungsjahr', $g.Beschaffungsjahr), @('ErsatzGeplant', $g.ErsatzGeplant))) {
            if ((Get-Text $it.fields $paar[0]) -ne [string]$paar[1]) { $aenderung[$paar[0]] = [string]$paar[1] }
        }
        # Der Standort steckt im EDU-Blatt im Gerätenamen. Er wird nur gesetzt, wenn dort
        # wirklich einer steht – ein in SharePoint gepflegter Standort geht nie verloren.
        if ($g.GebaeudeStock -ne '' -and (Get-Text $it.fields 'GebaeudeStock') -ne $g.GebaeudeStock) {
            $aenderung['GebaeudeStock'] = $g.GebaeudeStock
        }
        $istDomaene = Get-Feld $it.fields 'InDomaene'
        if ($null -eq $istDomaene -or [bool]$istDomaene -ne [bool]$g.InDomaene) { $aenderung['InDomaene'] = [bool]$g.InDomaene }
        if (@($aenderung.Keys).Count -gt 0) {
            if (Schreib-Felder $cfg.EduClientListId $it.id $aenderung "EDU-Clients «$(Get-Text $it.fields 'Title')»") { Zaehle 'EDU geändert' }
        } else {
            Zaehle 'EDU unverändert'
        }
    }

    $excelEdu = @{}
    foreach ($g in $eduGeraete) { $excelEdu[$g.Title.ToUpperInvariant()] = $true }
    foreach ($it in $eduItems) {
        $t = Get-Text $it.fields 'Title'
        if ($t -eq '' -or $excelEdu.ContainsKey($t.ToUpperInvariant())) { continue }
        Log "  Nur in SharePoint (bleibt stehen): «$t» – Status $(Get-StatusNorm (Get-Text $it.fields 'Status'))"
        Zaehle 'EDU nur in SharePoint'
    }
}

# ===========================================================================
# Phase Aufräumen: Doppel aus dem Umzug vom 08.09.2026
# ===========================================================================
if (Bereich 'Aufraeumen') {
    Log '--- Aufräumen: doppelte Zeilen aus dem Umzug ---'
    # Erst sammeln, dann sichern, dann löschen – nicht umgekehrt: Bricht der Lauf mittendrin
    # ab, ist die Sicherung schon geschrieben.
    $zuLoeschen = New-Object System.Collections.ArrayList

    # a) EDU-Geräte, die noch in ADMIN-Clients stehen. Gelöscht wird nur, was in EDU-Clients
    #    nachweislich vorhanden ist – sonst ginge das Gerät verloren.
    $eduTitel = @{}
    foreach ($it in $eduItems) {
        $t = (Get-Text $it.fields 'Title').ToUpperInvariant()
        if ($t -ne '') { $eduTitel[$t] = $true }
    }
    foreach ($it in $adminItems) {
        $t = Get-Text $it.fields 'Title'
        if ($t -eq '' -or (Get-ClientListe $t) -ne 'edu') { continue }
        if (-not $eduTitel.ContainsKey($t.ToUpperInvariant())) {
            Log "  «$t» steht in ADMIN-Clients, fehlt aber in EDU-Clients – bleibt stehen." 'WARN'
            Zaehle 'Aufräumen übersprungen'
            continue
        }
        [void]$zuLoeschen.Add([pscustomobject]@{
                Liste  = 'ADMIN-Clients'; ListId = $cfg.AdminClientListId; Id = $it.id
                Titel  = $t; Grund = 'steht in EDU-Clients'; Felder = $it.fields
            })
    }

    # b) Archivierte Doppel innerhalb von EDU-Clients: gleicher Titel und dieselbe
    #    SCCM-ResourceID wie eine aktive Zeile – also dasselbe Gerät, zweimal erfasst.
    $nachTitelEdu2 = @{}
    foreach ($it in $eduItems) {
        $t = (Get-Text $it.fields 'Title').ToUpperInvariant()
        if ($t -eq '') { continue }
        if (-not $nachTitelEdu2.ContainsKey($t)) { $nachTitelEdu2[$t] = New-Object System.Collections.ArrayList }
        [void]$nachTitelEdu2[$t].Add($it)
    }
    foreach ($t in @($nachTitelEdu2.Keys | Sort-Object)) {
        $liste = @($nachTitelEdu2[$t])
        if ($liste.Count -le 1) { continue }
        $aktiv = @($liste | Where-Object { (Get-StatusNorm (Get-Text $_.fields 'Status')) -ne 'Archiviert' })
        if ($aktiv.Count -eq 0) { Log "  «$t» steht $($liste.Count)-mal, aber keine Zeile ist aktiv – bleibt stehen." 'WARN'; continue }
        $ridAktiv = @($aktiv | ForEach-Object { Get-Text $_.fields 'SCCM_ResourceID' })
        foreach ($it in $liste) {
            if ((Get-StatusNorm (Get-Text $it.fields 'Status')) -ne 'Archiviert') { continue }
            $rid = Get-Text $it.fields 'SCCM_ResourceID'
            if ($rid -eq '' -or $ridAktiv -notcontains $rid) {
                Log "  «$t» (ID $($it.id), archiviert) hat eine andere ResourceID als die aktive Zeile – bleibt stehen." 'WARN'
                Zaehle 'Aufräumen übersprungen'
                continue
            }
            [void]$zuLoeschen.Add([pscustomobject]@{
                    Liste  = 'EDU-Clients'; ListId = $cfg.EduClientListId; Id = $it.id
                    Titel  = $t; Grund = "archiviertes Doppel, ResourceID $rid"; Felder = $it.fields
                })
        }
    }

    if ($zuLoeschen.Count -eq 0) {
        Log '  Nichts aufzuräumen.'
    } else {
        $datei = Join-Path $LokalDir "Abgleich-GeloeschteZeilen-$Stempel.json"
        if ($WhatIf) {
            Log "  WHATIF: $($zuLoeschen.Count) Zeile(n) würden nach $datei gesichert und dann entfernt."
        } else {
            Write-JsonDatei @($zuLoeschen.ToArray()) $datei 10
            Log "  Sicherung der $($zuLoeschen.Count) Zeilen vor dem Löschen: $datei"
        }
        foreach ($w in $zuLoeschen) {
            if (Loesch-Zeile $w.ListId $w.Id "$($w.Liste): «$($w.Titel)» (ID $($w.Id)) entfernt – $($w.Grund)") { Zaehle 'Doppel entfernt' }
        }
    }
}

# ===========================================================================
# Phase Software: Programmspalten der Excel -> Liste «Software»
# ===========================================================================
$softwareNachName = @{}
$softwareIds = @{}
if ((Bereich 'Software') -or (Bereich 'Benutzer')) {
    $swItems = Lies-Liste $cfg.SoftwareListId 'Software'
    foreach ($it in $swItems) {
        $id = Get-Text $it.fields 'Title'
        if ($id -eq '') { continue }
        $softwareIds[$id] = $it
        $name = Get-Text $it.fields 'Name'
        if ($name -eq '') { $name = $id }
        if (-not $softwareNachName.ContainsKey($name)) { $softwareNachName[$name] = $id }
    }
}

if (Bereich 'Software') {
    Log '--- Software: fehlende Programme anlegen ---'
    foreach ($p in $script:NeueProgramme) {
        if ($softwareIds.ContainsKey($p.Id)) { Zaehle 'Software unverändert'; continue }
        if (-not (Test-ProgrammId $p.Id)) {
            Log "  «$($p.Id)» taugt nicht als Spaltenname – übersprungen." 'ERROR'
            $script:fehler++
            continue
        }
        # Zuerst die Spalte in der Benutzer-Liste, dann die Zeile: Scheitert das Anlegen der
        # Spalte, entsteht gar kein Programm – umgekehrt bliebe eine Zeile ohne Spalte zurück.
        $prog = [pscustomobject]@{ id = $p.Id; name = $p.Name }
        $spalteDa = $true
        if ($WhatIf) {
            Log "  WHATIF Spalte «$($p.Id)» in der Benutzer-Liste anlegen"
        } else {
            try {
                Invoke-Graph -Method POST -Uri "/sites/$SiteId/lists/$($cfg.BenutzerListId)/columns" -Body (New-ProgrammSpalte $prog) | Out-Null
                Log "  Spalte «$($p.Id)» in der Benutzer-Liste angelegt"
            } catch {
                if ("$_" -match 'already exists|bereits') {
                    Log "  Spalte «$($p.Id)» gab es schon."
                } else {
                    Log "  Spalte «$($p.Id)» konnte nicht angelegt werden: $_$(Get-SpaltenHinweis $_)" 'ERROR'
                    $script:fehler++
                    $spalteDa = $false
                }
            }
        }
        if (-not $spalteDa) { continue }
        $felder = [ordered]@{
            Title       = $p.Id
            Name        = $p.Name
            Kategorie   = $p.Kategorie
            AdGruppen   = ''
            Reihenfolge = [double]$p.Reihenfolge
            Bemerkung   = 'Aus dem Excel-Inventar übernommen; noch keine AD-Gruppe hinterlegt.'
        }
        if (Neu-Zeile $cfg.SoftwareListId $felder "Software: «$($p.Name)» ($($p.Id), $($p.Kategorie)) angelegt") {
            Zaehle 'Software angelegt'
            $softwareIds[$p.Id] = $true
            if (-not $softwareNachName.ContainsKey($p.Name)) { $softwareNachName[$p.Name] = $p.Id }
        }
    }
}

# ===========================================================================
# Phase Benutzer: Blatt «Computer und User» -> Liste «Benutzer»
# ===========================================================================
if (Bereich 'Benutzer') {
    Log '--- Benutzer: Inhaberschaft, Bemerkung und Programmstufen ---'
    $zuordnung = Get-ProgrammZuordnung $cuBlatt.Kopf $cuBlatt.ErsteProgrammSpalte $softwareNachName
    $ohneZuordnung = @()
    for ($i = $cuBlatt.ErsteProgrammSpalte; $i -lt $cuBlatt.Kopf.Namen.Count; $i++) {
        $n = $cuBlatt.Kopf.Namen[$i]
        if ($n -ne '' -and -not $zuordnung.ContainsKey($i)) { $ohneZuordnung += $n }
    }
    if ($ohneZuordnung.Count -gt 0) {
        Log "  $($ohneZuordnung.Count) Programmspalte(n) der Excel ohne Programm in «Software»: $($ohneZuordnung -join ', ')" 'WARN'
    }
    Log "  $(@($zuordnung.Keys).Count) Programmspalten zugeordnet"

    # Je Login alles zusammentragen, was die Excel sagt. Ein Login kann mehrere Zeilen haben
    # (zwei Arbeitsplätze); dann gilt die Vereinigung, und als Inhaberschaft das erste
    # eigene Gerät.
    $nachLogin = [ordered]@{}
    foreach ($e in $cuBlatt.Zeilen) {
        $login = $e.Login
        if ($login -eq '') { continue }
        $k = Get-ExcelLoginSchluessel $login
        if ($k -eq '') { continue }
        if (-not $nachLogin.Contains($k)) {
            $nachLogin[$k] = [pscustomobject]@{
                Login        = $login
                Anzeigename  = $e.Arbeitsplatz
                Geraete      = New-Object System.Collections.ArrayList
                Bemerkung    = New-Object System.Collections.ArrayList
                Programme    = @{}
            }
        }
        $b = $nachLogin[$k]
        if ($e.EigenesGeraet) { [void]$b.Geraete.Add($e.PcName) }
        if ($e.Bemerkung -ne '' -and $b.Bemerkung -notcontains $e.Bemerkung) { [void]$b.Bemerkung.Add($e.Bemerkung) }
        foreach ($i in $e.Programme.Keys) {
            if ($zuordnung.ContainsKey([int]$i)) { $b.Programme[[string]$zuordnung[[int]$i]] = $true }
        }
    }
    Log "  Excel: $(@($nachLogin.Keys).Count) Logins"

    $benutzerItems = Lies-Liste $cfg.BenutzerListId 'Benutzer'
    $benutzerNachLogin = @{}
    $benutzerNachName = @{}
    foreach ($it in $benutzerItems) {
        $k = NormLogin (Get-Text $it.fields 'Title')
        if ($k -ne '') { $benutzerNachLogin[$k] = $it }
        $n = (Get-Text $it.fields 'Anzeigename').ToLowerInvariant()
        if ($n -ne '') {
            if (-not $benutzerNachName.ContainsKey($n)) { $benutzerNachName[$n] = New-Object System.Collections.ArrayList }
            [void]$benutzerNachName[$n].Add($it)
        }
    }

    $schonBearbeitet = @{}
    foreach ($k in @($nachLogin.Keys)) {
        $b = $nachLogin[$k]
        $fund = Find-BenutzerZeile $benutzerNachLogin $benutzerNachName $b.Login $b.Anzeigename
        if ($null -eq $fund.Zeile) {
            Log "  Login «$($b.Login)» ($($b.Anzeigename)) gibt es in der Benutzer-Liste nicht (kein AD-Konto im Sync-Bereich) – übersprungen." 'WARN'
            Zaehle 'Benutzer ohne AD-Konto'
            continue
        }
        $it = $fund.Zeile
        if ($fund.Weg -ne 'Login') {
            Log "  Login «$($b.Login)» über den $($fund.Weg -replace 'Gekürzt','gekürzten Login') zugeordnet: Zeile «$(Get-Text $it.fields 'Title')» ($(Get-Text $it.fields 'Anzeigename'))" 'WARN'
        }
        # Zwei Excel-Logins auf dieselbe Zeile (etwa «Amira.Lustenberger» und «Amira.Lustenberger ?»)
        # würden sich gegenseitig überschreiben – die erste Zuordnung zählt.
        if ($schonBearbeitet.ContainsKey([string]$it.id)) {
            Log "  Login «$($b.Login)» zeigt auf dieselbe Zeile wie ein vorheriger Login – übersprungen." 'WARN'
            Zaehle 'Benutzer doppelt zugeordnet'
            continue
        }
        $schonBearbeitet[[string]$it.id] = $true
        $aenderung = [ordered]@{}

        # Inhaberschaft: die Excel entscheidet. Steht dort kein eigenes Gerät, ist die Person
        # Inhaberin von keinem – ein «Shared CAMPUS-070» heisst mitbenutzen, nicht besitzen.
        $istGeraet = Get-Text $it.fields 'Computer'
        $sollGeraete = @($b.Geraete)
        if ($sollGeraete.Count -eq 0) {
            if ($istGeraet -ne '') { $aenderung['Computer'] = '' }
        } elseif (@($sollGeraete | ForEach-Object { $_.ToUpperInvariant() }) -notcontains $istGeraet.ToUpperInvariant()) {
            $aenderung['Computer'] = [string]$sollGeraete[0]
        }

        $sollBemerkung = (@($b.Bemerkung) -join ' / ')
        if ((Get-Text $it.fields 'Bemerkung') -ne $sollBemerkung) { $aenderung['Bemerkung'] = $sollBemerkung }

        foreach ($progId in @($zuordnung.Values | Sort-Object -Unique)) {
            $neu = Get-ProgrammstufeNeu ([bool]$b.Programme[[string]$progId]) (Get-Text $it.fields $progId)
            if ($null -ne $neu) { $aenderung[[string]$progId] = $neu }
        }

        if (@($aenderung.Keys).Count -gt 0) {
            if (Schreib-Felder $cfg.BenutzerListId $it.id $aenderung "Benutzer «$(Get-Text $it.fields 'Title')»") { Zaehle 'Benutzer geändert' }
        } else {
            Zaehle 'Benutzer unverändert'
        }
    }

    foreach ($it in $benutzerItems) {
        if ($schonBearbeitet.ContainsKey([string]$it.id)) { continue }
        Zaehle 'Benutzer nur in SharePoint (aus dem AD)'
    }
}

# ===========================================================================
# Phase Telefon: nur Bericht
# ===========================================================================
if (Bereich 'Telefon') {
    Log '--- Telefonnummern: Vergleich (es wird nichts geschrieben) ---'
    $tZeilen = Read-XlsxBlatt $ExcelTelefon 'Telefonnummer'
    $tKopf = Get-BlattKopf $tZeilen 'Nr.'
    $iNr = Get-SpaltenIndex $tKopf 'Nr.'
    $iNummer = Get-SpaltenIndex $tKopf 'Telefonnummer'
    $iName = Get-SpaltenIndex $tKopf 'Name'
    $iTyp = Get-SpaltenIndex $tKopf 'Typ'
    $iStatus = Get-SpaltenIndex $tKopf 'Status'
    $iHinweis = Get-SpaltenIndex $tKopf 'Grund / Hinweis'

    $praefix = $cfg.TelefonPraefix
    if (-not $praefix) { $praefix = $script:TelefonPraefixStandard }

    $soll = [ordered]@{}
    for ($z = $tKopf.Zeile + 1; $z -lt @($tZeilen).Count; $z++) {
        $zeile = @($tZeilen)[$z]
        $nr = Get-ZellWert $zeile $iNr
        $nummer = Get-ZellWert $zeile $iNummer
        if ($nr -eq '' -and $nummer -eq '') { continue }
        if ($nr -eq '') { $nr = Get-TelefonKurzwahl $nummer $praefix }
        $name = Get-ZellWert $zeile $iName
        if ($name.ToUpperInvariant() -eq 'FREI') { $name = '' }
        $soll[$nr] = [pscustomobject]@{
            Telefonnummer = (Format-Telefon $(if ($nummer -ne '') { $nummer } else { $nr }) $praefix)
            Name          = $name
            Typ           = (Get-ZellWert $zeile $iTyp)
            Status        = (Get-TelefonStatusAusAlt (Get-ZellWert $zeile $iStatus) $name (Get-ZellWert $zeile $iHinweis))
            Hinweis       = (Get-ZellWert $zeile $iHinweis)
        }
    }
    Log "  Excel: $(@($soll.Keys).Count) Nummern"

    $tItems = Lies-Liste $cfg.TelefonListId 'Telefonnummern'
    $ist = @{}
    foreach ($it in $tItems) { $ist[(Get-Text $it.fields 'Title')] = $it }

    $nurExcel = @($soll.Keys | Where-Object { -not $ist.ContainsKey([string]$_) })
    $nurSp = @($ist.Keys | Where-Object { -not $soll.Contains([string]$_) } | Sort-Object)
    if ($nurExcel.Count -gt 0) { Log "  Nur in der Excel: $($nurExcel -join ', ')" 'WARN' }
    if ($nurSp.Count -gt 0) { Log "  Nur in SharePoint: $($nurSp -join ', ')" 'WARN' }

    foreach ($nr in @($soll.Keys)) {
        if (-not $ist.ContainsKey([string]$nr)) { continue }
        $it = $ist[[string]$nr]
        $abweichung = @()
        foreach ($feld in @('Telefonnummer', 'Name', 'Typ', 'Status', 'Hinweis')) {
            $i = Get-Text $it.fields $feld
            $s = [string](Get-Feld $soll[$nr] $feld)
            if ($feld -eq 'Status' -and $i -eq '') { $i = 'Aktiv' }
            if ($i -ne $s) { $abweichung += "$feld`: SharePoint «$i», Excel «$s»" }
        }
        if ($abweichung.Count -gt 0) {
            Log "  Kurzwahl $nr weicht ab – $($abweichung -join '; ')" 'WARN'
            Zaehle 'Telefon abweichend'
        } else {
            Zaehle 'Telefon gleich'
        }
    }
    Log '  Die Telefonliste wird nicht geschrieben: SharePoint ist dort die führende Fassung und wird vom Sync aus dem AD nachgeführt.'
}

# ===========================================================================
Log '--- Ergebnis ---'
foreach ($k in $stat.Keys) { Log ("  {0,-40} {1}" -f $k, $stat[$k]) }
if ($WhatIf) {
    Log "==== Fertig (WHATIF, nichts geschrieben): $script:fehler Fehler ===="
} else {
    Log "==== Fertig: $script:fehler Fehler ===="
}
if ($script:fehler) { exit 1 }
