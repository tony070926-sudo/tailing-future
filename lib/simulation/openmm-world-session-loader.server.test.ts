import {
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getOpenMmTip3pPresentationFrameHandleV046,
  loadOpenMmTip3pPresentationFrameV046,
  loadOpenMmTip3pWorldSessionV045,
  revokeOpenMmTip3pPresentationFrameV046,
} from './openmm-world-session-loader-implementation.server.mjs';

const SOURCE_REVISION = '7'.repeat(40);
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('OpenMM private world-session loader boundary', () => {
  it('uses the framework server-only marker and rejects a client import chain at build time', () => {
    const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
    const facadePath = fileURLToPath(new URL(
      './openmm-world-session-loader.server.ts',
      import.meta.url,
    ));
    const nextBin = path.join(repositoryRoot, 'node_modules/next/dist/bin/next');
    const implementationPath = fileURLToPath(new URL(
      './openmm-world-session-loader-implementation.server.mjs',
      import.meta.url,
    ));
    for (const [label, targetPath] of [
      ['facade', facadePath],
      ['implementation', implementationPath],
    ] as const) {
      expect(readFileSync(targetPath, 'utf8').startsWith("import 'server-only';\n"), label)
        .toBe(true);
      const fixtureRoot = realpathSync(mkdtempSync(path.join(
        repositoryRoot,
        `.tf-openmm-client-${label}-`,
      )));
      temporaryRoots.push(fixtureRoot);
      const appRoot = path.join(fixtureRoot, 'app');
      mkdirSync(appRoot);
      const targetSpecifier = path.relative(appRoot, targetPath).split(path.sep).join('/');
      writeFileSync(path.join(fixtureRoot, 'package.json'), JSON.stringify({
        private: true,
        dependencies: {
          next: '16.3.3',
          react: '19.2.8',
          'react-dom': '19.2.8',
        },
      }), { flag: 'wx' });
      writeFileSync(path.join(appRoot, 'layout.jsx'), [
        'export default function RootLayout({ children }) {',
        '  return <html><body>{children}</body></html>;',
        '}',
        '',
      ].join('\n'), { flag: 'wx' });
      writeFileSync(path.join(appRoot, 'page.jsx'), [
        "'use client';",
        'import {',
        '  getOpenMmTip3pPrivatePositionTrajectoryHandleV048,',
        '  getOpenMmTip3pPresentationFrameHandleV046,',
        '  loadOpenMmTip3pPrivatePositionTrajectoryV048,',
        '  loadOpenMmTip3pPresentationFrameV046,',
        '  loadOpenMmTip3pWorldSessionV045,',
        '  revokeOpenMmTip3pPrivatePositionTrajectoryV048,',
        '  revokeOpenMmTip3pPresentationFrameV046,',
        `} from '${targetSpecifier}';`,
        'export default function Page() {',
        '  return <button onClick={() => {',
        '    void getOpenMmTip3pPrivatePositionTrajectoryHandleV048;',
        '    void getOpenMmTip3pPresentationFrameHandleV046;',
        '    void loadOpenMmTip3pPrivatePositionTrajectoryV048;',
        '    void loadOpenMmTip3pPresentationFrameV046;',
        '    void loadOpenMmTip3pWorldSessionV045;',
        '    void revokeOpenMmTip3pPrivatePositionTrajectoryV048;',
        '    void revokeOpenMmTip3pPresentationFrameV046;',
        '  }}>probe</button>;',
        '}',
        '',
      ].join('\n'), { flag: 'wx' });

      const built = spawnSync(process.execPath, [nextBin, 'build', fixtureRoot], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
        maxBuffer: 8 * 1024 * 1024,
        timeout: 120_000,
      });
      const output = `${built.stdout ?? ''}\n${built.stderr ?? ''}`;
      expect(built.status, `${label}: ${output}`).not.toBe(0);
      expect(output, label).toMatch(/server-only[^\n]*cannot be imported from a Client Component|cannot be imported from a Client Component[^\n]*server-only/i);
    }
  }, 120_000);

  it('rejects decorated or accessor-bearing entry records before filesystem ingestion', async () => {
    const { artifactRoot, receiptPath } = makeEmptyPaths();
    const decorated = {
      artifactRoot,
      independentControlReceiptPath: receiptPath,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'server-session',
      unexpected: true,
    };
    await expect(loadOpenMmTip3pWorldSessionV045(decorated as never)).rejects.toThrow(
      /exactly the locked keys/,
    );

    const accessorInput = {
      artifactRoot,
      independentControlReceiptPath: receiptPath,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'server-session',
    };
    Object.defineProperty(accessorInput, 'sessionId', {
      enumerable: true,
      get: () => 'getter-session',
    });
    await expect(loadOpenMmTip3pWorldSessionV045(accessorInput)).rejects.toThrow(
      /enumerable defined data property/,
    );
  });

  it('rejects presentation proxies, accessors, and invalid ordinals before filesystem ingestion', async () => {
    const { artifactRoot, receiptPath } = makeEmptyPaths();
    const validInput = {
      artifactRoot,
      independentControlReceiptPath: receiptPath,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'server-presentation-session',
      frameOrdinal: 37,
    };
    let proxyTrapCalls = 0;
    const proxied = new Proxy(validInput, {
      get() {
        proxyTrapCalls += 1;
        throw new Error('proxy get trap must not execute');
      },
      ownKeys() {
        proxyTrapCalls += 1;
        throw new Error('proxy ownKeys trap must not execute');
      },
      getOwnPropertyDescriptor() {
        proxyTrapCalls += 1;
        throw new Error('proxy descriptor trap must not execute');
      },
      getPrototypeOf() {
        proxyTrapCalls += 1;
        throw new Error('proxy prototype trap must not execute');
      },
    });
    await expect(loadOpenMmTip3pPresentationFrameV046(proxied)).rejects.toThrow(
      /plain record/,
    );
    expect(proxyTrapCalls).toBe(0);

    let getterCalls = 0;
    const accessorInput = { ...validInput };
    Object.defineProperty(accessorInput, 'frameOrdinal', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 37;
      },
    });
    await expect(loadOpenMmTip3pPresentationFrameV046(accessorInput)).rejects.toThrow(
      /enumerable defined data property/,
    );
    expect(getterCalls).toBe(0);

    for (const frameOrdinal of [-1, 101, 1.5, Number.NaN, -0]) {
      await expect(loadOpenMmTip3pPresentationFrameV046({
        ...validInput,
        frameOrdinal,
      })).rejects.toThrow(/safe integer from 0 through 100/);
    }
    expect(() => getOpenMmTip3pPresentationFrameHandleV046({})).toThrow(
      /requires the original materialization object/,
    );
    expect(() => revokeOpenMmTip3pPresentationFrameV046({})).toThrow(
      /requires the original materialization object/,
    );
  });

  it('requires canonical roots and keeps the independent receipt outside the artifact root', async () => {
    const { artifactRoot, receiptPath } = makeEmptyPaths();
    await expect(loadOpenMmTip3pWorldSessionV045({
      artifactRoot: `${artifactRoot}${path.sep}.`,
      independentControlReceiptPath: receiptPath,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'server-session',
    })).rejects.toThrow(/artifact root must be a normalized absolute path/);

    const insideReceipt = path.join(artifactRoot, 'receipt.json');
    writeFileSync(insideReceipt, '{}\n', { flag: 'wx' });
    await expect(loadOpenMmTip3pWorldSessionV045({
      artifactRoot,
      independentControlReceiptPath: insideReceipt,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'server-session',
    })).rejects.toThrow(/must remain outside/);
  });

  it('rejects symlinked and multiply-linked external receipt files before verification', async () => {
    const { artifactRoot, receiptDirectory, receiptPath } = makeEmptyPaths();
    const symlinkPath = path.join(receiptDirectory, 'receipt-symlink.json');
    symlinkSync(receiptPath, symlinkPath);
    await expect(loadOpenMmTip3pWorldSessionV045({
      artifactRoot,
      independentControlReceiptPath: symlinkPath,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'server-session',
    })).rejects.toThrow(/canonical non-symlink path/);

    const hardlinkPath = path.join(receiptDirectory, 'receipt-hardlink.json');
    linkSync(receiptPath, hardlinkPath);
    await expect(loadOpenMmTip3pWorldSessionV045({
      artifactRoot,
      independentControlReceiptPath: receiptPath,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'server-session',
    })).rejects.toThrow(/single-link regular file/);
  });
});

function makeEmptyPaths() {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-openmm-world-loader-')));
  temporaryRoots.push(parent);
  const artifactRoot = path.join(parent, 'artifacts');
  const receiptDirectory = path.join(parent, 'receipt');
  mkdirSync(artifactRoot);
  mkdirSync(receiptDirectory);
  const receiptPath = path.join(receiptDirectory, 'receipt.json');
  writeFileSync(receiptPath, '{}\n', { flag: 'wx' });
  return { artifactRoot, receiptDirectory, receiptPath };
}
