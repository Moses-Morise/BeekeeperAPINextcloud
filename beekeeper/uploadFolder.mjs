/**
 * Batch upload: loops through all files in `folderUploadFiles`
 * and uploads each one to Beekeeper using uploadFile().
 */

import fs from "fs";
import path from "path";
import { uploadFile } from "./uploadFile.mjs";

// Absolute path to the folder containing files to upload
const uploadDir = path.resolve("./folderUploadFiles");

if (!fs.existsSync(uploadDir)) {
  console.error(`Folder not found: ${uploadDir}`);
  process.exit(1);
}

// List all files in the folder (ignore subfolders)
const entries = fs.readdirSync(uploadDir, { withFileTypes: true });
const files = entries.filter((e) => e.isFile()).map((e) => e.name);

if (files.length === 0) {
  console.log("No files to upload.");
  process.exit(0);
}

// Upload each file, one by one
for (const file of files) {
  const filePath = path.join(uploadDir, file);
  try {
    await uploadFile(filePath); // use the original filename
  } catch (err) {
    console.error(`Error uploading ${file}: ${err.message}`);
  }
}
