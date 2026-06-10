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
$SEP     = "${DIM} | ${RESET}"

# --- Directory (basename only) ---
$raw_cwd = if ($d.workspace.current_dir) { $d.workspace.current_dir } elseif ($d.cwd) { $d.cwd } else { "" }
$dir = if ($raw_cwd) { Split-Path -Leaf $raw_cwd } else { "" }

# --- Git branch ---
$branch = if ($d.worktree.branch) { $d.worktree.branch }
          elseif ($d.workspace.git_worktree) { $d.workspace.git_worktree }
          elseif ($raw_cwd) {
              try { git -C $raw_cwd --no-optional-locks symbolic-ref --short HEAD 2>$null } catch { "" }
          } else { "" }

# --- GitHub repo ---
$repo = if ($d.workspace.repo) { "$($d.workspace.repo.owner)/$($d.workspace.repo.name)" } else { "" }

# --- Open PR ---
$pr_number = if ($d.pr.number) { $d.pr.number } else { "" }
$pr_state  = if ($d.pr.review_state) { $d.pr.review_state } else { "" }

# --- Model ---
$model = if ($d.model.display_name) { $d.model.display_name -replace '^Claude ', '' }
         elseif ($d.model.id) { $d.model.id } else { "" }

# --- Context window ---
$used = $d.context_window.used_percentage

# --- Assemble parts ---
$parts = [System.Collections.Generic.List[string]]::new()

# Directory + branch
if ($dir -and $branch) {
    $parts.Add("${CYAN}${BOLD}${dir}${RESET} ${DIM}on${RESET} ${YELLOW}${branch}${RESET}")
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

# Model
if ($model) {
    $parts.Add("${MAGENTA}${model}${RESET}")
}

# Context usage with color coding
if ($null -ne $used) {
    $used_int = [int][Math]::Round($used)
    $ctx_color = if ($used_int -ge 80) { $RED } elseif ($used_int -ge 50) { $YELLOW } else { $GREEN }
    $parts.Add("ctx: ${ctx_color}${used_int}%${RESET}")
}

$output = $parts -join $SEP
Write-Host $output
