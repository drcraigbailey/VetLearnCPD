package com.vetlearn.cpd;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int VETLEARN_MENU_TEXT_COLOR = Color.rgb(11, 55, 96);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeBrowserPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        installNativeTextSelectionStyling();
    }

    private void installNativeTextSelectionStyling() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        webView.setCustomSelectionActionModeCallback(new ActionMode.Callback() {
            @Override
            public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                styleSelectionMenu(menu);
                return true;
            }

            @Override
            public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                styleSelectionMenu(menu);
                return false;
            }

            @Override
            public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                return false;
            }

            @Override
            public void onDestroyActionMode(ActionMode mode) {
                // Nothing to clean up.
            }
        });
    }

    private void styleSelectionMenu(Menu menu) {
        if (menu == null) return;

        for (int i = 0; i < menu.size(); i++) {
            MenuItem item = menu.getItem(i);
            CharSequence title = item.getTitle();
            if (title == null) continue;

            SpannableString styledTitle = new SpannableString(title);
            styledTitle.setSpan(
                new ForegroundColorSpan(VETLEARN_MENU_TEXT_COLOR),
                0,
                styledTitle.length(),
                Spanned.SPAN_INCLUSIVE_INCLUSIVE
            );
            styledTitle.setSpan(
                new StyleSpan(Typeface.BOLD),
                0,
                styledTitle.length(),
                Spanned.SPAN_INCLUSIVE_INCLUSIVE
            );
            item.setTitle(styledTitle);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            "vetlearn_messages",
            "VetLearn messages",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("VetLearn message and activity notifications");

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
