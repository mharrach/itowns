/* global itowns, document, renderer, orientedImageGUI  */
// # Simple Globe viewer

// Define initial camera position
var positionOnGlobe = {
    longitude: 2.423814,
    latitude: 48.844882,
    altitude: 100 };

var promises = [];

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
var viewerDiv = document.getElementById('viewerDiv');

// Instanciate iTowns GlobeView*
var globeView = new itowns.GlobeView(viewerDiv, positionOnGlobe, {
    renderer: renderer,
    handleCollision: false,
    // sseSubdivisionThreshold: 10,
    sseSubdivisionThreshold: 6,
    noControls: true,
});

//globeView.controls.minDistance = 0;

function addLayerCb(layer) {
    return globeView.addLayer(layer);
}

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
itowns.proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Add one imagery layer to the scene
// This layer is defined in a json file but it could be defined as a plain js
// object. See Layer* for more info.
promises.push(itowns.Fetcher.json('./layers/JSONLayers/Ortho.json').then(addLayerCb));

// Add two elevation layers.
// These will deform iTowns globe geometry to represent terrain elevation.
promises.push(itowns.Fetcher.json('./layers/JSONLayers/WORLD_DTM.json').then(addLayerCb));
promises.push(itowns.Fetcher.json('./layers/JSONLayers/IGN_MNT_HIGHRES.json').then(addLayerCb));

var plane;
var camera;

var pictureInfos = {
    panoramic: {
        northing: 690.513643,
        easting: 732.292932,
        altitude: 52.273318,
        roll: -146.418862,
        pitch: -80.4872,
        heading: -151.352533,
        image: "./orientedImages/StMande_20171109_1_000_CAM24_nodist.jpg",
    },
    camera: {
        size: [2560, 1920],
        focal: 966.2159779935166,
        ppaX: 1303.3106550704085,
        ppaY: 973.3103220398533,
        // Starting with ENH orientation,  ( X to east, Y to the north, Z is the vertical)
        // we are doing rotation in the same space, look at Z, up to the Y
        enhToOrientationLookAt: new itowns.THREE.Vector3(0, 0, 1),
        enhToOrientationUp: new itowns.THREE.Vector3(0, 1, 0),
        // From the previous space (ENH)
        // let's define the camera orientation
        orientationToCameraUp: new itowns.THREE.Vector3(0, -1, 0),
        orientationToCameraLookAt: new itowns.THREE.Vector3(0, 0, 1),
    },
    offset: { x: 657000, y: 6860000, z: -0.4 },
    distance: 10,
    debugScale: 1,
    opacity: 0.8,
    orientation: true,
}

function parseInfoEastingNorthAltitudeToCoordinate(projection, info, offset) {
    return new itowns.Coordinates(projection, info.easting + offset.x, info.northing + offset.y, info.altitude + offset.z);
};

function parseMicMacOrientationToMatrix(panoramic) {
    const euler = new itowns.THREE.Euler(
        itowns.THREE.Math.degToRad(panoramic.roll),
        itowns.THREE.Math.degToRad(panoramic.pitch),
        itowns.THREE.Math.degToRad(panoramic.heading),
        'XYZ');

    const matrixFromEuler = new itowns.THREE.Matrix4().makeRotationFromEuler(euler);

    // The three angles ω,ɸ,k are computed
    // for a traditionnal image coordinate system (X=colomns left to right and Y=lines bottom up)
    // and not for a computer vision compliant geometry (X=colomns left to right and Y=lines top down)
    // so we have to multiply to rotation matrix by this matrix :
    var inverseYZ = new itowns.THREE.Matrix4().set(
            1, 0, 0, 0,
            0, -1, 0, 0,
            0, 0, -1, 0,
            0, 0, 0, 1);

    matrixFromEuler.multiply(inverseYZ);

    return matrixFromEuler;
};

var coord = parseInfoEastingNorthAltitudeToCoordinate('EPSG:2154', pictureInfos.panoramic, pictureInfos.offset);
var rotationMatrix = parseMicMacOrientationToMatrix(pictureInfos.panoramic);


camera = initCamera(globeView, pictureInfos.panoramic.image, coord,
    pictureInfos.camera.enhToOrientationUp, pictureInfos.camera.enhToOrientationLookAt,
    rotationMatrix,
    pictureInfos.camera.orientationToCameraUp, pictureInfos.camera.orientationToCameraLookAt,
    pictureInfos.distance,
    pictureInfos.camera.size, pictureInfos.camera.focal);

plane = setupPictureFromCamera(camera, pictureInfos.panoramic.image, pictureInfos.opacity,
        pictureInfos.distance);

setupViewCameraDecomposing(globeView, camera);

// open view camera FOV of 10° to see landscape around the picture.
globeView.camera.camera3D.fov = camera.fov + 10;
globeView.camera.camera3D.updateProjectionMatrix();

// uncomment to debug camera
addCameraHelper(globeView, camera);

// eslint-disable-next-line no-new
new itowns.FirstPersonControls(globeView);

//
// for IGN building picture
// add red balls to display target on the wall
//
function cibleInit(res) {
    var geometry = new itowns.THREE.SphereGeometry(0.035, 32, 32);
    var material = new itowns.THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (const s of res) {
        const coord = new itowns.Coordinates('EPSG:2154', s.long, s.lat, s.alt);
        var sphere = new itowns.THREE.Mesh(geometry, material);
        coord.as('EPSG:4978').xyz(sphere.position);
        globeView.scene.add(sphere);
        sphere.updateMatrixWorld();
    }
}
var promises = [];
promises.push(itowns.Fetcher.json('./Li3ds/cibles.json', { crossOrigin: '' }));
Promise.all(promises).then((res) => {
    cibleInit(res[0])
});

// 
// for IGN building picture
// add extruded buildings (like WFS example).
// 
function colorBuildings(properties) {
    if (properties.id.indexOf('bati_remarquable') === 0) {
        return new itowns.THREE.Color(0x5555ff);
    } else if (properties.id.indexOf('bati_industriel') === 0) {
        return new itowns.THREE.Color(0xff5555);
    }
    return new itowns.THREE.Color(0xeeeeee);
}

function altitudeBuildings(properties) {
    return properties.z_min - properties.hauteur;
}

function extrudeBuildings(properties) {
    return properties.hauteur;
}

globeView.addLayer({
    type: 'geometry',
    update: itowns.FeatureProcessing.update,
    convert: itowns.Feature2Mesh.convert({
        color: colorBuildings,
        altitude: altitudeBuildings,
        extrude: extrudeBuildings }),
    url: 'http://wxs.ign.fr/72hpsel8j8nhb5qgdh07gcyp/geoportail/wfs?',
    protocol: 'wfs',
    version: '2.0.0',
    id: 'WFS Buildings',
    typeName: 'BDTOPO_BDD_WLD_WGS84G:bati_remarquable,BDTOPO_BDD_WLD_WGS84G:bati_indifferencie,BDTOPO_BDD_WLD_WGS84G:bati_industriel',
    level: 16,
    projection: 'EPSG:4326',
    ipr: 'IGN',
    options: {
        mimetype: 'json',
    },
    wireframe: true,
}, globeView.tileLayer);


// eslint-disable-next-line no-new
new itowns.FirstPersonControls(globeView);

exports.view = globeView;
exports.initialPosition = positionOnGlobe;
