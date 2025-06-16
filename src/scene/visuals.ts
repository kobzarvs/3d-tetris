import * as THREE from 'three';
import {
    FIELD_DEPTH,
    FIELD_HEIGHT,
    FIELD_SCALE_XZ,
    FIELD_SCALE_Y,
    FIELD_WIDTH,
    FROZEN_FIGURE_COLOR,
} from '../constants';
import { coloredModeAtom, currentPieceAtom, fieldRotationAtom, gameFieldAtom, tetrominoColors } from '../game-logic';
import {
    BLOCK_SIZE_Y,
    disposeObject3D,
    getBlockMaterial,
    materialPools,
    sharedBlockGeometry,
    sharedEdgesGeometry,
    sharedPlaneGeometryHorizontal,
    sharedPlaneGeometryVertical,
} from './materials';

interface Block3D {
    x: number;
    y: number;
    z: number;
}

// Экспортируемые переменные для scene containers и mesh-ов
export let frontWallMesh: THREE.Mesh | null = null;
export let backWallMesh: THREE.Mesh | null = null;
export let leftWallMesh: THREE.Mesh | null = null;
export let rightWallMesh: THREE.Mesh | null = null;
export let bottomGridGroup: THREE.Group | null = null;
export let leftWallGridGroup: THREE.Group | null = null;
export let rightWallGridGroup: THREE.Group | null = null;
export let backWallGridGroup: THREE.Group | null = null;
export let frontWallGridGroup: THREE.Group | null = null;
export let bottomProjectionGroup: THREE.Group | null = null;
export let leftProjectionGroup: THREE.Group | null = null;
export let rightProjectionGroup: THREE.Group | null = null;
export let backProjectionGroup: THREE.Group | null = null;
export let obstacleHighlightsGroup: THREE.Group | null = null;
export let axesHelper: THREE.AxesHelper | null = null;
export let projectionsVisible = true;

export function createWallGrids(fieldContainer: THREE.Group) {
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
    const bottomY = (-FIELD_HEIGHT / 2 + 0.005) * FIELD_SCALE_Y;
    for (let x = 0; x <= FIELD_WIDTH; x++)
        bottomVertices.push(
            (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
            bottomY,
            -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
            (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
            bottomY,
            (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        );
    for (let z = 0; z <= FIELD_DEPTH; z++)
        bottomVertices.push(
            -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            bottomY,
            (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
            (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            bottomY,
            (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
        );
    bottomGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bottomVertices, 3));
    const bottomGridMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 });
    const bottomGrid = new THREE.LineSegments(bottomGeometry, bottomGridMaterial);
    bottomGridGroup.add(bottomGrid);
    fieldContainer.add(bottomGridGroup);

    switch (rotationSteps) {
        case 0:
            createFrontWallGrid(gridMaterial, fieldContainer);
            createLeftWallGrid(gridMaterial, fieldContainer);
            createRightWallGrid(gridMaterial, fieldContainer);
            break;
        case 1:
            createRightWallGrid(gridMaterial, fieldContainer);
            createBackWallGrid(gridMaterial, fieldContainer);
            createFrontWallGrid(gridMaterial, fieldContainer);
            break;
        case 2:
            createBackWallGrid(gridMaterial, fieldContainer);
            createRightWallGrid(gridMaterial, fieldContainer);
            createLeftWallGrid(gridMaterial, fieldContainer);
            break;
        case 3:
            createLeftWallGrid(gridMaterial, fieldContainer);
            createFrontWallGrid(gridMaterial, fieldContainer);
            createBackWallGrid(gridMaterial, fieldContainer);
            break;
    }
}

export function createLeftWallGrid(material: THREE.LineBasicMaterial, fieldContainer: THREE.Group) {
    leftWallGridGroup = new THREE.Group();
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++)
        vertices.push(
            -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
            -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        );
    for (let z = 0; z <= FIELD_DEPTH; z++)
        vertices.push(
            -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (-FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
            -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    leftWallGridGroup.add(grid);

    const spawnY = (FIELD_HEIGHT - 3 - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
    ];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    leftWallGridGroup.add(spawnLine);

    fieldContainer.add(leftWallGridGroup);
}

export function createRightWallGrid(material: THREE.LineBasicMaterial, fieldContainer: THREE.Group) {
    rightWallGridGroup = new THREE.Group();
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++)
        vertices.push(
            (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
            (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        );
    for (let z = 0; z <= FIELD_DEPTH; z++)
        vertices.push(
            (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (-FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
            (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            (z - FIELD_DEPTH / 2) * FIELD_SCALE_XZ,
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    rightWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = (FIELD_HEIGHT - 3 - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
    ];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    rightWallGridGroup.add(spawnLine);

    fieldContainer.add(rightWallGridGroup);
}

export function createBackWallGrid(material: THREE.LineBasicMaterial, fieldContainer: THREE.Group) {
    backWallGridGroup = new THREE.Group();
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++)
        vertices.push(
            -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
            (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        );
    for (let x = 0; x <= FIELD_WIDTH; x++)
        vertices.push(
            (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
            (-FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
            (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
            (FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    backWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = (FIELD_HEIGHT - 3 - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        (FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
    ];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    backWallGridGroup.add(spawnLine);

    fieldContainer.add(backWallGridGroup);
}

export function createFrontWallGrid(material: THREE.LineBasicMaterial, fieldContainer: THREE.Group) {
    frontWallGridGroup = new THREE.Group();
    const vertices: number[] = [];
    for (let y = 0; y <= FIELD_HEIGHT; y++)
        vertices.push(
            -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
            (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
            (y - FIELD_HEIGHT / 2) * FIELD_SCALE_Y,
            -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        );
    for (let x = 0; x <= FIELD_WIDTH; x++)
        vertices.push(
            (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
            (-FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
            (x - FIELD_WIDTH / 2) * FIELD_SCALE_XZ,
            (FIELD_HEIGHT * FIELD_SCALE_Y) / 2,
            -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const grid = new THREE.LineSegments(geometry, material);
    frontWallGridGroup.add(grid);

    // Добавляем желтую линию спавна
    const spawnY = (FIELD_HEIGHT - 3 - FIELD_HEIGHT / 2) * FIELD_SCALE_Y;
    const spawnGeometry = new THREE.BufferGeometry();
    const spawnVertices = [
        -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
        (FIELD_WIDTH * FIELD_SCALE_XZ) / 2,
        spawnY,
        -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2,
    ];
    spawnGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spawnVertices, 3));
    const spawnMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
    const spawnLine = new THREE.LineSegments(spawnGeometry, spawnMaterial);
    frontWallGridGroup.add(spawnLine);

    fieldContainer.add(frontWallGridGroup);
}

export function updateLandedVisuals(landedBlocksContainer: THREE.Group) {
    // Properly dispose of old objects before removing
    while (landedBlocksContainer.children.length > 0) {
        const child = landedBlocksContainer.children[0];
        disposeObject3D(child);
        landedBlocksContainer.remove(child);
    }

    for (let y = 0; y < FIELD_HEIGHT; y++) {
        for (let z = 0; z < FIELD_DEPTH; z++) {
            for (let x = 0; x < FIELD_WIDTH; x++) {
                const pieceType = gameFieldAtom()[y][z][x];
                if (pieceType) {
                    const originalColor = tetrominoColors[pieceType as keyof typeof tetrominoColors];
                    const color = coloredModeAtom() ? originalColor : FROZEN_FIGURE_COLOR;
                    const material = getBlockMaterial(color);
                    const cube = new THREE.Mesh(sharedBlockGeometry, material);
                    cube.position.set(
                        (x - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                        (y - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                        (z - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
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

export function updateWallProjections(
    gameContainer: THREE.Group,
    renderPosition?: { x: number; y: number; z: number },
) {
    const piece = currentPieceAtom();
    if (!piece) return;

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
        side: THREE.DoubleSide,
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
            if (
                testBlockY < 0 || // Ниже дна
                testWorldX < 0 ||
                testWorldX >= FIELD_WIDTH ||
                testWorldZ < 0 ||
                testWorldZ >= FIELD_DEPTH ||
                (gameFieldAtom()[testBlockY] && gameFieldAtom()[testBlockY][testWorldZ][testWorldX] !== null)
            ) {
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
    const columnBottomBlocks = new Map<string, { block: { x: number; y: number; z: number }; lowestY: number }>();

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
                (-FIELD_HEIGHT * FIELD_SCALE_Y) / 2 + 0.01,
                (worldZ - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            );
            bottomProjectionGroup.add(whitePlane);
        }
        // Если под блоком есть препятствие в финальной позиции
        else if (
            underBlockY >= 0 &&
            gameFieldAtom()[underBlockY] &&
            gameFieldAtom()[underBlockY][worldZ][worldX] !== null
        ) {
            // Белая проекция на препятствии
            const whitePlane = new THREE.Mesh(sharedPlaneGeometryHorizontal, materialPools.projectionWhite);
            whitePlane.rotation.x = -Math.PI / 2;
            whitePlane.position.set(
                (worldX - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                (underBlockY - FIELD_HEIGHT / 2 + 0.5 + BLOCK_SIZE_Y / 2 + 0.001) * FIELD_SCALE_Y,
                (worldZ - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            );
            bottomProjectionGroup.add(whitePlane);
        }
        // Если под блоком пустота - ищем первое препятствие/дно ниже
        else {
            // Красная проекция - ищем первое препятствие ниже финальной позиции блока
            let redProjectionY = (-FIELD_HEIGHT * FIELD_SCALE_Y) / 2 + 0.01; // По умолчанию на дне

            for (let y = underBlockY - 1; y >= 0; y--) {
                if (gameFieldAtom()[y] && gameFieldAtom()[y][worldZ][worldX] !== null) {
                    redProjectionY = (y - FIELD_HEIGHT / 2 + 0.5 + BLOCK_SIZE_Y / 2 + 0.001) * FIELD_SCALE_Y;
                    break;
                }
            }
            const redPlane = new THREE.Mesh(sharedPlaneGeometryHorizontal, materialPools.projectionRed);
            redPlane.rotation.x = -Math.PI / 2;
            redPlane.position.set(
                (worldX - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                redProjectionY,
                (worldZ - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            );
            bottomProjectionGroup.add(redPlane);
        }
    }

    gameContainer.add(bottomProjectionGroup);
    gameContainer.add(obstacleHighlightsGroup);

    let backWallCoords: (block: Block3D) => { x: number; y: number; z: number } = () => ({ x: 0, y: 0, z: 0 });
    let leftWallCoords: (block: Block3D) => { x: number; y: number; z: number } = () => ({ x: 0, y: 0, z: 0 });
    let rightWallCoords: (block: Block3D) => { x: number; y: number; z: number } = () => ({ x: 0, y: 0, z: 0 });
    let backWallRotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
    let leftWallRotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
    let rightWallRotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

    switch (rotationSteps) {
        case 0:
            backWallCoords = block => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 - 0.01,
            });
            leftWallCoords = block => ({
                x: -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2 - 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            });
            rightWallCoords = block => ({
                x: (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            });
            backWallRotation = { x: 0, y: Math.PI, z: 0 };
            leftWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            rightWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            break;
        case 1:
            backWallCoords = block => ({
                x: (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            });
            leftWallCoords = block => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 0.01,
            });
            rightWallCoords = block => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 - 0.01,
            });
            backWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            leftWallRotation = { x: 0, y: 0, z: 0 };
            rightWallRotation = { x: 0, y: Math.PI, z: 0 };
            break;
        case 2:
            backWallCoords = block => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 0.01,
            });
            leftWallCoords = block => ({
                x: (FIELD_WIDTH * FIELD_SCALE_XZ) / 2 + 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            });
            rightWallCoords = block => ({
                x: -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2 - 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            });
            backWallRotation = { x: 0, y: 0, z: 0 };
            leftWallRotation = { x: 0, y: -Math.PI / 2, z: 0 };
            rightWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            break;
        case 3:
            backWallCoords = block => ({
                x: -(FIELD_WIDTH * FIELD_SCALE_XZ) / 2 - 0.01,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (Math.round(projectionPosition.z + block.z) - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            });
            leftWallCoords = block => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2 - 0.01,
            });
            rightWallCoords = block => ({
                x: (Math.round(projectionPosition.x + block.x) - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                y: (Math.round(projectionPosition.y + block.y) - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                z: (FIELD_DEPTH * FIELD_SCALE_XZ) / 2 + 0.01,
            });
            backWallRotation = { x: 0, y: Math.PI / 2, z: 0 };
            leftWallRotation = { x: 0, y: Math.PI, z: 0 };
            rightWallRotation = { x: 0, y: 0, z: 0 };
            break;
    }

    const createProjectionGroup = (
        coordsFunc: (b: Block3D) => { x: number; y: number; z: number },
        rotation: { x: number; y: number; z: number },
    ) => {
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

export function clearFieldBoundaries(fieldContainer: THREE.Group) {
    while (fieldContainer.children.length > 0) {
        fieldContainer.remove(fieldContainer.children[0]);
    }
}

export function toggleAxesHelper(fieldContainer: THREE.Group) {
    if (axesHelper) {
        fieldContainer.remove(axesHelper);
        axesHelper = null;
    } else {
        axesHelper = new THREE.AxesHelper(3);
        axesHelper.position.set(0, (-FIELD_HEIGHT / 2 + 2) * FIELD_SCALE_Y, 0); // Подняли на 2 единицы выше дна
        fieldContainer.add(axesHelper);
    }
}

export function toggleWallProjections(gameContainer: THREE.Group) {
    projectionsVisible = !projectionsVisible;
    if (projectionsVisible) {
        if (currentPieceAtom()) updateWallProjections(gameContainer);
    } else {
        if (bottomProjectionGroup) gameContainer.remove(bottomProjectionGroup);
        if (obstacleHighlightsGroup) gameContainer.remove(obstacleHighlightsGroup);
        if (leftProjectionGroup) gameContainer.remove(leftProjectionGroup);
        if (rightProjectionGroup) gameContainer.remove(rightProjectionGroup);
        if (backProjectionGroup) gameContainer.remove(backProjectionGroup);
    }
}

export function updateWallsOpacity() {
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

    switch (rotationSteps) {
        case 0:
            (backWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
        case 1:
            (leftWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
        case 2:
            (frontWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
        case 3:
            (rightWallMesh.material as THREE.MeshPhongMaterial).opacity = 0;
            break;
    }
}

export function createFieldBoundaries(fieldContainer: THREE.Group) {
    clearFieldBoundaries(fieldContainer);
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x444444,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
    });

    const createWall = (geom: THREE.PlaneGeometry, pos: [number, number, number], rot: [number, number, number]) => {
        const wall = new THREE.Mesh(geom, wallMaterial.clone());
        wall.position.set(...pos);
        wall.rotation.set(...rot);
        wall.renderOrder = 1;
        return wall;
    };

    frontWallMesh = createWall(
        new THREE.PlaneGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y),
        [0, 0, -(FIELD_DEPTH * FIELD_SCALE_XZ) / 2],
        [0, 0, 0],
    );
    backWallMesh = createWall(
        new THREE.PlaneGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y),
        [0, 0, (FIELD_DEPTH * FIELD_SCALE_XZ) / 2],
        [0, Math.PI, 0],
    );
    leftWallMesh = createWall(
        new THREE.PlaneGeometry(FIELD_DEPTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y),
        [-(FIELD_WIDTH * FIELD_SCALE_XZ) / 2, 0, 0],
        [0, Math.PI / 2, 0],
    );
    rightWallMesh = createWall(
        new THREE.PlaneGeometry(FIELD_DEPTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y),
        [(FIELD_WIDTH * FIELD_SCALE_XZ) / 2, 0, 0],
        [0, -Math.PI / 2, 0],
    );
    fieldContainer.add(frontWallMesh, backWallMesh, leftWallMesh, rightWallMesh);

    // QWE hints убраны из заставки

    updateWallsOpacity();

    const bottomMaterial = new THREE.MeshPhongMaterial({ color: 0x87ceeb, side: THREE.DoubleSide });
    const bottomMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_DEPTH * FIELD_SCALE_XZ),
        bottomMaterial,
    );
    bottomMesh.rotation.x = -Math.PI / 2;
    bottomMesh.position.set(0, (-FIELD_HEIGHT * FIELD_SCALE_Y) / 2, 0);
    bottomMesh.receiveShadow = true;
    fieldContainer.add(bottomMesh);

    const edges = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(FIELD_WIDTH * FIELD_SCALE_XZ, FIELD_HEIGHT * FIELD_SCALE_Y, FIELD_DEPTH * FIELD_SCALE_XZ),
    );
    const wireframe = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 2, transparent: true, opacity: 0.7 }),
    );
    fieldContainer.add(wireframe);
}
