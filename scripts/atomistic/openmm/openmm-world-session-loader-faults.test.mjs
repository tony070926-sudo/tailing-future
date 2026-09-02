import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({
  mode: 'off',
  phase: 'idle',
  armAfterVerifier: false,
  verifierArmCount: 0,
  targetPath: null,
  targetFd: null,
  targetOpenCount: 0,
  targetReadCount: 0,
  hitCount: 0,
  shortReadSetupCount: 0,
  closeFailureHitCount: 0,
  replacementBytes: null,
  replacementBackupPath: null,
  capturedBuffers: [],
  overflowProbeBuffers: [],
  fdPaths: new Map(),
}));

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual();

  const wrappedOpenSync = (file, flags, mode) => {
    const descriptor = mode === undefined
      ? actual.openSync(file, flags)
      : actual.openSync(file, flags, mode);
    const absolute = typeof file === 'string' ? file : null;
    fault.fdPaths.set(descriptor, absolute);
    if (fault.phase === 'loader-artifact-read' && absolute === fault.targetPath) {
      fault.targetFd = descriptor;
      fault.targetOpenCount += 1;
    }
    return descriptor;
  };

  const wrappedCloseSync = (descriptor) => {
    const injectCloseFailure = fault.phase === 'loader-artifact-read'
      && descriptor === fault.targetFd
      && fault.fdPaths.get(descriptor) === fault.targetPath
      && fault.closeFailureHitCount === 0
      && (fault.mode === 'close-failure-after-success'
        || fault.mode === 'premature-eof-and-close-failure');
    let result;
    try {
      result = actual.closeSync(descriptor);
    } finally {
      fault.fdPaths.delete(descriptor);
    }
    if (injectCloseFailure) {
      fault.closeFailureHitCount += 1;
      if (fault.mode === 'close-failure-after-success') fault.hitCount += 1;
      throw new Error('injected target descriptor close failure');
    }
    return result;
  };

  const wrappedReadSync = (descriptor, buffer, offset, length, position) => {
    const targetDescriptor = fault.phase === 'loader-artifact-read'
      && descriptor === fault.targetFd
      && fault.fdPaths.get(descriptor) === fault.targetPath;
    if (targetDescriptor
      && Buffer.isBuffer(buffer)
      && buffer.byteLength === 1
      && fault.mode === 'append-overflow'
      && fault.hitCount === 0) {
      fault.targetReadCount += 1;
      fault.overflowProbeBuffers.push(buffer);
      actual.appendFileSync(fault.targetPath, Buffer.from([0xa5]));
      fault.hitCount += 1;
      return actual.readSync(descriptor, buffer, offset, length, position);
    }
    const exactTarget = targetDescriptor
      && Buffer.isBuffer(buffer)
      && buffer.byteLength > 1;
    if (!exactTarget) {
      return actual.readSync(descriptor, buffer, offset, length, position);
    }

    fault.targetReadCount += 1;
    if (!fault.capturedBuffers.includes(buffer)) fault.capturedBuffers.push(buffer);

    if (fault.mode === 'recoverable-short-read' && fault.hitCount === 0) {
      fault.hitCount += 1;
      return actual.readSync(
        descriptor,
        buffer,
        offset,
        Math.min(length, 4_096),
        position,
      );
    }

    if (fault.mode === 'premature-eof'
      || fault.mode === 'premature-eof-and-close-failure') {
      if (fault.shortReadSetupCount === 0) {
        fault.shortReadSetupCount += 1;
        return actual.readSync(
          descriptor,
          buffer,
          offset,
          Math.min(length, 4_096),
          position,
        );
      }
      if (fault.hitCount === 0) {
        fault.hitCount += 1;
        return 0;
      }
    }

    if (fault.mode === 'replace-path' && fault.hitCount === 0) {
      const count = actual.readSync(descriptor, buffer, offset, length, position);
      if (count > 0) {
        actual.renameSync(fault.targetPath, fault.replacementBackupPath);
        actual.writeFileSync(fault.targetPath, fault.replacementBytes, { flag: 'wx' });
        fault.hitCount += 1;
      }
      return count;
    }

    if (fault.mode === 'corrupt-captured-buffer' && fault.hitCount === 0) {
      const count = actual.readSync(descriptor, buffer, offset, length, position);
      if (count > 0) {
        buffer[offset] ^= 1;
        fault.hitCount += 1;
      }
      return count;
    }

    return actual.readSync(descriptor, buffer, offset, length, position);
  };

  return {
    ...actual,
    closeSync: wrappedCloseSync,
    openSync: wrappedOpenSync,
    readSync: wrappedReadSync,
  };
});

vi.mock('./verify-control.mjs', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    verifyOpenMmTip3pArtifactDirectory: async (...arguments_) => {
      const receipt = await actual.verifyOpenMmTip3pArtifactDirectory(...arguments_);
      if (fault.armAfterVerifier) {
        fault.armAfterVerifier = false;
        fault.phase = 'loader-artifact-read';
        fault.verifierArmCount += 1;
      }
      return receipt;
    },
  };
});

import {
  getOpenMmTip3pPresentationFrameHandleV046,
  loadOpenMmTip3pPresentationFrameV046,
  revokeOpenMmTip3pPresentationFrameV046,
} from '../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import { canonicalJson } from '../runtime-input-contract.mjs';
import {
  SOURCE_REVISION,
  makeProducerDirectory,
  verifyDirectory,
} from './openmm-tip3p-producer-directory-fixture.test-support.mjs';

const temporaryRoots = [];

afterEach(() => {
  resetFault();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('OpenMM private loader deterministic filesystem fault seam', () => {
  it('retries one recoverable short read and leaves the seam uncontaminated', async () => {
    const fixture = await makeLoaderFixture();
    armFault('recoverable-short-read', fixture.positionsPath);

    const materialization = await loadPresentation(fixture, 'fault-short-read');

    expectOneExactFault(fixture.positionsPath);
    expect(fault.targetReadCount).toBeGreaterThan(1);
    expectCapturedBuffersZeroized();
    const handle = getOpenMmTip3pPresentationFrameHandleV046(materialization);
    expect(handle.metadata.binding.frameOrdinal).toBe(37);
    revokeOpenMmTip3pPresentationFrameV046(materialization);

    await expectCleanRetry(fixture, 'fault-short-read-clean-retry');
  }, 120_000);

  it('rejects one premature EOF without returning a partial capability and zeroizes bytes', async () => {
    const fixture = await makeLoaderFixture();
    armFault('premature-eof', fixture.positionsPath);

    const { failure, materialization } = await captureFailure(
      fixture,
      'fault-premature-eof',
    );

    expect(materialization).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/ended during its second read/);
    expectOneExactFault(fixture.positionsPath);
    expect(fault.shortReadSetupCount).toBe(1);
    expectCapturedBuffersZeroized();

    await expectCleanRetry(fixture, 'fault-premature-eof-clean-retry');
  }, 120_000);

  it('detects one path replacement during the second read and zeroizes bytes', async () => {
    const fixture = await makeLoaderFixture();
    const backupPath = fixture.positionsPath + '.fault-original';
    armFault('replace-path', fixture.positionsPath, {
      replacementBackupPath: backupPath,
      replacementBytes: readFileSync(fixture.positionsPath),
    });

    const { failure, materialization } = await captureFailure(
      fixture,
      'fault-path-replacement',
    );

    expect(materialization).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/changed during its second read/);
    expectOneExactFault(fixture.positionsPath);
    expectCapturedBuffersZeroized();

    disableFault();
    rmSync(fixture.positionsPath);
    renameSync(backupPath, fixture.positionsPath);
    await expectCleanRetry(fixture, 'fault-path-replacement-clean-retry');
  }, 120_000);

  it('zeroizes a captured artifact when a late digest validation rejects it', async () => {
    const fixture = await makeLoaderFixture();
    armFault('corrupt-captured-buffer', fixture.positionsPath);

    const { failure, materialization } = await captureFailure(
      fixture,
      'fault-buffer-corruption',
    );

    expect(materialization).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/bytes differ from its manifest descriptor/);
    expectOneExactFault(fixture.positionsPath);
    expectCapturedBuffersZeroized();

    await expectCleanRetry(fixture, 'fault-buffer-corruption-clean-retry');
  }, 120_000);

  it('zeroizes a successful read when descriptor close fails before handoff', async () => {
    const fixture = await makeLoaderFixture();
    armFault('close-failure-after-success', fixture.positionsPath);

    const { failure, materialization } = await captureFailure(
      fixture,
      'fault-close-after-success',
    );

    expect(materialization).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/descriptor close failed/);
    expect(failure.cause).toBeInstanceOf(Error);
    expect(failure.cause.message).toMatch(/injected target descriptor close failure/);
    expectOneExactFault(fixture.positionsPath);
    expect(fault.closeFailureHitCount).toBe(1);
    expectCapturedBuffersZeroized();

    await expectCleanRetry(fixture, 'fault-close-after-success-clean-retry');
  }, 120_000);

  it('preserves both premature EOF and close failures while zeroizing bytes', async () => {
    const fixture = await makeLoaderFixture();
    armFault('premature-eof-and-close-failure', fixture.positionsPath);

    const { failure, materialization } = await captureFailure(
      fixture,
      'fault-eof-and-close',
    );

    expect(materialization).toBeUndefined();
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.message).toMatch(/read failed and descriptor close also failed/);
    expect(failure.errors).toHaveLength(2);
    expect(failure.errors[0].message).toMatch(/ended during its second read/);
    expect(failure.errors[1].message).toMatch(/injected target descriptor close failure/);
    expect(failure.cause).toBe(failure.errors[0]);
    expectOneExactFault(fixture.positionsPath);
    expect(fault.shortReadSetupCount).toBe(1);
    expect(fault.closeFailureHitCount).toBe(1);
    expectCapturedBuffersZeroized();

    await expectCleanRetry(fixture, 'fault-eof-and-close-clean-retry');
  }, 120_000);

  it('zeroizes the overflow probe and main buffer after a one-byte append', async () => {
    const fixture = await makeLoaderFixture();
    const originalBytes = readFileSync(fixture.positionsPath);
    armFault('append-overflow', fixture.positionsPath);

    const { failure, materialization } = await captureFailure(
      fixture,
      'fault-one-byte-append',
    );

    expect(materialization).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/exceeded its verified size/);
    expectOneExactFault(fixture.positionsPath);
    expect(fault.overflowProbeBuffers).toHaveLength(1);
    expect(fault.overflowProbeBuffers[0]).toEqual(Buffer.from([0]));
    expectCapturedBuffersZeroized();

    disableFault();
    writeFileSync(fixture.positionsPath, originalBytes);
    await expectCleanRetry(fixture, 'fault-one-byte-append-clean-retry');
  }, 120_000);

  it('zeroizes an independent receipt buffer when its post-verifier read changes', async () => {
    const fixture = await makeLoaderFixture();
    armFault('corrupt-captured-buffer', fixture.receiptPath);

    const { failure, materialization } = await captureFailure(
      fixture,
      'fault-receipt-corruption',
    );

    expect(materialization).toBeUndefined();
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/receipt changed across live verification/);
    expectOneExactFault(fixture.receiptPath);
    expectCapturedBuffersZeroized();

    await expectCleanRetry(fixture, 'fault-receipt-corruption-clean-retry');
  }, 120_000);
});

async function makeLoaderFixture() {
  const producer = makeProducerDirectory();
  temporaryRoots.push(producer.root);
  const receipt = await verifyDirectory(producer.root);
  const receiptRoot = realpathSync(mkdtempSync(path.join(
    tmpdir(),
    'tf-openmm-loader-fault-receipt-',
  )));
  temporaryRoots.push(receiptRoot);
  const receiptPath = path.join(receiptRoot, 'independent-control-receipt.json');
  writeFileSync(receiptPath, canonicalJson(receipt) + '\n', {
    encoding: 'ascii',
    flag: 'wx',
  });
  return {
    artifactRoot: producer.root,
    positionsPath: path.join(
      producer.root,
      'arrays/reference-a-positions.f64le',
    ),
    receiptPath,
  };
}

function armFault(mode, targetPath, {
  replacementBackupPath = null,
  replacementBytes = null,
} = {}) {
  resetFault();
  fault.mode = mode;
  fault.phase = 'waiting-for-verifier';
  fault.armAfterVerifier = true;
  fault.targetPath = targetPath;
  fault.replacementBackupPath = replacementBackupPath;
  fault.replacementBytes = replacementBytes;
}

function disableFault() {
  fault.mode = 'off';
  fault.phase = 'idle';
  fault.armAfterVerifier = false;
}

function resetFault() {
  disableFault();
  fault.verifierArmCount = 0;
  fault.targetPath = null;
  fault.targetFd = null;
  fault.targetOpenCount = 0;
  fault.targetReadCount = 0;
  fault.hitCount = 0;
  fault.shortReadSetupCount = 0;
  fault.closeFailureHitCount = 0;
  fault.replacementBytes = null;
  fault.replacementBackupPath = null;
  fault.capturedBuffers.length = 0;
  fault.overflowProbeBuffers.length = 0;
  fault.fdPaths.clear();
}

function loadPresentation(fixture, sessionId) {
  return loadOpenMmTip3pPresentationFrameV046({
    artifactRoot: fixture.artifactRoot,
    independentControlReceiptPath: fixture.receiptPath,
    expectedSourceRevision: SOURCE_REVISION,
    sessionId,
    frameOrdinal: 37,
  });
}

async function captureFailure(fixture, sessionId) {
  let materialization;
  let failure;
  try {
    materialization = await loadPresentation(fixture, sessionId);
  } catch (caught) {
    failure = caught;
  }
  return { failure, materialization };
}

function expectOneExactFault(targetPath) {
  expect(fault.targetPath).toBe(targetPath);
  expect(fault.verifierArmCount).toBe(1);
  expect(fault.targetOpenCount).toBe(1);
  expect(fault.targetFd).not.toBeNull();
  expect(fault.hitCount).toBe(1);
  expect(fault.capturedBuffers).toHaveLength(1);
  expect(fault.fdPaths.size).toBe(0);
}

function expectCapturedBuffersZeroized() {
  for (const bytes of fault.capturedBuffers) {
    expect(bytes.byteLength).toBeGreaterThan(1);
    expect(bytes.every((byte) => byte === 0)).toBe(true);
  }
}

async function expectCleanRetry(fixture, sessionId) {
  const countsBefore = {
    verifierArmCount: fault.verifierArmCount,
    targetOpenCount: fault.targetOpenCount,
    targetReadCount: fault.targetReadCount,
    hitCount: fault.hitCount,
    closeFailureHitCount: fault.closeFailureHitCount,
  };
  disableFault();
  const materialization = await loadPresentation(fixture, sessionId);
  const handle = getOpenMmTip3pPresentationFrameHandleV046(materialization);
  expect(handle.metadata.binding.frameOrdinal).toBe(37);
  revokeOpenMmTip3pPresentationFrameV046(materialization);
  expect({
    verifierArmCount: fault.verifierArmCount,
    targetOpenCount: fault.targetOpenCount,
    targetReadCount: fault.targetReadCount,
    hitCount: fault.hitCount,
    closeFailureHitCount: fault.closeFailureHitCount,
  }).toEqual(countsBefore);
  expect(fault.fdPaths.size).toBe(0);
}
