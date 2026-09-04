<#
.SYNOPSIS
  Prueft und ergaenzt Telefonkontakte im lokalen AD (OU «Contacts Sync»), damit sie
  ueber Entra Connect im Adressbuch und in Teams erscheinen.

.DESCRIPTION
  Die Telefonkontakte liegen als AD-Kontaktobjekte in einer eigenen OU und werden von
  dort synchronisiert. Ein Kontakt ist erst vollstaendig, wenn diese vier Attribute
  gesetzt sind - so wie beim funktionierenden Beispiel «Nachtdienst 1 (Frueh)»:

    displayName      Anzeigename (identisch mit dem Objektnamen)
    mail             Mailadresse - der Sync braucht sie, sonst wird der Kontakt ignoriert
    mobile           die Nummer als Mobilnummer (das Feld nutzt der Kontakt-Sync)
    telephoneNumber  die Nummer als Telefonnummer

  Das Skript sucht die in $Kontakte definierten Eintraege in der OU (ueber CnMuster
  oder ueber die Nummer), meldet fehlende Attribute und ergaenzt sie. Ein Attribut mit
  abweichendem Inhalt wird NICHT still ueberschrieben, sondern nur gemeldet - dafuer
  braucht es -Ueberschreiben.

  Anmeldung: integrierte Windows-Anmeldung der laufenden Sitzung, es werden keine
  Anmeldedaten abgefragt oder gespeichert. Wer keine Schreibrechte auf der OU hat,
  startet die Konsole vorher als berechtigtes Konto (runas) und ruft das Skript dort auf.
  Benoetigt kein RSAT - laeuft ueber ADSI (System.DirectoryServices).

.EXAMPLE
  # Nur pruefen, nichts schreiben:
  powershell -ExecutionPolicy Bypass -File .\Add-Kontakte.ps1 -Anzeigen

.EXAMPLE
  # Trockenlauf: zeigt, was geaendert wuerde:
  powershell -ExecutionPolicy Bypass -File .\Add-Kontakte.ps1 -WhatIf

.EXAMPLE
  # Ergaenzen:
  powershell -ExecutionPolicy Bypass -File .\Add-Kontakte.ps1

.NOTES
  Windows PowerShell 5.1, domaenenbeigetretener Rechner.
  Nach der Aenderung dauert es bis zum naechsten Entra-Connect-Zyklus (Standard 30 Min),
  bis der Kontakt in Teams sichtbar ist.
#>
[CmdletBinding()]
param(
    # OU mit den synchronisierten Telefonkontakten.
    [string]$Ou = 'OU=Contacts Sync,OU=Lync 2010,OU=Resources,OU=Staff,DC=sasadmin,DC=local',
    # Optional: bestimmter Domaenencontroller.
    [string]$Server,
    # Nur den Ist-Zustand zeigen, nichts schreiben.
    [switch]$Anzeigen,
    # Trockenlauf: zeigt die geplanten Aenderungen, schreibt nichts.
    [switch]$WhatIf,
    # Auch abweichende (nicht nur leere) Attribute ueberschreiben.
    [switch]$Ueberschreiben
)

$ErrorActionPreference = 'Stop'

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }

# Bewusst ohne Inventar-Gemeinsam.ps1: Das Skript muss sich als einzelne Datei in einen
# neutralen Ordner kopieren und unter einem anderen Konto (runas) starten lassen.
$LogPfad = Join-Path $ScriptDir 'Add-Kontakte.log'
function Log {
    param([string]$msg, [string]$lvl = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $lvl, $msg
    Write-Host $line
    try { Add-Content -Path $LogPfad -Value $line -Encoding UTF8 } catch { }
}

# ---------------------------------------------------------------------------
# Die Kontakte, die vollstaendig sein sollen
#   CnMuster  Suchmuster fuer den Objektnamen (Platzhalter *), damit Umlaute im
#             CN nicht im Skript stehen muessen
#   Cn        Objektname, falls der Kontakt neu angelegt werden muss
#   Nummer    die Telefonnummer in beliebiger Schreibweise
#   MailLokal linker Teil der Mailadresse
# ---------------------------------------------------------------------------
$Kontakte = @(
    [pscustomobject]@{ CnMuster = 'Nachtdienst 1*'; Cn = 'Nachtdienst 1'; Nummer = '079 392 21 63'; MailLokal = 'nachtdienst1' }
    [pscustomobject]@{ CnMuster = 'Nachtdienst 2*'; Cn = 'Nachtdienst 2'; Nummer = '079 376 41 98'; MailLokal = 'nachtdienst2' }
)
# Maildomaene der bestehenden Kontakte in dieser OU; wird unten aus dem Ist-Zustand
# abgeleitet, dies ist nur der Rueckfall, falls die OU noch leer ist.
$MailDomainFallback = 'sasadmin.local'

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------
function Get-NurZiffern {
    <# Schweizer Nummer auf die nationalen Ziffern reduzieren: 079 392 21 63 -> 793922163 #>
    param([string]$Nummer)
    $z = ($Nummer -replace '[^\d]', '')
    if ($z.StartsWith('0041')) { $z = $z.Substring(4) }
    elseif ($z.StartsWith('41') -and $z.Length -ge 11) { $z = $z.Substring(2) }
    elseif ($z.StartsWith('0')) { $z = $z.Substring(1) }
    return $z
}

function Format-Nummer {
    <# Schreibweise wie die bestehenden Kontakte in der OU: +41 79 392 21 63 #>
    param([string]$Nummer)
    $z = Get-NurZiffern $Nummer
    if ($z.Length -ne 9) { return $Nummer.Trim() }   # Kurznummern (117, 144) unveraendert
    return ('+41 {0} {1} {2} {3}' -f $z.Substring(0, 2), $z.Substring(2, 3), $z.Substring(5, 2), $z.Substring(7, 2))
}

function Get-LdapPfad {
    param([string]$Dn)
    if ($Server) { return "LDAP://$Server/$Dn" }
    return "LDAP://$Dn"
}

function Get-Attr {
    <# Einzelwert eines ADSI-Objekts als String, leer wenn nicht gesetzt. #>
    param($Eintrag, [string]$Name)
    $w = $Eintrag.Properties[$Name]
    if ($null -eq $w -or $w.Count -eq 0) { return '' }
    return [string]$w[0]
}

function Get-KontakteAusOu {
    $suche = New-Object System.DirectoryServices.DirectorySearcher([ADSI](Get-LdapPfad $Ou))
    $suche.Filter = '(objectClass=contact)'
    $suche.PageSize = 500
    foreach ($p in 'cn', 'name', 'displayName', 'mail', 'mobile', 'telephoneNumber', 'distinguishedName') {
        $null = $suche.PropertiesToLoad.Add($p)
    }
    $liste = @()
    foreach ($t in @($suche.FindAll())) {
        $p = $t.Properties
        $lesen = { param($n) if ($p[$n] -and $p[$n].Count -gt 0) { [string]$p[$n][0] } else { '' } }
        $liste += [pscustomobject]@{
            Cn              = (& $lesen 'cn')
            Name            = (& $lesen 'name')
            DisplayName     = (& $lesen 'displayname')
            Mail            = (& $lesen 'mail')
            Mobile          = (& $lesen 'mobile')
            TelephoneNumber = (& $lesen 'telephonenumber')
            Dn              = (& $lesen 'distinguishedname')
        }
    }
    return $liste
}

# ---------------------------------------------------------------------------
# Ist-Zustand lesen
# ---------------------------------------------------------------------------
Log '==== Telefonkontakte pruefen ===='
Log ("Angemeldet als: {0}" -f [Security.Principal.WindowsIdentity]::GetCurrent().Name)
Log ("OU: {0}" -f $Ou)

$ist = Get-KontakteAusOu
Log ("Kontakte in der OU: {0}" -f $ist.Count)

if ($Anzeigen) {
    $ist | Sort-Object Cn | Select-Object Cn, DisplayName, Mail, Mobile, TelephoneNumber |
        Format-Table -AutoSize | Out-String -Width 220 | Write-Host
    $unvollstaendig = @($ist | Where-Object { -not $_.DisplayName -or -not $_.Mail })
    Log ("Ohne displayName oder mail: {0}" -f $unvollstaendig.Count)
    Log '==== Ende (nur Anzeige) ===='
    return
}

# Maildomaene aus dem Ist-Zustand ableiten
$domains = @()
foreach ($k in $ist) { if ($k.Mail -match '@(.+)$') { $domains += $Matches[1].ToLower() } }
$MailDomain = $MailDomainFallback
if ($domains.Count -gt 0) {
    $top = $domains | Group-Object | Sort-Object Count -Descending | Select-Object -First 1
    $MailDomain = $top.Name
    Log ("Maildomaene: {0} ({1} von {2} Kontakten)" -f $MailDomain, $top.Count, $domains.Count)
}

# ---------------------------------------------------------------------------
# Soll-Ist vergleichen
# ---------------------------------------------------------------------------
$plan = @()
foreach ($k in $Kontakte) {
    $ziffern = Get-NurZiffern $k.Nummer
    $nummer = Format-Nummer $k.Nummer
    $treffer = @($ist | Where-Object {
            $_.Cn -like $k.CnMuster -or
            (Get-NurZiffern $_.Mobile) -eq $ziffern -or
            (Get-NurZiffern $_.TelephoneNumber) -eq $ziffern
        }) | Select-Object -First 1

    if (-not $treffer) {
        $plan += [pscustomobject]@{
            Kontakt   = $k.Cn
            Aktion    = 'anlegen'
            Dn        = ('CN={0},{1}' -f $k.Cn, $Ou)
            NeuCn     = $k.Cn
            Attribute = [ordered]@{
                displayName     = $k.Cn
                givenName       = $k.Cn
                mail            = ('{0}@{1}' -f $k.MailLokal, $MailDomain).ToLower()
                mobile          = $nummer
                telephoneNumber = $nummer
            }
            Meldungen = @('Kontakt fehlt in der OU')
        }
        continue
    }

    # displayName soll dem Objektnamen entsprechen (so wie bei den funktionierenden Kontakten)
    $soll = [ordered]@{
        displayName     = $treffer.Name
        mail            = ('{0}@{1}' -f $k.MailLokal, $MailDomain).ToLower()
        mobile          = $nummer
        telephoneNumber = $nummer
    }
    $aendern = [ordered]@{}
    $meldungen = @()
    foreach ($name in $soll.Keys) {
        $istWert = [string]$treffer.$(switch ($name) {
                'displayName' { 'DisplayName' }
                'mail' { 'Mail' }
                'mobile' { 'Mobile' }
                'telephoneNumber' { 'TelephoneNumber' }
            })
        $sollWert = [string]$soll[$name]
        if (-not $istWert) {
            $aendern[$name] = $sollWert
            $meldungen += ("{0} ist leer -> '{1}'" -f $name, $sollWert)
        } elseif ($istWert -ne $sollWert) {
            # Nummern nur der Ziffern nach vergleichen, Schreibweise ist egal
            $gleich = if ($name -in 'mobile', 'telephoneNumber') {
                (Get-NurZiffern $istWert) -eq (Get-NurZiffern $sollWert)
            } else { $false }
            if ($gleich) { continue }
            if ($Ueberschreiben) {
                $aendern[$name] = $sollWert
                $meldungen += ("{0}: '{1}' -> '{2}'" -f $name, $istWert, $sollWert)
            } else {
                $meldungen += ("{0} weicht ab: '{1}' (soll '{2}') - nur mit -Ueberschreiben" -f $name, $istWert, $sollWert)
            }
        }
    }

    $plan += [pscustomobject]@{
        Kontakt   = $treffer.Cn
        Aktion    = if ($aendern.Count -gt 0) { 'ergaenzen' } else { 'unveraendert' }
        Dn        = $treffer.Dn
        NeuCn     = $null
        Attribute = $aendern
        Meldungen = $meldungen
    }
}

foreach ($p in $plan) {
    Log ("{0}: {1}" -f $p.Kontakt, $p.Aktion)
    foreach ($m in $p.Meldungen) { Log ("   {0}" -f $m) }
}

$zuTun = @($plan | Where-Object { $_.Aktion -ne 'unveraendert' })
if ($zuTun.Count -eq 0) { Log 'Nichts zu tun, alle Kontakte sind vollstaendig.'; Log '==== Ende ===='; return }
if ($WhatIf) { Log 'WHATIF: nichts geschrieben.'; Log '==== Ende ===='; return }

# ---------------------------------------------------------------------------
# Schreiben
# ---------------------------------------------------------------------------
foreach ($p in $zuTun) {
    if ($p.Aktion -eq 'anlegen') {
        $ouObj = [ADSI](Get-LdapPfad $Ou)
        $neu = $ouObj.Create('contact', ('CN={0}' -f $p.NeuCn))
        foreach ($name in $p.Attribute.Keys) { $neu.Put($name, [string]$p.Attribute[$name]) }
        $neu.SetInfo()
        Log ("Angelegt: {0}" -f $p.Dn)
    } else {
        $e = [ADSI](Get-LdapPfad $p.Dn)
        foreach ($name in $p.Attribute.Keys) { $e.Put($name, [string]$p.Attribute[$name]) }
        $e.SetInfo()
        Log ("Ergaenzt: {0} ({1})" -f $p.Kontakt, (($p.Attribute.Keys) -join ', '))
    }
}

# ---------------------------------------------------------------------------
# Kontrolle
# ---------------------------------------------------------------------------
$nachher = Get-KontakteAusOu
$fehler = 0
foreach ($p in $plan) {
    $k = @($nachher | Where-Object { $_.Dn -eq $p.Dn }) | Select-Object -First 1
    if (-not $k) { Log ("Kontrolle: {0} nicht gefunden" -f $p.Kontakt) 'ERROR'; $fehler++; continue }
    $fehlt = @()
    foreach ($f in 'DisplayName', 'Mail', 'Mobile', 'TelephoneNumber') { if (-not $k.$f) { $fehlt += $f } }
    if ($fehlt.Count -eq 0) {
        Log ("Kontrolle ok: {0} / {1} / {2}" -f $k.DisplayName, $k.Mobile, $k.Mail)
    } else {
        Log ("Kontrolle: bei {0} fehlt noch {1}" -f $p.Kontakt, ($fehlt -join ', ')) 'ERROR'
        $fehler++
    }
}
if ($fehler -gt 0) { Log '==== Ende mit Fehlern ===='; exit 1 }
Log 'Alle Kontakte vollstaendig. In Teams sichtbar nach dem naechsten Entra-Connect-Zyklus.'
Log '==== Ende ===='
