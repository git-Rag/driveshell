package com.projectsunflower.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "SunflowerDownloader")
public class SunflowerDownloaderPlugin extends Plugin {
    private static final String TAG = "SunflowerDownloader";

    @PluginMethod
    public void saveMediaToGallery(PluginCall call) {
        String urlString = call.getString("url");
        String filename = call.getString("filename", "sunflower_" + System.currentTimeMillis() + ".jpg");
        String mimeType = call.getString("mimeType", "image/jpeg");
        String token = call.getString("token");

        if (urlString == null || urlString.isEmpty()) {
            call.reject("Must provide a media URL");
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream in = null;
            try {
                String currentUrl = urlString;
                int redirects = 0;
                while (redirects < 5) {
                    URL url = new URL(currentUrl);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(90000);

                    // Pass auth header if present and accessing googleapis
                    if (token != null && !token.isEmpty()) {
                        conn.setRequestProperty("Authorization", "Bearer " + token);
                    }

                    int code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_TEMP
                            || code == HttpURLConnection.HTTP_MOVED_PERM
                            || code == HttpURLConnection.HTTP_SEE_OTHER
                            || code == 307
                            || code == 308) {
                        String newLocation = conn.getHeaderField("Location");
                        if (newLocation != null && !newLocation.isEmpty()) {
                            currentUrl = newLocation;
                            conn.disconnect();
                            redirects++;
                            continue;
                        }
                    }

                    if (code < 200 || code >= 300) {
                        call.reject("HTTP download error: " + code);
                        return;
                    }
                    break;
                }

                in = conn.getInputStream();
                writeStreamToMediaStore(in, filename, mimeType, call);

            } catch (Exception e) {
                Log.e(TAG, "saveMediaToGallery error: " + e.getMessage(), e);
                call.reject("Failed to save to gallery: " + e.getMessage());
            } finally {
                try { if (in != null) in.close(); } catch (Exception ignored) {}
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void saveBase64ToGallery(PluginCall call) {
        String base64Data = call.getString("base64");
        String filename = call.getString("filename", "sunflower_" + System.currentTimeMillis() + ".jpg");
        String mimeType = call.getString("mimeType", "image/jpeg");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Must provide base64 data");
            return;
        }

        new Thread(() -> {
            try {
                String cleanBase64 = base64Data;
                int commaIdx = cleanBase64.indexOf(",");
                if (commaIdx != -1) {
                    cleanBase64 = cleanBase64.substring(commaIdx + 1);
                }

                byte[] decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                try (ByteArrayInputStream in = new ByteArrayInputStream(decodedBytes)) {
                    writeStreamToMediaStore(in, filename, mimeType, call);
                }
            } catch (Exception e) {
                Log.e(TAG, "saveBase64ToGallery error: " + e.getMessage(), e);
                call.reject("Failed to save base64 to gallery: " + e.getMessage());
            }
        }).start();
    }

    private void writeStreamToMediaStore(InputStream in, String filename, String mimeType, PluginCall call) {
        OutputStream out = null;
        Uri itemUri = null;
        ContentResolver resolver = getContext().getContentResolver();

        try {
            boolean isVideo = mimeType != null && mimeType.startsWith("video/");
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                String relativePath = isVideo
                        ? Environment.DIRECTORY_MOVIES + "/ProjectSunflower"
                        : Environment.DIRECTORY_PICTURES + "/ProjectSunflower";
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            }

            Uri collection = isVideo
                    ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;

            itemUri = resolver.insert(collection, values);
            if (itemUri == null) {
                call.reject("Failed to create MediaStore entry");
                return;
            }

            out = resolver.openOutputStream(itemUri);
            if (out == null) {
                call.reject("Failed to open output stream for gallery item");
                return;
            }

            byte[] buffer = new byte[32768];
            int bytesRead;
            long totalBytes = 0;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
                totalBytes += bytesRead;
            }
            out.flush();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(itemUri, values, null, null);
            }

            // Notify Android media scanner so it instantly shows in device's Gallery app
            try {
                MediaScannerConnection.scanFile(
                        getContext(),
                        new String[]{ itemUri.toString() },
                        new String[]{ mimeType },
                        null
                );
            } catch (Exception ignored) {}

            // Show native Toast on UI thread
            final String displayFileName = filename;
            new Handler(Looper.getMainLooper()).post(() -> {
                Toast.makeText(getContext(), "Saved to Gallery: " + displayFileName, Toast.LENGTH_SHORT).show();
            });

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("uri", itemUri.toString());
            ret.put("bytesSaved", totalBytes);
            call.resolve(ret);

        } catch (Exception e) {
            Log.e(TAG, "writeStreamToMediaStore error: " + e.getMessage(), e);
            if (itemUri != null) {
                try {
                    resolver.delete(itemUri, null, null);
                } catch (Exception ignored) {}
            }
            call.reject("Failed writing media to gallery: " + e.getMessage());
        } finally {
            try { if (out != null) out.close(); } catch (Exception ignored) {}
        }
    }
}
