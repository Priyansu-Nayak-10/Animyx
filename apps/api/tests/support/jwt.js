const crypto = require('crypto');

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createHs256Token(payload, secret = 'test-secret') {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

module.exports = { createHs256Token };
