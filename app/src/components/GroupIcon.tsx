import React from 'react';
import TaxonAvesIcon from '../assets/images/group-icons/taxon_aves.svg';
import TaxonAmphibiaIcon from '../assets/images/group-icons/taxon_amphibia.svg';
import TaxonReptiliaIcon from '../assets/images/group-icons/taxon_reptilia.svg';
import TaxonMammaliaIcon from '../assets/images/group-icons/taxon_mammalia.svg';
import TaxonActinopterygiiIcon from '../assets/images/group-icons/taxon_actinopterygii.svg';
import TaxonArachnidaIcon from '../assets/images/group-icons/taxon_arachnida.svg';
import TaxonInsectaIcon from '../assets/images/group-icons/taxon_insecta.svg';
import TaxonMolluscaIcon from '../assets/images/group-icons/taxon_mollusca.svg';
import TaxonPlantaeIcon from '../assets/images/group-icons/taxon_plantae.svg';
import DefaultIcon from '../assets/images/group-icons/taxon_unknown.svg';

const groupIcons: { [key: string]: React.FC<React.SVGProps<SVGSVGElement>> } = {
  'taxon_aves': TaxonAvesIcon,
  'taxon_amphibia': TaxonAmphibiaIcon,
  'taxon_reptilia': TaxonReptiliaIcon,
  'taxon_mammalia': TaxonMammaliaIcon,
  'taxon_actinopterygii': TaxonActinopterygiiIcon,
  'taxon_arachnida': TaxonArachnidaIcon,
  'taxon_insecta': TaxonInsectaIcon,
  'taxon_mollusca': TaxonMolluscaIcon,
  'taxon_plantae': TaxonPlantaeIcon,
  'default': DefaultIcon,
};

type Props = {
  icon?: string;
  size?: number;
  color?: string;
  style?: any;
};

const GroupIcon: React.FC<Props> = ({ icon, size = 26, color = '#357a4c', style }) => {
  const iconKey = typeof icon === 'string' && groupIcons[icon] ? icon : 'default';
  const IconComponent = groupIcons[iconKey];
  return <IconComponent width={size} height={size} fill={color} style={style} />;
};

export default GroupIcon;