export const COLOR_VISION_MODES = ['protanopia', 'deuteranopia'] as const;
export type ColorVisionMode = (typeof COLOR_VISION_MODES)[number];

type Rgb = readonly [red: number, green: number, blue: number];

const COLOR_VISION_MATRICES: Readonly<Record<ColorVisionMode, readonly Rgb[]>> = {
  protanopia: [
    [0.56667, 0.43333, 0],
    [0.55833, 0.44167, 0],
    [0, 0.24167, 0.75833],
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
};

function parseHexColor(color: string): Rgb {
  if (!/^#[\da-f]{6}$/i.test(color)) {
    throw new Error(`Expected a six-digit hex colour, received "${color}"`);
  }

  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

function multiplyColor(matrix: readonly Rgb[], color: Rgb): Rgb {
  return matrix.map(
    (row) => row[0] * color[0] + row[1] * color[1] + row[2] * color[2],
  ) as unknown as Rgb;
}

function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance after an optional colour-vision-deficiency simulation. */
export function colorLuminance(color: string, mode?: ColorVisionMode): number {
  const rgb = parseHexColor(color);
  const perceived = mode ? multiplyColor(COLOR_VISION_MATRICES[mode], rgb) : rgb;
  const [red, green, blue] = perceived.map(linearize) as unknown as Rgb;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

/** WCAG-style contrast after an optional colour-vision-deficiency simulation. */
export function colorContrastRatio(
  foreground: string,
  background: string,
  mode?: ColorVisionMode,
): number {
  const foregroundLuminance = colorLuminance(foreground, mode);
  const backgroundLuminance = colorLuminance(background, mode);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}
