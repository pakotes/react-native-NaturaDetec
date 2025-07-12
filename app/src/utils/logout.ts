import AsyncStorage from '@react-native-async-storage/async-storage';

export const doLogout = async (
  setIsAuthenticated: (v: boolean) => void,
  setAlert?: (a: any) => void,
  msg = 'Sessão expirada. Faça login novamente.'
) => {
  await AsyncStorage.removeItem('token');
  setIsAuthenticated(false);
  if (setAlert) {
    setAlert({ type: 'WARNING', title: 'Sessão terminada', textBody: msg });
    setTimeout(() => setAlert(null), 2500);
  }
};