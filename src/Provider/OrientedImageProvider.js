import format from 'string-format';
import Extent from '../Core/Geographic/Extent';
import Fetcher from './Fetcher';
import OrientedImageParser from '../Parser/OrientedImageParser';
import OrientedImageMaterial from '../Renderer/OrientedImageMaterial';
import GeoJsonParser from '../Parser/GeoJsonParser';

function preprocessDataLayer(layer) {
    layer.format = layer.format || 'json';
    layer.offset = layer.offset || { x: 0, y: 0, z: 0 };
    layer.networkOptions = layer.networkOptions || { crossOrigin: '' };
    layer.orientedImages = null;
    layer.currentPano = undefined;
    layer.sensors = [];
    if (!(layer.extent instanceof Extent)) {
        layer.extent = new Extent(layer.crs, layer.extent);
    }
    var promises = [];

    // layer.orientations: a JSON file with position/orientation for all the oriented images
    promises.push(Fetcher.json(layer.orientations, layer.networkOptions)
        .then(orientations => GeoJsonParser.parse(orientations, layer))
        .then(features => OrientedImageParser.orientedImagesInit(features, layer)));
    // layer.calibrations: a JSON file with calibration for all cameras
    // it's possible to have more than one camera (ex: ladybug images with 6 cameras)
    promises.push(Fetcher.json(layer.calibrations, layer.networkOptions).then(calibrations =>
        OrientedImageParser.parse(calibrations, layer)));

    return Promise.all(promises).then((res) => {
        layer.orientedImages = res[0];
        layer.sensors = res[1];
        layer.material = new OrientedImageMaterial(layer.sensors);
    });
}

function tileInsideLimit(tile, layer) {
    return (layer.level === undefined || tile.level === layer.level) && layer.extent.intersect(tile.extent);
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
    for (const sensor of layer.sensors) {
        var sensorId = sensor.name;
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
    tileInsideLimit,
};
