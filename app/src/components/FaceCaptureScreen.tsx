import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../contexts/PhotoContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

interface FaceCaptureScreenProps {
    loading?: boolean;
    title?: string;
    instruction?: string;
    error?: string | null;
    onRetry?: () => void;
    onPhotoCaptured?: (photo: any) => void;
}

const FaceCaptureScreen: React.FC<FaceCaptureScreenProps> = ({
    loading = false,
    title = 'Capturar Foto',
    instruction = 'Aponte o rosto para a câmara e toque no botão para capturar',
    error = null,
    onRetry,
    onPhotoCaptured,
}) => {
    const insets = useSafeAreaInsets();
    const cameraRef = useRef<CameraView | null>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const { photo, setPhoto } = usePhoto();
    const navigation = useNavigation();

    // Estado para ativar/desativar a câmara
    const [isCameraActive, setIsCameraActive] = useState(true);

    useFocusEffect(
        useCallback(() => {
            setIsCameraActive(true); // ativa ao entrar
            return () => setIsCameraActive(false); // desativa ao sair
        }, [])
    );

    // Pulso no botão
    const pulseAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (!loading) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [loading]);

    // Anel animado (radar)
    const ringAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!loading) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(ringAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
                    Animated.timing(ringAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
                ])
            ).start();
        } else {
            ringAnim.setValue(0);
        }
    }, [loading]);
    const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2] });
    const ringOpacity = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

    // Fade-in artístico
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();
    }, []);

    if (!permission) return <View />;
    if (!permission.granted) {
        requestPermission();
        return <Text>Sem permissão para usar a câmara.</Text>;
    }

    const handleTakePicture = async () => {
        if (cameraRef.current) {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
            // Adiciona timestamp ao objeto photo
            const photoWithTimestamp = { ...photo, timestamp: Date.now() };
            if (onPhotoCaptured) onPhotoCaptured(photoWithTimestamp);
        }
    };

    return (
        <View style={styles.container}>
            {/* Bloco fade-in */}
            <Animated.View
                style={{
                    position: 'absolute',
                    top: 24,
                    alignSelf: 'center',
                    alignItems: 'center',
                    zIndex: 10,
                    opacity: fadeAnim,
                }}
            >
                <Ionicons name="person-circle-outline" size={80} color="#c8f59d" style={{ marginBottom: 8 }} />
                <Text style={{ color: '#fff', fontSize: 20, fontFamily: 'Montserrat-Bold', textShadowColor: '#357a4c', textShadowRadius: 4 }}>
                    {title}
                </Text>
            </Animated.View>

            {/* Círculo de alinhamento para o rosto */}
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    top: '22%',
                    left: '15%',
                    width: '70%',
                    height: '56%',
                    borderRadius: 999,
                    borderWidth: 3,
                    borderColor: 'rgba(53,122,76,0.4)',
                    alignSelf: 'center',
                    zIndex: 10,
                }}
            />

            {/* Só renderiza a câmara se estiver ativa */}
            {isCameraActive && (
                <CameraView
                    style={{ flex: 1 }}
                    ref={cameraRef}
                    facing="front"
                />
            )}

            {/* Overlay com botão animado */}
            <View style={[styles.overlay, { paddingBottom: insets.bottom + 24 }]}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    {/* Anel animado */}
                    <Animated.View
                        style={{
                            position: 'absolute',
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            borderWidth: 3,
                            borderColor: '#88a67c',
                            opacity: ringOpacity,
                            transform: [{ scale: ringScale }],
                        }}
                        pointerEvents="none"
                    />
                    {/* Botão com pulso e transparência */}
                    <Animated.View style={{ transform: [{ scale: loading ? 1 : pulseAnim }] }}>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: 'rgba(53,122,76,0.85)', opacity: loading ? 0.6 : 1 }]}
                            onPress={handleTakePicture}
                            disabled={loading}
                            accessibilityLabel="Tirar foto"
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Ionicons name="camera" size={36} color="#fff" />}
                        </TouchableOpacity>
                    </Animated.View>
                </View>
                <View style={styles.infoBox}>
                    <Text style={styles.info}>{instruction}</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000'
    },
    overlay: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    button: {
        borderRadius: 50,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#357a4c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    infoBox: {
        marginTop: 20,
        backgroundColor: 'rgba(53, 122, 76, 0.7)',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 18,
        maxWidth: '90%',
    },
    info: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        fontFamily: 'Montserrat',
        textShadowColor: '#000',
        textShadowRadius: 2,
    },
});

export default FaceCaptureScreen;