import { Component } from '@angular/core';
import { GuardDemoComponent } from './guard-demo/guard-demo.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [GuardDemoComponent],
  template: '<app-guard-demo />',
})
export class App {}
