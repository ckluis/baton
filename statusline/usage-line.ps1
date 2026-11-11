# baton 8.0.1: one usage line for Claude Code's status line (Windows).
#
#   5h [bar] 7% resets 14:30 EST . fable [bar] 0% . wk [bar] 52% resets Mon 07:00 EST . ctx [bar] 5%
#
# Needs only PowerShell, which every Windows has (Windows PowerShell 5.1 or PowerShell 7).
# macOS, Linux and WSL use usage-line.sh instead.
#
# Where each number comes from (Claude Code 2.1.322):
#   5h    stdin rate_limits.five_hour   { used_percentage 0-100, resets_at epoch seconds }
#   wk    stdin rate_limits.seven_day   { used_percentage 0-100, resets_at epoch seconds }
#   ctx   stdin context_window.used_percentage (0-100, null before the first reply)
#   fable not on stdin. Claude Code's SDK usage request (get_usage, which its SDK names
#         usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET) returns the per-model weekly
#         window. This script asks for it in the background (-FetchFable) at most every
#         5 minutes and saves the answer; the line reads the saved answer. No tokens are spent.
# A number that is not known shows "n/a (reason)", never a guess.
# Times are in the system's own time zone, read at every draw. Windows names zones in words
# ("Eastern Standard Time"), so the short names come from the table below; a zone not in it
# shows its offset ("GMT+5:45"), the same as usage-line.sh does where tzdata has no name.
#
# This file is plain ASCII on purpose: Windows PowerShell 5.1 misreads other characters in a
# file without a byte-order mark, so the bar characters are made from their code points.
#
# Settings for tests and odd setups: BATON_USAGE_CACHE (the saved answer's path),
# BATON_USAGE_COLUMNS (width), BATON_USAGE_NOW (epoch seconds), BATON_USAGE_TZ (a zone id),
# BATON_USAGE_NO_FETCH=1, BATON_CLAUDE (the claude command), NO_COLOR.

param([switch]$FetchFable, [switch]$Version, [string]$CachePath = '')

$ErrorActionPreference = 'Stop'
Set-StrictMode -Off

$BATON_VERSION = '8.0.1'
$FETCH_EVERY = 300    # ask for Fable again after 5 minutes
$STALE_AFTER = 1800   # a Fable answer older than 30 minutes shows n/a (stale)
$LOCK_SECONDS = 120   # a fetch lock older than this is from a fetch that died
$FETCH_TIMEOUT = 60   # seconds a fetch may take

$utf8 = New-Object System.Text.UTF8Encoding $false
try { [Console]::OutputEncoding = $utf8; [Console]::InputEncoding = $utf8 } catch {}

$ESC = [char]27
$BAR_L = [string][char]0x2595  # right one eighth block, the bar's left edge
$BAR_R = [string][char]0x258F  # left one eighth block, the bar's right edge
$FULL = [string][char]0x2588
$EMPTY = [string][char]0x2591
$DOT = [string][char]0x00B7
$ELLIPSIS = [string][char]0x2026

function Get-CachePath {
  if ($env:BATON_USAGE_CACHE) { return $env:BATON_USAGE_CACHE }
  $base = $env:LOCALAPPDATA
  if (-not $base) { $base = Join-Path $HOME '.cache' }
  return (Join-Path (Join-Path $base 'baton-usage') 'fable.json')
}

function Test-Num($v) { return ($v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal]) }

function Get-Prop($obj, [string]$name) {
  if ($null -eq $obj -or $obj -isnot [psobject]) { return $null }
  $p = $obj.PSObject.Properties[$name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

function Get-Now {
  if ($env:BATON_USAGE_NOW -match '^\d+$') { return [long]$env:BATON_USAGE_NOW }
  return [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
}

# ------------------------------------------------------------------ time

# Short names by Windows zone id: standard, daylight. Matches what tzdata (and so `date` on
# macOS and Linux) prints for the same zones.
$ZONES = @{
  'Eastern Standard Time' = @('EST', 'EDT'); 'US Eastern Standard Time' = @('EST', 'EDT')
  'Central Standard Time' = @('CST', 'CDT'); 'Mountain Standard Time' = @('MST', 'MDT')
  'US Mountain Standard Time' = @('MST', 'MST'); 'Pacific Standard Time' = @('PST', 'PDT')
  'Alaskan Standard Time' = @('AKST', 'AKDT'); 'Hawaiian Standard Time' = @('HST', 'HST')
  'Atlantic Standard Time' = @('AST', 'ADT'); 'Newfoundland Standard Time' = @('NST', 'NDT')
  'GMT Standard Time' = @('GMT', 'BST'); 'Greenwich Standard Time' = @('GMT', 'GMT')
  'W. Europe Standard Time' = @('CET', 'CEST'); 'Central Europe Standard Time' = @('CET', 'CEST')
  'Romance Standard Time' = @('CET', 'CEST'); 'Central European Standard Time' = @('CET', 'CEST')
  'E. Europe Standard Time' = @('EET', 'EEST'); 'GTB Standard Time' = @('EET', 'EEST')
  'FLE Standard Time' = @('EET', 'EEST'); 'Israel Standard Time' = @('IST', 'IDT')
  'India Standard Time' = @('IST', 'IST'); 'China Standard Time' = @('CST', 'CST')
  'Tokyo Standard Time' = @('JST', 'JST'); 'Korea Standard Time' = @('KST', 'KST')
  'AUS Eastern Standard Time' = @('AEST', 'AEDT'); 'E. Australia Standard Time' = @('AEST', 'AEST')
  'Cen. Australia Standard Time' = @('ACST', 'ACDT'); 'AUS Central Standard Time' = @('ACST', 'ACST')
  'W. Australia Standard Time' = @('AWST', 'AWST'); 'New Zealand Standard Time' = @('NZST', 'NZDT')
  'UTC' = @('UTC', 'UTC'); 'Coordinated Universal Time' = @('UTC', 'UTC')
}

# The system's zone, read now (BATON_USAGE_TZ names another one, for tests).
function Get-Zone {
  if ($env:BATON_USAGE_TZ) { return [TimeZoneInfo]::FindSystemTimeZoneById($env:BATON_USAGE_TZ) }
  return [TimeZoneInfo]::Local
}

# The zone's Windows id. PowerShell 7 off Windows reports IANA ids; .NET 6 and later convert.
function Get-WindowsZoneId($tz) {
  $id = $tz.Id
  if ($ZONES.ContainsKey($id)) { return $id }
  if ($id -eq 'Etc/UTC' -or $id -eq 'UTC' -or $id -eq 'Etc/Universal') { return 'UTC' }
  $win = $null
  try { if ([TimeZoneInfo]::TryConvertIanaIdToWindowsId($id, [ref]$win)) { return $win } } catch {}
  return $id
}

function Format-ZoneName($tz, [DateTimeOffset]$local) {
  $names = $ZONES[(Get-WindowsZoneId $tz)]
  if ($names) {
    if ($tz.IsDaylightSavingTime($local)) { return $names[1] }
    return $names[0]
  }
  $off = $local.Offset
  $sign = '+'
  if ($off.Ticks -lt 0) { $sign = '-'; $off = $off.Negate() }
  $s = 'GMT' + $sign + [string]$off.Hours
  if ($off.Minutes -ne 0) { $s += ':' + $off.Minutes.ToString('00') }
  return $s
}

# "14:30 EST" (withDay: "Mon 07:00 EST").
function Format-Time([long]$epoch, [bool]$withDay) {
  $tz = Get-Zone
  $local = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::FromUnixTimeSeconds($epoch), $tz)
  $inv = [Globalization.CultureInfo]::InvariantCulture
  $fmt = 'HH:mm'
  if ($withDay) { $fmt = 'ddd HH:mm' }
  return $local.ToString($fmt, $inv) + ' ' + (Format-ZoneName $tz $local)
}

# ------------------------------------------------------------------ fields

function Round-Pct($v) {
  $x = [double]$v
  if ($x -lt 0) { return 0 }
  return [long][Math]::Floor($x + 0.5)
}

function New-Part([string]$key, $pct, [string]$reason, $reset) {
  if (Test-Num $pct) { return @{ key = $key; pct = (Round-Pct $pct); reason = $null; reset = $reset } }
  return @{ key = $key; pct = $null; reason = $reason; reset = $null }
}

function Get-WindowPart([string]$key, $rl, $w, [long]$now, [bool]$withDay) {
  if ($null -eq $rl -or $rl -isnot [psobject]) { return New-Part $key $null 'no data yet' $null }
  if ($null -eq $w -or $w -isnot [psobject]) { return New-Part $key $null 'not reported' $null }
  $used = Get-Prop $w 'used_percentage'
  if (-not (Test-Num $used)) { return New-Part $key $null 'bad data' $null }
  $reset = $null
  $at = Get-Prop $w 'resets_at'
  if ((Test-Num $at) -and [long][Math]::Floor([double]$at) -gt $now) { $reset = Format-Time ([long][Math]::Floor([double]$at)) $withDay }
  return New-Part $key $used $null $reset
}

function Get-FablePart($c, [long]$now) {
  if ($null -eq $c -or $c -isnot [psobject]) { return New-Part 'fable' $null 'checking' $null }
  if ((Get-Prop $c 'ok') -ne $true) { return New-Part 'fable' $null 'no data' $null }
  if ((Get-Prop $c 'plan') -eq $false) { return New-Part 'fable' $null 'no plan limits' $null }
  $f = Get-Prop $c 'fable'
  if ($null -eq $f -or $f -isnot [psobject]) { return New-Part 'fable' $null 'no Fable limit' $null }
  $at = Get-Prop $c 'at'
  if (-not (Test-Num $at) -or ($now - [double]$at) -gt $STALE_AFTER) { return New-Part 'fable' $null 'stale' $null }
  $ra = Get-Prop $f 'resetsAt'
  if ((Test-Num $ra) -and [double]$ra -le $now) { return New-Part 'fable' $null 'stale' $null }
  return New-Part 'fable' (Get-Prop $f 'pct') 'no data' $null
}

# ------------------------------------------------------------------ drawing

function Get-Bar([long]$pct) {
  $p = [Math]::Min(100, $pct)
  $fill = [long][Math]::Floor($p / 100 * 5 + 0.5)
  return $BAR_L + ($FULL * [int]$fill) + ($EMPTY * [int](5 - $fill)) + $BAR_R
}

# green, yellow from 60%, red from 85%.
function Get-Tone([long]$pct) {
  if ($pct -ge 85) { return '31' }
  if ($pct -ge 60) { return '33' }
  return '32'
}

function Paint([string]$code, [string]$s, [bool]$color) {
  if ($color) { return "$ESC[$($code)m$s$ESC[0m" }
  return $s
}

# How far the line is cut down to fit, least important first. Each step keeps what the step
# before it dropped. 5h and ctx are never dropped.
#   0 everything; 1 no bars; 2 no reset times; 3 no Fable; 4 no weekly; 5 n/a without its
#   reason; then the line is cut at the edge with an ellipsis (only a 5h + ctx line wider than
#   the screen gets there)
$STEPS = @(
  @{ bars = $true; resets = $true; drop = @(); reasons = $true },
  @{ bars = $false; resets = $true; drop = @(); reasons = $true },
  @{ bars = $false; resets = $false; drop = @(); reasons = $true },
  @{ bars = $false; resets = $false; drop = @('fable'); reasons = $true },
  @{ bars = $false; resets = $false; drop = @('fable', 'wk'); reasons = $true },
  @{ bars = $false; resets = $false; drop = @('fable', 'wk'); reasons = $false }
)

function Format-Part($p, $step, [bool]$color) {
  if ($null -eq $p.pct) {
    $na = 'n/a'
    if ($step.reasons) { $na = 'n/a (' + $p.reason + ')' }
    return $p.key + ' ' + (Paint '2' $na $color)
  }
  $gauge = ''
  if ($step.bars) { $gauge = (Get-Bar $p.pct) + ' ' }
  $gauge += [string]$p.pct + '%'
  $s = $p.key + ' ' + (Paint (Get-Tone $p.pct) $gauge $color)
  if ($step.resets -and $p.reset) { $s += ' resets ' + $p.reset }
  return $s
}

function Format-Line($parts, $step, [bool]$color) {
  $out = @()
  foreach ($p in $parts) { if ($step.drop -notcontains $p.key) { $out += (Format-Part $p $step $color) } }
  return ($out -join (' ' + $DOT + ' '))
}

function Get-Visible([string]$s) { return ($s -replace "$ESC\[[0-9;]*m", '').Length }

function Get-Fit($parts, [int]$width, [bool]$color) {
  foreach ($step in $STEPS) {
    $line = Format-Line $parts $step $color
    if ((Get-Visible $line) -le $width) { return $line }
  }
  $s = Format-Line $parts $STEPS[$STEPS.Count - 1] $false
  if ($s.Length -le $width) { return $s }
  return $s.Substring(0, [Math]::Max(0, $width - 1)) + $ELLIPSIS
}

# ------------------------------------------------------------------ the saved Fable answer

function Read-Json([string]$text) {
  if (-not $text) { return $null }
  try { return ($text | ConvertFrom-Json) } catch { return $null }
}

function ConvertTo-Epoch($iso) {
  if (-not $iso) { return $null }
  # PowerShell 7's ConvertFrom-Json turns ISO strings into DateTime values by itself.
  if ($iso -is [DateTime]) {
    $d = $iso
    if ($d.Kind -eq [DateTimeKind]::Unspecified) { $d = [DateTime]::SpecifyKind($d, [DateTimeKind]::Utc) }
    return ([DateTimeOffset]$d.ToUniversalTime()).ToUnixTimeSeconds()
  }
  try {
    $d = [DateTimeOffset]::Parse([string]$iso, [Globalization.CultureInfo]::InvariantCulture)
    return $d.ToUnixTimeSeconds()
  } catch { return $null }
}

# What Claude Code's get_usage answer says about Fable: limits[] rows first (percent 0-100),
# model_scoped[] second. Same rules as usage-line.sh.
function ConvertFrom-Answer($msg, [long]$at) {
  $r = Get-Prop $msg 'response'
  if ($null -eq $r) { return [ordered]@{ at = $at; ok = $false; error = 'empty answer' } }
  if ((Get-Prop $r 'subtype') -ne 'success') {
    $e = Get-Prop $r 'error'
    if (-not $e) { $e = 'usage request refused' }
    return [ordered]@{ at = $at; ok = $false; error = [string]$e }
  }
  $u = Get-Prop $r 'response'
  if ($null -eq $u -or $u -isnot [psobject]) { return [ordered]@{ at = $at; ok = $false; error = 'empty answer' } }
  if ((Get-Prop $u 'rate_limits_available') -eq $false) { return [ordered]@{ at = $at; ok = $true; plan = $false; fable = $null } }
  $rl = Get-Prop $u 'rate_limits'
  if ($null -eq $rl -or $rl -isnot [psobject]) { return [ordered]@{ at = $at; ok = $false; error = 'no rate_limits' } }
  foreach ($row in @(Get-Prop $rl 'limits')) {
    if ($null -eq $row) { continue }
    $name = Get-Prop (Get-Prop (Get-Prop $row 'scope') 'model') 'display_name'
    $pct = Get-Prop $row 'percent'
    if ((Get-Prop $row 'kind') -eq 'weekly_scoped' -and [string]$name -match 'fable' -and (Test-Num $pct)) {
      return [ordered]@{ at = $at; ok = $true; plan = $true; fable = [ordered]@{ pct = $pct; resetsAt = (ConvertTo-Epoch (Get-Prop $row 'resets_at')) } }
    }
  }
  foreach ($m in @(Get-Prop $rl 'model_scoped')) {
    if ($null -eq $m) { continue }
    $u2 = Get-Prop $m 'utilization'
    if ([string](Get-Prop $m 'display_name') -match 'fable' -and (Test-Num $u2)) {
      return [ordered]@{ at = $at; ok = $true; plan = $true; fable = [ordered]@{ pct = $u2; resetsAt = (ConvertTo-Epoch (Get-Prop $m 'resets_at')) } }
    }
  }
  return [ordered]@{ at = $at; ok = $true; plan = $true; fable = $null }
}

function Save-Json([string]$path, $value) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $tmp = $path + '.tmp.' + $PID
  [IO.File]::WriteAllText($tmp, (ConvertTo-Json $value -Compress -Depth 5), $utf8)
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

# Ask a headless Claude Code for its usage answer once and save what it says about Fable.
# --safe-mode loads no plugins, hooks or MCP servers but keeps the login;
# --no-session-persistence leaves no saved chat behind. No model is called.
function Invoke-FetchFable([string]$path) {
  $claude = $env:BATON_CLAUDE
  if (-not $claude) { $claude = 'claude' }
  $result = $null
  $proc = $null
  try {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $claude
    $psi.Arguments = '-p --input-format stream-json --output-format stream-json --verbose --safe-mode --no-session-persistence'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = $utf8
    $proc = [Diagnostics.Process]::Start($psi)
    $proc.StandardError.ReadToEndAsync() | Out-Null
    # A claude that already exited makes this write fail; the read below then reports it.
    try {
      $proc.StandardInput.WriteLine('{"type":"control_request","request_id":"baton-usage","request":{"subtype":"get_usage","skip_behaviors":true}}')
      $proc.StandardInput.Flush()
    } catch {}
    $deadline = [DateTime]::UtcNow.AddSeconds($FETCH_TIMEOUT)
    while ($null -eq $result) {
      $left = ($deadline - [DateTime]::UtcNow).TotalMilliseconds
      if ($left -le 0) { $result = [ordered]@{ at = (Get-Now); ok = $false; error = 'timed out' }; break }
      $task = $proc.StandardOutput.ReadLineAsync()
      if (-not $task.Wait([int]$left)) { $result = [ordered]@{ at = (Get-Now); ok = $false; error = 'timed out' }; break }
      $line = $task.Result
      if ($null -eq $line) { $result = [ordered]@{ at = (Get-Now); ok = $false; error = 'claude exited without an answer' }; break }
      $msg = Read-Json $line
      if ($null -eq $msg -or (Get-Prop $msg 'type') -ne 'control_response') { continue }
      if ((Get-Prop (Get-Prop $msg 'response') 'request_id') -ne 'baton-usage') { continue }
      $result = ConvertFrom-Answer $msg (Get-Now)
    }
  } catch {
    $result = [ordered]@{ at = (Get-Now); ok = $false; error = [string]$_.Exception.Message }
  } finally {
    if ($proc) {
      try { $proc.StandardInput.Close() } catch {}
      try { if (-not $proc.WaitForExit(3000)) { $proc.Kill() } } catch {}
    }
  }
  try { Save-Json $path $result } catch {}
}

# Start a background fetch when the saved answer is old and no fetch is running.
function Start-Refresh([string]$path, [long]$now, $cache) {
  if ($env:BATON_USAGE_NO_FETCH -eq '1') { return }
  $at = Get-Prop $cache 'at'
  if ((Test-Num $at) -and ($now - [double]$at) -lt $FETCH_EVERY) { return }
  $lock = $path + '.lock'
  try {
    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if (Test-Path -LiteralPath $lock) {
      $age = ([DateTime]::UtcNow - (Get-Item -LiteralPath $lock).LastWriteTimeUtc).TotalSeconds
      if ($age -lt $LOCK_SECONDS) { return }
      Remove-Item -LiteralPath $lock -Force -Recurse
    }
    New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null
  } catch { return }
  $exe = (Get-Process -Id $PID).Path
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-FetchFable', '-CachePath', ('"' + $path + '"'))
  if ($env:OS -eq 'Windows_NT') {
    Start-Process -FilePath $exe -ArgumentList $argList -WindowStyle Hidden | Out-Null
  } else {
    Start-Process -FilePath $exe -ArgumentList $argList | Out-Null
  }
}

# ------------------------------------------------------------------ main

if ($Version) { [Console]::Out.Write($BATON_VERSION + "`n"); exit 0 }

if ($FetchFable) {
  $path = $CachePath
  if (-not $path) { $path = Get-CachePath }
  Invoke-FetchFable $path
  try { Remove-Item -LiteralPath ($path + '.lock') -Force -Recurse } catch {}
  exit 0
}

try {
  $inputText = [Console]::In.ReadToEnd()
  $path = Get-CachePath
  $now = Get-Now
  $cacheText = $null
  try { if (Test-Path -LiteralPath $path) { $cacheText = [IO.File]::ReadAllText($path, $utf8) } } catch {}
  $cache = Read-Json $cacheText
  $data = Read-Json $inputText
  if ($data -isnot [psobject]) { $data = $null }

  $rl = Get-Prop $data 'rate_limits'
  $ctx = Get-Prop (Get-Prop $data 'context_window') 'used_percentage'
  $parts = @(
    (Get-WindowPart '5h' $rl (Get-Prop $rl 'five_hour') $now $false),
    (Get-FablePart $cache $now),
    (Get-WindowPart 'wk' $rl (Get-Prop $rl 'seven_day') $now $true),
    $(if (Test-Num $ctx) { New-Part 'ctx' $ctx $null $null } else { New-Part 'ctx' $null 'no messages yet' $null })
  )

  Start-Refresh $path $now $cache

  # The columns the line may use. Claude Code passes the terminal width as COLUMNS but shows at
  # most COLUMNS - 4 characters of a status line (measured on 2.1.322 at 60 and 120 columns);
  # anything longer it cuts with an ellipsis, which would cut ctx off the end.
  $cols = $env:BATON_USAGE_COLUMNS
  if (-not $cols) { $cols = $env:COLUMNS }
  $width = 76
  if ($cols -match '^\d+$' -and [int]$cols -gt 5) { $width = [int]$cols - 4 }
  $color = -not $env:NO_COLOR

  [Console]::Out.Write((Get-Fit $parts $width $color) + "`n")
} catch {
  [Console]::Out.Write('baton: ' + $_.Exception.Message + "`n")
}
