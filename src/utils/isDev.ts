import { config } from '../config';

export const isDev = config.NODE_ENV === 'development';
