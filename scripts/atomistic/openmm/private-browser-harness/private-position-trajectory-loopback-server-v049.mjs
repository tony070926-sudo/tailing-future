import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createServer } from 'node:http';
import { isProxy } from 'node:util/types';
import {
  PRIVATE_POSITION_TRAJECTORY_PACKET_METADATA_MAX_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049,
  decodePrivatePositionTrajectoryPacketV049,
} from './private-position-trajectory-envelope-v049.mjs';

const LOOPBACK_ADDRESS = '127.0.0.1';
const TOKEN_BYTES = 32;
export const PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049 =
  PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
  + 2
  + PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049
  + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049;
export const PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049 =
  PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
  + PRIVATE_POSITION_TRAJECTORY_PACKET_METADATA_MAX_BYTES_V049
  + PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049
  + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049;
export const PRIVATE_POSITION_TRAJECTORY_SESSION_TIMEOUT_MS_V049 = 120_000;
const MAXIMUM_INDEX_BYTES = 64 * 1024;
const MAXIMUM_CLIENT_BYTES = 2 * 1024 * 1024;
const MAXIMUM_HEADER_BYTES = 8 * 1024;
const MAXIMUM_CONNECTIONS = 8;
const MAXIMUM_REQUESTS = 16;
const PACKET_WRITE_CHUNK_BYTES = 64 * 1024;
const POST_CONSUME_LINGER_MS = 500;
const NONCE_PLACEHOLDER = '__TF_PRIVATE_CSP_NONCE__';
const INPUT_KEYS = Object.freeze([
  'clientJavaScript',
  'exactPacketByteLength',
  'indexHtmlTemplate',
  'packetBytes',
]);
const FIXED_ERROR_BODY = Buffer.from('unavailable\n', 'ascii');
const CONSUMED_BODY = Buffer.from('consumed\n', 'ascii');
const UINT8_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  Uint8Array.prototype,
  'buffer',
)?.get ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'buffer').get;
const UINT8_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength',
).get;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get ?? null;

/**
 * Start one bounded, single-use, IPv4 loopback transport for a complete private
 * V049 position trajectory packet. The transport accepts bytes and static
 * browser assets only; it has no artifact-path, frame, or trajectory-config API.
 *
 * The packet is ownership-transferred after validation: this function copies it
 * into private storage and zero-fills the caller's intrinsic Uint8Array before
 * listening. Its one-time 256-bit credential is returned only in the URL
 * fragment, which browsers do not send in HTTP requests.
 */
export async function startPrivatePositionTrajectoryLoopbackServerV049(input) {
  const validated = validateInputRecord(input);
  let ownedPacket = null;
  let indexTemplate = null;
  let indexBytes = null;
  let clientBytes = null;
  let tokenBytes = null;
  let tokenVerifier = null;
  let server = null;
  let packetDigest = null;
  let tokenHex = null;
  let cspNonce = null;
  let expectedHost = null;
  let expectedOrigin = null;
  let requestCount = 0;
  let consumed = false;
  let finalized = false;
  let packetZeroized = false;
  let tokenSourceBytesZeroized = false;
  let tokenVerifierBytesZeroized = false;
  let assetBytesZeroized = false;
  let listenerClosed = false;
  let finalReason = null;
  let sessionTimer = null;
  let lingerTimer = null;
  let closePromise = null;
  const sockets = new Set();

  try {
    ownedPacket = copyExactPacket(
      validated.packetBytes,
      validated.exactPacketByteLength,
    );
    UINT8_ARRAY_FILL.call(validated.packetBytes, 0);
    let packetValidationView = null;
    let decoded = null;
    try {
      packetValidationView = new Uint8Array(
        ownedPacket.buffer,
        ownedPacket.byteOffset,
        ownedPacket.byteLength,
      );
      decoded = decodePrivatePositionTrajectoryPacketV049(packetValidationView);
    } finally {
      if (decoded !== null) UINT8_ARRAY_FILL.call(decoded.positionsBytes, 0);
      packetValidationView = null;
    }
    packetDigest = digestBuffer(ownedPacket);

    const nonceBytes = randomBytes(18);
    try {
      cspNonce = nonceBytes.toString('base64url');
    } finally {
      UINT8_ARRAY_FILL.call(nonceBytes, 0);
    }
    indexTemplate = copyUtf8Asset(
      validated.indexHtmlTemplate,
      'private trajectory loopback index template',
      MAXIMUM_INDEX_BYTES,
    );
    const indexSource = indexTemplate.toString('utf8');
    const placeholderCount = countOccurrences(indexSource, NONCE_PLACEHOLDER);
    if (placeholderCount < 2 || placeholderCount > 8) {
      throw new Error('private trajectory loopback index template must bind its CSP nonce');
    }
    indexBytes = Buffer.from(indexSource.replaceAll(NONCE_PLACEHOLDER, cspNonce), 'utf8');
    UINT8_ARRAY_FILL.call(indexTemplate, 0);
    indexTemplate = null;
    clientBytes = copyUtf8Asset(
      validated.clientJavaScript,
      'private trajectory loopback client JavaScript',
      MAXIMUM_CLIENT_BYTES,
    );

    tokenBytes = randomBytes(TOKEN_BYTES);
    tokenHex = tokenBytes.toString('hex');
    tokenVerifier = createHash('sha256').update(tokenBytes).digest();
    UINT8_ARRAY_FILL.call(tokenBytes, 0);
    tokenBytes = null;
    tokenSourceBytesZeroized = true;

    server = createServer({ maxHeaderSize: MAXIMUM_HEADER_BYTES }, handleRequest);
    server.maxConnections = MAXIMUM_CONNECTIONS;
    server.maxHeadersCount = 24;
    server.maxRequestsPerSocket = 4;
    server.headersTimeout = 5_000;
    server.requestTimeout = 5_000;
    server.keepAliveTimeout = 1_000;
    server.on('connection', handleConnection);
    server.on('checkContinue', handleCheckContinue);
    server.on('clientError', handleClientError);
    server.on('error', handleOperationalServerError);

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen({ host: LOOPBACK_ADDRESS, port: 0, exclusive: true });
    });
    const address = server.address();
    const ipv4Family = address && typeof address === 'object'
      && (address.family === 'IPv4' || address.family === 4);
    if (!address || typeof address !== 'object'
      || address.address !== LOOPBACK_ADDRESS
      || !ipv4Family
      || !Number.isSafeInteger(address.port)
      || address.port < 1) {
      throw new Error('private trajectory loopback did not bind one random IPv4 loopback port');
    }
    expectedHost = `${LOOPBACK_ADDRESS}:${address.port}`;
    expectedOrigin = `http://${expectedHost}`;
    sessionTimer = setTimeout(() => {
      void finalize('session-timeout', true);
    }, PRIVATE_POSITION_TRAJECTORY_SESSION_TIMEOUT_MS_V049);
    sessionTimer.unref();

    return Object.freeze({
      schemaVersion: 'tf.private-position-trajectory-loopback-server/0.4.9',
      url: `${expectedOrigin}/#token=${tokenHex}`,
      origin: expectedOrigin,
      packetDigest,
      exactPacketByteLength: validated.exactPacketByteLength,
      lifecycle() {
        return Object.freeze({
          listening: server.listening,
          listenerClosed,
          consumed,
          finalized,
          packetZeroized,
          tokenSourceBytesZeroized,
          tokenVerifierBytesZeroized,
          assetBytesZeroized,
          openSocketCount: sockets.size,
          sessionTimerActive: sessionTimer !== null,
          lingerTimerActive: lingerTimer !== null,
          requestCount,
          finalReason,
          packetDigest,
          exactPacketByteLength: validated.exactPacketByteLength,
          publicDistributionEligible: false,
          cloudflareDistributionEligible: false,
          securePhysicalErasureVerified: false,
        });
      },
      close() {
        return finalize('controller-close', true);
      },
    });
  } catch (error) {
    await finalize('initialization-failure', true);
    throw error;
  }

  function handleRequest(request, response) {
    requestCount += 1;
    if (finalized || requestCount > MAXIMUM_REQUESTS
      || !request.url || !expectedHost || !expectedOrigin) {
      sendFixed(response, 404, FIXED_ERROR_BODY, 'text/plain; charset=utf-8');
      if (requestCount > MAXIMUM_REQUESTS) {
        void finalize('request-bound-exceeded', true);
      }
      return;
    }
    if (!hasOneExactHeader(request, 'host', expectedHost)
      || request.url.includes('?')
      || request.url.includes('#')
      || request.url.startsWith('http://')
      || request.url.startsWith('https://')
      || request.headers.range !== undefined
      || request.headers.cookie !== undefined) {
      sendFixed(response, 404, FIXED_ERROR_BODY, 'text/plain; charset=utf-8');
      return;
    }

    if (request.method === 'GET' && request.url === '/') {
      sendFixed(
        response,
        200,
        indexBytes,
        'text/html; charset=utf-8',
        htmlSecurityHeaders(cspNonce),
      );
      return;
    }
    if (request.method === 'GET' && request.url === '/client.js') {
      sendFixed(response, 200, clientBytes, 'text/javascript; charset=utf-8');
      return;
    }
    if (request.url === '/trajectory' && request.method === 'POST') {
      if (tokenVerifier === null
        || !isAuthorizedTrajectoryRequest(request, expectedOrigin, tokenVerifier)) {
        sendFixed(response, 404, FIXED_ERROR_BODY, 'text/plain; charset=utf-8');
        return;
      }
      if (consumed) {
        sendFixed(response, 410, CONSUMED_BODY, 'text/plain; charset=utf-8');
        return;
      }

      consumed = true;
      response.once('finish', () => {
        zeroPacket();
        if (lingerTimer === null && !finalized) {
          lingerTimer = setTimeout(() => {
            void finalize('single-use-response-finished', false);
          }, POST_CONSUME_LINGER_MS);
          lingerTimer.unref();
        }
      });
      response.once('close', () => {
        if (!response.writableFinished) void finalize('single-use-response-aborted', true);
      });
      response.once('error', () => {
        void finalize('single-use-response-error', true);
      });
      sendTrajectoryPacket(response, ownedPacket, packetDigest);
      return;
    }

    sendFixed(response, request.method === 'OPTIONS' ? 405 : 404, FIXED_ERROR_BODY,
      'text/plain; charset=utf-8');
  }

  function handleConnection(socket) {
    if (sockets.size >= MAXIMUM_CONNECTIONS) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.setTimeout(5_000, () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
  }

  function handleCheckContinue(_request, response) {
    requestCount += 1;
    sendFixed(response, 417, FIXED_ERROR_BODY, 'text/plain; charset=utf-8');
    if (requestCount > MAXIMUM_REQUESTS) void finalize('request-bound-exceeded', true);
  }

  function handleClientError(_error, socket) {
    requestCount += 1;
    socket.destroy();
    if (requestCount > MAXIMUM_REQUESTS) void finalize('request-bound-exceeded', true);
  }

  function handleOperationalServerError() {
    void finalize('server-error', true);
  }

  function zeroPacket() {
    if (packetZeroized) return;
    if (ownedPacket !== null) {
      UINT8_ARRAY_FILL.call(ownedPacket, 0);
      ownedPacket = null;
    }
    packetZeroized = true;
  }

  function zeroAssets() {
    if (assetBytesZeroized) return;
    if (indexTemplate !== null) {
      UINT8_ARRAY_FILL.call(indexTemplate, 0);
      indexTemplate = null;
    }
    if (indexBytes !== null) {
      UINT8_ARRAY_FILL.call(indexBytes, 0);
      indexBytes = null;
    }
    if (clientBytes !== null) {
      UINT8_ARRAY_FILL.call(clientBytes, 0);
      clientBytes = null;
    }
    assetBytesZeroized = true;
  }

  function zeroTokenMaterial() {
    tokenHex = null;
    if (tokenBytes !== null) {
      UINT8_ARRAY_FILL.call(tokenBytes, 0);
      tokenBytes = null;
      tokenSourceBytesZeroized = true;
    }
    if (tokenVerifier !== null) {
      UINT8_ARRAY_FILL.call(tokenVerifier, 0);
      tokenVerifier = null;
    }
    tokenVerifierBytesZeroized = true;
  }

  function finalize(reason, forceSockets) {
    if (closePromise !== null) {
      if (forceSockets) {
        server?.closeAllConnections?.();
        destroySockets(sockets);
      }
      return closePromise;
    }
    finalized = true;
    finalReason = reason;
    if (sessionTimer !== null) {
      clearTimeout(sessionTimer);
      sessionTimer = null;
    }
    if (lingerTimer !== null) {
      clearTimeout(lingerTimer);
      lingerTimer = null;
    }
    zeroPacket();
    zeroTokenMaterial();
    zeroAssets();
    cspNonce = null;
    if (server === null) {
      listenerClosed = true;
      closePromise = Promise.resolve();
      return closePromise;
    }
    closePromise = new Promise((resolve) => {
      let closeFinished = false;
      const finishClose = () => {
        if (closeFinished) return;
        closeFinished = true;
        listenerClosed = true;
        destroySockets(sockets);
        resolve();
      };
      if (!server.listening) {
        finishClose();
        return;
      }
      try {
        server.close(finishClose);
        server.closeIdleConnections?.();
        if (forceSockets) {
          server.closeAllConnections?.();
          destroySockets(sockets);
        }
      } catch {
        finishClose();
      }
    });
    return closePromise;
  }
}

function validateInputRecord(input) {
  if (input === null || typeof input !== 'object' || isProxy(input)
    || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new TypeError('private trajectory loopback input must be one plain non-Proxy record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new TypeError('private trajectory loopback input must contain only string keys');
  }
  const keys = ownKeys.sort();
  if (keys.length !== INPUT_KEYS.length
    || keys.some((key, index) => key !== INPUT_KEYS[index])) {
    throw new TypeError(`private trajectory loopback input must contain exactly ${INPUT_KEYS.join(', ')}`);
  }
  for (const key of INPUT_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`private trajectory loopback ${key} must be an enumerable data property`);
    }
  }
  const exactPacketByteLength = descriptors.exactPacketByteLength.value;
  if (!Number.isSafeInteger(exactPacketByteLength)
    || exactPacketByteLength < PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049
    || exactPacketByteLength > PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049) {
    throw new RangeError('private trajectory packet exact byte length is outside its fixed bound');
  }
  const packetBytes = descriptors.packetBytes.value;
  assertIntrinsicFixedUint8Array(packetBytes, 'private trajectory packet');
  if (UINT8_ARRAY_BYTE_LENGTH_GETTER.call(packetBytes) !== exactPacketByteLength) {
    throw new RangeError('private trajectory packet byte length does not match its exact lock');
  }
  return Object.freeze({
    packetBytes,
    exactPacketByteLength,
    indexHtmlTemplate: descriptors.indexHtmlTemplate.value,
    clientJavaScript: descriptors.clientJavaScript.value,
  });
}

function assertIntrinsicFixedUint8Array(value, label) {
  if (value === null || typeof value !== 'object' || isProxy(value)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype) {
    throw new TypeError(`${label} must be one intrinsic non-Proxy Uint8Array`);
  }
  let backingBuffer;
  try {
    backingBuffer = UINT8_ARRAY_BUFFER_GETTER.call(value);
    UINT8_ARRAY_BYTE_LENGTH_GETTER.call(value);
  } catch (error) {
    throw new TypeError(`${label} must have attached intrinsic storage`, { cause: error });
  }
  if (Object.getPrototypeOf(backingBuffer) !== ArrayBuffer.prototype
    || (ARRAY_BUFFER_RESIZABLE_GETTER !== null
      && ARRAY_BUFFER_RESIZABLE_GETTER.call(backingBuffer))) {
    throw new TypeError(`${label} must use one fixed intrinsic ArrayBuffer`);
  }
}

function copyExactPacket(value, exactPacketByteLength) {
  const copy = Buffer.allocUnsafe(exactPacketByteLength);
  try {
    UINT8_ARRAY_SET.call(copy, value);
    return copy;
  } catch (error) {
    UINT8_ARRAY_FILL.call(copy, 0);
    throw new TypeError('private trajectory packet could not be copied', { cause: error });
  }
}

function isAuthorizedTrajectoryRequest(request, expectedOrigin, expectedTokenDigest) {
  if (!hasOneExactHeader(request, 'origin', expectedOrigin)
    || !hasOneExactHeader(request, 'sec-fetch-site', 'same-origin')
    || !hasOneExactHeader(request, 'sec-fetch-mode', 'cors')
    || !hasOneExactHeader(request, 'sec-fetch-dest', 'empty')
    || request.headers.referer !== undefined
    || request.headers.range !== undefined
    || request.headers.cookie !== undefined
    || request.headers['content-type'] !== undefined
    || request.headers['transfer-encoding'] !== undefined
    || (request.headers['content-length'] !== undefined
      && request.headers['content-length'] !== '0')
    || headerCount(request, 'authorization') !== 1) {
    return false;
  }
  const authorization = request.headers.authorization;
  if (typeof authorization !== 'string' || !/^Bearer [0-9a-f]{64}$/.test(authorization)) {
    return false;
  }
  let candidate = null;
  let candidateDigest = null;
  try {
    candidate = Buffer.from(authorization.slice(7), 'hex');
    candidateDigest = createHash('sha256').update(candidate).digest();
    return candidateDigest.byteLength === expectedTokenDigest.byteLength
      && timingSafeEqual(candidateDigest, expectedTokenDigest);
  } finally {
    if (candidate !== null) UINT8_ARRAY_FILL.call(candidate, 0);
    if (candidateDigest !== null) UINT8_ARRAY_FILL.call(candidateDigest, 0);
  }
}

function hasOneExactHeader(request, name, value) {
  return headerCount(request, name) === 1 && request.headers[name] === value;
}

function headerCount(request, name) {
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === name) count += 1;
  }
  return count;
}

function sendFixed(response, statusCode, body, contentType, extraHeaders = {}) {
  response.writeHead(statusCode, {
    Connection: 'close',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Content-Type': contentType,
    'Content-Length': body.byteLength,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    ...extraHeaders,
  });
  response.end(body);
}

function sendTrajectoryPacket(response, packetBytes, packetDigest) {
  response.writeHead(200, responseHeaders(
    packetBytes,
    'application/octet-stream',
    Object.freeze({
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Private-Packet-Digest': packetDigest,
    }),
  ));
  let offset = 0;
  const writeNext = () => {
    if (response.destroyed || response.writableEnded) return;
    while (offset < packetBytes.byteLength) {
      const end = Math.min(offset + PACKET_WRITE_CHUNK_BYTES, packetBytes.byteLength);
      const canContinue = response.write(packetBytes.subarray(offset, end));
      offset = end;
      if (!canContinue) {
        response.once('drain', writeNext);
        return;
      }
    }
    response.end();
  };
  response.once('close', () => response.off('drain', writeNext));
  writeNext();
}

function responseHeaders(body, contentType, extraHeaders = {}) {
  return {
    Connection: 'close',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Content-Type': contentType,
    'Content-Length': body.byteLength,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    ...extraHeaders,
  };
}

function htmlSecurityHeaders(nonce) {
  return Object.freeze({
    'Content-Security-Policy': [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "img-src 'none'",
      "font-src 'none'",
      "object-src 'none'",
      "frame-src 'none'",
      "worker-src 'none'",
      "manifest-src 'none'",
      "media-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  });
}

function copyUtf8Asset(value, label, maximumBytes) {
  const bytes = typeof value === 'string'
    ? Buffer.from(value, 'utf8')
    : copyBoundedAssetBytes(value, label, maximumBytes);
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
    UINT8_ARRAY_FILL.call(bytes, 0);
    throw new Error(`${label} is outside its byte bound`);
  }
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    UINT8_ARRAY_FILL.call(bytes, 0);
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  if (decoded.includes('\u0000')) {
    UINT8_ARRAY_FILL.call(bytes, 0);
    throw new Error(`${label} must not contain NUL`);
  }
  return bytes;
}

function copyBoundedAssetBytes(value, label, maximumBytes) {
  if (!(value instanceof Uint8Array)
    || value.byteLength < 1
    || value.byteLength > maximumBytes) {
    throw new TypeError(`${label} must be one bounded Uint8Array`);
  }
  try {
    return Buffer.from(value);
  } catch (error) {
    throw new TypeError(`${label} could not be copied`, { cause: error });
  }
}

function digestBuffer(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function destroySockets(sockets) {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
}
