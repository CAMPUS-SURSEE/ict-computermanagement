<#
.SYNOPSIS
  Erzeugt frontend\spalten.js aus schema-computer.json, schema-benutzer.json und schema-telefon.json.

.DESCRIPTION
  Die drei Schemadateien sind die Quelle der Wahrheit für die Spalten der Listen «Computer»,
  «Benutzer» und «Telefonnummern». Dieses Skript schreibt daraus die JavaScript-Datei
  frontend\spalten.js mit den Konstanten SPALTEN_COMPUTER, SPALTEN_BENUTZER und SPALTEN_TELEFON.

  Programmspalten stehen bewusst NICHT in spalten.js: sie kommen aus programme.json und werden
  vom Frontend zur Laufzeit ergänzt (siehe frontend\modell.js).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Build-Spalten.ps1
#>
[CmdletBinding()]
param(
    [string]$ComputerSchema,
    [string]$BenutzerSchema,
    [string]$TelefonSchema,
    [string]$Ziel
)
$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
. (Join-Path $ScriptDir 'Inventar-Gemeinsam.ps1')

if (-not $ComputerSchema) { $ComputerSchema = Join-Path $ScriptDir 'schema-computer.json' }
if (-not $BenutzerSchema) { $BenutzerSchema = Join-Path $ScriptDir 'schema-benutzer.json' }
if (-not $TelefonSchema) { $TelefonSchema = Join-Path $ScriptDir 'schema-telefon.json' }
if (-not $Ziel) { $Ziel = Join-Path $ScriptDir '..\frontend\spalten.js' }

function JsText([string]$s) {
    <# Text für ein JavaScript-Literal in doppelten Anführungszeichen absichern. #>
    if ($null -eq $s) { return '' }
    return ($s -replace '\\', '\\' -replace '"', '\"' -replace "`r", '' -replace "`n", ' ')
}

function Build-Block {
    <# Baut die Zeilen eines Spalten-Arrays. #>
    param($Spalten, [string]$Name)
    $zeilen = @()
    foreach ($s in $Spalten) {
        $zeilen += ('  {{ i: "{0}", d: "{1}", t: "{2}", g: "{3}", q: "{4}" }}' -f `
            (JsText $s.internal), (JsText $s.display), (JsText $s.type), (JsText $s.group), (JsText $s.source))
    }
    return "const $Name = [`n" + ($zeilen -join ",`n") + "`n];`n"
}

$computer = @(Read-JsonDatei $ComputerSchema)
$benutzer = @(Read-JsonDatei $BenutzerSchema)
$telefon = @(Read-JsonDatei $TelefonSchema)

foreach ($s in ($computer + $benutzer + $telefon)) {
    if ($s.source -notin @('manuell', 'sccm', 'ad')) {
        throw "Unerlaubte Quelle '$($s.source)' bei Spalte '$($s.internal)' (erlaubt: manuell, sccm, ad)"
    }
}

$kopf = @'
/* spalten.js — Spaltendefinition der SharePoint-Listen «Computer», «Benutzer» und
   «Telefonnummern». Erzeugt aus code/schema-computer.json, code/schema-benutzer.json und
   code/schema-telefon.json durch code/Build-Spalten.ps1 — nicht von Hand bearbeiten.

   i = interner Name in Graph, d = Anzeigename, t = Typ
   (Title|Text|Note|Boolean|Number|DateTime), g = Gruppe,
   q = Quelle: manuell = im Frontend bearbeitbar,
               sccm    = wird vom Sync aus SCCM überschrieben (schreibgeschützt),
               ad      = wird vom Sync aus dem Active Directory überschrieben (schreibgeschützt).

   Die Titelspalte heisst in Graph «Title»; sie wird in der Computer-Liste als «PC-Name»,
   in der Benutzer-Liste als «Login» und in der Telefonliste als «Kurzwahl» angezeigt.

   Die Programmspalten der Benutzer-Liste stehen NICHT hier, sondern in programme.json
   (Ablage in SharePoint: Inventar/programme.json); modell.js ergänzt sie zur Laufzeit.
*/

'@

$inhalt = $kopf + (Build-Block $computer 'SPALTEN_COMPUTER') + "`n" + (Build-Block $benutzer 'SPALTEN_BENUTZER') + "`n" + (Build-Block $telefon 'SPALTEN_TELEFON')
$zielVoll = [IO.Path]::GetFullPath($Ziel)
$ordner = Split-Path -Parent $zielVoll
if (-not (Test-Path $ordner)) { throw "Zielordner fehlt: $ordner" }
[IO.File]::WriteAllText($zielVoll, $inhalt, (New-Object Text.UTF8Encoding($false)))

Write-Host ("Geschrieben: {0}" -f $zielVoll)
Write-Host ("  SPALTEN_COMPUTER: {0} Spalten" -f $computer.Count)
Write-Host ("  SPALTEN_BENUTZER: {0} Spalten" -f $benutzer.Count)
Write-Host ("  SPALTEN_TELEFON: {0} Spalten" -f $telefon.Count)
