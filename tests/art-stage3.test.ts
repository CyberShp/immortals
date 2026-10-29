import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { headSpecks } from '../scripts/alpha-components';
import { assetUrl, portraitFile, eventIcon, artImage } from '../src/app/art';
import { discipleArtFile } from '../src/render/world-scale';
import { overheadNames } from '../src/render/layout';
import roster from '../data/roster.json';
import events from '../data/events.json';
describe('W3 presentation', () => {
  it('portraits resolve by name, retain fixed CSS size and load lazily', () => {
    for (const d of roster)
      for (const size of [32, 64, 128]) {
        const file = portraitFile(d, size);
        expect(assetUrl(file)).toBeTruthy();
        expect(file).toContain(size === 128 ? '-256@' : '-128@');
        expect(artImage(file, size)).toContain(
          `width="${size}" height="${size}" loading="lazy"`,
        );
      }
    expect(portraitFile({ name: '新门人' }, 64)).toBe('');
  });
  it('missing portraits/icons never produce requests without a manifest entry', () => {
    for (const file of [
      'portrait/missing-128@2x.webp',
      'icon/missing-32@2x.webp',
    ]) {
      expect(assetUrl(file)).toBeUndefined();
      expect(artImage(file, 32)).toBe('');
    }
    expect(assetUrl(portraitFile(roster[0], 64), new Set())).toBeUndefined();
  });
  it('catalog kind maps all known types and unknown kinds use sect', () => {
    for (const e of events)
      expect(assetUrl(`icon/${eventIcon(e.kind)}-64@2x.webp`)).toBeTruthy();
    expect(eventIcon('机缘')).toBe('event-sect');
    expect(eventIcon('突破')).toBe('event-breakthrough');
    expect(eventIcon('情缘')).toBe('event-romance');
  });
  it('only female walk/meditate use female textures', () => {
    expect(roster.filter((d) => d.gender === '女').map((d) => d.name)).toEqual([
      '白芷',
      '苏小禾',
    ]);
    for (const pose of ['walk-step', 'walk-pass', 'meditate', 'work', 'talk'])
      for (const d of roster) {
        const file = discipleArtFile(d.gender, pose);
        expect(assetUrl(file)).toBeTruthy();
        expect(file.includes('/f-')).toBe(
          d.gender === '女' && !['work', 'talk'].includes(pose),
        );
      }
  });
  it.each([32, 24])(
    'female passing frame has no isolated alpha specks above the head at %ipx',
    async (height) => {
      const { data, info } = await sharp(
        'public/assets/disciple/f-walk-pass-96@2x.webp',
      )
        .resize({ height })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(headSpecks(data, info.width, info.height)).toEqual([]);
    },
  );
  it('speck detector catches a disconnected 1px alpha pixel above a body', () => {
    const rgba = new Uint8Array(5 * 5 * 4);
    for (const p of [0, 12, 13, 17, 18]) rgba[p * 4 + 3] = 1;
    expect(headSpecks(rgba, 5, 5)).toEqual([0]);
  });
  it('inspected names retain fixed clearance above the female canvas at every scale', () => {
    for (const height of [24, 32, 67.2, 96]) {
      const [box] = overheadNames([
        { x: 100, y: 100, name: '白芷', height, row: 0 },
      ]);
      expect(box.y + box.height).toBe(100 - height - 8);
    }
  });
});
