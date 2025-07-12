import React from 'react';
import { Image, StyleProp, ImageStyle } from 'react-native';
import LogoImg from '../assets/images/logo.webp';

type LogoProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
};

const Logo: React.FC<LogoProps> = ({ size = 100, style, resizeMode = 'contain' }) => (
  <Image
    source={LogoImg}
    style={[{ width: size, height: size }, style]}
    resizeMode={resizeMode}
    accessibilityLabel="Logotipo NaturaDetect"
  />
);

export default Logo;