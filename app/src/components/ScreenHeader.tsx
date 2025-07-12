import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Logo from '../assets/images/logo.webp';

type Props = {
  title: string;
  right?: React.ReactNode;
  color?: string;
};

const ScreenHeader: React.FC<Props> = ({ title, right, color }) => {
  const navigation = useNavigation<any>();

  return (
    <LinearGradient
      colors={color ? [color, color] : ['#357a4c', '#c8f59d']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.header}
    >
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => navigation.navigate('Home' as never)}>
          <Image source={Logo} style={styles.logo} resizeMode="contain" />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.right}>{right}</View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 90,
    justifyContent: 'flex-end',
    paddingBottom: 10,
    elevation: 4,
    zIndex: 10,
    marginBottom: 4,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  logo: {
    width: 46,
    height: 46,
    marginRight: 12,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  right: {
    width: 46,
    alignItems: 'flex-end',
  },
});

export default ScreenHeader;