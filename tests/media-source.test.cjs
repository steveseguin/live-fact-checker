const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');

const html = fs.readFileSync(process.env.FACT_CHECKER_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function app() {
    const elements = new Map(), events = new Map(), requests = [], urls = [], revoked = [];
    function element(id) {
        if (!elements.has(id)) elements.set(id, {
            id, value: id === 'ai-provider' ? 'openai' : id === 'fact-check-sensitivity' ? '5' : '',
            style: {}, srcObject: null, src: '', disabled: true,
            classList: { add() {}, toggle() {}, contains() { return false; } },
            addEventListener(name, fn) { events.set(`${this.id}:${name}`, fn); },
            appendChild() {}, insertBefore() {}, play() {}, pause() {}, click() {},
            removeAttribute(name) { if (name === 'src') this.src = ''; }
        });
        return elements.get(id);
    }
    let elementId = 0;
    const context = {
        document: { getElementById: element, querySelector: element, body: element('body'), createElement: () => element(`new-${++elementId}`) },
        window: { addEventListener: (name, fn) => events.set(`window:${name}`, fn) },
        navigator: { mediaDevices: { getUserMedia: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })) } },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        URL: { createObjectURL(file) { const url = `blob:test-${urls.length}`; urls.push({ file, url }); return url; }, revokeObjectURL: url => revoked.push(url) },
        console: { error() {} }, setTimeout() {}, alert() {}, confirm: () => true,
        fetch() { throw new Error('Network requests are forbidden in media-source tests'); }
    };
    vm.createContext(context);
    vm.runInContext(code, context);
    const stream = label => ({ label, tracks: [0, 1].map(() => ({ stopped: 0, stop() { this.stopped++; } })), getTracks() { return this.tracks; } });
    return { element, requests, urls, revoked, stream,
        webcam: () => events.get('use-webcam-btn:click')(),
        file: name => events.get('video-file-input:change')({ target: { files: [{ name }] } }),
        cancelFile: () => events.get('video-file-input:change')({ target: { files: [] } }),
        unload: () => events.get('window:beforeunload')(),
        state: () => vm.runInContext('({mediaStream, currentMediaType})', context)
    };
}
function stopped(stream, count) { stream.tracks.forEach(track => assert.equal(track.stopped, count)); }
async function webcam(a, label = 'camera') {
    const promise = a.webcam(), stream = a.stream(label);
    a.requests.at(-1).resolve(stream);
    await promise;
    return stream;
}

test('initial file selection attaches its object URL', () => {
    const a = app(); a.file('first.mp4');
    assert.equal(a.element('video-element').src, a.urls[0].url);
    assert.equal(a.element('video-element').srcObject, null);
    assert.equal(a.state().currentMediaType, 'video');
    assert.equal(a.element('start-btn').disabled, false);
});
test('initial webcam selection attaches the returned stream', async () => {
    const a = app(), stream = await webcam(a);
    assert.equal(a.element('video-element').srcObject, stream);
    assert.equal(a.state().mediaStream, stream); stopped(stream, 0);
    assert.equal(a.state().currentMediaType, 'webcam');
});
test('switching webcam to file detaches and stops the old stream', async () => {
    const a = app(), stream = await webcam(a); a.file('chosen.mp4');
    assert.equal(a.element('video-element').srcObject, null);
    assert.equal(a.element('video-element').src, a.urls[0].url);
    assert.equal(a.state().mediaStream, null); stopped(stream, 1);
});
test('switching file to webcam releases the obsolete file URL', async () => {
    const a = app(); a.file('first.mp4'); const stream = await webcam(a);
    assert.equal(a.element('video-element').srcObject, stream);
    assert.equal(a.element('video-element').src, '');
    assert.deepEqual(a.revoked, [a.urls[0].url]);
});
test('replacing a webcam stops the previous stream only', async () => {
    const a = app(), first = await webcam(a, 'first'), second = await webcam(a, 'second');
    stopped(first, 1); stopped(second, 0);
    assert.equal(a.element('video-element').srcObject, second);
});
test('replacing a file revokes only the previous URL', () => {
    const a = app(); a.file('first.mp4'); a.file('second.mp4');
    assert.deepEqual(a.revoked, [a.urls[0].url]);
    assert.equal(a.element('video-element').src, a.urls[1].url);
});
test('a late webcam success cannot replace a newer file selection', async () => {
    const a = app(), pending = a.webcam(); a.file('newer.mp4');
    const stale = a.stream('stale'); a.requests[0].resolve(stale); await pending;
    assert.equal(a.element('video-element').srcObject, null);
    assert.equal(a.element('video-element').src, a.urls[0].url);
    assert.equal(a.state().currentMediaType, 'video'); stopped(stale, 1);
    assert.match(a.element('status-message').textContent, /^Video loaded/);
});
test('a late webcam failure cannot overwrite newer file status', async () => {
    const a = app(), pending = a.webcam(); a.file('newer.mp4');
    a.requests[0].reject(new Error('Permission denied')); await pending;
    assert.match(a.element('status-message').textContent, /^Video loaded/);
});
for (const order of [[0, 1], [1, 0]]) {
    test(`latest webcam request wins when promises resolve ${order.join(' then ')}`, async () => {
        const a = app(), pending = [a.webcam(), a.webcam()], streams = [a.stream('old'), a.stream('new')];
        for (const i of order) { a.requests[i].resolve(streams[i]); await pending[i]; }
        assert.equal(a.element('video-element').srcObject, streams[1]);
        stopped(streams[0], 1); stopped(streams[1], 0);
    });
}
test('failed replacement webcam keeps the current file usable', async () => {
    const a = app(); a.file('current.mp4'); const pending = a.webcam();
    a.requests[0].reject(new Error('Device unavailable')); await pending;
    assert.equal(a.element('video-element').src, a.urls[0].url);
    assert.equal(a.state().currentMediaType, 'video'); assert.deepEqual(a.revoked, []);
    assert.match(a.element('status-message').textContent, /Device unavailable/);
});
test('failed replacement webcam keeps the current webcam usable', async () => {
    const a = app(), current = await webcam(a), pending = a.webcam();
    a.requests[1].reject(new Error('Device unavailable')); await pending;
    assert.equal(a.element('video-element').srcObject, current); stopped(current, 0);
});
test('unload releases the current file URL once', () => {
    const a = app(); a.file('current.mp4'); a.unload(); a.unload();
    assert.deepEqual(a.revoked, [a.urls[0].url]);
});
test('unload releases the current webcam once', async () => {
    const a = app(), current = await webcam(a); a.unload(); a.unload();
    stopped(current, 1); assert.equal(a.element('video-element').srcObject, null);
});
test('webcam completion after unload is stopped without attachment', async () => {
    const a = app(), pending = a.webcam(); a.unload();
    const late = a.stream('late'); a.requests[0].resolve(late); await pending;
    stopped(late, 1); assert.equal(a.element('video-element').srcObject, null);
});
test('cancelled file picker preserves a pending webcam selection', async () => {
    const a = app(), pending = a.webcam(), stream = a.stream('camera');
    a.cancelFile(); a.requests[0].resolve(stream); await pending;
    assert.equal(a.element('video-element').srcObject, stream); stopped(stream, 0);
});
