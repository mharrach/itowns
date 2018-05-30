import * as THREE from 'three';
import textureVS from './Shader/ProjectiveTextureVS.glsl';
import textureFS from './Shader/ProjectiveTextureFS.glsl';

function create(sensors) {
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

export default {
    create,
};
