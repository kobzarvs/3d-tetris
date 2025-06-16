import * as THREE from 'three';
import { BLOCK_SIZE } from '../constants';
import { tetrominoColors, tetrominoShapes } from '../game-logic';
import { disposeObject3D, materialPools } from './materials';

export interface AnimatedPiece extends THREE.Group {
    fallSpeed: number;
    rotationSpeed: { x: number; y: number; z: number };
}

export const fallingPieces: AnimatedPiece[] = [];

const menuBlockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const menuEdgesGeometry = new THREE.EdgesGeometry(menuBlockGeometry);

/**
 * Создает падающую фигуру для анимации меню
 * @param menuContainer - контейнер для добавления фигуры
 */
export function createFallingPiece(menuContainer: THREE.Group) {
    const normalShapes: (keyof typeof tetrominoShapes)[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const randomShape = normalShapes[Math.floor(Math.random() * normalShapes.length)];
    const shape = tetrominoShapes[randomShape];
    const color = tetrominoColors[randomShape];

    const piece = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.2,
    });

    shape.forEach(block => {
        const blockMesh = new THREE.Mesh(menuBlockGeometry, material);
        blockMesh.position.set(block.x, block.y, block.z);
        blockMesh.castShadow = true;
        blockMesh.receiveShadow = true;
        piece.add(blockMesh);

        const wireframe = new THREE.LineSegments(menuEdgesGeometry, materialPools.edges);
        wireframe.position.copy(blockMesh.position);
        piece.add(wireframe);
    });

    piece.position.set((Math.random() - 0.5) * 20, 15, (Math.random() - 0.5) * 10);
    piece.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

    const scale = 0.5 + Math.random();
    piece.scale.set(scale, scale, scale);

    const animatedPiece = piece as AnimatedPiece;
    animatedPiece.fallSpeed = 0.05 + Math.random() * 0.1;
    animatedPiece.rotationSpeed = {
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02,
    };

    menuContainer.add(animatedPiece);
    fallingPieces.push(animatedPiece);
}

/**
 * Инициализирует начальные падающие фигуры для меню
 * @param menuContainer - контейнер для добавления фигур
 */
export function initializeFallingPieces(menuContainer: THREE.Group) {
    for (let i = 0; i < 8; i++) {
        setTimeout(() => createFallingPiece(menuContainer), i * 1000);
    }
}

/**
 * Запускает интервал создания новых падающих фигур
 * @param menuContainer - контейнер для добавления фигур
 * @param gameStateAtom - атом состояния игры для проверки меню
 * @returns функция для остановки интервала
 */
export function startFallingPiecesInterval(menuContainer: THREE.Group, gameStateAtom: any) {
    const intervalId = setInterval(() => {
        if (gameStateAtom() === 'menu') createFallingPiece(menuContainer);
    }, 2000);

    return () => clearInterval(intervalId);
}

/**
 * Обновляет анимацию падающих фигур
 * @param menuContainer - контейнер с фигурами
 */
export function updateFallingPiecesAnimation(menuContainer: THREE.Group) {
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

    while (fallingPieces.length > maxFallingPieces) {
        const p = fallingPieces.shift()!;
        disposeObject3D(p);
        menuContainer.remove(p);
    }
}

/**
 * Очищает все падающие фигуры
 * @param menuContainer - контейнер с фигурами
 */
export function clearFallingPieces(menuContainer: THREE.Group) {
    fallingPieces.forEach(p => {
        disposeObject3D(p);
        menuContainer.remove(p);
    });
    fallingPieces.length = 0;
}

/**
 * Обновляет позицию камеры для меню с плавным движением
 * @param camera - камера Three.js
 */
export function updateCameraForMenu(camera: THREE.PerspectiveCamera) {
    const time = Date.now() * 0.001;
    camera.position.x = Math.sin(time * 0.3) * 2;
    camera.position.z = 15 + Math.cos(time * 0.2) * 3;
    camera.position.y = 5;
    camera.lookAt(0, 0, 0);
}

/**
 * Анимирует точечные источники света в меню
 * @param pointLight1 - первый точечный источник света
 * @param pointLight2 - второй точечный источник света
 */
export function animateMenuLights(pointLight1: THREE.PointLight, pointLight2: THREE.PointLight) {
    const time = Date.now() * 0.001;
    pointLight1.position.x = Math.sin(time * 0.7) * 10;
    pointLight1.position.z = Math.cos(time * 0.7) * 10;
    pointLight2.position.x = Math.cos(time * 0.5) * 10;
    pointLight2.position.z = Math.sin(time * 0.5) * 10;
}
