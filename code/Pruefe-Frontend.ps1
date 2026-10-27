<#
.SYNOPSIS
  Prüft das Frontend (Ordner frontend) statisch auf die Regeln des Design-Systems und der
  Inhaltsrichtlinie – ohne Browser, ohne Netzwerk, in wenigen Sekunden.

.DESCRIPTION
  Nach jeder Änderung am Frontend laufen lassen (frontend\STYLEGUIDE.md, Abschnitt 10.3). Die
  Grundlage ist Dashboard-Style, als unveränderte Kopie in frontend\vendor\dashboard-style\;
  geprüft wird der eigene Code daneben (alle .css, .js und .html direkt im Ordner frontend)
  und dass die Kopie unverändert ist. Vierzehn Prüfungen; Kommentare zählen nirgends mit
  (/* … */ und // in CSS und JS, <!-- … --> in HTML), ausser in Prüfung 14:

    1. Tokens      Jedes var(--x) im eigenen CSS (und in einem <style>, das Prüfung 12 ohnehin
                   verbietet) ist definiert: im eigenen CSS (thema.css …), in Dashboard-Style
                   (vendor\…\ds.css) oder zur Laufzeit über setProperty("--x", …) in einer
                   JS-Datei (auch ds.js). Ein var(--x, Ersatz) mit Ersatzwert ist ein Schalter und
                   gilt als definiert.
    2. Bewegung    @keyframes stehen nur in Dashboard-Style (vendor\…\css\motion.css und dessen
                   Bündel ds.css), nie im eigenen CSS, JS oder HTML. Jeder Keyframe-Name, den das
                   eigene CSS nennt (animation, animation-name), gibt es dort. Bewegungs-Tokens
                   (--ds-dur-*, --ds-ease-*, --ds-distance-*, --ds-scale-*, --ds-stagger,
                   --ds-delay-*, --ds-loop-*, --ds-hold-*, --ds-time-scale) setzt das eigene CSS
                   nie, auch nicht das JS über setProperty: Bewegung kommt allein aus
                   Dashboard-Style, als ein festes Schema auf jedem Gerät; die Dauern sind
                   calc() × --ds-time-scale, und CSS und DS.motion lesen dieselben Tokens. Das
                   Thema setzt zudem keine Bewegungs-Hooks (--ds-motion-*, --ds-enter-*,
                   --ds-leave-*, --ds-scan-*, --ds-clip-from, --ds-draw-length,
                   --ds-indicator-lag/-dur, --ds-i): sie erben seit Dashboard-Style 1.0 nicht
                   mehr und gehören auf das Element, das sich bewegt.
    3. Literale    Das eigene CSS ausser thema.css (bausteine.css, rahmen.css und die
                   Seitenvorlagen) enthält keine Farb-Literale (#hex, rgb(), hsl() …, Farbnamen),
                   keine Radius-, Schrift-, Dauer- oder Kurven-Literale (cubic-bezier, ease …) –
                   nur Tokens. Farben, Schriften und Masse stehen nur im Thema (thema.css).
    4. JavaScript  kein innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function,
                   kein (window.)confirm, alert oder prompt, kein Browser-title (Tooltips: titel
                   bzw. UI.tipp setzen data-tip, gezeigt von DS.overlay.tooltips; document.title
                   ist erlaubt), und von Dashboard-Style nur die Helfer ohne HTML-Text
                   (DS.icons.iconElement statt DS.icons.icon, DS.dom.morphChildren statt
                   DS.dom.morphHtml).
    5. HTML        kein Inline-<script> (die Inhaltsrichtlinie in _headers verbietet es), keine
                   on*-Attribute, keine javascript:-Adressen. (Kein <style>: Prüfung 12.)
    6. MSAL        Alle Seiten, die MSAL vom CDN laden, tun es mit derselben integrity (SRI) und mit
                   crossorigin="anonymous".
    7. Altlasten   keine Klassen von vor Dashboard-Style (.knopf, .karte, .schublade …) in CSS, HTML
                   und den Klassen, die das JS setzt oder sucht; keine alten Tokens (--flaeche, --a4,
                   --t-text …); kein design.css, bewegung.css oder bewegung.js; kein Google Fonts
                   (fonts.googleapis.com, fonts.gstatic.com); kein #0b57d0, #e8f0fe, --primaer-hell
                   oder knopf-gefahr. Dazu die ICT-Namen, die mit dem Umbau auf Dashboard-Style 1.6
                   weggefallen sind (Bewegung.reduziert, UI.beschaeftigtAbwarten, UI.knopfSperre,
                   UI.feldFrei, Rahmen.erstauftritt, Rahmen.bereit, die alte Form
                   UI.beschaeftigt(knopf, true|false), setzen({ beschaeftigt … }), umschalten:,
                   data-tipp …): ein Aufruf davon wirft erst im Browser.
    8. Kopie       vendor\dashboard-style stimmt mit seiner SHA256SUMS überein: jede Datei hat ihre
                   Prüfsumme, keine fehlt, keine ist dazugekommen, keine ist ein symbolischer Link
                   (niemand hat die Kopie von Hand geändert; aktualisiert wird sie nur mit
                   vendor.ps1 bzw. vendor.sh, dasselbe prüft dort «vendor.ps1 -Check»). VERSION
                   ist da.
    9. Seiten      Jede Seite lädt ihre Stilvorlagen in der festen Reihenfolge: grund.css als
                   erste (sie legt mit «@layer grund, ds;» die Ebenen fest, bevor ds.css die erste
                   nennt), dann vendor\…\fonts\fonts.css, ds.css, css\optional\view-transitions.css,
                   thema.css, bausteine.css, rahmen.css, falls gebraucht verlauf.css, zuletzt die
                   Blätter der Seite. ds.js steht vor bausteine.js, <html> trägt
                   class="ds-theme ds-base", und jede Datei, auf die die Seite zeigt, gibt es. Eine
                   Seite mit view-transitions.css hält das erste Bild mit
                   <link rel="expect" href="#…" blocking="render"> an; das Ziel steht direkt
                   nach rahmen.js (sonst bricht Chrome den Seitenübergang ab oder wartet auf
                   MSAL vom CDN).
   10. DS-API      Was der eigene Code von Dashboard-Style nennt, gibt es in der Kopie: jedes
                   DS.<modul>.<name> (auch über ein Kürzel wie «const M = DS.motion;») ist ein
                   Export in ds.js, abgeleitet aus dem Aufbau von window.DS (je Modul das
                   Object.freeze({ … }) am Ende), jede Glyphe in UI.SINNBILDER steht in DS.icons,
                   jede Klasse ds-* steht in ds.css, jedes --ds-* und data-ds-* in ds.css oder
                   ds.js. Entfernt Dashboard-Style etwas, scheitert so schon «Verify» der
                   nächtlichen Aktualisierung (.github/workflows/update-dashboard-style.yml),
                   statt dass die Seite erst im Browser wirft.
   11. Veraltet    keine Namen, die Dashboard-Style als veraltet oder entfernt führt: jeder Eintrag
                   von vendor/dashboard-style/deprecations.json (seit 2.0, mit Suchmuster; eine neue
                   Fassung der Kopie bringt ihre Einträge mit). Dazu von Hand, was die Datei nicht
                   führt: prefersReducedMotion, prefers-reduced-motion, .ds-motion-full,
                   .ds-toast--shown und --ds-toast-shift(-y) von Hand, role bzw. aria-live auf
                   .ds-toasts im JS (im HTML: Prüfung 12), data-open auf .ds-combo im JS,
                   --ds-spinner-track im Thema.
   12. Gerüst      Jede Seite hat das Gerüst der Referenz-App von Dashboard-Style: kein <style>
                   (die Inhaltsrichtlinie erlaubt nur Stilvorlagen), <body> ohne ds-*-Klassen,
                   darin div.ds-app mit data-seite und in dieser Reihenfolge a.ds-skip, .ds-topbar,
                   .ds-scrim, .ds-drawer, .ds-panel, .ds-view, .ds-content, .ds-page; nach dem Ende
                   von .ds-app die Meldungsregion .ds-toasts ohne role und aria-live (die Ansagen
                   legt DS.overlay.toast selbst an).
   13. Seiten-CSS  Die Blätter der Detailseiten und des Verlaufs (benutzer.css b-, client.css g-,
                   kamera.css km-, kamerarolle.css kr-, software.css sw-, telefon.css tf-,
                   verlauf.css vl-) enthalten nur Layout: jede Regel trifft eine Klasse mit dem
                   Präfix der Datei, und keine setzt Farbe, Hintergrund, Schrift, Rand, Schatten,
                   Deckkraft, Bewegung oder einen --ds-*-Hook – das Aussehen kommt aus
                   Dashboard-Style und den Bausteinen. Ausgenommen mit Grund: styles.css (die
                   Hauptseite, ohne Präfix, trägt den Zeitstrahl) und styleguide.css (zeigt
                   Farbfelder, Masse und eine Bühne, die es nur im Styleguide gibt). Eine neue
                   Stilvorlage muss hier eingeordnet werden.
   14. Text        kein Geviertstrich «—» im eigenen CSS, JS, HTML und in _headers, auch nicht in
                   Kommentaren (Schweizer Schreibweise: Halbgeviertstrich «–», AGENTS.md).

  Ausgabe: je Prüfung «OK» oder die Fundstellen (Datei:Zeile, Art, Zeile). Exit-Code 0, wenn alle
  Prüfungen halten, sonst 1.

  Was dieses Skript NICHT sieht: Aussehen, Bewegung und Bedienung. Dafür styleguide.html (lebende
  Übersicht) und die Seiten mit ?mock=1 (siehe serve.ps1). Ebenso wenig, ob ein Aufruf von
  UI.*, Rahmen.*, Bewegung.* oder F.* einen Export trifft (F entsteht erst zur Laufzeit in
  Fenster.erstellen, UI wird über mehrere Dateien ergänzt); die bekannten weggefallenen Namen
  fängt Prüfung 7.

.PARAMETER Ordner
  Der Frontend-Ordner. Standard: ..\frontend neben diesem Skript.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Pruefe-Frontend.ps1 -Ordner C:\Temp\frontend-kopie

.EXAMPLE
  pwsh -NoProfile -File code/Pruefe-Frontend.ps1
  (so läuft es in der nächtlichen Aktualisierung auf GitHub, unter Linux)

.NOTES
  Windows PowerShell 5.1 und PowerShell 7 (pwsh, auch Linux und macOS), kein Zusatzmodul.
  Liest nur, schreibt nichts.
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
# Bewegungs-Tokens: ein festes Schema aus Dashboard-Style (Dauern sind calc() × --ds-time-scale).
$BewegungsName = '--ds-(dur|ease|distance|scale|delay|loop|hold)-[\w-]*|--ds-ease|--ds-stagger|--ds-time-scale'
$BewegungsToken = '(?<![\w-])(' + $BewegungsName + ')\s*:'
# Bewegungs-Hooks erben seit Dashboard-Style 1.0 nicht mehr: im Thema (auf .ds-theme) wirken sie nie.
$BewegungsHook = '(?<![\w-])(--ds-(motion|enter|leave|scan)-[\w-]*|--ds-clip-from|--ds-draw-length|--ds-indicator-(lag|dur)|--ds-i)\s*:'
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
        if ($d.Name -eq $ThemaCss) {
            foreach ($m in [regex]::Matches($inhalt.Value, $BewegungsHook)) {
                $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d ($inhalt.Index + $m.Index)) ('Bewegungs-Hook im Thema (wirkt nur am bewegten Element): ' + $m.Groups[1].Value)))
            }
        }
    }
}
# Auch zur Laufzeit nicht: element.style.setProperty("--ds-dur-…", …) und Co.
foreach ($d in $Js) {
    foreach ($m in [regex]::Matches($d.Ohne, 'setProperty\(\s*["''](' + $BewegungsName + ')["'']')) {
        $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) ('Bewegungs-Token zur Laufzeit gesetzt: ' + $m.Groups[1].Value)))
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
    # Browser-title statt Tooltip (titel: / UI.tipp → data-tip, DS.overlay.tooltips); document.title ist erlaubt.
    @{ Muster = '(?<!document)\.title\s*=(?!=)'; Art = 'title (statt UI.tipp)' },
    @{ Muster = 'setAttribute\(\s*["'']title["'']'; Art = 'title (statt UI.tipp)' },
    # Dashboard-Style: nur die Helfer ohne HTML-Text.
    @{ Muster = 'DS\s*\.\s*icons\s*\.\s*icon\s*\('; Art = 'DS.icons.icon (HTML-Text; DS.icons.iconElement nehmen)' },
    @{ Muster = 'DS\s*\.\s*dom\s*\.\s*morphHtml(?![\w$])'; Art = 'DS.dom.morphHtml (parst HTML-Text; DS.dom.morphChildren nehmen)' }
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
    'meldungen', 'meldung', 'meldung-fehler', 'meldung-info', 'meldung-text', 'meldung-schliessen', 'tipp', 'aktiv', 'ungueltig',
    # Mit Dashboard-Style 2.0 durch dessen Teile ersetzt (STYLEGUIDE.md, Abschnitt 13).
    'b-kennzahlen', 'balken-fuell', 'banner-knoepfe', 'blatt-fuss', 'blatt-kopf-text', 'blatt-schliessen',
    'blatt-unter', 'chip', 'chip-entfernbar', 'chip-text', 'chip-x', 'chip-zeile', 'code-block', 'datenzeile-form',
    'datenzeile-hinweis', 'datenzeile-name', 'datenzeile-wert', 'dialog-breit', 'dialog-inhalt', 'dialog-liste',
    'geaendert-text', 'hinweis-zeile', 'hinweis-zeile-inhalt', 'hinweis-zeile-text', 'hinweis-zeile-titel',
    'kennwert-ton', 'kennwerte-klickbar', 'kopf-abmelden', 'kopf-konto', 'kopf-konto-trenner', 'kuerzel',
    'legende-marke', 'listen-zeile', 'listen-zeile-aktionen', 'listen-zeile-pfeil', 'listen-zeile-text',
    'listen-zeile-titel', 'listen-zeile-unter', 'mehrfach', 'meldung-aktion', 'mit-sinnbild', 'rollwaechter',
    'saeule-fuell', 'schalter-feld-huelle', 'schalter-gesperrt', 'schalter-name', 'schalter-schloss',
    'schalter-text', 'schalter-unter', 'schalter-zusatz', 'schublade-zurueck', 'seitenkopf-aktionen',
    'seitenkopf-pfad', 'seitenkopf-status', 'seitenkopf-text', 'seitenkopf-zeile', 'speicherleiste-anzahl',
    'speicherleiste-knoepfe', 'speicherleiste-text', 'verteilung-klickbar', 'verteilung-name', 'verteilung-zahl',
    'verteilung-zeile', 'zaehler', 'zaehler-still', 'zeitachse-aktionen', 'zeitachse-eintrag', 'zeitachse-kopf',
    'zeitachse-text', 'zeitachse-titel', 'zeitachse-zeit', 'zeitstrahl-achse', 'zeitstrahl-jahr', 'zeitstrahl-label',
    'zeitstrahl-saeule', 'zeitstrahl-saeulen', 'zustand-fortschritt'
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
    @{ Muster = 'knopf-gefahr(?![\w-])'; Art = 'alte Klasse knopf-gefahr' },
    # Weggefallen mit dem Umbau auf Dashboard-Style 1.6 (STYLEGUIDE.md, Abschnitt 13): wer sie
    # aufruft, wirft erst im Browser, darum hier schon beim Prüfen.
    @{ Muster = '(?<![\w$])Bewegung\s*\.\s*reduziert(?![\w$])'; Art = 'Bewegung.reduziert (es gibt keine reduzierte Bewegung mehr)' },
    @{ Muster = '(?<![\w$])beschaeftigtAbwarten(?![\w$])'; Art = 'UI.beschaeftigtAbwarten (UI.beschaeftigt gibt das Promise zurück)' },
    @{ Muster = '(?<![\w$])UI\s*\.\s*beschaeftigt\(\s*[^,()]+,\s*(true|false)(?![\w$])'; Art = 'alte Form UI.beschaeftigt(knopf, true|false) (neu: UI.beschaeftigt(knopf, arbeit))' },
    @{ Muster = '(?<![\w$])knopfSperre(?![\w$])'; Art = 'UI.knopfSperre (UI.knopfSperren bzw. gesperrt: ''Grund'')' },
    @{ Muster = '(?<![\w$])feldFrei(?![\w$])'; Art = 'UI.feldFrei (weggefallen)' },
    @{ Muster = '(?<![\w$])erstauftritt(?![\w$])'; Art = 'Rahmen.erstauftritt (weggefallen)' },
    @{ Muster = '(?<![\w$])Rahmen\s*\.\s*bereit(?![\w$])'; Art = 'Rahmen.bereit (kein Export mehr)' },
    @{ Muster = '(?<![\w$])UI\s*\.\s*(datenliste|auswahlFuellen|sortierKnopf|meldungenAusrichten)(?![\w$])'; Art = 'UI.* ohne Export (nur noch intern in bausteine.js bzw. rahmen.js)' },
    @{ Muster = '(?<![\w$])Bewegung\s*\.\s*zahlenHochzaehlen(?![\w$])'; Art = 'Bewegung.zahlenHochzaehlen (kein Export mehr; Bewegung.kennzahlenStill)' },
    @{ Muster = '(?<![\w$])setzen\(\s*\{[^{}]*(?<![\w$])beschaeftigt\s*:'; Art = 'speicherleiste().setzen({ beschaeftigt }) (weggefallen; UI.beschaeftigt)' },
    @{ Muster = '(?<![\w$-])umschalten\s*:'; Art = 'Option umschalten: (weggefallen; UI.chip({ art: ''radio'' }))' },
    @{ Muster = '(?<![\w-])data-tipp(?![\w-])|dataset\s*\.\s*tipp(?![\w$])'; Art = 'data-tipp (Tooltips über data-tip und DS.overlay.tooltips)' }
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
Show-Pruefung '7. Keine Altlasten (alte Klassen und Tokens, weggefallene ICT-Namen, design.css/bewegung.*, Google Fonts)' $befunde ('{0} alte Klassennamen geprüft' -f $AlteKlassen.Count)

# ---------------------------------------------------------------------------
# 8. Die Kopie von Dashboard-Style ist unverändert (SHA256SUMS)
# ---------------------------------------------------------------------------

$befunde = New-Object System.Collections.Generic.List[string]
$summen = Join-Path $DsOrdner 'SHA256SUMS'
$version = ''
$erwartet = @{}
if (-not (Test-Path -LiteralPath $summen -PathType Leaf)) {
    $befunde.Add('vendor/dashboard-style/SHA256SUMS fehlt (Kopie mit vendor.ps1 bzw. vendor.sh neu anlegen)')
} else {
    foreach ($zeile in ([IO.File]::ReadAllText($summen, $Utf8) -split "`r?`n")) {
        if (-not $zeile.Trim()) { continue }
        $m = [regex]::Match($zeile, '^([0-9a-f]{64})  (.+)$')
        if (-not $m.Success) { $befunde.Add(('SHA256SUMS: unlesbare Zeile «{0}»' -f $zeile)); continue }
        $erwartet[$m.Groups[2].Value] = $m.Groups[1].Value
    }
    $basis = (Resolve-Path -LiteralPath $DsOrdner).Path
    $vorhanden = @{}
    # -Force: auch versteckte Dateien zählen. Ein symbolischer Link (Reparse-Punkt) gehört nie in
    # die Kopie: seine Prüfsumme wäre die des Ziels ausserhalb (wie vendor.ps1 -Check).
    foreach ($f in (Get-ChildItem -LiteralPath $DsOrdner -Recurse -Force)) {
        $rel = $f.FullName.Substring($basis.Length).TrimStart('\', '/') -replace '\\', '/'
        if ($f.Attributes -band [IO.FileAttributes]::ReparsePoint) { $befunde.Add(('symbolischer Link: vendor/dashboard-style/{0}' -f $rel)); continue }
        if ($f.PSIsContainer) { continue }
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

# grund.css zuerst: «@layer grund, ds;» muss vor der ersten Ebene von ds.css stehen, sonst kommt
# «grund» NACH «ds» und schlägt die Titelrollen von Dashboard-Style. view-transitions.css ist ein
# <link> im <head> (Chrome übersieht eine Stilvorlage, die ein Skript einfügt).
$GrundCss = 'grund.css'
$ViewTransitions = 'vendor/dashboard-style/css/optional/view-transitions.css'
$Reihenfolge = @($GrundCss, 'vendor/dashboard-style/fonts/fonts.css', 'vendor/dashboard-style/ds.css', $ViewTransitions, 'thema.css', 'bausteine.css', 'rahmen.css')
$VerlaufCss = 'verlauf.css'
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
    if ($stile.Count -gt 0 -and $stile[0] -ne $GrundCss) {
        $befunde.Add(('{0}  erste Stilvorlage ist {1}, nicht {2} (sie legt die Ebenen fest)' -f $d.Name, $stile[0], $GrundCss))
    }
    # Die eigenen Blätter der Seite (styles.css, client.css …) kommen nach rahmen.css und, wo die
    # Seite den Verlauf zeigt, nach verlauf.css.
    $iRahmen = [Array]::IndexOf($stile, 'rahmen.css')
    for ($k = 0; $k -lt $iRahmen; $k++) {
        if ($Reihenfolge -contains $stile[$k] -or $stile[$k] -match '^(https?:)?//') { continue }
        $befunde.Add(('{0}  {1} steht vor rahmen.css' -f $d.Name, $stile[$k]))
    }
    $iVerlauf = [Array]::IndexOf($stile, $VerlaufCss)
    for ($k = $iRahmen + 1; $iRahmen -ge 0 -and $k -lt $iVerlauf; $k++) {
        if ($stile[$k] -match '^(https?:)?//') { continue }
        $befunde.Add(('{0}  {1} steht vor {2}' -f $d.Name, $stile[$k], $VerlaufCss))
    }
    $skripte = @()
    foreach ($m in [regex]::Matches($d.Ohne, '<script\b[^>]*\ssrc\s*=\s*"([^"]+)"', 'IgnoreCase')) { $skripte += $m.Groups[1].Value }
    $iDs = [Array]::IndexOf($skripte, 'vendor/dashboard-style/ds.js')
    $iUi = [Array]::IndexOf($skripte, 'bausteine.js')
    if ($iDs -lt 0) { $befunde.Add(('{0}  lädt vendor/dashboard-style/ds.js nicht' -f $d.Name)) }
    elseif ($iUi -ge 0 -and $iDs -gt $iUi) { $befunde.Add(('{0}  ds.js muss vor bausteine.js stehen' -f $d.Name)) }
    # Seitenübergänge: das erste Bild wartet per <link rel="expect"> auf ein Ziel direkt nach
    # rahmen.js (Kopf und Schublade gebaut), nicht auf MSAL vom CDN.
    $erwartungen = @([regex]::Matches($d.Ohne, '<link\b[^>]*\brel\s*=\s*"expect"[^>]*>', 'IgnoreCase'))
    if ($stile -contains $ViewTransitions -and $erwartungen.Count -eq 0) {
        $befunde.Add(('{0}  lädt view-transitions.css ohne <link rel="expect" href="#…" blocking="render">' -f $d.Name))
    }
    foreach ($e in $erwartungen) {
        $nr = Get-ZeileNr $d $e.Index
        if ($e.Value -notmatch '(?i)\sblocking\s*=\s*"render"') { $befunde.Add((Get-Fundstelle $d $nr 'rel="expect" ohne blocking="render"')) }
        $mz = [regex]::Match($e.Value, '(?i)\shref\s*=\s*"#([^"]+)"')
        if (-not $mz.Success) { $befunde.Add((Get-Fundstelle $d $nr 'rel="expect" ohne href="#ziel"')); continue }
        $ziel = [regex]::Match($d.Ohne, '<[A-Za-z][\w-]*\b[^>]*\sid\s*=\s*"' + [regex]::Escape($mz.Groups[1].Value) + '"[^>]*>')
        $rahmenJs = [regex]::Match($d.Ohne, '<script\b[^>]*\ssrc\s*=\s*"rahmen\.js"[^>]*>\s*</script\s*>', 'IgnoreCase')
        if (-not $ziel.Success) {
            $befunde.Add((Get-Fundstelle $d $nr ('Ziel #{0} von rel="expect" fehlt (das erste Bild käme erst nach dem Timeout)' -f $mz.Groups[1].Value)))
        } elseif (-not $rahmenJs.Success -or $ziel.Index -ne ($rahmenJs.Index + $rahmenJs.Length + ([regex]::Match($d.Ohne.Substring($rahmenJs.Index + $rahmenJs.Length), '^\s*')).Length)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $ziel.Index) ('Ziel #{0} von rel="expect" steht nicht direkt nach <script src="rahmen.js">' -f $mz.Groups[1].Value)))
        }
    }
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
# 10. DS-API: was der eigene Code von Dashboard-Style nennt, gibt es in der Kopie
# ---------------------------------------------------------------------------

# Die Exporte stehen nicht hier, sie kommen aus ds.js selbst: «var DS = { version: … };», dann je
# Modul «DS.<modul> = (function () { … return Object.freeze({ name: name, … }); })();». So
# scheitert «Verify» der nächtlichen Aktualisierung, sobald Dashboard-Style etwas entfernt, das
# ICT noch aufruft (wie 1.0 DS.motion.prefersReducedMotion, dessen Aufruf seither wirft).
$befunde = New-Object System.Collections.Generic.List[string]
$dsOben = New-Object 'System.Collections.Generic.HashSet[string]'
$dsExporte = @{}
if (-not $Ds.ContainsKey($DsSkript)) {
    $befunde.Add('vendor/dashboard-style/ds.js fehlt')
} else {
    $dsRoh = $Ds[$DsSkript].Roh
    $kopf = [regex]::Match($dsRoh, '\bvar\s+DS\s*=\s*\{([^{}]*)\}')
    if ($kopf.Success) {
        foreach ($k in [regex]::Matches($kopf.Groups[1].Value, '([A-Za-z_$][\w$]*)\s*:')) { [void]$dsOben.Add($k.Groups[1].Value) }
    }
    $module = @([regex]::Matches($dsRoh, '(?m)^[ \t]*DS\.([A-Za-z_$][\w$]*)\s*=\s*\(function\b'))
    if ($module.Count -eq 0) { $befunde.Add('vendor/dashboard-style/ds.js: kein «DS.<modul> = (function …» gefunden (Aufbau von ds.js geändert: Prüfung 10 nachführen)') }
    for ($i = 0; $i -lt $module.Count; $i++) {
        $modul = $module[$i].Groups[1].Value
        $ende = $dsRoh.Length
        if ($i + 1 -lt $module.Count) { $ende = $module[$i + 1].Index }
        $teil = $dsRoh.Substring($module[$i].Index, $ende - $module[$i].Index)
        $frei = @([regex]::Matches($teil, 'return\s+Object\.freeze\(\{([^{}]*)\}\s*\)'))
        $set = New-Object 'System.Collections.Generic.HashSet[string]'
        if ($frei.Count -gt 0) {
            foreach ($k in [regex]::Matches($frei[$frei.Count - 1].Groups[1].Value, '([A-Za-z_$][\w$]*)\s*:')) { [void]$set.Add($k.Groups[1].Value) }
        }
        if ($set.Count -eq 0) { $befunde.Add(('vendor/dashboard-style/ds.js: Exporte von DS.{0} nicht lesbar (Aufbau geändert: Prüfung 10 nachführen)' -f $modul)) }
        [void]$dsOben.Add($modul)
        $dsExporte[$modul] = $set
    }
}

function Test-DsName {
    <# Gibt es DS.<modul>(.<name>)? Sonst eine Fundstelle. #>
    param($Datei, [int]$Index, [string]$Modul, [string]$Name, [string]$Wie, $Befunde)
    if (-not $dsOben.Contains($Modul)) {
        $Befunde.Add((Get-Fundstelle $Datei (Get-ZeileNr $Datei $Index) ('DS.{0} gibt es in ds.js nicht{1}' -f $Modul, $Wie)))
    } elseif ($Name -and $dsExporte.ContainsKey($Modul) -and -not $dsExporte[$Modul].Contains($Name)) {
        $Befunde.Add((Get-Fundstelle $Datei (Get-ZeileNr $Datei $Index) ('DS.{0}.{1} ist kein Export von ds.js{2}' -f $Modul, $Name, $Wie)))
    }
}

$apiZahl = 0
if ($dsOben.Count -gt 0) {
    foreach ($d in $Js) {
        # Direkt: DS.motion.busy, window.DS.overlay … (ohne Leerraum um die Punkte: «DS.icons. Ein»
        # in einem Text ist kein Aufruf).
        foreach ($m in [regex]::Matches($d.Ohne, '(?<![\w$.])(?:window\.|globalThis\.)?DS\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?')) {
            $apiZahl++
            Test-DsName $d $m.Index $m.Groups[1].Value $m.Groups[2].Value '' $befunde
        }
        # Kürzel: «const M = DS.motion;» → M.enter …
        foreach ($m in [regex]::Matches($d.Ohne, '(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:window\.|globalThis\.)?DS\.([A-Za-z_$][\w$]*)\s*[;,\r\n]')) {
            $kurz = $m.Groups[1].Value
            $modul = $m.Groups[2].Value
            foreach ($a in [regex]::Matches($d.Ohne, '(?<![\w$.])' + [regex]::Escape($kurz) + '\.([A-Za-z_$][\w$]*)')) {
                $apiZahl++
                Test-DsName $d $a.Index $modul $a.Groups[1].Value (' (über ' + $kurz + ')') $befunde
            }
        }
        # Zerlegt: «const { enter, leave: weg } = DS.motion;»
        foreach ($m in [regex]::Matches($d.Ohne, '(?<![\w$.])(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*(?:window\.|globalThis\.)?DS\.([A-Za-z_$][\w$]*)')) {
            foreach ($teilName in ($m.Groups[1].Value -split ',')) {
                $n = (($teilName -split '[:=]')[0]).Trim()
                if (-not $n -or $n.StartsWith('...')) { continue }
                $apiZahl++
                Test-DsName $d $m.Index $m.Groups[2].Value $n ' (zerlegt)' $befunde
            }
        }
    }
    # Sinnbilder: UI.SINNBILDER bildet deutsche Namen auf Glyphen in DS.icons ab; eine Glyphe, die
    # Dashboard-Style entfernt, zeigte sonst nur zur Laufzeit ein leeres Sinnbild.
    $bausteine = @($Js | Where-Object { $_.Name -eq 'bausteine.js' })
    if ($bausteine.Count -eq 1 -and $dsExporte.ContainsKey('icons')) {
        $sb = [regex]::Match($bausteine[0].Ohne, '\bconst\s+SINNBILDER\s*=\s*\{([^{}]*)\}')
        if (-not $sb.Success) {
            $befunde.Add('bausteine.js: «const SINNBILDER = { … }» nicht gefunden (Prüfung 10 nachführen)')
        } else {
            foreach ($m in [regex]::Matches($sb.Groups[1].Value, ':\s*["'']([^"'']+)["'']')) {
                $apiZahl++
                if (-not $dsExporte['icons'].Contains($m.Groups[1].Value)) {
                    $befunde.Add((Get-Fundstelle $bausteine[0] (Get-ZeileNr $bausteine[0] ($sb.Groups[1].Index + $m.Index)) ('Glyphe «{0}» in UI.SINNBILDER gibt es in DS.icons nicht' -f $m.Groups[1].Value)))
                }
            }
        }
    }
}

# Klassen ds-*, Tokens und Hooks --ds-*, Attribute data-ds-*: was der eigene Code nennt, kennt
# die Kopie (ds.css bzw. ds.js, ohne Kommentare). Sonst setzt ICT eine Klasse oder einen Hook,
# den Dashboard-Style nicht mehr liest, und nichts fällt auf.
# dataset.dsKey → data-ds-key
$script:Bindestrich = [System.Text.RegularExpressions.MatchEvaluator] {
    param($m)
    '-' + $m.Value.ToLowerInvariant()
}
$dsKlassen = New-Object 'System.Collections.Generic.HashSet[string]'
$dsWoerter = New-Object 'System.Collections.Generic.HashSet[string]'
$dsEigen = New-Object 'System.Collections.Generic.HashSet[string]'
$dsAttribute = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($n in @($DsBuendel, $DsSkript)) {
    if (-not $Ds.ContainsKey($n)) { continue }
    $t = $Ds[$n].Ohne
    if ($n -eq $DsBuendel) { foreach ($m in [regex]::Matches($t, '\.(ds-[\w-]+)')) { [void]$dsKlassen.Add($m.Groups[1].Value) } }
    else { foreach ($m in [regex]::Matches($t, '(?<![\w-])(ds-[a-z][\w-]*)')) { [void]$dsWoerter.Add($m.Groups[1].Value) } }
    foreach ($m in [regex]::Matches($t, '(?<![\w-])(--ds-[\w-]*\w)')) { [void]$dsEigen.Add($m.Groups[1].Value) }
    foreach ($m in [regex]::Matches($t, '(?<![\w-])(data-ds-[\w-]*\w)')) { [void]$dsAttribute.Add($m.Groups[1].Value) }
    foreach ($m in [regex]::Matches($t, '\.dataset\.(ds[A-Z][\w$]*)')) {
        [void]$dsAttribute.Add('data-' + ([regex]::Replace($m.Groups[1].Value, '[A-Z]', $script:Bindestrich)))
    }
}

function Add-KlassenPruefung {
    <# Jede ds-*-Klasse muss es in ds.css geben (in JS-Texten auch als Keyframe oder Wort aus ds.js). #>
    param($Datei, [int]$Index, [string]$Klasse, [bool]$AusJs, $Befunde)
    if ($Klasse.EndsWith('-') -or $Klasse.EndsWith('_')) { return }   # «"ds-status--" + ton»
    if ($dsKlassen.Contains($Klasse)) { return }
    if ($AusJs -and ($keyframes.Contains($Klasse) -or $dsWoerter.Contains($Klasse))) { return }
    $Befunde.Add((Get-Fundstelle $Datei (Get-ZeileNr $Datei $Index) ('Klasse {0} gibt es in Dashboard-Style nicht' -f $Klasse)))
}

$klassenZahl = 0
if ($Ds.ContainsKey($DsBuendel)) {
    foreach ($d in $Css) {
        foreach ($m in [regex]::Matches($d.Ohne, '(?<sel>[^{};]+)\{')) {
            if ($m.Groups['sel'].Value.Trim().StartsWith('@')) { continue }
            foreach ($k in [regex]::Matches($m.Groups['sel'].Value, '\.(ds-[\w-]+)')) {
                $klassenZahl++
                Add-KlassenPruefung $d ($m.Index + $k.Index) $k.Groups[1].Value $false $befunde
            }
        }
    }
    foreach ($d in $Html) {
        foreach ($m in [regex]::Matches($d.Ohne, '(?i)\sclass\s*=\s*"([^"]*)"')) {
            foreach ($k in ($m.Groups[1].Value -split '\s+')) {
                if ($k -notmatch '^ds-') { continue }
                $klassenZahl++
                Add-KlassenPruefung $d $m.Index $k $false $befunde
            }
        }
    }
    foreach ($d in $Js) {
        foreach ($s in [regex]::Matches($d.Ohne, '"(?:\\.|[^"\\\r\n])*"|''(?:\\.|[^''\\\r\n])*''|`(?:\\.|[^`\\])*`')) {
            foreach ($k in [regex]::Matches($s.Value, '(?<![\w-])(ds-[a-z][\w-]*)')) {
                $klassenZahl++
                Add-KlassenPruefung $d ($s.Index + $k.Index) $k.Groups[1].Value $true $befunde
            }
        }
    }
}
foreach ($d in $Dateien) {
    foreach ($m in [regex]::Matches($d.Ohne, '(?<![\w-])(--ds-[\w-]*\w)')) {
        if (-not $dsEigen.Contains($m.Groups[1].Value)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) ('{0} kennt Dashboard-Style nicht (weder Token noch Hook)' -f $m.Groups[1].Value)))
        }
    }
    foreach ($m in [regex]::Matches($d.Ohne, '(?<![\w-])(data-ds-[\w-]*\w)|\.dataset\.(ds[A-Z][\w$]*)')) {
        $attr = $m.Groups[1].Value
        if ($m.Groups[2].Success) { $attr = 'data-' + ([regex]::Replace($m.Groups[2].Value, '[A-Z]', $script:Bindestrich)) }
        if (-not $dsAttribute.Contains($attr)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) ('Attribut {0} kennt Dashboard-Style nicht' -f $attr)))
        }
    }
}
$exportZahl = 0
foreach ($s in $dsExporte.Values) { $exportZahl += $s.Count }
Show-Pruefung '10. DS-API: jeder DS-Aufruf, jede ds-Klasse, jedes --ds-*/data-ds-* gibt es in der Kopie' $befunde ('{0} Aufrufe gegen {1} Exporte in {2} Modulen, {3} Klassen-Nennungen' -f $apiZahl, $exportZahl, $dsExporte.Count, $klassenZahl)

# ---------------------------------------------------------------------------
# 11. Keine Namen, die Dashboard-Style als veraltet führt
# ---------------------------------------------------------------------------

# Die Liste kommt aus der Kopie selbst: vendor/dashboard-style/deprecations.json (seit 2.0) führt
# jeden veralteten und jeden entfernten Namen mit einem Suchmuster. ICT verwendet beide nicht:
# entfernte Namen wirken nicht mehr, veraltete fallen mit der nächsten Hauptversion weg. Eine neue
# Fassung der Kopie bringt neue Einträge mit; hier ist nichts nachzutragen. Von Hand stehen nur
# die Verbote, die die Datei nicht führt (Dinge, die vor 1.0 entfernt wurden oder die ICT
# zusätzlich ausschliesst).
$Veraltet = [ordered]@{}
function Add-Veraltet {
    param([string]$Name, [string]$Muster, [string]$Grund, [string]$Nur)
    if ($Veraltet.Contains($Name)) { return }
    $Veraltet[$Name] = [pscustomobject]@{ Muster = $Muster; Grund = $Grund; Nur = $Nur }
}
function Get-NamensMuster {
    <# Ganzes Wort: CSS-Namen mit Bindestrich, JS-Namen mit $. #>
    param([string]$Name)
    if ($Name -match '^[A-Za-z_$][\w$]*$') { return '(?<![\w$-])' + [regex]::Escape($Name) + '(?![\w$-])' }
    return '(?<![\w-])' + [regex]::Escape($Name) + '(?![\w-])'
}
$befunde = New-Object System.Collections.Generic.List[string]
$ausDatei = 0
$depPfad = Join-Path $DsOrdner 'deprecations.json'
if (-not (Test-Path -LiteralPath $depPfad -PathType Leaf)) {
    $befunde.Add('vendor/dashboard-style/deprecations.json fehlt (Kopie älter als 2.0 oder unvollständig)')
} else {
    $dep = [IO.File]::ReadAllText($depPfad, [Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($e in @($dep.names)) {
        if (-not $e.pattern) { continue }
        $ersatz = if ($e.replacement) { ', Ersatz: ' + $e.replacement } else { '' }
        $grund = if ($e.removed) { 'entfernt in {0}{1}' -f $e.removed, $ersatz } else { 'veraltet seit {0}{1}' -f $e.deprecated, $ersatz }
        Add-Veraltet $e.name $e.pattern $grund
        $ausDatei++
    }
}
Add-Veraltet 'prefersReducedMotion' (Get-NamensMuster 'prefersReducedMotion') 'entfernt in 1.0: es gibt keine reduzierte Bewegung, ein Aufruf wirft'
Add-Veraltet 'prefers-reduced-motion' (Get-NamensMuster 'prefers-reduced-motion') 'entfernt in 1.0: Bewegung ist auf jedem Gerät gleich, keine eigene Weiche'
Add-Veraltet 'ds-motion-full' (Get-NamensMuster 'ds-motion-full') 'entfernt in 1.0 (tut nichts mehr)'
Add-Veraltet 'ds-toast--shown' (Get-NamensMuster 'ds-toast--shown') 'setzt DS.overlay.toast selbst, nie von Hand (1.3)'
Add-Veraltet '--ds-toast-shift' '(?<![\w-])--ds-toast-shift(-y)?(?![\w-])' 'schreibt nur DS.overlay (2.0): die Meldungen folgen Blatt und Speicherleiste selbst'
Add-Veraltet '--ds-spinner-track im Thema' '(?<![\w-])--ds-spinner-track\s*:' 'der Bogen-Spinner hat seit 1.4 keine Spur; im Thema übermalte es die Spur des bestimmten Rings' $ThemaCss

foreach ($d in $Dateien) {
    foreach ($name in $Veraltet.Keys) {
        $v = $Veraltet[$name]
        if ($v.Nur -and $d.Name -ne $v.Nur) { continue }
        foreach ($m in [regex]::Matches($d.Ohne, $v.Muster)) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) ('veraltet in Dashboard-Style: {0} ({1})' -f $name, $v.Grund)))
        }
    }
}
# Die Meldungsregion trägt kein role und kein aria-live mehr (1.3): DS.overlay.toast legt eigene
# Ansagen an, sonst käme jede Meldung doppelt. Im JS: dieselbe Anweisung oder die zwei Zeilen danach.
foreach ($d in $Js) {
    foreach ($m in [regex]::Matches($d.Ohne, '(?<![\w-])ds-toasts(?![\w-])')) {
        $rest = $d.Ohne.Substring($m.Index)
        $fenster = [regex]::Match($rest, '^[^\n]*(\n[^\n]*){0,2}').Value
        if ($fenster -match 'setAttribute\(\s*["''](role|aria-live)["'']|["'']aria-live["'']|(?<![\w$-])role\s*:|\.role\s*=') {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) 'veraltet in Dashboard-Style: .ds-toasts mit role bzw. aria-live (DS.overlay.toast sagt selbst an)'))
        }
    }
    foreach ($m in [regex]::Matches($d.Ohne, '(?<![\w-])ds-combo(?![\w-])')) {
        $rest = $d.Ohne.Substring($m.Index)
        $fenster = [regex]::Match($rest, '^[^\n]*(\n[^\n]*){0,2}').Value
        if ($fenster -match '["'']data-open["'']|\.dataset\.open(?![\w$])') {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) 'veraltet in Dashboard-Style: data-open auf .ds-combo (aria-expanded am Feld)'))
        }
    }
}
Show-Pruefung '11. Keine veralteten Namen von Dashboard-Style' $befunde ('{0} Namen, {1} davon aus deprecations.json der Kopie' -f $Veraltet.Count, $ausDatei)

# ---------------------------------------------------------------------------
# 12. Seitengerüst wie die Referenz-App von Dashboard-Style
# ---------------------------------------------------------------------------

# components.md «App frame»: Klasse → Element, in dieser Reihenfolge.
$Geruest = [ordered]@{
    'ds-app' = 'div'; 'ds-skip' = 'a'; 'ds-topbar' = 'div'; 'ds-scrim' = 'div'; 'ds-drawer' = 'nav'
    'ds-panel' = 'div'; 'ds-view' = 'main'; 'ds-content' = 'div'; 'ds-page' = 'div'
}
function Get-KlassenTags {
    <# Alle Start-Tags, deren class-Attribut die Klasse als ganzes Wort trägt. #>
    param([string]$Text, [string]$Klasse)
    return @([regex]::Matches($Text, '<([A-Za-z][\w-]*)\b[^<>]*\sclass\s*=\s*"(?:[^"]*\s)?' + [regex]::Escape($Klasse) + '(?:\s[^"]*)?"[^<>]*>'))
}
$befunde = New-Object System.Collections.Generic.List[string]
foreach ($d in $Html) {
    foreach ($m in [regex]::Matches($d.Ohne, '(?i)<style\b')) {
        $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $m.Index) '<style> (die Inhaltsrichtlinie erlaubt nur Stilvorlagen; eine .css-Datei nehmen)'))
    }
    $bodyTag = [regex]::Match($d.Ohne, '(?i)<body\b[^>]*>')
    if (-not $bodyTag.Success) { $befunde.Add(('{0}  kein <body>' -f $d.Name)); continue }
    $bk = [regex]::Match($bodyTag.Value, '(?i)\sclass\s*=\s*"([^"]*)"')
    if ($bk.Success -and $bk.Groups[1].Value -match '(^|\s)ds-') {
        $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $bodyTag.Index) '<body> mit ds-*-Klassen (das Gerüst beginnt mit div.ds-app)'))
    }
    $pos = -1
    $appEnde = -1
    foreach ($klasse in $Geruest.Keys) {
        $tags = @(Get-KlassenTags $d.Ohne $klasse)
        if ($tags.Count -eq 0) { $befunde.Add(('{0}  Gerüst ohne .{1}' -f $d.Name, $klasse)); continue }
        if ($tags.Count -gt 1) { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $tags[1].Index) ('.{0} mehr als einmal' -f $klasse))) }
        $t = $tags[0]
        if ($t.Groups[1].Value.ToLowerInvariant() -ne $Geruest[$klasse]) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $t.Index) ('.{0} auf <{1}> statt <{2}>' -f $klasse, $t.Groups[1].Value, $Geruest[$klasse])))
        }
        if ($t.Index -lt $pos) {
            $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $t.Index) ('.{0} steht zu früh (Reihenfolge: {1})' -f $klasse, (($Geruest.Keys | ForEach-Object { '.' + $_ }) -join ', '))))
        }
        $pos = $t.Index
        if ($klasse -eq 'ds-app') {
            if ($t.Value -notmatch '\sdata-seite\s*=') { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $t.Index) '.ds-app ohne data-seite')) }
            if ($d.Ohne.Substring(0, $t.Index) -notmatch '(?i)<body\b[^>]*>\s*$') { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $t.Index) '.ds-app ist nicht das erste Element in <body>')) }
            # Ende von .ds-app: die <div>-Tiefe ab ihrem Start-Tag.
            $tiefe = 0
            foreach ($x in [regex]::Matches($d.Ohne.Substring($t.Index), '(?i)<div\b[^>]*>|</div\s*>')) {
                if ($x.Value.StartsWith('</')) { $tiefe-- } else { $tiefe++ }
                if ($tiefe -eq 0) { $appEnde = $t.Index + $x.Index; break }
            }
            if ($appEnde -lt 0) { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $t.Index) '.ds-app wird nicht geschlossen')) }
        }
    }
    $region = @(Get-KlassenTags $d.Ohne 'ds-toasts')
    if ($region.Count -ne 1) {
        $befunde.Add(('{0}  {1}× .ds-toasts (erwartet: eine Meldungsregion nach .ds-app)' -f $d.Name, $region.Count))
    } else {
        $r = $region[0]
        if ($r.Groups[1].Value.ToLowerInvariant() -ne 'div') { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $r.Index) ('.ds-toasts auf <{0}> statt <div>' -f $r.Groups[1].Value))) }
        if ($appEnde -ge 0 -and $r.Index -lt $appEnde) { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $r.Index) '.ds-toasts steht in .ds-app statt danach')) }
        if ($r.Value -match '(?i)\s(role|aria-live)\s*=') { $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $r.Index) '.ds-toasts mit role bzw. aria-live (veraltet seit Dashboard-Style 1.3; DS.overlay.toast sagt selbst an)')) }
    }
}
Show-Pruefung '12. Seitengerüst: kein <style>, body ohne ds-*, .ds-app, .ds-toasts danach' $befunde ('{0} Seiten' -f $Html.Count)

# ---------------------------------------------------------------------------
# 13. Seiten-CSS mit Präfix enthält nur Layout
# ---------------------------------------------------------------------------

# Blatt → Präfix seiner Klassen (AGENTS.md, «Eigenes CSS»). Eine neue Stilvorlage gehört hierher
# (oder mit Grund zu den Ausnahmen), sonst meldet die Prüfung sie.
$SeitenCss = [ordered]@{
    'benutzer.css' = 'b'; 'client.css' = 'g'; 'kamera.css' = 'km'; 'kamerarolle.css' = 'kr'
    'software.css' = 'sw'; 'telefon.css' = 'tf'; 'verlauf.css' = 'vl'
}
# Keine Seitenblätter: das Fundament (Ebenen, Thema, Bausteine, Rahmen) …
$Fundament = @($GrundCss, $ThemaCss, 'bausteine.css', 'rahmen.css')
# … und die zwei Ausnahmen mit Grund.
$OhneLayoutRegel = @{
    'styles.css'     = 'Hauptseite: ohne Präfix, trägt den Zeitstrahl (.zeitstrahl-*)'
    'styleguide.css' = 'Styleguide: zeigt Farbfelder, Masse und eine Bühne, die es nur dort gibt'
}
# Aussehen statt Layout. border-collapse und border-spacing sind Tabellenlayout.
$NichtLayout = '^(color|background(-[\w-]+)?|font(-[\w-]+)?|letter-spacing|line-height|text-transform|text-decoration(-[\w-]+)?|text-shadow|box-shadow|border(-(?!collapse$|spacing$)[\w-]+)?|outline(-[\w-]+)?|opacity|fill|stroke(-[\w-]+)?|accent-color|caret-color|filter|backdrop-filter|transition(-[\w-]+)?|animation(-[\w-]+)?|--ds-[\w-]+)$'
$befunde = New-Object System.Collections.Generic.List[string]
$geprueft = @()
foreach ($d in $Css) {
    if ($Fundament -contains $d.Name -or $OhneLayoutRegel.ContainsKey($d.Name)) { continue }
    if (-not $SeitenCss.Contains($d.Name)) {
        $befunde.Add(('{0}  neue Stilvorlage: in Pruefe-Frontend.ps1, Prüfung 13, mit Präfix eintragen' -f $d.Name))
        continue
    }
    $geprueft += ('{0} {1}-' -f $d.Name, $SeitenCss[$d.Name])
    $praefix = '\.' + [regex]::Escape($SeitenCss[$d.Name]) + '(-[\w-]*)?(?![\w-])'
    foreach ($m in [regex]::Matches($d.Ohne, '(?<sel>[^{};]+)\{(?<inhalt>[^{}]*)\}')) {
        $sel = $m.Groups['sel'].Value
        if ($sel.Trim().StartsWith('@')) { continue }
        $nr = Get-ZeileNr $d ($m.Index + ($sel.Length - $sel.TrimStart().Length))
        foreach ($teilSel in ($sel -split ',(?![^()]*\))')) {
            if ($teilSel.Trim() -and $teilSel -notmatch $praefix) {
                $befunde.Add((Get-Fundstelle $d $nr ('Regel ohne Klasse .{0}-…: {1}' -f $SeitenCss[$d.Name], $teilSel.Trim())))
            }
        }
        $inhalt = $m.Groups['inhalt']
        foreach ($e in [regex]::Matches($inhalt.Value, '(?<![\w-])(-{0,2}[A-Za-z][\w-]*)\s*:')) {
            if ($e.Groups[1].Value.ToLowerInvariant() -match $NichtLayout) {
                $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d ($inhalt.Index + $e.Index)) ('kein Layout: ' + $e.Groups[1].Value)))
            }
        }
    }
}
Show-Pruefung '13. Seiten-CSS mit Präfix enthält nur Layout' $befunde ($geprueft -join ', ')

# ---------------------------------------------------------------------------
# 14. Text: Halbgeviertstrich statt Geviertstrich
# ---------------------------------------------------------------------------

$Geviert = [string][char]0x2014
$befunde = New-Object System.Collections.Generic.List[string]
$textDateien = @($Dateien)
if (Test-Path -LiteralPath $headers -PathType Leaf) { $textDateien += Read-Datei -Pfad $headers -Name '_headers' }
foreach ($d in $textDateien) {
    $i = $d.Roh.IndexOf($Geviert)
    while ($i -ge 0) {
        $befunde.Add((Get-Fundstelle $d (Get-ZeileNr $d $i) ('Geviertstrich ' + $Geviert + ' (Halbgeviertstrich – nehmen)')))
        $i = $d.Roh.IndexOf($Geviert, $i + 1)
    }
}
Show-Pruefung '14. Text ohne Geviertstrich' $befunde ('{0} Dateien' -f $textDateien.Count)

# ---------------------------------------------------------------------------

Write-Host ''
if ($script:Fehlerhaft) {
    Write-Host ('Ergebnis: {0} von {1} Prüfungen mit Fundstellen' -f $script:Fehlerhaft, $script:Anzahl) -ForegroundColor Red
    exit 1
}
Write-Host ('Ergebnis: alle {0} Prüfungen OK' -f $script:Anzahl) -ForegroundColor Green
exit 0
