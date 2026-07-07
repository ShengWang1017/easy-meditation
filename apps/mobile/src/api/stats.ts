import type { StatsSummary } from '@easy-meditation/shared';
import { apiRequest } from './client';

export async function fetchStatsSummary(): Promise<StatsSummary> {
  return apiRequest<StatsSummary>('/stats/summary');
}
