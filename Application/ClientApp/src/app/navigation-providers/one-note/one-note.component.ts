import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';

import * as navProviders from '@app/navigation-providers/state';
import { NgStoreService } from '../../shared/services/store.service';
import { NavigationProvidersClient, NavigationProvidersOneNoteNavigationProviderVm } from '../../shared/web-clients/auto-generated';
import { ActivatedRoute } from '@angular/router';

@Component({
  templateUrl: './one-note.component.html'
})
export class OneNoteNavigationProviderComponent implements OnInit, OnDestroy {
  providersState!: navProviders.State;

  selectedHierarchyItemId: string | undefined;
  selectedHierarchyItemName: string | undefined;
  provider: NavigationProvidersOneNoteNavigationProviderVm | undefined;  

  constructor(
    private store: NgStoreService,
    private client: NavigationProvidersClient,
    private zone: NgZone,
    private route: ActivatedRoute
  ) {
    this.store.state.subscribe(navProviders.State, this, s => this.providersState = s)
  }

  ngOnDestroy(): void { }

  async ngOnInit(): Promise<void> {
    this.route.params.subscribe(async params => {
      const providerId = params['id'];
      if (providerId > 0)
        this.provider = await this.client.getOneNoteProviderInfo(providerId).toPromise();
      else
        this.provider = new NavigationProvidersOneNoteNavigationProviderVm();
    });
  }

  async callSelectHierarchyItems(): Promise<void> {
    var component = this;
    (<any>window).onOneNoteHierarchyItemSelected = function (value: string) {
      component.zone.run(() => component.responseFromServer(value))
    };

    await this.client.callOneNoteSelectHierarchyItemDialog("Select hierarchy items", "Select Notebook, Section Group or Section", "Select", "window.onOneNoteHierarchyItemSelected").toPromise();
  }

  async responseFromServer(hierarchyId: string) {
    this.selectedHierarchyItemId = hierarchyId;
    this.selectedHierarchyItemName = (await this.client.getOneNoteHierarchyItemInfo(hierarchyId).toPromise()).name;
  }
}
