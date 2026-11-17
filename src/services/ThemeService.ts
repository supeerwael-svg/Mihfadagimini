import { THEME_PALETTES } from '@/src/db/seedDefaults';
import type { CardThemeOverride, ThemeConfigRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 15, g: 118, b: 110 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixHex(hexA: string, hexB: string, weightB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(
    a.r * (1 - weightB) + b.r * weightB,
    a.g * (1 - weightB) + b.g * weightB,
    a.b * (1 - weightB) + b.b * weightB
  );
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickContrastText(bgHex: string): '#ffffff' | '#0f172a' {
  const whiteContrast = contrastRatio(bgHex, '#ffffff');
  const darkContrast = contrastRatio(bgHex, '#0f172a');
  return whiteContrast >= 4.5 || whiteContrast >= darkContrast ? '#ffffff' : '#0f172a';
}

export class ThemeService {
  constructor(private adapter: IDataAdapter) {}

  async getConfig(ownerId: string, ctx: ServiceContext): Promise<ThemeConfigRecord> {
    const all = await this.adapter.getAll('themeConfigs');
    const found = all.find((t) => t.ownerId === ownerId) ?? all[0];
    if (found) return found;

    const now = new Date().toISOString();
    const def: ThemeConfigRecord = {
      id: generateId(),
      paletteId: THEME_PALETTES[0].id,
      primaryColor: THEME_PALETTES[0].primary,
      mode: 'system',
      fontSizePx: 16,
      cardOverrides: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('themeConfigs', def);
    return def;
  }

  async saveConfig(config: ThemeConfigRecord): Promise<ThemeConfigRecord> {
    const updated: ThemeConfigRecord = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put('themeConfigs', updated);
    this.applyThemeToDOM(updated);
    return updated;
  }

  async resetToDefault(config: ThemeConfigRecord): Promise<ThemeConfigRecord> {
    const def: ThemeConfigRecord = {
      ...config,
      paletteId: THEME_PALETTES[0].id,
      primaryColor: THEME_PALETTES[0].primary,
      mode: 'light',
      fontSizePx: 16,
      cardOverrides: {},
      updatedAt: new Date().toISOString(),
    };
    return this.saveConfig(def);
  }

  async updateCardOverride(
    config: ThemeConfigRecord,
    sectionSlug: string,
    override: CardThemeOverride
  ): Promise<ThemeConfigRecord> {
    return this.saveConfig({
      ...config,
      cardOverrides: {
        ...config.cardOverrides,
        [sectionSlug]: {
          ...config.cardOverrides[sectionSlug],
          ...override,
        },
      },
    });
  }

  applyThemeToDOM(config: ThemeConfigRecord): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = config.mode === 'dark' || (config.mode === 'system' && prefersDark);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const palette = THEME_PALETTES.find((p) => p.id === config.paletteId);
    const primary = config.primaryColor || palette?.primary || '#0f766e';
    const primaryDark = mixHex(primary, '#000000', 0.32);
    const primaryLight = isDark ? mixHex(primary, '#0b1118', 0.78) : mixHex(primary, '#ffffff', 0.88);
    const onPrimary = pickContrastText(primary);

    root.style.setProperty('--color-primary', primary);
    root.style.setProperty('--color-primary-dark', primaryDark);
    root.style.setProperty('--color-primary-light', primaryLight);
    root.style.setProperty('--color-on-primary', onPrimary);
    root.style.setProperty('--app-font-size', `${config.fontSizePx || 16}px`);

    if (!isDark && palette) {
      root.style.setProperty('--color-surface', palette.surfaceLight);
      root.style.setProperty('--color-background', palette.bgLight);
    } else if (isDark) {
      root.style.setProperty('--color-surface', '#131c27');
      root.style.setProperty('--color-background', '#0b1118');
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', primary);
    }
  }
}
