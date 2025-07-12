import React from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GroupIcon from './GroupIcon';

const SemFoto = require('../assets/images/80x80_SemFoto.webp');

export type Species = {
    taxon_id: number;
    common_name: string;
    sci_name: string;
    image_url?: string;
    image_square_url?: string;
    image_medium_url?: string;
    group?: string;
    family?: string;
    conservation_status?: string;
    description?: string;
    description_generated?: boolean;
};

type Props = {
    item: Species;
    onPress: () => void;
    label: string;
    groupIcon?: string;
    isFavorite?: boolean;
};

const SpeciesListItem: React.FC<Props> = React.memo(({ item, onPress, label, groupIcon, isFavorite }) => {
    if (typeof groupIcon !== 'string') {
        console.warn('groupIcon inválido:', groupIcon);
    }
    return (
        <TouchableOpacity
            style={styles.listItem}
            onPress={onPress}
            activeOpacity={0.85}
        >
            <Image
                source={item.image_square_url ? { uri: item.image_square_url } : SemFoto}
                style={styles.listThumb}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.listCommon}>{item.common_name || 'Sem nome comum'}</Text>
                    {isFavorite && (
                        <Ionicons name="heart" size={18} color="#e53935" style={{ marginLeft: 6 }} />
                    )}
                </View>
                <Text style={styles.listSci}>{item.sci_name}</Text>
                {label ? (
                    <View style={styles.classBadgeList}>
                        <GroupIcon
                            icon={typeof groupIcon === 'string' ? groupIcon : 'default'}
                            size={13}
                            color="#357a4c"
                            style={{ marginRight: 3 }}
                        />
                        <Text style={styles.classBadgeText}>{label}</Text>
                    </View>
                ) : null}
            </View>
            <Ionicons name="chevron-forward" size={22} color="#357a4c" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 10,
        padding: 10,
        elevation: 2,
        shadowColor: '#357a4c',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    listThumb: {
        width: 64,
        height: 64,
        borderRadius: 12,
        backgroundColor: '#eafbe6',
    },
    listCommon: {
        fontSize: 16,
        color: '#357a4c',
        fontFamily: 'Montserrat-Bold',
    },
    listSci: {
        fontSize: 13,
        color: '#245c36',
        fontFamily: 'Montserrat-Thin',
    },
    classBadgeList: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: '#eafbe6',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginTop: 4,
        marginBottom: 2,
    },
    classBadgeText: {
        fontSize: 13,
        color: '#205c37',
        fontFamily: 'Montserrat-Bold',
    },
});

export default SpeciesListItem;