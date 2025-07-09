const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const analyzeText = async (text) => {
    if (!process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY not found in .env file');
        return 'OpenAI API key is not configured. Please contact the administrator.';
    }

    try {
        const systemPrompt = `
You are a highly advanced AI health consultant. Your task is to analyze medical test results provided by a user. 

Your analysis must be comprehensive and holistic. You should consider all provided indicators and their interconnections. 

Based on the analysis, you must provide a detailed list of recommendations to improve the user's physical and spiritual well-being. Explain how hormonal imbalances or other indicators can affect mood and mental state. 

Your response should be structured, clear, and empathetic. Start with a summary of the findings, then provide actionable recommendations. 

IMPORTANT: Always include a disclaimer that you are an AI assistant and your recommendations are not a substitute for professional medical advice. The user should always consult a qualified doctor.
`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: text,
                },
            ],
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error analyzing with OpenAI:', error);
        return 'Sorry, I encountered an error while analyzing the data. Please try again later.';
    }
};

const analyzeImage = async (imageUrl, promptText = 'Analyze the attached medical test results.') => {
    if (!process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY not found in .env file');
        return 'OpenAI API key is not configured. Please contact the administrator.';
    }

    try {
        const systemPrompt = `
You are a highly advanced AI health consultant. Your task is to analyze medical test results provided by a user in an image format. 

Your analysis must be comprehensive and holistic. You should consider all provided indicators and their interconnections. 

Based on the analysis, you must provide a detailed list of recommendations to improve the user's physical and spiritual well-being. Explain how hormonal imbalances or other indicators can affect mood and mental state. 

Your response should be structured, clear, and empathetic. Start with a summary of the findings, then provide actionable recommendations. 

IMPORTANT: Always include a disclaimer that you are an AI assistant and your recommendations are not a substitute for professional medical advice. The user should always consult a qualified doctor.
`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: promptText },
                        {
                            type: 'image_url',
                            image_url: {
                                url: imageUrl,
                            },
                        },
                    ],
                },
            ],
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error analyzing image with OpenAI:', error);
        return 'Sorry, I encountered an error while analyzing the image. Please try again later.';
    }
};

module.exports = { analyzeText, analyzeImage };
