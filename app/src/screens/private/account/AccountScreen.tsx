import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/AuthContext';
import { useUser } from '../../../contexts/UserContext';
import PrivateScreen from '../../../components/PrivateScreen';
import AlertNotification from '../../../components/AlertNotification';
import { doLogout } from '../../../utils/logout';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

const AccountScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { setIsAuthenticated } = useAuth();
  const { user, refreshUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: string; title: string; textBody: string } | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      const fetchProfile = async () => {
        setLoading(true);
        try {
          await refreshUser();
        } catch (err) {
          if (isMounted) {
            doLogout(setIsAuthenticated, setAlert, 'Erro de conexão com o servidor.');
          }
        } finally {
          if (isMounted) setLoading(false);
        }
      };
      fetchProfile();
      return () => { isMounted = false; };
    }, [])
  );

  const handleLogout = async () => {
    await doLogout(setIsAuthenticated, setAlert, 'Logout efetuado com sucesso!');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
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
    );
  }

  return (
    <PrivateScreen navigation={navigation}>
      <LinearGradient
        colors={['#eafbe6', '#f8fff6']}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Header com foto/nome/email */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarWrapper}>
              {user?.photo ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${user.photo}` }}
                  style={styles.avatarPhoto}
                />
              ) : (
                <View style={styles.avatarCircle}>
                  <Ionicons name="person-outline" size={60} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ marginLeft: 20 }}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Secção: O meu perfil */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name="person-outline" size={22} color="#357a4c" />
              </View>
              <Text style={styles.sectionTitle}>O meu perfil</Text>
            </View>
            <TouchableOpacity
              style={styles.option}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Profile')}
            >
              <View style={styles.optionIconCircle}>
                <Ionicons name="person-circle-outline" size={22} color="#357a4c" />
              </View>
              <Text style={styles.optionText}>Dados pessoais e de acesso</Text>
              <Ionicons name="chevron-forward" size={20} color="#bbb" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.option}
              onPress={() => navigation.navigate('DeleteAccount')}
              activeOpacity={0.85}
            >
              <View style={styles.optionIconCircle}>
                <Ionicons name="trash-outline" size={22} color="#357a4c" />
              </View>
              <Text style={styles.optionText}>Eliminar Conta</Text>
              <Ionicons name="chevron-forward" size={20} color="#bbb" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Terminar sessão (secundário) */}
          <TouchableOpacity style={styles.logout} onPress={handleLogout} activeOpacity={0.85}>
            <View style={styles.logoutBtnSecondary}>
              <Ionicons name="log-out-outline" size={20} color="#357a4c" style={{ marginRight: 8 }} />
              <Text style={styles.logoutTextSecondary}>Terminar sessão</Text>
            </View>
          </TouchableOpacity>

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
        </ScrollView>
      </LinearGradient>
    </PrivateScreen>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#eafbe6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 8,
  },
  avatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#357a4c',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#357a4c',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  avatarPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    resizeMode: 'cover',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#357a4c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 20,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 15,
    color: '#357a4c99',
    fontFamily: 'Montserrat',
  },
  divider: {
    height: 1,
    backgroundColor: '#c8f59d',
    marginVertical: 16,
    borderRadius: 2,
    opacity: 0.6,
  },
  section: {
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#c8f59d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#b2e59c',
    elevation: 2,
    shadowColor: '#357a4c22',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
    fontFamily: 'Montserrat-Bold',
  },
  option: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eafbe6',
    elevation: Platform.OS === 'android' ? 2 : 0,
    shadowColor: '#357a4c22',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  optionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eafbe6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionText: {
    fontSize: 15,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    flex: 1,
  },
  logout: {
    marginTop: 32,
    alignSelf: 'center',
    width: '80%',
  },
  logoutBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#357a4c',
    elevation: 1,
    shadowColor: '#357a4c22',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  logoutTextSecondary: {
    color: '#357a4c',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    letterSpacing: 1,
  },
});

export default AccountScreen;