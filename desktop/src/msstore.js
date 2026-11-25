"use strict";
// Microsoft Store build (MSIX/AppX, `npm run dist:msstore`): where the installed package keeps its data.
//
// A packaged desktop app's writes to %APPDATA% are redirected: new files go to the package's
// LocalCache\Roaming, but files that already exist in the real %APPDATA% (the NSIS build's
// "PDF Editor" store) are changed in place. With both builds installed that would split one store
// across two folders, and Explorer (outside the package) can't see the redirected half. So the store
// build keeps everything in its own package folder, %LOCALAPPDATA%\Packages\<family name>\LocalState
// (ApplicationData.LocalFolder): one real folder, kept across updates, removed on uninstall.
//
// The family name comes from the install folder (…\WindowsApps\<package full name>\app\Sealworks.exe,
// full name = <Name>_<Version>_<Arch>_<ResourceId>_<PublisherId>), so a launch without package
// identity (the exe started by path, as the smoke test does) finds the same folder.
const path = require("node:path");

function packageOfExe(exe) {
  if (typeof exe !== "string" || !exe) return null;
  const parts = exe.split(/[\\/]+/);
  const i = parts.findIndex((p) => p.toLowerCase() === "windowsapps");
  // WindowsApps\<full name>\…\<exe>: the full name folder and at least the exe below it
  if (i < 0 || i + 2 >= parts.length) return null;
  const m = /^([A-Za-z0-9.-]{3,50})_(\d+\.\d+\.\d+\.\d+)_([A-Za-z0-9]+)_([^_\\/]*)_([a-z0-9]{13})$/i.exec(parts[i + 1]);
  if (!m) return null;
  return { fullName: parts[i + 1], name: m[1], version: m[2], arch: m[3], resourceId: m[4], publisherId: m[5], familyName: `${m[1]}_${m[5]}` };
}

/** the package's LocalState folder, or null when not running from an installed package */
function packageDataDir({ exe, localAppData, exists }) {
  const pkg = packageOfExe(exe);
  if (!pkg || !localAppData) return null;
  const root = path.win32.join(localAppData, "Packages", pkg.familyName);
  // created when the package is registered for this user; otherwise this isn't our install
  if (typeof exists === "function" && !exists(root)) return null;
  return path.win32.join(root, "LocalState");
}

module.exports = { packageOfExe, packageDataDir };
