export function userMessage(error) {
 const text=String(error?.message||error||'');
 const code=String(error?.code||'');
 const rules=[[/COURSE_EDIT_CONFLICT/,'Курс уже изменён другим пользователем. Откройте редактор заново.'],
 [/SECTION_HAS_PROGRESS/,'Этот раздел уже проходили участники. Его нельзя удалить; создайте новый курс для другой программы.'],
 [/ATTEMPT_LIMIT/,'За 24 часа разрешено не более 10 попыток. Попробуйте позже.'],
 [/already been submitted/,'Эта попытка уже завершена. Обновите страницу, чтобы увидеть результат.'],
 [/Only one answer|invalid question|Too many answers|invalid input syntax/,'Ответы не соответствуют тесту. Обновите страницу.'],
 [/Complete all course|must be enrolled/,'Сначала запишитесь на курс и ознакомьтесь со всеми разделами.'],
 [/Invalid login credentials/,'Неверный email или пароль.'],
 [/Email not confirmed/,'Подтвердите email, затем войдите.'],
 [/Authentication required|JWT|refresh token|session.*expired/i,'Сессия истекла. Войдите снова.'],
 [/schema cache|Supabase|SQL Editor|Postgres|Failed to fetch|Database|fetch failed|function public\.|permission denied/i,'Сервис временно недоступен. Повторите попытку позже или обратитесь к администратору.']];
 for(const [pattern,message] of rules)if(pattern.test(text))return message;
 if(code==='42501')return 'Недостаточно прав для этой операции.';
 if(code.startsWith('PGRST')||/^\d{2}[A-Z0-9]{3}$/.test(code))return 'Не удалось выполнить операцию. Обновите страницу или обратитесь к администратору.';
 return /[А-Яа-яЁё]/.test(text)?text:'Не удалось выполнить операцию. Повторите попытку позже.';
}
