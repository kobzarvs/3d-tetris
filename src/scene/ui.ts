import * as THREE from 'three';
import {
    CAMERA_START_Y,
    CAMERA_START_Z,
    DYNAMIC_CAMERA_DISTANCE,
    DYNAMIC_CAMERA_MIN_DISTANCE,
    DYNAMIC_CAMERA_SMOOTH,
    FIELD_BOTTOM_Y,
    FIELD_DEPTH,
    FIELD_HEIGHT,
    FIELD_SCALE_XZ,
    FIELD_SCALE_Y,
    FIELD_TOP_Y,
    FIELD_WIDTH,
    MINIMAP_SIZE,
} from '../constants';
import { nextPieceAtom, tetrominoColors, tetrominoShapes } from '../game-logic';
import {
    disposeObject3D,
    getBlockMaterial,
    materialPools,
    sharedBlockGeometry,
    sharedEdgesGeometry,
} from './materials';
import { pieceVisuals as importedPieceVisuals } from './pieces';

// Camera types and variables
export type CameraMode = 'front' | 'top';
export let cameraMode: CameraMode = 'front';
export let dynamicCameraTarget = new THREE.Vector3(0, 0, 0);
export let dynamicCameraPosition = new THREE.Vector3(1, 0, 36);

// Key hints variables
export let keyHintsVisible = true;
export let qHintMesh: THREE.Mesh | null = null;
export let wHintMesh: THREE.Mesh | null = null;
export let eHintMesh: THREE.Mesh | null = null;

// Controls help visibility
export let controlsHelpVisible = false;

// Minimap variables
let minimapRenderer: THREE.WebGLRenderer;
let minimapCamera: THREE.OrthographicCamera;
let minimapCanvas: HTMLCanvasElement;

// Next piece preview variables
let nextPieceRenderer: THREE.WebGLRenderer;
let nextPieceCamera: THREE.PerspectiveCamera;
let nextPieceScene: THREE.Scene;

// Hint constants and styling
const OFFSET_X = -6;
const OFFSET_Y = -2;
const OFFSET_Z = 8;
const HINT_COLOR = '#ccc';

/**
 * Рисует стрелку-дугу на canvas для хинтов вращения
 */
export function drawCircleArrow(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    lineW = 8,
    color1: string,
    color2: string,
) {
    // Параметры дуги (подобраны под картинку)
    let start = (4 * Math.PI) / 3;
    const sweep = Math.PI;
    const end = start + sweep;

    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color1;

    // Основная дуга
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end, false);
    ctx.stroke();

    // Наконечник
    const headLen = lineW * 1.75;
    start -= 0.3;
    const x = cx + r * Math.cos(start);
    const y = cy + r * Math.sin(start);
    const ax = cx + (r + headLen) * Math.cos(start + Math.PI / 6);
    const ay = cy + (r + headLen) * Math.sin(start + Math.PI / 6);
    const ax2 = cx + (r - headLen) * Math.cos(start + Math.PI / 6);
    const ay2 = cy + (r - headLen) * Math.sin(start + Math.PI / 6);

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax2, ay2);
    ctx.closePath();
    ctx.fillStyle = color2;
    ctx.fill();
}

// Конфигурация хинтов
interface HintConfig {
    letter: string;
    backgroundColor: string;
    accentColor: string;
    accentRect: { x: number; y: number; width: number; height: number };
    textPosition: { x: number; y: number };
    arrowPosition: { x: number; y: number };
    rotation?: { x?: number; y?: number; z?: number };
    position: { x: number; y: number; z: number };
    meshRef: () => THREE.Mesh | null;
    setMeshRef: (mesh: THREE.Mesh) => void;
}

export const HINT_CONFIGS: Record<'Q' | 'Q2' | 'W' | 'W2' | 'E' | 'E2', HintConfig> = {
    Q: {
        letter: 'Q',
        backgroundColor: '#111c2a50',
        accentColor: '#33f',
        accentRect: { x: 0, y: 0, width: 160, height: 1 },
        textPosition: { x: 80, y: 80 },
        arrowPosition: { x: 80, y: 80 },
        rotation: { y: Math.PI / 2 },
        position: {
            x: -4.0 * FIELD_SCALE_XZ + 3.2 + OFFSET_X,
            y: ((FIELD_HEIGHT - 7) * FIELD_SCALE_Y) / 3 + OFFSET_Y + 0.45,
            z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 1.6 + OFFSET_Z - 1,
        },
        meshRef: () => qHintMesh,
        setMeshRef: mesh => {
            qHintMesh = mesh;
        },
    },
    Q2: {
        letter: '',
        backgroundColor: '#111c2a50',
        accentColor: '#777',
        accentRect: { x: 0, y: 159, width: 160, height: 1 },
        textPosition: { x: 80, y: 80 },
        arrowPosition: { x: 9999, y: 9999 },
        rotation: { y: Math.PI / 2 },
        position: {
            x: -4.0 * FIELD_SCALE_XZ + OFFSET_X,
            y: ((FIELD_HEIGHT - 7) * FIELD_SCALE_Y) / 3 + OFFSET_Y + 0.45,
            z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 1.6 + OFFSET_Z - 1,
        },
        meshRef: () => qHintMesh,
        setMeshRef: mesh => {
            qHintMesh = mesh;
        },
    },
    W: {
        letter: 'W',
        backgroundColor: '#162232c0',
        accentColor: '#f33',
        accentRect: { x: 0, y: 159, width: 160, height: 1 },
        textPosition: { x: 70, y: 90 },
        arrowPosition: { x: 70, y: 80 },
        rotation: { x: -Math.PI / 2 },
        position: {
            x: -3.0 * FIELD_SCALE_XZ + 0.3 + OFFSET_X,
            y: ((FIELD_HEIGHT - 7) * FIELD_SCALE_Y) / 3 + OFFSET_Y + 2.05,
            z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 1.6 + OFFSET_Z - 1,
        },
        meshRef: () => wHintMesh,
        setMeshRef: mesh => {
            wHintMesh = mesh;
        },
    },
    W2: {
        letter: '',
        backgroundColor: '#162232c0',
        accentColor: '#777',
        accentRect: { x: 0, y: 0, width: 160, height: 1 },
        textPosition: { x: 70, y: 90 },
        arrowPosition: { x: 9999, y: 9999 },
        rotation: { x: -Math.PI / 2 },
        position: {
            x: -3.0 * FIELD_SCALE_XZ + 0.3 + OFFSET_X,
            y: ((FIELD_HEIGHT - 7) * FIELD_SCALE_Y) / 3 + OFFSET_Y + 0.45 - 1.6,
            z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 1.6 + OFFSET_Z - 1,
        },
        meshRef: () => wHintMesh,
        setMeshRef: mesh => {
            wHintMesh = mesh;
        },
    },
    E: {
        letter: 'E',
        backgroundColor: '#162232a0',
        accentColor: '#3f3',
        accentRect: { x: 159, y: 0, width: 1, height: 160 },
        textPosition: { x: 80, y: 80 },
        arrowPosition: { x: 80, y: 80 },
        position: {
            x: -4.0 * FIELD_SCALE_XZ + 1.6 + OFFSET_X,
            y: ((FIELD_HEIGHT - 7) * FIELD_SCALE_Y) / 3 + OFFSET_Y + 0.45,
            z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + OFFSET_Z + 3.2 - 1,
        },
        meshRef: () => eHintMesh,
        setMeshRef: mesh => {
            eHintMesh = mesh;
        },
    },
    E2: {
        letter: '',
        backgroundColor: '#162232a0',
        accentColor: '#777',
        accentRect: { x: 0, y: 0, width: 1, height: 160 },
        textPosition: { x: 80, y: 80 },
        arrowPosition: { x: 9999, y: 9999 },
        position: {
            x: -4.0 * FIELD_SCALE_XZ + 1.6 + OFFSET_X,
            y: ((FIELD_HEIGHT - 7) * FIELD_SCALE_Y) / 3 + OFFSET_Y + 0.45,
            z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + OFFSET_Z - 1,
        },
        meshRef: () => eHintMesh,
        setMeshRef: mesh => {
            eHintMesh = mesh;
        },
    },
};

/**
 * Универсальная функция создания хинта
 */
export function createHint(config: HintConfig): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const context = canvas.getContext('2d')!;

    // Фон
    context.fillStyle = config.backgroundColor;
    context.fillRect(0, 0, 160, 160);
    context.fill();

    // Акцентная полоса
    context.fillStyle = config.accentColor;
    const rect = config.accentRect;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.fill();

    // Текст
    context.fillStyle = HINT_COLOR;
    context.font = 'bold 80px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(config.letter, config.textPosition.x, config.textPosition.y);

    // Стрелка
    drawCircleArrow(context, config.arrowPosition.x, config.arrowPosition.y, 64, 6, HINT_COLOR, HINT_COLOR);

    // Создание mesh
    const texture = new THREE.CanvasTexture(canvas);
    const letterMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
    });

    const cellSize = FIELD_SCALE_XZ / FIELD_DEPTH;
    const letterGeometry = new THREE.PlaneGeometry(cellSize * 20, cellSize * 20);
    const letterMesh = new THREE.Mesh(letterGeometry, letterMaterial);

    // Применение вращения
    if (config.rotation) {
        if (config.rotation.x !== undefined) letterMesh.rotateX(config.rotation.x);
        if (config.rotation.y !== undefined) letterMesh.rotateY(config.rotation.y);
        if (config.rotation.z !== undefined) letterMesh.rotateZ(config.rotation.z);
    }

    // Позиционирование
    letterMesh.position.set(config.position.x, config.position.y, config.position.z);

    // Сохранение ссылки
    config.setMeshRef(letterMesh);

    return letterMesh;
}

/**
 * Создает визуальный хинт для клавиши Q (вращение вокруг бокового ребра)
 */
export function createQHint(): THREE.Mesh {
    return createHint(HINT_CONFIGS.Q);
}

/**
 * Создает визуальный хинт для клавиши W (вращение в плоскости обзора)
 */
export function createWHint(): THREE.Mesh {
    return createHint(HINT_CONFIGS.W);
}

/**
 * Создает визуальный хинт для клавиши E (вертикальное вращение)
 */
export function createEHint(): THREE.Mesh {
    return createHint(HINT_CONFIGS.E);
}

/**
 * Переключает видимость хинтов клавиш управления
 */
export function toggleKeyHints() {
    keyHintsVisible = !keyHintsVisible;

    // Обновляем видимость всех хинтов
    Object.values(HINT_CONFIGS).forEach(config => {
        const mesh = config.meshRef();
        if (mesh) {
            mesh.visible = keyHintsVisible;
        }
    });

    console.log(`🔤 Подсказки клавиш: ${keyHintsVisible ? 'показаны' : 'скрыты'}`);
}

/**
 * Переключает видимость справки по управлению
 */
export function toggleControlsHelp() {
    controlsHelpVisible = !controlsHelpVisible;
    const controlsHelp = document.getElementById('controls-help');
    if (controlsHelp) {
        controlsHelp.classList.toggle('collapsed', !controlsHelpVisible);
    }
    console.log(`📋 Controls help: ${controlsHelpVisible ? 'показаны' : 'скрыты'}`);
}

/**
 * Обновляет камеру для игрового режима (front view)
 */
export function updateCameraForGame(camera: THREE.PerspectiveCamera) {
    camera.position.set(0, CAMERA_START_Y, CAMERA_START_Z);
    camera.lookAt(0, 0, 0);
}

/**
 * Обновляет динамическую камеру в зависимости от режима
 */
export function updateDynamicCamera(camera: THREE.PerspectiveCamera) {
    if (cameraMode === 'front') {
        updateCameraForGame(camera);
        return;
    }

    const staticCameraPos = new THREE.Vector3(0, 0, 15.35);

    const halfWidth = (FIELD_WIDTH / 2 - 0.5) * FIELD_SCALE_XZ;
    const halfDepth = (FIELD_DEPTH / 2 - 0.5) * FIELD_SCALE_XZ;

    const edgeCenters = [
        new THREE.Vector3(0, FIELD_TOP_Y * FIELD_SCALE_Y, halfDepth),
        new THREE.Vector3(0, FIELD_TOP_Y * FIELD_SCALE_Y, -halfDepth),
        new THREE.Vector3(halfWidth, FIELD_TOP_Y * FIELD_SCALE_Y, 0),
        new THREE.Vector3(-halfWidth, FIELD_TOP_Y * FIELD_SCALE_Y, 0),
    ];

    let nearestEdgeCenter = edgeCenters[0];
    let minDistance = staticCameraPos.distanceTo(edgeCenters[0]);

    edgeCenters.forEach(edgeCenter => {
        const distance = staticCameraPos.distanceTo(edgeCenter);
        if (distance < minDistance) {
            minDistance = distance;
            nearestEdgeCenter = edgeCenter;
        }
    });

    const cameraDistance = Math.max(DYNAMIC_CAMERA_DISTANCE, DYNAMIC_CAMERA_MIN_DISTANCE);

    const targetCameraPos = new THREE.Vector3(
        nearestEdgeCenter.x,
        nearestEdgeCenter.y + cameraDistance,
        nearestEdgeCenter.z,
    );

    dynamicCameraPosition.lerp(targetCameraPos, DYNAMIC_CAMERA_SMOOTH);

    const fieldCenterBottom = new THREE.Vector3(0, FIELD_BOTTOM_Y * FIELD_SCALE_Y, 0);

    dynamicCameraTarget.lerp(fieldCenterBottom, DYNAMIC_CAMERA_SMOOTH);

    camera.position.copy(dynamicCameraPosition);
    camera.lookAt(dynamicCameraTarget);
}

/**
 * Обновляет индикатор режима камеры
 */
export function updateCameraModeIndicator() {
    const cameraIcon = document.getElementById('camera-icon');
    const cameraModeText = document.getElementById('camera-mode-text');

    if (!cameraIcon || !cameraModeText) return;

    if (cameraMode === 'front') {
        cameraIcon.className = 'camera-icon front';
        cameraModeText.textContent = 'FRONT';
    } else {
        cameraIcon.className = 'camera-icon top';
        cameraModeText.textContent = 'TOP';
    }
}

/**
 * Переключает режим камеры между front и top
 */
export function toggleCameraMode() {
    cameraMode = cameraMode === 'front' ? 'top' : 'front';
    updateCameraModeIndicator();
    console.log(`🎥 Camera mode: ${cameraMode}`);
}

/**
 * Инициализация простой миникарты с ортогональной камерой над реальным стаканом
 */
export function initMinimap() {
    minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!minimapCanvas) return;

    // Создаем рендерер для мини-карты
    minimapRenderer = new THREE.WebGLRenderer({
        canvas: minimapCanvas,
        antialias: false,
        alpha: true,
    });
    minimapRenderer.setSize(MINIMAP_SIZE, MINIMAP_SIZE);
    minimapRenderer.setClearColor(0x000000, 0.3);

    // Создаем ортографическую камеру для вида сверху на реальный стакан
    const aspect = 1; // Квадратная миникарта 120x120
    const size = (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 1;
    minimapCamera = new THREE.OrthographicCamera(-size * aspect, size * aspect, size, -size, 0.1, 100);
    minimapCamera.position.set(0, 20, 0);

    // Устанавливаем начальный угол камеры
    minimapCamera.rotation.x = -Math.PI / 2; // Смотрим вниз
    minimapCamera.rotation.y = 0;
    minimapCamera.rotation.z = 0;

    console.log('🗺️ Простая миникарта инициализирована');
}

/**
 * Простая миникарта с ортогональной камерой над реальным стаканом
 */
export function updateMinimap(scene: THREE.Scene, pieceVisuals: THREE.Group | null) {
    if (!minimapRenderer || !minimapCamera) return;

    if (!pieceVisuals) {
        pieceVisuals = importedPieceVisuals;
    }

    let pieceWasVisible = false;
    if (pieceVisuals) {
        pieceWasVisible = pieceVisuals.visible;
        pieceVisuals.visible = false;
    }

    minimapRenderer.render(scene, minimapCamera);

    if (pieceVisuals && pieceWasVisible) {
        pieceVisuals.visible = true;
    }
}

/**
 * Настройка освещения для сцены превью следующей фигуры
 */
function setupNextPieceSceneLighting() {
    if (!nextPieceScene) return;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    nextPieceScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(2, 3, 2);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    nextPieceScene.add(directionalLight);
}

/**
 * Инициализация превью следующей фигуры
 */
export function initNextPiecePreview() {
    const nextPieceCanvas = document.getElementById('next-piece-canvas') as HTMLCanvasElement;
    if (!nextPieceCanvas) return;

    // Создаем рендерер для превью следующей фигуры
    nextPieceRenderer = new THREE.WebGLRenderer({
        canvas: nextPieceCanvas,
        antialias: true,
        alpha: true,
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
    setupNextPieceSceneLighting();

    // Создаем камеру для превью
    nextPieceCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    nextPieceCamera.position.set(3, 3, 3);
    nextPieceCamera.lookAt(0, 0, 0);

    console.log('🔮 Next piece preview инициализировано');
}

/**
 * Функция для обновления превью следующей фигуры
 */
export function updateNextPiecePreview() {
    if (!nextPieceRenderer || !nextPieceCamera || !nextPieceScene) return;

    while (nextPieceScene.children.length > 0) {
        const child = nextPieceScene.children[0];
        if ((child as any).isMesh || (child as any).isLineSegments) {
            disposeObject3D(child);
        }
        nextPieceScene.remove(child);
    }

    setupNextPieceSceneLighting();

    const nextPieceType = nextPieceAtom();
    if (!nextPieceType) {
        nextPieceRenderer.render(nextPieceScene, nextPieceCamera);
        return;
    }

    console.log(`🔮 Обновление превью следующей фигуры: ${nextPieceType}`);

    const color = tetrominoColors[nextPieceType];
    const material = getBlockMaterial(color);
    const blocks = tetrominoShapes[nextPieceType];

    const pieceGroup = new THREE.Group();
    console.log(`🧱 Создаём ${blocks.length} блоков для фигуры ${nextPieceType}`);

    for (const block of blocks) {
        const cube = new THREE.Mesh(sharedBlockGeometry, material);
        cube.scale.set(1 / FIELD_SCALE_XZ, 1 / FIELD_SCALE_Y, 1 / FIELD_SCALE_XZ);
        cube.position.set(block.x, block.y, block.z);
        cube.castShadow = true;
        cube.receiveShadow = true;
        pieceGroup.add(cube);

        const wireframe = new THREE.LineSegments(sharedEdgesGeometry, materialPools.edges);
        wireframe.scale.copy(cube.scale);
        wireframe.position.copy(cube.position);
        pieceGroup.add(wireframe);
    }

    pieceGroup.userData.isNextPiece = true;

    nextPieceScene.add(pieceGroup);
    console.log(`✅ nextPieceScene теперь содержит ${nextPieceScene.children.length} детей`);
}

/**
 * Рендерит превью следующей фигуры с анимацией вращения
 */
export function renderNextPiecePreview() {
    if (!nextPieceRenderer || !nextPieceCamera || !nextPieceScene) return;

    const time = Date.now() * 0.001;
    nextPieceScene.children.forEach(child => {
        if (child.userData.isNextPiece) {
            child.rotation.y = time * 0.8;
        }
    });

    if (nextPieceAtom()) {
        nextPieceRenderer.render(nextPieceScene, nextPieceCamera);
    }
}

// Экспорт переменных для внешнего доступа
export const getControlsHelpVisible = () => controlsHelpVisible;
