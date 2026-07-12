# backup-postgres.ps1
# Daily backup of the myMigo PostgreSQL database on the VPS.
# Run this ON THE VPS (via RDP), not locally — it expects pg_dump to be
# installed there alongside the running Postgres instance.
#
# Setup:
#   1. Adjust the config block below for your actual install path / DB name / DB user.
#   2. Set the PGPASSWORD environment variable for the account running this script
#      (or better: configure a %APPDATA%\postgresql\pgpass.conf file instead of
#      storing the password in plain text anywhere).
#   3. Register this script in Windows Task Scheduler to run once a day
#      (Task Scheduler > Create Task > Trigger: Daily > Action: powershell.exe
#      -File "C:\apps\FriendScape\server\scripts\backup-postgres.ps1").
#   4. IMPORTANT: this only writes backups to local disk on the VPS. That alone
#      does not protect you against VPS failure, disk corruption, or ransomware —
#      copy the backup folder off the VPS on a schedule too (a scheduled robocopy
#      to a mapped network drive, or an upload to cloud storage). Ask if you want
#      help wiring that second step up once you've picked where the copies go.

$ErrorActionPreference = "Stop"

# ---- Config ----
$PgBinPath     = "C:\Program Files\PostgreSQL\16\bin"
$PgHostName    = "127.0.0.1"
$PgPort        = "5432"
$PgUser        = "mymigo"
$PgDatabase    = "mymigo_dev"
$BackupDir     = "C:\Backups\myMigo\postgres"
$RetentionDays = 14

if (-not $env:PGPASSWORD) {
  Write-Error "PGPASSWORD environment variable not set. Set it, or configure a pgpass.conf file instead of hardcoding a password here."
  exit 1
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp  = Get-Date -Format "yyyy-MM-dd_HHmm"
$backupFile = Join-Path $BackupDir "migo_$timestamp.backup"

& "$PgBinPath\pg_dump.exe" -h $PgHostName -p $PgPort -U $PgUser -F c -f $backupFile $PgDatabase

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE"
  exit 1
}

Write-Output "Backup created: $backupFile"

# Delete local backups older than the retention window
Get-ChildItem -Path $BackupDir -Filter "migo_*.backup" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  Remove-Item -Force

Write-Output "Old backups older than $RetentionDays days removed."
