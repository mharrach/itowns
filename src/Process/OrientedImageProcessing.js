function updatePano(context, camera, layer) {
    // look for the closest oriented image
    let minD = Infinity;
    let minI = -1;
    for (let i = 0; i < layer.orientedImages.length; i++) {
        const position = layer.orientedImages[i].geometry.vertices[0].xyz();
        const D = camera.position.distanceTo(position);
        if (D < minD) {
            minD = D;
            minI = i;
        }
    }
    // detection of oriented image change
    const ori = layer.orientedImages[minI];
    if (ori && layer.currentPano != ori) {
        layer.currentPano = ori;
        ori.index = minI;
        const command = {
            layer,
            view: context.view,
            threejsLayer: layer.threejsLayer,
            requester: ori,
        };
        context.scheduler.execute(command)
            .then(textures => layer.material.setTextures(textures, ori));
    }
}

function updateSphere(layer) {
    if (layer.background && layer.currentPano) {
        layer.currentPano.geometry.vertices[0].xyz(layer.background.position);
        layer.background.updateMatrixWorld();
        layer.background.material = layer.material || layer.background.material;
    }
}

export default {
    update() {
        return function update(context, layer) {
            layer.material.updateUniforms(context.camera.camera3D);
            updatePano(context, context.camera.camera3D, layer);
            updateSphere(layer);
        };
    },
};
