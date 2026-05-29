require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { initDatabase, models } = require('../config/database');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/neetpg';
const cloudinaryUrl = process.env.CLOUDINARY_URL;

if (!cloudinaryUrl) {
  console.error('❌ Error: CLOUDINARY_URL environment variable is missing.');
  console.error('Please configure your CLOUDINARY_URL in your .env file or command line.');
  process.exit(1);
}

// Configure Cloudinary from the environment URL
cloudinary.config({
  cloudinary_url: cloudinaryUrl
});

// Helper function to upload local file to Cloudinary
function uploadFileToCloudinary(filePath) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(filePath, { folder: 'neetpg_clinical_diagrams' }, (error, result) => {
      if (error) reject(error);
      else resolve(result.secure_url);
    });
  });
}

async function runMigration() {
  console.log('🏁 Starting image migration to Cloudinary...');
  console.log('Connecting to MongoDB at:', mongoUri);
  
  try {
    await initDatabase();
    
    // Resolve absolute path to public/uploads directory
    const baseUploadDir = path.resolve(__dirname, '../public');

    // 1. Migrate Stem Images (Embedded_Image in QuestionBank)
    const questionsWithImages = await models.QuestionBank.find({
      Embedded_Image: { $regex: /^\/uploads\// }
    }).lean();

    console.log(`\nFound ${questionsWithImages.length} questions with local stem images.`);
    let stemSuccessCount = 0;

    for (const q of questionsWithImages) {
      // e.g. "/uploads/images/xyz.png" -> "public/uploads/images/xyz.png"
      const localFilePath = path.join(baseUploadDir, q.Embedded_Image);
      
      if (fs.existsSync(localFilePath)) {
        try {
          console.log(`Uploading stem image for Question ${q.Question_ID} (${localFilePath})...`);
          const cloudinaryUrlResult = await uploadFileToCloudinary(localFilePath);
          
          await models.QuestionBank.updateOne(
            { Question_ID: q.Question_ID },
            { $set: { Embedded_Image: cloudinaryUrlResult } }
          );
          stemSuccessCount++;
        } catch (e) {
          console.error(`❌ Failed to upload stem image for Question ${q.Question_ID}:`, e.message);
        }
      } else {
        console.warn(`⚠️ Local file not found: ${localFilePath}`);
      }
    }
    console.log(`✅ Stem images migrated: ${stemSuccessCount}/${questionsWithImages.length}`);

    // 2. Migrate Option Images (Option_A, B, C, D in QuestionBank)
    console.log('\nScanning for local option images in QuestionBank...');
    const options = ['Option_A', 'Option_B', 'Option_C', 'Option_D'];
    let optionSuccessCount = 0;

    // Retrieve all questions to scan their option fields
    const allQuestions = await models.QuestionBank.find({
      $or: [
        { Option_A: { $regex: /^\/uploads\// } },
        { Option_B: { $regex: /^\/uploads\// } },
        { Option_C: { $regex: /^\/uploads\// } },
        { Option_D: { $regex: /^\/uploads\// } }
      ]
    }).lean();

    console.log(`Found ${allQuestions.length} questions containing local option images.`);

    for (const q of allQuestions) {
      const updates = {};
      let hasUpdates = false;

      for (const opt of options) {
        if (q[opt] && q[opt].startsWith('/uploads/')) {
          const localFilePath = path.join(baseUploadDir, q[opt]);
          
          if (fs.existsSync(localFilePath)) {
            try {
              console.log(`Uploading option image ${opt} for Question ${q.Question_ID}...`);
              const cloudinaryUrlResult = await uploadFileToCloudinary(localFilePath);
              updates[opt] = cloudinaryUrlResult;
              hasUpdates = true;
              optionSuccessCount++;
            } catch (e) {
              console.error(`❌ Failed to upload option image ${opt} for Question ${q.Question_ID}:`, e.message);
            }
          } else {
            console.warn(`⚠️ Local file not found: ${localFilePath}`);
          }
        }
      }

      if (hasUpdates) {
        await models.QuestionBank.updateOne(
          { Question_ID: q.Question_ID },
          { $set: updates }
        );
      }
    }
    console.log(`✅ Option images migrated: ${optionSuccessCount}`);

    // 3. Migrate Images Collection (Images schema mapping)
    const imagesCollection = await models.Images.find({
      Image_Path: { $regex: /^\/uploads\// }
    }).lean();

    console.log(`\nFound ${imagesCollection.length} entries in the Images collection with local paths.`);
    let imageTableSuccessCount = 0;

    for (const img of imagesCollection) {
      const localFilePath = path.join(baseUploadDir, img.Image_Path);
      
      if (fs.existsSync(localFilePath)) {
        try {
          console.log(`Uploading Images entry ${img.Image_ID} (${localFilePath})...`);
          const cloudinaryUrlResult = await uploadFileToCloudinary(localFilePath);
          
          await models.Images.updateOne(
            { Image_ID: img.Image_ID },
            { $set: { Image_Path: cloudinaryUrlResult } }
          );
          imageTableSuccessCount++;
        } catch (e) {
          console.error(`❌ Failed to upload Images entry ${img.Image_ID}:`, e.message);
        }
      } else {
        console.warn(`⚠️ Local file not found: ${localFilePath}`);
      }
    }
    console.log(`✅ Images collection mappings migrated: ${imageTableSuccessCount}/${imagesCollection.length}`);

    console.log('\n🎉 Image migration to Cloudinary finished successfully!');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
  }
}

runMigration();
