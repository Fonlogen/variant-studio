<#
  Variant Studio 2.0 - installer for Windows (PowerShell 5.1+ / PowerShell 7, also works on macOS/Linux pwsh).

    .\install.ps1                              interactive: pick agents, scope and mode
    .\install.ps1 -Agents claude,codex         non-interactive
    .\install.ps1 -All -Yes                    every supported agent, global scope
    .\install.ps1 -Project . -Agents copilot   install into a project instead of your user profile
    .\install.ps1 -Link                        junction instead of copy (updates with `git pull`)
    .\install.ps1 -Uninstall -Agents claude
    .\install.ps1 -List                        show agents and paths

  One-liner (downloads the latest main branch):
    irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1 | iex
  With options:
    & ([scriptblock]::Create((irm https://raw.githubusercontent.com/Fonlogen/variant-studio/main/install.ps1))) -Agents claude,codex -Yes

  If scripts are blocked, run through install.cmd or:
    powershell -ExecutionPolicy Bypass -File .\install.ps1
#>
param(
  [string[]]$Agents,
  [switch]$All,
  [switch]$Yes,
  [string]$Project,
  [switch]$Link,
  [switch]$Copy,
  [switch]$Uninstall,
  [switch]$List
)

$ErrorActionPreference = 'Stop'
$Skill = 'variant-studio'
$Zip = 'https://codeload.github.com/Fonlogen/variant-studio/zip/refs/heads/main'
$IsWin = ($PSVersionTable.PSEdition -eq 'Desktop') -or ($env:OS -eq 'Windows_NT')
$UserHome = if ($IsWin -and $env:USERPROFILE) { $env:USERPROFILE } else { $HOME }

# Id, Name, Global dir (under the user profile), Project dir, Detection dirs, Commands
$Table = @(
  @{ Id = 'claude';      Name = 'Claude Code';    Global = '.claude/skills';             Proj = '.claude/skills';   Detect = @('.claude');                Cmd = @('claude') },
  @{ Id = 'codex';       Name = 'Codex';          Global = '.agents/skills';             Proj = '.agents/skills';   Detect = @('.codex');                 Cmd = @('codex') },
  @{ Id = 'kilo';        Name = 'Kilo Code';      Global = '.kilo/skills';               Proj = '.kilo/skills';     Detect = @('.kilo', '.kilocode');     Cmd = @('kilo', 'kilocode') },
  @{ Id = 'antigravity'; Name = 'Antigravity';    Global = '.gemini/antigravity/skills'; Proj = '.agent/skills';    Detect = @('.gemini/antigravity');    Cmd = @('antigravity', 'agy') },
  @{ Id = 'gemini';      Name = 'Gemini CLI';     Global = '.gemini/skills';             Proj = '.gemini/skills';   Detect = @('.gemini');                Cmd = @('gemini') },
  @{ Id = 'cline';       Name = 'Cline';          Global = '.cline/skills';              Proj = '.cline/skills';    Detect = @('.cline');                 Cmd = @('cline') },
  @{ Id = 'copilot';     Name = 'GitHub Copilot'; Global = '.copilot/skills';            Proj = '.github/skills';   Detect = @('.copilot');               Cmd = @('copilot') },
  @{ Id = 'grok';        Name = 'Grok Build';     Global = '.grok/skills';               Proj = '.grok/skills';     Detect = @('.grok');                  Cmd = @('grok') },
  @{ Id = 'zcode';       Name = 'Z Code';         Global = '.zcode/skills';              Proj = '.zcode/skills';    Detect = @('.zcode');                 Cmd = @('zcode') },
  @{ Id = 'opencode';    Name = 'OpenCode';       Global = '.config/opencode/skills';    Proj = '.opencode/skills'; Detect = @('.config/opencode');       Cmd = @('opencode') }
)

function Say([string]$t, [string]$c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Ok([string]$t) { Write-Host '  ' -NoNewline; Write-Host ([char]0x2713) -ForegroundColor Green -NoNewline; Write-Host " $t" }
function Warn([string]$t) { Write-Host '  ! ' -ForegroundColor DarkYellow -NoNewline; Write-Host $t }
# never `exit` from the body: under `irm | iex` it would close the user's PowerShell window
function Die([string]$t) { throw [System.OperationCanceledException]::new($t) }
function J([string]$a, [string]$b) { [IO.Path]::GetFullPath((Join-Path $a ($b -replace '/', [IO.Path]::DirectorySeparatorChar))) }

function Test-Detected($a) {
  foreach ($d in $a.Detect) { if (Test-Path -LiteralPath (J $UserHome $d)) { return $true } }
  foreach ($c in $a.Cmd) { if (Get-Command $c -ErrorAction SilentlyContinue) { return $true } }
  return $false
}
function Get-Target($a) {
  if ($script:Scope -eq 'project') { return J (J $script:ProjectDir $a.Proj) $Skill }
  return J (J $UserHome $a.Global) $Skill
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
  $skip = @('.git', '.variant-studio', 'node_modules', 'install.sh', 'install.ps1', 'install.cmd')
  Get-ChildItem -LiteralPath $src -Force | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $dst -Recurse -Force
  }
}
function Same-Folder([string]$a, [string]$b) {
  try {
    $ia = Get-Item -LiteralPath $a -Force; $ib = Get-Item -LiteralPath $b -Force
    $ra = if ($ia.LinkType) { @($ia.Target)[0] } else { $ia.FullName }
    $rb = if ($ib.LinkType) { @($ib.Target)[0] } else { $ib.FullName }
    return ([IO.Path]::GetFullPath($ra).TrimEnd('\', '/') -eq [IO.Path]::GetFullPath($rb).TrimEnd('\', '/'))
  } catch { return $false }
}

function Invoke-Install {
if ($List) {
  '{0,-12} {1,-16} {2,-34} {3,-20} {4}' -f 'ID', 'AGENT', 'GLOBAL', 'PROJECT', 'DETECTED'
  foreach ($a in $Table) { '{0,-12} {1,-16} {2,-34} {3,-20} {4}' -f $a.Id, $a.Name, ('~/' + $a.Global), $a.Proj, $(if (Test-Detected $a) { 'yes' } else { 'no' }) }
  return
}

Write-Host ''
Write-Host 'Variant Studio ' -NoNewline; Write-Host '2.0' -ForegroundColor DarkYellow -NoNewline; Write-Host ' installer'
Say "Installs the '$Skill' skill into your coding agents." 'DarkGray'
Write-Host ''

# ---------- choose agents ----------
$Chosen = @()
if ($All) { $Chosen = $Table }
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
      if (Test-Detected $a) { Write-Host 'detected' -ForegroundColor Green } else { Write-Host '' }
    }
    $line = Read-Host 'Numbers to toggle (e.g. 1 3), a=all, n=none, Enter=continue, q=quit'
    Write-Host ''
    if ([string]::IsNullOrWhiteSpace($line)) { break }
    switch -Regex ($line.Trim()) {
      '^[qQ]$' { return }
      '^[aA]$' { foreach ($a in $Table) { $pick[$a.Id] = $true }; continue }
      '^[nN]$' { foreach ($a in $Table) { $pick[$a.Id] = $false }; continue }
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

# ---------- scope + mode ----------
$script:Scope = if ($PSBoundParameters.ContainsKey('Project')) { 'project' } else { '' }
$script:ProjectDir = $Project
if (-not $script:Scope) {
  if ($Yes) { $script:Scope = 'global' }
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

# ---------- source ----------
$Here = if ($PSScriptRoot) { $PSScriptRoot } else { '' }
$Tmp = $null
$Src = $null
$Mode = if ($Link) { 'link' } elseif ($Copy) { 'copy' } else { '' }
if (-not $Uninstall) {
  if ($Here -and (Test-Path (Join-Path $Here 'SKILL.md')) -and (Test-Path (Join-Path $Here 'scripts/studio.mjs'))) { $Src = $Here }
  else {
    Say 'Downloading the latest Variant Studio from GitHub...' 'DarkGray'
    $Tmp = Join-Path ([IO.Path]::GetTempPath()) ('vs-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $Tmp | Out-Null
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
  if (-not $Mode) {
    if ($Yes -or $Src -ne $Here) { $Mode = 'copy' }
    else {
      $a = Read-Host 'Copy the files (c), or link to this folder (l, stays updated with git pull)? [C/l]'
      $Mode = if ($a -match '^[lL]') { 'link' } else { 'copy' }
    }
  }
}

# ---------- confirm ----------
Write-Host ''
$verb = if ($Uninstall) { 'Uninstall' } else { 'Install' }
Write-Host $verb -NoNewline; Say " ($($script:Scope)$(if ($Mode) { ', ' + $Mode })):" 'DarkGray'
foreach ($a in $Chosen) { '  {0,-16} {1}' -f $a.Name, (Get-Target $a) }
if (-not $Yes) {
  $a = Read-Host 'Proceed? [Y/n]'
  if ($a -match '^[nN]') { Say 'Cancelled.'; return }
}
Write-Host ''

# ---------- do it ----------
$done = 0
try {
  foreach ($a in $Chosen) {
    $dst = Get-Target $a
    $exists = (Test-Path -LiteralPath $dst) -or (Test-IsLink $dst)
    if ($Uninstall) {
      if (-not $exists) { Warn "$($a.Name): not installed"; continue }
      if (-not (Test-Ours $dst)) { Warn "$($a.Name): $dst is not Variant Studio, left untouched"; continue }
      Remove-Skill $dst; Ok "$($a.Name): removed $dst"; $done++; continue
    }
    if ($exists) {
      if (Same-Folder $dst $Src) { Ok "$($a.Name): already this folder ($dst)"; $done++; continue }
      if (-not (Test-Ours $dst)) { Warn "$($a.Name): $dst exists and is not Variant Studio - skipped"; continue }
      Remove-Skill $dst
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
    if ($Mode -eq 'link') {
      $type = if ($IsWin) { 'Junction' } else { 'SymbolicLink' }
      New-Item -ItemType $type -Path $dst -Target $Src | Out-Null
    } else { Copy-Skill $Src $dst }
    Ok "$($a.Name): $dst"; $done++
  }
} finally {
  if ($Tmp -and (Test-Path $Tmp)) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
if (-not $Uninstall) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    $v = & node -p 'process.versions.node.split(".")[0]' 2>$null
    if ([int]$v -lt 18) { Warn "Node.js $(& node -v) found; Variant Studio needs Node 18 or newer." } else { Ok "Node.js $(& node -v)" }
  } else { Warn 'Node.js not found. Install Node 18+ (https://nodejs.org or `winget install OpenJS.NodeJS.LTS`).' }
  Write-Host ''
  Write-Host "Done. Installed for $done agent(s). Restart the agent, then ask for design variants"
  Write-Host '(e.g. "show me 3 versions of the pricing card") or invoke the skill by name: ' -NoNewline; Write-Host $Skill -ForegroundColor DarkYellow
} else {
  Write-Host "Done. Removed from $done agent(s)."
}
}

try { Invoke-Install }
catch [System.OperationCanceledException] {
  Write-Host "x $($_.Exception.Message)" -ForegroundColor Red
  if ($PSCommandPath) { exit 1 }
}
