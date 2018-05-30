import * as THREE from 'three';
import format from 'string-format';
import Extent from '../Core/Geographic/Extent';
import Fetcher from './Fetcher';
import TileMesh from '../Core/TileMesh';
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
    const tile = command.requester;
    const destinationCrs = command.view.referenceCrs;
    // position of pano
    if (command.requester instanceof TileMesh) {
        return getFeatures(destinationCrs, tile, layer, command).then(result => command.resolve(result));
    } else {
        // texture of pano
        return loadOrientedImageData(layer, command).then(result => command.resolve(result));
    }
}

function assignLayer(object, layer) {
    if (object) {
        object.layer = layer.id;
        object.layers.set(layer.threejsLayer);
        for (const c of object.children) {
            assignLayer(c, layer);
        }
        return object;
    }
}

function applyColor(colorAttribute, indice) {
    const pos = indice / 3;
    const pos4 = pos % 4;
    switch (pos4) {
        case 0:
            colorAttribute[indice] = 0;
            colorAttribute[indice + 1] = 255;
            colorAttribute[indice + 2] = 0;
            break;
        case 1:
            colorAttribute[indice] = 255;
            colorAttribute[indice + 1] = 255;
            colorAttribute[indice + 2] = 0;
            break;
        case 2:
            colorAttribute[indice] = 255;
            colorAttribute[indice + 1] = 0;
            colorAttribute[indice + 2] = 0;
            break;
        case 3:
            colorAttribute[indice] = 0;
            colorAttribute[indice + 1] = 0;
            colorAttribute[indice + 2] = 0;
            break;
        default:
            break;
    }
}

// load data for a layer/tile/crs
function getFeatures(crs, tile, layer) {
    if ((layer.orientedImages) && (layer.orientedImages.length > 0))
    {
        var sel = [];
        var prop = [];
        var indicePano = [];
        let i = 0;
        for (const ori of layer.orientedImages) {
            var coordinates = ori.coordinates;
            if (tile.extent.isPointInside(coordinates)) {
                sel.push([coordinates._values[0], coordinates._values[1], coordinates._values[2]]);
                prop.push(ori);
                indicePano.push(i);
            }
            ++i;
        }
        if (sel.length) {
            // create THREE.Points with the orientedImage position
            const vertices = new Float32Array(3 * sel.length);
            const colorAttribute = new Uint8Array(sel.length * 3);
            let indice = 0;
            for (const v of sel) {
                vertices[indice] = v[0] - sel[0][0];
                vertices[indice + 1] = v[1] - sel[0][1];
                vertices[indice + 2] = v[2] - sel[0][2];

                applyColor(colorAttribute, indice);
                indice += 3;
            }
            const bufferGeometry = new THREE.BufferGeometry();
            bufferGeometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
            bufferGeometry.addAttribute('color', new THREE.BufferAttribute(colorAttribute, 3, true));
            const P = new THREE.Points(bufferGeometry);

            P.material.vertexColors = THREE.VertexColors;
            P.material.color = new THREE.Color(0xffffff);
            P.material.size = 5;
            P.material.sizeAttenuation = false;
            P.opacity = 0.5;
            P.transparent = true;

            P.position.set(sel[0][0], sel[0][1], sel[0][2]);
            P.updateMatrixWorld(true);
            return Promise.resolve(assignLayer(P, layer));
        }
    }
    return Promise.resolve();
}


export default {
    preprocessDataLayer,
    executeCommand,
    tileInsideLimit,
    // getFeatures,
};
