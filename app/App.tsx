import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

// Importação dos contextos
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { UserProvider } from './src/contexts/UserContext';
import { GroupsProvider } from './src/contexts/GroupsContext';
import { PhotoProvider } from './src/contexts/PhotoContext';
import { RecommendationsProvider } from './src/contexts/RecommendationsContext';
import { AlertNotificationRoot } from 'react-native-alert-notification';

// Importação das telas
import SplashAppScreen from './src/screens/SplashAppScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import FaceLoginScreenWrapper from './src/screens/auth/FaceLoginScreenWrapper';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import FaceCaptureScreenWrapper from './src/screens/auth/FaceCaptureScreenWrapper';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/auth/ResetPasswordScreen';
import DeleteAccountScreen from './src/screens/private/account/DeleteAccountScreen';
import HomeScreen from './src/screens/private/HomeScreen';
import AccountScreen from './src/screens/private/account/AccountScreen';
import ProfileScreen from './src/screens/private/account/ProfileScreen';
import SpeciesScreen from './src/screens/private/SpeciesScreen';
import SpeciesDetailScreen from './src/screens/private/SpeciesDetailScreen';
import ExploreScreen from './src/screens/private/ExploreScreen';
import ExploreSpeciesScreen from './src/screens/private/ExploreSpeciesScreen';
import ChatBotScreen from './src/screens/private/ChatBotScreen';
import FavoritesScreen from './src/screens/private/FavoritesScreen';
import RecommendationsScreen from './src/screens/private/RecommendationsScreen';

const Stack = createStackNavigator();

function AppContent() {
  const { authLoaded, isAuthenticated } = useAuth();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (authLoaded) {
      SplashScreen.hideAsync();
      setTimeout(() => setShowSplash(false), 2000);
    }
  }, [authLoaded]);

  if (showSplash) {
    return <SplashAppScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isAuthenticated ? (
          <>
            {/* Rotas privadas */}
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerLeft: () => null, headerStyle: { backgroundColor: '#fff' } }} />
            <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'Conta' }} />
            <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: 'Eliminar conta' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'O meu perfil' }} />
            <Stack.Screen name="Species" component={SpeciesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SpeciesDetail" component={SpeciesDetailScreen} options={{ title: 'Detalhe da espécie' }} />
            <Stack.Screen name="FaceCapture" component={FaceCaptureScreenWrapper} options={{ headerShown: false }} />
            <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Recommendations" component={RecommendationsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Explore" component={ExploreScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ExploreSpecies" component={ExploreSpeciesScreen} options={{ title: 'Reconhecimento de Espécies' }} />
            <Stack.Screen name="ChatBot" component={ChatBotScreen} options={{ title: 'ChatBot' }} />

          </>
        ) : (
          <>
            {/* Rotas públicas */}
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FaceLogin" component={FaceLoginScreenWrapper} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Registo' }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Recuperar Palavra-passe' }} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: 'Recuperar Palavra-passe' }} />
            <Stack.Screen name="FaceCapture" component={FaceCaptureScreenWrapper} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = Font.useFonts({
    'Montserrat': require('./src/assets/fonts/Montserrat-Regular.ttf'),
    'Montserrat-Bold': require('./src/assets/fonts/Montserrat-Bold.ttf'),
  });

  useEffect(() => {
    async function prepare() {
      if (fontsLoaded) {
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <UserProvider>
        <PhotoProvider>
          <GroupsProvider>
            <RecommendationsProvider>
              <AlertNotificationRoot>
                <AppContent />
              </AlertNotificationRoot>
            </RecommendationsProvider>
          </GroupsProvider>
        </PhotoProvider>
      </UserProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8fad7',
    alignItems: 'center',
    justifyContent: 'center',
  },
});