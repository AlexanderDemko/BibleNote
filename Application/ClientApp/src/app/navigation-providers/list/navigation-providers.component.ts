import { Component, OnInit, OnDestroy } from '@angular/core';

import * as navProviders from '@app/navigation-providers/state';
import { NgStoreService } from '../../shared/services/store.service';

@Component({
  templateUrl: './navigation-providers.component.html'
})
export class NavigationProvidersListComponent implements OnInit, OnDestroy {
  public providersState: navProviders.State;

  constructor(
    private loadNavigationProvidersReducer: navProviders.LoadReducer,
    private store: NgStoreService
  ) {
    this.store.state.subscribe(navProviders.State, this, s => this.providersState = s)
  }

  ngOnDestroy(): void { }

  async ngOnInit(): Promise<void> {
    await this.store.reduce.byDelegate(navProviders.State, s => this.loadNavigationProvidersReducer.reduceAsync(s));
  }
}
