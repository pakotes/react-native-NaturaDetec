import React from 'react';
import { TouchableOpacity, Text, StyleSheet, GestureResponderEvent, StyleProp, TextStyle, ViewStyle } from 'react-native';

interface CustomButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
}

const CustomButton: React.FC<CustomButtonProps> = ({ title, onPress, style, textStyle, disabled }) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        style,
        disabled && styles.buttonDisabled // Aplica estilo quando desativado
      ]}
      onPress={onPress}
      disabled={disabled} // Passa a prop disabled
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Text style={[styles.buttonText, textStyle, disabled && styles.textDisabled]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 8,
  },
  buttonDisabled: {
    backgroundColor: '#b5b5b5',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Montserrat-Bold',
  },
  textDisabled: {
    color: '#e0e0e0',
  },
});

export default CustomButton;