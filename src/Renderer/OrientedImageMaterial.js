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
    constructor(cameras, options = {}) {
        options.side = options.side !== undefined ? options.side : THREE.DoubleSide;
        options.transparent = options.transparent !== undefined ? options.transparent : true;
        options.opacity = options.opacity !== undefined ? options.opacity : 0.1;
        super(options);
        this.defines.NUM_TEXTURES = cameras.length;
        this.defines.USE_DISTORTION = Number(cameras.some(camera => camera.distortion !== undefined));
        this.alphaBorder = 20;
        this.cameras = cameras;
        var textureMatrix = [];
        var texture = [];
        var distortion = [];
        this.group = new THREE.Group();
        this.helpers = new THREE.Group();
        for (let i = 0; i < cameras.length; ++i) {
            const camera = cameras[i];
            camera.textureMatrix = ndcToTextureMatrix.clone().multiply(camera.projectionMatrix);
            camera.textureMatrixWorldInverse = camera.textureMatrix.clone();
            textureMatrix[i] = camera.textureMatrix.clone();
            texture[i] = new THREE.Texture();
            distortion[i] = {};
            distortion[i].size = camera.size;
            if (camera.distortion) {
                distortion[i].polynom = camera.distortion.polynom;
                distortion[i].pps = camera.distortion.pps;
                distortion[i].l1l2 = camera.distortion.l1l2;
            }
            camera.near = 0.5;
            camera.far = 1;
            camera.updateMatrixWorld(true);
            this.group.add(camera);
            this.helpers.add(new THREE.CameraHelper(camera));
        }
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
    }

    setTextures(textures, feature) {
        if (!textures) return;
        this.group.position.copy(feature.position);
        this.group.quaternion.copy(feature.quaternion);
        this.group.updateMatrixWorld(true); // update the matrixWorldInverse of the cameras
        this.helpers.updateMatrixWorld(true); // update the matrixWorld of the helpers
        for (let i = 0; i < textures.length; ++i) {
            var oldTexture = this.uniforms.projectiveTexture.value[i];
            this.uniforms.projectiveTexture.value[i] = textures[i];
            if (oldTexture) oldTexture.dispose();
            const camera = this.cameras[i];
            camera.textureMatrixWorldInverse.multiplyMatrices(camera.textureMatrix, camera.matrixWorldInverse);
        }
    }

    updateUniforms(camera) {
        // update the uniforms using the current value of camera.matrixWorld
        for (var i = 0; i < this.cameras.length; ++i) {
            this.uniforms.projectiveTextureMatrix.value[i].multiplyMatrices(this.cameras[i].textureMatrixWorldInverse, camera.matrixWorld);
        }
    }
}

export default OrientedImageMaterial;
