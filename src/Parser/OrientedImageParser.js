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

function parseCalibration(calibration, options) {
    const proj = calibration.projection;
    const size = new THREE.Vector2().fromArray(calibration.size);
    const focal = new THREE.Vector2(proj[0], proj[4]);
    const point = new THREE.Vector2(proj[2], proj[5]);
    const skew = proj[1];

    var camera = new THREE.Camera();
    camera.textureMatrix = new THREE.Matrix4().set(
        focal.x / size.x, skew / size.x, point.x / size.x, 0,
        0, focal.y / size.y, point.y / size.y, 0,
        0, 0, 0, 1,
        0, 0, 1, 0);

    camera.projectionMatrix.multiplyMatrices(new THREE.Matrix4().set(
        2, 0, 0, -1,
        0, 2, 0, -1,
        0, 0, 1, 0,
        0, 0, 0, 1), camera.textureMatrix);

    var position = new THREE.Vector3().fromArray(calibration.position);
    var rotation = new THREE.Matrix3().fromArray(calibration.rotation).transpose();
    if (options.orientationType === 'Stereopolis2') {
        rotation.multiply(new THREE.Matrix3().set(
            0, 1, 0,
            -1, 0, 0,
            0, 0, 1));
    }
    camera.matrix = new THREE.Matrix4().setMatrix3(rotation.transpose()).setPosition(position);
    var matrixInverse = new THREE.Matrix4().getInverse(camera.matrix);
    camera.mp2t = camera.textureMatrix.clone().multiply(matrixInverse);
    camera.size = size;
    camera.name = calibration.id;
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
    return camera;
}


function getTransfoLocalToPanoStereopolis2(roll, pitch, heading) {
    const euler = new THREE.Euler(
        pitch * Math.PI / 180,
        roll * Math.PI / 180,
        heading * Math.PI / 180, 'ZXY');
    const qLocalToPano = new THREE.Quaternion().setFromEuler(euler);
    return new THREE.Matrix4().makeRotationFromQuaternion(qLocalToPano);
}

function getTransfoLocalToPanoMicMac(roll, pitch, heading) {
    // Omega
    var o = parseFloat(roll) / 180 * Math.PI;  // Deg to Rad // Axe X
    // Phi
    var p = parseFloat(pitch) / 180 * Math.PI;  // Deg to Rad // axe Y
    // Kappa
    var k = parseFloat(heading) / 180 * Math.PI;  // Deg to Rad // axe Z
    // c'est la matrice micmac transposée (surement par erreur)
    // il l'a ecrite en row major alors que l'ecriture interne est en column major
    var M4 = new THREE.Matrix4();
    M4.elements[0] = Math.cos(p) * Math.cos(k);
    M4.elements[1] = Math.cos(p) * Math.sin(k);
    M4.elements[2] = -Math.sin(p);

    M4.elements[4] = Math.cos(o) * Math.sin(k) + Math.sin(o) * Math.sin(p) * Math.cos(k);
    M4.elements[5] = -Math.cos(o) * Math.cos(k) + Math.sin(o) * Math.sin(p) * Math.sin(k);
    M4.elements[6] = Math.sin(o) * Math.cos(p);

    M4.elements[8] = Math.sin(o) * Math.sin(k) - Math.cos(o) * Math.sin(p) * Math.cos(k);
    M4.elements[9] = -Math.sin(o) * Math.cos(k) - Math.cos(o) * Math.sin(p) * Math.sin(k);
    M4.elements[10] = -Math.cos(o) * Math.cos(p);
    return M4;
}

function getTransfoGeoCentriqueToLocal(cGeocentrique) {
    var position = new THREE.Vector3().set(cGeocentrique._values[0], cGeocentrique._values[1], cGeocentrique._values[2]);
    var object = new THREE.Object3D();
    object.up = THREE.Object3D.DefaultUp;
    object.position.copy(position);
    object.lookAt(position.clone().multiplyScalar(1.1));
    object.updateMatrixWorld();
    return new THREE.Matrix4().makeRotationFromQuaternion(object.quaternion.clone().inverse()).multiply(new THREE.Matrix4().makeTranslation(-position.x, -position.y, -position.z));
}


function getTransfoLocalToPano(orientationType, roll, pitch, heading) {
    if (orientationType === 'Stereopolis2') {
        return getTransfoLocalToPanoStereopolis2(roll, pitch, heading);
    }
    else {
        return getTransfoLocalToPanoMicMac(roll, pitch, heading);
    }
}

function getTransfoWorldToPano(orientationType, ori) {
    var worldToLocal = getTransfoGeoCentriqueToLocal(ori.geometry.vertices[0]);
    var localToPano = getTransfoLocalToPano(orientationType, ori.properties.roll, ori.properties.pitch, ori.properties.heading);
    return localToPano.multiply(worldToLocal);
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
