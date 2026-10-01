import assert from 'node:assert/strict';
import { listAvailableModels } from '../llm-translator-chrome-extention/js/model-list.mjs';

const requests = [];
const fetcher = async (url, options) => {
  requests.push({ url, options });
  return {
    ok: true,
    json: async () => ({ data: [
      { id: 'gpt-6.1-sol' }, { id: 'gpt-4.1-nano' },
      { id: 'gpt-6.1-sol' }, { id: '  ' }, { name: 'ignored' }
    ] })
  };
};

assert.deepEqual(await listAvailableModels({
  apiProvider: 'openai', apiUrl: 'https://api.openai.com/v1', apiKey: 'test-key'
}, fetcher), ['gpt-4.1-nano', 'gpt-6.1-sol']);
assert.equal(requests[0].url, 'https://api.openai.com/v1/models');
assert.equal(requests[0].options.method, 'GET');
assert.equal(requests[0].options.headers.Authorization, 'Bearer test-key');

assert.deepEqual(await listAvailableModels({
  apiProvider: 'ollama', apiUrl: 'http://localhost:11434/v1/', apiKey: ''
}, fetcher), ['gpt-4.1-nano', 'gpt-6.1-sol']);
assert.equal(requests[1].url, 'http://localhost:11434/v1/models');
assert.deepEqual(requests[1].options.headers, {});

assert.deepEqual(await listAvailableModels({
  apiProvider: 'lmstudio', apiUrl: 'http://localhost:1234/v1/', apiKey: ''
}, fetcher), ['gpt-4.1-nano', 'gpt-6.1-sol']);
assert.equal(requests[2].url, 'http://localhost:1234/v1/models');

await assert.rejects(listAvailableModels({
  apiProvider: 'openai', apiUrl: 'https://api.openai.com/v1/', apiKey: ''
}, fetcher), /API 키/);
await assert.rejects(listAvailableModels({
  apiProvider: 'ollama', apiUrl: 'file:///tmp/', apiKey: ''
}, fetcher), /http 또는 https/);
await assert.rejects(listAvailableModels({
  apiProvider: 'ollama', apiUrl: 'http://localhost:11434/v1/', apiKey: ''
}, async () => ({ ok: true, json: async () => ({ models: [] }) })), /응답 형식/);
await assert.rejects(listAvailableModels({
  apiProvider: 'openai', apiUrl: 'https://api.openai.com/v1/', apiKey: 'test-key'
}, async () => ({
  ok: false, status: 401, statusText: 'Unauthorized',
  json: async () => ({ error: { message: 'Invalid API key' } })
})), /API 오류 \(401\): Invalid API key/);

console.log('model listing across providers: ok');
