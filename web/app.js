// ─── API 工具 ──────────────────────────────────
async function api(path, method = 'GET', body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const icons = { success: '✓', error: '✕', warning: '!' };
  t.innerHTML = '<span class="toast-icon">' + (icons[type] || '✓') + '</span><span>' + esc(msg) + '</span>';
  t.className = 'toast ' + type + ' show';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── 状态 ──────────────────────────────────────
let _runningSince = null;
let _uptimeTimer = null;

// ─── 未保存变更追踪 ────────────────────────────
let _dirty = false;
const _origTitle = document.title;

function markDirty() {
  if (_dirty) return;
  _dirty = true;
  document.title = '● ' + _origTitle;
  const btn = document.getElementById('saveBtn');
  if (btn) btn.classList.add('dirty');
}
function markClean() {
  if (!_dirty) return;
  _dirty = false;
  document.title = _origTitle;
  const btn = document.getElementById('saveBtn');
  if (btn) btn.classList.remove('dirty');
}
window.addEventListener('beforeunload', (e) => {
  if (_dirty) { e.preventDefault(); e.returnValue = ''; }
});

async function checkStatus() {
  const t0 = performance.now();
  let data;
  try {
    data = await api('/api/status');
  } catch(e) {
    setStatusState('error', '连接失败');
    setControlsDisabled(true);
    document.getElementById('uptimeWrap').style.display = 'none';
    document.getElementById('latencyWrap').style.display = 'none';
    stopUptimeTimer();
    return;
  }
  const latency = Math.round(performance.now() - t0);
  document.getElementById('versionText').textContent = data.version || '—';

  if (data.running) {
    _runningSince = data.started_at || Date.now();
    setStatusState('running', '运行中');
    document.getElementById('btnStart').disabled = true;
    document.getElementById('btnStop').disabled = false;
    document.getElementById('btnRestart').disabled = false;
    document.getElementById('uptimeWrap').style.display = '';
    document.getElementById('latencyWrap').style.display = '';
    document.getElementById('latencyText').textContent = latency + 'ms';
    startUptimeTimer();
  } else {
    _runningSince = null;
    setStatusState('stopped', '已停止');
    document.getElementById('btnStart').disabled = false;
    document.getElementById('btnStop').disabled = true;
    document.getElementById('btnRestart').disabled = true;
    document.getElementById('uptimeWrap').style.display = 'none';
    document.getElementById('latencyWrap').style.display = 'none';
    stopUptimeTimer();
  }
}

function setStatusState(state, label) {
  const hero = document.getElementById('statusHero');
  const hStatus = document.getElementById('headerStatus');
  if (hero) { hero.classList.remove('running','stopped','error'); hero.classList.add(state); }
  if (hStatus) { hStatus.classList.remove('running','stopped','error'); hStatus.classList.add(state); }
  document.getElementById('statusText').textContent = label;
  document.getElementById('headerStatusText').textContent = label;
}

function setControlsDisabled(disabled) {
  document.getElementById('btnStart').disabled = disabled;
  document.getElementById('btnStop').disabled = disabled;
  document.getElementById('btnRestart').disabled = disabled;
}

function startUptimeTimer() {
  if (_uptimeTimer) return;
  const tick = () => {
    if (!_runningSince) return;
    const sec = Math.floor((Date.now() - _runningSince) / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const el = document.getElementById('uptimeText');
    if (el) el.textContent = (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'm ' : '') + s + 's';
  };
  tick();
  _uptimeTimer = setInterval(tick, 1000);
}
function stopUptimeTimer() {
  if (_uptimeTimer) { clearInterval(_uptimeTimer); _uptimeTimer = null; }
}

// ─── 控制 ──────────────────────────────────────
async function doStart() {
  try { await api('/api/start', 'POST'); showToast('V2Ray 已启动'); checkStatus(); }
  catch(e) { showToast('启动失败: ' + e.message, 'error'); }
}
async function doStop() {
  try { await api('/api/stop', 'POST'); showToast('V2Ray 已停止'); checkStatus(); }
  catch(e) { showToast('停止失败: ' + e.message, 'error'); }
}
async function doRestart() {
  try { await api('/api/restart', 'POST'); showToast('V2Ray 已重启'); checkStatus(); }
  catch(e) { showToast('重启失败: ' + e.message, 'error'); }
}

// ─── State & Defaults ──────────────────────────
let currentTab = 'form';
let currentSubTab = 'inbounds';
const state = {
  inbounds: [], outbounds: [],
  routing: { settings: { domainStrategy: 'AsIs', domainMatcher: 'linear', rules: [], balancers: [] } },
  log: { loglevel: 'warning', access: '', error: '' },
  dns: '', transport: '', policy: ''
};

const DEFAULTS = {
  // ── Inbounds ──
  inboundSocks: { protocol: 'socks', port: 10808, listen: '127.0.0.1', settings: { auth: 'noauth', udp: true }, tag: 'socks-in', sniffing: { enabled: false, destOverride: ['http','tls'] } },
  inboundHttp: { protocol: 'http', port: 10809, listen: '127.0.0.1', settings: { timeout: 360 }, tag: 'http-in' },
  inboundVmess: { protocol: 'vmess', port: 10086, listen: '0.0.0.0', settings: { clients: [{ id: '', alterId: 0, security: 'auto', level: 1 }], disableInsecureEncryption: true }, tag: 'vmess-in' },
  inboundVless: { protocol: 'vless', port: 10086, listen: '0.0.0.0', settings: { clients: [{ id: '', flow: '', encryption: 'none', level: 1 }], decryption: 'none', fallbacks: [] }, tag: 'vless-in' },
  inboundTrojan: { protocol: 'trojan', port: 10086, listen: '0.0.0.0', settings: { clients: [{ password: '', level: 1 }], fallbacks: [] }, tag: 'trojan-in' },
  inboundShadowsocks: { protocol: 'shadowsocks', port: 10086, listen: '0.0.0.0', settings: { method: 'aes-256-gcm', password: '', network: 'tcp,udp', level: 1 }, tag: 'ss-in' },
  inboundDokodemo: { protocol: 'dokodemo-door', port: 12345, listen: '0.0.0.0', settings: { network: 'tcp,udp', followRedirect: false }, sniffing: { enabled: true, destOverride: ['http','tls'] }, tag: 'tproxy-in' },

  // ── Outbounds ──
  outboundVmess: {
    protocol: 'vmess', tag: 'proxy',
    settings: { vnext: [{ address: '', port: 443, users: [{ id: '', alterId: 0, security: 'auto', level: 1 }] }] },
    streamSettings: { network: 'ws', security: 'tls', tlsSettings: { serverName: '', allowInsecure: false, alpn: [] }, wsSettings: { path: '/', headers: { host: '' } } },
    mux: { enabled: false, concurrency: 8 }
  },
  outboundVless: {
    protocol: 'vless', tag: 'proxy',
    settings: { vnext: [{ address: '', port: 443, users: [{ id: '', encryption: 'none', flow: '', level: 1 }] }] },
    streamSettings: { network: 'tcp', security: 'reality', realitySettings: { serverName: 'www.microsoft.com', fingerprint: 'chrome', publicKey: '', shortId: '', spiderX: '/' } },
    mux: { enabled: false, concurrency: 8 }
  },
  outboundTrojan: {
    protocol: 'trojan', tag: 'proxy',
    settings: { servers: [{ address: '', port: 443, password: '', level: 1 }] },
    streamSettings: { network: 'tcp', security: 'tls', tlsSettings: { serverName: '', allowInsecure: false } },
    mux: { enabled: false, concurrency: 8 }
  },
  outboundShadowsocks: {
    protocol: 'shadowsocks', tag: 'proxy',
    settings: { servers: [{ address: '', port: 443, method: 'aes-256-gcm', password: '', level: 1 }] }
  },
  outboundFreedom: { protocol: 'freedom', tag: 'direct', settings: { domainStrategy: 'UseIP', redirect: '', userLevel: 0 } },
  outboundBlackhole: { protocol: 'blackhole', tag: 'block', settings: { response: { type: 'none' } } },
  outboundDns: { protocol: 'dns', tag: 'dns-out' },

  // ── Sub-items ──
  vnext: { address: '', port: 443, users: [{ id: '', alterId: 0, security: 'auto', level: 1 }] },
  user: { id: '', alterId: 0, security: 'auto', level: 1 },
  ssServer: { address: '', port: 443, method: 'aes-256-gcm', password: '', level: 1 },
  trojanServer: { address: '', port: 443, password: '', level: 1 },
  rule: { type: 'field', ip: [], domain: [], network: '', port: '', protocol: [], inboundTag: [], outboundTag: '' },
  balancer: { tag: 'balancer', selector: [], strategy: { type: 'roundRobin' } },
  dnsServer: { address: '8.8.8.8', port: 53, domains: [], expectIPs: [] }
};

// ─── 规则预设模板 ─────────────────────────────
// 内网 / 本地 / DNS 三个常用分流模板；每个模板提供两种变体：
//   - `geo`: 使用 geoip 关键字（依赖 geoip.dat / dlc.dat，开箱即配置即可生效）
//   - `raw`: 直接写死具体网段/端口，不依赖外部数据文件
const RULE_PRESETS = {
  'private-ip': {
    label: '内网 IP',
    icon: '🏠',
    desc: '命中私有网段 → direct',
    variants: {
      geo: { ip: ['geoip:private'], outboundTag: 'direct' },
      raw: { ip: [
        '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
        '::1/128', 'fc00::/7', 'fe80::/10'
      ], outboundTag: 'direct' }
    }
  },
  'local-ip': {
    label: '本地 IP',
    icon: '🇨🇳',
    desc: '命中中国大陆 IP → direct',
    variants: {
      geo: { ip: ['geoip:cn'], outboundTag: 'direct' },
      raw: { ip: [] }  // raw 模式下大陆 IP 段太多，不展开，留空提示用户手动填
    }
  },
  'dns': {
    label: 'DNS',
    icon: '📡',
    desc: '命中 DNS 端口 → direct',
    variants: {
      geo: { port: '53', network: 'udp', outboundTag: 'direct' },
      raw: { port: '53', network: 'udp', outboundTag: 'direct' }
    }
  }
};

// ─── Tab 切换 ──────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabFormBtn').classList.toggle('active', tab === 'form');
  document.getElementById('tabJsonBtn').classList.toggle('active', tab === 'json');
  document.getElementById('formatBtn').style.display = tab === 'json' ? '' : 'none';

  if (tab === 'form') {
    document.getElementById('formPanel').style.display = '';
    document.getElementById('jsonPanel').style.display = 'none';
    // Sync from textarea to state
    const raw = document.getElementById('configEditor').value.trim();
    if (raw) {
      try { const parsed = JSON.parse(raw); populateState(parsed); }
      catch(e) { /* keep current state */ }
    }
    if (state.inbounds.length > 0 || state.outbounds.length > 0) {
      buildForm();
    }
  } else {
    document.getElementById('formPanel').style.display = 'none';
    document.getElementById('jsonPanel').style.display = '';
    syncStateToEditor();
  }
}

function syncStateToEditor() {
  const config = buildConfigObject();
  document.getElementById('configEditor').value = JSON.stringify(config, null, 2);
  updateJsonGutter();
  updateCharCount();
}

function updateJsonGutter() {
  const editor = document.getElementById('configEditor');
  const gutter = document.getElementById('jsonGutter');
  if (!editor || !gutter) return;
  const lines = editor.value.split('\n').length;
  let s = '';
  for (let i = 1; i <= lines; i++) s += i + '\n';
  gutter.textContent = s ? s.slice(0, -1) : '1';
  gutter.scrollTop = editor.scrollTop;
}

function updateCharCount() {
  const editor = document.getElementById('configEditor');
  const el = document.getElementById('configCharCount');
  if (editor && el) el.textContent = editor.value.length + ' 字符';
}

function buildConfigObject() {
  const config = {
    inbounds: state.inbounds,
    outbounds: state.outbounds,
    routing: state.routing
  };
  // Log — 只输出非默认值
  if (state.log.loglevel !== 'warning' || state.log.access || state.log.error) {
    config.log = {};
    if (state.log.loglevel !== 'warning') config.log.loglevel = state.log.loglevel;
    if (state.log.access) config.log.access = state.log.access;
    if (state.log.error) config.log.error = state.log.error;
  }
  try { const d = JSON.parse(state.dns); if (Object.keys(d).length) config.dns = d; } catch(e) {}
  try { const t = JSON.parse(state.transport); if (Object.keys(t).length) config.transport = t; } catch(e) {}
  try { const p = JSON.parse(state.policy); if (Object.keys(p).length) config.policy = p; } catch(e) {}
  return config;
}

function populateState(parsed) {
  state.inbounds = parsed.inbounds || [];
  state.outbounds = (parsed.outbounds || []).map(ob => {
    const isProxy = ['vmess','vless','trojan','shadowsocks'].includes(ob.protocol);
    // VMess: ensure vnext[].users[] fields
    if (ob.protocol === 'vmess' && ob.settings && ob.settings.vnext) {
      ob.settings.vnext = ob.settings.vnext.map(vn => {
        vn.users = (vn.users || []).map(u => {
          if (u.alterId === undefined) u.alterId = 0;
          if (!u.security) u.security = 'auto';
          if (u.level === undefined) u.level = 1;
          return u;
        });
        return vn;
      });
    }
    // VLESS: ensure non-vmess vnext users
    if (ob.protocol === 'vless' && ob.settings && ob.settings.vnext) {
      ob.settings.vnext = ob.settings.vnext.map(vn => {
        vn.users = (vn.users || []).map(u => {
          if (u.encryption === undefined) u.encryption = 'none';
          if (u.level === undefined) u.level = 1;
          return u;
        });
        return vn;
      });
    }
    // Fill streamSettings for proxy protocols
    if (isProxy && !ob.streamSettings) {
      ob.streamSettings = { network: 'tcp', security: 'none' };
    }
    if (isProxy && ob.streamSettings) {
      const ss = ob.streamSettings;
      if (!ss.wsSettings) ss.wsSettings = { path: '/', headers: { host: '' } };
      if (!ss.tlsSettings) ss.tlsSettings = {};
      // Ensure all TLS fields exist even when partial config
      const tls = ss.tlsSettings;
      if (tls.serverName === undefined) tls.serverName = '';
      if (tls.allowInsecure === undefined) tls.allowInsecure = false;
      if (tls.alpn === undefined) tls.alpn = [];
      if (tls.certFile === undefined) tls.certFile = '';
      if (tls.keyFile === undefined) tls.keyFile = '';
      if (!ss.kcpSettings) ss.kcpSettings = { mtu: 1350, tti: 20, uplinkCapacity: 5, downlinkCapacity: 20, congestion: false, readBuffer: 2, writeBuffer: 2, header: { type: 'none' }, seed: '' };
      if (!ss.quicSettings) ss.quicSettings = { security: 'none', key: '', header: { type: 'none' } };
      if (!ss.grpcSettings) ss.grpcSettings = { serviceName: '', multiMode: false };
      if (!ss.httpSettings) ss.httpSettings = { host: [], path: '/' };
      if (!ss.realitySettings) ss.realitySettings = { serverName: '', fingerprint: 'chrome', publicKey: '', shortId: '', spiderX: '/' };
    }
    // Mux for proxy protocols
    if (!ob.mux && isProxy) {
      ob.mux = { enabled: false, concurrency: 8 };
    }
    return ob;
  });
  // Routing
  state.routing = parsed.routing || { settings: { domainStrategy: 'AsIs', domainMatcher: 'linear', rules: [], balancers: [] } };
  if (!state.routing.settings) state.routing.settings = { domainStrategy: 'AsIs', domainMatcher: 'linear', rules: [], balancers: [] };
  if (!state.routing.settings.rules) state.routing.settings.rules = [];
  if (!state.routing.settings.balancers) state.routing.settings.balancers = [];
  if (!state.routing.settings.domainMatcher) state.routing.settings.domainMatcher = 'linear';
  // Log
  state.log = Object.assign({ loglevel: 'warning', access: '', error: '' }, parsed.log || {});
  // JSON text areas
  state.dns = JSON.stringify(parsed.dns || {}, null, 2);
  state.transport = JSON.stringify(parsed.transport || {}, null, 2);
  state.policy = JSON.stringify(parsed.policy || {}, null, 2);
}

// ─── Helpers ───────────────────────────────────
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function setNested(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === undefined) cur[k] = /^\d+$/.test(keys[i+1]) ? [] : {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  // Comma-separated → array fields
  const arrayKeys = ['ip','domain','alpn','inboundTag','selector','destOverride','host'];
  if (arrayKeys.includes(last) && typeof value === 'string') {
    // special: `host` under `httpSettings` is array; under `wsSettings.headers` is string
    if (last === 'host' && !path.includes('httpSettings')) {
      cur[last] = value;
    } else {
      cur[last] = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
    }
  } else if (typeof value === 'string' && !isNaN(value) && value !== '' && last !== 'id' && last !== 'address' && last !== 'serverName' && last !== 'tag' && last !== 'key') {
    cur[last] = parseFloat(value);
  } else {
    cur[last] = value;
  }
}

function getOutboundTags() {
  return state.outbounds.map((ob, i) => ob.tag || `${ob.protocol}-${i}`);
}

// 按 tag 查找出站协议，用于负载均衡器的语义校验
function getOutboundProtocol(tag) {
  const ob = state.outbounds.find(o => (o.tag || `${o.protocol}-${state.outbounds.indexOf(o)}`) === tag);
  return ob ? ob.protocol : null;
}

// 哪些协议属于「代理」类（适合放进负载均衡池）
const PROXY_PROTOCOLS = new Set(['vmess', 'vless', 'trojan', 'shadowsocks', 'ss', 'http', 'socks']);
// 哪些协议属于「非代理 / 系统类」——混入会破坏均衡语义
const NON_PROXY_PROTOCOLS = new Set(['freedom', 'blackhole', 'dns', 'loopback']);

// 检查 balancer.selector 是否混入了非代理出站。
// 与「不足 2 个」提示互斥：<2 时优先显示单选提示，混选提示只在 ≥2 时出现，
// 保证同一时刻同一位置只有一条提示。
function getMixedProtocolWarning(selector) {
  if (!Array.isArray(selector) || selector.length < 2) return null;
  const tags = selector.map(t => ({ tag: t, proto: getOutboundProtocol(t) }));
  const proxy = tags.filter(t => t.proto && PROXY_PROTOCOLS.has(t.proto));
  const nonProxy = tags.filter(t => t.proto && NON_PROXY_PROTOCOLS.has(t.proto));
  if (proxy.length > 0 && nonProxy.length > 0) {
    const list = nonProxy.map(t => `${t.tag} (${t.proto})`).join('、');
    return `⚠ 检测到混选不同语义出站：${list}。负载均衡器适合把等价代理链路打包，直连/黑洞/DNS 等混入会破坏均衡意图，请改用路由规则分流。`;
  }
  return null;
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// ─── UUID Generator ───────────────────────────────
function generateUUID() {
  // RFC 4122 version 4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function generateUUIDFor(btn) {
  const input = btn.parentElement.querySelector('input');
  if (input) {
    input.value = generateUUID();
    // Trigger the change event so state is updated
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// ─── Build Form ────────────────────────────────
const SUB_TABS = [
  { key: 'inbounds',  label: '📥 入站',      build: buildInboundsSection },
  { key: 'outbounds', label: '📤 出站',      build: buildOutboundsSection },
  { key: 'routing',   label: '🔀 路由',      build: buildRoutingSection },
  { key: 'dns',       label: '📡 DNS',       build: buildDnsSection },
  { key: 'log',       label: '📋 日志',      build: buildLogSection },
  { key: 'policy',    label: '⚙️ 策略+传输',  build: buildPolicySection },
];

function buildForm() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('configForm').style.display = '';
  // 保留当前选中的子 tab（如果还存在），否则回到入站
  const known = SUB_TABS.map(t => t.key);
  if (!known.includes(currentSubTab)) currentSubTab = 'inbounds';

  let html = '<div class="tabs tabs-section" role="tablist">';
  SUB_TABS.forEach(t => {
    const active = t.key === currentSubTab ? ' active' : '';
    html += '<button class="tab-btn' + active + '" data-subtab="' + t.key + '" onclick="switchSubTab(\'' + t.key + '\')">' + t.label + '</button>';
  });
  html += '</div>';

  SUB_TABS.forEach(t => {
    const active = t.key === currentSubTab ? ' active' : '';
    html += '<div class="sub-panel' + active + '" id="panel-' + t.key + '" data-panel="' + t.key + '">';
    html += t.build();
    html += '</div>';
  });

  document.getElementById('configForm').innerHTML = html;
  updateOverview();
}

function switchSubTab(key) {
  currentSubTab = key;
  document.querySelectorAll('#configForm .tabs-section .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === key);
  });
  document.querySelectorAll('#configForm .sub-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.panel === key);
  });
}

// ─── Inbounds ──────────────────────────────────
function buildInboundsSection() {
  let h = '<div class="form-section" id="section-inbounds">';
  state.inbounds.forEach((ib, i) => { h += buildInboundItem(ib, i); });
  h += '<div class="array-actions"><button class="btn-add" data-action="add-inbound">➕ 添加入站</button></div>';
  h += '</div>';
  return h;
}

function buildInboundItem(ib, i) {
  const proto = ib.protocol || 'socks';
  const protos = [
    ['socks','SOCKS5','#dbeafe','#1d4ed8'],
    ['http','HTTP','#fef3c7','#b45309'],
    ['vmess','VMess','#ede9fe','#6d28d9'],
    ['vless','VLESS','#fce7f3','#be185d'],
    ['trojan','Trojan','#ffedd5','#c2410c'],
    ['shadowsocks','Shadowsocks','#d1fae5','#047857'],
    ['dokodemo-door','Dokodemo','#e0e7ff','#3730a3']
  ];
  const p = protos.find(x => x[0]===proto) || protos[0];
  let h = '<div class="array-item">';
  h += '<div class="array-item-header">';
  h += '<span class="array-item-title"><span class="protocol-tag" style="background:'+p[2]+';color:'+p[3]+'">'+p[1]+'</span> 入站 #'+(i+1)+(ib.tag?' · '+esc(ib.tag):'')+'</span>';
  h += '<button class="btn-remove" data-action="remove-inbound" data-index="'+i+'" title="删除">✕</button>';
  h += '</div>';
  h += '<div class="form-row">';
  h += '<div class="form-group"><label>协议</label><select class="form-select" data-path="inbounds.'+i+'.protocol">';
  protos.forEach(([val,label]) => { h += '<option value="'+val+'"'+(proto===val?' selected':'')+'>'+label+'</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>端口</label><input class="form-input" type="number" data-path="inbounds.'+i+'.port" value="'+(ib.port||'')+'" style="width:100px"></div>';
  h += '<div class="form-group"><label>监听地址</label><input class="form-input" data-path="inbounds.'+i+'.listen" value="'+esc(ib.listen||'')+'" style="width:150px" placeholder="0.0.0.0"></div>';
  h += '<div class="form-group"><label>标签</label><input class="form-input" data-path="inbounds.'+i+'.tag" value="'+esc(ib.tag||'')+'" style="width:120px" placeholder="可选"></div>';
  h += '</div>';
  // Protocol-specific settings
  h += '<div class="sub-section protocol-settings" id="inbound-settings-'+i+'">';
  h += buildInboundSettingsByProtocol(ib, i, proto);
  h += '</div>';
  // Advanced: sniffing + allocate
  h += '<div class="collapsible" style="margin-top:8px">';
  h += '<div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> 高级设置 <span class="hint">(可省略)</span></div>';
  h += '<div class="collapsible-body">'+buildInboundAdvanced(ib, i)+'</div>';
  h += '</div>';
  h += '</div>';
  return h;
}

function buildInboundSettingsByProtocol(ib, i, proto) {
  const s = ib.settings || {};
  let h = '<div class="sub-section-title" style="margin-bottom:8px">协议设置</div>';
  switch (proto) {
    case 'socks': {
      h += '<div class="form-row"><div class="form-group"><label>认证方式</label><select class="form-select" data-path="inbounds.'+i+'.settings.auth">';
      h += '<option value="noauth"'+(s.auth==='noauth'?' selected':'')+'>'+'无认证 <span class="hint">(默认)</span></option>';
      h += '<option value="password"'+(s.auth==='password'?' selected':'')+'>'+'密码</option></select></div>';
      h += '<label class="form-checkbox"><input type="checkbox" data-path="inbounds.'+i+'.settings.udp"'+(s.udp?' checked':'')+'>'+' UDP 转发</label></div>';
      if (s.auth === 'password') {
        const accounts = s.accounts || [{user:'', pass:''}];
        h += '<div class="sub-section-title" style="margin:8px 0 4px">账号列表</div>';
        accounts.forEach((a, ai) => {
          h += '<div class="form-row user-row">';
          h += '<div class="form-group"><label>用户名</label><input class="form-input" data-path="inbounds.'+i+'.settings.accounts.'+ai+'.user" value="'+esc(a.user||'')+'" style="width:150px"></div>';
          h += '<div class="form-group"><label>密码</label><input class="form-input" data-path="inbounds.'+i+'.settings.accounts.'+ai+'.pass" value="'+esc(a.pass||'')+'" style="width:150px"></div>';
          h += ai > 0 ? '<button class="btn-remove" data-action="remove-socks-account" data-ib-index="'+i+'" data-a-index="'+ai+'">✕</button>' : '';
          h += '</div>';
        });
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="addSocksAccount('+i+')" style="margin-top:4px">+ 添加账号</button>';
      }
      break;
    }
    case 'http': {
      h += '<div class="form-row"><div class="form-group"><label>超时 (秒)</label><input class="form-input" type="number" data-path="inbounds.'+i+'.settings.timeout" value="'+(s.timeout||360)+'" style="width:100px"> <span class="hint">默认: 360</span></div></div>';
      break;
    }
    case 'vmess': {
      const clients = s.clients || [{id:'',alterId:0,security:'auto',level:1}];
      clients.forEach((c,ci) => {
        h += '<div class="form-row user-row">';
        h += '<div class="form-group"><label>用户 #'+(ci+1)+' UUID</label><div style="display:flex;gap:4px;align-items:center"><input class="form-input uuid-input" data-path="inbounds.'+i+'.settings.clients.'+ci+'.id" value="'+esc(c.id||'')+'" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="generateUUIDFor(this)">🎲</button></div></div>';
        h += '<div class="form-group"><label>alterId</label><input class="form-input short-input" type="number" data-path="inbounds.'+i+'.settings.clients.'+ci+'.alterId" value="'+(c.alterId||0)+'"></div>';
        h += '<div class="form-group"><label>加密</label><select class="form-select security-select" data-path="inbounds.'+i+'.settings.clients.'+ci+'.security">';
        ['auto','aes-128-gcm','chacha20-poly1305','none','zero'].forEach(v => { h += '<option value="'+v+'"'+(c.security===v?' selected':'')+'>'+v+'</option>'; });
        h += '</select></div>';
        h += '<div class="form-group"><label>Level</label><input class="form-input short-input" type="number" data-path="inbounds.'+i+'.settings.clients.'+ci+'.level" value="'+(c.level||1)+'"></div>';
        h += ci>0 ? '<button class="btn-remove" data-action="remove-inbound-client" data-ib-index="'+i+'" data-c-index="'+ci+'">✕</button>' : '';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-inbound-client" data-ib-index="'+i+'">➕ 添加用户</button></div>';
      break;
    }
    case 'vless': {
      const clients = s.clients || [{id:'',flow:'',encryption:'none',level:1}];
      clients.forEach((c,ci) => {
        h += '<div class="form-row user-row">';
        h += '<div class="form-group"><label>用户 #'+(ci+1)+' ID</label><div style="display:flex;gap:4px;align-items:center"><input class="form-input uuid-input" data-path="inbounds.'+i+'.settings.clients.'+ci+'.id" value="'+esc(c.id||'')+'" placeholder="UUID">';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="generateUUIDFor(this)">🎲</button></div></div>';
        h += '<div class="form-group"><label>流控 (flow)</label><select class="form-select security-select" data-path="inbounds.'+i+'.settings.clients.'+ci+'.flow">';
        ['','xtls-rprx-vision','xtls-rprx-vision-udp443'].forEach(v => { h += '<option value="'+v+'"'+(c.flow===v?' selected':'')+'>'+(v||'无')+'</option>'; });
        h += '</select></div>';
        h += '<div class="form-group"><label>加密</label><select class="form-select security-select" data-path="inbounds.'+i+'.settings.clients.'+ci+'.encryption">';
        ['none'].forEach(v => { h += '<option value="'+v+'"'+(c.encryption===v?' selected':'')+'>'+v+'</option>'; });
        h += '</select></div>';
        h += ci>0 ? '<button class="btn-remove" data-action="remove-inbound-client" data-ib-index="'+i+'" data-c-index="'+ci+'">✕</button>' : '';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-inbound-client" data-ib-index="'+i+'">➕ 添加用户</button></div>';
      h += '<div class="sub-section-title" style="margin-top:8px">回落 (fallbacks) <span class="hint">可选</span></div>';
      (s.fallbacks||[]).forEach((fb,fi) => {
        h += '<div class="form-row" style="align-items:end">';
        h += '<div class="form-group"><label>目标</label><input class="form-input" data-path="inbounds.'+i+'.settings.fallbacks.'+fi+'.dest" value="'+esc(fb.dest||'')+'" style="width:80px" placeholder="80"></div>';
        h += '<div class="form-group"><label>路径</label><input class="form-input" data-path="inbounds.'+i+'.settings.fallbacks.'+fi+'.path" value="'+esc(fb.path||'')+'" style="width:100px" placeholder="/api"></div>';
        h += '<div class="form-group"><label>Xver</label><input class="form-input" type="number" data-path="inbounds.'+i+'.settings.fallbacks.'+fi+'.xver" value="'+(fb.xver||0)+'" style="width:50px"></div>';
        h += '<button class="btn-remove" data-action="remove-fallback" data-ib-index="'+i+'" data-fb-index="'+fi+'" style="margin-bottom:4px">✕</button>';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-fallback" data-ib-index="'+i+'">➕ 添加回落</button></div>';
      break;
    }
    case 'trojan': {
      (s.clients||[{password:'',level:1}]).forEach((c,ci) => {
        h += '<div class="form-row user-row">';
        h += '<div class="form-group"><label>密码 #'+(ci+1)+'</label><input class="form-input" data-path="inbounds.'+i+'.settings.clients.'+ci+'.password" value="'+esc(c.password||'')+'" style="width:200px"></div>';
        h += '<div class="form-group"><label>Level</label><input class="form-input short-input" type="number" data-path="inbounds.'+i+'.settings.clients.'+ci+'.level" value="'+(c.level||1)+'"></div>';
        h += ci>0 ? '<button class="btn-remove" data-action="remove-inbound-client" data-ib-index="'+i+'" data-c-index="'+ci+'">✕</button>' : '';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-inbound-client" data-ib-index="'+i+'">➕ 添加用户</button></div>';
      h += '<div class="sub-section-title" style="margin-top:8px">回落 (fallbacks) <span class="hint">可选</span></div>';
      (s.fallbacks||[]).forEach((fb,fi) => {
        h += '<div class="form-row" style="align-items:end">';
        h += '<div class="form-group"><label>目标</label><input class="form-input" data-path="inbounds.'+i+'.settings.fallbacks.'+fi+'.dest" value="'+esc(fb.dest||'')+'" style="width:80px" placeholder="80"></div>';
        h += '<div class="form-group"><label>路径</label><input class="form-input" data-path="inbounds.'+i+'.settings.fallbacks.'+fi+'.path" value="'+esc(fb.path||'')+'" style="width:100px" placeholder="/api"></div>';
        h += '<button class="btn-remove" data-action="remove-fallback" data-ib-index="'+i+'" data-fb-index="'+fi+'" style="margin-bottom:4px">✕</button>';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-fallback" data-ib-index="'+i+'">➕ 添加回落</button></div>';
      break;
    }
    case 'shadowsocks': {
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>加密方法</label><select class="form-select" data-path="inbounds.'+i+'.settings.method">';
      ['aes-256-gcm','aes-128-gcm','chacha20-poly1305','2022-blake3-aes-128gcm'].forEach(v => { h += '<option value="'+v+'"'+(s.method===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select></div>';
      h += '<div class="form-group"><label>密码</label><input class="form-input" data-path="inbounds.'+i+'.settings.password" value="'+esc(s.password||'')+'" style="width:200px"></div>';
      h += '</div><div class="form-row">';
      h += '<div class="form-group"><label>网络</label><select class="form-select" data-path="inbounds.'+i+'.settings.network">';
      ['tcp','tcp,udp','udp'].forEach(v => { h += '<option value="'+v+'"'+(s.network===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select> <span class="hint">默认: tcp,udp</span></div>';
      h += '</div>';
      break;
    }
    case 'dokodemo-door': {
      h += '<div class="form-row">';
      h += '<label class="form-checkbox"><input type="checkbox" data-path="inbounds.'+i+'.settings.followRedirect"'+(s.followRedirect?' checked':'')+'>'+' followRedirect</label>';
      h += '<div class="form-group"><label>目标端口</label><input class="form-input" type="number" data-path="inbounds.'+i+'.settings.port" value="'+(s.port||'')+'" style="width:80px" placeholder="留空=原始"></div>';
      h += '<div class="form-group"><label>目标地址</label><input class="form-input" data-path="inbounds.'+i+'.settings.address" value="'+esc(s.address||'')+'" style="width:150px" placeholder="留空=原始"></div>';
      h += '</div><div class="form-row">';
      h += '<div class="form-group"><label>网络</label><select class="form-select" data-path="inbounds.'+i+'.settings.network">';
      ['tcp','udp','tcp,udp'].forEach(v => { h += '<option value="'+v+'"'+(s.network===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select> <span class="hint">默认: tcp,udp</span></div>';
      h += '</div>';
      break;
    }
  }
  return h;
}

function buildInboundAdvanced(ib, i) {
  const sniff = ib.sniffing || {};
  let h = '<div class="sub-section-title">Sniffing <span class="hint">(流量嗅探)</span></div>';
  h += '<div class="form-row">';
  h += '<label class="form-checkbox"><input type="checkbox" data-path="inbounds.'+i+'.sniffing.enabled"'+(sniff.enabled?' checked':'')+'>'+' 启用</label>';
  h += '</div><div class="form-row" style="margin-top:8px;align-items:flex-end">';
  h += '<div class="form-group" style="flex:1"><label>覆盖目标</label><div class="dest-chips">';
  const destOpts = ['http','tls','quic'];
  const selected = Array.isArray(sniff.destOverride) ? sniff.destOverride : [];
  const labels = { http:'HTTP', tls:'TLS', quic:'QUIC' };
  destOpts.forEach(v => {
    const chk = selected.includes(v) ? ' checked' : '';
    h += '<label class="dest-chip"><input type="checkbox" data-path-array="inbounds.'+i+'.sniffing.destOverride" value="'+v+'"'+chk+'><span>'+labels[v]+'</span></label>';
  });
  h += '</div></div>';
  h += '</div>';
  return h;
}

// ─── Outbounds ─────────────────────────────────
function buildOutboundsSection() {
  let h = '<div class="form-section" id="section-outbounds">';
  state.outbounds.forEach((ob, i) => { h += buildOutboundItem(ob, i); });
  h += '<div class="array-actions"><button class="btn-add" data-action="add-outbound">➕ 添加出站</button></div>';
  h += '</div>';
  return h;
}

const OUTBOUND_PROTOCOLS = [
  ['vmess','VMess','#ede9fe','#6d28d9'],
  ['vless','VLESS','#fce7f3','#be185d'],
  ['trojan','Trojan','#ffedd5','#c2410c'],
  ['shadowsocks','Shadowsocks','#d1fae5','#047857'],
  ['freedom','Freedom','#dbeafe','#1d4ed8'],
  ['blackhole','Blackhole','#f3f4f6','#374151'],
  ['dns','DNS','#e0e7ff','#3730a3']
];

function buildOutboundItem(ob, i) {
  const proto = ob.protocol || 'freedom';
  const isProxy = ['vmess','vless','trojan','shadowsocks'].includes(proto);
  const p = OUTBOUND_PROTOCOLS.find(x => x[0]===proto) || OUTBOUND_PROTOCOLS[0];
  let h = '<div class="array-item">';
  h += '<div class="array-item-header">';
  h += '<span class="array-item-title"><span class="protocol-tag" style="background:'+p[2]+';color:'+p[3]+'">'+p[1]+'</span> '+(ob.tag||'出站 #'+(i+1))+'</span>';
  h += '<button class="btn-remove" data-action="remove-outbound" data-index="'+i+'" title="删除">✕</button>';
  h += '</div>';
  h += '<div class="form-row">';
  h += '<div class="form-group"><label>协议</label><select class="form-select" data-path="outbounds.'+i+'.protocol">';
  OUTBOUND_PROTOCOLS.forEach(([val,label]) => { h += '<option value="'+val+'"'+(proto===val?' selected':'')+'>'+label+'</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>标签</label><input class="form-input" data-path="outbounds.'+i+'.tag" value="'+esc(ob.tag||'')+'" style="width:150px"></div>';
  h += '</div>';
  // Protocol-specific settings
  h += buildOutboundSettingsByProtocol(ob, i, proto);
  // Stream settings + Security (only for proxy protocols)
  if (isProxy) {
    h += '<div class="collapsible" style="margin-top:8px">';
    h += '<div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> 传输设置 <span class="hint">(可省略)</span></div>';
    h += '<div class="collapsible-body">';
    h += '<div id="stream-settings-'+i+'">'+buildStreamSettings(ob, i)+'</div>';
    h += '</div></div>';
    // Mux
    h += '<div class="collapsible">';
    h += '<div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> Mux <span class="hint">(可省略)</span></div>';
    h += '<div class="collapsible-body">'+buildMuxSettings(ob, i)+'</div>';
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function buildOutboundSettingsByProtocol(ob, i, proto) {
  const s = ob.settings || {};
  let h = '<div class="sub-section" style="margin-top:8px"><div class="sub-section-title">'+proto.toUpperCase()+' 设置</div>';
  switch (proto) {
    case 'vmess': {
      const vnext = s.vnext || [{address:'',port:443,users:[{id:'',alterId:0,security:'auto',level:1}]}];
      h += vnext.map((vn, vi) => buildVnextItem(vn, i, vi)).join('');
      h += '<div class="array-actions"><button class="btn-add" data-action="add-vnext" data-ob-index="'+i+'">➕ 添加服务器</button></div>';
      break;
    }
    case 'vless': {
      const vnext = s.vnext || [{address:'',port:443,users:[{id:'',encryption:'none',flow:'',level:1}]}];
      vnext.forEach((vn, vi) => {
        h += '<div class="array-item" style="background:#fff"><div class="array-item-header">';
        h += '<span class="array-item-title" style="font-size:12px">服务器 #'+(vi+1)+'</span>';
        h += '<button class="btn-remove" data-action="remove-vnext" data-ob-index="'+i+'" data-vn-index="'+vi+'" title="删除">✕</button></div>';
        h += '<div class="form-row">';
        h += '<div class="form-group"><label>地址</label><input class="form-input" data-path="outbounds.'+i+'.settings.vnext.'+vi+'.address" value="'+esc(vn.address||'')+'" style="width:180px"></div>';
        h += '<div class="form-group"><label>端口</label><input class="form-input" type="number" data-path="outbounds.'+i+'.settings.vnext.'+vi+'.port" value="'+(vn.port||443)+'" style="width:100px"></div>';
        h += '</div>';
        const users = vn.users || [{id:'',encryption:'none',flow:'',level:1}];
        users.forEach((u, ui) => {
          h += '<div class="form-row user-row" style="margin-top:6px">';
          h += '<div class="form-group"><label>用户 #'+(ui+1)+' ID</label><div style="display:flex;gap:4px;align-items:center"><input class="form-input uuid-input" data-path="outbounds.'+i+'.settings.vnext.'+vi+'.users.'+ui+'.id" value="'+esc(u.id||'')+'" placeholder="UUID">';
          h += '<button class="btn btn-outline btn-xs" onclick="generateUUIDFor(this)">🎲</button></div></div>';
          h += '<div class="form-group"><label>流控</label><select class="form-select security-select" data-path="outbounds.'+i+'.settings.vnext.'+vi+'.users.'+ui+'.flow">';
          ['','xtls-rprx-vision'].forEach(v => { h += '<option value="'+v+'"'+(u.flow===v?' selected':'')+'>'+(v||'无')+'</option>'; });
          h += '</select></div>';
          h += '</div>';
        });
        h += '<div class="array-actions"><button class="btn-add" data-action="add-vless-user" data-ob-index="'+i+'" data-vn-index="'+vi+'">➕ 添加用户</button></div>';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-vnext" data-ob-index="'+i+'">➕ 添加服务器</button></div>';
      break;
    }
    case 'trojan': {
      (s.servers||[{address:'',port:443,password:'',level:1}]).forEach((sv, si) => {
        h += '<div class="form-row" style="align-items:end">';
        h += '<div class="form-group"><label>地址</label><input class="form-input" data-path="outbounds.'+i+'.settings.servers.'+si+'.address" value="'+esc(sv.address||'')+'" style="width:200px"></div>';
        h += '<div class="form-group"><label>端口</label><input class="form-input" type="number" data-path="outbounds.'+i+'.settings.servers.'+si+'.port" value="'+(sv.port||443)+'" style="width:80px"></div>';
        h += '<div class="form-group"><label>密码</label><input class="form-input" data-path="outbounds.'+i+'.settings.servers.'+si+'.password" value="'+esc(sv.password||'')+'" style="width:160px"></div>';
        h += si>0 ? '<button class="btn-remove" data-action="remove-trojan-server" data-ob-index="'+i+'" data-sv-index="'+si+'" style="margin-bottom:4px">✕</button>' : '';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-trojan-server" data-ob-index="'+i+'">➕ 添加服务器</button></div>';
      break;
    }
    case 'shadowsocks': {
      (s.servers||[{address:'',port:443,method:'aes-256-gcm',password:'',level:1}]).forEach((sv, si) => {
        h += '<div class="form-row" style="align-items:end">';
        h += '<div class="form-group"><label>地址</label><input class="form-input" data-path="outbounds.'+i+'.settings.servers.'+si+'.address" value="'+esc(sv.address||'')+'" style="width:200px"></div>';
        h += '<div class="form-group"><label>端口</label><input class="form-input" type="number" data-path="outbounds.'+i+'.settings.servers.'+si+'.port" value="'+(sv.port||443)+'" style="width:80px"></div>';
        h += '<div class="form-group"><label>加密</label><select class="form-select" data-path="outbounds.'+i+'.settings.servers.'+si+'.method">';
        ['aes-256-gcm','aes-128-gcm','chacha20-poly1305','2022-blake3-aes-128gcm'].forEach(v => { h += '<option value="'+v+'"'+(sv.method===v?' selected':'')+'>'+v+'</option>'; });
        h += '</select></div>';
        h += '<div class="form-group"><label>密码</label><input class="form-input" data-path="outbounds.'+i+'.settings.servers.'+si+'.password" value="'+esc(sv.password||'')+'" style="width:160px"></div>';
        h += si>0 ? '<button class="btn-remove" data-action="remove-ss-server" data-ob-index="'+i+'" data-sv-index="'+si+'" style="margin-bottom:4px">✕</button>' : '';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-ss-server" data-ob-index="'+i+'">➕ 添加服务器</button></div>';
      break;
    }
    case 'freedom': {
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>域名策略</label><select class="form-select" data-path="outbounds.'+i+'.settings.domainStrategy">';
      ['UseIP','AsIs','UseIPv4','UseIPv6'].forEach(v => { h += '<option value="'+v+'"'+(s.domainStrategy===v?' selected':'')+'>'+v+' <span class="hint">'+(v==='UseIP'?'默认':'')+'</span></option>'; });
      h += '</select></div>';
      h += '<div class="form-group"><label>重定向</label><input class="form-input" data-path="outbounds.'+i+'.settings.redirect" value="'+esc(s.redirect||'')+'" style="width:180px" placeholder="留空=不重定向"></div>';
      h += '</div>';
      break;
    }
    case 'blackhole': {
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>响应类型</label><select class="form-select" data-path="outbounds.'+i+'.settings.response.type">';
      ['none','http'].forEach(v => { h += '<option value="'+v+'"'+(s.response&&s.response.type===v?' selected':'')+'>'+(v==='none'?'直接断开':'返回 404')+'</option>'; });
      h += '</select></div>';
      h += '</div>';
      break;
    }
    case 'dns': {
      h += '<p class="hint" style="padding:4px 0">DNS 出站不需要额外设置，配合路由规则使用。</p>';
      break;
    }
  }
  h += '</div>';
  return h;
}

function buildVnextItem(vn, obIdx, vnIdx) {
  let h = '<div class="array-item" style="background:#fff">';
  h += '<div class="array-item-header">';
  h += '<span class="array-item-title" style="font-size:12px">服务器 #'+(vnIdx+1)+'</span>';
  h += '<button class="btn-remove" data-action="remove-vnext" data-ob-index="'+obIdx+'" data-vn-index="'+vnIdx+'" title="删除">✕</button>';
  h += '</div>';
  h += '<div class="form-row">';
  h += '<div class="form-group"><label>地址</label><input class="form-input" data-path="outbounds.'+obIdx+'.settings.vnext.'+vnIdx+'.address" value="'+esc(vn.address||'')+'" style="width:180px"></div>';
  h += '<div class="form-group"><label>端口</label><input class="form-input" type="number" data-path="outbounds.'+obIdx+'.settings.vnext.'+vnIdx+'.port" value="'+(vn.port||443)+'" style="width:100px"></div>';
  h += '</div>';
  h += '<div class="sub-section-title" style="margin-top:8px">用户</div>';
  (vn.users || []).forEach((u, ui) => { h += buildUserItem(u, obIdx, vnIdx, ui); });
  h += '<div class="array-actions"><button class="btn-add" data-action="add-user" data-ob-index="'+obIdx+'" data-vn-index="'+vnIdx+'">➕ 添加用户</button></div>';
  h += '</div>';
  return h;
}

function buildUserItem(u, obIdx, vnIdx, uIdx) {
  let h = '<div class="form-row user-row">';
  h += '<div class="form-group"><label>UUID</label><div style="display:flex;gap:4px;align-items:center"><input class="form-input uuid-input" data-path="outbounds.'+obIdx+'.settings.vnext.'+vnIdx+'.users.'+uIdx+'.id" value="'+esc(u.id||'')+'" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">';
  h += '<button class="btn btn-outline btn-xs" type="button" onclick="generateUUIDFor(this)" title="生成随机 UUID">🎲</button></div></div>';
  h += '<div class="form-group"><label>alterId</label><input class="form-input short-input" type="number" data-path="outbounds.'+obIdx+'.settings.vnext.'+vnIdx+'.users.'+uIdx+'.alterId" value="'+(u.alterId||0)+'"></div>';
  h += '<div class="form-group"><label>安全</label><select class="form-select security-select" data-path="outbounds.'+obIdx+'.settings.vnext.'+vnIdx+'.users.'+uIdx+'.security">';
  ['auto','aes-128-gcm','chacha20-poly1305','none','zero'].forEach(s => { h += '<option value="'+s+'"'+((u.security||'auto')===s?' selected':'')+'>'+s+'</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>Level</label><input class="form-input short-input" type="number" data-path="outbounds.'+obIdx+'.settings.vnext.'+vnIdx+'.users.'+uIdx+'.level" value="'+(u.level||1)+'"></div>';
  h += '<button class="btn-remove" data-action="remove-user" data-ob-index="'+obIdx+'" data-vn-index="'+vnIdx+'" data-u-index="'+uIdx+'" title="删除用户">✕</button>';
  h += '</div>';
  return h;
}

function buildStreamSettings(ob, i) {
  const ss = ob.streamSettings || {};
  const net = ss.network || 'tcp';
  const sec = ss.security || 'none';
  let h = '<div class="form-row">';
  h += '<div class="form-group"><label>传输协议</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.network">';
  ['tcp','kcp','ws','h2','quic','grpc'].forEach(v => { h += '<option value="'+v+'"'+(net===v?' selected':'')+'>'+v.toUpperCase()+'</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>安全</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.security">';
  ['none','tls','reality'].forEach(v => { h += '<option value="'+v+'"'+(sec===v?' selected':'')+'>'+v.charAt(0).toUpperCase()+v.slice(1)+'</option>'; });
  h += '</select></div>';
  h += '</div>';
  // Per-transport settings
  h += '<div id="transport-settings-'+i+'">'+buildTransportSettings(ob, i, net)+'</div>';
  // Security settings
  h += '<div id="security-settings-'+i+'">'+buildSecuritySettings(ob, i, sec)+'</div>';
  // Sockopt
  const sock = ss.sockopt || {};
  h += '<div class="collapsible" style="margin-top:4px">';
  h += '<div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> Sockopt <span class="hint">(可省略)</span></div>';
  h += '<div class="collapsible-body"><div class="form-row" style="align-items:flex-end">';
  h += '<div class="form-group"><label>Mark</label><input class="form-input field-sm" type="number" data-path="outbounds.'+i+'.streamSettings.sockopt.mark" value="'+(sock.mark||0)+'"><div class="hint">默认: 0</div></div>';
  h += '<div class="form-group" style="padding-bottom:1px"><label>&nbsp;</label><label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.sockopt.tcpFastOpen"'+(sock.tcpFastOpen?' checked':'')+'>'+' TCP Fast Open</label><div class="hint">&nbsp;</div></div>';
  h += '</div></div></div>';
  return h;
}

function buildTransportSettings(ob, i, net) {
  const ss = ob.streamSettings || {};
  let h = '';
  switch (net) {
    case 'tcp': {
      const tcp = ss.tcpSettings || { header: { type: 'none' } };
      h += '<div class="form-row"><div class="form-group"><label>TCP 伪装</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.tcpSettings.header.type">';
      ['none','http'].forEach(v => { h += '<option value="'+v+'"'+(tcp.header&&tcp.header.type===v?' selected':'')+'>'+(v==='none'?'无':'HTTP')+'</option>'; });
      h += '</select></div></div>';
      break;
    }
    case 'kcp': {
      const kcp = ss.kcpSettings || { mtu:1350, tti:20, uplinkCapacity:5, downlinkCapacity:20, congestion:false, readBuffer:2, writeBuffer:2, header:{type:'none'}, seed:'' };
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>MTU</label><input class="form-input" type="number" data-path="outbounds.'+i+'.streamSettings.kcpSettings.mtu" value="'+(kcp.mtu||1350)+'" style="width:70px"> <span class="hint">默认: 1350</span></div>';
      h += '<div class="form-group"><label>TTI</label><input class="form-input" type="number" data-path="outbounds.'+i+'.streamSettings.kcpSettings.tti" value="'+(kcp.tti||20)+'" style="width:60px"> <span class="hint">默认: 20</span></div>';
      h += '<div class="form-group"><label>上行 (MB)</label><input class="form-input" type="number" data-path="outbounds.'+i+'.streamSettings.kcpSettings.uplinkCapacity" value="'+(kcp.uplinkCapacity||5)+'" style="width:60px"> <span class="hint">默认: 5</span></div>';
      h += '<div class="form-group"><label>下行 (MB)</label><input class="form-input" type="number" data-path="outbounds.'+i+'.streamSettings.kcpSettings.downlinkCapacity" value="'+(kcp.downlinkCapacity||20)+'" style="width:60px"> <span class="hint">默认: 20</span></div>';
      h += '</div><div class="form-row">';
      h += '<div class="form-group"><label>伪装类型</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.kcpSettings.header.type">';
      ['none','wechat-video','utp','dtls','wireguard'].forEach(v => { h += '<option value="'+v+'"'+(kcp.header&&kcp.header.type===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select></div>';
      h += '<div class="form-group"><label>Seed</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.kcpSettings.seed" value="'+esc(kcp.seed||'')+'" style="width:120px" placeholder="可选"></div>';
      h += '<label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.kcpSettings.congestion"'+(kcp.congestion?' checked':'')+'>'+' 拥塞控制</label>';
      h += '</div>';
      break;
    }
    case 'ws': {
      const ws = ss.wsSettings || { path:'/', headers:{host:''} };
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>路径</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.wsSettings.path" value="'+esc(ws.path||'/')+'" style="width:150px" placeholder="/"></div>';
      h += '<div class="form-group"><label>Host</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.wsSettings.headers.host" value="'+esc((ws.headers&&ws.headers.host)||'')+'" style="width:200px" placeholder="可选，CDN 需填"></div>';
      h += '</div>';
      break;
    }
    case 'h2': {
      const h2 = ss.httpSettings || { host:[], path:'/' };
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>Host <span class="hint">(逗号分隔)</span></label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.httpSettings.host" value="'+esc((h2.host||[]).join(', '))+'" style="width:250px"></div>';
      h += '<div class="form-group"><label>路径</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.httpSettings.path" value="'+esc(h2.path||'/')+'" style="width:150px"></div>';
      h += '</div>';
      break;
    }
    case 'quic': {
      const quic = ss.quicSettings || { security:'none', key:'', header:{ type:'none' } };
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>加密</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.quicSettings.security">';
      ['none','aes-128-gcm','chacha20-poly1305'].forEach(v => { h += '<option value="'+v+'"'+(quic.security===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select></div>';
      h += '<div class="form-group"><label>Key</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.quicSettings.key" value="'+esc(quic.key||'')+'" style="width:150px"></div>';
      h += '<div class="form-group"><label>伪装</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.quicSettings.header.type">';
      ['none','srtp','utp','wechat-video','dtls','wireguard'].forEach(v => { h += '<option value="'+v+'"'+(quic.header&&quic.header.type===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select></div>';
      h += '</div>';
      break;
    }
    case 'grpc': {
      const grpc = ss.grpcSettings || { serviceName:'', multiMode:false };
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>Service Name</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.grpcSettings.serviceName" value="'+esc(grpc.serviceName||'')+'" style="width:200px"></div>';
      h += '<label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.grpcSettings.multiMode"'+(grpc.multiMode?' checked':'')+'>'+' 多路复用</label>';
      h += '</div>';
      break;
    }
  }
  return h;
}

function buildSecuritySettings(ob, i, sec) {
  const ss = ob.streamSettings || {};
  let h = '';
  switch (sec) {
    case 'tls': {
      const tls = ss.tlsSettings || { serverName:'', allowInsecure:false, alpn:[], certFile:'', keyFile:'' };
      h += '<div class="sub-section-title" style="margin-top:8px">TLS 设置 <span class="hint">(默认值可省略)</span></div>';
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>Server Name (SNI)</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.tlsSettings.serverName" value="'+esc(tls.serverName||'')+'" style="width:200px" placeholder="your-domain.com"></div>';
      h += '<label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.tlsSettings.allowInsecure"'+(tls.allowInsecure?' checked':'')+'>'+' 允许不安全证书</label>';
      h += '</div><div class="form-row">';
      h += '<div class="form-group"><label>ALPN</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.tlsSettings.alpn" value="'+esc((tls.alpn||[]).join(', '))+'" style="width:200px" placeholder="h2, http/1.1"><div class="hint">可选</div></div>';
      h += '</div><div class="form-row">';
      h += '<div class="form-group"><label>Cert 文件</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.tlsSettings.certFile" value="'+esc(tls.certFile||'')+'" style="width:200px" placeholder="服务端必填"></div>';
      h += '<div class="form-group"><label>Key 文件</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.tlsSettings.keyFile" value="'+esc(tls.keyFile||'')+'" style="width:200px" placeholder="服务端必填"></div>';
      h += '</div>';
      break;
    }
    case 'reality': {
      const reality = ss.realitySettings || { serverName:'', fingerprint:'chrome', publicKey:'', shortId:'', spiderX:'/' };
      h += '<div class="sub-section-title" style="margin-top:8px">Reality 设置</div>';
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>Server Name</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.realitySettings.serverName" value="'+esc(reality.serverName||'')+'" style="width:200px" placeholder="如 www.microsoft.com"></div>';
      h += '<div class="form-group"><label>指纹</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.realitySettings.fingerprint">';
      ['chrome','firefox','safari','random','randomized'].forEach(v => { h += '<option value="'+v+'"'+(reality.fingerprint===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select></div>';
      h += '</div><div class="form-row">';
      h += '<div class="form-group"><label>Public Key</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.realitySettings.publicKey" value="'+esc(reality.publicKey||'')+'" style="width:260px;font-family:monospace;font-size:12px"></div>';
      h += '<div class="form-group"><label>Short ID</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.realitySettings.shortId" value="'+esc(reality.shortId||'')+'" style="width:120px;font-family:monospace;font-size:12px" placeholder="8 位十六进制"></div>';
      h += '<div class="form-group"><label>SpiderX</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.realitySettings.spiderX" value="'+esc(reality.spiderX||'/')+'" style="width:100px"></div>';
      h += '</div>';
      break;
    }
  }
  return h;
}

function buildMuxSettings(ob, i) {
  const mux = ob.mux || {};
  let h = '<div class="form-row" style="align-items:flex-end">';
  h += '<div class="form-group" style="padding-bottom:1px"><label>&nbsp;</label><label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.mux.enabled"'+(mux.enabled?' checked':'')+'>'+' 启用 Mux</label><div class="hint">&nbsp;</div></div>';
  h += '<div class="form-group"><label>并发数</label><input class="form-input field-sm" type="number" data-path="outbounds.'+i+'.mux.concurrency" value="'+(mux.concurrency||8)+'"><div class="hint">默认: 8</div></div>';
  h += '</div>';
  return h;
}

// ─── Routing ───────────────────────────────────
function buildRoutingSection() {
  const r = state.routing;
  const rules = r.settings.rules || [];
  // 在渲染前清理 balancer selector 中已不存在的出站 tag（出站改名 / 删除后遗留的引用）。
  // 不清理的话保存后 v2ray-core 会因 selector 指向未注册 tag 报错。
  const currentOutTags = new Set(getOutboundTags());
  const bals = r.settings.balancers || [];
  bals.forEach(b => {
    if (Array.isArray(b.selector)) {
      b.selector = b.selector.filter(t => currentOutTags.has(t));
    }
  });
  // 「规则 → 出站」和「负载均衡器的 tag」共用同一名字空间，清理时要把 balancer tag 也算上，
  // 否则指向 balancer tag 的规则会被误判为失效引用、清空 outboundTag。
  const allOutboundTags = new Set([
    ...currentOutTags,
    ...bals.map(b => b.tag).filter(Boolean),
  ]);
  // 同样的清理也作用于规则：rule.outboundTag 指向已改名/删除的出站时也要清掉。
  rules.forEach(rule => {
    if (rule.outboundTag && !allOutboundTags.has(rule.outboundTag)) {
      rule.outboundTag = '';
    }
  });
  const balancers = r.settings.balancers || [];
  let h = '<div class="form-section" id="section-routing">';
  h += '<div class="form-row">';
  h += '<div class="form-group"><label>域名策略</label><select class="form-select" data-path="routing.settings.domainStrategy">';
  ['AsIs','IPIfNonMatch','IPOnDemand'].forEach(v => { h += '<option value="'+v+'"'+((r.settings.domainStrategy||'AsIs')===v?' selected':'')+'>'+v+'</option>'; });
  h += '</select> <span class="hint">默认: AsIs</span></div>';
  h += '<div class="form-group"><label>域名匹配器</label><select class="form-select" data-path="routing.settings.domainMatcher">';
  ['linear','mph'].forEach(v => { h += '<option value="'+v+'"'+((r.settings.domainMatcher||'linear')===v?' selected':'')+'>'+v+'</option>'; });
  h += '</select> <span class="hint">默认: linear</span></div>';
  h += '</div>';
  // Rules
  rules.forEach((rule, i) => { h += buildRuleItem(rule, i); });
  // 快速模板按钮：内网 IP / 本地 IP / DNS，外加一个空白规则按钮
  h += '<div class="array-actions" style="display:flex;gap:8px;flex-wrap:wrap">';
  h += '  <button class="btn-add preset-add" data-action="add-preset-rule" data-preset="private-ip" title="添加：私有网段走 direct（geoip:private 或具体网段）">🏠 添加：内网 IP</button>';
  h += '  <button class="btn-add preset-add" data-action="add-preset-rule" data-preset="local-ip" title="添加：中国大陆 IP 走 direct（geoip:cn）">🇨🇳 添加：本地 IP</button>';
  h += '  <button class="btn-add preset-add" data-action="add-preset-rule" data-preset="dns" title="添加：DNS 端口（53/UDP）走 direct">📡 添加：DNS</button>';
  h += '  <button class="btn-add preset-add preset-blank" data-action="add-rule" title="添加一条空白规则">➕ 自定义规则</button>';
  h += '</div>';
  // Balancers
  if (balancers.length > 0) {
    h += '<div class="sub-section" style="margin-top:16px"><div class="sub-section-title">负载均衡器</div>';
    const outboundTags = getOutboundTags();
    balancers.forEach((b, bi) => {
      const selected = Array.isArray(b.selector) ? b.selector : [];
      // 与 routing rule 同样的卡片样式，每条 balancer 独立一块
      h += '<div class="array-item">';
      h += '<div class="array-item-header">';
      h += '<span class="array-item-title" style="font-size:12px">负载均衡器 #'+(bi+1)+'</span>';
      h += '<button class="btn-remove" data-action="remove-balancer" data-b-index="'+bi+'" title="删除">✕</button>';
      h += '</div>';
      h += '<div class="form-row" style="align-items:center">';
      h += '<div class="form-group"><label>标签</label><input class="form-input" data-path="routing.settings.balancers.'+bi+'.tag" value="'+esc(b.tag||'')+'" style="width:120px"></div>';
      h += '<div class="form-group" style="flex:1;min-width:240px"><label>选择器 <span class="hint">(点击下方出站标签进行多选)</span></label>';
      // Hidden input carries the canonical value for saveConfig()
      h += '<input type="hidden" data-path="routing.settings.balancers.'+bi+'.selector" value="'+esc(selected.join(','))+'">';
      h += '<div class="tag-picker" data-picker-balancer="'+bi+'">';
      outboundTags.forEach(t => {
        const isSel = selected.includes(t);
        h += '<button type="button" class="tag-chip'+(isSel?' selected':'')+'" data-tag="'+esc(t)+'" onclick="toggleBalancerChip(this)">'+esc(t)+'</button>';
      });
      if (outboundTags.length === 0) {
        h += '<span class="hint">先在「出站」中添加带标签的出站</span>';
      }
      h += '</div>';
      if (selected.length < 2) {
        h += '<div class="hint" data-warn-single="'+bi+'">⚠ 负载均衡器至少需要 2 个出站；当前 '+selected.length+' 个，等同普通出站，可考虑用路由规则替代</div>';
      } else {
        const mixedWarn = getMixedProtocolWarning(selected);
        if (mixedWarn) {
          h += '<div class="hint" data-warn-mixed="'+bi+'">'+esc(mixedWarn)+'</div>';
        }
      }
      h += '</div>';
      h += '<div class="form-group"><label>策略</label><select class="form-select" data-path="routing.settings.balancers.'+bi+'.strategy.type">';
      ['roundRobin','leastPing'].forEach(v => { h += '<option value="'+v+'"'+(b.strategy&&b.strategy.type===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select></div>';
      h += '</div>';
      h += '</div>'; // array-item 闭合
    });
    h += '</div>';
  }
  h += '<div class="array-actions" style="margin-top:8px"><button class="btn-add" data-action="add-balancer">➕ 添加负载均衡器</button></div>';
  h += '</div>';
  return h;
}

function buildRuleItem(rule, i) {
  // 路由规则 → 出站 下拉要把 balancer tag 也算进去：v2ray-core 把 balancer 视为带 tag 的出口，
  // 规则的 outboundTag 字段对二者一视同仁。这里的去重避免同名 balancer / 同名 outbound 重叠显示。
  const tags = Array.from(new Set([
    ...getOutboundTags(),
    ...((state.routing.settings.balancers || []).map(b => b.tag).filter(Boolean)),
  ]));
  let h = '<div class="array-item">';
  h += '<div class="array-item-header">';
  h += '<span class="array-item-title" style="font-size:12px">规则 #'+(i+1)+'</span>';
  h += '<button class="btn-remove" data-action="remove-rule" data-index="'+i+'" title="删除">✕</button>';
  h += '</div>';
  h += '<div class="form-row">';
  h += '<div class="form-group"><label>IP</label><input class="form-input" data-path="routing.settings.rules.'+i+'.ip" value="'+esc((rule.ip||[]).join(', '))+'" style="width:200px" placeholder="geoip:private, 10.0.0.0/8"></div>';
  h += '<div class="form-group"><label>域名</label><input class="form-input" data-path="routing.settings.rules.'+i+'.domain" value="'+esc((rule.domain||[]).join(', '))+'" style="width:200px" placeholder="geosite:cn, domain:google.com"></div>';
  h += '</div><div class="form-row">';
  h += '<div class="form-group"><label>网络</label><select class="form-select" data-path="routing.settings.rules.'+i+'.network">';
  ['','tcp','udp'].forEach(v => { h += '<option value="'+v+'"'+((rule.network||'')===v?' selected':'')+'>'+(v||'任意')+'</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>端口</label><input class="form-input" data-path="routing.settings.rules.'+i+'.port" value="'+esc(rule.port||'')+'" style="width:80px" placeholder="53, 80-443"></div>';
  h += '<div class="form-group"><label>协议</label><select class="form-select" data-path="routing.settings.rules.'+i+'.protocol">';
  ['','http','tls','bittorrent'].forEach(v => { h += '<option value="'+v+'"'+((rule.protocol||'')===v?' selected':'')+'>'+(v||'任意')+'</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>入站标签</label><input class="form-input" data-path="routing.settings.rules.'+i+'.inboundTag" value="'+esc((rule.inboundTag||[]).join(', '))+'" style="width:150px" placeholder="逗号分隔"></div>';
  h += '<div class="form-group"><label>出站</label><select class="form-select" data-path="routing.settings.rules.'+i+'.outboundTag">';
  if (tags.length === 0) h += '<option value="">--</option>';
  tags.forEach(t => { h += '<option value="'+t+'"'+((rule.outboundTag||'')===t?' selected':'')+'>'+t+'</option>'; });
  h += '</select></div>';
  h += '</div>';
  h += '</div>';
  return h;
}

// ─── DNS / Log / Policy sections ──────────────────
function buildDnsSection() {
  let h = '<div class="form-section"><div class="form-group" style="margin-bottom:12px"><label>DNS 配置 (JSON)</label>';
  h += '<textarea data-path="dns" rows="4" style="width:100%">'+esc(state.dns||'{}')+'</textarea>';
  h += '<p class="hint" style="margin-top:4px">支持完整 DNS 配置，示例: {"servers":["8.8.8.8","1.1.1.1"],"queryStrategy":"UseIP"}</p>';
  h += '</div></div>';
  return h;
}

function buildLogSection() {
  const log = state.log || {};
  let h = '<div class="form-section"><div class="form-row">';
  h += '<div class="form-group"><label>日志级别</label><select class="form-select" data-path="log.loglevel">';
  ['debug','info','warning','error','none'].forEach(v => { h += '<option value="'+v+'"'+(log.loglevel===v?' selected':'')+'>'+v+(v==='warning'?' (默认)':'')+'</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>Access 日志路径</label><input class="form-input" data-path="log.access" value="'+esc(log.access||'')+'" style="width:250px" placeholder="留空=不输出"></div>';
  h += '<div class="form-group"><label>Error 日志路径</label><input class="form-input" data-path="log.error" value="'+esc(log.error||'')+'" style="width:250px" placeholder="留空=stdout"></div>';
  h += '</div></div>';
  return h;
}

function buildPolicySection() {
  let h = '<div class="form-section"><div class="form-group" style="margin-bottom:12px"><label>策略 (JSON)</label>';
  h += '<textarea data-path="policy" rows="4" style="width:100%">'+esc(state.policy||'{}')+'</textarea>';
  h += '<p class="hint" style="margin-top:4px">可选，用于控制连接超时和统计。示例: {"levels":{"0":{"connIdle":300}},"system":{}}</p>';
  h += '</div>';
  h += '<div class="form-group"><label>全局传输 (Transport JSON)</label>';
  h += '<textarea data-path="transport" rows="3" style="width:100%">'+esc(state.transport||'{}')+'</textarea>';
  h += '</div></div>';
  return h;
}

function toggleCollapsible(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

function toggleMultiSelect(triggerEl) {
  const ms = triggerEl.closest('.multi-select');
  if (!ms) return;
  // Close other open multi-selects
  document.querySelectorAll('.multi-select.open').forEach(el => { if (el !== ms) el.classList.remove('open'); });
  ms.classList.toggle('open');
}
// Close multi-select when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.multi-select')) {
    document.querySelectorAll('.multi-select.open').forEach(el => el.classList.remove('open'));
  }
});

// ─── Add / Remove ──────────────────────────────
function addInbound() {
  state.inbounds.push(deepClone(DEFAULTS.inboundSocks));
  reloadSection('section-inbounds', buildInboundsSection());
  showToast('已添加入站 (SOCKS5)');
}
function removeInbound(idx) {
  if (state.inbounds.length <= 1) { showToast('至少保留一个入站', 'warning'); return; }
  state.inbounds.splice(idx, 1);
  reloadSection('section-inbounds', buildInboundsSection());
}
function addOutbound() {
  state.outbounds.push(deepClone(DEFAULTS.outboundVmess));
  reloadOutboundsAndRouting();
  showToast('已添加出站 (VMess)');
}
function removeOutbound(idx) {
  if (state.outbounds.length <= 1) { showToast('至少保留一个出站', 'warning'); return; }
  state.outbounds.splice(idx, 1);
  reloadOutboundsAndRouting();
}
function addVnext(obIdx) {
  const ob = state.outbounds[obIdx];
  const isVless = ob.protocol === 'vless';
  ob.settings.vnext.push(deepClone(isVless ? DEFAULTS.vnext : { address:'', port:443, users:[deepClone(DEFAULTS.user)] }));
  reloadOutboundsAndRouting();
}
function removeVnext(obIdx, vnIdx) {
  const vnext = state.outbounds[obIdx].settings.vnext;
  if (vnext.length <= 1) { showToast('至少保留一个服务器', 'warning'); return; }
  vnext.splice(vnIdx, 1);
  reloadOutboundsAndRouting();
}
function addUser(obIdx, vnIdx) {
  state.outbounds[obIdx].settings.vnext[vnIdx].users.push(deepClone(DEFAULTS.user));
  reloadOutboundsAndRouting();
}
function removeUser(obIdx, vnIdx, uIdx) {
  const users = state.outbounds[obIdx].settings.vnext[vnIdx].users;
  if (users.length <= 1) { showToast('至少保留一个用户', 'warning'); return; }
  users.splice(uIdx, 1);
  reloadOutboundsAndRouting();
}
// Inbound clients (VMess/VLESS/Trojan)
function addInboundClient(ibIdx) {
  const ib = state.inbounds[ibIdx];
  const defaults = { id: '', alterId: 0, security: 'auto', level: 1 };
  if (ib.protocol === 'vless') Object.assign(defaults, { flow: '', encryption: 'none' });
  if (ib.protocol === 'trojan') Object.assign(defaults, { password: '', id: undefined, alterId: undefined, security: undefined });
  if (!ib.settings.clients) ib.settings.clients = [];
  ib.settings.clients.push(deepClone(defaults));
  reloadSection('section-inbounds', buildInboundsSection());
}
function removeInboundClient(ibIdx, cIdx) {
  const clients = state.inbounds[ibIdx].settings.clients;
  if (clients.length <= 1) { showToast('至少保留一个用户', 'warning'); return; }
  clients.splice(cIdx, 1);
  reloadSection('section-inbounds', buildInboundsSection());
}
// SOCKS accounts
function addSocksAccount(ibIdx) {
  if (!state.inbounds[ibIdx].settings.accounts) state.inbounds[ibIdx].settings.accounts = [];
  state.inbounds[ibIdx].settings.accounts.push({ user: '', pass: '' });
  reloadSection('section-inbounds', buildInboundsSection());
}
function removeSocksAccount(ibIdx, aIdx) {
  const accounts = state.inbounds[ibIdx].settings.accounts;
  if (!accounts || accounts.length <= 0) return;
  accounts.splice(aIdx, 1);
  reloadSection('section-inbounds', buildInboundsSection());
}
// Fallbacks
function addFallback(ibIdx) {
  if (!state.inbounds[ibIdx].settings.fallbacks) state.inbounds[ibIdx].settings.fallbacks = [];
  state.inbounds[ibIdx].settings.fallbacks.push({ dest: '', path: '', xver: 0 });
  reloadSection('section-inbounds', buildInboundsSection());
}
function removeFallback(ibIdx, fbIdx) {
  const fbs = state.inbounds[ibIdx].settings.fallbacks;
  if (!fbs || fbs.length <= 0) return;
  fbs.splice(fbIdx, 1);
  reloadSection('section-inbounds', buildInboundsSection());
}
// VLESS user
function addVlessUser(obIdx, vnIdx) {
  state.outbounds[obIdx].settings.vnext[vnIdx].users.push({ id: '', encryption: 'none', flow: '', level: 1 });
  reloadOutboundsAndRouting();
}
// Trojan server
function addTrojanServer(obIdx) {
  state.outbounds[obIdx].settings.servers.push(deepClone(DEFAULTS.trojanServer));
  reloadOutboundsAndRouting();
}
function removeTrojanServer(obIdx, svIdx) {
  const svs = state.outbounds[obIdx].settings.servers;
  if (svs.length <= 1) { showToast('至少保留一个服务器', 'warning'); return; }
  svs.splice(svIdx, 1);
  reloadOutboundsAndRouting();
}
// SS server
function addSSServer(obIdx) {
  state.outbounds[obIdx].settings.servers.push(deepClone(DEFAULTS.ssServer));
  reloadOutboundsAndRouting();
}
function removeSSServer(obIdx, svIdx) {
  const svs = state.outbounds[obIdx].settings.servers;
  if (svs.length <= 1) { showToast('至少保留一个服务器', 'warning'); return; }
  svs.splice(svIdx, 1);
  reloadOutboundsAndRouting();
}
// Balancer
function addBalancer() {
  if (!state.routing.settings.balancers) state.routing.settings.balancers = [];
  state.routing.settings.balancers.push(deepClone(DEFAULTS.balancer));
  reloadSection('section-routing', buildRoutingSection());
  showToast('已添加负载均衡器');
}
function removeBalancer(bIdx) {
  const bals = state.routing.settings.balancers;
  if (!bals || bals.length <= 0) return;
  bals.splice(bIdx, 1);
  reloadSection('section-routing', buildRoutingSection());
}

// 切换 balancer 选择器中的一个 chip（出站 tag）的勾选状态。
// 同步更新同一个 row 内的 hidden input（带 data-path），并触发 change 事件
// 让现有序列化路径（setNested）将字符串 → 数组写入 state。
function toggleBalancerChip(chipEl) {
  const picker = chipEl.parentElement;
  const bi = picker.dataset.pickerBalancer;
  const row = picker.closest('.form-row');
  const hidden = row.querySelector('input[type="hidden"][data-path*="balancers.' + bi + '.selector"]');
  const bals = state.routing.settings.balancers || [];
  const cur = Array.isArray(bals[bi] && bals[bi].selector) ? bals[bi].selector.slice() : [];
  const tag = chipEl.dataset.tag;
  const idx = cur.indexOf(tag);
  if (idx >= 0) cur.splice(idx, 1); else cur.push(tag);
  chipEl.classList.toggle('selected');
  if (hidden) {
    hidden.value = cur.join(',');
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // 更新「不足 2 个出站」提示
  const warn = row.querySelector('[data-warn-single="' + bi + '"]');
  if (warn) {
    if (cur.length < 2) {
      warn.textContent = '⚠ 负载均衡器至少需要 2 个出站；当前 ' + cur.length + ' 个，等同普通出站，可考虑用路由规则替代';
    } else {
      warn.remove();
    }
  } else if (cur.length < 2) {
    // 原本没提示（≥2 个），现在切回 <2，动态插入选择器列内（CSS 会绝对定位到 chip 框下沿）
    const newWarn = document.createElement('div');
    newWarn.className = 'hint';
    newWarn.setAttribute('data-warn-single', bi);
    newWarn.textContent = '⚠ 负载均衡器至少需要 2 个出站；当前 ' + cur.length + ' 个，等同普通出站，可考虑用路由规则替代';
    const pickerGroup = picker.closest('.form-group');
    if (pickerGroup) pickerGroup.appendChild(newWarn);
    else row.appendChild(newWarn);
  }

  // 更新「混选不同语义出站」提示 — 只在 ≥2 时检查，与单选提示互斥同一位置
  const mixedEl = row.querySelector('[data-warn-mixed="' + bi + '"]');
  if (cur.length < 2) {
    // <2 时优先单选提示，清掉任何残留的混选提示
    if (mixedEl) mixedEl.remove();
  } else {
    const mixedMsg = getMixedProtocolWarning(cur);
    if (mixedMsg) {
      if (mixedEl) {
        mixedEl.textContent = mixedMsg;
      } else {
        const newMixed = document.createElement('div');
        newMixed.className = 'hint';
        newMixed.setAttribute('data-warn-mixed', bi);
        newMixed.textContent = mixedMsg;
        const pickerGroup = picker.closest('.form-group');
        if (pickerGroup) pickerGroup.appendChild(newMixed);
        else row.appendChild(newMixed);
      }
    } else if (mixedEl) {
      mixedEl.remove();
    }
  }
}
// Rules
function addRule() {
  state.routing.settings.rules.push(deepClone(DEFAULTS.rule));
  reloadSection('section-routing', buildRoutingSection());
  showToast('已添加规则');
}
function removeRule(idx) {
  state.routing.settings.rules.splice(idx, 1);
  reloadSection('section-routing', buildRoutingSection());
}

// 预设规则：在 addRule 按钮行下方弹出一个内联的「geoip / 原始 IP」二选一行，
// 选完即插入对应规则的 rule，关闭弹层。
function addPresetRule(presetKey) {
  const preset = RULE_PRESETS[presetKey];
  if (!preset) return;
  // 关闭上一次可能还挂着的弹层
  closePresetPicker();
  // DNS 的两种变体结果相同，跳过选择直接插入
  const sameVariant =
    JSON.stringify(preset.variants.geo) === JSON.stringify(preset.variants.raw);
  if (sameVariant) {
    insertPresetRule(preset, 'geo');
    return;
  }
  // 在 array-actions 行后面插入一个内联选择器
  const actions = document.querySelector('#section-routing .array-actions');
  if (!actions) return;
  const picker = document.createElement('div');
  picker.className = 'preset-picker';
  picker.dataset.preset = presetKey;
  picker.innerHTML =
    '<span class="preset-picker-label">' + preset.icon + ' ' + esc(preset.label) +
      ' · 选择变体：</span>' +
    '<button type="button" class="preset-chip" data-variant="geo">' +
      '🌐 使用 geoip 关键字 <span class="hint">(需 geoip.dat)</span></button>' +
    '<button type="button" class="preset-chip" data-variant="raw">' +
      '🔢 写死具体网段/端口 <span class="hint">(无需数据文件)</span></button>' +
    '<button type="button" class="preset-chip preset-chip-cancel" data-variant="cancel">取消</button>';
  actions.insertAdjacentElement('afterend', picker);
}
function insertPresetRule(preset, variant) {
  const v = preset.variants[variant];
  // 合并 DEFAULTS.rule（确保所有字段都在）再覆盖用户选择的字段
  const rule = deepClone(DEFAULTS.rule);
  if (v.ip) rule.ip = v.ip.slice();
  if (v.port) rule.port = v.port;
  if (v.network) rule.network = v.network;
  if (v.outboundTag) rule.outboundTag = v.outboundTag;
  // raw 模式下若 IP 为空（local-ip 的具体网段太多），只插入出站占位规则
  if (variant === 'raw' && (!v.ip || v.ip.length === 0) && !v.port) {
    rule.ip = [];
  }
  state.routing.settings.rules.push(rule);
  reloadSection('section-routing', buildRoutingSection());
  const variantLabel = variant === 'geo' ? 'geoip 关键字' : '具体网段';
  showToast('已添加「' + preset.label + '」规则（' + variantLabel + '）');
}
function closePresetPicker() {
  const old = document.querySelector('.preset-picker');
  if (old) old.remove();
}

function reloadSection(id, html) {
  const el = document.getElementById(id);
  if (el) el.outerHTML = html;
}
function reloadOutboundsAndRouting() {
  reloadSection('section-outbounds', buildOutboundsSection());
  reloadSection('section-routing', buildRoutingSection());
}

// ─── Save / Load ───────────────────────────────
async function refreshConfig() {
  if (_dirty && !confirm('当前有未保存的更改，确定要重新加载服务器配置吗？未保存的修改将丢失。')) return;
  try {
    const data = await api('/api/config');
    const parsed = JSON.parse(data.config);
    populateState(parsed);
    if (currentTab === 'form') {
      if (state.inbounds.length > 0 || state.outbounds.length > 0) {
        buildForm();
      }
    }
    if (currentTab === 'json') {
      document.getElementById('configEditor').value = JSON.stringify(parsed, null, 2);
      updateJsonGutter();
      updateCharCount();
    }
    updateOverview();
    markClean();
    showToast('配置已加载');
  } catch(e) {
    if (currentTab === 'form') {
      document.getElementById('emptyState').style.display = '';
      document.getElementById('configForm').style.display = 'none';
    }
    showToast('加载配置失败: ' + e.message, 'error');
  }
}

async function saveConfig() {
  const saveBtn = document.getElementById('saveBtn');
  let configStr;
  if (currentTab === 'form') {
    // Collect pending edits from textareas
    const dnsTA = document.querySelector('textarea[data-path="dns"]');
    const transportTA = document.querySelector('textarea[data-path="transport"]');
    const policyTA = document.querySelector('textarea[data-path="policy"]');
    if (dnsTA) state.dns = dnsTA.value;
    if (transportTA) state.transport = transportTA.value;
    if (policyTA) state.policy = policyTA.value;
    // Collect log from select/input (handled via data-path already)
    configStr = JSON.stringify(buildConfigObject(), null, 2);
    syncStateToEditor();
  } else {
    configStr = document.getElementById('configEditor').value;
    // Validate and update state
    try {
      const parsed = JSON.parse(configStr);
      populateState(parsed);
    } catch(e) { /* textarea may have invalid JSON mid-edit */ }
  }
  try {
    if (saveBtn) { saveBtn.classList.add('loading'); saveBtn.disabled = true; }
    await api('/api/config', 'PUT', { config: configStr });
    updateOverview();
    markClean();
    showToast('配置已保存并应用');
    checkStatus();
  } catch(e) {
    showToast('保存失败: ' + e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.classList.remove('loading'); saveBtn.disabled = false; }
  }
}

function formatConfig() {
  const editor = document.getElementById('configEditor');
  try {
    const parsed = JSON.parse(editor.value);
    editor.value = JSON.stringify(parsed, null, 2);
    showToast('格式化完成');
  } catch(e) {
    showToast('JSON 格式不正确，无法格式化', 'error');
  }
}

// ─── Templates ─────────────────────────────────
function loadTemplate(name) {
  const templates = {
    'socks-client': {
      "inbounds": [{
        "port": 10808, "listen": "127.0.0.1", "protocol": "socks",
        "settings": { "udp": true }, "tag": "socks-in"
      }],
      "outbounds": [{
        "protocol": "vmess",
        "settings": {
          "vnext": [{
            "address": "your-server.com", "port": 443,
            "users": [{ "id": "your-uuid-here", "security": "auto" }]
          }]
        },
        "streamSettings": { "network": "ws", "security": "tls", "wsSettings": { "path": "/" } },
        "tag": "proxy"
      }]
    },
    'http-client': {
      "inbounds": [{
        "port": 10809, "listen": "127.0.0.1", "protocol": "http",
        "settings": {}, "tag": "http-in"
      }],
      "outbounds": [{
        "protocol": "vmess",
        "settings": {
          "vnext": [{
            "address": "your-server.com", "port": 443,
            "users": [{ "id": "your-uuid-here", "security": "auto" }]
          }]
        },
        "streamSettings": { "network": "ws", "security": "tls", "wsSettings": { "path": "/" } },
        "tag": "proxy"
      }]
    },
    'vless-reality': {
      "inbounds": [{
        "port": 10808, "listen": "127.0.0.1", "protocol": "socks",
        "settings": { "udp": true }, "tag": "socks-in"
      }],
      "outbounds": [{
        "protocol": "vless",
        "settings": {
          "vnext": [{
            "address": "your-server.com", "port": 443,
            "users": [{ "id": "your-uuid-here", "encryption": "none", "flow": "xtls-rprx-vision", "level": 1 }]
          }]
        },
        "streamSettings": {
          "network": "tcp", "security": "reality",
          "realitySettings": {
            "serverName": "www.microsoft.com",
            "fingerprint": "chrome",
            "publicKey": "your-public-key",
            "shortId": "0123456789ab",
            "spiderX": "/"
          }
        },
        "tag": "proxy"
      }]
    },
    'shadowsocks': {
      "inbounds": [{
        "port": 10808, "listen": "127.0.0.1", "protocol": "socks",
        "settings": { "udp": true }, "tag": "socks-in"
      }],
      "outbounds": [{
        "protocol": "shadowsocks",
        "settings": {
          "servers": [{
            "address": "your-server.com", "port": 443,
            "method": "aes-256-gcm", "password": "your-password"
          }]
        },
        "tag": "proxy"
      }]
    }
  };
  const t = templates[name];
  if (!t) return;
  // 先切换到表单标签页（会读取编辑器的内容，所以先清空避免覆盖模板数据）
  if (currentTab !== 'form') {
    document.getElementById('configEditor').value = '';
    switchTab('form');
  }
  populateState(t);
  buildForm();
  markDirty();
  showToast('模板已加载，请修改服务器信息');
}

// ─── Event Delegation ──────────────────────────
document.addEventListener('change', function(e) {
  const el = e.target;
  const path = el.dataset.path;
  if (path) {
    // Handle multi-select → comma-separated string
    let value;
    if (el.multiple) {
      value = Array.from(el.selectedOptions).map(o => o.value).join(', ');
    } else {
      value = el.type === 'checkbox' ? el.checked :
              el.type === 'number' ? (el.value === '' ? '' : parseFloat(el.value)) :
              el.value;
    }
   setNested(state, path, value);
    markDirty();

   // Inbound protocol change → re-render settings
    if (path.match(/^inbounds\.\d+\.protocol$/)) {
      const idx = parseInt(path.split('.')[1]);
      reloadInboundSettings(idx);
    }
    // Outbound protocol change → full rebuild
    if (path.match(/^outbounds\.\d+\.protocol$/)) {
      reloadOutboundsAndRouting();
    }
    // Stream network change → re-render transport settings
    if (path.match(/^outbounds\.\d+\.streamSettings\.network$/)) {
      const idx = parseInt(path.split('.')[1]);
      const tsDiv = document.getElementById('transport-settings-'+idx);
      if (tsDiv) tsDiv.innerHTML = buildTransportSettings(state.outbounds[idx], idx, value);
    }
    // Stream security change → re-render security settings
    if (path.match(/^outbounds\.\d+\.streamSettings\.security$/)) {
      const idx = parseInt(path.split('.')[1]);
      const ssDiv = document.getElementById('security-settings-'+idx);
      if (ssDiv) ssDiv.innerHTML = buildSecuritySettings(state.outbounds[idx], idx, value);
    }
    // SOCKS auth change → re-render settings to show/hide accounts
    if (path.match(/^inbounds\.\d+\.settings\.auth$/)) {
      const idx = parseInt(path.split('.')[1]);
      const ib = state.inbounds[idx];
      if (ib && ib.protocol === 'socks') {
        reloadInboundSettings(idx);
      }
    }
    // Outbound tag change → update routing dropdowns
    if (path.match(/^outbounds\.\d+\.tag$/)) {
      reloadSection('section-routing', buildRoutingSection());
    }
  }
});

document.addEventListener('click', function(e) {
  // ── 预设规则 picker 的 chip 点击 ──
  const chip = e.target.closest('.preset-chip');
  if (chip) {
    const picker = chip.closest('.preset-picker');
    if (!picker) return;
    const presetKey = picker.dataset.preset;
    const variant = chip.dataset.variant;
    e.preventDefault();
    if (variant === 'cancel' || !variant) { closePresetPicker(); return; }
    const preset = RULE_PRESETS[presetKey];
    if (preset) insertPresetRule(preset, variant);
    closePresetPicker();
    markDirty();
    return;
  }
  // ── 点 picker 外部区域关闭 ──
  if (!e.target.closest('.preset-picker')) {
    closePresetPicker();
  }

  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const idx = parseInt(btn.dataset.index);
  const obIdx = parseInt(btn.dataset.obIndex);
  const vnIdx = parseInt(btn.dataset.vnIndex);
  const uIdx = parseInt(btn.dataset.uIndex);
  const ibIdx = parseInt(btn.dataset.ibIndex);
  const cIdx = parseInt(btn.dataset.cIndex);
  const fbIdx = parseInt(btn.dataset.fbIndex);
  const svIdx = parseInt(btn.dataset.svIndex);
  const bIdx = parseInt(btn.dataset.bIndex);
  const aIdx = parseInt(btn.dataset.aIndex);

  e.preventDefault();
  switch(action) {
    case 'add-inbound': addInbound(); break;
    case 'remove-inbound': removeInbound(idx); break;
    case 'add-outbound': addOutbound(); break;
    case 'remove-outbound': removeOutbound(idx); break;
    case 'add-vnext': addVnext(obIdx); break;
    case 'remove-vnext': removeVnext(obIdx, vnIdx); break;
    case 'add-user': addUser(obIdx, vnIdx); break;
    case 'remove-user': removeUser(obIdx, vnIdx, uIdx); break;
    case 'add-vless-user': addVlessUser(obIdx, vnIdx); break;
    case 'add-inbound-client': addInboundClient(ibIdx); break;
    case 'remove-inbound-client': removeInboundClient(ibIdx, cIdx); break;
    case 'add-fallback': addFallback(ibIdx); break;
    case 'remove-fallback': removeFallback(ibIdx, fbIdx); break;
    case 'add-trojan-server': addTrojanServer(obIdx); break;
    case 'remove-trojan-server': removeTrojanServer(obIdx, svIdx); break;
    case 'add-ss-server': addSSServer(obIdx); break;
    case 'remove-ss-server': removeSSServer(obIdx, svIdx); break;
    case 'add-balancer': addBalancer(); break;
    case 'remove-balancer': removeBalancer(bIdx); break;
    case 'add-socks-account': addSocksAccount(ibIdx); break;
    case 'remove-socks-account': removeSocksAccount(ibIdx, aIdx); break;
    case 'add-rule': addRule(); break;
    case 'remove-rule': removeRule(idx); break;
    case 'add-preset-rule': addPresetRule(btn.dataset.preset); break;
  }
  markDirty();
});

function reloadInboundSettings(idx) {
  const container = document.getElementById('inbound-settings-' + idx);
  if (!container) return;
  const ib = state.inbounds[idx];
  container.innerHTML = buildInboundSettingsByProtocol(ib, idx, ib.protocol);
}

// ─── Overview Dashboard ───────────────────────
function updateOverview() {
  const inbs = state.inbounds || [];
  const obs = state.outbounds || [];
  const rules = (state.routing && state.routing.settings && state.routing.settings.rules) || [];
  const ports = inbs.map(ib => ib.port).filter(Boolean);
  const uniquePorts = new Set(ports);

  document.getElementById('ovInbounds').textContent = inbs.length;
  document.getElementById('ovOutbounds').textContent = obs.length;
  document.getElementById('ovRules').textContent = rules.length;
  document.getElementById('ovPorts').textContent = uniquePorts.size;

  document.getElementById('ovInboundsDetail').innerHTML = protoChips(countBy(inbs.map(ib => ib.protocol))) || '无入站';
  document.getElementById('ovOutboundsDetail').innerHTML = protoChips(countBy(obs.map(ob => ob.protocol))) || '无出站';
  document.getElementById('ovRulesDetail').textContent = rules.length + ' 条规则';
  document.getElementById('ovPortsDetail').textContent = ports.length ? ports.join(' · ') : '无监听';
  buildFlowViz();
}
function countBy(arr) {
  return arr.reduce((acc, v) => { if (v) acc[v] = (acc[v]||0)+1; return acc; }, {});
}
function protoChips(counts) {
  return Object.entries(counts).map(([k,v]) =>
    '<span class="proto-chip">' + esc(k) + (v>1?' ×'+v:'') + '</span>'
  ).join('');
}

// ─── Flow Visualization ─────────────────────────
const PROTO_LABELS = {
  socks: 'SOCKS5', http: 'HTTP', vmess: 'VMess', vless: 'VLESS',
  trojan: 'Trojan', shadowsocks: 'Shadowsocks', freedom: 'Freedom',
  blackhole: 'Blackhole', dns: 'DNS', 'dokodemo-door': 'Dokodemo'
};
function protoLabel(p) { return PROTO_LABELS[p] || p || '—'; }

function outboundDesc(ob) {
  switch (ob.protocol) {
    case 'freedom': return '直连，不走代理';
    case 'blackhole': return '拦截 / 丢弃';
    case 'dns': return 'DNS 出站';
    default: return ob.tag || protoLabel(ob.protocol);
  }
}

function outboundServer(ob) {
  // 优先级：有语义 tag 的就用 tag（如 "proxy" / "proxy-xg"），方便一眼辨认出口角色；
  // 没命名 tag 时才退回 "address:port"，避免新建未命名出站时丢信息。
  if (ob.tag) return ob.tag;
  const s = ob.settings || {};
  if (s.vnext && s.vnext[0]) return (s.vnext[0].address || '服务器') + (s.vnext[0].port ? ':' + s.vnext[0].port : '');
  if (s.servers && s.servers[0]) return (s.servers[0].address || '服务器') + (s.servers[0].port ? ':' + s.servers[0].port : '');
  return protoLabel(ob.protocol);
}

// 返回目的地节点链（代理类有"服务器地址"+"目标网站"两个）
// arrow: 指向该节点的那条箭头上的标签
function destChain(ob) {
  // balancer 行：ob._isBalancer === true。ob.selectorItems 是 selector 命中的出站数组。
  // 同一行内画 [服务器1, 服务器2, ..., 目标网站]——多个候选顺排，最终汇入唯一终点。
  //（语义：每条连接按策略择一selector，并非同时分发到所有selector）
  if (ob._isBalancer) {
    const items = ob.selectorItems || [];
    const chain = items.map(it => ({
      text: it.text,
      cls: 'server ' + (it.pathCls || 'proxy'),
      arrow: it.arrow || ''
    }));
    chain.push({ text: '目标网站', cls: 'target', arrow: '代理转发' });
    return chain;
  }
  switch (ob.protocol) {
    case 'freedom': return [{ text: '目标网站', cls: 'target', arrow: '直连' }];
    case 'blackhole': return [{ text: '流量丢弃', cls: 'block' }];
    case 'dns': return [{ text: 'DNS 解析处理', cls: '' }];
    default: return [
      { text: outboundServer(ob), cls: 'server', arrow: transportLabel(ob) },
      { text: '目标网站', cls: 'target', arrow: '代理转发' }
    ];
  }
}

// 出站归属的路径语义：direct(绿) / block(红) / proxy(紫)
function flowPathCls(ob) {
  if (ob.protocol === 'freedom') return 'direct';
  if (ob.protocol === 'blackhole') return 'block';
  return 'proxy';
}

// 传输方式标注，如 "WS / TLS"（v4 字段名：network / security）
function transportLabel(ob) {
  const ss = ob.streamSettings || {};
  const parts = [];
  if (ss.network) parts.push(String(ss.network).toUpperCase());
  if (ss.security && ss.security !== 'none') parts.push(String(ss.security).toUpperCase());
  return parts.join(' / ');
}

function describeRule(rule) {
  const chips = [];
  if (rule.ip && rule.ip.length) {
    const v = rule.ip.join(', ');
    chips.push({ k: 'IP', v: v.includes('geoip:private') ? '内网地址' : v });
  }
  if (rule.domain && rule.domain.length) chips.push({ k: '域名', v: rule.domain.join(', ') });
  if (rule.port) chips.push({ k: '端口', v: rule.port });
  if (rule.network) chips.push({ k: '网络', v: rule.network.toUpperCase() });
  if (rule.protocol) chips.push({ k: '协议', v: rule.protocol });
  if (rule.inboundTag && rule.inboundTag.length) chips.push({ k: '入站', v: rule.inboundTag.join(', ') });
  return chips;
}
function ruleCondStr(rule) {
  const parts = describeRule(rule);
  if (parts.length === 0) return '所有流量';
  return parts.map(c => c.k + ': ' + c.v).join(' · ');
}

function buildFlowViz() {
  const card = document.getElementById('flowVizCard');
  const hint = document.getElementById('flowVizHint');
  const host = document.getElementById('flowCanvasRouting');
  if (!card || !host) return;

  // 数据收集
  const inbs = state.inbounds || [];
  const obs = state.inbounds && state.outbounds ? state.outbounds : [];
  const routing = state.routing && state.routing.settings ? state.routing.settings : {};
  const rules = routing.rules || [];
  const balancers = routing.balancers || [];

  if (obs.length === 0 && balancers.length === 0) { card.style.display = 'none'; return; }
  card.style.display = '';

  const rulesByTag = {};
  const rulesByBalancer = {};
  rules.forEach((r, idx) => {
    if (r.outboundTag) {
      const tag = r.outboundTag;
      if (!rulesByTag[tag]) rulesByTag[tag] = [];
      rulesByTag[tag].push({ r, idx });
    }
    if (r.balancerTag) {
      const tag = r.balancerTag;
      if (!rulesByBalancer[tag]) rulesByBalancer[tag] = [];
      rulesByBalancer[tag].push({ r, idx });
    }
  });

  const balancerSelectedTags = new Set();
  balancers.forEach(b => {
    (b.selector || []).forEach(t => {
      if (t) balancerSelectedTags.add(t);
    });
  });

  const defaultTag = obs.length ? (obs[0].tag || '') : '';
  const hasRouting = rules.length > 0;

  const rows = [];
  balancers.forEach(bal => {
    if (!bal.tag) return;
    const matched = (rulesByBalancer[bal.tag] || []).slice();
    const selectorItems = (bal.selector || [])
      .map(tag => obs.find(o => o.tag === tag))
      .filter(Boolean)
      .map(ob => ({
        text: outboundServer(ob),
        pathCls: flowPathCls(ob),
        arrow: transportLabel(ob)
      }));
    rows.push({
      kind: 'balancer', bal, matched, selectorItems, pathCls: 'proxy'
    });
  });
  obs.forEach((ob, i) => {
    if (balancerSelectedTags.has(ob.tag || '')) return;
    const isDefault = i === 0;
    const tag = ob.tag || '';
    let matched = [];
    if (isDefault) {
      matched = (rulesByTag[''] || []).slice();
      if (defaultTag && rulesByTag[defaultTag]) matched = matched.concat(rulesByTag[defaultTag]);
    } else {
      matched = rulesByTag[tag] || [];
    }
    rows.push({
      kind: 'outbound', ob, isDefault, matched, pathCls: flowPathCls(ob)
    });
  });

  // hint
  if (rows.length === 0) {
    hint.textContent = '暂无出站或负载均衡器';
  } else if (balancers.length > 0) {
    const balLabels = balancers.filter(b => b.tag).map(b => b.tag).join(' / ');
    const obLabels = obs.filter(o => !balancerSelectedTags.has(o.tag || ''))
                        .map(o => outboundDesc(o) + (o.tag ? '·' + o.tag : '')).join(' / ');
    hint.textContent = rules.length + ' 条规则 · ' +
      balancers.length + ' 个负载均衡器（' + balLabels + '） · ' +
      (obLabels ? '剩余出站：' + obLabels : '所有出站都被负载均衡器选中');
  } else if (obs.length > 0) {
    hint.textContent = hasRouting
      ? rules.length + ' 条规则分流，其余走默认（' + outboundDesc(obs[0]) + '）'
      : '无路由规则，全部走默认（' + outboundDesc(obs[0]) + '）';
  } else {
    hint.textContent = '';
  }

  // 单一画布：app → inbound → router → (规则分支) → outbound/balancer → dest 链
  //   balancer 行右侧在同一画布内画出 [服务器1, 服务器2, ..., 目标网站]。
  renderFlowCanvas(host, inbs, rules, rows, hasRouting, balancers, obs);
}

// 通用渲染器：app → inbound → router → (规则分支) → outbound/balancer → dest 链
//   balancer 行右侧在同一画布内画出 [服务器1, 服务器2, ..., 目标网站]。
function renderFlowCanvas(host, inbs, rules, rows, hasRouting, balancers, obs) {
  const activeRows = rows;

  const rowForChain = (r) => {
    if (r.kind === 'balancer') {
      return Object.assign({ _isBalancer: true, selectorItems: r.selectorItems }, r.bal);
    }
    return r.ob;
  };
  const chains = activeRows.map(r => destChain(rowForChain(r)));
  const maxDests = chains.length ? Math.max(1, ...chains.map(c => c.length)) : 1;

  // 网格列：app=1, arrow=2, inbound=3, arrow=4, router=5,
  //         branch=6, rules=7, arrow=8, outbound=9, arrow=10, dest 起点=11...
  const totalGridCols = 10 + Math.max(1, maxDests) * 2;
  const condCol = 7;
  const outCol = 9;
  const destStartCol = 11;
  const lastContentCol = destStartCol + Math.max(0, maxDests - 1) * 2;

  // 行起点数组。balancer 行按 selectorItems 数量纵向展开。
  const rowStarts = [];
  let totalRows = 1;
  {
    let acc = 1;
    activeRows.forEach((r) => {
      rowStarts.push(acc);
      const used = r.kind === 'balancer' ? Math.max(1, (r.selectorItems || []).length) : 1;
      acc += used;
      totalRows = Math.max(totalRows, acc - 1);
    });
  }

  let html = '';
  html += '<div class="flow-canvas" style="--cols:' + totalGridCols + ';--rows:' + totalRows + '">';

  // 主轴：app → inbound → router
  html += '<div class="flow-node flow-node-app" style="grid-column:1;grid-row:1">';
  html += '<div class="flow-node-title">🖥️ 应用发起连接</div>';
  html += '<div class="flow-node-sub">浏览器 / curl 等</div></div>';
  html += '<div class="flow-arrow-r" style="grid-column:2;grid-row:1"></div>';
  html += '<div class="flow-node flow-node-inbound" style="grid-column:3;grid-row:1">';
  html += '<div class="flow-node-title">📥 入站 Inbound</div>';
  if (inbs.length === 0) {
    html += '<div class="flow-node-sub">无入站</div>';
  } else {
    html += '<div class="flow-inbound-ports">';
    inbs.forEach(ib => {
      html += '<span class="proto-chip">' + protoLabel(ib.protocol) + ' :' + esc(ib.port || '—') + '</span>';
    });
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="flow-arrow-r" style="grid-column:4;grid-row:1"></div>';
  html += '<div class="flow-node flow-node-router" style="grid-column:5;grid-row:1">';
  html += '<div class="flow-router-icon"><span>🔀</span></div>';
  html += '<div class="flow-node-title">路由匹配</div>';
  html += '<div class="flow-node-sub">' + rules.length + ' 条规则</div>';
  html += '</div>';
  let targetAnchored = false;
  let anchorCol = 0;
  let anchorRow = 0;

  // ── 渲染每一行 ──
  activeRows.forEach((r, i) => {
    const rowStart = rowStarts[i];
    const pathCls = r.pathCls;
    const matched = r.matched;
    const isBalancer = r.kind === 'balancer';
    const isDefault = r.kind === 'outbound' && r.isDefault;
    const isStackedBalancer = isBalancer && (r.selectorItems || []).length > 1;

    // 路由 → 条件 的分支箭头
    let branchLabel = '';
    if (matched.length > 0) branchLabel = isDefault ? '命中 / 未命中' : '命中';
    else if (isDefault) branchLabel = '未命中';
    else if (isBalancer) branchLabel = '未命中';
    html += '<div class="flow-arrow-r flow-branch-arrow labeled ' + pathCls + '" style="grid-column:6;grid-row:' + rowStart + '">';
    if (branchLabel) html += '<span class="flow-arrow-label">' + branchLabel + '</span>';
    html += '</div>';

    // 条件列
    const rulesFrameCls = isBalancer ? 'proxy' : pathCls;
    html += '<div class="flow-rules-stack is-' + rulesFrameCls + '-path' + (matched.length > 0 ? ' framed' : '') + '" style="grid-column:' + condCol + ';grid-row:' + rowStart + '">';
    if (matched.length > 1) {
      html += '<span class="flow-rules-label">自上而下 · 命中即停</span>';
    }
    matched.forEach(m => {
      html += '<div class="flow-rule-node">';
      html += '<div class="flow-rule-num">规则 #' + (m.idx + 1) + '</div>';
      html += '<div class="flow-rule-cond">' + esc(ruleCondStr(m.r)) + '</div>';
      html += '</div>';
    });
    if (r.kind === 'outbound' && isDefault) {
      html += '<div class="flow-rule-node is-default">';
      html += '<div class="flow-rule-num">默认</div>';
      html += '<div class="flow-rule-cond">' + (hasRouting ? '未命中任何规则' : '所有流量') + '</div>';
      html += '</div>';
    }
    if (r.kind === 'outbound' && !isDefault && matched.length === 0) {
      html += '<div class="flow-rule-node is-empty"><div class="flow-rule-cond">无规则指向</div></div>';
    }
    if (isBalancer && matched.length === 0) {
      // 用「默认」语义替换「未被任何规则引用」误导文案
      html += '<div class="flow-rule-node is-default">';
      html += '<div class="flow-rule-num">默认</div>';
      html += '<div class="flow-rule-cond">默认走此 Balancer</div>';
      html += '</div>';
    }
    html += '</div>';

    // 条件 → 节点 箭头
    html += '<div class="flow-arrow-r ' + pathCls + '" style="grid-column:8;grid-row:' + rowStart + '"></div>';

    // 节点（出站 或 balancer）
    const balGroupId = isStackedBalancer ? ('balgrp-' + i) : '';
    if (isBalancer) {
      const bal = r.bal;
      const strat = (bal.strategy && bal.strategy.type) || 'roundRobin';
      const showStack = isStackedBalancer;
      const spanRows = showStack
        ? rowStart + ' / ' + (rowStart + (r.selectorItems || []).length)
        : rowStart;
      html += '<div class="flow-node flow-node-balancer' + (showStack ? ' is-stacked' : '') + ' ' + pathCls + '"' + (balGroupId ? ' data-bal-group="' + balGroupId + '"' : '') + ' style="grid-column:' + outCol + ';grid-row:' + spanRows + '">';
      html += '<div class="flow-node-title"><span class="flow-balancer-icon">⚖</span>' + esc(bal.tag || '—') + '</div>';
      const subText = strategyLabel(strat) + ' · ' + r.selectorItems.length + ' 个出站';
      html += '<div class="flow-node-sub">' + subText + '</div>';
      html += '</div>';
    } else {
      const ob = r.ob;
      html += '<div class="flow-node flow-node-out ' + pathCls + (isDefault ? ' default' : '') + '" style="grid-column:' + outCol + ';grid-row:' + rowStart + '">';
      html += '<div class="flow-node-title"><span class="protocol-tag ' + (ob.protocol || '') + '">' + protoLabel(ob.protocol) + '</span>';
      if (isDefault) html += '<span class="flow-default-badge">默认</span>';
      html += '</div>';
      html += '<div class="flow-node-sub">' + esc(outboundDesc(ob)) + (ob.tag ? ' · ' + esc(ob.tag) : '') + '</div>';
      html += '</div>';
    }

    // 节点 → dest 链（所有行：普通出站单个 dest，balancer 多个候选 + 目标）
    const dests = chains[i];
    const destClsOf = (dest) => {
      const cls = dest.cls || '';
      const parts = cls.split(' ').filter(c => c && c !== 'target' && c !== 'server' && c !== 'block');
      if (cls.indexOf('target') >= 0) parts.push('target');
      if (cls.indexOf('server') >= 0) parts.push('server');
      if (cls.indexOf('block') >= 0) parts.push('block');
      return parts.join(' ');
    };
    const segClsOf = (dest) => {
      const cls = dest.cls || '';
      if (cls.indexOf(' ') >= 0) {
        return cls.split(' ').filter(c => c === 'direct' || c === 'proxy' || c === 'block').join(' ') || pathCls;
      }
      return pathCls;
    };
    const renderDestNode = (dest, gridCol, gridRow, extraCls, dataAttr) => {
      const isTarget = (dest.cls || '').indexOf('target') >= 0;
      const anchor = (isTarget && !targetAnchored) ? ' is-target-anchor' : '';
      html += '<div class="flow-node flow-node-dest ' + destClsOf(dest) + anchor + (extraCls || '') + '"' + (dataAttr || '') + ' style="grid-column:' + gridCol + ';grid-row:' + gridRow + '">';
      html += '<div class="flow-node-title">' + esc(dest.text) + '</div>';
      html += '</div>';
      if (isTarget) {
        targetAnchored = true;
        anchorCol = gridCol;
        anchorRow = gridRow;
      }
    };

    if (isStackedBalancer) {
      const servers = dests.slice(0, -1);
      const targetDest = dests[dests.length - 1];
      const stackCol = destStartCol;
      const linkCol = destStartCol + 1;
      const targetCol = destStartCol + 2;
      const targetRow = rowStart;
      const lastServerRow = rowStart + servers.length - 1;
      const targetMerged = (targetDest.cls || '').indexOf('target') >= 0 && targetAnchored;

      const arrow1 = dests[0].arrow || '';
      html += '<div class="flow-arrow-r ' + segClsOf(dests[0]) + (arrow1 ? ' labeled' : '') +
              '" style="grid-column:' + (stackCol - 1) + ';grid-row:' + rowStart + '">';
      if (arrow1) html += '<span class="flow-arrow-label">' + esc(arrow1) + '</span>';
      html += '</div>';
      renderDestNode(dests[0], stackCol, rowStart, '', ' data-bal-group="' + balGroupId + '"');

      if (!targetMerged) {
        const tArrow = targetDest.arrow || '';
        html += '<div class="flow-arrow-r ' + segClsOf(targetDest) + (tArrow ? ' labeled' : '') +
                '" style="grid-column:' + linkCol + ';grid-row:' + targetRow + '">';
        if (tArrow) html += '<span class="flow-arrow-label">' + esc(tArrow) + '</span>';
        html += '</div>';
        renderDestNode(targetDest, targetCol, targetRow);
      }

      if (servers.length >= 2) {
        // s2 箭头占 r2 单行（与 s1 同款 flow-arrow-r.labeled，自身画 40px 水平线 + 标签），
        // 不再跨行 + bypass + elbow 折线，保证与上方 s1 箭头长度、字与箭头间隙完全一致。
        const linkArrow = dests[1].arrow || '';
        const linkSeg = segClsOf(dests[1]);
        html += '<div class="flow-arrow-r ' + linkSeg + (linkArrow ? ' labeled' : '') +
                '" style="grid-column:' + (stackCol - 1) + ';grid-row:' + (rowStart + 1) + '">';
        if (linkArrow) html += '<span class="flow-arrow-label">' + esc(linkArrow) + '</span>';
        html += '</div>';
        renderDestNode(dests[1], stackCol, rowStart + 1, '', ' data-bal-group="' + balGroupId + '"');
      }

      for (let si = 2; si < servers.length; si++) {
        const sd = servers[si];
        const sRow = rowStart + si;
        const vArrow = sd.arrow || '';
        const vSeg = segClsOf(sd);
        html += '<div class="flow-arrow-d ' + vSeg + (vArrow ? ' labeled' : '') +
                '" style="grid-column:' + linkCol + ';grid-row:' + (sRow - 1) + '/' + sRow + '">';
        if (vArrow) html += '<span class="flow-arrow-label">' + esc(vArrow) + '</span>';
        html += '</div>';
        renderDestNode(sd, stackCol, sRow, '', ' data-bal-group="' + balGroupId + '"');
      }

      if (targetMerged) {
        const from = linkCol;
        const to = anchorCol + 1;
        html += '<div class="flow-arrow-merge ' + segClsOf(targetDest) + '" style="grid-column:' +
                from + '/' + to + ';grid-row:' + lastServerRow + '">';
        if (targetDest.arrow) html += '<span class="flow-arrow-label">' + esc(targetDest.arrow) + '</span>';
        html += '</div>';
      }
    } else {
      let curCol = lastContentCol - (dests.length - 1) * 2;
      dests.forEach((dest, di) => {
        const al = dest.arrow || '';
        if ((dest.cls || '').indexOf('target') >= 0 && targetAnchored) {
          const from = di === 0 ? outCol + 1 : curCol - 1;
          html += '<div class="flow-arrow-merge ' + segClsOf(dest) + '" style="grid-column:' +
                  from + '/' + (anchorCol + 1) + ';grid-row:' + rowStart + '">';
          if (al) html += '<span class="flow-arrow-label">' + esc(al) + '</span>';
          html += '</div>';
          curCol += 2;
          return;
        }
        html += '<div class="flow-arrow-r ' + segClsOf(dest) + (al ? ' labeled' : '') +
                '" style="grid-column:' + (curCol - 1) + ';grid-row:' + rowStart + '">';
        if (al) html += '<span class="flow-arrow-label">' + esc(al) + '</span>';
        html += '</div>';
        renderDestNode(dest, curCol, rowStart);
        curCol += 2;
      });
    }
  });

  // 路由下方竖向 bus（行数 ≥ 2）
  if (totalRows >= 2) {
    html += '<div class="flow-arrow-d-bus" style="grid-column:5;grid-row:1/' + (totalRows + 1) + '"></div>';
  }

  html += '</div>'; // flow-canvas

  // 图例（位于画布之外、host 末尾，独立排开）
  {
    const legendParts = [];
    legendParts.push({ cls: 'proxy', text: '代理路径：经出站服务器中转 → 目标网站' });
    if (balancers.length > 0) {
      legendParts.push({ cls: 'balancer', text: '负载均衡：从选中的出站中按策略选一个' });
    }
    if (obs.some(o => o.protocol === 'freedom')) {
      legendParts.push({ cls: 'direct', text: '直连路径：direct(freedom) → 目标网站' });
    }
    if (obs.some(o => o.protocol === 'blackhole')) {
      legendParts.push({ cls: 'block', text: '拦截路径：blackhole → 流量丢弃' });
    }
    if (legendParts.length > 1) {
      html += '<div class="flow-legend">';
      legendParts.forEach(d => {
        html += '<span class="flow-legend-item">';
        html += '<span class="flow-legend-swatch ' + d.cls + '"></span>' + d.text;
        html += '</span>';
      });
      html += '</div>';
    }
  }

  host.innerHTML = html;

  const canvas = host.querySelector('.flow-canvas');
  if (!canvas) return;

  // 堆叠 balancer 行：r1 高度被 router 节点（col 5）撑到 router.h，r2 没有高 item
  // 撑高 track，导致 r1 ≫ r2、s2 dest 居中后贴 r2 顶。r1/r2 等高由 r2 col 9 的镜像
  // spacer（min-height = router.h）保证（s1/s2 dest 居中后关于虚框中线对称）。
  // 必须在 group-box 测量之前完成，确保虚框包含已撑高后的 s2 dest 真实位置。
  const router = canvas.querySelector('.flow-node-router');
  if (router) {
    const rh = router.getBoundingClientRect().height;
    if (rh > 0) {
      canvas.querySelectorAll('.flow-node-balancer.is-stacked').forEach(bal => {
        const m = (bal.style.gridRow || '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
        if (!m) return;
        const r2Line = +m[2];
        const lastRow = r2Line - 1;
        const spacer = document.createElement('div');
        spacer.className = 'flow-row-mirror';
        spacer.style.gridColumn = '9';
        spacer.style.gridRow = String(lastRow);
        spacer.style.minHeight = rh + 'px';
        canvas.appendChild(spacer);
      });
    }
  }

  // 路由 bus → 第 2 行起的分支箭头
  {
    const bus = canvas.querySelector('.flow-arrow-d-bus');
    if (bus) {
      const branchArrows = Array.from(canvas.querySelectorAll('.flow-canvas > .flow-branch-arrow')).slice(1);
      if (branchArrows.length) {
        const busRect = bus.getBoundingClientRect();
        const originY = busRect.top;
        const originX = busRect.left;

        branchArrows.forEach(a => {
          const r = a.getBoundingClientRect();
          const midY = r.top + r.height / 2;
          const w = r.right - originX;
          const h = midY - originY;
          if (w <= 0 || h <= 0) return;

          const elbow = document.createElement('span');
          elbow.className = 'flow-bus-elbow';
          elbow.style.left = '0px';
          elbow.style.top = '0px';
          elbow.style.width = w + 'px';
          elbow.style.height = h + 'px';
          const pc = elbowColorFor(a);
          if (pc) elbow.style.setProperty('--elbow-color', pc);
          bus.appendChild(elbow);

          a.style.background = 'none';
          a.classList.add('is-superseded');
        });
      }
    }
  }

  // 目标网站汇入折线
  {
    const anchorNode = canvas.querySelector('.is-target-anchor');
    const merges = Array.from(canvas.querySelectorAll('.flow-arrow-merge'));
    if (anchorNode && merges.length) {
      const cRect = canvas.getBoundingClientRect();
      const aRect = anchorNode.getBoundingClientRect();
      const ox = canvas.scrollLeft - cRect.left;
      const oy = canvas.scrollTop - cRect.top;
      const upX = aRect.left + aRect.width / 2 + ox;
      const upY = aRect.bottom + oy;

      merges.forEach(m => {
        const r = m.getBoundingClientRect();
        const x = r.left + ox;
        const w = upX - x;
        const h = r.top + r.height / 2 + oy - upY;
        if (w <= 0 || h <= 0) return;

        const elbow = document.createElement('span');
        elbow.className = 'flow-merge-elbow';
        elbow.style.left = x + 'px';
        elbow.style.top = upY + 'px';
        elbow.style.width = w + 'px';
        elbow.style.height = h + 'px';
        const pc = elbowColorFor(m);
        if (pc) elbow.style.setProperty('--elbow-color', pc);
        canvas.appendChild(elbow);
      });
    }

    // 堆叠 balancer → s2 水平连线已由 s2 自身 .flow-arrow-r.labeled 承担（与 s1 同款），
    // 不再使用 bypass 折线，因此无需再生成 .flow-bypass-elbow。
  }

  // 堆叠 balancer + 其 selector 出站服务器 用虚线框圈起，表示逻辑上是一个整体。
  // 目标网站节点不带 data-bal-group，因此被排除在外。包围盒由各节点的实际矩形
  // 取并集得到（与 elbow 折线同套坐标换算），画在 z-index:0 层，置于节点下方。
  {
    const groups = {};
    canvas.querySelectorAll('[data-bal-group]').forEach(el => {
      const g = el.getAttribute('data-bal-group');
      (groups[g] = groups[g] || []).push(el);
    });
    const cRect = canvas.getBoundingClientRect();
    const ox = canvas.scrollLeft - cRect.left;
    const oy = canvas.scrollTop - cRect.top;
    Object.keys(groups).forEach(g => {
      const els = groups[g];
      // 堆叠 balancer 组：虚框上下边界由 dest 节点决定（s1.top / s2.bottom），
      // 而不是由 balancer 节点决定 —— 否则 balancer 跨 r1+r2 撑高导致
      // s1 距虚框顶 ≫ s2 距虚框底、视觉上 s2 箭头贴 dest 框下边缘。
      // X 方向仍取并集，让虚框左右包住 balancer 框。
      const hasBalancer = els.some(el => el.classList.contains('flow-node-balancer'));
      const destEls = hasBalancer ? els.filter(el => el.classList.contains('flow-node-dest')) : els;
      const yEls = destEls.length ? destEls : els;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      els.forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        minX = Math.min(minX, r.left + ox);
        maxX = Math.max(maxX, r.right + ox);
      });
      yEls.forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        minY = Math.min(minY, r.top + oy);
        maxY = Math.max(maxY, r.bottom + oy);
      });
      if (minX === Infinity) return;
      const pad = 9;
      // 钳制到画布范围内，避免 balancer 处于首行时虚线框上/左边框溢出画布。
      // 含 1.5px 边框宽度的安全余量，保证边框整体落在画布内。
      const bw = 1.5;
      let bx = minX - pad;
      let by = minY - pad;
      let bwBox = maxX - minX + pad * 2;
      let bhBox = maxY - minY + pad * 2;
      if (bx < bw) { bwBox += bx - bw; bx = bw; }
      if (by < bw) { bhBox += by - bw; by = bw; }
      const box = document.createElement('span');
      box.className = 'flow-bal-group-box';
      box.style.left = bx + 'px';
      box.style.top = by + 'px';
      box.style.width = bwBox + 'px';
      box.style.height = bhBox + 'px';
      canvas.appendChild(box);
    });
  }
}
function elbowColorFor(el) {
  if (el.classList.contains('balancer')) return 'var(--flow-balancer-br)';
  if (el.classList.contains('direct')) return 'var(--flow-direct-br)';
  if (el.classList.contains('proxy')) return 'var(--flow-proxy-br)';
  if (el.classList.contains('block')) return 'var(--flow-block-br)';
  return null;
}

// 把 balancer.strategy.type 翻译成中文
function strategyLabel(t) {
  switch (t) {
    case 'roundRobin': return '轮询';
    case 'leastPing':  return '最低延迟';
    case 'random':     return '随机';
    default: return t || '轮询';
  }
}

function toggleFlowViz() {
  const card = document.getElementById('flowVizCard');
  if (card) card.classList.toggle('collapsed');
}


// ─── Config: Copy / Export / Import ───────────
async function copyConfig() {
  const text = currentTab === 'json'
    ? document.getElementById('configEditor').value
    : JSON.stringify(buildConfigObject(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    showToast('配置已复制到剪贴板');
  } catch(e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('配置已复制'); }
    catch(e2) { showToast('复制失败，请手动选择', 'error'); }
    document.body.removeChild(ta);
  }
}

function exportConfig() {
  const text = currentTab === 'json'
    ? document.getElementById('configEditor').value
    : JSON.stringify(buildConfigObject(), null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  a.href = url;
  a.download = 'v2ray-config-' + ts + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('配置已导出为文件');
}

function importConfig(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      populateState(parsed);
      if (currentTab !== 'form') switchTab('form');
     buildForm();
      markDirty();
     showToast('配置已导入: ' + file.name);
    } catch(err) {
      showToast('文件解析失败: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  ev.target.value = '';
}

// ─── Theme ────────────────────────────────────
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('v2ray-theme', next);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

// ─── Init ──────────────────────────────────────
(function initThemeBtn() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = cur === 'dark' ? '☀️' : '🌙';
})();

(function initJsonEditor() {
  const editor = document.getElementById('configEditor');
  if (!editor) return;
 editor.addEventListener('input', () => { updateJsonGutter(); updateCharCount(); });
  editor.addEventListener('input', markDirty);
 editor.addEventListener('scroll', () => {
    const gutter = document.getElementById('jsonGutter');
    if (gutter) gutter.scrollTop = editor.scrollTop;
  });
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = editor.selectionStart, en = editor.selectionEnd;
      editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(en);
      editor.selectionStart = editor.selectionEnd = s + 2;
      updateJsonGutter(); updateCharCount();
    }
  });
})();

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    saveConfig();
  }
});

// Track edits in form JSON textareas (DNS / Transport / Policy) as dirty
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('textarea[data-path]')) markDirty();
});

updateOverview();
checkStatus();
setInterval(checkStatus, 5000);
refreshConfig().catch(() => {});
