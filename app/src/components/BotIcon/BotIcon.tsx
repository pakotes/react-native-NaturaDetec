import React from 'react';
import CientistaBot from './CientistaBotIcon';
import ExploradorBot from './ExploradorBotIcon';
import NaturalistaBot from './NaturalistaBotIcon';

export type BotType = 'cientista' | 'explorador' | 'naturalista';

interface BotIconProps {
  type: BotType;
  size?: number;
}

const BotIcon: React.FC<BotIconProps> = ({ type, size = 64 }) => {
  switch (type) {
    case 'cientista':
      return <CientistaBot size={size} />;
    case 'explorador':
      return <ExploradorBot size={size} />;
    case 'naturalista':
      return <NaturalistaBot size={size} />;
    default:
      return null;
  }
};

export default BotIcon;
