import * as THREE from 'three';
import { NEXT_PIECE_POSITION, NEXT_PIECE_SCALE } from '../constants';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
export const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('scene-canvas') as HTMLCanvasElement,
    antialias: true,
    alpha: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);

const canvas = document.createElement('canvas');
canvas.width = 256;
canvas.height = 256;
const context = canvas.getContext('2d')!;
const gradient = context.createLinearGradient(0, 0, 0, 256);
gradient.addColorStop(0, '#0f1419');
gradient.addColorStop(0.3, '#0a0f1a');
gradient.addColorStop(0.7, '#050a15');
gradient.addColorStop(1, '#020408');
context.fillStyle = gradient;
context.fillRect(0, 0, 256, 256);

export const backgroundTexture = new THREE.CanvasTexture(canvas);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.sortObjects = true;

const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
scene.add(ambientLight);
export const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(5, 15, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.left = -12;
directionalLight.shadow.camera.right = 12;
directionalLight.shadow.camera.top = 12;
directionalLight.shadow.camera.bottom = -12;
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.bias = -0.0005;
scene.add(directionalLight);
export const pointLight1 = new THREE.PointLight(0x00ffff, 1.5, 100);
pointLight1.position.set(10, 10, 10);
pointLight1.castShadow = false;
scene.add(pointLight1);
export const pointLight2 = new THREE.PointLight(0xff00ff, 1.5, 100);
pointLight2.position.set(-10, -10, 10);
pointLight2.castShadow = false;
scene.add(pointLight2);

export const rotationContainer = new THREE.Group();
export const fieldContainer = new THREE.Group();
export const gameContainer = new THREE.Group();
export const landedBlocksContainer = new THREE.Group();
export const menuContainer = new THREE.Group();
export const nextPieceContainer = new THREE.Group();
export const staticUIContainer = new THREE.Group();

rotationContainer.rotation.y = 0;
rotationContainer.add(fieldContainer, gameContainer);
gameContainer.add(landedBlocksContainer);
nextPieceContainer.position.set(NEXT_PIECE_POSITION.x, NEXT_PIECE_POSITION.y, NEXT_PIECE_POSITION.z);
nextPieceContainer.scale.setScalar(NEXT_PIECE_SCALE);
scene.add(rotationContainer, menuContainer, nextPieceContainer, staticUIContainer);

camera.position.set(0, 14, 14);
camera.lookAt(0, 0, 0);

export function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

export function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();
