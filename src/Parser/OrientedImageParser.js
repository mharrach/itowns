import * as THREE from 'three';
import Coordinates from '../Core/Geographic/Coordinates';

function getMatrix4FromRotation(Rot) {
    var M4 = new THREE.Matrix4();
    M4.elements[0] = Rot.elements[0];
    M4.elements[1] = Rot.elements[1];
    M4.elements[2] = Rot.elements[2];
    M4.elements[4] = Rot.elements[3];
    M4.elements[5] = Rot.elements[4];
    M4.elements[6] = Rot.elements[5];
    M4.elements[8] = Rot.elements[6];
    M4.elements[9] = Rot.elements[7];
    M4.elements[10] = Rot.elements[8];
    return M4;
}


// initialize a 3D position for each image (including offset or CRS projection if necessary)
function orientedImagesInit(res, layer) {
    layer.orientedImages = res;
    for (const ori of layer.orientedImages) {
        ori.easting += layer.offset.x;
        ori.northing += layer.offset.y;
        ori.altitude += layer.offset.z;
        if (layer.projection == 'EPSG:4978') {
            ori.coordinates = new Coordinates('EPSG:4978', ori.easting, ori.northing, ori.altitude);
        }
        else if (layer.projection == 'EPSG:4326') {
            ori.coordinates = new Coordinates('EPSG:4326', ori.easting, ori.northing, ori.altitude).as('EPSG:4978');
        }
        else {
            ori.coordinates = new Coordinates(layer.projection, ori.easting, ori.northing, ori.altitude).as('EPSG:4326').as('EPSG:4978');
        }
    }
}

// initialize a sensor for each camera and create the material (and the shader)
function sensorsInit(res, layer) {
    layer.withDistort = false;
    for (const s of res) {
        var sensor = {};
        sensor.id = s.id;

        var rotCamera2Pano = new THREE.Matrix3().fromArray(s.rotation);
        var rotTerrain = new THREE.Matrix3().set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1);
        if (layer.orientationType && (layer.orientationType == 'Stereopolis2')) {
            rotTerrain = new THREE.Matrix3().set(
                0, -1, 0,
                1, 0, 0,
                0, 0, 1);
        }
        var rotEspaceImage = new THREE.Matrix3().set(
            1, 0, 0,
            0, 1, 0,
            0, 0, 1);
        rotCamera2Pano = rotTerrain.clone().multiply(rotCamera2Pano.clone().multiply(rotEspaceImage));
        var rotPano2Camera = rotCamera2Pano.clone().transpose();

        var centerCameraInPano = new THREE.Vector3().fromArray(s.position);
        var transPano2Camera = new THREE.Matrix4().makeTranslation(
            -centerCameraInPano.x,
            -centerCameraInPano.y,
            -centerCameraInPano.z);
        var projection = (new THREE.Matrix3().fromArray(s.projection)).transpose();
        var rotPano2Texture = projection.clone().multiply(rotPano2Camera);
        sensor.mp2t = getMatrix4FromRotation(rotPano2Texture).multiply(transPano2Camera);
        // sensor.rotPano2Texture = rotPano2Texture;
        // sensor.centerCameraInPano = centerCameraInPano;
        sensor.distortion = null;
        sensor.pps = null;
        if (s.distortion) {
            sensor.pps = new THREE.Vector2().fromArray(s.distortion.pps);
            var disto = new THREE.Vector3().fromArray(s.distortion.poly357);
            sensor.distortion = new THREE.Vector4(disto.x, disto.y, disto.z, s.distortion.limit * s.distortion.limit);
            if (s.distortion.l1l2) {
                sensor.l1l2 = new THREE.Vector2().fromArray(s.distortion.l1l2);
                sensor.etats = s.distortion.etats;
            }
            else {
                sensor.l1l2 = new THREE.Vector2().set(0, 0);
                sensor.etats = 0;
            }
            layer.withDistort = true;
        }
        sensor.size = new THREE.Vector2().fromArray(s.size);
        layer.sensors.push(sensor);
    }
}


export default {
    orientedImagesInit,
    sensorsInit,
};
