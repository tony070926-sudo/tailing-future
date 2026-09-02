/**
 * Exact Chromium acquisition/runtime lock for the V049 private WebGL2 harness.
 *
 * The Linux archive and distribution-tree digests were computed from the
 * Chrome-for-Testing object selected by Playwright 1.62.1. The Playwright CDN
 * address is discovery provenance only because it redirects; acquisition uses
 * the generation-pinned Google Cloud Storage object and still verifies size
 * and SHA-256. This lock identifies the distributed browser tree, not the
 * runner's system-library, font, kernel, Node.js, or graphics-driver closure.
 * The macOS entry binds the local Chromium used for developer-side evidence
 * only.
 */
export const PRIVATE_CHROMIUM_LOCK_V049 = deepFreeze({
  schemaVersion: 'tf.private-chromium-runtime-lock/0.4.9',
  playwrightVersion: '1.62.1',
  npmPackageLockBindings: {
    playwright: {
      packagePath: 'node_modules/playwright',
      packageName: 'playwright',
      resolved:
        'https://registry.npmjs.org/playwright/-/playwright-1.62.1.tgz',
      integrity:
        'sha512-0M+L3LAD8/nm554LOla9Ayx0j0tmFZ0FBcoQ7F1VuVHpM/XpiC8RcDzBQB8W5+hA8L22THxELzeF+2WcUzvcLg==',
      tarballByteLength: 895_775,
      tarballSha256:
        'sha256:1982556a882b246ccb7c16337fab5e4e790292b69f835a2db1011dddc440ed98',
      ownPackageTree: {
        schemaVersion: 'tf.npm-package-content-tree/1',
        digest:
          'sha256:5981dbf5b0604778dfe94c03564da904f13ba2289340fd1f695211922de1dc3f',
        digestProtocol:
          'canonical-json-plus-lf-over-root-stripped-regular-path-mode-size-and-content-digest',
        regularFileCount: 62,
        expandedByteLength: 5_074_152,
        unixModeCounts: { '100644': 61, '100755': 1 },
        symlinkHardlinkOrSpecialCount: 0,
      },
    },
    playwrightCore: {
      packagePath: 'node_modules/playwright-core',
      packageName: 'playwright-core',
      resolved:
        'https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.1.tgz',
      integrity:
        'sha512-wPYSwEBJY9GHraISXqyqtx0na0LpO3XEX7jNDhntbex7tzUS7kLnZsOlFruFJB4Hi/rhDMjXGqHewDZ68nYZVw==',
      tarballByteLength: 3_070_300,
      tarballSha256:
        'sha256:954be1e183d0ddb9748fe0d2d08b0b66a9210c74dd75c397aeb70303b9f08a00',
      ownPackageTree: {
        schemaVersion: 'tf.npm-package-content-tree/1',
        digest:
          'sha256:c3d1a9f4d8c8a2f5251c323aa3a4cb4202ba86f7ba4ff6330c1fa0e634f7c357',
        digestProtocol:
          'canonical-json-plus-lf-over-root-stripped-regular-path-mode-size-and-content-digest',
        regularFileCount: 111,
        expandedByteLength: 13_442_086,
        unixModeCounts: { '100644': 98, '100755': 13 },
        symlinkHardlinkOrSpecialCount: 0,
      },
      browsersJsonSha256:
        'sha256:f306eed529599b1eaf2f8a85db9de2b23e1a3fe36c2b66434b7c9434fb627a99',
    },
  },
  chromiumRevision: '1234',
  browserVersion: '151.0.7922.34',
  platforms: {
    'linux-x64': {
      archiveDiscoveryUrl:
        'https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-linux64.zip',
      archiveUrl:
        'https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.34/linux64/chrome-linux64.zip?generation=1784092744255039',
      archiveObjectGeneration: '1784092744255039',
      archiveByteLength: 193_282_658,
      archiveSha256:
        'sha256:ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8',
      archiveStructure: {
        rootDirectory: 'chrome-linux64',
        memberCount: 308,
        regularFileCount: 303,
        explicitDirectoryCount: 5,
        derivedDirectoryCount: 11,
        runtimeTreeEntryCount: 314,
        expandedByteLength: 406_847_046,
        compressedMemberByteLength: 193_220_360,
        endOfCentralDirectoryOffset: 193_282_636,
        centralDirectoryOffset: 193_249_650,
        centralDirectoryByteLength: 32_986,
        maximumMemberByteLength: 290_614_600,
        maximumPathUtf8Bytes: 83,
        maximumPathComponents: 5,
        compressionMethodCounts: {
          stored: 6,
          deflated: 302,
        },
        generalPurposeFlagCounts: {
          zero: 5,
          four: 303,
        },
        unixModeCounts: {
          '040755': 5,
          '100600': 2,
          '100644': 292,
          '100755': 9,
        },
        maximumPerMemberCompressionRatio: 5,
        maximumAggregateExpandedToArchiveRatio: 3,
        zip64Allowed: false,
        dataDescriptorAllowed: false,
        encryptedMembersAllowed: false,
        symlinksOrSpecialFilesAllowed: false,
        duplicateOrCollidingPathsAllowed: false,
      },
      runtimeTree: {
        schemaVersion: 'tf.private-chromium-runtime-tree/0.4.9',
        digest:
          'sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658',
        digestProtocol:
          'canonical-json-plus-lf-over-root-stripped-path-type-mode-size-and-content-digest',
        regularFileCount: 303,
        directoryCount: 11,
        entryCount: 314,
        executableFiles: [
          {
            path: 'WidevineCdm/_platform_specific/linux_x64/libwidevinecdm.so',
            mode: '100755',
            sizeBytes: 21_681_344,
            sha256:
              'sha256:529de3168220c0a8784e19499bfcb84a3fb47001f2175a53b2e8477ece9e97b5',
          },
          {
            path: 'chrome',
            mode: '100755',
            sizeBytes: 290_614_600,
            sha256:
              'sha256:0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71',
          },
          {
            path: 'chrome-wrapper',
            mode: '100755',
            sizeBytes: 4_510,
            sha256:
              'sha256:24c1cfddcd206a86281008e7eed38109344ef34cd88d61902a9befd520a5571c',
          },
          {
            path: 'chrome_crashpad_handler',
            mode: '100755',
            sizeBytes: 1_943_256,
            sha256:
              'sha256:0aa3f05a2ed9b7ac64148bf975f33ec580307abca1c77e1e562e68dd8e20606f',
          },
          {
            path: 'chrome_sandbox',
            mode: '100755',
            sizeBytes: 15_232,
            sha256:
              'sha256:18391bf9d217ddbde9956347cbb1346d2808a73ade4baa3f88a610447cf946b4',
          },
          {
            path: 'libEGL.so',
            mode: '100755',
            sizeBytes: 226_984,
            sha256:
              'sha256:288fdc8eb36ac724e48b39d63667fbaafc546e34b45355ea9ce37b00045866ed',
          },
          {
            path: 'libGLESv2.so',
            mode: '100755',
            sizeBytes: 226_984,
            sha256:
              'sha256:c244efa3e368b5b93aff102eeb4ca53b9ab182e3b901cb869eb6a29ded7c2ba7',
          },
          {
            path: 'libvk_swiftshader.so',
            mode: '100755',
            sizeBytes: 4_037_592,
            sha256:
              'sha256:4d39038dd6d448a3a6b5cf6aefb583d50346fd75ea8879e2563d67844f460dd0',
          },
          {
            path: 'libvulkan.so.1',
            mode: '100755',
            sizeBytes: 660_576,
            sha256:
              'sha256:33742ba1b7f8ae04a4f9e35f66c343e3789d7d431a396cacc66ec79b579eaf51',
          },
        ],
      },
      frozenRuntimeTree: {
        schemaVersion: 'tf.private-chromium-frozen-runtime-tree/0.4.9',
        digest:
          'sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3',
        digestProtocol:
          'canonical-json-plus-lf-over-distribution-digest-and-root-stripped-frozen-path-type-mode-size-content-digest',
        distributionTreeDigest:
          'sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658',
        ownerUid: 0,
        ownerGid: 0,
        rootAndDirectoryMode: '040555',
        executableFileMode: '100555',
        otherFileMode: '100444',
        preAndPostExecutionVerificationRequired: true,
        hostRuntimeClosureVerified: false,
      },
      executableRelativePath: 'chrome-linux64/chrome',
      executableByteLength: 290_614_600,
      executableSha256:
        'sha256:0b20b130e7edd9dd51873be867761295fe0cfad490c2b9a64f95bd3cfc08fa71',
    },
    'darwin-arm64': {
      executableRelativePath:
        'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      executableByteLength: 52_112,
      executableSha256:
        'sha256:a596b1cfc6353e987fcec8d71a23a28cd6a9e7a6b4e20b908e4c4fcffe51158e',
      evidenceBoundary: 'local-developer-runtime-not-cross-platform-ci-evidence',
    },
  },
  browserDrawRequired: true,
  webgl2Required: true,
  systemChromeFallbackAllowed: false,
  floatingRevisionAllowed: false,
  distributionTreeIdentityOnly: true,
  hostSharedLibraryClosureLocked: false,
  immutableRuntimeSnapshotVerified: false,
  crossPlatformClaim: false,
  screenshotsTracesVideosOrHarPublishable: false,
  executionAuthenticityVerified: false,
  reproduced: false,
  promotionEligible: false,
  publicDistributionEligible: false,
  cloudflareDistributionEligible: false,
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
