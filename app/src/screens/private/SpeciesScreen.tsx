import React, { useState, useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useGroups } from '../../contexts/GroupsContext';
import PrivateScreen from '../../components/PrivateScreen';
import ScreenHeader from '../../components/ScreenHeader';
import BottomTabBar from '../../components/BottomTabBar';
import AlertNotification from '../../components/AlertNotification';
import SpeciesListItem from '../../components/SpeciesListItem';
import GroupIcon from '../../components/GroupIcon';
import { doLogout } from '../../utils/logout';
import { API_BASE_URL } from '../../../config';

type Group = {
    id: string;
    label: string;
    icon: string;
    color: string;
    ancestor_ids: number[];
};

type Species = {
    taxon_id: number;
    common_name: string;
    sci_name: string;
    image_url?: string;
    image_square_url?: string;
    image_medium_url?: string;
    class?: string;
    group?: string;
    family?: string;
    conservation_status?: string;
    // Campos opcionais para detalhes completos
    description?: string;
    description_generated?: boolean;
    all_names?: Array<{name: string, locale: string}>;
    observations_count?: number;
    wikipedia_url?: string;
};

const SpeciesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { setIsAuthenticated } = useAuth();
    const { groups, loading: loadingGroups } = useGroups();
    const [search, setSearch] = useState('');
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const [species, setSpecies] = useState<Species[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [alert, setAlert] = useState<{ type: string; title: string; textBody: string } | null>(null);
    const [favorites, setFavorites] = useState<number[]>([]);

    // Buscar favoritos do utilizador
    useFocusEffect(
        React.useCallback(() => {
            const fetchFavorites = async () => {
                const token = await AsyncStorage.getItem('token');
                const res = await fetch(`${API_BASE_URL}/api/favorites`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setFavorites((data.favorites || []).map((f: any) => Number(f.taxon_id)));
            };
            fetchFavorites();
        }, [])
    );

    // Animação do grupo selecionado
    useEffect(() => {
        if (!selectedGroups.length) {
            pulseAnim.setValue(1);
            return;
        }
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        ).start();
        return () => pulseAnim.setValue(1);
    }, [selectedGroups]);

    // Buscar espécies ao mudar de grupo ou pesquisa
    useEffect(() => {
        setSpecies([]);
        setPage(1);
        setHasMore(true);
        fetchSpecies(1);
    }, [selectedGroups, search]);

    // Renderização dos grupos (categorias)
    const renderGroup = ({ item }: { item: Group }) => {
        const selected = selectedGroups.includes(item.id);
        const baseColor = item.color || '#eafbe6';
        const circleBg = selected ? baseColor : baseColor + '22';
        const borderColor = selected ? baseColor : baseColor + '55';

        return (
            <TouchableOpacity
                style={styles.groupBtn}
                onPress={() => {
                    setSelectedGroups(selected
                        ? selectedGroups.filter(g => g !== item.id)
                        : [...selectedGroups, item.id]);
                }}
                activeOpacity={0.85}
            >
                <Animated.View
                    style={[
                        styles.groupCircle,
                        {
                            backgroundColor: circleBg,
                            borderColor: borderColor,
                            transform: [{ scale: selected ? pulseAnim : 1 }],
                            elevation: selected ? 4 : 1,
                            shadowColor: baseColor,
                            shadowOpacity: selected ? 0.18 : 0,
                            shadowRadius: selected ? 6 : 0,
                        }
                    ]}
                >
                    <GroupIcon
                        icon={item.icon}
                        size={26}
                        color={selected ? '#fff' : '#245c36'}
                    />
                </Animated.View>
                <Text
                    style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: selected ? baseColor : '#357a4c',
                        fontFamily: selected ? 'Montserrat-Bold' : 'Montserrat-Thin',
                        textAlign: 'center',
                    }}
                >
                    {item.label}
                </Text>
            </TouchableOpacity>
        );
    };

    // Buscar espécies da API
    const fetchSpecies = async (
        nextPage = 1
    ) => {
        if (loadingMore || (!hasMore && nextPage !== 1)) return;
        if (nextPage === 1) setLoading(true);
        setLoadingMore(true);
        try {
            const per_page = 10;
            let url = `${API_BASE_URL}/api/species?page=${nextPage}&per_page=${per_page}`;
            if (selectedGroups.length > 0) url += `&group_ids=${selectedGroups.join(',')}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const token = await AsyncStorage.getItem('token');
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401) {
                doLogout(setIsAuthenticated, setAlert)
                setLoading(false);
                setLoadingMore(false);
                return;
            }
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                setSpecies(prev => {
                    const results: Species[] = Array.isArray(data.results) ? data.results as Species[] : [];
                    const all: Species[] = nextPage === 1 ? results : [...prev, ...results];
                    const unique: Species[] = Array.from(new Map(all.map((item: Species) => [item.taxon_id, item])).values());
                    return unique;
                });
                setPage(nextPage);
                setHasMore(data.results.length === per_page);
            } else {
                if (nextPage === 1) setSpecies([]);
                setHasMore(false);
            }
        } catch {
            if (nextPage === 1) setSpecies([]);
            setHasMore(false);
        }
        setLoading(false);
        setLoadingMore(false);
    };

    // Chips de filtros ativos (multi-grupos)
    const renderActiveFilters = () => (
        <View style={styles.filterBar}>
            {selectedGroups.map(groupId => {
                const group = groups.find(g => g.id === groupId);
                return (
                    <View key={groupId} style={[styles.filterChip, styles.chipCategory]}>
                        <Ionicons name="pricetag" size={15} color="#357a4c" style={styles.chipIcon} />
                        <Text style={styles.chipTextCategory}>{group?.label || groupId}</Text>
                        <TouchableOpacity onPress={() => setSelectedGroups(selectedGroups.filter(g => g !== groupId))}>
                            <Ionicons name="close-circle" size={15} color="#e53935" style={styles.chipClose} />
                        </TouchableOpacity>
                    </View>
                );
            })}
        </View>
    );

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

    return (
        <PrivateScreen navigation={navigation}>
            <LinearGradient
                colors={['#eafbe6', '#f8fff6']}
                style={{ flex: 1 }}
            >
                <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
                    <ScreenHeader
                        title="Espécies"
                    />
                    <View style={[styles.container, { paddingBottom: 24 + insets.bottom }]}>
                        {/* Pesquisa */}
                        <View style={styles.searchBar}>
                            <Ionicons name="search" size={22} color="#357a4c" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Pesquisar espécies..."
                                value={search}
                                onChangeText={setSearch}
                                placeholderTextColor="#357a4c99"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {search.length > 0 && (
                                <TouchableOpacity onPress={() => setSearch('')}>
                                    <Ionicons name="close-circle" size={20} color="#357a4c" style={{ marginLeft: 6 }} />
                                </TouchableOpacity>
                            )}
                        </View>
                        {/* Grupos dinâmicos */}
                        <View style={{ marginBottom: 18 }}>
                            {loadingGroups ? (
                                <ActivityIndicator size="small" color="#357a4c" />
                            ) : (
                                <FlatList
                                    data={groups}
                                    horizontal
                                    keyExtractor={item => item.id}
                                    renderItem={renderGroup}
                                    contentContainerStyle={{ paddingHorizontal: 2, paddingVertical: 8 }}
                                    showsHorizontalScrollIndicator={false}
                                />
                            )}
                        </View>
                        <View style={{ marginLeft: 2 }}>
                            <Text style={styles.sectionTitle}>Todas as Espécies</Text>
                            {renderActiveFilters()}
                        </View>
                        {loading && page === 1 ? (
                            <ActivityIndicator size="large" color="#357a4c" style={{ marginTop: 24 }} />
                        ) : (
                            <FlatList
                                data={species.filter(item => item && item.taxon_id != null)}
                                keyExtractor={(item, idx) =>
                                    item.taxon_id != null ? item.taxon_id.toString() : `no-id-${idx}`
                                }
                                renderItem={({ item }: { item: Species }) => (
                                    <SpeciesListItem
                                        item={item}
                                        onPress={() => navigation.navigate('SpeciesDetail', { 
                                            taxon_id: item.taxon_id,
                                            species: item,
                                            group: item.group,
                                            groupLabel: getGroupLabel(item.group)
                                        })}
                                        label={getGroupLabel(item.group)}
                                        groupIcon={String(getGroupIcon(item.group) || 'default')}
                                        isFavorite={favorites.includes(Number(item.taxon_id))}
                                    />
                                )}
                                getItemLayout={(data, index) => (
                                    { length: 84, offset: 84 * index, index }
                                )}
                                initialNumToRender={10}
                                windowSize={7}
                                style={{ flex: 1 }}
                                contentContainerStyle={{ paddingBottom: 74 }}
                                onEndReached={() => {
                                    if (hasMore && !loadingMore) fetchSpecies(page + 1);
                                }}
                                onEndReachedThreshold={0.2}
                                ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#357a4c" /> : null}
                                ListEmptyComponent={
                                    <View style={{ alignItems: 'center', marginTop: 32 }}>
                                        <Text style={{ color: '#888', fontFamily: 'Montserrat-Thin', textAlign: 'center' }}>
                                            Nenhuma espécie encontrada.
                                        </Text>
                                    </View>
                                }
                            />
                        )}
                    </View>
                    <BottomTabBar navigation={navigation} active="Species" />
                </SafeAreaView>
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
            </LinearGradient>
        </PrivateScreen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: 'transparent',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 28,
        paddingVertical: 10,
        paddingHorizontal: 18,
        marginBottom: 18,
        marginTop: 2,
        elevation: 3,
        shadowColor: '#357a4c',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        borderWidth: 1,
        borderColor: '#c8f59d',
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        marginLeft: 10,
        color: '#357a4c',
        backgroundColor: 'transparent',
        paddingVertical: 4,
        fontFamily: 'Montserrat-Thin',
    },
    groupBtn: {
        alignItems: 'center',
        marginHorizontal: 10,
        minWidth: 64,
    },
    groupCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        marginBottom: 0,
    },
    filterBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#c8f59d',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0,
        elevation: 3,
    },
    filterBar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        marginBottom: 6,
        flexWrap: 'wrap',
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 8,
        marginBottom: 4,
        elevation: 1,
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
    chipCategory: {
        backgroundColor: '#eafbe6',
        borderWidth: 1,
        borderColor: '#c8f59d',
    },
    chipTextCategory: {
        fontSize: 13,
        color: '#357a4c',
        fontFamily: 'Montserrat-Bold',
        marginRight: 4,
    },
    chipIcon: {
        marginRight: 4,
    },
    chipClose: {
        marginLeft: 2,
    },
    sectionTitle: {
        fontSize: 19,
        fontFamily: 'Montserrat-Bold',
        marginBottom: 4,
        marginLeft: 2,
        color: '#357a4c',
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
        elevation: 2,
        shadowColor: '#357a4c',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        borderLeftWidth: 4,
        borderLeftColor: '#c8f59d',
    },
    listKingdom: {
        fontSize: 13,
        color: '#8E9A9A',
        marginTop: 2,
        fontFamily: 'Montserrat-Thin',
    },
    listThumb: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#eafbe6',
    },
    listCommon: {
        fontFamily: 'Montserrat-Bold',
        fontSize: 15,
        color: '#357a4c',
    },
    listSci: {
        fontFamily: 'Montserrat-Thin',
        fontSize: 13,
        color: '#245c36',
        fontStyle: 'italic',
    }
});

export default SpeciesScreen;