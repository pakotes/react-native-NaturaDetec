import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface Props {
  size?: number;
}

const ExploradorBot: React.FC<Props> = ({ size = 64 }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Circle cx="32" cy="36" r="20" fill="#f9f6f0" stroke="#333" strokeWidth="2" />
    <Circle cx="24" cy="34" r="3" fill="#333" />
    <Circle cx="40" cy="34" r="3" fill="#333" />
    <Path d="M24 44c2 2 12 2 16 0" stroke="#333" strokeWidth="2" strokeLinecap="round" />
    <Path d="M16 28c0-6 8-12 16-12s16 6 16 12" fill="#e0c190" stroke="#333" strokeWidth="2" />
    <Rect x="18" y="26" width="28" height="6" rx="3" fill="#b08452" stroke="#333" strokeWidth="1.5" />
  </Svg>
);

export default ExploradorBot;
