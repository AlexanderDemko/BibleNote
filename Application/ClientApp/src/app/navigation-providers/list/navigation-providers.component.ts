import { Component, OnInit, OnDestroy } from '@angular/core';

import * as navProviders from '@app/navigation-providers/state';
import { NgStoreService } from '../../shared/services/store.service';
import { Router, ActivatedRoute } from '@angular/router';
import { BibleNoteDomainEnumsNavigationProviderType } from '../../shared/web-clients/auto-generated';

@Component({
  templateUrl: './navigation-providers.component.html'
})
export class NavigationProvidersListComponent implements OnInit, OnDestroy {
  providersState: navProviders.State;

  constructor(
    private loadNavigationProvidersReducer: navProviders.LoadReducer,
    private store: NgStoreService,
    private router: Router,
  ) {
    this.store.state.subscribe(navProviders.State, this, s => this.providersState = s)
  }

  ngOnDestroy(): void { }
    
  async ngOnInit(): Promise<void> {
    await this.store.reduce.byDelegate(navProviders.State, s => this.loadNavigationProvidersReducer.reduceAsync(s));
  }

  hideModal(): void {
    this.router.navigate(['/bible']);
  }

  getProviderType(type: BibleNoteDomainEnumsNavigationProviderType): string {
    return BibleNoteDomainEnumsNavigationProviderType[type];
  }
}
