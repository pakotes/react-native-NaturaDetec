import { TextInput, StyleSheet, TextInputProps, View, Text } from 'react-native';

// Definição das props esperadas pelo campo de texto personalizado
interface CustomTextInputProps extends TextInputProps {
  label?: string; // Rótulo opcional acima do campo
  error?: string; // Mensagem de erro opcional
  leftIcon?: React.ReactNode; // Ícone opcional à esquerda
  rightIcon?: React.ReactNode; // Ícone opcional à direita
  onChangeText?: (text: string) => void; // Função opcional para lidar com mudanças de texto  
  onBlur?: () => void; // Função opcional para lidar com o evento de perda de foco
  onFocus?: () => void; // Função opcional para lidar com o evento de foco  
  value?: string; // Valor do campo de texto
  placeholder?: string; // Texto de espaço reservado    
}

/**
 * Componente de campo de texto.
 */
const CustomTextInput: React.FC<CustomTextInputProps> = ({ label, error, leftIcon, rightIcon, style, ...props }) => {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputRow, error ? { borderColor: '#e53935' } : { borderColor: '#ccc' },]}>
        {leftIcon && <View style={styles.icon}>{leftIcon}</View>} 
        <TextInput style={[styles.input, style]}placeholderTextColor="#357a4c99" {...props} />
        {rightIcon && <View style={styles.icon}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

// Estilos padrão do campo de texto
const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    width: '100%',
  },
  label: {
    marginBottom: 4,
    color: '#357a4c',
    fontWeight: 'bold',
    fontFamily: 'Montserrat-Bold',
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  icon: {
    marginHorizontal: 4,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#357a4c',
    fontFamily: 'Montserrat',
    backgroundColor: 'transparent',
  },
  error: {
    marginTop: 4,
    color: '#e53935',
    fontSize: 12,
    fontFamily: 'Montserrat',
  },
});

export default CustomTextInput;