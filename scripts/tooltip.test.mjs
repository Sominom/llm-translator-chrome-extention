import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor() { this.style = {}; this.children = []; this.listeners = {}; this.attributes = {}; this.popoverOpen = false; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = value; }
  matches(selector) { return selector === ':popover-open' && this.popoverOpen; }
  showPopover() { assert.equal(this.attributes.popover, 'manual'); this.popoverOpen = true; }
  hidePopover() { this.popoverOpen = false; }
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
  const copied = [];
  const clipboard = { writeText: async text => { copied.push(text); } };
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
    document, window, chrome, URL, navigator: { clipboard }, console: { log() {}, error() {} },
    requestAnimationFrame: callback => callback(), setTimeout
  });
  await window.emit('load');
  return {
    document, window, requests, copied, clipboard,
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
assert.equal(instant.element('translation-tooltip').popoverOpen, true);
await instant.select('Hello 世界');
assert.equal(instant.requests.length, 2, 'same text can be selected again');

const copyButton = instant.element('translation-tooltip').children.find(child => child.id === 'tooltip-copy-btn');
assert.equal(copyButton.disabled, true, 'in-progress text must not be copied');
await copyButton.emit('click');
assert.deepEqual(instant.copied, []);
const translated = '첫 문단\n\n1. 첫 항목\n2. <b>문자 그대로</b>';
instant.requests[1].callbacks.onComplete(translated);
assert.equal(copyButton.disabled, false);
await copyButton.emit('click');
assert.deepEqual(instant.copied, [translated], 'copy preserves paragraphs and literal markup');
assert.equal(copyButton.textContent, '복사됨');
instant.clipboard.writeText = async () => { throw new Error('Clipboard denied'); };
await copyButton.emit('click');
assert.equal(copyButton.textContent, '복사 실패 · 재시도');
await instant.select('Another paragraph');
assert.equal(copyButton.disabled, true);
assert.equal(copyButton.textContent, '복사');

const icon = await harness({ tooltipMode: 'icon' });
await icon.select('Hello 世界');
const trigger = icon.element('translation-tooltip-trigger');
assert.equal(trigger.style.display, 'block');
assert.equal(trigger.popoverOpen, true);
assert.equal(trigger.style.left, '210px');
assert.equal(trigger.style.top, '56px');
icon.window.scrollX = 500;
icon.window.scrollY = 300;
await icon.document.emit('scroll');
assert.equal(trigger.style.left, '210px', 'top-layer position uses viewport coordinates');
assert.equal(trigger.style.top, '56px');
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
assert.equal(trigger.popoverOpen, false);
assert.equal(icon.element('translation-tooltip').popoverOpen, true);
await trigger.emit('click');
assert.equal(icon.requests.length, 1, 'repeated click must not send a duplicate');
await icon.select('Replacement');
icon.requests[0].callbacks.onComplete('stale response');
assert.notEqual(icon.element('translation-tooltip').children[0].textContent, 'stale response');
await icon.document.emit('keydown', { key: 'Escape' });
assert.equal(trigger.style.display, 'none');
assert.equal(icon.element('translation-tooltip').popoverOpen, false);
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
