#Requires -Version 7.4
param([Parameter(Mandatory)][int]$TargetProcessId, [Parameter(Mandatory)][string]$ExpectedTitle)
$ErrorActionPreference = 'Stop'
$process = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
$ready = $null -ne $process -and $process.MainWindowHandle -ne 0 -and $process.MainWindowTitle -ceq $ExpectedTitle
[pscustomobject]@{ pid = $TargetProcessId; ready = $ready } | ConvertTo-Json -Compress
