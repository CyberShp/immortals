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
  const loop = new FixedLoop();
  let previous = performance.now();
  const root = document.querySelector<HTMLDivElement>('#app')!;
  root.innerHTML = `<div id="game"><header><div class="seal">仙</div><div><p class="eyebrow">宗门起居录 · 数据与事件</p><h1>模拟仙府</h1></div><span id="season"></span><nav><button id="small">小窗</button><button id="settings-open">设置</button><button id="save-open">存档</button></nav></header><section id="resources" class="resources" aria-label="宗门资源"></section><main><section class="disciples"><div class="section-head"><h2>山中门人</h2><span>各循其道，自有生息</span></div><div id="disciples"></div></section><aside><section class="map-panel"><div class="section-head"><h2>宗门山</h2><span>占位图</span></div><div id="map"></div><p class="caption">一脉青山，半卷人间。</p></section><section class="buildings"><div class="section-head"><h2>山场营造</h2><span id="reputation"></span></div><div id="buildings"></div></section><section class="legacy"><h2>传承录</h2><div id="legacy"></div></section><section class="story"><button id="story-open">本局故事回顾</button></section><section class="journal"><div class="section-head"><h2>山门纪事</h2><span>近事百条</span></div><div id="events"></div><ol id="logs"></ol></section></aside></main><footer>十秒一步 · 三十步一季 <span>按反引号隐藏 · 定期导出存档，留一份山门底册</span></footer></div><div id="cover" hidden><header><h1>季度工作台账</h1><span>内部资料 · 工作底稿</span></header><table><thead><tr><th>事项</th><th>负责人</th><th>进度</th><th>备注</th></tr></thead><tbody><tr><td>资料整理</td><td>项目组</td><td>已完成</td><td>归档备查</td></tr><tr><td>季度复核</td><td>综合组</td><td>进行中</td><td>等待反馈</td></tr></tbody></table></div><p id="notice" role="status"></p><dialog id="modal"><button id="close" class="close" aria-label="关闭">×</button><div id="modal-body"></div></dialog>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('modal');
  const notice = (text: string) => {
    el('notice').textContent = text;
  };
  const show = (html: string) => {
    el('modal-body').innerHTML = html;
    if (!hidden && !dialog.open) dialog.showModal();
  };
  el('close').onclick = () => dialog.close();
  let map: Awaited<ReturnType<typeof createMap>> | undefined;
  try {
    map = await createMap(el('map'));
  } catch {
    el('map').textContent =
      '地图暂不可用：浏览器未提供可用的图形环境。宗门簿册仍可使用。';
  }
  const icon = (cover: boolean) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="${cover ? '#527b5b' : '#a74432'}"/><text x="7" y="29" font-size="27" fill="white">${cover ? '表' : '仙'}</text></svg>`)}`;
  function title() {
    document.title = hidden
      ? '季度工作台账'
      : `${world.events.length ? `(${world.events.length}) ` : ''}${settings.title}`;
    document.querySelector<HTMLLinkElement>('link[rel=icon]')!.href =
      icon(hidden);
  }
  function disguise(value: boolean) {
    hidden = value;
    el('game').hidden = value;
    el('cover').hidden = !value;
    el('notice').hidden = value;
    if (value) {
      dialog.close();
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
    favicon.href = icon(hidden);
    doc.body.innerHTML = hidden
      ? '<h2>季度工作台账</h2><p>资料整理　已完成</p>'
      : `<h2>模拟仙府 · 第${world.round + 1}季</h2><p>灵石 ${fmt(world.resources.stone)}　灵草 ${fmt(world.resources.herb)}　丹药 ${fmt(world.resources.pill)}</p>${world.disciples.map((d) => `<p>${escape(d.name)}　${d.realm.major}${d.realm.layer}层 · ${d.state.behavior}</p>`).join('')}${world.events.map((e) => `<button data-event="${escape(e.id)}">🔴 ${escape(e.hint)}</button>`).join('')}${offline ? '<button id="offline-child">🔴 离线纪事待阅</button>' : ''}<p>详情在主窗口展开</p>`;
    doc.querySelectorAll<HTMLButtonElement>('[data-event]').forEach(
      (b) =>
        (b.onclick = () => {
          window.focus();
          eventModal(b.dataset.event!);
        }),
    );
    doc.getElementById('offline-child')?.addEventListener('click', () => {
      window.focus();
      showOffline();
    });
  }
  function render() {
    el('season').textContent =
      `第 ${world.round + 1} 季 · ${world.season} / ${(world.tick % C.stepsPerRound) + 1} 步${settings.speed > 1 ? ` · 调试 ×${settings.speed}` : ''}`;
    el('resources').innerHTML = (['stone', 'herb', 'pill'] as const)
      .map(
        (key, i) =>
          `<div><span>${['灵石', '灵草', '丹药', '声望'][i]}</span><strong>${fmt(world.resources[key])}</strong><small>${` / ${world.capacity[key] * (world.buildings.find((b) => b.id === 'B_HALL')?.level ?? 1)}`}</small></div>`,
      )
      .join('');
    el('disciples').innerHTML = world.disciples
      .map(
        (d) =>
          `<article class="disciple"><div class="portrait" style="border:2px solid ${C.elements[d.root.elements[0]].color}">${escape(d.name.slice(-1))}<small>占位</small></div><div class="disciple-body"><div class="name-line"><h3>${escape(d.name)}</h3><span>${d.ageSeasons / 4} 岁 · ${d.stage} · ${d.realm.major}${d.realm.layer}层</span></div><p class="detail">${d.root.grade} · ${d.root.elements.join('')} <span>${d.stage === '坐化' ? '已坐化' : d.state.behavior + ' · ' + d.state.location}</span></p><div class="needs">${(['energy', 'mood', 'drive'] as const).map((k, i) => `<label>${['精力', '心境', '道心'][i]} <meter min="0" max="100" value="${d.needs[k]}">${fmt(d.needs[k])}</meter></label>`).join('')}</div><div class="traits">${d.traits.map((t) => `<span title="占位配饰：${escape(traitDefinitions.find((x) => x.id === t)?.accessory ?? t)}">◇ ${escape(traitName(t))}</span>`).join('')}<small>修为 ${fmt(d.realm.xp)} · 余寿 ${d.remainingSeasons} 季</small></div><label class="policy">方针 <select data-policy="${d.id}" aria-label="${escape(d.name)}的方针">${['均衡', '专修', '勤工'].map((p) => `<option ${p === d.policy ? 'selected' : ''}>${p}</option>`).join('')}</select></label><p class="relations">${Object.entries(
            d.relations,
          )
            .map(
              ([id, r]) =>
                `${escape(world.disciples.find((x) => x.id === id)?.name ?? id)} ${relationTier(r.value)} ${r.tags.map(escape).join('·')}`,
            )
            .join(' / ')}</p></div></article>`,
      )
      .join('');
    el('reputation').textContent = `声望 ${fmt(world.resources.reputation)}`;
    el('buildings').innerHTML = buildingDefinitions
      .map((def) => {
        const b = world.buildings.find((b) => b.id === def.id),
          order = buildingOrder(world, def.id);
        return `<article><h3>${def.name} <small>${b?.level ? `Lv${b.level}` : '预留位'}</small></h3><p>${costText(order.cost)} · ${def.duration} 步</p>${b?.targetLevel ? `<progress value="${b.progress}" max="${def.duration}"></progress><small>建造 ${Math.floor((b.progress / def.duration) * 100)}%</small>` : `<button data-build="${def.id}" ${order.available ? '' : 'disabled'} title="${order.reason}">${order.reason || (b?.level ? '升级' : '建造')}</button>`}</article>`;
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
    document.querySelectorAll<HTMLSelectElement>('[data-policy]').forEach(
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
    document.querySelectorAll<HTMLButtonElement>('[data-build]').forEach(
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
    el('logs').innerHTML = world.logs
      .slice()
      .reverse()
      .map((t) => `<li>${escape(t)}</li>`)
      .join('');
    el('events')
      .querySelectorAll<HTMLButtonElement>('[data-event]')
      .forEach((b) => (b.onclick = () => eventModal(b.dataset.event!)));
    document
      .getElementById('offline-hint')
      ?.addEventListener('click', showOffline);
    if (!hidden) map?.draw(world);
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
      `<p class="eyebrow">◇ ${escape(event.kind)} · 图标占位</p><h2>${escape(event.hint)}</h2><p>${escape(event.text)}</p><div class="actions">${event.options.map((o, i) => `<button data-choice="${i}" ${optionAvailable(world, event, i) ? '' : 'disabled'}>${escape(o)}${i === (defaultOption(world, event) < 0 ? event.defaultOption : defaultOption(world, event)) ? ' · ★默认' : ''}<small>${costText(event.choices[i]?.cost ?? {})}${optionAvailable(world, event, i) ? '' : ' · 条件或资源不足'}</small></button>`).join('')}</div>`,
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
  function showOffline() {
    if (!offline) return;
    const s = offline;
    show(
      `<p class="eyebrow">重返山门</p><h2>离线期间发生的事</h2><p>离线 ${(s.elapsedMs / 3600000).toFixed(2)} 小时，有效 ${(s.effectiveMs / 60000).toFixed(1)} 分钟，共 ${s.rounds} 轮。</p><p>灵石 +${fmt(s.resources.stone)} · 灵草 +${fmt(s.resources.herb)} · 丹药 ${fmt(s.resources.pill)} · 声望 +${fmt(s.resources.reputation)}</p><p>${s.clockRollback ? '检测到时钟回拨或无效时间，本次未补算。' : ''}${s.clamped === 'over7d' ? '已按七天上限结算。' : ''}${s.warehouseFull ? '库房已满，溢出资源已舍弃。' : ''}</p><ul>${[
        ...s.relations,
        ...s.hints,
      ]
        .slice(0, 10)
        .map((t) => `<li>${escape(t)}</li>`)
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
        child = pip
          ? await pip.requestWindow({ width: 400, height: 480 })
          : window.open('', '仙府小窗', 'popup,width=400,height=480');
        if (!child) {
          notice('小窗被浏览器拦截，请允许此站点弹窗。');
          return;
        }
        const style = child.document.createElement('style');
        style.textContent =
          'body{background:#f3efdf;color:#294639;font:14px serif;padding:14px}button{display:block;background:#eee4cf;border:1px solid #bba98b;padding:8px;margin:6px 0}';
        child.document.head.append(style);
        child.addEventListener('keydown', keyHandler);
        child.document.addEventListener('visibilitychange', visibility);
        child.addEventListener('pagehide', () => {
          child = null;
          visibility();
        });
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
      reset: () => {
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
    if (!background) {
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
