$lines = Get-Content 'D:\Financas\app.js'
$total = $lines.Length
Write-Host "Total lines before: $total"
$out = $lines[0..2747] + $lines[2995..($total - 1)]
[System.IO.File]::WriteAllLines('D:\Financas\app.js', $out, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done. New total lines: $($out.Length)"
