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
    if (!_runningSince) _runningSince = Date.now();
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
    streamSettings: { network: 'ws', security: 'tls', tlsSettings: { serverName: '', allowInsecure: false, alpn: [], minVersion: '1.2', maxVersion: '1.3' }, wsSettings: { path: '/', headers: { host: '' } } },
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
      if (tls.minVersion === undefined) tls.minVersion = '1.2';
      if (tls.maxVersion === undefined) tls.maxVersion = '1.3';
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
  const arrayKeys = ['ip','domain','alpn','inboundTag','protocol','selector','destOverride','host'];
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
function buildForm() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('configForm').style.display = '';
  let html = '';
  html += buildInboundsSection();
  html += buildOutboundsSection();
  html += buildRoutingSection();
  html += '<div class="collapsible" style="margin-top:24px">';
  html += '  <div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> 📡 DNS</div>';
  html += '  <div class="collapsible-body">' + buildDnsSection() + '</div>';
  html += '</div>';
  html += '<div class="collapsible">';
  html += '  <div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> 📋 日志</div>';
  html += '  <div class="collapsible-body">' + buildLogSection() + '</div>';
  html += '</div>';
  html += '<div class="collapsible">';
  html += '  <div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> ⚙️ 策略 + 全局传输</div>';
  html += '  <div class="collapsible-body">' + buildPolicySection() + '</div>';
  html += '</div>';
  document.getElementById('configForm').innerHTML = html;
  updateOverview();
}

// ─── Inbounds ──────────────────────────────────
function buildInboundsSection() {
  let h = '<div class="form-section" id="section-inbounds">';
  h += '<div class="section-title">📥 入站 <span class="badge">' + state.inbounds.length + '</span></div>';
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
      h += '<option value="noauth"'+(s.auth==='noauth'?' selected':'')+'>无认证 <span class="hint">(默认)</span></option>';
      h += '<option value="password"'+(s.auth==='password'?' selected':'')+'>密码</option></select></div>';
      h += '<label class="form-checkbox"><input type="checkbox" data-path="inbounds.'+i+'.settings.udp"'+(s.udp?' checked':'')+'> UDP 转发</label></div>';
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
      h += '<label class="form-checkbox"><input type="checkbox" data-path="inbounds.'+i+'.settings.followRedirect"'+(s.followRedirect?' checked':'')+'> followRedirect</label>';
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
  h += '<label class="form-checkbox"><input type="checkbox" data-path="inbounds.'+i+'.sniffing.enabled"'+(sniff.enabled?' checked':'')+'> 启用</label>';
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
  h += '<div class="section-title">📤 出站 <span class="badge">' + state.outbounds.length + '</span></div>';
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
  h += '<div class="form-group" style="padding-bottom:1px"><label>&nbsp;</label><label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.sockopt.tcpFastOpen"'+(sock.tcpFastOpen?' checked':'')+'> TCP Fast Open</label><div class="hint">&nbsp;</div></div>';
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
      h += '<label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.kcpSettings.congestion"'+(kcp.congestion?' checked':'')+'> 拥塞控制</label>';
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
      h += '<label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.grpcSettings.multiMode"'+(grpc.multiMode?' checked':'')+'> 多路复用</label>';
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
      const tls = ss.tlsSettings || { serverName:'', allowInsecure:false, alpn:[], minVersion:'1.2', maxVersion:'1.3', certFile:'', keyFile:'' };
      h += '<div class="sub-section-title" style="margin-top:8px">TLS 设置 <span class="hint">(默认值可省略)</span></div>';
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>Server Name (SNI)</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.tlsSettings.serverName" value="'+esc(tls.serverName||'')+'" style="width:200px" placeholder="your-domain.com"></div>';
      h += '<label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.streamSettings.tlsSettings.allowInsecure"'+(tls.allowInsecure?' checked':'')+'> 允许不安全证书</label>';
      h += '</div><div class="form-row" style="align-items:flex-end">';
      h += '<div class="form-group"><label>ALPN</label><input class="form-input" data-path="outbounds.'+i+'.streamSettings.tlsSettings.alpn" value="'+esc((tls.alpn||[]).join(', '))+'" style="width:200px" placeholder="h2, http/1.1"><div class="hint">可选</div></div>';
      h += '<div class="form-group"><label>最低 TLS</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.tlsSettings.minVersion">';
      ['1.0','1.1','1.2','1.3'].forEach(v => { h += '<option value="'+v+'"'+(tls.minVersion===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select><div class="hint">默认: 1.2</div></div>';
      h += '<div class="form-group"><label>最高 TLS</label><select class="form-select" data-path="outbounds.'+i+'.streamSettings.tlsSettings.maxVersion">';
      ['1.0','1.1','1.2','1.3'].forEach(v => { h += '<option value="'+v+'"'+(tls.maxVersion===v?' selected':'')+'">'+v+'</option>'; });
      h += '</select><div class="hint">默认: 1.3</div></div>';
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
  h += '<div class="form-group" style="padding-bottom:1px"><label>&nbsp;</label><label class="form-checkbox"><input type="checkbox" data-path="outbounds.'+i+'.mux.enabled"'+(mux.enabled?' checked':'')+'> 启用 Mux</label><div class="hint">&nbsp;</div></div>';
  h += '<div class="form-group"><label>并发数</label><input class="form-input field-sm" type="number" data-path="outbounds.'+i+'.mux.concurrency" value="'+(mux.concurrency||8)+'"><div class="hint">默认: 8</div></div>';
  h += '</div>';
  return h;
}

// ─── Routing ───────────────────────────────────
function buildRoutingSection() {
  const r = state.routing;
  const rules = r.settings.rules || [];
  const balancers = r.settings.balancers || [];
  let h = '<div class="form-section" id="section-routing">';
  h += '<div class="section-title">🔀 路由 <span class="badge">' + rules.length + ' 条规则</span></div>';
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
  h += '<div class="array-actions"><button class="btn-add" data-action="add-rule">➕ 添加规则</button></div>';
  // Balancers
  if (balancers.length > 0) {
    h += '<div class="sub-section" style="margin-top:16px"><div class="sub-section-title">负载均衡器</div>';
    balancers.forEach((b, bi) => {
      h += '<div class="form-row" style="align-items:end">';
      h += '<div class="form-group"><label>标签</label><input class="form-input" data-path="routing.settings.balancers.'+bi+'.tag" value="'+esc(b.tag||'')+'" style="width:120px"></div>';
      h += '<div class="form-group"><label>选择器 <span class="hint">(逗号分隔出站标签)</span></label><input class="form-input" data-path="routing.settings.balancers.'+bi+'.selector" value="'+esc((b.selector||[]).join(', '))+'" style="width:200px"></div>';
      h += '<div class="form-group"><label>策略</label><select class="form-select" data-path="routing.settings.balancers.'+bi+'.strategy.type">';
      ['roundRobin','leastPing'].forEach(v => { h += '<option value="'+v+'"'+(b.strategy&&b.strategy.type===v?' selected':'')+'>'+v+'</option>'; });
      h += '</select></div>';
      h += '<button class="btn-remove" data-action="remove-balancer" data-b-index="'+bi+'" style="margin-bottom:4px">✕</button>';
      h += '</div>';
    });
    h += '</div>';
  }
  h += '<div class="array-actions" style="margin-top:8px"><button class="btn-add" data-action="add-balancer">➕ 添加负载均衡器</button></div>';
  h += '</div>';
  return h;
}

function buildRuleItem(rule, i) {
  const tags = getOutboundTags();
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
    await api('/api/config', 'PUT', { config: configStr });
    updateOverview();
    showToast('配置已保存并应用');
    checkStatus();
  } catch(e) {
    showToast('保存失败: ' + e.message, 'error');
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
  populateState(t);
  if (currentTab !== 'form') switchTab('form');
  buildForm();
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
    // Outbound tag change → update routing dropdowns
    if (path.match(/^outbounds\.\d+\.tag$/)) {
      reloadSection('section-routing', buildRoutingSection());
    }
  }
});

document.addEventListener('click', function(e) {
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
    case 'add-rule': addRule(); break;
    case 'remove-rule': removeRule(idx); break;
  }
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
}
function countBy(arr) {
  return arr.reduce((acc, v) => { if (v) acc[v] = (acc[v]||0)+1; return acc; }, {});
}
function protoChips(counts) {
  return Object.entries(counts).map(([k,v]) =>
    '<span class="proto-chip">' + esc(k) + (v>1?' ×'+v:'') + '</span>'
  ).join('');
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

updateOverview();
checkStatus();
setInterval(checkStatus, 5000);
refreshConfig().catch(() => {});
