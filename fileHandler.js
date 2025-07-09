const supabase = require('./supabaseClient');

const BUCKET_NAME = 'analyses_files';

/**
 * Uploads a file to Supabase Storage.
 * @param {Buffer} fileBuffer The file content.
 * @param {string} fileName The desired file name in the bucket.
 * @returns {Promise<string>} A promise that resolves with the public URL of the uploaded file.
 */
const uploadToSupabase = async (fileBuffer, fileName) => {
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, fileBuffer, {
            cacheControl: '3600',
            upsert: true, // Overwrite file if it exists
        });

    if (error) {
        throw new Error(`Error uploading to Supabase: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);

    if (!publicUrlData) {
        throw new Error('Could not get public URL for the uploaded file.');
    }

    return publicUrlData.publicUrl;
};

module.exports = { uploadToSupabase };
