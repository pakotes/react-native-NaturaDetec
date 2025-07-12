import React, { createContext, useContext, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../config';
import { doLogout } from '../utils/logout';
import { useAuth } from './AuthContext';

export interface Species {
  taxon_id: number;
  common_name: string;
  sci_name: string;
  image_url?: string;
  image_square_url?: string;
  image_medium_url?: string;
  group?: string;
  group_id?: string;
  description?: string;
  confidence?: number;
  recommendation_reason?: string;
}

export interface UserInteraction {
  species_id: number;
  interaction_type: string;
  confidence?: number;
  created_at: string;
}

export interface RecommendationFeedback {
  recommendation_id: string;
  species_id: number;
  rating: number;
  feedback_text?: string;
  created_at: string;
}

export interface UserInsights {
  total_interactions: number;
  favorite_groups: Array<{ group_id: string; count: number }>;
  recent_activity: UserInteraction[];
  preference_score: number;
}

type RecommendationsContextType = {
  // Estados
  recommendedSpecies: Species[];
  userInsights: UserInsights | null;
  loading: boolean;
  error: string | null;

  // Funções de recomendação
  getPersonalizedRecommendations: (limit?: number) => Promise<void>;
  getContentBasedRecommendations: (speciesId: number, limit?: number, currentGroup?: string | null) => Promise<Species[]>;
  getCollaborativeRecommendations: (limit?: number) => Promise<Species[]>;
  getHybridRecommendations: (limit?: number) => Promise<Species[]>;

  // Funções de interação
  recordUserInteraction: (speciesId: number, interactionType: string, confidence?: number) => Promise<void>;
  submitFeedback: (recommendationId: string, speciesId: number, rating: number, feedbackText?: string) => Promise<void>;

  // Funções de insights
  getUserInsights: () => Promise<void>;

  // Utilitários
  clearRecommendations: () => void;
  setError: (error: string | null) => void;
};

const RecommendationsContext = createContext<RecommendationsContextType>({
  recommendedSpecies: [],
  userInsights: null,
  loading: false,
  error: null,
  getPersonalizedRecommendations: async () => { },
  getContentBasedRecommendations: async () => [],
  getCollaborativeRecommendations: async () => [],
  getHybridRecommendations: async () => [],
  recordUserInteraction: async () => { },
  submitFeedback: async () => { },
  getUserInsights: async () => { },
  clearRecommendations: () => { },
  setError: () => { },
});

// Utilitário para fetch autenticado
async function authFetch(url: string, options: any = {}, onUnauthorized?: () => void) {
  try {
    const token = await AsyncStorage.getItem('token');
    console.log('Token obtido:', token ? 'presente' : 'ausente');

    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    console.log('Fazendo fetch para:', url);
    console.log('Headers:', { ...headers, Authorization: token ? 'Bearer [token]' : 'não definido' });

    const response = await fetch(url, { ...options, headers });

    console.log('Response status:', response.status);

    if (response.status === 401 && onUnauthorized) {
      console.log('Token inválido, fazendo logout...');
      onUnauthorized();
    }
    return response;
  } catch (error) {
    console.error('Erro no authFetch:', error);
    throw error;
  }
}

export const RecommendationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [recommendedSpecies, setRecommendedSpecies] = useState<Species[]>([]);
  const [userInsights, setUserInsights] = useState<UserInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {isAuthenticated, setIsAuthenticated } = useAuth();

  const handleUnauthorized = useCallback(() => {
    doLogout(setIsAuthenticated);
  }, [setIsAuthenticated]);

  const getPersonalizedRecommendations = useCallback(async (limit: number = 10) => {
    if (!isAuthenticated) {
      console.log('Utilizador não autenticado. Ignorando chamada para recomendações personalizadas.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log('Procurando recomendações personalizadas do backend...');

      // Usar o endpoint de recomendações principais (baseado no histórico do usuário)
      const response = await authFetch(
        `${API_BASE_URL}/api/recommendations`,
        {},
        handleUnauthorized
      );

      if (response.ok) {
        const data = await response.json();
        console.log('Recomendações personalizadas recebidas:', data.results?.length || 0);

        // Ordenar por confiança (se disponível) ou manter ordem do backend
        let results = data.results || [];
        if (results.length > 0 && results[0].recommendation_score !== undefined) {
          results = results.sort((a: any, b: any) => (b.recommendation_score || 0) - (a.recommendation_score || 0));
        }

        // Limitar resultados
        const limitedResults = results.slice(0, limit);

        // Processar resultados para o formato esperado
        const processedResults = limitedResults.map((item: any, index: number) => ({
          taxon_id: item.taxon_id,
          common_name: item.common_name,
          sci_name: item.sci_name,
          image_url: item.image_url || item.image_medium_url || item.image_square_url,
          image_square_url: item.image_square_url,
          image_medium_url: item.image_medium_url,
          group: item.group,
          confidence: item.recommendation_score || (0.95 - (index * 0.05)),
          recommendation_reason: `Baseado no seu histórico de ${item.group || 'espécies'}`
        }));

        setRecommendedSpecies(processedResults);
        console.log('Recomendações personalizadas definidas:', processedResults.length);
      } else {
        const errorData = await response.json();
        console.error('Erro no endpoint de recomendações:', errorData);
      }
    } catch (err) {
      console.error('Erro ao buscar recomendações personalizadas:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, handleUnauthorized]);

  const getContentBasedRecommendations = useCallback(async (speciesId: number, limit: number = 5, passedGroup?: string | null): Promise<Species[]> => {
    try {
      console.log('Procurandoo recomendações baseadas em conteúdo para espécie:', speciesId);
      console.log('Grupo passado como parâmetro:', passedGroup);

      // Usar o endpoint específico para recomendações baseadas em conteúdo
      const response = await authFetch(
        `${API_BASE_URL}/api/recommendations/content-based/${speciesId}?limit=${limit}`,
        {},
        handleUnauthorized
      );

      console.log('Response status do backend:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Recomendações recebidas do backend:', data.results?.length || 0);
        console.log('Estratégia usada:', data.strategy);
        console.log('Espécie de referência:', data.reference_species);

        let results = data.results || [];

        // As recomendações já vêm filtradas pelo grupo correto do backend
        // Apenas excluir a espécie atual se não foi feito no backend
        results = results.filter((item: any) => item.taxon_id !== speciesId);
        console.log('Recomendações processadas:', results.length);

        // Processar resultados para o formato esperado
        const processedResults = results.map((item: any, index: number) => ({
          taxon_id: item.taxon_id,
          common_name: item.common_name,
          sci_name: item.sci_name,
          image_url: item.image_url || item.image_medium_url || item.image_square_url,
          image_square_url: item.image_square_url,
          image_medium_url: item.image_medium_url,
          group: item.group,
          confidence: item.confidence || (0.95 - (index * 0.05)),
          recommendation_reason: item.recommendation_reason || `Baseado em similaridade de ${data.strategy || 'grupo'}`
        }));

        console.log('Recomendações processadas:', processedResults.map((r: any) => ({
          taxon_id: r.taxon_id,
          common_name: r.common_name,
          group: r.group,
          confidence: Math.round(r.confidence * 100) + '%'
        })));

        return processedResults;

      } else {
        const errorText = await response.text();
        console.error('Erro na resposta do backend:', response.status, errorText);

        // Usar fallback em caso de erro
        console.log('Usando fallback devido a erro no backend...');
        return await generateFallbackRecommendations(speciesId, limit, passedGroup);
      }

    } catch (err) {
      console.error('Erro ao buscar recomendações do backend:', err);

      // Fallback em caso de erro de conexão
      console.log('Usando fallback devido a erro de conexão...');
      return await generateFallbackRecommendations(speciesId, limit, passedGroup);
    }
  }, [handleUnauthorized]);

  // Função para gerar recomendações de fallback usando API iNaturalist
  const generateFallbackRecommendations = async (speciesId: number, limit: number, currentGroup?: string | null): Promise<Species[]> => {
    console.log('🔄 Gerando fallback via iNaturalist para grupo:', currentGroup);

    try {
      // Se não temos grupo, não podemos fazer fallback adequado
      if (!currentGroup) {
        console.log('Sem grupo definido para fallback, retornando array vazio');
        return [];
      }

      // Mapear grupos para iconic_taxa da API iNaturalist
      const iconicTaxaMap: { [key: string]: string } = {
        'Plantae': 'Plantae',
        'Aves': 'Aves',
        'Mammalia': 'Mammalia',
        'Reptilia': 'Reptilia',
        'Amphibia': 'Amphibia',
        'Actinopterygii': 'Actinopterygii',
        'Insecta': 'Insecta',
        'Arachnida': 'Arachnida',
        'Mollusca': 'Mollusca'
      };

      const iconicTaxon = iconicTaxaMap[currentGroup] || currentGroup;
      console.log('Fallback - Mapeamento de grupo:', currentGroup, '->', iconicTaxon);

      // Buscar espécies populares do mesmo grupo para fallback
      const fallbackResponse = await fetch(
        `https://api.inaturalist.org/v1/taxa?rank=species&iconic_taxa=${iconicTaxon}&order=observations_count&per_page=${limit * 3}&locale=pt`
      );

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        console.log('Fallback - Espécies obtidas do iNaturalist:', fallbackData.results?.length || 0);

        if (fallbackData.results && fallbackData.results.length > 0) {
          // Filtrar espécies válidas e excluir a atual
          const validSpecies = fallbackData.results
            .filter((item: any) =>
              item.id !== speciesId &&
              item.preferred_common_name &&
              item.default_photo?.medium_url &&
              item.iconic_taxon_name === currentGroup
            )
            .slice(0, limit);

          console.log('Fallback - Espécies válidas filtradas:', validSpecies.length);

          const results = validSpecies.map((item: any) => ({
            taxon_id: item.id,
            common_name: item.preferred_common_name || item.name,
            sci_name: item.name,
            image_url: item.default_photo?.medium_url,
            image_square_url: item.default_photo?.square_url,
            image_medium_url: item.default_photo?.medium_url,
            group: item.iconic_taxon_name,
            confidence: 0.75 + Math.random() * 0.15 // 75-90% de confiança para fallback
          }));

          console.log('Fallback - Resultados processados:', results.map((r: any) => ({
            taxon_id: r.taxon_id,
            common_name: r.common_name,
            group: r.group,
            confidence: Math.round(r.confidence * 100) + '%'
          })));

          return results;
        }
      } else {
        console.error('Fallback - Erro na API iNaturalist:', fallbackResponse.status);
      }

    } catch (err) {
      console.error('Fallback - Erro ao buscar dados:', err);
    }

    // Se tudo falhou, retornar array vazio
    console.log('Fallback - Todas as tentativas falharam, retornando array vazio');
    return [];
  };

  const getCollaborativeRecommendations = useCallback(async (limit: number = 10): Promise<Species[]> => {
    try {
      console.log('Buscando recomendações colaborativas via backend...');

      const response = await authFetch(
        `${API_BASE_URL}/api/recommendations`,
        {},
        handleUnauthorized
      );

      console.log('Response status colaborativas:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Recomendações colaborativas obtidas:', data.results?.length || 0);

        // Processar e limitar resultados
        const results = (data.results || []).slice(0, limit).map((item: any, index: number) => ({
          taxon_id: item.taxon_id,
          common_name: item.common_name,
          sci_name: item.sci_name,
          image_url: item.image_url || item.image_medium_url || item.image_square_url,
          image_square_url: item.image_square_url,
          image_medium_url: item.image_medium_url,
          group: item.group,
          confidence: item.recommendation_score || (0.90 - (index * 0.05)),
          recommendation_reason: `Recomendado por utilizadores com gostos similares`
        }));

        console.log('Recomendações colaborativas processadas:', results.length);
        return results;
      } else {
        const errorData = await response.text();
        console.error('Erro ao buscar recomendações colaborativas:', response.status, errorData);

        // Retornar dados de fallback em caso de erro
        console.log('🔄 Usando dados de fallback para recomendações colaborativas...');
        return await generateFallbackRecommendations(67890, limit);
      }
    } catch (err) {
      console.error('Erro de conexão ao buscar recomendações colaborativas:', err);
      console.log('Usando dados de fallback devido a erro de conexão...');
      return await generateFallbackRecommendations(67890, limit);
    }
  }, [handleUnauthorized]);

  const getHybridRecommendations = useCallback(async (limit: number = 10): Promise<Species[]> => {
    try {
      console.log('🔀 Buscando recomendações híbridas via backend avançado...');

      // Usar endpoint avançado para recomendações híbridas
      const response = await authFetch(
        `${API_BASE_URL}/api/recommendations/advanced`,
        {
          method: 'POST',
          body: JSON.stringify({
            algorithm: 'hybrid',
            limit: limit
          })
        },
        handleUnauthorized
      );

      console.log('📡 Response status híbridas:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Recomendações híbridas obtidas:', data.results?.length || 0);
        console.log('Algoritmo usado:', data.algorithm);
        console.log('Explicação:', data.explanation);

        // Processar e limitar resultados
        const results = (data.results || []).slice(0, limit).map((item: any, index: number) => ({
          taxon_id: item.taxon_id,
          common_name: item.common_name,
          sci_name: item.sci_name,
          image_url: item.image_url || item.image_medium_url || item.image_square_url,
          image_square_url: item.image_square_url,
          image_medium_url: item.image_medium_url,
          group: item.group,
          confidence: item.recommendation_score || (0.95 - (index * 0.03)),
          recommendation_reason: data.explanation || `Recomendação híbrida baseada em múltiplos algoritmos`
        }));

        console.log('Recomendações híbridas processadas:', results.length);
        return results;
      } else {
        const errorData = await response.text();
        console.error('Erro ao buscar recomendações híbridas:', response.status, errorData);

        // Fallback para endpoint simples
        console.log('Usando endpoint simples como fallback...');
        return await getCollaborativeRecommendations(limit);
      }
    } catch (err) {
      console.error('Erro de conexão ao buscar recomendações híbridas:', err);
      console.log('Usando fallback devido a erro de conexão...');
      return await generateFallbackRecommendations(12345, limit);
    }
  }, [handleUnauthorized, getCollaborativeRecommendations]);

  const getUserInsights = useCallback(async () => {
    try {
      console.log('[INSIGHTS] Buscando insights do utilizador...');
      const response = await authFetch(
        `${API_BASE_URL}/api/user/insights`,
        {},
        handleUnauthorized
      );

      if (response.ok) {
        const data = await response.json();
        console.log('[INSIGHTS] Dados recebidos:', data);
        setUserInsights(data);
      } else {
        console.error('[INSIGHTS] Erro ao buscar insights do utilizador:', response.status);
      }
    } catch (err) {
      console.error('[INSIGHTS] Erro ao buscar insights do utilizador:', err);
    }
  }, [handleUnauthorized]);

  const recordUserInteraction = useCallback(async (speciesId: number, interactionType: string, confidence?: number) => {
    try {
      console.log('📝 [INTERAÇÃO] Registando interação:', { speciesId, interactionType });
      const response = await authFetch(
        `${API_BASE_URL}/api/user/history`,
        {
          method: 'POST',
          body: JSON.stringify({
            taxon_id: speciesId,
            action: interactionType,
          }),
        },
        handleUnauthorized
      );

      if (response.ok) {
        console.log('✅ [INTERAÇÃO] Interação registada com sucesso');
        // Recarregar insights imediatamente após registar interação
        await getUserInsights();
      } else {
        console.error('[INTERAÇÃO] Erro ao registar interação do utilizador');
      }
    } catch (err) {
      console.error('[INTERAÇÃO] Erro ao registar interação do utilizador:', err);
    }
  }, [handleUnauthorized, getUserInsights]);

  const submitFeedback = useCallback(async (recommendationId: string, speciesId: number, rating: number, feedbackText?: string) => {
    try {
      console.log('📊 Enviando feedback de recomendação:', { recommendationId, speciesId, rating, feedbackText });

      const response = await authFetch(
        `${API_BASE_URL}/api/recommendations/rating-feedback`,
        {
          method: 'POST',
          body: JSON.stringify({
            recommendation_id: recommendationId,
            species_id: speciesId,
            rating: rating,
            feedback_text: feedbackText || '',
          }),
        },
        handleUnauthorized
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao enviar feedback');
      }

      const data = await response.json();
      console.log('Feedback enviado com sucesso:', data);

    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
      throw err; // Re-throw para que o componente possa lidar com o erro
    }
  }, [handleUnauthorized]);

  const clearRecommendations = useCallback(() => {
    setRecommendedSpecies([]);
    setUserInsights(null);
    setError(null);
  }, []);

  const value: RecommendationsContextType = {
    recommendedSpecies,
    userInsights,
    loading,
    error,
    getPersonalizedRecommendations,
    getContentBasedRecommendations,
    getCollaborativeRecommendations,
    getHybridRecommendations,
    recordUserInteraction,
    submitFeedback,
    getUserInsights,
    clearRecommendations,
    setError,
  };

  return (
    <RecommendationsContext.Provider value={value}>
      {children}
    </RecommendationsContext.Provider>
  );
};

export const useRecommendations = () => useContext(RecommendationsContext);
