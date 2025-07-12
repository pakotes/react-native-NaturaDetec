import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PrivateScreen from '../../components/PrivateScreen';
import ScreenHeader from '../../components/ScreenHeader';
import BottomTabBar from '../../components/BottomTabBar';
import RecommendedSpeciesItem from '../../components/RecommendedSpeciesItem';
import { useRecommendations, Species } from '../../contexts/RecommendationsContext';
import { useGroups } from '../../contexts/GroupsContext';

const RecommendationsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { 
    recommendedSpecies, 
    userInsights,
    loading, 
    error,
    getPersonalizedRecommendations,
    getCollaborativeRecommendations,
    getHybridRecommendations,
    getUserInsights,
    recordUserInteraction
  } = useRecommendations();
  const { groups } = useGroups();
  
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'personalized' | 'collaborative' | 'hybrid'>('personalized');
  const [collaborativeSpecies, setCollaborativeSpecies] = useState<Species[]>([]);
  const [hybridSpecies, setHybridSpecies] = useState<Species[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalContent, setInfoModalContent] = useState({ title: '', description: '', details: '' });

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

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      await getUserInsights();
    } catch (error) {
      console.error('Erro ao carregar insights:', error);
    } finally {
      setInsightsLoading(false);
    }
  };

  const loadRecommendations = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    if (!forceRefresh) setTabLoading(true);
    
    try {
      switch (selectedTab) {
        case 'personalized':
          await getPersonalizedRecommendations(20);
          break;
        case 'collaborative':
          try {
            const collaborative = await getCollaborativeRecommendations(20);
            setCollaborativeSpecies(collaborative);
          } catch (collabError) {
            console.warn('Erro ao buscar recomendações colaborativas:', collabError);
            setCollaborativeSpecies([]);
          }
          break;
        case 'hybrid':
          try {
            const hybrid = await getHybridRecommendations(20);
            setHybridSpecies(hybrid);
          } catch (hybridError) {
            console.warn('Erro ao buscar recomendações híbridas:', hybridError);
            setHybridSpecies([]);
          }
          break;
      }
      
      // Carrega insights apenas se for refresh manual ou se ainda não foram carregados
      if (forceRefresh || !userInsights) {
        loadInsights();
      }
    } catch (err) {
      console.error('Erro ao carregar recomendações:', err);
    } finally {
      if (forceRefresh) setRefreshing(false);
      if (!forceRefresh) setTabLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadRecommendations();
    }, [selectedTab])
  );

  // Carregar insights apenas uma vez na montagem do componente
  useEffect(() => {
    if (!userInsights) {
      loadInsights();
    }
  }, []);

  const handleSpeciesPress = async (species: Species) => {
    // Registra a interação
    await recordUserInteraction(species.taxon_id, 'click');
    
    // Navega para os detalhes
    navigation.navigate('SpeciesDetail', { 
      taxon_id: species.taxon_id,
      species: species,
      group: species.group,
      groupLabel: species.group
    });
  };

  const getCurrentSpecies = (): Species[] => {
    switch (selectedTab) {
      case 'personalized':
        return recommendedSpecies;
      case 'collaborative':
        return collaborativeSpecies;
      case 'hybrid':
        return hybridSpecies;
      default:
        return [];
    }
  };

  const renderTabButton = (tab: typeof selectedTab, title: string, icon: string, description: string) => {
    const isActive = selectedTab === tab;
    
    const showInfo = () => {
      let details = '';
      switch (tab) {
        case 'personalized':
          details = 'Utiliza as suas preferências pessoais, histórico de visualizações, favoritos e interações para sugerir espécies que mais se adequam ao seu perfil de interesse.';
          break;
        case 'collaborative':
          details = 'Analisa utilizadores com gostos similares aos seus e recomenda espécies que foram apreciadas por pessoas com perfis semelhantes.';
          break;
        case 'hybrid':
          details = 'Combina algoritmos personalizados e colaborativos para oferecer recomendações mais precisas e diversificadas.';
          break;
      }
      
      setInfoModalContent({
        title,
        description,
        details
      });
      setShowInfoModal(true);
    };

    return (
      <TouchableOpacity
        style={[styles.horizontalTabButton, isActive && styles.horizontalTabButtonActive]}
        onPress={() => {
          if (selectedTab !== tab) {
            setSelectedTab(tab);
          }
        }}
        activeOpacity={0.8}
        disabled={tabLoading}
      >
        <View style={[styles.horizontalTabIconContainer, isActive && styles.horizontalTabIconContainerActive]}>
          <Ionicons 
            name={icon as any} 
            size={20} 
            color={isActive ? '#fff' : '#357a4c'} 
          />
        </View>
        
        <View style={styles.horizontalTabContent}>
          <Text style={[styles.horizontalTabTitle, isActive && styles.horizontalTabTitleActive]}>
            {title}
          </Text>
          <Text style={[styles.horizontalTabDescription, isActive && styles.horizontalTabDescriptionActive]}>
            {description}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.horizontalInfoButton}
          onPress={showInfo}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="help-circle-outline" size={20} color={isActive ? '#357a4c' : '#999'} />
        </TouchableOpacity>
        
        {isActive && (
          <View style={styles.horizontalActiveIndicator}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderInsightsCard = () => {
    const showInsightInfo = (type: 'interactions' | 'preference' | 'groups') => {
      let title = '';
      let description = '';
      let details = '';
      
      switch (type) {
        case 'interactions':
          title = 'Total de Interações';
          description = 'Atividade geral na aplicação';
          details = 'Conta todas as suas ações na aplicação: visualizações de espécies, pesquisas realizadas, cliques em recomendações, identificações de fotos e outras interações. Quanto maior o número, mais ativo você é na plataforma.';
          break;
        case 'preference':
          title = 'Score de Preferência';
          description = 'Nível de engagement personalizado';
          details = 'Calcula a qualidade das suas interações com base em pesos: favoritos (peso 5), identificações (peso 3), cliques (peso 2) e visualizações (peso 1). Um score alto indica que você interage profundamente com o conteúdo.';
          break;
        case 'groups':
          title = 'Grupos Favoritos';
          description = 'Diversidade de interesses';
          details = 'Mostra quantos grupos taxonómicos diferentes (Aves, Mamíferos, Plantas, etc.) você tem nos seus favoritos. Maior diversidade indica interesse abrangente na natureza.';
          break;
      }
      
      setInfoModalContent({ title, description, details });
      setShowInfoModal(true);
    };

    return (
      <View style={styles.insightsCard}>
        <View style={styles.insightsHeader}>
          <Ionicons name="analytics-outline" size={24} color="#357a4c" />
          <Text style={styles.insightsTitle}>Os meus insights</Text>
          <TouchableOpacity 
            onPress={() => {
              loadInsights();
            }}
            style={styles.refreshInsightsButton}
          >
            <Ionicons name="refresh-outline" size={16} color="#357a4c" />
          </TouchableOpacity>
        </View>
        
        {insightsLoading ? (
          <View style={styles.insightsLoadingContainer}>
            <ActivityIndicator size="small" color="#357a4c" />
            <Text style={styles.insightsLoadingText}>A carregar insights...</Text>
          </View>
        ) : userInsights ? (
          <View style={styles.insightsRow}>
            <View style={styles.insightItem}>
              <View style={styles.insightIconContainer}>
                <Ionicons name="finger-print-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.insightNumber}>{userInsights?.total_interactions || 0}</Text>
              <View style={styles.insightLabelContainer}>
                <Text style={styles.insightLabel}>Interações</Text>
                <TouchableOpacity 
                  onPress={() => showInsightInfo('interactions')}
                  style={styles.insightInfoButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="help-circle-outline" size={14} color="#999" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.insightItem}>
              <View style={styles.insightIconContainer}>
                <Ionicons name="heart-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.insightNumber}>
                {Math.round((userInsights?.preference_score || 0) * 100)}%
              </Text>
              <View style={styles.insightLabelContainer}>
                <Text style={styles.insightLabel}>Preferência</Text>
                <TouchableOpacity 
                  onPress={() => showInsightInfo('preference')}
                  style={styles.insightInfoButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="help-circle-outline" size={14} color="#999" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.insightItem}>
              <View style={styles.insightIconContainer}>
                <Ionicons name="library-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.insightNumber}>{userInsights?.favorite_groups?.length || 0}</Text>
              <View style={styles.insightLabelContainer}>
                <Text style={styles.insightLabel}>Grupos favoritos</Text>
                <TouchableOpacity 
                  onPress={() => showInsightInfo('groups')}
                  style={styles.insightInfoButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="help-circle-outline" size={14} color="#999" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.insightsEmptyContainer}>
            <Ionicons name="analytics-outline" size={32} color="#ccc" />
            <Text style={styles.insightsEmptyText}>
              Explore espécies para gerar insights personalizados
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="leaf-outline" size={64} color="#ccc" />
      <Text style={styles.emptyTitle}>Nenhuma recomendação ainda</Text>
      <Text style={styles.emptyText}>
        Explore mais espécies para receber recomendações personalizadas
      </Text>
    </View>
  );

  return (
    <PrivateScreen navigation={navigation}>
      <LinearGradient colors={['#eafbe6', '#f8fff6']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
          <ScreenHeader title="Recomendações" />
          
          <ScrollView
            style={[styles.container]}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }} // Espaço otimizado para o footer
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadRecommendations(true)}
                colors={['#357a4c']}
                tintColor="#357a4c"
              />
            }
          >
            {/* Insights do usuário */}
            {renderInsightsCard()}

            {/* Abas de tipo de recomendação */}
            <View style={styles.horizontalTabsContainer}>
              {renderTabButton('personalized', 'Personalizadas', 'sparkles-outline', 'Baseadas nas suas preferências')}
              {renderTabButton('collaborative', 'Colaborativas', 'people-circle-outline', 'Baseadas em utilizadores similares')}
              {renderTabButton('hybrid', 'Híbridas', 'diamond-outline', 'Combinação de algoritmos')}
            </View>

            {/* Loading state */}
            {(loading || tabLoading) && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#357a4c" />
                <Text style={styles.loadingText}>
                  {tabLoading ? 'A carregar...' : 'A carregar recomendações...'}
                </Text>
              </View>
            )}

            {/* Error state */}
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="warning-outline" size={24} color="#d32f2f" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => loadRecommendations(true)}
                >
                  <Text style={styles.retryButtonText}>Tentar novamente</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Lista de recomendações */}
            {!loading && !tabLoading && !error && (
              <View style={styles.recommendationsList}>
                {getCurrentSpecies().length > 0 ? (
                  getCurrentSpecies().map((species, index) => (
                    <RecommendedSpeciesItem
                      key={`${species.taxon_id}-${index}`}
                      item={species}
                      onPress={() => handleSpeciesPress(species)}
                      label={getGroupLabel(species.group)}
                      groupIcon={getGroupIcon(species.group)}
                      recommendationId={`${selectedTab}-${species.taxon_id}-${Date.now()}`}
                    />
                  ))
                ) : (
                  renderEmptyState()
                )}
              </View>
            )}
          </ScrollView>
          
          <BottomTabBar navigation={navigation} active="Recommendations" />
        </SafeAreaView>

        {/* Modal informativo */}
        <Modal
          visible={showInfoModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowInfoModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.infoModalContainer}>
              <View style={styles.infoModalHeader}>
                <Ionicons name="information-circle" size={28} color="#357a4c" />
                <Text style={styles.infoModalTitle}>{infoModalContent.title}</Text>
                <TouchableOpacity 
                  style={styles.closeModalButton}
                  onPress={() => setShowInfoModal(false)}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.infoModalSubtitle}>{infoModalContent.description}</Text>
              <Text style={styles.infoModalDetails}>{infoModalContent.details}</Text>
              
              <TouchableOpacity 
                style={styles.modalActionButton}
                onPress={() => setShowInfoModal(false)}
              >
                <Text style={styles.modalActionButtonText}>Entendi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </PrivateScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
  },
  insightsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginVertical: 12,
    elevation: 4,
    shadowColor: '#357a4c',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#e8f5e8',
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginLeft: 8,
  },
  refreshInsightsButton: {
    padding: 4,
    marginLeft: 8,
  },
  insightsLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  insightsLoadingText: {
    fontSize: 13,
    fontFamily: 'Montserrat',
    color: '#666',
    marginTop: 8,
  },
  insightsEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  insightsEmptyText: {
    fontSize: 13,
    fontFamily: 'Montserrat',
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  insightsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  insightItem: {
    alignItems: 'center',
    flex: 1,
  },
  insightIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#357a4c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#357a4c',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  insightNumber: {
    fontSize: 22,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 2,
  },
  insightLabel: {
    fontSize: 11,
    fontFamily: 'Montserrat',
    color: '#666',
    textAlign: 'center',
  },
  insightLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  insightInfoButton: {
    marginLeft: 4,
    padding: 2,
  },
  tabsContainer: {
    marginVertical: 16,
    gap: 12,
  },
  // Novos estilos para tabs horizontais compactos
  horizontalTabsContainer: {
    marginVertical: 8,
    gap: 6,
  },
  horizontalTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 3,
    shadowColor: '#357a4c',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 1,
    borderColor: '#e8f5e8',
    position: 'relative',
  },
  horizontalTabButtonActive: {
    backgroundColor: '#f8fff6',
    borderColor: '#357a4c',
    borderWidth: 2,
    elevation: 6,
    shadowOpacity: 0.18,
    shadowRadius: 15,
    transform: [{ scale: 1.01 }],
  },
  horizontalTabIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    elevation: 1,
    shadowColor: '#357a4c',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  horizontalTabIconContainerActive: {
    backgroundColor: '#357a4c',
    elevation: 3,
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  horizontalTabContent: {
    flex: 1,
    marginRight: 8,
  },
  horizontalTabTitle: {
    fontSize: 15,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 2,
  },
  horizontalTabTitleActive: {
    color: '#2d6b3e',
  },
  horizontalTabDescription: {
    fontSize: 12,
    fontFamily: 'Montserrat',
    color: '#666',
    lineHeight: 16,
  },
  horizontalTabDescriptionActive: {
    color: '#5a8a6a',
  },
  horizontalInfoButton: {
    padding: 6,
    marginLeft: 4,
  },
  horizontalActiveIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    elevation: 2,
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Estilos do modal informativo
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  infoModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoModalTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginLeft: 12,
    flex: 1,
  },
  closeModalButton: {
    padding: 4,
  },
  infoModalSubtitle: {
    fontSize: 14,
    fontFamily: 'Montserrat',
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  infoModalDetails: {
    fontSize: 15,
    fontFamily: 'Montserrat',
    color: '#333',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalActionButton: {
    backgroundColor: '#357a4c',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalActionButtonText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    color: '#fff',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    elevation: 3,
    shadowColor: '#357a4c',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 1.5,
    borderColor: '#e8f5e8',
    position: 'relative',
    marginBottom: 4,
  },
  tabButtonActive: {
    backgroundColor: '#f8fff6',
    borderColor: '#357a4c',
    elevation: 8,
    shadowOpacity: 0.25,
    shadowRadius: 15,
    transform: [{ scale: 1.02 }],
  },
  tabIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
    elevation: 1,
    shadowColor: '#357a4c',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  tabIconContainerActive: {
    backgroundColor: '#357a4c',
    elevation: 3,
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  tabContent: {
    flex: 1,
  },
  tabButtonText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 4,
  },
  tabButtonTextActive: {
    color: '#357a4c',
  },
  tabDescription: {
    fontSize: 13,
    fontFamily: 'Montserrat',
    color: '#666',
    lineHeight: 18,
  },
  tabDescriptionActive: {
    color: '#5a8a6a',
  },
  tabSelectedIndicator: {
    position: 'absolute',
    right: 24,
    top: '50%',
    marginTop: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    elevation: 2,
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    alignItems: 'center',
    justifyContent: 'center',
  },
  descriptionContainer: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: 'Montserrat',
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Montserrat',
    color: '#357a4c',
    marginTop: 16,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Montserrat',
    color: '#d32f2f',
    textAlign: 'center',
    marginVertical: 16,
  },
  retryButton: {
    backgroundColor: '#357a4c',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    color: '#fff',
  },
  recommendationsList: {
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Montserrat',
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default RecommendationsScreen;
