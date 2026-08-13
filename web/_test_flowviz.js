process.exitCode = 1;
const fs=require('fs'); const vm=require('vm');
class Elem{constructor(){this.children=[];this.attrs={};this.style={};this._innerHTML='';this._textContent='';this.classList={add:()=>{},remove:()=>{},contains:()=>false};}set innerHTML(v){this._innerHTML=v;}get innerHTML(){return this._innerHTML;}set textContent(v){this._textContent=v;}querySelector(){return null;}querySelectorAll(){return [];}addEventListener(){}removeEventListener(){}cloneNode(){return new Elem();}closest(){return null;}matches(){return false;}}
const _all=[];
const sandbox={document:{_all,addEventListener:()=>{},removeEventListener:()=>{},documentElement:{getAttribute:()=>'light'},getElementById(id){return _all.find(e=>e.attrs&&e.attrs.id===id)||null;},querySelectorAll(sel){if(sel&&sel.startsWith('.'))return _all.filter(e=>e.classList&&e.classList.contains(sel.slice(1)));return[];},querySelector:()=>null,createElement:()=>new Elem(),body:new Elem(),head:new Elem()},window:{addEventListener:()=>{},matchMedia:()=>({matches:false,addEventListener:()=>{}})},console,setTimeout,clearTimeout,setInterval,clearInterval,Promise,JSON,Math,Date:{now:()=>0},performance:{now:()=>0},Array,Object,String,Number,Boolean,RegExp,Error,Symbol,Map,Set};
['flowVizCard','flowVizBody','flowVizHint','flowCanvasRouting','btnStart','btnStop','btnRestart','themeBtn','headerStatus','headerStatusText','statusHero','statusText','versionText','uptimeWrap','uptimeText','latencyWrap','latencyText','ovInbounds','ovInboundsDetail','ovOutbounds','ovOutboundsDetail','ovRules','ovRulesDetail','ovPorts','ovPortsDetail','configCharCount','saveBtn','formatBtn','copyBtn','exportBtn','importBtn','importFile','tabFormBtn','tabJsonBtn','formPanel','jsonPanel','emptyState','configForm','configEditor','jsonGutter','toast','ms'].forEach(id=>{const e=new Elem();e.attrs.id=id;_all.push(e);});
const cs=new Elem();cs.classList.add('flow-canvas');_all.push(cs);
vm.createContext(sandbox);
try { vm.runInContext(fs.readFileSync('/Users/roy/Code/v2ray-console/web/app.js','utf8'), sandbox); } catch(e) {}
// 配置含一个 balancer 选中 proxy-us/proxy-eu；direct 也被一条规则指向
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
const checks = [
  ['含 balancer 节点',                          /flow-node-balancer[\s\S]*?balancer1/],
  ['含 selector 1 服务器 us.example',            /us\.example\.com/],
  ['含 selector 2 服务器 eu.example',            /eu\.example\.com/],
  ['含轮询策略文案',                             /轮询/],
  ['含分支标签',                                 /命中|未命中/],
  ['含目标网站',                                 /目标网站/],
  ['含图例：负载均衡',                           /从选中的出站中按策略选一个/],
  ['direct 行有默认 badge',                      /flow-default-badge/],
  ['direct 行有规则 #2',                         /规则 #2/],
  ['app→inbound→router 主轴',                    /flow-node-app[\s\S]*?flow-node-inbound[\s\S]*?flow-node-router/],
  ['balancer 行右侧紧随服务器/目标',              /flow-node-balancer[\s\S]*?flow-node-dest[\s\S]*?目标网站/]
];
let pass = 0, fail = 0;
checks.forEach(([name, re]) => {
  const ok = re.test(html);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
  if (ok) pass++; else fail++;
});
const outCount = (html.match(/flow-node-out/g) || []).length;
console.log((outCount === 1 ? 'PASS  ' : 'FAIL  ') + '仅 1 个 flow-node-out（direct）= ' + outCount);
const stackCount = (html.match(/flow-rules-stack/g) || []).length;
console.log((stackCount === 2 ? 'PASS  ' : 'FAIL  ') + '共 2 行（balancer + direct）= ' + stackCount);
const proxyAsOutNode = /flow-node-out[\s\S]*?(proxy-us|proxy-eu)/.test(html);
console.log((!proxyAsOutNode ? 'PASS  ' : 'FAIL  ') + 'proxy-us/eu 不作为独立 flow-node-out 出现');
console.log('\n' + pass + ' pass, ' + fail + ' fail, total HTML len=' + html.length);
process.exit(fail === 0 ? 0 : 1);
