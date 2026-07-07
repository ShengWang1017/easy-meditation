import type { BreathingMethod } from '@easy-meditation/shared';
import { apiRequest } from './client';

export async function fetchBreathingMethods(): Promise<BreathingMethod[]> {
  return apiRequest<BreathingMethod[]>('/breathing-methods');
}
