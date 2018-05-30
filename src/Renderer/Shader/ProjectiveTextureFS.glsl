precision highp float;

#include <logdepthbuf_pars_fragment>

uniform sampler2D texture[NUM_TEXTURES];
varying vec4      texcoord[NUM_TEXTURES];
uniform vec2      size[NUM_TEXTURES];

#if WITH_DISTORT
uniform vec2      pps[NUM_TEXTURES];
uniform vec4      distortion[NUM_TEXTURES];
uniform vec3      l1l2[NUM_TEXTURES];
#endif

const float borderfadeoutinv = 0.02;
float getUV(inout vec2 p, vec2 s)
{
    p.y = 1.-p.y;
    vec2 d = s*min(p,1.-p);
    return min(d.x,d.y);
}

#if WITH_DISTORT
void distort(inout vec2 p, vec4 adist, vec2 apps)
{
    vec2 v = p - apps;
    float v2 = dot(v,v);
    if(v2>adist.w) p = vec2(-1.);
    else p += (v2*(adist.x+v2*(adist.y+v2*adist.z)))*v;
}

void distort(inout vec2 p, vec4 dist, vec3 l1l2, vec2 pps)
{ 
    if ((l1l2.x == 0.)&&(l1l2.y == 0.)) {
        distort(p,dist,pps);
    } else {
        vec2 AB = (p-pps)/l1l2.z;
        float R = length(AB);
        float lambda = atan(R)/R;
        vec2 ab = lambda*AB;
        float rho2 = dot(ab,ab);
        float r357 = 1. + rho2* (dist.x + rho2* (dist.y + rho2*dist.z));
        p = pps + l1l2.z * (r357*ab + vec2(dot(l1l2.xy,ab),l1l2.y*ab.x));
    }
}
#endif

void main(void)
{
    #include <logdepthbuf_fragment>

    vec4 color  = vec4(0.);
    vec2 p;
    float d;

    #pragma unroll_loop
    for ( int i = 0; i < NUM_TEXTURES; i ++ ) {
        if(texcoord[i].w>0.) {
            p = texcoord[i].xy/texcoord[i].w;
#if WITH_DISTORT
            p *= size[i];
            distort(p,distortion[i],l1l2[i],pps[i]);
            p /= size[i];
#endif
            d = borderfadeoutinv * getUV(p,size[i]);
            if(d>0.) {
                color += d*texture2D(texture[i],p);
            }
        }
    }

    if (color.a > 0.0) color /= color.a;
    color.a = 1.;
    gl_FragColor = color;
}
