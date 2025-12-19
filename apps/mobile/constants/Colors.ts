/**
 * Mormor's Kunafa - Premium Color Palette
 * Inspired by warm Middle Eastern aesthetics with modern touches
 */

// Brand Colors - Warm honey gold meets deep forest green
export const BrandColors = {
  // Primary - Rich Honey Gold
  primary: '#D4A84B',
  primaryLight: '#E8C878',
  primaryDark: '#B8923F',
  
  // Secondary - Deep Forest Green
  secondary: '#1A3D32',
  secondaryLight: '#2A5A4A',
  secondaryDark: '#0D2820',
  
  // Accent - Warm Terracotta
  accent: '#C17E61',
  accentLight: '#D9A089',
  accentDark: '#A66B4F',
  
  // Neutrals
  cream: '#FBF7F0',
  warmWhite: '#FFFEF9',
  charcoal: '#2C2C2C',
  softBlack: '#1A1A1A',
  
  // UI Colors
  success: '#4CAF50',
  error: '#E74C3C',
  warning: '#F39C12',
};

const tintColorLight = BrandColors.primary;
const tintColorDark = BrandColors.primaryLight;

export default {
  light: {
    text: BrandColors.charcoal,
    background: BrandColors.cream,
    tint: tintColorLight,
    tabIconDefault: '#B5A89A',
    tabIconSelected: BrandColors.secondary,
    card: BrandColors.warmWhite,
    border: '#E8E0D5',
  },
  dark: {
    text: BrandColors.cream,
    background: BrandColors.softBlack,
    tint: tintColorDark,
    tabIconDefault: '#6B6B6B',
    tabIconSelected: BrandColors.primary,
    card: BrandColors.charcoal,
    border: '#3D3D3D',
  },
};
