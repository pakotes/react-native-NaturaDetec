import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Image, Dimensions, ScrollView, Animated, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import AlertNotification from '../../components/AlertNotification';
import { API_BASE_URL } from '../../../config';
import { useNavigation } from '@react-navigation/native';

const NUM_AUTO_PHOTOS = 5;
const AUTO_PHOTO_INTERVAL = 1200; // ms

const API_ENDPOINT = `${API_BASE_URL}/api/identify-species`;
const SPECIES_DETAILS_ENDPOINT = `${API_BASE_URL}/api/species`;

const ExploreSpeciesScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView | null>(null);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [autoMode, setAutoMode] = useState(false);
    const [autoPhotos, setAutoPhotos] = useState<string[]>([]);
    const [autoProgress, setAutoProgress] = useState(0);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [alert, setAlert] = useState<{ type: string; title: string; textBody: string } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [connectionError, setConnectionError] = useState(false);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [attemptCount, setAttemptCount] = useState(0);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const cameraHeightAnim = useRef(new Animated.Value(height * 0.5)).current;
    const isCapturing = useRef(false);
    const isBatchCapturing = useRef(false);

    // Animação de pulso para botões
    const startPulseAnimation = useCallback(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [pulseAnim]);

    // Animação de fade para feedback visual
    const showFeedback = useCallback(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    // Inicia animação ao carregar
    useEffect(() => {
        startPulseAnimation();
        showFeedback();
    }, [startPulseAnimation, showFeedback]);

    // Ajuste dinâmico da altura da câmera
    useEffect(() => {
        const hasContent = results.length > 0 || loading || autoMode;
        const targetHeight = hasContent ? height * 0.35 : height * 0.5; // Reduz para 35% quando há conteúdo

        Animated.timing(cameraHeightAnim, {
            toValue: targetHeight,
            duration: 500, // Duração um pouco maior para transição mais suave
            useNativeDriver: false, // false porque estamos animando height
        }).start();
    }, [results.length, loading, autoMode, cameraHeightAnim]);

    // Cleanup ao desmontar o componente
    useEffect(() => {
        return () => {
            // Limpar thumbnails da cache ao sair da tela
            thumbnails.forEach(async (uri) => {
                try {
                    await FileSystem.deleteAsync(uri, { idempotent: true });
                } catch (e) {
                    // Silently handle cleanup errors
                }
            });
        };
    }, []);

    if (!permission) return <View style={styles.container}><ActivityIndicator size="large" color="#357a4c" /></View>;

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.permissionContainer}>
                    <Ionicons name="camera-outline" size={64} color="#357a4c" />
                    <Text style={styles.permissionTitle}>Permissão da Câmara</Text>
                    <Text style={styles.permissionText}>
                        Para identificar espécies, precisamos de acesso à sua câmara.
                    </Text>
                    <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                        <Text style={styles.permissionButtonText}>Conceder Permissão</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // Função para buscar detalhes da espécie via API (iNaturalist)
    const fetchSpeciesDetails = async (taxon_id: string, token: string | null) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(`${SPECIES_DETAILS_ENDPOINT}/${taxon_id}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                if (res.status >= 500) {
                    setConnectionError(true);
                }
                return null;
            }
            setConnectionError(false);
            return await res.json();
        } catch (err) {
            setConnectionError(true);
            return null;
        }
    };

    // --- FOTO SIMPLES ---
    const handleCapturePhoto = async () => {
        if (isCapturing.current) return;
        isCapturing.current = true;
        if (cameraRef.current && results.length === 0) {
            setLoading(true);
            setIsProcessing(true);
            setResults([]);
            setThumbnails([]);
            setConnectionError(false);

            try {
                const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
                setThumbnails([photo.uri]);
                setAlert({ type: 'SUCCESS', title: 'Foto capturada!', textBody: 'Processando identificação...' });

                const token = await AsyncStorage.getItem('token');
                // Converter base64 para ficheiro temporário
                const fileUri = FileSystem.cacheDirectory + `photo_${Date.now()}.jpg`;
                await FileSystem.writeAsStringAsync(fileUri, photo.base64!, { encoding: FileSystem.EncodingType.Base64 });

                const formData = new FormData();
                formData.append('images', {
                    uri: fileUri,
                    name: 'photo.jpg',
                    type: 'image/jpeg',
                } as any);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        Authorization: `Bearer ${token}`,
                    },
                    body: formData,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Erro da API: ${response.status}`);
                }

                const data = await response.json();
                console.log('Dados recebidos da API:', data);

                // Garante sempre array de resultados
                let resultsArr = [];
                if (Array.isArray(data.results)) {
                    resultsArr = data.results;
                } else if (data.results) {
                    resultsArr = [data.results];
                } else if (Array.isArray(data)) {
                    resultsArr = data;
                } else {
                    resultsArr = [data];
                }

                console.log('Resultados processados:', resultsArr);

                // Buscar detalhes para cada resultado
                const detailedResults = await Promise.all(
                    resultsArr.map(async (item: any) => {
                        if (item.taxon_id) {
                            const details = await fetchSpeciesDetails(item.taxon_id, token);
                            return { ...item, ...details };
                        }
                        return item;
                    })
                );

                console.log('Resultados finais com detalhes:', detailedResults);
                setResults(detailedResults);

                // Feedback de sucesso
                setAlert({
                    type: 'SUCCESS',
                    title: 'Identificação concluída!',
                    textBody: `${detailedResults.length} resultado(s) encontrado(s)`
                });

                // Limpa ficheiro temporário
                await FileSystem.deleteAsync(fileUri, { idempotent: true });
            } catch (err: any) {
                if (err?.name === 'AbortError') {
                    setAlert({ type: 'WARNING', title: 'Tempo esgotado', textBody: 'A identificação demorou muito tempo. Tente novamente.' });
                } else {
                    setAlert({ type: 'DANGER', title: 'Erro na identificação', textBody: 'Não foi possível identificar a espécie. Verifique a conexão.' });
                }
                setThumbnails([]);
                setAttemptCount(prev => prev + 1);
            }
            setLoading(false);
            setIsProcessing(false);
        }
        isCapturing.current = false;
    };

    // --- FOTO AUTOMÁTICA (BATCH) ---
    const startAutoPhoto = async () => {
        if(isBatchCapturing.current || results.length > 0) return;
        isBatchCapturing.current = true;
        if (results.length > 0) return;
        setAutoPhotos([]);
        setAutoProgress(0);
        setAutoMode(true);
        setIsProcessing(true);
        setResults([]);
        setThumbnails([]);
        setConnectionError(false);

        let count = 0;
        const photos: string[] = [];
        const uris: string[] = [];

        // Feedback inicial
        setAlert({ type: 'INFO', title: 'Modo automático iniciado', textBody: 'Capturando múltiplas fotos para melhor identificação...' });

        const takeNextPhoto = async () => {
            if (cameraRef.current && count < NUM_AUTO_PHOTOS) {
                try {
                    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
                    if (photo.base64) {
                        photos.push(photo.base64);
                        uris.push(photo.uri);
                    }
                    setAutoProgress(photos.length);
                    setThumbnails([...uris]);
                    count++;

                    // Feedback de progresso
                    if (count < NUM_AUTO_PHOTOS) {
                        setTimeout(takeNextPhoto, AUTO_PHOTO_INTERVAL);
                    } else {
                        setAutoMode(false);
                        setAutoPhotos(photos);
                        setAlert({ type: 'INFO', title: 'Fotos capturadas!', textBody: 'Processando identificação das espécies...' });
                        await sendBatchPhotos(photos, uris);
                    }
                } catch (err) {
                    setAutoMode(false);
                    setIsProcessing(false);
                    setAlert({ type: 'DANGER', title: 'Erro na captura', textBody: 'Erro ao tirar foto automática.' });
                }
            }
        };

        takeNextPhoto();
        isBatchCapturing.current = false;
    };

    const sendBatchPhotos = async (photos: string[], uris: string[]) => {
        setLoading(true);
        try {
            const token = await AsyncStorage.getItem('token');
            const formData = new FormData();
            // Converter cada base64 para ficheiro temporário e adicionar ao FormData
            const fileUris: string[] = [];
            for (let i = 0; i < photos.length; i++) {
                const fileUri = FileSystem.cacheDirectory + `batch_photo_${Date.now()}_${i}.jpg`;
                await FileSystem.writeAsStringAsync(fileUri, photos[i], { encoding: FileSystem.EncodingType.Base64 });
                fileUris.push(fileUri);
                formData.append('images', {
                    uri: fileUri,
                    name: `photo${i + 1}.jpg`,
                    type: 'image/jpeg',
                } as any);
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000); // Mais tempo para batch

            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Erro da API: ${response.status}`);
            }

            const data = await response.json();
            console.log('Dados batch recebidos da API:', data);

            // Garante sempre array de resultados
            let resultsArr = [];
            if (Array.isArray(data.results)) {
                resultsArr = data.results;
            } else if (data.results) {
                resultsArr = [data.results];
            } else if (Array.isArray(data)) {
                resultsArr = data;
            } else {
                resultsArr = [data];
            }

            // Buscar detalhes para cada resultado
            const detailedResults = await Promise.all(
                resultsArr.map(async (item: any) => {
                    if (item.taxon_id) {
                        const details = await fetchSpeciesDetails(item.taxon_id, token);
                        return { ...item, ...details };
                    }
                    return item;
                })
            );

            console.log('Resultados batch finais:', detailedResults);
            setResults(detailedResults);

            // Feedback de sucesso aprimorado
            setAlert({
                type: 'SUCCESS',
                title: 'Análise em lote concluída!',
                textBody: `${detailedResults.length} espécie(s) identificada(s) a partir de ${photos.length} fotos`
            });

            // Limpa ficheiros temporários
            for (const uri of fileUris) {
                await FileSystem.deleteAsync(uri, { idempotent: true });
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                setAlert({ type: 'WARNING', title: 'Tempo esgotado', textBody: 'A análise em lote demorou muito tempo. Tente com menos fotos.' });
            } else {
                setAlert({ type: 'DANGER', title: 'Erro na análise', textBody: 'Não foi possível processar as fotos em lote. Verifique a conexão.' });
            }
        }
        setLoading(false);
        setIsProcessing(false);
        setAutoPhotos([]);
        setAutoProgress(0);
    };

    // Permite cancelar o modo automático
    const cancelAutoMode = () => {
        setAutoMode(false);
        setIsProcessing(false);
        setAutoPhotos([]);
        setAutoProgress(0);
        setThumbnails([]);
        setAlert({ type: 'INFO', title: 'Cancelado', textBody: 'Modo automático cancelado pelo utilizador.' });
    };

    // Limpa resultados ao iniciar nova identificação
    const clearResults = () => {
        setResults([]);
        setThumbnails([]);
        setAutoMode(false);
        setIsProcessing(false);
        setAutoPhotos([]);
        setAutoProgress(0);
        setConnectionError(false);
        setAttemptCount(0);
        setAlert(null); // Limpa também os alertas
    };

    // Função utilitária para garantir string
    const getSpeciesName = (item: any) => {
        return item.common_name ||
            item.speciesName ||
            item.sci_name ||
            item.scientific_name ||
            item.species ||
            item.name ||
            (item.preferred_common_name && item.preferred_common_name !== '' ? item.preferred_common_name : null) ||
            "Desconhecida";
    };

    const getSpeciesImage = (item: any) => {
        return item.image_url ||
            item.imageUrl ||
            (item.default_photo && item.default_photo.medium_url) ||
            (item.taxon_photos && item.taxon_photos[0] && item.taxon_photos[0].photo && item.taxon_photos[0].photo.medium_url) ||
            null;
    };

    // --- FlatList para resultados ---
    const renderResultItem = ({ item, index }: { item: any, index: number }) => {
        const isKnown = getSpeciesName(item) !== "Desconhecida";
        const confidence = item.confidence ? (Number(item.confidence) * 100).toFixed(1) : null;
        const isHighConfidence = confidence ? Number(confidence) >= 70 : false;

        // Tentar diferentes campos para nome científico
        const scientificName = item.sci_name || item.scientific_name || item.name;

        return (
            <Animated.View style={{ opacity: fadeAnim }}>
                <TouchableOpacity
                    style={[
                        styles.resultCard,
                        isHighConfidence && styles.highConfidenceCard,
                        !isKnown && styles.unknownSpeciesCard
                    ]}
                    activeOpacity={isKnown ? 0.90 : 1}
                    onPress={() => {
                        if (isKnown && item.taxon_id) {
                            navigation.navigate('SpeciesDetail', { taxon_id: item.taxon_id });
                        }
                    }}
                    disabled={!isKnown || !item.taxon_id}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {getSpeciesImage(item) ? (
                            <Image
                                source={{ uri: getSpeciesImage(item) }}
                                style={styles.resultImage}
                                onError={() => console.log('Erro ao carregar imagem:', getSpeciesImage(item))}
                            />
                        ) : (
                            <View style={[styles.resultImage, styles.placeholderImage]}>
                                <Ionicons name="image-outline" size={48} color="#bdbdbd" />
                            </View>
                        )}
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={[styles.resultName, !isKnown && styles.unknownText]}>
                                {getSpeciesName(item)}
                            </Text>
                            {scientificName && scientificName !== getSpeciesName(item) && (
                                <Text style={styles.resultSci}>{scientificName}</Text>
                            )}
                            {(item.group || item.iconic_taxon_name || item.rank) && (
                                <View style={styles.classBadge}>
                                    <Text style={styles.classBadgeText}>
                                        {item.group || item.iconic_taxon_name || item.rank}
                                    </Text>
                                </View>
                            )}
                            {confidence && (
                                <View style={styles.confidenceRow}>
                                    <Text style={[
                                        styles.confidenceText,
                                        isHighConfidence ? styles.highConfidenceText : styles.lowConfidenceText
                                    ]}>
                                        Confiança: {confidence}%
                                    </Text>
                                    {isHighConfidence && (
                                        <Ionicons name="checkmark-circle" size={16} color="#4CAF50" style={{ marginLeft: 6 }} />
                                    )}
                                </View>
                            )}
                            {item.observations_count !== undefined && (
                                <Text style={styles.obsCount}>
                                    Observações: {item.observations_count.toLocaleString()}
                                </Text>
                            )}
                            {!isKnown && (
                                <Text style={styles.unknownHint}>
                                    Espécie não identificada
                                </Text>
                            )}
                            {/* Debug info - remover depois */}
                            {__DEV__ && (
                                <Text style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                                    ID: {item.taxon_id || 'N/A'} | Confiança: {item.confidence || 'N/A'}
                                </Text>
                            )}
                        </View>
                        {isKnown && item.taxon_id && (
                            <Ionicons name="chevron-forward" size={28} color="#357a4c" style={{ marginLeft: 8 }} />
                        )}
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Área da Câmara com altura animada */}
            <Animated.View style={[styles.cameraArea, { height: cameraHeightAnim }]}>
                <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                />
                {(results.length > 0) && (
                    <View style={styles.cameraOverlay}>
                        <Ionicons name="checkmark-circle" size={64} color="#4CAF50" style={{ marginBottom: 16 }} />
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center' }}>
                            Identificação concluída
                        </Text>
                        <Text style={{ color: '#fff', fontSize: 14, marginTop: 8, textAlign: 'center', opacity: 0.9 }}>
                            Confira os resultados abaixo
                        </Text>
                    </View>
                )}

                {/* Botões da câmara com labels e animações */}
                <View style={styles.cameraControls}>
                    <View style={styles.controlGroup}>
                        <Animated.View style={{ transform: [{ scale: (results.length === 0 && !loading && !autoMode) ? pulseAnim : 1 }] }}>
                            <TouchableOpacity
                                style={[styles.captureBtn, (loading || autoMode || results.length > 0) && styles.disabledBtn]}
                                onPress={() => { clearResults(); handleCapturePhoto(); }}
                                disabled={loading || autoMode || results.length > 0}
                            >
                                <Ionicons name="camera" size={28} color="#fff" />
                            </TouchableOpacity>
                        </Animated.View>
                        <Text style={styles.controlLabel}>Foto única</Text>
                    </View>

                    <View style={styles.controlGroup}>
                        <Animated.View style={{ transform: [{ scale: (results.length === 0 && !loading && !autoMode) ? pulseAnim : 1 }] }}>
                            <TouchableOpacity
                                style={[styles.captureBtn, styles.batchBtn, (autoMode || results.length > 0) && styles.disabledBtn]}
                                onPress={() => { clearResults(); startAutoPhoto(); }}
                                disabled={loading || autoMode || results.length > 0}
                            >
                                <Ionicons name="images" size={28} color="#fff" />
                            </TouchableOpacity>
                        </Animated.View>
                        <Text style={styles.controlLabel}>Modo automático</Text>
                    </View>
                </View>

                {/* Loading overlay melhorado com melhor feedback */}
                {(loading || autoMode) && (
                    <View style={styles.loadingOverlay}>
                        <View style={styles.loadingContent}>
                            <ActivityIndicator size="large" color="#fff" />
                            {autoMode ? (
                                <>
                                    <Text style={styles.loadingTitle}>Capturando fotos...</Text>
                                    <Text style={styles.loadingSubtitle}>
                                        {autoProgress}/{NUM_AUTO_PHOTOS} fotos
                                    </Text>
                                    <View style={styles.progressBar}>
                                        <Animated.View
                                            style={[
                                                styles.progressFill,
                                                { width: `${(autoProgress / NUM_AUTO_PHOTOS) * 100}%` }
                                            ]}
                                        />
                                    </View>
                                    <Text style={styles.progressPercentage}>
                                        {Math.round((autoProgress / NUM_AUTO_PHOTOS) * 100)}%
                                    </Text>
                                    <TouchableOpacity onPress={cancelAutoMode} style={styles.cancelBtn}>
                                        <Ionicons name="close-circle" size={24} color="#fff" />
                                        <Text style={styles.cancelBtnText}>Cancelar</Text>
                                    </TouchableOpacity>
                                </>
                            ) : isProcessing ? (
                                <>
                                    <Text style={styles.loadingTitle}>Analisando imagem...</Text>
                                    <Text style={styles.loadingSubtitle}>
                                        {connectionError ? 'Tentando reconectar...' : 'Processando com IA...'}
                                    </Text>
                                    {connectionError && (
                                        <View style={styles.loadingWarning}>
                                            <Ionicons name="warning-outline" size={20} color="#ff9800" />
                                            <Text style={styles.loadingWarningText}>Conexão lenta</Text>
                                        </View>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Text style={styles.loadingTitle}>Preparando...</Text>
                                    <Text style={styles.loadingSubtitle}>Aguarde um momento</Text>
                                </>
                            )}
                        </View>
                    </View>
                )}
            </Animated.View>

            {/* Thumbnails das fotos tiradas em batch */}
            {thumbnails.length > 0 && results.length === 0 && (
                <ScrollView horizontal style={styles.thumbnailsRow} contentContainerStyle={{ alignItems: 'center' }}>
                    {thumbnails.map((uri, idx) => (
                        <Image
                            key={idx}
                            source={{ uri }}
                            style={styles.thumbnail}
                        />
                    ))}
                </ScrollView>
            )}

            {/* Área de Conteúdo */}
            <View style={styles.contentArea}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContentContainer}
                >
                    {/* Botões de ação no topo da área de conteúdo */}
                    <View style={styles.contentHeader}>
                        <Text style={styles.contentTitle}>
                            {results.length > 0 ? 'Resultados da Identificação' : 'Identificar Espécies'}
                        </Text>
                        <View style={styles.actionButtons}>
                            {results.length > 0 ? (
                                <TouchableOpacity style={styles.actionBtn} onPress={clearResults}>
                                    <Ionicons name="refresh" size={20} color="#357a4c" />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={styles.actionBtn}
                                    onPress={() => setShowHelpModal(true)}
                                >
                                    <Ionicons name="help-circle-outline" size={20} color="#357a4c" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Indicador de erro de conexão */}
                    {connectionError && (
                        <View style={styles.connectionErrorBanner}>
                            <Ionicons name="warning-outline" size={20} color="#ff9800" />
                            <Text style={styles.connectionErrorText}>
                                Problemas de conexão detectados
                            </Text>
                        </View>
                    )}

                    {/* Resultados (FlatList) */}
                    {results.length > 0 ? (
                        <>
                            <View style={styles.resultHeader}>
                                <Text style={styles.resultTitle}>
                                    {results.length === 1 ? "Espécie identificada:" : "Resultados (batch de fotos):"}
                                </Text>
                                {results.length > 1 && (
                                    <Text style={styles.resultSubtitle}>
                                        {results.filter(r => getSpeciesName(r) !== "Desconhecida").length} de {results.length} identificadas
                                    </Text>
                                )}
                            </View>
                            {results.length > 0 && (
                                <View style={styles.resultsListContainer}>
                                    <FlatList
                                        data={results}
                                        keyExtractor={(_, idx) => idx.toString()}
                                        renderItem={renderResultItem}
                                        ItemSeparatorComponent={() => <View style={{ height: 18 }} />}
                                        contentContainerStyle={{ paddingBottom: 24 }}
                                        showsVerticalScrollIndicator={false}
                                        scrollEnabled={false} // Desabilita scroll interno da FlatList
                                        ListEmptyComponent={() => (
                                            <View style={styles.emptyResultsContainer}>
                                                <Ionicons name="search-outline" size={48} color="#ccc" />
                                                <Text style={styles.emptyResultsText}>
                                                    Nenhum resultado encontrado
                                                </Text>
                                                <Text style={styles.emptyResultsSubtext}>
                                                    Tente tirar uma nova foto com melhor iluminação
                                                </Text>
                                            </View>
                                        )}
                                    />
                                </View>
                            )}
                            <TouchableOpacity style={styles.clearBtn} onPress={clearResults}>
                                <Ionicons name="refresh" size={20} color="#357a4c" />
                                <Text style={styles.clearBtnText}>Nova identificação</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <View style={styles.instructionsContainer}>
                            <Ionicons name="camera-outline" size={64} color="#357a4c" style={{ opacity: 0.7 }} />
                            <Text style={styles.infoText}>
                                Aponte a câmara para uma planta ou animal e escolha foto ou modo automático para identificar.
                            </Text>

                            {/* Dicas condicionais baseadas no número de tentativas */}
                            {attemptCount > 2 && (
                                <View style={styles.helpContainer}>
                                    <Text style={styles.helpTitle}>💡 Dicas para melhores resultados:</Text>
                                    <View style={styles.instructionTips}>
                                        <View style={styles.tip}>
                                            <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                                            <Text style={styles.tipText}>Mantenha a espécie bem enquadrada</Text>
                                        </View>
                                        <View style={styles.tip}>
                                            <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                                            <Text style={styles.tipText}>Use boa iluminação natural</Text>
                                        </View>
                                        <View style={styles.tip}>
                                            <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                                            <Text style={styles.tipText}>Evite fundos confusos</Text>
                                        </View>
                                        <View style={styles.tip}>
                                            <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                                            <Text style={styles.tipText}>Capture características distintivas</Text>
                                        </View>
                                    </View>
                                </View>
                            )}

                            {attemptCount <= 2 && (
                                <View style={styles.instructionTips}>
                                    <View style={styles.tip}>
                                        <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                                        <Text style={styles.tipText}>Mantenha a espécie bem enquadrada</Text>
                                    </View>
                                    <View style={styles.tip}>
                                        <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                                        <Text style={styles.tipText}>Use boa iluminação natural</Text>
                                    </View>
                                    <View style={styles.tip}>
                                        <Ionicons name="checkmark-circle-outline" size={16} color="#4CAF50" />
                                        <Text style={styles.tipText}>Evite fundos confusos</Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </ScrollView>

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
            </View>

            {/* Modal de Ajuda */}
            <Modal
                visible={showHelpModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowHelpModal(false)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>💡 Como identificar espécies</Text>
                        <TouchableOpacity
                            style={styles.modalCloseBtn}
                            onPress={() => setShowHelpModal(false)}
                        >
                            <Ionicons name="close" size={24} color="#357a4c" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                        <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>📸 Dicas para melhores fotos</Text>
                            <View style={styles.modalTipsList}>
                                <View style={styles.modalTip}>
                                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>Mantenha a espécie bem enquadrada e centralizada</Text>
                                </View>
                                <View style={styles.modalTip}>
                                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>Use boa iluminação natural, evite sombras</Text>
                                </View>
                                <View style={styles.modalTip}>
                                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>Evite fundos confusos ou com muitos elementos</Text>
                                </View>
                                <View style={styles.modalTip}>
                                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>Capture características distintivas (flores, folhas, padrões)</Text>
                                </View>
                                <View style={styles.modalTip}>
                                    <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>Mantenha a câmara estável para evitar desfoque</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>📷 Modos de captura</Text>
                            <View style={styles.modalModeCard}>
                                <View style={styles.modalModeHeader}>
                                    <Ionicons name="camera" size={24} color="#357a4c" />
                                    <Text style={styles.modalModeTitle}>Foto única</Text>
                                </View>
                                <Text style={styles.modalModeDescription}>
                                    Ideal para identificações rápidas quando tem uma boa foto da espécie.
                                    Recomendado para quando a espécie está bem visível e em boa luz.
                                </Text>
                            </View>

                            <View style={styles.modalModeCard}>
                                <View style={styles.modalModeHeader}>
                                    <Ionicons name="images" size={24} color="#2e6b40" />
                                    <Text style={styles.modalModeTitle}>Modo automático</Text>
                                </View>
                                <Text style={styles.modalModeDescription}>
                                    Captura automaticamente 5 fotos com intervalo de 1.2 segundos.
                                    Melhor para espécies em movimento ou quando quer maximizar as chances de identificação.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>🎯 Melhores resultados</Text>
                            <View style={styles.modalTipsList}>
                                <View style={styles.modalTip}>
                                    <Ionicons name="leaf-outline" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>
                                        <Text style={styles.modalTipBold}>Plantas:</Text> Fotografe flores, folhas e frutos distintivos
                                    </Text>
                                </View>
                                <View style={styles.modalTip}>
                                    <Ionicons name="bug-outline" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>
                                        <Text style={styles.modalTipBold}>Animais:</Text> Capture padrões, cores e características únicas
                                    </Text>
                                </View>
                                <View style={styles.modalTip}>
                                    <Ionicons name="eye-outline" size={20} color="#4CAF50" />
                                    <Text style={styles.modalTipText}>
                                        <Text style={styles.modalTipBold}>Aves:</Text> Foque no bico, plumagem e postura
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.modalSection}>
                            <Text style={styles.modalSectionTitle}>⚠️ Problemas comuns</Text>
                            <View style={styles.modalTipsList}>
                                <View style={styles.modalWarningTip}>
                                    <Ionicons name="warning-outline" size={20} color="#ff9800" />
                                    <Text style={styles.modalTipText}>Espécie muito distante ou pequena na foto</Text>
                                </View>
                                <View style={styles.modalWarningTip}>
                                    <Ionicons name="warning-outline" size={20} color="#ff9800" />
                                    <Text style={styles.modalTipText}>Iluminação inadequada (contraluz, sombras)</Text>
                                </View>
                                <View style={styles.modalWarningTip}>
                                    <Ionicons name="warning-outline" size={20} color="#ff9800" />
                                    <Text style={styles.modalTipText}>Fundo com muitos elementos que confundem a IA</Text>
                                </View>
                                <View style={styles.modalWarningTip}>
                                    <Ionicons name="warning-outline" size={20} color="#ff9800" />
                                    <Text style={styles.modalTipText}>Foto desfocada ou com movimento</Text>
                                </View>
                            </View>
                        </View>
                    </ScrollView>
                </SafeAreaView>
            </Modal>
        </View>
    );
};

const { height } = Dimensions.get('window');
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#eafbe6' },

    // Estilos para permissão de câmara
    permissionContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        backgroundColor: '#fff',
    },
    permissionTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#357a4c',
        marginTop: 16,
        marginBottom: 8,
        textAlign: 'center',
    },
    permissionText: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 24,
    },
    permissionButton: {
        backgroundColor: '#357a4c',
        borderRadius: 24,
        paddingVertical: 12,
        paddingHorizontal: 24,
        elevation: 3,
        shadowColor: '#357a4c',
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    permissionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
    },

    // Estilos da câmara e controles
    cameraArea: {
        backgroundColor: '#000',
        justifyContent: 'flex-end',
        alignItems: 'center'
    },
    cameraOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000b',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    cameraControls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingBottom: 20,
        paddingHorizontal: 20,
        gap: 40,
        zIndex: 5,
    },
    controlGroup: {
        alignItems: 'center',
    },
    controlLabel: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 8,
        textAlign: 'center',
        textShadowColor: '#000',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },

    buttonRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 16, gap: 24 },
    captureBtn: {
        backgroundColor: '#357a4c',
        borderRadius: 32,
        padding: 18,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        marginHorizontal: 8,
        shadowColor: '#357a4c',
        shadowOpacity: 0.13,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    batchBtn: {
        backgroundColor: '#2e6b40',
    },
    disabledBtn: {
        backgroundColor: '#888',
        opacity: 0.6,
    },

    // Estilos de loading e progresso
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0008',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
    loadingContent: {
        alignItems: 'center',
        backgroundColor: '#000a',
        borderRadius: 16,
        padding: 24,
        minWidth: 200,
    },
    loadingTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 16,
        textAlign: 'center',
    },
    loadingSubtitle: {
        color: '#fff',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
        opacity: 0.9,
    },
    progressBar: {
        width: 160,
        height: 4,
        backgroundColor: '#ffffff40',
        borderRadius: 2,
        marginTop: 16,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#4CAF50',
        borderRadius: 2,
    },

    recordingText: {
        color: '#fff',
        fontSize: 18,
        marginTop: 10,
        fontWeight: 'bold',
    },
    cancelBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 18,
        backgroundColor: '#e53935aa',
        borderRadius: 18,
        paddingVertical: 6,
        paddingHorizontal: 16,
    },
    cancelBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 6,
    },

    // Estilos de thumbnails e conteúdo
    thumbnailsRow: {
        backgroundColor: '#eafbe6',
        paddingVertical: 8,
        paddingHorizontal: 4,
        minHeight: 60,
        maxHeight: 70,
    },
    thumbnail: {
        width: 56,
        height: 56,
        borderRadius: 8,
        marginHorizontal: 6,
        borderWidth: 2,
        borderColor: '#357a4c',
    },
    contentArea: {
        flex: 1,
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        paddingTop: 16,
    },
    resultTitle: { fontSize: 18, fontWeight: 'bold', color: '#357a4c', marginBottom: 8 },
    resultCard: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 16,
        shadowColor: '#357a4c',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.13,
        shadowRadius: 8,
        elevation: 3,
        marginBottom: 2,
        marginHorizontal: 2,
    },
    resultImage: {
        width: 90,
        height: 90,
        borderRadius: 12,
        backgroundColor: '#cdebc1',
    },
    resultName: { fontSize: 20, color: '#245c36', fontWeight: 'bold' },
    resultSci: { fontSize: 15, color: '#245c36', fontStyle: 'italic', marginTop: 2 },
    resultGroup: { fontSize: 14, color: '#357a4c', marginTop: 2 },
    confidenceText: { fontSize: 14, color: '#357a4c', marginTop: 2 },
    obsCount: { fontSize: 13, color: '#357a4c', marginTop: 2 },
    classBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#cdebc1',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginTop: 4,
        marginBottom: 2,
    },
    classBadgeText: {
        color: '#245c36',
        fontWeight: 'bold',
        fontSize: 13,
        letterSpacing: 0.5,
    },
    infoText: { color: '#357a4c', fontSize: 16, textAlign: 'center', marginTop: 20 },
    clearBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 18,
        alignSelf: 'center',
        backgroundColor: '#eafbe6',
        borderRadius: 18,
        paddingVertical: 8,
        paddingHorizontal: 18,
        borderWidth: 1,
        borderColor: '#357a4c',
    },
    clearBtnText: {
        color: '#357a4c',
        fontSize: 16,
        marginLeft: 8,
        fontWeight: 'bold',
    },

    // Novos estilos para melhorias de UX
    highConfidenceCard: {
        borderWidth: 2,
        borderColor: '#4CAF50',
        backgroundColor: '#f8fff8',
    },
    unknownSpeciesCard: {
        borderWidth: 1,
        borderColor: '#ff9800',
        backgroundColor: '#fff8f0',
        opacity: 0.9,
    },
    placeholderImage: {
        backgroundColor: '#e0e0e0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    unknownText: {
        color: '#666',
        fontStyle: 'italic',
    },
    confidenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    highConfidenceText: {
        color: '#4CAF50',
        fontWeight: 'bold',
    },
    lowConfidenceText: {
        color: '#ff9800',
    },
    unknownHint: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
        marginTop: 2,
    },
    connectionErrorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff3cd',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#ff9800',
    },
    connectionErrorText: {
        color: '#856404',
        fontSize: 14,
        marginLeft: 8,
        fontWeight: '500',
    },
    resultHeader: {
        marginBottom: 12,
    },
    resultSubtitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    instructionsContainer: {
        alignItems: 'center',
        padding: 20,
        paddingBottom: 40, // Mais espaço no final
        marginTop: 10,
    },
    instructionTips: {
        marginTop: 24,
        alignSelf: 'stretch',
        backgroundColor: '#fafafa',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    tip: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        paddingLeft: 16,
    },
    tipText: {
        color: '#666',
        fontSize: 15,
        marginLeft: 12,
        flex: 1,
    },

    // Estilos adicionais para loading
    progressPercentage: {
        color: '#fff',
        fontSize: 12,
        marginTop: 8,
        fontWeight: '600',
    },
    loadingWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        backgroundColor: '#ff980030',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    loadingWarningText: {
        color: '#ff9800',
        fontSize: 12,
        marginLeft: 6,
        fontWeight: '600',
    },

    // Estilos para botão de ajuda e dicas
    helpBtn: {
        padding: 8,
        borderRadius: 16,
        backgroundColor: '#eafbe6',
    },
    helpContainer: {
        backgroundColor: '#f8fff8',
        borderRadius: 16,
        padding: 20,
        marginTop: 24,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: '#4CAF50',
        alignSelf: 'stretch',
        shadowColor: '#4CAF50',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    helpTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#357a4c',
        marginBottom: 12,
        textAlign: 'center',
    },

    // Estilos para header do conteúdo
    contentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    contentTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#357a4c',
        flex: 1,
    },
    actionButtons: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    actionBtn: {
        padding: 8,
        borderRadius: 16,
        backgroundColor: '#eafbe6',
        marginLeft: 8,
    },

    // Estilos para resultados vazios
    emptyResultsContainer: {
        alignItems: 'center',
        padding: 40,
        marginTop: 20,
    },
    emptyResultsText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#666',
        marginTop: 16,
        textAlign: 'center',
    },
    emptyResultsSubtext: {
        fontSize: 14,
        color: '#999',
        marginTop: 8,
        textAlign: 'center',
        lineHeight: 20,
    },

    // Estilos para scroll e layout melhorado
    scrollContentContainer: {
        flexGrow: 1,
        paddingBottom: 20,
    },
    resultsListContainer: {
        flex: 1,
        minHeight: 200, // Garante altura mínima para os resultados
    },

    // Estilos do Modal de Ajuda
    modalContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#357a4c',
        flex: 1,
    },
    modalCloseBtn: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#eafbe6',
    },
    modalContent: {
        flex: 1,
        paddingHorizontal: 20,
    },
    modalSection: {
        marginBottom: 24,
        paddingTop: 16,
    },
    modalSectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#357a4c',
        marginBottom: 12,
    },
    modalTipsList: {
        gap: 12,
    },
    modalTip: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#f8fff8',
        padding: 12,
        borderRadius: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#4CAF50',
    },
    modalWarningTip: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#fff8f0',
        padding: 12,
        borderRadius: 12,
        borderLeftWidth: 3,
        borderLeftColor: '#ff9800',
    },
    modalTipText: {
        fontSize: 15,
        color: '#333',
        marginLeft: 10,
        flex: 1,
        lineHeight: 20,
    },
    modalTipBold: {
        fontWeight: 'bold',
        color: '#357a4c',
    },
    modalModeCard: {
        backgroundColor: '#f8fff8',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#c8f59d',
    },
    modalModeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    modalModeTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#357a4c',
        marginLeft: 8,
    },
    modalModeDescription: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
});

export default ExploreSpeciesScreen;