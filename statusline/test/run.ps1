# Tests for usage-line.ps1. Run: pwsh -NoProfile -File statusline/test/run.ps1
# (or powershell -NoProfile -ExecutionPolicy Bypass -File statusline\test\run.ps1 on Windows)
# The cases in cases.json are shared with run.sh, so both scripts draw the same lines.
# Plain ASCII on purpose, like usage-line.ps1.

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path (Split-Path -Parent $here) 'usage-line.ps1'
$utf8 = New-Object System.Text.UTF8Encoding $false
try { [Console]::OutputEncoding = $utf8 } catch {}
$cases = [IO.File]::ReadAllText((Join-Path $here 'cases.json'), $utf8) | ConvertFrom-Json
$exe = (Get-Process -Id $PID).Path
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('baton-usage-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$script:pass = 0
$script:fail = 0
$ESC = [char]27

function Ok([string]$name) { $script:pass++; [Console]::Out.Write("ok    $name`n") }
function Bad([string]$name, [string]$detail) {
  $script:fail++
  [Console]::Out.Write("FAIL  $name`n")
  if ($detail) { foreach ($l in $detail -split "`n") { [Console]::Out.Write("      $l`n") } }
}

# Run usage-line.ps1 with stdin and environment, and return its one line.
function Invoke-Line([string]$stdin, [hashtable]$envs, [string[]]$extra) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $a = '-NoProfile -ExecutionPolicy Bypass -File "' + $script + '"'
  if ($extra) { $a += ' ' + ($extra -join ' ') }
  $psi.Arguments = $a
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = $utf8
  foreach ($k in @('COLUMNS', 'BATON_USAGE_COLUMNS', 'NO_COLOR', 'BATON_USAGE_NOW', 'BATON_USAGE_TZ', 'BATON_USAGE_CACHE', 'BATON_USAGE_NO_FETCH', 'BATON_CLAUDE', 'FAKE_DIR', 'FAKE_MODE')) {
    if ($psi.EnvironmentVariables.ContainsKey($k)) { $psi.EnvironmentVariables.Remove($k) }
  }
  foreach ($k in $envs.Keys) { if ($null -ne $envs[$k]) { $psi.EnvironmentVariables[$k] = [string]$envs[$k] } }
  $p = [Diagnostics.Process]::Start($psi)
  $errTask = $p.StandardError.ReadToEndAsync()
  $bytes = $utf8.GetBytes($stdin)
  $p.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
  $p.StandardInput.Close()
  $out = $p.StandardOutput.ReadToEnd()
  $p.WaitForExit()
  $err = $errTask.Result
  if ($err) { [Console]::Error.Write($err) }
  return $out.TrimEnd("`r", "`n")
}

function To-Text($v) {
  if ($null -eq $v) { return '' }
  if ($v -is [string]) { return $v }
  return (ConvertTo-Json $v -Compress -Depth 10)
}

function Draw($c, $cols, [bool]$color) {
  $cachePath = Join-Path $tmp 'cache.json'
  if (Test-Path -LiteralPath $cachePath) { Remove-Item -LiteralPath $cachePath -Force }
  $cacheText = To-Text $c.cache
  if ($cacheText) { [IO.File]::WriteAllText($cachePath, $cacheText, $utf8) }
  # The Windows zone id where this system knows it (Windows, and most ids elsewhere); else the
  # IANA id, which is what PowerShell reports off Windows anyway.
  $zone = $c.tz
  if ($c.tzwin) { try { [TimeZoneInfo]::FindSystemTimeZoneById($c.tzwin) | Out-Null; $zone = $c.tzwin } catch {} }
  $envs = @{ BATON_USAGE_NOW = $c.now; BATON_USAGE_TZ = $zone; BATON_USAGE_CACHE = $cachePath; BATON_USAGE_NO_FETCH = '1' }
  if ($null -ne $cols) { $envs['COLUMNS'] = $cols }
  if (-not $color) { $envs['NO_COLOR'] = '1' }
  return Invoke-Line (To-Text $c.input) $envs @()
}

$v = Invoke-Line '' @{} @('-Version')
if ($v -eq '8.0.1') { Ok 'version is 8.0.1' } else { Bad 'version is 8.0.1' $v }

# ------------------------------------------------------------------ the shared cases
foreach ($c in $cases.cases) {
  $want = $c.expect
  if ($c.PSObject.Properties['expect_ps1']) { $want = $c.expect_ps1 }
  $got = Draw $c $c.cols $c.color
  if ($got -ceq $want) { Ok $c.name } else { Bad $c.name ("want: $want`ngot:  $got") }
}

# Off Windows, PowerShell names zones by IANA id; the short names must still come out.
if ($env:OS -ne 'Windows_NT') {
  foreach ($pair in @(@('America/New_York', 'EST'), @('Europe/Berlin', 'CET'), @('Asia/Tokyo', 'JST'))) {
    $c = $cases.cases[0]
    $c2 = [pscustomobject]@{ input = $c.input; cache = $c.cache; now = $c.now; tz = $pair[0]; tzwin = $null }
    $got = Draw $c2 200 $false
    if ($got -match (' ' + $pair[1] + ' ')) { Ok ("IANA zone " + $pair[0] + " shows " + $pair[1]) } else { Bad ("IANA zone " + $pair[0]) $got }
  }
}

# ------------------------------------------------------------------ never past the edge
$w = $cases.width_checks
$n = 0
$widthFail = $false
foreach ($cols in $w.widths) {
  foreach ($r in $w.readings) {
    foreach ($color in @($true, $false)) {
      $c = [pscustomobject]@{ input = $r.input; cache = $r.cache; now = $w.now; tz = $w.tz; tzwin = $w.tzwin }
      $got = Draw $c $cols $color
      $plain = $got -replace "$ESC\[[0-9;]*m", ''
      $n++
      if ($plain.Length -gt ($cols - 4) -or -not $plain.StartsWith('5h ') -or $plain -notmatch (' ' + [char]0x00B7 + ' ctx ')) {
        $widthFail = $true
        Bad ("$($r.name) at $cols columns, color $color") ("$($plain.Length) columns: $got")
      }
    }
  }
}
if (-not $widthFail) { Ok "widths 40, 45, 80, 120, 200: $n lines, all within the COLUMNS - 4 Claude Code shows, 5h and ctx in each" }

# ------------------------------------------------------------------ the Fable fetch
# The fake claude is a shell script, so these run where sh is (Linux, macOS, Git Bash).
$fake = Join-Path $here 'fake-claude.sh'
$haveSh = $null -ne (Get-Command sh -ErrorAction SilentlyContinue)
if ($env:OS -ne 'Windows_NT' -and $haveSh) {
  function Fetch([string]$mode, [string]$claude) {
    $dir = Join-Path $tmp 'fetch'
    if (Test-Path -LiteralPath $dir) { Remove-Item -LiteralPath $dir -Recurse -Force }
    New-Item -ItemType Directory -Path $dir | Out-Null
    $out = Join-Path $dir 'fable.json'
    Invoke-Line '' @{ FAKE_DIR = $dir; FAKE_MODE = $mode; BATON_CLAUDE = $claude } @('-FetchFable', '-CachePath', ('"' + $out + '"')) | Out-Null
    $saved = [IO.File]::ReadAllText($out, $utf8) | ConvertFrom-Json
    $saved.PSObject.Properties.Remove('at')
    return (ConvertTo-Json $saved -Compress -Depth 5)
  }
  function Check([string]$name, [string]$got, [string]$want) { if ($got -ceq $want) { Ok $name } else { Bad $name ("want: $want`ngot:  $got") } }

  Check 'fetch: saves the Fable window from the real answer' (Fetch 'answer' $fake) '{"ok":true,"plan":true,"fable":{"pct":0,"resetsAt":1794830400}}'
  $req = [IO.File]::ReadAllText((Join-Path $tmp 'fetch/request'), $utf8).Trim()
  Check 'fetch: sends one get_usage request, skipping the transcript scan' $req '{"type":"control_request","request_id":"baton-usage","request":{"subtype":"get_usage","skip_behaviors":true}}'
  $argsSeen = ([IO.File]::ReadAllText((Join-Path $tmp 'fetch/args'), $utf8) -split "`n") -join ' '
  if ($argsSeen -match '-p .*--safe-mode .*--no-session-persistence') { Ok 'fetch: runs claude -p with --safe-mode and --no-session-persistence' } else { Bad 'fetch: flags' $argsSeen }
  Check 'fetch: no plan limits' (Fetch 'noplan' $fake) '{"ok":true,"plan":false,"fable":null}'
  Check 'fetch: a refused request is saved as a failure' (Fetch 'refuse' $fake) '{"ok":false,"error":"nope"}'
  Check 'fetch: claude ending without an answer' (Fetch 'exit' $fake) '{"ok":false,"error":"claude exited without an answer"}'
  $t0 = [DateTime]::UtcNow
  $missing = Fetch 'answer' (Join-Path $tmp 'no-such-claude')
  if ($missing -match '^\{"ok":false,"error":') { Ok 'fetch: claude missing is saved as a failure' } else { Bad 'fetch: claude missing' $missing }
  if (([DateTime]::UtcNow - $t0).TotalSeconds -lt 10) { Ok 'fetch: a missing claude fails at once, not after the timeout' } else { Bad 'fetch: a missing claude was slow' '' }

  # The line starts a fetch in the background when nothing is saved, then stops asking.
  $bg = Join-Path $tmp 'bg'
  New-Item -ItemType Directory -Path $bg | Out-Null
  $bgCache = Join-Path $bg 'fable.json'
  $bgEnv = @{ FAKE_DIR = $bg; BATON_CLAUDE = $fake; BATON_USAGE_CACHE = $bgCache; NO_COLOR = '1'; COLUMNS = '200' }
  $first = Invoke-Line '{}' $bgEnv @()
  if ($first -match 'fable n/a \(checking\)') { Ok 'background: the first draw says checking' } else { Bad 'background: first draw' $first }
  for ($k = 0; $k -lt 30 -and -not ((Test-Path -LiteralPath $bgCache) -and -not (Test-Path -LiteralPath ($bgCache + '.lock'))); $k++) { Start-Sleep -Milliseconds 500 }
  $second = Invoke-Line '{}' $bgEnv @()
  $fable0 = 'fable ' + [char]0x2595 + ([string][char]0x2591 * 5) + [char]0x258F + ' 0%'
  if ($second.Contains($fable0)) { Ok 'background: the next draw shows Fable' } else { Bad 'background: next draw' $second }
  if (-not (Test-Path -LiteralPath ($bgCache + '.lock'))) { Ok 'background: the lock is gone when the fetch ends' } else { Bad 'background: lock left behind' '' }
  Remove-Item -LiteralPath (Join-Path $bg 'args') -Force -ErrorAction SilentlyContinue
  Invoke-Line '{}' $bgEnv @() | Out-Null
  Start-Sleep -Seconds 2
  if (-not (Test-Path -LiteralPath (Join-Path $bg 'args'))) { Ok 'background: a fresh answer starts no new fetch' } else { Bad 'background: fetched again with a fresh answer' '' }
} else {
  [Console]::Out.Write("skip  fetch tests (they need sh for the fake claude)`n")
}

Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
[Console]::Out.Write("`n$($script:pass) passed, $($script:fail) failed`n")
if ($script:fail -ne 0) { exit 1 }
exit 0
