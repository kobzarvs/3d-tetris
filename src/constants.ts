// Game states
export const GameState = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
} as const;

export type GameStateType = typeof GameState[keyof typeof GameState];

// Game field dimensions
export const FIELD_WIDTH = 10;
export const FIELD_DEPTH = 10;
export const FIELD_HEIGHT = 18;

// Visual constants
export const BLOCK_SIZE = 0.99;
export const FIELD_ROTATION_DURATION = 160; // ms
export const PIECE_ANIMATION_DURATION = 60; // ms для анимации движения фигур
export const LANDED_BLOCKS_OPACITY = 1.0; // Прозрачность упавших фигур
export const LOCK_DELAY_TIME = 500; // ms - время задержки перед окончательным размещением фигуры
export const MIN_3D_ARRAY_SIZE = 3; // Минимальный размер 3D массива для уничтожения
export const LEVEL_CLEAR_ANIMATION_DURATION = 500; // ms - время анимации исчезновения одного уровня

// Camera constants
export const DYNAMIC_CAMERA_DISTANCE = 10; // Базовое расстояние от точки наблюдения
export const DYNAMIC_CAMERA_MIN_DISTANCE = 5; // Минимальное расстояние от точки наблюдения
export const DYNAMIC_CAMERA_SMOOTH = 0.1; // Скорость сглаживания движения камеры
export const CAMERA_START_Z = 14;
export const CAMERA_START_Y = 14;

// Field coordinates
export const FIELD_TOP_Y = FIELD_HEIGHT / 2 - 0.5; // Верхний уровень стакана в мировых координатах
export const FIELD_BOTTOM_Y = -FIELD_HEIGHT / 2 + 0.5; // Нижний уровень стакана в мировых координатах

// Colors and UI
export const FROZEN_FIGURE_COLOR = 0xf3f3f3;
export const MINIMAP_SIZE = 300;

// Game mechanics
export const DROP_INTERVAL = 800;
export const PIECE_FALL_SPEED = 1000; // ms между автоматическими падениями

// Next piece preview
export const NEXT_PIECE_SCALE = 0.5;
export const NEXT_PIECE_POSITION = { x: 3, y: 3, z: 3 };