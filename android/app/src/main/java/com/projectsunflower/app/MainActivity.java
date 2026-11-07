package com.projectsunflower.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SunflowerNativeServer";
    private static final int AUTH_PORT = 3001;
    private ServerSocket serverSocket;
    private Thread serverThread;
    private volatile boolean isRunning = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SunflowerDownloaderPlugin.class);
        super.onCreate(savedInstanceState);
        startNativeServer();
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data != null && "com.projectsunflower.app".equals(data.getScheme())) {
            String code = data.getQueryParameter("code");
            String state = data.getQueryParameter("state");
            if (code != null) {
                dispatchOAuthCode(code, state != null ? state : "");
            }
        }
    }

    @Override
    public void onDestroy() {
        stopNativeServer();
        super.onDestroy();
    }

    private void startNativeServer() {
        if (isRunning) return;
        isRunning = true;
        serverThread = new Thread(() -> {
            try {
                serverSocket = new ServerSocket(AUTH_PORT, 20, InetAddress.getByName("127.0.0.1"));
                Log.i(TAG, "Project Sunflower Native Server listening on 127.0.0.1:" + AUTH_PORT);
                while (isRunning && !serverSocket.isClosed()) {
                    try {
                        Socket socket = serverSocket.accept();
                        handleClient(socket);
                    } catch (Exception e) {
                        if (!isRunning) break;
                        Log.e(TAG, "Accept error: " + e.getMessage());
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Could not start server on port " + AUTH_PORT + ": " + e.getMessage());
            }
        });
        serverThread.setDaemon(true);
        serverThread.start();
    }

    private void stopNativeServer() {
        isRunning = false;
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (Exception ignored) {}
    }

    private void handleClient(Socket socket) {
        new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                 OutputStream out = socket.getOutputStream()) {
                String line = reader.readLine();
                if (line == null || line.trim().isEmpty()) return;

                String[] parts = line.split(" ");
                if (parts.length < 2) return;

                String method = parts[0].toUpperCase();
                String rawPath = parts[1];

                // Read HTTP request headers
                Map<String, String> headers = new HashMap<>();
                String headerLine;
                while ((headerLine = reader.readLine()) != null && !headerLine.isEmpty()) {
                    int colon = headerLine.indexOf(':');
                    if (colon != -1) {
                        headers.put(headerLine.substring(0, colon).trim().toLowerCase(),
                                    headerLine.substring(colon + 1).trim());
                    }
                }

                // Handle CORS preflight
                if ("OPTIONS".equals(method)) {
                    String corsResp = "HTTP/1.1 204 No Content\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
                        "Access-Control-Allow-Headers: *\r\n" +
                        "Access-Control-Max-Age: 86400\r\n" +
                        "Connection: close\r\n\r\n";
                    out.write(corsResp.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    return;
                }

                int qIdx = rawPath.indexOf('?');
                String path = qIdx != -1 ? rawPath.substring(0, qIdx) : rawPath;
                Map<String, String> queryParams = new HashMap<>();
                if (qIdx != -1) {
                    String query = rawPath.substring(qIdx + 1);
                    for (String param : query.split("&")) {
                        String[] kv = param.split("=", 2);
                        if (kv.length == 2) {
                            try {
                                queryParams.put(URLDecoder.decode(kv[0], "UTF-8"),
                                               URLDecoder.decode(kv[1], "UTF-8"));
                            } catch (Exception ignored) {}
                        }
                    }
                }

                // 1. Health endpoint
                if ("/health".equals(path)) {
                    byte[] body = "{\"status\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
                    String header = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n";
                    out.write(header.getBytes(StandardCharsets.UTF_8));
                    out.write(body);
                    out.flush();
                    return;
                }

                // 2. Media thumbnail proxy (/api/media/{fileId}/thumb)
                if (path.startsWith("/api/media/") && path.endsWith("/thumb")) {
                    String middle = path.substring("/api/media/".length(), path.length() - "/thumb".length());
                    String fileId = URLDecoder.decode(middle, "UTF-8");
                    int size = 400;
                    try {
                        if (queryParams.containsKey("size")) {
                            size = Integer.parseInt(queryParams.get("size"));
                        }
                    } catch (Exception ignored) {}
                    String token = queryParams.get("token");
                    String thumbUrl = queryParams.get("thumbUrl");
                    handleMediaThumb(fileId, size, token, thumbUrl, out);
                    return;
                }

                // 3. Media stream proxy (/api/media/{fileId}/stream)
                if (path.startsWith("/api/media/") && path.endsWith("/stream")) {
                    String middle = path.substring("/api/media/".length(), path.length() - "/stream".length());
                    String fileId = URLDecoder.decode(middle, "UTF-8");
                    String token = queryParams.get("token");
                    String range = headers.get("range");
                    handleMediaStream(fileId, token, range, out);
                    return;
                }

                // 4. Media download proxy (/api/media/{fileId}/download)
                if (path.startsWith("/api/media/") && path.endsWith("/download")) {
                    String middle = path.substring("/api/media/".length(), path.length() - "/download".length());
                    String fileId = URLDecoder.decode(middle, "UTF-8");
                    String token = queryParams.get("token");
                    String filename = queryParams.get("filename");
                    handleMediaDownload(fileId, token, filename, out);
                    return;
                }

                // 5. OAuth loopback redirect
                String code = queryParams.get("code");
                String state = queryParams.get("state");

                String encodedCode = code != null ? Uri.encode(code) : "";
                String encodedState = state != null ? Uri.encode(state) : "";
                String redirectTarget = "com.projectsunflower.app://oauth2redirect?code=" + encodedCode + "&state=" + encodedState;

                String responseHtml = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>Project Sunflower</title>" +
                    "<style>body{background:#09090b;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px;box-sizing:border-box;}" +
                    ".card{background:#18181b;border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:36px 24px;max-width:340px;box-shadow:0 20px 50px rgba(0,0,0,0.7);}" +
                    ".sunflower-icon{width:56px;height:56px;border-radius:18px;background:linear-gradient(135deg,#0c4a6e,#1e3a8a);border:1px solid rgba(56,189,248,0.4);display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;box-shadow:0 0 25px rgba(56,189,248,0.3);}" +
                    "h2{color:#f59e0b;margin:0 0 10px 0;font-size:22px;font-weight:700;}" +
                    "p{color:#a1a1aa;font-size:14px;line-height:1.5;margin:0 0 24px 0;}" +
                    ".btn{display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#09090b;font-weight:700;font-size:14px;text-decoration:none;padding:14px 28px;border-radius:9999px;box-shadow:0 4px 14px rgba(245,158,11,0.4);letter-spacing:0.3px;}</style></head>" +
                    "<body><div class=\"card\"><div class=\"sunflower-icon\"><svg width=\"28\" height=\"28\" viewBox=\"0 0 28 28\" fill=\"none\"><rect width=\"28\" height=\"28\" rx=\"7\" fill=\"#f59e0b\"/><circle cx=\"14\" cy=\"14\" r=\"5\" fill=\"#78350f\"/></svg></div>" +
                    "<h2>Project Sunflower</h2><p>Authentication successful! Returning to your gallery…</p>" +
                    "<a id=\"retBtn\" href=\"" + redirectTarget + "\" class=\"btn\">Tap to return to Project Sunflower</a></div>" +
                    "<script>" +
                    "var retUrl = '" + redirectTarget + "';" +
                    "try { window.location.replace(retUrl); } catch(e) {}" +
                    "setTimeout(function(){ window.location.href = retUrl; }, 300);" +
                    "</script></body></html>";

                byte[] bodyBytes = responseHtml.getBytes(StandardCharsets.UTF_8);
                String header = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: " + bodyBytes.length + "\r\nConnection: close\r\n\r\n";
                out.write(header.getBytes(StandardCharsets.UTF_8));
                out.write(bodyBytes);
                out.flush();

                if (code != null) {
                    dispatchOAuthCode(code, state != null ? state : "");
                }
            } catch (Exception e) {
                Log.e(TAG, "Client handle error: " + e.getMessage());
            } finally {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }).start();
    }

    private void handleMediaThumb(String fileId, int size, String token, String thumbUrl, OutputStream out) {
        try {
            String safeId = fileId.replaceAll("[^a-zA-Z0-9_-]", "_");
            File thumbsDir = new File(getCacheDir(), "thumbs");
            if (!thumbsDir.exists()) thumbsDir.mkdirs();
            File cacheFile = new File(thumbsDir, safeId + "_" + size + ".jpg");

            // 1. Serve from disk cache if present and valid
            if (cacheFile.exists() && cacheFile.length() > 100) {
                byte[] fileBytes = readFileToBytes(cacheFile);
                if (fileBytes != null && fileBytes.length > 0) {
                    String header = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: image/jpeg\r\n" +
                        "Content-Length: " + fileBytes.length + "\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Cache-Control: public, max-age=604800, immutable\r\n" +
                        "Connection: close\r\n\r\n";
                    out.write(header.getBytes(StandardCharsets.UTF_8));
                    out.write(fileBytes);
                    out.flush();
                    return;
                }
            }

            // 2. Fetch thumbnail from Google Drive
            byte[] imgBytes = null;

            // Strategy A: use provided thumbUrl if present
            if (thumbUrl != null && !thumbUrl.isEmpty()) {
                String targetUrl = thumbUrl.contains("=s")
                    ? thumbUrl.replaceAll("=s\\d+.*$", "=s" + size)
                    : thumbUrl + "=s" + size;
                imgBytes = downloadBytes(targetUrl, token);
            }

            // Strategy B: request fresh thumbnailLink from Drive metadata API
            if (imgBytes == null && token != null && !token.isEmpty()) {
                String metaUrl = "https://www.googleapis.com/drive/v3/files/" + Uri.encode(fileId) + "?fields=thumbnailLink";
                byte[] metaJson = downloadBytes(metaUrl, token);
                if (metaJson != null) {
                    String metaStr = new String(metaJson, StandardCharsets.UTF_8);
                    int idx = metaStr.indexOf("\"thumbnailLink\":");
                    if (idx != -1) {
                        int start = metaStr.indexOf('"', idx + 16);
                        int end = metaStr.indexOf('"', start + 1);
                        if (start != -1 && end != -1) {
                            String freshThumbUrl = metaStr.substring(start + 1, end).replace("\\/", "/");
                            String targetUrl = freshThumbUrl.contains("=s")
                                ? freshThumbUrl.replaceAll("=s\\d+.*$", "=s" + size)
                                : freshThumbUrl + "=s" + size;
                            imgBytes = downloadBytes(targetUrl, token);
                        }
                    }
                }
            }

            // Strategy C: fallback to downloading original media bytes if small
            if (imgBytes == null && token != null && !token.isEmpty()) {
                imgBytes = downloadBytes("https://www.googleapis.com/drive/v3/files/" + Uri.encode(fileId) + "?alt=media", token);
            }

            if (imgBytes != null && imgBytes.length > 50) {
                // Save to local cache asynchronously
                final byte[] toSave = imgBytes;
                new Thread(() -> {
                    try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                        fos.write(toSave);
                    } catch (Exception ignored) {}
                }).start();

                String header = "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: image/jpeg\r\n" +
                    "Content-Length: " + imgBytes.length + "\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Cache-Control: public, max-age=604800, immutable\r\n" +
                    "Connection: close\r\n\r\n";
                out.write(header.getBytes(StandardCharsets.UTF_8));
                out.write(imgBytes);
                out.flush();
            } else {
                sendHttpError(out, 404, "Thumbnail Not Available");
            }
        } catch (Exception e) {
            Log.e(TAG, "handleMediaThumb error: " + e.getMessage());
            sendHttpError(out, 500, "Internal Server Error");
        }
    }

    private void handleMediaStream(String fileId, String token, String rangeHeader, OutputStream out) {
        try {
            String streamUrl = "https://www.googleapis.com/drive/v3/files/" + Uri.encode(fileId) + "?alt=media";
            HttpURLConnection conn = (HttpURLConnection) new URL(streamUrl).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            if (token != null && !token.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + token);
            }
            if (rangeHeader != null && !rangeHeader.isEmpty()) {
                conn.setRequestProperty("Range", rangeHeader);
            }

            int responseCode = conn.getResponseCode();
            InputStream inStream = (responseCode >= 200 && responseCode < 300)
                ? conn.getInputStream()
                : conn.getErrorStream();

            String statusLine = responseCode == 206 ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n";
            StringBuilder respHeader = new StringBuilder(statusLine);
            respHeader.append("Access-Control-Allow-Origin: *\r\n");
            respHeader.append("Accept-Ranges: bytes\r\n");

            String contentType = conn.getContentType();
            if (contentType != null) respHeader.append("Content-Type: ").append(contentType).append("\r\n");
            String contentLength = conn.getHeaderField("Content-Length");
            if (contentLength != null) respHeader.append("Content-Length: ").append(contentLength).append("\r\n");
            String contentRange = conn.getHeaderField("Content-Range");
            if (contentRange != null) respHeader.append("Content-Range: ").append(contentRange).append("\r\n");
            respHeader.append("Connection: close\r\n\r\n");

            out.write(respHeader.toString().getBytes(StandardCharsets.UTF_8));

            if (inStream != null) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = inStream.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
                inStream.close();
            }
            out.flush();
        } catch (Exception e) {
            Log.e(TAG, "handleMediaStream error: " + e.getMessage());
            sendHttpError(out, 500, "Stream Error");
        }
    }

    private void handleMediaDownload(String fileId, String token, String filename, OutputStream out) {
        try {
            String downloadUrl = "https://www.googleapis.com/drive/v3/files/" + Uri.encode(fileId) + "?alt=media";
            HttpURLConnection conn = (HttpURLConnection) new URL(downloadUrl).openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(60000);
            if (token != null && !token.isEmpty()) {
                conn.setRequestProperty("Authorization", "Bearer " + token);
            }

            int responseCode = conn.getResponseCode();
            InputStream inStream = (responseCode >= 200 && responseCode < 300)
                ? conn.getInputStream()
                : conn.getErrorStream();

            String safeName = (filename != null && !filename.isEmpty())
                ? filename.replaceAll("[\"\\r\\n]", "_")
                : fileId;

            StringBuilder respHeader = new StringBuilder("HTTP/1.1 200 OK\r\n");
            respHeader.append("Access-Control-Allow-Origin: *\r\n");
            respHeader.append("Content-Disposition: attachment; filename=\"").append(safeName).append("\"\r\n");

            String contentType = conn.getContentType();
            if (contentType != null) respHeader.append("Content-Type: ").append(contentType).append("\r\n");
            String contentLength = conn.getHeaderField("Content-Length");
            if (contentLength != null) respHeader.append("Content-Length: ").append(contentLength).append("\r\n");
            respHeader.append("Connection: close\r\n\r\n");

            out.write(respHeader.toString().getBytes(StandardCharsets.UTF_8));

            if (inStream != null) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = inStream.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
                inStream.close();
            }
            out.flush();
        } catch (Exception e) {
            Log.e(TAG, "handleMediaDownload error: " + e.getMessage());
            sendHttpError(out, 500, "Download Error");
        }
    }

    private byte[] downloadBytes(String urlString, String token) {
        byte[] res = downloadBytesInternal(urlString, token);
        if (res == null && token != null && !token.isEmpty() && urlString.contains("googleusercontent.com")) {
            res = downloadBytesInternal(urlString, null);
        }
        return res;
    }

    private byte[] downloadBytesInternal(String urlString, String token) {
        String currentUrl = urlString;
        for (int redirect = 0; redirect < 5; redirect++) {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(currentUrl).openConnection();
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(18000);
                conn.setInstanceFollowRedirects(true);
                if (token != null && !token.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                }
                int code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = conn.getHeaderField("Location");
                    if (loc != null && !loc.isEmpty()) {
                        currentUrl = loc;
                        continue;
                    }
                }
                if (code == 200) {
                    try (InputStream in = conn.getInputStream();
                         ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) != -1) {
                            baos.write(buf, 0, n);
                        }
                        return baos.toByteArray();
                    }
                }
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }

    private byte[] readFileToBytes(File file) {
        try (FileInputStream fis = new FileInputStream(file);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = fis.read(buf)) != -1) {
                baos.write(buf, 0, n);
            }
            return baos.toByteArray();
        } catch (Exception ignored) {
            return null;
        }
    }

    private void sendHttpError(OutputStream out, int status, String msg) {
        try {
            byte[] body = msg.getBytes(StandardCharsets.UTF_8);
            String header = "HTTP/1.1 " + status + " " + msg + "\r\n" +
                "Content-Type: text/plain\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Content-Length: " + body.length + "\r\n" +
                "Connection: close\r\n\r\n";
            out.write(header.getBytes(StandardCharsets.UTF_8));
            out.write(body);
            out.flush();
        } catch (Exception ignored) {}
    }

    private void dispatchOAuthCode(final String code, final String state) {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Intent resumeIntent = new Intent(MainActivity.this, MainActivity.class);
                resumeIntent.setFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(resumeIntent);

                String sanitizedCode = code.replace("'", "\\'");
                String sanitizedState = state.replace("'", "\\'");
                String js = "(function() { " +
                    "window.dispatchEvent(new CustomEvent('sunflower-oauth-code', { detail: { code: '" + sanitizedCode + "', state: '" + sanitizedState + "' } })); " +
                    "if (typeof window.onSunflowerOAuthCode === 'function') { window.onSunflowerOAuthCode('" + sanitizedCode + "', '" + sanitizedState + "'); } " +
                    "})();";

                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            } catch (Exception e) {
                Log.e(TAG, "Dispatch error: " + e.getMessage());
            }
        });
    }
}
