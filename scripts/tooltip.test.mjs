import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor() { this.style = {}; this.children = []; this.listeners = {}; }
  appendChild(child) { this.children.push(child); }
  setAttribute() {}
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  async emit(type, details = {}) {
    const event = { target: this, preventDefault() {}, stopPropagation() {}, ...details };
    for (const callback of this.listeners[type] || []) await callback(event);
  }
  contains(target) { return target === this || this.children.some(child => child.contains(target)); }
  getBoundingClientRect() { return { width: 34, height: 34 }; }
}

async function harness(settings = {}) {
  const document = new Element();
  document.head = new Element();
  document.body = new Element();
  document.createElement = () => new Element();
  const window = new Element();
  const requests = [];
  const range = {
    cloneRange: () => range,
    getClientRects: () => [{ left: 100, right: 200, top: 100, bottom: 120, width: 100, height: 20 }]
  };
  let text = '';
  Object.assign(window, {
    location: { href: 'https://example.com/article' },
    scrollX: 0, scrollY: 0, innerWidth: 1024, innerHeight: 768,
    getSelection: () => ({ toString: () => text, isCollapsed: !text, rangeCount: text ? 1 : 0, getRangeAt: () => range }),
    translationAPI: {
      getSettings: async () => settings,
      cancelAllTranslations() {},
      translateWithStream: async (value, callbacks) => { requests.push({ value, callbacks }); }
    }
  });
  let receive;
  const chrome = { runtime: { getURL: path => path, onMessage: { addListener: callback => { receive = callback; } } } };
  vm.runInNewContext(readFileSync(new URL('../llm-translator-chrome-extention/js/tooltip.js', import.meta.url), 'utf8'), {
    document, window, chrome, URL, console: { log() {}, error() {} },
    requestAnimationFrame: callback => callback(), setTimeout
  });
  await window.emit('load');
  return {
    document, window, requests,
    element: id => document.body.children.find(child => child.id === id),
    update: settings => receive({ action: 'settingsUpdated', settings }, {}, () => {}),
    async select(value) {
      await document.emit('mousedown');
      text = value;
      await document.emit('selectionchange');
      await document.emit('mouseup');
    }
  };
}

const instant = await harness();
await instant.select('Hello 世界');
assert.equal(instant.requests.length, 1);
assert.equal(instant.requests[0].value, 'Hello 世界');
await instant.select('Hello 世界');
assert.equal(instant.requests.length, 2, 'same text can be selected again');

const icon = await harness({ tooltipMode: 'icon' });
await icon.select('Hello 世界');
const trigger = icon.element('translation-tooltip-trigger');
assert.equal(trigger.style.display, 'block');
assert.equal(icon.requests.length, 0, 'selection alone must not call the API');
await documentEventOnTrigger();
async function documentEventOnTrigger() {
  await trigger.emit('mousedown');
  await icon.document.emit('mousedown', { target: trigger });
  await icon.document.emit('mouseup', { target: trigger });
  await trigger.emit('click');
}
assert.equal(icon.requests.length, 1);
assert.equal(icon.requests[0].value, 'Hello 世界');
assert.equal(trigger.style.display, 'none');
await trigger.emit('click');
assert.equal(icon.requests.length, 1, 'repeated click must not send a duplicate');
await icon.select('Replacement');
icon.requests[0].callbacks.onComplete('stale response');
assert.notEqual(icon.element('translation-tooltip').children[0].textContent, 'stale response');
await icon.document.emit('keydown', { key: 'Escape' });
assert.equal(trigger.style.display, 'none');
await trigger.emit('click');
assert.equal(icon.requests.length, 1);
await icon.select('New selection');
await trigger.emit('click');
assert.equal(icon.requests.at(-1).value, 'New selection');

icon.update({ tooltipMode: 'instant' });
await icon.select('Direct');
assert.equal(icon.requests.at(-1).value, 'Direct');
icon.update({ isTooltipEnabled: false });
const count = icon.requests.length;
await icon.select('Disabled');
assert.equal(icon.requests.length, count);
icon.update({ isTooltipEnabled: true, tooltipMode: 'icon', disabledSites: ['example.com'] });
await icon.select('Excluded');
assert.equal(trigger.style.display, 'none');
assert.equal(icon.requests.length, count);

const disabled = await harness({ isTooltipEnabled: false });
disabled.update({ isTooltipEnabled: true, tooltipMode: 'icon' });
disabled.update({ isTooltipEnabled: true });
await disabled.select('Enabled without reloading');
await disabled.element('translation-tooltip-trigger').emit('click');
assert.equal(disabled.requests.length, 1, 'enabling should initialize listeners exactly once');
console.log('tooltip modes and selection lifecycle: ok');
