import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PrivateScreen from '../../components/PrivateScreen';
import ScreenHeader from '../../components/ScreenHeader';
import BottomTabBar from '../../components/BottomTabBar';

const ExploreScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  return (
    <PrivateScreen navigation={navigation}>
      <LinearGradient colors={['#eafbe6', '#f8fff6']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
          <ScreenHeader title="Explorar" />
          <View style={[styles.container, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.title}>Descobre novas funcionalidades</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('ChatBot')}
                activeOpacity={0.85}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="chatbubbles-outline" size={36} color="#357a4c" />
                </View>
                <Text style={styles.actionLabel}>ChatBot</Text>
                <Text style={styles.actionDesc}>Tira dúvidas sobre espécies e natureza com o nosso especialista.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('ExploreSpecies')}
                activeOpacity={0.85}
              >
                <View style={styles.iconCircle}>
                  <Ionicons name="scan-outline" size={36} color="#357a4c" />
                </View>
                <Text style={styles.actionLabel}>Reconhecimento</Text>
                <Text style={styles.actionDesc}>Identifica espécies através da NaturaDetec.</Text>
              </TouchableOpacity>
            </View>
          </View>
          <BottomTabBar navigation={navigation} active="Explore" />
        </SafeAreaView>
      </LinearGradient>
    </PrivateScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-start',
    paddingHorizontal: 18,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginTop: 12,
    marginBottom: 18,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    alignItems: 'center',
    marginHorizontal: 6,
    paddingVertical: 22,
    elevation: 3,
    shadowColor: '#357a4c',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eafbe6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionLabel: {
    fontSize: 17,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: 13,
    color: '#357a4c',
    fontFamily: 'Montserrat-Thin',
    textAlign: 'center',
    marginHorizontal: 2,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
    color: '#357a4c',
    marginBottom: 10,
  },
  featuredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  featuredCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    alignItems: 'center',
    marginHorizontal: 6,
    paddingVertical: 14,
    elevation: 2,
    shadowColor: '#357a4c',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  featuredName: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 15,
    color: '#357a4c',
    marginTop: 6,
  },
  featuredSci: {
    fontFamily: 'Montserrat-Thin',
    fontSize: 13,
    color: '#245c36',
    fontStyle: 'italic',
  },
});

export default ExploreScreen;