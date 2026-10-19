<#
.SYNOPSIS
  Prüft das Frontend (Ordner frontend) statisch auf die Regeln des Design-Systems und der
  Inhaltsrichtlinie – ohne Browser, ohne Netzwerk, in wenigen Sekunden.

.DESCRIPTION
  Nach jeder Änderung am Frontend laufen lassen (frontend\STYLEGUIDE.md, Abschnitt 10.3). Die
  Grundlage ist Dashboard-Style, als unveränderte Kopie in frontend\vendor\dashboard-style\;
  geprüft wird der eigene Code daneben (alle .css, .js und .html direkt im Ordner frontend)
  und dass die Kopie unverändert ist. Neun Prüfungen; Kommentare zählen nirgends mit
  (/* … */ und // in CSS und JS, <!-- … --> in HTML):

    1. Tokens      Jedes var(--x) im eigenen CSS und in den <style>-Blöcken der HTML-Dateien ist
                   definiert: im eigenen CSS (thema.css …), in Dashboard-Style (vendor\…\ds.css),
                   in einem <style> oder zur Laufzeit über setProperty("--x", …) in einer JS-Datei
                   (auch ds.js). Ein var(--x, Ersatz) mit Ersatzwert ist ein Schalter und gilt als
                   definiert.
    2. Bewegung    @keyframes stehen nur in Dashboard-Style (vendor\…\css\motion.css und dessen
                   Bündel ds.css), nie im eigenen CSS, JS oder HTML. Jeder Keyframe-Name, den das
                   eigene CSS nennt (animation, animation-name), gibt es dort. Bewegungs-Tokens
                   (--ds-dur-*, --ds-ease-*, --ds-distance-*, --ds-scale-*, --ds-stagger,
                   --ds-delay-*, --ds-loop-*) setzt das eigene CSS nie: der Schalter für
                   reduzierte Bewegung in Dashboard-Style hängt daran.
    3. Literale    Das eigene CSS ausser thema.css (bausteine.css, rahmen.css und die
                   Seitenvorlagen) enthält keine Farb-Literale (#hex, rgb(), hsl() …, Farbnamen),
                   keine Radius-, Schrift-, Dauer- oder Kurven-Literale (cubic-bezier, ease …) –
                   nur Tokens. Farben, Schriften und Masse stehen nur im Thema (thema.css).
    4. JavaScript  kein innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function,
                   kein (window.)confirm, alert oder prompt, kein Browser-title (eigene Tooltips:
                   titel, UI.tipp; document.title ist erlaubt), und von Dashboard-Style nur die
                   Helfer ohne HTML-Text (DS.icons.iconElement statt DS.icons.icon, kein
                   DS.dom.morphHtml).
    5. HTML        kein Inline-<script> (die Inhaltsrichtlinie in _headers verbietet es), keine
                   on*-Attribute, keine javascript:-Adressen. Erlaubt bleibt die eine Zeile
                   <style>@view-transition { navigation: auto; }</style> im <head>.
    6. MSAL        Alle Seiten, die MSAL vom CDN laden, tun es mit derselben integrity (SRI) und mit
                   crossorigin="anonymous".
    7. Altlasten   keine Klassen von vor Dashboard-Style (.knopf, .karte, .schublade …) in CSS, HTML
                   und den Klassen, die das JS setzt oder sucht; keine alten Tokens (--flaeche, --a4,
                   --t-text …); kein design.css, bewegung.css oder bewegung.js; kein Google Fonts
                   (fonts.googleapis.com, fonts.gstatic.com); kein #0b57d0, #e8f0fe, --primaer-hell
                   oder knopf-gefahr.
    8. Kopie       vendor\dashboard-style stimmt mit seiner SHA256SUMS überein: jede Datei hat ihre
                   Prüfsumme, keine fehlt, keine ist dazugekommen (niemand hat die Kopie von Hand
                   geändert; aktualisiert wird sie nur mit vendor.ps1 bzw. vendor.sh). VERSION ist da.
    9. Seiten      Jede Seite lädt Dashboard-Style vor dem eigenen CSS (fonts.css, ds.css, thema.css,
                   bausteine.css, rahmen.css in dieser Reihenfolge, die Blätter der Seite erst danach),
                   ds.js vor bausteine.js, trägt class="ds-theme ds-base" auf <html>, und jede
                   Datei, auf die sie zeigt, gibt es.

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

# Dashboard-Style: die unveränderte Kopie und die Dateien, die die Prüfungen daraus lesen.
$DsOrdner = Join-Path $Ordner 'vendor\dashboard-style'
$DsBuendel = 'ds.css'
$DsBewegung = 'css\motion.css'
$DsSkript = 'ds.js'

# Das Thema darf Farben und Schriften setzen; alles übrige eigene CSS nur Tokens lesen.
$ThemaCss = 'thema.css'
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

function Read-Datei {
    <# Eine Datei als Objekt: Name (für die Ausgabe), Art, roher Text, Text ohne Kommentare. #>
    param([string]$Pfad, [string]$Name)
    $roh = [IO.File]::ReadAllText($Pfad, $Utf8)
    if ($roh.Length -gt 0 -and $roh[0] -eq [char]0xFEFF) { $roh = $roh.Substring(1) }
    $art = [IO.Path]::GetExtension($Pfad).TrimStart('.').ToLowerInvariant()
    $ohne = Get-OhneKommentare -Text $roh -Art $art
    return [pscustomobject]@{
        Name     = $Name
        Art      = $art
        Roh      = $roh
        Ohne     = $ohne
        Anfaenge = (Get-Zeilenanfaenge $ohne)
        Zeilen   = ($roh -split "`r?`n")
    }
}

# Der eigene Code: alle .css, .js, .html direkt im Ordner (nicht in vendor\, nicht in schriften\).
$Dateien = @()
foreach ($f in (Get-ChildItem -LiteralPath $Ordner -File | Where-Object { $_.Extension -in @('.css', '.js', '.html') } | Sort-Object Name)) {
    $Dateien += Read-Datei -Pfad $f.FullName -Name $f.Name
}
$Css = @($Dateien | Where-Object { $_.Art -eq 'css' })
$Js = @($Dateien | Where-Object { $_.Art -eq 'js' })
$Html = @($Dateien | Where-Object { $_.Art -eq 'html' })

# Dashboard-Style (nur gelesen, um Tokens und Keyframes zu kennen).
$Ds = @{}
foreach ($n in @($DsBuendel, $DsBewegung, $DsSkript)) {
    $p = Join-Path $DsOrdner $n
    if (Test-Path -LiteralPath $p -PathType Leaf) { $Ds[$n] = Read-Datei -Pfad $p -Name ('vendor/dashboard-style/' + ($n -replace '\\', '/')) }
}

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

Write-Host ('Pruefe-Frontend: {0}  ({1} CSS, {2} JS, {3} HTML, Dashboard-Style in vendor\dashboard-style)' -f $Ordner, $Css.Count, $Js.Count, $Html.Count)
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
$dsTokens = 0
if ($Ds.ContainsKey($DsBuendel)) {
    foreach ($m in [regex]::Matches($Ds[$DsBuendel].Ohne, '(--[\w-]+)\s*:')) { if ($definiert.Add($m.Groups[1].Value)) { $dsTokens++ } }
}
foreach ($d in (@($Js) + @($Ds[$DsSkript] | Where-Object { $_ }))) {
    foreach ($m in [regex]::Matches($d.Ohne, 'setProperty\(\s*["''](--[\w-]+)["'']')) { [void]$definiert.Add($m.Groups[1].Value) }
}
$befunde = New-Object System.Collections.Generic.List[string]
if (-not $Ds.ContainsKey($DsBuendel)) { $befunde.Add('vendor/dashboard-style/ds.css fehlt – die Tokens von Dashboard-Style sind nicht da') }
foreach ($l in $lesestellen) {
    if ($l.Ersatz -or $definiert.Contains($l.Name)) { continue }
    $befunde.Add((Get-Fundstelle $l.Datei (Get-ZeileNr $l.Datei $l.Index) ('undefiniert ' + $l.Name)))
}
Show-Pruefung '1. Tokens: jedes var(--x) ist definiert' $befunde ('{0} Lesestellen, {1} Namen definiert (davon {2} nur in Dashboard-Style)' -f $lesestellen.Count, $definiert.Count, $dsTokens)

# ---------------------------------------------------------------------------
# 2. Bewegung: @keyframes nur in Dashboard-Style, nur bekannte Namen, keine Bewegungs-Tokens
# ---------------------------------------------------------------------------

$befunde = New-Object System.Collections.Generic.List[string]
foreach ($d in $Dateien) {
    foreach ($m in [regex]::Matches($d.Ohne, '@keyframes\b')) {
        $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) '@keyframes ausserhalb von Dashboard-Style (vendor/dashboard-style/css/motion.css)'))
    }
}
$keyframes = New-Object 'System.Collections.Generic.HashSet[string]'
if ($Ds.ContainsKey($DsBewegung)) {
    foreach ($m in [regex]::Matches($Ds[$DsBewegung].Ohne, '@keyframes\s+([\w-]+)')) { [void]$keyframes.Add($m.Groups[1].Value) }
} else {
    $befunde.Add('vendor/dashboard-style/css/motion.css fehlt')
}
# Das Bündel ds.css enthält motion.css unverändert: dort dürfen dieselben Keyframes stehen, sonst keine.
if ($Ds.ContainsKey($DsBuendel)) {
    foreach ($m in [regex]::Matches($Ds[$DsBuendel].Ohne, '@keyframes\s+([\w-]+)')) {
        if (-not $keyframes.Contains($m.Groups[1].Value)) {
            $befunde.Add((Get-Fundstelle $Ds[$DsBuendel] (Get-ZeileNr $Ds[$DsBuendel] $m.Index) ('@keyframes, die nicht aus motion.css kommt: ' + $m.Groups[1].Value)))
        }
    }
}
$AnimationsWoerter = '^(?i)(none|infinite|normal|reverse|alternate|alternate-reverse|forwards|backwards|both|running|paused|ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|inherit|initial|unset|revert)$'
$BewegungsToken = '(?<![\w-])(--ds-(dur|ease|distance|scale|delay|loop)-[\w-]*|--ds-ease|--ds-stagger)\s*:'
foreach ($d in $Css) {
    foreach ($block in [regex]::Matches($d.Ohne, '\{([^{}]*)\}')) {
        $inhalt = $block.Groups[1]
        foreach ($m in [regex]::Matches($inhalt.Value, '(?<![\w-])(animation(-name)?)\s*:\s*([^;]*)')) {
            # Was ohne var(…), Kurvenfunktionen und Schlüsselwörter übrig bleibt, ist ein
            # Keyframe-Name (auch einer ohne ds-, etwa ein eigener «aufziehen»).
            $wortlich = [regex]::Replace($m.Groups[3].Value, 'var\([^()]*(\([^()]*\)[^()]*)*\)', ' ')
            $wortlich = [regex]::Replace($wortlich, '[\w-]+\([^()]*\)', ' ')
            foreach ($w in [regex]::Matches($wortlich, '(?<![\w.-])(-?[A-Za-z_][\w-]*)')) {
                if ($w.Groups[1].Value -match $AnimationsWoerter) { continue }
                if (-not $keyframes.Contains($w.Groups[1].Value)) {
                    $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d ($inhalt.Index + $m.Index)) ('unbekannter Keyframe ' + $w.Groups[1].Value)))
                }
            }
        }
        foreach ($m in [regex]::Matches($inhalt.Value, $BewegungsToken)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d ($inhalt.Index + $m.Index)) ('Bewegungs-Token gesetzt: ' + $m.Groups[1].Value)))
        }
    }
}
Show-Pruefung '2. Bewegung: @keyframes nur in Dashboard-Style, nur bekannte Namen' $befunde ('{0} Keyframes in vendor/dashboard-style/css/motion.css' -f $keyframes.Count)

# ---------------------------------------------------------------------------
# 3. Eigenes CSS (ausser dem Thema) ohne Farb-, Radius-, Schrift-, Dauer- und Kurven-Literale
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
$OhneThema = @($Css | Where-Object { $_.Name -ne $ThemaCss })
foreach ($d in $OhneThema) {
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
            # Schrift: Grösse, Gewicht und die Kurzschrift nur als Rolle (--ds-font-*) bzw. Token.
            $schrift = $false
            if ($eig -eq 'font-size' -and (Test-ZahlNichtNull $wortlich 'px|rem|em|%|pt|vw|vh')) { $schrift = $true }
            if ($eig -eq 'font-weight' -and $wortlich -match '(?<![\w-])(\d+|bold|bolder|lighter)(?![\w-])') { $schrift = $true }
            if ($eig -eq 'font' -and (Test-ZahlNichtNull $wortlich 'px|rem|em|%|pt')) { $schrift = $true }
            if ($eig -eq 'font-family' -and $wortlich -match '[A-Za-z]' -and $wortlich -notmatch '^\s*(VAR|inherit)\s*$') { $schrift = $true }
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
Show-Pruefung '3. Eigenes CSS ohne Farb-, Radius-, Schrift-, Dauer- und Kurven-Literale' $befunde (($OhneThema | ForEach-Object { $_.Name }) -join ', ')

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
    @{ Muster = 'setAttribute\(\s*["'']title["'']'; Art = 'title (statt UI.tipp)' },
    # Dashboard-Style: nur die Helfer ohne HTML-Text.
    @{ Muster = 'DS\s*\.\s*icons\s*\.\s*icon\s*\('; Art = 'DS.icons.icon (HTML-Text; DS.icons.iconElement nehmen)' },
    @{ Muster = 'DS\s*\.\s*dom\s*\.\s*morphHtml(?![\w$])'; Art = 'DS.dom.morphHtml (parst HTML-Text)' }
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
# 7. Altlasten: Namen von vor Dashboard-Style und von vor dem Umbau auf das ChatBob-Design
# ---------------------------------------------------------------------------

# Klassen, die nach Dashboard-Style gezogen sind (STYLEGUIDE.md, Abschnitt 13: alt → neu).
$AlteKlassen = @(
    'knopf', 'knopf-primaer', 'knopf-tonal', 'knopf-leise', 'knopf-still', 'knopf-sinnbild', 'knopf-scheibe', 'knopf-klein', 'knopf-tausch',
    'spinner', 'spinner-klein', 'status', 'status-erfolg', 'status-warnung', 'status-gefahr', 'status-laeuft', 'status-neutral', 'status-spinner',
    'banner', 'banner-erfolg', 'banner-warnung', 'banner-gefahr', 'banner-text',
    'karte', 'karte-gefuellt', 'karte-kopf', 'karte-titel', 'karte-untertitel', 'karte-aktionen', 'karte-unter',
    'unterabschnitt', 'raster-2', 'stapel', 'kacheln', 'kachel', 'kachel-text', 'kachel-wert', 'kachel-unter',
    'kennwerte', 'fakten', 'teile', 'teile-liste', 'meta', 'hinweis', 'ohne-umbruch', 'zahl', 'veraltet', 'nur-sr',
    'leerzustand', 'leerzustand-scheibe', 'leerzustand-titel', 'leerzustand-text',
    'feld', 'feld-label', 'feld-hinweis', 'feld-fehler', 'feld-eingabe', 'feld-gefuellt', 'feld-raster', 'feld-raster-3', 'feld-voll', 'feld-reihe',
    'suchfeld', 'suche', 'ankreuzen', 'ankreuzen-klein', 'aktionszeile', 'werkzeugleiste',
    'tabelle', 'tabelle-schlicht', 'tabelle-schlicht-rahmen', 'tabelle-sortierung', 'dicht',
    'fortschritt-gruppe', 'fortschritt', 'fortschritt-balken', 'fortschritt-text', 'fortschritt-detail', 'unbestimmt',
    'ladezeile', 'skelett', 'skelett-karte', 'skelett-zeile', 'skelett-titel', 'skelett-lead', 'skelett-kartentitel', 'skelett-kurz', 'skelett-mittel',
    'ladebalken', 'eintritt', 'austritt', 'staffel', 'aufklappbar', 'hat-indikator', 'indikator', 'indikator--sofort', 'chips', 'chips-trenner',
    'app', 'sprungmarke', 'kopf', 'kopf-menue', 'kopf-marke', 'konto', 'konto-text', 'konto-name', 'konto-email', 'konto-initiale',
    'schublade', 'schublade-kopf', 'schublade-liste', 'schublade-gruppe', 'schublade-titel', 'schublade-eintrag', 'schublade-text',
    'schublade-indikator', 'schublade-schleier', 'tafel-rahmen', 'tafel', 'bahn', 'seitenkopf', 'seitenkopf-titel', 'seitenkopf-lead',
    'dialog', 'dialog-schleier', 'dialog-flaeche', 'dialog-titel', 'dialog-text', 'dialog-knoepfe',
    'blatt', 'blatt-schleier', 'blatt-flaeche', 'blatt-breit', 'blatt-kopf', 'blatt-titel', 'blatt-koerper',
    'meldungen', 'meldung', 'meldung-fehler', 'meldung-info', 'meldung-text', 'meldung-schliessen', 'tipp', 'aktiv', 'ungueltig'
)
$alt = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($k in $AlteKlassen) { [void]$alt.Add($k) }

function Add-KlassenBefunde {
    <# Klassennamen (durch Leerzeichen getrennt) gegen die alte Liste prüfen. #>
    param($Datei, [int]$Index, [string]$Klassen, $Befunde)
    foreach ($k in ($Klassen -split '\s+')) {
        if ($k -and $alt.Contains($k)) { $Befunde.Add((Get-Fundstelle $Datei (Get-ZeileNr $Datei $Index) ('alte Klasse ' + $k))) }
    }
}

$befunde = New-Object System.Collections.Generic.List[string]
# CSS: Klassen in Selektoren (Text vor «{», ohne @-Regeln).
foreach ($d in $Css) {
    foreach ($m in [regex]::Matches($d.Ohne, '(?<sel>[^{};]+)\{')) {
        $sel = $m.Groups['sel'].Value
        if ($sel.Trim().StartsWith('@')) { continue }
        foreach ($k in [regex]::Matches($sel, '\.(-?[A-Za-z][\w-]*)')) {
            if ($alt.Contains($k.Groups[1].Value)) { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d ($m.Index + $k.Index)) ('alte Klasse .' + $k.Groups[1].Value))) }
        }
    }
}
# HTML: class-Attribute.
foreach ($d in $Html) {
    foreach ($m in [regex]::Matches($d.Ohne, '(?i)\sclass\s*=\s*"([^"]*)"')) { Add-KlassenBefunde $d $m.Index $m.Groups[1].Value $befunde }
}
# JS: Klassen, die gesetzt oder gesucht werden.
$JsKlassenMuster = @(
    '(?<![\w$])el\(\s*"[\w-]+"\s*,\s*"([^"]*)"',
    'classList\s*\.\s*(?:add|remove|toggle|contains)\(\s*"([^"]+)"',
    '\.className\s*=\s*"([^"]*)"',
    '(?<![\w$])klasse\s*:\s*"([^"]*)"'
)
foreach ($d in $Js) {
    foreach ($muster in $JsKlassenMuster) {
        foreach ($m in [regex]::Matches($d.Ohne, $muster)) { Add-KlassenBefunde $d $m.Index $m.Groups[1].Value $befunde }
    }
    foreach ($m in [regex]::Matches($d.Ohne, '(?:querySelector(?:All)?|closest|matches)\(\s*"([^"]*)"')) {
        foreach ($k in [regex]::Matches($m.Groups[1].Value, '\.(-?[A-Za-z][\w-]*)')) {
            if ($alt.Contains($k.Groups[1].Value)) { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) ('alte Klasse .' + $k.Groups[1].Value))) }
        }
    }
}
# Alte Tokens, alte Dateien, Google Fonts und die Altlasten vor dem ChatBob-Design.
$Altlasten = @(
    @{ Muster = '(?<![\w-])--(hintergrund|flaeche(-tief|-hoch|-hoechst)?|text-leise|text-still|linie(-stark)?|umriss|primaer(-hover|-druck)?|auf-primaer|akzent|auf-akzent|erfolg(-container)?|warnung(-container|-flaeche)?|gefahr(-container)?|auf-(erfolg|warnung|gefahr|invers)|invers(-primaer)?|schleier|r-[\w-]+|t-[\w-]+|a\d+|schrift(-mono)?|gewicht-(text|titel|beschriftung)|dauer-[\w-]+|kurve-[\w-]+|weg-[\w-]+|skala-[\w-]+|staffel|zustand-[\w-]+|z-[\w-]+|fokus(-[\w-]+)?|knopf-[\w-]+|kopf-hoch|schublade-breit|bahn-max|mass|meldung-(platz|links|verschub|reserve)|eintritt-[\w-]+|austritt-[\w-]+|bewegung-[\w-]+|indikator-[\w-]+|fortschritt|erhebung-\d)(?![\w-])'; Art = 'altes Token (vor Dashboard-Style)' },
    @{ Muster = '(?i)(?<![\w-])(design\.css|bewegung\.css|bewegung\.js)(?![\w-])'; Art = 'alte Datei (ersetzt durch Dashboard-Style)'; NurCode = $true },
    @{ Muster = '(?i)fonts\.(googleapis|gstatic)\.com'; Art = 'Google Fonts (selbst gehostet: vendor/dashboard-style/fonts, schriften/)' },
    @{ Muster = '(?i)#0b57d0(?![0-9a-f])'; Art = 'Google-Blau #0b57d0' },
    @{ Muster = '(?i)#e8f0fe(?![0-9a-f])'; Art = 'Google-Blau hell #e8f0fe' },
    @{ Muster = '--primaer-hell(?![\w-])'; Art = 'altes Token --primaer-hell' },
    @{ Muster = 'knopf-gefahr(?![\w-])'; Art = 'alte Klasse knopf-gefahr' }
)
foreach ($d in $Dateien) {
    foreach ($a in $Altlasten) {
        foreach ($m in [regex]::Matches($d.Ohne, $a.Muster)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) $a.Art))
        }
    }
}
# Die Inhaltsrichtlinie braucht Google Fonts nicht mehr.
$headers = Join-Path $Ordner '_headers'
if (Test-Path -LiteralPath $headers -PathType Leaf) {
    $hd = Read-Datei -Pfad $headers -Name '_headers'
    foreach ($m in [regex]::Matches(($hd.Roh -split "`r?`n" | Where-Object { $_ -notmatch '^\s*#' }) -join "`n", '(?i)fonts\.(googleapis|gstatic)\.com')) {
        $befunde.Add('_headers  Google Fonts in der Inhaltsrichtlinie (nicht mehr nötig)')
    }
}
Show-Pruefung '7. Keine Altlasten (alte Klassen und Tokens, design.css/bewegung.*, Google Fonts)' $befunde ('{0} alte Klassennamen geprüft' -f $AlteKlassen.Count)

# ---------------------------------------------------------------------------
# 8. Die Kopie von Dashboard-Style ist unverändert (SHA256SUMS)
# ---------------------------------------------------------------------------

$befunde = New-Object System.Collections.Generic.List[string]
$summen = Join-Path $DsOrdner 'SHA256SUMS'
$version = ''
if (-not (Test-Path -LiteralPath $summen -PathType Leaf)) {
    $befunde.Add('vendor/dashboard-style/SHA256SUMS fehlt (Kopie mit vendor.ps1 bzw. vendor.sh neu anlegen)')
} else {
    $erwartet = @{}
    foreach ($zeile in ([IO.File]::ReadAllText($summen, $Utf8) -split "`r?`n")) {
        if (-not $zeile.Trim()) { continue }
        $m = [regex]::Match($zeile, '^([0-9a-f]{64})  (.+)$')
        if (-not $m.Success) { $befunde.Add(('SHA256SUMS: unlesbare Zeile «{0}»' -f $zeile)); continue }
        $erwartet[$m.Groups[2].Value] = $m.Groups[1].Value
    }
    $basis = (Resolve-Path -LiteralPath $DsOrdner).Path
    $vorhanden = @{}
    foreach ($f in (Get-ChildItem -LiteralPath $DsOrdner -File -Recurse)) {
        $rel = $f.FullName.Substring($basis.Length).TrimStart('\', '/') -replace '\\', '/'
        if ($rel -eq 'SHA256SUMS') { continue }
        $vorhanden[$rel] = $f.FullName
    }
    foreach ($rel in ($erwartet.Keys | Sort-Object)) {
        if (-not $vorhanden.ContainsKey($rel)) { $befunde.Add(('fehlt: vendor/dashboard-style/{0}' -f $rel)); continue }
        $ist = (Get-FileHash -LiteralPath $vorhanden[$rel] -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($ist -ne $erwartet[$rel]) { $befunde.Add(('geändert: vendor/dashboard-style/{0}' -f $rel)) }
    }
    foreach ($rel in ($vorhanden.Keys | Sort-Object)) {
        if (-not $erwartet.ContainsKey($rel)) { $befunde.Add(('dazugekommen: vendor/dashboard-style/{0}' -f $rel)) }
    }
    $vPfad = Join-Path $DsOrdner 'VERSION'
    if (Test-Path -LiteralPath $vPfad -PathType Leaf) {
        $version = (([IO.File]::ReadAllText($vPfad, $Utf8) -split "`r?`n")[0] -replace '^version\s+', '').Trim()
    } else {
        $befunde.Add('vendor/dashboard-style/VERSION fehlt')
    }
}
Show-Pruefung '8. Dashboard-Style unverändert (SHA256SUMS)' $befunde ('Version {0}, {1} Dateien' -f $version, $erwartet.Count)

# ---------------------------------------------------------------------------
# 9. Seiten laden Dashboard-Style richtig, und jede Datei, auf die sie zeigen, gibt es
# ---------------------------------------------------------------------------

$Reihenfolge = @('vendor/dashboard-style/fonts/fonts.css', 'vendor/dashboard-style/ds.css', 'thema.css', 'bausteine.css', 'rahmen.css')
$befunde = New-Object System.Collections.Generic.List[string]
foreach ($d in $Html) {
    if ($d.Ohne -notmatch '<html\b[^>]*\sclass\s*=\s*"[^"]*\bds-theme\b[^"]*"' -or $d.Ohne -notmatch '<html\b[^>]*\sclass\s*=\s*"[^"]*\bds-base\b[^"]*"') {
        $befunde.Add(('{0}  <html> ohne class="ds-theme ds-base"' -f $d.Name))
    }
    $stile = @()
    foreach ($m in [regex]::Matches($d.Ohne, '<link\b[^>]*rel\s*=\s*"stylesheet"[^>]*href\s*=\s*"([^"]+)"', 'IgnoreCase')) { $stile += $m.Groups[1].Value }
    $pos = -1
    foreach ($s in $Reihenfolge) {
        $i = [Array]::IndexOf($stile, $s)
        if ($i -lt 0) { $befunde.Add(('{0}  lädt {1} nicht' -f $d.Name, $s)); continue }
        if ($i -lt $pos) { $befunde.Add(('{0}  {1} steht zu früh (Reihenfolge: {2})' -f $d.Name, $s, ($Reihenfolge -join ', '))) }
        $pos = $i
    }
    # Die eigenen Blätter der Seite (styles.css, client.css …) kommen nach rahmen.css.
    $iRahmen = [Array]::IndexOf($stile, 'rahmen.css')
    for ($k = 0; $k -lt $iRahmen; $k++) {
        if ($Reihenfolge -contains $stile[$k] -or $stile[$k] -match '^(https?:)?//') { continue }
        $befunde.Add(('{0}  {1} steht vor rahmen.css' -f $d.Name, $stile[$k]))
    }
    $skripte = @()
    foreach ($m in [regex]::Matches($d.Ohne, '<script\b[^>]*\ssrc\s*=\s*"([^"]+)"', 'IgnoreCase')) { $skripte += $m.Groups[1].Value }
    $iDs = [Array]::IndexOf($skripte, 'vendor/dashboard-style/ds.js')
    $iUi = [Array]::IndexOf($skripte, 'bausteine.js')
    if ($iDs -lt 0) { $befunde.Add(('{0}  lädt vendor/dashboard-style/ds.js nicht' -f $d.Name)) }
    elseif ($iUi -ge 0 -and $iDs -gt $iUi) { $befunde.Add(('{0}  ds.js muss vor bausteine.js stehen' -f $d.Name)) }
    foreach ($ziel in (@($stile) + @($skripte))) {
        if ($ziel -match '^(https?:)?//') { continue }
        $pfad = Join-Path $Ordner ($ziel -replace '/', '\')
        if (-not (Test-Path -LiteralPath $pfad -PathType Leaf)) { $befunde.Add(('{0}  Datei fehlt: {1}' -f $d.Name, $ziel)) }
    }
}
# Schriften: jede url() in thema.css zeigt auf eine Datei (die Schriften der Kopie deckt Prüfung 8 ab).
foreach ($d in (@($Css | Where-Object { $_.Name -eq $ThemaCss }))) {
    foreach ($m in [regex]::Matches($d.Ohne, 'url\(\s*[''"]?([^''")]+)[''"]?\s*\)')) {
        $u = $m.Groups[1].Value
        if ($u -match '^(data:|https?:)') { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $Ordner ($u -replace '/', '\')) -PathType Leaf)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) ('Datei fehlt: ' + $u)))
        }
    }
}
Show-Pruefung '9. Seiten laden Dashboard-Style vor dem eigenen CSS, alle Dateien da' $befunde ('{0} Seiten' -f $Html.Count)

# ---------------------------------------------------------------------------

Write-Host ''
if ($script:Fehlerhaft) {
    Write-Host ('Ergebnis: {0} von {1} Prüfungen mit Fundstellen' -f $script:Fehlerhaft, $script:Anzahl) -ForegroundColor Red
    exit 1
}
Write-Host ('Ergebnis: alle {0} Prüfungen OK' -f $script:Anzahl) -ForegroundColor Green
exit 0
