import * as THREE from 'three';
import format from 'string-format';
import Extent from '../Core/Geographic/Extent';
import Fetcher from './Fetcher';
import textureVS from '../Renderer/Shader/ProjectiveTextureVS.glsl';
import textureFS from '../Renderer/Shader/ProjectiveTextureFS.glsl';
import OrientedImageParser from '../Parser/OrientedImageParser';

function shadersInit(sensors, withDistort) {
    var U = {
        size: { type: 'v2v', value: [] },
        mvpp: { type: 'm4v', value: [] },
        texture: { type: 'tv', value: [] },
    };
    if (withDistort) {
        U.distortion = { type: 'v4v', value: [] };
        U.pps = { type: 'v2v', value: [] };
        U.l1l2 = { type: 'v3v', value: [] };
    }
    var i;
    for (i = 0; i < sensors.length; ++i) {
        U.size.value[i] = sensors[i].size;
        U.mvpp.value[i] = new THREE.Matrix4();
        U.texture.value[i] = new THREE.Texture();
        if (withDistort) {
            U.distortion.value[i] = sensors[i].distortion;
            U.pps.value[i] = sensors[i].pps;
            U.l1l2.value[i] = new THREE.Vector3().set(sensors[i].l1l2.x, sensors[i].l1l2.y, sensors[i].etats);
        }
    }
    let projectiveTextureFS = `#define N ${sensors.length}\n`;
    projectiveTextureFS += withDistort ? '#define WITH_DISTORT\n' : '';
    projectiveTextureFS += textureFS;
    for (i = 0; i < sensors.length; ++i) {
        projectiveTextureFS += `if(texcoord[${i}].z>0.) {\n\
        p =  texcoord[${i}].xy/texcoord[${i}].z;\n\
        #ifdef WITH_DISTORT\n\
          distort(p,distortion[${i}],l1l2[${i}],pps[${i}]);\n\
        #endif\n\
           d = borderfadeoutinv * getUV(p,size[${i}]);\n\
           if(d>0.) {\n\
               c = d*texture2D(texture[${i}],p);\n\
               color += c;\n\
               if(c.a>0.) ++blend;\n\
           }\n\
        }\n`;
    }
    projectiveTextureFS += '   if (color.a > 0.0) color = color / color.a;\n' +
        '   color.a = 1.;\n' +
        '   gl_FragColor = color;\n' +
        '} \n';
    // create the shader material for Three
    return new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: `#define N ${sensors.length}\n ${textureVS}`,
        fragmentShader: projectiveTextureFS,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.1,
    });
}

function preprocessDataLayer(layer) {
    layer.format = layer.options.mimetype || 'json';
    layer.offset = layer.offset || { x: 0, y: 0, z: 0 };
    layer.orientedImages = null;
    layer.currentPano = -1;
    layer.currentMat = null;
    layer.sensors = [];
    layer.networkOptions = { crossOrigin: '' };
    if (!(layer.extent instanceof Extent)) {
        layer.extent = new Extent(layer.projection, layer.extent);
    }
    var promises = [];

    // layer.orientations: a JSON file with position/orientation for all the oriented images
    promises.push(Fetcher.json(layer.orientations, layer.networkOptions));
    // layer.calibrations: a JSON file with calibration for all cameras
    // it's possible to have more than one camera (ex: ladybug images with 6 cameras)
    promises.push(Fetcher.json(layer.calibrations, layer.networkOptions));

    return Promise.all(promises).then((res) => {
        OrientedImageParser.orientedImagesInit(res[0], layer);
        OrientedImageParser.sensorsInit(res[1], layer);
        layer.shaderMat = shadersInit(layer.sensors, layer.withDistort);
    });
}

function tileInsideLimit(tile, layer) {
    return (layer.level === undefined || tile.level === layer.level) && layer.extent.intersect(tile.extent);
}

// request textures for an oriented image
function loadOrientedImageData(layer, command) {
    const minIndice = command.requester;
    if (minIndice != layer.currentPano) {
        // console.log('OrientedImage Provider cancel texture loading');
        return Promise.resolve();
    }
    const oiInfo = layer.orientedImages[minIndice];
    var promises = [];
    for (const sensor of layer.sensors) {
        var url = format(layer.images, { imageId: oiInfo.id, sensorId: sensor.id });
        const promise = Fetcher.texture(url, layer.networkOptions);
        promises.push(promise);
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
    // getFeatures,
};
