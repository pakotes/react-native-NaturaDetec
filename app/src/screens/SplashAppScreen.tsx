import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Logo from '../components/LogoImage';
export default function SplashAppScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Logo size={160} style={styles.logo} />
      <Animated.Text style={[styles.appName, { opacity: fadeAnim }]}>
        NaturaDetec
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#c8f59d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    marginBottom: 24,
  },
  appName: {
    fontSize: 32,
    color: '#357a4c',
    fontWeight: 'bold',
    letterSpacing: 1,
    fontFamily: 'Montserrat',
  },
});