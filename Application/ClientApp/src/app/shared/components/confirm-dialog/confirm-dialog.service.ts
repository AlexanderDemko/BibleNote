import { Injectable } from '@angular/core';

@Injectable()
export class ConfirmDialogService {

  confirm(message: string): Promise<boolean> {
    return Promise.resolve(window.confirm(message));
  }
}
