import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (!r2Client) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 credentials missing: set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY");
    }
    
    r2Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return r2Client;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  
  if (!bucket || !publicUrl) {
    throw new Error("R2 config missing: set R2_BUCKET_NAME and R2_PUBLIC_URL");
  }
  
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: relKey,
    Body: buffer,
    ContentType: contentType,
  }));
  
  const url = `${publicUrl}/${relKey}`;
  console.log("[Storage] Uploaded to R2:", url);
  
  return { key: relKey, url };
}
