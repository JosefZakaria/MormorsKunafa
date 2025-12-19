import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { HeroSection } from '@/components/ui/HeroSection';
import { ActionPanel } from '@/components/ui/ActionPanel';
import { BrandColors } from '@/constants/Colors';

/**
 * Home Screen - Premium Kunafa App Landing
 * 
 * Layout: 85-90% Hero Section + 10-15% Action Panel
 * Following MAX Burgers / Sushi Yama design patterns
 */
export default function HomeScreen() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Hero Section - Takes ~87% of screen */}
      <View style={styles.heroContainer}>
        <HeroSection
          title="Mormor's"
          subtitle="KUNAFA"
        />
      </View>
      
      {/* Action Panel - Takes ~13% of screen */}
      <View style={styles.actionContainer}>
        <ActionPanel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BrandColors.secondary,
  },
  heroContainer: {
    flex: 0.87,
  },
  actionContainer: {
    flex: 0.13,
    justifyContent: 'flex-end',
  },
});
