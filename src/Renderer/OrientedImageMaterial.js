import * as THREE from 'three';
import textureVS from './Shader/ProjectiveTextureVS.glsl';
import textureFS from './Shader/ProjectiveTextureFS.glsl';

// adapted from unrollLoops in WebGLProgram
function unrollLoops(string, defines) {
    // look for a for loop with an unroll_loop pragma
    // The detection of the scope of the for loop is hacky and relies on counting 3 closing accolades '}'
    var pattern = /#pragma unroll_loop\s+for\s*\(\s*int\s+i\s*=\s*(\d+);\s*i\s+<\s+([\w\d]+);\s*i\s*\+\+\s*\)\s*\{([^}]*\}[^}]*\}[^}]*)\}/g;
    function replace(match, start, end, snippet) {
        var unroll = '';
        end = end in defines ? defines[end] : end;
        for (var i = parseInt(start, 10); i < parseInt(end, 10); i++) {
            unroll += snippet.replace(/\[\s*i\s*\]/g, `[ ${i} ]`);
        }
        return unroll;
    }
    return string.replace(pattern, replace);
}

var ndcToTextureMatrix = new THREE.Matrix4().set(
    1, 0, 0, 1,
    0, 1, 0, 1,
    0, 0, 2, 0,
    0, 0, 0, 2);

class OrientedImageMaterial extends THREE.ShaderMaterial {
    constructor(sensors, options = {}) {
        options.side = options.side !== undefined ? options.side : THREE.DoubleSide;
        options.transparent = options.transparent !== undefined ? options.transparent : true;
        options.opacity = options.opacity !== undefined ? options.opacity : 0.1;
        super(options);
        var withDistort = sensors.some(sensor => sensor.distortion !== undefined);
        var size = [];
        var mvpp = [];
        var texture = [];
        var poly357 = [];
        var pps = [];
        var l1l2 = [];
        for (let i = 0; i < sensors.length; ++i) {
            size[i] = sensors[i].size;
            mvpp[i] = new THREE.Matrix4();
            texture[i] = new THREE.Texture();
            if (sensors[i].distortion) {
                poly357[i] = sensors[i].distortion.poly357;
                pps[i] = sensors[i].distortion.pps;
                l1l2[i] = sensors[i].distortion.l1l2;
            }
            sensors[i].textureMatrix = ndcToTextureMatrix.clone();
            sensors[i].textureMatrix.multiply(sensors[i].projectionMatrix);
            sensors[i].textureMatrix.multiply(mvpp[i].getInverse(sensors[i].matrix));
            // mvpp[i] is used as temporary space to prevent temp matrix allocation
        }
        this.sensors = sensors;
        this.uniforms = {};
        this.uniforms.size = new THREE.Uniform(size);
        this.uniforms.mvpp = new THREE.Uniform(mvpp);
        this.uniforms.texture = new THREE.Uniform(texture);
        if (withDistort) {
            this.uniforms.distortion = new THREE.Uniform(poly357);
            this.uniforms.pps = new THREE.Uniform(pps);
            this.uniforms.l1l2 = new THREE.Uniform(l1l2);
        }
        this.defines.NUM_TEXTURES = sensors.length;
        this.defines.WITH_DISTORT = Number(withDistort);
        this.vertexShader = textureVS;
        this.fragmentShader = unrollLoops(textureFS, this.defines);
        this.matrixWorldInverse = undefined;
    }

    setTextures(textures, matrixWorldInverse) {
        if (!textures) return;
        for (let i = 0; i < textures.length; ++i) {
            var oldTexture = this.uniforms.texture.value[i];
            this.uniforms.texture.value[i] = textures[i];
            if (oldTexture) oldTexture.dispose();
        }
        this.matrixWorldInverse = matrixWorldInverse;
    }

    updateUniforms(camera) {
        if (!this.matrixWorldInverse) {
            return;
        }

        // update the uniforms using the current value of camera.matrixWorld
        var cameraMatrix = this.matrixWorldInverse.clone().multiply(camera.matrixWorld);
        for (var i = 0; i < this.uniforms.mvpp.value.length; ++i) {
            this.uniforms.mvpp.value[i].multiplyMatrices(this.sensors[i].textureMatrix, cameraMatrix);
        }
    }
}

export default OrientedImageMaterial;
