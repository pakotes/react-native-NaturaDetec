import React, { ReactNode, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

type Props = {
  children: ReactNode;
  navigation: any;
};

const PrivateScreen: React.FC<Props> = ({ children, navigation }) => {
  const { isAuthenticated, authLoaded } = useAuth();

  useEffect(() => {
    if (authLoaded && !isAuthenticated) {
      navigation.replace('Login');
    }
  }, [isAuthenticated, authLoaded, navigation]);

  if (!authLoaded) return null;

  return <>{children}</>;
};

export default PrivateScreen;