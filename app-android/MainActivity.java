package com.rsim33.rsim;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/* RSIM : vrai plein ecran (barres Android cachees, y compris la zone de la camera / encoche).
   Glisser depuis le bord fait reapparaitre les barres quelques secondes. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);   // paysage fixe (le dash ne tourne pas avec le volant)
        immersive();
        // pont accessible aussi depuis les pages servies par le PC : window.RSIMNative.orient("landscape-secondary")
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void orient(String o) {
                final int v = "landscape-secondary".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE
                        : "off".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR : ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
                runOnUiThread(() -> setRequestedOrientation(v));
            }

            @JavascriptInterface
            public void vibrate(int ms) {          // retour haptique des boutons (clics, button box...)
                Vibrator vb = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vb == null) return;
                if (Build.VERSION.SDK_INT >= 26) vb.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), 255));
                else vb.vibrate(ms);
            }
        }, "RSIMNative");
        route(getIntent(), 600);
    }

    /* raccourcis "Télécommande" / "Dash" : ouvre directement la bonne page */
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        route(intent, 0);
    }

    private void route(Intent it, long delay) {
        if (it == null) return;
        Uri u = it.getData();
        if (u == null || !"rsim".equals(u.getScheme())) return;
        final String page = "remote".equals(u.getHost()) ? "remote.html" : "dash".equals(u.getHost()) ? "live.html?show=live" : null;
        if (page == null || getBridge() == null) return;
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().loadUrl("http://localhost/" + page), delay);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    private void immersive() {
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }
}
