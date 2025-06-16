import './style.css';
import { effect } from '@reatom/core';
import {
    canPlacePieceCompat,
    coloredModeAtom,
    currentPieceAtom,
    difficultyLevelAtom,
    fieldRotationAtom,
    gameActions,
    gameFieldAtom,
    gameStateAtom,
    getRandomPiece,
    lockDelayTimerVisibleAtom,
    nextPieceAtom,
    rotateInViewPlane,
    rotateSide,
    rotateVertical,
    scoreAtom,
} from './game-logic';
import { lockDelayTimerWidget } from './widgets/lock-delay-indicator.ts';
import './models/lock-delay'; // Инициализируем модель lock delay
import { FIELD_DEPTH, FIELD_HEIGHT, FIELD_ROTATION_DURATION, FIELD_WIDTH, GameState } from './constants';
import type { GameStateType } from './constants';
import { lockDelayAtom } from './models/lock-delay';
import {
    backgroundTexture,
    camera,
    fieldContainer,
    gameContainer,
    landedBlocksContainer,
    menuContainer,
    nextPieceContainer,
    pointLight1,
    pointLight2,
    renderer,
    rotationContainer,
    scene,
    staticUIContainer,
} from './scene/core';
import { disposeObject3D } from './scene/materials';
import {
    animateMenuLights,
    initializeFallingPieces,
    startFallingPiecesInterval,
    updateCameraForMenu,
    updateFallingPiecesAnimation,
} from './scene/menu';
import {
    animationState,
    clearPieceVisuals,
    pieceVisuals,
    spawnNewPiece,
    startPieceAnimation,
    updatePieceAnimation,
    updateVisuals,
} from './scene/pieces';
import {
    createEHint,
    createQHint,
    createWHint,
    getControlsHelpVisible,
    initMinimap,
    initNextPiecePreview,
    renderNextPiecePreview,
    toggleCameraMode,
    toggleControlsHelp,
    toggleKeyHints,
    updateCameraModeIndicator,
    updateDynamicCamera,
    updateMinimap,
    updateNextPiecePreview,
} from './scene/ui';
import {
    createFieldBoundaries,
    createWallGrids,
    toggleAxesHelper,
    toggleWallProjections,
    updateLandedVisuals,
    updateWallsOpacity,
} from './scene/visuals';

// Functions
function initializeGameField() {
    const emptyField = Array(FIELD_HEIGHT)
        .fill(null)
        .map(() =>
            Array(FIELD_DEPTH)
                .fill(null)
                .map(() => Array(FIELD_WIDTH).fill(null)),
        );
    gameFieldAtom.set(emptyField);
}

function resetGameState() {
    console.log('🔄 Resetting game state...');
    initializeGameField();
    const oldScore = scoreAtom();
    scoreAtom.reset();
    const newScore = scoreAtom();
    console.log(`💰 Score reset: ${oldScore} → ${newScore}`);
    fieldRotationAtom.reset();

    // Очищаем QWE hints
    while (staticUIContainer.children.length > 0) {
        const child = staticUIContainer.children[0];
        disposeObject3D(child);
        staticUIContainer.remove(child);
    }

    while (landedBlocksContainer.children.length > 0) {
        const child = landedBlocksContainer.children[0];
        disposeObject3D(child);
        landedBlocksContainer.remove(child);
    }
    clearPieceVisuals(gameContainer);
    currentPieceAtom.clear();

    rotationContainer.rotation.y = 0;

    createFieldBoundaries(fieldContainer);
    createWallGrids(fieldContainer);
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

function movePiece(dx: number, dy: number, dz: number) {
    // Проверяем, можем ли мы начать анимацию (не анимируемся уже)
    if (animationState.isAnimating) return;

    const piece = currentPieceAtom();
    if (!piece) return;

    const newPos = { x: piece.position.x + dx, y: piece.position.y + dy, z: piece.position.z + dz };
    if (canPlacePieceCompat(piece.blocks, newPos)) {
        // Начинаем анимацию к новой позиции
        startPieceAnimation(piece.position, newPos);

        // Сразу обновляем логическую позицию через Reatom action
        currentPieceAtom.move(dx, dy, dz);

        // Обновляем миникарту при движении фигуры
        updateMinimap(scene, pieceVisuals);
    }
}

function movePieceRelativeToField(dx: number, dy: number, dz: number) {
    const rotationSteps = Math.round(fieldRotationAtom() / 90) % 4;
    let tDx = dx,
        tDz = dz;
    if (rotationSteps === 1) {
        tDx = -dz;
        tDz = dx;
    } else if (rotationSteps === 2) {
        tDx = -dx;
        tDz = -dz;
    } else if (rotationSteps === 3) {
        tDx = dz;
        tDz = -dx;
    }
    movePiece(tDx, dy, tDz);
}

function dropPiece() {
    // Если анимация идет, завершаем ее немедленно
    if (animationState.isAnimating) {
        animationState.isAnimating = false;
        updateVisuals(gameContainer, () => updateMinimap(scene, null));
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
        startPieceAnimation(piece.position, { ...piece.position, y: targetY });

        // Обновляем позицию через Reatom action
        currentPieceAtom.move(0, targetY - piece.position.y, 0);
    }
}

let isFieldRotating = false;
function rotateField(direction: 1 | -1) {
    if (isFieldRotating) return;
    isFieldRotating = true;
    const currentRotation = fieldRotationAtom();
    const newRotation = currentRotation + direction * 90;
    const normalizedNewRotation = ((newRotation % 360) + 360) % 360;

    const startRotation = (currentRotation * Math.PI) / 180;
    const endRotation = (newRotation * Math.PI) / 180;
    const startTime = Date.now();

    function animateRotation() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / FIELD_ROTATION_DURATION, 1);
        rotationContainer.rotation.y = startRotation + (endRotation - startRotation) * progress;

        updateMinimap(scene, pieceVisuals);

        if (progress < 1) {
            requestAnimationFrame(animateRotation);
        } else {
            fieldRotationAtom.set(normalizedNewRotation);
            isFieldRotating = false;
            if (currentPieceAtom()) updateVisuals(gameContainer, () => updateMinimap(scene, null));
            createWallGrids(fieldContainer);
            updateWallsOpacity();
        }
    }
    requestAnimationFrame(animateRotation);
}

// UI Elements
let startButton: HTMLButtonElement,
    restartButton: HTMLButtonElement,
    pauseRestartButton: HTMLButtonElement,
    mainMenuButton: HTMLButtonElement,
    resumeButton: HTMLButtonElement,
    pauseMenuButton: HTMLButtonElement,
    startMenu: HTMLDivElement,
    pauseMenu: HTMLDivElement,
    scoreDisplay: HTMLDivElement,
    scoreValue: HTMLSpanElement,
    gameOverMenu: HTMLDivElement,
    perspectiveGrid: HTMLDivElement,
    cameraModeIndicator: HTMLDivElement,
    controlsHelp: HTMLDivElement,
    minimapContainer: HTMLDivElement,
    nextPieceUIContainer: HTMLDivElement,
    difficultyDisplay: HTMLDivElement,
    difficultyCube: HTMLDivElement,
    difficultyValue: HTMLDivElement;

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
    controlsHelp = document.getElementById('controls-help') as HTMLDivElement;
    minimapContainer = document.getElementById('minimap-container') as HTMLDivElement;
    nextPieceUIContainer = document.getElementById('next-piece-container') as HTMLDivElement;
    difficultyDisplay = document.getElementById('difficulty-display') as HTMLDivElement;
    difficultyCube = document.getElementById('difficulty-cube') as HTMLDivElement;
    difficultyValue = document.getElementById('difficulty-value') as HTMLDivElement;

    // Инициализация мини-карты
    initMinimap();

    // Инициализация превью следующей фигуры
    initNextPiecePreview();

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
        controlsHelp.classList.toggle('collapsed', !getControlsHelpVisible());
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

            // Добавляем QWE hints в игровой режим
            const qHint = createQHint();
            const wHint = createWHint();
            const eHint = createEHint();
            staticUIContainer.add(qHint, wHint, eHint);

            // Устанавливаем начальную следующую фигуру для предпросмотра
            if (!nextPieceAtom()) {
                const newPiece = getRandomPiece();
                nextPieceAtom.update(newPiece);
                console.log(`🎮 Initialized next piece: ${newPiece}`);
            }

            spawnNewPiece();
        }
        updateDynamicCamera(camera);
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
        updateLandedVisuals(landedBlocksContainer);
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
window.addEventListener('keydown', event => {
    const state = gameStateAtom();

    if (state === GameState.PAUSED && event.code === 'Escape') {
        event.preventDefault();
        gameStateAtom.setPlaying();
        return;
    }

    if (state === GameState.PAUSED && event.code === 'F1') {
        event.preventDefault();
        toggleControlsHelp();
        return;
    }

    if (state === GameState.GAME_OVER && event.code === 'Escape') {
        event.preventDefault();
        gameStateAtom.setMenu();
        return;
    }

    if (state === GameState.MENU || state === GameState.PAUSED || state === GameState.GAME_OVER) {
        if (menuButtons.length > 0) {
            if (event.code === 'ArrowUp' || event.code === 'ArrowLeft') {
                event.preventDefault();
                menuIndex = (menuIndex - 1 + menuButtons.length) % menuButtons.length;
                updateMenuSelection();
                return;
            } else if (event.code === 'ArrowDown' || event.code === 'ArrowRight') {
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
            case 'ArrowUp':
                movePieceRelativeToField(0, 0, -1);
                break;
            case 'ArrowLeft':
                movePieceRelativeToField(-1, 0, 0);
                break;
            case 'ArrowRight':
                movePieceRelativeToField(1, 0, 0);
                break;
            case 'ArrowDown':
                movePieceRelativeToField(0, 0, 1);
                break;
            case 'Space': {
                event.preventDefault();
                const piece = currentPieceAtom();
                if (piece) {
                    // Проверяем может ли фигура упасть еще ниже
                    const canFallDown = canPlacePieceCompat(piece.blocks, {
                        ...piece.position,
                        y: piece.position.y - 1,
                    });

                    if (canFallDown) {
                        // Фигура может упасть - обычное падение до дна
                        dropPiece();
                    } else {
                        const lockDelayState = lockDelayAtom();
                        if (lockDelayState.active) {
                            lockDelayAtom.forceLock();
                            gameActions.placePiece();
                            console.log('⚡ Принудительная фиксация фигуры по пробелу!');
                        }
                    }
                }
                break;
            }
            case 'KeyS':
                movePiece(0, -1, 0);
                break;
            case 'KeyA':
                rotateField(1);
                break;
            case 'KeyD':
                rotateField(-1);
                break;
            case 'KeyX':
                toggleAxesHelper(fieldContainer);
                break;
            case 'KeyP':
                toggleWallProjections(gameContainer);
                break;
            case 'Escape':
                gameStateAtom.setPaused();
                break;
            case 'Enter':
                event.preventDefault();
                toggleCameraMode();
                break;
            case 'F1':
                event.preventDefault();
                toggleControlsHelp();
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
            case 'F4':
                event.preventDefault();
                toggleKeyHints();
                break;
            case 'KeyQ': {
                const piece = currentPieceAtom();
                if (!piece) break;
                const r = rotateSide(piece.blocks);
                if (canPlacePieceCompat(r, piece.position)) {
                    currentPieceAtom.rotate(r);
                    updateMinimap(scene, pieceVisuals);
                    updateVisuals(gameContainer, () => updateMinimap(scene, null));
                }
                break;
            }
            case 'KeyW': {
                const piece = currentPieceAtom();
                if (!piece) break;
                const r = rotateInViewPlane(piece.blocks);
                if (canPlacePieceCompat(r, piece.position)) {
                    currentPieceAtom.rotate(r);
                    updateMinimap(scene, pieceVisuals);
                    updateVisuals(gameContainer, () => updateMinimap(scene, null));
                }
                break;
            }
            case 'KeyE': {
                const piece = currentPieceAtom();
                if (!piece) break;
                const r = rotateVertical(piece.blocks);
                if (canPlacePieceCompat(r, piece.position)) {
                    currentPieceAtom.rotate(r);
                    updateMinimap(scene, pieceVisuals);
                    updateVisuals(gameContainer, () => updateMinimap(scene, null));
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
                updateVisuals(gameContainer, () => updateMinimap(scene, null));
                updateMinimap(scene, pieceVisuals);
                console.log('🧪 Спавн тестового куба 5x5x5 с дыркой в центре');
                break;
            case 'F6':
                event.preventDefault();
                gameActions.spawnTestCube();
                updateVisuals(gameContainer, () => updateMinimap(scene, null));
                updateMinimap(scene, pieceVisuals);
                console.log('🧪 Спавн тестового куба 2x2x2');
                break;
            case 'F7':
                event.preventDefault();
                gameActions.spawnTestI();
                updateVisuals(gameContainer, () => updateMinimap(scene, null));
                updateMinimap(scene, pieceVisuals);
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

// Initialize falling pieces for menu
initializeFallingPieces(menuContainer);

// Start falling pieces interval
startFallingPiecesInterval(menuContainer, gameStateAtom);

function animate() {
    requestAnimationFrame(animate);
    const state = gameStateAtom();

    if (state === GameState.MENU) {
        // Update falling pieces animation
        updateFallingPiecesAnimation(menuContainer);

        // Animate menu lights
        animateMenuLights(pointLight1, pointLight2);

        // Update camera for menu
        updateCameraForMenu(camera);
    } else if (state === GameState.PLAYING || state === GameState.PAUSED) {
        if (state === GameState.PAUSED) {
            // В режиме паузы только обновляем визуализацию, но не логику игры
            renderer.render(scene, camera);
            return;
        }
        // Обновляем камеру для игры
        updateDynamicCamera(camera);

        if (animationState.isAnimating) {
            const isComplete = updatePieceAnimation(gameContainer, () => updateMinimap(scene, null));
            if (isComplete) {
                updateVisuals(gameContainer, () => updateMinimap(scene, null));
            }
        }
    }

    // Вращение предпросмотра следующей фигуры
    const currentGameState = gameStateAtom();
    if (currentGameState === GameState.PLAYING || currentGameState === GameState.PAUSED) {
        renderNextPiecePreview();
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
        updateVisuals(gameContainer, () => updateMinimap(scene, null));
    }
});

animate();

console.log('3D Tetris Initialized');
