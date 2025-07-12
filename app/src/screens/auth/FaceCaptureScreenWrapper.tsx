import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { usePhoto } from '../../contexts/PhotoContext';
import FaceCaptureScreen from '../../components/FaceCaptureScreen';
import AlertNotification from '../../components/AlertNotification';

const FaceCaptureScreenWrapper: React.FC = () => {
    const navigation = useNavigation();
    const { setPhoto } = usePhoto();
    const [alert, setAlert] = useState<{ show: boolean; type: string; title: string; textBody: string; toast: boolean }>({
        show: false, type: 'SUCCESS', title: '', textBody: '', toast: true
    });

    const handlePhotoCaptured = (photo: any) => {
        setPhoto(photo);
        setAlert({
            show: true,
            type: 'SUCCESS',
            title: 'Foto capturada',
            textBody: 'Foto capturada com sucesso!',
            toast: true,
        });
        setTimeout(() => {
            setAlert({ ...alert, show: false });
            navigation.goBack();
        }, 1000);
    };

    return (
        <>
            <FaceCaptureScreen
                title="Capturar Foto"
                instruction="Aponte o rosto para a câmara e toque no botão para capturar"
                onPhotoCaptured={handlePhotoCaptured}
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

export default FaceCaptureScreenWrapper;