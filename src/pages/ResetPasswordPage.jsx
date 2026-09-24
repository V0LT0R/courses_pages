import {useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '../lib/supabase';
import {userMessage} from '../lib/errors';
export default function ResetPasswordPage({recovery=false}){
 const [value,setValue]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function submit(event){event.preventDefault();setBusy(true);setMessage('');
  try{
   if(recovery){const {error}=await supabase.auth.updateUser({password:value});if(error)throw error;setMessage('Пароль изменён.');}
   else{const {error}=await supabase.auth.resetPasswordForEmail(value.trim().toLowerCase(),{redirectTo:`${window.location.origin}/reset-password`});
    if(error)throw error;setMessage('Если для этого email доступно восстановление, вы получите письмо со ссылкой.');}
  }catch(error){setMessage(userMessage(error));}finally{setBusy(false);}
 }
 return <section className="page-section top-spaced"><div className="container narrow-container"><div className="card content-card"><h1>{recovery?'Новый пароль':'Восстановление пароля'}</h1><form className="auth-form" onSubmit={submit}><label><span>{recovery?'Пароль':'Email'}</span><input type={recovery?'password':'email'} value={value} onChange={e=>setValue(e.target.value)} minLength={recovery?8:undefined} maxLength={recovery?128:254} autoComplete={recovery?'new-password':'email'} required/></label><button disabled={busy} className="cta-button">{busy?'Подождите…':'Продолжить'}</button><p role="status">{message}</p><Link to="/login">Вернуться ко входу</Link></form></div></div></section>;
}
