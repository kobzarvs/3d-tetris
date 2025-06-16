import * as THREE from 'three';

// Simple 3D coordinate structure
export interface Block3D {
    x: number;
    y: number;
    z: number;
}

// Camera modes
export type CameraMode = 'front' | 'top';

// Menu animation interface
export interface AnimatedPiece extends THREE.Group {
    fallSpeed: number;
    rotationSpeed: { x: number; y: number; z: number };
}

// Animation state
export interface AnimationState {
    isAnimating: boolean;
    animationStartTime: number;
    animationStartPosition: { x: number; y: number; z: number };
    animationTargetPosition: { x: number; y: number; z: number };
}

// Camera state
export interface CameraState {
    mode: CameraMode;
    dynamicCameraTarget: THREE.Vector3;
    dynamicCameraPosition: THREE.Vector3;
}

// UI state
export interface UIState {
    controlsHelpVisible: boolean;
    keyHintsVisible: boolean;
    projectionsVisible: boolean;
}
