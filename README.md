# Medical Telegram Bot 🏥🤖

AI-powered Telegram бот для анализа медицинских результатов с использованием OpenAI и хранением в Supabase.

## 🌟 Возможности

- ✅ Анализ медицинских результатов из текста или изображений
- 🧠 AI-рекомендации на основе OpenAI
- 📊 История анализов пользователей
- 📱 Поддержка множественных форматов файлов
- 🔒 Безопасное хранение в Supabase
- 🚀 Готов к развертыванию на Railway

## 🚀 Быстрое развертывание на Railway

### 1. Подготовка
1. Fork этого репозитория на GitHub
2. Создайте аккаунт на [railway.app](https://railway.app)
3. Подключите ваш GitHub к Railway

### 2. Создание сервисов
Создайте новый проект в Railway и добавьте переменные окружения:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
OPENAI_API_KEY=your_openai_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
```

### 3. Получение токенов

#### Telegram Bot Token
1. Найдите [@BotFather](https://t.me/botfather) в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям и получите токен

#### OpenAI API Key
1. Зайдите на [platform.openai.com](https://platform.openai.com)
2. Создайте API ключ в разделе API Keys

#### Supabase настройки
См. подробные инструкции в [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

## 🛠 Локальная разработка

### Установка
```bash
git clone https://github.com/your-username/medicalbot2.git
cd medicalbot2
npm install
```

### Настройка окружения
Скопируйте `env.example` в `.env` и заполните ваши токены:
```bash
cp env.example .env
# Отредактируйте .env файл
```

### Запуск
```bash
npm start
```

## 📖 Использование

1. **Начать работу**: Отправьте `/start` боту
2. **Анализ текста**: Просто отправьте текст с результатами анализов
3. **Анализ изображений**: Отправьте фото или документ с результатами
4. **История**: Используйте `/history` для просмотра предыдущих анализов
5. **Справка**: `/help` для получения помощи

## 🔧 Структура проекта

```
medicalbot2/
├── index.js              # Основной файл бота
├── fileHandler.js         # Обработка загрузки файлов
├── openaiService.js       # Интеграция с OpenAI
├── supabaseClient.js      # Клиент Supabase
├── schema.sql             # Схема базы данных
├── env.example            # Пример переменных окружения
├── SUPABASE_SETUP.md      # Настройка Supabase
└── README.md              # Документация
```

## 🐛 Решение проблем

### Ошибка "409 Conflict"
- Остановите все другие экземпляры бота
- На Windows: `taskkill /F /IM node.exe`

### Ошибка "Bucket not found"
- Проверьте настройки Supabase Storage
- См. [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

### Проблемы с Railway
- Проверьте логи приложения в Dashboard
- Убедитесь, что все переменные окружения установлены

## 📝 Лицензия

MIT License - используйте свободно для ваших проектов!
