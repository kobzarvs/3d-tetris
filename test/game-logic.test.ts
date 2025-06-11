import { describe, it, expect } from 'vitest';
import { rotateAroundX, rotateAroundY, rotateAroundZ, Block3D } from '../src/game-logic';

describe('rotation helpers', () => {
  const blocks: Block3D[] = [
    { x: 1, y: 2, z: 3 },
    { x: -1, y: 0, z: 0 }
  ];

  it('rotateAroundX swaps y and z correctly', () => {
    const rotated = rotateAroundX(blocks);
    expect(rotated).toEqual([
      { x: 1, y: -3, z: 2 },
      { x: -1, y: -0, z: 0 }
    ]);
  });

  it('rotateAroundY swaps x and z correctly', () => {
    const rotated = rotateAroundY(blocks);
    expect(rotated).toEqual([
      { x: 3, y: 2, z: -1 },
      { x: 0, y: 0, z: 1 }
    ]);
  });

  it('rotateAroundZ swaps x and y correctly', () => {
    const rotated = rotateAroundZ(blocks);
    expect(rotated).toEqual([
      { x: -2, y: 1, z: 3 },
      { x: -0, y: -1, z: 0 }
    ]);
  });
});
