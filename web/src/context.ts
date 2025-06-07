import { createContext } from '@lit/context';
import {ApiService} from "@services/api-service.ts";

export const apiServiceContext = createContext<ApiService>('api-service');
