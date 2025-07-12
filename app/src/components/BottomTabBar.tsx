import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

type TabBarProps = {
    navigation: any;
    active: string;
};

const ACTIVE_BG = 'rgba(200,245,157,0.13)';

const tabs = [
    { key: 'Home', label: 'INÍCIO', icon: 'home' },
    { key: 'Species', label: 'ESPÉCIES', icon: 'paw' },
    { key: 'Explore', label: 'EXPLORAR', icon: 'compass' },
    { key: 'Favorites', label: 'FAVORITOS', icon: 'heart' },
    { key: 'Account', label: 'CONTA', icon: 'person' },
];

const BottomTabBar: React.FC<TabBarProps> = ({ navigation, active }) => {
    const insets = useSafeAreaInsets();

    return (
        <LinearGradient
            colors={['#357a4c', '#357a4c', '#357a4c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
                styles.container,
                { minHeight: 5 + insets.bottom, paddingBottom: insets.bottom },
            ]}
        >
            {tabs.map(tab => {
                const isActive = active === tab.key;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        style={styles.tab}
                        onPress={() => navigation.navigate(tab.key)}
                        accessibilityLabel={tab.label}
                        activeOpacity={0.7}
                    >
                        <View style={[
                            styles.iconWrapper,
                            isActive && styles.activeIconWrapper,
                            Platform.OS === 'android' && isActive && styles.androidShadow
                        ]}>
                            <Ionicons
                                name={tab.icon as any}
                                size={isActive ? 32 : 26}
                                color="#fff"
                            />
                        </View>
                        <Text style={[
                            styles.label,
                            isActive ? styles.activeLabel : styles.inactiveLabel
                        ]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderTopWidth: 0,
        backgroundColor: 'transparent',
        justifyContent: 'space-around',
        alignItems: 'center',
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        elevation: 10,
        shadowColor: '#357a4c',
        shadowOpacity: 0.08,
        shadowRadius: 8,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        paddingVertical: 8,
    },
    iconWrapper: {
        borderRadius: 24,
        padding: 6,
        marginBottom: 0,
        backgroundColor: 'transparent',
    },
    activeIconWrapper: {
        backgroundColor: ACTIVE_BG,
        shadowColor: '#fff',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
    },
    androidShadow: {
        elevation: 6,
    },
    label: {
        fontSize: 10,
        marginTop: 0,
        fontFamily: 'Montserrat-Thin',
        letterSpacing: 0.2,
    },
    activeLabel: {
        color: '#fff',
        fontFamily: 'Montserrat-Bold',
        fontWeight: 'bold',
        fontSize: 10,
    },
    inactiveLabel: {
        color: 'rgba(255,255,255,0.7)',
    },
});

export default BottomTabBar;