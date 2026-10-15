<#
.SYNOPSIS
  Prüft das Frontend (Ordner frontend) statisch auf die Regeln des Design-Systems und der
  Inhaltsrichtlinie – ohne Browser, ohne Netzwerk, in wenigen Sekunden.

.DESCRIPTION
  Nach jeder Änderung am Frontend laufen lassen (frontend\STYLEGUIDE.md, Abschnitt 9). Sieben
  Prüfungen; Kommentare zählen nirgends mit (/* … */ und // in CSS und JS, <!-- … --> in HTML):

    1. Tokens      Jedes var(--x) in den CSS-Dateien und in den <style>-Blöcken der HTML-Dateien ist
                   definiert: in einer CSS-Datei, in einem <style> oder zur Laufzeit über
                   setProperty("--x", …) in einer JS-Datei. Ein var(--x, Ersatz) mit Ersatzwert ist ein
                   Komponenten-Schalter und gilt als definiert.
    2. Keyframes   @keyframes stehen nur in bewegung.css (nicht in anderen CSS-, JS- oder HTML-Dateien).
    3. Seiten-CSS  styles.css, client.css, benutzer.css, telefon.css, software.css und verlauf.css
                   enthalten nur Seitenlayout: keine Farb-Literale (#hex, rgb(), hsl() …, Farbnamen),
                   keine Radius-, Schrift-, Dauer- oder Kurven-Literale (cubic-bezier, ease …) – nur Tokens.
    4. JavaScript  kein innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function,
                   kein (window.)confirm, alert oder prompt, kein Browser-title (eigene Tooltips: titel,
                   UI.tipp; document.title ist erlaubt).
    5. HTML        kein Inline-<script> (die Inhaltsrichtlinie in _headers verbietet es), keine
                   on*-Attribute, keine javascript:-Adressen. Erlaubt bleibt die eine Zeile
                   <style>@view-transition { navigation: auto; }</style> im <head>.
    6. MSAL        Alle Seiten, die MSAL vom CDN laden, tun es mit derselben integrity (SRI) und mit
                   crossorigin="anonymous".
    7. Altlasten   kein #0b57d0, #e8f0fe, --primaer-hell oder knopf-gefahr mehr (Google-Blau und die
                   alten Namen vor dem Umbau auf das ChatBob-Design).

  Ausgabe: je Prüfung «OK» oder die Fundstellen (Datei:Zeile, Art, Zeile). Exit-Code 0, wenn alle
  Prüfungen halten, sonst 1.

  Was dieses Skript NICHT sieht: Aussehen, Bewegung und Bedienung. Dafür styleguide.html (lebende
  Übersicht) und die Seiten mit ?mock=1 (siehe serve.ps1).

.PARAMETER Ordner
  Der Frontend-Ordner. Standard: ..\frontend neben diesem Skript.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1 -Ordner C:\Temp\frontend-kopie

.NOTES
  Windows PowerShell 5.1, kein Zusatzmodul. Liest nur, schreibt nichts.
#>
[CmdletBinding()]
param(
    [string]$Ordner
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
if (-not $Ordner) { $Ordner = Join-Path $ScriptDir '..\frontend' }
if (-not (Test-Path -LiteralPath $Ordner -PathType Container)) {
    Write-Host "Ordner nicht gefunden: $Ordner" -ForegroundColor Red
    exit 1
}
$Ordner = (Resolve-Path -LiteralPath $Ordner).Path

$SeitenCss = @('styles.css', 'client.css', 'benutzer.css', 'telefon.css', 'software.css', 'kamera.css', 'kamerarolle.css', 'verlauf.css')
$Utf8 = New-Object System.Text.UTF8Encoding($false)

# ---------------------------------------------------------------------------
# Dateien lesen, Kommentare leeren (Zeilenumbrüche bleiben: Zeilennummern stimmen)
# ---------------------------------------------------------------------------

$script:Leerer = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    [regex]::Replace($m.Value, '[^\r\n]', ' ')
}

# JS: Zeichenketten bleiben stehen (ein // darin ist kein Kommentar), Kommentare werden geleert.
$script:JsMuster = '("(?:\\.|[^"\\\r\n])*"|''(?:\\.|[^''\\\r\n])*''|`(?:\\.|[^`\\])*`)|/\*[\s\S]*?\*/|//[^\r\n]*'
$script:JsLeerer = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    if ($m.Groups[1].Success) { return $m.Value }
    [regex]::Replace($m.Value, '[^\r\n]', ' ')
}

function Get-OhneKommentare {
    <# Text ohne Kommentare, gleiche Länge und gleiche Zeilen. #>
    param([string]$Text, [string]$Art)
    switch ($Art) {
        'css'  { return [regex]::Replace($Text, '/\*[\s\S]*?\*/', $script:Leerer) }
        'js'   { return [regex]::Replace($Text, $script:JsMuster, $script:JsLeerer) }
        'html' { return [regex]::Replace($Text, '<!--[\s\S]*?-->', $script:Leerer) }
    }
    return $Text
}

function Get-Zeilenanfaenge {
    <# Startindex jeder Zeile, für die Zeilennummer eines Treffers. #>
    param([string]$Text)
    $anfaenge = New-Object System.Collections.Generic.List[int]
    $anfaenge.Add(0)
    $i = $Text.IndexOf("`n")
    while ($i -ge 0) {
        $anfaenge.Add($i + 1)
        $i = $Text.IndexOf("`n", $i + 1)
    }
    return , $anfaenge.ToArray()
}

function Get-ZeileNr {
    param($Datei, [int]$Index)
    $p = [Array]::BinarySearch($Datei.Anfaenge, $Index)
    if ($p -lt 0) { $p = (-bnot $p) - 1 }
    return $p + 1
}

function Get-Fundstelle {
    <# «datei:zeile  Art  gekürzte Zeile» für die Ausgabe. #>
    param($Datei, [int]$Nr, [string]$Art)
    $zeile = ''
    if ($Nr -ge 1 -and $Nr -le $Datei.Zeilen.Count) { $zeile = $Datei.Zeilen[$Nr - 1].Trim() }
    if ($zeile.Length -gt 110) { $zeile = $zeile.Substring(0, 107) + '...' }
    return ('{0}:{1}  {2}  {3}' -f $Datei.Name, $Nr, $Art, $zeile)
}

$Dateien = @()
foreach ($f in (Get-ChildItem -LiteralPath $Ordner -File | Where-Object { $_.Extension -in @('.css', '.js', '.html') } | Sort-Object Name)) {
    $roh = [IO.File]::ReadAllText($f.FullName, $Utf8)
    if ($roh.Length -gt 0 -and $roh[0] -eq [char]0xFEFF) { $roh = $roh.Substring(1) }
    $art = $f.Extension.TrimStart('.').ToLowerInvariant()
    $ohne = Get-OhneKommentare -Text $roh -Art $art
    $Dateien += [pscustomobject]@{
        Name     = $f.Name
        Art      = $art
        Roh      = $roh
        Ohne     = $ohne
        Anfaenge = (Get-Zeilenanfaenge $ohne)
        Zeilen   = ($roh -split "`r?`n")
    }
}
$Css = @($Dateien | Where-Object { $_.Art -eq 'css' })
$Js = @($Dateien | Where-Object { $_.Art -eq 'js' })
$Html = @($Dateien | Where-Object { $_.Art -eq 'html' })

# <style>-Blöcke der HTML-Dateien (Inhalt + Startindex), für die Token-Prüfung.
function Get-StilBloecke {
    param($Datei)
    $bloecke = @()
    foreach ($m in [regex]::Matches($Datei.Ohne, '<style\b[^>]*>([\s\S]*?)</style\s*>', 'IgnoreCase')) {
        $g = $m.Groups[1]
        $bloecke += [pscustomobject]@{ Text = (Get-OhneKommentare -Text $g.Value -Art 'css'); Basis = $g.Index }
    }
    return , $bloecke
}

# ---------------------------------------------------------------------------
# Ausgabe
# ---------------------------------------------------------------------------

$script:Fehlerhaft = 0
$script:Anzahl = 0

function Show-Pruefung {
    param([string]$Titel, $Befunde, [string]$OkText)
    $script:Anzahl++
    $liste = @($Befunde)
    if ($liste.Count -eq 0) {
        Write-Host ('  OK      {0}' -f $Titel) -NoNewline -ForegroundColor Green
        if ($OkText) { Write-Host (' – {0}' -f $OkText) } else { Write-Host '' }
        return
    }
    $script:Fehlerhaft++
    Write-Host ('  FEHLER  {0} – {1} Fundstelle(n)' -f $Titel, $liste.Count) -ForegroundColor Red
    # Nach Datei und Zeile, wie man sie abarbeitet.
    $sortiert = $liste | Sort-Object {
        $m = [regex]::Match($_, '^(?<d>[^:\s]+):(?<n>\d+)')
        if ($m.Success) { '{0}|{1:D7}' -f $m.Groups['d'].Value, [int]$m.Groups['n'].Value } else { $_ }
    }
    foreach ($b in $sortiert) { Write-Host ('          {0}' -f $b) }
}

Write-Host ('Pruefe-Frontend: {0}  ({1} CSS, {2} JS, {3} HTML)' -f $Ordner, $Css.Count, $Js.Count, $Html.Count)
Write-Host ''

# ---------------------------------------------------------------------------
# 1. Tokens: jedes var(--x) ist definiert
# ---------------------------------------------------------------------------

$definiert = New-Object 'System.Collections.Generic.HashSet[string]'
$lesestellen = New-Object System.Collections.Generic.List[object]
foreach ($d in $Css) {
    foreach ($m in [regex]::Matches($d.Ohne, '(--[\w-]+)\s*:')) { [void]$definiert.Add($m.Groups[1].Value) }
    foreach ($m in [regex]::Matches($d.Ohne, 'var\(\s*(--[\w-]+)\s*(,)?')) {
        $lesestellen.Add([pscustomobject]@{ Datei = $d; Index = $m.Index; Name = $m.Groups[1].Value; Ersatz = $m.Groups[2].Success })
    }
}
foreach ($d in $Html) {
    foreach ($b in (Get-StilBloecke $d)) {
        foreach ($m in [regex]::Matches($b.Text, '(--[\w-]+)\s*:')) { [void]$definiert.Add($m.Groups[1].Value) }
        foreach ($m in [regex]::Matches($b.Text, 'var\(\s*(--[\w-]+)\s*(,)?')) {
            $lesestellen.Add([pscustomobject]@{ Datei = $d; Index = ($b.Basis + $m.Index); Name = $m.Groups[1].Value; Ersatz = $m.Groups[2].Success })
        }
    }
}
foreach ($d in $Js) {
    foreach ($m in [regex]::Matches($d.Ohne, 'setProperty\(\s*["''](--[\w-]+)["'']')) { [void]$definiert.Add($m.Groups[1].Value) }
}
$befunde = New-Object System.Collections.Generic.List[string]
foreach ($l in $lesestellen) {
    if ($l.Ersatz -or $definiert.Contains($l.Name)) { continue }
    $befunde.Add((Get-Fundstelle $l.Datei (Get-ZeileNr $l.Datei $l.Index) ('undefiniert ' + $l.Name)))
}
Show-Pruefung '1. Tokens: jedes var(--x) ist definiert' $befunde ('{0} Lesestellen, {1} Namen definiert' -f $lesestellen.Count, $definiert.Count)

# ---------------------------------------------------------------------------
# 2. @keyframes nur in bewegung.css
# ---------------------------------------------------------------------------

$befunde = New-Object System.Collections.Generic.List[string]
foreach ($d in $Dateien) {
    if ($d.Name -eq 'bewegung.css') { continue }
    foreach ($m in [regex]::Matches($d.Ohne, '@keyframes\b')) {
        $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) '@keyframes ausserhalb bewegung.css'))
    }
}
$kfZahl = 0
$bw = $Css | Where-Object { $_.Name -eq 'bewegung.css' }
if ($bw) { $kfZahl = [regex]::Matches($bw.Ohne, '@keyframes\s+[\w-]+').Count }
Show-Pruefung '2. @keyframes nur in bewegung.css' $befunde ('{0} Keyframes in bewegung.css' -f $kfZahl)

# ---------------------------------------------------------------------------
# 3. Seiten-CSS ohne Farb-, Radius-, Schrift-, Dauer- und Kurven-Literale
# ---------------------------------------------------------------------------

$FarbEigenschaft = '^(color|background|background-color|border(-(top|right|bottom|left|block|inline)(-start|-end)?)?-color|outline-color|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule-color)$'
$FarbWoerter = '^(transparent|currentcolor|inherit|initial|unset|revert|revert-layer|none|canvas|canvastext|linktext|visitedtext|activetext|graytext|highlight|highlighttext|buttontext|buttonface|buttonborder|field|fieldtext|mark|marktext|selecteditem|selecteditemtext|accentcolor|accentcolortext)$'

function Get-OhneVar {
    <# Wert ohne var(…) (samt Ersatzwert): nur, was wörtlich dasteht, zählt. #>
    param([string]$Wert)
    $w = $Wert
    for ($i = 0; $i -lt 5; $i++) {
        $neu = [regex]::Replace($w, 'var\([^()]*(\([^()]*\)[^()]*)*\)', 'VAR')
        if ($neu -eq $w) { break }
        $w = $neu
    }
    return $w
}

function Test-ZahlNichtNull {
    <# Steht im Wert eine Zahl (mit Einheit aus $Einheit) ungleich 0? #>
    param([string]$Wert, [string]$Einheit)
    foreach ($m in [regex]::Matches($Wert, '(?<![\w.#-])(\d*\.?\d+)(' + $Einheit + ')(?![\w-])')) {
        if ([double]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture) -ne 0) { return $true }
    }
    return $false
}

$befunde = New-Object System.Collections.Generic.List[string]
foreach ($d in ($Css | Where-Object { $SeitenCss -contains $_.Name })) {
    foreach ($block in [regex]::Matches($d.Ohne, '\{([^{}]*)\}')) {
        $inhalt = $block.Groups[1]
        foreach ($m in [regex]::Matches($inhalt.Value, '(?<![\w-])(?<eig>-{0,2}[A-Za-z][\w-]*)\s*:\s*(?<wert>[^;]*)')) {
            $eig = $m.Groups['eig'].Value.ToLowerInvariant()
            $wert = ($m.Groups['wert'].Value -replace '!important', '').Trim()
            $nr = Get-ZeileNr $d ($inhalt.Index + $m.Index)
            $ohneUrl = [regex]::Replace($wert, 'url\([^)]*\)', 'URL')
            $wortlich = Get-OhneVar $ohneUrl
            $eigen = $eig.StartsWith('--')

            # Farben: #hex und Farbfunktionen überall, Farbnamen in Farbeigenschaften.
            if ($wortlich -match '(?<![\w&-])#[0-9a-fA-F]{3,8}(?![\w-])' -or $wortlich -match '(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(') {
                $befunde.Add((Get-Fundstelle $d $nr 'Farb-Literal'))
            } elseif ($eig -match $FarbEigenschaft) {
                $w = $wert.Trim().ToLowerInvariant()
                if (-not $w.StartsWith('var(') -and $w -match '^[a-z-]+$' -and $w -notmatch $FarbWoerter) {
                    $befunde.Add((Get-Fundstelle $d $nr 'Farbe ohne Token'))
                }
            }
            # Radien: nur Tokens (0 ist erlaubt).
            if ($eig -match 'radius$' -and (Test-ZahlNichtNull $wortlich 'px|rem|em|%|vw|vh|vmin|vmax|ch|ex')) {
                $befunde.Add((Get-Fundstelle $d $nr 'Radius-Literal'))
            }
            # Schrift: Grösse, Gewicht und die Kurzschrift nur als Rolle (--t-*) bzw. Token.
            $schrift = $false
            if ($eig -eq 'font-size' -and (Test-ZahlNichtNull $wortlich 'px|rem|em|%|pt|vw|vh')) { $schrift = $true }
            if ($eig -eq 'font-weight' -and $wortlich -match '(?<![\w-])(\d+|bold|bolder|lighter)(?![\w-])') { $schrift = $true }
            if ($eig -eq 'font' -and (Test-ZahlNichtNull $wortlich 'px|rem|em|%|pt')) { $schrift = $true }
            if ($schrift) { $befunde.Add((Get-Fundstelle $d $nr 'Schrift-Literal')) }
            # Dauern und Kurven in Übergängen und Animationen (auch in eigenen Properties).
            $bewegt = $eigen -or $eig -match '^(transition|animation)' -or $eig -match '-(duration|delay|timing-function)$'
            if ($bewegt -and (Test-ZahlNichtNull $wortlich 'ms|s')) {
                $befunde.Add((Get-Fundstelle $d $nr 'Dauer-Literal'))
            }
            if ($bewegt -and $wortlich -match '(cubic-bezier|steps|linear)\(|(?<![\w-])(ease|ease-in|ease-out|ease-in-out|step-start|step-end)(?![\w-])' ) {
                $befunde.Add((Get-Fundstelle $d $nr 'Kurven-Literal'))
            } elseif (-not $eigen -and $eig -match '^(transition|animation)' -and $wortlich -match '(?<![\w-])linear(?![\w-(])') {
                $befunde.Add((Get-Fundstelle $d $nr 'Kurven-Literal'))
            }
        }
    }
}
Show-Pruefung '3. Seiten-CSS ohne Farb-, Radius-, Schrift-, Dauer- und Kurven-Literale' $befunde ($SeitenCss -join ', ')

# ---------------------------------------------------------------------------
# 4. JavaScript: keine Markup- und Code-aus-Text-Schnittstellen, keine Browser-Dialoge
# ---------------------------------------------------------------------------

$JsVerbote = @(
    @{ Muster = '(?<![\w$])(innerHTML|outerHTML)(?![\w$])'; Art = 'innerHTML/outerHTML' },
    @{ Muster = '(?<![\w$])insertAdjacentHTML(?![\w$])'; Art = 'insertAdjacentHTML' },
    @{ Muster = '(?<![\w$])document\s*\.\s*write(ln)?\s*\('; Art = 'document.write' },
    @{ Muster = '(?<![\w$.])eval\s*\('; Art = 'eval' },
    @{ Muster = '(?<![\w$])new\s+Function\s*\('; Art = 'new Function' },
    @{ Muster = '(?<![\w$])window\s*\.\s*(confirm|alert|prompt)(?![\w$])'; Art = 'window.confirm/alert/prompt' },
    @{ Muster = '(?<![\w$.])(confirm|alert|prompt)\s*\('; Art = 'confirm/alert/prompt' },
    # Browser-title statt eigenem Tooltip (titel: / UI.tipp → data-tipp); document.title ist erlaubt.
    @{ Muster = '(?<!document)\.title\s*=(?!=)'; Art = 'title (statt UI.tipp)' },
    @{ Muster = 'setAttribute\(\s*["'']title["'']'; Art = 'title (statt UI.tipp)' }
)
$befunde = New-Object System.Collections.Generic.List[string]
foreach ($d in $Js) {
    foreach ($v in $JsVerbote) {
        foreach ($m in [regex]::Matches($d.Ohne, $v.Muster)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) $v.Art))
        }
    }
}
Show-Pruefung '4. JavaScript ohne innerHTML & Co., eval, Browser-Dialoge, title' $befunde ('{0} Dateien' -f $Js.Count)

# ---------------------------------------------------------------------------
# 5. HTML: kein Inline-Skript, keine on*-Attribute, keine javascript:-Adressen
# ---------------------------------------------------------------------------

$befunde = New-Object System.Collections.Generic.List[string]
$skriptZahl = 0
foreach ($d in $Html) {
    foreach ($m in [regex]::Matches($d.Ohne, '<script\b([^>]*)>([\s\S]*?)</script\s*>', 'IgnoreCase')) {
        $skriptZahl++
        $attribute = $m.Groups[1].Value
        if ($attribute -notmatch '(?i)(^|\s)src\s*=') {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) 'Inline-Skript (ohne src)'))
        } elseif ($m.Groups[2].Value.Trim().Length -gt 0) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) 'Skript mit src UND Inhalt'))
        }
    }
    foreach ($tag in [regex]::Matches($d.Ohne, '<[A-Za-z][\w:-]*(\s[^<>]*)?>')) {
        foreach ($a in [regex]::Matches($tag.Value, '(?i)\s(on[a-z]+)\s*=')) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d ($tag.Index + $a.Index)) ('Attribut ' + $a.Groups[1].Value)))
        }
        if ($tag.Value -match '(?i)\s(href|src|action|formaction)\s*=\s*["'']?\s*javascript:') {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $tag.Index) 'javascript:-Adresse'))
        }
    }
}
Show-Pruefung '5. HTML ohne Inline-Skript und on*-Attribute' $befunde ('{0} Skript-Tags, alle mit src' -f $skriptZahl)

# ---------------------------------------------------------------------------
# 6. MSAL mit derselben integrity auf allen Seiten
# ---------------------------------------------------------------------------

$befunde = New-Object System.Collections.Generic.List[string]
$msal = @()
foreach ($d in $Html) {
    foreach ($m in [regex]::Matches($d.Ohne, '<script\b[^>]*msal-browser[^>]*>', 'IgnoreCase')) {
        $tag = $m.Value
        $integ = ''
        $mi = [regex]::Match($tag, '(?i)\sintegrity\s*=\s*"([^"]*)"')
        if ($mi.Success) { $integ = $mi.Groups[1].Value }
        $quelle = ''
        $ms = [regex]::Match($tag, '(?i)\ssrc\s*=\s*"([^"]*)"')
        if ($ms.Success) { $quelle = $ms.Groups[1].Value }
        $nr = Get-ZeileNr $d $m.Index
        $msal += [pscustomobject]@{ Datei = $d; Nr = $nr; Integritaet = $integ; Quelle = $quelle }
        if (-not $integ) { $befunde.Add((Get-Fundstelle $d $nr 'MSAL ohne integrity')) }
        if ($tag -notmatch '(?i)\scrossorigin\s*=\s*"anonymous"') { $befunde.Add((Get-Fundstelle $d $nr 'MSAL ohne crossorigin="anonymous"')) }
    }
}
if ($msal.Count -eq 0) {
    $befunde.Add('keine Seite lädt MSAL (msal-browser) – erwartet mindestens index.html')
} else {
    $haeufigste = $msal | Group-Object Integritaet | Sort-Object Count -Descending | Select-Object -First 1
    foreach ($x in $msal) {
        if ($x.Integritaet -ne $haeufigste.Name) {
            $befunde.Add((Get-Fundstelle $x.Datei $x.Nr ('andere integrity als die übrigen Seiten: ' + $x.Integritaet)))
        }
    }
    $quellen = @($msal | Group-Object Quelle)
    if ($quellen.Count -gt 1) {
        foreach ($x in $msal) { $befunde.Add((Get-Fundstelle $x.Datei $x.Nr ('MSAL-Quelle ' + $x.Quelle))) }
    }
}
$msalText = ''
if ($msal.Count) { $msalText = ('{0} Seiten: {1}' -f $msal.Count, (($msal | ForEach-Object { $_.Datei.Name }) -join ', ')) }
Show-Pruefung '6. MSAL mit gleicher integrity auf allen Seiten' $befunde $msalText

# ---------------------------------------------------------------------------
# 7. Altlasten aus der Zeit vor dem Umbau
# ---------------------------------------------------------------------------

$Altlasten = @(
    @{ Muster = '(?i)#0b57d0(?![0-9a-f])'; Art = 'Google-Blau #0b57d0' },
    @{ Muster = '(?i)#e8f0fe(?![0-9a-f])'; Art = 'Google-Blau hell #e8f0fe' },
    @{ Muster = '--primaer-hell(?![\w-])'; Art = 'altes Token --primaer-hell' },
    @{ Muster = 'knopf-gefahr(?![\w-])'; Art = 'alte Klasse knopf-gefahr' }
)
$befunde = New-Object System.Collections.Generic.List[string]
foreach ($d in $Dateien) {
    foreach ($a in $Altlasten) {
        foreach ($m in [regex]::Matches($d.Ohne, $a.Muster)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) $a.Art))
        }
    }
}
Show-Pruefung '7. Keine Altlasten (#0b57d0, #e8f0fe, --primaer-hell, knopf-gefahr)' $befunde ''

# ---------------------------------------------------------------------------

Write-Host ''
if ($script:Fehlerhaft) {
    Write-Host ('Ergebnis: {0} von {1} Prüfungen mit Fundstellen' -f $script:Fehlerhaft, $script:Anzahl) -ForegroundColor Red
    exit 1
}
Write-Host ('Ergebnis: alle {0} Prüfungen OK' -f $script:Anzahl) -ForegroundColor Green
exit 0
