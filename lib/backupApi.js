/**
 * REST-API für Instanz-Backups (ZIP erstellen, herunterladen, hochladen, wiederherstellen).
 */

const fs = require("fs");
const path = require("path");
const backupService = require("./backupService");

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * @param {object} ctx
 */
async function handleBackupsApi(ctx) {
  const { req, res, parts, send, readJson, readRawWithLimit, isSettingsAdmin, getAuth, authApi, audit, corsHeaders } =
    ctx;

  if (!(await isSettingsAdmin(req, {}))) {
    send(res, 403, { error: "Admin-Authentifizierung erforderlich" });
    return true;
  }

  const action = parts[2] || "";

  if (req.method === "GET" && (action === "list" || parts.length === 2)) {
    send(res, 200, { backups: backupService.listBackups(), config: backupService.getConfig(), backupDir: backupService.getBackupDir() });
    return true;
  }

  if (req.method === "GET" && action === "config") {
    send(res, 200, { config: backupService.getConfig(), backupDir: backupService.getBackupDir() });
    return true;
  }

  if (req.method === "PATCH" && action === "config") {
    const body = await readJson(req);
    const auth = await getAuth(req, body);
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    const config = backupService.saveConfig(body);
    if (ctx.restartAutoBackup) ctx.restartAutoBackup();
    audit.log("backup_config_changed", { userId: auth.user?.id || "admin", action: JSON.stringify(config) });
    send(res, 200, { config });
    return true;
  }

  if (req.method === "GET" && action === "create") {
    const auth = await getAuth(req, {});
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    try {
      const dir = backupService.getBackupDir();
      const filename = backupService.newBackupFilename("backup");
      const backupPath = path.join(dir, filename);
      const result = await backupService.createBackupZip(backupPath);
      audit.log("backup_created", { userId: auth.user?.id || "admin", action: filename });
      send(res, 200, {
        success: true,
        backup: {
          filename: result.filename,
          size: result.size,
          createdAt: result.metadata.createdAt,
          checksum: result.checksum,
        },
        downloadUrl: `/api/backups/download/${encodeURIComponent(result.filename)}`,
      });
    } catch (err) {
      send(res, 500, { error: String(err.message || err) });
    }
    return true;
  }

  if (req.method === "GET" && action === "download" && parts[3]) {
    try {
      const filename = backupService.safeBackupFilename(parts[3]);
      const filePath = path.join(backupService.getBackupDir(), filename);
      if (!fs.existsSync(filePath)) {
        send(res, 404, { error: "Backup nicht gefunden" });
        return true;
      }
      sendZipFile(res, 200, filePath, filename, corsHeaders);
    } catch (err) {
      send(res, 400, { error: String(err.message || err) });
    }
    return true;
  }

  if (req.method === "POST" && action === "restore") {
    const body = await readJson(req);
    const auth = await getAuth(req, body);
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    try {
      const filename = backupService.safeBackupFilename(body.filename);
      const backupPath = path.join(backupService.getBackupDir(), filename);
      if (!fs.existsSync(backupPath)) {
        send(res, 404, { error: "Backup nicht gefunden" });
        return true;
      }
      await backupService.validateBackupZip(backupPath);

      const preName = `prerestore-${Date.now()}.zip`;
      const prePath = path.join(backupService.getBackupDir(), preName);
      const preRestoreBackup = await backupService.createBackupZip(prePath, { label: "pre-restore" });

      send(res, 200, {
        success: true,
        message: "Backup wird wiederhergestellt. Der Server startet neu…",
        preRestoreBackup: { filename: preName, ...preRestoreBackup },
      });

      audit.log("backup_restore_started", { userId: auth.user?.id || "admin", action: filename });

      setImmediate(async () => {
        try {
          await backupService.restoreFromBackup(backupPath);
          audit.log("backup_restore_completed", { userId: auth.user?.id || "admin", action: filename });
          if (ctx.gracefulShutdown) await ctx.gracefulShutdown("backup-restore");
        } catch (err) {
          console.error("[backup-restore]", err);
          audit.log("backup_restore_failed", { userId: auth.user?.id || "admin", action: String(err.message) });
        }
      });
    } catch (err) {
      send(res, 500, { error: String(err.message || err) });
    }
    return true;
  }

  if (req.method === "POST" && action === "upload") {
    const auth = await getAuth(req, {});
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    let tempPath = "";
    try {
      const ctype = String(req.headers["content-type"] || "");
      const raw = await readRawWithLimit(req, MAX_UPLOAD_BYTES);
      const parsed = parseMultipartZip(raw, ctype);
      tempPath = path.join(backupService.getBackupDir(), `upload-temp-${Date.now()}.zip`);
      fs.writeFileSync(tempPath, parsed.data);
      const info = await backupService.validateBackupZip(tempPath);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const safeOrig = String(parsed.filename || "backup.zip").replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `uploaded-${ts}-${safeOrig}`.replace(/\.zip$/i, "") + ".zip";
      const finalPath = path.join(backupService.getBackupDir(), filename);
      fs.renameSync(tempPath, finalPath);
      tempPath = "";
      const checksum = await backupService.calculateChecksum(finalPath);
      const stat = fs.statSync(finalPath);
      const sidecar = {
        filename,
        size: stat.size,
        createdAt: info.createdAt || new Date().toISOString(),
        checksum,
        label: "upload",
        metadata: info.metadata,
      };
      fs.writeFileSync(`${finalPath}.json`, JSON.stringify(sidecar, null, 2));
      audit.log("backup_uploaded", { userId: auth.user?.id || "admin", action: filename });
      send(res, 200, { success: true, filename, backup: sidecar });
    } catch (err) {
      if (tempPath && fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
      send(res, 400, { error: String(err.message || err) });
    }
    return true;
  }

  if (req.method === "DELETE" && action && parts[3] === undefined && action.endsWith(".zip")) {
    const auth = await getAuth(req, {});
    if (!authApi.adminStepUpOk(auth)) {
      authApi.rejectStepUp(res, send);
      return true;
    }
    try {
      const filename = backupService.safeBackupFilename(action);
      const filePath = path.join(backupService.getBackupDir(), filename);
      if (!fs.existsSync(filePath)) {
        send(res, 404, { error: "Backup nicht gefunden" });
        return true;
      }
      fs.rmSync(filePath, { force: true });
      fs.rmSync(`${filePath}.json`, { force: true });
      audit.log("backup_deleted", { userId: auth.user?.id || "admin", action: filename });
      send(res, 200, { ok: true });
    } catch (err) {
      send(res, 400, { error: String(err.message || err) });
    }
    return true;
  }

  send(res, 404, { error: "Nicht gefunden" });
  return true;
}

/** ZIP-Datei als Download senden. */
function sendZipFile(res, status, filePath, filename, corsHeaders) {
  const stat = fs.statSync(filePath);
  const headers = {
    "Content-Type": "application/zip",
    "Content-Length": String(stat.size),
    "Content-Disposition": `attachment; filename="${filename}"`,
    ...(typeof corsHeaders === "function" ? corsHeaders() : corsHeaders || {}),
  };
  res.writeHead(status, headers);
  fs.createReadStream(filePath).pipe(res);
}

/** Erstes ZIP-Part aus multipart/form-data extrahieren. */
function parseMultipartZip(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new Error("Kein Multipart-Boundary");
  const boundary = (m[1] || m[2] || "").trim();
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let start = buf.indexOf(boundaryBuf);
  if (start < 0) throw new Error("Ungültiger Upload");
  start += boundaryBuf.length;
  if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
  else if (buf[start] === 0x0a) start += 1;

  const nextBoundary = buf.indexOf(boundaryBuf, start);
  const part = nextBoundary >= 0 ? buf.subarray(start, nextBoundary) : buf.subarray(start);

  const headerEnd = part.indexOf("\r\n\r\n");
  const altHeaderEnd = headerEnd >= 0 ? headerEnd : part.indexOf("\n\n");
  if (altHeaderEnd < 0) throw new Error("Ungültiger Upload-Part");
  const sep = headerEnd >= 0 ? 4 : 2;
  const headerText = part.subarray(0, altHeaderEnd).toString("utf8");
  let data = part.subarray(altHeaderEnd + sep);
  if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
    data = data.subarray(0, data.length - 2);
  } else if (data.length >= 1 && data[data.length - 1] === 0x0a) {
    data = data.subarray(0, data.length - 1);
  }

  const fnMatch = /filename="([^"]+)"/i.exec(headerText) || /filename=([^;\r\n]+)/i.exec(headerText);
  const filename = fnMatch ? fnMatch[1].trim().replace(/^"|"$/g, "") : "backup.zip";
  if (!/\.zip$/i.test(filename)) throw new Error("Nur ZIP-Dateien erlaubt");
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) throw new Error("Keine gültige ZIP-Datei");
  return { filename, data };
}

module.exports = {
  handleBackupsApi,
  parseMultipartZip,
};
