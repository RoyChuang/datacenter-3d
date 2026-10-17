import { tempLevel } from '../builders/points.js';

const KIND_LABEL = {
  rack: 'IT 機櫃',
  rowcool: '列間空調 (Row Cooling)',
  pdc: '配電櫃 PDC',
  ups: 'UPS',
  battery: '電池櫃',
  panel: '壁掛配電箱',
  sensor: '溫濕度感測器',
  camera: '攝影機',
};

const show = (v, unit = '') => (v === undefined || v === null || v === '' ? '—' : `${v}${unit}`);
const rows = (pairs) =>
  `<table>${pairs.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;

function uChart(uHeight, devices) {
  const byTop = new Map(devices.map((d) => [d.u + d.size - 1, d]));
  let html = '<div class="u-chart">';
  for (let u = uHeight; u >= 1; ) {
    const d = byTop.get(u);
    if (d) {
      html += `<div class="u-slot" style="height:${d.size * 14}px"><span class="u-num">${u}</span>` +
        `<span class="u-dev ${d.type}">${d.name}${d.powerW ? ` · ${d.powerW}W` : ''}</span></div>`;
      u -= d.size;
    } else {
      html += `<div class="u-slot"><span class="u-num">${u}</span><span class="u-dev"></span></div>`;
      u -= 1;
    }
  }
  return html + '</div>';
}

function body(pick) {
  const d = pick.data;
  const pos = `(${d.x.toFixed(2)}, ${d.z.toFixed(2)}) m`;
  switch (pick.kind) {
    case 'rack': {
      const used = pick.devices.reduce((s, x) => s + x.size, 0);
      const power = pick.devices.reduce((s, x) => s + (x.powerW ?? 0), 0);
      return rows([
        ['排', d.row], ['位置', pos], ['朝向', d.facing], ['寬 × 高', `${d.width * 1000} mm × ${(pick.height * 1000).toFixed(0)} mm`],
        ['容量', `${d.uHeight}U`], ['已使用', `${used}U (${Math.round((used / d.uHeight) * 100)}%)`],
        ['設備數', pick.devices.length], ['估計功耗', `${(power / 1000).toFixed(2)} kW`],
      ]) + uChart(d.uHeight, pick.devices);
    }
    case 'sensor': {
      const live = pick.live;
      const level = live ? tempLevel(live.temp).level : null;
      return rows([
        ['位置', pos], ['安裝高度', `${d.y} m`],
        ['溫度', live ? `<span class="badge ${level}">${live.temp} °C</span>` : '—'],
        ['濕度', live ? `${live.humidity} %RH` : '—'],
        ['更新時間', live ? live.time.toLocaleTimeString() : '—'],
      ]);
    }
    case 'ups':
      return rows([['位置', pos], ...(d.alias ? [['名稱', d.alias]] : []), ['容量', show(d.capacityKVA, ' kVA')], ['狀態', '<span class="badge ok">ONLINE</span>']]);
    case 'battery':
      return rows([['位置', pos], ['供電 UPS', show(d.ups)]]);
    default:
      return rows([['位置', pos], ...(d.row ? [['排', d.row]] : []), ...(d.facing ? [['朝向', d.facing]] : [])]);
  }
}

// `extra(pick)` may return HTML shown above the details (e.g. the power section).
export function createPanel(el, { onClose, extra }) {
  let current = null;
  function render(pick) {
    current = pick;
    el.classList.toggle('hidden', !pick);
    if (!pick) return;
    el.innerHTML = `<button class="close" title="關閉">×</button>` +
      `<h2>${pick.data.id}</h2><div class="kind">${KIND_LABEL[pick.kind] ?? pick.kind} · <span class="muted">雙擊可聚焦</span></div>${extra?.(pick) ?? ''}${body(pick)}`;
    el.querySelector('.close').onclick = onClose;
  }
  // Re-render only if the given pick is what is on screen (used for live updates).
  function refresh(pick) {
    if (pick === current) render(pick);
  }
  return { show: render, refresh, get current() { return current; } };
}
