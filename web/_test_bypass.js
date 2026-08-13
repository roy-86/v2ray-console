// Lightweight check: stacked balancer's bypass div should still carry the
// transport label (e.g. "WS / TLS"), which means JS rendering didn't break.

const fs = require('fs'); const vm = require('vm');
class Elem{constructor(){this.children=[];this.attrs={};this.style={};this._innerHTML='';this._textContent='';this.classList={add:()=>{},remove:()=>{},contains:()=>false,toggle:(c)=>{this.classList._set||(this.classList._set=new Set());if(c){this.classList._set.has(c)?this.classList._set.delete(c):this.classList._set.add(c);}}};}set innerHTML(v){this._innerHTML=v;}get innerHTML(){return this._innerHTML;}set textContent(v){this._textContent=v;}querySelector(){return null;}querySelectorAll(){return [];}addEventListener(){}removeEventListener(){}cloneNode(){return new Elem();}closest(){return null;}matches(){return false;}}
const _all=[];
const sandbox={document:{_all,addEventListener:()=>{},removeEventListener:()=>{},documentElement:{getAttribute:()=>'light'},getElementById(id){return _all.find(e=>e.attrs&&e.attrs.id===id)||null;},querySelectorAll(sel){if(sel&&sel.startsWith('.'))return _all.filter(e=>e.classList&&e.classList.contains(sel.slice(1)));return[];},querySelector:()=>null,createElement:()=>new Elem(),body:new Elem(),head:new Elem()},window:{addEventListener:()=>{},matchMedia:()=>({matches:false,addEventListener:()=>{}})},console,setTimeout,clearTimeout,setInterval,clearInterval,Promise,JSON,Math,Date:{now:()=>0},performance:{now:()=>0},Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set};
['flowVizCard','flowVizBody','flowVizHint','btnStart','btnStop','btnRestart','themeBtn','headerStatus','headerStatusText','statusHero','statusText','versionText','uptimeWrap','uptimeText','latencyWrap','latencyText','ovInbounds','ovInboundsDetail','ovOutbounds','ovOutboundsDetail','ovRules','ovRulesDetail','ovPorts','ovPortsDetail','configCharCount','saveBtn','formatBtn','copyBtn','exportBtn','importBtn','importFile','tabFormBtn','tabJsonBtn','formPanel','jsonPanel','emptyState','configForm','configEditor','jsonGutter','toast','ms'].forEach(id=>{const e=new Elem();e.attrs.id=id;_all.push(e);});
const cs=new Elem();cs.classList.add('flow-canvas');_all.push(cs);
vm.createContext(sandbox);
try { vm.runInContext(fs.readFileSync('/Users/roy/Code/v2ray-console/web/app.js','utf8'), sandbox); } catch(e) { console.log('LOAD ERR:', e.message); }

function runCase(name, config, expectations) {
  vm.runInContext(`
    state.inbounds = ${JSON.stringify(config.inbounds)};
    state.outbounds = ${JSON.stringify(config.outbounds)};
    state.routing = ${JSON.stringify(config.routing)};
    buildFlowViz();
  `, sandbox);
  const html = _all.find(e => e.attrs.id === 'flowVizBody')._innerHTML;
  let pass=0, fail=0;
  expectations.forEach(([label, re]) => {
    const ok = re.test(html);
    console.log((ok ? 'PASS  ' : 'FAIL  ') + '[' + name + '] ' + label);
    if (ok) pass++; else fail++;
  });
  return {pass, fail};
}

const cfg2 = {
  inbounds: [{protocol:'socks',port:10808}],
  outbounds: [
    {protocol:'vmess',tag:'a',settings:{vnext:[{address:'a.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}},
    {protocol:'vmess',tag:'b',settings:{vnext:[{address:'b.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}}
  ],
  routing: {settings:{
    domainStrategy:'AsIs',domainMatcher:'linear',
    balancers:[{tag:'bal',selector:['a','b'],strategy:{type:'roundRobin'}}],
    rules:[{type:'field',domain:['geosite:google'],balancerTag:'bal'}]
  }}
};
const cfg3 = {
  inbounds: [{protocol:'socks',port:10808}],
  outbounds: [
    {protocol:'vmess',tag:'a',settings:{vnext:[{address:'a.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}},
    {protocol:'vmess',tag:'b',settings:{vnext:[{address:'b.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}},
    {protocol:'vmess',tag:'c',settings:{vnext:[{address:'c.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}}
  ],
  routing: {settings:{
    domainStrategy:'AsIs',domainMatcher:'linear',
    balancers:[{tag:'bal',selector:['a','b','c'],strategy:{type:'roundRobin'}}],
    rules:[{type:'field',domain:['geosite:google'],balancerTag:'bal'}]
  }}
};
const cfgMerge = {
  inbounds: [{protocol:'socks',port:10808}],
  outbounds: [
    {protocol:'vmess',tag:'a',settings:{vnext:[{address:'a.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}},
    {protocol:'vmess',tag:'b',settings:{vnext:[{address:'b.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}},
    {protocol:'freedom',tag:'direct'}
  ],
  routing: {settings:{
    domainStrategy:'AsIs',domainMatcher:'linear',
    balancers:[{tag:'bal',selector:['a','b'],strategy:{type:'roundRobin'}}],
    rules:[
      {type:'field',domain:['geosite:google'],balancerTag:'bal'},
      {type:'field',domain:['geosite:cn'],outboundTag:'direct'}
    ]
  }}
};

const r2 = runCase('2-server', cfg2, [
  ['含 balancer 节点',         /flow-node-balancer[\s\S]*?bal/],
  ['含 bypass 占位 div',       /flow-arrow-r-bypass/],
  ['bypass 带 transport 标签', /flow-arrow-r-bypass[\s\S]*?WS \/ TLS[\s\S]*?<\/div>/],
  ['含 a.example.com',          /a\.example\.com/],
  ['含 b.example.com',          /b\.example\.com/],
  ['含目标网站',                /目标网站/]
]);
const r3 = runCase('3-server', cfg3, [
  ['含 3 个 selector',         /a\.example\.com[\s\S]*?b\.example\.com[\s\S]*?c\.example\.com/],
  ['含垂直箭头 s2→s3',         /flow-arrow-d/],
  ['含 bypass 占位 div',       /flow-arrow-r-bypass/],
  ['含目标网站',                /目标网站/]
]);
const rm = runCase('merge-2balancer', cfgMerge, [
  ['含 balancer 节点',          /flow-node-balancer/],
  ['含 direct 出站',            /flow-node-out/],
  ['含目标网站锚点',             /is-target-anchor/],
  ['含 merge 占位条',           /flow-arrow-merge/]
]);

const total = [r2, r3, rm].reduce((acc, r) => ({pass: acc.pass+r.pass, fail: acc.fail+r.fail}), {pass:0, fail:0});
console.log('\n' + total.pass + ' pass, ' + total.fail + ' fail');
process.exit(total.fail === 0 ? 0 : 1);