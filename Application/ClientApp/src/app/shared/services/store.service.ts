import {  Injector, Injectable } from '@angular/core';
import { StoreService } from 'reduce-store';

@Injectable({ providedIn: 'root' })
export class NgStoreService extends StoreService {
  constructor(injector: Injector) {
    super(injector);
  }
}
