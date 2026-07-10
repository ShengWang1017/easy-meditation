import type { ImageSourcePropType } from 'react-native';
import SoundOffIcon from '../../assets/reference-style/icon-sound-off.svg';
import SoundOnIcon from '../../assets/reference-style/icon-sound-on.svg';

export const referenceImages = {
  back: require('../../assets/reference-style/icon-back.png') as ImageSourcePropType,
  info: require('../../assets/reference-style/icon-info.png') as ImageSourcePropType,
  gear: require('../../assets/reference-style/icon-gear.png') as ImageSourcePropType,
  petalBox: require('../../assets/reference-style/petal-box.png') as ImageSourcePropType,
  petalSleep: require('../../assets/reference-style/petal-sleep.png') as ImageSourcePropType,
  petalFocus: require('../../assets/reference-style/petal-focus.png') as ImageSourcePropType,
  dandelion: require('../../assets/reference-style/dandelion-card.png') as ImageSourcePropType
};

export const referenceSoundIcons = {
  on: SoundOnIcon,
  off: SoundOffIcon
} as const;

export { SoundOffIcon, SoundOnIcon };
