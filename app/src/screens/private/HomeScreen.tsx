import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ColorValue, TouchableOpacity, Image, ScrollView, Dimensions, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useGroups } from '../../contexts/GroupsContext';
import { useRecommendations } from '../../contexts/RecommendationsContext';
import { API_BASE_URL } from '../../../config';
import { doLogout } from '../../utils/logout';
import BottomTabBar from '../../components/BottomTabBar';
import PrivateScreen from '../../components/PrivateScreen';
import GroupIcon from '../../components/GroupIcon';
import AlertNotification from '../../components/AlertNotification';

const GRADIENT_COLORS: readonly [ColorValue, ColorValue, ...ColorValue[]] = ['#357a4c', '#c8f59d'];
const GRADIENT_PROPS = {
  colors: GRADIENT_COLORS,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
};
const HEADER_HEIGHT = 100;
const { width } = Dimensions.get('window');

const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<{ name: string; email: string; photo?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { groups } = useGroups();
  const { 
    recommendedSpecies, 
    getPersonalizedRecommendations, 
    loading: recommendationsLoading 
  } = useRecommendations();
  const [error, setError] = useState('');
  const { setIsAuthenticated } = useAuth();
  const [knowThat, setKnowThat] = useState<{ action: string; taxon_id: number | null }>({ action: '', taxon_id: null });
  const [highlightSpecies, setHighlightSpecies] = useState<any[]>([]);
  const [loadingHighlight, setLoadingHighlight] = useState(true);
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [groupStats, setGroupStats] = useState<{ [groupId: string]: number }>({});
  const [totalSpecies, setTotalSpecies] = useState(0);
  const [alert, setAlert] = useState<{ type: string; title: string; textBody: string } | null>(null);
  const [loadingKnowThat, setLoadingKnowThat] = useState(false);

  const [pkiStats, setPkiStats] = useState<{ totalSpecies: number | null; favoriteSpecies: number | null }>({
    totalSpecies: null,
    favoriteSpecies: null,
  });

  const getGroupLabel = (groupId: string | undefined) => {
    if (!groupId) return '';
    const group = groups.find(g => g.id === groupId);
    return group ? group.label : groupId;
  };
  const getGroupIcon = (groupId: string | undefined) => {
    if (!groupId) return 'taxon-default';
    const group = groups.find(g => g.id === groupId);
    return group && typeof group.icon === 'string' ? group.icon : 'taxon-default';
  };

  const fetchKnowThat = async () => {
    setLoadingKnowThat(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/knowthat/random`);
      const data = await res.json();
      
      setKnowThat({
        action: data.action || '',
        taxon_id: data.taxon_id || null
      });
    } catch (error) {
      console.error('Erro ao buscar KnowThat:', error);
      setKnowThat({ action: '', taxon_id: null });
    } finally {
      setLoadingKnowThat(false);
    }
  };

  const handleRefreshKnowThat = () => {
    fetchKnowThat();
  };

  const fetchProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        doLogout(setIsAuthenticated, setAlert)
        return;
      }
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Erro ao buscar perfil.');
        setUser(null);
        if (response.status === 401 || response.status === 403) {
          doLogout(setIsAuthenticated, setAlert)
        }
        return;
      }
      setUser({ name: data.name, email: data.email, photo: data.photo });
    } catch (err) {
      doLogout(setIsAuthenticated, setAlert, 'Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchProfile();
    }, [])
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Fetch espécies em destaque
  useEffect(() => {
    const fetchHighlightSpecies = async () => {
      setLoadingHighlight(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/species/highlight`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setHighlightSpecies(data.results || []);
      } catch {
        setHighlightSpecies([]);
      }
      setLoadingHighlight(false);
    };
    fetchHighlightSpecies();
  }, []);

  // Fetch recomendadas usando o contexto
  useEffect(() => {
    const loadRecommendations = async () => {
      setLoadingRecommended(true);
      try {
        await getPersonalizedRecommendations(5);
      } catch (error) {
        console.error('Erro ao carregar recomendações:', error);
      } finally {
        setLoadingRecommended(false);
      }
    };
    loadRecommendations();
  }, [getPersonalizedRecommendations]);

  useEffect(() => {
    fetchKnowThat();
  }, []);

  useEffect(() => {
    const fetchPkiStats = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/stats/pki`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setPkiStats({
          totalSpecies: typeof data.totalSpecies === 'number' ? data.totalSpecies : null,
          favoriteSpecies: typeof data.favoriteSpecies === 'number' ? data.favoriteSpecies : null,
        });
      } catch {
        setPkiStats({ totalSpecies: null, favoriteSpecies: null });
      }
    };
    fetchPkiStats();
  }, []);

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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#e8fad7' }}>
        {/* HEADER FIXO COM GRADIENTE */}
        <LinearGradient
          {...GRADIENT_PROPS}
          style={[
            styles.fixedHeader,
            {
              paddingTop: insets.top + 16,
              height: HEADER_HEIGHT + insets.top,
            }
          ]}
        >
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>Olá, {user?.name || 'Utilizador'}!</Text>
              <Text style={styles.headerSubtitle}>Bem-vindo ao NaturaDetect</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Account')}>
              {user?.photo ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${user.photo}` }}
                  style={styles.avatar}
                />
              ) : (
                <Ionicons name="person-circle-outline" size={44} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: HEADER_HEIGHT,
            paddingBottom: 74 + insets.bottom,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* PKI Cards */}
          <LinearGradient
            {...GRADIENT_PROPS}
            style={styles.gradientBlock}
          >
            <View style={styles.pkiRow}>
              {/* Total de Espécies */}
              <View style={[styles.pkiCardAlt, { backgroundColor: '#357a4c', flex: 1, marginRight: 8, borderWidth: 2, borderColor: '#c8f59d', }]}>
                <Ionicons name="leaf" size={32} color="#fff" style={{ marginBottom: 8 }} />
                <Text style={[styles.pkiValueAlt, { color: '#fff', fontSize: 26 }]}>
                  {pkiStats.totalSpecies === null ? '-' : pkiStats.totalSpecies}
                </Text>
                <Text style={[styles.pkiLabelAlt, { color: '#fff', fontSize: 14 }]}>Espécies Reconhecidas</Text>
              </View>
              {/* Total de Favoritos */}
              <View style={[styles.pkiCardAlt, { backgroundColor: '#357a4c', flex: 1, marginRight: 8, borderWidth: 2, borderColor: '#c8f59d', }]}>
                <Ionicons name="heart" size={32} color="#e53935" style={{ marginBottom: 8 }} />
                <Text style={[styles.pkiValueAlt, { color: '#fff', fontSize: 26 }]}>
                  {pkiStats.favoriteSpecies === null ? '-' : pkiStats.favoriteSpecies}
                </Text>
                <Text style={[styles.pkiLabelAlt, { color: '#fff', fontSize: 14 }]}>Favoritos</Text>
              </View>
            </View>
          </LinearGradient>

          {/* BLOCO DE ESPÉCIES EM DESTAQUE */}
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginLeft: 20, marginBottom: 8, color: '#357a4c' }}>
              Espécies em destaque
            </Text>
            {loadingHighlight ? (
              <ActivityIndicator size="small" color="#357a4c" style={{ marginLeft: 20 }} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16 }}>
                {highlightSpecies.map((species, idx) => (
                  <TouchableOpacity
                    key={species.sci_name + idx}
                    style={{
                      width: 120,
                      marginRight: 16,
                      backgroundColor: '#f4f8f4',
                      borderRadius: 12,
                      alignItems: 'center',
                      padding: 10,
                      elevation: 2,
                      position: 'relative',
                      overflow: 'visible',
                    }}
                    onPress={() => navigation.navigate('SpeciesDetail', { 
                        taxon_id: species.taxon_id,
                        species: species,
                        group: species.group,
                        groupLabel: getGroupLabel(species.group)
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                      <GroupIcon icon={getGroupIcon(species.group)} size={20} />
                      <Text style={{ marginLeft: 6, color: '#357a4c', fontSize: 13, fontFamily: 'Montserrat' }}>
                        {getGroupLabel(species.group) || 'Grupo'}
                      </Text>
                    </View>
                    {/* Imagem da espécie */}
                    <View style={{ width: 80, height: 80, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
                      <Image
                        source={
                          species.image_square_url
                            ? { uri: species.image_square_url }
                            : require('../../assets/images/80x80_SemFoto.webp')
                        }
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 8,
                          backgroundColor: '#eee',
                        }}
                        resizeMode="cover"
                      />
                    </View>
                    <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#357a4c', textAlign: 'center' }}>
                      {species.common_name || 'Sem nome comum'}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#888', textAlign: 'center', fontStyle: 'italic' }}>
                      {species.sci_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* BLOCO SABIA QUE... */}
          <View style={{ marginTop: 32, marginHorizontal: 20 }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 20,
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                elevation: 3,
                shadowColor: '#357a4c',
                shadowOpacity: 0.1,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                borderWidth: 1,
                borderColor: '#e0f2cc',
                ...(knowThat.taxon_id ? {
                  borderColor: '#c8f59d',
                  backgroundColor: '#fafffe',
                } : {})
              }}
              onPress={() => {
                if (knowThat.taxon_id) {
                  navigation.navigate('SpeciesDetail', { 
                    taxon_id: knowThat.taxon_id,
                    species: null,
                    group: null,
                    groupLabel: null
                  });
                } else {
                  setAlert({
                    type: 'info',
                    title: 'Sabia que...',
                    textBody: knowThat.action || 'Nenhuma dica disponível no momento.'
                  });
                }
              }}
              disabled={!knowThat.action || loadingKnowThat}
              activeOpacity={knowThat.taxon_id ? 0.7 : 0.9}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
                <View style={{
                  backgroundColor: '#e8fad7',
                  borderRadius: 12,
                  padding: 12,
                  marginRight: 16,
                  borderWidth: 1,
                  borderColor: '#c8f59d',
                }}>
                  <Ionicons name="earth-outline" size={24} color="#357a4c" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ 
                    fontSize: 18, 
                    fontWeight: 'bold', 
                    color: '#357a4c',
                    marginBottom: 8,
                    fontFamily: 'Montserrat-Bold'
                  }}>
                    Sabia que...
                  </Text>
                  {loadingKnowThat ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
                      <ActivityIndicator size="small" color="#357a4c" style={{ marginRight: 8 }} />
                      <Text style={{ 
                        fontSize: 14, 
                        color: '#5a8c6a',
                        fontFamily: 'Montserrat'
                      }}>
                        A carregar nova curiosidade...
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ 
                      fontSize: 14, 
                      color: '#5a8c6a',
                      lineHeight: 20,
                      fontFamily: 'Montserrat'
                    }}>
                      {knowThat.action || 'Descubra factos interessantes sobre a natureza'}
                    </Text>
                  )}
                  {knowThat.taxon_id && !loadingKnowThat && (
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      marginTop: 12,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopColor: '#e8f5e8'
                    }}>
                      <Ionicons name="arrow-forward-circle" size={16} color="#4CAF50" />
                      <Text style={{ 
                        marginLeft: 6, 
                        fontSize: 13, 
                        color: '#4CAF50', 
                        fontFamily: 'Montserrat-Bold'
                      }}>
                        Toque para saber mais sobre esta espécie
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={handleRefreshKnowThat}
                disabled={loadingKnowThat}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: '#f0f8f0',
                  opacity: loadingKnowThat ? 0.5 : 1
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons 
                  name="refresh" 
                  size={20} 
                  color="#357a4c" 
                  style={{
                    transform: loadingKnowThat ? [{ rotate: '360deg' }] : []
                  }}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>

          {/* BOTÃO PARA SUGESTÕES/RECOMENDAÇÕES */}
          <View style={{ marginTop: 24, marginHorizontal: 20 }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 20,
                alignItems: 'center',
                justifyContent: 'space-between',
                elevation: 3,
                shadowColor: '#357a4c',
                shadowOpacity: 0.1,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                borderWidth: 1,
                borderColor: '#e0f2cc',
              }}
              onPress={() => navigation.navigate('Recommendations')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={{
                  backgroundColor: '#e8fad7',
                  borderRadius: 12,
                  padding: 12,
                  marginRight: 16,
                  borderWidth: 1,
                  borderColor: '#c8f59d',
                }}>
                  <Ionicons name="bulb" size={24} color="#357a4c" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ 
                    fontSize: 18, 
                    fontWeight: 'bold', 
                    color: '#357a4c',
                    marginBottom: 4,
                    fontFamily: 'Montserrat-Bold'
                  }}>
                    Sugestões para si
                  </Text>
                  <Text style={{ 
                    fontSize: 14, 
                    color: '#5a8c6a',
                    lineHeight: 20,
                    fontFamily: 'Montserrat'
                  }}>
                    Descubra espécies personalizadas baseadas nos seus interesses
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#357a4c" />
            </TouchableOpacity>
          </View>

          {/* BLOCO DE RECOMENDAÇÕES RÁPIDAS */}
          <View style={{ marginTop: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 20, marginBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#357a4c' }}>
                Prévia de Recomendações
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Recommendations')}>
                <Text style={{ fontSize: 14, color: '#357a4c', fontWeight: '600' }}>Ver todas</Text>
              </TouchableOpacity>
            </View>
            {loadingRecommended ? (
              <ActivityIndicator size="small" color="#357a4c" style={{ marginLeft: 20 }} />
            ) : recommendedSpecies.length === 0 ? (
              <View style={{ marginHorizontal: 20, padding: 16, backgroundColor: '#f8f8f8', borderRadius: 12 }}>
                <Text style={{ color: '#888', textAlign: 'center' }}>Sem recomendações no momento.</Text>
                <Text style={{ color: '#666', textAlign: 'center', fontSize: 12, marginTop: 4 }}>
                  Explore espécies para receber sugestões personalizadas
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 16 }}>
                {recommendedSpecies.slice(0, 5).map((species, idx) => (
                  <TouchableOpacity
                    key={species.sci_name + idx}
                    style={{
                      width: 160,
                      marginRight: 16,
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      padding: 12,
                      elevation: 2,
                      borderWidth: 1,
                      borderColor: '#e0e0e0',
                    }}
                    onPress={() => navigation.navigate('SpeciesDetail', { 
                        taxon_id: species.taxon_id,
                        species: species,
                        group: species.group,
                        groupLabel: getGroupLabel(species.group)
                    })}
                  >
                    <View style={{ alignItems: 'center', marginBottom: 8 }}>
                      <Image
                        source={
                          species.image_square_url
                            ? { uri: species.image_square_url }
                            : require('../../assets/images/80x80_SemFoto.webp')
                        }
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 8,
                          backgroundColor: '#eee',
                        }}
                        resizeMode="cover"
                      />
                    </View>
                    <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#357a4c', textAlign: 'center' }} numberOfLines={2}>
                      {species.common_name || 'Sem nome comum'}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#888', textAlign: 'center', fontStyle: 'italic' }} numberOfLines={1}>
                      {species.sci_name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                      <GroupIcon icon={getGroupIcon(species.group)} size={12} />
                      <Text style={{ marginLeft: 4, color: '#666', fontSize: 10 }}>
                        {getGroupLabel(species.group) || 'Grupo'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>


        </ScrollView>
        <BottomTabBar navigation={navigation} active="Home" />
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
      </SafeAreaView>
    </PrivateScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#e8fad7',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 20,
    justifyContent: 'flex-end',
  },
  gradientBlock: {
    marginTop: 0,
    paddingTop: 22,
    paddingBottom: 32,
    paddingHorizontal: 20,
    minHeight: 120,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 26,
    fontFamily: 'Montserrat-Bold',
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Montserrat',
    marginTop: 2,
    opacity: 0.85,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 22,
    backgroundColor: '#e8fad7',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pkiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    marginTop: 0,
    marginBottom: 0,
    gap: 0,
  },
  pkiCardAlt: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#357a4c22',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pkiValueAlt: {
    fontSize: 26,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 2,
  },
  pkiLabelAlt: {
    fontSize: 13,
    color: '#357a4c',
    fontFamily: 'Montserrat',
    opacity: 0.85,
    textAlign: 'center',
  },
  cardsRow: {
    flexDirection: 'row',
    marginTop: 0,
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    width: (width - 60) / 2,
    elevation: 3,
    shadowColor: '#357a4c33',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'flex-start',
  },
  cardTitle: {
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    fontSize: 15,
    marginBottom: 6,
  },
  cardValue: {
    color: '#357a4c',
    fontFamily: 'Montserrat',
    fontSize: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 18,
  },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: (width - 80) / 3,
    elevation: 2,
    shadowColor: '#357a4c22',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  iconLabel: {
    marginTop: 8,
    color: '#357a4c',
    fontFamily: 'Montserrat',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default HomeScreen;