import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

interface Props {
  size?: number;
}

const NaturalistaBot: React.FC<Props> = ({ size = 64 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Circle cx="32" cy="36" r="20" fill="#eaf8ea" stroke="green" strokeWidth="2" />
    <Circle cx="24" cy="34" r="3" fill="green" />
    <Circle cx="40" cy="34" r="3" fill="green" />
    <Path d="M24 44c2 2 12 2 16 0" stroke="green" strokeWidth="2" strokeLinecap="round" />
    <Path d="M32 12c4 4 4 8 0 12-4-4-4-8 0-12z" fill="green" />
  </Svg>
);

export default NaturalistaBot;
