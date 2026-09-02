import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createServer } from 'node:http';
import {
  PRIVATE_POSITION_PACKET_METADATA_MAX_BYTES_V047,
  PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047,
  PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047,
  PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047,
  decodePrivatePositionPacketV047,
} from './private-position-envelope-v046.mjs';

const LOOPBACK_ADDRESS = '127.0.0.1';
const TOKEN_BYTES = 32;
const MINIMUM_PACKET_BYTES = PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047
  + 2
  + PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047
  + PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047;
const MAXIMUM_PACKET_BYTES = PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047
  + PRIVATE_POSITION_PACKET_METADATA_MAX_BYTES_V047
  + PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047
  + PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047;
const MAXIMUM_INDEX_BYTES = 64 * 1024;
const MAXIMUM_CLIENT_BYTES = 2 * 1024 * 1024;
const MAXIMUM_HEADER_BYTES = 8 * 1024;
const MAXIMUM_CONNECTIONS = 8;
const MAXIMUM_REQUESTS = 16;
const SESSION_TIMEOUT_MS = 30_000;
const POST_CONSUME_LINGER_MS = 500;
const NONCE_PLACEHOLDER = '__TF_PRIVATE_CSP_NONCE__';
const FIXED_ERROR_BODY = Buffer.from('unavailable\n', 'ascii');
const CONSUMED_BODY = Buffer.from('consumed\n', 'ascii');

/**
 * Start one bounded, single-use, IPv4 loopback transport for a private packet.
 *
 * The input packet is ownership-transferred: this function copies it into its
 * own Buffer and zero-fills the caller's Uint8Array before it starts listening.
 * The returned URL contains the one-time token only in its fragment. Nothing
 * in this module accepts an artifact path, receipt path, source revision, or
 * frame ordinal from HTTP.
 */
export async function startPrivatePositionLoopbackServerV047({
  packetBytes,
  indexHtmlTemplate,
  clientJavaScript,
}) {
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
  let envelopeZeroized = false;
  let listenerClosed = false;
  let finalReason = null;
  let sessionTimer = null;
  let lingerTimer = null;
  let closePromise = null;
  const sockets = new Set();

  try {
    ownedPacket = copyBoundedBytes(
      packetBytes,
      'private loopback packet',
      MINIMUM_PACKET_BYTES,
      MAXIMUM_PACKET_BYTES,
    );
    Uint8Array.prototype.fill.call(packetBytes, 0);

    let decoded = null;
    try {
      decoded = decodePrivatePositionPacketV047(ownedPacket);
    } finally {
      if (decoded !== null) decoded.positionsBytes.fill(0);
    }
    packetDigest = digestBuffer(ownedPacket);

    const nonceBytes = randomBytes(18);
    try {
      cspNonce = nonceBytes.toString('base64url');
    } finally {
      nonceBytes.fill(0);
    }
    indexTemplate = copyUtf8Asset(
      indexHtmlTemplate,
      'private loopback index template',
      MAXIMUM_INDEX_BYTES,
    );
    const placeholderCount = countOccurrences(indexTemplate.toString('utf8'), NONCE_PLACEHOLDER);
    if (placeholderCount < 2 || placeholderCount > 8) {
      throw new Error('private loopback index template must bind its CSP nonce');
    }
    indexBytes = Buffer.from(
      indexTemplate.toString('utf8').replaceAll(NONCE_PLACEHOLDER, cspNonce),
      'utf8',
    );
    indexTemplate.fill(0);
    indexTemplate = null;
    clientBytes = copyUtf8Asset(
      clientJavaScript,
      'private loopback client JavaScript',
      MAXIMUM_CLIENT_BYTES,
    );

    tokenBytes = randomBytes(TOKEN_BYTES);
    tokenHex = tokenBytes.toString('hex');
    tokenVerifier = createHash('sha256').update(tokenBytes).digest();
    tokenBytes.fill(0);
    tokenBytes = null;

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
      throw new Error('private loopback server did not bind one random IPv4 loopback port');
    }
    expectedHost = `${LOOPBACK_ADDRESS}:${address.port}`;
    expectedOrigin = `http://${expectedHost}`;
    sessionTimer = setTimeout(() => {
      void finalize('session-timeout', true);
    }, SESSION_TIMEOUT_MS);
    sessionTimer.unref();

    return Object.freeze({
      schemaVersion: 'tf.private-position-loopback-server/0.4.7',
      url: `${expectedOrigin}/#token=${tokenHex}`,
      origin: expectedOrigin,
      packetDigest,
      lifecycle() {
        return Object.freeze({
          listening: server.listening,
          listenerClosed,
          consumed,
          finalized,
          envelopeZeroized,
          requestCount,
          finalReason,
          packetDigest,
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
    if (request.url === '/frame' && request.method === 'POST') {
      if (tokenVerifier === null
        || !isAuthorizedFrameRequest(request, expectedOrigin, tokenVerifier)) {
        sendFixed(response, 404, FIXED_ERROR_BODY, 'text/plain; charset=utf-8');
        return;
      }
      if (consumed) {
        sendFixed(response, 410, CONSUMED_BODY, 'text/plain; charset=utf-8');
        return;
      }

      consumed = true;
      response.once('finish', () => {
        zeroEnvelope();
        if (lingerTimer === null) {
          lingerTimer = setTimeout(() => {
            void finalize('single-use-response-finished', false);
          }, POST_CONSUME_LINGER_MS);
          lingerTimer.unref();
        }
      });
      response.once('close', () => {
        if (!response.writableFinished) void finalize('single-use-response-aborted', true);
      });
      sendFixed(
        response,
        200,
        ownedPacket,
        'application/octet-stream',
        Object.freeze({
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Private-Packet-Digest': packetDigest,
        }),
      );
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

  function zeroEnvelope() {
    if (envelopeZeroized) return;
    if (ownedPacket !== null) {
      ownedPacket.fill(0);
      ownedPacket = null;
    }
    envelopeZeroized = true;
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
    if (sessionTimer !== null) clearTimeout(sessionTimer);
    if (lingerTimer !== null) clearTimeout(lingerTimer);
    zeroEnvelope();
    tokenHex = null;
    cspNonce = null;
    if (tokenBytes !== null) {
      tokenBytes.fill(0);
      tokenBytes = null;
    }
    if (tokenVerifier !== null) {
      tokenVerifier.fill(0);
      tokenVerifier = null;
    }
    if (indexTemplate !== null) {
      indexTemplate.fill(0);
      indexTemplate = null;
    }
    if (indexBytes !== null) {
      indexBytes.fill(0);
      indexBytes = null;
    }
    if (clientBytes !== null) {
      clientBytes.fill(0);
      clientBytes = null;
    }
    if (server === null) {
      listenerClosed = true;
      closePromise = Promise.resolve();
      return closePromise;
    }
    closePromise = new Promise((resolve) => {
      const finishClose = () => {
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

function isAuthorizedFrameRequest(request, expectedOrigin, expectedTokenDigest) {
  if (!hasOneExactHeader(request, 'origin', expectedOrigin)
    || !hasOneExactHeader(request, 'sec-fetch-site', 'same-origin')
    || !hasOneExactHeader(request, 'sec-fetch-mode', 'cors')
    || !hasOneExactHeader(request, 'sec-fetch-dest', 'empty')
    || request.headers.referer !== undefined
    || request.headers.range !== undefined
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
    if (candidate !== null) candidate.fill(0);
    if (candidateDigest !== null) candidateDigest.fill(0);
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
    : copyBoundedBytes(value, label, 1, maximumBytes);
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes) {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
    throw new Error(`${label} is outside its byte bound`);
  }
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    bytes.fill(0);
    throw new Error(`${label} must be strict UTF-8`, { cause: error });
  }
  if (decoded.includes('\u0000')) {
    bytes.fill(0);
    throw new Error(`${label} must not contain NUL`);
  }
  return bytes;
}

function copyBoundedBytes(value, label, minimumBytes, maximumBytes) {
  if (!(value instanceof Uint8Array)
    || value.byteLength < minimumBytes
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
