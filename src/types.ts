// Animation state
export interface AnimationState {
    isAnimating: boolean;
    animationStartTime: number;
    animationStartPosition: { x: number; y: number; z: number };
    animationTargetPosition: { x: number; y: number; z: number };
}
