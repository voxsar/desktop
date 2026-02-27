# Script to automatically resolve merge conflicts by accepting HEAD version

$files = git grep -l "<<<<<<< HEAD"

foreach ($file in $files) {
    Write-Host "Fixing conflicts in $file"
    
    $content = Get-Content $file -Raw
    
    # Pattern to match conflict markers and remove them, keeping HEAD version
    # This matches: <<<<<<< HEAD\n...content...\n=======\n...content...\n>>>>>>> hash
    $pattern = '<<<<<<< HEAD\r?\n((?:(?!>>>>>>>).)*?)\r?\n=======\r?\n(?:(?!>>>>>>>).)*?\r?\n>>>>>>> [^\r\n]+'
    
    $fixed = [regex]::Replace($content, $pattern, '$1', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    
    # Write the fixed content back
    Set-Content -Path $file -Value $fixed -NoNewline
}

Write-Host "Fixed conflicts in $($files.Count) files"
