import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { API_BASE_URL } from '../../../config';
import { useAuth } from '../../contexts/AuthContext';
import FaceCaptureScreen from '../../components/FaceCaptureScreen';
import { usePhoto } from '../../contexts/PhotoContext';
import AlertNotification from '../../components/AlertNotification';

const FaceLoginScreenWrapper: React.FC = () => {
    const { photo, setPhoto } = usePhoto();
    const [localPhoto, setLocalPhoto] = useState<any>(null);
    const { setIsAuthenticated } = useAuth();
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState<{ show: boolean; type: string; title: string; textBody: string; toast: boolean }>({
        show: false, type: 'DANGER', title: '', textBody: '', toast: true
    });
    const navigation = useNavigation();

    // Marca o início da sessão de login facial
    const [loginSessionStartedAt, setLoginSessionStartedAt] = useState<number>(Date.now());

    useEffect(() => {
        setPhoto(null);
        setLocalPhoto(null);
        setLoginSessionStartedAt(Date.now());
    }, []);

    // Só aceita fotos capturadas depois de entrar nesta tela
    useEffect(() => {
        if (photo && photo.timestamp && photo.timestamp > loginSessionStartedAt) {
            setLocalPhoto(photo);
        }
    }, [photo, loginSessionStartedAt]);

    // Efeito para login facial
    useEffect(() => {
        const handleFaceLogin = async () => {
            if (!localPhoto) return;
            setLoading(true);
            setAlert({ show: false, type: 'DANGER', title: '', textBody: '', toast: true });
            const formData = new FormData();
            formData.append('photo', {
                uri: localPhoto.uri,
                name: 'photo.jpg',
                type: 'image/jpeg',
            } as any);

            try {
                const response = await fetch(`${API_BASE_URL}/auth/face-login`, {
                    method: 'POST',
                    body: formData,
                });
                const data = await response.json();
                if (response.ok && data.token) {
                    await AsyncStorage.setItem('token', data.token);
                    setIsAuthenticated(true);
                    setPhoto(null);
                    setLocalPhoto(null);
                    setAlert({
                        show: true,
                        type: 'SUCCESS',
                        title: 'Sucesso',
                        textBody: 'Olá, login efetuado com sucesso!',
                        toast: true,
                    });
                    setTimeout(() => {
                        setAlert({ ...alert, show: false });
                    }, 1200);
                } else {
                    setPhoto(null);
                    setLocalPhoto(null);
                    setAlert({
                        show: true,
                        type: 'DANGER',
                        title: 'Erro',
                        textBody: data.error || 'Face não reconhecida.',
                        toast: true,
                    });
                }
            } catch (err) {
                setPhoto(null);
                setLocalPhoto(null);
                setAlert({
                    show: true,
                    type: 'DANGER',
                    title: 'Erro',
                    textBody: 'Erro de conexão com o servidor.',
                    toast: true,
                });
            } finally {
                setLoading(false);
            }
        };

        handleFaceLogin();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localPhoto]);

    return (
        <>
            <FaceCaptureScreen
                title="Login Facial"
                instruction="Aponte o rosto para a câmara e toque no botão para login facial"
                loading={loading}
                error={alert.show && alert.type === 'DANGER' ? alert.textBody : null}
                onPhotoCaptured={(photo) => setPhoto(photo)} 
                onRetry={() => {
                    setPhoto(null);
                    setLocalPhoto(null);
                    setAlert({ ...alert, show: false });
                }}
            />
            {alert.show && (
                <AlertNotification
                    type={alert.type}
                    title={alert.title}
                    textBody={alert.textBody}
                    toast={alert.toast}
                    onHide={() => setAlert({ ...alert, show: false })}
                />
            )}
        </>
    );
};

export default FaceLoginScreenWrapper;