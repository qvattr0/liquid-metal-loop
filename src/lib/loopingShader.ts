import { liquidMetalFragmentShader } from '@paper-design/shaders';

/**
 * Paper's Liquid Metal shader is not loop-safe, and several look controls are baked in.
 * This patch:
 * - wraps time so loops close
 * - adds grain / pattern-warp uniforms
 * - lets pattern scale go below 1
 * - makes chromatic split actually vanish at refraction 0
 */
export const loopingLiquidMetalShader = liquidMetalFragmentShader
  .replace(
    'uniform bool u_isImage;',
    `uniform bool u_isImage;
uniform float u_seamlessLoop;
uniform float u_grain;
uniform float u_grainLogoOnly;
uniform float u_glow;
uniform float u_flow;
uniform vec3 u_colorMetal;
uniform vec3 u_rippleColors[8];
uniform float u_rippleCount;`,
  )
  .replace(
    `const float firstFrameOffset = 2.8;
  float t = .3 * (u_time + firstFrameOffset);`,
    `const float firstFrameOffset = 2.8;
  float tLinear = .3 * (u_time + firstFrameOffset);
  float t = u_seamlessLoop > 0.5 ? fract(.3 * u_time) : tLinear;`,
  )
  .replace(
    'void main() {',
    `vec3 sampleRipples(float t, float blur) {
  float n = max(u_rippleCount, 1.0);
  if (n < 1.5) return u_rippleColors[0];
  float sigma = mix(0.07, 0.95, clamp(blur, 0.0, 1.0));
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= n) break;
    float pos = float(i) / max(n - 1.0, 1.0);
    float d = abs(clamp(t, 0.0, 1.0) - pos);
    float w = exp(-(d * d) / (2.0 * sigma * sigma));
    acc += u_rippleColors[i] * w;
    wsum += w;
  }
  return acc / max(wsum, 0.0001);
}

void main() {`,
  )
  .replace(
    'float cycleWidth = u_repetition;',
    'float cycleWidth = max(u_repetition, 0.22);',
  )
  .replace(
    'float noise = snoise(uv - t);',
    `float noise;
  if (u_seamlessLoop > 0.5) {
    float ang = t * 6.28318530718;
    noise = snoise(uv + vec2(cos(ang), sin(ang)) * 0.45);
  } else {
    noise = snoise(uv - t);
  }`,
  )
  .replace(
    `  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
  return ch;`,
    `  ch = mix(ch, 1. - min(1., (1. - ch) / max(tint, 0.0001)), u_colorTint.a);
  float chSoft = mix(c1, c2, smoothstep(0.0, 1.0, stripe_p));
  ch = mix(ch, chSoft, u_softness * u_softness);
  return ch;`,
  )
  .replace(
    'direction -= 2. * noise * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));',
    'direction -= 2. * noise * u_flow * diagBLtoTR * (smoothstep(0., 1., edge) * (1.0 - smoothstep(0., 1., edge)));',
  )
  .replace(
    `  vec3 color1 = vec3(.98, 0.98, 1.);
  vec3 color2 = vec3(.1, .1, .1 + .1 * smoothstep(.7, 1.3, diagTLtoBR));`,
    `  vec3 color1 = u_colorMetal;
  vec3 color2 = u_rippleColors[0];`,
  )
  .replace(
    'direction *= cycleWidth;\n  direction -= t;',
    `direction *= cycleWidth;
  direction -= t;
  float rippleT = 0.5 - 0.5 * cos(6.28318530718 * (
    fract(direction) + mix(0.35, 0.08, u_softness) * (uv.x + uv.y)
  ));
  rippleT = mix(rippleT, 0.5, u_softness * 0.72);
  color2 = sampleRipples(rippleT, u_softness);`,
  )
  .replace(
    'dispersionRed *= (u_shiftRed / 20.);\n  dispersionBlue *= (u_shiftBlue / 20.);',
    'dispersionRed *= (u_shiftRed / 40.);\n  dispersionBlue *= (u_shiftBlue / 40.);',
  )
  .replace(
    'float softness = 0.05 * u_softness;\n    blur = softness + .5 * smoothstep(1., 10., u_repetition) * smoothstep(.0, 1., edge);',
    `float softness = mix(0.02, 0.5, u_softness);
    blur = softness + .12 * smoothstep(0.15, 8., u_repetition) * smoothstep(.0, 1., edge);`,
  )
  .replace(
    'r *= (1. + .05 * sin(3. * a + 2. * t));',
    'r *= (1. + .05 * sin(3. * a + (u_seamlessLoop > 0.5 ? 6.28318530718 * t : 2. * t)));',
  )
  .replace(
    'vec2 traj = .4 * (dir1 * sin(t * speed + fi * 1.23) + dir2 * cos(t * (speed * 0.7) + fi * 2.17));',
    `vec2 traj = u_seamlessLoop > 0.5
      ? .4 * (dir1 * sin(6.28318530718 * t + fi * 1.23) + dir2 * cos(6.28318530718 * t + fi * 2.17))
      : .4 * (dir1 * sin(t * speed + fi * 1.23) + dir2 * cos(t * (speed * 0.7) + fi * 2.17));`,
  )
  .replace(
    `  color = vec3(r, g, b);
  color *= opacity;`,
    `  color = vec3(r, g, b);
  vec3 melted = mix(color1, color2, 0.5 + 0.5 * sin(6.28318530718 * fract(direction)));
  color = mix(color, melted, u_softness * u_softness);
  vec3 metalRgb = color;
  color *= opacity;
  float logoOpacity = opacity;`,
  )
  .replace(
    'fragColor = vec4(color, opacity);',
    `if (u_grain > 0.001) {
    vec2 grainUV = uv * 160.0;
    float g1 = fract(sin(dot(grainUV, vec2(12.9898, 78.233))) * 43758.5453);
    float g2 = fract(sin(dot(grainUV * 2.17 + 9.2, vec2(39.346, 11.135))) * 23421.631);
    float grain = (g1 * 0.65 + g2 * 0.35);
    float mask = u_grainLogoOnly > 0.5 ? smoothstep(0.0, 0.14, logoOpacity) : 1.0;
    color += (grain - 0.5) * u_grain * 0.34 * mask;
  }

  if (u_glow > 0.001) {
    float glowA = 0.0;
    float outside = 1.0 - smoothstep(0.0, 0.16, logoOpacity);
    if (u_isImage) {
      vec2 px = vec2(length(dudx), length(dudy)) + 1.0e-6;
      float sigma = 10.0;
      float acc = 0.0;
      float wsum = 0.0;
      float w0 = 1.0;
      vec2 p0 = v_imageUV;
      float m0 = step(0.0, p0.x) * step(p0.x, 1.0) * step(0.0, p0.y) * step(p0.y, 1.0);
      acc += m0 * w0 * textureGrad(u_image, p0, dudx, dudy).g;
      wsum += w0;
      for (int ring = 1; ring <= 5; ring++) {
        float r = float(ring) * 5.0;
        float w = exp(-0.5 * (r / sigma) * (r / sigma));
        for (int i = 0; i < 8; i++) {
          float a = (float(i) + 0.35 * float(ring)) * 0.7853981634;
          vec2 p = v_imageUV + vec2(cos(a), sin(a)) * px * r;
          float m = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
          acc += m * w * textureGrad(u_image, p, dudx, dudy).g;
          wsum += w;
        }
      }
      glowA = (acc / max(wsum, 0.001)) * outside;
    } else {
      float fw = max(fwidth(logoOpacity), 1.0 / max(min(u_resolution.x, u_resolution.y), 1.0));
      float distPx = max(-(logoOpacity - 0.5) / max(fw, 1.0e-5), 0.0);
      glowA = exp(-0.5 * (distPx / 10.0) * (distPx / 10.0)) * outside;
    }
    glowA *= u_glow;
    color += metalRgb * glowA;
    opacity = max(opacity, glowA);
  }

  fragColor = vec4(color, opacity);`,
  );

if (
  !loopingLiquidMetalShader.includes('glowA *= u_glow') ||
  !loopingLiquidMetalShader.includes('u_grainLogoOnly') ||
  !loopingLiquidMetalShader.includes('u_flow * diagBLtoTR') ||
  !loopingLiquidMetalShader.includes('sampleRipples') ||
  !loopingLiquidMetalShader.includes('mix(0.02, 0.5, u_softness)') ||
  !loopingLiquidMetalShader.includes('vec3 melted')
) {
  throw new Error('Failed to patch Liquid Metal shader for grain/loop controls');
}
