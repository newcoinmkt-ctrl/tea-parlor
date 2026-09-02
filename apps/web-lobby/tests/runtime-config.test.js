import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeConfigScript } from '../server.js';

test('production runtime-config does not fall back to 127.0.0.1:5190', () => {
  const js = buildRuntimeConfigScript({
    NODE_ENV: 'production',
    COLYSEUS_URL: 'wss://colyseus.example',
    OPS_PUBLIC_URL: 'https://ops.example',
    API_GATEWAY_PUBLIC_URL: 'https://gateway.example/',
  });
  assert.match(js, /TEA_PARLOR_COLYSEUS_URL = "wss:\/\/colyseus.example"/);
  assert.match(js, /TEA_PARLOR_OPS_URL = "https:\/\/ops.example"/);
  assert.match(js, /TEA_PARLOR_API_GATEWAY_URL = "https:\/\/gateway.example"/);
  assert.equal(js.includes('127.0.0.1:5190'), false);
});

test('production empty public URLs emit empty strings, not localhost', () => {
  const js = buildRuntimeConfigScript({ NODE_ENV: 'production' });
  assert.match(js, /TEA_PARLOR_OPS_URL = ""/);
  assert.match(js, /TEA_PARLOR_API_GATEWAY_URL = ""/);
  assert.equal(js.includes('127.0.0.1:5190'), false);
  assert.equal(js.includes('127.0.0.1:3000'), false);
});

test('dev still defaults ops and gateway to localhost', () => {
  const js = buildRuntimeConfigScript({ NODE_ENV: 'development' });
  assert.match(js, /TEA_PARLOR_OPS_URL = "http:\/\/127.0.0.1:5190"/);
  assert.match(js, /TEA_PARLOR_API_GATEWAY_URL = "http:\/\/127.0.0.1:3000"/);
});
