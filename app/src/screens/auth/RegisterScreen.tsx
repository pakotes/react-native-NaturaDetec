import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomTextInput from '../../components/CustomTextInput';
import CustomButton from '../../components/CustomButton';
import AlertNotification from '../../components/AlertNotification';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../../config';
import LoadingOverlay from '../../components/LoadingOverlay';
import { usePhoto } from '../../contexts/PhotoContext';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSecureInput } from '../../hooks/useSecureInput';

type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;

const RegisterScreen: React.FC = () => {
  const photoAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [errorName, setErrorName] = useState('');
  const [email, setEmail] = useState('');
  const [errorEmail, setErrorEmail] = useState('');
  const password = useSecureInput('');
  const confirmPassword = useSecureInput('');
  const [errorPassword, setErrorPassword] = useState('');
  const [errorConfirmPassword, setErrorConfirmPassword] = useState('');
  const navigation = useNavigation<RegisterScreenNavigationProp & any>();
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
  const [loading, setLoading] = useState(false);


  const { photo, setPhoto } = usePhoto();

  const handleFaceCapture = () => {
    navigation.navigate('FaceCapture', { requireAuth: false });
  };

  useEffect(() => {
    Animated.timing(photoAnim, {
      toValue: photo ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [photo]);

  const handleRegister = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validatePassword = (password: string) => password.length >= 6;

    setErrorName('');
    setErrorEmail('');
    setErrorPassword('');
    setErrorConfirmPassword('');

    if (!name) setErrorName('Campo Obrigatório.');
    if (!email) setErrorEmail('Campo Obrigatório.');
    if (email && !emailRegex.test(email)) setErrorEmail('Insira um e-mail válido.');
    if (!password.value) setErrorPassword('Campo Obrigatório.');
    if (!confirmPassword.value) setErrorConfirmPassword('Campo Obrigatório.');

    if (!name || !email || !password.value || !confirmPassword.value || !emailRegex.test(email)) {
      return;
    }

    if (password.value !== confirmPassword.value) {
      setErrorConfirmPassword('As palavras-passe não coincidem.');
      return;
    }

    if (!validatePassword(password.value)) {
      setErrorPassword('A palavra-passe deve ter pelo menos 6 caracteres.');
      showAlert(
        'DANGER',
        'Palavra-passe fraca',
        'A palavra-passe deve ter pelo menos 6 caracteres.'
      );
      return;
    }

    setLoading(true);
    try {
      let response, data;
      if (photo) {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('password', password.value);
        formData.append('photo', {
          uri: photo.uri,
          name: 'photo.jpg',
          type: 'image/jpeg',
        } as any);

        response = await fetch(`${API_BASE_URL}/auth/register-with-photo`, {
          method: 'POST',
          body: formData,
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password: password.value }),
        });
      }
      data = await response.json();
      if (!response.ok) {
        showAlert('DANGER', 'Erro', 'Erro no registo, tente novamente.');
        return;
      }
      setName('');
      setEmail('');
      password.reset();
      confirmPassword.reset();
      setPhoto(null);
      showAlert('SUCCESS', 'Sucesso', 'Registo realizado com sucesso! Faça login.');
      setTimeout(() => navigation.navigate('Login'), 2000);
    } catch (err) {
      showAlert('DANGER', 'Erro', 'Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handCancel = async () => {
    navigation.navigate('Login');
    setPhoto(null);
  }

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: 32 + insets.bottom, paddingTop: 24 }
      ]}
      enableOnAndroid
      extraScrollHeight={Platform.OS === 'ios' ? 20 : 120}
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: '#e8fad7' }}
    >
      <View style={styles.inner}>
        <LoadingOverlay visible={loading} message="A registar..." />
        <Text style={styles.title}>Criar Conta</Text>
        <Text style={styles.subtitle}>Preenche os campos para te registares.</Text>

        {/* Campo da foto */}
        <View style={styles.inputBox}>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              onPress={!photo ? handleFaceCapture : undefined}
              style={styles.photoButton}
              activeOpacity={photo ? 1 : 0.7}
              accessibilityLabel={photo ? "Foto de perfil" : "Adicionar foto de perfil"}
            >
              {photo ? (
                <Animated.Image
                  source={{ uri: photo.uri }}
                  style={[
                    styles.photoThumb,
                    {
                      transform: [
                        {
                          scale: photoAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.7, 1],
                          }),
                        },
                      ],
                      opacity: photoAnim,
                    },
                  ]}
                />
              ) : (
                <Animated.View
                  style={{
                    opacity: photoAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0],
                    }),
                    transform: [
                      {
                        scale: photoAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0.7],
                        }),
                      },
                    ],
                  }}
                >
                  <Ionicons name="camera-outline" size={36} color="#357a4c" />
                </Animated.View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={photo ? () => setPhoto(null) : handleFaceCapture}
              style={{
                position: 'absolute',
                top: -10,
                right: -10,
                backgroundColor: '#fff',
                borderRadius: 12,
                padding: 2,
                elevation: 3,
                zIndex: 2,
              }}
              accessibilityLabel={photo ? "Remover foto de perfil" : "Adicionar foto de perfil"}
            >
              <Ionicons
                name={photo ? "close-circle" : "add-circle"}
                size={28}
                color={photo ? "#e53935" : "#357a4c"}
              />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.photoLabel}>Foto (opcional)</Text>
            <Text style={styles.photoHint}>
              Esta foto será usada como avatar e para login por reconhecimento facial.
            </Text>
          </View>
        </View>

        <CustomTextInput
          label="Nome"
          placeholder="Digite o seu nome"
          value={name}
          onChangeText={setName}
          error={errorName}
          leftIcon={<Ionicons name="person-outline" size={20} color="#357a4c" />}
        />

        <CustomTextInput
          label="E-mail"
          placeholder="Digite o seu e-mail"
          value={email}
          onChangeText={setEmail}
          error={errorEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon={<Ionicons name="mail-outline" size={20} color="#357a4c" />}
        />

        <CustomTextInput
          label="Palavra-passe"
          placeholder="Digite a sua palavra-passe"
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
          label="Confirmar Palavra-passe"
          placeholder="Confirme a sua palavra-passe"
          value={confirmPassword.displayValue}
          onChangeText={confirmPassword.handleTextChange}
          error={errorConfirmPassword}
          //secureTextEntry={secureConfirm}
          leftIcon={<Ionicons name="lock-closed-outline" size={20} color="#357a4c" />}
          rightIcon={
            <TouchableOpacity onPress={() => confirmPassword.setIsSecure(!confirmPassword.isSecure)}>
              <Ionicons name={confirmPassword.isSecure ? "eye-off-outline" : "eye-outline"} size={25} color="#357a4c" />
            </TouchableOpacity>
          }
        />

        <CustomButton
          title="Registar"
          onPress={handleRegister}
          style={styles.primaryButton}
          disabled={loading}
        />
        <CustomButton
          title="Voltar ao Login"
          onPress={handCancel}
          style={styles.secondaryButton}
          textStyle={styles.secondaryButtonText}
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
        <View style={{ height: 32 }} />
      </View>
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#e8fad7',
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
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
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 16,
    width: '100%',
    elevation: 2,
    shadowColor: '#357a4c22',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    minHeight: 64,
  },
  photoButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8fad7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#357a4c',
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eee',
    borderWidth: 1.5,
    borderColor: '#357a4c',
  },
  removeIconContainer: {
    marginLeft: 8,
    backgroundColor: '#fff',
    borderRadius: 11,
    zIndex: 2,
  },
  photoLabel: {
    fontWeight: 'bold',
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    fontSize: 15,
  },
  photoHint: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    fontFamily: 'Montserrat',
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
    width: '100%',
  },
  secondaryButton: {
    backgroundColor: '#88a67c',
    borderWidth: 1,
    borderColor: '#357a4c',
    width: '100%',
  },
  secondaryButtonText: {
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
  },
});

export default RegisterScreen;