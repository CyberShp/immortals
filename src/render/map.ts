import { Application, Container, Graphics, Text } from 'pixi.js';
import type { World } from '../sim/world';
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
    for (const b of w.buildings) {
      const group = new Container();
      group.position.set(b.x, b.y);
      group.zIndex = b.y;
      group.addChild(
        new Graphics()
          .rect(-45, -40, 90, 45)
          .fill(0x758878)
          .poly([-55, -40, 0, -65, 55, -40])
          .fill(0x364e43),
      );
      const label = new Text({
        text: b.name,
        style: { fontSize: 14, fill: 0x263f34, fontFamily: 'serif' },
      });
      label.position.set(-15, 12);
      group.addChild(label);
      scene.addChild(group);
    }
    w.disciples.forEach((d, i) => {
      if (d.stage === '坐化') return;
      const x = 220 + (i % 3) * 78,
        y = 220 + Math.floor(i / 3) * 60;
      const g = new Container();
      g.position.set(x, y);
      g.zIndex = y;
      g.addChild(
        new Graphics()
          .circle(0, 0, 9)
          .fill(d.state.behavior === '休息' ? 0xa8ad9c : 0xb8533c),
      );
      const t = new Text({
        text: d.name + (d.state.behavior === '休息' ? ' 眠' : ''),
        style: { fontSize: 12, fill: 0x34483a, fontFamily: 'serif' },
      });
      t.position.set(-20, 15);
      g.addChild(t);
      scene.addChild(g);
    });
    app.render();
  }
  return {
    draw,
    pause: () => app.stop(),
    destroy: () => app.destroy(true, { children: true }),
  };
}
