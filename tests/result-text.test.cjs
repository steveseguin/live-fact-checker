const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync(process.env.FACT_CHECKER_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function app(saved = {}) {
    const elements = new Map(), events = new Map(), timers = [], requests = [], downloads = [];
    const storage = new Map(Object.entries({ audioFeedback: 'false', ...saved }));
    let sequence = 0;
    function element(id) {
        if (!elements.has(id)) {
            let markup = '';
            elements.set(id, {
                id, value: id === 'ai-provider' ? 'openai' : id === 'fact-check-sensitivity' ? '5' : '',
                style: {}, children: [], className: '',
                classList: { add() {}, toggle() {}, contains() { return false; } },
                set innerHTML(value) { markup = value; this.children = []; },
                get innerHTML() { return markup; },
                get outerHTML() { return `<div class="${this.className}">${markup}</div>`; },
                addEventListener(name, fn) { events.set(`${this.id}:${name}`, fn); },
                appendChild(child) { this.children.push(child); },
                removeChild(child) { this.children = this.children.filter(item => item !== child); },
                insertBefore() {}, play() {}, pause() {}, click() { events.get(`${this.id}:click`)?.(); }
            });
        }
        return elements.get(id);
    }
    const context = {
        document: { getElementById: element, querySelector: element, body: element('body'), createElement: () => element(`created-${++sequence}`) },
        window: { addEventListener() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
        console: { error() {} }, setTimeout: fn => timers.push(fn), Date, Blob,
        URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:test-only'; }, revokeObjectURL() {} },
        fetch: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
        alert() {}, confirm: () => true
    };
    vm.createContext(context);
    vm.runInContext(code, context);
    return { context, element, events, timers, storage, requests, downloads,
        run: source => vm.runInContext(source, context),
        display(statement, result) { context.statement = statement; context.result = result; return vm.runInContext('displayFactCheckResult(statement, result)', context); },
        notes: () => JSON.parse(storage.get('factCheckerNotes'))
    };
}
function escaped(text) {
    return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
const cases = [
    ['plain text', 'A normal factual statement'],
    ['HTML element notation', 'The <b> element marks bold text'],
    ['angle brackets and ampersands', '1 < 2 & 3 > 2'],
    ['literal entity', 'The entity &lt; denotes less-than'],
    ['quotes and Unicode', '"It\'s valid" — café 日本語'],
    ['event-bearing markup', '<img src="missing" onerror="window.testMarker = true">'],
    ['closing-tag markup', '</p><svg onload="window.testMarker = true"></svg><p>']
];
for (const [name, text] of cases) {
    test(`render ${name} as text in current result and history`, () => {
        const a = app(); a.display(text, `TRUE: ${text}`);
        const current = a.element('fact-check-result').innerHTML;
        const history = a.element('notes-list').children[0].innerHTML;
        for (const markup of [current, history]) {
            assert.ok(markup.includes(`<p><em>"${escaped(text)}"</em></p>`));
            assert.ok(markup.includes(`<p>${escaped(text)}</p>`));
        }
        assert.equal(a.notes()[0].statement, text);
        assert.equal(a.notes()[0].result, text);
    });
    test(`reload preserves ${name} as text and history clicks keep it escaped`, () => {
        const a = app(); a.display(text, `TRUE: ${text}`);
        const b = app({ factCheckerNotes: a.storage.get('factCheckerNotes') });
        const history = b.element('notes-list').children[0];
        assert.ok(history.innerHTML.includes(`<p>${escaped(text)}</p>`));
        history.click();
        assert.ok(b.element('fact-check-result').innerHTML.includes(`<p>${escaped(text)}</p>`));
        assert.equal(b.notes()[0].result, text);
    });
}
test('result classifications and confidence remain unchanged', () => {
    for (const [result, status, confidence] of [['TRUE: Yes', 'TRUE', 90], ['FALSE: No', 'FALSE', 10], ['UNCERTAIN: Maybe', 'UNCERTAIN', 50]]) {
        const a = app(); a.display('Ordinary statement', result);
        assert.equal(a.notes()[0].resultStatus, status);
        assert.equal(a.notes()[0].confidenceLevel, confidence);
        assert.match(a.element('fact-check-result').innerHTML, new RegExp(`width: ${confidence}%`));
    }
});
test('export preserves original text rather than HTML entities', async () => {
    const a = app(), text = '<b>A & B</b>'; a.display(text, `TRUE: ${text}`);
    a.events.get('export-btn:click')();
    const exported = await a.downloads[0].text();
    assert.ok(exported.includes(`Statement: "${text}"`));
    assert.ok(exported.includes(`Analysis: ${text}`));
    assert.ok(!exported.includes('&lt;'));
});
test('legacy history without resultClass or confidence still renders', () => {
    const note = { statement: '<b>legacy</b>', result: 'A & B', isTrue: true, timestamp: '12:00' };
    const a = app({ factCheckerNotes: JSON.stringify([note]) });
    const history = a.element('notes-list').children[0];
    assert.equal(history.className, 'note-item true');
    assert.ok(history.innerHTML.includes('TRUE - 12:00'));
    assert.ok(history.innerHTML.includes('&lt;b&gt;legacy&lt;/b&gt;'));
    assert.ok(history.innerHTML.includes('A &amp; B'));
});
test('clearing history still removes saved notes', () => {
    const a = app(); a.display('<b>statement</b>', 'TRUE: result');
    a.events.get('clear-notes-btn:click')();
    assert.equal(a.element('notes-list').children.length, 0);
    assert.equal(a.storage.has('factCheckerNotes'), false);
});
test('queued model response reaches both escaped render surfaces', async () => {
    const a = app(), statement = '<b>A complete test statement</b>', result = '<img src="missing" onerror="window.testMarker = true">';
    a.element('api-key').value = 'synthetic-test-only';
    a.context.input = statement; a.run('processTranscript(input)');
    assert.equal(a.requests.length, 1);
    a.requests[0].resolve({ ok: true, json: async () => ({ choices: [{ message: { content: `FALSE: ${result}` } }] }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(a.element('fact-check-result').innerHTML.includes(escaped(result)));
    assert.ok(a.element('notes-list').children[0].innerHTML.includes(escaped(result)));
    assert.equal(a.notes()[0].statement, statement);
    assert.equal(a.notes()[0].result, result);
});

module.exports = { app };
