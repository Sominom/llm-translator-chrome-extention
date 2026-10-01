import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(value = '') {
    this.value = value;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  async emit(type) {
    for (const callback of this.listeners[type] || []) await callback({ target: this });
  }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; this.value = ''; }
  get options() { return this.children; }
  getAttribute(name) { return name === 'data-tab' ? 'settings' : null; }
}

const provider = new Element('openai');
const url = new Element('https://api.openai.com/v1/');
const key = new Element('saved-key');
const model = new Element();
const refresh = new Element();
const status = new Element();
const save = new Element();
const settingsButton = new Element();
const settingsTab = new Element();
const nodes = new Map([
  ['#api-provider', provider], ['#api-url', url], ['#api-key', key],
  ['#api-model', model], ['#refresh-models', refresh],
  ['#model-list-status', status], ['#save-settings', save],
  ['[data-tab="settings"]', settingsButton], ['#settings-tab', settingsTab]
]);
const document = {
  listeners: {},
  querySelector: selector => nodes.get(selector) || null,
  querySelectorAll: selector => selector === '.tab-button' ? [settingsButton]
    : selector === '.tab-content' ? [settingsTab] : [],
  createElement: () => new Element(),
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
};
const requests = [];
const chrome = {
  runtime: {
    lastError: null,
    onMessage: { addListener() {} },
    sendMessage(message, callback) { requests.push({ message, callback }); }
  },
  storage: { local: { get(_keys, callback) { callback({ disabledSites: [] }); } } }
};
const window = { translationAPI: { getSettings: async () => ({
  apiProvider: 'openai', apiUrl: 'https://api.openai.com/v1/',
  apiKey: 'saved-key', apiModel: 'gpt-6-astra'
}) } };

vm.runInNewContext(readFileSync(new URL('../llm-translator-chrome-extention/js/sidepanel.js', import.meta.url), 'utf8'), {
  document, window, chrome, navigator: { userAgent: 'Windows' }, URL,
  setTimeout, console: { log() {}, error() {} }, alert: message => { throw new Error(message); }
});
for (const callback of document.listeners.DOMContentLoaded) callback();
await new Promise(resolve => setImmediate(resolve));
assert.equal(model.value, 'gpt-6-astra', 'saved model is preserved before lookup');

await settingsButton.emit('click');
assert.equal(requests[0].message.action, 'listModels');
assert.equal(requests[0].message.settings.apiKey, 'saved-key');
requests[0].callback({ success: true, models: ['gpt-4.1-nano', 'gpt-6-astra'] });
assert.deepEqual(model.options.map(option => option.value), ['', 'gpt-4.1-nano', 'gpt-6-astra']);
assert.equal(model.value, 'gpt-6-astra');

key.value = 'new-key';
await key.emit('input');
assert.deepEqual(model.options.map(option => option.value), ['', 'gpt-6-astra']);
assert.match(status.textContent, /다시 조회/);

provider.value = 'lmstudio';
await provider.emit('change');
assert.equal(model.value, '');
assert.equal(requests[1].message.settings.apiUrl, 'http://localhost:1234/v1/');
provider.value = 'ollama';
await provider.emit('change');
assert.equal(requests[2].message.settings.apiUrl, 'http://localhost:11434/v1/');
requests[1].callback({ success: true, models: ['stale-model'] });
assert.equal(model.options.length, 1, 'stale lookup does not change options');
requests[2].callback({ success: true, models: ['llama3.2'] });
assert.deepEqual(model.options.map(option => option.value), ['', 'llama3.2']);
model.value = 'llama3.2';
await save.emit('click');
assert.equal(requests[3].message.action, 'saveSettings');
assert.equal(requests[3].message.settings.apiModel, 'llama3.2');

console.log('model selector loading and provider changes: ok');
