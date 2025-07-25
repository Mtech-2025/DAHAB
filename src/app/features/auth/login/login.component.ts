import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToasterMsgService } from '../../../core/services/toaster-msg.service';
import { PermissionService } from '../../../core/services/permission.service';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  constructor(private _authService: AuthService, private _formBuilder: FormBuilder, private _toaster: ToasterMsgService, private _permissionService: PermissionService) { }
  loginForm!: FormGroup;

  ngOnInit(): void {
    this._authService.resetState();
    this.loginForm = this._formBuilder.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      remember: false
    })
  }

  onSubmit(form: FormGroup) {
    this._authService.login(form.value, form.value.remember).subscribe(res => {
      if (res?.access) {
        localStorage.setItem('access_token', res.access);
        this._toaster.showSuccess('Good Job', 'Welcome to You');
        this._permissionService.refreshPermissions();
      } else {
        this._toaster.showError('Oops', `Something Went Wrong`);
      }
    }, responseError => {
      const message = responseError?.error?.error || 'Something Went Wrong'
      this._toaster.showError(message);
    });
  }
}
