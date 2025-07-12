import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../../../config';
import CustomTextInput from '../../components/CustomTextInput';
import CustomButton from '../../components/CustomButton';
import AlertNotification from '../../components/AlertNotification';

type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

type ForgotPasswordScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

const ForgotPasswordScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [errorEmail, setErrorEmail] = useState('');
  const [alertNotif, setShowAlert] = useState<{ show: boolean; type?: string; title?: string; textBody?: string; key?: number }>({
    show: false,
    key: 0,
  });
  const showAlert = (type: string, title: string, textBody: string) => {
    setShowAlert({
      show: true,
      type,
      title,
      textBody,
      key: Date.now(),
    });
  };
  const navigation = useNavigation<ForgotPasswordScreenNavigationProp>();
  const [loading, setLoading] = useState(false);

  const handleRecover = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    setErrorEmail('');
    if (!email) {
      setErrorEmail('Campo Obrigatório.');
      return;
    }
    if (!emailRegex.test(email)) {
      setErrorEmail('Email inválido.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) {
        showAlert('DANGER', 'Erro', 'Credenciais inválidas, tente novamente.')
        return;
      }
      showAlert('SUCCESS', 'Sucesso', 'Se o e-mail existir, receberá instruções para redefinir a palavra-passe.')
      setEmail('');

    } catch (err) {
      showAlert('DANGER', 'Erro', 'Erro ao autenticar-se, tente novamente.')
    } finally {
      setLoading(false);
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
        <Ionicons
          name="lock-closed-outline"
          size={80}
          color="#357a4c"
          style={{ alignSelf: 'center', marginBottom: 24 }}
        />
        <Text style={styles.title}>Recuperar Palavra-passe</Text>
        <Text style={styles.subtitle}>Insere o teu e-mail para receber instruções de recuperação.</Text>
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
        {alertNotif.show && (
          <AlertNotification
            type={alertNotif.type}
            title={alertNotif.title}
            textBody={alertNotif.textBody}
            toast
            onPress={() => setShowAlert({ show: false, key: Date.now() })}
            onHide={() => setShowAlert({ show: false, key: Date.now() })}
            autoClose={3000}
          />
        )}
        <CustomButton
          title="Recuperar Palavra-passe"
          onPress={handleRecover}
          style={styles.primaryButton}
          disabled={loading}
        />
        <CustomButton
          title="Voltar ao Login"
          onPress={() => navigation.navigate('Login')}
          style={styles.secondaryButton}
          textStyle={styles.secondaryButtonText}
        />
        <TouchableOpacity onPress={() => navigation.navigate('ResetPassword')}>
          <Text style={{ color: '#357a4c', textAlign: 'center', marginTop: 16 }}>
            Já tenho um token de recuperação
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#e8fad7',
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#357a4c',
    fontFamily: 'Montserrat',
    textAlign: 'center',
    marginBottom: 18,
  },
  error: {
    color: '#e53935',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Montserrat',
  },
  primaryButton: {
    backgroundColor: '#357a4c',
    marginTop: 8,
    marginBottom: 8,
  },
  secondaryButton: {
    backgroundColor: '#88a67c',
    borderWidth: 1,
    borderColor: '#357a4c',
  },
  secondaryButtonText: {
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
  },
});

export default ForgotPasswordScreen;