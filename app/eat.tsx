import { BrandColors } from '@/constants/Colors';
import { Stack } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Restaurant coordinates - Karolingatan 1, 212 34 Malmö
const RESTAURANT_COORDS = {
  latitude: 55.58217399284163,
  longitude: 13.06507078199438,
  latitudeDelta: 0.005,
  longitudeDelta: 0.005,
};

// Google Maps navigation URL
const GOOGLE_MAPS_URL = `https://www.google.com/maps/dir/?api=1&destination=${RESTAURANT_COORDS.latitude},${RESTAURANT_COORDS.longitude}`;

/**
 * Eat-In Screen - Full-screen map with restaurant location
 * Premium design matching home screen styling
 */
export default function EatScreen() {
  const cardSlideAnim = useRef(new Animated.Value(150)).current;
  const cardFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate bottom card entrance
    Animated.parallel([
      Animated.spring(cardSlideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
        delay: 300,
      }),
      Animated.timing(cardFadeAnim, {
        toValue: 1,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleOpenMaps = () => {
    Linking.openURL(GOOGLE_MAPS_URL).catch((err) => {
      console.error('Failed to open maps:', err);
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Äta här',
          headerStyle: { backgroundColor: BrandColors.secondary },
          headerTintColor: BrandColors.warmWhite,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
      
      <View style={styles.container}>
        {/* Full-screen Map */}
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={RESTAURANT_COORDS}
          showsUserLocation
          showsMyLocationButton
        >
          {/* Restaurant Pin Marker */}
          <Marker
            coordinate={{
              latitude: RESTAURANT_COORDS.latitude,
              longitude: RESTAURANT_COORDS.longitude,
            }}
            title="Mormor's Kunafa"
            description="Äta här"
          >
            {/* Custom Marker */}
            <View style={styles.markerContainer}>
              <View style={styles.markerPin}>
                <Text style={styles.markerEmoji}>🍯</Text>
              </View>
              <View style={styles.markerTail} />
            </View>
          </Marker>
        </MapView>

        {/* Bottom Info Card */}
        <Animated.View
          style={[
            styles.bottomCard,
            {
              transform: [{ translateY: cardSlideAnim }],
              opacity: cardFadeAnim,
            },
          ]}
        >
          {/* Card Handle */}
          <View style={styles.cardHandle} />
          
          {/* Restaurant Info */}
          <View style={styles.restaurantInfo}>
            <Text style={styles.restaurantName}>Mormor's Kunafa</Text>
            <Text style={styles.restaurantAddress}>
              Karolingatan 1, 212 34 Malmö
            </Text>
          </View>

          {/* Open in Google Maps Button */}
          <TouchableOpacity
            style={styles.mapsButton}
            onPress={handleOpenMaps}
            activeOpacity={0.85}
          >
            <Text style={styles.mapsButtonText}>Öppna i Google Maps</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BrandColors.cream,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  
  // Custom Marker Styles
  markerContainer: {
    alignItems: 'center',
  },
  markerPin: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: BrandColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 3,
    borderColor: BrandColors.warmWhite,
  },
  markerEmoji: {
    fontSize: 24,
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: BrandColors.primary,
    marginTop: -2,
  },

  // Bottom Card Styles
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: BrandColors.secondary,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  cardHandle: {
    width: 50,
    height: 4,
    backgroundColor: BrandColors.primaryLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
    opacity: 0.6,
  },
  restaurantInfo: {
    marginBottom: 20,
  },
  restaurantName: {
    fontSize: 24,
    fontWeight: '800',
    color: BrandColors.warmWhite,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  restaurantAddress: {
    fontSize: 15,
    color: BrandColors.primaryLight,
    opacity: 0.9,
    lineHeight: 22,
  },
  mapsButton: {
    backgroundColor: BrandColors.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BrandColors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  mapsButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: BrandColors.secondary,
    letterSpacing: 0.5,
  },
});
