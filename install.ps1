<#
  Variant Studio 3.1 - installer and updater for Windows (PowerShell 5.1+ / PowerShell 7, also works on macOS/Linux pwsh).

    .\install.ps1                              interactive: pick agents, remote sharing, scope and mode
    .\install.ps1 -Agents claude,codex         non-interactive
    .\install.ps1 -Detected -Yes               every agent found on this machine
    .\install.ps1 -All -Yes                    every supported agent, global scope
    .\install.ps1 -Project . -Agents copilot   install into a project instead of your user profile
    .\install.ps1 -Remote                      also install cloudflared and enable remote sharing (-NoRemote to turn it off)
    .\install.ps1 -Designer                    also install DesignerSkill in the same agents (-NoDesigner to skip the question)
    .\install.ps1 -Link                        junction instead of copy (updates with `git pull`)
    .\install.ps1 -Uninstall -Agents claude
    .\install.ps1 -List                        show agents and paths
    .\install.ps1 -Version 2.0                 install a specific release (1.0, 2.0, 3.0, 3.1...) instead of the latest

  Running it again updates an existing install: the old files are replaced, your config files are kept.

  One-liner (downloads the latest main branch):
    irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1 | iex
  With options:
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1))) -Agents claude,codex -Yes
  A specific release:
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1))) -Version 2.0

  If scripts are blocked, run through install.cmd or:
    powershell -ExecutionPolicy Bypass -File .\install.ps1
#>
param(
  [string[]]$Agents,
  [switch]$All,
  [switch]$Detected,
  [switch]$Yes,
  [string]$Project,
  [switch]$Link,
  [switch]$Copy,
  [switch]$Remote,
  [switch]$NoRemote,
  [switch]$Designer,
  [switch]$NoDesigner,
  [switch]$Uninstall,
  [switch]$List,
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$Skill = 'variant-studio'
$Zip = 'https://codeload.github.com/Fonlogen/variant-studio/zip/refs/heads/main'
$CfBase = 'https://github.com/cloudflare/cloudflared/releases/latest/download'
if ($Version) {
  $Version = $Version.TrimStart('v')
  if ($Version -notmatch '^[0-9.]+$') { Write-Host '-Version takes a release number like 2.0' -ForegroundColor Red; exit 1 }
  $Zip = "https://codeload.github.com/Fonlogen/variant-studio/zip/refs/tags/v$Version"
}
$IsWin = ($PSVersionTable.PSEdition -eq 'Desktop') -or ($env:OS -eq 'Windows_NT')
$UserHome = if ($IsWin -and $env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$UserDir = Join-Path $UserHome '.variant-studio'
$DsRepo = 'https://github.com/Kekko16004/DesignerSkill'
$DsDir = Join-Path (Join-Path $UserHome '.designer') 'DesignerSkill'
# Variant Studio agent id -> DesignerSkill host id (agents DesignerSkill does not support are left out)
$DsSupported = @('claude', 'codex', 'antigravity', 'kilo', 'cursor', 'opencode', 'copilot')
$DesktopZip = Join-Path (Join-Path $UserHome 'Downloads') "$Skill-skill.zip"

# Id, Name, Global dir (under the user profile), Project dir, Detection dirs, Commands.
# Claude Desktop has no skills folder: the installer builds a zip to upload in Settings > Capabilities.
$DesktopDetect = @('Library/Application Support/Claude', '.config/Claude')
if ($IsWin) {
  if ($env:APPDATA) { $DesktopDetect += (Join-Path $env:APPDATA 'Claude') }
  if ($env:LOCALAPPDATA) { $DesktopDetect += (Join-Path $env:LOCALAPPDATA 'AnthropicClaude') }
}
$Table = @(
  @{ Id = 'claude';      Name = 'Claude Code';    Global = '.claude/skills';             Proj = '.claude/skills';   Detect = @('.claude');                Cmd = @('claude') },
  @{ Id = 'desktop';     Name = 'Claude Desktop'; Global = '';                           Proj = '';                 Detect = $DesktopDetect;              Cmd = @() },
  @{ Id = 'codex';       Name = 'Codex';          Global = '.agents/skills';             Proj = '.agents/skills';   Detect = @('.codex');                 Cmd = @('codex') },
  @{ Id = 'antigravity'; Name = 'Antigravity';    Global = '.gemini/antigravity/skills'; Proj = '.agent/skills';    Detect = @('.gemini/antigravity');    Cmd = @('antigravity', 'agy') },
  @{ Id = 'gemini';      Name = 'Gemini CLI';     Global = '.gemini/skills';             Proj = '.gemini/skills';   Detect = @('.gemini');                Cmd = @('gemini') },
  @{ Id = 'kilo';        Name = 'Kilo Code';      Global = '.kilo/skills';               Proj = '.kilo/skills';     Detect = @('.kilo', '.kilocode');     Cmd = @('kilo', 'kilocode') },
  @{ Id = 'cline';       Name = 'Cline';          Global = '.cline/skills';              Proj = '.cline/skills';    Detect = @('.cline');                 Cmd = @('cline') },
  @{ Id = 'opencode';    Name = 'OpenCode';       Global = '.config/opencode/skills';    Proj = '.opencode/skills'; Detect = @('.config/opencode');       Cmd = @('opencode') },
  @{ Id = 'cursor';      Name = 'Cursor';         Global = '.cursor/skills';             Proj = '.cursor/skills';   Detect = @('.cursor');                Cmd = @('cursor') },
  @{ Id = 'copilot';     Name = 'GitHub Copilot'; Global = '.copilot/skills';            Proj = '.github/skills';   Detect = @('.copilot');               Cmd = @('copilot') },
  @{ Id = 'grok';        Name = 'Grok Build';     Global = '.grok/skills';               Proj = '.grok/skills';     Detect = @('.grok');                  Cmd = @('grok') },
  @{ Id = 'zcode';       Name = 'Z Code';         Global = '.zcode/skills';              Proj = '.zcode/skills';    Detect = @('.zcode');                 Cmd = @('zcode') }
)

function Say([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Ok([string]$t) { Write-Host '  ' -NoNewline; Write-Host ([char]0x2713) -ForegroundColor Green -NoNewline; Write-Host " $t" }
function Warn([string]$t) { Write-Host '  ! ' -ForegroundColor DarkYellow -NoNewline; Write-Host $t }
# never `exit` from the body: under `irm | iex` it would close the user's PowerShell window
function Die([string]$t) { throw [System.OperationCanceledException]::new($t) }
function J([string]$a, [string]$b) { [IO.Path]::GetFullPath((Join-Path $a ($b -replace '/', [IO.Path]::DirectorySeparatorChar))) }
function Ask([string]$q) { if ($Yes) { return '' } return (Read-Host $q) }

function Test-Detected($a) {
  foreach ($d in $a.Detect) {
    $p = if ([IO.Path]::IsPathRooted($d)) { $d } else { J $UserHome $d }
    if (Test-Path -LiteralPath $p) { return $true }
  }
  if ($a.Id -eq 'desktop' -and -not $IsWin -and (Test-Path '/Applications/Claude.app')) { return $true }
  foreach ($c in $a.Cmd) { if (Get-Command $c -ErrorAction SilentlyContinue) { return $true } }
  return $false
}
function Get-Target($a) {
  if ($a.Id -eq 'desktop') { return $DesktopZip }
  if ($script:Scope -eq 'project') { return J (J $script:ProjectDir $a.Proj) $Skill }
  return J (J $UserHome $a.Global) $Skill
}
function Get-SkillVersion([string]$dir) {
  $f = Join-Path $dir 'scripts/studio.mjs'
  if (-not (Test-Path -LiteralPath $f)) { return '' }
  $m = Select-String -LiteralPath $f -Pattern "^const VERSION = '([^']*)'" | Select-Object -First 1
  if ($m) { return $m.Matches[0].Groups[1].Value } else { return '' }
}
function Test-IsLink([string]$p) {
  $i = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
  return ($i -and $i.LinkType)
}
function Test-Ours([string]$p) {
  if (Test-IsLink $p) { return $true }
  $s = Join-Path $p 'SKILL.md'
  if (-not (Test-Path -LiteralPath $s)) { return $false }
  return [bool](Select-String -LiteralPath $s -Pattern "^name:\s*$Skill\s*$" -Quiet)
}
function Remove-Skill([string]$p) {
  if (Test-IsLink $p) {
    # remove only the link, never the folder it points to
    if ($IsWin) { [IO.Directory]::Delete($p, $false) } else { Remove-Item -LiteralPath $p -Force }
  } else { Remove-Item -LiteralPath $p -Recurse -Force }
}
function Copy-Skill([string]$src, [string]$dst) {
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $skip = @('.git', '.variant-studio', '.claude', 'node_modules', '.DS_Store', 'install.sh', 'install.ps1', 'install.cmd')
  Get-ChildItem -LiteralPath $src -Force | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $dst -Recurse -Force
  }
  # README screenshots are for GitHub, not for the agent
  $shots = Join-Path $dst 'assets/screenshots'
  if (Test-Path -LiteralPath $shots) { Remove-Item -LiteralPath $shots -Recurse -Force }
}
function Same-Folder([string]$a, [string]$b) {
  try {
    $ia = Get-Item -LiteralPath $a -Force; $ib = Get-Item -LiteralPath $b -Force
    $ra = if ($ia.LinkType) { @($ia.Target)[0] } else { $ia.FullName }
    $rb = if ($ib.LinkType) { @($ib.Target)[0] } else { $ib.FullName }
    return ([IO.Path]::GetFullPath($ra).TrimEnd('\', '/') -eq [IO.Path]::GetFullPath($rb).TrimEnd('\', '/'))
  } catch { return $false }
}
function New-TempDir { $d = Join-Path ([IO.Path]::GetTempPath()) ('vs-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $d | Out-Null; return $d }
# updater: config.json, config.local.json and *.local.json (top level and one folder down) survive a reinstall
function Save-Config([string]$dst) {
  $keep = New-TempDir
  $root = (Get-Item -LiteralPath $dst).FullName.TrimEnd('\', '/')
  Get-ChildItem -LiteralPath $dst -Recurse -Depth 1 -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'config.json' -or $_.Name -like '*.local.json' } | ForEach-Object {
      $rel = $_.FullName.Substring($root.Length).TrimStart('\', '/')
      $to = Join-Path $keep $rel
      New-Item -ItemType Directory -Force -Path (Split-Path $to -Parent) | Out-Null
      Copy-Item -LiteralPath $_.FullName -Destination $to -Force
    }
  return $keep
}
function Restore-Config([string]$keep, [string]$dst) {
  $root = (Get-Item -LiteralPath $keep).FullName.TrimEnd('\', '/'); $n = 0
  Get-ChildItem -LiteralPath $keep -Recurse -File -Force | ForEach-Object {
    $to = Join-Path $dst ($_.FullName.Substring($root.Length).TrimStart('\', '/'))
    New-Item -ItemType Directory -Force -Path (Split-Path $to -Parent) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $to -Force; $n++
  }
  return $n
}
function New-DesktopZip([string]$src) {
  $stage = New-TempDir
  try {
    Copy-Skill $src (Join-Path $stage $Skill)
    New-Item -ItemType Directory -Force -Path (Split-Path $DesktopZip -Parent) | Out-Null
    if (Test-Path -LiteralPath $DesktopZip) { Remove-Item -LiteralPath $DesktopZip -Force }
    Compress-Archive -Path (Join-Path $stage $Skill) -DestinationPath $DesktopZip
  } finally { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
}

# ---------- remote sharing (cloudflared) ----------
function Find-Cloudflared {
  $exe = if ($IsWin) { 'cloudflared.exe' } else { 'cloudflared' }
  $c = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $dirs = @((Join-Path $UserDir 'bin'))
  if ($IsWin) {
    if ($env:ProgramFiles) { $dirs += (Join-Path $env:ProgramFiles 'cloudflared') }
    if (${env:ProgramFiles(x86)}) { $dirs += (Join-Path ${env:ProgramFiles(x86)} 'cloudflared') }
    if ($env:LOCALAPPDATA) { $dirs += (Join-Path $env:LOCALAPPDATA 'Microsoft/WinGet/Links') }
  } else { $dirs += @('/opt/homebrew/bin', '/usr/local/bin', (Join-Path $UserHome '.local/bin')) }
  foreach ($d in $dirs) { $p = Join-Path $d $exe; if (Test-Path -LiteralPath $p -PathType Leaf) { return $p } }
  return $null
}
function Install-Cloudflared {
  $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
  try {
    if ($IsWin -and (Get-Command winget -ErrorAction SilentlyContinue)) {
      Say 'Installing cloudflared with winget...' 'DarkGray'
      & winget install --id Cloudflare.cloudflared -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
      $f = Find-Cloudflared; if ($f) { return $f }
      Warn 'winget could not install cloudflared; downloading it instead.'
    } elseif (-not $IsWin -and (Get-Command brew -ErrorAction SilentlyContinue)) {
      Say 'Installing cloudflared with Homebrew...' 'DarkGray'
      & brew install cloudflared *> $null
      $f = Find-Cloudflared; if ($f) { return $f }
    }
    $bin = Join-Path $UserDir 'bin'
    New-Item -ItemType Directory -Force -Path $bin | Out-Null
    $arch = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLower()
    $arch = switch ($arch) { 'x64' { 'amd64' } 'arm64' { 'arm64' } 'x86' { '386' } default { 'amd64' } }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if ($IsWin) {
      if ($arch -eq 'arm64') { $arch = 'amd64' } # no native Windows arm64 build; x64 emulation runs it
      Say "Downloading cloudflared (windows-$arch) from GitHub..." 'DarkGray'
      $out = Join-Path $bin 'cloudflared.exe'
      Invoke-WebRequest -Uri "$CfBase/cloudflared-windows-$arch.exe" -OutFile $out -UseBasicParsing
    } elseif ($IsMacOS) {
      Say "Downloading cloudflared (darwin-$arch) from GitHub..." 'DarkGray'
      $tgz = Join-Path $bin 'cloudflared.tgz'
      Invoke-WebRequest -Uri "$CfBase/cloudflared-darwin-$arch.tgz" -OutFile $tgz -UseBasicParsing
      & tar -xzf $tgz -C $bin; Remove-Item -LiteralPath $tgz -Force
      $out = Join-Path $bin 'cloudflared'; & chmod +x $out
    } else {
      Say "Downloading cloudflared (linux-$arch) from GitHub..." 'DarkGray'
      $out = Join-Path $bin 'cloudflared'
      Invoke-WebRequest -Uri "$CfBase/cloudflared-linux-$arch" -OutFile $out -UseBasicParsing
      & chmod +x $out
    }
    if (Test-Path -LiteralPath $out) { return $out }
  } catch { Warn "cloudflared: $($_.Exception.Message)" }
  finally { $ProgressPreference = $pp }
  return $null
}
function Install-Designer([string[]]$hosts, [string]$src) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Warn 'DesignerSkill needs Node.js 18+ - skipped'; return $false }
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path $DsDir -Parent) | Out-Null
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ((Test-Path -LiteralPath (Join-Path $DsDir '.git')) -and $git) {
      Say 'Updating DesignerSkill...' 'DarkGray'; & git -C $DsDir pull -q --ff-only
    } elseif (Test-Path -LiteralPath (Join-Path $DsDir 'designer/install.ps1')) {
    } elseif ($git) {
      Say 'Downloading DesignerSkill from GitHub...' 'DarkGray'; & git clone -q --depth 1 $DsRepo $DsDir
    } else {
      Say 'Downloading DesignerSkill from GitHub...' 'DarkGray'
      $t = New-TempDir; $z = Join-Path $t 'ds.zip'
      $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
      Invoke-WebRequest -Uri 'https://codeload.github.com/Kekko16004/DesignerSkill/zip/refs/heads/main' -OutFile $z -UseBasicParsing
      Expand-Archive -LiteralPath $z -DestinationPath $t -Force; $ProgressPreference = $pp
      Move-Item -LiteralPath (Get-ChildItem -LiteralPath $t -Directory | Select-Object -First 1).FullName -Destination $DsDir
      Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue
    }
    $ps1 = Join-Path $DsDir 'designer/install.ps1'
    if (-not (Test-Path -LiteralPath $ps1)) { return $false }
    # DesignerSkill installs Variant Studio into the same agents too: hand it this very version, from a stable folder
    $app = Join-Path $UserDir 'app'
    if (Test-Path -LiteralPath $app) { Remove-Item -LiteralPath $app -Recurse -Force }
    Copy-Skill $src $app
    $exe = (Get-Process -Id $PID).Path
    & $exe -NoProfile -ExecutionPolicy Bypass -File $ps1 -Hosts ($hosts -join ',') -StudioPath $app -StudioMode copy | ForEach-Object { "    $_" }
    return $true
  } catch { Warn "DesignerSkill: $($_.Exception.Message)"; return $false }
}
function Write-UserConfig([bool]$enabled, [string]$cf) {
  New-Item -ItemType Directory -Force -Path $UserDir | Out-Null
  $file = Join-Path $UserDir 'config.json'
  $c = [pscustomobject]@{}
  if (Test-Path -LiteralPath $file) { try { $c = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json } catch { $c = [pscustomobject]@{} } }
  $r = [ordered]@{}
  if ($c.PSObject.Properties['remote'] -and $c.remote) { foreach ($p in $c.remote.PSObject.Properties) { $r[$p.Name] = $p.Value } }
  $r['enabled'] = $enabled
  if ($cf) { $r['cloudflared'] = $cf } elseif ($r.Contains('cloudflared')) { $r.Remove('cloudflared') }
  $c | Add-Member -NotePropertyName remote -NotePropertyValue ([pscustomobject]$r) -Force
  # UTF-8 without BOM, so Node reads it
  [IO.File]::WriteAllText($file, ($c | ConvertTo-Json -Depth 8) + [Environment]::NewLine, (New-Object Text.UTF8Encoding $false))
}

function Invoke-Install {
if ($List) {
  '{0,-12} {1,-16} {2,-34} {3,-20} {4}' -f 'ID', 'AGENT', 'GLOBAL', 'PROJECT', 'DETECTED'
  foreach ($a in $Table) {
    $g = if ($a.Id -eq 'desktop') { 'zip in ~/Downloads' } else { '~/' + $a.Global }
    $p = if ($a.Id -eq 'desktop') { '-' } else { $a.Proj }
    '{0,-12} {1,-16} {2,-34} {3,-20} {4}' -f $a.Id, $a.Name, $g, $p, $(if (Test-Detected $a) { 'yes' } else { 'no' })
  }
  return
}

Write-Host ''
Write-Host 'Variant Studio ' -NoNewline; Write-Host '3.1' -ForegroundColor DarkYellow -NoNewline; Write-Host ' installer'
Say "Installs or updates the '$Skill' skill in your coding agents." 'DarkGray'
Write-Host ''

# ---------- choose agents ----------
$Chosen = @()
if ($All) { $Chosen = $Table }
elseif ($Detected) { $Chosen = $Table | Where-Object { Test-Detected $_ } }
elseif ($Agents) {
  foreach ($w in ($Agents -join ',').Split(',')) {
    $w = $w.Trim().ToLower(); if (-not $w) { continue }
    $hit = $Table | Where-Object { $_.Id -eq $w }
    if (-not $hit) { Die "Unknown agent '$w'. Valid ids: $(($Table | ForEach-Object { $_.Id }) -join ' ')" }
    $Chosen += $hit
  }
} else {
  $pick = @{}
  foreach ($a in $Table) { $pick[$a.Id] = (Test-Detected $a) }
  while ($true) {
    Write-Host 'Select the agents ' -NoNewline; Say '(detected ones are pre-selected)' 'DarkGray'
    for ($i = 0; $i -lt $Table.Count; $i++) {
      $a = $Table[$i]
      Write-Host '  [' -NoNewline
      if ($pick[$a.Id]) { Write-Host 'x' -ForegroundColor DarkYellow -NoNewline } else { Write-Host ' ' -NoNewline }
      Write-Host ('] {0,2}  {1,-16} ' -f ($i + 1), $a.Name) -NoNewline
      if (Test-Detected $a) { Write-Host 'detected ' -ForegroundColor Green -NoNewline }
      if ($a.Id -eq 'desktop') { Write-Host '(zip to upload)' -ForegroundColor DarkGray } else { Write-Host '' }
    }
    $line = Read-Host 'Numbers to toggle (e.g. 1 3), d=detected only, a=all, n=none, Enter=continue, q=quit'
    Write-Host ''
    if ([string]::IsNullOrWhiteSpace($line)) { break }
    switch -Regex ($line.Trim()) {
      '^[qQ]$' { return }
      '^[aA]$' { foreach ($a in $Table) { $pick[$a.Id] = $true }; continue }
      '^[nN]$' { foreach ($a in $Table) { $pick[$a.Id] = $false }; continue }
      '^[dD]$' { foreach ($a in $Table) { $pick[$a.Id] = (Test-Detected $a) }; continue }
      default {
        foreach ($t in ($line -split '[\s,]+')) {
          if ($t -notmatch '^\d+$') { if ($t) { Warn "Ignored '$t'" }; continue }
          $j = [int]$t - 1
          if ($j -lt 0 -or $j -ge $Table.Count) { Warn "No agent $t"; continue }
          $pick[$Table[$j].Id] = -not $pick[$Table[$j].Id]
        }
      }
    }
  }
  $Chosen = $Table | Where-Object { $pick[$_.Id] }
}
$Chosen = @($Chosen)
if ($Chosen.Count -eq 0) { Die 'No agent selected.' }
$HasDir = [bool]($Chosen | Where-Object { $_.Id -ne 'desktop' })

# ---------- scope + mode ----------
$script:Scope = if ($PSBoundParameters.ContainsKey('Project')) { 'project' } else { '' }
$script:ProjectDir = $Project
if (-not $script:Scope) {
  if ($Yes -or -not $HasDir) { $script:Scope = 'global' }
  else {
    $a = Read-Host 'Install globally (g, all projects) or into a project (p)? [G/p]'
    $script:Scope = if ($a -match '^[pP]') { 'project' } else { 'global' }
  }
}
if ($script:Scope -eq 'project') {
  if (-not $script:ProjectDir) {
    $script:ProjectDir = Read-Host "Project folder [$((Get-Location).Path)]"
    if (-not $script:ProjectDir) { $script:ProjectDir = (Get-Location).Path }
  }
  if (-not (Test-Path -LiteralPath $script:ProjectDir -PathType Container)) { Die "Project folder not found: $script:ProjectDir" }
  $script:ProjectDir = (Resolve-Path -LiteralPath $script:ProjectDir).Path
}

# ---------- remote sharing ----------
$Cf = Find-Cloudflared
$RemoteChoice = if ($Remote) { 'yes' } elseif ($NoRemote) { 'no' } elseif ($Yes) { 'keep' } else { '' }
if (-not $Uninstall -and -not $RemoteChoice) {
  Write-Host 'Remote sharing ' -NoNewline; Say 'lets teammates outside your network open a temporary link to the studio and vote.' 'DarkGray'
  if ($Cf) { Say "It uses cloudflared, already installed at $Cf." 'DarkGray' }
  else { Say "It needs cloudflared (Cloudflare's free tunnel client, about 40 MB, no account required)." 'DarkGray' }
  $a = Read-Host 'Enable remote sharing? [y/N]'
  $RemoteChoice = if ($a -match '^[yY]') { 'yes' } else { 'no' }
  Write-Host ''
}

# ---------- DesignerSkill ----------
$DsHosts = @($Chosen | Where-Object { $DsSupported -contains $_.Id } | ForEach-Object { $_.Id })
$DesignerChoice = if ($Designer) { 'yes' } elseif ($NoDesigner -or $Yes -or $DsHosts.Count -eq 0) { 'no' } else { '' }
if (-not $Uninstall -and -not $DesignerChoice) {
  Write-Host 'DesignerSkill ' -NoNewline; Say "($DsRepo) is a design skill made together with Variant Studio: it studies real" 'DarkGray'
  Say 'products, fixes the design tokens, shows directions in Variant Studio, checks and documents the result' 'DarkGray'
  Say "and translates it to your stack. It installs into the same agents ($($DsHosts -join ', '))." 'DarkGray'
  $a = Read-Host 'Install DesignerSkill too? [y/N]'
  $DesignerChoice = if ($a -match '^[yY]') { 'yes' } else { 'no' }
  Write-Host ''
}

# ---------- source ----------
$Here = if ($PSScriptRoot) { $PSScriptRoot } else { '' }
$Tmp = $null
$Src = $null
$NewVer = ''
$Mode = if ($Link) { 'link' } elseif ($Copy) { 'copy' } else { '' }
if (-not $Uninstall) {
  if (-not $Version -and $Here -and (Test-Path (Join-Path $Here 'SKILL.md')) -and (Test-Path (Join-Path $Here 'scripts/studio.mjs'))) { $Src = $Here }
  else {
    if ($Version) { Say "Downloading Variant Studio $Version from GitHub..." 'DarkGray' } else { Say 'Downloading the latest Variant Studio from GitHub...' 'DarkGray' }
    $Tmp = New-TempDir
    $zipFile = Join-Path $Tmp 'vs.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $pp = $ProgressPreference; $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $Zip -OutFile $zipFile -UseBasicParsing
    Expand-Archive -LiteralPath $zipFile -DestinationPath $Tmp -Force
    $ProgressPreference = $pp
    $Src = (Get-ChildItem -LiteralPath $Tmp -Directory | Select-Object -First 1).FullName
    if (-not (Test-Path (Join-Path $Src 'SKILL.md'))) { Die 'Download did not contain SKILL.md' }
    if ($Mode -eq 'link') { Warn '-Link needs a local clone; copying instead.' }
    $Mode = 'copy'
  }
  if ($HasDir -and -not $Mode) {
    if ($Yes -or $Src -ne $Here) { $Mode = 'copy' }
    else {
      $a = Read-Host 'Copy the files (c), or link to this folder (l, stays updated with git pull)? [C/l]'
      $Mode = if ($a -match '^[lL]') { 'link' } else { 'copy' }
    }
  }
  $NewVer = Get-SkillVersion $Src
}

# ---------- confirm ----------
Write-Host ''
$verb = if ($Uninstall) { 'Uninstall' } else { 'Install' }
Write-Host $verb -NoNewline; Say " ($($script:Scope)$(if ($Mode) { ', ' + $Mode })):" 'DarkGray'
foreach ($a in $Chosen) {
  $dst = Get-Target $a
  Write-Host ('  {0,-16} {1} ' -f $a.Name, $dst) -NoNewline
  if (-not $Uninstall -and $a.Id -ne 'desktop' -and (Test-Path -LiteralPath $dst) -and (Test-Ours $dst)) {
    $old = Get-SkillVersion $dst
    if ($old -and $old -eq $NewVer) { Say "reinstall $old" 'DarkGray' } else { Say "update $(if ($old) { $old } else { '?' }) -> $NewVer" 'DarkGray' }
  } else { Write-Host '' }
}
if (-not $Uninstall) {
  if ($RemoteChoice -eq 'yes') { Say $(if ($Cf) { "  Remote sharing: on (cloudflared at $Cf)" } else { '  Remote sharing: on, cloudflared will be installed' }) 'DarkGray' }
  elseif ($RemoteChoice -eq 'no') { Say '  Remote sharing: off' 'DarkGray' }
  if ($DesignerChoice -eq 'yes') { Say "  DesignerSkill: $($DsHosts -join ', ') (global)" 'DarkGray' }
}
if (-not $Yes) {
  $a = Read-Host 'Proceed? [Y/n]'
  if ($a -match '^[nN]') { Say 'Cancelled.'; return }
}
Write-Host ''

# ---------- do it ----------
$done = 0; $desktopDone = $false
try {
  foreach ($a in $Chosen) {
    $dst = Get-Target $a
    if ($a.Id -eq 'desktop') {
      if ($Uninstall) {
        if (Test-Path -LiteralPath $DesktopZip) { Remove-Item -LiteralPath $DesktopZip -Force }
        Warn "$($a.Name): remove the skill in Settings > Capabilities"; continue
      }
      New-DesktopZip $Src; Ok "$($a.Name): $DesktopZip"; $desktopDone = $true; $done++; continue
    }
    $exists = (Test-Path -LiteralPath $dst) -or (Test-IsLink $dst)
    if ($Uninstall) {
      if (-not $exists) { Warn "$($a.Name): not installed"; continue }
      if (-not (Test-Ours $dst)) { Warn "$($a.Name): $dst is not Variant Studio, left untouched"; continue }
      Remove-Skill $dst; Ok "$($a.Name): removed $dst"; $done++; continue
    }
    $note = ''; $keep = $null
    if ($exists) {
      if (Same-Folder $dst $Src) { Ok "$($a.Name): already this folder ($dst)"; $done++; continue }
      if (-not (Test-Ours $dst)) { Warn "$($a.Name): $dst exists and is not Variant Studio - skipped"; continue }
      $old = Get-SkillVersion $dst
      $note = if ($old -and $old -eq $NewVer) { "reinstalled $old" } else { "updated $(if ($old) { $old } else { '?' }) -> $NewVer" }
      if (-not (Test-IsLink $dst)) { $keep = Save-Config $dst }
      Remove-Skill $dst
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
    if ($Mode -eq 'link') {
      $type = if ($IsWin) { 'Junction' } else { 'SymbolicLink' }
      New-Item -ItemType $type -Path $dst -Target $Src | Out-Null
    } else { Copy-Skill $Src $dst }
    if ($keep) {
      if ($Mode -ne 'link') { $n = Restore-Config $keep $dst; if ($n -gt 0) { $note += ", kept $n config file(s)" } }
      Remove-Item -LiteralPath $keep -Recurse -Force -ErrorAction SilentlyContinue
    }
    Ok "$($a.Name): $dst$(if ($note) { " ($note)" })"; $done++
  }
} finally {
  # the download is still needed by DesignerSkill below
  if ($DesignerChoice -ne 'yes' -and $Tmp -and (Test-Path $Tmp)) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
if (-not $Uninstall) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    $v = & node -p 'process.versions.node.split(".")[0]' 2>$null
    if ([int]$v -lt 18) { Warn "Node.js $(& node -v) found; Variant Studio needs Node 18 or newer." } else { Ok "Node.js $(& node -v)" }
  } else { Warn 'Node.js not found. Install Node 18+ (https://nodejs.org or `winget install OpenJS.NodeJS.LTS`).' }
  if ($RemoteChoice -eq 'yes') {
    if (-not $Cf) { $Cf = Install-Cloudflared }
    if ($Cf) { Write-UserConfig $true $Cf; Ok "Remote sharing on (cloudflared: $Cf)" }
    else { Write-UserConfig $true ''; Warn 'Could not install cloudflared. Install it yourself (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and remote sharing will work.' }
  } elseif ($RemoteChoice -eq 'no') { Write-UserConfig $false $Cf; Ok 'Remote sharing off (re-run with -Remote to turn it on)' }
  if ($DesignerChoice -eq 'yes') {
    Write-Host ''; Write-Host 'DesignerSkill'
    if ($DsHosts.Count -eq 0) { Warn 'DesignerSkill supports none of the chosen agents - skipped' }
    elseif (Install-Designer $DsHosts $Src) { Ok "DesignerSkill installed for $($DsHosts -join ', ') (update later: $DsDir\update.bat)" }
    else { Warn "DesignerSkill was not installed. Get it from $DsRepo" }
  }
  if ($Tmp -and (Test-Path $Tmp)) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
  Write-Host ''
  Write-Host "Done. Installed for $done agent(s). Restart the agent, then ask for design variants"
  Write-Host '(e.g. "show me 3 versions of the pricing card") or invoke the skill by name: ' -NoNewline; Write-Host $Skill -ForegroundColor DarkYellow
  if ($desktopDone) {
    Write-Host ''
    Write-Host 'Claude Desktop: open Settings > Capabilities > Skills, choose Upload skill and pick'
    Write-Host "  $DesktopZip"
    Say 'Desktop chats run in a sandbox, so the studio opens as a single HTML file there (build). In the Code tab of' 'DarkGray'
    Say "Claude Desktop the live studio works like in Claude Code: install for 'Claude Code' too." 'DarkGray'
  }
} else {
  Write-Host "Done. Removed from $done agent(s)."
}
}

try { Invoke-Install }
catch [System.OperationCanceledException] {
  Write-Host "x $($_.Exception.Message)" -ForegroundColor Red
  if ($PSCommandPath) { exit 1 }
}
