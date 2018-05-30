precision highp float;

#include <logdepthbuf_pars_vertex>
#define EPSILON 1e-6

uniform mat4 mvpp[NUM_TEXTURES];
varying vec4 texcoord[NUM_TEXTURES];
vec4 posView;

void main() {
    posView =  modelViewMatrix * vec4(position,1.);
    for(int i=0; i<NUM_TEXTURES; ++i) texcoord[i] = mvpp[i] * posView;
    gl_Position = projectionMatrix * posView;

    #include <logdepthbuf_vertex>
}
