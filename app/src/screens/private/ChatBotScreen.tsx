import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown from 'react-native-markdown-display';
import PrivateScreen from '../../components/PrivateScreen';
import BottomTabBar from '../../components/BottomTabBar';
import { API_BASE_URL } from '../../../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '../../contexts/UserContext';
import BotIcon from '../../assets/images/BotIcon.svg';

type GroupInfo = {
  id: string;
  name: string;
  label: string;
  icon: string;
  color: string;
};

type SpeciesInfo = {
  taxon_id: number;
  common_name: string;
  sci_name: string;
  image_url?: string;
  group?: string;
};

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp?: number;
  botType?: 'llm2';
  isTyping?: boolean;
  ragUsed?: boolean;
  ragDocumentsCount?: number;
  speciesInfo?: SpeciesInfo[];
};

const BOT_VALUE = 'llm2';
const BOT_ENDPOINT = '/api/llm2';
const BOT_SYSTEM_PROMPT = `És o NaturaBot, um assistente especializado em biodiversidade e espécies naturais que responde sempre em português europeu.

COMPETÊNCIAS PRINCIPAIS:
- Especialista em fauna e flora (aves, mamíferos, répteis, anfíbios, peixes, insetos, plantas)
- Identificação e classificação taxonómica de espécies
- Ecologia, habitats, comportamento e conservação
- Distribuição geográfica e características morfológicas

MODO DE RESPOSTA:
- Usa informação científica indexada quando disponível (indica sempre quando usas dados específicos da base)
- Quando não tens dados específicos indexados, sê transparente sobre essa limitação
- Dá respostas estruturadas, claras e educativas
- Usa terminologia científica adequada mas acessível
- IMPORTANTE: Quando falares sobre espécies específicas, menciona sempre o nome comum e científico completo (ex: "pintassilgo (Carduelis carduelis)")
- Inclui nomes científicos e comuns quando relevante para facilitar a identificação visual

CONTEXTO DA APP:
- Os utilizadores podem fotografar espécies para identificação
- Podem guardar favoritos e receber recomendações personalizadas
- Tens acesso a uma base de dados com informação científica detalhada
- A aplicação pode mostrar imagens e links para detalhes das espécies mencionadas

Responde de forma rigorosa, educativa e envolvente, promovendo o interesse pela natureza e conservação. Sempre que possível, menciona espécies específicas pelos seus nomes completos.`;

// Estilos customizados para renderização Markdown
const markdownStyles = {
  heading1: {
    fontSize: 18,
    fontWeight: '700' as '700',
    color: '#2c5530',
    marginVertical: 8,
  },
  heading2: {
    fontSize: 16,
    fontWeight: '600' as '600',
    color: '#357a4c',
    marginVertical: 6,
  },
  heading3: {
    fontSize: 15,
    fontWeight: '600' as '600',
    color: '#357a4c',
    marginVertical: 4,
  },
  body: {
    fontSize: 14,
    color: '#2c5530',
    lineHeight: 20,
  },
  strong: {
    fontWeight: '700' as '700',
    color: '#2c5530',
  },
  em: {
    fontStyle: 'italic' as 'italic',
    color: '#357a4c',
  },
  list_item: {
    fontSize: 14,
    color: '#2c5530',
    marginVertical: 2,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  paragraph: {
    fontSize: 14,
    color: '#2c5530',
    lineHeight: 20,
    marginVertical: 2,
  },
  text: {
    fontSize: 14,
    color: '#2c5530',
    lineHeight: 20,
  },
};

const ChatBotScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [systemGroups, setSystemGroups] = useState<{ [key: string]: string }>({});
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Fallback dos grupos (caso a API falhe)
  const FALLBACK_GROUPS = {
    'Aves': 'Aves',
    'Amphibia': 'Anfíbios', 
    'Reptilia': 'Répteis',
    'Mammalia': 'Mamíferos',
    'Actinopterygii': 'Peixes',
    'Arachnida': 'Aracnídeos',
    'Insecta': 'Insetos',
    'Mollusca': 'Moluscos',
    'Plantae': 'Plantas',
    // Mapeamentos alternativos comuns
    'birds': 'Aves',
    'amphibians': 'Anfíbios',
    'reptiles': 'Répteis',
    'mammals': 'Mamíferos',
    'fish': 'Peixes',
    'ray-finned fishes': 'Peixes',
    'arachnids': 'Aracnídeos',
    'insects': 'Insetos',
    'mollusks': 'Moluscos',
    'plants': 'Plantas',
    'fungi': 'Fungos',
    'chromista': 'Cromistas',
    'protozoa': 'Protozoários'
  };

  // Função para buscar grupos do sistema via API
  const fetchSystemGroups = async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/groups`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const groupsMap: { [key: string]: string } = {};
      
      // Criar mapeamento principal (id -> label)
      data.groups.forEach((group: GroupInfo) => {
        groupsMap[group.id] = group.label;
        groupsMap[group.name] = group.label;
      });
      
      // Adicionar mapeamentos alternativos comuns
      const alternativeMappings = {
        'birds': 'Aves',
        'amphibians': 'Anfíbios', 
        'reptiles': 'Répteis',
        'mammals': 'Mamíferos',
        'fish': 'Peixes',
        'ray-finned fishes': 'Peixes',
        'arachnids': 'Aracnídeos',
        'insects': 'Insetos',
        'mollusks': 'Moluscos',
        'plants': 'Plantas',
        'fungi': 'Fungos',
        'chromista': 'Cromistas',
        'protozoa': 'Protozoários'
      };
      
      Object.assign(groupsMap, alternativeMappings);
      setSystemGroups(groupsMap);
      setGroupsLoaded(true);
    } catch (error) {
      console.error('Erro ao carregar grupos do sistema:', error);
      // Usar fallback em caso de erro
      setSystemGroups(FALLBACK_GROUPS);
      setGroupsLoaded(true);
    }
  };

  // Função para normalizar o nome do grupo
  const normalizeGroupName = (group: string): string => {
    if (!group || !groupsLoaded) return group || '';
    
    const lowerGroup = group.toLowerCase();
    const groupKey = Object.keys(systemGroups).find(key => 
      key.toLowerCase() === lowerGroup || 
      systemGroups[key].toLowerCase() === lowerGroup
    );
    
    return groupKey ? systemGroups[groupKey] : group;
  };

  // Carregar grupos na inicialização
  useEffect(() => {
    fetchSystemGroups();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // Função para buscar informações de espécies mencionadas pelos nomes científicos
  const searchSpeciesInText = async (text: string): Promise<SpeciesInfo[]> => {
    try {
      type ScientificNameCandidate = {
        name: string;
        priority: number;
        context: string;
      };

      const potentialScientificNames: ScientificNameCandidate[] = [];

      // 1. PRIORIDADE MÁXIMA: Nomes entre parênteses após nomes comuns
      // Padrão: "gato doméstico (Felis catus)" ou "lince ibérico (Lynx pardinus)"
      const parenthesesRegex = /(?:^|[^a-zA-Z])([a-záàâãéèêíìîóòôõúùûç\s]+)\s*\(([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?)\)/gi;
      let parenthesesMatch;
      
      while ((parenthesesMatch = parenthesesRegex.exec(text)) !== null) {
        const commonName = parenthesesMatch[1].trim();
        const scientificName = parenthesesMatch[2].trim();
        
        // Verificar se o nome comum sugere um animal/planta relevante
        if (scientificName.match(/^[A-Z][a-z]+\s+[a-z]/) && 
            !potentialScientificNames.some(item => item.name.toLowerCase() === scientificName.toLowerCase())) {
          potentialScientificNames.push({
            name: scientificName,
            priority: 10,
            context: commonName
          });
        }
      }

      // 2. PRIORIDADE ALTA: Nomes em itálico ou negrito (markdown)
      const markdownRegex = /\*([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?)\*/g;
      let markdownMatch;
      
      while ((markdownMatch = markdownRegex.exec(text)) !== null) {
        const name = markdownMatch[1].trim();
        if (name.match(/^[A-Z][a-z]+\s+[a-z]/) && 
            !potentialScientificNames.some(item => item.name.toLowerCase() === name.toLowerCase())) {
          potentialScientificNames.push({
            name: name,
            priority: 8,
            context: 'formatação markdown'
          });
        }
      }

      // 3. PRIORIDADE MÉDIA: Nomes científicos isolados em contexto relevante
      // Procurar apenas quando há palavras-chave que indicam fauna/flora nas proximidades
      const contextKeywords = /(?:espécie|animal|ave|mamífero|peixe|réptil|anfíbio|inseto|planta|árvore|flor|gato|cão|lince|lobo|raposa|coelho|rato|pardal|águia|cobra|lagarto|sapo|truta|carpa|borboleta|abelha|rosa|carvalho|pinheiro|eucalipto|fauna|flora|biodiversidade|natureza|selvagem|doméstico)/i;
      
      const sentences = text.split(/[.!?]+/);
      
      sentences.forEach(sentence => {
        if (contextKeywords.test(sentence)) {
          const scientificNameRegex = /\b([A-Z][a-z]+\s+[a-z]+(?:\s+[a-z]+)?)\b/g;
          let match;
          
          while ((match = scientificNameRegex.exec(sentence)) !== null) {
            const name = match[1].trim();
            
            // Filtros mais rigorosos para evitar falsos positivos
            if (name.split(' ').length >= 2 && 
                name.match(/^[A-Z][a-z]+\s+[a-z]/) &&
                !name.match(/^(Portugal|Europa|América|África|Ásia|Oceania)/i) &&
                !potentialScientificNames.some(item => item.name.toLowerCase() === name.toLowerCase())) {
              
              potentialScientificNames.push({
                name: name,
                priority: 5,
                context: sentence.substring(0, 50)
              });
            }
          }
        }
      });

      // Ordenar por prioridade (maior primeiro) e limitar a 3 espécies
      const sortedNames = potentialScientificNames
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3);
      
      if (sortedNames.length === 0) return [];

      const token = await AsyncStorage.getItem('token');
      
      // Buscar cada nome científico na API
      const searchPromises = sortedNames.map(async (candidate) => {
        try {
          // Primeiro tentar buscar pelo nome científico exato
          const response = await fetch(
            `${API_BASE_URL}/api/species?search=${encodeURIComponent(candidate.name)}&per_page=3`,
            {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }
          );
          const data = await response.json();
          
          // Procurar uma correspondência exata do nome científico
          const exactMatch = data.results?.find((species: any) => 
            species.sci_name?.toLowerCase() === candidate.name.toLowerCase() ||
            species.scientific_name?.toLowerCase() === candidate.name.toLowerCase()
          );
          
          if (exactMatch) {
            return {
              taxon_id: exactMatch.taxon_id,
              common_name: exactMatch.common_name || exactMatch.preferred_common_name,
              sci_name: exactMatch.sci_name || exactMatch.scientific_name,
              image_url: exactMatch.image_url || 
                        (exactMatch.default_photo && exactMatch.default_photo.medium_url) ||
                        (exactMatch.taxon_photos && exactMatch.taxon_photos[0] && exactMatch.taxon_photos[0].photo && exactMatch.taxon_photos[0].photo.medium_url),
              group: normalizeGroupName(exactMatch.group || exactMatch.iconic_taxon_name)
            };
          }
          
          // Se não houver correspondência exata, pegar o primeiro resultado se existir
          const firstResult = data.results?.[0];
          if (firstResult) {
            return {
              taxon_id: firstResult.taxon_id,
              common_name: firstResult.common_name || firstResult.preferred_common_name,
              sci_name: firstResult.sci_name || firstResult.scientific_name,
              image_url: firstResult.image_url || 
                        (firstResult.default_photo && firstResult.default_photo.medium_url) ||
                        (firstResult.taxon_photos && firstResult.taxon_photos[0] && firstResult.taxon_photos[0].photo && firstResult.taxon_photos[0].photo.medium_url),
              group: normalizeGroupName(firstResult.group || firstResult.iconic_taxon_name)
            };
          }
          
          return null;
        } catch (error) {
          return null;
        }
      });

      const results = await Promise.all(searchPromises);
      const validResults = results.filter(Boolean) as SpeciesInfo[];
      
      return validResults;
    } catch (error) {
      console.error('Erro ao buscar espécies por nomes científicos:', error);
      return [];
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage: Message = {
      id: Date.now() + '_user',
      text: input,
      sender: 'user',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const token = await AsyncStorage.getItem('token');
      const body = { prompt: userMessage.text, system: BOT_SYSTEM_PROMPT };

      const response = await fetch(`${API_BASE_URL}${BOT_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      
      // Buscar informações de espécies mencionadas na resposta
      const botResponse = data.response || data.error || 'Erro ao obter resposta.';
      const speciesInfo = await searchSpeciesInText(botResponse);
      
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + '_bot',
          text: botResponse,
          sender: 'bot',
          timestamp: Date.now(),
          botType: BOT_VALUE,
          ragUsed: data.rag_used,
          ragDocumentsCount: data.rag_documents_count,
          speciesInfo: speciesInfo.length > 0 ? speciesInfo : undefined,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + '_bot',
          text: 'Erro ao comunicar com o serviço.',
          sender: 'bot',
          timestamp: Date.now(),
          botType: BOT_VALUE,
        },
      ]);
    }
    setLoading(false);
  };

  // Componente para renderizar card de espécie
  const renderSpeciesCard = (species: SpeciesInfo, index: number) => (
    <Pressable
      key={`${species.taxon_id}_${index}`}
      style={({ pressed }) => [
        styles.speciesCard,
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
      ]}
      onPress={() => navigation.navigate('SpeciesDetail', { 
        taxon_id: species.taxon_id,
        species: {
          taxon_id: species.taxon_id,
          common_name: species.common_name,
          sci_name: species.sci_name,
          image_url: species.image_url,
          group: species.group
        }
      })}
    >
      <View style={styles.speciesImageContainer}>
        {species.image_url ? (
          <Image 
            source={{ uri: species.image_url }} 
            style={styles.speciesImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.speciesImagePlaceholder}>
            <Ionicons name="image-outline" size={32} color="#c8f59d" />
          </View>
        )}
      </View>
      <View style={styles.speciesInfo}>
        <Text style={styles.speciesCommonName} numberOfLines={2}>
          {species.common_name}
        </Text>
        <Text style={styles.speciesSciName} numberOfLines={1}>
          {species.sci_name}
        </Text>
        {species.group && (
          <View style={styles.speciesGroupBadge}>
            <Text style={styles.speciesGroupText}>{species.group}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#357a4c" style={styles.speciesChevron} />
    </Pressable>
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    const isTyping = !!item.isTyping;
    return (
      <View style={[
        styles.messageRow,
        isUser ? styles.rowRight : styles.rowLeft
      ]}>
        {!isUser && (
          <View
            style={[
              styles.botAvatar,
              styles.shadow,
              {
                backgroundColor: '#c8f59d',
                borderWidth: 2,
                borderColor: '#357a4c',
              },
            ]}
          >
            <BotIcon width={38} height={38} />
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.botBubble,
          isTyping && { backgroundColor: '#eafbe6', borderColor: '#c8f59d' }
        ]}>
          {isTyping ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size={16} color="#357a4c" style={{ marginRight: 8 }} />
              <Text style={[styles.messageText, styles.botText]}>O bot está a escrever...</Text>
            </View>
          ) : (
            <>
              {isUser ? (
                <Text style={[styles.messageText, styles.userText]}>
                  {item.text}
                </Text>
              ) : (
                <Markdown style={markdownStyles}>
                  {item.text}
                </Markdown>
              )}
              {!isUser && item.ragUsed && (
                <View style={styles.ragIndicator}>
                  <Ionicons name="library-outline" size={12} color="#357a4c" />
                  <Text style={styles.ragText}>
                    RAG: {item.ragDocumentsCount || 0} documento{(item.ragDocumentsCount || 0) !== 1 ? 's' : ''} consultado{(item.ragDocumentsCount || 0) !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              {/* Cards de espécies mencionadas */}
              {!isUser && item.speciesInfo && item.speciesInfo.length > 0 && (
                <View style={styles.speciesCardsContainer}>
                  <Text style={styles.speciesCardsTitle}>Espécies mencionadas:</Text>
                  {item.speciesInfo.map((species, index) => renderSpeciesCard(species, index))}
                </View>
              )}
              <Text style={styles.timestamp}>
                {item.timestamp ? new Date(item.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : ''}
              </Text>
            </>
          )}
        </View>
        {isUser && (
          user?.photo ? (
            <Image
              source={{ uri: user.photo.startsWith('http') ? user.photo : `data:image/jpeg;base64,${user.photo}` }}
              style={[styles.avatar, styles.userAvatarBorder]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.userAvatarFallback, styles.userAvatarBorder, styles.shadow]}>
              <Ionicons name="person" size={22} color="#fff" />
            </View>
          )
        )}
      </View>
    );
  };

  return (
    <PrivateScreen navigation={navigation}>
      <LinearGradient colors={['#eafbe6', '#f8fff6']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          >
            <View style={[styles.container, { paddingBottom: 40 + insets.bottom }]}>
              {/* Mensagens + indicador de escrita inline */}
              <FlatList
                ref={flatListRef}
                data={
                  loading
                    ? [...messages, { id: 'typing', text: '', sender: 'bot', isTyping: true }]
                    : messages
                }
                keyExtractor={item => item.id}
                renderItem={renderMessage}
                contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 8, paddingTop: 8 }}
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
              />

              <View style={styles.inputBar}>
                <TextInput
                  style={styles.input}
                  placeholder="Escreve a tua pergunta..."
                  value={input}
                  onChangeText={setInput}
                  editable={!loading}
                  onSubmitEditing={sendMessage}
                  returnKeyType="send"
                  placeholderTextColor="#357a4c99"
                />
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={sendMessage}
                  disabled={loading || !input.trim()}
                >
                  {loading
                    ? <ActivityIndicator color="#357a4c" size={22} />
                    : <Ionicons name="send" size={22} color="#357a4c" />}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
          <BottomTabBar navigation={navigation} active="ChatBot" />
        </SafeAreaView>
      </LinearGradient>
    </PrivateScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  botHeader: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginBottom: 10,
    backgroundColor: '#eafbe6',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#c8f59d',
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#357a4c',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  botHeaderText: {
    color: '#357a4c',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    maxWidth: '100%',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  rowRight: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginHorizontal: 6,
    backgroundColor: '#fff',
    shadowColor: '#357a4c',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  userBubble: {
    backgroundColor: '#c8f59d',
    borderTopRightRadius: 4,
    alignSelf: 'flex-end',
  },
  botBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#c8f59d',
    borderTopLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 15,
    fontFamily: 'Montserrat',
  },
  userText: {
    color: '#357a4c',
  },
  botText: {
    color: '#245c36',
  },
  timestamp: {
    fontSize: 11,
    color: '#357a4c99',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#c8f59d',
    marginHorizontal: 2,
  },
  userAvatarFallback: {
    backgroundColor: '#357a4c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarBorder: {
    borderWidth: 2,
    borderColor: '#357a4c',
  },
  botAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
    backgroundColor: '#c8f59d',
  },
  shadow: {
    shadowColor: '#357a4c',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  typingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eafbe6',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#c8f59d',
    shadowColor: '#357a4c',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  typingText: {
    color: '#357a4c',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 12,
    letterSpacing: 0.2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
    elevation: 3,
    shadowColor: '#357a4c',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#c8f59d',
    marginBottom: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#357a4c',
    backgroundColor: 'transparent',
    fontFamily: 'Montserrat-Thin',
    paddingVertical: 4,
  },
  sendBtn: {
    marginLeft: 10,
    padding: 6,
  },
  ragIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
    backgroundColor: '#e8f5e8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    borderLeftWidth: 3,
    borderLeftColor: '#357a4c',
  },
  ragText: {
    fontSize: 11,
    color: '#2e7d32',
    marginLeft: 4,
    fontFamily: 'Montserrat-Bold',
  },
  // Estilos para cards de espécies
  speciesCardsContainer: {
    marginTop: 12,
    marginBottom: 4,
  },
  speciesCardsTitle: {
    fontSize: 13,
    color: '#357a4c',
    fontFamily: 'Montserrat-Bold',
    marginBottom: 8,
  },
  speciesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fff6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c8f59d',
    shadowColor: '#357a4c',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  speciesImageContainer: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 12,
  },
  speciesImage: {
    width: '100%',
    height: '100%',
  },
  speciesImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#eafbe6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speciesInfo: {
    flex: 1,
    marginRight: 8,
  },
  speciesCommonName: {
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 2,
  },
  speciesSciName: {
    fontSize: 12,
    fontFamily: 'Montserrat-Italic',
    color: '#666',
    marginBottom: 4,
  },
  speciesGroupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#c8f59d',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  speciesGroupText: {
    fontSize: 10,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
  },
  speciesChevron: {
    marginLeft: 4,
  },
});

export default ChatBotScreen;