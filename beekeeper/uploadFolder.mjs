import fs from "fs";
import path from "path";
import { uploadFile } from "./uploadFile.mjs";

const uploadDir = path.resolve("./folderUploadFiles"); //  Ordnername

if (!fs.existsSync(uploadDir)) {
  console.error(`Ordner nicht gefunden: ${uploadDir}`);
  process.exit(1);
}

const entries = fs.readdirSync(uploadDir, { withFileTypes: true });
const files = entries.filter((e) => e.isFile()).map((e) => e.name);

if (files.length === 0) {
  console.log("Keine Dateien zum Hochladen gefunden.");
  process.exit(0);
}

for (const file of files) {
  const filePath = path.join(uploadDir, file);
  try {
    await uploadFile(filePath); // Name aus dem Dateipfad 
  } catch (err) {
    console.error(`Fehler bei ${file}: ${err.message}`);
  }
}
