/** Replace residual chroma pixels immediately beside a screen matte. */
export function repairGreenFringe(
  output: Uint8ClampedArray,
  projection: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): number {
  let repaired = 0;
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * 4;
      if (mask[i + 3] >= 250 || projection[i + 3] < 250) continue;
      const r = output[i], g = output[i + 1], b = output[i + 2];
      if (g < 30 || g - Math.max(r, b) < 2) continue;
      let close = mask[i + 3] > 0;
      for (let dy = -radius; !close && dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const reach = Math.floor(Math.sqrt(radius * radius - dy * dy));
        for (let dx = -reach; dx <= reach; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && mask[yy * stride + xx * 4 + 3] >= 128) {
            close = true;
            break;
          }
        }
      }
      if (!close) continue;
      output[i] = projection[i];
      output[i + 1] = projection[i + 1];
      output[i + 2] = projection[i + 2];
      output[i + 3] = 255;
      repaired++;
    }
  }
  return repaired;
}
