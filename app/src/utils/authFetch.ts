import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * authFetch - fetch autenticado universal
 * 
 * @param {string} url - URL da API
 * @param {object} options - fetch options (headers, method, body, etc)
 * @param {function} onSessionExpired - função chamada se perder sessão (ex: logout e navegação)
 * @returns {Promise<Response|null>} - response ou null se sessão expirada
 */
export async function authFetch(url: string, options: any = {}, onSessionExpired: () => void): Promise<Response | null> {
  const token = await AsyncStorage.getItem('token');
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    await AsyncStorage.removeItem('token');
    onSessionExpired();
    return null;
  }
  return response;
}