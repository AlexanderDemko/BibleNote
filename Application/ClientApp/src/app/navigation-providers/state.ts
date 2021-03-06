import { Clone, IReducer } from 'reduce-store';
import { Injectable } from '@angular/core';

import { NavigationProvidersClient, NavigationProvidersNavigationProviderVm } from '../shared/web-clients/auto-generated';

export class State extends Clone<State> {
  items!: NavigationProvidersNavigationProviderVm[];
}

@Injectable({ providedIn: 'root' })
export class LoadReducer implements IReducer<State> {
  stateCtor = State;

  constructor(
    private client: NavigationProvidersClient,
  ) { }

  async reduceAsync(s: State = new State()): Promise<State> {
    var items = await this.client.getAll().toPromise();
    return new State({
      items
    });
  }
}

@Injectable({ providedIn: 'root' })
export class DeleteReducer implements IReducer<State, NavigationProvidersNavigationProviderVm> {
  stateCtor = State;

  constructor(
    private client: NavigationProvidersClient,
  ) { }

  async reduceAsync(s: State = new State(), provider: NavigationProvidersNavigationProviderVm): Promise<State> {
    await this.client.delete(provider.id).toPromise();
    var items = await this.client.getAll().toPromise();
    return new State({
      items
    });
  }
}
