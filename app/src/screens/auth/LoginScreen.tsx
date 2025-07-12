import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useUser } from '../../contexts/UserContext';
import CustomButton from '../../components/CustomButton';
import CustomTextInput from '../../components/CustomTextInput';
import LogoImage from '../../components/LogoImage';
import AlertNotification from '../../components/AlertNotification';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSecureInput } from '../../hooks/useSecureInput';

// Definição dos parâmetros de navegação para o Stack
type AuthStackParamList = {
  Login: undefined;
  FaceLogin: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Home: { userName: string };
};

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

const LoginScreen: React.FC = () => {
  const { refreshUser } = useUser();
  const [email, setEmail] = useState('');
  const password = useSecureInput('');
  const [errorEmail, setErrorEmail] = useState('');
  const [errorPassw, setErrorPassword] = useState('');
  const [alertNotif, setShowAlert] = useState<{ show: boolean; type?: string; title?: string; textBody?: string; key?: number }>({
    show: false,
    key: 0,
  });
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { setIsAuthenticated } = useAuth();

  const handleLogin = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setErrorEmail('');
    setErrorPassword('');

    if (!email) {
      setErrorEmail('Campo Obrigatório.');
    } else if (!emailRegex.test(email)) {
      setErrorEmail('Email inválido.');
    }
    if (!password.value) {
      setErrorPassword('Campo Obrigatório.');
    }
    if (!email || !password.value || !emailRegex.test(email) || password.value.length < 6) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: password.value }),
      });
      const data = await response.json();
      if (!response.ok) {
        setShowAlert({
          show: true,
          type: 'DANGER',
          title: 'Erro',
          textBody: 'Credenciais inválidas, tente novamente.',
          key: Date.now(),
        });
        return;
      }
      await AsyncStorage.setItem('token', data.token);
      await refreshUser();
      setIsAuthenticated(true);
    } catch (err) {
      setShowAlert({
        show: true,
        type: 'DANGER',
        title: 'Erro',
        textBody: 'Erro ao autenticar-se, tente novamente.',
        key: Date.now(),
      });
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#e8fad7' }}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 20 : 40}
        keyboardShouldPersistTaps="handled"
      >
        <LogoImage size={180} style={{ marginBottom: 10 }} />
        <Text style={styles.title}>NaturaDetect</Text>
        <CustomTextInput
          label="Email"
          placeholder="Insere o teu email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={errorEmail}
          leftIcon={<Ionicons name="mail-outline" size={20} color="#357a4c" />}
        />
        <CustomTextInput
          label="Palavra-passe"
          placeholder="Insere a tua palavra-passe"
          value={password.displayValue}
          onChangeText={password.handleTextChange}
          //secureTextEntry={secure}
          error={errorPassw}
          leftIcon={<Ionicons name="lock-closed-outline" size={20} color="#357a4c" />}
          rightIcon={
            <TouchableOpacity onPress={() => password.setIsSecure(!password.isSecure)}>
              <Ionicons name={password.isSecure ? "eye-off-outline" : "eye-outline"} size={25} color="#357a4c" />
            </TouchableOpacity>
          }
        />
        <CustomButton
          title="Entrar"
          onPress={handleLogin}
          style={{
            backgroundColor: '#357a4c',
            marginTop: 12,
            height: 56,
            borderRadius: 18,
            width: '100%',
            minWidth: 200,
          }}
        />
        <TouchableOpacity onPress={() => navigation.navigate('FaceLogin')}>
          <View style={styles.faceLogin}>
            <Ionicons name="camera-outline" size={22} color="#357a4c" />
            <Text style={styles.faceLoginText}>Entrar com reconhecimento facial</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.link}>Esqueceu a palavra-passe?</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.link}>Criar conta</Text>
        </TouchableOpacity>
        {alertNotif.show && (
          <AlertNotification
            type={alertNotif.type}
            title={alertNotif.title}
            textBody={alertNotif.textBody}
            toast
            onPress={() => setShowAlert({ show: false, key: Date.now() })}
            onHide={() => setShowAlert({ show: false, key: Date.now() })}
            autoClose={2000}
          />
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#e8fad7',
    flexGrow: 1,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#357a4c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 35,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 24,
  },
  link: {
    color: '#357a4c',
    fontSize: 15,
    fontFamily: 'Montserrat',
    marginTop: 12,
    textDecorationLine: 'underline',
  },
  faceLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  faceLoginText: {
    color: '#357a4c',
    fontSize: 15,
    fontFamily: 'Montserrat',
    marginLeft: 6,
  },
});

export default LoginScreen;