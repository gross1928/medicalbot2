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
const bot = new TelegramBot(token, { polling: true });

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
Welcome to the AI Health Analyzer Bot!

Here are the available commands:
/start - Start interacting with the bot
/help - Show this help message
/history - View your past analysis history

Simply send me a text, photo, or an image file of your medical tests, and I will provide a detailed analysis and recommendations.
`;
    bot.sendMessage(chatId, helpMessage);
});

bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id;
    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(chatId, "Sorry, there was a database error.");
        return;
    }

    bot.sendMessage(chatId, "Fetching your analysis history, please wait...");

    const { data, error } = await supabase
        .from('analyses')
        .select('created_at, input_text, file_url, recommendations(recommendation_text)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5); // Get the last 5 analyses

    if (error) {
        console.error('Error fetching history:', error);
        bot.sendMessage(chatId, "Sorry, I couldn't retrieve your history.");
        return;
    }

    if (!data || data.length === 0) {
        bot.sendMessage(chatId, "You don't have any analysis history yet.");
        return;
    }

    let historyMessage = 'Here is your last 5 analyses:\n\n';
    for (const analysis of data) {
        const date = new Date(analysis.created_at).toLocaleString();
        let analysisContent = '';
        if (analysis.input_text) {
            analysisContent = `Text: "${analysis.input_text.substring(0, 50)}..."`;
        } else if (analysis.file_url) {
            analysisContent = 'Analysis from a file.';
        }

        const recommendation = analysis.recommendations.length > 0 
            ? analysis.recommendations[0].recommendation_text.substring(0, 100) + '...'
            : 'No recommendation found.';

        historyMessage += `*${date}*\n- ${analysisContent}\n- Recommendation: _${recommendation}_\n\n`;
    }

    bot.sendMessage(chatId, historyMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/start/, async (msg) => {
    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(msg.chat.id, "Sorry, there was a database error. Please try again later.");
        return;
    }
    const chatId = msg.chat.id;
    const userName = msg.from.first_name;

    const welcomeMessage = `
Hello, ${userName}! Welcome to the AI Health Analyzer Bot. 

I can analyze your medical test results and provide personalized recommendations. 

To get started, simply send me a text, photo, or document with your test results.
`;

    bot.sendMessage(chatId, welcomeMessage);
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
        bot.sendMessage(chatId, "Sorry, there was a database error. Please try again later.");
        return;
    }

    try {
        // Get the highest resolution photo
        const photo = msg.photo[msg.photo.length - 1];
        
        // Validate file size
        if (!isFileSizeValid(photo.file_size)) {
            bot.sendMessage(chatId, `Sorry, the file is too large. Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
            return;
        }

        bot.sendMessage(chatId, 'Photo received. Processing, please wait...');

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
        const prompt = msg.caption || 'Analyze the attached medical test results.';
        const recommendationText = await analyzeImage(publicUrl, prompt);

        // 5. Save recommendation and update status
        await supabase.from('recommendations').insert([{ analysis_id: analysis.id, user_id: user.id, recommendation_text: recommendationText }]);
        await supabase.from('analyses').update({ status: 'completed', raw_openai_response: { 'response': recommendationText } }).eq('id', analysis.id);

        // 6. Send to user
        bot.sendMessage(chatId, recommendationText);

    } catch (error) {
        console.error('Error processing photo:', error);
        bot.sendMessage(chatId, 'Sorry, an error occurred while processing your photo.');
    }
});

bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(chatId, "Sorry, there was a database error. Please try again later.");
        return;
    }

    const doc = msg.document;
    const fileId = doc.file_id;
    const fileName = doc.file_name;

    // Validate file size
    if (!isFileSizeValid(doc.file_size)) {
        bot.sendMessage(chatId, `Sorry, the file is too large. Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
        return;
    }

    // Check if the document is an image
    if (doc.mime_type && doc.mime_type.startsWith('image/')) {
        bot.sendMessage(chatId, 'Image file received. Processing, please wait...');
        try {
            const fileBuffer = await downloadFileFromTelegram(fileId);
            const publicUrl = await uploadToSupabase(fileBuffer, `user_${user.id}_${Date.now()}_${fileName}`);

            const { data: analysis, error: insertError } = await supabase
                .from('analyses')
                .insert([{ user_id: user.id, file_url: publicUrl, status: 'processing' }])
                .select().single();

            if (insertError) throw new Error(`DB insert error: ${insertError.message}`);

            const prompt = msg.caption || 'Analyze the attached medical test results.';
            const recommendationText = await analyzeImage(publicUrl, prompt);

            await supabase.from('recommendations').insert([{ analysis_id: analysis.id, user_id: user.id, recommendation_text: recommendationText }]);
            await supabase.from('analyses').update({ status: 'completed', raw_openai_response: { 'response': recommendationText } }).eq('id', analysis.id);

            bot.sendMessage(chatId, recommendationText);
        } catch (error) {
            console.error('Error processing document (image):', error);
            bot.sendMessage(chatId, 'Sorry, an error occurred while processing your file.');
        }
    } else {
        // Handle other file types like PDF, etc.
        bot.sendMessage(chatId, "Thank you for the document. Currently, I can only analyze images and plain text. PDF and other document format analysis is coming soon! Please send your results as a photo or copy the text into a message.");
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
        bot.sendMessage(chatId, `Sorry, your message is too long. Maximum length is ${MAX_TEXT_LENGTH} characters. Please shorten your message.`);
        return;
    }

    const user = await getOrCreateUser(msg);
    if (!user) {
        bot.sendMessage(chatId, "Sorry, there was a database error. Please try again later.");
        return;
    }

    // Let the user know we are working on it
    bot.sendMessage(chatId, 'I have received your message. Analyzing the data, please wait...');

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
        bot.sendMessage(chatId, 'Sorry, something went wrong while processing your request.');
    }
});

