import * as THREE from 'three';
import OrientedImageCamera from '../Renderer/OrientedImageCamera';

/**
 * The OrientedImageParser module provide a [parse]{@link module:OrientedImageParser.parse}
 * method that takes a JSON array of camera calibrations in and yields an array of THREE.Camera
 *
 * @module OrientedImageParser
 */

const DEG2RAD = THREE.Math.DEG2RAD;

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
    camera.matrix.setMatrix3(rotationInverse);
    // local axes for cameras is (X right, Y up, Z back) rather than (X right, Y down, Z front)
    camera.scale.set(1, -1, -1);
    camera.quaternion.setFromRotationMatrix(camera.matrix);
    camera.matrix.compose(camera.position, camera.quaternion, camera.scale);

    // parse distortion
    if (calibration.distortion) {
        camera.distortion = {
            pps: new THREE.Vector2().fromArray(calibration.distortion.pps),
            polynom: new THREE.Vector4().fromArray(calibration.distortion.poly357),
            l1l2: new THREE.Vector3().set(0, 0, 0),
        };
        camera.distortion.polynom.w = calibration.distortion.limit * calibration.distortion.limit;
        if (calibration.distortion.l1l2) {
            camera.distortion.l1l2.fromArray(calibration.distortion.l1l2);
            camera.distortion.l1l2.z = calibration.distortion.etats;
        }
    }

    camera.name = calibration.id;
    return camera;
}

// The transform from world to local is  RotationZ(heading).RotationX(pitch).RotationY(roll)
// The transform from local to world is (RotationZ(heading).RotationX(pitch).RotationY(roll)).transpose()
THREE.Quaternion.prototype.setFromRollPitchHeading = function setFromRollPitchHeading(roll, pitch, heading) {
    roll *= DEG2RAD;
    pitch *= DEG2RAD;
    heading *= DEG2RAD;
    // return this.setFromEuler(new THREE.Euler(pitch, roll, heading , 'ZXY')).conjugate();
    return this.setFromEuler(new THREE.Euler(-pitch, -roll, -heading, 'YXZ')); // optimized version of above
};

// From DocMicMac, the transform from local to world is:
// RotationX(omega).RotationY(phi).RotationZ(kappa).RotationX(PI)
// RotationX(PI) = Scale(1, -1, -1) converts between the 2 conventions for the camera local frame:
//  X right, Y bottom, Z front : convention in webGL, threejs and computer vision
//  X right, Y top,    Z back  : convention in photogrammetry
THREE.Quaternion.prototype.setFromOmegaPhiKappa = function setFromOmegaPhiKappa(omega, phi, kappa) {
    omega *= DEG2RAD;
    phi *= DEG2RAD;
    kappa *= DEG2RAD;
    this.setFromEuler(new THREE.Euler(omega, phi, kappa, 'XYZ'));
    // this.setFromRotationMatrix(new THREE.Matrix4().makeRotationFromQuaternion(this).scale(new THREE.Vector3(1, -1, -1)));
    this.set(this.w, this.z, -this.y, -this.x); // optimized version of above
    return this;
};

/**
 * @function setENUFromGeodesicNormal
 * @param {Vector3} up - the normalized geodetic normal to the ellipsoid (given by Coordinates.geodeticNormal)
 * @returns {Quaternion} this
 */
THREE.Quaternion.prototype.setENUFromGeodesicNormal = (() => {
    const matrix = new THREE.Matrix4();
    const elements = matrix.elements;
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    return function setENUFromGeodesicNormal(up) {
        // this is an optimized version of matrix.lookAt(up, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
        east.set(-up.y, up.x, 0);
        east.normalize();
        north.crossVectors(up, east);
        north.normalize();
        elements[0] = east.x; elements[4] = north.x; elements[8] = up.x;
        elements[1] = east.y; elements[5] = north.y; elements[9] = up.y;
        elements[2] = east.z; elements[6] = north.z; elements[10] = up.z;
        return this.setFromRotationMatrix(matrix);
    };
})();

/**
 *
 * @typedef Attitude
 * @type {Object}
 *
 * @property {Number} omega - angle in degrees
 * @property {Number} phi - angle in degrees
 * @property {Number} kappa - angle in degrees
 * @property {Number} roll - angle in degrees
 * @property {Number} pitch - angle in degrees
 * @property {Number} heading - angle in degrees
 */

/**
 * @function setFromAttitude
 * @param {Attitude} attitude - [Attitude]{@link module:OrientedImageParser~Attitude}
 * with properties: (omega, phi, kappa), (roll, pitch, heading) or none.
 * @returns {THREE.Quaternion} this
 */
THREE.Quaternion.prototype.setFromAttitude = function setFromAttitude(attitude) {
    if ((attitude.roll !== undefined) && (attitude.pitch !== undefined) && (attitude.heading !== undefined)) {
        return this.setFromRollPitchHeading(attitude.roll, attitude.pitch, attitude.heading);
    }
    if ((attitude.omega !== undefined) && (attitude.phi !== undefined) && (attitude.kappa !== undefined)) {
        return this.setFromOmegaPhiKappa(attitude.omega, attitude.phi, attitude.kappa);
    }
    return this.set(0, 0, 0, 1);
};

// initialize a 3D position for each image (including CRS conversion if necessary)
function setPositionQuaternionInFeatures(features, options = {}) {
    if (options.crsOut !== 'EPSG:4978') {
        console.warn('orientedImagesInit untested for this crsOut: ', options.crsOut);
    }
    const attitudeQuat = new THREE.Quaternion();
    for (const feature of features) {
        const coordinates = feature.geometry.vertices[0];
        feature.position = coordinates.xyz();
        feature.quaternion = new THREE.Quaternion().setENUFromGeodesicNormal(coordinates.geodesicNormal);
        attitudeQuat.setFromAttitude(feature.properties);
        feature.quaternion.multiply(attitudeQuat);
    }
    return features;
}

export default {
    setPositionQuaternionInFeatures,

    /**
     * @function parse
     * @param {string|JSON} json - the json content of the calibration file.
     * @param {Object} options - Options controlling the parsing.
     * @param {string} options.crsOut - The CRS to convert the input coordinates to.
     * @return {Promise} - a promise that resolves with a camera.
     */
    parse(json, options = {}) {
        if (typeof (json) === 'string') {
            json = JSON.parse(json);
        }
        return Promise.resolve(json.map(calibration => parseCalibration(calibration, options)));
    },
};
