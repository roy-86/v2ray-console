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

// ─── State & Helpers ───────────────────────────
let currentTab = 'form';
const state = { config: null };

// 「服务端入站」判定：协议 ∈ {vmess, vless, trojan, shadowsocks} 且 listen 非 127.0.0.1/localhost
const SERVER_PROTOCOLS = ['vmess', 'vless', 'trojan', 'shadowsocks'];

function isServerInbound(ib) {
  if (!ib || !ib.protocol) return false;
  if (!SERVER_PROTOCOLS.includes(ib.protocol)) return false;
  const listen = String(ib.listen || '').toLowerCase().trim();
  return listen !== '127.0.0.1' && listen !== 'localhost';
}

function getServerInbounds() {
  if (!state.config || !Array.isArray(state.config.inbounds)) return [];
  return state.config.inbounds.filter(isServerInbound);
}

function ensureConfig() {
  if (!state.config || typeof state.config !== 'object') state.config = {};
  if (!Array.isArray(state.config.inbounds)) state.config.inbounds = [];
  if (!Array.isArray(state.config.outbounds)) state.config.outbounds = [];
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// ─── Generators ────────────────────────────────
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function generateUUIDFor(btn) {
  const input = btn.parentElement.querySelector('input');
  if (input) {
    input.value = generateUUID();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
function generateRandomPassword(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < (len || 16); i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function generateShortId(len) {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < (len || 12); i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function generatePasswordFor(btn) {
  const input = btn.parentElement.querySelector('input');
  if (input) {
    input.value = generateRandomPassword(16);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
function generateShortIdFor(btn) {
  const input = btn.parentElement.querySelector('input');
  if (input) {
    input.value = generateShortId(12);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
function copyInputValue(btn) {
  const input = btn.parentElement.querySelector('input');
  if (input) copyToClipboard(input.value || '');
}
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast('已复制到剪贴板'),
      () => fallbackCopy(text)
    );
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showToast('已复制到剪贴板'); }
  catch(e) { showToast('复制失败，请手动选择', 'error'); }
  document.body.removeChild(ta);
}

// ─── Tab 切换 ──────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabFormBtn').classList.toggle('active', tab === 'form');
  document.getElementById('tabJsonBtn').classList.toggle('active', tab === 'json');

  if (tab === 'form') {
    document.getElementById('formPanel').style.display = '';
    document.getElementById('jsonPanel').style.display = 'none';
    // 若编辑器里有合法 JSON，优先用它覆盖 state（用户可能切到 JSON 改了别的地方再切回）
    const raw = document.getElementById('configEditor').value.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        state.config = parsed;
        ensureConfig();
        buildForm();
      } catch(e) { /* 保留当前 state */ }
    } else if (getServerInbounds().length > 0) {
      buildForm();
    }
    updateOverview();
  } else {
    document.getElementById('formPanel').style.display = 'none';
    document.getElementById('jsonPanel').style.display = '';
    syncStateToEditor();
  }
}

function syncStateToEditor() {
  ensureConfig();
  document.getElementById('configEditor').value = JSON.stringify(state.config, null, 2);
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

// ─── Overview ──────────────────────────────────
function updateOverview() {
  ensureConfig();
  const inbs = state.config.inbounds || [];
  const obs = state.config.outbounds || [];
  const server = getServerInbounds();
  const rules = (state.config.routing && state.config.routing.settings && state.config.routing.settings.rules) || [];

  // 用户总数：vmess/vless/trojan 取 settings.clients 长度；shadowsocks 视为 1（一个共享密码）
  let userTotal = 0;
  server.forEach(ib => {
    if (ib.protocol === 'shadowsocks') userTotal += 1;
    else if (ib.settings && Array.isArray(ib.settings.clients)) userTotal += ib.settings.clients.length;
  });

  document.getElementById('ovServerInbounds').textContent = server.length;
  document.getElementById('ovUsers').textContent = userTotal;
  document.getElementById('ovOutbounds').textContent = obs.length;
  document.getElementById('ovRules').textContent = rules.length;

  document.getElementById('ovServerInboundsDetail').innerHTML = protoChips(countBy(server.map(ib => ib.protocol))) || '无';
  document.getElementById('ovUsersDetail').textContent = userTotal === 0 ? '无用户' : (userTotal === 1 ? '1 个用户' : userTotal + ' 个用户');
  document.getElementById('ovOutboundsDetail').innerHTML = protoChips(countBy(obs.map(ob => ob.protocol))) || '无';
  document.getElementById('ovRulesDetail').textContent = rules.length + ' 条规则';
}

function countBy(arr) {
  return arr.reduce((acc, v) => { if (v) acc[v] = (acc[v]||0)+1; return acc; }, {});
}
function protoChips(counts) {
  return Object.entries(counts).map(([k,v]) =>
    '<span class="proto-chip">' + esc(k) + (v>1?' ×'+v:'') + '</span>'
  ).join('');
}

// ─── Build Form ────────────────────────────────
const SERVER_PROTO_META = [
  ['vmess',       'VMess',       '#ede9fe', '#5b21b6'],
  ['vless',       'VLESS',       '#fce7f3', '#9d174d'],
  ['trojan',      'Trojan',      '#ffedd5', '#9a3412'],
  ['shadowsocks', 'Shadowsocks', '#d1fae5', '#065f46']
];

function buildForm() {
  const server = getServerInbounds();
  const form = document.getElementById('configForm');
  const empty = document.getElementById('emptyState');
  if (server.length === 0) {
    empty.style.display = '';
    form.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  form.style.display = '';
  let html = '<div class="form-section">';
  server.forEach((ib, displayIdx) => {
    const origIdx = state.config.inbounds.indexOf(ib);
    html += buildServerInboundCard(ib, origIdx, displayIdx);
  });
  html += '<div class="array-actions"><button class="btn-add" data-action="add-server-inbound">➕ 添加服务入站</button></div>';
  html += '</div>';
  form.innerHTML = html;
}

function buildServerInboundCard(ib, origIdx, displayIdx) {
  const proto = ib.protocol || 'vmess';
  const m = SERVER_PROTO_META.find(x => x[0] === proto) || SERVER_PROTO_META[0];

  // 确保 settings 形状（VMess/VLESS/Trojan 才有 clients）
  if (!ib.settings) ib.settings = {};
  if (proto !== 'shadowsocks' && !Array.isArray(ib.settings.clients)) {
    if (proto === 'trojan') ib.settings.clients = [{ password: '', level: 1 }];
    else if (proto === 'vless') ib.settings.clients = [{ id: '', flow: '', encryption: 'none', level: 1 }];
    else ib.settings.clients = [{ id: '', alterId: 0, security: 'auto', level: 1 }];
  }
  // VLESS 入站固定 decryption:"none"
  if (proto === 'vless' && ib.settings.decryption === undefined) {
    ib.settings.decryption = 'none';
  }

  let h = '<div class="array-item" data-orig-index="' + origIdx + '">';
  h += '<div class="array-item-header">';
  h += '<span class="array-item-title"><span class="protocol-tag" style="background:'+m[2]+';color:'+m[3]+'">'+m[1]+'</span> 服务入站 #'+(displayIdx+1)+(ib.tag?' · '+esc(ib.tag):'')+'</span>';
  h += '<button class="btn-remove" data-action="remove-server-inbound" data-orig-index="'+origIdx+'" title="删除">✕</button>';
  h += '</div>';

  // 基础字段：协议 / 端口 / 监听地址 / 标签
  h += '<div class="form-row">';
  h += '<div class="form-group"><label>协议</label><select class="form-select" data-path="inbounds.'+origIdx+'.protocol">';
  SERVER_PROTO_META.forEach(([val, label]) => {
    h += '<option value="'+val+'"'+(proto===val?' selected':'')+'>'+label+'</option>';
  });
  h += '</select></div>';
  h += '<div class="form-group"><label>端口</label><input class="form-input" type="number" data-path="inbounds.'+origIdx+'.port" value="'+(ib.port||'')+'" style="width:110px"></div>';
  h += '<div class="form-group"><label>监听地址</label><input class="form-input" data-path="inbounds.'+origIdx+'.listen" value="'+esc(ib.listen||'')+'" style="width:150px" placeholder="0.0.0.0"></div>';
  h += '<div class="form-group"><label>标签</label><input class="form-input" data-path="inbounds.'+origIdx+'.tag" value="'+esc(ib.tag||'')+'" style="width:120px" placeholder="可选"></div>';
  h += '</div>';

  // 传输设置（可折叠）
  h += '<div class="collapsible">';
  h += '<div class="collapsible-header" onclick="toggleCollapsible(this)"><span class="arrow">▶</span> 传输设置 <span class="hint">(network / security / TLS / Reality)</span></div>';
  h += '<div class="collapsible-body">';
  h += buildStreamSettings(ib, origIdx);
  h += '</div></div>';

  // 协议专属：用户 / 密码
  h += '<div class="sub-section" style="margin-top:10px">';
  h += buildProtocolUsers(ib, origIdx);
  h += '</div>';

  h += '</div>';
  return h;
}

function buildStreamSettings(ib, origIdx) {
  if (!ib.streamSettings) ib.streamSettings = { network: 'tcp', security: 'none' };
  const ss = ib.streamSettings;
  if (!ss.network) ss.network = 'tcp';
  if (!ss.security) ss.security = 'none';
  if (!ss.realitySettings) ss.realitySettings = { dest: '', serverNames: [], privateKey: '', shortId: '' };
  if (!ss.tlsSettings) ss.tlsSettings = { serverName: '', certFile: '', keyFile: '' };
  if (!ss.wsSettings) ss.wsSettings = { path: '/' };
  if (!ss.grpcSettings) ss.grpcSettings = { serviceName: '' };

  let h = '<div class="form-row">';
  h += '<div class="form-group"><label>传输协议 (network)</label><select class="form-select" data-path="inbounds.'+origIdx+'.streamSettings.network">';
  ['tcp','ws','grpc'].forEach(v => {
    h += '<option value="'+v+'"'+(ss.network===v?' selected':'')+'>'+v.toUpperCase()+'</option>';
  });
  h += '</select></div>';
  h += '<div class="form-group"><label>安全 (security)</label><select class="form-select" data-path="inbounds.'+origIdx+'.streamSettings.security">';
  ['none','tls','reality'].forEach(v => {
    h += '<option value="'+v+'"'+(ss.security===v?' selected':'')+'>'+v.charAt(0).toUpperCase()+v.slice(1)+'</option>';
  });
  h += '</select></div>';
  h += '</div>';

  h += '<div id="transport-settings-'+origIdx+'">';
  h += buildTransportSettings(ib, origIdx, ss.network);
  h += '</div>';

  h += '<div id="security-settings-'+origIdx+'">';
  h += buildSecuritySettings(ib, origIdx, ss.security);
  h += '</div>';

  return h;
}

function buildTransportSettings(ib, origIdx, net) {
  const ss = ib.streamSettings || {};
  let h = '';
  if (net === 'ws') {
    const ws = ss.wsSettings || { path: '/' };
    h += '<div class="form-row"><div class="form-group"><label>路径</label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.wsSettings.path" value="'+esc(ws.path||'/')+'" style="width:200px" placeholder="/"></div></div>';
  } else if (net === 'grpc') {
    const grpc = ss.grpcSettings || { serviceName: '' };
    h += '<div class="form-row"><div class="form-group"><label>Service Name</label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.grpcSettings.serviceName" value="'+esc(grpc.serviceName||'')+'" style="width:220px" placeholder="grpc 服务名"></div></div>';
  } else {
    h += '<div class="hint" style="margin-top:4px">TCP 直连，无需额外参数</div>';
  }
  return h;
}

function buildSecuritySettings(ib, origIdx, sec) {
  const ss = ib.streamSettings || {};
  let h = '';
  if (sec === 'tls') {
    const tls = ss.tlsSettings || {};
    h += '<div class="sub-section-title" style="margin-top:10px">TLS 服务端设置</div>';
    h += '<div class="form-row">';
    h += '<div class="form-group"><label>Server Name (SNI)</label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.tlsSettings.serverName" value="'+esc(tls.serverName||'')+'" style="width:240px" placeholder="your-domain.com"></div>';
    h += '</div><div class="form-row">';
    h += '<div class="form-group"><label>Cert 文件</label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.tlsSettings.certFile" value="'+esc(tls.certFile||'')+'" style="width:260px" placeholder="/path/to/cert.pem"></div>';
    h += '<div class="form-group"><label>Key 文件</label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.tlsSettings.keyFile" value="'+esc(tls.keyFile||'')+'" style="width:260px" placeholder="/path/to/key.pem"></div>';
    h += '</div>';
  } else if (sec === 'reality') {
    const reality = ss.realitySettings || {};
    const serverNames = Array.isArray(reality.serverNames) ? reality.serverNames : [];
    h += '<div class="sub-section-title" style="margin-top:10px">Reality 服务端设置</div>';
    h += '<div class="form-row">';
    h += '<div class="form-group"><label>回落目标 (dest)</label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.realitySettings.dest" value="'+esc(reality.dest||'')+'" style="width:260px" placeholder="www.microsoft.com:443"></div>';
    h += '<div class="form-group"><label>允许的 SNI <span class="hint">(逗号分隔)</span></label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.realitySettings.serverNames" value="'+esc(serverNames.join(', '))+'" style="width:260px" placeholder="www.microsoft.com"></div>';
    h += '</div><div class="form-row">';
    h += '<div class="form-group" style="flex:1"><label>Private Key <span class="hint">(用 <code>xray x25519</code> 生成)</span></label><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.realitySettings.privateKey" value="'+esc(reality.privateKey||'')+'" style="width:100%;max-width:520px;font-family:monospace;font-size:12px" placeholder="x25519 输出的私钥"></div>';
    h += '</div><div class="form-row">';
    h += '<div class="form-group"><label>Short ID <span class="hint">(12 位十六进制)</span></label><div style="display:flex;gap:6px;align-items:center"><input class="form-input" data-path="inbounds.'+origIdx+'.streamSettings.realitySettings.shortId" value="'+esc(reality.shortId||'')+'" style="width:200px;font-family:monospace;font-size:12px" placeholder="abcdef012345">';
    h += '<button class="btn btn-outline btn-xs" type="button" onclick="generateShortIdFor(this)">🎲 生成</button>';
    h += '</div></div>';
    h += '</div>';
    h += '<div class="hint" style="margin-top:6px">⚠ Reality 私钥需用 <code>xray x25519</code> 生成（公钥给客户端用），shortId 仅用于连接标识</div>';
  } else {
    h += '<div class="hint" style="margin-top:10px">未启用 TLS/Reality，使用明文传输（仅供本地测试）</div>';
  }
  return h;
}

function buildProtocolUsers(ib, origIdx) {
  const s = ib.settings || {};
  switch (ib.protocol) {
    case 'vmess': {
      const clients = s.clients || [];
      let h = '<div class="sub-section-title">用户 (Clients) <span class="hint">(UUID + alterId + security)</span></div>';
      if (clients.length === 0) {
        h += '<div class="hint" style="margin-bottom:6px">当前没有用户，至少添加一个</div>';
      }
      clients.forEach((c, ci) => {
        h += '<div class="form-row user-row">';
        h += '<div class="form-group"><label>用户 #'+(ci+1)+' UUID</label><div style="display:flex;gap:6px;align-items:center"><input class="form-input uuid-input" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.id" value="'+esc(c.id||'')+'" placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx">';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="generateUUIDFor(this)" title="生成 UUID">🎲</button>';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="copyInputValue(this)" title="复制">⧉</button>';
        h += '</div></div>';
        h += '<div class="form-group"><label>alterId</label><input class="form-input short-input" type="number" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.alterId" value="'+(c.alterId||0)+'"></div>';
        h += '<div class="form-group"><label>加密</label><select class="form-select security-select" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.security">';
        ['auto','aes-128-gcm','chacha20-poly1305','none','zero'].forEach(v => {
          h += '<option value="'+v+'"'+((c.security||'auto')===v?' selected':'')+'>'+v+'</option>';
        });
        h += '</select></div>';
        h += '<div class="form-group"><label>Level</label><input class="form-input short-input" type="number" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.level" value="'+(c.level||1)+'"></div>';
        h += '<button class="btn-remove" data-action="remove-inbound-client" data-orig-index="'+origIdx+'" data-c-index="'+ci+'" title="删除用户">✕</button>';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-inbound-client" data-orig-index="'+origIdx+'">➕ 添加用户</button></div>';
      return h;
    }
    case 'vless': {
      const clients = s.clients || [];
      let h = '<div class="sub-section-title">用户 (Clients) <span class="hint">(UUID + flow)</span></div>';
      if (clients.length === 0) {
        h += '<div class="hint" style="margin-bottom:6px">当前没有用户，至少添加一个</div>';
      }
      clients.forEach((c, ci) => {
        h += '<div class="form-row user-row">';
        h += '<div class="form-group"><label>用户 #'+(ci+1)+' ID</label><div style="display:flex;gap:6px;align-items:center"><input class="form-input uuid-input" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.id" value="'+esc(c.id||'')+'" placeholder="UUID">';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="generateUUIDFor(this)" title="生成 UUID">🎲</button>';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="copyInputValue(this)" title="复制">⧉</button>';
        h += '</div></div>';
        h += '<div class="form-group"><label>流控 (flow)</label><select class="form-select security-select" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.flow">';
        ['','xtls-rprx-vision','xtls-rprx-vision-udp443'].forEach(v => {
          h += '<option value="'+v+'"'+((c.flow||'')===v?' selected':'')+'>'+(v||'无')+'</option>';
        });
        h += '</select></div>';
        h += '<div class="form-group"><label>Level</label><input class="form-input short-input" type="number" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.level" value="'+(c.level||1)+'"></div>';
        h += '<button class="btn-remove" data-action="remove-inbound-client" data-orig-index="'+origIdx+'" data-c-index="'+ci+'" title="删除用户">✕</button>';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-inbound-client" data-orig-index="'+origIdx+'">➕ 添加用户</button></div>';
      h += '<div class="hint" style="margin-top:6px">入站已固定 <code>decryption: "none"</code>；用户加密 <code>encryption: "none"</code></div>';
      return h;
    }
    case 'trojan': {
      const clients = s.clients || [];
      let h = '<div class="sub-section-title">用户 (Clients) <span class="hint">(password)</span></div>';
      if (clients.length === 0) {
        h += '<div class="hint" style="margin-bottom:6px">当前没有用户，至少添加一个</div>';
      }
      clients.forEach((c, ci) => {
        h += '<div class="form-row user-row">';
        h += '<div class="form-group"><label>密码 #'+(ci+1)+'</label><div style="display:flex;gap:6px;align-items:center"><input class="form-input" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.password" value="'+esc(c.password||'')+'" style="width:280px">';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="generatePasswordFor(this)" title="生成随机密码 (16 位 base62)">🎲</button>';
        h += '<button class="btn btn-outline btn-xs" type="button" onclick="copyInputValue(this)" title="复制">⧉</button>';
        h += '</div></div>';
        h += '<div class="form-group"><label>Level</label><input class="form-input short-input" type="number" data-path="inbounds.'+origIdx+'.settings.clients.'+ci+'.level" value="'+(c.level||1)+'"></div>';
        h += '<button class="btn-remove" data-action="remove-inbound-client" data-orig-index="'+origIdx+'" data-c-index="'+ci+'" title="删除用户">✕</button>';
        h += '</div>';
      });
      h += '<div class="array-actions"><button class="btn-add" data-action="add-inbound-client" data-orig-index="'+origIdx+'">➕ 添加用户</button></div>';
      h += '<div class="hint" style="margin-top:6px">⚠ 生产环境 Trojan 必须配置 TLS（上方"安全"选 TLS 并填证书路径）</div>';
      return h;
    }
    case 'shadowsocks': {
      let h = '<div class="sub-section-title">加密 / 密码 <span class="hint">(单密码 / method / network)</span></div>';
      h += '<div class="form-row">';
      h += '<div class="form-group"><label>加密方法 (method)</label><select class="form-select" data-path="inbounds.'+origIdx+'.settings.method">';
      ['aes-256-gcm','aes-128-gcm','chacha20-poly1305','2022-blake3-aes-128gcm'].forEach(v => {
        h += '<option value="'+v+'"'+((s.method||'aes-256-gcm')===v?' selected':'')+'>'+v+'</option>';
      });
      h += '</select></div>';
      h += '<div class="form-group"><label>网络 (network)</label><select class="form-select" data-path="inbounds.'+origIdx+'.settings.network">';
      ['tcp','tcp,udp','udp'].forEach(v => {
        h += '<option value="'+v+'"'+((s.network||'tcp,udp')===v?' selected':'')+'>'+v+'</option>';
      });
      h += '</select></div>';
      h += '</div><div class="form-row">';
      h += '<div class="form-group" style="flex:1;min-width:300px"><label>密码</label><div style="display:flex;gap:6px;align-items:center"><input class="form-input" data-path="inbounds.'+origIdx+'.settings.password" value="'+esc(s.password||'')+'" style="width:360px">';
      h += '<button class="btn btn-outline btn-xs" type="button" onclick="generatePasswordFor(this)" title="生成随机密码">🎲</button>';
      h += '<button class="btn btn-outline btn-xs" type="button" onclick="copyInputValue(this)" title="复制">⧉</button>';
      h += '</div></div>';
      h += '</div>';
      h += '<div class="hint" style="margin-top:6px">Shadowsocks 单入站只有一个共享密码，对客户端而言即一个用户</div>';
      return h;
    }
  }
  return '<div class="hint">未知协议</div>';
}

function toggleCollapsible(el) {
  el.classList.toggle('open');
  el.nextElementSibling.classList.toggle('open');
}

// ─── Add / Remove ──────────────────────────────
function addServerInbound() {
  ensureConfig();
  const def = {
    port: 10086, listen: '0.0.0.0', protocol: 'vmess',
    settings: { clients: [{ id: '', alterId: 0, security: 'auto', level: 1 }], disableInsecureEncryption: true },
    tag: 'vmess-in'
  };
  state.config.inbounds.push(def);
  buildForm();
  updateOverview();
  showToast('已添加服务入站 (VMess)');
}
function removeServerInbound(origIdx) {
  ensureConfig();
  const server = getServerInbounds();
  if (server.length <= 1) { showToast('至少保留一个服务入站', 'warning'); return; }
  state.config.inbounds.splice(origIdx, 1);
  buildForm();
  updateOverview();
}
function addInboundClient(origIdx) {
  ensureConfig();
  const ib = state.config.inbounds[origIdx];
  if (!ib) return;
  if (!ib.settings) ib.settings = {};
  if (!Array.isArray(ib.settings.clients)) ib.settings.clients = [];
  let defaults;
  if (ib.protocol === 'vless') defaults = { id: '', flow: '', encryption: 'none', level: 1 };
  else if (ib.protocol === 'trojan') defaults = { password: '', level: 1 };
  else defaults = { id: '', alterId: 0, security: 'auto', level: 1 };
  ib.settings.clients.push(defaults);
  buildForm();
  updateOverview();
}
function removeInboundClient(origIdx, cIdx) {
  ensureConfig();
  const ib = state.config.inbounds[origIdx];
  if (!ib || !ib.settings || !Array.isArray(ib.settings.clients)) return;
  if (ib.settings.clients.length <= 1) { showToast('至少保留一个用户', 'warning'); return; }
  ib.settings.clients.splice(cIdx, 1);
  buildForm();
  updateOverview();
}

// ─── setNested (路径写入 state) ─────────────────
function setNested(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] === undefined || cur[k] === null) {
      cur[k] = /^\d+$/.test(keys[i+1]) ? [] : {};
    }
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  // 数组型字段（逗号分隔 → 数组）
  if (last === 'serverNames' && typeof value === 'string') {
    cur[last] = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  } else if (typeof value === 'string' && value !== '' && !isNaN(value) &&
             last !== 'id' && last !== 'password' && last !== 'privateKey' && last !== 'shortId' &&
             last !== 'serverName' && last !== 'certFile' && last !== 'keyFile' &&
             last !== 'dest' && last !== 'path' && last !== 'method' && last !== 'network' &&
             last !== 'serviceName' && last !== 'tag' && last !== 'listen' && last !== 'security') {
    cur[last] = parseFloat(value);
  } else {
    cur[last] = value;
  }
}

// ─── Templates (v4 字段名) ─────────────────────
const TEMPLATES = {
  'vmess-server': {
    inbounds: [{
      port: 10086, listen: '0.0.0.0', protocol: 'vmess',
      settings: {
        clients: [{ id: '', alterId: 0, security: 'auto', level: 1 }],
        disableInsecureEncryption: true
      },
      tag: 'vmess-in'
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct', settings: { domainStrategy: 'UseIP', redirect: '', userLevel: 0 } }]
  },
  'vless-reality-server': {
    inbounds: [{
      port: 443, listen: '0.0.0.0', protocol: 'vless',
      settings: {
        clients: [{ id: '', flow: 'xtls-rprx-vision', encryption: 'none', level: 1 }],
        decryption: 'none',
        fallbacks: []
      },
      streamSettings: {
        network: 'tcp',
        security: 'reality',
        realitySettings: {
          dest: 'www.microsoft.com:443',
          serverNames: ['www.microsoft.com'],
          privateKey: '用 xray x25519 生成',
          shortId: ''
        }
      },
      tag: 'vless-in'
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct', settings: { domainStrategy: 'UseIP', redirect: '', userLevel: 0 } }]
  },
  'trojan-server': {
    inbounds: [{
      port: 10086, listen: '0.0.0.0', protocol: 'trojan',
      settings: { clients: [{ password: '', level: 1 }], fallbacks: [] },
      tag: 'trojan-in'
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct', settings: { domainStrategy: 'UseIP', redirect: '', userLevel: 0 } }]
  },
  'shadowsocks-server': {
    inbounds: [{
      port: 10086, listen: '0.0.0.0', protocol: 'shadowsocks',
      settings: { method: 'aes-256-gcm', password: '', network: 'tcp,udp', level: 1 },
      tag: 'ss-in'
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct', settings: { domainStrategy: 'UseIP', redirect: '', userLevel: 0 } }]
  }
};

function loadTemplate(name) {
  const t = TEMPLATES[name];
  if (!t) return;
  const cloned = JSON.parse(JSON.stringify(t));
  // 自动生成 Reality shortId
  if (name === 'vless-reality-server' && cloned.inbounds[0] && cloned.inbounds[0].streamSettings && cloned.inbounds[0].streamSettings.realitySettings) {
    cloned.inbounds[0].streamSettings.realitySettings.shortId = generateShortId(12);
  }
  state.config = cloned;
  ensureConfig();
  // 先切回表单 tab（避免 JSON 编辑器残留旧内容覆盖模板）
  if (currentTab !== 'form') {
    document.getElementById('configEditor').value = '';
    switchTab('form');
  } else {
    buildForm();
    updateOverview();
  }
  markDirty();
  showToast('模板已加载，请修改端口 / 用户 / 私钥');
}

// ─── Save / Load ───────────────────────────────
async function refreshConfig() {
  if (_dirty && !confirm('当前有未保存的更改，确定要重新加载服务器配置吗？未保存的修改将丢失。')) return;
  try {
    const data = await api('/api/config');
    const parsed = JSON.parse(data.config);
    state.config = parsed;
    ensureConfig();
    if (currentTab === 'form') {
      if (getServerInbounds().length > 0) buildForm();
    } else {
      syncStateToEditor();
    }
    updateOverview();
    markClean();
    showToast('配置已加载');
  } catch(e) {
    document.getElementById('emptyState').style.display = '';
    document.getElementById('configForm').style.display = 'none';
    showToast('加载配置失败: ' + e.message, 'error');
  }
}

async function saveConfig() {
  const saveBtn = document.getElementById('saveBtn');
  ensureConfig();
  let configStr;
  if (currentTab === 'form') {
    configStr = JSON.stringify(state.config, null, 2);
    syncStateToEditor();
  } else {
    configStr = document.getElementById('configEditor').value;
    try {
      const parsed = JSON.parse(configStr);
      state.config = parsed;
      ensureConfig();
    } catch(e) {
      showToast('JSON 格式不正确，无法保存', 'error');
      return;
    }
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

// ─── Theme ────────────────────────────────────
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('v2ray-theme', next);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
}

(function initThemeBtn() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = cur === 'dark' ? '☀️' : '🌙';
})();

// ─── Event Delegation ──────────────────────────
document.addEventListener('change', function(e) {
  const el = e.target;
  const path = el.dataset.path;
  if (path) {
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'number') value = el.value === '' ? '' : parseFloat(el.value);
    else value = el.value;
    setNested(state.config, path, value);
    markDirty();

    // 协议切换：整张卡片重新渲染（用户区结构变化）
    const mProto = path.match(/^inbounds\.(\d+)\.protocol$/);
    if (mProto) {
      const idx = parseInt(mProto[1]);
      rebuildInboundCard(idx);
      return;
    }
    // network 变化：仅重渲染 transport 部分
    const mNet = path.match(/^inbounds\.(\d+)\.streamSettings\.network$/);
    if (mNet) {
      const idx = parseInt(mNet[1]);
      const tsDiv = document.getElementById('transport-settings-'+idx);
      const ib = state.config.inbounds[idx];
      if (tsDiv && ib) tsDiv.innerHTML = buildTransportSettings(ib, idx, value);
    }
    // security 变化：仅重渲染 security 部分
    const mSec = path.match(/^inbounds\.(\d+)\.streamSettings\.security$/);
    if (mSec) {
      const idx = parseInt(mSec[1]);
      const ssDiv = document.getElementById('security-settings-'+idx);
      const ib = state.config.inbounds[idx];
      if (ssDiv && ib) ssDiv.innerHTML = buildSecuritySettings(ib, idx, value);
    }
  }
});

// 整张卡片重渲染（协议切换或被外部删除/添加后调用）
function rebuildInboundCard(idx) {
  const ib = state.config.inbounds[idx];
  if (!ib) return;
  // 切换协议时清理 settings 形状，避免遗留字段（VMess 的 alterId / SS 的 method 等）被 v2ray-core 拒绝
  const proto = ib.protocol;
  if (!ib.settings) ib.settings = {};
  if (proto === 'shadowsocks') {
    // SS 单密码，不需要 clients 数组
    delete ib.settings.clients;
    delete ib.settings.decryption;
  } else if (proto === 'vless') {
    ib.settings.decryption = 'none';
    if (!Array.isArray(ib.settings.clients) || ib.settings.clients.length === 0) {
      ib.settings.clients = [{ id: '', flow: '', encryption: 'none', level: 1 }];
    } else {
      ib.settings.clients = ib.settings.clients.map(c => ({
        id: c.id || '', flow: c.flow || '', encryption: 'none', level: c.level || 1
      }));
    }
  } else if (proto === 'trojan') {
    delete ib.settings.decryption;
    if (!Array.isArray(ib.settings.clients) || ib.settings.clients.length === 0) {
      ib.settings.clients = [{ password: '', level: 1 }];
    } else {
      ib.settings.clients = ib.settings.clients.map(c => ({
        password: c.password || '', level: c.level || 1
      }));
    }
  } else if (proto === 'vmess') {
    delete ib.settings.decryption;
    if (!Array.isArray(ib.settings.clients) || ib.settings.clients.length === 0) {
      ib.settings.clients = [{ id: '', alterId: 0, security: 'auto', level: 1 }];
    } else {
      ib.settings.clients = ib.settings.clients.map(c => ({
        id: c.id || '', alterId: c.alterId || 0, security: c.security || 'auto', level: c.level || 1
      }));
    }
  }
  const card = document.querySelector('.array-item[data-orig-index="'+idx+'"]');
  if (!card) return;
  const displayIdx = getServerInbounds().findIndex(x => x === ib);
  card.outerHTML = buildServerInboundCard(ib, idx, displayIdx);
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const origIdx = parseInt(btn.dataset.origIndex);
  const cIdx = parseInt(btn.dataset.cIndex);
  e.preventDefault();
  switch(action) {
    case 'add-server-inbound': addServerInbound(); break;
    case 'remove-server-inbound': removeServerInbound(origIdx); break;
    case 'add-inbound-client': addInboundClient(origIdx); break;
    case 'remove-inbound-client': removeInboundClient(origIdx, cIdx); break;
  }
  markDirty();
});

// ─── JSON Editor (gutter / char count / Tab) ────
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

// ─── ⌘S / Ctrl+S 全局保存快捷键 ─────────────────
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    saveConfig();
  }
});

// ─── Init ──────────────────────────────────────
updateOverview();
checkStatus();
setInterval(checkStatus, 5000);
refreshConfig().catch(() => {});