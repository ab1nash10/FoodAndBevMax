export type EntityId = string;

export type ServiceName = 'auth-service' | 'user-service' | 'organization-service';

export interface ServiceMetadata {
  name: ServiceName;
  version: string;
}
