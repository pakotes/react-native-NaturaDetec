import React from 'react';
import { Snackbar } from 'react-native-paper';

interface SnackbarMessageProps {
  visible: boolean;
  message: string;
  onDismiss: () => void;
  duration?: number;
  color?: string;
}

const SnackbarMessage: React.FC<SnackbarMessageProps> = ({
  visible,
  message,
  onDismiss,
  duration = 1500,
  color = 'green',
}) => (
  <Snackbar
    visible={visible}
    onDismiss={onDismiss}
    duration={duration}
    style={{ backgroundColor: color }}
  >
    {message}
  </Snackbar>
);

export default SnackbarMessage;