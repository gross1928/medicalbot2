const supabase = require('./supabaseClient');

const BUCKET_NAME = 'analyses_files';

/**
 * Проверяет существование bucket и создает его при необходимости
 */
const ensureBucketExists = async () => {
    try {
        // Проверяем, существует ли bucket
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        
        if (listError) {
            console.error('Ошибка при получении списка buckets:', listError);
            return false;
        }

        const bucketExists = buckets.some(bucket => bucket.name === BUCKET_NAME);
        
        if (!bucketExists) {
            console.log(`Bucket ${BUCKET_NAME} не найден. Создаю...`);
            
            // Создаем bucket
            const { data: createData, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
                public: true,
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
                fileSizeLimit: 20971520 // 20MB
            });

            if (createError) {
                console.error('Ошибка при создании bucket:', createError);
                return false;
            }

            console.log(`✅ Bucket ${BUCKET_NAME} успешно создан`);
        }

        return true;
    } catch (error) {
        console.error('Неожиданная ошибка при работе с bucket:', error);
        return false;
    }
};

/**
 * Uploads a file to Supabase Storage.
 * @param {Buffer} fileBuffer The file content.
 * @param {string} fileName The desired file name in the bucket.
 * @returns {Promise<string>} A promise that resolves with the public URL of the uploaded file.
 */
const uploadToSupabase = async (fileBuffer, fileName) => {
    try {
        // Убеждаемся, что bucket существует
        const bucketReady = await ensureBucketExists();
        if (!bucketReady) {
            throw new Error('Не удалось подготовить bucket для загрузки файлов');
        }

        // Загружаем файл
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, fileBuffer, {
                cacheControl: '3600',
                upsert: true, // Overwrite file if it exists
            });

        if (error) {
            console.error('Детали ошибки Supabase:', error);
            
            // Более специфичные ошибки
            if (error.message.includes('Bucket not found')) {
                throw new Error('Bucket не найден. Проверьте настройки Supabase Storage.');
            } else if (error.message.includes('Insufficient permissions')) {
                throw new Error('Недостаточно прав для загрузки файлов. Проверьте RLS политики.');
            } else if (error.message.includes('File size')) {
                throw new Error('Файл слишком большой для загрузки.');
            } else {
                throw new Error(`Ошибка загрузки в Supabase: ${error.message}`);
            }
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(data.path);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('Не удалось получить публичную ссылку на загруженный файл.');
        }

        console.log(`✅ Файл ${fileName} успешно загружен: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;

    } catch (error) {
        console.error('Ошибка в uploadToSupabase:', error);
        throw error;
    }
};

module.exports = { uploadToSupabase };
