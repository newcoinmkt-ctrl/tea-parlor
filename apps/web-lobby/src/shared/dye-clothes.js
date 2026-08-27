/**
 * 衣服染色：只改衣服/配饰色相，保护肤色、头发、牙齿等。
 * 输出 dataURL（PNG），带内存缓存。
 */

const cache = new Map();

function hexToRgb(hex) {
  const s = String(hex || '#7ec8ff').replace('#', '').trim();
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 126, g: 200, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const hh = h / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(hue2rgb(hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(hh) * 255),
    b: Math.round(hue2rgb(hh - 1 / 3) * 255),
  };
}

/**
 * 肤色保护（东亚/通用）：偏红黄、中等饱和、中高亮度
 * 同时保护唇色（偏红）、牙齿近白
 */
export function isProtectedSkinTone(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  // 近白：牙齿 / 眼白
  if (l > 0.88 && s < 0.22) return true;
  // 黑发 / 深眉：低亮低饱和
  if (l < 0.22 && s < 0.35) return true;
  if (l < 0.18) return true;

  // 经典肤色启发式
  if (
    r > 90 && g > 40 && b > 20
    && r > g && r >= b - 8
    && Math.abs(r - g) > 12
    && (Math.max(r, g, b) - Math.min(r, g, b)) > 12
  ) {
    if (s >= 0.08 && s <= 0.72 && l >= 0.22 && l <= 0.92) return true;
  }

  // HSV 肤色环：橙红～黄
  const skinHue = (h <= 52 || h >= 340);
  if (skinHue && s >= 0.08 && s <= 0.68 && l >= 0.28 && l <= 0.9) {
    // 排除高饱和大红衣（s 很高且偏纯红且不在皮肤亮度带）
    if (s > 0.55 && l < 0.38 && h < 15) return false;
    return true;
  }

  // 唇：偏红、中高饱和、中亮
  if ((h <= 20 || h >= 345) && s >= 0.25 && s <= 0.85 && l >= 0.28 && l <= 0.72) {
    // 若明显是大面积衣服红，会误伤；唇通常 g 相对较高一点
    if (r > 100 && g > 40 && b > 40 && r - b > 20) return true;
  }

  return false;
}

/**
 * 是否更像「可染色的衣服像素」
 */
function isDyeableFabric(r, g, b) {
  if (isProtectedSkinTone(r, g, b)) return false;
  const { s, l } = rgbToHsl(r, g, b);
  // 极透明高光可略过
  if (l > 0.96 && s < 0.08) return false;
  // 几乎全黑且极低饱和：鞋子/包可能仍可微染
  return true;
}

/**
 * 把衣服像素染向目标色，保留明暗纹理
 * @param {ImageData} imageData
 * @param {string} targetHex
 * @param {number} [strength=0.88]
 */
export function dyeClothesImageData(imageData, targetHex, strength = 0.88) {
  const { r: tr, g: tg, b: tb } = hexToRgb(targetHex);
  const target = rgbToHsl(tr, tg, tb);
  const data = imageData.data;
  const str = Math.max(0, Math.min(1, strength));

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 12) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (!isDyeableFabric(r, g, b)) continue;

    const orig = rgbToHsl(r, g, b);
    // 低饱和深色织物：直接按目标色按亮度着色
    let nr;
    let ng;
    let nb;
    if (orig.s < 0.12) {
      // 灰度/近黑衣：用目标色调制，保留亮度层次
      const k = Math.max(0.05, orig.l);
      const tint = hslToRgb(target.h, Math.min(1, target.s * 0.95 + 0.15), Math.min(0.92, k * 0.95 + target.l * 0.08));
      nr = tint.r;
      ng = tint.g;
      nb = tint.b;
    } else {
      // 有色衣服：改色相，饱和向目标靠，亮度保留
      const newS = Math.min(1, orig.s * 0.35 + target.s * 0.65);
      const newL = Math.min(0.95, Math.max(0.05, orig.l * 0.92 + target.l * 0.08));
      const tint = hslToRgb(target.h, newS, newL);
      nr = tint.r;
      ng = tint.g;
      nb = tint.b;
    }

    data[i] = Math.round(r * (1 - str) + nr * str);
    data[i + 1] = Math.round(g * (1 - str) + ng * str);
    data[i + 2] = Math.round(b * (1 - str) + nb * str);
  }
  return imageData;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('empty src'));
      return;
    }
    // 已是 dataURL 且无染色需求时由调用方处理
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`load fail: ${src}`));
    img.src = src;
  });
}

/**
 * @param {string} src 原图 URL
 * @param {string} targetHex 目标衣服色
 * @param {{ maxEdge?: number, strength?: number, cacheKey?: string }} [opts]
 * @returns {Promise<string>} dataURL
 */
export async function dyeClothesSrc(src, targetHex, opts = {}) {
  const maxEdge = opts.maxEdge || 0; // 0 = full res
  const strength = opts.strength ?? 0.88;
  const key = opts.cacheKey || `${src}::${targetHex}::${maxEdge}::${strength}`;
  if (cache.has(key)) return cache.get(key);

  const img = await loadImage(src);
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('bad image size');

  if (maxEdge > 0 && Math.max(w, h) > maxEdge) {
    const scale = maxEdge / Math.max(w, h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  dyeClothesImageData(imageData, targetHex, strength);
  ctx.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');
  cache.set(key, dataUrl);
  // 简单限容
  if (cache.size > 80) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  return dataUrl;
}

export function clearDyeCache() {
  cache.clear();
}

/** 预置染色色值（与 DYE_OPTIONS.color 对齐） */
export const DYE_PRESET_COLORS = {
  cyan: '#3db8a0',
  ice: '#7ec8ff',
  rose: '#ff7eb3',
  jade: '#2ecc71',
  night: '#5b6cff',
  sunset: '#ff9f43',
};
