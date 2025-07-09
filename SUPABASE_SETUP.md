# Настройка Supabase для медицинского Telegram бота

## 1. Создание проекта Supabase

1. Зайдите на [supabase.com](https://supabase.com)
2. Создайте новый проект
3. Скопируйте URL проекта и API ключ

## 2. Настройка базы данных

Выполните SQL команды из файла `schema.sql` в SQL Editor вашего Supabase проекта.

## 3. Настройка Storage

### Автоматическая настройка (рекомендуется)
Бот автоматически создаст необходимый bucket `analyses_files` при первом запуске.

### Ручная настройка (опционально)
Если автоматическое создание не работает:

1. Перейдите в Storage раздел Supabase
2. Создайте новый bucket с именем `analyses_files`
3. Настройки bucket:
   - **Public**: ✅ Включено
   - **File size limit**: 20MB
   - **Allowed MIME types**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`

## 4. Row Level Security (RLS)

Если у вас включен RLS, создайте политики:

### Для таблицы `analyses_files` bucket:
```sql
-- Разрешить всем читать файлы
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT USING (bucket_id = 'analyses_files');

-- Разрешить всем загружать файлы
CREATE POLICY "Public upload access" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'analyses_files');
```

## 5. Переменные окружения

В Railway добавьте:
- `SUPABASE_URL` - URL вашего проекта
- `SUPABASE_KEY` - Anon/public ключ (НЕ service_role!)

## Проверка настройки

После запуска бота в логах должно появиться:
- `✅ Bucket analyses_files успешно создан` (при первом запуске)
- `✅ Файл user_X_timestamp.jpg успешно загружен: https://...` (при загрузке файлов)

## Возможные ошибки

### "Bucket not found"
- Проверьте права доступа к Storage
- Убедитесь, что используете правильный ключ API

### "Insufficient permissions"
- Проверьте RLS политики
- Убедитесь, что используете anon ключ, а не service_role

### "File size too large"
- Файл больше 20MB
- Пользователь должен уменьшить размер изображения 