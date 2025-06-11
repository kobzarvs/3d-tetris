import { atom, computed } from '@reatom/core';
import {
    GameState,
    FIELD_WIDTH,
    FIELD_DEPTH,
    FIELD_HEIGHT,
    DROP_INTERVAL
} from './constants';
import type { GameStateType } from './constants';

// Types

export interface Block3D {
    x: number;
    y: number;
    z: number;
}

export interface Piece {
    type: PieceType;
    blocks: Block3D[];
    position: Block3D;
}

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L' | 'TEST_PLANE' | 'TEST_CUBE';

export interface GameTimers {
    dropTimer: number;
    lockDelay: number;
    lastDropTime: number;
    dropInterval: number;
    lockDelayActive: boolean;
}

export interface CubeArray3D {
    blocks: Block3D[];
    size: { width: number; height: number; depth: number };
}

// Tetromino shapes
export const tetrominoShapes: Record<PieceType, Block3D[]> = {
    I: [
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 }
    ],
    O: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 }
    ],
    T: [
        { x: 0, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 }
    ],
    S: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: -1, y: 0, z: 1 }
    ],
    Z: [
        { x: 0, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 }
    ],
    J: [
        { x: 0, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 1 }
    ],
    L: [
        { x: 0, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 0, z: 1 }
    ],
    TEST_PLANE: (() => {
        // Куб 5x5x5 с дыркой в центре (один блок отсутствует)
        const blocks: Block3D[] = [];
        for (let x = -2; x <= 2; x++) {
            for (let y = -2; y < 3; y++) {
                for (let z = -2; z <= 2; z++) {
                    // Пропускаем центральный блок (0,2,0) - дырка в середине куба
                    if (x !== 0 || z !== 0) {
                        blocks.push({ x, y, z });
                    }
                }
            }
        }
        return blocks;
    })(),
    TEST_CUBE: [
        // Параллелепипед 2x2x2 (ширина x длина x высота)
        // Слой Y=0
        { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 },
        // Слой Y=1
        { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
        { x: 0, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }
    ]
};

export const tetrominoColors: Record<PieceType, number> = {
    I: 0x00ffff, T: 0xff00ff, L: 0xff8c00, J: 0x4169e1,
    S: 0x32cd32, Z: 0xff4500, O: 0xffff00,
    TEST_PLANE: 0xff0080, // Ярко-розовый для куба 5x5x5 с дыркой
    TEST_CUBE: 0x8000ff   // Фиолетовый для куба 2x2x2
};

// Base atoms with actions
export const gameStateAtom = atom<GameStateType>(GameState.MENU).actions((target) => ({
    setMenu: () => target.set(GameState.MENU),
    setPlaying: () => target.set(GameState.PLAYING),
    setPaused: () => target.set(GameState.PAUSED),
    setGameOver: () => target.set(GameState.GAME_OVER)
}));

export const scoreAtom = atom(0).actions((target) => ({
    add: (points: number) => target.set(prev => prev + points),
    reset: () => target.set(0)
}));

export const fieldRotationAtom = atom(0).actions((target) => ({
    rotate: (direction: 1 | -1) => target.set(prev => (prev + (direction * 90) + 360) % 360),
    reset: () => target.set(0)
}));

export const coloredModeAtom = atom(false).actions((target) => ({
    toggle: () => target.set(prev => !prev),
    update: (value: boolean) => target.set(value)
}));

export const difficultyLevelAtom = atom(3).actions((target) => ({
    setLevel: (level: 2 | 3 | 4 | 5) => target.set(level)
}));

export const lockDelayTimerVisibleAtom = atom(false).actions((target) => ({
    toggle: () => target.set(prev => !prev),
    show: () => target.set(true),
    hide: () => target.set(false)
}));

// Game field - 3D array
export const gameFieldAtom = atom<(PieceType | null)[][][]>(
    Array(FIELD_HEIGHT).fill(null).map(() =>
        Array(FIELD_DEPTH).fill(null).map(() =>
            Array(FIELD_WIDTH).fill(null)
        )
    )
).actions((target) => ({
    reset: () => target.set(Array(FIELD_HEIGHT).fill(null).map(() =>
        Array(FIELD_DEPTH).fill(null).map(() =>
            Array(FIELD_WIDTH).fill(null)
        )
    )),
    placePiece: (piece: Piece) => target.set(field => {
        const newField = field.map(level => level.map(row => [...row]));

        for (const block of piece.blocks) {
            const x = Math.round(piece.position.x + block.x);
            const y = Math.round(piece.position.y + block.y);
            const z = Math.round(piece.position.z + block.z);

            if (x >= 0 && x < FIELD_WIDTH && y >= 0 && y < FIELD_HEIGHT && z >= 0 && z < FIELD_DEPTH) {
                newField[y][z][x] = piece.type;
            }
        }

        return newField;
    }),
    clearBlocks: (blocks: Block3D[]) => target.set(field => {
        const newField = field.map(level => level.map(row => [...row]));

        for (const block of blocks) {
            newField[block.y][block.z][block.x] = null;
        }

        return newField;
    }),
    applyGravity: () => target.set(field => {
        const newField = field.map(level => level.map(row => [...row]));

        for (let x = 0; x < FIELD_WIDTH; x++) {
            for (let z = 0; z < FIELD_DEPTH; z++) {
                const blocks: (PieceType | null)[] = [];
                for (let y = 0; y < FIELD_HEIGHT; y++) {
                    if (newField[y][z][x] !== null) {
                        blocks.push(newField[y][z][x]);
                    }
                }

                for (let y = 0; y < FIELD_HEIGHT; y++) {
                    newField[y][z][x] = null;
                }

                for (let i = 0; i < blocks.length; i++) {
                    newField[i][z][x] = blocks[i];
                }
            }
        }

        return newField;
    })
}));

// Current piece
export const currentPieceAtom = atom<Piece | null>(null).actions((target) => ({
    spawn: (type: PieceType) => target.set({
        type,
        blocks: [...tetrominoShapes[type]],
        position: {
            x: Math.floor(FIELD_WIDTH / 2),
            y: FIELD_HEIGHT - 2,
            z: Math.floor(FIELD_DEPTH / 2)
        }
    }),
    move: (dx: number, dy: number, dz: number) => target.set(piece => {
        if (!piece) return piece;
        return {
            ...piece,
            position: {
                x: piece.position.x + dx,
                y: piece.position.y + dy,
                z: piece.position.z + dz
            }
        };
    }),
    rotate: (rotatedBlocks: Block3D[]) => target.set(piece => {
        if (!piece) return piece;
        return { ...piece, blocks: rotatedBlocks };
    }),
    clear: () => target.set(null)
}));

// Next piece
export const nextPieceAtom = atom<PieceType | null>(null).actions((target) => ({
    update: (type: PieceType) => target.set(type),
    clear: () => target.set(null)
}));

// Lock Delay логика перенесена в models/lock-delay-indicator.ts

// Автоматическое падение теперь в models/lock-delay-indicator.ts

// Game timers
export const timersAtom = atom<GameTimers>({
    dropTimer: 0,
    lockDelay: 0,
    lastDropTime: Date.now(),
    dropInterval: DROP_INTERVAL,
    lockDelayActive: false
}).actions((target) => ({
    updateDropTime: () => target.set(timers => ({
        ...timers,
        lastDropTime: Date.now()
    })),
    startLockDelay: () => target.set(timers => ({
        ...timers,
        lockDelayActive: true,
        lockDelay: Date.now()
    })),
    resetLockDelay: () => target.set(timers => ({
        ...timers,
        lockDelayActive: false
    })),
    reset: () => target.set({
        dropTimer: 0,
        lockDelay: 0,
        lastDropTime: Date.now(),
        dropInterval: DROP_INTERVAL,
        lockDelayActive: false
    })
}));

// Computed atoms
export const canMoveDownAtom = computed(() => {
    const piece = currentPieceAtom();
    const field = gameFieldAtom();

    if (!piece) return false;

    return canPlacePiece(piece.blocks, { ...piece.position, y: piece.position.y - 1 }, field);
});

export const isGameOverAtom = computed(() => {
    return gameStateAtom() === GameState.GAME_OVER;
});

export const isPlayingAtom = computed(() => {
    return gameStateAtom() === GameState.PLAYING;
});

export const isOnGroundAtom = computed(() => {
    const piece = currentPieceAtom();
    const field = gameFieldAtom();

    if (!piece) return true;

    return !canPlacePiece(piece.blocks, { ...piece.position, y: piece.position.y - 1 }, field);
});

export const fieldStatisticsAtom = computed(() => {
    const field = gameFieldAtom();
    let filledBlocks = 0;
    let emptySpaces = 0;

    for (let y = 0; y < FIELD_HEIGHT; y++) {
        for (let z = 0; z < FIELD_DEPTH; z++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                if (field[y][z][x] !== null) {
                    filledBlocks++;
                } else {
                    emptySpaces++;
                }
            }
        }
    }

    return { filledBlocks, emptySpaces };
});

export const cubeArraysAtom = computed(() => {
    const field = gameFieldAtom();
    return find3DCubeArrays(field);
});

// Utility functions
function canPlacePiece(blocks: Block3D[], position: Block3D, field: (PieceType | null)[][][]): boolean {
    return blocks.every(block => {
        const x = Math.round(position.x + block.x);
        const y = Math.round(position.y + block.y);
        const z = Math.round(position.z + block.z);
        return x >= 0 && x < FIELD_WIDTH &&
               y >= 0 && y < FIELD_HEIGHT &&
               z >= 0 && z < FIELD_DEPTH &&
               field[y][z][x] === null;
    });
}

// Compatibility wrapper for main.ts (uses current gameFieldAtom state)
export function canPlacePieceCompat(blocks: Block3D[], position: Block3D): boolean {
    return canPlacePiece(blocks, position, gameFieldAtom());
}

export function getRandomPiece(): PieceType {
    // Только основные фигуры, без тестовых
    const normalShapes: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    return normalShapes[Math.floor(Math.random() * normalShapes.length)];
}

// Rotation functions
export function rotateAroundY(blocks: Block3D[]): Block3D[] {
    return blocks.map(block => ({ x: block.z, y: block.y, z: -block.x }));
}

export function rotateAroundX(blocks: Block3D[]): Block3D[] {
    return blocks.map(block => ({ x: block.x, y: -block.z, z: block.y }));
}

export function rotateAroundZ(blocks: Block3D[]): Block3D[] {
    return blocks.map(block => ({ x: -block.y, y: block.x, z: block.z }));
}

export function rotateInViewPlane(blocks: Block3D[]): Block3D[] {
    // Вращение в плоскости экрана относительно камеры (W)
    return rotateAroundY(blocks);
}

export function rotateVertical(blocks: Block3D[]): Block3D[] {
    // Вращение в вертикальной плоскости относительно камеры (E)
    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;
    switch (rotationSteps) {
        case 0: return rotateAroundZ(blocks);  // 0° - передняя стена видна, вращаем в плоскости XY
        case 1: return rotateAroundX(blocks);  // 90° - правая стена видна, вращаем в плоскости YZ
        case 2: return rotateAroundZ(blocks);  // 180° - задняя стена видна, вращаем в плоскости XY
        case 3: return rotateAroundX(blocks);  // 270° - левая стена видна, вращаем в плоскости YZ
        default: return blocks;
    }
}

export function rotateSide(blocks: Block3D[]): Block3D[] {
    // Вращение в боковой плоскости относительно камеры (Q)
    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;
    switch (rotationSteps) {
        case 0: return rotateAroundX(blocks);  // 0° - боковое вращение в плоскости YZ
        case 1: return rotateAroundZ(blocks);  // 90° - боковое вращение в плоскости XY
        case 2: return rotateAroundX(blocks);  // 180° - боковое вращение в плоскости YZ
        case 3: return rotateAroundZ(blocks);  // 270° - боковое вращение в плоскости XY
        default: return blocks;
    }
}

// Находит максимальный параллелепипед который СОДЕРЖИТ данный блок (не обязательно как угол)
function findMaxParallelepipedFrom(containingBlock: Block3D): CubeArray3D | null {
    const field = gameFieldAtom();
    
    console.log(`  🔍 findMaxParallelepipedFrom: ищем параллелепипед содержащий блок (${containingBlock.x},${containingBlock.y},${containingBlock.z})`);
    
    // Проверяем что блок не пустой
    if (containingBlock.x < 0 || containingBlock.x >= FIELD_WIDTH ||
        containingBlock.y < 0 || containingBlock.y >= FIELD_HEIGHT ||
        containingBlock.z < 0 || containingBlock.z >= FIELD_DEPTH ||
        field[containingBlock.y][containingBlock.z][containingBlock.x] === null) {
        console.log(`  ❌ Блок (${containingBlock.x},${containingBlock.y},${containingBlock.z}) вне границ или пустой`);
        return null;
    }

    let maxVolume = 0;
    let bestParallelepiped: CubeArray3D | null = null;

    // НОВАЯ ЛОГИКА: перебираем все возможные параллелепипеды которые СОДЕРЖАТ данный блок
    // Для этого перебираем все возможные углы параллелепипеда в пределах поля
    for (let minX = 0; minX <= containingBlock.x; minX++) {
        for (let maxX = containingBlock.x; maxX < FIELD_WIDTH; maxX++) {
            for (let minY = 0; minY <= containingBlock.y; minY++) {
                for (let maxY = containingBlock.y; maxY < FIELD_HEIGHT; maxY++) {
                    for (let minZ = 0; minZ <= containingBlock.z; minZ++) {
                        for (let maxZ = containingBlock.z; maxZ < FIELD_DEPTH; maxZ++) {
                            
                            const width = maxX - minX + 1;
                            const height = maxY - minY + 1;
                            const depth = maxZ - minZ + 1;
                            const volume = width * height * depth;

                            // Пропускаем слишком маленькие параллелепипеды
                            if (volume <= maxVolume) continue;

                            // Проверяем что все блоки параллелепипеда заполнены
                            let isComplete = true;
                            const blocks: Block3D[] = [];

                            for (let y = minY; y <= maxY; y++) {
                                for (let z = minZ; z <= maxZ; z++) {
                                    for (let x = minX; x <= maxX; x++) {
                                        if (field[y][z][x] === null) {
                                            isComplete = false;
                                            break;
                                        }
                                        blocks.push({ x, y, z });
                                    }
                                    if (!isComplete) break;
                                }
                                if (!isComplete) break;
                            }

                            if (isComplete && volume > maxVolume) {
                                maxVolume = volume;
                                bestParallelepiped = {
                                    blocks,
                                    size: { width, height, depth }
                                };
                                console.log(`    🎯 Новый лучший: ${width}x${height}x${depth} (объем ${volume}), область X(${minX}-${maxX}) Y(${minY}-${maxY}) Z(${minZ}-${maxZ})`);
                            }
                        }
                    }
                }
            }
        }
    }

    if (bestParallelepiped) {
        console.log(`  ✅ ИТОГО лучший параллелепипед: ${bestParallelepiped.size.width}x${bestParallelepiped.size.height}x${bestParallelepiped.size.depth} (объем ${maxVolume})`);
    } else {
        console.log(`  ❌ Параллелепипед не найден содержащий блок (${containingBlock.x},${containingBlock.y},${containingBlock.z})`);
    }

    return bestParallelepiped;
}

// Находит всех соседей (6-связность) для набора блоков
function getNeighbors(blocks: Block3D[]): Block3D[] {
    const field = gameFieldAtom();
    const blockSet = new Set(blocks.map(b => `${b.x},${b.y},${b.z}`));
    const neighbors: Block3D[] = [];
    const neighborSet = new Set<string>();

    // Направления для 6-связности (вверх, вниз, лево, право, вперед, назад)
    const directions = [
        { x: 1, y: 0, z: 0 },   // право
        { x: -1, y: 0, z: 0 },  // лево
        { x: 0, y: 1, z: 0 },   // вверх
        { x: 0, y: -1, z: 0 },  // вниз
        { x: 0, y: 0, z: 1 },   // вперед
        { x: 0, y: 0, z: -1 }   // назад
    ];

    for (const block of blocks) {
        for (const dir of directions) {
            const neighbor = {
                x: block.x + dir.x,
                y: block.y + dir.y,
                z: block.z + dir.z
            };

            // Проверяем границы поля
            if (neighbor.x >= 0 && neighbor.x < FIELD_WIDTH &&
                neighbor.y >= 0 && neighbor.y < FIELD_HEIGHT &&
                neighbor.z >= 0 && neighbor.z < FIELD_DEPTH) {
                
                const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`;
                
                // Добавляем соседа если он заполнен и не входит в исходный набор
                if (field[neighbor.y][neighbor.z][neighbor.x] !== null &&
                    !blockSet.has(neighborKey) &&
                    !neighborSet.has(neighborKey)) {
                    
                    neighbors.push(neighbor);
                    neighborSet.add(neighborKey);
                }
            }
        }
    }

    return neighbors;
}

// 3D cube array detection
function find3DCubeArrays(field: (PieceType | null)[][][]): CubeArray3D[] {
    const cubeArrays: CubeArray3D[] = [];
    const visited = Array(FIELD_HEIGHT).fill(null).map(() =>
        Array(FIELD_DEPTH).fill(null).map(() =>
            Array(FIELD_WIDTH).fill(false)
        )
    );

    // Используем текущий уровень сложности как минимальный размер
    const minSize = difficultyLevelAtom();
    console.log(`🔍 Поиск параллелепипедов с минимальным размером ${minSize}x${minSize}x${minSize}`);

    let foundCount = 0;
    for (let y = 0; y < FIELD_HEIGHT; y++) {
        for (let z = 0; z < FIELD_DEPTH; z++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                if (field[y][z][x] !== null && !visited[y][z][x]) {
                    // СНАЧАЛА проверяем: является ли этот блок частью минимального куба 2×2×2
                    if (!isPartOfMinimalCube(field, x, y, z)) {
                        visited[y][z][x] = true; // Отмечаем как посещенный чтобы не проверять повторно
                        console.log(`🚫 Блок (${x},${y},${z}) не является частью минимального куба 2×2×2, пропускаем`);
                        continue;
                    }

                    console.log(`✅ Блок (${x},${y},${z}) является частью минимального куба 2×2×2, запускаем DFS`);

                    // ТОЛЬКО ТОГДА находим связную группу блоков через DFS
                    const connectedGroup = findConnectedGroup(field, x, y, z, visited);
                    if (connectedGroup.length > 0) {
                        foundCount++;
                        console.log(`🔎 Найдена связная группа #${foundCount}: ${connectedGroup.length} блоков от (${x},${y},${z})`);

                        // Для этой группы ищем наибольший прямоугольный параллелепипед
                        const cubeArray = findLargestRectangularSolid(connectedGroup);
                        if (cubeArray) {
                            console.log(`   └── Лучший параллелепипед: ${cubeArray.size.width}x${cubeArray.size.height}x${cubeArray.size.depth}`);

                            // Сравниваем с ВЫБРАННЫМ уровнем сложности (не с 2×2×2!)
                            const passesFilter = cubeArray.size.width >= minSize &&
                                               cubeArray.size.height >= minSize &&
                                               cubeArray.size.depth >= minSize;
                            console.log(`   └── Фильтр уровня сложности ${minSize}x${minSize}x${minSize}: ${passesFilter ? '✅ ПРОХОДИТ' : '❌ НЕ ПРОХОДИТ'}`);

                            if (passesFilter) {
                                cubeArrays.push(cubeArray);
                            }
                        }
                    }
                }
            }
        }
    }

    console.log(`🎯 Итого найдено ${foundCount} связных групп, ${cubeArrays.length} параллелепипедов прошли фильтр`);
    return cubeArrays;
}

// Проверяет, является ли блок частью минимального куба 2×2×2
function isPartOfMinimalCube(field: (PieceType | null)[][][], x: number, y: number, z: number): boolean {
    // Проверяем все возможные позиции где данный блок может быть частью куба 2×2×2
    for (let cornerX = x - 1; cornerX <= x; cornerX++) {
        for (let cornerY = y - 1; cornerY <= y; cornerY++) {
            for (let cornerZ = z - 1; cornerZ <= z; cornerZ++) {
                // Проверяем что куб 2×2×2 с углом в (cornerX, cornerY, cornerZ) полностью заполнен
                if (isCubeComplete(field, cornerX, cornerY, cornerZ, 2, 2, 2)) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Проверяет заполнен ли куб заданного размера
function isCubeComplete(
    field: (PieceType | null)[][][],
    startX: number,
    startY: number,
    startZ: number,
    width: number,
    height: number,
    depth: number
): boolean {
    // Проверяем границы
    if (startX < 0 || startY < 0 || startZ < 0 ||
        startX + width > FIELD_WIDTH ||
        startY + height > FIELD_HEIGHT ||
        startZ + depth > FIELD_DEPTH) {
        return false;
    }

    // Проверяем что все блоки заполнены
    for (let y = startY; y < startY + height; y++) {
        for (let z = startZ; z < startZ + depth; z++) {
            for (let x = startX; x < startX + width; x++) {
                if (field[y][z][x] === null) {
                    return false;
                }
            }
        }
    }
    return true;
}

// Находит связную группу блоков через DFS
function findConnectedGroup(
    field: (PieceType | null)[][][],
    startX: number,
    startY: number,
    startZ: number,
    visited: boolean[][][]
): Block3D[] {
    const group: Block3D[] = [];
    const stack: Block3D[] = [{ x: startX, y: startY, z: startZ }];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const { x, y, z } = current;

        // Проверяем границы и посещенность
        if (x < 0 || x >= FIELD_WIDTH ||
            y < 0 || y >= FIELD_HEIGHT ||
            z < 0 || z >= FIELD_DEPTH ||
            visited[y][z][x] ||
            field[y][z][x] === null) {
            continue;
        }

        // Отмечаем как посещенный и добавляем в группу
        visited[y][z][x] = true;
        group.push({ x, y, z });

        // Добавляем всех 6 соседей (вверх, вниз, влево, вправо, вперед, назад)
        stack.push(
            { x: x + 1, y, z },  // право
            { x: x - 1, y, z },  // лево
            { x, y: y + 1, z },  // вверх
            { x, y: y - 1, z },  // вниз
            { x, y, z: z + 1 },  // вперед
            { x, y, z: z - 1 }   // назад
        );
    }

    return group;
}

// Находит наибольший прямоугольный параллелепипед в связной группе
function findLargestRectangularSolid(connectedGroup: Block3D[]): CubeArray3D | null {
    if (connectedGroup.length === 0) return null;

    // Создаем множество для быстрого поиска
    const blockSet = new Set(connectedGroup.map(b => `${b.x},${b.y},${b.z}`));

    let maxVolume = 0;
    let bestCubeArray: CubeArray3D | null = null;

    // Перебираем все возможные углы параллелепипеда
    for (const corner1 of connectedGroup) {
        for (const corner2 of connectedGroup) {
            // Определяем границы параллелепипеда
            const minX = Math.min(corner1.x, corner2.x);
            const maxX = Math.max(corner1.x, corner2.x);
            const minY = Math.min(corner1.y, corner2.y);
            const maxY = Math.max(corner1.y, corner2.y);
            const minZ = Math.min(corner1.z, corner2.z);
            const maxZ = Math.max(corner1.z, corner2.z);

            const width = maxX - minX + 1;
            const height = maxY - minY + 1;
            const depth = maxZ - minZ + 1;
            const volume = width * height * depth;

            // Проверяем что все блоки параллелепипеда есть в группе
            let isComplete = true;
            const blocks: Block3D[] = [];

            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    for (let x = minX; x <= maxX; x++) {
                        if (!blockSet.has(`${x},${y},${z}`)) {
                            isComplete = false;
                            break;
                        }
                        blocks.push({ x, y, z });
                    }
                    if (!isComplete) break;
                }
                if (!isComplete) break;
            }

            if (isComplete && volume > maxVolume) {
                maxVolume = volume;
                bestCubeArray = {
                    blocks,
                    size: { width, height, depth }
                };
            }
        }
    }

    return bestCubeArray;
}



// Game actions
export const gameActions = {
    resetGame: () => {
        gameFieldAtom.reset();
        currentPieceAtom.clear();
        nextPieceAtom.clear();
        scoreAtom.reset();
        fieldRotationAtom.reset();
        timersAtom.reset();
        gameStateAtom.setMenu();
    },

    startGame: () => {
        gameActions.resetGame();
        gameStateAtom.setPlaying();
        gameActions.spawnNewPiece();
    },

    spawnNewPiece: () => {
        const field = gameFieldAtom();
        let pieceType = nextPieceAtom();

        if (!pieceType) {
            pieceType = getRandomPiece();
        }

        const piece = {
            type: pieceType,
            blocks: [...tetrominoShapes[pieceType]],
            position: {
                x: Math.floor(FIELD_WIDTH / 2),
                y: FIELD_HEIGHT - 2,
                z: Math.floor(FIELD_DEPTH / 2)
            }
        };

        nextPieceAtom.update(getRandomPiece());

        if (!canPlacePiece(piece.blocks, piece.position, field)) {
            gameStateAtom.setGameOver();
            return;
        }

        currentPieceAtom.spawn(pieceType);
        timersAtom.updateDropTime();
        timersAtom.resetLockDelay();
    },

    movePiece: (dx: number, dy: number, dz: number): boolean => {
        const piece = currentPieceAtom();
        const field = gameFieldAtom();

        if (!piece) return false;

        const newPosition = {
            x: piece.position.x + dx,
            y: piece.position.y + dy,
            z: piece.position.z + dz
        };

        if (canPlacePiece(piece.blocks, newPosition, field)) {
            currentPieceAtom.move(dx, dy, dz);

            // Reset lock delay if moving sideways
            if (dx !== 0 || dz !== 0) {
                timersAtom.resetLockDelay();
            }

            return true;
        }

        return false;
    },

    rotatePiece: (rotationType: 'view' | 'vertical' | 'side'): boolean => {
        const piece = currentPieceAtom();
        const field = gameFieldAtom();

        if (!piece) return false;

        let rotatedBlocks: Block3D[];

        switch (rotationType) {
            case 'view':
                rotatedBlocks = rotateInViewPlane(piece.blocks);
                break;
            case 'vertical':
                rotatedBlocks = rotateVertical(piece.blocks);
                break;
            case 'side':
                rotatedBlocks = rotateSide(piece.blocks);
                break;
            default:
                return false;
        }

        if (canPlacePiece(rotatedBlocks, piece.position, field)) {
            currentPieceAtom.rotate(rotatedBlocks);
            return true;
        }

        return false;
    },

    placePiece: () => {
        const piece = currentPieceAtom();

        if (!piece) return;

        // Получаем мировые координаты упавшей фигуры
        const placedBlocks: Block3D[] = piece.blocks.map(block => ({
            x: Math.round(piece.position.x + block.x),
            y: Math.round(piece.position.y + block.y),
            z: Math.round(piece.position.z + block.z)
        }));

        gameFieldAtom.placePiece(piece);

        // Add placement score
        scoreAtom.add(10);

        // Check for 3D cube arrays to clear - НОВЫЙ АЛГОРИТМ от упавшей фигуры
        gameActions.clearLinesIterative(placedBlocks);

        // Spawn new piece
        gameActions.spawnNewPiece();
    },

    // НОВЫЙ АЛГОРИТМ: итеративный поиск всех максимальных параллелепипедов от упавшей фигуры
    clearLinesIterative: (placedBlocks: Block3D[]) => {
        console.log(`🚀 НОВЫЙ АЛГОРИТМ: итеративный поиск от ${placedBlocks.length} блоков упавшей фигуры`);
        console.log(`📍 Упавшие блоки: ${placedBlocks.map(b => `(${b.x},${b.y},${b.z})`).join(', ')}`);

        // ПЕРВЫЙ ЭТАП: итеративный поиск параллелепипедов от упавшей фигуры
        const blocksToDestroy = new Set<string>();
        const processedBlocks = new Set<string>();
        const searchQueue: Block3D[] = [...placedBlocks];
        const minSize = difficultyLevelAtom();

        console.log(`🔍 Начинаем итеративный поиск параллелепипедов размером >= ${minSize}x${minSize}x${minSize}`);

        let iterationCount = 0;
        const MAX_ITERATIONS = 1000; // Защита от бесконечного цикла

        while (searchQueue.length > 0 && iterationCount < MAX_ITERATIONS) {
            iterationCount++;
            const currentBlock = searchQueue.shift()!;
            const blockKey = `${currentBlock.x},${currentBlock.y},${currentBlock.z}`;

            // Пропускаем уже обработанные блоки
            if (processedBlocks.has(blockKey)) {
                continue;
            }
            processedBlocks.add(blockKey);

            console.log(`🔎 Итерация ${iterationCount}: ищем от блока (${currentBlock.x},${currentBlock.y},${currentBlock.z})`);

            // Найти максимальный параллелепипед от currentBlock
            const maxParallelepiped = findMaxParallelepipedFrom(currentBlock);

            if (maxParallelepiped && 
                maxParallelepiped.size.width >= minSize &&
                maxParallelepiped.size.height >= minSize &&
                maxParallelepiped.size.depth >= minSize) {
                
                console.log(`✅ Найден параллелепипед ${maxParallelepiped.size.width}x${maxParallelepiped.size.height}x${maxParallelepiped.size.depth} от (${currentBlock.x},${currentBlock.y},${currentBlock.z})`);

                // Добавить все блоки параллелепипеда к уничтожению
                for (const block of maxParallelepiped.blocks) {
                    blocksToDestroy.add(`${block.x},${block.y},${block.z}`);
                }

                // Добавить соседние блоки в очередь поиска
                const neighbors = getNeighbors(maxParallelepiped.blocks);
                for (const neighbor of neighbors) {
                    const neighborKey = `${neighbor.x},${neighbor.y},${neighbor.z}`;
                    if (!processedBlocks.has(neighborKey)) {
                        searchQueue.push(neighbor);
                    }
                }
            }
        }

        if (iterationCount >= MAX_ITERATIONS) {
            console.warn(`⚠️ Достигнут лимит итераций (${MAX_ITERATIONS}), поиск прерван`);
        }

        // Преобразуем найденные блоки обратно в массив и очищаем
        const finalBlocksToDestroy: Block3D[] = Array.from(blocksToDestroy).map(key => {
            const [x, y, z] = key.split(',').map(Number);
            return { x, y, z };
        });

        console.log(`🎯 Итеративный поиск завершен: найдено ${finalBlocksToDestroy.length} блоков для уничтожения`);

        if (finalBlocksToDestroy.length > 0) {
            // Выводим состояние стакана перед очисткой
            console.log('📊 СОСТОЯНИЕ СТАКАНА ПЕРЕД ИТЕРАТИВНОЙ ОЧИСТКОЙ:');
            const currentField = gameFieldAtom();
            for (let y = FIELD_HEIGHT - 1; y >= 0; y--) {
                console.log(`Y=${y.toString().padStart(2)}:`,
                    currentField[y].map(row =>
                        row.map(cell => cell ? '█' : '·').join('')
                    ).join(' | ')
                );
            }

            // Очищаем найденные блоки
            gameFieldAtom.clearBlocks(finalBlocksToDestroy);

            // Применяем гравитацию
            gameFieldAtom.applyGravity();

            // Выводим состояние стакана после очистки
            console.log('📊 СОСТОЯНИЕ СТАКАНА ПОСЛЕ ИТЕРАТИВНОЙ ОЧИСТКИ:');
            const fieldAfterClearing = gameFieldAtom();
            for (let y = FIELD_HEIGHT - 1; y >= 0; y--) {
                console.log(`Y=${y.toString().padStart(2)}:`,
                    fieldAfterClearing[y].map(row =>
                        row.map(cell => cell ? '█' : '·').join('')
                    ).join(' | ')
                );
            }
        }

        // ВТОРОЙ ЭТАП: очистка полных плоскостей (после итеративного поиска)
        let totalLinesCleared = 0;
        let safetyCounter = 0;
        const MAX_CLEARS_PER_LEVEL = 20; // Защита от бесконечного цикла

        console.log(`🧹 ВТОРОЙ ЭТАП: проверяем полные плоскости после итеративной очистки`);

        // Проверяем каждый уровень (горизонтальную плоскость) сверху вниз
        for (let y = FIELD_HEIGHT - 1; y >= 0; y--) {
            // Получаем свежее значение поля каждый раз
            const field = gameFieldAtom();

            // Проверяем заполнена ли вся плоскость
            let planeIsFull = true;
            for (let z = 0; z < FIELD_DEPTH && planeIsFull; z++) {
                for (let x = 0; x < FIELD_WIDTH && planeIsFull; x++) {
                    if (field[y][z][x] === null) {
                        planeIsFull = false;
                    }
                }
            }

            if (planeIsFull) {
                // Защита от бесконечного цикла
                safetyCounter++;
                if (safetyCounter > MAX_CLEARS_PER_LEVEL) {
                    console.warn(`⚠️ Прервана очистка на уровне Y=${y} (слишком много итераций)`);
                    break;
                }

                // Очищаем заполненную плоскость
                console.log(`🧹 Очищаем заполненную плоскость на уровне Y=${y} (итерация ${safetyCounter})`);

                // Создаем новое поле с очищенной плоскостью
                const newField = field.map(level => level.map(row => [...row]));
                for (let z = 0; z < FIELD_DEPTH; z++) {
                    for (let x = 0; x < FIELD_WIDTH; x++) {
                        newField[y][z][x] = null;
                    }
                }
                gameFieldAtom.set(newField);

                totalLinesCleared++;

                // Применяем гравитацию для упавших блоков
                gameFieldAtom.applyGravity();

                // Перепроверяем этот же уровень (могли упасть новые блоки)
                y++;
            } else {
                // Уровень не заполнен - сбрасываем счетчик защиты
                safetyCounter = 0;
            }
        }

        // Вычисляем очки
        if (totalLinesCleared > 0 || finalBlocksToDestroy.length > 0) {
            const lineScore = totalLinesCleared * FIELD_WIDTH * FIELD_DEPTH * 100;
            const iterativeBonus = finalBlocksToDestroy.length * 50; // Бонус за итеративную очистку

            scoreAtom.add(lineScore + iterativeBonus);
            console.log(`💰 Итеративная очистка: ${totalLinesCleared} плоскостей, ${finalBlocksToDestroy.length} блоков. Очки: ${lineScore + iterativeBonus}`);
        }
    },

    clearLines: () => {
        let totalLinesCleared = 0;
        let safetyCounter = 0;
        const MAX_CLEARS_PER_LEVEL = 20; // Защита от бесконечного цикла

        // Проверяем каждый уровень (горизонтальную плоскость) сверху вниз
        for (let y = FIELD_HEIGHT - 1; y >= 0; y--) {
            // Получаем свежее значение поля каждый раз
            const field = gameFieldAtom();

            // Проверяем заполнена ли вся плоскость
            let planeIsFull = true;
            for (let z = 0; z < FIELD_DEPTH && planeIsFull; z++) {
                for (let x = 0; x < FIELD_WIDTH && planeIsFull; x++) {
                    if (field[y][z][x] === null) {
                        planeIsFull = false;
                    }
                }
            }

            if (planeIsFull) {
                // Защита от бесконечного цикла
                safetyCounter++;
                if (safetyCounter > MAX_CLEARS_PER_LEVEL) {
                    console.warn(`⚠️ Прервана очистка на уровне Y=${y} (слишком много итераций)`);
                    break;
                }

                // Очищаем заполненную плоскость
                console.log(`🧹 Очищаем заполненную плоскость на уровне Y=${y} (итерация ${safetyCounter})`);

                // Логируем блоки плоскости
                const planeBlocks: Block3D[] = [];
                for (let z = 0; z < FIELD_DEPTH; z++) {
                    for (let x = 0; x < FIELD_WIDTH; x++) {
                        planeBlocks.push({ x, y, z });
                    }
                }
                console.log(`📍 Блоки плоскости Y=${y}:`, planeBlocks.map(b => `(${b.x},${b.y},${b.z})`).join(', '));

                // Создаем новое поле с очищенной плоскостью
                const newField = field.map(level => level.map(row => [...row]));
                for (let z = 0; z < FIELD_DEPTH; z++) {
                    for (let x = 0; x < FIELD_WIDTH; x++) {
                        newField[y][z][x] = null;
                    }
                }
                gameFieldAtom.set(newField);

                totalLinesCleared++;

                // Применяем гравитацию для упавших блоков
                gameFieldAtom.applyGravity();

                // Перепроверяем этот же уровень (могли упасть новые блоки)
                y++;
            } else {
                // Уровень не заполнен - сбрасываем счетчик защиты
                safetyCounter = 0;
            }
        }

        // Дополнительно: очистка 3D кубических массивов
        const cubeArrays = cubeArraysAtom();
        let totalBlocksCleared = totalLinesCleared * FIELD_WIDTH * FIELD_DEPTH;

        // Выводим полное состояние стакана перед очисткой кубов
        if (cubeArrays.length > 0) {
            console.log('📊 СОСТОЯНИЕ СТАКАНА ПЕРЕД ОЧИСТКОЙ КУБОВ:');
            const currentField = gameFieldAtom();
            for (let y = FIELD_HEIGHT - 1; y >= 0; y--) {
                console.log(`Y=${y.toString().padStart(2)}:`,
                    currentField[y].map(row =>
                        row.map(cell => cell ? '█' : '·').join('')
                    ).join(' | ')
                );
            }
        }

        // Clear cube arrays
        for (let i = 0; i < cubeArrays.length; i++) {
            const cubeArray = cubeArrays[i];
            console.log(`\n🧊 КУБ #${i + 1}:`);
            console.log(`   Размер: ${cubeArray.size.width}x${cubeArray.size.height}x${cubeArray.size.depth} (${cubeArray.blocks.length} блоков)`);

            // Проверяем соответствие требованиям сложности
            const minSize = difficultyLevelAtom();
            const valid = cubeArray.size.width >= minSize && cubeArray.size.height >= minSize && cubeArray.size.depth >= minSize;
            console.log(`   Требования ${minSize}x${minSize}x${minSize}: ${valid ? '✅ ДА' : '❌ НЕТ'}`);

            // Выводим координаты в структурированном виде
            const minX = Math.min(...cubeArray.blocks.map(b => b.x));
            const maxX = Math.max(...cubeArray.blocks.map(b => b.x));
            const minY = Math.min(...cubeArray.blocks.map(b => b.y));
            const maxY = Math.max(...cubeArray.blocks.map(b => b.y));
            const minZ = Math.min(...cubeArray.blocks.map(b => b.z));
            const maxZ = Math.max(...cubeArray.blocks.map(b => b.z));

            console.log(`   Область: X(${minX}-${maxX}) Y(${minY}-${maxY}) Z(${minZ}-${maxZ})`);
            console.log(`   Блоки: [${cubeArray.blocks.map(b => `(${b.x},${b.y},${b.z})`).join(', ')}]`);

            gameFieldAtom.clearBlocks(cubeArray.blocks);
            totalBlocksCleared += cubeArray.blocks.length;
        }

        if (cubeArrays.length > 0) {
            // Apply gravity after clearing cube arrays
            gameFieldAtom.applyGravity();

            // Выводим состояние стакана после очистки
            console.log('\n📊 СОСТОЯНИЕ СТАКАНА ПОСЛЕ ОЧИСТКИ И ГРАВИТАЦИИ:');
            const fieldAfterClearing = gameFieldAtom();
            for (let y = FIELD_HEIGHT - 1; y >= 0; y--) {
                console.log(`Y=${y.toString().padStart(2)}:`,
                    fieldAfterClearing[y].map(row =>
                        row.map(cell => cell ? '█' : '·').join('')
                    ).join(' | ')
                );
            }
        }

        if (totalLinesCleared > 0 || cubeArrays.length > 0) {
            // Calculate score
            const lineScore = totalLinesCleared * FIELD_WIDTH * FIELD_DEPTH * 100; // Очки за плоскости
            const cubeBonus = cubeArrays.reduce((sum, array) => {
                const volume = array.size.width * array.size.height * array.size.depth;
                return sum + (volume * volume * 10); // Quadratic bonus for larger arrays
            }, 0);

            scoreAtom.add(lineScore + cubeBonus);
            console.log(`💰 Очищено: ${totalLinesCleared} плоскостей, ${cubeArrays.length} кубов. Очки: ${lineScore + cubeBonus}`);
        }
    },

    // Тестовые фигуры для проверки очистки
    spawnTestPlane: () => {
        console.log('🧪 Спавн тестового куба 5x5x5 с дыркой в центре');
        currentPieceAtom.spawn('TEST_PLANE');
    },

    spawnTestCube: () => {
        console.log('🧪 Спавн тестового куба 2x2x2');
        currentPieceAtom.spawn('TEST_CUBE');
    },

    spawnTestI: () => {
        console.log('🧪 Спавн обычной фигуры I для заполнения дырки');
        currentPieceAtom.spawn('I');
    }
};

// Автоматическое падение и lock delay перенесены в models/lock-delay-indicator.ts
