param(
    [string]$Source = "C:\Users\18201\Documents\Trae-CN\temp_20261102_03\night_weather\reader_pages"
)

# 一条命令重建页图目录：只做同步与校验，不重新渲染 PDF
$dst = Join-Path $PSScriptRoot "pages"
$src = $Source

if (-not (Test-Path $src)) { throw "找不到页图目录: $src" }

New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem $dst -Filter "page_*.jpg" -ErrorAction SilentlyContinue | Remove-Item -Force
Copy-Item (Join-Path $src "page_*.jpg") $dst

$files = Get-ChildItem $dst -Filter "page_*.jpg" | Sort-Object Name
$totalMb = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)

if ($files.Count -ne 166) { throw "页数不对：期望 166，实际 $($files.Count)" }
if ($files[0].Name -ne "page_001.jpg" -or $files[-1].Name -ne "page_166.jpg") { throw "首末页文件名不对" }

Add-Type -AssemblyName System.Drawing
foreach ($f in @($files[0], $files[-1])) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    if ($img.Width -ne 1600) { throw "$($f.Name) 宽度不是 1600（$($img.Width)）" }
    $img.Dispose()
}

Write-Host "OK: $($files.Count) 页，$totalMb MiB，page_001.jpg … page_166.jpg，宽 1600px"
