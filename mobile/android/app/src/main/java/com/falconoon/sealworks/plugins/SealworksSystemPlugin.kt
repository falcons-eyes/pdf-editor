package com.falconoon.sealworks.plugins

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import com.falconoon.sealworks.BuildConfig
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale

/**
 * App-level bits of the Android `desktop` shim: version info, the remembered language (also used
 * for native strings: chooser titles, confirmations), https links in the browser, native
 * confirmations, and the system back button (event "back"; the shim answers, and calls
 * [exitApp] when the page didn't use it).
 */
@CapacitorPlugin(name = "SealworksSystem")
class SealworksSystemPlugin : Plugin() {
    private var backCallback: OnBackPressedCallback? = null

    override fun load() {
        val act = activity ?: return
        val cb = object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (hasListeners("back")) notifyListeners("back", JSObject())
                else moveToBack()
            }
        }
        act.runOnUiThread { act.onBackPressedDispatcher.addCallback(act, cb) }
        backCallback = cb
    }

    private fun moveToBack() { activity?.runOnUiThread { activity?.moveTaskToBack(true) } }

    @PluginMethod
    fun info(call: PluginCall) {
        call.resolve(JSObject()
            .put("version", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("debug", BuildConfig.DEBUG)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("lang", lang(context)))
    }

    @PluginMethod
    fun setLanguage(call: PluginCall) {
        val l = call.getString("lang")
        if (l != "ko" && l != "en") { call.reject("EINVAL: unsupported language: $l", "EINVAL"); return }
        prefs(context).edit().putString(KEY_LANG, l).apply()
        call.resolve()
    }

    @PluginMethod
    fun openExternal(call: PluginCall) {
        val url = call.getString("url") ?: ""
        val uri = Uri.parse(url)
        if (uri.scheme?.lowercase() != "https" || uri.host.isNullOrEmpty()) { call.reject("EINVAL: only https links open outside the app", "EINVAL"); return }
        val act = activity ?: run { call.reject("EIO: no activity", "EIO"); return }
        act.runOnUiThread {
            try {
                act.startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                call.resolve()
            } catch (e: ActivityNotFoundException) { call.reject("EIO: no browser", "EIO") }
        }
    }

    /** Native confirmation: { title, message, ok, cancel } -> { ok }. Passes by itself in the debug test mode. */
    @PluginMethod
    fun confirm(call: PluginCall) {
        if (TestMode.enabled) { call.resolve(JSObject().put("ok", true)); return }
        val act = activity ?: run { call.reject("EIO: no activity", "EIO"); return }
        val ko = lang(context) == "ko"
        act.runOnUiThread {
            var answered = false
            val answer = { ok: Boolean -> if (!answered) { answered = true; call.resolve(JSObject().put("ok", ok)) } }
            AlertDialog.Builder(act)
                .setTitle(call.getString("title") ?: "")
                .setMessage(call.getString("message") ?: "")
                .setPositiveButton(call.getString("ok") ?: if (ko) "확인" else "OK") { _, _ -> answer(true) }
                .setNegativeButton(call.getString("cancel") ?: if (ko) "취소" else "Cancel") { _, _ -> answer(false) }
                .setOnDismissListener { answer(false) }
                .show()
        }
    }

    /** What the system back button does when the page has nothing to close: leave the app (task to back). */
    @PluginMethod
    fun exitApp(call: PluginCall) { moveToBack(); call.resolve() }

    override fun handleOnDestroy() { backCallback?.remove() }

    companion object {
        private const val KEY_LANG = "lang"
        private fun prefs(c: Context) = c.getSharedPreferences("sealworks", Context.MODE_PRIVATE)
        /** the page's last setLanguage(), else the system language (ko* -> ko, else en) */
        fun lang(c: Context): String =
            prefs(c).getString(KEY_LANG, null) ?: if (Locale.getDefault().language.lowercase().startsWith("ko")) "ko" else "en"
    }
}
