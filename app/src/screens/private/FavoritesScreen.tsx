import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Dimensions, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGroups } from '../../contexts/GroupsContext';
import PrivateScreen from '../../components/PrivateScreen';
import ScreenHeader from '../../components/ScreenHeader';
import BottomTabBar from '../../components/BottomTabBar';
import GroupIcon from '../../components/GroupIcon';
import { API_BASE_URL } from '../../../config';

const windowWidth = Dimensions.get('window').width;

type Favorite = {
  taxon_id: number;
  created_at: string;
};

type Species = {
  taxon_id: number;
  common_name: string;
  sci_name: string;
  image_url?: string;
  class?: string;
  group?: string;
  created_at?: string;
};

const SemFoto = require('../../assets/images/80x80_SemFoto.webp');

const FavoritesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [showSort, setShowSort] = useState(false);
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'recent'>('name-asc');
  const flatListRef = useRef<FlatList>(null);
  const { groups } = useGroups();

  // Buscar favoritos do utilizador
  useFocusEffect(
    React.useCallback(() => {
      const fetchFavorites = async () => {
        setLoading(true);
        try {
          const token = await AsyncStorage.getItem('token');
          const res = await fetch(`${API_BASE_URL}/api/favorites`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          setFavorites(data.favorites || []);
        } catch {
          setFavorites([]);
        }
        setLoading(false);
      };
      fetchFavorites();
    }, [])
  );

  // Buscar detalhes das espécies favoritas
  useEffect(() => {
    const fetchSpeciesDetails = async () => {
      if (!favorites.length) {
        setSpecies([]);
        return;
      }
      setLoading(true);
      try {
        const token = await AsyncStorage.getItem('token');
        const results = await Promise.all(
          favorites.map(async (fav) => {
            const res = await fetch(`${API_BASE_URL}/api/species/${fav.taxon_id}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return null;
            const data = await res.json();
            return {
              ...data,
              class: data.taxon_class_name || data.class || null,
              created_at: fav.created_at,
            };
          })
        );
        setSpecies(results.filter(Boolean));
      } catch {
        setSpecies([]);
      }
      setLoading(false);
    };
    fetchSpeciesDetails();
  }, [favorites]);

  // Obter rótulo do grupo
  const getGroupLabel = (groupId: string | undefined) => {
    if (!groupId) return '';
    const group = groups.find(g => g.id === groupId);
    return group ? group.label : groupId;
  };

  // Obter ícone do grupo
  const getGroupIcon = (groupId: string | undefined) => {
    if (!groupId) return 'taxon-default';
    const group = groups.find(g => g.id === groupId);
    return group && typeof group.icon === 'string' ? group.icon : 'taxon-default';
  };

  // Alternar modo de visualização
  const toggleViewMode = () => setViewMode(viewMode === 'list' ? 'grid' : 'list');

  // Ordenação dos favoritos
  const sortedSpecies = [...species];
  if (sort === 'name-asc') {
    sortedSpecies.sort((a, b) => (a.common_name || '').localeCompare(b.common_name || ''));
  } else if (sort === 'name-desc') {
    sortedSpecies.sort((a, b) => (b.common_name || '').localeCompare(a.common_name || ''));
  } else if (sort === 'recent') {
    sortedSpecies.sort((a, b) =>
      new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    );
  }

  // Renderização de cada espécie
  const renderItem = ({ item }: { item: Species }) => (
    <TouchableOpacity
      style={viewMode === 'list' ? styles.listItem : styles.gridItem}
      onPress={() => navigation.navigate('SpeciesDetail', { taxon_id: item.taxon_id })}
      activeOpacity={0.85}
    >
      <Image
        source={item.image_url ? { uri: item.image_url } : SemFoto}
        style={viewMode === 'list' ? styles.listThumb : styles.gridThumb}
      />
      <View style={viewMode === 'list' ? styles.listInfo : styles.gridInfo}>
        <Text style={viewMode === 'list' ? styles.listCommon : styles.gridCommon}>
          {item.common_name || 'Sem nome comum'}
        </Text>
        <Text style={viewMode === 'list' ? styles.listSci : styles.gridSci}>{item.sci_name}</Text>
        {item.group && (
          <View style={viewMode === 'list' ? styles.classBadgeList : styles.classBadgeGrid}>
            <GroupIcon icon={getGroupIcon(item.group) as any} size={13} color="#357a4c" style={{ marginRight: 3 }} />
            <Text style={styles.classBadgeText}>{getGroupLabel(item.group)}</Text>
          </View>
        )}
        {item.created_at && (
          <Text style={styles.dateText}>
            Favorito desde: {new Date(item.created_at).toLocaleDateString()}
          </Text>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={22}
        color="#357a4c"
        style={viewMode === 'list' ? styles.listChevron : styles.gridChevron}
      />
    </TouchableOpacity>
  );

  return (
    <PrivateScreen navigation={navigation}>
      <LinearGradient colors={['#eafbe6', '#f8fff6']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
          <ScreenHeader
            title="Favoritos"
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setShowSort(true)} style={styles.toggleBtn}>
                  <Ionicons name="swap-vertical" size={24} color="#205c37" />
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleViewMode} style={styles.toggleBtn}>
                  <Ionicons
                    name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
                    size={26}
                    color="#205c37"
                  />
                </TouchableOpacity>
              </View>
            }
          />
          <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 8 }}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#357a4c" />
              </View>
            ) : sortedSpecies.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="heart-outline" size={54} color="#bdbdbd" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyText}>Ainda não tem espécies favoritas.</Text>
                <Text style={styles.emptySubText}>Toque no coração em qualquer espécie para adicionar como favorito.</Text>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={sortedSpecies}
                key={viewMode}
                keyExtractor={(item: Species) => item.taxon_id.toString()}
                renderItem={renderItem}
                numColumns={viewMode === 'grid' ? 2 : 1}
                columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
                contentContainerStyle={{ paddingBottom: 74 }}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
          <BottomTabBar navigation={navigation} active="Favorites" />
        </SafeAreaView>
        {/* Modal de ordenação */}
        <Modal visible={showSort} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Ordenar por</Text>
              <TouchableOpacity onPress={() => { setSort('name-asc'); setShowSort(false); }}>
                <Text style={sort === 'name-asc' ? styles.modalOptionActive : styles.modalOption}>Nome (A-Z)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSort('name-desc'); setShowSort(false); }}>
                <Text style={sort === 'name-desc' ? styles.modalOptionActive : styles.modalOption}>Nome (Z-A)</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSort('recent'); setShowSort(false); }}>
                <Text style={sort === 'recent' ? styles.modalOptionActive : styles.modalOption}>Mais recentes</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowSort(false)}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </PrivateScreen>
  );
};

const styles = StyleSheet.create({
  // List styles
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    padding: 10,
    elevation: 2,
    shadowColor: '#357a4c',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  listThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#eafbe6',
  },
  listInfo: {
    flex: 1,
    marginLeft: 12,
  },
  listCommon: {
    fontSize: 16,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
  },
  listSci: {
    fontSize: 13,
    color: '#245c36',
    fontFamily: 'Montserrat-Thin',
  },
  listChevron: {
    marginLeft: 8,
  },
  // Grid styles
  gridItem: {
    width: (windowWidth - 18 * 2 - 12) / 2,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 14,
    padding: 10,
    elevation: 2,
    shadowColor: '#357a4c',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'center',
  },
  gridThumb: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#eafbe6',
    marginBottom: 10,
  },
  gridInfo: {
    alignItems: 'center',
    marginBottom: 4,
  },
  gridCommon: {
    fontSize: 15,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    textAlign: 'center',
  },
  gridSci: {
    fontSize: 12,
    color: '#245c36',
    fontFamily: 'Montserrat-Thin',
    textAlign: 'center',
  },
  gridChevron: {
    position: 'absolute',
    right: 10,
    top: 10,
  },
  // Badge styles
  classBadgeList: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eafbe6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  classBadgeGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#eafbe6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 6,
    marginBottom: 2,
  },
  classBadgeText: {
    fontSize: 13,
    color: '#205c37',
    fontFamily: 'Montserrat-Bold',
  },
  dateText: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    fontFamily: 'Montserrat-Thin',
  },
  // Misc styles
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#888',
    fontFamily: 'Montserrat',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eafbe6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0006'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    minWidth: 220
  },
  modalTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 16,
    marginBottom: 12,
    color: '#357a4c'
  },
  modalOption: {
    padding: 8,
    color: '#222',
    fontFamily: 'Montserrat-Thin'
  },
  modalOptionActive: {
    padding: 8,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold'
  },
  modalCancel: {
    padding: 8,
    color: '#888',
    textAlign: 'right'
  },
});

export default FavoritesScreen;