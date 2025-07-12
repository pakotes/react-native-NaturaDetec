import React from 'react';
import Svg, { Circle, Rect, Line } from 'react-native-svg';

interface Props {
  size?: number;
}

const CientistaBot: React.FC<Props> = ({ size = 64 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Rect x="16" y="20" width="32" height="24" rx="8" fill="#e6f0f8" stroke="#222" strokeWidth="2" />
    <Circle cx="24" cy="32" r="4" fill="#222" />
    <Circle cx="40" cy="32" r="4" fill="#222" />
    <Line x1="28" y1="32" x2="36" y2="32" stroke="#222" strokeWidth="2" />
    <Line x1="32" y1="20" x2="32" y2="12" stroke="#222" strokeWidth="2" />
    <Circle cx="32" cy="10" r="2" fill="#222" />
  </Svg>
);

export default CientistaBot;
