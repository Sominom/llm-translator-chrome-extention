import assert from 'node:assert/strict';

globalThis.window = {};

const listeners = new Set();
const sentMessages = [];
globalThis.chrome = {
  runtime: {
    lastError: null,
    onMessage: {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener)
    },
    sendMessage: (message, callback) => {
      sentMessages.push(message);
      callback?.({ success: true });
    }
  }
};

await import('../llm-translator-chrome-extention/js/api.js');

const translation = window.translationAPI.translateWithStream('hello');
const canceled = assert.rejects(translation, (error) => error.name === 'AbortError');
const chat = window.translationAPI.chatWithStream([{ role: 'user', content: 'hello' }]);

window.translationAPI.cancelAllTranslations();
await canceled;

assert.equal(sentMessages.filter((message) => message.action === 'cancelTranslation').length, 1);

const chatRequest = sentMessages.find((message) => message.action === 'chatStream');
for (const listener of [...listeners]) {
  listener({ action: 'chatStream', requestId: chatRequest.requestId, type: 'complete' });
}
await chat;

console.log('request cancellation: ok');
