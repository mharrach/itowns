import * as THREE from 'three';

function updateMatrixMaterial(layer, camera) {
    if (!layer.matrixWorldInverse) {
        return;
    }
    // update the uniforms using the current value of camera.matrixWorld
    var mCameraToPano = layer.matrixWorldInverse.clone().multiply(camera.matrixWorld);
    for (var i = 0; i < layer.material.uniforms.mvpp.value.length; ++i) {
        layer.material.uniforms.mvpp.value[i].multiplyMatrices(layer.sensors[i].mp2t, mCameraToPano);
    }
}

function updateMaterial(context, camera, scene, layer) {
    if (!layer.orientedImages) {
        return;
    }

    // look for the closest oriented image
    const position = camera.position.clone();
    let minDist = Infinity;
    let minIndex = -1;
    for (let i = 0; i < layer.orientedImages.length; i++) {
        const D = position.distanceTo(layer.orientedImages[i].geometry.vertices[0].xyz());
        if (D < minDist) {
            minDist = D;
            minIndex = i;
        }
    }
    const closest = layer.orientedImages[minIndex];
    updateMatrixMaterial(layer, camera);

    // detection of oriented image change
    if (closest && layer.currentPano != closest) {
        closest.index = minIndex;
        layer.currentPano = closest;
        const command = {
            layer,
            view: context.view,
            threejsLayer: layer.threejsLayer,
            requester: closest,
        };
        context.scheduler.execute(command).then(textures => updateMaterialWithTexture(textures, closest, layer));
    }
}

function updateMaterialWithTexture(textures, closest, layer) {
    if (!textures) return;
    for (let i = 0; i < textures.length; ++i) {
        var oldTexture = layer.material.uniforms.texture.value[i];
        layer.material.uniforms.texture.value[i] = textures[i];
        if (oldTexture) oldTexture.dispose();
    }
    layer.matrixWorldInverse = closest.matrixWorldInverse;
}

export default {
    update() {
        return function _(context, layer) {
            updateMaterial(context, context.camera.camera3D, context.view.scene, layer);

            // create or update the sphere
            if (layer.sphereRadius) {
                if (!layer.sphere) {
                    // On cree une sphere et on l'ajoute a la scene
                    var geometry = new THREE.SphereGeometry(layer.sphereRadius, 32, 32);
                    // var material = layer.material;
                    var material = new THREE.MeshPhongMaterial({ color: 0x7777ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5, wireframe: true });
                    layer.sphere = new THREE.Mesh(geometry, material);
                    layer.sphere.visible = true;
                    layer.sphere.layer = layer;// layer.idsphere;
                    layer.sphere.name = 'immersiveSphere';
                    if (!layer.group) {
                            layer.group = new THREE.Group();
                    }
                    layer.group.add(layer.sphere);

                    // sphere can be create before material
                    // update the material to be sure
                    if (layer.material) layer.sphere.material = layer.material;
                }
                if (layer.currentPano) {
                    layer.currentPano.geometry.vertices[0].xyz(layer.sphere.position);
                    layer.sphere.updateMatrixWorld();
                }
            }
        };
    },
};
