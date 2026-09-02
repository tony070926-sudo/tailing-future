import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createAtomisticPrivatePositionTrajectoryFixtureV048,
} from '../../../../lib/simulation/atomistic-private-position-trajectory-v048.test-fixture.ts';
import {
  createAtomisticPrivatePositionTrajectoryControllerV048,
} from '../../../../lib/simulation/atomistic-private-position-trajectory-v048.ts';
import {
  createAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from '../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049-projector.server.ts';
import {
  encodePrivatePositionTrajectoryPacketV049,
} from './private-position-trajectory-envelope-v049.mjs';
import {
  PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_SESSION_TIMEOUT_MS_V049,
  startPrivatePositionTrajectoryLoopbackServerV049,
} from './private-position-trajectory-loopback-server-v049.mjs';

const INDEX_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><style nonce="__TF_PRIVATE_CSP_NONCE__">body{color:white}</style></head>
<body><script nonce="__TF_PRIVATE_CSP_NONCE__" type="module" src="/client.js"></script></body></html>`;
const CLIENT_JAVASCRIPT = 'document.body.dataset.trajectoryClientLoaded = "true";\n';
let canonicalPacket = null;

beforeAll(() => {
  const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048(
    'v049-loopback-transport',
  );
  let controller = null;
  let positionsBytes = null;
  try {
    controller = createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    );
    positionsBytes = controller.handle.copyTrajectoryPositionBytes();
    const trajectoryMetadata = createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
      controller.handle.metadata,
    );
    canonicalPacket = encodePrivatePositionTrajectoryPacketV049({
      trajectoryMetadata,
      positionsBytes,
    });
  } finally {
    if (positionsBytes !== null) positionsBytes.fill(0);
    controller?.revoke();
    for (const frame of fixture.sourceFrames) frame.positionsF64LeBytes.fill(0);
  }
}, 60_000);

afterAll(() => {
  if (canonicalPacket !== null) canonicalPacket.fill(0);
  canonicalPacket = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('V049 private complete-trajectory loopback transport', () => {
  it('keeps a bounded 120 second issuance window for frozen-runtime launch audits', () => {
    expect(PRIVATE_POSITION_TRAJECTORY_SESSION_TIMEOUT_MS_V049).toBe(120_000);
  });

  it('serves exactly one authenticated complete packet and rejects authorized replay', async () => {
    const packet = makePacket();
    const expectedPacket = Buffer.from(packet);
    const transport = await startTransport(packet);
    try {
      expect(packet.every((value) => value === 0)).toBe(true);
      expect(transport.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(transport.exactPacketByteLength)
        .toBe(expectedPacket.byteLength);
      expect(PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049).toBe(3_254_270);
      expect(PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049).toBe(3_319_804);
      expect(new URL(transport.url).origin).toBe(transport.origin);
      expect(new URL(transport.url).pathname).toBe('/');
      expect(new URL(transport.url).search).toBe('');

      const index = await send(transport.origin, '/');
      expect(index.statusCode).toBe(200);
      expect(index.headers['content-security-policy']).toContain("default-src 'none'");
      expect(index.headers['content-security-policy']).toContain("connect-src 'self'");
      expect(index.headers['access-control-allow-origin']).toBeUndefined();
      expect(index.headers.etag).toBeUndefined();
      expect(index.headers['last-modified']).toBeUndefined();
      expect(index.headers['set-cookie']).toBeUndefined();
      expect(index.body.toString('utf8')).not.toContain('__TF_PRIVATE_CSP_NONCE__');

      const client = await send(transport.origin, '/client.js');
      expect(client.statusCode).toBe(200);
      expect(client.body.toString('utf8')).toBe(CLIENT_JAVASCRIPT);

      const token = extractToken(transport.url);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(transport.origin).not.toContain(token);
      const unauthorizedToken = `${token[0] === '0' ? '1' : '0'}${token.slice(1)}`;
      let candidateTokenBuffer = null;
      const originalBufferFrom = Buffer.from;
      vi.spyOn(Buffer, 'from').mockImplementation((...args) => {
        const copy = Reflect.apply(originalBufferFrom, Buffer, args);
        if (args[0] === unauthorizedToken && args[1] === 'hex') candidateTokenBuffer = copy;
        return copy;
      });
      const unauthorized = await sendTrajectory(transport.origin, unauthorizedToken);
      vi.restoreAllMocks();
      expect(unauthorized.statusCode).toBe(404);
      expect(candidateTokenBuffer).not.toBeNull();
      expect(candidateTokenBuffer.every((value) => value === 0)).toBe(true);
      expect(transport.lifecycle().consumed).toBe(false);

      const first = await sendTrajectory(transport.origin, token);
      const replay = await sendTrajectory(transport.origin, token);
      expect(replay.statusCode).toBe(410);
      expect(replay.body.toString('ascii')).toBe('consumed\n');
      const unauthenticatedReplay = await sendTrajectory(transport.origin, unauthorizedToken);
      expect(unauthenticatedReplay.statusCode).toBe(404);
      expect(first.statusCode).toBe(200);
      expect(first.headers['content-type']).toBe('application/octet-stream');
      expect(first.headers['content-length'])
        .toBe(String(expectedPacket.byteLength));
      expect(first.headers['cache-control']).toBe('no-store, max-age=0');
      expect(first.headers['access-control-allow-origin']).toBeUndefined();
      expect(first.headers['x-private-packet-digest']).toBe(transport.packetDigest);
      expect(bytesDigest(first.body)).toBe(bytesDigest(expectedPacket));
      expect(transport.lifecycle()).toMatchObject({
        consumed: true,
        packetZeroized: true,
        tokenSourceBytesZeroized: true,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
        securePhysicalErasureVerified: false,
      });
      first.body.fill(0);
    } finally {
      expectedPacket.fill(0);
      await transport.close();
    }
    expect(transport.lifecycle()).toMatchObject({
      finalized: true,
      listenerClosed: true,
      packetZeroized: true,
      tokenVerifierBytesZeroized: true,
      assetBytesZeroized: true,
      openSocketCount: 0,
      sessionTimerActive: false,
      lingerTimerActive: false,
    });
  }, 15_000);

  it('authenticates before consumption and strictly rejects request-boundary changes', async () => {
    const packet = makePacket();
    const transport = await startTransport(packet);
    try {
      const token = extractToken(transport.url);
      const parsedOrigin = new URL(transport.origin);
      const validHeaders = trajectoryHeaders(transport.origin, token);
      const attempts = [
        send(transport.origin, '/trajectory?frameOrdinal=38', {
          method: 'POST', headers: validHeaders,
        }),
        send(transport.origin, '/frame', { method: 'POST', headers: validHeaders }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: { ...validHeaders, Origin: 'https://example.invalid' },
        }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: withoutHeader(validHeaders, 'Origin'),
        }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: withoutHeader(validHeaders, 'Sec-Fetch-Site'),
        }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: { ...validHeaders, Host: `localhost:${parsedOrigin.port}` },
        }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: { ...validHeaders, Cookie: 'private=1' },
        }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: { ...validHeaders, Referer: `${transport.origin}/` },
        }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: { ...validHeaders, Range: 'bytes=0-1023' },
        }),
        send(transport.origin, '/trajectory', {
          method: 'POST', headers: validHeaders, body: Buffer.from([1]),
        }),
        send(transport.origin, '/trajectory', { method: 'OPTIONS', headers: validHeaders }),
      ];
      const responses = await Promise.all(attempts);
      expect(responses.map((response) => response.statusCode))
        .toEqual([404, 404, 404, 404, 404, 404, 404, 404, 404, 404, 405]);
      expect(transport.lifecycle().consumed).toBe(false);

      const [first, second] = await Promise.all([
        sendTrajectory(transport.origin, token),
        sendTrajectory(transport.origin, token),
      ]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 410]);
      first.body.fill(0);
      second.body.fill(0);
    } finally {
      await transport.close();
    }
  }, 15_000);

  it('rejects path/frame configuration and mismatched or out-of-bound length locks', async () => {
    const withPath = makePacket();
    const expectedWithPath = bytesDigest(withPath);
    await expect(startPrivatePositionTrajectoryLoopbackServerV049({
      ...transportInput(withPath),
      artifactRoot: '/private/artifact',
    })).rejects.toThrow(/must contain exactly/);
    expect(bytesDigest(withPath)).toBe(expectedWithPath);
    withPath.fill(0);

    const withFrame = makePacket();
    const expectedWithFrame = bytesDigest(withFrame);
    await expect(startPrivatePositionTrajectoryLoopbackServerV049({
      ...transportInput(withFrame),
      frameOrdinal: 38,
    })).rejects.toThrow(/must contain exactly/);
    expect(bytesDigest(withFrame)).toBe(expectedWithFrame);
    withFrame.fill(0);

    const mismatch = makePacket();
    const expectedMismatch = bytesDigest(mismatch);
    await expect(startPrivatePositionTrajectoryLoopbackServerV049({
      ...transportInput(mismatch),
      exactPacketByteLength: mismatch.byteLength + 1,
    })).rejects.toThrow(/does not match its exact lock/);
    expect(bytesDigest(mismatch)).toBe(expectedMismatch);
    mismatch.fill(0);

    const aboveMaximum = makePacket();
    const expectedAboveMaximum = bytesDigest(aboveMaximum);
    await expect(startPrivatePositionTrajectoryLoopbackServerV049({
      ...transportInput(aboveMaximum),
      exactPacketByteLength: PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049 + 1,
    })).rejects.toThrow(/outside its fixed bound/);
    expect(bytesDigest(aboveMaximum)).toBe(expectedAboveMaximum);
    aboveMaximum.fill(0);
  });

  it('zeroizes transferred packet storage after a deterministic pre-listen fault', async () => {
    const packet = makePacket();
    let capturedOwnedPacket = null;
    const originalAllocUnsafe = Buffer.allocUnsafe;
    vi.spyOn(Buffer, 'allocUnsafe').mockImplementation((size) => {
      const allocation = Reflect.apply(originalAllocUnsafe, Buffer, [size]);
      if (size === packet.byteLength) {
        capturedOwnedPacket = allocation;
      }
      return allocation;
    });
    await expect(startPrivatePositionTrajectoryLoopbackServerV049({
      ...transportInput(packet),
      clientJavaScript: `${CLIENT_JAVASCRIPT}\u0000`,
    })).rejects.toThrow(/must not contain NUL/);
    vi.restoreAllMocks();

    expect(packet.every((value) => value === 0)).toBe(true);
    expect(capturedOwnedPacket).not.toBeNull();
    expect(capturedOwnedPacket.every((value) => value === 0)).toBe(true);
  });

  it('rejects a digest-invalid full-size packet and zeroizes both transferred copies', async () => {
    const packet = makePacket();
    packet[0] ^= 0xff;
    let capturedOwnedPacket = null;
    const originalAllocUnsafe = Buffer.allocUnsafe;
    vi.spyOn(Buffer, 'allocUnsafe').mockImplementation((size) => {
      const allocation = Reflect.apply(originalAllocUnsafe, Buffer, [size]);
      if (size === packet.byteLength) capturedOwnedPacket = allocation;
      return allocation;
    });
    await expect(startTransport(packet)).rejects.toThrow(/magic is invalid/);
    vi.restoreAllMocks();

    expect(packet.every((value) => value === 0)).toBe(true);
    expect(capturedOwnedPacket).not.toBeNull();
    expect(capturedOwnedPacket.every((value) => value === 0)).toBe(true);
  });

  it('revokes and zeroizes the capability when the single response is aborted', async () => {
    const packet = makePacket();
    const transport = await startTransport(packet);
    const origin = new URL(transport.origin);
    const token = extractToken(transport.url);
    const socket = await openSocket(transport.origin);
    socket.pause();
    socket.write([
      'POST /trajectory HTTP/1.1',
      `Host: ${origin.host}`,
      `Authorization: Bearer ${token}`,
      `Origin: ${transport.origin}`,
      'Sec-Fetch-Site: same-origin',
      'Sec-Fetch-Mode: cors',
      'Sec-Fetch-Dest: empty',
      'Content-Length: 0',
      'Connection: close',
      '',
      '',
    ].join('\r\n'), 'ascii');
    await waitFor(() => transport.lifecycle().consumed);
    const socketClosed = new Promise((resolve) => socket.once('close', resolve));
    socket.destroy();
    await socketClosed;
    await waitFor(() => transport.lifecycle().finalized);
    await transport.close();

    expect(transport.lifecycle()).toMatchObject({
      consumed: true,
      finalized: true,
      listenerClosed: true,
      packetZeroized: true,
      tokenVerifierBytesZeroized: true,
      assetBytesZeroized: true,
      openSocketCount: 0,
      finalReason: 'single-use-response-aborted',
    });
  }, 15_000);

  it('bounds protocol errors and force-closes sockets with idempotent cleanup', async () => {
    const packet = makePacket();
    const transport = await startTransport(packet);
    const origin = new URL(transport.origin);
    const expectContinue = await sendRaw(transport.origin, [
      'POST /trajectory HTTP/1.1',
      `Host: ${origin.host}`,
      'Expect: 100-continue',
      'Content-Length: 1',
      '',
      '',
    ].join('\r\n'));
    expect(expectContinue.toString('ascii')).toMatch(/^HTTP\/1\.1 417 /);
    expect(expectContinue.toString('ascii')).not.toContain('100 Continue');
    await sendRaw(transport.origin, [
      'GET / HTTP/1.1',
      `Host: ${origin.host}`,
      `X-Oversized: ${'a'.repeat(9 * 1024)}`,
      '',
      '',
    ].join('\r\n'));
    expect(transport.lifecycle().consumed).toBe(false);

    const heldSocket = await openSocket(transport.origin);
    heldSocket.write('GET / HTTP/1.1\r\n', 'ascii');
    await waitFor(() => transport.lifecycle().openSocketCount >= 1);
    expect(transport.lifecycle().openSocketCount).toBeGreaterThanOrEqual(1);
    const heldSocketClosed = new Promise((resolve) => heldSocket.once('close', resolve));
    const firstClose = transport.close();
    expect(transport.close()).toBe(firstClose);
    await firstClose;
    await heldSocketClosed;
    expect(heldSocket.destroyed).toBe(true);
    expect(transport.lifecycle()).toMatchObject({
      finalized: true,
      listenerClosed: true,
      packetZeroized: true,
      tokenVerifierBytesZeroized: true,
      assetBytesZeroized: true,
      openSocketCount: 0,
      finalReason: 'controller-close',
    });
  }, 15_000);

  it('times out an unused capability and clears packet, token, assets, timers, and sockets',
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const packet = makePacket();
      const transport = await startTransport(packet);
      expect(transport.lifecycle()).toMatchObject({
        consumed: false,
        sessionTimerActive: true,
        tokenVerifierBytesZeroized: false,
      });

      await vi.advanceTimersByTimeAsync(
        PRIVATE_POSITION_TRAJECTORY_SESSION_TIMEOUT_MS_V049,
      );
      await transport.close();
      expect(transport.lifecycle()).toMatchObject({
        consumed: false,
        finalized: true,
        listenerClosed: true,
        packetZeroized: true,
        tokenVerifierBytesZeroized: true,
        assetBytesZeroized: true,
        openSocketCount: 0,
        sessionTimerActive: false,
        lingerTimerActive: false,
        finalReason: 'session-timeout',
      });
    }, 15_000);
});

function makePacket() {
  if (canonicalPacket === null) throw new Error('canonical V049 packet fixture is unavailable');
  return canonicalPacket.slice();
}

function bytesDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function transportInput(packetBytes) {
  return {
    packetBytes,
    exactPacketByteLength: packetBytes.byteLength,
    indexHtmlTemplate: INDEX_TEMPLATE,
    clientJavaScript: CLIENT_JAVASCRIPT,
  };
}

function startTransport(packetBytes) {
  return startPrivatePositionTrajectoryLoopbackServerV049(transportInput(packetBytes));
}

function extractToken(url) {
  return new URL(url).hash.slice('#token='.length);
}

function trajectoryHeaders(origin, token) {
  return {
    Authorization: `Bearer ${token}`,
    Origin: origin,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };
}

function withoutHeader(headers, name) {
  return Object.fromEntries(
    Object.entries(headers).filter(([headerName]) => headerName !== name),
  );
}

function sendTrajectory(origin, token) {
  return send(origin, '/trajectory', {
    method: 'POST',
    headers: trajectoryHeaders(origin, token),
  });
}

function send(origin, requestPath, { method = 'GET', headers = {}, body = null } = {}) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: Number(url.port),
      path: requestPath,
      method,
      headers,
      agent: false,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    if (body !== null) request.end(body);
    else request.end();
  });
}

function sendRaw(origin, requestText) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const socket = connect({ host: url.hostname, port: Number(url.port) });
    const settle = (error = null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error !== null && error.code !== 'ECONNRESET') reject(error);
      else resolve(Buffer.concat(chunks));
    };
    socket.setTimeout(3_000, () => settle(new Error('raw loopback request timed out')));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('connect', () => socket.write(requestText, 'ascii'));
    socket.once('end', () => settle());
    socket.once('close', () => settle());
    socket.once('error', settle);
  });
}

function openSocket(origin) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: Number(url.port) });
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('loopback lifecycle condition was not observed');
}
