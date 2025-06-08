import { atom, effect } from '@reatom/core';
import { gameStateAtom, currentPieceAtom, gameActions } from '../game-logic';
import { canPlacePieceCompat } from '../game-logic';
import { GameState, LOCK_DELAY_TIME } from '../constants';

// Lock Delay Model - содержит только бизнес-логику
export const lockDelayAtom = atom<{
    active: boolean;
    startTime: number;
    paused: boolean;
    pausedAt: number;
    totalPausedTime: number;
}>({
    active: true,
    startTime: 0,
    paused: false,
    pausedAt: 0,
    totalPausedTime: 0
}).actions((target) => ({
    start: () => target.set({
        active: true,
        startTime: performance.now(),
        paused: false,
        pausedAt: 0,
        totalPausedTime: 0
    }),
    cancel: () => target.set({
        active: false,
        startTime: 0,
        paused: false,
        pausedAt: 0,
        totalPausedTime: 0
    }),
    pause: () => target.set(state => {
        if (!state.active || state.paused) return state;
        return {
            ...state,
            paused: true,
            pausedAt: performance.now()
        };
    }),
    resume: () => target.set(state => {
        if (!state.active || !state.paused) return state;
        const pauseDuration = performance.now() - state.pausedAt;
        return {
            ...state,
            paused: false,
            pausedAt: 0,
            totalPausedTime: state.totalPausedTime + pauseDuration
        };
    }),
    forceLock: () => {
        // Принудительная фиксация фигуры при нажатии пробела
        const state = target();
        if (state.active) {
            target.set({
                active: false,
                startTime: 0,
                paused: false,
                pausedAt: 0,
                totalPausedTime: 0
            });
            return true; // Возвращаем true если таймер был активен
        }
        return false; // Возвращаем false если таймер не был активен
    }
}));

// ПРАВИЛЬНАЯ ЛОГИКА: Только LOCK_DELAY_TIME управляет всем!
let gameTimerInterval: number | null = null;

// Эффект для управления игрой
effect(() => {
    const gameState = gameStateAtom();

    if (gameState === GameState.PLAYING) {
        // Запускаем игровой таймер
        if (!gameTimerInterval) {
            gameTimerInterval = setInterval(() => {
                const piece = currentPieceAtom();
                const lockDelay = lockDelayAtom();

                if (!piece) return;

                // Возобновляем lock delay если был на паузе
                if (lockDelay.active && lockDelay.paused) {
                    lockDelayAtom.resume();
                }

                // Lock delay запускается ВСЕГДА для текущей фигуры (ConPort #84)
                const currentTime = performance.now();
                if (!lockDelay.active) {
                    lockDelayAtom.start();
                }

                // Проверяем истек ли lock delay
                if (lockDelay.active && !lockDelay.paused) {
                    const elapsedTime = currentTime - lockDelay.startTime - lockDelay.totalPausedTime;

                    if (elapsedTime >= LOCK_DELAY_TIME) {
                        // Lock delay истек - пытаемся опустить фигуру еще раз
                        const newPos = { ...piece.position, y: piece.position.y - 1 };
                        if (canPlacePieceCompat(piece.blocks, newPos)) {
                            // Можем опуститься - опускаем (lock delay перезапустится через эффект)
                            currentPieceAtom.move(0, -1, 0);
                        } else {
                            // Не можем опуститься - фиксируем фигуру
                            lockDelayAtom.cancel();
                            gameActions.placePiece();
                        }
                    }
                }
            }, 50); // Проверяем каждые 50мс для плавности
        }
    } else if (gameState === GameState.PAUSED) {
        // Игра на паузе - паузим lock delay но НЕ останавливаем таймер
        const lockDelay = lockDelayAtom();
        if (lockDelay.active && !lockDelay.paused) {
            lockDelayAtom.pause();
        }
    } else {
        // Игра не идет - останавливаем таймер и отменяем lock delay
        if (gameTimerInterval) {
            clearInterval(gameTimerInterval);
            gameTimerInterval = null;
        }
        const lockDelay = lockDelayAtom();
        if (lockDelay.active) {
            lockDelayAtom.cancel();
        }
    }
});

// Эффект для отслеживания ЛЮБОГО опускания фигуры (автоматического и ручного)
let previousY: number | null = null;
effect(() => {
    const piece = currentPieceAtom();
    const gameState = gameStateAtom();

    if (piece && gameState === GameState.PLAYING) {
        // Если это первая проверка для новой фигуры, просто сохраняем Y
        if (previousY === null) {
            previousY = piece.position.y;
            return;
        }

        // Проверяем опустилась ли фигура (Y уменьшилось)
        if (piece.position.y < previousY) {
            // Фигура опустилась - запускаем lock delay по правилу ConPort #84
            lockDelayAtom.start();
            console.log(`⬇️ Фигура опустилась с ${previousY} до ${piece.position.y}, lock delay перезапущен!`);
        }

        // Обновляем предыдущую позицию
        previousY = piece.position.y;
    } else {
        // Сброс при смене состояния
        previousY = null;
    }
});

