$raw = [Console]::In.ReadToEnd()
$d = $raw | ConvertFrom-Json -ErrorAction SilentlyContinue

$ESC     = [char]27
$RESET   = "${ESC}[0m"
$BOLD    = "${ESC}[1m"
$DIM     = "${ESC}[2m"
$CYAN    = "${ESC}[36m"
$YELLOW  = "${ESC}[33m"
$GREEN   = "${ESC}[32m"
$RED     = "${ESC}[31m"
$BLUE    = "${ESC}[34m"
$MAGENTA = "${ESC}[35m"
$WHITE   = "${ESC}[37m"
$SEP     = "${DIM} | ${RESET}"

# --- Directory (last two segments) ---
$raw_cwd = if ($d.workspace.current_dir) { $d.workspace.current_dir } elseif ($d.cwd) { $d.cwd } else { "" }
$dir = ""
if ($raw_cwd) {
    $leaf   = Split-Path -Leaf $raw_cwd
    $parent = Split-Path -Leaf (Split-Path -Parent $raw_cwd)
    if ($parent -and $parent -ne "") { $dir = "$parent/$leaf" } else { $dir = $leaf }
}

# --- Git branch + dirty state ---
$branch = ""
$dirty  = ""
if ($d.worktree.branch)            { $branch = $d.worktree.branch }
elseif ($d.workspace.git_worktree) { $branch = $d.workspace.git_worktree }
elseif ($raw_cwd) {
    try {
        $branch = (git -C $raw_cwd --no-optional-locks symbolic-ref --short HEAD 2>$null)
        if ($branch) {
            $status_out = (git -C $raw_cwd --no-optional-locks status --porcelain 2>$null)
            if ($status_out) { $dirty = "*" }
        }
    } catch { $branch = "" }
}

# --- GitHub repo ---
$repo = if ($d.workspace.repo) { "$($d.workspace.repo.owner)/$($d.workspace.repo.name)" } else { "" }

# --- Open PR ---
$pr_number = if ($d.pr.number) { $d.pr.number } else { "" }
$pr_state  = if ($d.pr.review_state) { $d.pr.review_state } else { "" }

# --- Model ---
$model = if ($d.model.display_name) { $d.model.display_name -replace '^Claude ', '' }
         elseif ($d.model.id) { $d.model.id } else { "" }

# --- Context window ---
$used      = $d.context_window.used_percentage
$remaining = $d.context_window.remaining_percentage

# --- Effort level ---
$effort = if ($d.effort.level) { $d.effort.level } else { "" }

# --- Thinking ---
$thinking = if ($d.thinking.enabled -eq $true) { $true } else { $false }

# --- Session name ---
$session_name = if ($d.session_name) { $d.session_name } else { "" }

# --- Output style ---
$style = if ($d.output_style.name -and $d.output_style.name -ne "default") { $d.output_style.name } else { "" }

# --- Vim mode ---
$vim_mode = if ($d.vim.mode) { $d.vim.mode } else { "" }

# --- Rate limits ---
$five_pct   = $null
$five_reset = $null
$week_pct   = $null
if ($d.PSObject.Properties['rate_limits'] -and $d.rate_limits -ne $null) {
    $rl = $d.rate_limits
    if ($rl.PSObject.Properties['five_hour'] -and $rl.five_hour -ne $null) {
        $fh = $rl.five_hour
        if ($fh.PSObject.Properties['used_percentage'] -and $fh.used_percentage -ne $null) {
            $five_pct = [double]$fh.used_percentage
        }
        if ($fh.PSObject.Properties['resets_at'] -and $fh.resets_at -ne $null) {
            $five_reset = [long]$fh.resets_at
        }
    }
    if ($rl.PSObject.Properties['seven_day'] -and $rl.seven_day -ne $null) {
        $sd = $rl.seven_day
        if ($sd.PSObject.Properties['used_percentage'] -and $sd.used_percentage -ne $null) {
            $week_pct = [double]$sd.used_percentage
        }
    }
}

# --- Current time ---
$time_now = Get-Date -Format "HH:mm"

# --- Assemble parts ---
$parts = [System.Collections.Generic.List[string]]::new()

# Directory + branch (with dirty marker)
$branch_str = if ($branch) { "${branch}${dirty}" } else { "" }
if ($dir -and $branch_str) {
    $parts.Add("${CYAN}${BOLD}${dir}${RESET} ${DIM}on${RESET} ${YELLOW}${branch_str}${RESET}")
} elseif ($dir) {
    $parts.Add("${CYAN}${BOLD}${dir}${RESET}")
}

# Repo identity
if ($repo) {
    $parts.Add("${DIM}${repo}${RESET}")
}

# Open PR
if ($pr_number) {
    $pr_color = switch ($pr_state) {
        "approved"           { $GREEN }
        "changes_requested"  { $RED }
        "draft"              { $DIM }
        default              { $BLUE }
    }
    $pr_text = if ($pr_state) { "PR #${pr_number} (${pr_state})" } else { "PR #${pr_number}" }
    $parts.Add("${pr_color}${pr_text}${RESET}")
}

# Session name
if ($session_name) {
    $parts.Add("${DIM}[${session_name}]${RESET}")
}

# Model
if ($model) {
    $parts.Add("${MAGENTA}${model}${RESET}")
}

# Effort level
if ($effort) {
    $effort_color = switch ($effort) {
        "max"    { $RED }
        "xhigh"  { $RED }
        "high"   { $YELLOW }
        "medium" { $CYAN }
        default  { $DIM }
    }
    $parts.Add("${effort_color}effort:${effort}${RESET}")
}

# Thinking mode
if ($thinking) {
    $parts.Add("${CYAN}thinking${RESET}")
}

# Output style
if ($style) {
    $parts.Add("${DIM}style:${style}${RESET}")
}

# Vim mode
if ($vim_mode) {
    $vim_color = switch ($vim_mode) {
        "INSERT"      { $GREEN }
        "VISUAL"      { $YELLOW }
        "VISUAL LINE" { $YELLOW }
        default       { $BLUE }
    }
    $parts.Add("${vim_color}${vim_mode}${RESET}")
}

# Context usage with color coding
if ($null -ne $used) {
    $used_int = [int][Math]::Round($used)
    $ctx_color = if ($used_int -ge 80) { $RED } elseif ($used_int -ge 50) { $YELLOW } else { $GREEN }
    if ($null -ne $remaining) {
        $rem_int = [int][Math]::Round($remaining)
        $parts.Add("ctx: ${ctx_color}${used_int}% used${RESET} / ${GREEN}${rem_int}% left${RESET}")
    } else {
        $parts.Add("ctx: ${ctx_color}${used_int}%${RESET}")
    }
}

# 5-hour rate limit
if ($null -ne $five_pct) {
    $five_int   = [int][Math]::Round($five_pct)
    $five_color = if ($five_int -ge 80) { $RED } elseif ($five_int -ge 50) { $YELLOW } else { $GREEN }
    $five_label = "5h: ${five_int}%"
    if ($five_reset) {
        $now_epoch   = [long][Math]::Floor(([DateTime]::UtcNow - [DateTime]::new(1970,1,1,0,0,0,[System.DateTimeKind]::Utc)).TotalSeconds)
        $diff_sec    = [long]$five_reset - $now_epoch
        if ($diff_sec -gt 0) {
            $diff_min = [int][Math]::Floor($diff_sec / 60)
            if ($diff_min -ge 60) {
                $diff_h = [int][Math]::Floor($diff_min / 60)
                $diff_m = $diff_min % 60
                $five_label += " (reset {0}h{1:d2}m)" -f $diff_h, $diff_m
            } else {
                $five_label += " (reset ${diff_min}min)"
            }
        }
    }
    $parts.Add("${five_color}${five_label}${RESET}")
}

# 7-day rate limit
if ($null -ne $week_pct) {
    $week_int   = [int][Math]::Round($week_pct)
    $week_color = if ($week_int -ge 80) { $RED } elseif ($week_int -ge 50) { $YELLOW } else { $GREEN }
    $parts.Add("${week_color}7j: ${week_int}%${RESET}")
}

# Current time
$parts.Add("${WHITE}${time_now}${RESET}")

$output = $parts -join $SEP
Write-Host $output
