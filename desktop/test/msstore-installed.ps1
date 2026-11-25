# Checks of the installed Microsoft Store (MSIX) package that need package identity, so they launch
# Sealworks the way Windows does (Start / "Open with": IApplicationActivationManager) instead of by
# path, and never use a test home: the app's real data store is used, so run this only on a
# throwaway machine (CI). .github/workflows/msstore.yml runs it after test/smoke.mjs.
#
#   pwsh test/msstore-installed.ps1 -IdentityName <Package/Identity/Name> -Out test/out [-UpdateAppx <newer .appx>]
#
# 1. "Open with" a PDF -> the app starts with package identity and opens it; a second "Open with"
#    while it runs reaches the same window (single instance + argv)
# 2. data goes to %LOCALAPPDATA%\Packages\<family>\LocalState\PDF Editor; the real %APPDATA%\PDF Editor
#    (an NSIS user's store, created here first) is left untouched and nothing is redirected to LocalCache
# 3. the data survives a relaunch, an update to -UpdateAppx and is removed with the package (uninstall)
# 4. .pdf: listed in "Open with" (OpenWithProgids), not made the default
param(
  [Parameter(Mandatory)] [string] $IdentityName,
  [Parameter(Mandatory)] [string] $Out,
  [string] $UpdateAppx,
  [string] $AppId = "Sealworks"
)
$ErrorActionPreference = "Stop"
$failures = 0
function Check([string] $name, [bool] $ok, [string] $detail = "") {
  if ($ok) { Write-Host "ok   $name$(if ($detail) { " — $detail" })" }
  else { Write-Host "FAIL $name$(if ($detail) { " — $detail" })"; $script:failures++ }
}

Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class PkgLaunch {
  [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, int options, out uint processId);
    [PreserveSig] int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr itemArray, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
    [PreserveSig] int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr itemArray, out uint processId);
  }
  [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
  class ApplicationActivationManager { }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  static extern int SHCreateItemFromParsingName(string path, IntPtr pbc, ref Guid riid, out IntPtr ppv);
  [DllImport("shell32.dll")]
  static extern int SHCreateShellItemArrayFromShellItem(IntPtr psi, ref Guid riid, out IntPtr ppv);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  static extern int GetPackageFullName(IntPtr hProcess, ref uint length, StringBuilder name);

  public static uint Launch(string aumid, string args) {
    var m = (IApplicationActivationManager)new ApplicationActivationManager();
    uint pid;
    int hr = m.ActivateApplication(aumid, args, 0, out pid);
    if (hr != 0) throw new COMException("ActivateApplication failed: 0x" + hr.ToString("X8"), hr);
    return pid;
  }
  public static uint OpenWith(string aumid, string file) {
    Guid iidItem = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
    Guid iidArray = new Guid("b63ea76d-1f85-456f-a19c-48159efa858b");
    IntPtr item, array;
    int hr = SHCreateItemFromParsingName(file, IntPtr.Zero, ref iidItem, out item);
    if (hr != 0) throw new COMException("SHCreateItemFromParsingName " + file, hr);
    hr = SHCreateShellItemArrayFromShellItem(item, ref iidArray, out array);
    Marshal.Release(item);
    if (hr != 0) throw new COMException("SHCreateShellItemArrayFromShellItem", hr);
    try {
      var m = (IApplicationActivationManager)new ApplicationActivationManager();
      uint pid;
      hr = m.ActivateForFile(aumid, array, "open", out pid);
      if (hr != 0) throw new COMException("ActivateForFile failed: 0x" + hr.ToString("X8"), hr);
      return pid;
    } finally { Marshal.Release(array); }
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct SHELLEXECUTEINFO {
    public int cbSize; public uint fMask; public IntPtr hwnd;
    public string lpVerb; public string lpFile; public string lpParameters; public string lpDirectory;
    public int nShow; public IntPtr hInstApp; public IntPtr lpIDList; public string lpClass;
    public IntPtr hkeyClass; public uint dwHotKey; public IntPtr hIconOrMonitor; public IntPtr hProcess;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool ShellExecuteEx(ref SHELLEXECUTEINFO info);
  // what Explorer does when the user picks the app in "Open with": the file with the app's ProgID
  public static void OpenWithProgId(string progId, string file) {
    var info = new SHELLEXECUTEINFO();
    info.cbSize = Marshal.SizeOf(typeof(SHELLEXECUTEINFO));
    info.fMask = 0x1 | 0x400; // SEE_MASK_CLASSNAME | SEE_MASK_FLAG_NO_UI
    info.lpVerb = "open"; info.lpFile = file; info.lpClass = progId; info.nShow = 1;
    if (!ShellExecuteEx(ref info)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "ShellExecuteEx " + progId);
  }
  // the package full name of a running process, or null without package identity
  public static string PackageOf(uint pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return "(OpenProcess failed: " + Marshal.GetLastWin32Error() + ")";
    try {
      uint len = 0;
      int r = GetPackageFullName(h, ref len, null);
      if (r == 15700) return null; // APPMODEL_ERROR_NO_PACKAGE
      var sb = new StringBuilder((int)len + 1);
      r = GetPackageFullName(h, ref len, sb);
      return r == 0 ? sb.ToString() : "(GetPackageFullName error " + r + ")";
    } finally { CloseHandle(h); }
  }
}
"@

New-Item -ItemType Directory -Force -Path $Out | Out-Null
function Shot([string] $name) {
  try {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $Out "$name.png"))
    $g.Dispose(); $bmp.Dispose()
  } catch { Write-Host "note: screenshot $name skipped: $_" }
}
function Sealworks-Processes { @(Get-Process -Name Sealworks -ErrorAction SilentlyContinue) }
# the browser (main) process owns the window; renderer/GPU helpers have the same exe name
function Main-Window([int] $timeoutSec = 60) {
  $until = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $until) {
    $w = Sealworks-Processes | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($w) { return $w }
    Start-Sleep -Milliseconds 500
  }
  return $null
}
function Close-App([int] $timeoutSec = 30) {
  $w = Main-Window 5
  if ($w) { [void] $w.CloseMainWindow() }
  $until = (Get-Date).AddSeconds($timeoutSec)
  while ((Sealworks-Processes).Count -gt 0 -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
  $left = Sealworks-Processes
  if ($left.Count) { Write-Host "note: force-stopping $($left.Count) Sealworks process(es)"; $left | Stop-Process -Force; return $false }
  return $true
}
function Hash-Tree([string] $dir) {
  if (-not (Test-Path $dir)) { return "(missing)" }
  (Get-ChildItem -Recurse -File $dir | Sort-Object FullName | ForEach-Object { "$($_.FullName.Substring($dir.Length))=$((Get-FileHash $_.FullName).Hash)" }) -join "`n"
}

# Open with: IApplicationActivationManager.ActivateForFile, else ShellExecuteEx with the package's ProgID
function Open-With([string] $file) {
  try { [void] [PkgLaunch]::OpenWith($aumid, $file); return "ActivateForFile" }
  catch { Write-Host "note: $($_.Exception.InnerException.Message ?? $_.Exception.Message); using the ProgID" }
  [PkgLaunch]::OpenWithProgId($script:progid, $file); return "ShellExecuteEx($script:progid)"
}
# Start menu: ActivateApplication, else shell:AppsFolder\<AUMID> through Explorer
function Launch-App {
  try { [void] [PkgLaunch]::Launch($aumid, ""); return "ActivateApplication" }
  catch { Write-Host "note: $($_.Exception.InnerException.Message ?? $_.Exception.Message); using shell:AppsFolder" }
  Start-Process explorer.exe "shell:AppsFolder\$aumid"; return "shell:AppsFolder"
}
function Identity-Of($w) { if ($w) { [PkgLaunch]::PackageOf([uint32] $w.Id) } else { "(no window)" } }

$pkg = Get-AppxPackage -Name $IdentityName
if (-not $pkg) { throw "package $IdentityName is not installed" }
$pfn = $pkg.PackageFamilyName
$aumid = "$pfn!$AppId"
$pkgDir = Join-Path $env:LOCALAPPDATA "Packages\$pfn"
$store = Join-Path $pkgDir "LocalState\PDF Editor"
$redirected = Join-Path $pkgDir "LocalCache\Roaming\PDF Editor"
$real = Join-Path $env:APPDATA "PDF Editor"
Write-Host "package $($pkg.PackageFullName) at $($pkg.InstallLocation)`nAUMID   $aumid`nstore   $store"
Check "package data folder created at registration" (Test-Path $pkgDir) ((Get-ChildItem $pkgDir -ErrorAction SilentlyContinue | ForEach-Object Name) -join " ")

# ---- .pdf registration: in "Open with", not the default ----
$progids = @((Get-Item "HKCU:\Software\Classes\.pdf\OpenWithProgids" -ErrorAction SilentlyContinue).Property | Where-Object { $_ -like "AppX*" })
$ours = @($progids | Where-Object { (Get-ItemProperty "HKCU:\Software\Classes\$_\Application" -ErrorAction SilentlyContinue).AppUserModelID -eq $aumid })
Check ".pdf: the package's ProgID is in OpenWithProgids" ($ours.Count -eq 1) ($ours -join " ")
$progid = $ours | Select-Object -First 1
$choice = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice" -ErrorAction SilentlyContinue).ProgId
Check ".pdf: not made the default (UserChoice)" (-not ($ours -contains $choice)) "UserChoice=$(if ($choice) { $choice } else { '(none)' })"

# ---- an NSIS user's store in the real %APPDATA% (must stay untouched) ----
New-Item -ItemType Directory -Force -Path $real | Out-Null
Set-Content -Path (Join-Path $real "nsis-marker.txt") -Value "left by the NSIS build" -NoNewline
Set-Content -Path (Join-Path $real "documents.json") -Value "[]" -NoNewline
$realBefore = Hash-Tree $real

# ---- 1. Open with (app not running): identity, the file reaches the page ----
$work = Join-Path $env:RUNNER_TEMP "msstore-open"
if (-not $env:RUNNER_TEMP) { $work = Join-Path ([IO.Path]::GetTempPath()) "msstore-open" }
New-Item -ItemType Directory -Force -Path $work | Out-Null
$src = Get-ChildItem (Join-Path $PSScriptRoot "out") -Filter "sealed-win32.pdf" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $src) { $src = Get-ChildItem (Join-Path $PSScriptRoot "fixtures") -Filter *.pdf | Select-Object -First 1 }
$pdfs = @{}
foreach ($n in "first", "second", "third") { $pdfs[$n] = Join-Path $work "opened-with-$n.pdf"; Copy-Item $src.FullName $pdfs[$n] -Force }
$docsFile = Join-Path $store "documents.json"
# the page writes its records ~0.5 s after a change; it keeps one record for a PDF that was only opened
function Docs { if (Test-Path $docsFile) { Get-Content -Raw $docsFile } else { "" } }

$how = Open-With $pdfs.first
$w = Main-Window 90
Check "Open with: Sealworks started (window shown)" ($null -ne $w) "$how, pid $($w.Id)"
$identity = Identity-Of $w
Check "Open with: the process runs with package identity" ($identity -eq $pkg.PackageFullName) "$identity"
Start-Sleep -Seconds 8
Check "Open with: the page opened the PDF (its record is written)" ((Docs).Contains("opened-with-first.pdf")) "$((Docs).Length) bytes"
Shot "msstore-open-with-first"
$clean = Close-App
Check "closes cleanly (window close -> quit)" $clean
Check "data store in the package's LocalState" ((Test-Path $docsFile) -and (Test-Path (Join-Path $store ".electron"))) ((Get-ChildItem $store -Force -ErrorAction SilentlyContinue | ForEach-Object Name) -join " ")
Check "nothing redirected to LocalCache\Roaming" (-not (Test-Path $redirected)) $redirected
Check "the real %APPDATA%\PDF Editor (NSIS store) is untouched" ((Hash-Tree $real) -eq $realBefore)

# ---- 2. Start, then Start / Open with / a PDF argument while it runs: one window gets them ----
$how = Launch-App
$w = Main-Window 90
$identity = Identity-Of $w
Check "launch from Start (AUMID): window shown, package identity, data kept" (($null -ne $w) -and ($identity -eq $pkg.PackageFullName) -and (Docs).Contains("opened-with-first.pdf")) "$how, $identity"
Start-Sleep -Seconds 6
Shot "msstore-relaunch"
[void] $w.Handle # keep a handle so the exit code can be read if it ends
# -> @(one window, the first process still runs, the page got the file)
function While-Running([scriptblock] $act, [string] $expect) {
  $how = & $act
  Start-Sleep -Seconds 8
  $mains = @(Sealworks-Processes | Where-Object { $_.MainWindowHandle -ne 0 })
  $alive = [bool] (Get-Process -Id $w.Id -ErrorAction SilentlyContinue)
  $got = if ($expect) { (Docs).Contains($expect) } else { $true }
  @(($mains.Count -eq 1), $alive, $got, "$how, windows: $($mains.Count), first alive: $alive$(if (-not $alive) { " (exit code $($w.ExitCode))" }), page got it: $got")
}
$r = While-Running { Launch-App } $null
Check "Start while running: the running window comes forward (single instance)" ($r[0] -and $r[1]) $r[3]
# a new process with the file (what Windows starts for a file activation), handed to the running window
$r = While-Running { [void] [PkgLaunch]::Launch($aumid, "`"$($pdfs.second)`""); "ActivateApplication(file)" } "opened-with-second.pdf"
Check "a PDF activation while running: the running window opens it (single instance)" ($r[0] -and $r[1] -and $r[2]) $r[3]
Shot "msstore-while-running"
# Explorer's Open with through the ProgID while running: on the CI runner (built-in administrator, where
# ActivateForFile is refused with 0x80270254) Windows ends the running instance (exit code 1, before the
# new process starts) and the new one opens the file; reported, not failed: check on a regular account
$r = While-Running { Open-With $pdfs.third } "opened-with-third.pdf"
Check "Open with while running: the PDF opens" ($r[0] -and $r[2]) $r[3]
if (-not $r[1]) { Write-Host "::warning title=MSIX Open with while running::the running instance was ended by Windows and restarted with the file ($($r[3])); check on a regular (non built-in administrator) account" }
[void] (Close-App)
Check "after a relaunch: documents.json kept" ((Docs).Contains("opened-with-third.pdf"))

# ---- update: data kept ----
if ($UpdateAppx) {
  $storeBefore = Hash-Tree $store
  Add-AppxPackage -Path $UpdateAppx
  $upd = Get-AppxPackage -Name $IdentityName
  Check "update installed" ([version] $upd.Version -gt [version] $pkg.Version) "$($pkg.Version) -> $($upd.Version)"
  Check "update: the data store is unchanged" ((Test-Path $docsFile) -and ((Hash-Tree $store) -eq $storeBefore))
  $how = Launch-App
  $w = Main-Window 90
  $identity = Identity-Of $w
  Check "update: launches with the new package identity" (($null -ne $w) -and ($identity -eq $upd.PackageFullName)) "$how, $identity"
  Start-Sleep -Seconds 6
  Shot "msstore-after-update"
  [void] (Close-App)
  Check "update: documents.json still has the records after a run" ((Docs).Contains("opened-with-third.pdf"))
  $pkg = $upd
}

# ---- uninstall: the package data goes with it; the real %APPDATA% stays ----
Remove-AppxPackage -Package $pkg.PackageFullName
Start-Sleep -Seconds 3
Check "uninstall: package removed" (-not (Get-AppxPackage -Name $IdentityName))
Check "uninstall: its data folder is removed (LocalState)" (-not (Test-Path $store)) $pkgDir
Check "uninstall: the real %APPDATA%\PDF Editor is still there" ((Hash-Tree $real) -eq $realBefore)

if ($failures) { Write-Host "`n$failures check(s) failed"; exit 1 }
Write-Host "`nall installed-package checks passed"
