import { useState } from 'react';

export const useSecureInput = (initialValue = '') => {
  const [value, setValue] = useState(initialValue);
  const [isSecure, setIsSecure] = useState(true);

  const handleTextChange = (text: string) => {
    if (isSecure) {
      const currentLength = value.length;
      const newLength = text.length;
      
      if (newLength > currentLength) {
        // Adicionando caracteres - pega apenas os novos caracteres
        const newChar = text.charAt(text.length - 1);
        setValue(value + newChar);
      } else if (newLength < currentLength) {
        // Removendo caracteres
        setValue(value.slice(0, newLength));
      }
    } else {
      setValue(text);
    }
  };

  const displayValue = isSecure ? '•'.repeat(value.length) : value;

  const reset = () => {
    setValue(initialValue);
    setIsSecure(true);
  };

  return {
    value,
    displayValue,
    isSecure,
    setIsSecure,
    handleTextChange,
    reset,
  };
};