import * as THREE from 'three';

class OrientedImageCamera extends THREE.Camera {
    constructor(size, focal, center, near, far, skew) {
        super();
        this.size = size;
        this.focal = focal.isVector2 ? focal : new THREE.Vector2(focal, focal);
        this.center = center || size.clone().multiplyScalar(0.5);
        this.skew = skew || 0;
        this.near = near || 0.1;
        this.far = far || 1000;
        this.updateProjectionMatrix();
    }

    updateProjectionMatrix() {
        const near = this.near;
        const sx = near / this.focal.x;
        const sy = near / this.focal.y;
        const left = -sx * this.center.x;
        const bottom = -sy * this.center.y;
        const right = left + sx * this.size.x;
        const top = bottom + sy * this.size.y;
        this.projectionMatrix.makePerspective(left, right, top, bottom, near, this.far);
    }
}

export default OrientedImageCamera;
