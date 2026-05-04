import React from 'react';
import { View, StyleSheet, StatusBar, ScrollView, Dimensions } from 'react-native';
import { HeroSection } from '@/components/ui/HeroSection';
import { ActionPanel } from '@/components/ui/ActionPanel';
import { InstagramFeed } from '@/components/ui/InstagramFeed';
import { BrandColors } from '@/constants/Colors';

const { height } = Dimensions.get('window');

/**
 * Home Screen - Premium Kunafa App Landing
 * 
 * Layout: 85-90% Hero Section + 10-15% Action Panel
 * Following MAX Burgers / Sushi Yama design patterns
 */
export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
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

      <InstagramFeed />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.secondary,
  },
  scrollContent: {
    flexGrow: 1,
  },
  root: {
    height: height,
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
