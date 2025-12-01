import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { BrandColors } from '@/constants/Colors';

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  labelStyle?: TextStyle;
}

/**
 * Premium Action Button with touch feedback animation
 * Used in the bottom action panel for Eat-in, Takeaway, Delivery
 */
export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
  style,
  labelStyle,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.92,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 5,
        tension: 100,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.touchable}
    >
      <Animated.View
        style={[
          styles.container,
          style,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <Animated.View style={styles.iconContainer}>
          {icon}
        </Animated.View>
        <Text style={[styles.label, labelStyle]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconContainer: {
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: BrandColors.warmWhite,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

