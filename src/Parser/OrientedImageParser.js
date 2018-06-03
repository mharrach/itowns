import * as THREE from 'three';

THREE.Matrix4.prototype.setMatrix3 = function setMatrix3(m) {
    this.elements[0] = m.elements[0];
    this.elements[1] = m.elements[1];
    this.elements[2] = m.elements[2];
    this.elements[4] = m.elements[3];
    this.elements[5] = m.elements[4];
    this.elements[6] = m.elements[5];
    this.elements[8] = m.elements[6];
    this.elements[9] = m.elements[7];
    this.elements[10] = m.elements[8];
    return this;
};

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
        const top = -sy * this.center.y;
        const right = left + sx * this.size.x;
        const bottom = top + sy * this.size.y;
        this.projectionMatrix.makePerspective(left, right, top, bottom, near, this.far);
    }
}

// the json format encodes the following transformation:
// extrinsics: p_local = rotation * (p_world - position)
// intrinsics: p_pixel = projection * p_local
// distortion: p_raw = distortion(p_pixel)
function parseCalibration(calibration, options) {
    // parse intrinsics
    const proj = calibration.projection;
    const size = new THREE.Vector2().fromArray(calibration.size);
    const focal = new THREE.Vector2(proj[0], proj[4]);
    const center = new THREE.Vector2(proj[2], proj[5]);
    const skew = proj[1];
    var camera = new OrientedImageCamera(size, focal, center, skew, options.near, options.far);

    // parse extrinsics: Object3d.matrix is from local to world
    // p_world = position + transpose(rotation) * p_local
    camera.position.fromArray(calibration.position);
    // calibration.rotation is row-major but fromArray expects a column-major array, yielding the transposed matrix
    var rotationInverse = new THREE.Matrix3().fromArray(calibration.rotation);
    camera.matrix.setMatrix3(rotationInverse).setPosition(camera.position);
    // local axes for cameras is (X right, Y up, Z back) rather than (X right, Y down, Z front)
    camera.matrix.scale(new THREE.Vector3(1, -1, -1));
    camera.quaternion.setFromRotationMatrix(camera.matrix);

    // parse distortion
    if (calibration.distortion) {
        camera.distortion = {
            pps: new THREE.Vector2().fromArray(calibration.distortion.pps),
            poly357: new THREE.Vector4().fromArray(calibration.distortion.poly357),
            l1l2: new THREE.Vector3().set(0, 0, 0),
        };
        camera.distortion.poly357.w = calibration.distortion.limit * calibration.distortion.limit;
        if (calibration.distortion.l1l2) {
            camera.distortion.l1l2.fromArray(calibration.distortion.l1l2);
            camera.distortion.l1l2.z = calibration.distortion.etats;
        }
    }

    camera.name = calibration.id;
    return camera;
}

function getTransfoLocalToPanoFromRollPitchHeading(roll, pitch, heading) {
    // const euler = new THREE.Euler(
    //     pitch * Math.PI / 180,
    //     roll * Math.PI / 180,
    //     heading * Math.PI / 180, 'ZXY');
    // const qLocalToPano = new THREE.Quaternion().setFromEuler(euler);
    // return new THREE.Matrix4().makeRotationFromQuaternion(qLocalToPano);
    // The sample code with explicit rotation composition
    var R = new THREE.Matrix4().makeRotationZ(heading * Math.PI / 180);
    R.multiply(new THREE.Matrix4().makeRotationX(pitch * Math.PI / 180));
    R.multiply(new THREE.Matrix4().makeRotationY(roll * Math.PI / 180));
    return R;
}

function getTransfoLocalToPanoFromOmegaPhiKappa(omega, phi, kappa) {
    // From DocMicMac
    // transfo image to world
    // M = R(roll / X).R(pitch / Y).R(heading / Z).cv2p
    // cv2p : conversion from computer vision image coordinate system to photogrammetry image coordinate system
    // computer vision image coordinate system = line top down
    // photogrammetry image coordinate system = line bottom up
    // so for LocalToPano (reverse transformation)
    // M = trix.[R(roll / X).R(pitch / Y).R(heading / Z)]^-1
    const cv2p = new THREE.Matrix4().set(
            1, 0, 0, 0,
            0, -1, 0, 0,
            0, 0, -1, 0,
            0, 0, 0, 1);
    // const euler = new THREE.Euler(
    //     roll * Math.PI / 180,
    //     pitch * Math.PI / 180,
    //     heading * Math.PI / 180, 'XYZ');
    // const qPanoToLocal = new THREE.Quaternion().setFromEuler(euler);
    // const rLocalToPano = (new THREE.Matrix4().makeRotationFromQuaternion(qPanoToLocal)).transpose();
    // return cv2p.multiply(rLocalToPano);
    // The sample code with explicit rotation composition
    var R = new THREE.Matrix4().makeRotationX(omega * Math.PI / 180);
    R.multiply(new THREE.Matrix4().makeRotationY(phi * Math.PI / 180));
    R.multiply(new THREE.Matrix4().makeRotationZ(kappa * Math.PI / 180));
    R.transpose();
    return cv2p.multiply(R);
}

var position = new THREE.Vector3();
var target = new THREE.Vector3(0, 0, 0);
var up = new THREE.Vector3(0, 0, 1);
function getTransfoGeoCentriqueToLocal(coordinates) {
    coordinates.xyz(position);
    var rotation = new THREE.Matrix4().lookAt(coordinates.geodesicNormal, target, up);
    return rotation.transpose().multiply(new THREE.Matrix4().makeTranslation(-position.x, -position.y, -position.z));
}


function getTransfoWorldToPano(orientationType, ori) {
    var worldToLocal = getTransfoGeoCentriqueToLocal(ori.geometry.vertices[0]);
    if ((ori.properties.roll != undefined) && (ori.properties.pitch != undefined) && (ori.properties.heading != undefined)) {
        return getTransfoLocalToPanoFromRollPitchHeading(ori.properties.roll, ori.properties.pitch, ori.properties.heading).multiply(worldToLocal);
    }
    else if ((ori.properties.omega != undefined) && (ori.properties.phi != undefined) && (ori.properties.kappa != undefined)) {
        return getTransfoLocalToPanoFromOmegaPhiKappa(ori.properties.omega, ori.properties.phi, ori.properties.kappa).multiply(worldToLocal);
    }
    return worldToLocal;
}


// initialize a 3D position for each image (including CRS conversion if necessary)
function orientedImagesInit(orientations, options = {}) {
    if (options.crsOut !== 'EPSG:4978') {
        console.warn('orientedImagesInit untested for this crsOut: ', options.crsOut);
    }

    for (const ori of orientations) {
        ori.matrixWorldInverse = getTransfoWorldToPano(options.orientationType, ori);
    }
    return orientations;
}

export default {
    orientedImagesInit,

    /** @module OrientedImageParser */
    /**
     * @function parse
     * @param {string|JSON} json - the json content of the calibration file.
     * @param {Object} options - Options controlling the parsing.
     * @param {string} options.crsOut - The CRS to convert the input coordinates to.
     * @param {string} options.orientationType - 'micmac' or 'Stereopolis2'
     * @return {Promise} - a promise that resolves with a camera.
     */
    parse(json, options = {}) {
        options.orientationType = options.orientationType || 'micmac';
        if (typeof (json) === 'string') {
            json = JSON.parse(json);
        }
        return Promise.resolve(json.map(calibration => parseCalibration(calibration, options)));
    },
};
