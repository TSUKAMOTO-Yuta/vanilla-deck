'use strict';

const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

function electronBinaryPath() {
  const targetPath = process.argv[2];
  if (targetPath) {
    return path.resolve(targetPath);
  }

  return require('electron');
}

function fuseConfig(packaged) {
  return {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: packaged,
    [FuseV1Options.OnlyLoadAppFromAsar]: packaged,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
  };
}

const packaged = process.argv[2] !== undefined;

void flipFuses(electronBinaryPath(), fuseConfig(packaged)).catch((error) => {
  console.error('Failed to harden the Electron executable:', error);
  process.exitCode = 1;
});
