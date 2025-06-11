import './style.css'
import * as THREE from 'three';
import { effect } from '@reatom/core';
import {
    gameStateAtom,
    scoreAtom,
    fieldRotationAtom,
    coloredModeAtom,
    difficultyLevelAtom,
    lockDelayTimerVisibleAtom,
    nextPieceAtom,
    tetrominoShapes,
    tetrominoColors,
    gameActions,
    getRandomPiece,
    rotateInViewPlane,
    rotateVertical,
    rotateSide,
    canPlacePieceCompat,
    gameFieldAtom,
    currentPieceAtom
} from './game-logic';
import { lockDelayTimerWidget } from './widgets/lock-delay-indicator.ts';
import './models/lock-delay'; // Инициализируем модель lock delay
import { lockDelayAtom } from './models/lock-delay';
import {
    GameState,
    FIELD_WIDTH,
    FIELD_DEPTH,
    FIELD_HEIGHT,
    BLOCK_SIZE,
    FIELD_ROTATION_DURATION,
    PIECE_ANIMATION_DURATION,
    LANDED_BLOCKS_OPACITY,
    DYNAMIC_CAMERA_DISTANCE,
    DYNAMIC_CAMERA_MIN_DISTANCE,
    DYNAMIC_CAMERA_SMOOTH,
    FIELD_TOP_Y,
    FIELD_BOTTOM_Y,
    FIELD_SCALE_XZ,
    FIELD_SCALE_Y,
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

// Scale block size to keep visual dimensions consistent when the logical field
// dimensions change
const BLOCK_SIZE_XZ = BLOCK_SIZE * FIELD_SCALE_XZ;
const BLOCK_SIZE_Y = BLOCK_SIZE * FIELD_SCALE_Y;

// Shared geometries for memory optimization
const sharedBlockGeometry = new THREE.BoxGeometry(BLOCK_SIZE_XZ, BLOCK_SIZE_Y, BLOCK_SIZE_XZ);
const sharedEdgesGeometry = new THREE.EdgesGeometry(sharedBlockGeometry);

// Простая миникарта с ортогональной камерой над реальным стаканом
let minimapRenderer: THREE.WebGLRenderer;
let minimapCamera: THREE.OrthographicCamera;

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
const sharedPlaneGeometryHorizontal = new THREE.PlaneGeometry(BLOCK_SIZE_XZ, BLOCK_SIZE_XZ);
const sharedPlaneGeometryVertical = new THREE.PlaneGeometry(BLOCK_SIZE_XZ, BLOCK_SIZE_Y);

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
                meshOrLine.geometry !== sharedPlaneGeometryHorizontal &&
                meshOrLine.geometry !== sharedPlaneGeometryVertical) {
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


// Используем tetrominoShapes и tetrominoColors из game-logic.ts

// Функция getRandomPiece импортирована из game-logic.ts

// Game data (migrated to currentPieceAtom)

// Анимация движения фигур
let isAnimating = false;
let animationStartTime = 0;
let animationStartPosition = { x: 0, y: 0, z: 0 };
let animationTargetPosition = { x: 0, y: 0, z: 0 };

// Lock delay механика (теперь через Reatom)

// (Drop timer не нужен - всё управляется через lock delay)


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
    const emptyField = Array(FIELD_HEIGHT).fill(null).map(() => Array(FIELD_DEPTH).fill(null).map(() => Array(FIELD_WIDTH).fill(null)));
    gameFieldAtom.set(emptyField);
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
    currentPieceAtom.clear();

    rotationContainer.rotation.y = 0;

    createFieldBoundaries();
    createWallGrids();
}

function restartGame() {
    resetGameState();

    if (!nextPieceAtom()) {
        const newPiece = getRandomPiece();
        nextPieceAtom.update(newPiece);
    }

    spawnNewPiece();
    gameStateAtom.setPlaying();
}

// Базовые функции вращения вокруг осей



// Lock delay logic теперь полностью в game-logic.ts через эффекты

// Lock delay таймер теперь в отдельном модуле models/lock-delay-indicator.ts

// Старая функция удалена - теперь визуальное обновление идет через эффект выше

// (Drop timer функции удалены - всё управляется lock delay)

// isOnGround теперь через isOnGroundAtom - эта функция больше не нужна





function spawnNewPiece() {
    // Сбрасываем состояние таймеров и счетчики
    // Lock delay теперь управляется через эффект

    // Получаем тип следующей фигуры из nextPieceAtom
    let pieceType = nextPieceAtom();

    // Если nextPiece еще не установлен (первый запуск), генерируем случайную фигуру
    if (!pieceType) {
        pieceType = getRandomPiece();
    }

    // Создаем временную фигуру для проверки коллизий ПЕРЕД spawn
    const testBlocks = [...tetrominoShapes[pieceType]];
    const testPosition = {
        x: Math.floor(FIELD_WIDTH / 2),
        y: FIELD_HEIGHT - 2,
        z: Math.floor(FIELD_DEPTH / 2)
    };

    // Проверяем, можем ли разместить фигуру
    if (!canPlacePieceCompat(testBlocks, testPosition)) {
        gameStateAtom.setGameOver();
        return;
    }

    // Устанавливаем новую следующую фигуру
    nextPieceAtom.update(getRandomPiece());

    // Только теперь создаем фигуру, когда знаем что место свободно
    currentPieceAtom.spawn(pieceType);

    console.log(`🔮 Spawned piece: ${pieceType}, Next piece: ${nextPieceAtom()}`);

    // Lock delay запустится автоматически через эффект если фигура на земле
    updateVisuals();
}


function updateVisuals() {
    if (pieceVisuals) {
        disposeObject3D(pieceVisuals);
        gameContainer.remove(pieceVisuals);
    }

    const piece = currentPieceAtom();
    if (piece) {
        // ИСПРАВЛЕНО: используем текущую позицию без дублирования логики анимации
        const renderPosition = piece.position;

        pieceVisuals = new THREE.Group();
        const color = tetrominoColors[piece.type];
        // Создаем новый материал для активной фигуры (не используем shared pool)
        const material = new THREE.MeshPhongMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: false
        });

        for (const block of piece.blocks) {
            const cube = new THREE.Mesh(sharedBlockGeometry, material);
            const x = renderPosition.x + block.x;
            const y = renderPosition.y + block.y;
            const z = renderPosition.z + block.z;
            cube.position.set(
                (x - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                (y - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                (z - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            );
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
    const bottomVertices: number[] = [];
    const bottomY = (-FIELD_HEIGHT / 2 + 0.005) * FIELD_SCALE_Y; // Чуть выше дна
    for (let x = 0; x <= FIELD_WIDTH; x++) bottomVertices.push(
        (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ, bottomY, -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ, bottomY, (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    );
    for (let z = 0; z <= FIELD_DEPTH; z++) bottomVertices.push(
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2, bottomY, (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2, bottomY, (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ
    );
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
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    );
    for (let z = 0; z <= FIELD_DEPTH; z++) vertices.push(
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        -FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    leftWallGridGroup.add(grid);

    // Добавляем желтую линию спавна (минимальная высота для нижних блоков фигур)
    const spawnY = ((FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    ];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    leftWallGridGroup.add(spawnLine);

    fieldContainer.add(leftWallGridGroup);
}

function createRightWallGrid(material: THREE.LineBasicMaterial) {
    rightWallGridGroup = new THREE.Group();
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    );
    for (let z = 0; z <= FIELD_DEPTH; z++) vertices.push(
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        -FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    rightWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = ((FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    ];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    rightWallGridGroup.add(spawnLine);

    fieldContainer.add(rightWallGridGroup);
}

function createBackWallGrid(material: THREE.LineBasicMaterial) {
    backWallGridGroup = new THREE.Group();
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    );
    for (let x = 0; x <= FIELD_WIDTH; x++) vertices.push(
        (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
        -FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
        FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    backWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = ((FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    ];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    backWallGridGroup.add(spawnLine);

    fieldContainer.add(backWallGridGroup);
}

function createFrontWallGrid(material: THREE.LineBasicMaterial) {
    frontWallGridGroup = new THREE.Group();
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++) vertices.push(
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    );
    for (let x = 0; x <= FIELD_WIDTH; x++) vertices.push(
        (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
        -FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
        FIELD_HEIGHT * FIELD_SCALE_Y / 2,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    frontWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = ((FIELD_HEIGHT - 3) - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2
    ];
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
                const pieceType = gameFieldAtom()[y][z][x];
                if (pieceType) {
                    const originalColor = tetrominoColors[pieceType as keyof typeof tetrominoColors];
                    const color = coloredModeAtom() ? originalColor : FROZEN_FIGURE_COLOR; // Серый цвет если цветной режим выключен
                    const material = getBlockMaterial(color);
                    const cube = new THREE.Mesh(sharedBlockGeometry, material);
                    cube.position.set(
                        (x - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                        (y - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                        (z - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
                    );
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
    const piece = currentPieceAtom();
    if (!piece) return;

    // Используем переданную позицию или текущую позицию фигуры
    const projectionPosition = renderPosition || piece.position;

    if (bottomProjectionGroup) gameContainer.remove(bottomProjectionGroup);
    if (leftProjectionGroup) gameContainer.remove(leftProjectionGroup);
    if (rightProjectionGroup) gameContainer.remove(rightProjectionGroup);
    if (backProjectionGroup) gameContainer.remove(backProjectionGroup);
    if (obstacleHighlightsGroup) gameContainer.remove(obstacleHighlightsGroup);

    const projectionMaterial = new THREE.MeshBasicMaterial({
        color: tetrominoColors[piece.type],
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
        for (const testBlock of piece.blocks) {
            const testWorldX = Math.round(projectionPosition.x + testBlock.x);
            const testWorldZ = Math.round(projectionPosition.z + testBlock.z);
            const testBlockY = testY + testBlock.y;

            // Проверяем границы и коллизии
            if (testBlockY < 0 || // Ниже дна
                testWorldX < 0 || testWorldX >= FIELD_WIDTH ||
                testWorldZ < 0 || testWorldZ >= FIELD_DEPTH ||
                (gameFieldAtom()[testBlockY] && gameFieldAtom()[testBlockY][testWorldZ][testWorldX] !== null)) {
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
    for (const block of piece.blocks) {
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
            const whitePlane = new THREE.Mesh(sharedPlaneGeometryHorizontal, materialPools.projectionWhite);
            whitePlane.rotation.x = -Math.PI / 2;
            whitePlane.position.set(
                (worldX - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                -FIELD_HEIGHT * FIELD_SCALE_Y / 2 + 0.01,
                (worldZ - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            );
            bottomProjectionGroup.add(whitePlane);
        }
        // Если под блоком есть препятствие в финальной позиции
        else if (underBlockY >= 0 && gameFieldAtom()[underBlockY] && gameFieldAtom()[underBlockY][worldZ][worldX] !== null) {
            // Белая проекция на препятствии
            const whitePlane = new THREE.Mesh(sharedPlaneGeometryHorizontal, materialPools.projectionWhite);
            whitePlane.rotation.x = -Math.PI / 2;
            whitePlane.position.set(
                (worldX - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                (underBlockY - FIELD_HEIGHT / 2 + 0.5 + BLOCK_SIZE / 2 + 0.001) * FIELD_SCALE_Y,
                (worldZ - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            );
            bottomProjectionGroup.add(whitePlane);
        }
        // Если под блоком пустота - ищем первое препятствие/дно ниже
        else {
            // Красная проекция - ищем первое препятствие ниже финальной позиции блока
            let redProjectionY = -FIELD_HEIGHT * FIELD_SCALE_Y / 2 + 0.01; // По умолчанию на дне

            for (let y = underBlockY - 1; y >= 0; y--) {
                if (gameFieldAtom()[y] && gameFieldAtom()[y][worldZ][worldX] !== null) {
                    redProjectionY = (y - FIELD_HEIGHT / 2 + 0.5 + BLOCK_SIZE / 2 + 0.001) * FIELD_SCALE_Y;
                    break;
                }
            }
            const redPlane = new THREE.Mesh(sharedPlaneGeometryHorizontal, materialPools.projectionRed);
            redPlane.rotation.x = -Math.PI / 2;
            redPlane.position.set(
                (worldX - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                redProjectionY,
                (worldZ - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
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
            backWallCoords = (block) => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 - 0.01
            });
            leftWallCoords = (block) => ({
                x: -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2 - 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            });
            rightWallCoords = (block) => ({
                x: (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            });
            backWallRotation = { x: 0, y: Math.PI, z: 0 };
            leftWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            rightWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            break;
        case 1:
            backWallCoords = (block) => ({
                x: (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            });
            leftWallCoords = (block) => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 0.01
            });
            rightWallCoords = (block) => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 - 0.01
            });
            backWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            leftWallRotation = { x: 0, y: 0, z: 0 };
            rightWallRotation = { x: 0, y: Math.PI, z: 0 };
            break;
        case 2:
            backWallCoords = (block) => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 0.01
            });
            leftWallCoords = (block) => ({
                x: (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            });
            rightWallCoords = (block) => ({
                x: -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2 - 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            });
            backWallRotation = { x: 0, y: 0, z: 0 };
            leftWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            rightWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            break;
        case 3:
            backWallCoords = (block) => ({
                x: -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2 - 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
            });
            leftWallCoords = (block) => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 - 0.01
            });
            rightWallCoords = (block) => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 0.01
            });
            backWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            leftWallRotation = { x: 0, y: Math.PI, z: 0 };
            rightWallRotation = { x: 0, y: 0, z: 0 };
            break;
    }

    const createProjectionGroup = (coordsFunc: (b: Block3D) => {x:number, y:number, z:number}, rotation: {x:number, y:number, z:number}) => {
        const group = new THREE.Group();
        for (const block of piece.blocks) {
            const coords = coordsFunc(block);
            // ИСПРАВЛЕНО: используем shared геометрию
            const plane = new THREE.Mesh(sharedPlaneGeometryVertical, projectionMaterial.clone());
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
        axesHelper.position.set(0, (-FIELD_HEIGHT / 2 + 2) * FIELD_SCALE_Y, 0); // Подняли на 2 единицы выше дна
        fieldContainer.add(axesHelper);
    }
}

function toggleWallProjections() {
    projectionsVisible = !projectionsVisible;
    if (projectionsVisible) {
        if (currentPieceAtom()) updateWallProjections();
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

    frontWallMesh = createWall(new THREE.PlaneGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y), [0, 0, -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2], [0, 0, 0]);
    backWallMesh = createWall(new THREE.PlaneGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y), [0, 0, (FIELD_DEPTH * FIELD_SCALE_XZ) / 2], [0, Math.PI, 0]);
    leftWallMesh = createWall(new THREE.PlaneGeometry(FIELD_DEPTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y), [-(FIELD_WIDTH * FIELD_SCALE_XZ) / 2, 0, 0], [0, Math.PI / 2, 0]);
    rightWallMesh = createWall(new THREE.PlaneGeometry(FIELD_DEPTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y), [(FIELD_WIDTH * FIELD_SCALE_XZ) / 2, 0, 0], [0, -Math.PI / 2, 0]);
    fieldContainer.add(frontWallMesh, backWallMesh, leftWallMesh, rightWallMesh);

    updateWallsOpacity();

    // Добавляем светло-голубое дно стакана
    const bottomMaterial = new THREE.MeshPhongMaterial({ color: 0x87ceeb, side: THREE.DoubleSide });
    const bottomMesh = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_DEPTH * FIELD_SCALE_XZ), bottomMaterial);
    bottomMesh.rotation.x = -Math.PI / 2;
    bottomMesh.position.set(0, -FIELD_HEIGHT * FIELD_SCALE_Y / 2, 0);
    bottomMesh.receiveShadow = true;
    fieldContainer.add(bottomMesh);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y, FIELD_DEPTH * FIELD_SCALE_XZ));
    const wireframe = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 2, transparent: true, opacity: 0.7 }));
    fieldContainer.add(wireframe);
}

function movePiece(dx: number, dy: number, dz: number) {
    // Проверяем, можем ли мы начать анимацию (не анимируемся уже)
    if (isAnimating) return;

    const piece = currentPieceAtom();
    if (!piece) return;

    const newPos = { x: piece.position.x + dx, y: piece.position.y + dy, z: piece.position.z + dz };
    if (canPlacePieceCompat(piece.blocks, newPos)) {
        // Начинаем анимацию к новой позиции
        isAnimating = true;
        animationStartTime = Date.now();
        animationStartPosition = { ...piece.position };
        animationTargetPosition = newPos;

        // Сразу обновляем логическую позицию через Reatom action
        currentPieceAtom.move(dx, dy, dz);
        // Lock delay будет обновлен автоматически через effect при изменении позиции

        // Обновляем миникарту при движении фигуры
        updateMinimap();
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









function dropPiece() {
    // Если анимация идет, завершаем ее немедленно
    if (isAnimating) {
        isAnimating = false;
        // Animation will complete automatically with atom state
        updateVisuals();
    }

    const piece = currentPieceAtom();
    if (!piece) return;

    // Найти конечную позицию падения
    let targetY = piece.position.y;
    while (canPlacePieceCompat(piece.blocks, { ...piece.position, y: targetY - 1 })) {
        targetY--;
    }

    // Если есть куда падать - анимируем
    if (targetY < piece.position.y) {
        isAnimating = true;
        animationStartTime = Date.now();
        animationStartPosition = { ...piece.position };
        animationTargetPosition = { ...piece.position, y: targetY };

        // Обновляем позицию через Reatom action
        currentPieceAtom.move(0, targetY - piece.position.y, 0);
        // Lock delay автоматически запустится через effect когда фигура коснется земли
    }
    // Если некуда падать - lock delay уже должен быть активен
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
            if (currentPieceAtom()) updateVisuals();
            createWallGrids();
            updateWallsOpacity();
        }
    }
    requestAnimationFrame(animateRotation);
}

function createFallingPiece() {
    // Только основные фигуры для заставки, без тестовых
    const normalShapes: (keyof typeof tetrominoShapes)[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const randomShape = normalShapes[Math.floor(Math.random() * normalShapes.length)];
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
    const halfWidth = (FIELD_WIDTH / 2 - 0.5) * FIELD_SCALE_XZ;
    const halfDepth = (FIELD_DEPTH / 2 - 0.5) * FIELD_SCALE_XZ;

    const edgeCenters = [
        new THREE.Vector3(0, FIELD_TOP_Y * FIELD_SCALE_Y, halfDepth),        // Переднее ребро (центр)
        new THREE.Vector3(0, FIELD_TOP_Y * FIELD_SCALE_Y, -halfDepth),       // Заднее ребро (центр)
        new THREE.Vector3(halfWidth, FIELD_TOP_Y * FIELD_SCALE_Y, 0),        // Правое ребро (центр)
        new THREE.Vector3(-halfWidth, FIELD_TOP_Y * FIELD_SCALE_Y, 0)        // Левое ребро (центр)
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
    const fieldCenterBottom = new THREE.Vector3(0, FIELD_BOTTOM_Y * FIELD_SCALE_Y, 0);

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
    const size = (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 1;
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
        cube.scale.set(1 / FIELD_SCALE_XZ, 1 / FIELD_SCALE_Y, 1 / FIELD_SCALE_XZ);
        cube.position.set(block.x, block.y, block.z);
        cube.castShadow = true;
        cube.receiveShadow = true;
        pieceGroup.add(cube);

        // Добавляем контур
        const wireframe = new THREE.LineSegments(sharedEdgesGeometry, materialPools.edges);
        wireframe.scale.copy(cube.scale);
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
let startButton: HTMLButtonElement, restartButton: HTMLButtonElement, pauseRestartButton: HTMLButtonElement, mainMenuButton: HTMLButtonElement, resumeButton: HTMLButtonElement, pauseMenuButton: HTMLButtonElement, startMenu: HTMLDivElement, pauseMenu: HTMLDivElement, scoreDisplay: HTMLDivElement, scoreValue: HTMLSpanElement, gameOverMenu: HTMLDivElement, perspectiveGrid: HTMLDivElement, cameraModeIndicator: HTMLDivElement, cameraIcon: HTMLDivElement, cameraModeText: HTMLDivElement, controlsHelp: HTMLDivElement, minimapContainer: HTMLDivElement, nextPieceUIContainer: HTMLDivElement, difficultyDisplay: HTMLDivElement, difficultyCube: HTMLDivElement, difficultyValue: HTMLDivElement;

// Lock Delay Timer теперь в models/lock-delay-indicator.ts

// Мини-карта
let minimapCanvas: HTMLCanvasElement;
let _prevState: GameStateType = gameStateAtom();
let menuButtons: HTMLButtonElement[] = [];
let menuIndex = 0;

function updateMenuSelection() {
    menuButtons.forEach((btn, idx) => {
        if (idx === menuIndex) {
            btn.classList.add('selected');
            btn.focus({ preventScroll: true });
        } else {
            btn.classList.remove('selected');
        }
    });
}

function setMenuButtons(buttons: HTMLButtonElement[]) {
    menuButtons = buttons;
    menuIndex = 0;
    updateMenuSelection();
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 DOM Content Loaded - Initializing UI elements...');

    startButton = document.getElementById('start-button') as HTMLButtonElement;
    restartButton = document.getElementById('restart-button') as HTMLButtonElement;
    pauseRestartButton = document.getElementById('restart-pause-button') as HTMLButtonElement;
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

    // Lock Delay Timer будет создан динамически когда понадобится

    // Инициализация мини-карты
    initializeMinimap();

    // Инициализация превью следующей фигуры
    initializeNextPiecePreview();

    // Инициализируем lock delay timer widget
    lockDelayTimerWidget.initialize();

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

    pauseRestartButton.addEventListener('click', () => {
        restartGame();
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

    setMenuButtons([startButton]);

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

    if (state !== _prevState) {
        if (isMenu) {
            setMenuButtons([startButton]);
        } else if (isPaused) {
            setMenuButtons([resumeButton, pauseRestartButton, pauseMenuButton]);
        } else if (isGameOver) {
            setMenuButtons([restartButton, mainMenuButton]);
        } else {
            menuButtons.forEach(btn => btn.classList.remove('selected'));
            menuButtons = [];
        }
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

    if (state === GameState.PAUSED && event.code === 'Escape') {
        event.preventDefault();
        gameStateAtom.setPlaying();
        return;
    }

    if (state === GameState.GAME_OVER && event.code === 'Escape') {
        event.preventDefault();
        gameStateAtom.setMenu();
        return;
    }

    if (state === GameState.MENU || state === GameState.PAUSED || state === GameState.GAME_OVER) {
        if (menuButtons.length > 0) {
            if (event.code === 'ArrowUp') {
                event.preventDefault();
                menuIndex = (menuIndex - 1 + menuButtons.length) % menuButtons.length;
                updateMenuSelection();
                return;
            } else if (event.code === 'ArrowDown') {
                event.preventDefault();
                menuIndex = (menuIndex + 1) % menuButtons.length;
                updateMenuSelection();
                return;
            } else if (event.code === 'Enter' || event.code === 'Space') {
                event.preventDefault();
                menuButtons[menuIndex].click();
                return;
            }
        }
    }

    if (state === GameState.PLAYING && !isFieldRotating) {
        switch (event.code) {
            case 'ArrowUp': movePieceRelativeToField(0, 0, -1); break;
            case 'ArrowLeft': movePieceRelativeToField(-1, 0, 0); break;
            case 'ArrowRight': movePieceRelativeToField(1, 0, 0); break;
            case 'ArrowDown': movePieceRelativeToField(0, 0, 1); break;
            case 'Space':
                event.preventDefault();
                const piece = currentPieceAtom();
                if (piece) {
                    // Проверяем может ли фигура упасть еще ниже
                    const canFallDown = canPlacePieceCompat(piece.blocks, { ...piece.position, y: piece.position.y - 1 });

                    if (canFallDown) {
                        // Фигура может упасть - обычное падение до дна
                        dropPiece();
                    } else {
                        // Фигура не может упасть и lock delay активен - принудительная фиксация
                        const lockDelayState = lockDelayAtom();
                        if (lockDelayState.active) {
                            lockDelayAtom.forceLock();
                            gameActions.placePiece();
                            console.log('⚡ Принудительная фиксация фигуры по пробелу!');
                        }
                        // Если lock delay неактивен - ничего не делаем (фигура уже зафиксирована)
                    }
                }
                break;
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
            case 'F3':
                event.preventDefault();
                lockDelayTimerVisibleAtom.toggle();
                break;
            case 'KeyQ': {
                const piece = currentPieceAtom();
                if (!piece) break;
                const r = rotateInViewPlane(piece.blocks);
                if (canPlacePieceCompat(r, piece.position)) {
                    currentPieceAtom.rotate(r);
                    updateMinimap();
                    updateVisuals();
                    // Lock delay будет обновлен автоматически через effect
                }
                break;
            }
            case 'KeyW': {
                const piece = currentPieceAtom();
                if (!piece) break;
                const r = rotateVertical(piece.blocks);
                if (canPlacePieceCompat(r, piece.position)) {
                    currentPieceAtom.rotate(r);
                    updateMinimap();
                    updateVisuals();
                    // Lock delay будет обновлен автоматически через effect
                }
                break;
            }
            case 'KeyE': {
                const piece = currentPieceAtom();
                if (!piece) break;
                const r = rotateSide(piece.blocks);
                if (canPlacePieceCompat(r, piece.position)) {
                    currentPieceAtom.rotate(r);
                    updateMinimap();
                    updateVisuals();
                    // Lock delay будет обновлен автоматически через effect
                }
                break;
            }
            case 'Digit2':
                difficultyLevelAtom.setLevel(2);
                console.log(`🎲 Установлена сложность: 2x2x2 (размер кубов для очистки)`);
                break;
            case 'Digit3':
                difficultyLevelAtom.setLevel(3);
                console.log(`🎲 Установлена сложность: 3x3x3 (размер кубов для очистки)`);
                break;
            case 'Digit4':
                difficultyLevelAtom.setLevel(4);
                console.log(`🎲 Установлена сложность: 4x4x4 (размер кубов для очистки)`);
                break;
            case 'Digit5':
                difficultyLevelAtom.setLevel(5);
                console.log(`🎲 Установлена сложность: 5x5x5 (размер кубов для очистки)`);
                break;
            case 'F5':
                event.preventDefault();
                gameActions.spawnTestPlane();
                updateVisuals();
                updateMinimap();
                console.log('🧪 Спавн тестового куба 5x5x5 с дыркой в центре');
                break;
            case 'F6':
                event.preventDefault();
                gameActions.spawnTestCube();
                updateVisuals();
                updateMinimap();
                console.log('🧪 Спавн тестового куба 2x2x2');
                break;
            case 'F7':
                event.preventDefault();
                gameActions.spawnTestI();
                updateVisuals();
                updateMinimap();
                console.log('🧪 Спавн обычной фигуры I для заполнения дырки');
                break;
            case 'F8':
                event.preventDefault();
                restartGame();
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
                const piece = currentPieceAtom();
                if (piece && i < piece.blocks.length * 2) { // куб + wireframe
                    const blockIndex = Math.floor(i / 2);
                    const block = piece.blocks[blockIndex];
                    const x = renderPosition.x + block.x;
                    const y = renderPosition.y + block.y;
                    const z = renderPosition.z + block.z;
                    child.position.set(
                        (x - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                        (y - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                        (z - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ
                    );
                }
            });

            // ИСПРАВЛЕНО: обновляем проекции во время анимации
            if (projectionsVisible) updateWallProjections(renderPosition);

            // Обновляем мини-карту во время анимации
            updateMinimap();

            if (progress >= 1) {
                isAnimating = false;
                // Animation complete - position is already updated in currentPieceAtom
            }
        }

        // Всё падение управляется через lock delay - основной цикл только для анимаций

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

// Автоматическое обновление визуализации при изменении текущей фигуры
effect(() => {
    const piece = currentPieceAtom();
    if (piece && gameStateAtom() === GameState.PLAYING) {
        updateVisuals();
    }
});

animate();

console.log('3D Tetris Initialized');
