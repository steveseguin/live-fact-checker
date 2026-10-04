const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const html = fs.readFileSync(process.env.FACT_CHECKER_HTML || path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function app(saved={}) {
 const els=new Map(),events={},requests=[],timers=[]; const storage=new Map(Object.entries(saved));
 function el(id){if(!els.has(id))els.set(id,{id,value:id==='ai-provider'?'openai':id==='fact-check-sensitivity'?'5':'',style:{},classList:{add(){},toggle(){},contains(){return false}},addEventListener(n,fn){events[this.id+':'+n]=fn},appendChild(){},insertBefore(){},play(){},pause(){}});return els.get(id)}
 const context={document:{getElementById:el,createElement:()=>el('new-'+Math.random()),querySelector:el,body:el('body')},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},console:{error(){}},setTimeout:fn=>timers.push(fn),fetch:async(...args)=>{requests.push(args);return {ok:true,json:async()=>({response:'TRUE: Test response',choices:[{message:{content:'TRUE: Test response'}}]})}},Date,URL,Blob,alert(){},confirm:()=>true};vm.createContext(context);vm.runInContext(code,context);storage.set('audioFeedback','false');return {context,el,events,requests,timers,run:s=>vm.runInContext(s,context)};
}

const tick = () => new Promise(resolve => setImmediate(resolve));
for (const provider of ['openai', 'xai', 'anthropic', 'ollama', 'custom']) {
 test(`reload preserves ${provider} model and endpoint overrides`, () => {
  const a=app({factCheckerApiProvider:provider,factCheckerApiModel:'chosen-model',factCheckerApiEndpoint:'http://example.test/chosen',factCheckerApiKey:'fake-test-only'});
  assert.equal(a.el('ai-provider').value,provider);
  assert.equal(a.el('api-model').value,'chosen-model');
  assert.equal(a.el('api-endpoint').value,'http://example.test/chosen');
  assert.equal(a.el('api-key').value,'fake-test-only');
 });
}
for (const provider of ['openai','xai','anthropic','custom']) {
 test(`${provider} still requires a key`, async () => {
  const a=app({factCheckerApiProvider:provider});
  await a.run("processTranscript('This statement has enough words')"); await tick();
  assert.equal(a.requests.length,0);
  assert.match(a.el('status-message').textContent,/API key is required/);
 });
}
test('keyless Ollama reaches fake endpoint and displays response',async()=>{
 const a=app({factCheckerApiProvider:'ollama',factCheckerApiModel:'chosen-local',factCheckerApiEndpoint:'http://example.test/local'});
 await a.run("processTranscript('This statement has enough words')"); await tick();
 assert.equal(a.requests.length,1);
 const [url,options]=a.requests[0];
 assert.equal(url,'http://example.test/local');
 assert.equal(options.headers.Authorization,undefined);
 assert.equal(JSON.parse(options.body).model,'chosen-local');
 assert.equal(JSON.parse(options.body).stream,false);
 assert.match(a.el('fact-check-result').innerHTML,/Test response/);
});
test('optional Ollama key is preserved for authenticated endpoints',async()=>{
 const a=app({factCheckerApiProvider:'ollama',factCheckerApiKey:'fake-test-only'});
 await a.run("processTranscript('This statement has enough words')"); await tick();
 assert.equal(a.requests[0][1].headers.Authorization,'Bearer fake-test-only');
});
test('OpenAI request still includes bearer key',async()=>{
 const a=app({factCheckerApiKey:'fake-test-only'});
 await a.run("processTranscript('This statement has enough words')"); await tick();
 assert.equal(a.requests[0][1].headers.Authorization,'Bearer fake-test-only');
 assert.match(a.el('fact-check-result').innerHTML,/Test response/);
});
test('provider defaults fill missing settings and user provider changes reset defaults',()=>{
 const a=app({factCheckerApiProvider:'ollama'});
 assert.equal(a.el('api-model').value,'llama3');
 assert.equal(a.el('api-endpoint').value,'http://localhost:11434/api/generate');
 a.el('ai-provider').value='xai';a.events['ai-provider:change']();
 assert.equal(a.el('api-model').value,'grok-beta');
 assert.equal(a.el('api-endpoint').value,'https://api.xai.com/v1/chat/completions');
});
test('legacy overrides without saved provider are retained',()=>{
 const a=app({factCheckerApiModel:'legacy-model',factCheckerApiEndpoint:'http://example.test/legacy'});
 assert.equal(a.el('api-model').value,'legacy-model');
 assert.equal(a.el('api-endpoint').value,'http://example.test/legacy');
});
test('Save Settings round-trip preserves a selected local model and endpoint',()=>{
 const a=app();
 a.el('ai-provider').value='ollama';a.events['ai-provider:change']();
 a.el('api-model').value='chosen-local';
 a.el('api-endpoint').value='http://example.test/custom-local';
 a.events['save-settings-btn:click']();
 const saved=Object.fromEntries(['factCheckerApiProvider','factCheckerApiModel','factCheckerApiEndpoint','factCheckerApiKey'].map(key=>[key,a.context.localStorage.getItem(key)]));
 const reloaded=app(saved);
 assert.equal(reloaded.el('ai-provider').value,'ollama');
 assert.equal(reloaded.el('api-model').value,'chosen-local');
 assert.equal(reloaded.el('api-endpoint').value,'http://example.test/custom-local');
 assert.equal(reloaded.el('api-key').value,'');
});
