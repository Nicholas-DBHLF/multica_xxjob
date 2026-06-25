param(
  [string]$EnvFile = ".env.local"
)

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if (-not $_ -or $_.StartsWith('#')) {
      return
    }

    $name, $value = $_ -split '=', 2
    Set-Item -Path "Env:$name" -Value $value
  }
}

node "$PSScriptRoot\..\src\index.js"
