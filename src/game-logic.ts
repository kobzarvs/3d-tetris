import { atom, computed, effect } from '@reatom/core';
import { 
    GameState,
    FIELD_WIDTH, 
    FIELD_DEPTH, 
    FIELD_HEIGHT, 
    DROP_INTERVAL, 
    LOCK_DELAY_TIME, 
    MIN_3D_ARRAY_SIZE 
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

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

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
    ]
};

export const tetrominoColors: Record<PieceType, number> = {
    I: 0x00ffff, T: 0xff00ff, L: 0xff8c00, J: 0x4169e1,
    S: 0x32cd32, Z: 0xff4500, O: 0xffff00
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

export const coloredModeAtom = atom(true).actions((target) => ({
    toggle: () => target.set(prev => !prev),
    update: (value: boolean) => target.set(value)
}));

export const difficultyLevelAtom = atom(3).actions((target) => ({
    setLevel: (level: 2 | 3 | 4 | 5) => target.set(level)
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
        position: { x: 5, y: FIELD_HEIGHT - 2, z: 5 }
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

function getRandomPiece(): PieceType {
    const pieces: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    return pieces[Math.floor(Math.random() * pieces.length)];
}

// Rotation functions
function rotateAroundY(blocks: Block3D[]): Block3D[] {
    return blocks.map(block => ({ x: block.z, y: block.y, z: -block.x }));
}

function rotateAroundX(blocks: Block3D[]): Block3D[] {
    return blocks.map(block => ({ x: block.x, y: -block.z, z: block.y }));
}

function rotateAroundZ(blocks: Block3D[]): Block3D[] {
    return blocks.map(block => ({ x: -block.y, y: block.x, z: block.z }));
}

function rotateInViewPlane(blocks: Block3D[]): Block3D[] {
    return rotateAroundY(blocks);
}

function rotateVertical(blocks: Block3D[], fieldRotation: number): Block3D[] {
    const rotationSteps = Math.round(fieldRotation / 90) % 4;
    switch (rotationSteps) {
        case 0: return rotateAroundZ(blocks);
        case 1: return rotateAroundX(blocks);
        case 2: return rotateAroundZ(blocks);
        case 3: return rotateAroundX(blocks);
        default: return blocks;
    }
}

function rotateSide(blocks: Block3D[], fieldRotation: number): Block3D[] {
    const rotationSteps = Math.round(fieldRotation / 90) % 4;
    switch (rotationSteps) {
        case 0: return rotateAroundX(blocks);
        case 1: return rotateAroundZ(blocks);
        case 2: return rotateAroundX(blocks);
        case 3: return rotateAroundZ(blocks);
        default: return blocks;
    }
}

// 3D cube array detection
function find3DCubeArrays(field: (PieceType | null)[][][]): CubeArray3D[] {
    const cubeArrays: CubeArray3D[] = [];
    const visited = Array(FIELD_HEIGHT).fill(null).map(() =>
        Array(FIELD_DEPTH).fill(null).map(() =>
            Array(FIELD_WIDTH).fill(false)
        )
    );

    for (let y = 0; y < FIELD_HEIGHT; y++) {
        for (let z = 0; z < FIELD_DEPTH; z++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                if (field[y][z][x] !== null && !visited[y][z][x]) {
                    const cubeArray = findLargestCubeArray(field, x, y, z, visited);
                    if (cubeArray && cubeArray.size.width >= MIN_3D_ARRAY_SIZE &&
                        cubeArray.size.height >= MIN_3D_ARRAY_SIZE &&
                        cubeArray.size.depth >= MIN_3D_ARRAY_SIZE) {
                        cubeArrays.push(cubeArray);
                    }
                }
            }
        }
    }

    return cubeArrays;
}

function findLargestCubeArray(
    field: (PieceType | null)[][][],
    startX: number,
    startY: number,
    startZ: number,
    visited: boolean[][][]
): CubeArray3D | null {
    let maxSize = 1;
    let bestCubeArray: CubeArray3D | null = null;

    for (let width = 1; width <= FIELD_WIDTH - startX; width++) {
        for (let height = 1; height <= FIELD_HEIGHT - startY; height++) {
            for (let depth = 1; depth <= FIELD_DEPTH - startZ; depth++) {
                if (isCubeArrayComplete(field, startX, startY, startZ, width, height, depth)) {
                    const size = width * height * depth;
                    if (size > maxSize) {
                        maxSize = size;
                        const blocks: Block3D[] = [];
                        for (let y = startY; y < startY + height; y++) {
                            for (let z = startZ; z < startZ + depth; z++) {
                                for (let x = startX; x < startX + width; x++) {
                                    blocks.push({ x, y, z });
                                }
                            }
                        }
                        bestCubeArray = {
                            blocks,
                            size: { width, height, depth }
                        };
                    }
                }
            }
        }
    }

    if (bestCubeArray) {
        for (const block of bestCubeArray.blocks) {
            visited[block.y][block.z][block.x] = true;
        }
    }

    return bestCubeArray;
}

function isCubeArrayComplete(
    field: (PieceType | null)[][][],
    startX: number,
    startY: number,
    startZ: number,
    width: number,
    height: number,
    depth: number
): boolean {
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
            position: { x: 5, y: FIELD_HEIGHT - 2, z: 5 }
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
        const fieldRotation = fieldRotationAtom();
        
        if (!piece) return false;
        
        let rotatedBlocks: Block3D[];
        
        switch (rotationType) {
            case 'view':
                rotatedBlocks = rotateInViewPlane(piece.blocks);
                break;
            case 'vertical':
                rotatedBlocks = rotateVertical(piece.blocks, fieldRotation);
                break;
            case 'side':
                rotatedBlocks = rotateSide(piece.blocks, fieldRotation);
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
        
        gameFieldAtom.placePiece(piece);
        
        // Add placement score
        scoreAtom.add(10);
        
        // Check for 3D cube arrays to clear
        gameActions.clearLines();
        
        // Spawn new piece
        gameActions.spawnNewPiece();
    },

    clearLines: () => {
        const cubeArrays = cubeArraysAtom();
        
        if (cubeArrays.length === 0) return;
        
        let totalBlocksCleared = 0;
        
        // Clear cube arrays
        for (const cubeArray of cubeArrays) {
            gameFieldAtom.clearBlocks(cubeArray.blocks);
            totalBlocksCleared += cubeArray.blocks.length;
        }
        
        // Apply gravity
        gameFieldAtom.applyGravity();
        
        // Calculate score based on cleared blocks and cube array sizes
        const baseScore = totalBlocksCleared * 100;
        const bonusScore = cubeArrays.reduce((sum, array) => {
            const volume = array.size.width * array.size.height * array.size.depth;
            return sum + (volume * volume * 10); // Quadratic bonus for larger arrays
        }, 0);
        
        scoreAtom.add(baseScore + bonusScore);
    }
};

// Auto-drop effect
effect(() => {
    if (!isPlayingAtom()) return;
    
    const piece = currentPieceAtom();
    const timers = timersAtom();
    const currentTime = Date.now();
    
    // Auto drop
    if (piece && currentTime - timers.lastDropTime >= timers.dropInterval) {
        const moved = gameActions.movePiece(0, -1, 0);
        
        if (!moved) {
            // Start lock delay if not already active
            if (!timers.lockDelayActive) {
                timersAtom.startLockDelay();
            } else if (currentTime - timers.lockDelay >= LOCK_DELAY_TIME) {
                // Lock delay expired, place piece
                gameActions.placePiece();
            }
        } else {
            timersAtom.updateDropTime();
        }
    }
});