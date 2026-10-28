import { Application, Container, Graphics, Text } from 'pixi.js';
import type { World } from '../sim/world';
import { CONFIG } from '../sim/config';
import { buildingDefinitions } from '../sim/catalog';
export async function createMap(host: HTMLElement) {
  const app = new Application();
  await app.init({
    width: 600,
    height: 340,
    background: 0xe3e8d8,
    antialias: true,
    autoStart: false,
  });
  host.appendChild(app.canvas);
  app.canvas.setAttribute('aria-label', '宗门山占位地图');
  const scene = new Container();
  scene.sortableChildren = true;
  app.stage.addChild(scene);
  function draw(w: World) {
    for (const child of scene.removeChildren()) child.destroy();
    const ground = new Graphics()
      .ellipse(320, 200, 265, 120)
      .fill(0xd1dac3)
      .moveTo(50, 300)
      .lineTo(330, 160)
      .lineTo(490, 70)
      .stroke({ width: 14, color: 0xf5eddc });
    ground.zIndex = -100;
    scene.addChild(ground);
    for (const def of buildingDefinitions)
      if (!w.buildings.some((b) => b.id === def.id)) {
        const marker = new Graphics()
          .rect(def.slot[0] - 35, def.slot[1] - 30, 70, 40)
          .stroke({ width: 1, color: 0x8a8578 });
        const label = new Text({
          text: def.name + '预留位',
          style: { fontSize: 10, fill: 0x5a564c },
        });
        label.position.set(def.slot[0] - 30, def.slot[1]);
        scene.addChild(marker, label);
      }
    for (const b of w.buildings) {
      const group = new Container();
      group.position.set(b.x, b.y);
      group.zIndex = b.y;
      group.addChild(
        new Graphics()
          .rect(-45, -40, 90, 45)
          .fill(
            b.level === 0
              ? 0xc4b596
              : b.level === 2 || w.tick - b.builtTick >= 60
                ? 0x9ba99a
                : 0x758878,
          )
          .poly([-55, -40, 0, -65, 55, -40])
          .fill(0x364e43),
      );
      const label = new Text({
        text: `${b.name} ${b.targetLevel ? '⚒' : `Lv${b.level}`}\n占位`,
        style: { fontSize: 14, fill: 0x263f34, fontFamily: 'serif' },
      });
      label.position.set(-15, 12);
      group.addChild(label);
      scene.addChild(group);
    }
    w.disciples.forEach((d, i) => {
      if (
        d.stage === '坐化' ||
        d.state.awayUntil ||
        d.state.behavior === '休息'
      )
        return;
      const positions: Record<string, number[]> = {
        空地: [280, 240],
        松下: [250, 300],
        采石点: [360, 170],
        药圃: [410, 260],
        静修室: [160, 140],
        炼丹房: [480, 160],
      };
      const site = w.buildings.find((b) => d.state.location === `工地:${b.id}`);
      const pos = site
        ? [site.x, site.y + 25]
        : (positions[d.state.location] ?? [250, 230]);
      const x = pos[0] + ((i % 3) - 1) * 18,
        y = pos[1] + Math.floor(i / 3) * 22;
      const g = new Container();
      g.position.set(x, y);
      g.zIndex = y;
      g.addChild(
        new Graphics()
          .circle(0, 0, 9)
          .fill(d.state.injuredUntil > w.tick ? 0x8a8578 : 0x4f8a8b)
          .stroke({
            width: 3,
            color: Number.parseInt(
              CONFIG.elements[d.root.elements[0]].color.slice(1),
              16,
            ),
          }),
      );
      const t = new Text({
        text: `${d.name} ${Number(d.flags.walkUntil) > w.tick ? '→' : d.state.behavior === '修炼' ? '◉' : d.state.behavior === '做工' ? '⚒' : '◇'}${d.stage === '迟暮' ? ' 白发' : ''}\n占位`,
        style: { fontSize: 12, fill: 0x34483a, fontFamily: 'serif' },
      });
      t.position.set(-20, 15);
      g.addChild(t);
      scene.addChild(g);
    });
    const mini = new Container();
    mini.position.set(480, 5);
    mini.addChild(
      new Graphics()
        .rect(0, 0, 115, 70)
        .fill({ color: 0xf1e8d4, alpha: 0.9 })
        .stroke({ width: 1, color: 0x8a8578 }),
    );
    for (const b of w.buildings)
      mini.addChild(
        new Graphics().rect(b.x * 0.18, b.y * 0.18, 4, 3).fill(0x4a5a66),
      );
    for (const [i, d] of w.disciples.entries())
      if (d.stage !== '坐化' && !d.state.awayUntil)
        mini.addChild(
          new Graphics()
            .circle(38 + i * 8, 50, 2)
            .fill(
              Number.parseInt(
                CONFIG.elements[d.root.elements[0]].color.slice(1),
                16,
              ),
            ),
        );
    mini.zIndex = 1000;
    scene.addChild(mini);
    const rest = w.disciples.filter(
      (d) => d.state.behavior === '休息' && d.remainingSeasons > 0,
    ).length;
    if (rest) {
      const label = new Text({
        text: `Zzz ×${rest}`,
        style: { fontSize: 12, fill: 0x5a564c },
      });
      label.position.set(120, 180);
      scene.addChild(label);
    }
    app.render();
  }
  return {
    draw,
    pause: () => app.stop(),
    destroy: () => app.destroy(true, { children: true }),
  };
}
