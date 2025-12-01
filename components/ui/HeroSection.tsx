import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandColors } from '@/constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HeroSectionProps {
  title?: string;
  subtitle?: string;
}

/**
 * Premium Hero Section with animated gradient background
 * Features fade-in animation and decorative elements
 */
export const HeroSection: React.FC<HeroSectionProps> = ({
  title = "Mormor's",
  subtitle = 'KUNAFA',
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const patternOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Staggered entrance animation
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(patternOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={[BrandColors.primary, BrandColors.primaryDark, BrandColors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      />

      {/* Decorative Pattern Overlay */}
      <Animated.View style={[styles.patternOverlay, { opacity: patternOpacity }]}>
        {/* Geometric patterns */}
        <View style={styles.patternCircle1} />
        <View style={styles.patternCircle2} />
        <View style={styles.patternCircle3} />
        <View style={styles.patternDiamond} />
      </Animated.View>

      {/* Kunafa Illustration Placeholder */}
      <Animated.View
        style={[
          styles.illustrationContainer,
          {
            opacity: fadeAnim,
            transform: [
              { translateY: slideAnim },
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        {/* Abstract Kunafa/Pastry Illustration */}
        <View style={styles.kunafaBase}>
          <View style={styles.kunafaLayer1} />
          <View style={styles.kunafaLayer2} />
          <View style={styles.kunafaLayer3} />
          <View style={styles.kunafaHighlight} />
          {/* Syrup drizzle effect */}
          <View style={styles.syrupDrip1} />
          <View style={styles.syrupDrip2} />
          <View style={styles.syrupDrip3} />
        </View>

        {/* Decorative elements */}
        <View style={styles.steamLine1} />
        <View style={styles.steamLine2} />
        <View style={styles.steamLine3} />
      </Animated.View>

      {/* Brand Text */}
      <Animated.View
        style={[
          styles.brandContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.underline} />
      </Animated.View>

      {/* Bottom gradient fade for transition to action panel */}
      <LinearGradient
        colors={['transparent', 'rgba(26, 61, 50, 0.3)', BrandColors.secondary]}
        style={styles.bottomGradient}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  patternOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
  },
  patternCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: BrandColors.warmWhite,
    top: 40,
    right: -60,
    opacity: 0.3,
  },
  patternCircle2: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: BrandColors.warmWhite,
    bottom: 100,
    left: -100,
    opacity: 0.2,
  },
  patternCircle3: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: BrandColors.warmWhite,
    top: 150,
    left: 30,
    opacity: 0.05,
  },
  patternDiamond: {
    position: 'absolute',
    width: 80,
    height: 80,
    backgroundColor: BrandColors.warmWhite,
    top: 80,
    left: SCREEN_WIDTH / 2 - 40,
    transform: [{ rotate: '45deg' }],
    opacity: 0.08,
  },
  illustrationContainer: {
    position: 'absolute',
    top: '25%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kunafaBase: {
    width: 200,
    height: 120,
    backgroundColor: BrandColors.primaryDark,
    borderRadius: 100,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  kunafaLayer1: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    height: 30,
    backgroundColor: BrandColors.primary,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
  },
  kunafaLayer2: {
    position: 'absolute',
    top: 25,
    left: 20,
    right: 20,
    height: 40,
    backgroundColor: BrandColors.cream,
    opacity: 0.9,
  },
  kunafaLayer3: {
    position: 'absolute',
    top: 50,
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: BrandColors.primaryLight,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
  },
  kunafaHighlight: {
    position: 'absolute',
    top: 15,
    left: 30,
    width: 60,
    height: 15,
    backgroundColor: BrandColors.warmWhite,
    borderRadius: 10,
    opacity: 0.4,
  },
  syrupDrip1: {
    position: 'absolute',
    bottom: -20,
    left: 40,
    width: 8,
    height: 25,
    backgroundColor: BrandColors.primary,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  syrupDrip2: {
    position: 'absolute',
    bottom: -30,
    left: 100,
    width: 6,
    height: 35,
    backgroundColor: BrandColors.primaryLight,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  syrupDrip3: {
    position: 'absolute',
    bottom: -15,
    right: 50,
    width: 7,
    height: 20,
    backgroundColor: BrandColors.primary,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  steamLine1: {
    position: 'absolute',
    top: -40,
    left: 70,
    width: 3,
    height: 30,
    backgroundColor: BrandColors.warmWhite,
    borderRadius: 2,
    opacity: 0.4,
    transform: [{ rotate: '-10deg' }],
  },
  steamLine2: {
    position: 'absolute',
    top: -50,
    left: 100,
    width: 2,
    height: 40,
    backgroundColor: BrandColors.warmWhite,
    borderRadius: 2,
    opacity: 0.3,
  },
  steamLine3: {
    position: 'absolute',
    top: -35,
    right: 80,
    width: 3,
    height: 25,
    backgroundColor: BrandColors.warmWhite,
    borderRadius: 2,
    opacity: 0.35,
    transform: [{ rotate: '10deg' }],
  },
  brandContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: '300',
    color: BrandColors.warmWhite,
    letterSpacing: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 28,
    fontWeight: '800',
    color: BrandColors.warmWhite,
    letterSpacing: 12,
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  underline: {
    width: 80,
    height: 3,
    backgroundColor: BrandColors.warmWhite,
    marginTop: 16,
    borderRadius: 2,
    opacity: 0.8,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
});

