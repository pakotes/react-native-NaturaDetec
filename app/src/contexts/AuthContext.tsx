import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type AuthContextType = {
  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;
  authLoaded: boolean;
};

// Contexto de autenticação para gerenciar o estado de autenticação do utilizador
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  setIsAuthenticated: () => { },
  authLoaded: false,
});

// Provedor de autenticação que encapsula a lógica de autenticação
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('token')
      .then(token => {setIsAuthenticated(!!token);})
      .catch(() => {setIsAuthenticated(false);})
      .finally(() => {setAuthLoaded(true);});
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, setIsAuthenticated, authLoaded }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);