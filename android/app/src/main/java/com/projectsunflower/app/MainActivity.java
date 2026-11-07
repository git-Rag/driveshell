package com.projectsunflower.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SunflowerAuthServer";
    private static final int AUTH_PORT = 3001;
    private ServerSocket serverSocket;
    private Thread serverThread;
    private volatile boolean isRunning = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startAuthServer();
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
        stopAuthServer();
        super.onDestroy();
    }

    private void startAuthServer() {
        if (isRunning) return;
        isRunning = true;
        serverThread = new Thread(() -> {
            try {
                serverSocket = new ServerSocket(AUTH_PORT, 10, InetAddress.getByName("127.0.0.1"));
                Log.i(TAG, "Sunflower Auth Server listening on 127.0.0.1:" + AUTH_PORT);
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
                Log.e(TAG, "Could not start auth server on port " + AUTH_PORT + ": " + e.getMessage());
            }
        });
        serverThread.setDaemon(true);
        serverThread.start();
    }

    private void stopAuthServer() {
        isRunning = false;
        try {
            if (serverSocket != null && !serverSocket.isClosed()) {
                serverSocket.close();
            }
        } catch (Exception ignored) {}
    }

    private void handleClient(Socket socket) {
        new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                 OutputStream out = socket.getOutputStream()) {
                String line = reader.readLine();
                if (line == null) return;

                String[] parts = line.split(" ");
                if (parts.length >= 2) {
                    String path = parts[1];
                    String code = null;
                    String state = null;
                    int qIdx = path.indexOf('?');
                    if (qIdx != -1) {
                        String query = path.substring(qIdx + 1);
                        for (String param : query.split("&")) {
                            String[] kv = param.split("=", 2);
                            if (kv.length == 2) {
                                String k = URLDecoder.decode(kv[0], "UTF-8");
                                String v = URLDecoder.decode(kv[1], "UTF-8");
                                if ("code".equals(k)) code = v;
                                else if ("state".equals(k)) state = v;
                            }
                        }
                    }

                    String responseHtml = "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>Project Sunflower</title><style>body{background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px;box-sizing:border-box;}h2{color:#f59e0b;margin-bottom:8px;font-size:24px;}p{color:#a1a1aa;font-size:15px;line-height:1.5;max-width:320px;}</style></head><body><h2>Project Sunflower</h2><p>Authentication successful! Returning to your gallery...</p><script>setTimeout(function(){window.close();}, 1200);</script></body></html>";
                    byte[] bodyBytes = responseHtml.getBytes(StandardCharsets.UTF_8);
                    String header = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: " + bodyBytes.length + "\r\nConnection: close\r\n\r\n";
                    out.write(header.getBytes(StandardCharsets.UTF_8));
                    out.write(bodyBytes);
                    out.flush();

                    if (code != null) {
                        dispatchOAuthCode(code, state != null ? state : "");
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Client handle error: " + e.getMessage());
            } finally {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }).start();
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
