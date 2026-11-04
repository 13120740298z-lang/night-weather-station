param(
    # Optional: source dir with page_*.jpg + manifest.json. Omit to validate the existing pages_v4 in place.
    [string]$Source = ""
)

# Sync / validate the v4 page set. The reader reads pages_v4; the old pages/ dir is kept untouched.
$dst = Join-Path $PSScriptRoot "pages_v4"

if ($Source) {
    if (-not (Test-Path $Source)) { throw "source dir not found: $Source" }
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    Get-ChildItem $dst -Filter "page_*.jpg" -ErrorAction SilentlyContinue | Remove-Item -Force
    Copy-Item (Join-Path $Source "page_*.jpg") $dst
    Copy-Item (Join-Path $Source "manifest.json") $dst
}

$manifestPath = Join-Path $dst "manifest.json"
if (-not (Test-Path $manifestPath)) { throw "missing manifest.json: $manifestPath" }

$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$entries = @($manifest.pages)
$files = @(Get-ChildItem $dst -Filter "page_*.jpg" | Sort-Object Name)

if ($entries.Count -ne 166) { throw "manifest pages: expected 166, got $($entries.Count)" }
if ($files.Count -ne 166) { throw "jpg files: expected 166, got $($files.Count)" }
if ($manifest.page_count -ne 166) { throw "page_count is $($manifest.page_count), expected 166" }

$names = @($entries | ForEach-Object { $_.file })
$dupes = @($names | Group-Object | Where-Object { $_.Count -gt 1 })
if ($dupes.Count -gt 0) { throw "duplicate files in manifest: $($dupes.Name -join ', ')" }

for ($i = 0; $i -lt $entries.Count; $i++) {
    $e = $entries[$i]
    if ($e.page -ne ($i + 1)) { throw "non-sequential page at index $($i + 1): P.$($e.page)" }
    if (-not (Test-Path (Join-Path $dst $e.file))) { throw "missing image: P.$($e.page) -> $($e.file)" }
}
$extra = @(Compare-Object -ReferenceObject $names -DifferenceObject ($files | ForEach-Object { $_.Name }) |
    Where-Object { $_.SideIndicator -eq '=>' })
if ($extra.Count -gt 0) { throw "files not in manifest: $($extra.InputObject -join ', ')" }

Add-Type -AssemblyName System.Drawing
foreach ($f in @($files[0], $files[-1], $files[82], $files[149])) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    if ($img.Width -ne 1600 -or $img.Height -ne 2263) {
        throw "$($f.Name): expected 1600x2263, got $($img.Width)x$($img.Height)"
    }
    $img.Dispose()
}

$totalMb = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "OK: 166 pages, manifest 1:1, 1600x2263, $totalMb MiB"
