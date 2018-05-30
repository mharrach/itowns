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

class OrientedImageMaterial extends THREE.ShaderMaterial {
    constructor(sensors, options = {}) {
        options.side = options.side !== undefined ? options.side : THREE.DoubleSide;
        options.transparent = options.transparent !== undefined ? options.transparent : true;
        options.opacity = options.opacity !== undefined ? options.opacity : 0.1;
        super(options);
        this.sensors = sensors;
        let i;
        var withDistort = false;
        for (i = 0; i < sensors.length; ++i) {
            withDistort |= sensors[i].distortion !== undefined;
        }
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
        this.uniforms = U;
        this.defines.N = sensors.length;
        this.defines.WITH_DISTORT = withDistort;
        this.vertexShader = textureVS;
        this.fragmentShader = unrollLoops(textureFS, this.defines);
    }
}

export default OrientedImageMaterial;
