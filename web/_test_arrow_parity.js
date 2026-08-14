// 验证 s2（堆叠 balancer 第 2 候选）箭头与 s1 视觉等价：
// - 自身画 40px 水平线（width 来自 .flow-arrow-r.labeled），不再用 bypass + elbow
// - grid-row 只占 s2 那一行（与 s1 同款）
process.exitCode = 1;
const fs = require('fs'); const vm = require('vm');
class Elem { constructor() { this.children = []; this.attrs = {}; this.style = {}; this._innerHTML = ''; this._textContent = ''; this.classList = { add: () => {}, remove: () => {}, contains: () => false }; } set innerHTML(v) { this._innerHTML = v; } get innerHTML() { return this._innerHTML; } set textContent(v) { this._textContent = v; } querySelector() { return null; } querySelectorAll() { return []; } addEventListener() {} removeEventListener() {} cloneNode() { return new Elem(); } closest() { return null; } matches() { return false; } }
const _all = [];
const sandbox = { document: { _all, addEventListener: () => {}, removeEventListener: () => {}, documentElement: { getAttribute: () => 'light' }, getElementById(id) { return _all.find(e => e.attrs && e.attrs.id === id) || null; }, querySelectorAll(sel) { if (sel && sel.startsWith('.')) return _all.filter(e => e.classList && e.classList.contains(sel.slice(1))); return []; }, querySelector: () => null, createElement: () => new Elem(), body: new Elem(), head: new Elem() }, window: { addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }) }, console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, JSON, Math, Date: { now: () => 0 }, performance: { now: () => 0 }, Array, Object, String, Number, Boolean, RegExp, Error, Symbol, Map, Set };
['flowVizCard','flowVizBody','flowVizHint','flowCanvasRouting','btnStart','btnStop','btnRestart','themeBtn','headerStatus','headerStatusText','statusHero','statusText','versionText','uptimeWrap','uptimeText','latencyWrap','latencyText','ovInbounds','ovInboundsDetail','ovOutbounds','ovOutboundsDetail','ovRules','ovRulesDetail','ovPorts','ovPortsDetail','configCharCount','saveBtn','formatBtn','copyBtn','exportBtn','importBtn','importFile','tabFormBtn','tabJsonBtn','formPanel','jsonPanel','emptyState','configForm','configEditor','jsonGutter','toast','ms'].forEach(id => { const e = new Elem(); e.attrs.id = id; _all.push(e); });
const cs = new Elem(); cs.classList.add('flow-canvas'); _all.push(cs);
vm.createContext(sandbox);
try { vm.runInContext(fs.readFileSync('/Users/roy/Code/v2ray-console/web/app.js', 'utf8'), sandbox); } catch (e) {}
vm.runInContext(`
state.inbounds = [{protocol:'socks',port:10808}];
state.outbounds = [
  {protocol:'vmess',tag:'proxy-us',settings:{vnext:[{address:'us.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}},
  {protocol:'vmess',tag:'proxy-eu',settings:{vnext:[{address:'eu.example.com',port:443}]},streamSettings:{network:'ws',security:'tls'}},
  {protocol:'freedom',tag:'direct'}
];
state.routing = {settings:{
  domainStrategy:'AsIs',domainMatcher:'linear',
  balancers:[{tag:'balancer1',selector:['proxy-us','proxy-eu'],strategy:{type:'roundRobin'}}],
  rules:[
    {type:'field',domain:['geosite:google'],balancerTag:'balancer1'},
    {type:'field',domain:['geosite:cn'],outboundTag:'direct'}
  ]
}};
buildFlowViz();
`, sandbox);
const html = _all.find(e => e.attrs.id === 'flowCanvasRouting')._innerHTML;

// 抽出所有 .flow-arrow-r，分类 s1 / s2
const arrowRegex = /<div class="flow-arrow-r ([^"]+)" style="grid-column:(\d+);grid-row:(\d+)(?:\/(\d+))?">([\s\S]*?)<\/div>/g;
const arrows = [];
let m;
while ((m = arrowRegex.exec(html)) !== null) {
  arrows.push({ cls: m[1], col: +m[2], rowStart: +m[3], rowEnd: m[4] ? +m[4] : +m[3], inner: m[5] });
}
// s1/s2 是堆叠 balancer 旁边的两个服务器箭头：col 10 (stackCol-1)，row 1/2，含 labeled + WS/TLS
const s1 = arrows.find(a => a.col === 10 && a.rowStart === 1 && /labeled/.test(a.cls) && /proxy/.test(a.cls));
const s2 = arrows.find(a => a.col === 10 && a.rowStart === 2 && /labeled/.test(a.cls) && /proxy/.test(a.cls));
const bypassAny = arrows.find(a => a.cls.includes('flow-arrow-r-bypass'));

const checks = [
  ['s1 箭头存在（col 10, row 1, labeled）', !!s1 && s1.col === 10 && s1.rowStart === 1 && s1.rowEnd === 1 && /labeled/.test(s1.cls)],
  ['s2 箭头存在（col 10, row 2, labeled）', !!s2 && s2.col === 10 && s2.rowStart === 2 && s2.rowEnd === 2 && /labeled/.test(s2.cls)],
  ['s1 类不含 bypass',                 s1 && !/flow-arrow-r-bypass/.test(s1.cls)],
  ['s2 类不含 bypass',                 s2 && !/flow-arrow-r-bypass/.test(s2.cls)],
  ['s1 / s2 类完全相同（长度一致的关键）', s1 && s2 && s1.cls === s2.cls],
  ['s1 / s2 列号相同（col 10）',         s1 && s2 && s1.col === s2.col],
  ['s2 不再是跨行 cell',                 s2 && s2.rowStart === s2.rowEnd],
  ['整图不再生成 .flow-arrow-r-bypass 元素', !bypassAny],
  ['s1 含 WS / TLS 标签',                s1 && /WS \/ TLS/.test(s1.inner)],
  ['s2 含 WS / TLS 标签',                s2 && /WS \/ TLS/.test(s2.inner)],
];
let pass = 0, fail = 0;
checks.forEach(([name, ok]) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (ok) pass++; else fail++; });
console.log('\n' + pass + ' pass, ' + fail + ' fail');
if (fail) { console.log('--- arrows ---'); arrows.forEach(a => console.log(a)); }
process.exit(fail === 0 ? 0 : 1);
