# Samples the three services' CPU and memory, and Postgres connections and CPU, every 5 s into a
# CSV while a load test runs. Usage: powershell -File scripts/loadtest/monitor.ps1 -Seconds 600
param([int]$Seconds = 600, [string]$Out = "scripts/loadtest/results/monitor.csv")

$ports = @{ auth = 4001; user = 4002; org = 4003 }
$pids = @{}
foreach ($name in $ports.Keys) {
  $pids[$name] = (Get-NetTCPConnection -LocalPort $ports[$name] -State Listen | Select-Object -First 1).OwningProcess
}
$cores = (Get-CimInstance Win32_Processor | Measure-Object NumberOfLogicalProcessors -Sum).Sum
$last = @{}
foreach ($name in $pids.Keys) { $last[$name] = (Get-Process -Id $pids[$name]).TotalProcessorTime.TotalSeconds }

New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null
"t,auth_cpu,auth_mb,user_cpu,user_mb,org_cpu,org_mb,pg_conns,pg_active,pg_cpu,free_mb" | Out-File -Encoding utf8 $Out
$start = Get-Date
while (((Get-Date) - $start).TotalSeconds -lt $Seconds) {
  Start-Sleep -Seconds 5
  $row = @([int]((Get-Date) - $start).TotalSeconds)
  foreach ($name in 'auth', 'user', 'org') {
    $p = Get-Process -Id $pids[$name] -ErrorAction SilentlyContinue
    if (-not $p) { $row += 'down', 'down'; continue }
    $cpu = $p.TotalProcessorTime.TotalSeconds
    # % of one core, so 100 = one core flat out (a Node process uses about one).
    $row += [math]::Round(($cpu - $last[$name]) / 5 * 100), [math]::Round($p.WorkingSet64 / 1MB)
    $last[$name] = $cpu
  }
  $pg = docker exec docker-postgres-1 psql -U aahar -d aahar -Atc "select count(*), count(*) filter (where state = 'active') from pg_stat_activity where datname = 'aahar'"
  $row += ($pg -split '\|')
  $row += ((docker stats docker-postgres-1 --no-stream --format '{{.CPUPerc}}') -replace '%', '')
  $row += [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1KB)
  ($row -join ',') | Out-File -Append -Encoding utf8 $Out
}
