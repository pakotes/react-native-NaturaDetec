import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../contexts/AuthContext';
import { API_BASE_URL } from '../../../../config';
import { doLogout } from '../../../utils/logout';
import AlertNotification from '../../../components/AlertNotification';
import PrivateScreen from '../../../components/PrivateScreen';
import { LinearGradient } from 'expo-linear-gradient';

const DeleteAccountScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
    const { setIsAuthenticated } = useAuth();
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState<{ type: string; title: string; textBody: string } | null>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.18,
                    duration: 900,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 900,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    const handleDelete = async () => {
        Alert.alert(
            'Confirmação',
            'Tem a certeza que pretende eliminar a sua conta? Esta ação é irreversível.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const token = await AsyncStorage.getItem('token');
                            const response = await fetch(`${API_BASE_URL}/auth/delete-account`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            });
                            const data = await response.json();
                            if (!response.ok) {
                                setAlert({ type: 'DANGER', title: 'Erro', textBody: data.error || 'Erro ao eliminar conta.' });
                                setLoading(false);
                                return;
                            }
                            setAlert({ type: 'SUCCESS', title: 'Conta eliminada', textBody: 'A sua conta foi eliminada com sucesso.' });
                            setTimeout(async () => {
                                await doLogout(setIsAuthenticated, setAlert, 'Conta eliminada.');
                            }, 1500);
                        } catch (err) {
                            setAlert({ type: 'DANGER', title: 'Erro', textBody: 'Erro de conexão ao eliminar conta.' });
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    return (
        <PrivateScreen navigation={navigation}>
            <View style={styles.container}>
                <View style={styles.iconRow}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <LinearGradient
                            colors={['#ffb3b3', '#e53935']}
                            start={{ x: 0.2, y: 0.2 }}
                            end={{ x: 0.8, y: 0.8 }}
                            style={styles.iconCircleGradient}
                        >
                            <Ionicons name="alert-circle-outline" size={60} color="#fff" />
                        </LinearGradient>
                    </Animated.View>
                </View>
                <Text style={styles.title}>Eliminar Conta</Text>
                <Text style={styles.info}>
                    Ao eliminar a sua conta, todos os seus dados pessoais serão removidos de forma permanente, em conformidade com o RGPD (direito ao esquecimento).
                </Text>
                <Text style={styles.warning}>
                    Esta ação é <Text style={styles.irreversible}>irreversível</Text>. Não poderá recuperar a sua conta ou dados após a eliminação.
                </Text>
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
                <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={handleDelete}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    {loading ? (
                        <ActivityIndicator color="#e53935" />
                    ) : (
                        <>
                            <Ionicons name="trash-outline" size={20} color="#e53935" style={{ marginRight: 8 }} />
                            <Text style={styles.deleteButtonText}>Eliminar Conta</Text>
                        </>
                    )}
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => navigation.goBack()}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
            </View>
        </PrivateScreen>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fff6',
        padding: 28,
        justifyContent: 'center',
    },
    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
    },
    iconCircleGradient: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: Platform.OS === 'android' ? 4 : 0,
        shadowColor: '#e53935',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    title: {
        fontSize: 22,
        color: '#357a4c',
        fontFamily: 'Montserrat-Bold',
        textAlign: 'center',
        marginBottom: 10,
    },
    info: {
        fontSize: 15,
        color: '#357a4c',
        fontFamily: 'Montserrat',
        textAlign: 'center',
        marginBottom: 16,
    },
    warning: {
        fontSize: 15,
        color: '#444',
        fontFamily: 'Montserrat-Bold',
        textAlign: 'center',
        marginBottom: 28,
    },
    irreversible: {
        color: '#e53935',
        fontWeight: 'bold',
    },
    deleteButton: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 22,
        paddingVertical: 14,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
        borderWidth: 1.5,
        borderColor: '#e53935',
    },
    deleteButtonText: {
        color: '#e53935',
        fontSize: 16,
        fontFamily: 'Montserrat-Bold',
        letterSpacing: 1,
    },
    cancelButton: {
        alignSelf: 'center',
        marginTop: 4,
        padding: 10,
    },
    cancelButtonText: {
        color: '#357a4c',
        fontSize: 15,
        fontFamily: 'Montserrat-Bold',
    },
});

export default DeleteAccountScreen;