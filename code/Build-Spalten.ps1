<#
.SYNOPSIS
  Erzeugt frontend\spalten.js aus schema-client.json, schema-benutzer.json, schema-telefon.json
  und schema-software.json.

.DESCRIPTION
  Die vier Schemadateien sind die Quelle der Wahrheit für die Spalten der Listen «ADMIN-Clients»,
  «EDU-Clients», «Benutzer», «Telefonnummern» und «Software». Dieses Skript schreibt daraus die
  JavaScript-Datei frontend\spalten.js mit den Konstanten SPALTEN_CLIENT, SPALTEN_BENUTZER,
  SPALTEN_TELEFON und SPALTEN_SOFTWARE.

  «ADMIN-Clients» und «EDU-Clients» haben dieselben Spalten und teilen sich deshalb
  schema-client.json und SPALTEN_CLIENT.

  Programmspalten stehen bewusst NICHT in spalten.js: sie kommen aus der SharePoint-Liste
  «Software» und werden vom Frontend zur Laufzeit ergänzt (siehe frontend\modell.js).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Build-Spalten.ps1
#>
[CmdletBinding()]
param(
    [string]$ClientSchema,
    [string]$BenutzerSchema,
    [string]$TelefonSchema,
    [string]$SoftwareSchema,
    [string]$Ziel
)
$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$ServerDir = Join-Path $ScriptDir 'server'
. (Join-Path $ServerDir 'Inventar-Gemeinsam.ps1')

if (-not $ClientSchema) { $ClientSchema = Join-Path $ScriptDir 'schema-client.json' }
if (-not $BenutzerSchema) { $BenutzerSchema = Join-Path $ScriptDir 'schema-benutzer.json' }
if (-not $TelefonSchema) { $TelefonSchema = Join-Path $ScriptDir 'schema-telefon.json' }
if (-not $SoftwareSchema) { $SoftwareSchema = Join-Path $ScriptDir 'schema-software.json' }
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

$client = @(Read-JsonDatei $ClientSchema)
$benutzer = @(Read-JsonDatei $BenutzerSchema)
$telefon = @(Read-JsonDatei $TelefonSchema)
$software = @(Read-JsonDatei $SoftwareSchema)

foreach ($s in ($client + $benutzer + $telefon + $software)) {
    if ($s.source -notin @('manuell', 'sccm', 'ad')) {
        throw "Unerlaubte Quelle '$($s.source)' bei Spalte '$($s.internal)' (erlaubt: manuell, sccm, ad)"
    }
}

$kopf = @'
/* spalten.js — Spaltendefinition der SharePoint-Listen «ADMIN-Clients», «EDU-Clients»,
   «Benutzer», «Telefonnummern» und «Software». Erzeugt aus code/schema-client.json,
   code/schema-benutzer.json, code/schema-telefon.json und code/schema-software.json
   durch code/Build-Spalten.ps1 — nicht von Hand bearbeiten.

   i = interner Name in Graph, d = Anzeigename, t = Typ
   (Title|Text|Note|Boolean|Number|DateTime), g = Gruppe,
   q = Quelle: manuell = im Frontend bearbeitbar,
               sccm    = wird vom Sync aus SCCM überschrieben (schreibgeschützt),
               ad      = wird vom Sync aus dem Active Directory überschrieben (schreibgeschützt).

   Die beiden Client-Listen «ADMIN-Clients» und «EDU-Clients» haben dieselben Spalten und
   teilen sich SPALTEN_CLIENT.

   Die Titelspalte heisst in Graph «Title»; sie wird in den Client-Listen als «PC-Name»,
   in der Benutzer-Liste als «Login», in der Telefonliste als «Kurzwahl» und in der
   Software-Liste als «Programm-ID» angezeigt.

   Die Programmspalten der Benutzer-Liste stehen NICHT hier, sondern in der Liste «Software»;
   modell.js ergänzt sie zur Laufzeit.
*/

'@

$inhalt = $kopf + (Build-Block $client 'SPALTEN_CLIENT') + "`n" + (Build-Block $benutzer 'SPALTEN_BENUTZER') `
    + "`n" + (Build-Block $telefon 'SPALTEN_TELEFON') + "`n" + (Build-Block $software 'SPALTEN_SOFTWARE')
$zielVoll = [IO.Path]::GetFullPath($Ziel)
$ordner = Split-Path -Parent $zielVoll
if (-not (Test-Path $ordner)) { throw "Zielordner fehlt: $ordner" }
[IO.File]::WriteAllText($zielVoll, $inhalt, (New-Object Text.UTF8Encoding($false)))

Write-Host ("Geschrieben: {0}" -f $zielVoll)
Write-Host ("  SPALTEN_CLIENT:   {0} Spalten" -f $client.Count)
Write-Host ("  SPALTEN_BENUTZER: {0} Spalten" -f $benutzer.Count)
Write-Host ("  SPALTEN_TELEFON:  {0} Spalten" -f $telefon.Count)
Write-Host ("  SPALTEN_SOFTWARE: {0} Spalten" -f $software.Count)
