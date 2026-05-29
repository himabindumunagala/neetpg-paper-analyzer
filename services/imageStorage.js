const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

const isCloudinaryConfigured = !!process.env.CLOUDINARY_URL;

if (isCloudinaryConfigured) {
  console.log('☁️ Image Storage Service: Cloudinary cloud hosting active.');
} else {
  console.log('📁 Image Storage Service: Fallback local filesystem directory active.');
}

const imageDir = path.resolve(__dirname, '../public/uploads/images');
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
}

/**
 * Uploads clinical diagrams or MCQs option graphics.
 * If CLOUDINARY_URL environment variable is provided, streams the file to Cloudinary.
 * Otherwise, falls back to local storage inside public/uploads/images.
 * 
 * @param {string} fileName - Destination filename (used locally, or as public_id in cloud)
 * @param {Buffer} fileBuffer - The binary image data to save
 * @returns {Promise<string>} Web-accessible image URL or path
 */
async function uploadImage(fileName, fileBuffer) {
  if (isCloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      // Remove file extension for Cloudinary public_id
      const publicId = path.parse(fileName).name;
      
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'neetpg_analyzer',
          public_id: publicId,
          overwrite: true,
          resource_type: 'image'
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload failure:', error.message);
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );
      
      uploadStream.end(fileBuffer);
    });
  } else {
    // Local storage fallback
    const physicalPath = path.join(imageDir, fileName);
    fs.writeFileSync(physicalPath, fileBuffer);
    return `/uploads/images/${fileName}`;
  }
}

module.exports = {
  uploadImage,
  isCloudinaryConfigured
};
