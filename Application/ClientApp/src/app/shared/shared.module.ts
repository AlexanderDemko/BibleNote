import { ConfirmDialogService } from './components/confirm-dialog/confirm-dialog.service';
import { NgModule } from '@angular/core';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';


@NgModule({
  declarations: [
    ConfirmDialogComponent
  ], 
  providers: [
    ConfirmDialogService
  ]
})
export class SharedModule { }
