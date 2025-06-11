// Game states
export const GameState = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER'
} as const;

export type GameStateType = typeof GameState[keyof typeof GameState];

// Game field dimensions
// Logical field dimensions (number of cells)
export const FIELD_WIDTH = 7;
export const FIELD_DEPTH = 7;
export const FIELD_HEIGHT = 14;

// Visual field dimensions (world units)
export const ORIGINAL_FIELD_WIDTH = 10;
export const ORIGINAL_FIELD_DEPTH = 10;
export const ORIGINAL_FIELD_HEIGHT = 18;

// Scale factors to keep the same visual size when logical dimensions change
export const FIELD_SCALE_XZ = (ORIGINAL_FIELD_WIDTH - 1) / (FIELD_WIDTH - 1);
export const FIELD_SCALE_Y = (ORIGINAL_FIELD_HEIGHT - 1) / (FIELD_HEIGHT - 1);

// Visual constants
export const BLOCK_SIZE = 0.98;
export const FIELD_ROTATION_DURATION = 160; // ms
export const PIECE_ANIMATION_DURATION = 60; // ms для анимации движения фигур
export const LANDED_BLOCKS_OPACITY = 1.0; // Прозрачность упавших фигур
export const LOCK_DELAY_TIME = 1000; // ms - время задержки перед окончательным размещением фигуры

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

// Next piece preview
export const NEXT_PIECE_SCALE = 0.5;
export const NEXT_PIECE_POSITION = { x: 3, y: 3, z: 3 };
