import * as THREE from 'three';
import { BLOCK_SIZE, FIELD_SCALE_XZ, FIELD_SCALE_Y, LANDED_BLOCKS_OPACITY } from '../constants';

export const BLOCK_SIZE_XZ = BLOCK_SIZE * FIELD_SCALE_XZ;
export const BLOCK_SIZE_Y = BLOCK_SIZE * FIELD_SCALE_Y;

// Shared geometries for memory optimization
export const sharedBlockGeometry = new THREE.BoxGeometry(BLOCK_SIZE_XZ, BLOCK_SIZE_Y, BLOCK_SIZE_XZ);
export const sharedEdgesGeometry = new THREE.EdgesGeometry(sharedBlockGeometry);
export const menuBlockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
export const menuEdgesGeometry = new THREE.EdgesGeometry(menuBlockGeometry);

export const sharedPlaneGeometryHorizontal = new THREE.PlaneGeometry(BLOCK_SIZE_XZ, BLOCK_SIZE_XZ);
export const sharedPlaneGeometryVertical = new THREE.PlaneGeometry(BLOCK_SIZE_XZ, BLOCK_SIZE_Y);

export const materialPools = {
    blocks: new Map<number, THREE.MeshPhongMaterial>(),
    edges: new THREE.LineBasicMaterial({ color: 0x000000 }),
    projection: new THREE.MeshBasicMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
    }),
    projectionWhite: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
    }),
    projectionRed: new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
    }),
};

export function getBlockMaterial(color: number): THREE.MeshPhongMaterial {
    if (!materialPools.blocks.has(color)) {
        materialPools.blocks.set(
            color,
            new THREE.MeshPhongMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.2,
                transparent: true,
                opacity: LANDED_BLOCKS_OPACITY,
            }),
        );
    }
    return materialPools.blocks.get(color)!;
}

export function disposeObject3D(obj: THREE.Object3D) {
    obj.traverse(child => {
        if ((child as any).isMesh || (child as any).isLineSegments) {
            const meshOrLine = child as any;
            if (
                meshOrLine.geometry &&
                meshOrLine.geometry !== sharedBlockGeometry &&
                meshOrLine.geometry !== sharedEdgesGeometry &&
                meshOrLine.geometry !== menuBlockGeometry &&
                meshOrLine.geometry !== menuEdgesGeometry &&
                meshOrLine.geometry !== sharedPlaneGeometryHorizontal &&
                meshOrLine.geometry !== sharedPlaneGeometryVertical
            ) {
                meshOrLine.geometry.dispose();
            }
            if (
                meshOrLine.material &&
                meshOrLine.material !== materialPools.edges &&
                meshOrLine.material !== materialPools.projection &&
                meshOrLine.material !== materialPools.projectionWhite &&
                meshOrLine.material !== materialPools.projectionRed &&
                !materialPools.blocks.has((meshOrLine.material as any).color?.getHex?.())
            ) {
                if (Array.isArray(meshOrLine.material)) {
                    meshOrLine.material.forEach((mat: any) => {
                        if (
                            mat !== materialPools.edges &&
                            mat !== materialPools.projection &&
                            mat !== materialPools.projectionWhite &&
                            mat !== materialPools.projectionRed
                        )
                            mat.dispose();
                    });
                } else {
                    meshOrLine.material.dispose();
                }
            }
        }
    });
}
