import assert from 'node:assert/strict';
import { createChatCompletionBody } from '../llm-translator-chrome-extention/js/chat-completion.mjs';

const messages = [{ role: 'user', content: 'hello' }];

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

console.log('chat completion request compatibility: ok');
