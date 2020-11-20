import { Injectable } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ConfirmDialogComponent } from './confirm-dialog.component';

@Injectable()
export class ConfirmDialogService {

  constructor(private bsModalService: BsModalService) { }

  confirm(message: string): Promise<boolean> {
    const modal = this.bsModalService.show(ConfirmDialogComponent, { initialState: { message: message }, class: 'modal-sm' });

    return new Promise<boolean>((resolve, reject) => modal.content.result.subscribe((result) => resolve(result)));
  }
}
