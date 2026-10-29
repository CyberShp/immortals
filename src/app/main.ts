import {
  artImage,
  portraitFile,
  icon,
  eventIcon,
  installArtFallback,
} from './art';
import {
  cardPosition,
  rosterRows,
  relatedEvents,
  type RosterFilter,
} from './ui-model';
import { accessories } from '../render/layout';
import { formatAge } from '../display/format';
import { formatResource, formatLog } from '../display/format';
import { CONFIG as C } from '../sim/config';
import { loadData, traitName } from '../sim/data';
import {
  createWorld,
  resolveEvent,
  step,
  advance,
  setPolicy,
  build,
  buildingOrder,
  costText,
  optionCost,
  optionAvailable,
  defaultOption,
  relationTier,
} from '../sim/world';
import { buildingDefinitions, traitDefinitions } from '../sim/catalog';
import type { Disciple } from '../sim/data';
import {
  applyOffline,
  computeOffline,
  type OfflineSummary,
} from '../sim/offline';
import {
  decodeText,
  encodeText,
  IndexedStorage,
  SaveManager,
  snapshot,
  type Save,
} from '../save';
import { createMap } from '../render/map';
import { FixedLoop } from './loop';
import { loadSettings, storeSettings } from './settings';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const fmt = (n: number) => Math.floor(n).toLocaleString('zh-CN');
export async function start() {
  const manager = new SaveManager(new IndexedStorage());
  const loaded = await manager.load();
  let world = loaded.save?.world ?? createWorld(42, loadData());
  let lastSeen = loaded.save?.lastSeen ?? Date.now();
  const settings = loadSettings();
  const urlSpeed = Number(new URLSearchParams(location.search).get('speed'));
  if (urlSpeed >= 1 && urlSpeed <= 300) settings.speed = urlSpeed;
  let hidden = false;
  let child: Window | null = null;
  let offline: OfflineSummary | null = null;
  let background = false;
  let debugLastSeen = false;
  let debugFrozen = false;
  const loop = new FixedLoop();
  let previous = performance.now();
  const root = document.querySelector<HTMLDivElement>('#app')!;
  root.innerHTML = `<div id="game"><div id="map"></div><header class="topbar"><section id="resources" aria-label="宗门资源"></section><span id="season"></span></header><button id="compact-event" class="event-hint" hidden aria-haspopup="dialog"></button><nav class="corner bottom-left"><button id="roster-open" aria-label="门人"><span class="desktop-label">门人</span><span class="compact-label">人</span></button><button id="build-open" aria-label="建造"><span class="desktop-label">建造</span><span class="compact-label">建</span></button></nav><nav class="corner bottom-right"><button id="journal-open" aria-label="纪事"><span class="desktop-label">纪事</span><span class="compact-label">记</span></button><button id="legacy-open" aria-label="传承录"><span class="desktop-label">传承录</span><span class="compact-label">传</span></button></nav><nav class="corner top-right"><button id="small" aria-label="小窗"><span class="desktop-label">小窗</span><span class="compact-label">窗</span></button><button id="settings-open" aria-label="设置/存档"><span class="desktop-label">设置/存档</span><span class="compact-label">设</span></button></nav><div id="disciple-card" data-testid="disciple-card" hidden></div><div id="panel-store" hidden><div id="disciples"></div><section id="build-panel"><h2>山场营造</h2><span id="reputation"></span><div id="buildings"></div></section><section id="legacy-panel"><h2>传承录</h2><div id="legacy"></div></section><section id="journal-panel"><h2>山门纪事</h2><div id="events"></div><ol id="logs"></ol></section><div id="settings-links"><button id="save-open">导出/导入存档</button><button id="story-open">本局故事回顾</button><button id="offline-open">离线纪事</button></div></div></div><div id="cover" hidden><header><h1>季度工作台账</h1><span>内部资料 · 工作底稿</span></header><table><thead><tr><th>事项</th><th>负责人</th><th>进度</th><th>备注</th></tr></thead><tbody><tr><td>资料整理</td><td>项目组</td><td>已完成</td><td>归档备查</td></tr><tr><td>季度复核</td><td>综合组</td><td>进行中</td><td>等待反馈</td></tr></tbody></table></div><p id="notice" role="status"></p><dialog id="modal"><button id="close" class="close" aria-label="关闭">×</button><div id="modal-body"></div></dialog>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector(`#${id}`) as T;
  const dialog = el<HTMLDialogElement>('modal');
  const notice = (text: string) => {
    el('notice').textContent = text;
  };
  const parkPanel = () => {
    for (const node of el('modal-body').querySelectorAll(
      ':scope > [data-park]',
    ))
      el('panel-store').append(node);
  };
  const show = (html: string) => {
    closeCard();
    parkPanel();
    el('modal-body').dataset.view = '';
    el('modal-body').innerHTML = html;
    if (!hidden && !dialog.open) dialog.showModal();
  };
  el('close').onclick = () => dialog.close();
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) parkPanel();
  });
  const openPanel = (id: string) => {
    show('');
    const node = el(id);
    node.dataset.park = 'true';
    el('modal-body').append(node);
  };
  let cardId: string | undefined;
  let detailId: string | undefined;
  const filters: RosterFilter = {
    realm: '',
    eventsOnly: false,
    sort: 'energy',
    descending: false,
  };
  function closeCard() {
    cardId = undefined;
    map?.select();
    el('disciple-card').hidden = true;
  }
  function closeAll() {
    closeCard();
    dialog.close();
  }
  installArtFallback(document.body);
  const portrait = (d: Disciple, size = 64) =>
    `<span class="art-portrait" style="--art-size:${size}px;--root-color:${C.elements[d.root.elements[0]].color}"><span class="art-fallback">${escape(d.name.slice(0, 1))}</span>${artImage(portraitFile(d, size), size)}</span>`;
  const needs = (d: Disciple) =>
    (['energy', 'mood'] as const)
      .map(
        (k, i) =>
          `<label>${['精力', '心境'][i]} <meter min="0" max="100" value="${d.needs[k]}"></meter> ${fmt(d.needs[k])}</label>`,
      )
      .join('');
  function positionCard() {
    if (!cardId) return;
    const p = map?.position(cardId);
    const card = el('disciple-card');
    if (!p) {
      closeCard();
      return;
    }
    const pos = cardPosition(
      p.x,
      p.y,
      card.offsetWidth,
      card.offsetHeight,
      p.viewport,
      map?.labels(),
    );
    card.style.left = `${pos.x}px`;
    card.style.top = `${pos.y}px`;
  }
  function bindDiscipleActions(container: HTMLElement) {
    container.querySelectorAll<HTMLElement>('[data-follow]').forEach(
      (b) =>
        (b.onclick = () => {
          closeAll();
          map?.follow(b.dataset.follow!);
        }),
    );
    container
      .querySelectorAll<HTMLElement>('[data-detail]')
      .forEach((b) => (b.onclick = () => openDetail(b.dataset.detail!)));
    container
      .querySelectorAll<HTMLElement>('[data-event]')
      .forEach((b) => (b.onclick = () => eventModal(b.dataset.event!)));
    container.querySelectorAll<HTMLSelectElement>('[data-policy]').forEach(
      (b) =>
        (b.onchange = () => {
          setPolicy(world, b.dataset.policy!, b.value as Disciple['policy']);
          render();
          void persist();
        }),
    );
  }
  function openCard(id: string) {
    const d = world.disciples.find((d) => d.id === id);
    if (!d) return;
    dialog.close();
    cardId = id;
    map?.select(id);
    const card = el('disciple-card');
    card.hidden = false;
    card.innerHTML = `${portrait(d)}<strong>${escape(d.name)}</strong><p>${d.realm.major}${d.realm.layer}层 · ${d.state.behavior}</p><div class="card-needs">${needs(d)}</div><button data-detail="${id}">详情</button><button data-follow="${id}">定位</button>`;
    bindDiscipleActions(card);
    positionCard();
  }
  function openDetail(id: string) {
    detailId = id;
    const d = world.disciples.find((d) => d.id === id);
    if (!d) return;
    const article = Array.from(el('disciples').children).find(
      (n) => (n as HTMLElement).dataset.id === id,
    );
    show(
      `<h2>门人详情</h2>${article?.outerHTML ?? ''}<button data-follow="${id}">定位</button><h3>相关纪事</h3><ol>${
        world.logs
          .filter((l) => l.includes(d.name) || l.includes(d.id))
          .slice(-20)
          .reverse()
          .map((l) => `<li>${escape(formatLog(l))}</li>`)
          .join('') || '<li>暂无纪事</li>'
      }</ol>`,
    );
    const placeholder = el('modal-body').querySelector('.portrait');
    if (placeholder) placeholder.outerHTML = portrait(d, 128);
    el('modal-body').dataset.view = 'detail';
    bindDiscipleActions(el('modal-body'));
  }
  function openRoster() {
    show(
      `<h2>山中门人</h2><div class="roster-filters"><label>境界 <select id="realm-filter"><option value="">全部</option>${Array.from(
        new Set(world.disciples.map((d) => d.realm.major)),
      )
        .map(
          (r) =>
            `<option ${filters.realm === r ? 'selected' : ''}>${r}</option>`,
        )
        .join(
          '',
        )}</select></label><label><input id="event-filter" type="checkbox" ${filters.eventsOnly ? 'checked' : ''}>有事件</label><label>排序 <select id="sort-filter"><option value="energy" ${filters.sort === 'energy' ? 'selected' : ''}>精力</option><option value="realm" ${filters.sort === 'realm' ? 'selected' : ''}>境界</option></select><select id="direction-filter"><option value="asc">升序</option><option value="desc" ${filters.descending ? 'selected' : ''}>降序</option></select></label></div><div class="roster">${rosterRows(
        world,
        filters,
      )
        .map(
          (d) =>
            `<article class="roster-row">${portrait(d, 32)}<button data-detail="${d.id}">${escape(d.name)}</button><span>${d.realm.major}${d.realm.layer}层</span><span>${d.state.behavior}</span><div>${needs(d)}</div><span class="roster-status"><span>${d.state.behavior.includes('突破') ? icon('event-breakthrough') : relatedEvents(world, d.id)[0] ? icon(eventIcon(relatedEvents(world, d.id)[0].kind)) : ''}</span><span>${relatedEvents(world, d.id).length ? '有事件 ' : ''}${d.state.injuredUntil > world.tick ? '受伤 ' : ''}${d.state.behavior.includes('突破') ? '突破中' : ''}</span></span><select data-policy="${d.id}" aria-label="${escape(d.name)}的方针">${['均衡', '专修', '勤工'].map((p) => `<option ${d.policy === p ? 'selected' : ''}>${p}</option>`).join('')}</select><button data-follow="${d.id}">定位</button><div class="roster-events">${relatedEvents(
              world,
              d.id,
            )
              .map((e) => `<button data-event="${e.id}">待办事件</button>`)
              .join('')}</div></article>`,
        )
        .join('')}</div>`,
    );
    el('modal-body').dataset.view = 'roster';
    el<HTMLSelectElement>('realm-filter').onchange = (e) => {
      filters.realm = (e.target as HTMLSelectElement).value;
      openRoster();
    };
    el<HTMLInputElement>('event-filter').onchange = (e) => {
      filters.eventsOnly = (e.target as HTMLInputElement).checked;
      openRoster();
    };
    el<HTMLSelectElement>('sort-filter').onchange = (e) => {
      filters.sort = (e.target as HTMLSelectElement).value as
        'energy' | 'realm';
      openRoster();
    };
    el<HTMLSelectElement>('direction-filter').onchange = (e) => {
      filters.descending = (e.target as HTMLSelectElement).value === 'desc';
      openRoster();
    };
    bindDiscipleActions(el('modal-body'));
  }
  el('roster-open').onclick = openRoster;
  el('build-open').onclick = () => openPanel('build-panel');
  el('journal-open').onclick = () => openPanel('journal-panel');
  el('legacy-open').onclick = () => openPanel('legacy-panel');
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });
  if (new URLSearchParams(location.search).get('debug') === '1')
    Object.assign(window, { __ui: { openCard, openRoster, closeAll } });
  let map: Awaited<ReturnType<typeof createMap>> | undefined;
  try {
    map = await createMap(el('map'), {
      card: openCard,
      event: eventModal,
      blank: closeCard,
      frame: positionCard,
    });
  } catch {
    el('map').textContent =
      '地图暂不可用：浏览器未提供可用的图形环境。宗门簿册仍可使用。';
  }
  const faviconUrl = (cover: boolean) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${cover ? '#527b5b' : '#a74432'}"/><text x="7" y="29" font-size="27" fill="white">${cover ? '表' : '仙'}</text></svg>`)}`;
  function title() {
    document.title = hidden
      ? '季度工作台账'
      : `${world.events.length ? `(${world.events.length}) ` : ''}${settings.title}`;
    document.querySelector<HTMLLinkElement>('link[rel=icon]')!.href =
      faviconUrl(hidden);
  }
  function disguise(value: boolean) {
    hidden = value;
    el('game').hidden = value;
    el('cover').hidden = !value;
    el('notice').hidden = value;
    if (value) {
      closeAll();
      map?.pause();
    }
    title();
    renderChild();
    if (!value) map?.draw(world);
  }
  function renderChild() {
    if (!child || child.closed) return;
    const doc = child.document;
    doc.title = hidden
      ? '季度工作台账'
      : `${world.events.length ? `(${world.events.length}) ` : ''}${settings.title}`;
    let favicon = doc.querySelector<HTMLLinkElement>('link[rel=icon]');
    if (!favicon) {
      favicon = doc.createElement('link');
      favicon.rel = 'icon';
      doc.head.append(favicon);
    }
    favicon.href = faviconUrl(hidden);
  }
  function traitBadge(id: string) {
    const name = traitDefinitions.find((t) => t.id === id)?.accessory ?? id;
    const art = accessories[name];
    return `<span title="${escape(name)}">${art ? `<img class="accessory" src="${import.meta.env.BASE_URL}assets/accessory/${art}-48@2x.webp" alt="${escape(name)}" width="24" height="24">` : '◇'} ${escape(traitName(id))}</span>`;
  }
  function render() {
    el('season').textContent =
      `第 ${world.round + 1} 季 · ${world.season} / ${(world.tick % C.stepsPerRound) + 1} 步${settings.speed > 1 ? ` · 调试 ×${settings.speed}` : ''}`;
    el('resources').innerHTML = (
      ['stone', 'herb', 'pill', 'reputation'] as const
    )
      .map(
        (key, i) =>
          `<div title="${['灵石', '灵草', '丹药', '声望'][i]}">${icon(`resource-${key === 'reputation' ? 'fame' : key}`, 32, false)}<span class="resource-name">${['灵石', '灵草', '丹药', '声望'][i]}</span><strong>${formatResource(world.resources[key], key)}</strong><small>${` / ${key === 'reputation' ? '∞' : formatResource(world.capacity[key] * (world.buildings.find((b) => b.id === 'B_HALL')?.level ?? 1), key)}`}</small></div>`,
      )
      .join('');
    el('disciples').innerHTML = world.disciples
      .map(
        (d) =>
          `<article class="disciple" data-id="${d.id}"><div class="portrait" style="border:2px solid ${C.elements[d.root.elements[0]].color}">${escape(d.name.slice(0, 1))}</div><div class="disciple-body"><div class="name-line"><h3>${escape(d.name)}</h3><span>${formatAge(d.ageSeasons)} · ${d.stage} · ${d.realm.major}${d.realm.layer}层</span></div><p class="detail">${d.root.grade} · ${d.root.elements.join('')} <span>${d.stage === '坐化' ? '已坐化' : d.state.behavior + ' · ' + d.state.location}</span></p><div class="needs">${(['energy', 'mood', 'drive'] as const).map((k, i) => `<label>${['精力', '心境', '道心'][i]} <meter min="0" max="100" value="${d.needs[k]}">${fmt(d.needs[k])}</meter> ${fmt(d.needs[k])}</label>`).join('')}</div><div class="traits">${d.traits.map((t) => traitBadge(t)).join('')}<small>修为 ${fmt(d.realm.xp)} · 余寿 ${d.remainingSeasons} 季</small></div><label class="policy">方针 <select data-policy="${d.id}" aria-label="${escape(d.name)}的方针">${['均衡', '专修', '勤工'].map((p) => `<option ${p === d.policy ? 'selected' : ''}>${p}</option>`).join('')}</select></label><p class="relations">${Object.entries(
            d.relations,
          )
            .slice(0, 6)
            .map(
              ([id, r]) =>
                `${escape(world.disciples.find((x) => x.id === id)?.name ?? id)} ${r.value} ${relationTier(r.value)} ${r.tags.map(escape).join('·')}`,
            )
            .join(' / ')}</p></div></article>`,
      )
      .join('');
    el('disciples')
      .querySelectorAll<HTMLImageElement>('img.accessory')
      .forEach((img) => {
        const fallback = () => img.replaceWith(document.createTextNode('◇'));
        img.onerror = fallback;
        if (img.complete && !img.naturalWidth) fallback();
      });
    el('reputation').textContent =
      `声望 ${formatResource(world.resources.reputation, 'reputation')}`;
    el('buildings').innerHTML = buildingDefinitions
      .map((def) => {
        const b = world.buildings.find((b) => b.id === def.id),
          order = buildingOrder(world, def.id);
        return `<article><h3>${def.name} <small>${b?.level ? `Lv${b.level}` : '预留位'}</small></h3><p>${formatLog(costText(order.cost))} · ${def.duration} 步</p>${b?.targetLevel ? `<progress value="${b.progress}" max="${def.duration}"></progress><small>建造 ${Math.floor((b.progress / def.duration) * 100)}%</small>` : `<button data-build="${def.id}" ${order.available ? '' : 'disabled'} title="${order.reason}">${order.reason || (b?.level ? '升级' : '建造')}</button>`}</article>`;
      })
      .join('');
    el('legacy').innerHTML =
      world.disciples
        .filter((d) => d.stage === '坐化')
        .map(
          (d) =>
            `<p>${escape(d.name)} · ${d.realm.major} · ${d.flags.薪火 ? '薪火' : '山门留名'}</p>`,
        )
        .join('') || '<p>青山仍在，故人未远。</p>';
    el('story-open').hidden = !world.flags.storyReport;
    el('offline-open').hidden = !offline;
    root.querySelectorAll<HTMLSelectElement>('[data-policy]').forEach(
      (select) =>
        (select.onchange = () => {
          setPolicy(
            world,
            select.dataset.policy!,
            select.value as Disciple['policy'],
          );
          render();
          void persist();
        }),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-build]').forEach(
      (button) =>
        (button.onclick = () => {
          build(world, button.dataset.build!);
          render();
          void persist();
        }),
    );
    el('events').innerHTML =
      world.events
        .map(
          (e) =>
            `<button data-event="${escape(e.id)}" class="event-hint"><i></i>${escape(e.hint)} <span>展开 →</span></button>`,
        )
        .join('') +
      (offline
        ? '<button id="offline-hint" class="event-hint"><i></i>离线纪事待阅 →</button>'
        : '');
    const latest = [...world.events].sort(
      (a, b) => b.createdTick - a.createdTick,
    )[0];
    const unread = world.events.length + Number(!!offline);
    const compact = el<HTMLButtonElement>('compact-event');
    compact.hidden = unread === 0;
    compact.innerHTML = `<i aria-hidden="true"></i><b>${escape(latest?.hint ?? '离线纪事待阅')}</b><span>未读 ${unread} · 展开 →</span>`;
    compact.onclick = () => (latest ? eventModal(latest.id) : showOffline());
    el('logs').innerHTML = world.logs
      .slice()
      .reverse()
      .map((t) => `<li>${escape(formatLog(t))}</li>`)
      .join('');
    el('events')
      .querySelectorAll<HTMLButtonElement>('[data-event]')
      .forEach((b) => (b.onclick = () => eventModal(b.dataset.event!)));
    root.querySelector('#offline-hint')?.addEventListener('click', showOffline);
    if (!hidden) map?.draw(world);
    if (cardId) openCard(cardId);
    if (dialog.open && el('modal-body').dataset.view === 'roster') openRoster();
    if (dialog.open && el('modal-body').dataset.view === 'detail' && detailId)
      openDetail(detailId);
    title();
    renderChild();
    if (
      world.flags.storyReport &&
      !world.flags.reportRead &&
      !dialog.open &&
      innerWidth > 600 &&
      !hidden
    )
      showStory();
  }
  function eventModal(id: string) {
    const event = world.events.find((e) => e.id === id);
    if (!event) return;
    show(
      `<p class="eyebrow">${escape(event.kind)}</p><h2 class="event-title">${icon(eventIcon(event.kind), 64)}${escape(event.hint)}</h2><p>${escape(event.text)}</p><div class="actions">${event.options.map((o, i) => `<button data-choice="${i}" ${optionAvailable(world, event, i) ? '' : 'disabled'}>${escape(o)}${i === (defaultOption(world, event) < 0 ? event.defaultOption : defaultOption(world, event)) ? ' · ★默认' : ''}<small>${formatLog(costText(event.choices[i] ? optionCost(event.choices[i]) : {}))}${optionAvailable(world, event, i) ? '' : ' · 条件或资源不足'}</small></button>`).join('')}</div>`,
    );
    el('modal-body')
      .querySelectorAll<HTMLButtonElement>('[data-choice]')
      .forEach(
        (b) =>
          (b.onclick = () => {
            resolveEvent(world, id, Number(b.dataset.choice));
            dialog.close();
            render();
            if (
              world.flags.storyReport &&
              !world.flags.reportRead &&
              innerWidth > 600
            )
              showStory();
            void persist();
          }),
      );
  }
  function showStory() {
    world.flags.reportRead = true;
    const lines = ['A', 'B', 'C', 'D'].map(
      (c, i) =>
        `${['剑与书', '薪火', '冰与酒', '摸鱼仙'][i]}：${world.flags[`done:EV_${c}${c === 'D' ? 2 : 3}`] !== undefined ? '已完成' : '未完成'}`,
    );
    const favorite = [...world.disciples].sort(
      (a, b) =>
        Number(b.realm.major === '筑基') - Number(a.realm.major === '筑基') ||
        b.realm.layer - a.realm.layer ||
        b.realm.xp - a.realm.xp,
    )[0];
    show(
      `<p class="eyebrow">山门卷宗</p><h2>本局故事回顾</h2><ul>${lines.map((t) => `<li>${t}</li>`).join('')}</ul><h3>本命弟子 · ${escape(favorite.name)}</h3><p>${favorite.root.grade} · ${favorite.realm.major}${favorite.realm.layer}层 · ${favorite.traits.map(traitName).join('、')}</p><p>山门升格，故事继续。</p>`,
    );
  }
  el('story-open').onclick = showStory;
  el('offline-open').onclick = showOffline;
  function showOffline() {
    if (!offline) return;
    const s = offline;
    show(
      `<p class="eyebrow">重返山门</p><h2>离线期间发生的事</h2><p>离线 ${(s.elapsedMs / 3600000).toFixed(2)} 小时，有效 ${(s.effectiveMs / 60000).toFixed(1)} 分钟，共 ${s.rounds} 轮。</p><p>灵石 +${formatResource(s.resources.stone, 'stone')} · 灵草 +${formatResource(s.resources.herb, 'herb')} · 丹药 ${formatResource(s.resources.pill, 'pill')} · 声望 +${formatResource(s.resources.reputation, 'reputation')}</p><p>${s.clockRollback ? '检测到时钟回拨或无效时间，本次未补算。' : ''}${s.clamped === 'over7d' ? '已按七天上限结算。' : ''}${s.warehouseFull ? '库房已满，溢出资源已舍弃。' : ''}</p><ul>${[
        ...s.relations,
        ...s.hints,
      ]
        .slice(0, 10)
        .map((t) => `<li>${escape(formatLog(t))}</li>`)
        .join(
          '',
        )}</ul><p>离线不筑基、不坐化；年龄最多推进八季。</p><button id="offline-ok">已阅，回山</button>`,
    );
    el('offline-ok').onclick = () => {
      offline = null;
      dialog.close();
      render();
    };
  }
  async function persist(backupOverride?: Save) {
    try {
      await manager.write(snapshot(world, lastSeen), backupOverride);
    } catch (error) {
      notice(
        `存档失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  function catchUp(backupOverride?: Save) {
    const now = Date.now();
    const time = computeOffline(lastSeen, now);
    if (time.elapsedMs >= C.stepMs || time.clamped !== 'none') {
      offline = applyOffline(world, time.rounds, lastSeen, time);
    }
    lastSeen = now;
    loop.reset();
    previous = performance.now();
    render();
    if (offline && window.innerWidth > 600) showOffline();
    void persist(backupOverride);
  }
  const active = () =>
    !document.hidden || !!(child && !child.closed && !child.document.hidden);
  function visibility() {
    if (root.ownerDocument.hidden) map?.pause();
    else if (!hidden) map?.draw(world);
    const next = !active();
    if (next === background) return;
    background = next;
    if (next) {
      if (!debugLastSeen) lastSeen = Date.now();
      void persist();
    } else catchUp();
  }
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', () => {
    if (!background && !debugLastSeen) lastSeen = Date.now();
    void persist();
  });
  window.addEventListener('blur', () => {
    if (settings.hideOnBlur) disguise(true);
  });
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === settings.bossKey && !e.repeat) {
      e.preventDefault();
      disguise(!hidden);
    }
  };
  window.addEventListener('keydown', keyHandler);
  el('settings-open').onclick = () => {
    show(
      `<h2>山门设置</h2><form id="settings-form"><label>老板键<input name="bossKey" maxlength="20" value="${escape(settings.bossKey)}" required></label><label>自定义标题<input name="title" maxlength="40" value="${escape(settings.title)}" required></label><label><input type="checkbox" name="hideOnBlur" ${settings.hideOnBlur ? 'checked' : ''}> 失焦自动隐藏</label><label><input type="checkbox" name="autoMaster" ${world.flags.autoMaster !== false ? 'checked' : ''}> 自动掌门（按节奏排建造）</label><label><input type="checkbox" name="sound" ${settings.sound ? 'checked' : ''}> 声音（预留开关，当前无音频）</label><label>加速调试（默认一倍，仅前台）<input type="number" name="speed" min="1" max="300" value="${settings.speed}" required></label><button>保存设置</button></form>`,
    );
    const links = el('settings-links');
    links.dataset.park = 'true';
    el('modal-body').append(links);
    el<HTMLFormElement>('settings-form').onsubmit = (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget as HTMLFormElement);
      settings.bossKey = String(form.get('bossKey'));
      settings.title = String(form.get('title'));
      settings.hideOnBlur = form.has('hideOnBlur');
      settings.sound = form.has('sound');
      world.flags.autoMaster = form.has('autoMaster');
      void persist();
      settings.speed = Number(form.get('speed'));
      try {
        storeSettings(settings);
        dialog.close();
        render();
      } catch {
        notice('设置保存失败，请检查输入或浏览器存储权限。');
      }
    };
  };
  el('save-open').onclick = () => {
    show(
      '<h2>宗门底册</h2><p>导入会替换当前进度；替换前自动备份当前档。</p><div class="actions"><button id="download">下载存档</button><button id="copy">复制文本</button></div><label>选择 JSON 存档<input id="file" type="file" accept=".json,application/json"></label><label>粘贴存档文本<textarea id="save-text" rows="5" placeholder="支持 JSON 或压缩文本"></textarea></label><button id="import">校验并导入</button><p id="save-status" role="status"></p>',
    );
    const current = () => snapshot(world, background ? lastSeen : Date.now());
    el('download').onclick = () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(current(), null, 2)], {
          type: 'application/json',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = '模拟仙府存档.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    el('copy').onclick = () => {
      void (async () => {
        try {
          const text = await encodeText(current());
          el<HTMLTextAreaElement>('save-text').value = text;
          await navigator.clipboard.writeText(text);
          el('save-status').textContent = '已复制压缩存档。';
        } catch {
          el('save-status').textContent =
            '未能写入剪贴板，可手动复制文本框，或下载 JSON。';
        }
      })();
    };
    const importText = async (text: string) => {
      try {
        const previousSave = current();
        const incoming = await manager.import(
          await decodeText(text),
          previousSave,
        );
        world = incoming.world;
        lastSeen = incoming.lastSeen;
        dialog.close();
        catchUp(previousSave);
        notice('存档已导入，原进度已备份。');
      } catch (error) {
        el('save-status').textContent =
          error instanceof Error ? error.message : '导入失败，原存档保留。';
      }
    };
    el('import').onclick = () => {
      void importText(el<HTMLTextAreaElement>('save-text').value);
    };
    el<HTMLInputElement>('file').onchange = () => {
      const file = el<HTMLInputElement>('file').files?.[0];
      if (file)
        void file
          .text()
          .then(importText)
          .catch(() => {
            el('save-status').textContent = '文件读取失败。';
          });
    };
  };
  el('small').onclick = () => {
    void (async () => {
      try {
        if (child && !child.closed) {
          child.focus();
          return;
        }
        const pip = (
          window as Window & {
            documentPictureInPicture?: {
              requestWindow: (options: {
                width: number;
                height: number;
              }) => Promise<Window>;
            };
          }
        ).documentPictureInPicture;
        if (pip) {
          try {
            child = await pip.requestWindow({ width: 480, height: 320 });
          } catch {
            child = window.open('', '仙府小窗', 'popup,width=480,height=320');
          }
        } else
          child = window.open('', '仙府小窗', 'popup,width=480,height=320');
        if (!child) {
          notice('小窗被浏览器拦截，请允许此站点弹窗。');
          return;
        }
        for (const style of document.querySelectorAll(
          'style,link[rel="stylesheet"]',
        ))
          child.document.head.append(style.cloneNode(true));
        child.document.body.append(root);
        child.addEventListener('keydown', keyHandler);
        child.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closeAll();
        });
        child.document.addEventListener('visibilitychange', visibility);
        child.addEventListener('pagehide', () => {
          document.body.append(root);
          child = null;
          map?.draw(world);
          visibility();
        });
        map?.draw(world);
        renderChild();
        visibility();
      } catch {
        notice('无法打开小窗，请使用浏览器窗口缩放。');
      }
    })();
  };
  if (new URLSearchParams(location.search).get('debug') === '1') {
    const hook = {
      world: () => structuredClone(world),
      freeze: (value: boolean) => {
        debugFrozen = value;
        loop.reset();
        previous = performance.now();
      },
      settleArt: () => {
        map?.reset();
        render();
      },
      artAllBuilt: (tier?: 1 | 2) => {
        world.buildings = buildingDefinitions.map((def) => ({
          id: def.id,
          name: def.name,
          level: tier ?? (def.maxLevel >= 2 ? 2 : 1),
          progress: 0,
          targetLevel: 0,
          builtTick: world.tick,
          x: def.slot[0],
          y: def.slot[1],
        }));
        render();
      },
      advance: (steps: number) => {
        advance(world, steps);
        render();
      },
      save: async () => {
        await manager.write(snapshot(world, lastSeen));
      },
      setLastSeen: async (value: number) => {
        debugLastSeen = true;
        lastSeen = value;
        await manager.write(snapshot(world, lastSeen));
      },
      export: () => JSON.stringify(snapshot(world, lastSeen)),
      walkDormToHall: (id: string) => {
        loop.reset();
        previous = performance.now();
        return map?.walkDormToHall(id);
      },
      reset: () => {
        map?.reset();
        world = createWorld(42, loadData());
        lastSeen = Date.now();
        offline = null;
        render();
      },
    };
    Object.assign(window, { __xianfu: hook });
  }
  if (loaded.recovered) notice('主档损坏，已从备份恢复。请及时导出。');
  void navigator.storage?.persist?.().catch(() => false);
  catchUp();
  background = !active();
  setInterval(() => {
    const now = performance.now();
    if (!background && !debugFrozen) {
      const before = world.tick;
      loop.advance(now - previous, settings.speed, () => step(world));
      if (!debugLastSeen) lastSeen = Date.now();
      if (world.tick !== before) render();
    }
    previous = now;
  }, 250);
  setInterval(() => {
    void persist();
  }, C.autosaveMs);
}
