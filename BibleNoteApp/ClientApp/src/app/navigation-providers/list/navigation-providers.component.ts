import { Component, OnInit, OnDestroy } from '@angular/core';
import { StoreService } from 'reduce-store';

import * as navProviders from '@app/navigation-providers/state';

@Component({
  selector: 'nav-providers',
  templateUrl: './navigation-providers.component.html'
})
export class NavigationProvidersListComponent implements OnInit, OnDestroy {
  public providersState: navProviders.State;

  constructor(
    private store: StoreService,
    private loadNavigationProvidersReducer: navProviders.LoadReducer
  ) {
    this.store.state.subscribe(navProviders.State, this, s => this.providersState = s)
  }

  ngOnDestroy(): void { }

  async ngOnInit(): Promise<void> {
    await this.store.reduce.byDelegate(navProviders.State, s => this.loadNavigationProvidersReducer.reduceAsync(s));
  }
}
