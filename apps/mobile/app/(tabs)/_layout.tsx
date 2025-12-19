import { HomeIcon, MenuIcon } from '@/components/icons/CustomIcons';
import { BrandColors } from '@/constants/Colors';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

/**
 * Tab Layout - Premium navigation styling
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: BrandColors.primary,
        tabBarInactiveTintColor: '#7A8B85',
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hem',
          tabBarIcon: ({ color, size }) => (
            <HomeIcon size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Meny',
          tabBarIcon: ({ color, size }) => (
            <MenuIcon size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: BrandColors.secondary,
    borderTopWidth: 0,
    height: 65,
    paddingBottom: 8,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tabItem: {
    paddingTop: 4,
  },
});
