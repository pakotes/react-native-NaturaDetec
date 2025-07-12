import React, { createContext, useContext, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config';
import { doLogout } from '../utils/logout';
import { useAuth } from './AuthContext';

// Utilitário para fetch autenticado
async function authFetch(url: string, options: any = {}, onUnauthorized?: () => void) {
  const token = await AsyncStorage.getItem('token');
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  return response;
}

type User = { name: string; email: string; photo?: string } | null;
type UserContextType = {
  user: User;
  setUser: (user: User) => void;
  refreshUser: () => Promise<void>;
};

const UserContext = createContext<UserContextType>({
  user: null,
  setUser: () => {},
  refreshUser: async () => {},
});

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  const { setIsAuthenticated } = useAuth(); // Para logout automático

  // Carrega do storage/local
  const loadUserFromStorage = async () => {
    const userData = await AsyncStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
  };

  // Faz fetch à API e atualiza local/global
  const refreshUser = async () => {
    const response = await authFetch(
      `${API_BASE_URL}/auth/profile`,
      {},
      () => doLogout(setIsAuthenticated) // Logout automático se 401
    );
    if (response && response.ok) {
      const data = await response.json();
      setUser(data);
      await AsyncStorage.setItem('user', JSON.stringify(data));
    }
  };

  // Carrega ao iniciar
  React.useEffect(() => { loadUserFromStorage(); }, []);

  return (
    <UserContext.Provider value={{ user, setUser, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);