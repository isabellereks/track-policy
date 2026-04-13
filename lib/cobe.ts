/* eslint-disable @typescript-eslint/no-explicit-any */
// Vendored from https://github.com/shuding/cobe (MIT License)
// Modified to support colored map textures via mapColor option

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Marker {
  location: [number, number];
  size: number;
  color?: [number, number, number];
  id?: string;
}

export interface Arc {
  from: [number, number];
  to: [number, number];
  color?: [number, number, number];
  id?: string;
}

export interface COBEOptions {
  width: number;
  height: number;
  phi: number;
  theta: number;
  mapSamples: number;
  mapBrightness: number;
  mapBaseBrightness?: number;
  baseColor: [number, number, number];
  markerColor: [number, number, number];
  glowColor: [number, number, number];
  markers?: Marker[];
  diffuse: number;
  devicePixelRatio: number;
  dark: number;
  opacity?: number;
  offset?: [number, number];
  scale?: number;
  context?: WebGLContextAttributes;
  arcs?: Arc[];
  arcColor?: [number, number, number];
  arcWidth?: number;
  arcHeight?: number;
  markerElevation?: number;
  mapTexture?: string;
  mapColor?: boolean;
}

export interface Globe {
  update: (state: Partial<COBEOptions>) => void;
  destroy: () => void;
}

// ─── WebGL helpers ───────────────────────────────────────────────────────────

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

function getUniformLocations(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  names: string[],
): Record<string, WebGLUniformLocation | null> {
  const locations: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) locations[name] = gl.getUniformLocation(program, name);
  return locations;
}

function getAttribLocations(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  names: string[],
): Record<string, number> {
  const locations: Record<string, number> = {};
  for (const name of names) locations[name] = gl.getAttribLocation(program, name);
  return locations;
}

// ─── Anchor manager ──────────────────────────────────────────────────────────

function createAnchorManager(wrapper: HTMLElement) {
  const markerAnchors: Record<string, HTMLDivElement> = {};
  const arcAnchors: Record<string, HTMLDivElement> = {};
  const visibilityVars: Record<string, string> = {};
  const styleEl = document.createElement("style");
  document.head.append(styleEl);

  function updateAnchor(
    anchors: Record<string, HTMLDivElement>,
    key: string,
    anchorName: string,
    position: { x: number; y: number },
  ) {
    let anchor = anchors[key];
    if (!anchor) {
      anchor = document.createElement("div");
      anchor.style.cssText =
        "position:absolute;width:1px;height:1px;pointer-events:none;anchor-name:" +
        anchorName;
      wrapper.append(anchor);
      anchors[key] = anchor;
    }
    anchor.style.left = position.x * 100 + "%";
    anchor.style.top = position.y * 100 + "%";
  }

  return {
    m(markers: Marker[], project: (loc: [number, number]) => { x: number; y: number; visible: boolean }) {
      const activeKeys: Record<string, number> = {};
      for (const marker of markers) {
        const key = marker.id;
        if (!key) continue;
        const pos = project(marker.location);
        activeKeys[key] = 1;
        updateAnchor(markerAnchors, key, `--cobe-${key}`, pos);
        if (pos.visible) visibilityVars["--cobe-visible-" + key] = "N";
        else delete visibilityVars["--cobe-visible-" + key];
      }
      for (const key in markerAnchors) {
        if (!activeKeys[key]) {
          markerAnchors[key].remove();
          delete markerAnchors[key];
          delete visibilityVars["--cobe-visible-" + key];
        }
      }
    },
    a(arcs: Arc[], project: (arc: Arc) => { x: number; y: number; visible: boolean } | null) {
      const activeKeys: Record<string, number> = {};
      for (const arc of arcs) {
        const key = arc.id;
        if (!key) continue;
        const pos = project(arc);
        if (!pos) continue;
        activeKeys[key] = 1;
        updateAnchor(arcAnchors, key, `--cobe-arc-${key}`, pos);
        if (pos.visible) visibilityVars["--cobe-visible-arc-" + key] = "N";
        else delete visibilityVars["--cobe-visible-arc-" + key];
      }
      for (const key in arcAnchors) {
        if (!activeKeys[key]) {
          arcAnchors[key].remove();
          delete arcAnchors[key];
          delete visibilityVars["--cobe-visible-arc-" + key];
        }
      }
    },
    r() {
      for (const key in markerAnchors) markerAnchors[key].remove();
      for (const key in arcAnchors) arcAnchors[key].remove();
      styleEl.remove();
    },
    s() {
      let vars = "";
      for (const key in visibilityVars) vars += key + ":" + visibilityVars[key] + ";";
      styleEl.textContent = ":root{" + vars + "}";
    },
  };
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const GLOBE_VERT = `attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const GLOBE_FRAG = `precision highp float;
uniform vec2 uResolution;
uniform vec2 offset;
uniform vec2 rotation;
uniform float dots;
uniform float scale;
uniform vec3 baseColor;
uniform vec3 glowColor;
uniform vec4 renderParams;
uniform float mapBaseBrightness;
uniform sampler2D uTexture;
uniform float useMapColor;

const float sqrt5 = 2.236068;
const float PI = 3.141593;
const float kTau = 6.283185;
const float kPhi = 1.618034;
const float r = 0.8;

float byDots;

mat3 rotate(float theta, float phi) {
  float cx = cos(theta);
  float cy = cos(phi);
  float sx = sin(theta);
  float sy = sin(phi);
  return mat3(cy, sy*sx, -sy*cx, 0.0, cx, sx, sy, cy*-sx, cy*cx);
}

vec3 nearestFibonacciLattice(vec3 p, out float m) {
  p = p.xzy;
  float k = max(2.0, floor(log2(sqrt5 * dots * PI * (1.0 - p.z * p.z)) * 0.72021));
  vec2 f = floor(pow(kPhi, k) / sqrt5 * vec2(1.0, kPhi) + 0.5);
  vec2 br1 = fract((f + 1.0) * (kPhi - 1.0)) * kTau - 3.883222;
  vec2 br2 = -2.0 * f;
  vec2 sp = vec2(atan(p.y, p.x), p.z - 1.0);
  vec2 c = floor(vec2(br2.y * sp.x - br1.y * (sp.y * dots + 1.0),
                       -br2.x * sp.x + br1.x * (sp.y * dots + 1.0))
                  / (br1.x * br2.y - br2.x * br1.y));
  float mindist = PI;
  vec3 minip;
  for (float s = 0.0; s < 4.0; s += 1.0) {
    vec2 o = vec2(mod(s, 2.0), floor(s * 0.5));
    float idx = dot(f, c + o);
    if (idx > dots) continue;
    float a = idx, b = 0.0;
    if (a >= 16384.0) { a -= 16384.0; b += 0.868872; }
    if (a >= 8192.0) { a -= 8192.0; b += 0.934436; }
    if (a >= 4096.0) { a -= 4096.0; b += 0.467218; }
    if (a >= 2048.0) { a -= 2048.0; b += 0.733609; }
    if (a >= 1024.0) { a -= 1024.0; b += 0.866804; }
    if (a >= 512.0) { a -= 512.0; b += 0.433402; }
    if (a >= 256.0) { a -= 256.0; b += 0.216701; }
    if (a >= 128.0) { a -= 128.0; b += 0.108351; }
    if (a >= 64.0) { a -= 64.0; b += 0.554175; }
    if (a >= 32.0) { a -= 32.0; b += 0.777088; }
    if (a >= 16.0) { a -= 16.0; b += 0.888544; }
    if (a >= 8.0) { a -= 8.0; b += 0.944272; }
    if (a >= 4.0) { a -= 4.0; b += 0.472136; }
    if (a >= 2.0) { a -= 2.0; b += 0.236068; }
    if (a >= 1.0) { a -= 1.0; b += 0.618034; }
    float theta = fract(b) * kTau;
    float cosphi = 1.0 - 2.0 * idx * byDots;
    float sinphi = sqrt(1.0 - cosphi * cosphi);
    vec3 samp = vec3(cos(theta) * sinphi, sin(theta) * sinphi, cosphi);
    float dist = length(p - samp);
    if (dist < mindist) { mindist = dist; minip = samp; }
  }
  m = mindist;
  return minip.xzy;
}

void main() {
  byDots = 1.0 / dots;
  vec2 invRes = 1.0 / uResolution;
  vec2 uv = ((gl_FragCoord.xy * invRes) * 2.0 - 1.0) / scale - offset * vec2(1.0, -1.0) * invRes;
  uv.x *= uResolution.x * invRes.y;
  float l = dot(uv, uv);
  float glowFactor = 0.0;
  vec4 color = vec4(0.0);
  if (l <= r*r) {
    vec4 layer = vec4(0.0);
    vec3 p = normalize(vec3(uv, sqrt(r*r - l)));
    mat3 rot = rotate(rotation.y, rotation.x);
    float dotNL = p.z;

    if (useMapColor > 0.5) {
      vec3 sp = p * rot;
      float sPhi = asin(sp.y);
      float cossPhi = cos(sPhi);
      float sTheta = cossPhi > 0.001 ? acos(clamp(-sp.x / cossPhi, -1.0, 1.0)) : 0.0;
      if (sp.z < 0.0) sTheta = -sTheta;
      vec2 texUV = vec2(sTheta * 0.5 / PI, -(sPhi / PI + 0.5));
      vec3 texCol = texture2D(uTexture, texUV).rgb;
      float lighting = 0.4 + 0.6 * pow(dotNL, 0.7);
      vec3 fresnel = pow(1.0 - dotNL, 3.5) * vec3(0.06, 0.08, 0.14);
      layer += vec4(
        texCol * lighting + fresnel + pow(1.0 - dotNL, 5.0) * glowColor,
        1.0);
    } else {
      float dis;
      vec3 gP = nearestFibonacciLattice(p * rot, dis);
      float gPhi = asin(gP.y);
      float gTheta = acos(-gP.x / cos(gPhi));
      if (gP.z < 0.0) gTheta = -gTheta;
      vec2 texUV = vec2(gTheta * 0.5 / PI, -(gPhi / PI + 0.5));
      float mapVal = max(texture2D(uTexture, texUV).x, mapBaseBrightness);
      float sample = mapVal * smoothstep(0.008, 0.0, dis) * pow(dotNL, renderParams.y) * renderParams.x;
      layer += vec4(baseColor
        * (mix((1.0 - sample) * pow(dotNL, 0.4), sample, renderParams.z) + 0.1)
        + pow(1.0 - dotNL, 4.0) * glowColor,
        1.0);
    }
    color += layer * (1.0 + renderParams.w) * 0.5;
    glowFactor = (1.0 - l) * (1.0 - l) * smoothstep(0.0, 1.0, 0.2 / (l - r*r));
  } else {
    float outD = sqrt(0.2 / (l - r*r));
    glowFactor = smoothstep(0.5, 1.0, outD / (outD + 1.0));
  }
  gl_FragColor = color + vec4(glowFactor * glowColor, glowFactor);
}`;

const MARKER_VERT = `attribute vec2 aPosition;
attribute vec3 aMarkerPos;
attribute float aMarkerSize;
attribute vec3 aMarkerColor;
attribute float aHasColor;
uniform float phi;
uniform float theta;
uniform vec2 uResolution;
uniform float scale;
uniform vec2 offset;
uniform float markerElevation;
varying vec2 vUV;
varying vec3 vMarkerColor;
varying float vHasColor;
void main() {
  float cx = cos(theta), sx = sin(theta);
  float cy = cos(phi), sy = sin(phi);
  vec3 p = aMarkerPos * (0.8 + markerElevation);
  vec3 rp = vec3(cy*p.x+sy*p.z, sy*sx*p.x+cx*p.y-cy*sx*p.z, -sy*cx*p.x+sx*p.y+cy*cx*p.z);
  if (rp.z < 0.0 && length(rp.xy) < 0.8) { gl_Position = vec4(2.0,2.0,0.0,1.0); return; }
  float ia = uResolution.y / uResolution.x;
  vec2 pos = (rp.xy + aPosition * aMarkerSize * 2.0) * vec2(ia, 1.0) * scale + offset * vec2(1.0,-1.0) * scale / uResolution;
  gl_Position = vec4(pos, 0.0, 1.0);
  vUV = aPosition;
  vMarkerColor = aMarkerColor;
  vHasColor = aHasColor;
}`;

const MARKER_FRAG = `precision highp float;
varying vec2 vUV;
varying vec3 vMarkerColor;
varying float vHasColor;
uniform vec3 markerColor;
void main() {
  if (length(vUV) > 0.25) discard;
  vec3 col = vHasColor > 0.5 ? vMarkerColor : markerColor;
  gl_FragColor = vec4(col, 1.0);
}`;

const ARC_VERT = `const float GLOBE_R = 0.8;
attribute vec2 aPosition;
attribute vec3 aArcFrom;
attribute vec3 aArcTo;
attribute float aArcHeight;
attribute float aArcWidth;
attribute vec3 aArcColor;
attribute float aHasColor;
uniform float phi;
uniform float theta;
uniform vec2 uResolution;
uniform float scale;
uniform vec2 offset;
uniform float markerElevation;
varying vec3 vArcColor;
varying float vHasColor;
varying float vDepth;
varying float vRadialDist;
mat3 rotate(float t, float p) {
  float cx=cos(t),cy=cos(p),sx=sin(t),sy=sin(p);
  return mat3(cy,sy*sx,-sy*cx,0.0,cx,sx,sy,cy*-sx,cy*cx);
}
vec3 bezierPoint(vec3 p0, vec3 p1, vec3 p2, float t) { float u=1.0-t; return u*u*p0+2.0*u*t*p1+t*t*p2; }
vec3 bezierTangent(vec3 p0, vec3 p1, vec3 p2, float t) { float u=1.0-t; return 2.0*u*(p1-p0)+2.0*t*(p2-p1); }
void main() {
  mat3 rot = rotate(theta, phi);
  float endpointR = GLOBE_R + markerElevation;
  vec3 from = aArcFrom * endpointR;
  vec3 to = aArcTo * endpointR;
  vec3 midSum = aArcFrom + aArcTo;
  float midLen = length(midSum);
  vec3 midDir = midLen > 0.001 ? midSum / midLen : vec3(0.0,1.0,0.0);
  vec3 mid = midDir * (GLOBE_R + aArcHeight);
  float t = aPosition.x;
  vec3 arcPoint = bezierPoint(from, mid, to, t);
  vec3 rotatedPoint = rot * arcPoint;
  vec3 rawTangent = bezierTangent(from, mid, to, t);
  vec3 rotatedTangent = rot * rawTangent;
  vec2 screenTangent = rotatedTangent.xy;
  float screenTangentLen = length(screenTangent);
  vec2 screenPerp = screenTangentLen > 0.001 ? vec2(-screenTangent.y, screenTangent.x) / screenTangentLen : vec2(1.0,0.0);
  float aspect = uResolution.x / uResolution.y;
  vec2 baseScreenPos = rotatedPoint.xy * vec2(1.0/aspect,1.0) * scale + offset * vec2(1.0,-1.0) * scale / uResolution;
  vec2 screenPos = baseScreenPos + screenPerp * aArcWidth * aPosition.y * scale;
  gl_Position = vec4(screenPos, 0.0, 1.0);
  vArcColor = aArcColor;
  vHasColor = aHasColor;
  vDepth = rotatedPoint.z;
  vRadialDist = length(rotatedPoint.xy);
}`;

const ARC_FRAG = `precision highp float;
const float GLOBE_R = 0.8;
varying vec3 vArcColor;
varying float vHasColor;
varying float vDepth;
varying float vRadialDist;
uniform vec3 arcColor;
void main() {
  if (vDepth < 0.0 && vRadialDist < GLOBE_R) discard;
  vec3 col = vHasColor > 0.5 ? vArcColor : arcColor;
  gl_FragColor = vec4(col, 1.0);
}`;

// ─── Default texture (base64 equirectangular map) ────────────────────────────

const DEFAULT_TEXTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAACAAQAAAADMzoqnAAAECklEQVR42u3VsW4jRRzH8d94gzfF4Q0VQaC4vBLTRTp0mze4ggfAPAE5XQEFsGNAVIjwBrmW7h7gJE+giKjyABTZE4g06LKJETdRJvtD65kdz6yduKABiW+TVfzRf2bXYxtcE/59YJCz6YdbgQF6ACSRrwYKYImmh5PbwOewlV3wlQNbAN6SEExjUOO+BU0aCSnxReHABUlK4YFQeJeUT3da8IIkZ6NGoSnFY5KsMoVzMKfECUnqxgPYRArarmUCndHwzIEaQEpg5xVdBXROl8mpAQx5dUgPiHoYAAkg5w3JABR06byGAVgcRGAz5bznj6phBQNRFwyqgdxebH6gshJAesWoFhgYpApAFoG8BIZ/fEhSox5jDjQXmV0Ar5XJfAIrALi3URVs09gHIL4XJCkLC5LH9JWiArABFCSrQjdgkBzRJ0WJeUOSNyQAfJJwUSWUBRlJQ8oGHATACGlBynnzy2kEYLNjrxouigD8BZcgOeVPqh12RtufaCN5wCPVDpvQ9lsIrqndsJtDcWqBCpf4hWN7OdWHBw58FwIaNOU/n1TpMW2DFaD48cmr4185T8NHkpUFX749pQPVdgRKC/DGoQPVeAEKv+WHvY8OOWNTPRp5kHuwSf8wzXtVBKR7YwEH9H3lQUaypUfSATOALyVNu5vZJW31Bnx98nkLfDUWJaz6ixvm+RIQRdl3kmRxxiaDoGnZW4CpPfkaQadlcPim1xOSvETQo7Lv75enVAXJ3xGUlony4KQBBWUM1NiDc6qhyS8RgQs18OCMMtPDaAUIyg0PZkRWDqs+wnKJBTDI1Js6BolegOsKmUxNDBAAKqQyMQmidhegBlLZ+wwKYdv5M/8x1khkb1cgKqP2H+MKyV5vS+whrE8DQDgAlUAoRBX056EElJCjJVACeJBZgNfVp+iCCm4RBWCgKsRxASSA9KgDhDtCiTuMyfHsKXzhC6wNAIjjWb8LKAOA2ctk3FmCOlgKFy8f1N0JJtgsxinYnVAHt4t3gPzZXSCTyCWCQmBT91QE3B5yarSN40dNHYPka4TlDhTUI8zLvl0JSL3vZn6DsCFZOeB2yROEpR68sECQQA++xIGCR2X7DwlEoLRgUrZrqlUg50S1uy43YqDcN6UFBVkhAjWiCV2Q0jgQPdplMKxvBXodcOfAwJYvgdL+1etA1YJJfBcZlQV7sO1i2gHoNiyxtQ5sBsCgWyoxCHiFFd2L5nUTCqMAqGUgsQ9f5kCcCiZgRYkMgMTd5WsB1rTzj0Em14BE4r+QxN1lCEsVur2PoF5Wbg8RJXR4djgvBgauhLywoEZQrt1KKRdVS4CdlJ8qafyP+9KIj/nE/d7kKwH9jgS72e9DV+kvfTWgct4ZyP8Byb8BPG7MaaIIkAQAAAAASUVORK5CYII=";

// ─── Main ────────────────────────────────────────────────────────────────────

const { PI, sin, cos } = Math;
const GLOBE_R = 0.8;

function latLonTo3D([lat, lon]: [number, number]): [number, number, number] {
  const latRad = (lat * PI) / 180;
  const lonRad = (lon * PI) / 180 - PI;
  const cosLat = cos(latRad);
  return [-cosLat * cos(lonRad), sin(latRad), cosLat * sin(lonRad)];
}

export default function createGlobe(
  canvas: HTMLCanvasElement,
  opts: COBEOptions,
): Globe {
  const contextOpts: WebGLContextAttributes = {
    alpha: true,
    stencil: false,
    antialias: true,
    depth: false,
    preserveDrawingBuffer: false,
    ...opts.context,
  };

  let gl = canvas.getContext("webgl2", contextOpts) as WebGLRenderingContext | null;
  const webgl2 = !!gl;
  if (!gl) gl = canvas.getContext("webgl", contextOpts) as WebGLRenderingContext | null;
  if (!gl) return { destroy: () => {}, update: () => {} };

  const instExt = webgl2 ? null : (gl as any).getExtension("ANGLE_instanced_arrays");
  const dpr = opts.devicePixelRatio || 1;
  canvas.width = opts.width * dpr;
  canvas.height = opts.height * dpr;

  let phi = opts.phi || 0;
  let theta = opts.theta || 0;
  let markers = opts.markers || [];
  let arcs = opts.arcs || [];
  let mapSamples = opts.mapSamples || 10000;
  let mapBrightness = opts.mapBrightness || 1;
  let mapBaseBrightness = opts.mapBaseBrightness || 0;
  let baseColor = opts.baseColor || [1, 1, 1];
  let markerColor = opts.markerColor || [1, 0.5, 0];
  let glowColor = opts.glowColor || [1, 1, 1];
  let arcColor = opts.arcColor || [0.3, 0.6, 1];
  let arcWidth = opts.arcWidth ?? 1;
  let arcHeight = opts.arcHeight ?? 0.2;
  let diffuse = opts.diffuse || 1;
  let dark = opts.dark || 0;
  let opacity = opts.opacity ?? 1;
  let offsetOpt = opts.offset || [0, 0];
  let scaleOpt = opts.scale || 1;
  let markerElevation = opts.markerElevation ?? 0.05;
  let useMapColor = opts.mapColor ? 1.0 : 0.0;

  const globeProgram = createProgram(gl, GLOBE_VERT, GLOBE_FRAG);
  const markerProgram = createProgram(gl, MARKER_VERT, MARKER_FRAG);
  const arcProgram = createProgram(gl, ARC_VERT, ARC_FRAG);
  if (!globeProgram) return { destroy: () => {}, update: () => {} };

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  const arcSegmentBuffer = gl.createBuffer();
  const arcSegmentCount = 66;
  gl.bindBuffer(gl.ARRAY_BUFFER, arcSegmentBuffer);
  const verts: number[] = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    verts.push(t, -1, t, 1);
  }
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  const markerInstanceBuffer = gl.createBuffer();
  const arcInstanceBuffer = gl.createBuffer();

  const gU = getUniformLocations(gl, globeProgram, [
    "uResolution", "rotation", "dots", "scale", "offset",
    "baseColor", "glowColor", "renderParams", "mapBaseBrightness", "uTexture", "useMapColor",
  ]);
  const mU = markerProgram ? getUniformLocations(gl, markerProgram, [
    "phi", "theta", "uResolution", "scale", "offset", "markerColor", "markerElevation",
  ]) : {};
  const mA = markerProgram ? getAttribLocations(gl, markerProgram, [
    "aPosition", "aMarkerPos", "aMarkerSize", "aMarkerColor", "aHasColor",
  ]) : {};
  const aU = arcProgram ? getUniformLocations(gl, arcProgram, [
    "phi", "theta", "uResolution", "scale", "offset", "arcColor", "markerElevation",
  ]) : {};
  const aA = arcProgram ? getAttribLocations(gl, arcProgram, [
    "aPosition", "aArcFrom", "aArcTo", "aArcHeight", "aArcWidth", "aArcColor", "aHasColor",
  ]) : {};
  const globePosAttrib = gl.getAttribLocation(globeProgram, "aPosition");

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const isColorMap = !!opts.mapColor;
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    if (!gl) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    const filter = isColorMap ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, isColorMap ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };
  image.src = opts.mapTexture || DEFAULT_TEXTURE;

  let validArcCount = 0;

  function updateMarkers(newMarkers: Marker[]) {
    markers = newMarkers;
    const data = new Float32Array(markers.length * 8);
    markers.forEach((m, i) => {
      data.set([...latLonTo3D(m.location), m.size, ...(m.color || [0, 0, 0]), m.color ? 1 : 0], i * 8);
    });
    gl!.bindBuffer(gl!.ARRAY_BUFFER, markerInstanceBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.DYNAMIC_DRAW);
  }

  function updateArcs(newArcs: Arc[]) {
    arcs = newArcs;
    validArcCount = arcs.length;
    const data = new Float32Array(arcs.length * 12);
    arcs.forEach((arc, i) => {
      data.set([
        ...latLonTo3D(arc.from), ...latLonTo3D(arc.to),
        arcHeight + markerElevation, arcWidth * 0.005,
        ...(arc.color || [0, 0, 0]), arc.color ? 1 : 0,
      ], i * 12);
    });
    gl!.bindBuffer(gl!.ARRAY_BUFFER, arcInstanceBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.DYNAMIC_DRAW);
  }

  function applyRotation(p: number[]): [number, number, boolean] {
    const cx = cos(theta), cy = cos(phi), sx = sin(theta), sy = sin(phi);
    const rx = cy * p[0] + sy * p[2];
    const ry = sy * sx * p[0] + cx * p[1] - cy * sx * p[2];
    const rz = -sy * cx * p[0] + sx * p[1] + cy * cx * p[2];
    return [
      (rx / (canvas.width / canvas.height) * scaleOpt + offsetOpt[0] * scaleOpt * dpr / canvas.width + 1) / 2,
      (-ry * scaleOpt + offsetOpt[1] * scaleOpt * dpr / canvas.height + 1) / 2,
      rz >= 0 || rx * rx + ry * ry >= 0.64,
    ];
  }

  function project(location: [number, number]) {
    const pos3D = latLonTo3D(location);
    const r = GLOBE_R + markerElevation;
    const rot = applyRotation([pos3D[0] * r, pos3D[1] * r, pos3D[2] * r]);
    return { x: rot[0], y: rot[1], visible: rot[2] };
  }

  function projectArcMidpoint(arc: Arc) {
    const f = latLonTo3D(arc.from), t = latLonTo3D(arc.to);
    const mid = [f[0] + t[0], f[1] + t[1], f[2] + t[2]];
    const len = (mid[0] ** 2 + mid[1] ** 2 + mid[2] ** 2) ** 0.5;
    if (len < 0.001) return null;
    const s = 0.25 * (GLOBE_R + markerElevation) + 0.5 * (GLOBE_R + arcHeight + markerElevation) / len;
    const rot = applyRotation([mid[0] * s, mid[1] * s, mid[2] * s]);
    return { x: rot[0], y: rot[1], visible: rot[2] };
  }

  function setupInstancedAttribute(attrib: number, size: number, stride: number, offset: number, divisor: number) {
    if (attrib < 0) return;
    gl!.enableVertexAttribArray(attrib);
    gl!.vertexAttribPointer(attrib, size, gl!.FLOAT, false, stride, offset);
    if (webgl2) (gl as any).vertexAttribDivisor(attrib, divisor);
    else if (instExt) instExt.vertexAttribDivisorANGLE(attrib, divisor);
  }

  function drawInstanced(count: number) {
    if (webgl2) (gl as any).drawArraysInstanced(gl!.TRIANGLES, 0, 6, count);
    else if (instExt) instExt.drawArraysInstancedANGLE(gl!.TRIANGLES, 0, 6, count);
    else for (let i = 0; i < count; i++) gl!.drawArrays(gl!.TRIANGLES, 0, 6);
  }

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position:relative;width:100%;height:100%";
  canvas.parentElement?.insertBefore(wrapper, canvas);
  wrapper.append(canvas);
  const anchorManager = createAnchorManager(wrapper);

  function update(state: Partial<COBEOptions>) {
    if (!gl) return;
    if (state.phi !== undefined) phi = state.phi;
    if (state.theta !== undefined) theta = state.theta;
    if (state.markers) updateMarkers(state.markers);
    if (state.arcs) updateArcs(state.arcs);
    if (state.width && state.height) { canvas.width = state.width * dpr; canvas.height = state.height * dpr; }
    if (state.mapSamples !== undefined) mapSamples = state.mapSamples;
    if (state.mapBrightness !== undefined) mapBrightness = state.mapBrightness;
    if (state.mapBaseBrightness !== undefined) mapBaseBrightness = state.mapBaseBrightness;
    if (state.baseColor !== undefined) baseColor = state.baseColor;
    if (state.markerColor !== undefined) markerColor = state.markerColor;
    if (state.glowColor !== undefined) glowColor = state.glowColor;
    if (state.arcColor !== undefined) arcColor = state.arcColor;
    if (state.arcWidth !== undefined) arcWidth = state.arcWidth;
    if (state.arcHeight !== undefined) arcHeight = state.arcHeight;
    if (state.diffuse !== undefined) diffuse = state.diffuse;
    if (state.dark !== undefined) dark = state.dark;
    if (state.opacity !== undefined) opacity = state.opacity;
    if (state.offset !== undefined) offsetOpt = state.offset;
    if (state.scale !== undefined) scaleOpt = state.scale;
    if (state.markerElevation !== undefined) markerElevation = state.markerElevation;
    if (state.mapColor !== undefined) useMapColor = state.mapColor ? 1.0 : 0.0;

    anchorManager.m(markers, project);
    anchorManager.a(arcs, projectArcMidpoint);
    anchorManager.s();

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Globe
    gl.useProgram(globeProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(globePosAttrib);
    gl.vertexAttribPointer(globePosAttrib, 2, gl.FLOAT, false, 0, 0);
    if (webgl2) (gl as any).vertexAttribDivisor(globePosAttrib, 0);
    else if (instExt) instExt.vertexAttribDivisorANGLE(globePosAttrib, 0);
    gl.uniform2f(gU["uResolution"]!, canvas.width, canvas.height);
    gl.uniform2f(gU["rotation"]!, phi, theta);
    gl.uniform1f(gU["dots"]!, mapSamples);
    gl.uniform1f(gU["scale"]!, scaleOpt);
    gl.uniform2f(gU["offset"]!, offsetOpt[0] * dpr, offsetOpt[1] * dpr);
    gl.uniform3fv(gU["baseColor"]!, baseColor);
    gl.uniform3fv(gU["glowColor"]!, glowColor);
    gl.uniform4f(gU["renderParams"]!, mapBrightness, diffuse, dark, opacity);
    gl.uniform1f(gU["mapBaseBrightness"]!, mapBaseBrightness);
    gl.uniform1i(gU["uTexture"]!, 0);
    gl.uniform1f(gU["useMapColor"]!, useMapColor);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Arcs
    if (arcProgram && validArcCount > 0) {
      gl.useProgram(arcProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, arcSegmentBuffer);
      if (aA["aPosition"] >= 0) {
        gl.enableVertexAttribArray(aA["aPosition"]);
        gl.vertexAttribPointer(aA["aPosition"], 2, gl.FLOAT, false, 0, 0);
        if (webgl2) (gl as any).vertexAttribDivisor(aA["aPosition"], 0);
        else if (instExt) instExt.vertexAttribDivisorANGLE(aA["aPosition"], 0);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, arcInstanceBuffer);
      const as = 48;
      setupInstancedAttribute(aA["aArcFrom"], 3, as, 0, 1);
      setupInstancedAttribute(aA["aArcTo"], 3, as, 12, 1);
      setupInstancedAttribute(aA["aArcHeight"], 1, as, 24, 1);
      setupInstancedAttribute(aA["aArcWidth"], 1, as, 28, 1);
      setupInstancedAttribute(aA["aArcColor"], 3, as, 32, 1);
      setupInstancedAttribute(aA["aHasColor"], 1, as, 44, 1);
      gl.uniform1f(aU["phi"]!, phi);
      gl.uniform1f(aU["theta"]!, theta);
      gl.uniform2f(aU["uResolution"]!, canvas.width, canvas.height);
      gl.uniform1f(aU["scale"]!, scaleOpt);
      gl.uniform2f(aU["offset"]!, offsetOpt[0] * dpr, offsetOpt[1] * dpr);
      gl.uniform3fv(aU["arcColor"]!, arcColor);
      gl.uniform1f(aU["markerElevation"]!, markerElevation);
      if (webgl2) (gl as any).drawArraysInstanced(gl.TRIANGLE_STRIP, 0, arcSegmentCount, validArcCount);
      else if (instExt) instExt.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, arcSegmentCount, validArcCount);
    }

    // Markers
    if (markerProgram && markers.length > 0) {
      gl.useProgram(markerProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      if (mA["aPosition"] >= 0) {
        gl.enableVertexAttribArray(mA["aPosition"]);
        gl.vertexAttribPointer(mA["aPosition"], 2, gl.FLOAT, false, 0, 0);
        if (webgl2) (gl as any).vertexAttribDivisor(mA["aPosition"], 0);
        else if (instExt) instExt.vertexAttribDivisorANGLE(mA["aPosition"], 0);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, markerInstanceBuffer);
      const ms = 32;
      setupInstancedAttribute(mA["aMarkerPos"], 3, ms, 0, 1);
      setupInstancedAttribute(mA["aMarkerSize"], 1, ms, 12, 1);
      setupInstancedAttribute(mA["aMarkerColor"], 3, ms, 16, 1);
      setupInstancedAttribute(mA["aHasColor"], 1, ms, 28, 1);
      gl.uniform1f(mU["phi"]!, phi);
      gl.uniform1f(mU["theta"]!, theta);
      gl.uniform2f(mU["uResolution"]!, canvas.width, canvas.height);
      gl.uniform1f(mU["scale"]!, scaleOpt);
      gl.uniform2f(mU["offset"]!, offsetOpt[0] * dpr, offsetOpt[1] * dpr);
      gl.uniform3fv(mU["markerColor"]!, markerColor);
      gl.uniform1f(mU["markerElevation"]!, markerElevation);
      drawInstanced(markers.length);
    }
  }

  update({ markers, arcs });

  return {
    update,
    destroy: () => {
      if (!gl) return;
      gl.deleteBuffer(quadBuffer);
      gl.deleteBuffer(arcSegmentBuffer);
      gl.deleteBuffer(markerInstanceBuffer);
      gl.deleteBuffer(arcInstanceBuffer);
      gl.deleteProgram(globeProgram);
      if (markerProgram) gl.deleteProgram(markerProgram);
      if (arcProgram) gl.deleteProgram(arcProgram);
      anchorManager.r();
    },
  };
}
