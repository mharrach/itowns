import * as THREE from 'three';
import textureVS from './Shader/ProjectiveTextureVS.glsl';
import textureFS from './Shader/ProjectiveTextureFS.glsl';
import project_pars_vertex from './Shader/Chunk/project_pars_vertex.glsl';
import projective_texturing_vertex from './Shader/Chunk/projective_texturing_vertex.glsl';
import projective_texturing_pars_vertex from './Shader/Chunk/projective_texturing_pars_vertex.glsl';
import projective_texturing_pars_fragment from './Shader/Chunk/projective_texturing_pars_fragment.glsl';
import Capabilities from '../Core/System/Capabilities';

THREE.ShaderChunk.projective_texturing_vertex = projective_texturing_vertex;
THREE.ShaderChunk.projective_texturing_pars_vertex = projective_texturing_pars_vertex;
THREE.ShaderChunk.projective_texturing_pars_fragment = projective_texturing_pars_fragment;
THREE.ShaderChunk.project_pars_vertex = project_pars_vertex;


// adapted from unrollLoops in WebGLProgram
function unrollLoops(string, defines) {
    // look for a for loop with an unroll_loop pragma
    // The detection of the scope of the for loop is hacky as it does not support nested scopes
    var pattern = /#pragma unroll_loop\s+for\s*\(\s*int\s+i\s*=\s*(\d+);\s*i\s+<\s+([\w\d]+);\s*i\s*\+\+\s*\)\s*\{([^}]*)\}/g;
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

class OrientedImageMaterial extends THREE.RawShaderMaterial {
    constructor(sensors, options = {}) {
        options.side = options.side !== undefined ? options.side : THREE.DoubleSide;
        options.transparent = options.transparent !== undefined ? options.transparent : true;
        options.opacity = options.opacity !== undefined ? options.opacity : 0.1;
        super(options);
        this.defines.NUM_TEXTURES = sensors.length;
        this.defines.USE_DISTORTION = Number(sensors.some(sensor => sensor.distortion !== undefined));
        this.alphaBorder = 20;
        var textureMatrix = [];
        var texture = [];
        var distortion = [];
        for (let i = 0; i < sensors.length; ++i) {
            textureMatrix[i] = new THREE.Matrix4();
            texture[i] = new THREE.Texture();
            distortion[i] = {};
            distortion[i].size = sensors[i].size;
            if (sensors[i].distortion) {
                distortion[i].polynom = sensors[i].distortion.polynom;
                distortion[i].pps = sensors[i].distortion.pps;
                distortion[i].l1l2 = sensors[i].distortion.l1l2;
            }
            sensors[i].textureMatrix = new THREE.Matrix4().getInverse(sensors[i].matrix);
            sensors[i].textureMatrix.premultiply(sensors[i].projectionMatrix);
            sensors[i].textureMatrix.premultiply(ndcToTextureMatrix);
        }
        this.sensors = sensors;
        this.uniforms = {};
        this.uniforms.projectiveTextureAlphaBorder = new THREE.Uniform(this.alphaBorder);
        this.uniforms.projectiveTextureDistortion = new THREE.Uniform(distortion);
        this.uniforms.projectiveTextureMatrix = new THREE.Uniform(textureMatrix);
        this.uniforms.projectiveTexture = new THREE.Uniform(texture);
        if (Capabilities.isLogDepthBufferSupported()) {
            this.defines.USE_LOGDEPTHBUF = 1;
            this.defines.USE_LOGDEPTHBUF_EXT = 1;
        }
        this.vertexShader = textureVS;
        this.fragmentShader = unrollLoops(textureFS, this.defines);
        this.matrixWorldInverse = undefined;
    }

    setTextures(textures, matrixWorldInverse) {
        if (!textures) return;
        for (let i = 0; i < textures.length; ++i) {
            var oldTexture = this.uniforms.projectiveTexture.value[i];
            this.uniforms.projectiveTexture.value[i] = textures[i];
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
        for (var i = 0; i < this.sensors.length; ++i) {
            this.uniforms.projectiveTextureMatrix.value[i].multiplyMatrices(this.sensors[i].textureMatrix, cameraMatrix);
        }
    }
}

export default OrientedImageMaterial;
