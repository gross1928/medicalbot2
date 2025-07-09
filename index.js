require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('TELEGRAM_BOT_TOKEN not found in .env file');
    process.exit(1);
}

// Validate other required environment variables
if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not found in .env file');
    process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('SUPABASE_URL or SUPABASE_KEY not found in .env file');
    process.exit(1);
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { 
    polling: {
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 10,
        }
    }
});

// Handle polling errors
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    
    if (error.code === 'ETELEGRAM' && error.message.includes('409')) {
        console.error('❌ ОШИБКА: Другой экземпляр бота уже запущен!');
        console.error('Пожалуйста, остановите все другие экземпляры бота перед запуском нового.');
        console.error('Используйте команду: taskkill /F /IM node.exe (Windows) или pkill node (Linux/Mac)');
        process.exit(1);
    }
});

// Handle webhook errors
bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Получен сигнал SIGINT. Останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Получен сигнал SIGTERM. Останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});

// Добавим меню команд, чтобы Telegram показывал их в интерфейсе
bot.setMyCommands([
    { command: 'start', description: 'Начать работу с ботом' },
    { command: 'help', description: 'Показать справку' },
    { command: 'history', description: 'История ваших анализов' },
]);

console.log('Bot has been started...');

// Constants for validation
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_TEXT_LENGTH = 10000; // 10,000 characters

// Helper function to validate file size
const isFileSizeValid = (fileSize) => {
    if (!fileSize) {
        return true; // If file size is not available, we'll allow it (Telegram will handle it)
    }
    return fileSize <= MAX_FILE_SIZE;
};

// Helper function to validate text length
const isTextLengthValid = (text) => {
    return text && text.length <= MAX_TEXT_LENGTH;
};

const supabase = require('./supabaseClient');
const { analyzeText, analyzeImage } = require('./openaiService');
const { uploadToSupabase } = require('./fileHandler');
const axios = require('axios'); // We need axios here for downloading

/**
 * Get or create a user in the database.
 * @param {TelegramBot.Message} msg The Telegram message object.
 * @returns {Promise<object>} The user data from Supabase.
 */
const getOrCreateUser = async (msg) => {
    const { id, first_name, last_name, username } = msg.from;

    let { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

    if (error && error.code === 'PGRST116') {
        // User does not exist, create them
        console.log(`User ${id} not found. Creating...`);
        const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert([{ id, first_name, last_name, username }])
            .select()
            .single();

        if (createError) {
            console.error('Error creating user:', createError);
            return null;
        }
        data = newUser;
    } else if (error) {
        console.error('Error fetching user:', error);
        return null;
    }

    return data;
};

// Listen for the /start command
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
Добро пожаловать в AI Анализатор Здоровья!

Доступные команды:
/start - начать работу с ботом
/help - показать это справочное сообщение
/history - посмотреть историю ваших анализов

Просто отправьте мне текст, фото или изображение ваших медицинских результатов, и я предоставлю подробный анализ и рекомендации.
`;
    bot.sendMessage(chatId, helpMessage);
});

bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(chatId, "Извините, произошла ошибка базы данных.");
        return;
    }

    bot.sendMessage(chatId, "Получаю историю ваших анализов, пожалуйста, подождите...");

    const { data, error } = await supabase
        .from('analyses')
        .select('created_at, input_text, file_url, recommendations(recommendation_text)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5); // Get the last 5 analyses

    if (error) {
        console.error('Error fetching history:', error);
        bot.sendMessage(chatId, "Извините, не удалось получить вашу историю.");
        return;
    }

    if (!data || data.length === 0) {
        bot.sendMessage(chatId, "У вас пока нет истории анализов.");
        return;
    }

    let historyMessage = 'Вот ваши последние 5 анализов:\n\n';
    for (const analysis of data) {
        const date = new Date(analysis.created_at).toLocaleString();
        let analysisContent = '';
        if (analysis.input_text) {
            analysisContent = `Текст: \"${analysis.input_text.substring(0, 50)}...\"`;
        } else if (analysis.file_url) {
            analysisContent = 'Анализ из файла.';
        }

        const recommendation = analysis.recommendations.length > 0 
            ? analysis.recommendations[0].recommendation_text.substring(0, 100) + '...'
            : 'Рекомендации не найдены.';

        historyMessage += `*${date}*\n- ${analysisContent}\n- Рекомендация: _${recommendation}_\n\n`;
    }

    bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/start/, async (msg) => {
    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(msg.chat.id, "Извините, ошибка базы данных. Пожалуйста, попробуйте позже.");
        return;
    }
    const chatId = msg.chat.id;
    const userName = msg.from.first_name;

    const welcomeMessage = `
Привет, ${userName}! Добро пожаловать в AI Анализатор Здоровья.

Я могу проанализировать ваши медицинские анализы и предоставить персональные рекомендации.

Чтобы начать, просто отправьте мне текст, фото или документ с результатами ваших анализов.
`;

    bot.sendMessage(chatId, welcomeMessage, {
        reply_markup: {
            keyboard: [
                ['/help', '/history'],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
        },
    });
});

// Listen for any kind of message
// Listen for any kind of message
// We need to pass the bot instance to the file handler to get the file link
const downloadFileFromTelegram = async (fileId) => {
    const fileLink = await bot.getFileLink(fileId);
    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
};

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(chatId, "Извините, ошибка базы данных. Пожалуйста, попробуйте позже.");
        return;
    }

    try {
        // Get the highest resolution photo
        const photo = msg.photo[msg.photo.length - 1];
        
        // Validate file size
        if (!isFileSizeValid(photo.file_size)) {
            bot.sendMessage(chatId, `Извините, файл слишком большой. Максимальный размер файла ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
            return;
        }

        bot.sendMessage(chatId, 'Фото получено. Обрабатываю, пожалуйста, подождите...');

        const fileId = photo.file_id;
        const fileName = `user_${user.id}_${Date.now()}.jpg`;

        // 1. Download the file from Telegram
        const fileBuffer = await downloadFileFromTelegram(fileId);

        // 2. Upload to Supabase
        const publicUrl = await uploadToSupabase(fileBuffer, fileName);

        // 3. Save the analysis request
        const { data: analysis, error: insertError } = await supabase
            .from('analyses')
            .insert([{ user_id: user.id, file_url: publicUrl, status: 'processing' }])
            .select()
            .single();

        if (insertError) throw new Error(`DB insert error: ${insertError.message}`);

        // 4. Analyze the image
        const prompt = msg.caption || 'Проанализируй приложенные результаты медицинских тестов.';
        const recommendationText = await analyzeImage(publicUrl, prompt);

        // 5. Save recommendation and update status
        await supabase.from('recommendations').insert([{ analysis_id: analysis.id, user_id: user.id, recommendation_text: recommendationText }]);
        await supabase.from('analyses').update({ status: 'completed', raw_openai_response: { 'response': recommendationText } }).eq('id', analysis.id);

        // 6. Send to user
        bot.sendMessage(chatId, recommendationText);

    } catch (error) {
        console.error('Error processing photo:', error);
        
        // More specific error messages
        if (error.code === 'ETELEGRAM') {
            bot.sendMessage(chatId, 'Извините, произошла ошибка при получении фото от Telegram. Попробуйте ещё раз.');
        } else if (error.message.includes('Supabase')) {
            bot.sendMessage(chatId, 'Извините, произошла ошибка при загрузке файла. Попробуйте позже.');
        } else {
            bot.sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего фото. Попробуйте ещё раз.');
        }
    }
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(chatId, "Извините, ошибка базы данных. Пожалуйста, попробуйте позже.");
        return;
    }

    const doc = msg.document;
    const fileId = doc.file_id;
    const fileName = doc.file_name;

    // Validate file size
    if (!isFileSizeValid(doc.file_size)) {
        bot.sendMessage(chatId, `Извините, файл слишком большой. Максимальный размер файла ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
        return;
    }

    // Check if the document is an image
    if (doc.mime_type && doc.mime_type.startsWith('image/')) {
        bot.sendMessage(chatId, 'Изображение получено. Обрабатываю, пожалуйста, подождите...');
        try {
            const fileBuffer = await downloadFileFromTelegram(fileId);
            const publicUrl = await uploadToSupabase(fileBuffer, `user_${user.id}_${Date.now()}_${fileName}`);

            const { data: analysis, error: insertError } = await supabase
                .from('analyses')
                .insert([{ user_id: user.id, file_url: publicUrl, status: 'processing' }])
                .select().single();

            if (insertError) throw new Error(`DB insert error: ${insertError.message}`);

            const prompt = msg.caption || 'Проанализируй приложенные результаты медицинских тестов.';
            const recommendationText = await analyzeImage(publicUrl, prompt);

            await supabase.from('recommendations').insert([{ analysis_id: analysis.id, user_id: user.id, recommendation_text: recommendationText }]);
            await supabase.from('analyses').update({ status: 'completed', raw_openai_response: { 'response': recommendationText } }).eq('id', analysis.id);

            bot.sendMessage(chatId, recommendationText);
        } catch (error) {
            console.error('Error processing document (image):', error);
            
            // More specific error messages
            if (error.code === 'ETELEGRAM') {
                bot.sendMessage(chatId, 'Извините, произошла ошибка при получении файла от Telegram. Попробуйте ещё раз.');
            } else if (error.message.includes('Supabase')) {
                bot.sendMessage(chatId, 'Извините, произошла ошибка при загрузке файла. Попробуйте позже.');
            } else {
                bot.sendMessage(chatId, 'Извините, произошла ошибка при обработке вашего файла. Попробуйте ещё раз.');
            }
        }
    } else {
        // Handle other file types like PDF, etc.
        bot.sendMessage(chatId, "Спасибо за документ. В настоящее время я могу анализировать только изображения и обычный текст. Поддержка PDF и других форматов появится позже! Пожалуйста, отправьте результаты в виде фото или скопируйте текст в сообщение.");
    }
});

// Handler for text messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // We will add more logic here to handle different message types.
    // For now, let's ignore the /start command in this listener.
    if (msg.text && msg.text.startsWith('/start')) {
        return;
    }

        // Ignore commands
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    // Skip non-text messages (they are handled by other handlers)
    if (!msg.text) {
        return;
    }

    // Validate text length
    if (!isTextLengthValid(msg.text)) {
        bot.sendMessage(chatId, `Извините, ваше сообщение слишком длинное. Максимальная длина — ${MAX_TEXT_LENGTH} символов. Пожалуйста, сократите сообщение.`);
        return;
    }

    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(chatId, "Извините, ошибка базы данных. Пожалуйста, попробуйте позже.");
        return;
    }

    // Let the user know we are working on it
    bot.sendMessage(chatId, 'Я получил ваше сообщение. Анализирую данные, пожалуйста, подождите...');

    try {
        // 1. Save the analysis request to the database
        const { data: analysis, error: insertError } = await supabase
            .from('analyses')
            .insert([{ user_id: user.id, input_text: msg.text, status: 'processing' }])
            .select()
            .single();

        if (insertError) {
            throw new Error(`Error saving analysis request: ${insertError.message}`);
        }

        // 2. Get the analysis from OpenAI
        const recommendationText = await analyzeText(msg.text);

        // 3. Save the recommendation to the database
        const { error: recError } = await supabase
            .from('recommendations')
            .insert([{ analysis_id: analysis.id, user_id: user.id, recommendation_text: recommendationText }]);
        
        if (recError) {
            // We can still send the recommendation to the user even if saving fails
            console.error('Error saving recommendation:', recError);
        }

        // 4. Update the analysis status
        await supabase
            .from('analyses')
            .update({ status: 'completed', raw_openai_response: { 'response': recommendationText } })
            .eq('id', analysis.id);

        // 5. Send the recommendation to the user
        bot.sendMessage(chatId, recommendationText);

    } catch (error) {
        console.error('Error processing message:', error);
        bot.sendMessage(chatId, 'Извините, что-то пошло не так при обработке вашего запроса.');
    }
});

