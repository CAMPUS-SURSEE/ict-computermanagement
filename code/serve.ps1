# serve.ps1 - kleiner Testserver fuer die lokale Vorschau (Windows PowerShell 5.1 und
# PowerShell 7, auch unter Linux und macOS: pwsh -NoProfile -File code/serve.ps1)
#
# Startet einen HTTP-Listener auf Port 8123 und liefert den Ordner
# ..\frontend aus. Nur zum Anschauen waehrend der Entwicklung; produktiv
# uebernimmt Cloudflare Pages die Auslieferung.
#
#   .\serve.ps1              dann http://localhost:8123/?mock=1 im Browser oeffnen
#   .\serve.ps1 -Port 8765   falls 8123 auf dem Rechner belegt oder reserviert ist
#
# Wie Cloudflare Pages schickt er die Header aus frontend\_headers mit (Block
# «/*»: Inhaltsrichtlinie und Sicherheitsheader). Ein Verstoss gegen die
# Inhaltsrichtlinie (Inline-Skript, <style>, fremde Adresse) zeigt sich so
# schon lokal in der Konsole und nicht erst nach dem Veroeffentlichen. Und wie
# dort liefert /client die Seite client.html aus.
#
# Beenden mit Strg+C oder indem der PowerShell-Prozess beendet wird.

param([int]$Port = 8123)

$root = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'frontend'
$root = [IO.Path]::GetFullPath($root)

# Header aus _headers: eine Zeile mit dem Pfadmuster, darunter eingerueckt «Name: Wert».
# Nur das Muster «/*» (gilt fuer alles); # beginnt einen Kommentar.
$kopfzeilen = [ordered]@{}
$headersDatei = Join-Path $root '_headers'
if (Test-Path -LiteralPath $headersDatei -PathType Leaf) {
    $muster = ''
    foreach ($zeile in [IO.File]::ReadAllLines($headersDatei)) {
        if ($zeile -match '^\s*#' -or -not $zeile.Trim()) { continue }
        if ($zeile -match '^\S') { $muster = $zeile.Trim(); continue }
        if ($muster -eq '/*' -and $zeile -match '^\s+([A-Za-z0-9-]+):\s*(.*)$') { $kopfzeilen[$Matches[1]] = $Matches[2].Trim() }
    }
}

$mimeTypen = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.webp' = 'image/webp'
    '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
    '.map' = 'application/json'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/ ($($kopfzeilen.Count) Header aus _headers)"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrEmpty($path) -or $path.EndsWith('/')) { $path = $path + 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $path))
    # Schoene Adressen wie bei Cloudflare Pages: /client → client.html.
    if (-not (Test-Path -LiteralPath $file -PathType Leaf) -and -not [IO.Path]::GetExtension($file)) { $file = $file + '.html' }
    # Nie ausserhalb von frontend (../ in der Adresse).
    $drin = $file.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
    foreach ($name in $kopfzeilen.Keys) { $ctx.Response.Headers.Add($name, $kopfzeilen[$name]) }
    # Kein Zwischenspeichern: sonst zeigt der Browser beim Entwickeln
    # hartnaeckig die vorige Fassung einer .js- oder .css-Datei an.
    $ctx.Response.Headers.Add('Cache-Control', 'no-store, must-revalidate')
    if ($drin -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $mime = $mimeTypen[[IO.Path]::GetExtension($file).ToLower()]
        if (-not $mime) { $mime = 'application/octet-stream' }
        $ctx.Response.ContentType = $mime
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
