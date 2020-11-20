import { Component, OnInit, Input } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-confirm-modal',
  template: `<div class="modal-body text-center">
    <p>{{message}}</p>
    <button type="button" class="btn btn-primary" (click)="confirm()">Yes</button>
    <button type="button" class="btn btn-default" (click)="decline()">No</button>
  </div>`
})
export class ConfirmDialogComponent {
  @Input() message: string;
  result: Subject<boolean> = new Subject<boolean>();

  constructor(public modalRef: BsModalRef) { }

  confirm(): void {
    this.result.next(true);
    this.modalRef.hide();
  }

  decline(): void {
    this.result.next(false);
    this.modalRef.hide();
  }
}
