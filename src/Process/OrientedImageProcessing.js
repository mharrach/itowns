import * as THREE from 'three';
import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import ObjectRemovalHelper from './ObjectRemovalHelper';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';

function create3DObject(context, layer, node) {
    if (!node.parent && node.children.length) {
                // if node has been removed dispose three.js resource
        ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer.id, node);
        return;
    }

    if (!node.visible) {
        return;
    }

    const features = node.children.filter(n => n.layer == layer.id);
    if (features.length > 0) {
        return features;
    }

    if (!layer.tileInsideLimit(node, layer)) {
        return;
    }

    if (node.layerUpdateState[layer.id] === undefined) {
        node.layerUpdateState[layer.id] = new LayerUpdateState();
    }

    const ts = Date.now();

    if (!node.layerUpdateState[layer.id].canTryUpdate(ts)) {
        return;
    }

    node.layerUpdateState[layer.id].newTry();

    const command = {
        layer,
        view: context.view,
        threejsLayer: layer.threejsLayer,
        requester: node,
    };

    context.scheduler.execute(command).then((result) => {
        if (result) {
            node.layerUpdateState[layer.id].success();
            if (!node.parent) {
                ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer.id, result);
                return;
            }
                    // result coordinayes are in Worl system
                    // update position to be relative to the tile
            result.position.sub(node.extent.center().as(context.view.referenceCrs).xyz());
            result.layer = layer.id;
            node.add(result);
            node.updateMatrixWorld();
        } else {
            node.layerUpdateState[layer.id].failure(1, true);
        }
    },
            (err) => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[layer.id].success();
                } else if (err instanceof SyntaxError) {
                    node.layerUpdateState[layer.id].failure(0, true);
                } else {
                    node.layerUpdateState[layer.id].failure(Date.now());
                    setTimeout(node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000,
                    () => {
                        context.view.notifyChange(false);
                    });
                }
            });
}

function updateMatrixMaterial(layer, camera) {
    if (!layer.matrixWorldInverse) {
        return;
    }
    // a recalculer a chaque fois que la camera bouge
    var mCameraToPano = layer.matrixWorldInverse.clone().multiply(camera.matrixWorld);
    for (var i = 0; i < layer.material.uniforms.mvpp.value.length; ++i) {
        var mp2t = layer.sensors[i].mp2t.clone();
        layer.material.uniforms.mvpp.value[i] = mp2t.multiply(mCameraToPano);
    }
}

function updateMaterial(context, camera, scene, layer) {
    var currentPos = camera.position.clone();
    var position = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);
    const verbose = false;
    // if necessary create the sphere
    if (!layer.sphere && layer.sphereRadius) {
        // On cree une sphere et on l'ajoute a la scene
        var geometry = new THREE.SphereGeometry(layer.sphereRadius, 32, 32);
        // var material = layer.material;
        var material = new THREE.MeshPhongMaterial({ color: 0x7777ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5, wireframe: true });
        layer.sphere = new THREE.Mesh(geometry, material);
        layer.sphere.visible = true;
        layer.sphere.layer = layer;// layer.idsphere;
        layer.sphere.name = 'immersiveSphere';
        scene.add(layer.sphere);

        // sphere can be create before material
        // update the material to be sure
        if (layer.material) layer.sphere.material = layer.material;
    }

    // look for the closest oriented image
    if (layer.orientedImages)
    {
        var minDist = -1;
        var minIndice = -1;
        let indice = 0;
        if (verbose) {
            // eslint-disable-next-line no-console
            console.log('OrientedImageProcessing update : loop in ', layer.orientedImages.length, ' pano..');
        }
        for (const ori of layer.orientedImages) {
            var vPano = new THREE.Vector3(ori.coordinates._values[0], ori.coordinates._values[1], ori.coordinates._values[2]);
            var D = position.distanceTo(vPano);
            if ((minDist < 0) || (minDist > D)) {
                minDist = D;
                minIndice = indice;
            }
            ++indice;
        }
        if (verbose) {
            // eslint-disable-next-line no-console
            console.log('OrientedImageProcessing update : loop done !');
        }

        const oiInfo = layer.orientedImages[minIndice];

        // detection of oriented image change
        if (layer.currentPano !== minIndice) {
            layer.currentPano = minIndice;
            if (layer.sphere) {
                var P = oiInfo.coordinates;
                layer.sphere.position.set(P._values[0], P._values[1], P._values[2]);
                layer.sphere.updateMatrixWorld();
            }

            const command = {
                layer,
                view: context.view,
                threejsLayer: layer.threejsLayer,
                requester: minIndice,
            };

            context.scheduler.execute(command).then(result => updateMaterialWithTexture(result, oiInfo, layer, camera));
            // loadOrientedImageData(layer.orientedImages[minIndice], layer, camera);
        }
        else {
            // update the uniforms
            updateMatrixMaterial(layer, camera);
        }
    }
}

function updateMaterialWithTexture(textures, oiInfo, layer, camera) {
    if (!textures) return;
    for (let i = 0; i < textures.length; ++i) {
        var oldTexture = layer.material.uniforms.texture.value[i];
        layer.material.uniforms.texture.value[i] = textures[i];
        if (oldTexture) oldTexture.dispose();
    }
    layer.matrixWorldInverse = oiInfo.matrixWorldInverse;
    updateMatrixMaterial(layer, camera);
}

export default {
    update() {
        return function _(context, layer, node) {
            if (layer.points) create3DObject(context, layer, node);
            updateMaterial(context, context.camera.camera3D, context.view.scene, layer);
        };
    },
};
