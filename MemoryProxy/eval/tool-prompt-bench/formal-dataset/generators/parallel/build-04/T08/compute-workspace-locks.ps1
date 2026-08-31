$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.IO.Compression

$inputPath = Join-Path $PSScriptRoot "input-pack.json"
$outputPath = Join-Path $PSScriptRoot "workspace-locks.json"
$inputPack = Get-Content -Raw -LiteralPath $inputPath | ConvertFrom-Json
$utf8 = [System.Text.UTF8Encoding]::new($false)
$http = [System.Net.Http.HttpClient]::new()

function Get-Sha256Hex([byte[]]$bytes) {
    return [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

$locks = foreach ($project in $inputPack.project_flows) {
    $uri = [Uri]$project.repository_url
    $parts = $uri.AbsolutePath.Trim("/").Split("/")
    if ($parts.Count -ne 2) { throw "unexpected GitHub repository URL: $($project.repository_url)" }
    $archiveUrl = "https://codeload.github.com/$($parts[0])/$($parts[1])/zip/$($project.commit_sha)"
    [byte[]]$archiveBytes = $http.GetByteArrayAsync($archiveUrl).GetAwaiter().GetResult()
    $archiveSha = Get-Sha256Hex $archiveBytes
    $stream = [System.IO.MemoryStream]::new($archiveBytes, $false)
    $zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Read, $false)
    try {
        $records = [System.Collections.Generic.List[object]]::new()
        foreach ($entry in $zip.Entries) {
            if ([string]::IsNullOrEmpty($entry.Name)) { continue }
            $slash = $entry.FullName.IndexOf("/")
            if ($slash -lt 0 -or $slash -eq $entry.FullName.Length - 1) { continue }
            $relativePath = $entry.FullName.Substring($slash + 1)
            $entryStream = $entry.Open()
            try {
                $buffer = [System.IO.MemoryStream]::new()
                $entryStream.CopyTo($buffer)
                [byte[]]$fileBytes = $buffer.ToArray()
            } finally {
                $entryStream.Dispose()
            }
            $records.Add([pscustomobject]@{
                Path = $relativePath
                Length = $fileBytes.LongLength
                Sha256 = Get-Sha256Hex $fileBytes
            })
        }
        $ordered = @($records | Sort-Object -Property @{ Expression = "Path"; Ascending = $true })
        $treeText = [string]::Concat(($ordered | ForEach-Object { "$($_.Path)`0$($_.Length)`0$($_.Sha256)`n" }))
        $manifestText = [string]::Concat(($ordered | ForEach-Object { "$($_.Path)`0$($_.Length)`n" }))
        [pscustomobject]@{
            project_id = $project.project_id
            repository_url = $project.repository_url
            commit_sha = $project.commit_sha
            license = $project.license
            archive_bytes = $archiveBytes.LongLength
            archive_sha256 = $archiveSha
            file_count = $ordered.Count
            tree_sha256 = Get-Sha256Hex ($utf8.GetBytes($treeText))
            file_manifest_sha256 = Get-Sha256Hex ($utf8.GetBytes($manifestText))
        }
    } finally {
        $zip.Dispose()
        $stream.Dispose()
    }
}
$http.Dispose()

$result = [ordered]@{
    schema_version = "task1.workspace_locks.v1"
    team_id = "T08"
    hash_recipe = "tree_sha256 = SHA-256 of UTF-8 sorted '<relative-path>\0<byte-length>\0<file-sha256>\n'; file_manifest_sha256 omits per-file sha; archive_sha256 hashes the GitHub commit zip bytes"
    locks = @($locks)
}
[System.IO.File]::WriteAllText($outputPath, (($result | ConvertTo-Json -Depth 8) + "`n"), $utf8)
$result | ConvertTo-Json -Depth 8
