import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  SafeAreaView,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { BrandColors } from '@/constants/Colors';
import { TakeawayIcon } from '@/components/icons/CustomIcons';

/**
 * Takeaway Screen - Placeholder for pickup orders
 */
export default function TakeawayScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Ta med',
          headerStyle: { backgroundColor: BrandColors.secondary },
          headerTintColor: BrandColors.warmWhite,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
      <SafeAreaView style={styles.container}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <TakeawayIcon size={80} color={BrandColors.primary} />
          </View>
          <Text style={styles.title}>Ta med</Text>
          <Text style={styles.subtitle}>
            Beställ och hämta din kunafa
          </Text>
          <Text style={styles.placeholder}>
            Välj restaurang för avhämtning
          </Text>
          
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Gå tillbaka</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.cream,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: BrandColors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: BrandColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: BrandColors.secondary,
    marginBottom: 8,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 18,
    color: BrandColors.accent,
    marginBottom: 24,
    textAlign: 'center',
  },
  placeholder: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  button: {
    backgroundColor: BrandColors.secondary,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: BrandColors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: BrandColors.warmWhite,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

