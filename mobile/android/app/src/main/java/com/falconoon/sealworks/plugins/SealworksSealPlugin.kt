package com.falconoon.sealworks.plugins

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.Executors

/**
 * The sealer identity's plain files on Android, for the seal worker (desktop/src/seal.js bundled;
 * mobile/src/seal/entry.js): noBackupFilesDir/seal/{identity.json, cert.pem, chain.pem}, the same
 * layout as <store>/seal/ on desktop. noBackupFilesDir is never part of Auto Backup or
 * device-to-device transfer (data_extraction_rules.xml excludes it explicitly as well).
 *
 * The private key file (key.bin) is written and read only by [SealKeys] (Android Keystore); here it
 * can be renamed into place (seal.js writes through a temporary file) and removed, never written.
 * Paths are "seal" or "seal/<file name>"; nothing else is reachable.
 */
@CapacitorPlugin(name = "SealworksSeal")
class SealworksSealPlugin : Plugin() {
    private val io = Executors.newSingleThreadExecutor()
    private val root: File get() = context.noBackupFilesDir

    private class SealError(val code: String, msg: String) : Exception("$code: $msg")

    private fun run(call: PluginCall, block: () -> JSObject?) {
        io.execute {
            try { call.resolve(block() ?: JSObject()) }
            catch (e: SealError) { call.reject(e.message, e.code) }
            catch (e: Exception) { call.reject("EIO: ${e.javaClass.simpleName}: ${e.message}", "EIO") }
        }
    }

    private fun file(p: String?): File {
        val m = Regex("^seal(?:/([A-Za-z0-9._-]{1,64}))?$").matchEntire(p ?: "") ?: throw SealError("EINVAL", "bad seal path: $p")
        val name = m.groupValues[1]
        if (name == "." || name == "..") throw SealError("EINVAL", "bad seal path: $p")
        return if (name.isEmpty()) File(root, "seal") else File(File(root, "seal"), name)
    }
    private fun isKey(f: File) = f.name.startsWith("key.")

    @PluginMethod
    fun readFile(call: PluginCall) = run(call) {
        val f = file(call.getString("path"))
        if (!f.isFile) throw SealError("ENOENT", "no such file: ${call.getString("path")}")
        JSObject().put("data", Base64.encodeToString(f.readBytes(), Base64.NO_WRAP))
    }

    @PluginMethod
    fun writeFile(call: PluginCall) = run(call) {
        val f = file(call.getString("path"))
        if (isKey(f)) throw SealError("EPERM", "the key file is written by the Keystore code only")
        if (f.parentFile?.isDirectory != true) throw SealError("ENOENT", "no seal folder")
        f.writeBytes(Base64.decode(call.getString("data") ?: "", Base64.DEFAULT))
        null
    }

    @PluginMethod
    fun rename(call: PluginCall) = run(call) {
        val a = file(call.getString("from")); val b = file(call.getString("to"))
        if (isKey(a) != isKey(b)) throw SealError("EPERM", "key files stay key files")
        if (!a.isFile) throw SealError("ENOENT", "no such file: ${call.getString("from")}")
        if (!a.renameTo(b)) { a.copyTo(b, overwrite = true); a.delete() }
        null
    }

    @PluginMethod
    fun rm(call: PluginCall) = run(call) {
        val f = file(call.getString("path"))
        if (!f.exists()) throw SealError("ENOENT", "no such file: ${call.getString("path")}")
        if (f.isDirectory) throw SealError("EPERM", "the seal folder itself can't be removed")
        f.delete()
        null
    }

    @PluginMethod
    fun mkdir(call: PluginCall) = run(call) {
        val f = file(call.getString("path"))
        if (!f.isDirectory && !f.mkdirs()) throw SealError("EIO", "can't make the seal folder")
        null
    }

    override fun handleOnDestroy() { io.shutdown() }
}
