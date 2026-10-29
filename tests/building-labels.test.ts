import { expect, it } from 'vitest';
import { buildingDefinitions } from '../src/sim/catalog';
import { intersects } from '../src/render/layout';
import {
  buildingLabelBox,
  buildingLabelObstacles,
  buildingLabelPosition,
  layoutBuildingLabels,
  labelOnWalkable,
  distanceToBox,
} from '../src/render/building-labels';

it.each([1, 2])(
  'all-built tier %s plaques stay below their feet, clear of all art and each other',
  (tier) => {
    for (const suffix of [` Lv${tier}`, ` Lv${tier} ⚒`, '预留位']) {
      const input = buildingDefinitions.map((b) => ({
        id: b.id,
        box: buildingLabelBox(b.id, b.name + suffix),
      }));
      const original = structuredClone(input);
      const result = layoutBuildingLabels(input);
      expect(input).toEqual(original);
      expect(result).toHaveLength(5);
      for (const [i, label] of result.entries()) {
        const initial = input.find((l) => l.id === label.id)!;
        expect(Math.abs(label.box.x - initial.box.x)).toBeLessThanOrEqual(80);
        expect(label.box.y - initial.box.y).toBeLessThanOrEqual(24);
        expect(labelOnWalkable(label.box)).toBe(true);
        const center: [number, number] = [
          label.box.x + label.box.width / 2,
          label.box.y + label.box.height / 2,
        ];
        for (const own of buildingLabelObstacles.filter(
          (b) => b.id === label.id,
        ))
          for (const other of buildingLabelObstacles.filter(
            (b) => b.id !== label.id,
          ))
            expect(
              distanceToBox(center, own),
              `${label.id} nearer ${other.id}`,
            ).toBeLessThan(distanceToBox(center, other));
        expect(label.box.y).toBeGreaterThanOrEqual(
          buildingLabelPosition(label.id)[1],
        );
        for (const box of [
          ...buildingLabelObstacles,
          ...result.slice(i + 1).map((l) => l.box),
        ])
          expect(
            intersects(label.box, box),
            `${label.id} overlaps ${JSON.stringify(box)}`,
          ).toBe(false);
      }
      expect(layoutBuildingLabels([...input].reverse())).toEqual(result);
    }
  },
);
