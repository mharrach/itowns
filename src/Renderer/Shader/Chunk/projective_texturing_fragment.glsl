// varying vec4 projectiveTextureCoord[N];
// uniform sampler2D projectiveTexture[N];

vec2 p;
vec2 d;

if(projectiveTextureCoord[${i}].z>0.) {
    p =  projectiveTextureCoord[${i}].xy/projectiveTextureCoord[${i}].z;
    d = borderfadeoutinv * getUV(p,size[${i}]);
    if(d>0.) {
        c = d*texture2D(texture[${i}],p);
        color += c;
        if(c.a>0.) ++blend;
    }
}
