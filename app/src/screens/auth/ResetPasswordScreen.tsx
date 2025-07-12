import React, { useState } from 'react';
import { StyleSheet, Text, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { API_BASE_URL } from '../../../config';
import CustomTextInput from '../../components/CustomTextInput';
import CustomButton from '../../components/CustomButton';
import AlertNotification from '../../components/AlertNotification';
import { useSecureInput } from '../../hooks/useSecureInput';

type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string };
};
type ResetPasswordScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'ResetPassword'>;

const ResetPasswordScreen: React.FC = () => {
  const password = useSecureInput('');
  const confirmPassword = useSecureInput('');
  const [errorToken, setErrorToken] = useState('');
  const [errorPassword, setErrorPassword] = useState('');
  const [errorPassword2, setErrorPassword2] = useState('');
  const [alertNotif, setShowAlert] = useState<{ show: boolean; type?: string; title?: string; textBody?: string; key?: number }>({
    show: false,
    key: 0,
  });
  const navigation = useNavigation<ResetPasswordScreenNavigationProp>();
  const [loading, setLoading] = useState(false);

  // deep linking support for token from email link
  const route = useRoute<RouteProp<AuthStackParamList, 'ResetPassword'>>();
  const tokenFromLink = route.params?.token || '';
  const [token, setToken] = useState(tokenFromLink);

  const showAlert = (type: string, title: string, textBody: string) => {
    setShowAlert({
      show: true,
      type,
      title,
      textBody,
      key: Date.now(),
    });
  };

  const handleReset = async () => {
    setErrorToken('');
    setErrorPassword('');
    setErrorPassword2('');

    if (!token) {
      setErrorToken('Campo obrigatório.');
      return;
    }
    if (!password.value) {
      setErrorPassword('Campo obrigatório.');
      return;
    }
    if (password.value.length < 6) {
      setErrorPassword('A palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password.value !== confirmPassword.value) {
      setErrorPassword2('As palavras-passe não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: password.value }),
      });
      const data = await response.json();
      if (!response.ok) {
        showAlert('DANGER', 'Erro', data.error || 'Token inválido ou expirado.');
        return;
      }
      showAlert('SUCCESS', 'Sucesso', 'Palavra-passe alterada com sucesso! Faça login com a nova palavra-passe.');
      setToken('');
      password.reset();
      confirmPassword.reset();
      setTimeout(() => navigation.navigate('Login'), 2000);
    } catch (err) {
      showAlert('DANGER', 'Erro', 'Erro ao redefinir a palavra-passe. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#e8fad7' }}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 20 : 100}
        keyboardShouldPersistTaps="handled"
      >
        <Ionicons
          name="key-outline"
          size={80}
          color="#357a4c"
          style={{ alignSelf: 'center', marginBottom: 24 }}
        />
        <Text style={styles.title}>Redefinir Palavra-passe</Text>
        <Text style={styles.subtitle}>
          Insere o token recebido por e-mail e a nova palavra-passe.
        </Text>
        <CustomTextInput
          label="Token"
          placeholder="Cola aqui o token"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          error={errorToken}
          leftIcon={<Ionicons name="shield-checkmark-outline" size={20} color="#357a4c" />}
        />
        <CustomTextInput
          label="Nova palavra-passe"
          placeholder="Nova palavra-passe"
          value={password.displayValue}
          onChangeText={password.handleTextChange}
          error={errorPassword}
          leftIcon={<Ionicons name="lock-closed-outline" size={20} color="#357a4c" />}
          rightIcon={
            <TouchableOpacity onPress={() => password.setIsSecure(!password.isSecure)}>
              <Ionicons name={password.isSecure ? "eye-off-outline" : "eye-outline"} size={25} color="#357a4c" />
            </TouchableOpacity>
          }
        />
        <CustomTextInput
          label="Confirmar palavra-passe"
          placeholder="Repete a nova palavra-passe"
          value={confirmPassword.displayValue}
          onChangeText={confirmPassword.handleTextChange}
          error={errorPassword2}
          leftIcon={<Ionicons name="lock-closed-outline" size={20} color="#357a4c" />}
          rightIcon={
            <TouchableOpacity onPress={() => confirmPassword.setIsSecure(!confirmPassword.isSecure)}>
              <Ionicons name={confirmPassword.isSecure ? "eye-off-outline" : "eye-outline"} size={25} color="#357a4c" />
            </TouchableOpacity>
          }
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
          title="Redefinir Palavra-passe"
          onPress={handleReset}
          style={styles.primaryButton}
          disabled={loading}
        />
        <CustomButton
          title="Voltar ao Login"
          onPress={() => navigation.navigate('Login')}
          style={styles.secondaryButton}
          textStyle={styles.secondaryButtonText}
        />
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

export default ResetPasswordScreen;