import assert from 'node:assert/strict';
import {
  createChatCompletionBody,
  formatApiError
} from '../llm-translator-chrome-extention/js/chat-completion.mjs';

const messages = [{ role: 'user', content: 'hello' }];

for (const model of ['gpt-5', 'gpt-5-mini', 'gpt-6', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-2026-10-01', 'gpt-10']) {
  for (const stream of [false, true]) {
    const body = createChatCompletionBody({ apiProvider: 'openai', apiModel: model }, messages, 100, stream);
    assert.equal('temperature' in body, false, model);
    assert.equal(body.max_completion_tokens, 100);
    assert.equal(body.stream, stream || undefined);
  }
}

assert.deepEqual(
  createChatCompletionBody({ apiProvider: 'openai', apiModel: 'gpt-5.6' }, messages, 100, true),
  { model: 'gpt-5.6', messages, max_completion_tokens: 100, stream: true }
);

assert.deepEqual(
  createChatCompletionBody({ apiProvider: 'openai', apiModel: 'gpt-4.1-nano' }, messages, 100),
  { model: 'gpt-4.1-nano', messages, max_completion_tokens: 100, temperature: 0.8 }
);

assert.deepEqual(
  createChatCompletionBody({ apiProvider: 'ollama', apiModel: 'llama3.2' }, messages, 100),
  { model: 'llama3.2', messages, max_tokens: 100, temperature: 0.8 }
);

assert.equal(
  formatApiError(400, 'Bad Request', { error: { message: 'Unsupported parameter' } }),
  'API 오류 (400): Unsupported parameter'
);

assert.equal(formatApiError(503, 'Service Unavailable'), 'API 오류 (503 Service Unavailable)');

console.log('chat completion request compatibility: ok');
