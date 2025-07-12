import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Dimensions, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../../config';
import PrivateScreen from '../../components/PrivateScreen';
import { useAuth } from '../../contexts/AuthContext';
import { useRecommendations, Species } from '../../contexts/RecommendationsContext';
import { useGroups } from '../../contexts/GroupsContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AlertNotification from '../../components/AlertNotification';
import BotIcon from '../../assets/images/BotIcon.svg';
import Markdown from 'react-native-markdown-display';

const windowWidth = Dimensions.get('window').width;

const TABS = [
    { key: 'desc', label: 'Descrição', icon: 'document-text-outline' },
    { key: 'tax', label: 'Classificação', icon: 'git-branch-outline' },
    { key: 'dist', label: 'Distribuição', icon: 'earth-outline' },
    { key: 'rating', label: 'Avaliação', icon: 'star-outline' },
];

const SpeciesDetailScreen = ({ route, navigation }: any) => {
    const { setIsAuthenticated } = useAuth();
    const { getContentBasedRecommendations, recordUserInteraction } = useRecommendations();
    const { groups } = useGroups();
    const { taxon_id, species: passedSpecies, group, groupLabel } = route.params;
    const [species, setSpecies] = useState<any>(passedSpecies || null);
    const [loading, setLoading] = useState(!passedSpecies); // Só carrega se não tiver dados passados
    const [alert, setAlert] = useState<any>(null);
    const [selectedTab, setSelectedTab] = useState('desc');
    const [llmLoading, setLlmLoading] = useState(false);
    const [llmError, setLlmError] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(true);
    const [isFavorite, setIsFavorite] = useState(false);
    const [favoriteLoading, setFavoriteLoading] = useState(false);
    const [sendingToRag, setSendingToRag] = useState(false);
    const [ragResult, setRagResult] = useState<string | null>(null);
    const [relatedSpecies, setRelatedSpecies] = useState<Species[]>([]);
    const [loadingRelated, setLoadingRelated] = useState(false);
    const [showRelatedSection, setShowRelatedSection] = useState(false);
    const [relatedError, setRelatedError] = useState<string | null>(null);
    
    // Estados para distribuição geográfica
    const [distributionData, setDistributionData] = useState<any>(null);
    const [loadingDistribution, setLoadingDistribution] = useState(false);
    const [distributionError, setDistributionError] = useState<string | null>(null);

    // Estados para avaliação de espécies
    const [userRating, setUserRating] = useState<number>(0);
    const [userComment, setUserComment] = useState<string>('');
    const [ratingStats, setRatingStats] = useState<any>(null);
    const [loadingRating, setLoadingRating] = useState(false);
    const [savingRating, setSavingRating] = useState(false);
    const [ratingError, setRatingError] = useState<string | null>(null);
    const [hasUserRating, setHasUserRating] = useState(false);

    // Estado para controlar se já tentámos carregar dados completos
    const [fullDetailsAttempted, setFullDetailsAttempted] = useState(false);

    // Função para carregar detalhes completos quando necessário
    const loadFullDetails = async () => {
        if (species && !fullDetailsAttempted) {
            setFullDetailsAttempted(true);
            
            // Verificar se precisa carregar dados específicos
            const needsDescription = !species.description || species.description === null || species.description.trim() === '';
            const needsNames = !species.all_names;
            const needsFullData = needsDescription || needsNames;
            
            if (needsFullData) {
                try {
                    const token = await AsyncStorage.getItem('token');
                    const res = await fetch(`${API_BASE_URL}/api/species/${taxon_id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const fullData = await res.json();
                        setSpecies((prevSpecies: any) => ({
                            ...prevSpecies,
                            ...fullData
                        }));
                    }
                } catch (error) {
                    console.error('Erro ao carregar detalhes completos:', error);
                }
            }
        }
    };

    // Função para carregar dados de distribuição geográfica
    const loadDistributionData = async () => {
        if (!species || !species.taxon_id || loadingDistribution) return;
        
        setLoadingDistribution(true);
        setDistributionError(null);
        
        try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/species/${species.taxon_id}/distribution`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                setDistributionData(data);
            } else {
                throw new Error('Erro ao carregar distribuição');
            }
        } catch (error) {
            console.error('Erro ao carregar distribuição:', error);
            setDistributionError('Não foi possível carregar dados de distribuição');
        } finally {
            setLoadingDistribution(false);
        }
    };

    // Função para carregar dados de avaliação do usuário e estatísticas
    const loadRatingData = async () => {
        if (!species || !species.taxon_id || loadingRating) return;
        
        setLoadingRating(true);
        setRatingError(null);
        
        try {
            const token = await AsyncStorage.getItem('token');
            
            // Carregar avaliação do usuário e estatísticas em paralelo
            const [userRatingRes, statsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/species/${species.taxon_id}/rating`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_BASE_URL}/api/species/${species.taxon_id}/rating/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);
            
            if (userRatingRes.ok) {
                const userData = await userRatingRes.json();
                setHasUserRating(userData.hasRating);
                setUserRating(userData.rating || 0);
                setUserComment(userData.comment || '');
            }
            
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setRatingStats(statsData);
            }
        } catch (error) {
            console.error('Erro ao carregar avaliações:', error);
            setRatingError('Não foi possível carregar dados de avaliação');
        } finally {
            setLoadingRating(false);
        }
    };

    // Função para salvar avaliação do usuário
    const saveRating = async (rating: number, comment: string = '') => {
        if (!species || !species.taxon_id || savingRating) return;
        
        setSavingRating(true);
        
        try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/species/${species.taxon_id}/rating`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ rating, comment })
            });
            
            if (res.ok) {
                const data = await res.json();
                setHasUserRating(true);
                setUserRating(rating);
                setUserComment(comment);
                
                // Recarregar estatísticas apenas da parte estatística
                const statsRes = await fetch(`${API_BASE_URL}/api/species/${species.taxon_id}/rating/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    setRatingStats(statsData);
                }
                
                setAlert({ 
                    type: 'SUCCESS', 
                    title: 'Avaliação guardada', 
                    textBody: data.message || 'A sua avaliação foi guardada com sucesso!' 
                });
            } else {
                throw new Error('Erro ao salvar avaliação');
            }
        } catch (error) {
            console.error('Erro ao salvar avaliação:', error);
            setAlert({ 
                type: 'DANGER', 
                title: 'Erro', 
                textBody: 'Não foi possível guardar a avaliação' 
            });
        } finally {
            setSavingRating(false);
        }
    };

    // Função para remover avaliação do usuário
    const deleteRating = async () => {
        if (!species || !species.taxon_id || savingRating) return;
        
        setSavingRating(true);
        
        try {
            const token = await AsyncStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/api/species/${species.taxon_id}/rating`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                setHasUserRating(false);
                setUserRating(0);
                setUserComment('');
                
                // Recarregar estatísticas
                const statsRes = await fetch(`${API_BASE_URL}/api/species/${species.taxon_id}/rating/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    setRatingStats(statsData);
                }
                
                setAlert({ 
                    type: 'SUCCESS', 
                    title: 'Avaliação removida', 
                    textBody: 'A sua avaliação foi removida com sucesso!' 
                });
            } else {
                throw new Error('Erro ao remover avaliação');
            }
        } catch (error) {
            console.error('Erro ao remover avaliação:', error);
            setAlert({ 
                type: 'DANGER', 
                title: 'Erro', 
                textBody: 'Não foi possível remover a avaliação' 
            });
        } finally {
            setSavingRating(false);
        }
    };

    // Fetch species data - só busca se não tiver dados passados na navegação
    useEffect(() => {
        const fetchSpecies = async () => {
            // Se já temos dados básicos passados, só carrega os detalhes extra se necessário
            if (passedSpecies && passedSpecies.common_name && passedSpecies.sci_name) {
                setLoading(false);
                // Registra a interação imediatamente (sem await para não bloquear)
                if (passedSpecies.taxon_id) {
                    AsyncStorage.getItem('token').then(token => {
                        fetch(`${API_BASE_URL}/api/user/history`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ taxon_id: passedSpecies.taxon_id, action: 'view' }),
                        }).catch(err => console.warn('Erro ao registrar histórico:', err));
                    });
                }
                return;
            }

            
            setLoading(true);
            try {
                const token = await AsyncStorage.getItem('token');
                const res = await fetch(`${API_BASE_URL}/api/species/${taxon_id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.status === 401) {
                    setAlert({
                        type: 'danger',
                        title: 'Sessão expirada',
                        textBody: 'Por favor, faça login novamente.'
                    });
                    setIsAuthenticated(false);
                    setLoading(false);
                    return;
                }
                const data = await res.json();
                setSpecies(data);
                // Registra histórico (sem await para não bloquear)
                if (data && data.taxon_id) {
                    fetch(`${API_BASE_URL}/api/user/history`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ taxon_id: data.taxon_id, action: 'view' }),
                    }).catch(err => console.warn('Erro ao registrar histórico:', err));
                }
            } catch (error) {
                console.error('Erro ao carregar espécie:', error);
                setSpecies(null);
            }
            setLoading(false);
        };
        // Limpar recomendações da espécie anterior quando mudar de espécie
        setRelatedSpecies([]);
        setRelatedError(null);
        setLoadingRelated(false);
        setShowRelatedSection(false);
        // Reset do ref para permitir novas chamadas
        lastRecommendationSpeciesRef.current = null;
        
        // Limpar dados de distribuição da espécie anterior
        setDistributionData(null);
        setDistributionError(null);
        setLoadingDistribution(false);
        
        // Limpar dados de avaliação da espécie anterior
        setUserRating(0);
        setUserComment('');
        setRatingStats(null);
        setLoadingRating(false);
        setRatingError(null);
        setHasUserRating(false);
        
        // Reset do flag de carregamento de detalhes completos
        setFullDetailsAttempted(false);
        
        fetchSpecies();
    }, [taxon_id]); // Apenas taxon_id como dependência

    // Carregar detalhes completos quando necessário (especialmente para tabs que precisam de mais dados)
    useEffect(() => {
        if (species && selectedTab === 'desc' && !fullDetailsAttempted) {
            // Para tab de descrição: carregar se não houver descrição válida
            const needsDescriptionData = !species.description || species.description === null || species.description.trim() === '';
            
            if (needsDescriptionData) {
                loadFullDetails();
            } else {
                setFullDetailsAttempted(true); // Marcar como tentado se já temos dados
            }
        }
        
        // Para tab de distribuição: carregar dados de distribuição se ainda não foram carregados
        if (species && selectedTab === 'dist' && !distributionData && !loadingDistribution) {
            loadDistributionData();
        }
        
        // Para tab de avaliação: carregar dados de avaliação se ainda não foram carregados
        if (species && selectedTab === 'rating' && !loadingRating && !ratingStats) {
            loadRatingData();
        }
    }, [selectedTab, species, fullDetailsAttempted]);

    // Ref para evitar chamadas duplicadas de recomendações
    const lastRecommendationSpeciesRef = useRef<number | null>(null);

    // Função centralizada para carregar espécies relacionadas
    const loadRelatedSpecies = useCallback(async (speciesData: any) => {
        if (!speciesData || !speciesData.taxon_id) {
            setRelatedSpecies([]);
            setRelatedError(null);
            setLoadingRelated(false);
            setShowRelatedSection(false);
            return;
        }

        // Evitar chamadas duplicadas para a mesma espécie
        if (lastRecommendationSpeciesRef.current === speciesData.taxon_id) {
            return;
        }

        lastRecommendationSpeciesRef.current = speciesData.taxon_id;

        // Limpar estado anterior primeiro
        setRelatedSpecies([]);
        setRelatedError(null);
        setLoadingRelated(true);
        setShowRelatedSection(true);
        
        // Simular um tempo mínimo de loading para melhor UX
        const minLoadingTime = new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            // Registra que o usuário visualizou esta espécie (sem bloquear se falhar)
            try {
                await recordUserInteraction(speciesData.taxon_id, 'view');
            } catch (error) {
                console.warn('Falha ao registrar interação, mas continuando:', error);
            }
            
            // Busca espécies relacionadas baseadas no conteúdo
            const [related] = await Promise.all([
                getContentBasedRecommendations(speciesData.taxon_id, 5, speciesData.group),
                minLoadingTime
            ]);
            
            // Ordenar por similaridade (descendente) se houver propriedade confidence
            const sortedRelated = related
                .filter(item => item) // Remove itens nulos/undefined
                .sort((a, b) => {
                    const confidenceA = a.confidence || 0;
                    const confidenceB = b.confidence || 0;
                    return confidenceB - confidenceA; // Ordem descendente
                });
            
            setRelatedSpecies(sortedRelated);
            
            // Se não conseguir carregar recomendações, mostra mensagem de erro mas mantém a seção
            if (sortedRelated.length === 0) {
                setRelatedError('Não foi possível carregar recomendações no momento');
            }
        } catch (error) {
            await minLoadingTime; // Esperar tempo mínimo mesmo com erro
            console.error('Erro ao carregar espécies relacionadas:', error);
            setRelatedError('Erro ao carregar recomendações');
            setRelatedSpecies([]); // Define array vazio em caso de erro
        } finally {
            setLoadingRelated(false);
        }
    }, [getContentBasedRecommendations, recordUserInteraction]);

    // Carregar espécies relacionadas após carregar a espécie principal
    useEffect(() => {
        if (species && species.taxon_id) {
            loadRelatedSpecies(species);
        }
    }, [species?.taxon_id, loadRelatedSpecies]); // Incluir loadRelatedSpecies como dependência

    // Função para gerar descrição via LLM (chamada manual pelo utilizador)
    const generateLLMDescription = async () => {
        if (!species || llmLoading) return;
        
        setLlmLoading(true);
        setLlmError(null);
        setRagResult(null); // Limpar resultado anterior do RAG
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/llm2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: `Gera uma breve descrição científica e acessível, em português de Portugal, para a espécie "${species.common_name}" (${species.sci_name}), pertencente à família ${species.family || ''}.`
                }),
            });
            
            const data = await response.json();
            
            if (data.response) {
                setSpecies((prev: any) => ({
                    ...prev,
                    description: data.response,
                    description_generated: true,
                }));
                setLlmError(null);
            } else {
                console.error('LLM erro na resposta:', data.error);
                setLlmError(data.error || 'Não foi possível obter uma descrição.');
            }
        } catch (error) {
            console.error('LLM erro na requisição:', error);
            setLlmError('Ocorreu um erro ao contactar a IA.');
        } finally {
            setLlmLoading(false);
        }
    };

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

    const handleRelatedSpeciesPress = async (relatedSpecies: Species) => {
        // Registra a interação (sem bloquear se falhar)
        try {
            await recordUserInteraction(relatedSpecies.taxon_id, 'click');
        } catch (error) {
            console.warn('Falha ao registrar interação, mas continuando:', error);
        }
        
        // Navega para os detalhes da espécie relacionada com os dados disponíveis
        navigation.push('SpeciesDetail', { 
            taxon_id: relatedSpecies.taxon_id,
            species: relatedSpecies,
            group: relatedSpecies.group,
            groupLabel: relatedSpecies.group
        });
    };
    const LLMButton = ({ onPress, icon, label }: { onPress: () => void, icon: any, label: string }) => (
        <Pressable style={styles.refreshBtn} onPress={onPress}>
            <View style={styles.refreshBtnInner}>
                <Ionicons name={icon} size={18} color="#205c37" />
                <Text style={styles.refreshBtnText}>{label}</Text>
            </View>
        </Pressable>
    );

    useEffect(() => {
        const checkFavorite = async () => {
            if (!species?.taxon_id) return;
            
            try {
                const token = await AsyncStorage.getItem('token');
                const res = await fetch(`${API_BASE_URL}/api/favorites/${species.taxon_id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setIsFavorite(data.favorite);
            } catch (error) {
                console.error('Erro ao verificar favorito:', error);
            }
        };
        
        checkFavorite();
    }, [species?.taxon_id]); // Apenas taxon_id como dependência

    const toggleFavorite = async () => {
        if (favoriteLoading) return; // Evita cliques múltiplos
        
        setFavoriteLoading(true);
        try {
            const token = await AsyncStorage.getItem('token');
            if (isFavorite) {
                const res = await fetch(`${API_BASE_URL}/api/favorites/${taxon_id}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    setIsFavorite(false);
                    setAlert({ type: 'SUCCESS', title: 'Removido dos favoritos', textBody: 'A espécie foi removida dos seus favoritos.' });
                } else {
                    setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao remover favorito.' });
                }
            } else {
                const res = await fetch(`${API_BASE_URL}/api/favorites`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ taxon_id })
                });
                const data = await res.json();
                if (data.success) {
                    setIsFavorite(true);
                    setAlert({ type: 'SUCCESS', title: 'Adicionado aos favoritos', textBody: 'A espécie foi adicionada aos seus favoritos' });
                } else {
                    setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro ao adicionar favorito.' });
                }
            }
        } catch (error) {
            console.error('Erro ao alterar favorito:', error);
            setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro de ligação.' });
        } finally {
            setFavoriteLoading(false);
        }
    };

    const handleSendToRag = async () => {
        setSendingToRag(true);
        setRagResult(null);
        try {
            const token = await AsyncStorage.getItem('token');
            
            const res = await fetch(`${API_BASE_URL}/api/rag/species`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    especies: [
                        {
                            taxon_id: species.taxon_id,
                            nome_comum: species.common_name,
                            nome_cientifico: species.sci_name,
                            descricao: species.description || '',
                        }
                    ]
                }),
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setRagResult('Espécie enviada para o sistema RAG com sucesso!');
                setAlert({ 
                    type: 'SUCCESS', 
                    title: 'RAG Atualizado', 
                    textBody: `${species.common_name} foi indexada no sistema RAG` 
                });
            } else {
                console.error('Erro ao enviar para RAG:', data);
                setRagResult(`Erro: ${data.error || 'Falha ao enviar para RAG'}`);
                setAlert({ 
                    type: 'DANGER', 
                    title: 'Erro RAG', 
                    textBody: data.error || 'Erro ao enviar para o RAG' 
                });
            }
        } catch (error) {
            console.error('Erro de conexão com RAG:', error);
            setRagResult('Erro de conexão com o sistema RAG');
            setAlert({ 
                type: 'DANGER', 
                title: 'Erro de Conexão', 
                textBody: 'Não foi possível conectar ao sistema RAG' 
            });
        } finally {
            setSendingToRag(false);
        }
    };

    if (loading) {
        return (
            <PrivateScreen navigation={navigation}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#357a4c" />
                </View>
            </PrivateScreen>
        );
    }

    if (!species) {
        return (
            <PrivateScreen navigation={navigation}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.errorText}>Espécie não encontrada.</Text>
                </View>
            </PrivateScreen>
        );
    }

    // Conteúdo das tabs
    const renderTabContent = () => {
        const tab = TABS.find(t => t.key === selectedTab);
        if (!tab) return null;

        switch (selectedTab) {
            case 'desc':
                return (
                    <View style={styles.tabInnerContent}>
                        <View style={styles.tabTitleRow}>
                            <Ionicons name={tab.icon as any} size={28} color="#205c37" style={styles.tabTitleIcon} />
                            <Text style={styles.tabTitle}>{tab.label}</Text>
                        </View>
                        {/* Mostra a descrição normal, sem o Bot */}
                        {species.description && species.description !== null && species.description.trim() !== "" && species.description !== "..." && species.description.length >= 30 && (
                            <View style={{ marginBottom: 12 }}>
                                {species.description_generated && (
                                    <View style={styles.iaInfoRow}>
                                        <Text style={styles.iaInfoText}>
                                            Descrição gerada por IA{' '}
                                        </Text>
                                        <Ionicons name="sparkles" size={24} color="#205c37" style={styles.iaInfoBotIcon} />
                                    </View>
                                )}
                                <Markdown
                                    style={{
                                        body: styles.botMsgText,
                                        strong: { color: '#205c37' },
                                        heading1: { fontSize: 18, color: '#357a4c', marginBottom: 6 },
                                        heading2: { fontSize: 16, color: '#357a4c', marginBottom: 4 },
                                    }}
                                >
                                    {species.description}
                                </Markdown>
                                
                                {/* Botão para gerar descrição alternativa via IA */}
                                {!species.description_generated && (
                                    <View style={{ marginTop: 16, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 14, color: '#666', marginBottom: 8, textAlign: 'center' }}>
                                            Pretende uma descrição alternativa gerada por IA?
                                        </Text>
                                        <Pressable
                                            style={({ pressed }) => ({
                                                backgroundColor: pressed ? '#d4edda' : (llmLoading ? '#c8f59d' : '#eafbe6'),
                                                borderRadius: 8,
                                                paddingVertical: 8,
                                                paddingHorizontal: 16,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderWidth: 1,
                                                borderColor: '#205c37',
                                                opacity: llmLoading ? 0.8 : (pressed ? 0.8 : 1),
                                                transform: [{ scale: pressed && !llmLoading ? 0.96 : 1 }]
                                            })}
                                            onPress={generateLLMDescription}
                                            disabled={llmLoading}
                                        >
                                            {llmLoading ? (
                                                <ActivityIndicator size="small" color="#205c37" style={{ marginRight: 6 }} />
                                            ) : (
                                                <Ionicons name="sparkles" size={16} color="#205c37" style={{ marginRight: 6 }} />
                                            )}
                                            <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 14 }}>
                                                {llmLoading ? 'A gerar...' : 'Gerar com IA'}
                                            </Text>
                                        </Pressable>
                                    </View>
                                )}
                                
                                {/* Opção para regenerar se já foi gerado por IA */}
                                {species.description_generated && (
                                    <View style={{ marginTop: 16, alignItems: 'center' }}>
                                        <View style={{ 
                                            flexDirection: 'row', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            flexWrap: 'wrap',
                                            gap: 8
                                        }}>
                                            <Pressable
                                                style={{
                                                    backgroundColor: llmLoading ? '#c8f59d' : '#eafbe6',
                                                    borderRadius: 8,
                                                    paddingVertical: 8,
                                                    paddingHorizontal: 12,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    borderWidth: 1,
                                                    borderColor: '#205c37',
                                                    minWidth: 120,
                                                    opacity: llmLoading ? 0.8 : 1
                                                }}
                                                onPress={generateLLMDescription}
                                                disabled={llmLoading}
                                            >
                                                {llmLoading ? (
                                                    <ActivityIndicator size="small" color="#205c37" style={{ marginRight: 6 }} />
                                                ) : (
                                                    <Ionicons name="refresh" size={16} color="#205c37" style={{ marginRight: 6 }} />
                                                )}
                                                <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 14 }}>
                                                    {llmLoading ? 'A regenerar...' : 'Regenerar'}
                                                </Text>
                                            </Pressable>
                                            
                                            <Pressable
                                                style={{
                                                    backgroundColor: sendingToRag ? '#c8f59d' : '#eafbe6',
                                                    borderRadius: 8,
                                                    paddingVertical: 8,
                                                    paddingHorizontal: 12,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    borderWidth: 1,
                                                    borderColor: '#205c37',
                                                    opacity: sendingToRag ? 0.8 : 1,
                                                    minWidth: 120
                                                }}
                                                onPress={handleSendToRag}
                                                disabled={sendingToRag}
                                            >
                                                {sendingToRag ? (
                                                    <ActivityIndicator size="small" color="#205c37" style={{ marginRight: 6 }} />
                                                ) : (
                                                    <Ionicons name="cloud-upload-outline" size={16} color="#205c37" style={{ marginRight: 6 }} />
                                                )}
                                                <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 14 }}>
                                                    {sendingToRag ? 'A enviar...' : 'Guardar RAG'}
                                                </Text>
                                            </Pressable>
                                        </View>
                                        {ragResult && (
                                            <Text style={{
                                                color: ragResult.startsWith('Espécie enviada') ? '#357a4c' : '#d32f2f',
                                                fontFamily: 'Montserrat-Bold',
                                                marginTop: 8,
                                                fontSize: 12,
                                                textAlign: 'center'
                                            }}>
                                                {ragResult}
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </View>
                        )}
                        {/* Se não houver descrição, ou for curta/"...", mostra o Bot */}
                        {(!species.description || species.description === null || species.description.trim() === "" || species.description.length < 30) && (
                            <View style={styles.botMsgRow}>
                                <BotIcon width={44} height={44} style={styles.botAvatar} />
                                <View style={styles.botMsgBubble}>
                                    {/* Mensagem para resposta incompleta */}
                                    {llmLoading ? (
                                        <>
                                            <Text style={styles.botMsgText}>
                                                A gerar descrição da espécie, aguarde...
                                            </Text>
                                            <ActivityIndicator size="small" color="#357a4c" style={{ marginTop: 10 }} />
                                        </>
                                    ) : species.description && species.description.length < 30 ? (
                                        <>
                                            <Text style={{ color: '#d32f2f', marginBottom: 8 }}>
                                                A descrição parece incompleta. Pretende que a IA gere uma descrição mais detalhada?
                                            </Text>
                                            <Pressable
                                                style={({ pressed }) => ({
                                                    backgroundColor: pressed ? '#d4edda' : (llmLoading ? '#c8f59d' : '#eafbe6'),
                                                    borderRadius: 8,
                                                    paddingVertical: 6,
                                                    paddingHorizontal: 14,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    borderWidth: 1,
                                                    borderColor: '#205c37',
                                                    alignSelf: 'flex-start',
                                                    opacity: llmLoading ? 0.8 : (pressed ? 0.8 : 1),
                                                    transform: [{ scale: pressed && !llmLoading ? 0.96 : 1 }]
                                                })}
                                                onPress={generateLLMDescription}
                                                disabled={llmLoading}
                                            >
                                                {llmLoading ? (
                                                    <ActivityIndicator size="small" color="#205c37" style={{ marginRight: 6 }} />
                                                ) : (
                                                    <Ionicons name="sparkles" size={14} color="#205c37" style={{ marginRight: 6 }} />
                                                )}
                                                <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 13 }}>
                                                    {llmLoading ? 'A gerar...' : 'Gerar com IA'}
                                                </Text>
                                            </Pressable>
                                        </>
                                    ) : llmError ? (
                                        <>
                                            <Text style={[styles.botMsgText, { color: '#d32f2f' }]}>{llmError}</Text>
                                            <Pressable
                                                style={({ pressed }) => ({
                                                    backgroundColor: pressed ? '#d4edda' : '#eafbe6',
                                                    borderRadius: 8,
                                                    paddingVertical: 6,
                                                    paddingHorizontal: 14,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    borderWidth: 1,
                                                    borderColor: '#205c37',
                                                    alignSelf: 'flex-start',
                                                    marginTop: 8,
                                                    opacity: pressed ? 0.8 : 1,
                                                    transform: [{ scale: pressed ? 0.96 : 1 }]
                                                })}
                                                onPress={generateLLMDescription}
                                                disabled={llmLoading}
                                            >
                                                <Ionicons name="refresh" size={14} color="#205c37" style={{ marginRight: 6 }} />
                                                <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 13 }}>
                                                    Tentar novamente
                                                </Text>
                                            </Pressable>
                                        </>
                                    ) : species.description_generated ? (
                                        <>
                                            <Text style={styles.botMsgText}>
                                                Descrição gerada com sucesso! Pretende enviar para o sistema RAG?
                                            </Text>
                                            <View style={{ 
                                                flexDirection: 'row', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                flexWrap: 'wrap',
                                                gap: 8, 
                                                marginTop: 12 
                                            }}>
                                                <Pressable
                                                    style={({ pressed }) => ({
                                                        backgroundColor: pressed ? '#d4edda' : (llmLoading ? '#c8f59d' : '#eafbe6'),
                                                        borderRadius: 8,
                                                        paddingVertical: 6,
                                                        paddingHorizontal: 10,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        borderWidth: 1,
                                                        borderColor: '#205c37',
                                                        minWidth: 100,
                                                        opacity: llmLoading ? 0.8 : (pressed ? 0.8 : 1),
                                                        transform: [{ scale: pressed && !llmLoading ? 0.96 : 1 }]
                                                    })}
                                                    onPress={generateLLMDescription}
                                                    disabled={llmLoading}
                                                >
                                                    {llmLoading ? (
                                                        <ActivityIndicator size="small" color="#205c37" style={{ marginRight: 4 }} />
                                                    ) : (
                                                        <Ionicons name="refresh" size={14} color="#205c37" style={{ marginRight: 4 }} />
                                                    )}
                                                    <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 13 }}>
                                                        {llmLoading ? 'A regenerar...' : 'Regenerar'}
                                                    </Text>
                                                </Pressable>
                                                
                                                <Pressable
                                                    style={({ pressed }) => ({
                                                        backgroundColor: pressed ? '#d4edda' : (sendingToRag ? '#c8f59d' : '#eafbe6'),
                                                        borderRadius: 8,
                                                        paddingVertical: 6,
                                                        paddingHorizontal: 10,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        borderWidth: 1,
                                                        borderColor: '#205c37',
                                                        minWidth: 100,
                                                        opacity: sendingToRag ? 0.8 : (pressed ? 0.8 : 1),
                                                        transform: [{ scale: pressed && !sendingToRag ? 0.96 : 1 }]
                                                    })}
                                                    onPress={handleSendToRag}
                                                    disabled={sendingToRag}
                                                >
                                                    <Ionicons name="cloud-upload-outline" size={14} color="#205c37" style={{ marginRight: 4 }} />
                                                    <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 13 }}>
                                                        {sendingToRag ? 'A enviar...' : 'Guardar RAG'}
                                                    </Text>
                                                </Pressable>
                                            </View>
                                            {ragResult && (
                                                <Text style={{
                                                    color: ragResult.startsWith('Espécie enviada') ? '#357a4c' : '#d32f2f',
                                                    fontFamily: 'Montserrat-Bold',
                                                    marginTop: 6,
                                                    fontSize: 11,
                                                    textAlign: 'center'
                                                }}>
                                                    {ragResult}
                                                </Text>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.botMsgText}>
                                                Não há descrição disponível para esta espécie. Pretende que a IA gere uma descrição baseada nas suas características?
                                            </Text>
                                            <Pressable
                                                style={({ pressed }) => ({
                                                    backgroundColor: pressed ? '#d4edda' : (llmLoading ? '#c8f59d' : '#eafbe6'),
                                                    borderRadius: 8,
                                                    paddingVertical: 6,
                                                    paddingHorizontal: 14,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    borderWidth: 1,
                                                    borderColor: '#205c37',
                                                    alignSelf: 'flex-start',
                                                    marginTop: 8,
                                                    opacity: llmLoading ? 0.8 : (pressed ? 0.8 : 1),
                                                    transform: [{ scale: pressed && !llmLoading ? 0.96 : 1 }]
                                                })}
                                                onPress={generateLLMDescription}
                                                disabled={llmLoading}
                                            >
                                                {llmLoading ? (
                                                    <ActivityIndicator size="small" color="#205c37" style={{ marginRight: 6 }} />
                                                ) : (
                                                    <Ionicons name="sparkles" size={14} color="#205c37" style={{ marginRight: 6 }} />
                                                )}
                                                <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold', fontSize: 13 }}>
                                                    {llmLoading ? 'A gerar...' : 'Gerar com IA'}
                                                </Text>
                                            </Pressable>
                                        </>
                                    )}
                                </View>
                            </View>
                        )}
                    </View>
                );
            case 'tax':
                return (
                    <View style={styles.tabInnerContent}>
                        <View style={styles.tabTitleRow}>
                            <Ionicons name={tab.icon as any} size={28} color="#205c37" style={styles.tabTitleIcon} />
                            <Text style={styles.tabTitle}>{tab.label}</Text>
                        </View>
                        {species.taxon_kingdom_name && <Text style={styles.taxonomyItem}>Reino: {species.taxon_kingdom_name}</Text>}
                        {species.taxon_phylum_name && <Text style={styles.taxonomyItem}>Filo: {species.taxon_phylum_name}</Text>}
                        {species.taxon_class_name && <Text style={styles.taxonomyItem}>Classe: {species.taxon_class_name}</Text>}
                        {species.taxon_order_name && <Text style={styles.taxonomyItem}>Ordem: {species.taxon_order_name}</Text>}
                        {species.taxon_family_name && <Text style={styles.taxonomyItem}>Família: {species.taxon_family_name}</Text>}
                        {species.taxon_genus_name && <Text style={styles.taxonomyItem}>Género: {species.taxon_genus_name}</Text>}
                    </View>
                );
            case 'dist':
                return (
                    <View style={styles.tabInnerContent}>
                        <View style={styles.tabTitleRow}>
                            <Ionicons name={tab.icon as any} size={28} color="#205c37" style={styles.tabTitleIcon} />
                            <Text style={styles.tabTitle}>{tab.label}</Text>
                        </View>
                        
                        {loadingDistribution ? (
                            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                <ActivityIndicator size="large" color="#357a4c" />
                                <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>
                                    A analisar distribuição global da espécie...
                                </Text>
                            </View>
                        ) : distributionError ? (
                            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                <Ionicons name="warning-outline" size={40} color="#ff6b6b" />
                                <Text style={{ color: '#ff6b6b', marginTop: 10, textAlign: 'center' }}>
                                    {distributionError}
                                </Text>
                                <Pressable
                                    style={({ pressed }) => ({
                                        backgroundColor: pressed ? '#d4edda' : '#eafbe6',
                                        borderRadius: 8,
                                        paddingVertical: 8,
                                        paddingHorizontal: 16,
                                        marginTop: 12,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderWidth: 1,
                                        borderColor: '#205c37',
                                        opacity: pressed ? 0.8 : 1
                                    })}
                                    onPress={loadDistributionData}
                                >
                                    <Ionicons name="refresh" size={16} color="#205c37" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold' }}>
                                        Tentar novamente
                                    </Text>
                                </Pressable>
                            </View>
                        ) : distributionData ? (
                            <View>
                                {/* Resumo da distribuição */}
                                <View style={{ 
                                    backgroundColor: '#f8f9fa', 
                                    borderRadius: 8, 
                                    padding: 16, 
                                    marginBottom: 16,
                                    borderLeftWidth: 4,
                                    borderLeftColor: '#357a4c'
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                        <Ionicons name="analytics-outline" size={20} color="#357a4c" />
                                        <Text style={{ 
                                            fontSize: 16, 
                                            fontFamily: 'Montserrat-Bold', 
                                            color: '#357a4c',
                                            marginLeft: 8 
                                        }}>
                                            Resumo da Distribuição
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <View style={{ 
                                            backgroundColor: '#e8f5e8', 
                                            borderRadius: 16, 
                                            paddingHorizontal: 12, 
                                            paddingVertical: 6,
                                            marginRight: 8,
                                            marginBottom: 4
                                        }}>
                                            <Text style={{ fontSize: 14, color: '#357a4c', fontFamily: 'Montserrat-Bold' }}>
                                                {distributionData.geographic_range || 'Indefinida'}
                                            </Text>
                                        </View>
                                        <Text style={{ fontSize: 14, color: '#666' }}>
                                            • {distributionData.total_observations.toLocaleString()} observações
                                        </Text>
                                    </View>
                                </View>

                                {/* Continentes - sempre mostrar se houver dados */}
                                {distributionData.continents && distributionData.continents.length > 0 && (
                                    <View style={{ marginBottom: 20 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                            <Ionicons name="globe-outline" size={20} color="#357a4c" />
                                            <Text style={{ 
                                                fontSize: 16, 
                                                fontFamily: 'Montserrat-Bold', 
                                                color: '#357a4c',
                                                marginLeft: 8 
                                            }}>
                                                Continentes ({distributionData.continents.length})
                                            </Text>
                                        </View>
                                        {distributionData.continents.map((continent: any, index: number) => (
                                            <View key={index} style={{ 
                                                flexDirection: 'row', 
                                                alignItems: 'center', 
                                                paddingVertical: 8,
                                                paddingHorizontal: 12,
                                                backgroundColor: index % 2 === 0 ? '#f8f9fa' : 'transparent',
                                                borderRadius: 6
                                            }}>
                                                <View style={{ 
                                                    width: 8, 
                                                    height: 8, 
                                                    borderRadius: 4, 
                                                    backgroundColor: '#357a4c',
                                                    marginRight: 12 
                                                }} />
                                                <Text style={{ 
                                                    flex: 1, 
                                                    fontSize: 15, 
                                                    color: '#333',
                                                    fontFamily: 'Montserrat-Regular'
                                                }}>
                                                    {continent.name}
                                                </Text>
                                                <Text style={{ 
                                                    fontSize: 13, 
                                                    color: '#666',
                                                    fontFamily: 'Montserrat-Regular'
                                                }}>
                                                    {continent.observations_count.toLocaleString()} obs.
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Países - sempre mostrar se houver dados */}
                                {distributionData.countries && distributionData.countries.length > 0 && (
                                    <View style={{ marginBottom: 20 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                            <Ionicons name="flag-outline" size={20} color="#357a4c" />
                                            <Text style={{ 
                                                fontSize: 16, 
                                                fontFamily: 'Montserrat-Bold', 
                                                color: '#357a4c',
                                                marginLeft: 8 
                                            }}>
                                                Principais Países ({distributionData.countries.length})
                                            </Text>
                                        </View>
                                        {distributionData.countries.slice(0, 10).map((country: any, index: number) => (
                                            <View key={index} style={{ 
                                                flexDirection: 'row', 
                                                alignItems: 'center', 
                                                paddingVertical: 8,
                                                paddingHorizontal: 12,
                                                backgroundColor: index % 2 === 0 ? '#f8f9fa' : 'transparent',
                                                borderRadius: 6
                                            }}>
                                                <View style={{ 
                                                    width: 6, 
                                                    height: 6, 
                                                    borderRadius: 3, 
                                                    backgroundColor: '#4CAF50',
                                                    marginRight: 12 
                                                }} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ 
                                                        fontSize: 15, 
                                                        color: '#333',
                                                        fontFamily: 'Montserrat-Regular'
                                                    }}>
                                                        {country.name}
                                                    </Text>
                                                    {country.continent && (
                                                        <Text style={{ 
                                                            fontSize: 12, 
                                                            color: '#888',
                                                            fontFamily: 'Montserrat-Regular'
                                                        }}>
                                                            {country.continent}
                                                        </Text>
                                                    )}
                                                </View>
                                                <Text style={{ 
                                                    fontSize: 13, 
                                                    color: '#666',
                                                    fontFamily: 'Montserrat-Regular'
                                                }}>
                                                    {country.observations_count.toLocaleString()}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {/* Se não há listas, mas há observações, mostrar informação básica */}
                                {(!distributionData.continents || distributionData.continents.length === 0) && 
                                 (!distributionData.countries || distributionData.countries.length === 0) && 
                                 distributionData.total_observations > 0 && (
                                    <View style={{ marginBottom: 20 }}>
                                        <View style={{ 
                                            backgroundColor: '#fff3e0', 
                                            borderRadius: 8, 
                                            padding: 16,
                                            borderLeftWidth: 4,
                                            borderLeftColor: '#ff9800'
                                        }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                <Ionicons name="location-outline" size={20} color="#f57c00" />
                                                <Text style={{ 
                                                    fontSize: 16, 
                                                    fontFamily: 'Montserrat-Bold', 
                                                    color: '#f57c00',
                                                    marginLeft: 8 
                                                }}>
                                                    Localização das Observações
                                                </Text>
                                            </View>
                                            <Text style={{ 
                                                fontSize: 14, 
                                                color: '#666',
                                                lineHeight: 18
                                            }}>
                                                Esta espécie foi observada {distributionData.total_observations.toLocaleString()} vezes 
                                                em estudos científicos, mas não foi possível determinar a distribuição geográfica detalhada.
                                            </Text>
                                            {distributionData.message && (
                                                <Text style={{ 
                                                    fontSize: 12, 
                                                    color: '#888',
                                                    marginTop: 8,
                                                    fontStyle: 'italic'
                                                }}>
                                                    {distributionData.message}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                )}

                                {/* Rodapé informativo */}
                                <View style={{ 
                                    backgroundColor: '#e3f2fd', 
                                    borderRadius: 8, 
                                    padding: 12,
                                    flexDirection: 'row',
                                    alignItems: 'flex-start'
                                }}>
                                    <Ionicons name="information-circle-outline" size={16} color="#1976d2" style={{ marginTop: 2, marginRight: 8 }} />
                                    <Text style={{ 
                                        fontSize: 12, 
                                        color: '#1976d2',
                                        flex: 1,
                                        lineHeight: 16
                                    }}>
                                        Dados baseados em observações científicas validadas pela comunidade iNaturalist. 
                                        A distribuição real pode ser mais ampla que os dados disponíveis.
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                <Ionicons name="earth-outline" size={40} color="#ccc" />
                                <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>
                                    Dados de distribuição não disponíveis
                                </Text>
                                <Pressable
                                    style={({ pressed }) => ({
                                        backgroundColor: pressed ? '#d4edda' : '#eafbe6',
                                        borderRadius: 8,
                                        paddingVertical: 8,
                                        paddingHorizontal: 16,
                                        marginTop: 12,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderWidth: 1,
                                        borderColor: '#205c37',
                                        opacity: pressed ? 0.8 : 1
                                    })}
                                    onPress={loadDistributionData}
                                >
                                    <Ionicons name="download-outline" size={16} color="#205c37" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold' }}>
                                        Carregar dados
                                    </Text>
                                </Pressable>
                            </View>
                        )}
                    </View>
                );
            case 'rating':
                return (
                    <View style={styles.tabInnerContent}>
                        <View style={styles.tabTitleRow}>
                            <Ionicons name={tab.icon as any} size={28} color="#205c37" style={styles.tabTitleIcon} />
                            <Text style={styles.tabTitle}>{tab.label}</Text>
                        </View>
                        
                        {loadingRating ? (
                            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                <ActivityIndicator size="large" color="#357a4c" />
                                <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>
                                    A carregar dados de avaliação...
                                </Text>
                            </View>
                        ) : ratingError ? (
                            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                <Ionicons name="warning-outline" size={40} color="#ff6b6b" />
                                <Text style={{ color: '#ff6b6b', marginTop: 10, textAlign: 'center' }}>
                                    {ratingError}
                                </Text>
                                <Pressable
                                    style={({ pressed }) => ({
                                        backgroundColor: pressed ? '#d4edda' : '#eafbe6',
                                        borderRadius: 8,
                                        paddingVertical: 8,
                                        paddingHorizontal: 16,
                                        marginTop: 12,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderWidth: 1,
                                        borderColor: '#205c37',
                                        opacity: pressed ? 0.8 : 1
                                    })}
                                    onPress={loadRatingData}
                                >
                                    <Ionicons name="refresh" size={16} color="#205c37" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#205c37', fontFamily: 'Montserrat-Bold' }}>
                                        Tentar novamente
                                    </Text>
                                </Pressable>
                            </View>
                        ) : (
                            <View>
                                {/* Estatísticas gerais de avaliação */}
                                {ratingStats && ratingStats.total_ratings > 0 && (
                                    <View style={{ 
                                        backgroundColor: '#f8f9fa', 
                                        borderRadius: 8, 
                                        padding: 16, 
                                        marginBottom: 20,
                                        borderLeftWidth: 4,
                                        borderLeftColor: '#fbc02d'
                                    }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                            <Ionicons name="analytics-outline" size={20} color="#fbc02d" />
                                            <Text style={{ 
                                                fontSize: 16, 
                                                fontFamily: 'Montserrat-Bold', 
                                                color: '#357a4c',
                                                marginLeft: 8 
                                            }}>
                                                Avaliação da Comunidade
                                            </Text>
                                        </View>
                                        
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                                                <Ionicons name="star" size={20} color="#fbc02d" />
                                                <Text style={{ 
                                                    fontSize: 18, 
                                                    fontFamily: 'Montserrat-Bold', 
                                                    color: '#357a4c',
                                                    marginLeft: 4 
                                                }}>
                                                    {ratingStats.average_rating}
                                                </Text>
                                            </View>
                                            <Text style={{ color: '#666', fontSize: 14 }}>
                                                ({ratingStats.total_ratings} avaliação{ratingStats.total_ratings !== 1 ? 'ões' : ''})
                                            </Text>
                                        </View>
                                        
                                        {/* Distribuição das avaliações */}
                                        <View style={{ marginTop: 8 }}>
                                            {[5, 4, 3, 2, 1].map(star => (
                                                <View key={star} style={{ 
                                                    flexDirection: 'row', 
                                                    alignItems: 'center', 
                                                    marginBottom: 4 
                                                }}>
                                                    <Text style={{ 
                                                        fontSize: 12, 
                                                        color: '#666', 
                                                        width: 20 
                                                    }}>
                                                        {star}
                                                    </Text>
                                                    <Ionicons name="star" size={12} color="#fbc02d" style={{ marginRight: 6 }} />
                                                    <View style={{
                                                        flex: 1,
                                                        height: 8,
                                                        backgroundColor: '#e0e0e0',
                                                        borderRadius: 4,
                                                        marginRight: 8
                                                    }}>
                                                        <View style={{
                                                            height: '100%',
                                                            backgroundColor: '#fbc02d',
                                                            borderRadius: 4,
                                                            width: `${ratingStats.total_ratings > 0 ? (ratingStats.distribution[star] / ratingStats.total_ratings) * 100 : 0}%`
                                                        }} />
                                                    </View>
                                                    <Text style={{ 
                                                        fontSize: 12, 
                                                        color: '#666', 
                                                        width: 25, 
                                                        textAlign: 'right' 
                                                    }}>
                                                        {ratingStats.distribution[star]}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}
                                
                                {/* Seção de avaliação do usuário */}
                                <View style={{ 
                                    backgroundColor: '#fff', 
                                    borderRadius: 8, 
                                    padding: 16,
                                    borderWidth: 1,
                                    borderColor: '#e0e0e0'
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                        <Ionicons name="person-outline" size={20} color="#357a4c" />
                                        <Text style={{ 
                                            fontSize: 16, 
                                            fontFamily: 'Montserrat-Bold', 
                                            color: '#357a4c',
                                            marginLeft: 8 
                                        }}>
                                            {hasUserRating ? 'A Sua Avaliação' : 'Avaliar Esta Espécie'}
                                        </Text>
                                    </View>
                                    
                                    {/* Sistema de estrelas */}
                                    <View style={{ 
                                        flexDirection: 'row', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        marginBottom: 16 
                                    }}>
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <TouchableOpacity
                                                key={star}
                                                onPress={() => {
                                                    if (!savingRating) {
                                                        const newRating = star === userRating ? 0 : star;
                                                        if (newRating > 0) {
                                                            saveRating(newRating, userComment);
                                                        }
                                                    }
                                                }}
                                                style={{ 
                                                    padding: 8,
                                                    opacity: savingRating ? 0.5 : 1
                                                }}
                                                disabled={savingRating}
                                            >
                                                <Ionicons
                                                    name={star <= userRating ? 'star' : 'star-outline'}
                                                    size={32}
                                                    color={star <= userRating ? '#fbc02d' : '#ccc'}
                                                />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    
                                    {/* Labels de avaliação */}
                                    {userRating > 0 && (
                                        <Text style={{ 
                                            textAlign: 'center', 
                                            fontSize: 14, 
                                            color: '#357a4c',
                                            marginBottom: 16,
                                            fontFamily: 'Montserrat-Bold'
                                        }}>
                                            {userRating === 1 && 'Muito má'}
                                            {userRating === 2 && 'Má'}
                                            {userRating === 3 && 'Razoável'}
                                            {userRating === 4 && 'Boa'}
                                            {userRating === 5 && 'Excelente'}
                                        </Text>
                                    )}
                                    
                                    {/* Campo de comentário */}
                                    <TextInput
                                        style={{
                                            borderWidth: 1,
                                            borderColor: '#e0e0e0',
                                            borderRadius: 8,
                                            padding: 12,
                                            minHeight: 80,
                                            textAlignVertical: 'top',
                                            fontFamily: 'Montserrat-Regular',
                                            marginBottom: 16
                                        }}
                                        placeholder="Comentário opcional sobre esta espécie..."
                                        value={userComment}
                                        onChangeText={setUserComment}
                                        multiline
                                        numberOfLines={3}
                                        maxLength={500}
                                        editable={!savingRating}
                                    />
                                    
                                    {/* Botões de ação */}
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        {hasUserRating && (
                                            <Pressable
                                                style={({ pressed }) => ({
                                                    backgroundColor: pressed ? '#ffebee' : '#fff',
                                                    borderWidth: 1,
                                                    borderColor: '#f44336',
                                                    borderRadius: 8,
                                                    paddingVertical: 8,
                                                    paddingHorizontal: 16,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    opacity: savingRating ? 0.5 : (pressed ? 0.8 : 1)
                                                })}
                                                onPress={deleteRating}
                                                disabled={savingRating}
                                            >
                                                <Ionicons name="trash-outline" size={16} color="#f44336" style={{ marginRight: 6 }} />
                                                <Text style={{ color: '#f44336', fontFamily: 'Montserrat-Bold', fontSize: 14 }}>
                                                    Remover
                                                </Text>
                                            </Pressable>
                                        )}
                                        
                                        <Pressable
                                            style={({ pressed }) => ({
                                                backgroundColor: pressed ? '#c8e6c9' : '#4caf50',
                                                borderRadius: 8,
                                                paddingVertical: 8,
                                                paddingHorizontal: 16,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                opacity: savingRating || userRating === 0 ? 0.5 : (pressed ? 0.8 : 1),
                                                marginLeft: 'auto'
                                            })}
                                            onPress={() => saveRating(userRating, userComment)}
                                            disabled={savingRating || userRating === 0}
                                        >
                                            {savingRating ? (
                                                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                                            ) : (
                                                <Ionicons name="checkmark" size={16} color="#fff" style={{ marginRight: 6 }} />
                                            )}
                                            <Text style={{ color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 14 }}>
                                                {savingRating ? 'A guardar...' : hasUserRating ? 'Atualizar' : 'Guardar'}
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>
                                
                                {/* Informação adicional */}
                                <View style={{ 
                                    backgroundColor: '#e3f2fd', 
                                    borderRadius: 8, 
                                    padding: 12,
                                    marginTop: 16,
                                    flexDirection: 'row',
                                    alignItems: 'flex-start'
                                }}>
                                    <Ionicons name="information-circle-outline" size={16} color="#1976d2" style={{ marginTop: 2, marginRight: 8 }} />
                                    <Text style={{ 
                                        fontSize: 12, 
                                        color: '#1976d2',
                                        flex: 1,
                                        lineHeight: 16
                                    }}>
                                        As suas avaliações ajudam outros utilizadores a conhecer melhor as espécies e melhoram o sistema de recomendações da aplicação.
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <PrivateScreen navigation={navigation}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={styles.commonName}>{species.common_name}</Text>
                    <Pressable 
                        onPress={toggleFavorite} 
                        style={({ pressed }) => ({
                            marginLeft: 10,
                            opacity: favoriteLoading ? 0.7 : pressed ? 0.8 : 1,
                            transform: [{ scale: pressed ? 0.95 : 1 }],
                            padding: 8,
                            borderRadius: 20,
                            backgroundColor: pressed ? 'rgba(0,0,0,0.05)' : 'transparent'
                        })}
                        disabled={favoriteLoading}
                    >
                        {favoriteLoading ? (
                            <ActivityIndicator size="small" color="#e53935" />
                        ) : (
                            <Ionicons
                                name={isFavorite ? "heart" : "heart-outline"}
                                size={28}
                                color={isFavorite ? "#e53935" : "#aaa"}
                            />
                        )}
                    </Pressable>
                </View>
                {/* Nome científico com tag */}
                <View style={styles.sciNameRow}>
                    <Ionicons name="flask-outline" size={18} color="#205c37" style={styles.sciNameIcon} />
                    <Text style={styles.sciNameLabel}>Nome científico:</Text>
                    <Text style={styles.sciNameValue}>{species.sci_name}</Text>
                </View>

                {/* Imagem grande e badges */}
                <View style={styles.imageContainer}>
                    <View style={styles.imageWrapper}>
                        {species.image_url ? (
                            <>
                                {imageLoading && (
                                    <View style={styles.imageLoading}>
                                        <ActivityIndicator size="large" color="#357a4c" />
                                    </View>
                                )}
                                <Image
                                    source={{ uri: species.image_url }}
                                    style={styles.image}
                                    onLoadEnd={() => setImageLoading(false)}
                                />
                            </>
                        ) : (
                            <View style={styles.noImage}>
                                <Ionicons name="image-outline" size={64} color="#c8f59d" />
                            </View>
                        )}
                    </View>
                </View>

                {/* Informação geral */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Informação geral</Text>
                    <View style={styles.infoTable}>
                        {species.taxon_class_name && (
                            <View style={styles.infoTableRow}>
                                <Ionicons name="layers-outline" size={18} color="#357a4c" style={styles.infoTableIcon} />
                                <Text style={styles.infoTableLabel}>Classe</Text>
                                <Text style={styles.infoTableValue}>{species.taxon_class_name}</Text>
                            </View>
                        )}
                        {species.family && (
                            <View style={styles.infoTableRow}>
                                <Ionicons name="git-branch-outline" size={18} color="#357a4c" style={styles.infoTableIcon} />
                                <Text style={styles.infoTableLabel}>Família</Text>
                                <Text style={styles.infoTableValue}>{species.family}</Text>
                            </View>
                        )}
                        <View style={styles.infoTableRow}>
                            <Ionicons name="shield-outline" size={18} color="#357a4c" style={styles.infoTableIcon} />
                            <Text style={styles.infoTableLabel}>Estado</Text>
                            <Text style={styles.infoTableValue}>
                                {species.conservation_status || 'Não disponível'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* TabNav em bloco branco com separadores */}
                <View style={styles.tabsRow}>
                    {TABS.map((tab, idx) => (
                        <React.Fragment key={tab.key}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.tabBtn,
                                    selectedTab === tab.key && styles.tabBtnActive,
                                    idx === 0 && styles.tabBtnFirst,
                                    idx === TABS.length - 1 && styles.tabBtnLast,
                                    pressed && selectedTab !== tab.key && { backgroundColor: 'rgba(32, 92, 55, 0.1)' },
                                    pressed && { opacity: 0.8 }
                                ]}
                                onPress={() => setSelectedTab(tab.key)}
                            >
                                <Ionicons
                                    name={tab.icon as React.ComponentProps<typeof Ionicons>['name']}
                                    size={28}
                                    color={selectedTab === tab.key ? '#fff' : '#205c37'}
                                    style={styles.tabIcon}
                                />
                            </Pressable>
                            {idx < TABS.length - 1 && (
                                <View style={styles.tabSeparator} />
                            )}
                        </React.Fragment>
                    ))}
                </View>

                {/* Conteúdo da tab selecionada */}
                <View style={styles.tabContent}>
                    {renderTabContent()}
                </View>

                {/* Seção de Espécies Relacionadas - Design Melhorado */}
                {showRelatedSection && (
                    <View style={styles.aiRecommendationsSection}>
                        {/* Header da seção com avatar do bot */}
                        <View style={styles.aiHeader}>
                            <View style={styles.aiHeaderLeft}>
                                <View style={styles.aiAvatarContainer}>
                                    <BotIcon width={32} height={32} />
                                    <View style={[
                                        styles.aiStatusDot, 
                                        { backgroundColor: loadingRelated ? '#ffa726' : relatedError ? '#ff6b6b' : '#4caf50' }
                                    ]} />
                                </View>
                                <View style={styles.aiHeaderText}>
                                    <Text style={styles.aiTitle}>Recomendações de IA</Text>
                                    <Text style={styles.aiSubtitle}>Espécies relacionadas por características similares</Text>
                                </View>
                            </View>
                            {loadingRelated && (
                                <View style={styles.aiLoadingIndicator}>
                                    <ActivityIndicator size="small" color="#357a4c" />
                                </View>
                            )}
                        </View>

                        {/* Indicador de processo de IA */}
                        <View style={[
                            styles.aiProcessIndicator,
                            { 
                                backgroundColor: loadingRelated 
                                    ? '#fff3e0'  // Laranja claro para carregamento
                                    : relatedError 
                                    ? '#ffebee'  // Vermelho claro para erro
                                    : relatedSpecies.length > 0
                                    ? '#e8f5e8'  // Verde claro para sucesso
                                    : '#f5f5f5', // Cinza para estado neutro
                                borderColor: loadingRelated
                                    ? '#ffcc02'  // Laranja para carregamento
                                    : relatedError 
                                    ? '#ffcdd2'  // Vermelho para erro
                                    : relatedSpecies.length > 0
                                    ? '#c8e6c9'  // Verde para sucesso
                                    : '#e0e0e0'  // Cinza para estado neutro
                            }
                        ]}>
                            <View style={styles.aiProcessIconContainer}>
                                <Ionicons 
                                    name={loadingRelated 
                                        ? "hourglass" 
                                        : relatedError 
                                        ? "warning" 
                                        : relatedSpecies.length > 0
                                        ? "checkmark-circle"
                                        : "sparkles"
                                    } 
                                    size={16} 
                                    color={loadingRelated 
                                        ? "#ffa726" 
                                        : relatedError 
                                        ? "#ff6b6b" 
                                        : relatedSpecies.length > 0
                                        ? "#4caf50"
                                        : "#9e9e9e"
                                    } 
                                />
                            </View>
                            <Text style={[
                                styles.aiProcessText,
                                { color: loadingRelated 
                                    ? '#e65100' 
                                    : relatedError 
                                    ? '#c62828' 
                                    : relatedSpecies.length > 0
                                    ? '#2e7d32'
                                    : '#616161'
                                }
                            ]}>
                                {loadingRelated 
                                    ? "A IA está a analisar características e a procurar espécies similares..." 
                                    : relatedError
                                    ? relatedError
                                    : `Encontradas ${relatedSpecies.length} espécies similares através de análise de IA`
                                }
                            </Text>
                        </View>

                        {/* Loading state melhorado */}
                        {loadingRelated && (
                            <View style={styles.aiLoadingContainer}>
                                <View style={styles.aiLoadingContent}>
                                    <View style={styles.aiLoadingSteps}>
                                        <View style={styles.aiLoadingStep}>
                                            <View style={[styles.aiLoadingStepDot, styles.aiLoadingStepActive]} />
                                            <Text style={styles.aiLoadingStepText}>Analisando características</Text>
                                        </View>
                                        <View style={styles.aiLoadingStep}>
                                            <View style={[styles.aiLoadingStepDot, styles.aiLoadingStepActive]} />
                                            <Text style={styles.aiLoadingStepText}>Comparando com base de dados</Text>
                                        </View>
                                        <View style={styles.aiLoadingStep}>
                                            <View style={styles.aiLoadingStepDot} />
                                            <Text style={styles.aiLoadingStepText}>Calculando similaridades</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Mensagem de erro se houver */}
                        {relatedError && !loadingRelated && (
                            <View style={styles.aiErrorContainer}>
                                <View style={styles.aiErrorContent}>
                                    <Ionicons name="warning-outline" size={24} color="#ff6b6b" />
                                    <View style={styles.aiErrorText}>
                                        <Text style={styles.aiErrorTitle}>Oops! Algo correu mal</Text>
                                        <Text style={styles.aiErrorMessage}>{relatedError}</Text>
                                        <Pressable 
                                            style={({ pressed }) => ({
                                                ...styles.aiRetryButton,
                                                opacity: pressed ? 0.8 : 1,
                                                transform: [{ scale: pressed ? 0.95 : 1 }],
                                                backgroundColor: pressed ? '#d4edda' : '#eafbe6'
                                            })}
                                            onPress={() => {
                                                if (species && species.taxon_id) {
                                                    // Reset para permitir nova chamada
                                                    lastRecommendationSpeciesRef.current = null;
                                                    loadRelatedSpecies(species);
                                                }
                                            }}
                                        >
                                            <Ionicons name="refresh" size={16} color="#357a4c" />
                                            <Text style={styles.aiRetryText}>Tentar novamente</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Lista de espécies relacionadas */}
                        {relatedSpecies.length > 0 && !loadingRelated && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.relatedScrollView}>
                                {relatedSpecies.map((relatedItem, index) => (
                                    <Pressable
                                        key={`${relatedItem.taxon_id}-${index}`}
                                        style={({ pressed }) => ({
                                            ...styles.relatedCardImproved,
                                            opacity: pressed ? 0.8 : 1,
                                            transform: [{ scale: pressed ? 0.95 : 1 }]
                                        })}
                                        onPress={() => handleRelatedSpeciesPress(relatedItem)}
                                    >
                                        {/* Badge de IA */}
                                        <View style={styles.aiRecommendationBadge}>
                                            <Ionicons name="sparkles" size={12} color="#fff" />
                                        </View>
                                        
                                        <Image
                                            source={relatedItem.image_url ? { uri: relatedItem.image_url } : require('../../assets/images/80x80_SemFoto.webp')}
                                            style={styles.relatedImageImproved}
                                        />
                                        
                                        <View style={styles.relatedInfoImproved}>
                                            <Text style={styles.relatedNameImproved} numberOfLines={2}>
                                                {relatedItem.common_name || 'Sem nome comum'}
                                            </Text>
                                            <Text style={styles.relatedSciNameImproved} numberOfLines={1}>
                                                {relatedItem.sci_name}
                                            </Text>
                                            
                                            {/* Barra de confiança */}
                                            {relatedItem.confidence && (
                                                <View style={styles.confidenceContainer}>
                                                    <View style={styles.confidenceBar}>
                                                        <View 
                                                            style={[
                                                                styles.confidenceProgress, 
                                                                { width: `${Math.round(relatedItem.confidence * 100)}%` }
                                                            ]} 
                                                        />
                                                    </View>
                                                    <Text style={styles.confidenceText}>
                                                        {Math.round(relatedItem.confidence * 100)}% similar
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        )}

                        {/* Rodapé da seção de IA */}
                        <View style={styles.aiFooter}>
                            <Ionicons name="information-circle-outline" size={16} color="#666" />
                            <Text style={styles.aiFooterText}>
                                Recomendações geradas por inteligência artificial baseadas em características morfológicas e taxonómicas
                            </Text>
                        </View>
                    </View>
                )}

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
            </ScrollView>
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
    container: {
        padding: 24,
        backgroundColor: '#eafbe6',
        alignItems: 'center',
        paddingBottom: 48,
    },
    imageContainer: {
        alignItems: 'center',
        marginBottom: 10,
        width: '100%',
    },
    imageWrapper: {
        width: windowWidth - 48,
        height: Math.round((windowWidth - 48) * 0.65),
        borderRadius: 24,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
        borderColor: '#205c37',
        overflow: 'hidden',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
        borderRadius: 20,
        resizeMode: 'cover',
        position: 'absolute',
        top: 0,
        left: 0,
    },
    imageLoading: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
        backgroundColor: '#fff',
    },
    noImage: {
        width: '100%',
        height: '100%',
        borderRadius: 20,
        backgroundColor: '#c8f59d33',
        alignItems: 'center',
        justifyContent: 'center',
    },
    obsTag: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: '#eafbe6',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#205c37',
        paddingVertical: 3,
        paddingHorizontal: 14,
        marginTop: 10,
        marginBottom: 2,
        elevation: 2,
    },
    obsTagText: {
        fontSize: 15,
        color: '#205c37',
        fontFamily: 'Montserrat-Bold',
        marginLeft: 6,
    },
    commonName: {
        fontSize: 28,
        color: '#357a4c',
        fontFamily: 'Montserrat-Bold',
        textAlign: 'center',
        marginTop: 12,
        marginBottom: 2,
    },
    sciNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
        marginTop: 2,
    },
    sciNameIcon: {
        marginRight: 6,
    },
    sciNameLabel: {
        fontSize: 15,
        color: '#205c37',
        fontFamily: 'Montserrat-Bold',
        marginRight: 6,
    },
    sciNameValue: {
        fontSize: 17,
        color: '#357a4c',
        fontFamily: 'Montserrat-Italic',
    },
    section: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginTop: 18,
        elevation: 2,
        shadowColor: '#357a4c22',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        overflow: 'hidden',
        position: 'relative',
        minHeight: 60,
    },
    sectionTitle: {
        fontSize: 16,
        color: '#357a4c',
        fontFamily: 'Montserrat-Bold',
        marginBottom: 6,
        zIndex: 1,
        paddingRight: 40,
    },
    infoTable: {
        width: '100%',
        marginTop: 2,
    },
    infoTableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    infoTableIcon: {
        width: 28,
        textAlign: 'center',
    },
    infoTableLabel: {
        width: 100,
        fontSize: 15,
        color: '#357a4c',
        fontFamily: 'Montserrat-Bold',
        marginLeft: 2,
    },
    infoTableValue: {
        flex: 1,
        fontSize: 15,
        color: '#222',
        fontFamily: 'Montserrat-Thin',
        marginLeft: 8,
    },
    tabsRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
        backgroundColor: '#fff',
        marginTop: 22,
        marginBottom: 0,
        borderRadius: 14,
        overflow: 'hidden',
    },
    tabBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 18,
        backgroundColor: '#fff',
        borderRightWidth: 0,
        borderColor: '#e0e0e0',
        flex: 1,
        justifyContent: 'center',
        minWidth: 48,
    },
    tabBtnFirst: {
        borderTopLeftRadius: 14,
    },
    tabBtnLast: {
        borderTopRightRadius: 14,
    },
    tabBtnActive: {
        backgroundColor: '#205c37',
    },
    tabIcon: {},
    tabSeparator: {
        width: 1,
        backgroundColor: '#e0e0e0',
        marginVertical: 10,
    },
    tabContent: {
        width: '100%',
        backgroundColor: '#fff',
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 14,
        borderWidth: 1.5,
        borderTopWidth: 0,
        borderColor: '#e0e0e0',
        marginBottom: 8,
        padding: 18,
        paddingTop: 12,
        elevation: 2,
        shadowColor: '#357a4c22',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    tabInnerContent: {
        width: '100%',
    },
    tabTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    tabTitleIcon: {
        marginRight: 10,
    },
    tabTitle: {
        fontSize: 20,
        color: '#205c37',
        fontFamily: 'Montserrat-Bold',
    },
    description: {
        fontSize: 16,
        color: '#222',
        fontFamily: 'Montserrat',
        marginBottom: 10,
        textAlign: 'justify',
        lineHeight: 22,
        zIndex: 1,
    },
    distribution: {
        fontSize: 15,
        color: '#444',
        fontFamily: 'Montserrat',
        marginBottom: 2,
        zIndex: 1,
    },
    taxonomyItem: {
        fontSize: 15,
        color: '#444',
        fontFamily: 'Montserrat',
        marginBottom: 2,
        zIndex: 1,
    },
    nameItem: {
        fontSize: 15,
        color: '#444',
        fontFamily: 'Montserrat',
        marginBottom: 2,
        zIndex: 1,
    },
    botMsgRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 12,
        marginBottom: 8,
    },
    botAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        marginRight: 12,
        backgroundColor: '#eafbe6',
    },
    iaInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    iaInfoText: {
        fontSize: 16,
        color: '#000',
        fontFamily: 'Montserrat-Bold',
    },
    iaInfoBotIcon: {
        width: 22,
        height: 22,
        borderRadius: 11,
        marginLeft: 6,
        backgroundColor: '#eafbe6',
    },
    botMsgBubble: {
        backgroundColor: '#f4f4f4',
        borderRadius: 16,
        padding: 14,
        maxWidth: '85%',
        flex: 1,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    botMsgText: {
        fontSize: 16,
        color: '#205c37',
        fontFamily: 'Montserrat',
        lineHeight: 22,
    },
    botMsgInfo: {
        fontSize: 12,
        color: '#888',
        marginBottom: 4,
        fontFamily: 'Montserrat',
    },
    refreshBtn: {
        marginTop: 12,
        alignSelf: 'flex-start',
        backgroundColor: '#eafbe6',
        borderRadius: 8,
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: '#205c37',
    },
    refreshBtnInner: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    refreshBtnText: {
        color: '#205c37',
        fontFamily: 'Montserrat-Bold',
        marginLeft: 6,
        fontSize: 15,
    },
    errorText: {
        color: '#d32f2f',
        fontSize: 17,
        fontFamily: 'Montserrat-Bold',
        marginTop: 12,
    },
    // Estilos para espécies relacionadas
    relatedSection: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginTop: 20,
        elevation: 3,
        shadowColor: '#357a4c',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    relatedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    relatedTitle: {
        fontSize: 18,
        fontFamily: 'Montserrat-Bold',
        color: '#357a4c',
        marginLeft: 8,
    },
    relatedSubtitle: {
        fontSize: 14,
        fontFamily: 'Montserrat',
        color: '#666',
        marginBottom: 16,
        fontStyle: 'italic',
    },
    relatedScrollView: {
        marginHorizontal: -4,
    },
    relatedCard: {
        backgroundColor: '#f8fff6',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 4,
        width: 140,
        elevation: 2,
        shadowColor: '#357a4c',
        shadowOpacity: 0.08,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        borderWidth: 1,
        borderColor: '#e8f5e8',
    },
    relatedImage: {
        width: '100%',
        height: 80,
        borderRadius: 8,
        backgroundColor: '#eafbe6',
        marginBottom: 8,
    },
    relatedInfo: {
        flex: 1,
    },
    relatedName: {
        fontSize: 13,
        fontFamily: 'Montserrat-Bold',
        color: '#357a4c',
        marginBottom: 4,
        lineHeight: 16,
    },
    relatedSciName: {
        fontSize: 11,
        fontFamily: 'Montserrat-Italic',
        color: '#666',
        marginBottom: 6,
    },
    relatedConfidence: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    relatedConfidenceText: {
        fontSize: 11,
        fontFamily: 'Montserrat',
        color: '#666',
        marginLeft: 4,
    },
    relatedLoading: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
    },
    relatedLoadingText: {
        fontSize: 14,
        fontFamily: 'Montserrat',
        color: '#666',
        marginLeft: 8,
    },
    
    // Estilos para seção de IA melhorada
    aiRecommendationsSection: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        marginTop: 24,
        elevation: 4,
        shadowColor: '#357a4c',
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        borderWidth: 1,
        borderColor: '#e8f5e8',
    },
    aiHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    aiHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    aiAvatarContainer: {
        position: 'relative',
        marginRight: 12,
    },
    aiStatusDot: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#4caf50',
        borderWidth: 2,
        borderColor: '#fff',
    },
    aiHeaderText: {
        flex: 1,
    },
    aiTitle: {
        fontSize: 18,
        fontFamily: 'Montserrat-Bold',
        color: '#357a4c',
        marginBottom: 2,
    },
    aiSubtitle: {
        fontSize: 14,
        fontFamily: 'Montserrat',
        color: '#666',
        lineHeight: 18,
    },
    aiLoadingIndicator: {
        marginLeft: 8,
    },
    aiProcessIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff3e0',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#ffcc02',
    },
    aiProcessIconContainer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    aiProcessText: {
        fontSize: 13,
        fontFamily: 'Montserrat',
        color: '#e65100',
        flex: 1,
        lineHeight: 16,
    },
    aiLoadingContainer: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    aiLoadingContent: {
        alignItems: 'center',
    },
    aiLoadingSteps: {
        width: '100%',
    },
    aiLoadingStep: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    aiLoadingStepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#e0e0e0',
        marginRight: 8,
    },
    aiLoadingStepActive: {
        backgroundColor: '#4caf50',
    },
    aiLoadingStepText: {
        fontSize: 13,
        fontFamily: 'Montserrat',
        color: '#666',
    },
    relatedCardImproved: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 12,
        marginHorizontal: 6,
        width: 160,
        elevation: 3,
        shadowColor: '#357a4c',
        shadowOpacity: 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        borderWidth: 1,
        borderColor: '#e8f5e8',
        position: 'relative',
    },
    aiRecommendationBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: '#ffa726',
        borderRadius: 10,
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
        elevation: 2,
    },
    relatedImageImproved: {
        width: '100%',
        height: 90,
        borderRadius: 12,
        backgroundColor: '#eafbe6',
        marginBottom: 10,
    },
    relatedInfoImproved: {
        flex: 1,
    },
    relatedNameImproved: {
        fontSize: 14,
        fontFamily: 'Montserrat-Bold',
        color: '#357a4c',
        marginBottom: 4,
        lineHeight: 18,
    },
    relatedSciNameImproved: {
        fontSize: 12,
        fontFamily: 'Montserrat-Italic',
        color: '#666',
        marginBottom: 8,
    },
    confidenceContainer: {
        marginTop: 4,
    },
    confidenceBar: {
        height: 4,
        backgroundColor: '#e0e0e0',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
    },
    confidenceProgress: {
        height: '100%',
        backgroundColor: '#4caf50',
        borderRadius: 2,
    },
    confidenceText: {
        fontSize: 10,
        fontFamily: 'Montserrat',
        color: '#666',
        textAlign: 'center',
    },
    aiFooter: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e8f5e8',
    },
    aiFooterText: {
        fontSize: 12,
        fontFamily: 'Montserrat',
        color: '#666',
        marginLeft: 6,
        flex: 1,
        lineHeight: 16,
    },
    
    // Estilos para estados de erro
    aiErrorContainer: {
        backgroundColor: '#ffebee',
        borderRadius: 12,
        padding: 16,
        marginVertical: 16,
        borderWidth: 1,
        borderColor: '#ffcdd2',
    },
    aiErrorContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    aiErrorText: {
        flex: 1,
        marginLeft: 12,
    },
    aiErrorTitle: {
        fontSize: 16,
        fontFamily: 'Montserrat-Bold',
        color: '#c62828',
        marginBottom: 4,
    },
    aiErrorMessage: {
        fontSize: 14,
        fontFamily: 'Montserrat',
        color: '#d32f2f',
        marginBottom: 12,
        lineHeight: 18,
    },
    aiRetryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: '#357a4c',
        alignSelf: 'flex-start',
    },
    aiRetryText: {
        fontSize: 14,
        fontFamily: 'Montserrat-Bold',
        color: '#357a4c',
        marginLeft: 6,
    },
});

export default SpeciesDetailScreen;