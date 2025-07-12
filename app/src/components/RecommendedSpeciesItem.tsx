import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Species, useRecommendations } from '../contexts/RecommendationsContext';
import SpeciesListItem from './SpeciesListItem';

interface RecommendedSpeciesItemProps {
  item: Species;
  onPress: () => void;
  label: string;
  groupIcon?: string;
  showFeedback?: boolean;
  recommendationId?: string;
}

const RecommendedSpeciesItem: React.FC<RecommendedSpeciesItemProps> = ({
  item,
  onPress,
  label,
  groupIcon,
  showFeedback = true,
  recommendationId
}) => {
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { submitFeedback } = useRecommendations();

  const handleRatingPress = (selectedRating: number) => {
    setRating(selectedRating);
  };

  const handleSubmitFeedback = async () => {
    if (rating === 0) {
      Alert.alert('Avaliação obrigatória', 'Por favor, selecione uma avaliação de 1 a 5 estrelas.');
      return;
    }

    if (recommendationId) {
      try {
        await submitFeedback(recommendationId, item.taxon_id, rating, feedbackText);
        setSubmitted(true);
        setShowRatingModal(false);
        Alert.alert('Obrigado!', 'O seu feedback foi enviado com sucesso.');
      } catch (error) {
        console.error('Erro ao enviar feedback:', error);
        Alert.alert('Erro', 'Não foi possível enviar o feedback. Tente novamente.');
      }
    }
  };

  const handleSpeciesPress = () => {
    onPress();
    // Registra automaticamente que o usuário clicou na recomendação
    // Este comportamento pode ser configurado
  };

  return (
    <View style={styles.container}>
      <SpeciesListItem
        item={item}
        onPress={handleSpeciesPress}
        label={label}
        groupIcon={groupIcon}
      />
      
      {/* Confiança da recomendação */}
      {item.confidence && (
        <View style={styles.confidenceContainer}>
          <Text style={styles.confidenceText}>
            Confiança: {Math.round(item.confidence * 100)}%
          </Text>
        </View>
      )}

      {/* Razão da recomendação */}
      {item.recommendation_reason && (
        <View style={styles.reasonContainer}>
          <Text style={styles.reasonText}>
            {item.recommendation_reason}
          </Text>
        </View>
      )}

      {/* Botão de feedback */}
      {showFeedback && !submitted && (
        <TouchableOpacity
          style={styles.feedbackButton}
          onPress={() => setShowRatingModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="star-outline" size={16} color="#357a4c" />
          <Text style={styles.feedbackButtonText}>Avaliar recomendação</Text>
        </TouchableOpacity>
      )}

      {submitted && (
        <View style={styles.submittedContainer}>
          <Ionicons name="checkmark-circle" size={16} color="#4caf50" />
          <Text style={styles.submittedText}>Feedback enviado</Text>
        </View>
      )}

      {/* Modal de avaliação */}
      <Modal
        visible={showRatingModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Avaliar Recomendação</Text>
            <Text style={styles.modalSubtitle}>
              Como classifica esta recomendação de {item.common_name || item.sci_name}?
            </Text>

            {/* Sistema de estrelas */}
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => handleRatingPress(star)}
                  style={styles.starButton}
                >
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={32}
                    color={star <= rating ? '#fbc02d' : '#ccc'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.ratingLabels}>
              {rating === 1 && 'Muito má'}
              {rating === 2 && 'Má'}
              {rating === 3 && 'Razoável'}
              {rating === 4 && 'Boa'}
              {rating === 5 && 'Excelente'}
            </Text>

            {/* Campo de comentário opcional */}
            <TextInput
              style={styles.feedbackInput}
              placeholder="Comentário opcional..."
              value={feedbackText}
              onChangeText={setFeedbackText}
              multiline
              numberOfLines={3}
              maxLength={500}
            />

            {/* Botões de ação */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowRatingModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSubmitFeedback}
              >
                <Text style={styles.submitButtonText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#357a4c',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  confidenceContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#f5f5f5',
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'Montserrat',
  },
  reasonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#eafbe6',
  },
  reasonText: {
    fontSize: 13,
    color: '#357a4c',
    fontFamily: 'Montserrat',
    fontStyle: 'italic',
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#f8fff6',
    borderTopWidth: 1,
    borderTopColor: '#e8f5e8',
  },
  feedbackButtonText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#357a4c',
    fontFamily: 'Montserrat',
  },
  submittedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#e8f5e8',
    borderTopWidth: 1,
    borderTopColor: '#d4edd4',
  },
  submittedText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#4caf50',
    fontFamily: 'Montserrat',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    minWidth: 300,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    fontFamily: 'Montserrat',
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  starButton: {
    padding: 4,
  },
  ratingLabels: {
    fontSize: 14,
    fontFamily: 'Montserrat',
    color: '#357a4c',
    textAlign: 'center',
    marginBottom: 20,
    minHeight: 20,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontFamily: 'Montserrat',
    fontSize: 14,
    color: '#333',
    textAlignVertical: 'top',
    marginBottom: 20,
    minHeight: 80,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  cancelButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontFamily: 'Montserrat',
    color: '#666',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#357a4c',
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  submitButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    color: '#fff',
  },
});

export default RecommendedSpeciesItem;
