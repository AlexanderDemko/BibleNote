import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';

import * as navProviders from '@app/navigation-providers/state';
import { NgStoreService } from '../../shared/services/store.service';
import { NavigationProvidersClient } from '../../shared/web-clients/auto-generated';

@Component({
  templateUrl: './one-note.component.html'
})
export class OneNoteNavigationProviderComponent implements OnInit, OnDestroy {
  public providersState: navProviders.State;

  public selectedId: string;
  public selectedName: string;

  constructor(
    private store: NgStoreService,
    private client: NavigationProvidersClient,
    private zone: NgZone
  ) {
    this.store.state.subscribe(navProviders.State, this, s => this.providersState = s)
  }

  ngOnDestroy(): void { }

  async ngOnInit(): Promise<void> {
    await this.store.reduce.byDelegate(navProviders.State, s => this.loadNavigationProvidersReducer.reduceAsync(s));
  }

  async callSelectHierarchyItems(): Promise<void> {
    var component = this;
    (<any>window).onHierarchySelected = function (value: string) {
      component.zone.run(() => component.responseFromServer(value))
    };

    await this.client.callHierarchyItemsSelectionDialog("Select hierarchy items", "Select Notebook, Section Group or Section", "Select", "window.onHierarchySelected").toPromise();
  }

  async responseFromServer(hierarchyId: string) {
    this.selectedId = hierarchyId;
    this.selectedName = (await this.client.getHierarchyItemInfo(hierarchyId).toPromise()).name;
  }
}
