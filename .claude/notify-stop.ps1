param(
    [string]$Event = "Stop"
)

$config = @{
    Stop              = @{ title = "Tache terminee"; body = "Claude Code a fini et attend votre reponse" }
    PermissionRequest = @{ title = "Permission requise"; body = "Claude Code demande votre autorisation" }
    Notification      = @{ title = "Claude Code"; body = "Claude Code requiert votre attention" }
}

$msg = $config[$Event]
if (-not $msg) { $msg = $config["Stop"] }

try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
        [Windows.UI.Notifications.ToastTemplateType]::ToastText02
    )
    $nodes = $template.GetElementsByTagName("text")
    $nodes.Item(0).AppendChild($template.CreateTextNode($msg.title)) | Out-Null
    $nodes.Item(1).AppendChild($template.CreateTextNode($msg.body))  | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
    ).Show($toast)
} catch {
    [System.Media.SystemSounds]::Beep.Play()
}
