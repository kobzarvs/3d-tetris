import './style.css'
import * as THREE from 'three';
import { effect } from '@reatom/core';
import { 
    gameStateAtom, 
    scoreAtom, 
    fieldRotationAtom, 
    coloredModeAtom,
    difficultyLevelAtom,
    nextPieceAtom,
    tetrominoShapes,
    tetrominoColors,
    gameActions
} from './game-logic';
import {
    GameState,
    FIELD_WIDTH,
    FIELD_DEPTH,
    FIELD_HEIGHT,
    BLOCK_SIZE,
    FIELD_ROTATION_DURATION,
    PIECE_ANIMATION_DURATION,
    LANDED_BLOCKS_OPACITY,
    LOCK_DELAY_TIME,
    MIN_3D_ARRAY_SIZE,
    LEVEL_CLEAR_ANIMATION_DURATION,
    DYNAMIC_CAMERA_DISTANCE,
    DYNAMIC_CAMERA_MIN_DISTANCE,
    DYNAMIC_CAMERA_SMOOTH,
    FIELD_TOP_Y,
    FIELD_BOTTOM_Y,
    FROZEN_FIGURE_COLOR,
    MINIMAP_SIZE,
    CAMERA_START_Z,
    CAMERA_START_Y,
    NEXT_PIECE_SCALE,
    NEXT_PIECE_POSITION
} from './constants';
import type { GameStateType } from './constants';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('scene-canvas') as HTMLCanvasElement,
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);

// Создаем туманный градиентный фон в темно-синих тонах
const canvas = document.createElement('canvas');
canvas.width = 256;
canvas.height = 256;
const context = canvas.getContext('2d')!;
const gradient = context.createLinearGradient(0, 0, 0, 256);
gradient.addColorStop(0, '#0f1419');
gradient.addColorStop(0.3, '#0a0f1a');
gradient.addColorStop(0.7, '#050a15');
gradient.addColorStop(1, '#020408');
context.fillStyle = gradient;
context.fillRect(0, 0, 256, 256);

const backgroundTexture = new THREE.CanvasTexture(canvas);
// Фон будет устанавливаться динамически в зависимости от состояния игры
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.sortObjects = true;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(5, 15, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.left = -12;
directionalLight.shadow.camera.right = 12;
directionalLight.shadow.camera.top = 12;
directionalLight.shadow.camera.bottom = -12;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.bias = -0.0005;
scene.add(directionalLight);
const pointLight1 = new THREE.PointLight(0x00ffff, 1.5, 100);
pointLight1.position.set(10, 10, 10);
pointLight1.castShadow = false;
scene.add(pointLight1);
const pointLight2 = new THREE.PointLight(0xff00ff, 1.5, 100);
pointLight2.position.set(-10, -10, 10);
pointLight2.castShadow = false;
scene.add(pointLight2);

// Shared geometries for memory optimization
const sharedBlockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const sharedEdgesGeometry = new THREE.EdgesGeometry(sharedBlockGeometry);

// Простая миникарта с ортогональной камерой над реальным стаканом
let minimapRenderer: THREE.WebGLRenderer;
let minimapCamera: THREE.OrthographicCamera;
let minimapCanvas: HTMLCanvasElement;

// Next piece preview renderer
let nextPieceRenderer: THREE.WebGLRenderer;
let nextPieceCamera: THREE.PerspectiveCamera;
let nextPieceScene: THREE.Scene;

// Material pools for memory optimization
const materialPools = {
    blocks: new Map<number, THREE.MeshPhongMaterial>(),
    edges: new THREE.LineBasicMaterial({ color: 0x000000 }),
    projection: new THREE.MeshBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    }),
    projectionWhite: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    }),
    projectionRed: new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    })
};

// Shared geometries for projections
const sharedPlaneGeometry = new THREE.PlaneGeometry(BLOCK_SIZE, BLOCK_SIZE);

// Function to get or create block material
function getBlockMaterial(color: number): THREE.MeshPhongMaterial {
    if (!materialPools.blocks.has(color)) {
        materialPools.blocks.set(color, new THREE.MeshPhongMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: LANDED_BLOCKS_OPACITY
        }));
    }
    return materialPools.blocks.get(color)!;
}

// Function to properly dispose Three.js objects
function disposeObject3D(obj: THREE.Object3D) {
    obj.traverse((child) => {
        if ((child as any).isMesh || (child as any).isLineSegments) {
            const meshOrLine = child as any;
            // Only dispose non-shared geometries
            if (meshOrLine.geometry &&
                meshOrLine.geometry !== sharedBlockGeometry &&
                meshOrLine.geometry !== sharedEdgesGeometry &&
                meshOrLine.geometry !== sharedPlaneGeometry) {
                meshOrLine.geometry.dispose();
            }
            // Only dispose non-pooled materials
            if (meshOrLine.material &&
                meshOrLine.material !== materialPools.edges &&
                meshOrLine.material !== materialPools.projection &&
                meshOrLine.material !== materialPools.projectionWhite &&
                meshOrLine.material !== materialPools.projectionRed &&
                !materialPools.blocks.has((meshOrLine.material as any).color?.getHex?.())) {
                if (Array.isArray(meshOrLine.material)) {
                    meshOrLine.material.forEach((mat: any) => {
                        if (mat !== materialPools.edges &&
                            mat !== materialPools.projection &&
                            mat !== materialPools.projectionWhite &&
                            mat !== materialPools.projectionRed) mat.dispose();
                    });
                } else {
                    meshOrLine.material.dispose();
                }
            }
        }
    });
}

// Simple 3D coordinate structure
interface Block3D {
    x: number;
    y: number;
    z: number;
}

// 3D массив для уничтожения
interface CubeArray3D {
    blocks: Block3D[];
    size: { width: number; height: number; depth: number };
    minCorner: Block3D;
    maxCorner: Block3D;
}

// Используем tetrominoShapes и tetrominoColors из game-logic.ts

// Функция для генерации случайной фигуры
function getRandomPiece(): keyof typeof tetrominoShapes {
    const shapes = Object.keys(tetrominoShapes) as (keyof typeof tetrominoShapes)[];
    return shapes[Math.floor(Math.random() * shapes.length)];
}

// Game data
let gameField: (string | null)[][][] = [];
let currentPieceType: keyof typeof tetrominoShapes | null = null;
let currentPieceBlocks: Block3D[] = [];
let currentPiecePosition = { x: 5, y: 18, z: 5 };

// Анимация движения фигур
let isAnimating = false;
let animationStartTime = 0;
let animationStartPosition = { x: 0, y: 0, z: 0 };
let animationTargetPosition = { x: 0, y: 0, z: 0 };

// Lock delay механика
let lockDelayActive = false;
let lockDelayTimeoutId: number | null = null;
let lockDelayResets = 0;
const MAX_LOCK_DELAY_RESETS = 15; // Максимальное количество сбросов lock delay

// Стандартный таймер падения
let dropTimerActive = false;
let dropTimerExpired = false;
let lastDropTime = Date.now();
const dropInterval = 1000; // Интервал стандартного падения

// Анимация очистки уровней
let isLevelClearAnimating = false;
let levelClearQueue: number[] = []; // Очередь уровней для анимированного удаления
let currentClearLevel = -1;

// Камера
type CameraMode = 'front' | 'top';
let cameraMode: CameraMode = 'front';
let dynamicCameraTarget = new THREE.Vector3(0, 0, 0);
let dynamicCameraPosition = new THREE.Vector3(1, 0, 36);

// Controls help visibility
let controlsHelpVisible = false;

// Visuals
let pieceVisuals: THREE.Group | null = null;
let frontWallMesh: THREE.Mesh | null, backWallMesh: THREE.Mesh | null, leftWallMesh: THREE.Mesh | null, rightWallMesh: THREE.Mesh | null;
let bottomGridGroup: THREE.Group | null, leftWallGridGroup: THREE.Group | null, rightWallGridGroup: THREE.Group | null, backWallGridGroup: THREE.Group | null, frontWallGridGroup: THREE.Group | null;
let bottomProjectionGroup: THREE.Group | null, leftProjectionGroup: THREE.Group | null, rightProjectionGroup: THREE.Group | null, backProjectionGroup: THREE.Group | null;
let obstacleHighlightsGroup: THREE.Group | null = null;
let axesHelper: THREE.AxesHelper | null = null;
let projectionsVisible = true;

// Scene graph containers
const rotationContainer = new THREE.Group();
const fieldContainer = new THREE.Group();
const gameContainer = new THREE.Group();
const landedBlocksContainer = new THREE.Group();
const menuContainer = new THREE.Group();
const nextPieceContainer = new THREE.Group();

rotationContainer.rotation.y = 0; // Без базового поворота - чистая 3D перспектива
rotationContainer.add(fieldContainer, gameContainer);
gameContainer.add(landedBlocksContainer);
nextPieceContainer.position.set(NEXT_PIECE_POSITION.x, NEXT_PIECE_POSITION.y, NEXT_PIECE_POSITION.z);
nextPieceContainer.scale.setScalar(NEXT_PIECE_SCALE);
scene.add(rotationContainer, menuContainer, nextPieceContainer);

// Menu animation
interface AnimatedPiece extends THREE.Group {
    fallSpeed: number;
    rotationSpeed: { x: number; y: number; z: number; };
}
const fallingPieces: AnimatedPiece[] = [];

// Functions
function initializeGameField() {
    gameField = Array(FIELD_HEIGHT).fill(null).map(() => Array(FIELD_DEPTH).fill(null).map(() => Array(FIELD_WIDTH).fill(null)));
}

function resetGameState() {
    console.log("🔄 Resetting game state...");
    initializeGameField();
    const oldScore = scoreAtom();
    scoreAtom.reset();
    const newScore = scoreAtom();
    console.log(`💰 Score reset: ${oldScore} → ${newScore}`);
    fieldRotationAtom.reset();

    // Синхронизируем миникарту с сбросом поля
    if (minimapCamera) {
        minimapCamera.rotation.z = 0; // Без базового поворота - чистая ортогональная проекция
    }

    while (landedBlocksContainer.children.length > 0) {
        const child = landedBlocksContainer.children[0];
        disposeObject3D(child);
        landedBlocksContainer.remove(child);
    }
    if (pieceVisuals) {
        disposeObject3D(pieceVisuals);
        gameContainer.remove(pieceVisuals);
    }
    if (obstacleHighlightsGroup) {
        disposeObject3D(obstacleHighlightsGroup);
        gameContainer.remove(obstacleHighlightsGroup);
    }
    pieceVisuals = null;
    obstacleHighlightsGroup = null;
    currentPieceType = null;

    rotationContainer.rotation.y = 0;

    createFieldBoundaries();
    createWallGrids();
}

// Базовые функции вращения вокруг осей
function rotateAroundY(b: Block3D[]) { return b.map(bl => ({ x: bl.z, y: bl.y, z: -bl.x })); }
function rotateAroundX(b: Block3D[]) { return b.map(bl => ({ x: bl.x, y: -bl.z, z: bl.y })); }
function rotateAroundZ(b: Block3D[]) { return b.map(bl => ({ x: -bl.y, y: bl.x, z: bl.z })); }

// Адаптивные функции вращения относительно текущего поворота поля
function rotateInViewPlane(blocks: Block3D[]): Block3D[] {
    // Вращение в плоскости экрана (против часовой стрелки при взгляде на игрока)
    // Всегда вращение вокруг оси Y, так как камера всегда смотрит сверху

    return rotateAroundY(blocks);
}

function rotateVertical(blocks: Block3D[]): Block3D[] {
    // Вращение в вертикальной плоскости относительно камеры (Q)
    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;
    switch (rotationSteps) {
        case 0: return rotateAroundZ(blocks);  // 0° - передняя стена видна, вращаем в плоскости XY
        case 1: return rotateAroundX(blocks);  // 90° - правая стена видна, вращаем в плоскости YZ
        case 2: return rotateAroundZ(blocks);  // 180° - задняя стена видна, вращаем в плоскости XY
        case 3: return rotateAroundX(blocks);  // 270° - левая стена видна, вращаем в плоскости YZ
        default: return blocks;
    }
}

function rotateSide(blocks: Block3D[]): Block3D[] {
    // Вращение в боковой плоскости относительно камеры (E)
    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;
    switch (rotationSteps) {
        case 0: return rotateAroundX(blocks);  // 0° - боковое вращение в плоскости YZ
        case 1: return rotateAroundZ(blocks);  // 90° - боковое вращение в плоскости XY
        case 2: return rotateAroundX(blocks);  // 180° - боковое вращение в плоскости YZ
        case 3: return rotateAroundZ(blocks);  // 270° - боковое вращение в плоскости XY
        default: return blocks;
    }
}

function canPlacePiece(blocks: Block3D[], position: Block3D): boolean {
    return blocks.every(block => {
        const x = Math.round(position.x + block.x);
        const y = Math.round(position.y + block.y);
        const z = Math.round(position.z + block.z);
        return x >= 0 && x < FIELD_WIDTH && y >= 0 && y < FIELD_HEIGHT && z >= 0 && z < FIELD_DEPTH && gameField[y][z][x] === null;
    });
}

// Функции для управления lock delay
function startLockDelay() {
    if (lockDelayActive) return; // Уже активен

    lockDelayActive = true;

    // Устанавливаем таймер для автоматического размещения фигуры
    if (lockDelayTimeoutId) {
        clearTimeout(lockDelayTimeoutId);
    }
    lockDelayTimeoutId = setTimeout(() => {
        if (lockDelayActive) {
            placePiece();
        }
    }, LOCK_DELAY_TIME);
}

function cancelLockDelay() {
    if (!lockDelayActive) return;

    // Увеличиваем счетчик сбросов
    lockDelayResets++;

    // Если превышен лимит сбросов, немедленно размещаем фигуру
    if (lockDelayResets >= MAX_LOCK_DELAY_RESETS) {
        lockDelayActive = false;
        if (lockDelayTimeoutId) {
            clearTimeout(lockDelayTimeoutId);
            lockDelayTimeoutId = null;
        }
        placePiece();
        return;
    }

    lockDelayActive = false;
    if (lockDelayTimeoutId) {
        clearTimeout(lockDelayTimeoutId);
        lockDelayTimeoutId = null;
    }
}


function resetLockDelayState() {
    lockDelayActive = false;
    lockDelayResets = 0;
    if (lockDelayTimeoutId) {
        clearTimeout(lockDelayTimeoutId);
        lockDelayTimeoutId = null;
    }
}

// Функции для управления стандартным таймером падения
function startDropTimer() {
    dropTimerActive = true;
    dropTimerExpired = false;
    lastDropTime = Date.now();
}

function checkDropTimer(): boolean {
    if (!dropTimerActive) return false;

    const elapsed = Date.now() - lastDropTime;
    if (elapsed >= dropInterval) {
        dropTimerExpired = true;
        return true;
    }
    return false;
}

function resetDropTimer() {
    dropTimerActive = false;
    dropTimerExpired = false;
}

function isOnGround(): boolean {
    return !canPlacePiece(currentPieceBlocks, { ...currentPiecePosition, y: currentPiecePosition.y - 1 });
}

// Функции для поиска и уничтожения 3D массивов кубиков
function find3DCubeArrays(): CubeArray3D[] {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 Поиск максимальных 3D параллелепипедов (минимум ' + MIN_3D_ARRAY_SIZE + 'x' + MIN_3D_ARRAY_SIZE + 'x' + MIN_3D_ARRAY_SIZE + ')');
    console.log('═══════════════════════════════════════════════════════════');

    const visited = Array(FIELD_HEIGHT).fill(null).map(() =>
        Array(FIELD_DEPTH).fill(null).map(() =>
            Array(FIELD_WIDTH).fill(false)
        )
    );

    const allFoundParallelepipeds: CubeArray3D[] = [];

    // Проходим по всем блокам поля
    for (let y = 0; y < FIELD_HEIGHT; y++) {
        for (let z = 0; z < FIELD_DEPTH; z++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                // Если блок заполнен и еще не посещен
                if (gameField[y][z][x] !== null && !visited[y][z][x]) {
                    // Проверяем, может ли от этого блока образоваться минимальный куб
                    if (canFormMinimalCube(x, y, z)) {
                        console.log(`🔍 Проверяем блок (${x},${y},${z}) - может образовать минимальный куб`);

                        // Ищем максимальный параллелепипед от этой точки
                        const maxParallelepiped = findMaxParallelepipedFrom(x, y, z, visited);

                        if (maxParallelepiped) {
                            console.log(`📦 Найден параллелепипед ${maxParallelepiped.size.width}x${maxParallelepiped.size.height}x${maxParallelepiped.size.depth} (${maxParallelepiped.blocks.length} блоков)`);
                            console.log(`   Позиция: от (${maxParallelepiped.minCorner.x},${maxParallelepiped.minCorner.y},${maxParallelepiped.minCorner.z}) до (${maxParallelepiped.maxCorner.x},${maxParallelepiped.maxCorner.y},${maxParallelepiped.maxCorner.z})`);

                            allFoundParallelepipeds.push(maxParallelepiped);

                            // Отмечаем все блоки этого параллелепипеда как посещенные
                            for (const block of maxParallelepiped.blocks) {
                                visited[block.y][block.z][block.x] = true;
                            }
                        }
                    } else {
                        // Отмечаем блок как посещенный, чтобы не проверять его снова
                        visited[y][z][x] = true;
                    }
                }
            }
        }
    }

    // Выбираем самый большой параллелепипед
    let largestParallelepiped: CubeArray3D | null = null;
    let maxVolume = 0;

    for (const parallelepiped of allFoundParallelepipeds) {
        const volume = parallelepiped.size.width * parallelepiped.size.height * parallelepiped.size.depth;
        if (volume > maxVolume) {
            maxVolume = volume;
            largestParallelepiped = parallelepiped;
        }
    }

    const result = largestParallelepiped ? [largestParallelepiped] : [];

    console.log(`\n📊 Найдено параллелепипедов: ${allFoundParallelepipeds.length}, выбран максимальный: ${result.length}`);
    if (largestParallelepiped) {
        console.log(`🏆 Максимальный: ${largestParallelepiped.size.width}x${largestParallelepiped.size.height}x${largestParallelepiped.size.depth} (объем: ${maxVolume})`);
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    return result;
}

// Проверяет, может ли от данного блока образоваться минимальный куб 2x2x2
function canFormMinimalCube(x: number, y: number, z: number): boolean {
    // Всегда проверяем возможность образования 2x2x2 куба для оптимизации поиска
    for (let dy = 0; dy < 2; dy++) {
        for (let dz = 0; dz < 2; dz++) {
            for (let dx = 0; dx < 2; dx++) {
                const checkX = x + dx;
                const checkY = y + dy;
                const checkZ = z + dz;

                // Проверяем границы
                if (checkX >= FIELD_WIDTH || checkY >= FIELD_HEIGHT || checkZ >= FIELD_DEPTH) {
                    return false;
                }

                // Проверяем, что блок заполнен
                if (gameField[checkY][checkZ][checkX] === null) {
                    return false;
                }
            }
        }
    }
    return true;
}

// Находит максимальный параллелепипед, начиная от данного блока
function findMaxParallelepipedFrom(startX: number, startY: number, startZ: number, _visited: boolean[][][]): CubeArray3D | null {
    console.log(`   🔍 Ищем максимальный параллелепипед от (${startX},${startY},${startZ})`);

    let maxVolume = 0;
    let bestParallelepiped: CubeArray3D | null = null;

    // Пробуем все возможные размеры параллелепипеда
    for (let width = MIN_3D_ARRAY_SIZE; width <= FIELD_WIDTH - startX; width++) {
        for (let height = MIN_3D_ARRAY_SIZE; height <= FIELD_HEIGHT - startY; height++) {
            for (let depth = MIN_3D_ARRAY_SIZE; depth <= FIELD_DEPTH - startZ; depth++) {

                // Проверяем, можно ли построить параллелепипед таких размеров
                if (canBuildParallelepiped(startX, startY, startZ, width, height, depth)) {
                    const volume = width * height * depth;
                    console.log(`     ✅ Возможен параллелепипед ${width}x${height}x${depth} (объем: ${volume})`);

                    if (volume > maxVolume) {
                        maxVolume = volume;

                        // Создаем список блоков параллелепипеда
                        const blocks: Block3D[] = [];
                        for (let dy = 0; dy < height; dy++) {
                            for (let dz = 0; dz < depth; dz++) {
                                for (let dx = 0; dx < width; dx++) {
                                    blocks.push({ x: startX + dx, y: startY + dy, z: startZ + dz });
                                }
                            }
                        }

                        bestParallelepiped = {
                            blocks,
                            size: { width, height, depth },
                            minCorner: { x: startX, y: startY, z: startZ },
                            maxCorner: { x: startX + width - 1, y: startY + height - 1, z: startZ + depth - 1 }
                        };
                    }
                } else {
                    // Если не можем построить параллелепипед данной ширины,
                    // то большей ширины тоже не сможем
                    break;
                }
            }
        }
    }

    if (bestParallelepiped) {
        console.log(`   🏆 Максимальный параллелепипед: ${bestParallelepiped.size.width}x${bestParallelepiped.size.height}x${bestParallelepiped.size.depth} (объем: ${maxVolume})`);
    } else {
        console.log(`   ❌ Не найдено подходящих параллелепипедов от (${startX},${startY},${startZ})`);
    }

    return bestParallelepiped;
}

// Проверяет, можно ли построить параллелепипед заданных размеров от данной точки
function canBuildParallelepiped(startX: number, startY: number, startZ: number, width: number, height: number, depth: number): boolean {
    for (let dy = 0; dy < height; dy++) {
        for (let dz = 0; dz < depth; dz++) {
            for (let dx = 0; dx < width; dx++) {
                const checkX = startX + dx;
                const checkY = startY + dy;
                const checkZ = startZ + dz;

                // Проверяем границы
                if (checkX >= FIELD_WIDTH || checkY >= FIELD_HEIGHT || checkZ >= FIELD_DEPTH) {
                    return false;
                }

                // Проверяем, что блок заполнен
                if (gameField[checkY][checkZ][checkX] === null) {
                    return false;
                }
            }
        }
    }
    return true;
}


function clear3DCubeArrays(cubeArrays: CubeArray3D[]): number {
    let totalBlocksCleared = 0;

    // Очищаем каждый найденный массив
    for (const cubeArray of cubeArrays) {
        for (const block of cubeArray.blocks) {
            gameField[block.y][block.z][block.x] = null;
            totalBlocksCleared++;
        }
        console.log(`🧊 Cleared 3D array: ${cubeArray.size.width}x${cubeArray.size.height}x${cubeArray.size.depth} (${cubeArray.blocks.length} blocks)`);
    }

    // Применяем гравитацию после удаления массивов
    if (totalBlocksCleared > 0) {
        applyGravity();
    }

    return totalBlocksCleared;
}

function applyGravity() {
    // Проходим по каждой колонке (x, z) и опускаем блоки вниз
    for (let x = 0; x < FIELD_WIDTH; x++) {
        for (let z = 0; z < FIELD_DEPTH; z++) {
            // Собираем все непустые блоки в колонке
            const blocks: (string | null)[] = [];
            for (let y = 0; y < FIELD_HEIGHT; y++) {
                if (gameField[y][z][x] !== null) {
                    blocks.push(gameField[y][z][x]);
                }
            }

            // Очищаем колонку
            for (let y = 0; y < FIELD_HEIGHT; y++) {
                gameField[y][z][x] = null;
            }

            // Размещаем блоки снизу вверх
            for (let i = 0; i < blocks.length; i++) {
                gameField[i][z][x] = blocks[i];
            }
        }
    }
}


function spawnNewPiece() {
    // Сбрасываем состояние таймеров и счетчики
    resetLockDelayState();
    resetDropTimer();

    // Получаем тип следующей фигуры из nextPieceAtom
    let pieceType = nextPieceAtom();
    
    // Если nextPiece еще не установлен (первый запуск), генерируем случайную фигуру
    if (!pieceType) {
        pieceType = getRandomPiece();
    }
    
    // Устанавливаем новую следующую фигуру
    nextPieceAtom.update(getRandomPiece());

    currentPieceType = pieceType;
    currentPieceBlocks = [...tetrominoShapes[currentPieceType]];
    currentPiecePosition = { x: 5, y: FIELD_HEIGHT - 2, z: 5 };

    if (!canPlacePiece(currentPieceBlocks, currentPiecePosition)) {
        gameStateAtom.setGameOver();
        return;
    }

    console.log(`🔮 Spawned piece: ${currentPieceType}, Next piece: ${nextPieceAtom()}`);

    // Запускаем стандартный таймер падения для новой фигуры
    startDropTimer();
    updateVisuals();
}


function updateVisuals() {
    if (pieceVisuals) {
        disposeObject3D(pieceVisuals);
        gameContainer.remove(pieceVisuals);
    }

    if (currentPieceType) {
        // ИСПРАВЛЕНО: используем текущую позицию без дублирования логики анимации
        const renderPosition = currentPiecePosition;

        pieceVisuals = new THREE.Group();
        const color = tetrominoColors[currentPieceType];
        const material = getBlockMaterial(color);

        for (const block of currentPieceBlocks) {
            const cube = new THREE.Mesh(sharedBlockGeometry, material);
            const x = renderPosition.x + block.x;
            const y = renderPosition.y + block.y;
            const z = renderPosition.z + block.z;
            cube.position.set(x - FIELD_WIDTH / 2 + 0.5, y - FIELD_HEIGHT / 2 + 0.5, z - FIELD_DEPTH / 2 + 0.5);
            cube.castShadow = true;
            cube.receiveShadow = true;
            pieceVisuals.add(cube);

            // Добавляем контур граней черным цветом с shared геометрией
            const wireframe = new THREE.LineSegments(sharedEdgesGeometry, materialPools.edges);
            wireframe.position.copy(cube.position);
            pieceVisuals.add(wireframe);
        }
        gameContainer.add(pieceVisuals);
        if (projectionsVisible) updateWallProjections(renderPosition);
        updateMinimap();
    }
}

function createWallGrids() {
    // ИСПРАВЛЕНО: правильная очистка геометрий перед удалением
    if (bottomGridGroup) {
        disposeObject3D(bottomGridGroup);
        fieldContainer.remove(bottomGridGroup);
    }
    if (frontWallGridGroup) {
        disposeObject3D(frontWallGridGroup);
        fieldContainer.remove(frontWallGridGroup);
    }
    if (backWallGridGroup) {
        disposeObject3D(backWallGridGroup);
        fieldContainer.remove(backWallGridGroup);
    }
    if (leftWallGridGroup) {
        disposeObject3D(leftWallGridGroup);
        fieldContainer.remove(leftWallGridGroup);
    }
    if (rightWallGridGroup) {
        disposeObject3D(rightWallGridGroup);
        fieldContainer.remove(rightWallGridGroup);
    }

    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.3 });
    const currentRotation = fieldRotationAtom();
    const rotationSteps = Math.round(currentRotation / 90) % 4;

    bottomGridGroup = new THREE.Group();
    const bottomGeometry = new THREE.BufferGeometry();
    const bottomVertices = [];
    const bottomY = -FIELD_HEIGHT / 2 + 0.005; // Чуть выше дна
    for (let x = 0; x <= FIELD_WIDTH; x++) bottomVertices.push(x - FIELD_WIDTH / 2, bottomY, -FIELD_DEPTH / 2, x - FIELD_WIDTH / 2, bottomY, FIELD_DEPTH / 2);
    for (let z = 0; z <= FIELD_DEPTH; z++) bottomVertices.push(-FIELD_WIDTH / 2, bottomY, z - FIELD_DEPTH / 2, FIELD_WIDTH / 2, bottomY, z - FIELD_DEPTH / 2);
    bottomGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bottomVertices, 3));
    // Черный цвет только для сетки на дне
    const bottomGridMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 });
    const bottomGrid = new THREE.LineSegments(bottomGeometry, bottomGridMaterial);
    bottomGridGroup.add(bottomGrid);
    fieldContainer.add(bottomGridGroup);

    switch (rotationSteps) {
        case 0: // 0°
            createFrontWallGrid(gridMaterial);
            createLeftWallGrid(gridMaterial);
            createRightWallGrid(gridMaterial);
            break;
        case 1: // 90°
            createRightWallGrid(gridMaterial);
            createBackWallGrid(gridMaterial);
            createFrontWallGrid(gridMaterial);
            break;
        case 2: // 180°
            createBackWallGrid(gridMaterial);
            createRightWallGrid(gridMaterial);
            createLeftWallGrid(gridMaterial);
            break;
        case 3: // 270°
            createLeftWallGrid(gridMaterial);
            createFrontWallGrid(gridMaterial);
            createBackWallGrid(gridMaterial);
            break;
    }
}

function createLeftWallGrid(material: THREE.LineBasicMaterial) {
    leftWallGridGroup = new THREE.Group();
    const vertices = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(-FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, -FIELD_DEPTH / 2, -FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, FIELD_DEPTH / 2);
    for (let z = 0; z <= FIELD_DEPTH; z++) vertices.push(-FIELD_WIDTH / 2, -FIELD_HEIGHT / 2, z - FIELD_DEPTH / 2, -FIELD_WIDTH / 2, FIELD_HEIGHT / 2, z - FIELD_DEPTH / 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    leftWallGridGroup.add(grid);

    // Добавляем желтую линию спавна (минимальная высота для нижних блоков фигур)
    const spawnY = (FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [-FIELD_WIDTH / 2, spawnY, -FIELD_DEPTH / 2, -FIELD_WIDTH / 2, spawnY, FIELD_DEPTH / 2];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    leftWallGridGroup.add(spawnLine);

    fieldContainer.add(leftWallGridGroup);
}

function createRightWallGrid(material: THREE.LineBasicMaterial) {
    rightWallGridGroup = new THREE.Group();
    const vertices = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, -FIELD_DEPTH / 2, FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, FIELD_DEPTH / 2);
    for (let z = 0; z <= FIELD_DEPTH; z++) vertices.push(FIELD_WIDTH / 2, -FIELD_HEIGHT / 2, z - FIELD_DEPTH / 2, FIELD_WIDTH / 2, FIELD_HEIGHT / 2, z - FIELD_DEPTH / 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    rightWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = (FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [FIELD_WIDTH / 2, spawnY, -FIELD_DEPTH / 2, FIELD_WIDTH / 2, spawnY, FIELD_DEPTH / 2];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    rightWallGridGroup.add(spawnLine);

    fieldContainer.add(rightWallGridGroup);
}

function createBackWallGrid(material: THREE.LineBasicMaterial) {
    backWallGridGroup = new THREE.Group();
    const vertices = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(-FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, FIELD_DEPTH / 2, FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, FIELD_DEPTH / 2);
    for (let x = 0; x <= FIELD_WIDTH; x++) vertices.push(x - FIELD_WIDTH / 2, -FIELD_HEIGHT / 2, FIELD_DEPTH / 2, x - FIELD_WIDTH / 2, FIELD_HEIGHT / 2, FIELD_DEPTH / 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    backWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = (FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [-FIELD_WIDTH / 2, spawnY, FIELD_DEPTH / 2, FIELD_WIDTH / 2, spawnY, FIELD_DEPTH / 2];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    backWallGridGroup.add(spawnLine);

    fieldContainer.add(backWallGridGroup);
}

function createFrontWallGrid(material: THREE.LineBasicMaterial) {
    frontWallGridGroup = new THREE.Group();
    const vertices = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(-FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, -FIELD_DEPTH / 2, FIELD_WIDTH / 2, y - FIELD_HEIGHT / 2, -FIELD_DEPTH / 2);
    for (let x = 0; x <= FIELD_WIDTH; x++) vertices.push(x - FIELD_WIDTH / 2, -FIELD_HEIGHT / 2, -FIELD_DEPTH / 2, x - FIELD_WIDTH / 2, FIELD_HEIGHT / 2, -FIELD_DEPTH / 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    frontWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = (FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [-FIELD_WIDTH / 2, spawnY, -FIELD_DEPTH / 2, FIELD_WIDTH / 2, spawnY, -FIELD_DEPTH / 2];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    frontWallGridGroup.add(spawnLine);

    fieldContainer.add(frontWallGridGroup);
}

function updateLandedVisuals() {
    // Properly dispose of old objects before removing
    while (landedBlocksContainer.children.length > 0) {
        const child = landedBlocksContainer.children[0];
        disposeObject3D(child);
        landedBlocksContainer.remove(child);
    }

    // Use shared geometries instead of creating new ones
    for (let y = 0; y < FIELD_HEIGHT; y++) {
        for (let z = 0; z < FIELD_DEPTH; z++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                const pieceType = gameField[y][z][x];
                if (pieceType) {
                    const originalColor = tetrominoColors[pieceType as keyof typeof tetrominoColors];
                    const color = coloredModeAtom() ? originalColor : FROZEN_FIGURE_COLOR; // Серый цвет если цветной режим выключен
                    const material = getBlockMaterial(color);
                    const cube = new THREE.Mesh(sharedBlockGeometry, material);
                    cube.position.set(x - FIELD_WIDTH / 2 + 0.5, y - FIELD_HEIGHT / 2 + 0.5, z - FIELD_DEPTH / 2 + 0.5);
                    cube.castShadow = true;
                    cube.receiveShadow = true;
                    landedBlocksContainer.add(cube);

                    // Добавляем контур граней черным цветом с shared геометрией
                    const wireframe = new THREE.LineSegments(sharedEdgesGeometry, materialPools.edges);
                    wireframe.position.copy(cube.position);
                    landedBlocksContainer.add(wireframe);
                }
            }
        }
    }
}

function updateWallProjections(renderPosition?: { x: number; y: number; z: number }) {
    if (!currentPieceType) return;

    // Используем переданную позицию или текущую позицию фигуры
    const projectionPosition = renderPosition || currentPiecePosition;

    if (bottomProjectionGroup) gameContainer.remove(bottomProjectionGroup);
    if (leftProjectionGroup) gameContainer.remove(leftProjectionGroup);
    if (rightProjectionGroup) gameContainer.remove(rightProjectionGroup);
    if (backProjectionGroup) gameContainer.remove(backProjectionGroup);
    if (obstacleHighlightsGroup) gameContainer.remove(obstacleHighlightsGroup);

    const projectionMaterial = new THREE.MeshBasicMaterial({
        color: tetrominoColors[currentPieceType],
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });

    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;

    // Создаем проекции на дно с проверкой препятствий
    bottomProjectionGroup = new THREE.Group();
    obstacleHighlightsGroup = new THREE.Group();

    // Сначала симулируем падение всей фигуры до препятствия
    let finalFigureY = projectionPosition.y;

    // Опускаем фигуру до тех пор, пока не найдем препятствие
    for (let testY = Math.floor(projectionPosition.y) - 1; testY >= 0; testY--) {
        let canPlaceAtThisLevel = true;

        // Проверяем все блоки фигуры на этом уровне
        for (const testBlock of currentPieceBlocks) {
            const testWorldX = Math.round(projectionPosition.x + testBlock.x);
            const testWorldZ = Math.round(projectionPosition.z + testBlock.z);
            const testBlockY = testY + testBlock.y;

            // Проверяем границы и коллизии
            if (testBlockY < 0 || // Ниже дна
                testWorldX < 0 || testWorldX >= FIELD_WIDTH ||
                testWorldZ < 0 || testWorldZ >= FIELD_DEPTH ||
                (gameField[testBlockY] && gameField[testBlockY][testWorldZ][testWorldX] !== null)) {
                canPlaceAtThisLevel = false;
                break;
            }
        }

        if (canPlaceAtThisLevel) {
            finalFigureY = testY;
        } else {
            break; // Нашли препятствие, останавливаемся
        }
    }

    // Теперь в финальной позиции находим самые нижние блоки в каждой колонке
    const columnBottomBlocks = new Map<string, { block: { x: number; y: number; z: number }, lowestY: number }>();

    // Группируем блоки по колонкам (x, z) и находим самый нижний в каждой
    for (const block of currentPieceBlocks) {
        const worldX = Math.round(projectionPosition.x + block.x);
        const worldZ = Math.round(projectionPosition.z + block.z);
        const key = `${worldX},${worldZ}`;

        if (!columnBottomBlocks.has(key) || block.y < columnBottomBlocks.get(key)!.lowestY) {
            columnBottomBlocks.set(key, { block, lowestY: block.y });
        }
    }

    // Для каждого самого нижнего блока в колонке проверяем что под ним в финальной позиции
    for (const [, { block }] of columnBottomBlocks) {
        const worldX = Math.round(projectionPosition.x + block.x);
        const worldZ = Math.round(projectionPosition.z + block.z);

        // Проверяем валидность координат
        if (worldX < 0 || worldX >= FIELD_WIDTH || worldZ < 0 || worldZ >= FIELD_DEPTH) {
            continue;
        }

        // Финальная позиция этого блока после падения всей фигуры
        const blockFinalY = finalFigureY + block.y;
        const blockFinalYRounded = Math.round(blockFinalY);

        // Проверяем что под блоком в его финальной позиции
        const underBlockY = blockFinalYRounded - 1;

        // Если блок упал на дно
        if (blockFinalYRounded <= 0) {
            // Белая проекция на дне
            const whitePlane = new THREE.Mesh(sharedPlaneGeometry, materialPools.projectionWhite);
            whitePlane.rotation.x = -Math.PI / 2;
            whitePlane.position.set(
                worldX - FIELD_WIDTH / 2 + 0.5,
                -FIELD_HEIGHT / 2 + 0.01,
                worldZ - FIELD_DEPTH / 2 + 0.5
            );
            bottomProjectionGroup.add(whitePlane);
        }
        // Если под блоком есть препятствие в финальной позиции
        else if (underBlockY >= 0 && gameField[underBlockY] && gameField[underBlockY][worldZ][worldX] !== null) {
            // Белая проекция на препятствии
            const whitePlane = new THREE.Mesh(sharedPlaneGeometry, materialPools.projectionWhite);
            whitePlane.rotation.x = -Math.PI / 2;
            whitePlane.position.set(
                worldX - FIELD_WIDTH / 2 + 0.5,
                underBlockY - FIELD_HEIGHT / 2 + 0.5 + BLOCK_SIZE / 2 + 0.001,
                worldZ - FIELD_DEPTH / 2 + 0.5
            );
            bottomProjectionGroup.add(whitePlane);
        }
        // Если под блоком пустота - ищем первое препятствие/дно ниже
        else {
            // Красная проекция - ищем первое препятствие ниже финальной позиции блока
            let redProjectionY = -FIELD_HEIGHT / 2 + 0.01; // По умолчанию на дне

            for (let y = underBlockY - 1; y >= 0; y--) {
                if (gameField[y] && gameField[y][worldZ][worldX] !== null) {
                    redProjectionY = y - FIELD_HEIGHT / 2 + 0.5 + BLOCK_SIZE / 2 + 0.001;
                    break;
                }
            }
            const redPlane = new THREE.Mesh(sharedPlaneGeometry, materialPools.projectionRed);
            redPlane.rotation.x = -Math.PI / 2;
            redPlane.position.set(
                worldX - FIELD_WIDTH / 2 + 0.5,
                redProjectionY,
                worldZ - FIELD_DEPTH / 2 + 0.5
            );
            bottomProjectionGroup.add(redPlane);
        }
    }

    gameContainer.add(bottomProjectionGroup);
    gameContainer.add(obstacleHighlightsGroup);

    let backWallCoords: (block: Block3D) => { x: number, y: number, z: number } = () => ({ x: 0, y: 0, z: 0 });
    let leftWallCoords: (block: Block3D) => { x: number, y: number, z: number } = () => ({ x: 0, y: 0, z: 0 });
    let rightWallCoords: (block: Block3D) => { x: number, y: number, z: number } = () => ({ x: 0, y: 0, z: 0 });
    let backWallRotation: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };
    let leftWallRotation: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };
    let rightWallRotation: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };

    switch (rotationSteps) {
        case 0:
            backWallCoords = (block) => ({ x: Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: -FIELD_DEPTH / 2 - 0.01 });
            leftWallCoords = (block) => ({ x: -FIELD_WIDTH / 2 - 0.01, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5 });
            rightWallCoords = (block) => ({ x: FIELD_WIDTH / 2 + 0.01, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5 });
            backWallRotation = { x: 0, y: Math.PI, z: 0 };
            leftWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            rightWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            break;
        case 1:
            backWallCoords = (block) => ({ x: FIELD_WIDTH / 2 + 0.01, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5 });
            leftWallCoords = (block) => ({ x: Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: FIELD_DEPTH / 2 + 0.01 });
            rightWallCoords = (block) => ({ x: Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: -FIELD_DEPTH / 2 - 0.01 });
            backWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            leftWallRotation = { x: 0, y: 0, z: 0 };
            rightWallRotation = { x: 0, y: Math.PI, z: 0 };
            break;
        case 2:
            backWallCoords = (block) => ({ x: Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: FIELD_DEPTH / 2 + 0.01 });
            leftWallCoords = (block) => ({ x: FIELD_WIDTH / 2 + 0.01, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5 });
            rightWallCoords = (block) => ({ x: -FIELD_WIDTH / 2 - 0.01, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5 });
            backWallRotation = { x: 0, y: 0, z: 0 };
            leftWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            rightWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            break;
        case 3:
            backWallCoords = (block) => ({ x: -FIELD_WIDTH / 2 - 0.01, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5 });
            leftWallCoords = (block) => ({ x: Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: -FIELD_DEPTH / 2 - 0.01 });
            rightWallCoords = (block) => ({ x: Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5, y: Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5, z: FIELD_DEPTH / 2 + 0.01 });
            backWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            leftWallRotation = { x: 0, y: Math.PI, z: 0 };
            rightWallRotation = { x: 0, y: 0, z: 0 };
            break;
    }

    const createProjectionGroup = (coordsFunc: (b: Block3D) => {x:number, y:number, z:number}, rotation: {x:number, y:number, z:number}) => {
        const group = new THREE.Group();
        for (const block of currentPieceBlocks) {
            const coords = coordsFunc(block);
            // ИСПРАВЛЕНО: используем shared геометрию
            const plane = new THREE.Mesh(sharedPlaneGeometry, projectionMaterial.clone());
            plane.position.set(coords.x, coords.y, coords.z);
            plane.rotation.set(rotation.x, rotation.y, rotation.z);
            group.add(plane);
        }
        return group;
    };

    backProjectionGroup = createProjectionGroup(backWallCoords, backWallRotation);
    leftProjectionGroup = createProjectionGroup(leftWallCoords, leftWallRotation);
    rightProjectionGroup = createProjectionGroup(rightWallCoords, rightWallRotation);

    gameContainer.add(backProjectionGroup, leftProjectionGroup, rightProjectionGroup);
}

function clearFieldBoundaries() {
    while (fieldContainer.children.length > 0) {
        fieldContainer.remove(fieldContainer.children[0]);
    }
}

function toggleAxesHelper() {
    if (axesHelper) {
        fieldContainer.remove(axesHelper);
        axesHelper = null;
    } else {
        axesHelper = new THREE.AxesHelper(3);
        axesHelper.position.set(0, -FIELD_HEIGHT / 2 + 2, 0); // Подняли на 2 единицы выше дна
        fieldContainer.add(axesHelper);
    }
}

function toggleWallProjections() {
    projectionsVisible = !projectionsVisible;
    if (projectionsVisible) {
        if (currentPieceType) updateWallProjections();
    } else {
        if (bottomProjectionGroup) gameContainer.remove(bottomProjectionGroup);
        if (obstacleHighlightsGroup) gameContainer.remove(obstacleHighlightsGroup);
        if (leftProjectionGroup) gameContainer.remove(leftProjectionGroup);
        if (rightProjectionGroup) gameContainer.remove(rightProjectionGroup);
        if (backProjectionGroup) gameContainer.remove(backProjectionGroup);
    }
}

function updateWallsOpacity() {
    if (!frontWallMesh || !backWallMesh || !leftWallMesh || !rightWallMesh) return;
    
    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;
    
    // Сброс всех стен к базовой прозрачности и оригинальному цвету
    (frontWallMesh.material as THREE.MeshPhongMaterial).opacity = 0.2;
    (frontWallMesh.material as THREE.MeshPhongMaterial).color.setHex(0x444444);
    (backWallMesh.material as THREE.MeshPhongMaterial).opacity = 0.2;
    (backWallMesh.material as THREE.MeshPhongMaterial).color.setHex(0x444444);
    (leftWallMesh.material as THREE.MeshPhongMaterial).opacity = 0.2;
    (leftWallMesh.material as THREE.MeshPhongMaterial).color.setHex(0x444444);
    (rightWallMesh.material as THREE.MeshPhongMaterial).opacity = 0.2;
    (rightWallMesh.material as THREE.MeshPhongMaterial).color.setHex(0x444444);
    
    // Делаем ближайшую к камере стену полностью прозрачной
    // Камера в позиции (0, 14, 14), поэтому ближайшие стены:
    switch (rotationSteps) {
        case 0: // 0° - задняя стена ближайшая к камере (z = +5)
            (backWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
        case 1: // 90° - левая стена ближайшая к камере (после поворота)
            (leftWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
        case 2: // 180° - фронтальная стена ближайшая к камере (после поворота)
            (frontWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
        case 3: // 270° - правая стена ближайшая к камере (после поворота)
            (rightWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
    }
}

function createFieldBoundaries() {
    clearFieldBoundaries();
    const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x444444, transparent: true, opacity: 0.2, side: THREE.DoubleSide });

    const createWall = (geom: THREE.PlaneGeometry, pos: [number, number, number], rot: [number, number, number]) => {
        const wall = new THREE.Mesh(geom, wallMaterial.clone());
        wall.position.set(...pos);
        wall.rotation.set(...rot);
        wall.renderOrder = 1;
        return wall;
    };

    frontWallMesh = createWall(new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_HEIGHT), [0, 0, -FIELD_DEPTH / 2], [0, 0, 0]);
    backWallMesh = createWall(new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_HEIGHT), [0, 0, FIELD_DEPTH / 2], [0, Math.PI, 0]);
    leftWallMesh = createWall(new THREE.PlaneGeometry(FIELD_DEPTH, FIELD_HEIGHT), [-FIELD_WIDTH / 2, 0, 0], [0, Math.PI / 2, 0]);
    rightWallMesh = createWall(new THREE.PlaneGeometry(FIELD_DEPTH, FIELD_HEIGHT), [FIELD_WIDTH / 2, 0, 0], [0, -Math.PI / 2, 0]);
    fieldContainer.add(frontWallMesh, backWallMesh, leftWallMesh, rightWallMesh);
    
    updateWallsOpacity();

    // Добавляем светло-голубое дно стакана
    const bottomMaterial = new THREE.MeshPhongMaterial({ color: 0x87ceeb, side: THREE.DoubleSide });
    const bottomMesh = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_DEPTH), bottomMaterial);
    bottomMesh.rotation.x = -Math.PI / 2;
    bottomMesh.position.set(0, -FIELD_HEIGHT / 2, 0);
    bottomMesh.receiveShadow = true;
    fieldContainer.add(bottomMesh);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(FIELD_WIDTH, FIELD_HEIGHT, FIELD_DEPTH));
    const wireframe = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 2, transparent: true, opacity: 0.7 }));
    fieldContainer.add(wireframe);
}

function movePiece(dx: number, dy: number, dz: number) {
    // Проверяем, можем ли мы начать анимацию (не анимируемся уже)
    if (isAnimating) return;

    const newPos = { x: currentPiecePosition.x + dx, y: currentPiecePosition.y + dy, z: currentPiecePosition.z + dz };
    if (canPlacePiece(currentPieceBlocks, newPos)) {
        // Отменяем lock delay если фигура смогла переместиться
        cancelLockDelay();

        // Начинаем анимацию к новой позиции
        isAnimating = true;
        animationStartTime = Date.now();
        animationStartPosition = { ...currentPiecePosition };
        animationTargetPosition = newPos;

        // Сразу обновляем логическую позицию для игровых проверок
        currentPiecePosition = newPos;

        // Обновляем миникарту при движении фигуры
        updateMinimap();

        // Если это движение вниз от стандартного таймера, перезапускаем таймер падения
        if (dy < 0) {
            startDropTimer();
        }

        // Проверяем, находится ли фигура на земле после движения
        if (isOnGround()) {
            startLockDelay();
        }
    } else if (dy < 0) {
        // Фигура не может двигаться вниз - начинаем lock delay если еще не активен
        if (!lockDelayActive) {
            startLockDelay();
        }
    }
}

function movePieceRelativeToField(dx: number, dy: number, dz: number) {
    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;
    let tDx = dx, tDz = dz;
    if (rotationSteps === 1) { tDx = -dz; tDz = dx; }
    else if (rotationSteps === 2) { tDx = -dx; tDz = -dz; }
    else if (rotationSteps === 3) { tDx = dz; tDz = -dx; }
    movePiece(tDx, dy, tDz);
}

function placePiece(timeout = 0) {
    if (!currentPieceType) return;

    // Сбрасываем состояние таймеров
    resetLockDelayState();
    resetDropTimer();

    // Подсчитываем очки за размещение фигуры
    let placementPoints = 0;

    for (const block of currentPieceBlocks) {
        const x = Math.round(currentPiecePosition.x + block.x);
        const y = Math.round(currentPiecePosition.y + block.y);
        const z = Math.round(currentPiecePosition.z + block.z);
        if (x >= 0 && x < FIELD_WIDTH && y >= 0 && y < FIELD_HEIGHT && z >= 0 && z < FIELD_DEPTH) {
            gameField[y][z][x] = currentPieceType;

            // Начисляем очки за уровень размещения (уровень 0 = 1 очко, уровень 1 = 2 очка и т.д.)
            const levelPoints = y + 1;
            placementPoints += levelPoints;
            console.log(`   📦 Block at level ${y}: +${levelPoints} points`);
        }
    }

    // Начисляем очки за размещение
    if (placementPoints > 0) {
        const oldScore = scoreAtom();
        scoreAtom.add(placementPoints);
        const newScore = scoreAtom();
        console.log(`🎯 Placement bonus: +${placementPoints} points (piece placed on levels)`);
        console.log(`💰 Score changed: ${oldScore} → ${newScore} (+${placementPoints})`);
    }
    checkCompletedLines();
    updateLandedVisuals();

    // Убираем текущую фигуру и проекции
    currentPieceType = null;
    if (pieceVisuals) gameContainer.remove(pieceVisuals);
    if (obstacleHighlightsGroup) gameContainer.remove(obstacleHighlightsGroup);
    if (bottomProjectionGroup) gameContainer.remove(bottomProjectionGroup);
    if (leftProjectionGroup) gameContainer.remove(leftProjectionGroup);
    if (rightProjectionGroup) gameContainer.remove(rightProjectionGroup);
    if (backProjectionGroup) gameContainer.remove(backProjectionGroup);

    setTimeout(spawnNewPiece, timeout);
}

function checkCompletedLines() {
    // Если анимация очистки уже идет, не начинаем новую
    if (isLevelClearAnimating) return;

    let totalBlocksDestroyed = 0;

    // 1. Проверяем и уничтожаем 3D массивы кубиков
    const cubeArrays = find3DCubeArrays();
    if (cubeArrays.length > 0) {
        const blocksFromCubes = clear3DCubeArrays(cubeArrays);
        totalBlocksDestroyed += blocksFromCubes;

        // Подсчет очков за 3D массивы (уровневая система)
        for (const cubeArray of cubeArrays) {
            let cubePoints = 0;

            // Подсчитываем очки для каждого уровня в 3D массиве
            for (let level = cubeArray.minCorner.y; level <= cubeArray.maxCorner.y; level++) {
                // Количество блоков на этом уровне
                const blocksOnLevel = cubeArray.size.width * cubeArray.size.depth;
                // Множитель уровня (нижний уровень 0 = множитель 1)
                const levelMultiplier = level + 1;
                // Очки за этот уровень
                const levelPoints = blocksOnLevel * levelMultiplier;
                cubePoints += levelPoints;

                console.log(`   📊 Level ${level}: ${blocksOnLevel} blocks × ${levelMultiplier} = ${levelPoints} points`);
            }

            const oldScore = scoreAtom();
            scoreAtom.add(cubePoints);
            const newScore = scoreAtom();
            console.log(`🧊 3D Array bonus: ${cubePoints} points for ${cubeArray.size.width}x${cubeArray.size.height}x${cubeArray.size.depth} (levels ${cubeArray.minCorner.y}-${cubeArray.maxCorner.y})`);
            console.log(`💰 Score changed: ${oldScore} → ${newScore} (+${cubePoints})`);
        }
    }

    // 2. Ищем полные горизонтальные слои для анимированного удаления
    const completedLevels: number[] = [];
    for (let y = FIELD_HEIGHT - 1; y >= 0; y--) {
        let isLayerComplete = true;
        for (let z = 0; z < FIELD_DEPTH; z++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                if (gameField[y][z][x] === null) {
                    isLayerComplete = false;
                    break;
                }
            }
            if (!isLayerComplete) break;
        }
        if (isLayerComplete) {
            completedLevels.push(y);
        }
    }

    // 3. Запускаем анимированную очистку уровней
    if (completedLevels.length > 0) {
        startLevelClearAnimation(completedLevels);
    }

    // Общая статистика
    if (totalBlocksDestroyed > 0) {
        console.log(`💥 Total blocks destroyed: ${totalBlocksDestroyed}`);
    }
}

// Запуск анимированной очистки уровней
function startLevelClearAnimation(levels: number[]) {
    console.log(`🎬 Начинаем анимированную очистку уровней: [${levels.join(', ')}]`);

    // Подсчитываем очки за очищенные уровни
    let totalPoints = 0;

    for (const level of levels) {
        // Количество блоков на уровне (вся площадь)
        const blocksOnLevel = FIELD_WIDTH * FIELD_DEPTH;
        // Множитель уровня (нижний уровень 0 = множитель 1)
        const levelMultiplier = level + 1;
        // Очки за этот уровень
        const levelPoints = blocksOnLevel * levelMultiplier;
        totalPoints += levelPoints;

        console.log(`   📊 Line clear level ${level}: ${blocksOnLevel} blocks × ${levelMultiplier} = ${levelPoints} points`);
    }

    if (totalPoints > 0) {
        const oldScore = scoreAtom();
        scoreAtom.add(totalPoints);
        const newScore = scoreAtom();
        console.log(`🧹 Line clear bonus: ${totalPoints} points for ${levels.length} levels [${levels.join(', ')}]`);
        console.log(`💰 Score changed: ${oldScore} → ${newScore} (+${totalPoints})`);
    }

    // Сортируем уровни снизу вверх для корректной анимации
    levelClearQueue = [...levels].sort((a, b) => a - b);
    isLevelClearAnimating = true;
    currentClearLevel = levelClearQueue.shift()!;

    // Начинаем мерцание первого уровня
    startLevelBlinking(currentClearLevel);
}

// Мерцание уровня перед удалением
function startLevelBlinking(level: number) {
    const blinkDuration = LEVEL_CLEAR_ANIMATION_DURATION;
    const startTime = Date.now();

    function blink() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / blinkDuration;

        // Меняем прозрачность блоков с синусоидальной частотой
        const opacity = 0.3 + 0.7 * Math.abs(Math.sin(elapsed * 0.02)); // Быстрое мерцание

        // Обновляем прозрачность всех блоков на этом уровне
        updateLevelOpacity(level, opacity);

        if (progress < 1) {
            requestAnimationFrame(blink);
        } else {
            // Удаляем уровень и начинаем обрушение
            removeLevelAndCollapse(level);
        }
    }

    requestAnimationFrame(blink);
}

// Обновление прозрачности уровня
function updateLevelOpacity(level: number, opacity: number) {
    // ИСПРАВЛЕНО: используем shared геометрию

    // Очищаем только блоки на указанном уровне
    const toRemove: THREE.Object3D[] = [];
    landedBlocksContainer.children.forEach(child => {
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        const gameY = Math.round(worldPos.y + FIELD_HEIGHT / 2 - 0.5);

        if (gameY === level) {
            toRemove.push(child);
        }
    });

    // Удаляем старые блоки уровня
    toRemove.forEach(block => landedBlocksContainer.remove(block));

    // Добавляем блоки с новой прозрачностью
    for (let z = 0; z < FIELD_DEPTH; z++) {
        for (let x = 0; x < FIELD_WIDTH; x++) {
            const pieceType = gameField[level][z][x];
            if (pieceType) {
                const originalColor = tetrominoColors[pieceType as keyof typeof tetrominoColors];
                const color = coloredModeAtom() ? originalColor : FROZEN_FIGURE_COLOR; // Серый цвет если цветной режим выключен
                const material = new THREE.MeshPhongMaterial({
                    color,
                    emissive: color,
                    emissiveIntensity: 0.2,
                    transparent: true,
                    opacity: opacity
                });
                const cube = new THREE.Mesh(sharedBlockGeometry, material);
                cube.position.set(x - FIELD_WIDTH / 2 + 0.5, level - FIELD_HEIGHT / 2 + 0.5, z - FIELD_DEPTH / 2 + 0.5);
                cube.castShadow = true;
                cube.receiveShadow = true;
                landedBlocksContainer.add(cube);

                // ИСПРАВЛЕНО: используем shared геометрию для контуров
                const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: opacity });
                const wireframe = new THREE.LineSegments(sharedEdgesGeometry, edgesMaterial);
                wireframe.position.copy(cube.position);
                landedBlocksContainer.add(wireframe);
            }
        }
    }
}

// Удаление уровня и обрушение верхних блоков
function removeLevelAndCollapse(level: number) {
    console.log(`💥 Удаляем уровень ${level}`);

    // Удаляем уровень из игрового поля
    for (let moveY = level; moveY < FIELD_HEIGHT - 1; moveY++) {
        gameField[moveY] = gameField[moveY + 1];
    }
    gameField[FIELD_HEIGHT - 1] = Array(FIELD_DEPTH).fill(null).map(() => Array(FIELD_WIDTH).fill(null));

    // Начинаем анимацию обрушения
    startCollapseAnimation(level);
}

// Анимация обрушения блоков
function startCollapseAnimation(clearedLevel: number) {
    const collapseStartTime = Date.now();
    const collapseDuration = LEVEL_CLEAR_ANIMATION_DURATION * 1.5; // Чуть медленнее

    // Сохраняем начальные позиции всех блоков выше удаленного уровня
    const blockPositions = new Map<THREE.Object3D, { start: THREE.Vector3, target: THREE.Vector3 }>();

    landedBlocksContainer.children.forEach(child => {
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        const gameY = Math.round(worldPos.y + FIELD_HEIGHT / 2 - 0.5);

        if (gameY > clearedLevel) {
            const startPos = worldPos.clone();
            const targetPos = startPos.clone();
            targetPos.y -= 1; // Опускаем на один уровень

            blockPositions.set(child, { start: startPos, target: targetPos });
        }
    });

    function animateCollapse() {
        const elapsed = Date.now() - collapseStartTime;
        const progress = Math.min(elapsed / collapseDuration, 1);
        const easeProgress = 1 - (1 - progress) ** 3; // ease-out cubic

        // Анимируем падение блоков
        blockPositions.forEach((positions, block) => {
            const currentPos = positions.start.clone().lerp(positions.target, easeProgress);
            block.position.copy(currentPos);
        });

        if (progress < 1) {
            requestAnimationFrame(animateCollapse);
        } else {
            // Завершаем анимацию - обновляем визуализацию
            updateLandedVisuals();

            // Обрабатываем следующий уровень или завершаем анимацию
            processNextLevel();
        }
    }

    requestAnimationFrame(animateCollapse);
}

// Обработка следующего уровня в очереди
function processNextLevel() {
    if (levelClearQueue.length > 0) {
        // Берем следующий уровень из очереди
        currentClearLevel = levelClearQueue.shift()!;

        // Корректируем номер уровня после удаления предыдущих
        const levelsCleared = levelClearQueue.length;
        const adjustedLevel = currentClearLevel - levelsCleared;

        console.log(`➡️ Переходим к следующему уровню: ${currentClearLevel} (скорректированный: ${adjustedLevel})`);

        startLevelBlinking(adjustedLevel);
    } else {
        // Все уровни обработаны
        finishLevelClearAnimation();
    }
}

// Завершение анимации очистки уровней
function finishLevelClearAnimation() {
    console.log(`✅ Анимация очистки уровней завершена`);

    isLevelClearAnimating = false;
    levelClearQueue = [];
    currentClearLevel = -1;

    // Обновляем визуализацию
    updateLandedVisuals();
}

function dropPiece() {
    // Если анимация идет, завершаем ее немедленно
    if (isAnimating) {
        isAnimating = false;
        // Переходим к финальной позиции анимации
        currentPiecePosition = { ...animationTargetPosition };
        updateVisuals();
    }

    // Отменяем текущий lock delay и сбрасываем таймеры
    cancelLockDelay();
    resetDropTimer();

    // Найти конечную позицию падения
    let targetY = currentPiecePosition.y;
    while (canPlacePiece(currentPieceBlocks, { ...currentPiecePosition, y: targetY - 1 })) {
        targetY--;
    }

    // Если есть куда падать - анимируем
    if (targetY < currentPiecePosition.y) {
        isAnimating = true;
        animationStartTime = Date.now();
        animationStartPosition = { ...currentPiecePosition };
        animationTargetPosition = { ...currentPiecePosition, y: targetY };
        currentPiecePosition.y = targetY;

        // После завершения анимации активируем lock delay и запускаем таймер
        setTimeout(() => {
            startLockDelay();
            startDropTimer(); // Возобновляем стандартный таймер после spacebar drop
        }, PIECE_ANIMATION_DURATION + 16);
    } else {
        // Некуда падать - активируем lock delay и запускаем таймер
        startLockDelay();
        startDropTimer();
    }
}

let isFieldRotating = false;
function rotateField(direction: 1 | -1) {
    if (isFieldRotating) return;
    isFieldRotating = true;
    const currentRotation = fieldRotationAtom();
    const newRotation = currentRotation + direction * 90;
    const normalizedNewRotation = ((newRotation % 360) + 360) % 360;

    // Миникарта анимируется синхронно в animateRotation()

    const startRotation = (currentRotation * Math.PI) / 180;
    const endRotation = (newRotation * Math.PI) / 180;
    const startTime = Date.now();

    function animateRotation() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / FIELD_ROTATION_DURATION, 1);
        const easeProgress = progress; //1 - (1 - progress) ** 3;
        rotationContainer.rotation.y = startRotation + (endRotation - startRotation) * easeProgress;

        // Синхронно вращаем миникарту - добавляем PI/2 к углу камеры
        if (minimapCamera) {
            updateMinimap();
        }

        if (progress < 1) {
            requestAnimationFrame(animateRotation);
        } else {
            fieldRotationAtom.set(normalizedNewRotation);
            isFieldRotating = false;
            if (currentPieceType) updateVisuals();
            createWallGrids();
            updateWallsOpacity();
        }
    }
    requestAnimationFrame(animateRotation);
}

function createFallingPiece() {
    const shapes = Object.keys(tetrominoShapes) as (keyof typeof tetrominoShapes)[];
    const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
    const shape = tetrominoShapes[randomShape];
    const color = tetrominoColors[randomShape];

    const piece = new THREE.Group();
    // ИСПРАВЛЕНО: используем shared геометрию вместо создания новой
    const material = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.2
    });

    // Create the tetromino from blocks
    shape.forEach(block => {
        const blockMesh = new THREE.Mesh(sharedBlockGeometry, material);
        blockMesh.position.set(block.x, block.y, block.z);
        blockMesh.castShadow = true;
        blockMesh.receiveShadow = true;
        piece.add(blockMesh);

        // ИСПРАВЛЕНО: используем shared геометрию для контуров
        const wireframe = new THREE.LineSegments(sharedEdgesGeometry, materialPools.edges);
        wireframe.position.copy(blockMesh.position);
        piece.add(wireframe);
    });

    // Random position and rotation
    piece.position.set((Math.random() - 0.5) * 20, 15, (Math.random() - 0.5) * 10);
    piece.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

    // Random scale
    const scale = 0.5 + Math.random();
    piece.scale.set(scale, scale, scale);

    const animatedPiece = piece as AnimatedPiece;
    animatedPiece.fallSpeed = 0.05 + Math.random() * 0.1;
    animatedPiece.rotationSpeed = {
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02
    };

    menuContainer.add(animatedPiece);
    fallingPieces.push(animatedPiece);
}

function updateCameraForGame() {
    // Отодвинули камеру на 6 кубиков дальше и наклонили вниз
    // Камера смотрит прямо на центр сцены
    camera.position.set(0, CAMERA_START_Y, CAMERA_START_Z);
    camera.lookAt(0, 0, 0);
}

function updateCameraForMenu() {
    const time = Date.now() * 0.001;
    camera.position.x = Math.sin(time * 0.3) * 2;
    camera.position.z = 15 + Math.cos(time * 0.2) * 3;
    camera.position.y = 5;
    camera.lookAt(0, 0, 0);
}

function updateDynamicCamera() {
    if (cameraMode === 'front') {
        updateCameraForGame();
        return;
    }

    // В простом режиме позиция фигуры не влияет на камеру

    // Определяем ближайшее верхнее ребро стакана относительно статической камеры
    const staticCameraPos = new THREE.Vector3(0, 0, 15.35);

    // Вычисляем центры всех четырех верхних ребер стакана
    const halfWidth = FIELD_WIDTH / 2 - 0.5;
    const halfDepth = FIELD_DEPTH / 2 - 0.5;

    const edgeCenters = [
        new THREE.Vector3(0, FIELD_TOP_Y, halfDepth),        // Переднее ребро (центр)
        new THREE.Vector3(0, FIELD_TOP_Y, -halfDepth),       // Заднее ребро (центр)
        new THREE.Vector3(halfWidth, FIELD_TOP_Y, 0),        // Правое ребро (центр)
        new THREE.Vector3(-halfWidth, FIELD_TOP_Y, 0)        // Левое ребро (центр)
    ];

    // Находим ближайшее ребро к статической позиции камеры
    let nearestEdgeCenter = edgeCenters[0];
    let minDistance = staticCameraPos.distanceTo(edgeCenters[0]);

    edgeCenters.forEach(edgeCenter => {
        const distance = staticCameraPos.distanceTo(edgeCenter);
        if (distance < minDistance) {
            minDistance = distance;
            nearestEdgeCenter = edgeCenter;
        }
    });

    // Определяем расстояние (базовое или минимальное)
    const cameraDistance = Math.max(DYNAMIC_CAMERA_DISTANCE, DYNAMIC_CAMERA_MIN_DISTANCE);

    // Позиционируем камеру точно над центром ребра на заданной высоте
    const targetCameraPos = new THREE.Vector3(
        nearestEdgeCenter.x, // Точно X координата центра ребра
        nearestEdgeCenter.y + cameraDistance, // Поднимаем на заданную высоту
        nearestEdgeCenter.z  // Точно Z координата центра ребра
    );

    // Плавно интерполируем к целевой позиции
    dynamicCameraPosition.lerp(targetCameraPos, DYNAMIC_CAMERA_SMOOTH);

    // Центр дна стакана - точка наблюдения
    const fieldCenterBottom = new THREE.Vector3(0, FIELD_BOTTOM_Y, 0);

    // Камера всегда смотрит на центр дна стакана
    dynamicCameraTarget.lerp(fieldCenterBottom, DYNAMIC_CAMERA_SMOOTH);

    // Устанавливаем позицию и направление камеры
    camera.position.copy(dynamicCameraPosition);
    camera.lookAt(dynamicCameraTarget);
}

function updateCameraModeIndicator() {
    if (!cameraIcon || !cameraModeText) return;

    if (cameraMode === 'front') {
        cameraIcon.className = 'camera-icon front';
        cameraModeText.textContent = 'FRONT';
    } else {
        cameraIcon.className = 'camera-icon top';
        cameraModeText.textContent = 'TOP';
    }
}

// Инициализация простой миникарты с ортогональной камерой над реальным стаканом
function initializeMinimap() {
    minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!minimapCanvas) return;

    // Создаем рендерер для мини-карты
    minimapRenderer = new THREE.WebGLRenderer({
        canvas: minimapCanvas,
        antialias: false,
        alpha: true
    });
    minimapRenderer.setSize(MINIMAP_SIZE, MINIMAP_SIZE);
    minimapRenderer.setClearColor(0x000000, 0.3);

    // Создаем ортографическую камеру для вида сверху на реальный стакан
    const aspect = 1; // Квадратная миникарта 120x120
    const size = FIELD_WIDTH / 2 + 1;
    minimapCamera = new THREE.OrthographicCamera(
        -size * aspect, size * aspect,
        size, -size,
        0.1, 100
    );
    minimapCamera.position.set(0, 20, 0);

    // Синхронизируем с текущим углом поля только если не происходит анимация
    // if (!isFieldRotating) {
    //     const currentFieldRotation = fieldRotationAtom();
    //     // minimapCurrentRotation = (currentFieldRotation * Math.PI) / 180;
    // }

    // Устанавливаем начальный угол камеры
    minimapCamera.rotation.x = -Math.PI / 2; // Смотрим вниз
    minimapCamera.rotation.y = 0; //minimapCurrentRotation; // Чистое вращение без компенсации
    minimapCamera.rotation.z = 0; //minimapCurrentRotation; // Чистое вращение без компенсации

    console.log('🗺️ Простая миникарта инициализирована');
}

// Инициализация превью следующей фигуры
function initializeNextPiecePreview() {
    const nextPieceCanvas = document.getElementById('next-piece-canvas') as HTMLCanvasElement;
    if (!nextPieceCanvas) return;

    // Создаем рендерер для превью следующей фигуры
    nextPieceRenderer = new THREE.WebGLRenderer({
        canvas: nextPieceCanvas,
        antialias: true,
        alpha: true
    });
    
    const width = 300;
    const height = 150;
    nextPieceRenderer.setSize(width, height);
    nextPieceRenderer.setClearColor(0x000000, 0.1);
    nextPieceRenderer.shadowMap.enabled = true;
    nextPieceRenderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Создаем отдельную сцену для превью
    nextPieceScene = new THREE.Scene();
    
    // Добавляем освещение
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    nextPieceScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(2, 3, 2);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    nextPieceScene.add(directionalLight);

    // Создаем камеру для превью
    nextPieceCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    nextPieceCamera.position.set(3, 3, 3);
    nextPieceCamera.lookAt(0, 0, 0);

    console.log('🔮 Next piece preview инициализировано');
}

// Простая миникарта с ортогональной камерой над реальным стаканом
function updateMinimap() {
    if (!minimapRenderer || !minimapCamera) return;

    // Временно скрываем падающую фигуру чтобы не заслоняла проекции
    const pieceWasVisible = pieceVisuals?.visible;
    if (pieceVisuals) {
        pieceVisuals.visible = false;
    }

    // Рендерим сцену без падающей фигуры
    minimapRenderer.render(scene, minimapCamera);

    // Восстанавливаем видимость падающей фигуры
    if (pieceVisuals && pieceWasVisible) {
        pieceVisuals.visible = true;
    }
}

// Функция для обновления превью следующей фигуры
function updateNextPiecePreview() {
    if (!nextPieceRenderer || !nextPieceCamera || !nextPieceScene) return;

    // Очищаем предыдущую сцену
    while (nextPieceScene.children.length > 0) {
        const child = nextPieceScene.children[0];
        if ((child as any).isMesh || (child as any).isLineSegments) {
            disposeObject3D(child);
        }
        nextPieceScene.remove(child);
    }

    // Восстанавливаем освещение
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    nextPieceScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(2, 3, 2);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    nextPieceScene.add(directionalLight);

    const nextPieceType = nextPieceAtom();
    if (!nextPieceType) {
        // Рендерим пустую сцену
        nextPieceRenderer.render(nextPieceScene, nextPieceCamera);
        return;
    }

    console.log(`🔮 Обновление превью следующей фигуры: ${nextPieceType}`);

    const color = tetrominoColors[nextPieceType];
    const material = getBlockMaterial(color);
    const blocks = tetrominoShapes[nextPieceType];

    // Создаем превью фигуры в отдельной сцене
    const pieceGroup = new THREE.Group();
    console.log(`🧱 Создаём ${blocks.length} блоков для фигуры ${nextPieceType}`);
    
    for (const block of blocks) {
        const cube = new THREE.Mesh(sharedBlockGeometry, material);
        cube.position.set(block.x, block.y, block.z);
        cube.castShadow = true;
        cube.receiveShadow = true;
        pieceGroup.add(cube);

        // Добавляем контур
        const wireframe = new THREE.LineSegments(sharedEdgesGeometry, materialPools.edges);
        wireframe.position.copy(cube.position);
        pieceGroup.add(wireframe);
    }

    // Добавляем группу к сцене (вращение будет в отдельной анимации)
    pieceGroup.userData.isNextPiece = true;

    nextPieceScene.add(pieceGroup);
    console.log(`✅ nextPieceScene теперь содержит ${nextPieceScene.children.length} детей`);
}

// Запуск анимации вращения миникарты уже не нужен - анимация происходит синхронно в animateRotation()

// UI Elements
let startButton: HTMLButtonElement, restartButton: HTMLButtonElement, mainMenuButton: HTMLButtonElement, resumeButton: HTMLButtonElement, pauseMenuButton: HTMLButtonElement, startMenu: HTMLDivElement, pauseMenu: HTMLDivElement, scoreDisplay: HTMLDivElement, scoreValue: HTMLSpanElement, gameOverMenu: HTMLDivElement, perspectiveGrid: HTMLDivElement, cameraModeIndicator: HTMLDivElement, cameraIcon: HTMLDivElement, cameraModeText: HTMLDivElement, controlsHelp: HTMLDivElement, minimapContainer: HTMLDivElement, nextPieceUIContainer: HTMLDivElement, difficultyDisplay: HTMLDivElement, difficultyCube: HTMLDivElement, difficultyValue: HTMLDivElement;

// Game state
let _prevState: GameStateType = gameStateAtom();

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 DOM Content Loaded - Initializing UI elements...');

    startButton = document.getElementById('start-button') as HTMLButtonElement;
    restartButton = document.getElementById('restart-button') as HTMLButtonElement;
    mainMenuButton = document.getElementById('main-menu-button') as HTMLButtonElement;
    resumeButton = document.getElementById('resume-button') as HTMLButtonElement;
    pauseMenuButton = document.getElementById('pause-menu-button') as HTMLButtonElement;
    startMenu = document.getElementById('start-menu') as HTMLDivElement;
    pauseMenu = document.getElementById('pause-menu') as HTMLDivElement;
    scoreDisplay = document.getElementById('score-display') as HTMLDivElement;
    scoreValue = document.getElementById('score-value') as HTMLSpanElement;
    gameOverMenu = document.getElementById('game-over') as HTMLDivElement;
    perspectiveGrid = document.querySelector('.perspective-grid') as HTMLDivElement;
    cameraModeIndicator = document.getElementById('camera-mode-indicator') as HTMLDivElement;
    cameraIcon = document.getElementById('camera-icon') as HTMLDivElement;
    cameraModeText = document.getElementById('camera-mode-text') as HTMLDivElement;
    controlsHelp = document.getElementById('controls-help') as HTMLDivElement;
    minimapContainer = document.getElementById('minimap-container') as HTMLDivElement;
    nextPieceUIContainer = document.getElementById('next-piece-container') as HTMLDivElement;
    difficultyDisplay = document.getElementById('difficulty-display') as HTMLDivElement;
    difficultyCube = document.getElementById('difficulty-cube') as HTMLDivElement;
    difficultyValue = document.getElementById('difficulty-value') as HTMLDivElement;

    // Инициализация мини-карты
    initializeMinimap();
    
    // Инициализация превью следующей фигуры
    initializeNextPiecePreview();

    console.log('📋 UI Elements status:');
    console.log('  startButton:', startButton);
    console.log('  scoreDisplay:', scoreDisplay);
    console.log('  scoreValue:', scoreValue);
    console.log('  scoreValue.textContent:', scoreValue?.textContent);

    startButton.addEventListener('click', () => {
        gameStateAtom.setPlaying();
    });

    restartButton.addEventListener('click', () => {
        gameStateAtom.setPlaying();
    });

    mainMenuButton.addEventListener('click', () => {
        gameStateAtom.setMenu();
    });

    resumeButton.addEventListener('click', () => {
        gameStateAtom.setPlaying();
    });

    pauseMenuButton.addEventListener('click', () => {
        gameStateAtom.setMenu();
    });

    // Инициализируем иконку камеры
    updateCameraModeIndicator();

    // Показываем UI после загрузки всех стилей
    const uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) {
        // Проверяем загрузку CSS через requestAnimationFrame
        const showUI = () => {
            // Проверяем, применились ли CSS стили
            const computedStyle = window.getComputedStyle(document.body);
            if (computedStyle.fontFamily.includes('Orbitron') || computedStyle.background !== 'rgba(0, 0, 0, 0)') {
                uiOverlay.classList.add('loaded');
            } else {
                // Если стили еще не загружены, ждем еще кадр
                requestAnimationFrame(showUI);
            }
        };

        // Даем небольшую задержку и начинаем проверку
        setTimeout(showUI, 50);
    }
});

// State effects
effect(() => {
    const state = gameStateAtom();
    const isMenu = state === GameState.MENU;
    const isPlaying = state === GameState.PLAYING;
    const isPaused = state === GameState.PAUSED;
    const isGameOver = state === GameState.GAME_OVER;

    if (startMenu) startMenu.classList.toggle('hidden', !isMenu);
    if (pauseMenu) pauseMenu.classList.toggle('hidden', !isPaused);
    if (scoreDisplay) {
        const shouldShow = isPlaying || isPaused || isGameOver;
        scoreDisplay.classList.toggle('hidden', !shouldShow);
        console.log(`🎮 Game State: ${state}, Score Display visible: ${shouldShow}`);
    }
    if (gameOverMenu) gameOverMenu.classList.toggle('hidden', !isGameOver);
    if (perspectiveGrid) perspectiveGrid.style.display = isMenu ? 'block' : 'none';
    if (cameraModeIndicator) {
        const shouldShowCameraIndicator = isPlaying || isPaused;
        cameraModeIndicator.classList.toggle('hidden', !shouldShowCameraIndicator);
    }
    if (controlsHelp) {
        const shouldShowControls = isPlaying || isPaused;
        controlsHelp.classList.toggle('hidden', !shouldShowControls);
        controlsHelp.classList.toggle('collapsed', !controlsHelpVisible);
    }
    if (minimapContainer) {
        const shouldShowMinimap = isPlaying || isPaused;
        minimapContainer.classList.toggle('hidden', !shouldShowMinimap);
    }
    if (nextPieceUIContainer) {
        const shouldShowNextPiece = isPlaying || isPaused;
        nextPieceUIContainer.classList.toggle('hidden', !shouldShowNextPiece);
    }
    if (difficultyDisplay) {
        const shouldShowDifficulty = isPlaying || isPaused || isGameOver;
        difficultyDisplay.classList.toggle('hidden', !shouldShowDifficulty);
    }

    // Управление фоном сцены
    if (isMenu) {
        scene.background = null;
        renderer.setClearColor(0x000000, 0); // Прозрачный фон
    } else {
        scene.background = backgroundTexture;
        renderer.setClearColor(0x000000, 1); // Непрозрачный фон
    }

    menuContainer.visible = isMenu;
    rotationContainer.visible = isPlaying || isPaused || isGameOver;
    pointLight1.visible = isMenu;
    pointLight2.visible = isMenu;

    if (isPlaying) {
        if (_prevState === GameState.GAME_OVER || _prevState === GameState.MENU) {
            resetGameState();
            
            // Устанавливаем начальную следующую фигуру для предпросмотра
            if (!nextPieceAtom()) {
                const newPiece = getRandomPiece();
                nextPieceAtom.update(newPiece);
                console.log(`🎮 Initialized next piece: ${newPiece}`);
            }
            
            spawnNewPiece();
        }
        updateDynamicCamera();
    }
    _prevState = state;
});

effect(() => {
    const currentScore = scoreAtom();
    console.log(`🎯 UI Score Update: ${currentScore}`);
    console.log(`📱 scoreValue element:`, scoreValue);

    if (scoreValue) {
        scoreValue.textContent = currentScore.toString();
        console.log(`✅ UI Updated: scoreValue.textContent = "${scoreValue.textContent}"`);
    } else {
        console.log(`❌ scoreValue element not found!`);
    }
});

effect(() => {
    const difficulty = difficultyLevelAtom();
    console.log(`🎲 UI Difficulty Update: ${difficulty}`);

    if (difficultyCube) {
        difficultyCube.textContent = difficulty.toString();
        console.log(`✅ UI Updated: difficultyCube.textContent = "${difficultyCube.textContent}"`);
    }

    if (difficultyValue) {
        difficultyValue.textContent = `${difficulty}x${difficulty}x${difficulty}`;
        console.log(`✅ UI Updated: difficultyValue.textContent = "${difficultyValue.textContent}"`);
    }
});

effect(() => {
    // Реагируем на изменение цветного режима
    const isColored = coloredModeAtom();
    console.log(`🎨 Цветной режим изменился: ${isColored}`);

    // Обновляем визуализацию упавших блоков только если игра идет
    if (gameStateAtom() === GameState.PLAYING) {
        updateLandedVisuals();
    }
});

// Effect для обновления превью следующей фигуры
effect(() => {
    const nextPieceType = nextPieceAtom();
    const gameState = gameStateAtom();
    
    // Обновляем превью только когда игра идет или на паузе
    if ((gameState === GameState.PLAYING || gameState === GameState.PAUSED) && nextPieceType) {
        updateNextPiecePreview();
    } else {
        // Очищаем превью в меню или при game over
        while (nextPieceContainer.children.length > 0) {
            const child = nextPieceContainer.children[0];
            disposeObject3D(child);
            nextPieceContainer.remove(child);
        }
    }
});

// Controls
window.addEventListener('keydown', (event) => {
    const state = gameStateAtom();
    if (state === GameState.MENU && (event.code === 'Enter' || event.code === 'Space')) {
        event.preventDefault();
        gameStateAtom.setPlaying();
    }

    if (state === GameState.GAME_OVER) {
        if (event.code === 'Enter' || event.code === 'Space') {
            event.preventDefault();
            gameStateAtom.setPlaying();
        } else if (event.code === 'Escape') {
            event.preventDefault();
            gameStateAtom.setMenu();
        }
    }

    if (state === GameState.PAUSED) {
        if (event.code === 'Escape' || event.code === 'Enter' || event.code === 'Space') {
            event.preventDefault();
            gameStateAtom.setPlaying();
        }
    }

    if (state === GameState.PLAYING && !isFieldRotating) {
        switch (event.code) {
            case 'ArrowUp': movePieceRelativeToField(0, 0, -1); break;
            case 'ArrowLeft': movePieceRelativeToField(-1, 0, 0); break;
            case 'ArrowRight': movePieceRelativeToField(1, 0, 0); break;
            case 'ArrowDown': movePieceRelativeToField(0, 0, 1); break;
            case 'Space': event.preventDefault(); dropPiece(); break;
            case 'KeyS': movePiece(0, -1, 0); break;
            case 'KeyA': rotateField(1); break;
            case 'KeyD': rotateField(-1); break;
            case 'KeyX': toggleAxesHelper(); break;
            case 'KeyP': toggleWallProjections(); break;
            case 'Escape': gameStateAtom.setPaused(); break;
            case 'Enter':
                event.preventDefault();
                cameraMode = cameraMode === 'front' ? 'top' : 'front';
                updateCameraModeIndicator();
                console.log(`🎥 Camera mode: ${cameraMode}`);
                break;
            case 'F1':
                event.preventDefault();
                controlsHelpVisible = !controlsHelpVisible;
                if (controlsHelp) {
                    controlsHelp.classList.toggle('collapsed', !controlsHelpVisible);
                }
                console.log(`📋 Controls help: ${controlsHelpVisible ? 'показаны' : 'скрыты'}`);
                break;
            case 'F2':
                event.preventDefault();
                coloredModeAtom.toggle();
                console.log(`🎨 Цветной режим: ${coloredModeAtom() ? 'включен' : 'выключен'}`);
                break;
            case 'KeyQ': {
                const r = rotateInViewPlane(currentPieceBlocks);
                if (canPlacePiece(r, currentPiecePosition)) {
                    cancelLockDelay(); // Отменяем lock delay при успешном вращении
                    currentPieceBlocks = r;
                    updateMinimap();
                    updateVisuals();
                    // Проверяем, находится ли фигура на земле после вращения
                    if (isOnGround()) startLockDelay();
                }
                break;
            }
            case 'KeyW': {
                const r = rotateVertical(currentPieceBlocks);
                if (canPlacePiece(r, currentPiecePosition)) {
                    cancelLockDelay(); // Отменяем lock delay при успешном вращении
                    currentPieceBlocks = r;
                    updateMinimap();
                    updateVisuals();
                    // Проверяем, находится ли фигура на земле после вращения
                    if (isOnGround()) startLockDelay();
                }
                break;
            }
            case 'KeyE': {
                const r = rotateSide(currentPieceBlocks);
                if (canPlacePiece(r, currentPiecePosition)) {
                    cancelLockDelay(); // Отменяем lock delay при успешном вращении
                    currentPieceBlocks = r;
                    updateMinimap();
                    updateVisuals();
                    // Проверяем, находится ли фигура на земле после вращения
                    if (isOnGround()) startLockDelay();
                }
                break;
            }
            case 'Digit2':
                console.log(`🎲 Переключение на уровень 2...`);
                difficultyLevelAtom.setLevel(2);
                console.log(`🎲 Атом обновлён. Текущий уровень: ${difficultyLevelAtom()}`);
                // Небольшая задержка для обновления атома, затем очистка
                setTimeout(() => {
                    console.log(`🎲 Запуск очистки с уровнем: ${difficultyLevelAtom()}`);
                    gameActions.clearLines();
                    updateVisuals();
                    updateMinimap();
                    console.log(`🎲 Очистка завершена`);
                }, 10);
                console.log(`Сложность установлена: 2x2x2`);
                break;
            case 'Digit3':
                difficultyLevelAtom.setLevel(3);
                setTimeout(() => {
                    gameActions.clearLines();
                    updateVisuals();
                    updateMinimap();
                }, 10);
                console.log(`Сложность установлена: 3x3x3`);
                break;
            case 'Digit4':
                difficultyLevelAtom.setLevel(4);
                setTimeout(() => {
                    gameActions.clearLines();
                    updateVisuals();
                    updateMinimap();
                }, 10);
                console.log(`Сложность установлена: 4x4x4`);
                break;
            case 'Digit5':
                difficultyLevelAtom.setLevel(5);
                setTimeout(() => {
                    gameActions.clearLines();
                    updateVisuals();
                    updateMinimap();
                }, 10);
                console.log(`Сложность установлена: 5x5x5`);
                break;
        }
    }
});

// Game Loop

for (let i = 0; i < 8; i++) {
    setTimeout(() => createFallingPiece(), i * 1000);
}
setInterval(() => {
    if (gameStateAtom() === GameState.MENU) createFallingPiece();
}, 2000);

function animate() {
    requestAnimationFrame(animate);
    const state = gameStateAtom();

    if (state === GameState.MENU) {
        // Ограничиваем максимальное количество падающих фигур
        const maxFallingPieces = 12;

        fallingPieces.forEach((p, i) => {
            p.position.y -= p.fallSpeed;
            p.rotation.x += p.rotationSpeed.x;
            p.rotation.y += p.rotationSpeed.y;
            p.rotation.z += p.rotationSpeed.z;
            if (p.position.y < -20) {
                disposeObject3D(p);
                menuContainer.remove(p);
                fallingPieces.splice(i, 1);
            }
        });

        // Удаляем лишние фигуры если их слишком много
        while (fallingPieces.length > maxFallingPieces) {
            const p = fallingPieces.shift()!;
            disposeObject3D(p);
            menuContainer.remove(p);
        }
        const time = Date.now() * 0.001;
        pointLight1.position.x = Math.sin(time * 0.7) * 10;
        pointLight1.position.z = Math.cos(time * 0.7) * 10;
        pointLight2.position.x = Math.cos(time * 0.5) * 10;
        pointLight2.position.z = Math.sin(time * 0.5) * 10;
        updateCameraForMenu();
    } else if (state === GameState.PLAYING || state === GameState.PAUSED) {
        if (state === GameState.PAUSED) {
            // В режиме паузы только обновляем визуализацию, но не логику игры
            renderer.render(scene, camera);
            return;
        }
        // Обновляем камеру для игры
        updateDynamicCamera();

        // ИСПРАВЛЕНО: обновляем позицию напрямую вместо пересоздания всей визуализации
        if (isAnimating && pieceVisuals) {
            const elapsed = Date.now() - animationStartTime;
            const progress = Math.min(elapsed / PIECE_ANIMATION_DURATION, 1);
            const easeProgress = 1 - (1 - progress) ** 3;

            const renderPosition = {
                x: animationStartPosition.x + (animationTargetPosition.x - animationStartPosition.x) * easeProgress,
                y: animationStartPosition.y + (animationTargetPosition.y - animationStartPosition.y) * easeProgress,
                z: animationStartPosition.z + (animationTargetPosition.z - animationStartPosition.z) * easeProgress
            };

            // Просто обновляем позицию группы вместо пересоздания
            pieceVisuals.children.forEach((child, i) => {
                if (i < currentPieceBlocks.length * 2) { // куб + wireframe
                    const blockIndex = Math.floor(i / 2);
                    const block = currentPieceBlocks[blockIndex];
                    const x = renderPosition.x + block.x;
                    const y = renderPosition.y + block.y;
                    const z = renderPosition.z + block.z;
                    child.position.set(x - FIELD_WIDTH / 2 + 0.5, y - FIELD_HEIGHT / 2 + 0.5, z - FIELD_DEPTH / 2 + 0.5);
                }
            });

            // ИСПРАВЛЕНО: обновляем проекции во время анимации
            if (projectionsVisible) updateWallProjections(renderPosition);

            // Обновляем мини-карту во время анимации
            updateMinimap();

            if (progress >= 1) {
                isAnimating = false;
                currentPiecePosition = { ...animationTargetPosition };
            }
        }

        // Новая логика падения с раздельными таймерами
        checkDropTimer(); // Обновляем состояние таймера падения

        // Если стандартный таймер истек
        if (dropTimerExpired) {
            const canFallDown = canPlacePiece(currentPieceBlocks, { ...currentPiecePosition, y: currentPiecePosition.y - 1 });

            if (canFallDown) {
                // Фигура может упасть
                if (lockDelayActive) {
                    // Во время lock delay, но можем упасть - роняем и перезапускаем таймеры
                    cancelLockDelay();
                }
                movePiece(0, -1, 0);
                startDropTimer(); // Запускаем новый цикл стандартного таймера
            } else {
                // Фигура не может упасть - включаем lock delay если еще не включен
                if (!lockDelayActive) {
                    startLockDelay();
                }
                // Сбрасываем флаг истечения, но не перезапускаем таймер (он будет работать в фоне)
                dropTimerExpired = false;
            }
        }

        // Миникарта анимируется синхронно с основной сценой в animateRotation()
    }

    // Вращение предпросмотра следующей фигуры
    const currentGameState = gameStateAtom();
    if (nextPieceScene && (currentGameState === GameState.PLAYING || currentGameState === GameState.PAUSED)) {
        const time = Date.now() * 0.001;
        nextPieceScene.children.forEach(child => {
            if (child.userData.isNextPiece) {
                child.rotation.y = time * 0.8; // Плавное вращение вокруг Y оси
            }
        });
        
        // Рендерим предпросмотр следующей фигуры
        if (nextPieceRenderer && nextPieceCamera && nextPieceAtom()) {
            nextPieceRenderer.render(nextPieceScene, nextPieceCamera);
        }
    }

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

console.log('3D Tetris Initialized');
