$ESC   = [char]27
$GREEN = "${ESC}[32m"
$CYAN  = "${ESC}[36m"
$DIM   = "${ESC}[2m"
$RESET = "${ESC}[0m"

$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
         Select-Object -ExpandProperty CommandLine

$isNodmon = $procs | Where-Object { $_ -match "nodemon" -and $_ -match "server\.js" }
$isProd   = $procs | Where-Object { $_ -notmatch "nodemon" -and $_ -match "[/\\]server\.js" }

if ($isNodmon) {
    $mode  = "development"
    $color = $GREEN
} elseif ($isProd) {
    $mode  = "production"
    $color = $CYAN
} else {
    $mode  = "serveur arrete"
    $color = $DIM
}

Write-Host ""
Write-Host "  decoGestion : ${color}${mode}${RESET}"
Write-Host ""
