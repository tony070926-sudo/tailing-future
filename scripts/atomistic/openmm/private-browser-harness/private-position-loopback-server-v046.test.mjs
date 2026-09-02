import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createAtomisticInstancingPresentationControllerV046,
  createAtomisticInstancingWorldFixtureV046,
} from '../../../../lib/molecular/atomistic-instancing-v046.test-fixture.ts';
import {
  decodePrivatePositionPacketV047,
  encodePrivatePositionPacketV047,
} from './private-position-envelope-v046.mjs';
import {
  createAtomisticPrivatePositionFrameMetadataV047,
} from '../../../../lib/simulation/atomistic-private-position-frame-v047.ts';
import {
  startPrivatePositionLoopbackServerV047,
} from './private-position-loopback-server-v046.mjs';

const INDEX_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><style nonce="__TF_PRIVATE_CSP_NONCE__">body{color:white}</style></head>
<body><script nonce="__TF_PRIVATE_CSP_NONCE__" type="module" src="/client.js"></script></body></html>`;
const CLIENT_JAVASCRIPT = 'document.body.dataset.clientLoaded = "true";\n';

describe('V047 private position packet loopback transport', () => {
  it('serves one authenticated packet, rejects replay, and zeroizes transferred storage', async () => {
    const packet = makePacket('loopback-happy');
    const expectedPacket = packet.slice();
    const server = await startPrivatePositionLoopbackServerV047({
      packetBytes: packet,
      indexHtmlTemplate: INDEX_TEMPLATE,
      clientJavaScript: CLIENT_JAVASCRIPT,
    });
    try {
      expect(packet.every((value) => value === 0)).toBe(true);
      expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const index = await send(server.origin, '/');
      expect(index.statusCode).toBe(200);
      expect(index.headers['content-security-policy']).toContain("default-src 'none'");
      expect(index.headers['content-security-policy']).toContain("connect-src 'self'");
      expect(index.headers['access-control-allow-origin']).toBeUndefined();
      expect(index.headers.etag).toBeUndefined();
      expect(index.headers['last-modified']).toBeUndefined();
      expect(index.headers['set-cookie']).toBeUndefined();
      expect(index.body.toString('utf8')).not.toContain('__TF_PRIVATE_CSP_NONCE__');

      const client = await send(server.origin, '/client.js');
      expect(client.statusCode).toBe(200);
      expect(client.body.toString('utf8')).toBe(CLIENT_JAVASCRIPT);

      const token = new URL(server.url).hash.slice('#token='.length);
      const unauthorizedToken = '0'.repeat(64);
      let candidateTokenBuffer = null;
      const originalBufferFrom = Buffer.from;
      const bufferFromSpy = vi.spyOn(Buffer, 'from').mockImplementation((...args) => {
        const copy = Reflect.apply(originalBufferFrom, Buffer, args);
        if (args[0] === unauthorizedToken && args[1] === 'hex') candidateTokenBuffer = copy;
        return copy;
      });
      let unauthorized;
      try {
        unauthorized = await sendFrame(server.origin, unauthorizedToken);
      } finally {
        bufferFromSpy.mockRestore();
      }
      expect(unauthorized.statusCode).toBe(404);
      expect(candidateTokenBuffer).not.toBeNull();
      expect(candidateTokenBuffer.every((value) => value === 0)).toBe(true);
      expect(server.lifecycle().consumed).toBe(false);

      const frame = await sendFrame(server.origin, token);
      expect(frame.statusCode).toBe(200);
      const replay = await sendFrame(server.origin, token);
      expect(replay.statusCode).toBe(410);
      expect(replay.body.toString('ascii')).toBe('consumed\n');
      const unauthenticatedReplay = await sendFrame(server.origin, '0'.repeat(64));
      expect(unauthenticatedReplay.statusCode).toBe(404);
      expect(frame.headers['content-type']).toBe('application/octet-stream');
      expect(frame.headers['cache-control']).toBe('no-store, max-age=0');
      expect(frame.headers['access-control-allow-origin']).toBeUndefined();
      expect(frame.headers['x-private-packet-digest']).toBe(server.packetDigest);
      expect(frame.body).toEqual(Buffer.from(expectedPacket));
      expect(decodePrivatePositionPacketV047(frame.body).positionsBytes)
        .toHaveLength(32_220);
      expect(server.lifecycle()).toMatchObject({
        consumed: true,
        envelopeZeroized: true,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
        securePhysicalErasureVerified: false,
      });
    } finally {
      expectedPacket.fill(0);
      await server.close();
    }
    expect(server.lifecycle()).toMatchObject({
      finalized: true,
      listenerClosed: true,
      envelopeZeroized: true,
    });
  });

  it('fails closed for cross-origin, query, range, body, OPTIONS, and host changes', async () => {
    const packet = makePacket('loopback-rejections');
    const server = await startPrivatePositionLoopbackServerV047({
      packetBytes: packet,
      indexHtmlTemplate: INDEX_TEMPLATE,
      clientJavaScript: CLIENT_JAVASCRIPT,
    });
    try {
      const token = new URL(server.url).hash.slice('#token='.length);
      const origin = new URL(server.origin);
      const validHeaders = frameHeaders(server.origin, token);
      const attempts = [
        send(server.origin, '/frame?frameOrdinal=38', { method: 'POST', headers: validHeaders }),
        send(server.origin, '/frame', {
          method: 'POST',
          headers: { ...validHeaders, Origin: 'https://example.invalid' },
        }),
        send(server.origin, '/frame', {
          method: 'POST',
          headers: { ...validHeaders, Range: 'bytes=0-20' },
        }),
        send(server.origin, '/frame', {
          method: 'POST',
          headers: { ...validHeaders, 'Content-Type': 'application/octet-stream' },
          body: Buffer.from([1]),
        }),
        send(server.origin, '/frame', { method: 'OPTIONS', headers: validHeaders }),
        send(server.origin, '/frame', {
          method: 'POST',
          headers: { ...validHeaders, Host: `localhost:${origin.port}` },
        }),
      ];
      const responses = await Promise.all(attempts);
      expect(responses.map((response) => response.statusCode))
        .toEqual([404, 404, 404, 404, 405, 404]);
      expect(server.lifecycle().consumed).toBe(false);

      const [first, second] = await Promise.all([
        sendFrame(server.origin, token),
        sendFrame(server.origin, token),
      ]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 410]);
    } finally {
      await server.close();
    }
    expect(server.lifecycle().envelopeZeroized).toBe(true);
  });

  it('zeroizes without serving when the controller closes early', async () => {
    const packet = makePacket('loopback-controller-close');
    const server = await startPrivatePositionLoopbackServerV047({
      packetBytes: packet,
      indexHtmlTemplate: INDEX_TEMPLATE,
      clientJavaScript: CLIENT_JAVASCRIPT,
    });
    await server.close();
    expect(server.lifecycle()).toMatchObject({
      consumed: false,
      finalized: true,
      listenerClosed: true,
      envelopeZeroized: true,
      finalReason: 'controller-close',
    });
    await expect(send(server.origin, '/')).rejects.toThrow();
  });

  it('bounds protocol errors, Expect continuations, and oversized headers without consumption',
    async () => {
      const packet = makePacket('loopback-protocol-bounds');
      const server = await startPrivatePositionLoopbackServerV047({
        packetBytes: packet,
        indexHtmlTemplate: INDEX_TEMPLATE,
        clientJavaScript: CLIENT_JAVASCRIPT,
      });
      try {
        const origin = new URL(server.origin);
        const expectContinue = await sendRaw(server.origin, [
          'POST /frame HTTP/1.1',
          `Host: ${origin.host}`,
          'Expect: 100-continue',
          'Content-Length: 1',
          '',
          '',
        ].join('\r\n'));
        expect(expectContinue.toString('ascii')).toMatch(/^HTTP\/1\.1 417 /);
        expect(expectContinue.toString('ascii')).not.toContain('100 Continue');

        await sendRaw(server.origin, [
          'GET / HTTP/1.1',
          `Host: ${origin.host}`,
          'Malformed Header',
          '',
          '',
        ].join('\r\n'));
        await sendRaw(server.origin, [
          'GET / HTTP/1.1',
          `Host: ${origin.host}`,
          `X-Oversized: ${'a'.repeat(9 * 1024)}`,
          '',
          '',
        ].join('\r\n'));

        expect(server.lifecycle().consumed).toBe(false);
        const stillAvailable = await send(server.origin, '/');
        expect(stillAvailable.statusCode).toBe(200);
      } finally {
        await server.close();
      }
      expect(server.lifecycle()).toMatchObject({
        listenerClosed: true,
        envelopeZeroized: true,
      });
    });

  it('zeroizes every captured allocation after a deterministic pre-listen asset fault', async () => {
    const packet = makePacket('loopback-prelisten-fault');
    const capturedBuffers = [];
    const originalBufferFrom = Buffer.from;
    const bufferFromSpy = vi.spyOn(Buffer, 'from').mockImplementation((...args) => {
      const copy = Reflect.apply(originalBufferFrom, Buffer, args);
      if (args[0] === packet || typeof args[0] === 'string') capturedBuffers.push(copy);
      return copy;
    });
    let failure = null;
    try {
      await startPrivatePositionLoopbackServerV047({
        packetBytes: packet,
        indexHtmlTemplate: INDEX_TEMPLATE,
        clientJavaScript: `${CLIENT_JAVASCRIPT}\u0000`,
      });
    } catch (error) {
      failure = error;
    } finally {
      bufferFromSpy.mockRestore();
    }

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/must not contain NUL/);
    expect(packet.every((value) => value === 0)).toBe(true);
    expect(capturedBuffers.length).toBeGreaterThanOrEqual(4);
    for (const bytes of capturedBuffers) {
      expect(bytes.every((value) => value === 0)).toBe(true);
    }
  });
});

function makePacket(prefix) {
  const fixture = createAtomisticInstancingWorldFixtureV046(prefix);
  const controller = createAtomisticInstancingPresentationControllerV046(fixture, 37);
  const positions = controller.handle.copyChannelBytes('positionsNanometer');
  const metadata = controller.handle.metadata;
  const frameMetadata = createAtomisticPrivatePositionFrameMetadataV047({
    sessionId: fixture.session.sessionId,
    sessionDigest: fixture.session.sessionDigest,
    trajectoryDigest: fixture.session.trajectory.trajectoryDigest,
    frameOrdinal: metadata.binding.frameOrdinal,
    frameDigest: metadata.binding.frameDigest,
    atomOrderDigest: metadata.binding.atomOrderDigest,
    cellDigest: metadata.binding.cellDigest,
    topologyDigest: fixture.session.topology.topologyDigest,
    step: metadata.binding.step,
    timePicoseconds: metadata.binding.timePicoseconds,
    positionsDerivedF32Digest: metadata.channels.positionsNanometer.derived.sha256,
  });
  const packet = encodePrivatePositionPacketV047({ frameMetadata, positionsBytes: positions });
  positions.fill(0);
  controller.revoke();
  return packet;
}

function frameHeaders(origin, token) {
  return {
    Authorization: `Bearer ${token}`,
    Origin: origin,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  };
}

function sendFrame(origin, token) {
  return send(origin, '/frame', {
    method: 'POST',
    headers: frameHeaders(origin, token),
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
