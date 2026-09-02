# serve.ps1 - kleiner Testserver fuer die lokale Vorschau (PowerShell 5.1)
#
# Startet einen HTTP-Listener auf Port 8123 und liefert den Ordner
# ..\frontend aus. Nur zum Anschauen waehrend der Entwicklung; produktiv
# uebernimmt Netlify die Auslieferung.
#
#   .\serve.ps1        dann http://localhost:8123/?mock=1 im Browser oeffnen
#
# Beenden mit Strg+C oder indem der PowerShell-Prozess beendet wird.

$root = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'frontend'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8123/')
$listener.Start()
Write-Host "Serving $root on http://localhost:8123/"
while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
    $file = Join-Path $root $path
    if (Test-Path $file -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $mime = @{'.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json'; '.png'='image/png'; '.svg'='image/svg+xml'; '.webp'='image/webp'}[$ext]
        if (-not $mime) { $mime = 'application/octet-stream' }
        $ctx.Response.ContentType = $mime
        # Kein Zwischenspeichern: sonst zeigt der Browser beim Entwickeln
        # hartnaeckig die vorige Fassung einer .js- oder .css-Datei an.
        $ctx.Response.Headers.Add('Cache-Control', 'no-store, must-revalidate')
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
}
