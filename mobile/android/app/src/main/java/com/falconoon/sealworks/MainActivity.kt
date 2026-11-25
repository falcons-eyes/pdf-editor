package com.falconoon.sealworks

import android.os.Bundle
import android.os.SystemClock
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import com.falconoon.sealworks.plugins.SealKeys
import com.falconoon.sealworks.plugins.SealworksFilesPlugin
import com.falconoon.sealworks.plugins.SealworksSealPlugin
import com.falconoon.sealworks.plugins.SealworksSystemPlugin
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebViewClient

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // splash until the page has loaded (at most 3 s)
        val started = SystemClock.uptimeMillis()
        installSplashScreen().setKeepOnScreenCondition {
            (bridge?.webView?.progress ?: 0) < 100 && SystemClock.uptimeMillis() - started < 3000
        }
        registerPlugin(SealworksFilesPlugin::class.java)
        registerPlugin(SealworksSealPlugin::class.java)
        registerPlugin(SealworksSystemPlugin::class.java)
        super.onCreate(savedInstanceState)
        // remote debugging (chrome://inspect, the CDP test) only in debug builds
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        // the seal worker's synchronous requests to the native key store (SealKeys) are answered here,
        // in-process, before Capacitor's local server
        bridge?.let { b ->
            b.setWebViewClient(object : BridgeWebViewClient(b) {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    if (SealKeys.handles(request.url)) SealKeys.handle(applicationContext, request) else super.shouldInterceptRequest(view, request)
            })
        }
        // the page reads documents only through SealworksFiles, never by file:// or content:// URLs
        bridge?.webView?.settings?.apply {
            allowFileAccess = false
            allowContentAccess = false
            setGeolocationEnabled(false)
            javaScriptCanOpenWindowsAutomatically = false
        }
    }
}
