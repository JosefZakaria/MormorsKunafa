import React from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export const InstagramFeed = () => {
  // Byt ut denna URL mot den riktiga från LightWidget när du har den
  const LIGHTWIDGET_URL = 'https://example.com';

  return (
    <View style={styles.container}>
      {/* 
        Klistra in eventuell extra kod för LightWidget om det behövs,
        eller behåll WebView:n och använd bara din nya URL ovan.
      */}
      <WebView 
        source={{ uri: LIGHTWIDGET_URL }}
        style={styles.webview}
        scrollEnabled={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 400,
    marginVertical: 20,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  }
});
