import * as THREE from 'three';
import format from 'string-format';
import Extent from '../Core/Geographic/Extent';
import Fetcher from './Fetcher';
import OrientedImageParser from '../Parser/OrientedImageParser';
import OrientedImageMaterial from '../Renderer/OrientedImageMaterial';
import GeoJsonParser from '../Parser/GeoJsonParser';

function createSphere(radius) {
    if (!radius || radius <= 0) return undefined;
    var geometry = new THREE.SphereGeometry(radius, 32, 32);
    var material = new THREE.MeshPhongMaterial({ color: 0x7777ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5, wireframe: true });
    var sphere = new THREE.Mesh(geometry, material);
    sphere.visible = true;
    sphere.name = 'immersiveSphere';
    return sphere;
}

function preprocessDataLayer(layer) {
    layer.format = layer.format || 'json';
    layer.networkOptions = layer.networkOptions || { crossOrigin: '' };
    layer.background = layer.background || createSphere(layer.sphereRadius);
    layer.orientedImages = null;
    layer.currentPano = undefined;
    layer.cameras = [];
    layer.object3d = layer.object3d || new THREE.Group();

    if (!(layer.extent instanceof Extent)) {
        layer.extent = new Extent(layer.crs, layer.extent);
    }
    if (layer.background) {
        layer.background.layer = layer;
        layer.object3d.add(layer.background);
    }

    var promises = [];

    // layer.orientations: a GEOJSON file with position/orientation for all the oriented images
    promises.push(Fetcher.json(layer.orientations, layer.networkOptions)
        .then(orientations => GeoJsonParser.parse(orientations, layer))
        .then(features => OrientedImageParser.orientedImagesInit(features, layer)));
    // layer.calibrations: a JSON file with calibration for all cameras
    // it's possible to have more than one camera (ex: ladybug images with 6 cameras)
    promises.push(Fetcher.json(layer.calibrations, layer.networkOptions).then(calibrations =>
        OrientedImageParser.parse(calibrations, layer)));

    return Promise.all(promises).then((res) => {
        layer.orientedImages = res[0];
        layer.cameras = res[1];
        layer.material = new OrientedImageMaterial(layer.cameras);
        layer.object3d.add(layer.material.helpers);
        layer.material.helpers.visible = layer.cameraHelpers || false;
    });
}

// request textures for an oriented image
function loadOrientedImageData(layer, command) {
    const pano = command.requester;
    if (pano != layer.currentPano) {
        // command is outdated, do nothing
        return Promise.resolve();
    }
    const imageId = pano.properties.id;
    var promises = [];
    for (const camera of layer.cameras) {
        var sensorId = camera.name;
        var url = format(layer.images, { imageId, sensorId });
        promises.push(Fetcher.texture(url, layer.networkOptions));
    }
    return Promise.all(promises);
}

function executeCommand(command) {
    const layer = command.layer;
    return loadOrientedImageData(layer, command).then(result => command.resolve(result));
}

export default {
    preprocessDataLayer,
    executeCommand,
};
