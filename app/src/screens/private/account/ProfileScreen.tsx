import React, { useRef, useState, useEffect, use } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomButton from '../../../components/CustomButton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useNavigation } from '@react-navigation/native';
import { API_BASE_URL } from '../../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { useUser } from '../../../contexts/UserContext';
import { usePhoto } from '../../../contexts/PhotoContext';
import PrivateScreen from '../../../components/PrivateScreen';
import AlertNotification from '../../../components/AlertNotification';
import { doLogout } from '../../../utils/logout';
import { useSecureInput } from '../../../hooks/useSecureInput';

const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { setIsAuthenticated } = useAuth();
  const { refreshUser } = useUser();
  const nav = useNavigation();
  const { photo: capturedPhoto, setPhoto: setCapturedPhoto } = usePhoto();
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const password = useSecureInput('');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const isUploadingPhoto = useRef(false);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: string; title: string; textBody: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok && data.name) {
          if (isMounted) {
            setName(data.name);
            setPhoto(data.photo ? `data:image/jpeg;base64,${data.photo}` : null);
          }
        } else {
          if (isMounted) doLogout(setIsAuthenticated, setAlert)
        }
      } catch (err) {
        if (isMounted) doLogout(setIsAuthenticated, setAlert, 'Erro de conexão com o servidor.')
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchProfile();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const uploadPhoto = async (uri: string) => {
      if (isUploadingPhoto.current) return;
      isUploadingPhoto.current = true;
      setLoadingPhoto(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const formData = new FormData();
        formData.append('photo', {
          uri: uri,
          name: 'profile.jpg',
          type: 'image/jpeg',
        } as any);
        const response = await fetch(`${API_BASE_URL}/auth/profile/photo`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });
        if (response.ok) {
          setPhoto(uri);
          await refreshUser();
          setAlert({ type: 'SUCCESS', title: 'Sucesso', textBody: 'Foto atualizada com sucesso!' });
        } else if (response.status === 401) {
          doLogout(setIsAuthenticated, setAlert);
        } else {
          setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao atualizar foto.' });
        }
      } catch (err) {
        setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao enviar foto.' });
      }
      setLoadingPhoto(false);
      isUploadingPhoto.current = false;
    };

    if (capturedPhoto) {
      uploadPhoto(capturedPhoto.uri);
      setCapturedPhoto(null);
    }
  }, [capturedPhoto]);

  const removePhoto = async () => {
    setLoadingPhoto(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/auth/profile/photo`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setPhoto(null);
        await refreshUser();
        setAlert({ type: 'SUCCESS', title: 'Sucesso', textBody: 'Foto removida com sucesso!' });
      } else if (response.status === 401) {
        doLogout(setIsAuthenticated, setAlert);
      } else {
        setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao remover foto.' });
      }
    } catch (err) {
      setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao remover foto.' });
    }
    setLoadingPhoto(false);
  };

  const goToFaceCapture = () => {
    navigation.navigate('FaceCapture');
  };

  const handleSaveName = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          doLogout(setIsAuthenticated, setAlert);
        } else {
          setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao atualizar nome.' });
        }
      } else {
        await refreshUser();
        setAlert({ type: 'SUCCESS', title: 'Sucesso', textBody: 'Nome atualizado com sucesso!' });
        setEditingName(false);
      }
    } catch (err) {
      setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro de conexão com o servidor.' });
    }
  };

  const handleSavePassword = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          doLogout(setIsAuthenticated, setAlert);
        } else {
          setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao atualizar Palavra-passe.' });
        }
      } else {
        setAlert({ type: 'SUCCESS', title: 'Sucesso', textBody: 'Palavra-passe atualizada com sucesso!' });
        setEditingPassword(false);
        password.reset();
      }
    } catch (err) {
      setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro de conexão com o servidor.' });
    }
  };

  if (loading) {
    return (
      <PrivateScreen navigation={navigation}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#357a4c" />
          {alert && (
            <AlertNotification
              type={alert.type}
              title={alert.title}
              textBody={alert.textBody}
              autoClose={2500}
              onHide={() => setAlert(null)}
              toast
            />
          )}
        </View>
      </PrivateScreen>
    );
  }

  return (
    <PrivateScreen navigation={navigation}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        extraScrollHeight={100}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Dados pessoais e de acesso</Text>
        <View style={styles.avatarSection}>
          <View style={styles.avatarBigWrapper}>
            {loadingPhoto ? (
              <ActivityIndicator size="large" color="#357a4c" />
            ) : photo ? (
              <Image source={{ uri: photo }} style={styles.avatarBigPhoto} />
            ) : (
              <View style={styles.avatarBigCircle}>
                <Ionicons name="person-outline" size={80} color="#357a4c" />
              </View>
            )}
            <TouchableOpacity
              onPress={goToFaceCapture}
              style={styles.editPhotoButton}
              accessibilityLabel="Adicionar ou alterar foto de perfil"
              activeOpacity={0.85}
            >
              <Ionicons name="camera-outline" size={24} color="#357a4c" />
            </TouchableOpacity>
            {photo && !loadingPhoto && (
              <TouchableOpacity
                onPress={removePhoto}
                style={styles.removePhotoBtn}
                accessibilityLabel="Remover foto de perfil"
                activeOpacity={0.85}
              >
                <View style={styles.removePhotoIconBg}>
                  <Ionicons name="close" size={22} color="#d11a2a" />
                </View>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.photoHint}>
            Esta foto será usada como avatar e para login facial.
          </Text>
        </View>

        {/* NOME */}
        <View style={styles.itemRow}>
          <Text style={styles.label}>Nome</Text>
          {editingName ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Nome"
                placeholderTextColor="#b2e59c"
              />
              <View style={styles.editActionsRow}>
                <CustomButton title="Guardar" onPress={handleSaveName} style={styles.saveBtn} />
                <TouchableOpacity onPress={() => setEditingName(false)}>
                  <Text style={styles.cancelBtn}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.valueRow}>
              <Text style={styles.value}>{name}</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditingName(true)}
                accessibilityLabel="Editar nome"
                activeOpacity={0.85}
              >
                <Ionicons name="pencil" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* PASSWORD */}
        <View style={styles.itemRow}>
          <Text style={styles.label}>Palavra-passe</Text>
          {editingPassword ? (
            <View style={styles.editRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password.displayValue}
                  onChangeText={password.handleTextChange}
                  placeholder="Nova palavra-passe"
                  placeholderTextColor="#b2e59c"
                />
                <TouchableOpacity onPress={() => password.setIsSecure(!password.isSecure)} style={{ marginLeft: 8 }}>
                  <Ionicons name={password.isSecure ? "eye-off-outline" : "eye-outline"} size={25} color="#357a4c" />
                </TouchableOpacity>
              </View>
              <View style={styles.editActionsRow}>
                <CustomButton title="Guardar" onPress={handleSavePassword} style={styles.saveBtn} />
                <TouchableOpacity onPress={() => {
                  setEditingPassword(false);
                  password.reset();
                }}>
                  <Text style={styles.cancelBtn}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.valueRow}>
              <Text style={styles.value}>••••••••••••••••••••••••</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditingPassword(true)}
                accessibilityLabel="Alterar Palavra-passe"
                activeOpacity={0.85}
              >
                <Ionicons name="pencil" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {message ? (
          <Text style={styles.success}>{message}</Text>
        ) : null}
        {alert && (
          <AlertNotification
            type={alert.type}
            title={alert.title}
            textBody={alert.textBody}
            autoClose={2000}
            onHide={() => setAlert(null)}
            toast
          />
        )}
        <View style={{ height: 42 }} />
      </KeyboardAwareScrollView>
    </PrivateScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fff6',
    padding: 20,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 28,
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 4,
  },
  avatarBigWrapper: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#357a4c',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    elevation: 6,
    shadowColor: '#357a4c',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 10,
  },
  avatarBigPhoto: {
    width: 130,
    height: 130,
    borderRadius: 65,
    resizeMode: 'cover',
  },
  avatarBigCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#eafbe6',
    borderWidth: 2,
    borderColor: '#357a4c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPhotoButton: {
    position: 'absolute',
    left: 0,
    bottom: 2,
    backgroundColor: '#fff',
    opacity: 0.85,
    borderRadius: 18,
    padding: 6,
    borderWidth: 1.5,
    borderColor: '#357a4c',
    elevation: 2,
    shadowColor: '#357a4c22',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoBtn: {
    position: 'absolute',
    bottom: 2,
    right: 0,
    zIndex: 2,
  },
  removePhotoIconBg: {
    backgroundColor: '#fff',
    opacity: 0.85,
    borderRadius: 18,
    padding: 6,
    borderWidth: 2,
    borderColor: '#d11a2a',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  photoHint: {
    fontSize: 13,
    color: '#000',
    marginTop: 8,
    marginBottom: 8,
    maxWidth: 220,
    fontFamily: 'Montserrat',
    textAlign: 'center',
  },
  itemRow: {
    marginBottom: 28,
  },
  label: {
    fontSize: 15,
    color: '#357a4c',
    marginBottom: 6,
    fontFamily: 'Montserrat-Bold',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eafbe6',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#c8f59d',
  },
  value: {
    fontSize: 16,
    color: '#357a4c',
    flex: 1,
    fontFamily: 'Montserrat',
  },
  editRow: {
    flexDirection: 'column',
    backgroundColor: '#eafbe6',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#c8f59d',
  },
  input: {
    fontSize: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b2e59c',
    padding: 10,
    marginBottom: 8,
    fontFamily: 'Montserrat',
    color: '#357a4c',
  },
  editActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 12,
  },
  saveBtn: {
    marginRight: 8,
    backgroundColor: '#357a4c',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  cancelBtn: {
    color: '#1a7fa3',
    fontWeight: 'bold',
    textAlign: 'center',
    marginLeft: 8,
    fontFamily: 'Montserrat-Bold',
  },
  editButton: {
    marginLeft: 12,
    backgroundColor: '#357a4c',
    borderRadius: 20,
    padding: 8,
    elevation: Platform.OS === 'android' ? 2 : 0,
    shadowColor: '#357a4c22',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  success: {
    color: '#357a4c',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
  },
});

export default ProfileScreen;