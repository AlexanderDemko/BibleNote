import { Component, OnInit, OnDestroy } from '@angular/core';

import { NgStoreService } from '../shared/services/store.service';

@Component({
  templateUrl: './bible.component.html'
})
export class BibleComponent implements OnInit, OnDestroy {

  constructor(
    private store: NgStoreService,
  ) {
  }

  ngOnDestroy(): void { }

  async ngOnInit(): Promise<void> {
  }
}
