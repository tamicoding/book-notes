import { v2 as cloudinary } from "cloudinary";

export function createCloudinaryService(options = {}) {
  const {
    cloudName = process.env.CLOUDINARY_CLOUD_NAME,
    apiKey = process.env.CLOUDINARY_API_KEY,
    apiSecret = process.env.CLOUDINARY_API_SECRET,
  } = options;

  const enabled = Boolean(cloudName && apiKey && apiSecret);

  if (enabled) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  async function uploadBookCover(file, userId) {
    if (!file?.buffer) {
      return null;
    }

    if (!enabled) {
      throw new Error("Cloudinary não está configurado para upload de capas.");
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "booknotes/covers",
          resource_type: "image",
          transformation: [
            {
              width: 900,
              height: 1350,
              crop: "limit",
            },
          ],
          tags: ["booknotes", "manual-cover", `user-${userId}`],
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      );

      uploadStream.end(file.buffer);
    });
  }

  async function deleteBookCover(publicId) {
    if (!publicId || !enabled) {
      return;
    }

    await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
      resource_type: "image",
    });
  }

  return {
    enabled,
    uploadBookCover,
    deleteBookCover,
  };
}
