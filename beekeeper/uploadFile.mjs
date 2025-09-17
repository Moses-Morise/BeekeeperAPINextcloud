/**
 * Upload a local file to a specific folder in Beekeeper’s Document Library.
 * Steps:
 *   1. Request upload token from Beekeeper
 *   2. Upload file to cloud storage (GCS/S3)
 *   3. Register upload with Beekeeper
 *   4. Create artifact in target folder
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import { TOKEN, TENANT_URL, TARGET_FOLDER_ID } from "../config/config.mjs";

// Map common file extensions to MIME types
const EXT_TO_MIME = {
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
};

// Guess MIME type by file extension
function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] || "application/octet-stream";
}

/**
 * Upload one file to Beekeeper Document Library.
 * @param {string} filePath  – local path to file
 * @param {string} overrideName – optional new name in Beekeeper
 */
export async function uploadFile(filePath, overrideName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const fileName = overrideName || path.basename(filePath);
  const mimeType = guessMime(filePath);

  // 1️⃣ Get upload token for Document Library
  const tokenRes = await fetch(`${TENANT_URL}/api/2/files/file/upload/token`, {
    method: "GET",
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  if (!tokenRes.ok) throw new Error(`Upload token error (${tokenRes.status}): ${await tokenRes.text()}`);
  const tokenData = await tokenRes.json();

  // 2️⃣ Upload file to cloud storage (GCS/S3)
  const formData = new FormData();
  for (const entry of tokenData.additional_form_data) {
    formData.append(entry.name, entry.value);
  }
  formData.append(tokenData.file_param_name || "file", fs.createReadStream(filePath));

  const uploadRes = await fetch(tokenData.upload_url, { method: "POST", body: formData });
  if (!uploadRes.ok) throw new Error(`Cloud upload error (${uploadRes.status}): ${await uploadRes.text()}`);

  // 3️⃣ Register uploaded file with Beekeeper
  const keyField = tokenData.additional_form_data.find((e) => e.name === "key");
  if (!keyField?.value) throw new Error("No 'key' found in upload token.");

  const registerRes = await fetch(`${TENANT_URL}/api/2/files/file/upload`, {
    method: "POST",
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key: keyField.value,
      media_type: mimeType,
      name: fileName,
      size: stats.size,
    }),
  });
  if (!registerRes.ok) throw new Error(`Register error (${registerRes.status}): ${await registerRes.text()}`);
  const fileInfo = await registerRes.json();

  // 4️⃣ Create artifact in the target folder
  const artifactRes = await fetch(`${TENANT_URL}/api/2/artifacts/${TARGET_FOLDER_ID}/children`, {
    method: "POST",
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: fileName,
      type: "file",
      parentId: TARGET_FOLDER_ID,
      metadata: {
        id: fileInfo.id,
        key: fileInfo.key,
        mimeType: fileInfo.media_type,
        size: fileInfo.size,
        url: fileInfo.url,
        userId: fileInfo.userid,
      },
    }),
  });
  if (!artifactRes.ok) throw new Error(`Artifact creation error (${artifactRes.status}): ${await artifactRes.text()}`);
  const artifact = await artifactRes.json();

  console.log(`Uploaded: ${fileName} → Artifact ID: ${artifact.id ?? "(check response)"}`);
  return artifact;
}
