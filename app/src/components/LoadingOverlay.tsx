import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

type LoadingOverlayProps = {
  visible: boolean;
  message?: string;
};

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, message }) => {
  if (!visible) return null;
  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color="#fff" />
      {message && <Text style={styles.text}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  text: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
});

export default LoadingOverlay;