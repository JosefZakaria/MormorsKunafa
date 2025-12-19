import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Custom Eat-In Icon - Fork and Knife on Plate
 */
export const EatInIcon: React.FC<IconProps> = ({ size = 32, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    {/* Plate */}
    <Circle cx="24" cy="28" r="16" stroke={color} strokeWidth="2.5" fill="none" />
    <Circle cx="24" cy="28" r="10" stroke={color} strokeWidth="1.5" fill="none" opacity={0.5} />
    {/* Fork */}
    <G transform="translate(10, 4)">
      <Path
        d="M4 2 L4 12 M4 12 L4 22 M0 2 L0 8 Q0 10 2 10 L6 10 Q8 10 8 8 L8 2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </G>
    {/* Knife */}
    <G transform="translate(30, 4)">
      <Path
        d="M4 2 L4 22 M4 2 L8 2 Q10 4 10 8 L4 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </G>
  </Svg>
);

/**
 * Custom Takeaway Icon - Paper Bag
 */
export const TakeawayIcon: React.FC<IconProps> = ({ size = 32, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    {/* Bag Body */}
    <Path
      d="M8 16 L8 40 Q8 44 12 44 L36 44 Q40 44 40 40 L40 16"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Bag Top Fold */}
    <Path
      d="M6 16 L42 16"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Handles */}
    <Path
      d="M16 16 L16 8 Q16 4 20 4 L28 4 Q32 4 32 8 L32 16"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Decorative Fold */}
    <Path
      d="M14 22 L34 22"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      opacity={0.6}
    />
  </Svg>
);

/**
 * Custom Delivery Icon - Scooter
 */
export const DeliveryIcon: React.FC<IconProps> = ({ size = 32, color = '#FFFFFF' }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    {/* Wheels */}
    <Circle cx="12" cy="36" r="6" stroke={color} strokeWidth="2.5" fill="none" />
    <Circle cx="36" cy="36" r="6" stroke={color} strokeWidth="2.5" fill="none" />
    {/* Body Frame */}
    <Path
      d="M12 36 L20 36 L24 28 L36 28 L36 36"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Seat */}
    <Path
      d="M20 28 L20 24 L28 24"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Handlebar */}
    <Path
      d="M36 28 L40 20 L44 20 M36 24 L32 18"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Delivery Box */}
    <Rect x="4" y="20" width="14" height="10" rx="2" stroke={color} strokeWidth="2" fill="none" />
    <Path d="M6 24 L16 24" stroke={color} strokeWidth="1.5" opacity={0.6} />
  </Svg>
);

/**
 * Home Tab Icon
 */
export const HomeIcon: React.FC<IconProps> = ({ size = 24, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 10.5L12 3L21 10.5V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V10.5Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9 22V12H15V22"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/**
 * Menu Tab Icon
 */
export const MenuIcon: React.FC<IconProps> = ({ size = 24, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 6H20M4 12H20M4 18H20"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

