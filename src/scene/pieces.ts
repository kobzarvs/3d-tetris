import * as THREE from 'three';
import {
    FIELD_DEPTH,
    FIELD_HEIGHT,
    FIELD_SCALE_XZ,
    FIELD_SCALE_Y,
    FIELD_WIDTH,
    PIECE_ANIMATION_DURATION,
} from '../constants';
import {
    canPlacePieceCompat,
    currentPieceAtom,
    gameStateAtom,
    getRandomPiece,
    nextPieceAtom,
    tetrominoColors,
    tetrominoShapes,
} from '../game-logic';
import type { AnimationState } from '../types';
import { disposeObject3D, materialPools, sharedBlockGeometry, sharedEdgesGeometry } from './materials';
import { projectionsVisible, updateWallProjections } from './visuals';

// Visuals
export let pieceVisuals: THREE.Group | null = null;

// Animation state
export const animationState: AnimationState = {
    isAnimating: false,
    animationStartTime: 0,
    animationStartPosition: { x: 0, y: 0, z: 0 },
    animationTargetPosition: { x: 0, y: 0, z: 0 },
};

/**
 * Создает новую фигуру в игре
 */
export function spawnNewPiece() {
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
        z: Math.floor(FIELD_DEPTH / 2),
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

    updateVisuals();
}

/**
 * Обновляет визуализацию активной фигуры
 * @param gameContainer - контейнер для игровых объектов
 * @param updateMinimap - функция обновления миникарты
 */
export function updateVisuals(gameContainer?: THREE.Group, updateMinimap?: () => void) {
    if (pieceVisuals && gameContainer) {
        disposeObject3D(pieceVisuals);
        gameContainer.remove(pieceVisuals);
    }

    const piece = currentPieceAtom();
    if (piece && gameContainer) {
        const renderPosition = piece.position;

        pieceVisuals = new THREE.Group();
        const color = tetrominoColors[piece.type];
        // Создаем новый материал для активной фигуры (не используем shared pool)
        const material = new THREE.MeshPhongMaterial({
            color,
            emissive: color,
            emissiveIntensity: 0.2,
            transparent: false,
        });

        for (const block of piece.blocks) {
            const cube = new THREE.Mesh(sharedBlockGeometry, material);
            const x = renderPosition.x + block.x;
            const y = renderPosition.y + block.y;
            const z = renderPosition.z + block.z;
            cube.position.set(
                (x - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                (y - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                (z - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
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
        if (projectionsVisible) updateWallProjections(gameContainer, renderPosition);
        if (updateMinimap) updateMinimap();
    }
}

/**
 * Начинает анимацию движения фигуры
 * @param startPos - начальная позиция
 * @param targetPos - целевая позиция
 */
export function startPieceAnimation(
    startPos: { x: number; y: number; z: number },
    targetPos: { x: number; y: number; z: number },
) {
    animationState.isAnimating = true;
    animationState.animationStartTime = Date.now();
    animationState.animationStartPosition = { ...startPos };
    animationState.animationTargetPosition = { ...targetPos };
}

/**
 * Обновляет анимацию движения фигуры
 * @param gameContainer - контейнер для игровых объектов
 * @param updateMinimap - функция обновления миникарты
 * @returns true если анимация завершена
 */
export function updatePieceAnimation(gameContainer: THREE.Group, updateMinimap: () => void): boolean {
    if (!animationState.isAnimating || !pieceVisuals) return true;

    const elapsed = Date.now() - animationState.animationStartTime;
    const progress = Math.min(elapsed / PIECE_ANIMATION_DURATION, 1);
    const easeProgress = 1 - (1 - progress) ** 3;

    const renderPosition = {
        x:
            animationState.animationStartPosition.x +
            (animationState.animationTargetPosition.x - animationState.animationStartPosition.x) * easeProgress,
        y:
            animationState.animationStartPosition.y +
            (animationState.animationTargetPosition.y - animationState.animationStartPosition.y) * easeProgress,
        z:
            animationState.animationStartPosition.z +
            (animationState.animationTargetPosition.z - animationState.animationStartPosition.z) * easeProgress,
    };

    pieceVisuals.children.forEach((child, i) => {
        const piece = currentPieceAtom();
        if (piece && i < piece.blocks.length * 2) {
            const blockIndex = Math.floor(i / 2);
            const block = piece.blocks[blockIndex];
            const x = renderPosition.x + block.x;
            const y = renderPosition.y + block.y;
            const z = renderPosition.z + block.z;
            child.position.set(
                (x - FIELD_WIDTH / 2 + 0.5) * FIELD_SCALE_XZ,
                (y - FIELD_HEIGHT / 2 + 0.5) * FIELD_SCALE_Y,
                (z - FIELD_DEPTH / 2 + 0.5) * FIELD_SCALE_XZ,
            );
        }
    });

    if (projectionsVisible) updateWallProjections(gameContainer, renderPosition);

    updateMinimap();

    if (progress >= 1) {
        animationState.isAnimating = false;
        return true;
    }

    return false;
}

/**
 * Очищает визуализацию фигуры
 * @param gameContainer - контейнер для игровых объектов
 */
export function clearPieceVisuals(gameContainer: THREE.Group) {
    if (pieceVisuals) {
        disposeObject3D(pieceVisuals);
        gameContainer.remove(pieceVisuals);
    }
    pieceVisuals = null;
}
