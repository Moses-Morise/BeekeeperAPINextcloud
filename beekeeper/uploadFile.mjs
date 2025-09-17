import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import { TOKEN, TENANT_URL, TARGET_FOLDER_ID } from "./config.mjs";

// MIME-Mapping
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

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] || "application/octet-stream";
}

/**
 * Lädt eine Datei in die Beekeeper-Dokumentenbibliothek (Zielordner TARGET_FOLDER_ID).
 * - filePath: absoluter/relativer Pfad zur lokalen Datei
 * - overrideName: optionaler Name, wie die Datei in Beekeeper heißen soll (Standard: lokaler Dateiname)
 */
export async function uploadFile(filePath, overrideName) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datei nicht gefunden: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const fileName = overrideName || path.basename(filePath);
  const mimeType = guessMime(filePath);

  // Schritt 1: Upload-Token für usage_type "file" (Dokumentenbibliothek)
  const tokenRes = await fetch(`${TENANT_URL}/api/2/files/file/upload/token`, {
    method: "GET",
    headers: {
      Authorization: `Token ${TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Upload-Token Fehler (${tokenRes.status}): ${t}`);
  }
  const tokenData = await tokenRes.json();

  // Schritt 2: Datei zu Cloud (GCS/S3) hochladen
  const formData = new FormData();
  for (const entry of tokenData.additional_form_data) {
    formData.append(entry.name, entry.value);
  }
  formData.append(tokenData.file_param_name || "file", fs.createReadStream(filePath));

  const uploadRes = await fetch(tokenData.upload_url, {
    method: "POST",
    body: formData,
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new Error(`Cloud-Upload Fehler (${uploadRes.status}): ${t}`);
  }

  // Schritt 3: Upload bei Beekeeper registrieren
  const keyField = tokenData.additional_form_data.find((e) => e.name === "key");
  if (!keyField?.value) throw new Error("Kein 'key' im Upload-Token gefunden.");

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
  if (!registerRes.ok) {
    const t = await registerRes.text();
    throw new Error(`Registrierung Fehler (${registerRes.status}): ${t}`);
  }
  const fileInfo = await registerRes.json();

  // Schritt 4: Datei im Dokumentenordner ablegen
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
  if (!artifactRes.ok) {
    const t = await artifactRes.text();
    throw new Error(`Artifact-Erstellung Fehler (${artifactRes.status}): ${t}`);
  }
  const artifact = await artifactRes.json();

  console.log(`Hochgeladen: ${fileName} → Artifact-ID: ${artifact.id ?? "(siehe Antwort)"}`);
  return artifact;
}
