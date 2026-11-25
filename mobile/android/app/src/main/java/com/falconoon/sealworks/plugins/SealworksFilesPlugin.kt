package com.falconoon.sealworks.plugins

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentResolver
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.falconoon.sealworks.BuildConfig
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Files for the Android `desktop` shim (mobile/src/android-desktop.js):
 *  - the page's own store (page path "~/Library/Application Support/PDF Editor/…" -> filesDir/store/…)
 *  - user documents, only through the Storage Access Framework: picked (OPEN_DOCUMENT /
 *    OPEN_DOCUMENT_TREE), created (CREATE_DOCUMENT) or received (VIEW / SEND), kept in [DocTable]
 *    with persistable URI permissions, read and written through the ContentResolver
 *  - "open in another app" (ACTION_VIEW chooser) and PDFs sent to the app (event "openFile")
 *
 * Targets are JSON objects: { store: "rel/path" } or { doc: "<id>", name?: "<display name>" }.
 * Bytes cross the bridge as base64 in chunks (openRead/readChunk, openWrite/writeChunk/commitWrite),
 * so large PDFs never become one huge bridge message; a write reaches its target only on commit.
 * Errors reject with message "CODE: text" and code CODE (ENOENT, EPERM, EEXIST, EISDIR, ENOTDIR, EINVAL, EIO).
 */
@CapacitorPlugin(name = "SealworksFiles")
class SealworksFilesPlugin : Plugin() {
    class FsError(val code: String, msg: String) : Exception("$code: $msg")

    private lateinit var table: DocTable
    private lateinit var storeRoot: File
    private val io = Executors.newFixedThreadPool(3)
    private val reads = ConcurrentHashMap<String, ReadSession>()
    private val writes = ConcurrentHashMap<String, WriteSession>()
    /** documents the save panel made in this run (an empty one may be discarded if writing fails) */
    private val created = java.util.Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())

    private class ReadSession(val input: InputStream)
    private class WriteSession(val target: Target, val tmp: File, val out: OutputStream)

    sealed class Target {
        class Store(val rel: String, val file: File) : Target()
        class Doc(val entry: DocTable.Entry, val name: String?) : Target()
    }

    override fun load() {
        table = DocTable(context)
        storeRoot = File(context.filesDir, "store").apply { mkdirs() }
        File(context.cacheDir, "writes").apply { deleteRecursively(); mkdirs() }
        handleIncoming(activity?.intent)
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        handleIncoming(intent)
    }

    override fun handleOnDestroy() {
        for (s in reads.values) runCatching { s.input.close() }
        for (s in writes.values) runCatching { s.out.close(); s.tmp.delete() }
        io.shutdown()
    }

    /* ---------------- helpers ---------------- */

    private val cr: ContentResolver get() = context.contentResolver

    private fun run(call: PluginCall, block: () -> JSObject?) {
        io.execute {
            try { call.resolve(block() ?: JSObject()) }
            catch (e: FsError) { call.reject(e.message, e.code) }
            catch (e: SecurityException) { call.reject("EPERM: ${e.message}", "EPERM") }
            catch (e: FileNotFoundException) { call.reject("ENOENT: ${e.message}", "ENOENT") }
            catch (e: OutOfMemoryError) { call.reject("EIO: out of memory", "EIO") }
            catch (e: Exception) { call.reject("EIO: ${e.javaClass.simpleName}: ${e.message}", "EIO") }
        }
    }

    private fun storeFile(rel: String): File {
        if (rel.contains('\u0000')) throw FsError("EINVAL", "invalid path")
        val parts = rel.split('/').filter { it.isNotEmpty() }
        if (parts.any { it == "." || it == ".." }) throw FsError("EINVAL", "invalid path: $rel")
        val f = if (parts.isEmpty()) storeRoot else File(storeRoot, parts.joinToString("/"))
        val root = storeRoot.canonicalPath
        val c = f.canonicalPath
        if (c != root && !c.startsWith(root + File.separator)) throw FsError("EPERM", "outside the app's store: $rel")
        return f
    }

    private fun parseTarget(o: JSObject?): Target {
        if (o == null) throw FsError("EINVAL", "target required")
        if (o.has("store")) {
            val rel = o.getString("store") ?: ""
            return Target.Store(rel, storeFile(rel))
        }
        val id = o.getString("doc") ?: throw FsError("EINVAL", "target required")
        val e = table.get(id) ?: throw FsError("EPERM", "this app has no access to that document (grant it again)")
        val name = if (o.has("name")) o.getString("name") else null
        return Target.Doc(e, if (name.isNullOrEmpty()) null else name)
    }

    private fun targetOf(call: PluginCall, key: String = "target"): Target = parseTarget(call.getObject(key))

    data class Meta(val name: String?, val size: Long, val mtime: Long, val dir: Boolean, val docId: String? = null, val flags: Int = 0)

    private fun Cursor.str(col: String): String? = getColumnIndex(col).let { if (it >= 0 && !isNull(it)) getString(it) else null }
    private fun Cursor.long(col: String): Long = getColumnIndex(col).let { if (it >= 0 && !isNull(it)) getLong(it) else 0L }
    private fun Cursor.int(col: String): Int = getColumnIndex(col).let { if (it >= 0 && !isNull(it)) getInt(it) else 0 }

    private fun <T> provider(block: () -> T): T = try { block() }
        catch (e: FsError) { throw e }
        catch (e: SecurityException) { throw FsError("EPERM", "access to the document was lost (${e.message})") }
        catch (e: FileNotFoundException) { throw FsError("ENOENT", "the document is gone (${e.message})") }
        catch (e: IllegalArgumentException) { throw FsError("ENOENT", "the document is gone (${e.message})") }
        catch (e: UnsupportedOperationException) { throw FsError("EPERM", "the document can't be changed (${e.message})") }

    private fun meta(uri: Uri): Meta = provider {
        cr.query(uri, null, null, null, null)?.use { c ->
            if (!c.moveToFirst()) throw FsError("ENOENT", "the document is gone")
            val mime = c.str(DocumentsContract.Document.COLUMN_MIME_TYPE)
            Meta(c.str(OpenableColumns.DISPLAY_NAME), c.long(OpenableColumns.SIZE), c.long(DocumentsContract.Document.COLUMN_LAST_MODIFIED),
                mime == DocumentsContract.Document.MIME_TYPE_DIR, c.str(DocumentsContract.Document.COLUMN_DOCUMENT_ID),
                c.int(DocumentsContract.Document.COLUMN_FLAGS))
        } ?: throw FsError("ENOENT", "the document is gone")
    }

    private fun treeDocUri(tree: Uri): Uri = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))

    private fun children(tree: Uri): List<Pair<Meta, Uri>> = provider {
        val kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        val out = ArrayList<Pair<Meta, Uri>>()
        cr.query(kids, null, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                val docId = c.str(DocumentsContract.Document.COLUMN_DOCUMENT_ID) ?: continue
                val m = Meta(c.str(DocumentsContract.Document.COLUMN_DISPLAY_NAME), c.long(DocumentsContract.Document.COLUMN_SIZE),
                    c.long(DocumentsContract.Document.COLUMN_LAST_MODIFIED),
                    c.str(DocumentsContract.Document.COLUMN_MIME_TYPE) == DocumentsContract.Document.MIME_TYPE_DIR, docId)
                out.add(m to DocumentsContract.buildDocumentUriUsingTree(tree, docId))
            }
        } ?: throw FsError("EPERM", "the folder can't be listed")
        out
    }

    /** The document a doc target points at (null = a missing child of a granted folder). */
    private fun docUri(t: Target.Doc): Uri? {
        val e = t.entry
        if (t.name == null) return if (e.tree) treeDocUri(e.uri) else null
        if (!e.tree) {
            if (t.name != e.name) throw FsError("ENOENT", "no such file: ${t.name}")
            return e.uri
        }
        return children(e.uri).firstOrNull { it.first.name == t.name && !it.first.dir }?.second
    }

    private fun statJson(size: Long, mtime: Long, dir: Boolean): JSObject =
        JSObject().put("size", size).put("mtimeMs", mtime).put("isFile", !dir).put("isDirectory", dir).put("isSymbolicLink", false)

    private fun mimeOf(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "pdf" -> "application/pdf"
            "p12", "pfx" -> "application/x-pkcs12"
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
        }
    }

    private fun cleanName(n: String?): String {
        val s = (n ?: "").replace('/', '_').replace('\u0000', '_').trim()
        return if (s.isEmpty() || s == "." || s == "..") "document.pdf" else s
    }

    private fun docJson(e: DocTable.Entry) = JSObject().put("id", e.id).put("name", e.name).put("tree", e.tree).put("persisted", e.persisted)

    /** Registers a granted URI; takes a persistable permission when the grant allows it. */
    private fun adopt(uri: Uri, grantFlags: Int, tree: Boolean): DocTable.Entry {
        var persisted = false
        val rw = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        for (mode in listOf(grantFlags and rw, Intent.FLAG_GRANT_READ_URI_PERMISSION)) {
            if (mode == 0 || persisted) continue
            try { cr.takePersistableUriPermission(uri, mode); persisted = true } catch (_: SecurityException) {}
        }
        if (isTestUri(uri)) persisted = true
        val name = if (tree) runCatching { meta(treeDocUri(uri)).name }.getOrNull() ?: "folder"
                   else runCatching { meta(uri).name }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "document.pdf"
        return table.register(uri, cleanName(name), tree, persisted)
    }

    /* ---------------- fs ---------------- */

    @PluginMethod
    fun stat(call: PluginCall) = run(call) {
        when (val t = targetOf(call)) {
            is Target.Store -> {
                if (!t.file.exists()) throw FsError("ENOENT", "no such file or directory: ${t.rel}")
                statJson(if (t.file.isDirectory) 0 else t.file.length(), t.file.lastModified(), t.file.isDirectory)
            }
            is Target.Doc -> {
                if (t.name == null) {
                    if (t.entry.tree) meta(treeDocUri(t.entry.uri)) // checks the grant
                    else meta(t.entry.uri)
                    statJson(0, 0, true)
                } else {
                    val uri = docUri(t) ?: throw FsError("ENOENT", "no such file: ${t.name}")
                    val m = meta(uri)
                    statJson(m.size, m.mtime, m.dir)
                }
            }
        }
    }

    @PluginMethod
    fun readdir(call: PluginCall) = run(call) {
        val list = JSArray()
        when (val t = targetOf(call)) {
            is Target.Store -> {
                if (!t.file.exists()) throw FsError("ENOENT", "no such directory: ${t.rel}")
                if (!t.file.isDirectory) throw FsError("ENOTDIR", "not a directory: ${t.rel}")
                for (f in (t.file.listFiles() ?: emptyArray()).sortedBy { it.name }) {
                    list.put(JSObject().put("name", f.name).put("isFile", f.isFile).put("isDirectory", f.isDirectory).put("isSymbolicLink", false))
                }
            }
            is Target.Doc -> {
                if (t.name != null) throw FsError("ENOTDIR", "not a directory")
                if (t.entry.tree) {
                    for ((m, _) in children(t.entry.uri).sortedBy { it.first.name ?: "" }) {
                        val n = m.name ?: continue
                        if (n.contains('/')) continue
                        list.put(JSObject().put("name", n).put("isFile", !m.dir).put("isDirectory", m.dir).put("isSymbolicLink", false))
                    }
                } else {
                    meta(t.entry.uri)
                    list.put(JSObject().put("name", t.entry.name).put("isFile", true).put("isDirectory", false).put("isSymbolicLink", false))
                }
            }
        }
        JSObject().put("entries", list)
    }

    @PluginMethod
    fun openRead(call: PluginCall) = run(call) {
        val (input, size) = when (val t = targetOf(call)) {
            is Target.Store -> {
                if (!t.file.exists()) throw FsError("ENOENT", "no such file: ${t.rel}")
                if (t.file.isDirectory) throw FsError("EISDIR", "is a directory: ${t.rel}")
                FileInputStream(t.file) to t.file.length()
            }
            is Target.Doc -> {
                if (t.name == null) throw FsError("EISDIR", "is a directory")
                val uri = docUri(t) ?: throw FsError("ENOENT", "no such file: ${t.name}")
                val m = meta(uri)
                if (m.dir) throw FsError("EISDIR", "is a directory")
                provider { cr.openInputStream(uri) ?: throw FsError("EIO", "the provider returned no data") } to m.size
            }
        }
        val token = UUID.randomUUID().toString()
        reads[token] = ReadSession(input)
        JSObject().put("token", token).put("size", size)
    }

    @PluginMethod
    fun readChunk(call: PluginCall) = run(call) {
        val token = call.getString("token") ?: throw FsError("EINVAL", "token required")
        val s = reads[token] ?: throw FsError("EINVAL", "no such read")
        val buf = ByteArray(CHUNK)
        var n = 0
        try {
            while (n < CHUNK) { val r = s.input.read(buf, n, CHUNK - n); if (r < 0) break; n += r }
        } catch (e: Exception) { reads.remove(token); runCatching { s.input.close() }; throw FsError("EIO", "read failed: ${e.message}") }
        val eof = n < CHUNK
        if (eof) { reads.remove(token); runCatching { s.input.close() } }
        JSObject().put("data", Base64.encodeToString(buf, 0, n, Base64.NO_WRAP)).put("eof", eof)
    }

    @PluginMethod
    fun closeRead(call: PluginCall) = run(call) {
        call.getString("token")?.let { reads.remove(it)?.input?.close() }
        null
    }

    @PluginMethod
    fun openWrite(call: PluginCall) = run(call) {
        val t = targetOf(call)
        when (t) {
            is Target.Store -> {
                if (t.file.isDirectory) throw FsError("EISDIR", "is a directory: ${t.rel}")
                if (t.file.parentFile?.isDirectory != true) throw FsError("ENOENT", "no such directory for ${t.rel}")
            }
            is Target.Doc -> {
                if (t.name == null) throw FsError("EISDIR", "is a directory")
                if (!t.entry.tree && t.name != t.entry.name) throw FsError("EPERM", "only the granted document itself can be written (save through the save panel)")
            }
        }
        val token = UUID.randomUUID().toString()
        val tmp = File(File(context.cacheDir, "writes"), token)
        writes[token] = WriteSession(t, tmp, FileOutputStream(tmp))
        JSObject().put("token", token)
    }

    @PluginMethod
    fun writeChunk(call: PluginCall) = run(call) {
        val token = call.getString("token") ?: throw FsError("EINVAL", "token required")
        val s = writes[token] ?: throw FsError("EINVAL", "no such write")
        try { s.out.write(Base64.decode(call.getString("data") ?: "", Base64.DEFAULT)) }
        catch (e: Exception) { abort(token); throw FsError("EIO", "write failed: ${e.message}") }
        null
    }

    @PluginMethod
    fun abortWrite(call: PluginCall) = run(call) { call.getString("token")?.let { abort(it) }; null }

    private fun abort(token: String) { writes.remove(token)?.let { runCatching { it.out.close() }; it.tmp.delete() } }

    @PluginMethod
    fun commitWrite(call: PluginCall) = run(call) {
        val token = call.getString("token") ?: throw FsError("EINVAL", "token required")
        val s = writes.remove(token) ?: throw FsError("EINVAL", "no such write")
        try {
            s.out.close()
            when (val t = s.target) {
                is Target.Store -> {
                    if (t.file.parentFile?.isDirectory != true) throw FsError("ENOENT", "no such directory for ${t.rel}")
                    if (!s.tmp.renameTo(t.file)) { s.tmp.copyTo(t.file, overwrite = true) }
                }
                is Target.Doc -> {
                    val uri = docUri(t) ?: createChild(t.entry, t.name!!)
                    writeUri(uri, s.tmp)
                }
            }
        } finally { s.tmp.delete() }
        null
    }

    private fun createChild(e: DocTable.Entry, name: String): Uri = provider {
        DocumentsContract.createDocument(cr, treeDocUri(e.uri), mimeOf(name), name) ?: throw FsError("EIO", "the folder did not create $name")
    }

    private fun writeUri(uri: Uri, from: File) {
        var lastError: Exception? = null
        for (mode in listOf("wt", "rwt", "w")) {
            try {
                provider { cr.openOutputStream(uri, mode) }?.use { out -> FileInputStream(from).use { it.copyTo(out, 1 shl 16) } } ?: throw FsError("EIO", "the provider gave no output stream")
                return
            } catch (e: FsError) {
                // mode not supported by this provider: try the next one; permission errors end it
                if (e.code == "EPERM") throw e
                lastError = e
            }
        }
        throw lastError ?: FsError("EIO", "write failed")
    }

    @PluginMethod
    fun mkdir(call: PluginCall) = run(call) {
        val t = targetOf(call) as? Target.Store ?: throw FsError("EPERM", "folders can only be made in the app's store")
        if (t.file.isDirectory) { if (call.getBoolean("recursive", false) == true) return@run null; throw FsError("EEXIST", "exists: ${t.rel}") }
        if (t.file.exists()) throw FsError("EEXIST", "exists: ${t.rel}")
        val ok = if (call.getBoolean("recursive", false) == true) t.file.mkdirs() else { if (t.file.parentFile?.isDirectory != true) throw FsError("ENOENT", "no parent for ${t.rel}"); t.file.mkdir() }
        if (!ok && !t.file.isDirectory) throw FsError("EIO", "mkdir failed: ${t.rel}")
        null
    }

    @PluginMethod
    fun rename(call: PluginCall) = run(call) {
        val a = targetOf(call, "from") as? Target.Store ?: throw FsError("EPERM", "documents can't be moved or renamed")
        val b = targetOf(call, "to") as? Target.Store ?: throw FsError("EPERM", "documents can't be moved or renamed")
        if (a.file == storeRoot || b.file == storeRoot) throw FsError("EPERM", "the store itself can't be moved")
        if (!a.file.exists()) throw FsError("ENOENT", "no such file: ${a.rel}")
        if (b.file.parentFile?.isDirectory != true) throw FsError("ENOENT", "no such directory for ${b.rel}")
        if (b.file.isDirectory && a.file.isFile) throw FsError("EISDIR", "is a directory: ${b.rel}")
        if (!a.file.renameTo(b.file)) {
            if (a.file.isFile) { a.file.copyTo(b.file, overwrite = true); a.file.delete() } else throw FsError("EIO", "rename failed")
        }
        null
    }

    @PluginMethod
    fun rm(call: PluginCall) = run(call) {
        val t = targetOf(call) as? Target.Store ?: throw FsError("EPERM", "documents can't be deleted by the app")
        if (t.file == storeRoot) throw FsError("EPERM", "the store itself can't be removed")
        if (!t.file.exists()) { if (call.getBoolean("force", false) == true) return@run null; throw FsError("ENOENT", "no such file: ${t.rel}") }
        if (!t.file.deleteRecursively()) throw FsError("EIO", "rm failed: ${t.rel}")
        null
    }

    @PluginMethod
    fun copyFile(call: PluginCall) = run(call) {
        val a = targetOf(call, "from") as? Target.Store ?: throw FsError("EINVAL", "copy documents with read + write")
        val b = targetOf(call, "to") as? Target.Store ?: throw FsError("EINVAL", "copy documents with read + write")
        if (!a.file.isFile) throw FsError(if (a.file.exists()) "EISDIR" else "ENOENT", "no such file: ${a.rel}")
        if (b.file.parentFile?.isDirectory != true) throw FsError("ENOENT", "no such directory for ${b.rel}")
        a.file.copyTo(b.file, overwrite = true)
        null
    }

    /* ---------------- pickers (Storage Access Framework) ---------------- */

    private fun mimesFor(kind: String): Array<String> = when (kind) {
        "image" -> arrayOf("image/*")
        "cert" -> arrayOf("application/x-pkcs12", "application/pkcs12", "application/x-pkcs12-certificate", "application/octet-stream")
        else -> arrayOf("application/pdf")
    }

    private fun initialUri(call: PluginCall): Uri? {
        val id = call.getString("start") ?: return null
        val e = table.get(id) ?: return null
        return if (e.tree) treeDocUri(e.uri) else e.uri
    }

    private fun launch(call: PluginCall, intent: Intent, callback: String) {
        try { startActivityForResult(call, intent, callback) }
        catch (e: ActivityNotFoundException) { call.reject("EIO: no document picker on this device", "EIO") }
    }

    @PluginMethod
    fun pick(call: PluginCall) {
        val kind = call.getString("kind", "pdf") ?: "pdf"
        if (TestMode.enabled) { run(call) { testPick(call.getBoolean("multiple", false) == true) }; return }
        val intent = if (kind == "folder") Intent(Intent.ACTION_OPEN_DOCUMENT_TREE) else Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            val mimes = mimesFor(kind)
            type = if (mimes.size == 1) mimes[0] else "*/*"
            if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, call.getBoolean("multiple", false) == true)
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        initialUri(call)?.let { if (Build.VERSION.SDK_INT >= 26) intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, it) }
        launch(call, intent, "onPicked")
    }

    @ActivityCallback
    fun onPicked(call: PluginCall?, result: ActivityResult) {
        call ?: return
        run(call) {
            val docs = JSArray()
            val data = result.data
            if (result.resultCode == Activity.RESULT_OK && data != null) {
                val tree = call.getString("kind") == "folder"
                val uris = ArrayList<Uri>()
                data.clipData?.let { c -> for (i in 0 until c.itemCount) c.getItemAt(i).uri?.let { uris.add(it) } }
                if (uris.isEmpty()) data.data?.let { uris.add(it) }
                for (u in uris) docs.put(docJson(adopt(u, data.flags, tree)))
            }
            JSObject().put("docs", docs)
        }
    }

    @PluginMethod
    fun create(call: PluginCall) {
        val name = cleanName(call.getString("name"))
        val mime = call.getString("mime") ?: mimeOf(name)
        if (TestMode.enabled) { run(call) { createdDoc(call, testCreate(name)) }; return }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime
            putExtra(Intent.EXTRA_TITLE, name)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            initialUri(call)?.let { if (Build.VERSION.SDK_INT >= 26) putExtra(DocumentsContract.EXTRA_INITIAL_URI, it) }
        }
        launch(call, intent, "onCreated")
    }

    @ActivityCallback
    fun onCreated(call: PluginCall?, result: ActivityResult) {
        call ?: return
        run(call) {
            val uri = result.data?.data
            if (result.resultCode != Activity.RESULT_OK || uri == null) JSObject()
            else createdDoc(call, adopt(uri, result.data!!.flags, false))
        }
    }

    private fun createdDoc(call: PluginCall, e: DocTable.Entry): JSObject {
        created.add(e.id)
        // a sealer backup: the user picked where it goes, so the key store may export the key once
        if (call.getString("mime") == "application/x-pkcs12") SealKeys.grantExport()
        return JSObject().put("doc", docJson(e))
    }

    /** Removes an empty document the save panel made in this run (when writing to it failed). */
    @PluginMethod
    fun discard(call: PluginCall) = run(call) {
        val t = targetOf(call) as? Target.Doc ?: throw FsError("EPERM", "only documents made by the save panel")
        if (t.entry.tree || !created.contains(t.entry.id)) throw FsError("EPERM", "only documents made by the save panel in this run")
        if (meta(t.entry.uri).size > 0) throw FsError("EPERM", "the document is not empty")
        if (isTestUri(t.entry.uri)) File(testDir, t.entry.name).delete()
        else provider { DocumentsContract.deleteDocument(cr, t.entry.uri) }
        created.remove(t.entry.id)
        null
    }

    /** Re-grant: an open panel at the document (or folder) whose access was lost. */
    @PluginMethod
    fun access(call: PluginCall) {
        val folder = call.getString("kind") == "folder"
        if (TestMode.enabled) {
            run(call) { call.getString("start")?.let { table.get(it) }?.let { JSObject().put("doc", docJson(it)) } ?: JSObject() }
            return
        }
        val intent = if (folder) Intent(Intent.ACTION_OPEN_DOCUMENT_TREE) else Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE); type = "application/pdf"
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        initialUri(call)?.let { if (Build.VERSION.SDK_INT >= 26) intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, it) }
        launch(call, intent, "onAccess")
    }

    @ActivityCallback
    fun onAccess(call: PluginCall?, result: ActivityResult) {
        call ?: return
        run(call) {
            val uri = result.data?.data
            if (result.resultCode != Activity.RESULT_OK || uri == null) JSObject()
            else JSObject().put("doc", docJson(adopt(uri, result.data!!.flags, call.getString("kind") == "folder")))
        }
    }

    /* ---------------- other apps ---------------- */

    /** ACTION_VIEW chooser for a document or a store file (shared through the FileProvider). */
    @PluginMethod
    fun openWith(call: PluginCall) = run(call) {
        val (uri, name) = when (val t = targetOf(call)) {
            is Target.Store -> {
                if (!t.file.isFile) throw FsError("ENOENT", "no such file: ${t.rel}")
                FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", t.file) to t.file.name
            }
            is Target.Doc -> {
                val u = docUri(t) ?: throw FsError("ENOENT", "no such file: ${t.name}")
                meta(u)
                u to (t.name ?: t.entry.name)
            }
        }
        if (TestMode.enabled) { TestMode.lastOpened = uri.toString(); return@run JSObject().put("test", true) }
        val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mimeOf(name)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val chooser = Intent.createChooser(view, if (SealworksSystemPlugin.lang(context) == "ko") "다른 앱으로 열기" else "Open with")
        val act = activity ?: throw FsError("EIO", "no activity")
        try { act.runOnUiThread { try { act.startActivity(chooser) } catch (_: ActivityNotFoundException) {} } }
        catch (e: Exception) { throw FsError("EIO", "no app can open this file") }
        null
    }

    /* ---------------- PDFs sent to the app ---------------- */

    private fun handleIncoming(intent: Intent?) {
        intent ?: return
        if (intent.getBooleanExtra(HANDLED, false)) return
        val uris = ArrayList<Uri>()
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.let { uris.add(it) }
            Intent.ACTION_SEND -> streamExtra(intent)?.let { uris.add(it) }
            Intent.ACTION_SEND_MULTIPLE -> streamListExtra(intent)?.let { uris.addAll(it) }
            else -> return
        }
        intent.putExtra(HANDLED, true)
        val flags = intent.flags
        io.execute {
            for (u in uris) {
                if (u.scheme != ContentResolver.SCHEME_CONTENT) continue
                try {
                    val e = adopt(u, flags, false)
                    notifyListeners("openFile", docJson(e), true)
                } catch (_: Exception) {
                    notifyListeners("openFileError", JSObject().put("uri", u.toString()), true)
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun streamExtra(i: Intent): Uri? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri

    @Suppress("DEPRECATION")
    private fun streamListExtra(i: Intent): List<Uri>? =
        if (Build.VERSION.SDK_INT >= 33) i.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else i.getParcelableArrayListExtra(Intent.EXTRA_STREAM)

    /* ---------------- debug-only test hook (like PDFE_TEST_NO_DIALOGS on desktop) ---------------- */

    private val testDir: File get() = File(context.filesDir, "test-docs").apply { mkdirs() }
    private fun isTestUri(u: Uri) = BuildConfig.DEBUG && u.authority == "${context.packageName}.fileprovider" && u.pathSegments.firstOrNull() == "test"
    private fun testUri(f: File) = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)

    /**
     * Debug builds only. { enable, pick?: [file names in filesDir/test-docs to return from the next
     * pick calls] }. While enabled: pick returns the queued files, create makes filesDir/test-docs/<name>,
     * access returns the same document, openWith only records the URI, confirmations pass.
     * All of them go through the app's own FileProvider and the ContentResolver, like real documents.
     */
    @PluginMethod
    fun testHook(call: PluginCall) = run(call) {
        if (!BuildConfig.DEBUG) throw FsError("EPERM", "not available in release builds")
        TestMode.enabled = call.getBoolean("enable", false) == true
        call.getArray("pick")?.let { a -> TestMode.pickQueue.clear(); for (i in 0 until a.length()) TestMode.pickQueue.add(a.getString(i)) }
        JSObject().put("dir", testDir.absolutePath).put("lastOpened", TestMode.lastOpened)
            .put("docs", JSArray().apply { for (e in table.all()) put(docJson(e).put("uri", e.uri.toString())) })
    }

    private fun testPick(multiple: Boolean): JSObject {
        val docs = JSArray()
        while (TestMode.pickQueue.isNotEmpty()) {
            val f = File(testDir, cleanName(TestMode.pickQueue.removeAt(0)))
            if (f.isFile) docs.put(docJson(adopt(testUri(f), Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION, false)))
            if (!multiple) break
        }
        return JSObject().put("docs", docs)
    }

    private fun testCreate(name: String): DocTable.Entry {
        val f = File(testDir, name)
        if (!f.exists()) f.writeBytes(ByteArray(0))
        return adopt(testUri(f), Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION, false)
    }

    companion object {
        const val CHUNK = 3 * 1024 * 1024
        private const val HANDLED = "com.falconoon.sealworks.HANDLED"
    }
}

/** Debug-build switch shared by the plugins (dialogs answer themselves while it is on). */
object TestMode {
    @Volatile var enabled = false
    @Volatile var lastOpened: String? = null
    val pickQueue: MutableList<String> = java.util.Collections.synchronizedList(ArrayList())
}
