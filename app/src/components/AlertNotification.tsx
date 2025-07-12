import React from 'react';
import { ALERT_TYPE, Dialog, Toast } from 'react-native-alert-notification';

type AlertNotificationProps = {
  type?: string;
  title?: string;
  textBody?: string;
  autoClose?: number;
  onPress?: () => void;
  onHide?: () => void;
  toast?: boolean;
};

const AlertNotification: React.FC<AlertNotificationProps> = ({
  type = 'SUCCESS',
  title = '',
  textBody = '',
  autoClose = 2000,
  onPress,
  onHide,
  toast = false,
}) => {
  React.useEffect(() => {
    const customStyles = {
      titleStyle: { color: '#357a4c', fontFamily: 'Montserrat-Bold', fontSize: 18 },
      textBodyStyle: { color: '#357a4c', fontFamily: 'Montserrat', fontSize: 15 },
      style: {
        borderRadius: 16,
        backgroundColor: '#e8fad7',
        shadowColor: '#357a4c',
        elevation: 4,
        paddingVertical: 16,
        paddingHorizontal: 18,
      },
      button: 'OK',
      buttonStyle: { backgroundColor: '#357a4c', borderRadius: 8 },
      buttonTextStyle: { color: '#fff', fontFamily: 'Montserrat-Bold' },
    };

    if (toast) {
      Toast.show({
        type: ALERT_TYPE[type as keyof typeof ALERT_TYPE],
        title,
        textBody,
        autoClose,
        onHide,
        ...customStyles,
      });
    } else {
      Dialog.show({
        type: ALERT_TYPE[type as keyof typeof ALERT_TYPE],
        title,
        textBody,
        autoClose,
        onHide,
        ...customStyles,
      });
    }
    return () => Dialog.hide();
  }, [type, title, textBody, autoClose, onPress, onHide, toast]);

  return null;
};

export default AlertNotification;