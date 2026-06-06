import { atom } from 'recoil';
import {
  getStoredImageGenerationOptions,
  type ImageGenerationOptions,
} from '~/utils/imageAgentOptions';

const imageGenerationOptions = atom<ImageGenerationOptions>({
  key: 'imageGenerationOptions',
  default: getStoredImageGenerationOptions(),
});

export default {
  imageGenerationOptions,
};
