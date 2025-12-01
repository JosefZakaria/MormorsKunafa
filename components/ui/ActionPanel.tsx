import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { router } from 'expo-router';
import { ActionButton } from './ActionButton';
import { EatInIcon, TakeawayIcon, DeliveryIcon } from '../icons/CustomIcons';
import { BrandColors } from '@/constants/Colors';

/**
 * Premium Action Panel with 3 main action buttons
 * Features slide-up animation and elevated styling
 */
export const ActionPanel: React.FC = () => {
  const slideAnim = useRef(new Animated.Value(100)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation with delay for hero to animate first
    Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleEatIn = () => {
    router.push('/eat');
  };

  const handleTakeaway = () => {
    router.push('/takeaway');
  };

  const handleDelivery = () => {
    router.push('/delivery');
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: fadeAnim,
        },
      ]}
    >
      {/* Subtle top highlight */}
      <View style={styles.topHighlight} />
      
      <View style={styles.buttonRow}>
        <ActionButton
          icon={<EatInIcon size={36} color={BrandColors.warmWhite} />}
          label="Äta här"
          onPress={handleEatIn}
        />
        
        <View style={styles.divider} />
        
        <ActionButton
          icon={<TakeawayIcon size={36} color={BrandColors.warmWhite} />}
          label="Ta med"
          onPress={handleTakeaway}
        />
        
        <View style={styles.divider} />
        
        <ActionButton
          icon={<DeliveryIcon size={36} color={BrandColors.warmWhite} />}
          label="Leverans"
          onPress={handleDelivery}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: BrandColors.secondary,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 16,
    // Premium shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  topHighlight: {
    width: 50,
    height: 4,
    backgroundColor: BrandColors.primaryLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: BrandColors.secondaryLight,
    opacity: 0.4,
  },
});

