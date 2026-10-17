<#
 FI-04-04: Windows CI-only opt-in FFmpeg/FFprobe bootstrap.
 Pinned Gyan Windows 8.1.2 essentials ZIP + immutable SHA-256; fail closed.
 No Chocolatey, no latest redirect, no PATH changes outside this CI job.
 Source: https://www.gyan.dev/ffmpeg/builds/ (previous release SHA-256).
 GPLv3 executable is used only inside the disposable runner, not redistributed.
#>
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest

if (-not $IsWindows) { throw 'FI0404_WINDOWS_ONLY' }
if (-not $env:GITHUB_ACTIONS -or -not $env:RUNNER_TEMP -or -not $env:GITHUB_PATH) {
  throw 'FI0404_HOSTED_CI_ONLY'
}
if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [Runtime.InteropServices.Architecture]::X64) {
  throw 'FI0404_REQUIRES_X64_BINARY'
}

$version='8.1.2'
$url='https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip'
$expected='db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec'
$zip=Join-Path $env:RUNNER_TEMP 'fi0404-ffmpeg-8.1.2.zip'
$root=Join-Path $env:RUNNER_TEMP 'fi0404-media'
try {
  if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
  # Never execute or unpack unverified bytes. This is a pinned third-party build.
  Invoke-WebRequest -Uri $url -OutFile $zip -ErrorAction Stop
  $actual=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -cne $expected) { throw 'FI0404_FFMPEG_SHA256_MISMATCH' }

  Expand-Archive -LiteralPath $zip -DestinationPath $root -ErrorAction Stop
  $bin=Join-Path $root "ffmpeg-$version-essentials_build/bin"
  $ffmpeg=Join-Path $bin 'ffmpeg.exe'
  $ffprobe=Join-Path $bin 'ffprobe.exe'
  if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf) -or
      -not (Test-Path -LiteralPath $ffprobe -PathType Leaf)) {
    throw 'FI0404_FFMPEG_ARCHIVE_LAYOUT_MISMATCH'
  }
  $ffmpegVersion=(& $ffmpeg -version | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or $ffmpegVersion -notmatch 'ffmpeg version 8\.1\.2') {
    throw 'FI0404_FFMPEG_EXECUTABLE_VERSION_MISMATCH'
  }
  $ffprobeVersion=(& $ffprobe -version | Select-Object -First 1)
  if ($LASTEXITCODE -ne 0 -or $ffprobeVersion -notmatch 'ffprobe version 8\.1\.2') {
    throw 'FI0404_FFPROBE_EXECUTABLE_VERSION_MISMATCH'
  }
  # Only subsequent steps within this ephemeral GitHub Actions job see these tools.
  Add-Content -LiteralPath $env:GITHUB_PATH -Value $bin
  Write-Host "FI0404_MEDIA_PREREQS_PASS version=$version sha256=$actual"
} finally {
  if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
}
